import type { ConnectorDescriptor, SentryConfig, SentryRegion } from './types'
import { getJson } from './http'

export const SENTRY_TTL_MS = 5 * 60_000
export const SENTRY_REGION_HOSTS: Readonly<Record<SentryRegion, string>> = Object.freeze({
  global: 'sentry.io',
  us: 'us.sentry.io',
  de: 'de.sentry.io',
})

export function sentryRegion(value: unknown): SentryRegion {
  return value === 'us' || value === 'de' ? value : 'global'
}

export function sentryBaseUrl(region: unknown): string {
  return `https://${SENTRY_REGION_HOSTS[sentryRegion(region)]}`
}

export function sentryItemLimit(config: Pick<SentryConfig, 'itemLimit'> | null | undefined): number {
  const value = config?.itemLimit
  return typeof value === 'number' && Number.isInteger(value) && value >= 3 && value <= 10 ? value : 6
}

export function sentryProjectSlugs(config: Pick<SentryConfig, 'projectSlugs'> | null | undefined): string[] {
  if (!Array.isArray(config?.projectSlugs)) return []
  return [...new Set(config.projectSlugs.filter((slug): slug is string => typeof slug === 'string' && slug.trim().length > 0).map((slug) => slug.trim()))]
    .slice(0, 50)
}

export type SentryLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug' | 'unknown'
export type SentrySeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown'
export type SentryTrend = 'new' | 'rising' | 'steady' | 'falling' | 'unknown'
export type SentryStatsPoint = readonly [timestamp: number, count: number]

export interface SentryProject {
  id: string
  name: string
  slug: string
}

export interface SentryIssue {
  id: string
  title: string
  shortId: string
  project: SentryProject
  level: SentryLevel
  severity: SentrySeverity
  count: number
  userCount: number
  firstSeen: string | null
  lastSeen: string | null
  stats24h: SentryStatsPoint[]
  events24h: number
  trend: SentryTrend
  isRegression: boolean
  permalink: string | null
  priority: string | null
}

export interface SentryData {
  issues: SentryIssue[]
}

export type SentryIssuesResult =
  | { ok: true; data: SentryData }
  | { ok: false; status: number | null; message: string }

export type SentryRequestConfig = Pick<SentryConfig, 'region' | 'organization' | 'token' | 'projectSlugs'>

interface SentryRawProject {
  id?: unknown
  name?: unknown
  slug?: unknown
}

interface SentryRawIssue {
  id?: unknown
  title?: unknown
  shortId?: unknown
  project?: SentryRawProject | unknown
  level?: unknown
  count?: unknown
  userCount?: unknown
  firstSeen?: unknown
  lastSeen?: unknown
  stats?: unknown
  permalink?: unknown
  priority?: unknown
  status?: unknown
  statusDetails?: unknown
}

const SENTRY_ISSUE_LIMIT = 25
const SENTRY_STATS_LIMIT = 24

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function nonNegativeInteger(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function sentryLevel(value: unknown): SentryLevel {
  const level = trimmedString(value).toLowerCase()
  return level === 'fatal' || level === 'error' || level === 'warning' || level === 'info' || level === 'debug'
    ? level
    : 'unknown'
}

function sentrySeverity(level: SentryLevel): SentrySeverity {
  if (level === 'fatal') return 'critical'
  if (level === 'error') return 'high'
  if (level === 'warning') return 'medium'
  if (level === 'info' || level === 'debug') return 'low'
  return 'unknown'
}

function stats24h(value: unknown): SentryStatsPoint[] {
  if (typeof value !== 'object' || value === null) return []
  const points = (value as Record<string, unknown>)['24h']
  if (!Array.isArray(points)) return []

  const normalized: SentryStatsPoint[] = []
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2) continue
    const [timestamp, count] = point
    if (
      typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < 0 ||
      typeof count !== 'number' || !Number.isFinite(count) || count < 0
    ) continue
    normalized.push([timestamp, Math.floor(count)])
  }
  return normalized.slice(-SENTRY_STATS_LIMIT)
}

function sentryTrend(points: readonly SentryStatsPoint[]): SentryTrend {
  if (points.length === 0) return 'unknown'
  if (points.length === 1) return points[0]![1] > 0 ? 'new' : 'steady'

  const split = Math.floor(points.length / 2)
  const earlier = points.slice(0, split).reduce((sum, point) => sum + point[1], 0)
  const later = points.slice(split).reduce((sum, point) => sum + point[1], 0)
  if (earlier === 0) return later > 0 ? 'new' : 'steady'
  if (later >= earlier * 1.25) return 'rising'
  if (earlier >= later * 1.25) return 'falling'
  return 'steady'
}

function regressionFact(issue: SentryRawIssue): boolean {
  const details = issue.statusDetails
  const detailType = typeof details === 'object' && details !== null
    ? trimmedString((details as Record<string, unknown>).type).toLowerCase()
    : ''
  return detailType === 'regression' || trimmedString(issue.status).toLowerCase() === 'regression'
}

function safePermalink(value: unknown, host: string): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' || url.hostname !== host || url.port !== '' ||
      url.username.length > 0 || url.password.length > 0
    ) return null
    return url.toString()
  } catch {
    return null
  }
}

function normalizeProject(value: unknown): SentryProject | null {
  if (typeof value !== 'object' || value === null) return null
  const project = value as SentryRawProject
  const slug = trimmedString(project.slug)
  if (!slug) return null
  return {
    id: trimmedString(project.id) || slug,
    name: trimmedString(project.name) || slug,
    slug,
  }
}

function normalizeIssue(value: unknown, host: string): SentryIssue | null {
  if (typeof value !== 'object' || value === null) return null
  const issue = value as SentryRawIssue
  const id = trimmedString(issue.id)
  const title = trimmedString(issue.title)
  const shortId = trimmedString(issue.shortId)
  const project = normalizeProject(issue.project)
  if (!id || !title || !shortId || project === null) return null

  const level = sentryLevel(issue.level)
  const points = stats24h(issue.stats)
  const priority = trimmedString(issue.priority).toLowerCase()
  return {
    id,
    title,
    shortId,
    project,
    level,
    severity: sentrySeverity(level),
    count: nonNegativeInteger(issue.count),
    userCount: nonNegativeInteger(issue.userCount),
    firstSeen: isoDate(issue.firstSeen),
    lastSeen: isoDate(issue.lastSeen),
    stats24h: points,
    events24h: points.reduce((sum, point) => sum + point[1], 0),
    trend: sentryTrend(points),
    isRegression: regressionFact(issue),
    permalink: safePermalink(issue.permalink, host),
    priority: priority || null,
  }
}

function normalizeIssues(body: unknown, host: string): SentryIssue[] {
  if (!Array.isArray(body)) return []
  const issues: SentryIssue[] = []
  const seen = new Set<string>()
  for (const value of body) {
    const issue = normalizeIssue(value, host)
    if (issue === null || seen.has(issue.id)) continue
    seen.add(issue.id)
    issues.push(issue)
    if (issues.length === SENTRY_ISSUE_LIMIT) break
  }
  return issues
}

function requestFailure(status: number | null): SentryIssuesResult {
  const where = status === null ? 'network error' : `status ${status}`
  return { ok: false, status, message: `Sentry request failed (${where}).` }
}

function issuesUrl(region: unknown, organization: string, projectSlugs: readonly string[]): string {
  const params = new URLSearchParams()
  params.set('query', 'is:unresolved')
  params.set('sort', 'trends')
  params.set('statsPeriod', '24h')
  params.set('groupStatsPeriod', '24h')
  params.set('limit', String(SENTRY_ISSUE_LIMIT))
  for (const project of projectSlugs) params.append('project', project)
  return `${sentryBaseUrl(region)}/api/0/organizations/${encodeURIComponent(organization)}/issues/?${params.toString()}`
}

export async function fetchSentryIssues(
  config: SentryRequestConfig,
  fetchFn: typeof fetch = fetch,
): Promise<SentryIssuesResult> {
  const organization = trimmedString(config.organization)
  const token = trimmedString(config.token)
  if (!organization || !token) {
    return { ok: false, status: null, message: 'Sentry connection is incomplete.' }
  }

  const region = sentryRegion(config.region)
  const host = SENTRY_REGION_HOSTS[region]
  try {
    const result = await getJson<unknown>(
      issuesUrl(region, organization, sentryProjectSlugs(config)),
      { Authorization: `Bearer ${token}` },
      fetchFn,
    )
    if (!result.ok) return requestFailure(result.status)
    return { ok: true, data: { issues: normalizeIssues(result.body, host) } }
  } catch {
    return requestFailure(null)
  }
}

export async function validateSentryConnection(
  config: Pick<SentryConfig, 'region' | 'organization' | 'token'>,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; identity: string } | { ok: false; message: string }> {
  const result = await fetchSentryIssues({ ...config, projectSlugs: [] }, fetchFn)
  if (!result.ok) return { ok: false, message: result.message }
  return { ok: true, identity: trimmedString(config.organization) }
}

function isStatsPoint(value: unknown): value is SentryStatsPoint {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === 'number' && Number.isFinite(value[0]) && value[0] >= 0 &&
    typeof value[1] === 'number' && Number.isInteger(value[1]) && value[1] >= 0
}

function hasSafeStoredPermalink(value: unknown, host?: string): boolean {
  if (value === null) return true
  if (typeof value !== 'string') return false
  if (host) return safePermalink(value, host) !== null
  return Object.values(SENTRY_REGION_HOSTS).some((officialHost) => safePermalink(value, officialHost) !== null)
}

function isSentryIssue(value: unknown, host?: string): value is SentryIssue {
  if (typeof value !== 'object' || value === null) return false
  const issue = value as Record<string, unknown>
  const project = issue.project
  return typeof issue.id === 'string' && issue.id.length > 0 &&
    typeof issue.title === 'string' && issue.title.length > 0 &&
    typeof issue.shortId === 'string' && issue.shortId.length > 0 &&
    typeof project === 'object' && project !== null &&
    typeof (project as Record<string, unknown>).id === 'string' &&
    typeof (project as Record<string, unknown>).name === 'string' &&
    typeof (project as Record<string, unknown>).slug === 'string' &&
    (issue.level === 'fatal' || issue.level === 'error' || issue.level === 'warning' || issue.level === 'info' || issue.level === 'debug' || issue.level === 'unknown') &&
    (issue.severity === 'critical' || issue.severity === 'high' || issue.severity === 'medium' || issue.severity === 'low' || issue.severity === 'unknown') &&
    typeof issue.count === 'number' && Number.isInteger(issue.count) && issue.count >= 0 &&
    typeof issue.userCount === 'number' && Number.isInteger(issue.userCount) && issue.userCount >= 0 &&
    (issue.firstSeen === null || typeof issue.firstSeen === 'string') &&
    (issue.lastSeen === null || typeof issue.lastSeen === 'string') &&
    Array.isArray(issue.stats24h) && issue.stats24h.length <= SENTRY_STATS_LIMIT && issue.stats24h.every(isStatsPoint) &&
    typeof issue.events24h === 'number' && Number.isInteger(issue.events24h) && issue.events24h >= 0 &&
    (issue.trend === 'new' || issue.trend === 'rising' || issue.trend === 'steady' || issue.trend === 'falling' || issue.trend === 'unknown') &&
    typeof issue.isRegression === 'boolean' &&
    hasSafeStoredPermalink(issue.permalink, host) &&
    (issue.priority === null || typeof issue.priority === 'string')
}

export function isSentryData(value: unknown): value is SentryData {
  if (typeof value !== 'object' || value === null) return false
  const issues = (value as Record<string, unknown>).issues
  if (!Array.isArray(issues) || issues.length > SENTRY_ISSUE_LIMIT || !issues.every((issue) => isSentryIssue(issue))) return false
  return new Set(issues.map((issue) => issue.id)).size === issues.length
}

export function isSentryDataForRegion(value: unknown, region: unknown): value is SentryData {
  if (typeof value !== 'object' || value === null) return false
  const issues = (value as Record<string, unknown>).issues
  const host = SENTRY_REGION_HOSTS[sentryRegion(region)]
  if (!Array.isArray(issues) || issues.length > SENTRY_ISSUE_LIMIT || !issues.every((issue) => isSentryIssue(issue, host))) return false
  return new Set(issues.map((issue) => issue.id)).size === issues.length
}

export const sentryDescriptor: ConnectorDescriptor<SentryConfig> = {
  id: 'sentry',
  label: 'Sentry',
  blurb: 'Unresolved production issues and regressions',
  category: 'development',
  auth: 'token',
  ttlMs: SENTRY_TTL_MS,
  secretFields: ['token'],
  identityField: 'organization',
  identityPhrase: 'to',
  origins: (config) => [`${sentryBaseUrl(config.region)}/*`],
  ownsOrigins: (config) =>
    (config.region === 'global' || config.region === 'us' || config.region === 'de') &&
    typeof config.token === 'string' && config.token.trim().length > 0 &&
    typeof config.organization === 'string' && config.organization.trim().length > 0,
  redactForBackup: (config) => ({
    enabled: config.enabled === true,
    region: sentryRegion(config.region),
    itemLimit: sentryItemLimit(config),
  }),
  backupReentryRequired: (config) => config.enabled === true && !(typeof config.token === 'string' && config.token.trim().length > 0),
}
