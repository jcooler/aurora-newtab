import { isPlainObject } from '../lib/object'
import type { ConnectorConfig, ConnectorId } from '../services/connectors/types'
import { CONNECTOR_IDS } from '../services/connectors/types'
import type { ConnectorPreferenceById, ConnectorPreferenceV1 } from './types'

export const CONNECTOR_PROJECTION_IDS = CONNECTOR_IDS

const VIEW_KEYS = {
  github: ['commitGraph', 'pulls', 'issues', 'notifications'],
  gitlab: ['mergeRequests', 'reviewAsks', 'todos', 'activityGraph'],
  jira: ['assigned', 'statusChips', 'dueSoon'],
  vercel: ['deployments', 'statusSummary'],
} as const

function record(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null
}

function nonEmptyText(value: unknown, max = 128): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

function safeLabel(value: unknown, max = 128): value is string {
  return nonEmptyText(value, max) && !value.includes('://')
}

function stableSelection(value: unknown): value is string {
  return nonEmptyText(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
}

function stableSelections(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 50 && value.every(stableSelection)
}

function itemLimit(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 3 && (value as number) <= 10
}

function optional<T>(value: unknown, guard: (candidate: unknown) => candidate is T): value is T | undefined {
  return value === undefined || guard(value)
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], allowed: readonly string[]): boolean {
  const keys = Object.keys(value)
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every((key) => allowed.includes(key))
}

function views(value: unknown, keys: readonly string[]): Record<string, boolean> | undefined {
  const candidate = record(value)
  if (!candidate || !exactKeys(candidate, keys, keys) || !keys.every((key) => typeof candidate[key] === 'boolean')) return undefined
  return Object.fromEntries(keys.map((key) => [key, candidate[key] as boolean]))
}

function optionalViews(value: unknown, keys: readonly string[]): value is Record<string, boolean> | undefined {
  return value === undefined || views(value, keys) !== undefined
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function hasAuthority(id: ConnectorId, config: Record<string, unknown>): boolean {
  if (typeof config.enabled !== 'boolean') return false
  switch (id) {
    case 'rss':
      return Array.isArray(config.feeds) && config.feeds.length > 0 && config.feeds.every(httpsUrl)
    case 'github':
    case 'vercel':
    case 'linear':
    case 'sentry':
    case 'todoist':
      return nonEmptyText(config.token, 4096)
    case 'gitlab':
      return nonEmptyText(config.token, 4096) && httpsUrl(config.instanceUrl)
    case 'jira':
      return nonEmptyText(config.email, 320) && nonEmptyText(config.apiToken, 4096) && nonEmptyText(config.site, 255)
    case 'crypto':
      return Array.isArray(config.coins) && config.coins.length > 0 && config.coins.every(stableSelection)
    case 'ics':
      return httpsUrl(config.url)
        || (Array.isArray(config.calendars) && config.calendars.length > 0
          && config.calendars.every((calendar) => record(calendar) && httpsUrl((calendar as Record<string, unknown>).url)))
    case 'status':
      return Array.isArray(config.services) && config.services.length > 0
        && config.services.every((service) => record(service) && httpsUrl((service as Record<string, unknown>).url))
    case 'homeassistant':
      return httpsUrl(config.instanceUrl) && nonEmptyText(config.token, 4096)
    case 'onThisDay':
    case 'publicHolidays':
    case 'auroraKp':
      return true
  }
}

function base(config: ConnectorConfig): Record<string, unknown> | null {
  const candidate = record(config)
  return candidate && typeof candidate.enabled === 'boolean' ? candidate : null
}

function withOptionalViews(
  config: Record<string, unknown>,
  keys: readonly string[],
): { enabled: boolean; views?: Record<string, boolean> } {
  const projectedViews = views(config.views, keys)
  return {
    enabled: config.enabled as boolean,
    ...(projectedViews ? { views: projectedViews } : {}),
  }
}

export function projectConnectorPreference<I extends ConnectorId>(
  id: I,
  config: ConnectorConfig,
): ConnectorPreferenceById[I] | null {
  const source = base(config)
  if (!source) return null
  switch (id) {
    case 'rss':
      return (Number.isInteger(source.shownCount) && (source.shownCount as number) >= 3 && (source.shownCount as number) <= 8
        ? { enabled: source.enabled, shownCount: source.shownCount }
        : null) as ConnectorPreferenceById[I] | null
    case 'github':
    case 'gitlab':
    case 'vercel':
      return withOptionalViews(source, VIEW_KEYS[id as keyof typeof VIEW_KEYS]) as ConnectorPreferenceById[I]
    case 'jira': {
      const projectedViews = views(source.views, VIEW_KEYS.jira)
      return {
        enabled: source.enabled,
        ...(safeLabel(source.displayName) ? { displayName: source.displayName } : {}),
        ...(projectedViews ? { views: projectedViews } : {}),
      } as ConnectorPreferenceById[I]
    }
    case 'crypto':
      return (stableSelections(source.coins) && source.coins.length >= 2 && source.coins.length <= 5
        ? { enabled: source.enabled, coins: [...source.coins] }
        : null) as ConnectorPreferenceById[I] | null
    case 'ics':
      return {
        enabled: source.enabled,
        ...(['today', 'upcoming', 'per-calendar'].includes(source.view as string) ? { view: source.view } : {}),
        ...(Number.isInteger(source.upcomingCount) && (source.upcomingCount as number) >= 2 && (source.upcomingCount as number) <= 4
          ? { upcomingCount: source.upcomingCount }
          : {}),
        ...(typeof source.meetLinks === 'boolean' ? { meetLinks: source.meetLinks } : {}),
      } as ConnectorPreferenceById[I]
    case 'status':
      return { enabled: source.enabled } as ConnectorPreferenceById[I]
    case 'homeassistant': {
      const entities = Array.isArray(source.entities) && source.entities.every((entry) => {
        const row = record(entry)
        return row && exactKeys(row, ['id', 'name'], ['id', 'name']) && stableSelection(row.id) && safeLabel(row.name)
      }) ? structuredClone(source.entities) : undefined
      const actions = Array.isArray(source.actions) && source.actions.every((entry) => {
        const row = record(entry)
        return row && exactKeys(row, ['id', 'name', 'domain'], ['id', 'name', 'domain'])
          && stableSelection(row.id) && safeLabel(row.name) && ['scene', 'script', 'switch'].includes(row.domain as string)
      }) ? structuredClone(source.actions) : undefined
      return {
        enabled: source.enabled,
        ...(safeLabel(source.locationName) ? { locationName: source.locationName } : {}),
        ...(entities ? { entities } : {}),
        ...(actions ? { actions } : {}),
      } as ConnectorPreferenceById[I]
    }
    case 'linear':
      return {
        enabled: source.enabled,
        ...(safeLabel(source.displayName) ? { displayName: source.displayName } : {}),
        ...(stableSelections(source.teamIds) ? { teamIds: [...source.teamIds] } : {}),
        ...(itemLimit(source.itemLimit) ? { itemLimit: source.itemLimit } : {}),
      } as ConnectorPreferenceById[I]
    case 'sentry':
      return (['global', 'us', 'de'].includes(source.region as string) ? {
        enabled: source.enabled,
        ...(stableSelection(source.organization) ? { organization: source.organization } : {}),
        region: source.region,
        ...(stableSelections(source.projectSlugs) ? { projectSlugs: [...source.projectSlugs] } : {}),
        ...(itemLimit(source.itemLimit) ? { itemLimit: source.itemLimit } : {}),
      } : null) as ConnectorPreferenceById[I] | null
    case 'todoist':
      return {
        enabled: source.enabled,
        ...(safeLabel(source.accountLabel) ? { accountLabel: source.accountLabel } : {}),
        ...(stableSelections(source.projectIds) ? { projectIds: [...source.projectIds] } : {}),
        ...(itemLimit(source.itemLimit) ? { itemLimit: source.itemLimit } : {}),
      } as ConnectorPreferenceById[I]
    case 'onThisDay':
    case 'auroraKp':
      return { enabled: source.enabled } as ConnectorPreferenceById[I]
    case 'publicHolidays':
      return (/^[A-Z]{2}$/u.test(source.countryCode as string)
        ? { enabled: source.enabled, countryCode: source.countryCode }
        : null) as ConnectorPreferenceById[I] | null
  }
}

function validPreference(id: ConnectorId, value: unknown): value is ConnectorPreferenceV1 {
  const candidate = record(value)
  if (!candidate || typeof candidate.enabled !== 'boolean') return false
  switch (id) {
    case 'rss':
      return exactKeys(candidate, ['enabled', 'shownCount'], ['enabled', 'shownCount'])
        && Number.isInteger(candidate.shownCount) && (candidate.shownCount as number) >= 3 && (candidate.shownCount as number) <= 8
    case 'github':
    case 'gitlab':
    case 'vercel':
      return exactKeys(candidate, ['enabled'], ['enabled', 'views']) && optionalViews(candidate.views, VIEW_KEYS[id])
    case 'jira':
      return exactKeys(candidate, ['enabled'], ['enabled', 'displayName', 'views'])
        && optional(candidate.displayName, safeLabel) && optionalViews(candidate.views, VIEW_KEYS.jira)
    case 'crypto':
      return exactKeys(candidate, ['enabled', 'coins'], ['enabled', 'coins'])
        && stableSelections(candidate.coins) && candidate.coins.length >= 2 && candidate.coins.length <= 5
    case 'ics':
      return exactKeys(candidate, ['enabled'], ['enabled', 'view', 'upcomingCount', 'meetLinks'])
        && optional(candidate.view, (entry): entry is 'today' | 'upcoming' | 'per-calendar' => ['today', 'upcoming', 'per-calendar'].includes(entry as string))
        && optional(candidate.upcomingCount, (entry): entry is number => Number.isInteger(entry) && (entry as number) >= 2 && (entry as number) <= 4)
        && optional(candidate.meetLinks, (entry): entry is boolean => typeof entry === 'boolean')
    case 'status':
    case 'onThisDay':
    case 'auroraKp':
      return exactKeys(candidate, ['enabled'], ['enabled'])
    case 'homeassistant':
      return exactKeys(candidate, ['enabled'], ['enabled', 'locationName', 'entities', 'actions'])
        && optional(candidate.locationName, safeLabel)
        && optional(candidate.entities, (entries): entries is Array<{ id: string; name: string }> => Array.isArray(entries) && entries.length <= 50 && entries.every((entry) => {
          const row = record(entry)
          return row && exactKeys(row, ['id', 'name'], ['id', 'name']) && stableSelection(row.id) && safeLabel(row.name)
        }))
        && optional(candidate.actions, (entries): entries is Array<{ id: string; name: string; domain: 'scene' | 'script' | 'switch' }> => Array.isArray(entries) && entries.length <= 50 && entries.every((entry) => {
          const row = record(entry)
          return row && exactKeys(row, ['id', 'name', 'domain'], ['id', 'name', 'domain'])
            && stableSelection(row.id) && safeLabel(row.name) && ['scene', 'script', 'switch'].includes(row.domain as string)
        }))
    case 'linear':
      return exactKeys(candidate, ['enabled'], ['enabled', 'displayName', 'teamIds', 'itemLimit'])
        && optional(candidate.displayName, safeLabel) && optional(candidate.teamIds, stableSelections) && optional(candidate.itemLimit, itemLimit)
    case 'sentry':
      return exactKeys(candidate, ['enabled', 'region'], ['enabled', 'organization', 'region', 'projectSlugs', 'itemLimit'])
        && optional(candidate.organization, stableSelection) && ['global', 'us', 'de'].includes(candidate.region as string)
        && optional(candidate.projectSlugs, stableSelections) && optional(candidate.itemLimit, itemLimit)
    case 'todoist':
      return exactKeys(candidate, ['enabled'], ['enabled', 'accountLabel', 'projectIds', 'itemLimit'])
        && optional(candidate.accountLabel, safeLabel) && optional(candidate.projectIds, stableSelections) && optional(candidate.itemLimit, itemLimit)
    case 'publicHolidays':
      return exactKeys(candidate, ['enabled', 'countryCode'], ['enabled', 'countryCode']) && /^[A-Z]{2}$/u.test(candidate.countryCode as string)
  }
}

export function applyConnectorPreference(
  id: ConnectorId,
  local: ConnectorConfig | undefined,
  preference: unknown,
): ConnectorConfig | undefined {
  if (!validPreference(id, preference)) throw new Error('sync_connector_preference_invalid')
  if (!local) return undefined
  const source = record(local)
  if (!source || !hasAuthority(id, source)) return local
  return { ...local, ...structuredClone(preference) } as ConnectorConfig
}
