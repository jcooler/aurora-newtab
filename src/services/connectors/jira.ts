// src/services/connectors/jira.ts — the Jira connector's service layer: the
// who-am-I probe the connect form validates email+token+site with, the
// TWO-section, per-view-gated data fetch the widget renders, and the registry
// descriptor. Task 50 shipped this as the third full token connector with a
// SINGLE /search/jql endpoint (assigned issues + the counts derived from
// them). Task 74 (wave 2) SPLITS that single full-replace into two isolated,
// independent sections — the assigned search and a new due-soon search — each
// gated behind `views` and each carrying its own prev on failure, exactly the
// per-section independence github.ts's template established (a section the
// user turned off is never requested). Every URL is still built off a
// per-config SITE (a Jira Cloud tenant, `yoursite.atlassian.net`); no ETag
// round-trip (the brief doesn't ask for one here).
//
// Every request goes through http.ts's getJson (Task 47) — never a
// hand-rolled fetch — so the 8s abort, the network-vs-HTTP status split, and
// the typed-error discipline are all shared, and `fetchFn` stays injectable
// so tests never touch a real network.
import type { ConnectorDescriptor, JiraConfig, JiraViews } from './types'
import { getJson } from './http'

// The assigned search, already percent-encoded: assignee is the caller (the
// token's own account, via `currentUser()`), unresolved only, newest-updated
// first. `fields=summary,status` keeps the response body small and ADF-FREE —
// `summary` is a plain string on this endpoint (unlike e.g. `description`,
// which Jira Cloud returns in Atlassian Document Format), so parseIssues below
// never needs an ADF walker, just a typeof-string read.
const SEARCH_PATH =
  '/rest/api/3/search/jql?jql=assignee%3DcurrentUser()%20AND%20resolution%3DUnresolved%20ORDER%20BY%20updated%20DESC&fields=summary,status&maxResults=10'
// The due-soon search (Task 74): same assignee/unresolved scope, but bounded
// to items due within 7 days, ordered soonest-first, and asking for the extra
// `duedate` field so parseIssues can surface a `due` on each row. Built with
// encodeURIComponent (per the brief) so the `<=` and spaces in the JQL are
// escaped exactly once.
const DUE_PATH =
  '/rest/api/3/search/jql?jql=' +
  encodeURIComponent('assignee=currentUser() AND resolution=Unresolved AND due <= 7d ORDER BY due ASC') +
  '&fields=summary,status,duedate&maxResults=10'
const MYSELF_PATH = '/rest/api/3/myself'

/** yyyy-mm-dd shape check for a Jira `duedate` value. Jira Cloud returns
 *  duedate as a bare date string ("2026-08-15"); anything not matching this
 *  shape (absent, an ADF object, a number, a malformed string) leaves the row
 *  WITHOUT a `due` field rather than dropping the row — the row is still a
 *  useful, clickable issue without its date. */
const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** WAVE-2 DEFAULT (see JiraConfig's `views` comment in types.ts): an absent
 *  `views` reproduces today's card — the assigned list and its status chips
 *  (both already shipped) stay ON, the due-soon section this wave ADDS stays
 *  OFF. `statusChips` gates only the widget's chip render (like vercel's
 *  statusSummary), not a request — the counts are always derived from the
 *  assigned issues whenever that section is fetched. */
export const DEFAULT_JIRA_VIEWS: JiraViews = {
  assigned: true,
  statusChips: true,
  dueSoon: false,
}

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
  // yyyy-mm-dd, present ONLY on due-soon rows (from fields.duedate). Absent on
  // assigned rows, and absent on a due-soon row whose duedate was missing or
  // malformed — the widget shows the date when it's there, nothing when it's
  // not.
  due?: string
}

export interface JiraData {
  issues: JiraIssue[]
  counts: Record<string, number> // by status name, insertion-ordered from the issues array
  // The due-soon section (wave 2): issues due within 7 days, soonest-first,
  // each carrying a `due` when its duedate parsed. Independent of `issues` —
  // its own failure keeps prev.dueSoon while the assigned list refreshes, and
  // vice versa.
  dueSoon: JiraIssue[]
}

interface JiraSearchBody {
  issues?: Array<{
    key?: unknown
    fields?: { summary?: unknown; status?: { name?: unknown }; duedate?: unknown }
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
function parseIssues(body: JiraSearchBody, site: string, withDue = false): JiraIssue[] {
  const items = Array.isArray(body.issues) ? body.issues : []
  const out: JiraIssue[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const key = typeof item.key === 'string' ? item.key : ''
    const summary = typeof item.fields?.summary === 'string' ? item.fields.summary : ''
    if (!key || !summary) continue
    const statusName = item.fields?.status?.name
    const status = typeof statusName === 'string' && statusName.length > 0 ? statusName : 'Unknown'
    const issue: JiraIssue = { key, summary, status, url: `https://${site}/browse/${key}` }
    // Only the due-soon search asks for (and surfaces) a duedate. A well-formed
    // yyyy-mm-dd becomes `due`; anything else leaves the row without one rather
    // than dropping it.
    if (withDue) {
      const duedate = item.fields?.duedate
      if (typeof duedate === 'string' && DUE_DATE_RE.test(duedate)) issue.due = duedate
    }
    out.push(issue)
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

/** The assigned section: the unresolved-issues search, plus the `counts`
 *  derived from it. Isolates its OWN failure (network error or non-OK status)
 *  to its prev slice (`{ issues: [], counts: {} }` when there was none), so a
 *  broken assigned search never blanks the due-soon list — same per-section
 *  independence github.ts's fetchSearchSection established. `counts` is derived
 *  HERE, from the assigned issues only (never from due-soon), so it moves in
 *  lockstep with `issues`. */
async function fetchAssignedSection(
  site: string,
  headers: Record<string, string>,
  prevIssues: JiraIssue[],
  prevCounts: Record<string, number>,
  fetchFn: typeof fetch,
): Promise<{ issues: JiraIssue[]; counts: Record<string, number> }> {
  try {
    const result = await getJson<JiraSearchBody>(`https://${site}${SEARCH_PATH}`, headers, fetchFn)
    if (!result.ok) return { issues: prevIssues, counts: prevCounts }
    const issues = parseIssues(result.body, site)
    return { issues, counts: countByStatus(issues) }
  } catch {
    return { issues: prevIssues, counts: prevCounts }
  }
}

/** The due-soon section: the same search shape, bounded to items due within 7
 *  days and parsed WITH `due`. Same per-section isolation — a failure keeps
 *  prev.dueSoon (`[]` when there was none) rather than rejecting the whole
 *  fetch or blanking the assigned list. */
async function fetchDueSoonSection(
  site: string,
  headers: Record<string, string>,
  prevDueSoon: JiraIssue[],
  fetchFn: typeof fetch,
): Promise<JiraIssue[]> {
  try {
    const result = await getJson<JiraSearchBody>(`https://${site}${DUE_PATH}`, headers, fetchFn)
    if (!result.ok) return prevDueSoon
    return parseIssues(result.body, site, true)
  } catch {
    return prevDueSoon
  }
}

/** Fetches the two sections (assigned issues + counts, and the due-soon list)
 *  for one site + email + token, carrying `prev` forward so a per-section
 *  failure keeps the last-known slice. The two searches run concurrently and
 *  INDEPENDENTLY: each catches its own failure internally (see the helpers
 *  above), so Promise.all never rejects and an assigned failure keeps
 *  prev.issues+counts while due-soon lands (and vice versa) — the wave-1
 *  single-endpoint full-replace becomes two isolated sections.
 *
 *  `views` GATES each search: a section the user turned off never issues a
 *  request — it resolves straight to its prev slice. A bad SITE shape, though,
 *  is a whole-fetch failure (no valid URL can be built for EITHER search), so
 *  it returns the whole prev fallback without attempting anything.
 *
 *  Fix wave, Finding I4 (Jon-ruled): the ASSIGNED search fires when EITHER
 *  `views.assigned` OR `views.statusChips` is on — the same "fetch gating
 *  keys on DATA needs, not sections 1:1" principle vercel.ts's own
 *  fetchVercel already applies (its one endpoint fires when EITHER
 *  deployments OR statusSummary is on, because statusSummary is DERIVED from
 *  the same data). `counts` here is likewise derived from the assigned
 *  section, so a chips-only card (assigned off, statusChips on) still needs
 *  a live assigned fetch to have any counts to show — before this fix, that
 *  composition fetched NOTHING, ever, so a fresh connect showed no chips at
 *  all and a later toggle-on never healed it (`views.assigned` being off
 *  carried `prev` forever). `counts` still derives from the assigned section
 *  ONLY (never dueSoon), and the ISSUES LIST still renders only when
 *  `views.assigned` is on (JiraWidget.tsx's own `views.assigned ? ... : []`
 *  gate) — this only widens WHEN the request fires, not what the fetched
 *  data is used for. */
export async function fetchJira(
  site: string,
  email: string,
  apiToken: string,
  views: JiraViews,
  prev: JiraData | null,
  fetchFn: typeof fetch = fetch,
): Promise<JiraData> {
  const fallback = prev ?? { issues: [], counts: {}, dueSoon: [] }

  let normalizedSite: string
  try {
    normalizedSite = normalizeJiraSite(site)
  } catch {
    return fallback
  }

  const headers = authHeaders(email, apiToken)

  const [assigned, dueSoon] = await Promise.all([
    views.assigned || views.statusChips
      ? fetchAssignedSection(normalizedSite, headers, fallback.issues, fallback.counts, fetchFn)
      : Promise.resolve({ issues: fallback.issues, counts: fallback.counts }),
    views.dueSoon
      ? fetchDueSoonSection(normalizedSite, headers, fallback.dueSoon, fetchFn)
      : Promise.resolve(fallback.dueSoon),
  ])

  return { issues: assigned.issues, counts: assigned.counts, dueSoon }
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
