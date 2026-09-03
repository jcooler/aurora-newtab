// src/services/connectors/registry.ts — the connector catalog. PURE by
// contract: no React, no chrome.*, and no import that transitively reaches
// either. backup.ts imports this for secret-field stripping, so a side effect
// or a cycle here would poison the storage/backup path. Descriptors are the
// one source of truth every generic consumer reads, keyed by ConnectorId.
//
// rss.ts stays pure too (see its own doc comment): it imports originPattern
// from ../permissions for its `origins` mapper, but permissions.ts only
// touches chrome.* inside function bodies, never at module scope, so pulling
// it in here doesn't add a load-time chrome.* dependency.
import type { ConnectorConfig, ConnectorDescriptor, ConnectorId } from './types'
import { rssDescriptor } from './rss'
import { githubDescriptor } from './github'
import { gitlabDescriptor } from './gitlab'
import { jiraDescriptor } from './jira'
import { vercelDescriptor } from './vercel'
import { cryptoDescriptor } from './crypto'
import { icsDescriptor } from './ics'
import { statusDescriptor } from './status'
import { homeassistantDescriptor } from './homeassistant'
import { linearDescriptor } from './linear'
import { sentryDescriptor } from './sentry'
import { todoistDescriptor } from './todoist'
import { onThisDayDescriptor } from './onThisDay'
import { publicHolidaysDescriptor } from './publicHolidays'
import { auroraKpDescriptor } from './auroraKp'
import { googleCalendarDescriptor } from './googleCalendar'

// Task 46 grows ConnectorConfig into a real 7-member union, which is exactly
// the situation types.ts's ConnectorDescriptor variance comment predicted:
// ConnectorDescriptor<RssConfig> is no longer assignable to the base
// ConnectorDescriptor, so each descriptor needs the one honest per-entry cast
// below — each descriptor itself stays typed to its own specific config
// (ConnectorDescriptor<RssConfig>, ConnectorDescriptor<GithubConfig>, …). Task
// 48 adds github as connector #2, the first to actually exercise the "two
// entries" path the registry-invariant tests assert; Task 49 adds gitlab as
// #3, the first with a PER-CONFIG derived origin (its instanceUrl), proving
// releasableOrigins' sharing check against a real (not fake) second derived
// origin. Task 50 adds jira as #4, the first descriptor whose origins()
// derivation depends on a helper (normalizeJiraSite) with its own
// shape-validation contract rather than a bare URL parse. Task 51 adds
// vercel as #5, back to a single constant origin (github's shape, not
// gitlab's/jira's per-config one) — its own distinguishing complexity
// (failed-first, then recency, deployment ordering) lives entirely inside
// vercel.ts's fetch, not here. Task 52 adds crypto as #6, the first
// connector since rss itself with `auth: 'none'` — no token, no whoami
// probe, no identityField, and (per its own secretFields: []) nothing ever
// stripped from its config on export. Task 53 adds ics as #7 — also
// `auth: 'none'`, but the FIRST no-auth connector that DOES strip a secret:
// its whole `url` is the secret (secretFields: ['url', 'calendars'] — the
// multi-calendar wave (2026-08-10) added `calendars`, each entry's own url
// the same kind of secret, so a config mid-migration never leaks either
// shape; see backup.test.ts's ics case), with a per-config derived https
// origin like gitlab's/jira's. Task 83 (W3-SP2) adds status as #8 — back to
// `auth: 'none'` with nothing secret (crypto's shape, not ics's): a
// status.json url grants no access to anything, so secretFields stays [].
// Task 101 (W3-SP5) adds homeassistant as #9 — the descriptor itself shipped
// unregistered in Task 99 (its own header comment names this exact task as
// the one that flips it live); it's the first descriptor to set
// identityPhrase: 'to' (every entry above defaults to 'as' via the shell's
// `?? 'as'` fallback — see Connectors.tsx's card-shell identity line).
export const CONNECTORS: ConnectorDescriptor[] = [
  rssDescriptor as ConnectorDescriptor,
  githubDescriptor as ConnectorDescriptor,
  gitlabDescriptor as ConnectorDescriptor,
  jiraDescriptor as ConnectorDescriptor,
  vercelDescriptor as ConnectorDescriptor,
  cryptoDescriptor as ConnectorDescriptor,
  icsDescriptor as ConnectorDescriptor,
  statusDescriptor as ConnectorDescriptor,
  homeassistantDescriptor as ConnectorDescriptor,
  linearDescriptor as ConnectorDescriptor,
  sentryDescriptor as ConnectorDescriptor,
  todoistDescriptor as ConnectorDescriptor,
  onThisDayDescriptor as ConnectorDescriptor,
  publicHolidaysDescriptor as ConnectorDescriptor,
  auroraKpDescriptor as ConnectorDescriptor,
  googleCalendarDescriptor as ConnectorDescriptor,
]

/** The descriptor for `id`, or undefined if none is registered. Linear scan
 *  is fine: the catalog is tiny and fixed at build time. */
export function getConnector(id: ConnectorId): ConnectorDescriptor | undefined {
  return CONNECTORS.find((descriptor) => descriptor.id === id)
}

/** descriptor.origins(config), wrapped defensively — same contract rss.ts's
 *  origins() documents: a caller sweeping origins() across every registered
 *  descriptor must be able to trust that one connector's bad/malformed
 *  persisted config degrades to fewer origins rather than throwing out of
 *  the sweep. Descriptors that follow the contract (like rssDescriptor)
 *  never need this catch; it exists for the ones that don't. */
function originsOf(descriptor: ConnectorDescriptor, config: ConnectorConfig): string[] {
  try {
    const origins = descriptor.origins(config)
    return Array.isArray(origins) ? origins.filter((origin): origin is string => typeof origin === 'string') : []
  } catch {
    return []
  }
}

function ownsOriginsOf(descriptor: ConnectorDescriptor, config: ConnectorConfig): boolean {
  try {
    return descriptor.ownsOrigins(config) === true
  } catch {
    return false
  }
}

/** Origins claimed by every configured connector, including disabled cards.
 *  Each descriptor defines its own readiness boundary so generic enable-only
 *  rows and secret-stripped backups cannot claim constant origins. */
export function ownedConnectorOriginPatterns(
  configs: Partial<Record<ConnectorId, ConnectorConfig>>,
): string[] {
  const claimed = new Set<string>()
  for (const descriptor of CONNECTORS) {
    const config = configs[descriptor.id]
    if (!config || !ownsOriginsOf(descriptor, config)) continue
    for (const origin of originsOf(descriptor, config)) claimed.add(origin)
  }
  return [...claimed]
}

/** The union of every ENABLED connector's derived origins, deduped — pulled
 *  out of what used to be releasableOrigins' own inline "still claimed" sweep
 *  (below) so a caller besides releasableOrigins can read "what origins does
 *  Aurora currently hold via some connector" directly, without reimplementing
 *  the sweep or needing releasableOrigins' "exclude this one id" framing.
 *  Task 95's APOD gesture helper is the first such caller: before prompting
 *  for api.nasa.gov/apod.nasa.gov, it can check whether an enabled connector
 *  already holds either origin.
 *
 *  Enabled-only: a disabled connector's config might still name a site, but
 *  it isn't actively fetching it, so it doesn't count as "held". Deduped:
 *  descriptor.origins() makes no uniqueness promise (e.g. two of a
 *  connector's own feeds sharing a host, or two different connectors pointed
 *  at the same host), and a caller reading this set shouldn't see the same
 *  origin twice. Same defensive originsOf wrapper as releasableOrigins used
 *  inline before this extraction: a bad/malformed config degrades to fewer
 *  origins rather than throwing out of the sweep. */
export function heldOrigins(configs: Partial<Record<ConnectorId, ConnectorConfig>>): string[] {
  const claimed = new Set<string>()
  for (const descriptor of CONNECTORS) {
    const config = configs[descriptor.id]
    if (!config?.enabled) continue
    for (const origin of originsOf(descriptor, config)) claimed.add(origin)
  }
  return [...claimed]
}

/** Origins safe to revoke when `id` disconnects: its own origins minus any
 *  origin another ENABLED connector still derives (heldOrigins above, swept
 *  over every OTHER registered connector). Pure; callers do the actual
 *  removeOrigin calls (this fulfils the production caller descriptor.origins()
 *  was promised — SP1 finding 3).
 *
 *  "Other" here means every OTHER registered connector whose stored config
 *  has `enabled: true` — a disabled connector's config might still name the
 *  same site, but it isn't actively fetching it, so it doesn't get to keep
 *  the grant alive. The disconnecting connector's OWN origins are read
 *  unconditionally (its own `enabled` flag doesn't gate what it's *asking*
 *  to release) — only the sharing check on the OTHER side is enabled-gated,
 *  which is exactly why `id`'s own entry is excluded from the configs map
 *  passed to heldOrigins below, rather than passing `configs` as-is: if `id`
 *  itself is enabled, heldOrigins would otherwise count its own origins as
 *  "held" and this function would withhold every origin from itself.
 *
 *  Deduped: a connector can derive the same origin more than once (e.g. two
 *  of its own feeds sharing a host), and descriptor.origins() makes no
 *  uniqueness promise — a caller that removeOrigin's the result shouldn't
 *  see (or redundantly act on) the same origin twice. */
export function releasableOrigins(id: ConnectorId, configs: Partial<Record<ConnectorId, ConnectorConfig>>): string[] {
  const config = configs[id]
  const descriptor = getConnector(id)
  if (!descriptor || !config) return []

  const own = originsOf(descriptor, config)

  const others: Partial<Record<ConnectorId, ConnectorConfig>> = { ...configs }
  delete others[id]
  const stillClaimed = new Set(heldOrigins(others))

  return [...new Set(own.filter((origin) => !stillClaimed.has(origin)))]
}
