import type { ConnectorDescriptor, LinearConfig } from './types'
import { postJson } from './http'

export const LINEAR_ORIGIN = 'https://api.linear.app/*'
export const LINEAR_TTL_MS = 15 * 60_000
export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql'

const IDENTITY_QUERY = `
  query AuroraLinearIdentity {
    viewer {
      id
      name
      teams {
        nodes {
          id
          key
          name
        }
      }
    }
  }
`

const WORK_QUERY = `
  query AuroraLinearWork {
    viewer {
      assignedIssues(first: 50) {
        nodes {
          id
          identifier
          title
          priority
          dueDate
          url
          state {
            name
            type
          }
          team {
            id
            key
            name
          }
          cycle {
            id
            name
            startsAt
            endsAt
          }
        }
      }
    }
  }
`

const LINEAR_RESULT_LIMIT = 25
const DUE_SOON_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1_000

export interface LinearTeam {
  id: string
  key: string
  name: string
}

export interface LinearIdentity {
  identity: string
  userId: string
  teams: LinearTeam[]
}

export type LinearIdentityResult =
  | ({ ok: true } & LinearIdentity)
  | { ok: false; message: string }

export type LinearPriority = 'urgent' | 'high' | 'normal' | 'low' | 'none'
export type LinearDueStatus = 'none' | 'overdue' | 'today' | 'soon' | 'later'

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  priority: LinearPriority
  dueDate: string | null
  dueStatus: LinearDueStatus
  dueSoon: boolean
  url: string
  state: { name: string; type: string }
  team: LinearTeam
  cycle: { id: string; name: string; startsAt: string | null; endsAt: string | null } | null
}

export interface LinearWorkData {
  issues: LinearIssue[]
}

type LinearRequestFailure = {
  ok: false
  kind: 'network' | 'http' | 'graphql' | 'invalid'
  status: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function parseTeam(value: unknown): LinearTeam | null {
  if (!isRecord(value)) return null
  const id = cleanString(value.id)
  const key = cleanString(value.key)
  const name = cleanString(value.name)
  return id && key && name ? { id, key, name } : null
}

function parseTeams(value: unknown): LinearTeam[] {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return []
  const seen = new Set<string>()
  const teams: LinearTeam[] = []
  for (const raw of value.nodes) {
    const team = parseTeam(raw)
    if (!team || seen.has(team.id)) continue
    seen.add(team.id)
    teams.push(team)
    if (teams.length === 50) break
  }
  return teams
}

function priorityOf(value: unknown): LinearPriority {
  switch (value) {
    case 1: return 'urgent'
    case 2: return 'high'
    case 3: return 'normal'
    case 4: return 'low'
    default: return 'none'
  }
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : null
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return Number.isFinite(Date.parse(value)) ? value.trim() : null
}

function dueFacts(dueDate: string | null, now: Date): Pick<LinearIssue, 'dueStatus' | 'dueSoon'> {
  if (dueDate === null) return { dueStatus: 'none', dueSoon: false }
  const [year, month, day] = dueDate.split('-').map(Number)
  const dueOrdinal = Date.UTC(year!, month! - 1, day!) / DAY_MS
  const todayOrdinal = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS
  const daysAway = dueOrdinal - todayOrdinal
  if (daysAway < 0) return { dueStatus: 'overdue', dueSoon: true }
  if (daysAway === 0) return { dueStatus: 'today', dueSoon: true }
  if (daysAway <= DUE_SOON_DAYS) return { dueStatus: 'soon', dueSoon: true }
  return { dueStatus: 'later', dueSoon: false }
}

function providerUrl(value: unknown): string | null {
  const raw = cleanString(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'linear.app' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== ''
    ) return null
    return raw
  } catch {
    return null
  }
}

function parseCycle(value: unknown): LinearIssue['cycle'] {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) return null
  const id = cleanString(value.id)
  const name = cleanString(value.name)
  if (!id || !name) return null
  return {
    id,
    name,
    startsAt: timestamp(value.startsAt),
    endsAt: timestamp(value.endsAt),
  }
}

function parseIssue(value: unknown, now: Date): LinearIssue | null {
  if (!isRecord(value)) return null
  const id = cleanString(value.id)
  const identifier = cleanString(value.identifier)
  const title = cleanString(value.title)
  const url = providerUrl(value.url)
  const stateValue = isRecord(value.state) ? value.state : null
  const stateName = stateValue ? cleanString(stateValue.name) : null
  const stateType = stateValue ? cleanString(stateValue.type) : null
  const team = parseTeam(value.team)
  if (!id || !identifier || !title || !url || !stateName || !stateType || !team) return null
  const normalizedStateType = stateType.toLowerCase()
  if (normalizedStateType === 'completed' || normalizedStateType === 'canceled') return null

  const dueDate = dateOnly(value.dueDate)
  return {
    id,
    identifier,
    title,
    priority: priorityOf(value.priority),
    dueDate,
    ...dueFacts(dueDate, now),
    url,
    state: { name: stateName, type: normalizedStateType },
    team,
    cycle: parseCycle(value.cycle),
  }
}

async function requestLinear(
  token: string,
  query: string,
  fetchFn: typeof fetch,
): Promise<{ ok: true; body: Record<string, unknown> } | LinearRequestFailure> {
  try {
    const result = await postJson<unknown>(
      LINEAR_GRAPHQL_URL,
      { Authorization: token },
      { query },
      fetchFn,
    )
    if (!result.ok) {
      return {
        ok: false,
        kind: result.status === null ? 'network' : 'http',
        status: result.status,
      }
    }
    if (!isRecord(result.body)) return { ok: false, kind: 'invalid', status: result.status }
    if (Array.isArray(result.body.errors) && result.body.errors.length > 0) {
      return { ok: false, kind: 'graphql', status: result.status }
    }
    return { ok: true, body: result.body }
  } catch {
    return { ok: false, kind: 'network', status: null }
  }
}

export async function whoamiLinear(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<LinearIdentityResult> {
  const result = await requestLinear(token, IDENTITY_QUERY, fetchFn)
  if (!result.ok) {
    const where = result.kind === 'http' ? `status ${result.status}` : result.kind === 'graphql' ? 'GraphQL error' : 'network or invalid response'
    return { ok: false, message: `Linear rejected that API key (${where}).` }
  }

  const data = isRecord(result.body.data) ? result.body.data : null
  const viewer = data && isRecord(data.viewer) ? data.viewer : null
  const id = viewer ? cleanString(viewer.id) : null
  const name = viewer ? cleanString(viewer.name) : null
  if (!viewer || !id || !name) return { ok: false, message: 'Linear did not return an account identity.' }

  return {
    ok: true,
    identity: name,
    userId: id,
    teams: parseTeams(viewer.teams),
  }
}

export async function fetchLinearWork(
  token: string,
  selectedTeamIds: readonly string[] | null | undefined = [],
  fetchFn: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<LinearWorkData> {
  const result = await requestLinear(token, WORK_QUERY, fetchFn)
  if (!result.ok) throw new Error('Linear work request failed.')

  const data = isRecord(result.body.data) ? result.body.data : null
  const viewer = data && isRecord(data.viewer) ? data.viewer : null
  const assignedIssues = viewer && isRecord(viewer.assignedIssues) ? viewer.assignedIssues : null
  if (!assignedIssues || !Array.isArray(assignedIssues.nodes)) {
    throw new Error('Linear work request failed.')
  }

  const selected = new Set(
    Array.isArray(selectedTeamIds)
      ? selectedTeamIds
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
      : [],
  )
  const seen = new Set<string>()
  const issues: LinearIssue[] = []
  for (const raw of assignedIssues.nodes) {
    const issue = parseIssue(raw, now)
    if (!issue || seen.has(issue.id)) continue
    seen.add(issue.id)
    if (selected.size > 0 && !selected.has(issue.team.id)) continue
    issues.push(issue)
    if (issues.length === LINEAR_RESULT_LIMIT) break
  }
  return { issues }
}

function isNormalizedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

function isNormalizedTeam(value: unknown): value is LinearTeam {
  return isRecord(value) &&
    isNormalizedString(value.id) &&
    isNormalizedString(value.key) &&
    isNormalizedString(value.name)
}

function isNormalizedCycle(value: unknown): value is LinearIssue['cycle'] {
  if (value === null) return true
  return isRecord(value) &&
    isNormalizedString(value.id) &&
    isNormalizedString(value.name) &&
    (value.startsAt === null || (isNormalizedString(value.startsAt) && timestamp(value.startsAt) === value.startsAt)) &&
    (value.endsAt === null || (isNormalizedString(value.endsAt) && timestamp(value.endsAt) === value.endsAt))
}

function isNormalizedIssue(value: unknown): value is LinearIssue {
  if (!isRecord(value)) return false
  if (
    !isNormalizedString(value.id) ||
    !isNormalizedString(value.identifier) ||
    !isNormalizedString(value.title) ||
    !isNormalizedString(value.url) ||
    providerUrl(value.url) !== value.url ||
    !isNormalizedTeam(value.team) ||
    !isNormalizedCycle(value.cycle) ||
    !isRecord(value.state) ||
    !isNormalizedString(value.state.name) ||
    !isNormalizedString(value.state.type) ||
    value.state.type !== value.state.type.toLowerCase() ||
    value.state.type === 'completed' ||
    value.state.type === 'canceled'
  ) return false

  if (!(['urgent', 'high', 'normal', 'low', 'none'] as const).includes(value.priority as LinearPriority)) {
    return false
  }
  if (!(['none', 'overdue', 'today', 'soon', 'later'] as const).includes(value.dueStatus as LinearDueStatus)) {
    return false
  }
  if (typeof value.dueSoon !== 'boolean') return false
  if (value.dueDate === null) return value.dueStatus === 'none' && value.dueSoon === false
  if (dateOnly(value.dueDate) !== value.dueDate || value.dueStatus === 'none') return false
  return value.dueSoon === (value.dueStatus === 'overdue' || value.dueStatus === 'today' || value.dueStatus === 'soon')
}

export function isLinearWorkData(value: unknown): value is LinearWorkData {
  if (!isRecord(value) || !Array.isArray(value.issues) || value.issues.length > LINEAR_RESULT_LIMIT) return false
  const seen = new Set<string>()
  for (const issue of value.issues) {
    if (!isNormalizedIssue(issue) || seen.has(issue.id)) return false
    seen.add(issue.id)
  }
  return true
}

export function linearItemLimit(config: Pick<LinearConfig, 'itemLimit'> | null | undefined): number {
  const value = config?.itemLimit
  return typeof value === 'number' && Number.isInteger(value) && value >= 3 && value <= 10 ? value : 6
}

export function linearTeamIds(config: Pick<LinearConfig, 'teamIds'> | null | undefined): string[] {
  if (!Array.isArray(config?.teamIds)) return []
  return [...new Set(config.teamIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()))]
    .slice(0, 50)
}

export const linearDescriptor: ConnectorDescriptor<LinearConfig> = {
  id: 'linear',
  label: 'Linear',
  blurb: 'Assigned issues, due work, and cycle context',
  category: 'development',
  auth: 'token',
  ttlMs: LINEAR_TTL_MS,
  secretFields: ['token'],
  identityField: 'displayName',
  origins: () => [LINEAR_ORIGIN],
  ownsOrigins: (config) =>
    typeof config.token === 'string' && config.token.trim().length > 0 &&
    typeof config.displayName === 'string' && config.displayName.trim().length > 0,
  redactForBackup: (config) => ({ enabled: config.enabled === true, itemLimit: linearItemLimit(config) }),
  backupReentryRequired: (config) => config.enabled === true && !(typeof config.token === 'string' && config.token.trim().length > 0),
}
