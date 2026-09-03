import { CONNECTOR_IDS, type ConnectorId } from './connectors/types'

export type RefreshSourceId = ConnectorId | 'weather'
export type RefreshValue = number | 'manual'
export type RefreshPreferences = Partial<Record<RefreshSourceId, RefreshValue>>

export interface RefreshPolicy {
  defaultMinutes: number
  options: readonly number[]
  configurable: boolean
}

const POLICIES = Object.freeze({
  rss: { defaultMinutes: 30, options: [15, 30, 60], configurable: true },
  github: { defaultMinutes: 5, options: [5, 10, 30], configurable: true },
  gitlab: { defaultMinutes: 5, options: [5, 10, 30], configurable: true },
  jira: { defaultMinutes: 10, options: [5, 10, 30], configurable: true },
  vercel: { defaultMinutes: 5, options: [1, 5, 15], configurable: true },
  crypto: { defaultMinutes: 5, options: [1, 5, 15, 30], configurable: true },
  ics: { defaultMinutes: 15, options: [5, 15, 30], configurable: true },
  status: { defaultMinutes: 5, options: [1, 5, 15], configurable: true },
  homeassistant: { defaultMinutes: 1, options: [1, 5, 15], configurable: true },
  linear: { defaultMinutes: 15, options: [5, 15, 30], configurable: true },
  sentry: { defaultMinutes: 5, options: [5, 10, 30], configurable: true },
  todoist: { defaultMinutes: 5, options: [5, 10, 30], configurable: true },
  onThisDay: { defaultMinutes: 1_440, options: [], configurable: false },
  publicHolidays: { defaultMinutes: 1_440, options: [], configurable: false },
  auroraKp: { defaultMinutes: 15, options: [5, 15, 30], configurable: true },
  googleCalendar: { defaultMinutes: 15, options: [5, 15, 30], configurable: true },
  microsoftCalendar: { defaultMinutes: 15, options: [5, 15, 30], configurable: true },
  weather: { defaultMinutes: 30, options: [15, 30, 60], configurable: true },
} satisfies Record<RefreshSourceId, RefreshPolicy>)

const SOURCE_IDS: ReadonlySet<string> = new Set([...CONNECTOR_IDS, 'weather'])

export function refreshPolicyFor(source: RefreshSourceId): RefreshPolicy {
  return POLICIES[source]
}

export function refreshValueFor(
  source: RefreshSourceId,
  preferences: RefreshPreferences | undefined,
): RefreshValue {
  const policy = refreshPolicyFor(source)
  if (!policy.configurable) return policy.defaultMinutes
  const value = preferences?.[source]
  if (value === 'manual' || policy.options.includes(value as number)) return value as RefreshValue
  return policy.defaultMinutes
}

export function effectiveRefreshMs(
  source: RefreshSourceId,
  preferences: RefreshPreferences | undefined,
): number | null {
  const value = refreshValueFor(source, preferences)
  return value === 'manual' ? null : value * 60_000
}

export function isRefreshPreferences(value: unknown): value is RefreshPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([source, preference]) => {
    if (!SOURCE_IDS.has(source)) return true
    const policy = refreshPolicyFor(source as RefreshSourceId)
    return policy.configurable && (
      preference === 'manual' ||
      (typeof preference === 'number' && Number.isFinite(preference) && policy.options.includes(preference))
    )
  })
}

export function cleanRefreshPreferences(value: RefreshPreferences): RefreshPreferences {
  const cleaned: RefreshPreferences = {}
  for (const source of [...CONNECTOR_IDS, 'weather'] as RefreshSourceId[]) {
    const policy = refreshPolicyFor(source)
    if (!policy.configurable) continue
    const preference = value[source]
    if (preference === 'manual' || policy.options.includes(preference as number)) cleaned[source] = preference
  }
  return cleaned
}
