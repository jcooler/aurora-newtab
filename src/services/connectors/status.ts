// src/services/connectors/status.ts — the Status connector's service layer:
// read-time config normalization (statusServicesOf, the icsCalendarsOf
// discipline), the parallel per-service fetch (fetchStatus), and the
// registry descriptor. Task 83 (W3-SP2). auth 'none' like crypto.ts/ics.ts —
// no token, no whoami probe, no identityField — and, like crypto.ts (not
// ics.ts), nothing here is a secret: a status.json URL grants no access to
// anything, so secretFields stays [].
import type { ConnectorDescriptor, StatusConfig, StatusService } from './types'
import { getJson } from './http'
import { originPattern } from '../permissions'

export type StatusIndicator = 'none' | 'minor' | 'major' | 'critical' | 'unknown'

export interface ServiceStatus {
  name: string
  indicator: StatusIndicator
  description: string
}

export interface StatusData {
  services: ServiceStatus[] // index-aligned with the config list fetchStatus was called with
}

// Cap on configured services — same "the cap belongs to the connector"
// reasoning as ics.ts's MAX_CALENDARS: statusServicesOf is the one read-time
// boundary every caller (widget, settings card, origins()) goes through, so
// it's the one place that can guarantee hand-edited or backup-restored
// storage holding more than the swept display max never renders past it.
export const MAX_SERVICES = 8

// ---------------------------------------------------------------------------
// Step 1 live verification (build-time, per the Task 83 brief) — run once
// against each candidate's real endpoint, 2026-08-11. For each: does it
// return HTTP 200 with a `status.indicator` string in the v2 taxonomy
// (none|minor|major|critical)? Only conformers ship below.
//
//   GitHub     https://www.githubstatus.com/api/v2/status.json      200  indicator "none"   -> OK
//   Cloudflare https://www.cloudflarestatus.com/api/v2/status.json  200  indicator "minor"  -> OK
//   OpenAI     https://status.openai.com/api/v2/status.json         200  indicator "minor"  -> OK
//   npm        https://status.npmjs.org/api/v2/status.json          200  indicator "none"   -> OK
//   Vercel     https://www.vercel-status.com/api/v2/status.json     200  indicator "none"   -> OK
//   Discord    https://discordstatus.com/api/v2/status.json         200  indicator "none"   -> OK
//   Stripe     https://status.stripe.com/api/v2/status.json         404  HTML page, no JSON -> OMITTED
//   Slack      https://status.slack.com/api/v2/status.json          301 -> 404 at slack-status.com,
//                                                                    body {"message":""}, no
//                                                                    status.indicator        -> OMITTED
//
// Stripe and Slack run custom status APIs, not statuspage — reachable via the
// custom-URL field only if a statuspage mirror exists. Both failed exactly as
// anticipated (not a transient network blip — no retry warranted), so they
// are omitted here; the curated list can grow later if a statuspage mirror
// surfaces for either.
export const CURATED_STATUS: readonly StatusService[] = [
  { name: 'GitHub', url: 'https://www.githubstatus.com/api/v2/status.json' },
  { name: 'Cloudflare', url: 'https://www.cloudflarestatus.com/api/v2/status.json' },
  { name: 'OpenAI', url: 'https://status.openai.com/api/v2/status.json' },
  { name: 'npm', url: 'https://status.npmjs.org/api/v2/status.json' },
  { name: 'Vercel', url: 'https://www.vercel-status.com/api/v2/status.json' },
  { name: 'Discord', url: 'https://discordstatus.com/api/v2/status.json' },
]

/** Read-time tolerance, same discipline as ics.ts's icsCalendarsOf: a valid
 *  `services` array survives with malformed entries filtered (not fatal),
 *  capped at MAX_SERVICES; an absent/non-array `services` -> []. */
export function statusServicesOf(config: StatusConfig | undefined): StatusService[] {
  if (!config || !Array.isArray(config.services)) return []
  return config.services
    .filter(
      (s): s is StatusService =>
        !!s && typeof s === 'object' && typeof s.name === 'string' && typeof s.url === 'string' && s.url.length > 0,
    )
    .slice(0, MAX_SERVICES)
}

const RECOGNIZED_INDICATORS: ReadonlySet<string> = new Set(['none', 'minor', 'major', 'critical'])

interface StatusJsonBody {
  status?: { indicator?: unknown; description?: unknown }
}

/** Fetches and normalizes one service's status.json. Every failure mode —
 *  non-OK HTTP status, network error/8s-abort (both folded into getJson's
 *  JsonError), a JSON body that fails to parse (res.json() rejecting, which
 *  getJson does NOT catch — same reason fetchCrypto wraps its own getJson
 *  call in try/catch), a body with no `status` key, or an indicator string
 *  outside the v2 taxonomy — degrades to the SAME `unknown` shape rather than
 *  distinguishing failure modes to the caller. `service.url` is fetched
 *  EXACTLY as stored; nothing is appended. */
async function fetchOneStatus(service: StatusService, fetchFn: typeof fetch): Promise<ServiceStatus> {
  try {
    const result = await getJson<StatusJsonBody>(service.url, {}, fetchFn)
    if (result.ok) {
      const indicator = result.body?.status?.indicator
      if (typeof indicator === 'string' && RECOGNIZED_INDICATORS.has(indicator)) {
        const description = result.body?.status?.description
        return {
          name: service.name,
          indicator: indicator as StatusIndicator,
          description: typeof description === 'string' ? description : '',
        }
      }
    }
  } catch {
    // Network error, malformed JSON body, or any other unexpected throw —
    // falls through to the shared unknown result below.
  }
  return { name: service.name, indicator: 'unknown', description: '' }
}

/** Fetches every configured service IN PARALLEL (getJson's shared 8s abort
 *  per request), index-aligned to `services`. Never rejects — every failure
 *  mode degrades to one entry's `indicator: 'unknown'` rather than blanking
 *  the whole result (fetchOneStatus's job) or propagating an error (this
 *  function's). Empty list -> `{ services: [] }`, no fetch at all.
 *
 *  THE ONE PINNED DESIGN DEPARTURE from every other connector in this
 *  directory: `prev` is accepted (signature symmetry with fetchIcs/
 *  fetchCrypto/fetchVercel, all of which carry `prev` forward on failure) but
 *  is DELIBERATELY UNUSED here. A service that read `none` (green) on the
 *  last successful fetch and fails on this one reports `unknown` (gray), NOT
 *  the stale `none`. A status widget is trusted precisely because a green dot
 *  means "checked recently, healthy" — carrying a cached green through a
 *  failed check would let a real outage render as "all clear," which is worse
 *  than admitting the check itself failed. So there is no prev-carry branch
 *  to write, only this comment explaining why one doesn't exist. */
export async function fetchStatus(
  services: StatusService[],
  prev: StatusData | null,
  fetchFn: typeof fetch = fetch,
): Promise<StatusData> {
  void prev // see doc comment above — deliberately unused
  if (services.length === 0) return { services: [] }
  const results = await Promise.all(services.map((service) => fetchOneStatus(service, fetchFn)))
  return { services: results }
}

export const statusDescriptor: ConnectorDescriptor<StatusConfig> = {
  id: 'status',
  label: 'Status',
  blurb: 'Green dots for the services you depend on',
  category: 'development', // dev-dependency status — see types.ts's CATEGORY_LABELS
  auth: 'none',
  ttlMs: 5 * 60_000,
  secretFields: [],
  // Filter, don't throw — rss.ts's exact idiom (see its own origins() doc
  // comment for the full contract): a restored `services` array can hold a
  // non-https or unparseable url per entry (import validates only `enabled`
  // structurally), and origins() must degrade to fewer origins rather than
  // throwing out of a registry-wide sweep. statusServicesOf folds in the
  // read-time tolerance (malformed entries, the MAX_SERVICES cap) before
  // origins() ever sees the list.
  origins: (config) =>
    statusServicesOf(config).flatMap((service) => {
      try {
        return [originPattern(service.url)]
      } catch {
        return []
      }
    }),
}
