// src/services/apod.ts — NASA's Astronomy Picture of the Day: a single daily
// background photo. Task 95 is pure plumbing — the service call, the two
// origins it needs, and the cache SHAPE (schema.ts's ApodCache) — Task 96
// owns the caching/render side and every bit of UI; nothing here touches
// storage or React. Same shared getJson/8s-abort discipline as every
// connector in ./connectors/http.ts, and the same "quiet, typed failure"
// idiom as ./connectors/status.ts's fetchOneStatus: any unexpected shape or
// error degrades to `null`, never a throw — a background photo is a delight,
// not a dependency, so a bad day for NASA's API is a fallback day for Aurora,
// not an error surfaced to the user.
import type { ApodPhoto } from '../lib/storage/schema'
import { getJson } from './connectors/http'

// Both origins ensureOrigins (permissions.ts) needs granted together via one
// user gesture: api.nasa.gov serves the JSON below, apod.nasa.gov is the
// SEPARATE host that actually serves the photo (hdurl/url both resolve
// there — see isTrustedPhotoUrl below). URL form (not already-reduced match
// patterns) — originPattern derives the '/*' patterns from these at request
// time, the same way every connector's own origins() derives them from its
// config's stored URLs.
export const APOD_ORIGINS = ['https://api.nasa.gov/', 'https://apod.nasa.gov/'] as const

// DEMO_KEY is NASA's shared keyless tier — no per-user signup, so Task 96's
// settings toggle just works with nothing to configure. Its rate limit
// (published as 30/hour, 50/day, shared across every DEMO_KEY caller on the
// internet) is real, but this feature only ever fetches once per local day
// (Task 96's cache key gates on `date`), so a rate-limit rejection reaches
// fetchApod as just another failure below: `null`, meaning "fall back to
// yesterday's cached photo" — a fallback day, not a bug to fix by asking the
// user for their own API key.
export const APOD_ENDPOINT = 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY'

interface ApodJsonBody {
  title?: unknown
  url?: unknown
  hdurl?: unknown
  copyright?: unknown
  media_type?: unknown
}

/** True only for an https URL whose host is EXACTLY apod.nasa.gov — the one
 *  host this module trusts to actually serve an APOD image (NASA's JSON API
 *  itself lives on api.nasa.gov; hdurl/url point at the separate
 *  apod.nasa.gov media host). Never throws: an unparseable candidate is
 *  simply not trusted, same as a wrong host or scheme. */
function isTrustedPhotoUrl(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string') return false
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'https:' && parsed.host === 'apod.nasa.gov'
  } catch {
    return false
  }
}

/** Fetches today's APOD and validates it down to exactly what the widget
 *  needs (schema.ts's ApodPhoto). `media_type` must be `'image'` — APOD is
 *  sometimes a video embed, which this feature has no use for. The photo URL
 *  prefers `hdurl` over `url` when both are present and pass
 *  isTrustedPhotoUrl above; if `hdurl` is present but fails that check, `url`
 *  is tried before giving up (a bad hdurl does NOT disqualify a good url).
 *  `copyright` is trimmed (NASA's API pads it with newlines) and omitted
 *  entirely — no key at all, not an empty string — when absent or empty
 *  after trimming.
 *
 *  Never throws: a non-OK/network/timeout response (getJson's own typed
 *  JsonError, handled via the `!result.ok` check below), a JSON body that
 *  fails to parse (res.json() rejecting, which getJson does NOT catch itself
 *  — same reason status.ts's fetchOneStatus wraps its own getJson call), or
 *  any response shape that fails the checks above all resolve to `null`
 *  alike — see this module's own doc comment for why quiet failure is the
 *  right contract here. */
export async function fetchApod(fetchFn: typeof fetch = fetch): Promise<ApodPhoto | null> {
  try {
    const result = await getJson<ApodJsonBody>(APOD_ENDPOINT, {}, fetchFn)
    if (!result.ok) return null

    const body = result.body
    if (!body || body.media_type !== 'image' || typeof body.title !== 'string') return null

    const url = isTrustedPhotoUrl(body.hdurl) ? body.hdurl : isTrustedPhotoUrl(body.url) ? body.url : null
    if (!url) return null

    const photo: ApodPhoto = { url, title: body.title }
    if (typeof body.copyright === 'string') {
      const copyright = body.copyright.trim()
      if (copyright) photo.copyright = copyright
    }
    return photo
  } catch {
    return null
  }
}
