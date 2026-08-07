// src/services/connectors/github.ts — the GitHub connector's service layer:
// the who-am-I probe the connect form validates a token with, the three-
// section data fetch the widget renders, and the registry descriptor. This is
// the FIRST full token connector and the template Tasks 49-51 copy, so the
// shapes here (per-section independence, ETag round-trip, quiet degradation)
// are the pattern, not an accident.
//
// Every request goes through http.ts's getJson/conditionalGetJson (Task 47) —
// never a hand-rolled fetch — so the 8s abort, the network-vs-HTTP status
// split, and the typed-error discipline are all shared, and `fetchFn` stays
// injectable so tests never touch a real network.
import type { ConnectorDescriptor, GithubConfig } from './types'
import { getJson, conditionalGetJson } from './http'

const BASE = 'https://api.github.com'

// Request PATHS — also the keys of the ETag map (Controller ruling 4: the
// request path is the etag key). The two searches share the /search/issues
// endpoint but differ in their `q`, so the full path+query is what keeps their
// keys distinct. Kept verbatim from the brief (GitHub accepts the `@`, `:` and
// `+` in the query literally; `+` is its space separator).
const PR_PATH = '/search/issues?q=type:pr+state:open+review-requested:@me&per_page=10'
const ISSUE_PATH = '/search/issues?q=type:issue+state:open+assignee:@me&per_page=10'
const NOTIF_PATH = '/notifications?per_page=50'

/** Display cap for the unread-notifications count: the endpoint is fetched
 *  with per_page=50, so a full page reads as "50+" in the widget rather than a
 *  precise (and misleadingly exact) number. Stored uncapped-but-bounded here;
 *  the widget renders the "+" at this threshold. */
const NOTIF_PER_PAGE = 50

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export interface GithubItem {
  title: string
  url: string
  repo: string // 'owner/name', derived from the search item's repository_url
}

export interface GithubData {
  prs: GithubItem[]
  issues: GithubItem[]
  // null = the notifications endpoint was unavailable (a fine-grained PAT
  // without the notifications scope 403s it). QUIET degradation: the widget
  // simply hides the unread row, no error surfaced. 0 is a real value ("all
  // caught up"), distinct from null ("can't tell").
  notifications: number | null
  // Keyed by request PATH (see the *_PATH constants). conditionalGetJson sends
  // each as If-None-Match on the next refresh; a 304 keeps that section's prev
  // slice verbatim and re-stores the same etag.
  etags: Record<string, string>
}

interface SearchBody {
  items?: Array<{ title?: unknown; html_url?: unknown; repository_url?: unknown }>
}

/** 'owner/name' from a search item's repository_url
 *  (https://api.github.com/repos/owner/name). '' when the marker is absent —
 *  the caller renders the row without a repo prefix rather than crashing. */
function repoFromUrl(repositoryUrl: string): string {
  const marker = '/repos/'
  const idx = repositoryUrl.indexOf(marker)
  return idx >= 0 ? repositoryUrl.slice(idx + marker.length) : ''
}

/** search/issues body -> GithubItem[]. Defensive at every field: a row missing
 *  a title or an html_url isn't clickable/useful, so it's skipped rather than
 *  rendered blank — same discipline as rss.ts's parse skips. */
function parseItems(body: SearchBody): GithubItem[] {
  const items = Array.isArray(body.items) ? body.items : []
  const out: GithubItem[] = []
  for (const item of items) {
    const title = typeof item.title === 'string' ? item.title : ''
    const url = typeof item.html_url === 'string' ? item.html_url : ''
    if (!title || !url) continue
    const repo = typeof item.repository_url === 'string' ? repoFromUrl(item.repository_url) : ''
    out.push({ title, url, repo })
  }
  return out
}

/** One search section (PRs or issues), fetched conditionally. Isolates its OWN
 *  failure: a non-OK status, a network error, or even a parse throw all resolve
 *  to the prev slice (`[]` when there was none) so a bad section never rejects
 *  the whole fetch or blanks a sibling. A 304 keeps prev verbatim and re-stores
 *  the same etag; a fresh 200 parses and stores the new etag. */
async function fetchSearchSection(
  path: string,
  headers: Record<string, string>,
  prevEtag: string | undefined,
  prevItems: GithubItem[],
  fetchFn: typeof fetch,
): Promise<{ items: GithubItem[]; etag: string | null }> {
  try {
    const result = await conditionalGetJson<SearchBody>(BASE + path, headers, prevEtag ?? null, fetchFn)
    if (!result.ok) return { items: prevItems, etag: prevEtag ?? null }
    if (result.body === null) return { items: prevItems, etag: result.etag } // 304 — unchanged
    return { items: parseItems(result.body), etag: result.etag }
  } catch {
    return { items: prevItems, etag: prevEtag ?? null }
  }
}

/** The notifications section, fetched conditionally. Same per-section isolation
 *  as the searches, but its failure fallback is prev ?? null (not `[]`): a
 *  first-ever 403 yields null so the widget hides the row entirely (the
 *  fine-grained-PAT case), while a later transient failure keeps whatever count
 *  was last known. A fresh 200 counts the unread array (the endpoint returns
 *  only unread threads by default). */
async function fetchNotificationsSection(
  headers: Record<string, string>,
  prevEtag: string | undefined,
  prevCount: number | null,
  fetchFn: typeof fetch,
): Promise<{ count: number | null; etag: string | null }> {
  try {
    const result = await conditionalGetJson<unknown[]>(BASE + NOTIF_PATH, headers, prevEtag ?? null, fetchFn)
    if (!result.ok) return { count: prevCount ?? null, etag: prevEtag ?? null }
    if (result.body === null) return { count: prevCount ?? null, etag: result.etag } // 304 — unchanged
    const count = Array.isArray(result.body) ? Math.min(result.body.length, NOTIF_PER_PAGE) : 0
    return { count, etag: result.etag }
  } catch {
    return { count: prevCount ?? null, etag: prevEtag ?? null }
  }
}

/** Fetches all three sections (PRs, issues, notifications) for one token,
 *  carrying `prev` forward so ETag 304s and per-section failures both keep the
 *  last-known slice. The sections run concurrently and INDEPENDENTLY: each
 *  section function catches its own failure internally (see each helper), so
 *  Promise.all never rejects and one section's 403/500/timeout can never blank
 *  another — a broken notifications endpoint must never empty the PR list
 *  (Controller ruling 3). */
export async function fetchGithub(
  token: string,
  prev: GithubData | null,
  fetchFn: typeof fetch = fetch,
): Promise<GithubData> {
  const headers = authHeaders(token)
  const prevEtags = prev?.etags ?? {}

  const [prsResult, issuesResult, notifResult] = await Promise.all([
    fetchSearchSection(PR_PATH, headers, prevEtags[PR_PATH], prev?.prs ?? [], fetchFn),
    fetchSearchSection(ISSUE_PATH, headers, prevEtags[ISSUE_PATH], prev?.issues ?? [], fetchFn),
    fetchNotificationsSection(headers, prevEtags[NOTIF_PATH], prev?.notifications ?? null, fetchFn),
  ])

  const etags: Record<string, string> = {}
  if (prsResult.etag) etags[PR_PATH] = prsResult.etag
  if (issuesResult.etag) etags[ISSUE_PATH] = issuesResult.etag
  if (notifResult.etag) etags[NOTIF_PATH] = notifResult.etag

  return {
    prs: prsResult.items,
    issues: issuesResult.items,
    notifications: notifResult.count,
    etags,
  }
}

/** The who-am-I probe the connect form validates a token with. GET /user ->
 *  the account's login. A non-OK response resolves { ok: false } with a message
 *  that NAMES the status (a 401 says "401", a network error says so) so the
 *  form's inline alert tells the user why the token was rejected. */
export async function whoamiGithub(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; identity: string } | { ok: false; message: string }> {
  const result = await getJson<{ login?: unknown }>(`${BASE}/user`, authHeaders(token), fetchFn)
  if (!result.ok) {
    const where = result.status === null ? 'a network error' : `status ${result.status}`
    return { ok: false, message: `GitHub rejected that token (${where}).` }
  }
  const login = result.body.login
  if (typeof login !== 'string' || login.length === 0) {
    return { ok: false, message: 'GitHub did not return a username for that token.' }
  }
  return { ok: true, identity: login }
}

export const githubDescriptor: ConnectorDescriptor<GithubConfig> = {
  id: 'github',
  label: 'GitHub',
  blurb: 'PRs waiting on you, your issues, notifications',
  auth: 'token',
  ttlMs: 5 * 60_000,
  secretFields: ['token'],
  identityField: 'username',
  // The single origin every request above targets. Constant (no per-config
  // derivation), so this never throws and needs no defensive wrapper.
  origins: () => ['https://api.github.com/*'],
}
