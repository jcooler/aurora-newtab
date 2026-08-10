// src/services/connectors/http.ts — shared JSON-fetch helpers for the token
// connectors (Tasks 48-51): a plain GET and a conditional (ETag-aware) GET,
// each isolating every failure mode (network error, timeout, non-OK status)
// to a typed JsonError rather than throwing — same "quiet, typed failure"
// discipline as rss.ts's fetchOneFeed, though that file's own timeout stays
// as-is (the brief is explicit: this is a NEW shared home, not a refactor of
// rss.ts). `fetchFn` is injectable so tests never hit a real network, same
// shape as rss.ts's fetchHeadlines(fetchFn = fetch).

export interface JsonResult<T> {
  ok: true
  status: number
  body: T
  etag: string | null
}
export interface JsonError {
  ok: false
  status: number | null // null = network error or our own 8s abort, never a real HTTP status
  message: string
}

const FETCH_TIMEOUT_MS = 8_000

/** Runs `fetchFn` with an 8s abort timer, same idiom as rss.ts's
 *  fetchOneFeed. Network rejection and our own abort both surface the same
 *  way here (a rejected fetchFn promise) — both are folded into one
 *  `{ failed: true }` outcome carrying `status: null`, so a caller can't
 *  mistake a timeout/network error for a real HTTP response. */
async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  fetchFn: typeof fetch,
  init?: { method?: string; body?: string },
): Promise<{ failed: false; res: Response } | { failed: true; error: JsonError }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchFn(url, { ...init, headers, signal: controller.signal })
    return { failed: false, res }
  } catch (error) {
    return {
      failed: true,
      error: { ok: false, status: null, message: error instanceof Error ? error.message : String(error) },
    }
  } finally {
    clearTimeout(timer)
  }
}

/** A non-OK (and, for conditionalGetJson, non-304) response -> JsonError
 *  carrying its real HTTP status. */
function statusError(res: Response): JsonError {
  return { ok: false, status: res.status, message: `Request failed with status ${res.status}` }
}

/** Plain conditional-free GET: parses the JSON body and captures the
 *  response's `etag` header (null when absent). Every failure mode (network,
 *  8s abort, non-OK status) resolves to a JsonError rather than throwing. */
export async function getJson<T>(
  url: string,
  headers: Record<string, string>,
  fetchFn: typeof fetch = fetch,
): Promise<JsonResult<T> | JsonError> {
  const outcome = await fetchWithTimeout(url, headers, fetchFn)
  if (outcome.failed) return outcome.error
  const { res } = outcome
  if (!res.ok) return statusError(res)
  const body = (await res.json()) as T
  return { ok: true, status: res.status, body, etag: res.headers.get('etag') }
}

/** POST a JSON body (GraphQL and any future non-GET call go through this, not
 *  a hand-rolled fetch): merges 'Content-Type: application/json' into the
 *  caller's headers and JSON.stringifies `body`, sharing fetchWithTimeout's
 *  8s-abort/network-fold discipline with getJson/conditionalGetJson rather
 *  than duplicating it. Same typed-failure shape as getJson: non-OK and
 *  network/timeout both resolve to a JsonError rather than throwing. */
export async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<JsonResult<T> | JsonError> {
  const outcome = await fetchWithTimeout(
    url,
    { ...headers, 'Content-Type': 'application/json' },
    fetchFn,
    { method: 'POST', body: JSON.stringify(body) },
  )
  if (outcome.failed) return outcome.error
  const { res } = outcome
  if (!res.ok) return statusError(res)
  const parsed = (await res.json()) as T
  return { ok: true, status: res.status, body: parsed, etag: res.headers.get('etag') }
}

/** Conditional GET: sends `If-None-Match` when `etag` is non-null. A 304
 *  means "unchanged" — it returns `{ ok: true, status: 304, body: null, etag
 *  }` (the SAME etag passed in) without touching res.json() at all, so a
 *  caller keeps whatever section it already has cached. A fresh 200 parses
 *  the body and reports the response's OWN (new) etag, same as getJson. */
export async function conditionalGetJson<T>(
  url: string,
  headers: Record<string, string>,
  etag: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<JsonResult<T | null> | JsonError> {
  const requestHeaders = etag !== null ? { ...headers, 'If-None-Match': etag } : headers
  const outcome = await fetchWithTimeout(url, requestHeaders, fetchFn)
  if (outcome.failed) return outcome.error
  const { res } = outcome
  if (res.status === 304) return { ok: true, status: 304, body: null, etag }
  if (!res.ok) return statusError(res)
  const body = (await res.json()) as T
  return { ok: true, status: res.status, body, etag: res.headers.get('etag') }
}
