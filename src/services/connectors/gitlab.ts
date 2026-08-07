// src/services/connectors/gitlab.ts — the GitLab connector's service layer:
// the who-am-I probe the connect form validates a token (+ instance URL) with,
// the two-section data fetch the widget renders, and the registry descriptor.
// Task 49 is the second full token connector, copying github.ts's template
// (Task 48's doc comment) — per-section independence and quiet degradation
// carry over verbatim; ETags do NOT (the brief doesn't ask for them here), and
// every URL is built off a per-config INSTANCE (self-hosted GitLab, not just
// gitlab.com), so the base is derived from `instanceUrl` rather than a single
// hardcoded constant.
//
// Every request goes through http.ts's getJson (Task 47) — never a hand-rolled
// fetch — so the 8s abort, the network-vs-HTTP status split, and the typed-
// error discipline are all shared, and `fetchFn` stays injectable so tests
// never touch a real network.
import type { ConnectorDescriptor, GitlabConfig } from './types'
import { getJson } from './http'
import { originPattern } from '../permissions'

// Request PATHS, appended to the per-config base (see `apiBase` below).
const MR_PATH = '/api/v4/merge_requests?scope=assigned_to_me&state=opened&per_page=10'
const TODOS_PATH = '/api/v4/todos?per_page=20'

/** Display cap for the to-dos count: fetched with per_page=20, so a full page
 *  reads as "20+" in the widget rather than a precise (and misleadingly
 *  exact) number — same idiom as github.ts's NOTIF_PER_PAGE. Stored
 *  uncapped-but-bounded here; the widget renders the "+" at this threshold. */
const TODOS_PER_PAGE = 20

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

export interface GitlabData {
  mrs: GitlabMr[]
  todos: number // array length, capped at TODOS_PER_PAGE; the widget renders '20+' at the cap
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
 *  rendered blank. */
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

/** The assigned-MRs section. Isolates its OWN failure (a non-OK status, a
 *  network error, or even a parse throw) to the prev slice (`[]` when there
 *  was none), so a bad section never rejects the whole fetch or blanks the
 *  to-dos count — same per-section independence as github.ts's
 *  fetchSearchSection, minus the ETag plumbing (not asked for here). */
async function fetchMrsSection(
  base: string,
  headers: Record<string, string>,
  prevMrs: GitlabMr[],
  fetchFn: typeof fetch,
): Promise<GitlabMr[]> {
  try {
    const result = await getJson<unknown>(`${base}${MR_PATH}`, headers, fetchFn)
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

/** Fetches both sections (assigned MRs, to-dos) for one instance + token,
 *  carrying `prev` forward so a per-section failure keeps the last-known
 *  slice. The sections run concurrently and INDEPENDENTLY: each section
 *  function catches its own failure internally (see each helper above), so
 *  Promise.all never rejects and one section's 403/500/timeout can never
 *  blank the other (same Controller ruling github.ts documents). No ETag
 *  round-trip — the brief doesn't ask for one here; every call re-fetches
 *  both sections in full. */
export async function fetchGitlab(
  instanceUrl: string,
  token: string,
  prev: GitlabData | null,
  fetchFn: typeof fetch = fetch,
): Promise<GitlabData> {
  const base = apiBase(instanceUrl)
  const headers = authHeaders(token)

  const [mrs, todos] = await Promise.all([
    fetchMrsSection(base, headers, prev?.mrs ?? [], fetchFn),
    fetchTodosSection(base, headers, prev?.todos ?? 0, fetchFn),
  ])

  return { mrs, todos }
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
  auth: 'token',
  ttlMs: 5 * 60_000,
  secretFields: ['token'],
  identityField: 'username',
  // Derived per-config (unlike github's single constant origin): the whole
  // point of a self-hostable connector. https-only-filtered, not throwing —
  // same "filter, don't throw" contract rss.ts's origins() documents (a
  // caller sweeping origins() across every registered descriptor must be
  // able to trust that one connector's bad/malformed persisted config (a
  // hand-edited backup could restore a non-https instanceUrl) degrades to
  // fewer origins rather than throwing out of the sweep).
  origins: (config) => {
    try {
      return [originPattern(config.instanceUrl)]
    } catch {
      return []
    }
  },
}
