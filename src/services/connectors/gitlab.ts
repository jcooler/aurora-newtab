// src/services/connectors/gitlab.ts — the GitLab connector's service layer:
// the who-am-I probe the connect form validates a token (+ instance URL) with,
// the FOUR-section, per-view-gated data fetch the widget renders, and the
// registry descriptor. Task 49 shipped this as the second full token connector
// (two sections: assigned MRs + to-dos); Task 74 (wave 2) grows it to four,
// adding a review-asks MR search and an activity graph, and gates every
// section behind `views` — a section the user turned off is never requested,
// following github.ts's wave-1 template (Task 74's brief: github.ts is THE
// template for the gating idiom). ETags are still NOT used here (the brief
// never asked for them on this connector), and every URL is built off a
// per-config INSTANCE (self-hosted GitLab, not just gitlab.com), so the base
// is derived from `instanceUrl` rather than a single hardcoded constant.
//
// Every request goes through http.ts's getJson (Task 47) — never a hand-rolled
// fetch — so the 8s abort, the network-vs-HTTP status split, and the typed-
// error discipline are all shared, and `fetchFn` stays injectable so tests
// never touch a real network.
import type { ConnectorDescriptor, GitlabConfig, GitlabViews, Contributions, ContributionDay } from './types'
import { getJson } from './http'
import { originPattern } from '../permissions'

// Request PATHS, appended to the per-config base (see `apiBase` below). The two
// MR searches share the /api/v4/merge_requests endpoint but differ in scope —
// assigned-to-me vs. review-requested — so their full query strings are what
// keep them distinct. REVIEW_PATH/CALENDAR_PATH are functions of the username
// (both endpoints need it); the calendar endpoint rides the instance WEB ROOT
// (no /api/v4), which is the SAME origin as every API call, so origins() below
// needs no extra entry for it.
const MR_PATH = '/api/v4/merge_requests?scope=assigned_to_me&state=opened&per_page=10'
const REVIEW_PATH = (username: string): string =>
  '/api/v4/merge_requests?scope=all&state=opened&reviewer_username=' + encodeURIComponent(username) + '&per_page=10'
const CALENDAR_PATH = (username: string): string => '/users/' + encodeURIComponent(username) + '/calendar.json'
const TODOS_PATH = '/api/v4/todos?per_page=20'

/** Display cap for the to-dos count: fetched with per_page=20, so a full page
 *  reads as "20+" in the widget rather than a precise (and misleadingly
 *  exact) number — same idiom as github.ts's NOTIF_PER_PAGE. Stored
 *  uncapped-but-bounded here; the widget renders the "+" at this threshold. */
const TODOS_PER_PAGE = 20

/** The activity graph's window: 112 days (16 weeks), the same crop github.ts's
 *  contributions calendar uses (CONTRIB_DAYS), so the two connectors' graphs
 *  render at the same width. */
const CALENDAR_DAYS = 112

/** WAVE-2 DEFAULT (see GitlabConfig's `views` comment in types.ts): an absent
 *  `views` reproduces today's card exactly — the two sections that already
 *  shipped (assigned MRs, to-dos) stay ON, the two this wave ADDS (review
 *  asks, the activity graph) stay OFF. Unlike github's all-on default (github
 *  shipped nothing new to gate), a wave-2 connector must not opt every new
 *  section in sight-unseen for a config saved before the field existed. */
export const DEFAULT_GITLAB_VIEWS: GitlabViews = {
  mergeRequests: true,
  reviewAsks: false,
  todos: true,
  activityGraph: false,
}

/** The API base for a configured instance: `instanceUrl` with any trailing
 *  slash(es) trimmed, so `${apiBase(url)}${MR_PATH}` never doubles up a `//`
 *  regardless of whether the stored/entered value carried a trailing slash. */
function apiBase(instanceUrl: string): string {
  return instanceUrl.replace(/\/+$/, '')
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export interface GitlabMr {
  title: string
  url: string
  project: string // from the MR's references.full (minus the '!123' suffix), or derived from web_url's path when absent
}

// The activity graph's data shapes are shared with github's contributions
// calendar (types.ts's Contributions/ContributionDay) — re-exported here so
// importers of './gitlab' get them without reaching into types.ts, same as
// github.ts re-exports them.
export type { ContributionDay, Contributions }

export interface GitlabData {
  mrs: GitlabMr[]
  // Review-requested MRs (the wave-2 review-asks section). Same shape and
  // parser as `mrs`; a disabled section or an isolated failure keeps prev
  // (`[]` when there was none).
  reviewMrs: GitlabMr[]
  todos: number // array length, capped at TODOS_PER_PAGE; the widget renders '20+' at the cap
  // null = the activity graph was unavailable (the section is off, or the
  // instance's undocumented calendar.json 404'd / returned HTML). QUIET
  // degradation: the widget hides the graph, no error surfaced — same idiom
  // as github's `contributions`.
  contributions: Contributions | null
}

interface MrItem {
  title?: unknown
  web_url?: unknown
  references?: { full?: unknown }
}

/** 'group/subproject' from a merge request's `references.full`
 *  ("group/subproject!123") — the '!123' MR-number suffix is stripped so the
 *  row shows the same shape github.ts's 'owner/name' repo prefix does. */
function projectFromReferences(full: string): string {
  const idx = full.lastIndexOf('!')
  return idx >= 0 ? full.slice(0, idx) : full
}

/** Fallback project derivation from an MR's `web_url`
 *  (".../group/subproject/-/merge_requests/123") when `references.full` is
 *  absent — GitLab has shipped `references` on merge_requests list responses
 *  for years, but this keeps the row useful (rather than blank) against an
 *  older or unusual instance that omits it. '' (never a throw) when the URL
 *  doesn't parse or doesn't contain the expected marker — the caller renders
 *  the row without a project prefix rather than crashing. */
function projectFromWebUrl(webUrl: string): string {
  const marker = '/-/merge_requests/'
  try {
    const path = new URL(webUrl).pathname
    const idx = path.indexOf(marker)
    return idx >= 0 ? path.slice(1, idx) : ''
  } catch {
    return ''
  }
}

/** merge_requests body -> GitlabMr[]. Defensive at every field, same
 *  skip-don't-crash discipline as github.ts's parseItems: a row missing a
 *  title or a web_url isn't clickable/useful, so it's skipped rather than
 *  rendered blank. Shared by BOTH MR sections (assigned + review-asks) — the
 *  review search returns the identical response shape (brief: reuse parseMrs). */
function parseMrs(body: unknown): GitlabMr[] {
  const items = Array.isArray(body) ? body : []
  const out: GitlabMr[] = []
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as MrItem
    const title = typeof item.title === 'string' ? item.title : ''
    const url = typeof item.web_url === 'string' ? item.web_url : ''
    if (!title || !url) continue
    const referencesFull =
      typeof item.references === 'object' && item.references !== null && typeof item.references.full === 'string'
        ? item.references.full
        : ''
    const project = referencesFull ? projectFromReferences(referencesFull) : projectFromWebUrl(url)
    out.push({ title, url, project })
  }
  return out
}

/** An MR section (assigned OR review-asks — same response shape, same parser).
 *  Isolates its OWN failure (a non-OK status, a network error, or even a parse
 *  throw) to the prev slice (`[]` when there was none), so a bad section never
 *  rejects the whole fetch or blanks a sibling — same per-section independence
 *  as github.ts's fetchSearchSection, minus the ETag plumbing (not asked for
 *  here). */
async function fetchMrsSection(
  base: string,
  path: string,
  headers: Record<string, string>,
  prevMrs: GitlabMr[],
  fetchFn: typeof fetch,
): Promise<GitlabMr[]> {
  try {
    const result = await getJson<unknown>(`${base}${path}`, headers, fetchFn)
    if (!result.ok) return prevMrs
    return parseMrs(result.body)
  } catch {
    return prevMrs
  }
}

/** The to-dos section, same per-section isolation. Unlike github.ts's
 *  notifications (which degrades to `null` on a first-ever failure to signal
 *  "can't tell"), GitlabData.todos is always a plain number — the brief
 *  declares no null case here — so a failure simply keeps whatever count was
 *  last known (0 when there was none). */
async function fetchTodosSection(
  base: string,
  headers: Record<string, string>,
  prevTodos: number,
  fetchFn: typeof fetch,
): Promise<number> {
  try {
    const result = await getJson<unknown>(`${base}${TODOS_PATH}`, headers, fetchFn)
    if (!result.ok) return prevTodos
    return Array.isArray(result.body) ? Math.min(result.body.length, TODOS_PER_PAGE) : 0
  } catch {
    return prevTodos
  }
}

/** Local yyyy-mm-dd, private to the module — mirrors github.ts's own `isoDay`:
 *  the window boundary is compared against calendar.json's day keys, which are
 *  local-day date strings, so this must NOT go through toISOString(). */
function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** calendar.json body -> a validated { 'yyyy-mm-dd': count } map, or null when
 *  the body isn't the expected shape at all. The endpoint is UNDOCUMENTED, so
 *  every off-contract shape is treated as "can't tell": a non-object body (an
 *  instance that returned HTML, or a 200 that isn't a map), OR an object
 *  carrying any non-number value, both return null so the caller degrades to
 *  prev. An empty object `{}` (a user with zero contributions) is NOT a
 *  degrade — it returns an empty map that windows into an all-zeros graph. */
function parseCalendar(body: unknown): Record<string, number> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const map: Record<string, number> = {}
  for (const [date, value] of Object.entries(body as Record<string, unknown>)) {
    // A single non-number value means the body isn't the flat date->count map
    // this endpoint is supposed to return — treat the WHOLE response as
    // off-contract rather than silently dropping a field.
    if (typeof value !== 'number') return null
    map[date] = value
  }
  return map
}

/** Shapes a validated calendar map into `Contributions` over the 112-day
 *  window ending today: EVERY day in the window is present (ascending,
 *  zero-filled from the map), and `total` sums only the WINDOW's counts — map
 *  entries older than the window are dropped (never looked up), mirroring
 *  github.ts's contributions windowing. */
function shapeCalendar(map: Record<string, number>): Contributions {
  const to = new Date()
  const from = new Date(to)
  from.setDate(to.getDate() - (CALENDAR_DAYS - 1))
  from.setHours(0, 0, 0, 0)
  const days: ContributionDay[] = []
  let total = 0
  const cursor = new Date(from)
  for (let i = 0; i < CALENDAR_DAYS; i++) {
    const date = isoDay(cursor)
    const count = map[date] ?? 0
    days.push({ date, count })
    total += count
    cursor.setDate(cursor.getDate() + 1)
  }
  return { days, total }
}

/** The activity graph section. The calendar endpoint is UNDOCUMENTED (an
 *  instance may 404 or serve HTML), so EVERY failure shape — non-OK, network
 *  error, a parse throw, a non-object body, or an object with non-number
 *  values — degrades quietly to `prev` (an instance without calendar.json must
 *  cost nothing visible). A clean 200 map windows into `Contributions`. */
async function fetchContributionsSection(
  base: string,
  headers: Record<string, string>,
  username: string,
  prev: Contributions | null,
  fetchFn: typeof fetch,
): Promise<Contributions | null> {
  try {
    const result = await getJson<unknown>(`${base}${CALENDAR_PATH(username)}`, headers, fetchFn)
    if (!result.ok) return prev
    const map = parseCalendar(result.body)
    if (map === null) return prev
    return shapeCalendar(map)
  } catch {
    return prev
  }
}

/** Fetches the four sections (assigned MRs, review-asks, to-dos, the activity
 *  graph) for one instance + token + username, carrying `prev` forward so a
 *  per-section failure keeps the last-known slice. The sections run
 *  concurrently and INDEPENDENTLY: each section function catches its own
 *  failure internally (see each helper above), so Promise.all never rejects
 *  and one section's 403/500/timeout can never blank another (same Controller
 *  ruling github.ts documents). No ETag round-trip — the brief doesn't ask for
 *  one here.
 *
 *  `views` GATES every section: a section the user turned off never issues a
 *  request at all — it resolves straight to its prev slice rather than being
 *  fetched and discarded (github.ts's wave-1 gating idiom). `username` feeds
 *  the review-asks and activity-graph URLs; the two wave-1 sections don't need
 *  it. */
export async function fetchGitlab(
  instanceUrl: string,
  token: string,
  username: string,
  views: GitlabViews,
  prev: GitlabData | null,
  fetchFn: typeof fetch = fetch,
): Promise<GitlabData> {
  const base = apiBase(instanceUrl)
  const headers = authHeaders(token)

  const [mrs, reviewMrs, todos, contributions] = await Promise.all([
    views.mergeRequests
      ? fetchMrsSection(base, MR_PATH, headers, prev?.mrs ?? [], fetchFn)
      : Promise.resolve(prev?.mrs ?? []),
    views.reviewAsks
      ? fetchMrsSection(base, REVIEW_PATH(username), headers, prev?.reviewMrs ?? [], fetchFn)
      : Promise.resolve(prev?.reviewMrs ?? []),
    views.todos
      ? fetchTodosSection(base, headers, prev?.todos ?? 0, fetchFn)
      : Promise.resolve(prev?.todos ?? 0),
    views.activityGraph
      ? fetchContributionsSection(base, headers, username, prev?.contributions ?? null, fetchFn)
      : Promise.resolve(prev?.contributions ?? null),
  ])

  return { mrs, reviewMrs, todos, contributions }
}

/** The who-am-I probe the connect form validates a token (+ instance URL)
 *  with. GET {base}/api/v4/user -> the account's username. A non-OK response
 *  resolves { ok: false } with a message that NAMES the status, same as
 *  github.ts's whoamiGithub, so the form's inline alert tells the user why. */
export async function whoamiGitlab(
  instanceUrl: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; identity: string } | { ok: false; message: string }> {
  const base = apiBase(instanceUrl)
  const result = await getJson<{ username?: unknown }>(`${base}/api/v4/user`, authHeaders(token), fetchFn)
  if (!result.ok) {
    const where = result.status === null ? 'a network error' : `status ${result.status}`
    return { ok: false, message: `GitLab rejected that token (${where}).` }
  }
  const username = result.body.username
  if (typeof username !== 'string' || username.length === 0) {
    return { ok: false, message: 'GitLab did not return a username for that token.' }
  }
  return { ok: true, identity: username }
}

export const gitlabDescriptor: ConnectorDescriptor<GitlabConfig> = {
  id: 'gitlab',
  label: 'GitLab',
  blurb: 'Assigned MRs and to-dos',
  category: 'development', // dev-tool connector — see types.ts's CATEGORY_LABELS
  auth: 'token',
  ttlMs: 5 * 60_000,
  secretFields: ['token'],
  identityField: 'username',
  // Derived per-config (unlike github's single constant origin): the whole
  // point of a self-hostable connector. The wave-2 calendar.json endpoint
  // rides this SAME instance origin (it's on the web root, not a separate
  // host), so this single pattern still covers every URL the service fetches —
  // no extra entry needed. https-only-filtered, not throwing — same "filter,
  // don't throw" contract rss.ts's origins() documents (a caller sweeping
  // origins() across every registered descriptor must be able to trust that
  // one connector's bad/malformed persisted config — a hand-edited backup
  // could restore a non-https instanceUrl — degrades to fewer origins rather
  // than throwing out of the sweep).
  origins: (config) => {
    try {
      return [originPattern(config.instanceUrl)]
    } catch {
      return []
    }
  },
  ownsOrigins: (config) => {
    if (
      typeof config.token !== 'string' || config.token.length === 0 ||
      typeof config.username !== 'string' || config.username.length === 0 ||
      typeof config.instanceUrl !== 'string' || config.instanceUrl.length === 0
    ) return false
    try {
      originPattern(config.instanceUrl)
      return true
    } catch {
      return false
    }
  },
}
