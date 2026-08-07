// src/services/connectors/jira.ts — the Jira connector's service layer: the
// who-am-I probe the connect form validates email+token+site with, the
// single-endpoint data fetch the widget renders, and the registry
// descriptor. Task 50 is the third full token connector, copying gitlab.ts's
// template most closely (per-config origin, no ETag round-trip — the brief
// doesn't ask for one here either): every URL is built off a per-config
// SITE (a Jira Cloud tenant, `yoursite.atlassian.net`), and there is exactly
// ONE endpoint (the new /search/jql — cloud's legacy /search is removed), so
// there's no per-section independence to model the way github.ts's three
// endpoints (or gitlab.ts's two) need — a single fetch either succeeds and
// replaces both `issues` and the `counts` derived from them, or fails and
// keeps `prev` verbatim.
//
// Every request goes through http.ts's getJson (Task 47) — never a
// hand-rolled fetch — so the 8s abort, the network-vs-HTTP status split, and
// the typed-error discipline are all shared, and `fetchFn` stays injectable
// so tests never touch a real network.
import type { ConnectorDescriptor, JiraConfig } from './types'
import { getJson } from './http'

// The exact query the brief specifies, already percent-encoded: assignee is
// the caller (the token's own account, via `currentUser()`), unresolved
// only, newest-updated first. `fields=summary,status` keeps the response
// body small and ADF-FREE — `summary` is a plain string on this endpoint
// (unlike e.g. `description`, which Jira Cloud returns in Atlassian Document
// Format), so parseIssues below never needs an ADF walker, just a
// typeof-string read.
const SEARCH_PATH =
  '/rest/api/3/search/jql?jql=assignee%3DcurrentUser()%20AND%20resolution%3DUnresolved%20ORDER%20BY%20updated%20DESC&fields=summary,status&maxResults=10'
const MYSELF_PATH = '/rest/api/3/myself'

/** The exact copy shown when a site value doesn't shape-match a Jira Cloud
 *  tenant — exported so every caller (and this file's own tests) shares the
 *  one string. */
export const JIRA_SITE_ERROR = 'Enter your site as yoursite.atlassian.net'

const SITE_RE = /^[a-z0-9-]+\.atlassian\.net$/i

/** Normalizes a Jira Cloud site value (strips an accidental `https://`
 *  prefix and any trailing slash(es)) and validates the bare-domain shape
 *  against SITE_RE. Pure + SYNCHRONOUS, single source for the site-shape
 *  rule: the descriptor's `origins` below and every service call (whoamiJira,
 *  fetchJira) all call this ONE function rather than each re-deriving the
 *  regex. Throws `Error(JIRA_SITE_ERROR)` on anything that doesn't match —
 *  callers on the "filter don't throw" side (the descriptor's origins(),
 *  same contract gitlabDescriptor's origins() documents) catch it
 *  themselves; the service functions catch it too, turning it into their own
 *  typed rejection rather than ever building a request URL out of a bad
 *  site. */
export function normalizeJiraSite(input: string): string {
  const stripped = input.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  if (!SITE_RE.test(stripped)) throw new Error(JIRA_SITE_ERROR)
  return stripped
}

function authHeaders(email: string, apiToken: string): Record<string, string> {
  return { Authorization: 'Basic ' + btoa(`${email}:${apiToken}`) }
}

export interface JiraIssue {
  key: string
  summary: string
  status: string
  url: string // https://{site}/browse/{key}
}

export interface JiraData {
  issues: JiraIssue[]
  counts: Record<string, number> // by status name, insertion-ordered from the issues array
}

interface JiraSearchBody {
  issues?: Array<{
    key?: unknown
    fields?: { summary?: unknown; status?: { name?: unknown } }
  }>
}

/** search/jql body -> JiraIssue[], against a SITE already normalized (see
 *  normalizeJiraSite above) so the browse URL is always well-formed. Defensive
 *  at every field, same skip-don't-crash discipline as github.ts's parseItems
 *  and gitlab.ts's parseMrs: a row missing a key (no URL can be built) or a
 *  summary (nothing useful to show) is skipped rather than rendered blank. A
 *  missing/non-string status name defaults to 'Unknown' rather than being a
 *  skip reason — every real Jira issue carries SOME status; a blank one here
 *  only happens against a malformed response, and the row is still useful
 *  without it. */
function parseIssues(body: JiraSearchBody, site: string): JiraIssue[] {
  const items = Array.isArray(body.issues) ? body.issues : []
  const out: JiraIssue[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const key = typeof item.key === 'string' ? item.key : ''
    const summary = typeof item.fields?.summary === 'string' ? item.fields.summary : ''
    if (!key || !summary) continue
    const statusName = item.fields?.status?.name
    const status = typeof statusName === 'string' && statusName.length > 0 ? statusName : 'Unknown'
    out.push({ key, summary, status, url: `https://${site}/browse/${key}` })
  }
  return out
}

/** Counts issues by status name, insertion-ordered: the FIRST status seen (in
 *  the issues array's own order, i.e. Jira's own updated-DESC order) is the
 *  first key in the returned object — JS objects preserve string-key
 *  insertion order, so no separate ordering structure is needed. */
function countByStatus(issues: JiraIssue[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const issue of issues) {
    counts[issue.status] = (counts[issue.status] ?? 0) + 1
  }
  return counts
}

/** Fetches the one section (assigned, unresolved issues) for one site +
 *  email + token, carrying `prev` forward so a failure (bad site shape,
 *  network error, or non-OK status) keeps the last-known slice —
 *  `prev ?? { issues: [], counts: {} }`, same quiet-degradation idiom as
 *  every other connector's per-section fallback. There's only one endpoint
 *  here (unlike github's three or gitlab's two), so there's no partial
 *  success to model: this either fully replaces `issues`/`counts` or fully
 *  keeps the fallback. */
export async function fetchJira(
  site: string,
  email: string,
  apiToken: string,
  prev: JiraData | null,
  fetchFn: typeof fetch = fetch,
): Promise<JiraData> {
  const fallback = prev ?? { issues: [], counts: {} }

  let normalizedSite: string
  try {
    normalizedSite = normalizeJiraSite(site)
  } catch {
    return fallback
  }

  try {
    const result = await getJson<JiraSearchBody>(
      `https://${normalizedSite}${SEARCH_PATH}`,
      authHeaders(email, apiToken),
      fetchFn,
    )
    if (!result.ok) return fallback
    const issues = parseIssues(result.body, normalizedSite)
    return { issues, counts: countByStatus(issues) }
  } catch {
    return fallback
  }
}

/** The who-am-I probe the connect form validates email+token+site with. GET
 *  {site}/rest/api/3/myself -> the account's displayName. The site-shape
 *  check runs FIRST and SYNCHRONOUSLY (no request attempted for a
 *  malformed site — same normalizeJiraSite the fetch above and the
 *  descriptor's origins() share); a non-OK response resolves { ok: false }
 *  with a message that NAMES the status, same as whoamiGithub/whoamiGitlab,
 *  so the form's inline alert tells the user why. */
export async function whoamiJira(
  site: string,
  email: string,
  apiToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; identity: string } | { ok: false; message: string }> {
  let normalizedSite: string
  try {
    normalizedSite = normalizeJiraSite(site)
  } catch {
    return { ok: false, message: JIRA_SITE_ERROR }
  }

  const result = await getJson<{ displayName?: unknown }>(
    `https://${normalizedSite}${MYSELF_PATH}`,
    authHeaders(email, apiToken),
    fetchFn,
  )
  if (!result.ok) {
    const where = result.status === null ? 'a network error' : `status ${result.status}`
    return { ok: false, message: `Jira rejected that token (${where}).` }
  }
  const displayName = result.body.displayName
  if (typeof displayName !== 'string' || displayName.length === 0) {
    return { ok: false, message: 'Jira did not return a name for that account.' }
  }
  return { ok: true, identity: displayName }
}

export const jiraDescriptor: ConnectorDescriptor<JiraConfig> = {
  id: 'jira',
  label: 'Jira',
  blurb: 'Issues assigned to you',
  auth: 'token',
  ttlMs: 10 * 60_000,
  secretFields: ['apiToken'],
  identityField: 'displayName',
  // Derived per-config (like gitlab's instanceUrl, unlike github's single
  // constant): the whole point of the site field. Filter-don't-throw
  // contract, same as gitlabDescriptor's origins() — a caller sweeping
  // origins() across every registered descriptor must be able to trust that
  // one connector's bad/malformed persisted config (a hand-edited backup
  // could restore a non-atlassian.net site) degrades to fewer origins rather
  // than throwing out of the sweep.
  origins: (config) => {
    try {
      return [`https://${normalizeJiraSite(config.site)}/*`]
    } catch {
      return []
    }
  },
}
