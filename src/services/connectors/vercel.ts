// src/services/connectors/vercel.ts — the Vercel connector's service layer:
// the who-am-I probe the connect form validates a token with, the one-endpoint
// deployments fetch the widget renders, and the registry descriptor. Task 51
// is the fourth full token connector, closest to github.ts (a single
// constant-origin field, ONE token) but with NO ETag round-trip (the brief is
// explicit: v6/deployments gets no conditional-GET treatment here) and one
// property none of github/gitlab/jira need — a deterministic SORT the widget
// must not have to reimplement: failed (ERROR) deployments surface FIRST,
// then everything by recency, so the section stays useful even when the
// underlying array arrives in whatever order the API happens to return it.
//
// Every request goes through http.ts's getJson (Task 47) — never a
// hand-rolled fetch — so the 8s abort, the network-vs-HTTP status split, and
// the typed-error discipline are all shared, and `fetchFn` stays injectable
// so tests never touch a real network.
import type { ConnectorDescriptor, VercelConfig, VercelViews } from './types'
import { getJson } from './http'

const BASE = 'https://api.vercel.com'
const DEPLOYMENTS_PATH = '/v6/deployments?limit=8'
const USER_PATH = '/v2/user'

/** WAVE-2 DEFAULT (see VercelConfig's `views` comment in types.ts): an absent
 *  `views` reproduces today's card — the deployments list (already shipped)
 *  stays ON, the status summary this wave ADDS stays OFF. Both sections read
 *  the SAME one endpoint, so gating below keys on whether EITHER is on (the
 *  data being needed), not a 1:1 section-to-request mapping. */
export const DEFAULT_VERCEL_VIEWS: VercelViews = {
  deployments: true,
  statusSummary: false,
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export interface VercelDeployment {
  project: string
  state: string // READY | ERROR | BUILDING | QUEUED | CANCELED — passed through verbatim; the widget maps colors
  url: string
  createdAt: number // epoch ms
}

export interface VercelData {
  deployments: VercelDeployment[]
}

interface DeploymentsBody {
  deployments?: Array<{
    name?: unknown
    state?: unknown
    readyState?: unknown
    url?: unknown
    inspectorUrl?: unknown
    createdAt?: unknown
    created?: unknown
  }>
}

/** ERROR states sort FIRST (failures surfaced first, per the brief), then by
 *  createdAt descending within each group. Array.prototype.sort is STABLE, so
 *  two deployments with equal rank (same error-ness AND, in the pathological
 *  case, equal createdAt) keep their original relative order rather than
 *  shuffling on every call. */
function sortDeployments(deployments: VercelDeployment[]): VercelDeployment[] {
  return [...deployments].sort((a, b) => {
    const aRank = a.state === 'ERROR' ? 0 : 1
    const bRank = b.state === 'ERROR' ? 0 : 1
    if (aRank !== bRank) return aRank - bRank
    return b.createdAt - a.createdAt
  })
}

/** v6/deployments body -> VercelDeployment[], sorted (see sortDeployments).
 *  Defensive at every field, same skip-don't-crash discipline as github.ts's
 *  parseItems: a row missing a project name or a resolvable URL is skipped
 *  rather than rendered blank/unclickable. Two documented API-shape
 *  fallbacks the brief calls out explicitly (the live endpoint has used both
 *  shapes over time): `state` prefers `readyState`, falling back to the
 *  older `state` field; `createdAt` prefers its own name, falling back to a
 *  nested `created`. The v6 `url` field is a BARE domain (no scheme) —
 *  `inspectorUrl` is preferred when present (already a full https:// URL);
 *  when only the bare `url` is available, `https://` is prefixed onto it so
 *  every row is still a valid, clickable href. */
function parseDeployments(body: DeploymentsBody): VercelDeployment[] {
  const items = Array.isArray(body.deployments) ? body.deployments : []
  const out: VercelDeployment[] = []
  for (const item of items) {
    const project = typeof item.name === 'string' ? item.name : ''
    const state =
      typeof item.readyState === 'string'
        ? item.readyState
        : typeof item.state === 'string'
          ? item.state
          : ''
    const rawUrl =
      typeof item.inspectorUrl === 'string'
        ? item.inspectorUrl
        : typeof item.url === 'string'
          ? item.url
          : ''
    if (!project || !rawUrl) continue
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const createdAt =
      typeof item.createdAt === 'number'
        ? item.createdAt
        : typeof item.created === 'number'
          ? item.created
          : 0
    out.push({ project, state, url, createdAt })
  }
  return sortDeployments(out)
}

/** Fetches the account's latest deployments for one token, carrying `prev`
 *  forward so a failure (network error or non-OK status) keeps the last-known
 *  slice — `prev ?? { deployments: [] }`, same quiet-degradation idiom as
 *  jira.ts's fallback (no ETag round-trip here either, so there's no
 *  304/If-None-Match path to model).
 *
 *  `views` GATES the single request: both the deployments list AND the status
 *  summary are RENDERED from this one endpoint's data, so the fetch fires when
 *  EITHER section is on — the gating keys on the DATA being needed, not on a
 *  1:1 section-to-request mapping (unlike github/gitlab/jira, where each
 *  section has its own endpoint). Both off → prev carried, no request. */
export async function fetchVercel(
  token: string,
  views: VercelViews,
  prev: VercelData | null,
  fetchFn: typeof fetch = fetch,
): Promise<VercelData> {
  const fallback = prev ?? { deployments: [] }
  if (!views.deployments && !views.statusSummary) return fallback
  try {
    const result = await getJson<DeploymentsBody>(`${BASE}${DEPLOYMENTS_PATH}`, authHeaders(token), fetchFn)
    if (!result.ok) return fallback
    return { deployments: parseDeployments(result.body) }
  } catch {
    return fallback
  }
}

/** The who-am-I probe the connect form validates a token with. GET /v2/user
 *  -> user.username, falling back to user.email when no username is set
 *  (Vercel accounts can lack one). A non-OK response resolves { ok: false }
 *  with a message that NAMES the status, same as whoamiGithub/whoamiGitlab/
 *  whoamiJira, so the form's inline alert tells the user why the token was
 *  rejected. */
export async function whoamiVercel(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; identity: string } | { ok: false; message: string }> {
  const result = await getJson<{ user?: { username?: unknown; email?: unknown } }>(
    `${BASE}${USER_PATH}`,
    authHeaders(token),
    fetchFn,
  )
  if (!result.ok) {
    const where = result.status === null ? 'a network error' : `status ${result.status}`
    return { ok: false, message: `Vercel rejected that token (${where}).` }
  }
  const username = result.body.user?.username
  const email = result.body.user?.email
  const identity =
    typeof username === 'string' && username.length > 0
      ? username
      : typeof email === 'string' && email.length > 0
        ? email
        : ''
  if (!identity) return { ok: false, message: 'Vercel did not return a username for that token.' }
  return { ok: true, identity }
}

/** now/createdAt both epoch ms. Floors to the largest whole unit ('3m', '2h',
 *  '4d'); under 60s reads as 'now' rather than '0m' (nothing meaningfully
 *  aged has happened yet). PURE — the widget's own render is the one place
 *  that supplies `now` (via Date.now()), so this function itself stays
 *  trivially unit-testable at exact second-boundary inputs. */
export function relAge(now: number, createdAt: number): string {
  const diffSec = Math.floor((now - createdAt) / 1000)
  if (diffSec < 60) return 'now'
  const minutes = Math.floor(diffSec / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export const vercelDescriptor: ConnectorDescriptor<VercelConfig> = {
  id: 'vercel',
  label: 'Vercel',
  blurb: 'Your latest deployments',
  category: 'development', // dev-tool connector — see types.ts's CATEGORY_LABELS
  auth: 'token',
  ttlMs: 5 * 60_000,
  secretFields: ['token'],
  identityField: 'username',
  // The single origin every request above targets. Constant (no per-config
  // derivation, unlike gitlab's instanceUrl or jira's site), so this never
  // throws and needs no defensive wrapper — same shape as githubDescriptor's.
  origins: () => ['https://api.vercel.com/*'],
  ownsOrigins: (config) =>
    typeof config.token === 'string' && config.token.length > 0 &&
    typeof config.username === 'string' && config.username.length > 0,
}
