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
// stripped from its config on export.
export const CONNECTORS: ConnectorDescriptor[] = [
  rssDescriptor as ConnectorDescriptor,
  githubDescriptor as ConnectorDescriptor,
  gitlabDescriptor as ConnectorDescriptor,
  jiraDescriptor as ConnectorDescriptor,
  vercelDescriptor as ConnectorDescriptor,
  cryptoDescriptor as ConnectorDescriptor,
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
    return descriptor.origins(config)
  } catch {
    return []
  }
}

/** Origins safe to revoke when `id` disconnects: its own origins minus any
 *  origin another ENABLED connector still derives. Pure; callers do the
 *  actual removeOrigin calls (this fulfils the production caller
 *  descriptor.origins() was promised — SP1 finding 3).
 *
 *  "Other" here means every OTHER registered connector whose stored config
 *  has `enabled: true` — a disabled connector's config might still name the
 *  same site, but it isn't actively fetching it, so it doesn't get to keep
 *  the grant alive. The disconnecting connector's OWN origins are read
 *  unconditionally (its own `enabled` flag doesn't gate what it's *asking*
 *  to release) — only the sharing check on the OTHER side is enabled-gated.
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

  const stillClaimed = new Set<string>()
  for (const other of CONNECTORS) {
    if (other.id === id) continue
    const otherConfig = configs[other.id]
    if (!otherConfig?.enabled) continue
    for (const origin of originsOf(other, otherConfig)) stillClaimed.add(origin)
  }

  return [...new Set(own.filter((origin) => !stillClaimed.has(origin)))]
}
