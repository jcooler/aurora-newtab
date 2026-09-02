import { isPanelColor } from '../lib/color'
import { isPlainObject } from '../lib/object'
import { validProgressGoals } from '../lib/progress'
import { isSafeQuickLinkUrl } from '../lib/quickLinkUrl'
import { cleanStoredLayout } from '../lib/layout/canvasTypes'
import { LAYOUT_DENSITY_PREFERENCES } from '../lib/layout/types'
import {
  cleanLayoutsDocument,
  isCalendarLayoutPreferences,
  type CalendarLayoutPreference,
  type NamedLayout,
} from '../lib/layout/namedLayouts'
import {
  FLOW_AMBIENCE_VALUES,
  defaults,
  type AuroraData,
  type DataKey,
  type Habit,
  type ProgressGoal,
  type TodoItem,
} from '../lib/storage/schema'
import { CONNECTOR_IDS, type ConnectorId } from '../services/connectors/types'
import { applyConnectorPreference, projectConnectorPreference } from './connectorProjection'
import { SYNC_ENTITY_TYPES, type SyncEntityType, type SyncEntityV1 } from './types'

export const SYNCED_AURORA_KEYS = [
  'settings',
  'focus',
  'todoLists',
  'links',
  'timerConfig',
  'location',
  'notes',
  'worldClocks',
  'countdowns',
  'layout',
  'layouts',
  'calendarPreferences',
  'calendarWeekStart',
  'connectors',
  'habits',
  'progressGoals',
] as const satisfies readonly DataKey[]

export const EXCLUDED_AURORA_KEYS = [
  'timerSession',
  'photoPrefs',
  'weatherCache',
  'weatherAlertCache',
  'connectorSnapshots',
  'refreshPreferences',
  'attentionLedger',
  'apodCache',
] as const satisfies readonly DataKey[]

const SYNCED_KEY_SET: ReadonlySet<string> = new Set(SYNCED_AURORA_KEYS)
const EXCLUDED_KEY_SET: ReadonlySet<string> = new Set(EXCLUDED_AURORA_KEYS)
const ENTITY_TYPE_SET: ReadonlySet<string> = new Set(SYNC_ENTITY_TYPES)
const CONNECTOR_ID_SET: ReadonlySet<string> = new Set(CONNECTOR_IDS)
const WIDGET_KEYS = Object.keys(defaults().settings.widgets)

export type AuroraSyncClassification = 'synced' | 'excluded'

export function classifyAuroraKey(key: string): AuroraSyncClassification {
  if (SYNCED_KEY_SET.has(key)) return 'synced'
  if (EXCLUDED_KEY_SET.has(key)) return 'excluded'
  throw new Error('sync_key_unclassified')
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], allowed: readonly string[] = required): boolean {
  const keys = Object.keys(value)
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every((key) => allowed.includes(key))
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function nonNegativeNumber(value: unknown): value is number {
  return finite(value) && value >= 0
}

function text(value: unknown, max = 10_000): value is string {
  return typeof value === 'string' && value.length <= max && !/[\u0000]/u.test(value)
}

function nonEmptyText(value: unknown, max = 256): value is string {
  return text(value, max) && value.length > 0 && value === value.trim()
}

function stableId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
}

function dateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function ianaZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 128) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
    return true
  } catch {
    return false
  }
}

function optional<T>(value: unknown, guard: (candidate: unknown) => candidate is T): value is T | undefined {
  return value === undefined || guard(value)
}

function validSettings(value: unknown): value is AuroraData['settings'] {
  if (!isPlainObject(value)) return false
  const allowed = [
    'name', 'use24Hour', 'briefingEnabled', 'briefingSources', 'panelColor', 'widgetTextColor', 'photoTextColor',
    'photoClockColor', 'photoGreetingColor', 'photoQuoteColor', 'units', 'muted', 'flowAmbience', 'flowVolume',
    'layoutDensity', 'widgets',
  ]
  const required = allowed.filter((key) => key !== 'briefingEnabled')
  if (!exactKeys(value, required, allowed) || !isPlainObject(value.briefingSources) || !isPlainObject(value.widgets)) return false
  const briefing = value.briefingSources
  const widgets = value.widgets
  const color = (candidate: unknown): boolean => candidate === null || isPanelColor(candidate)
  return text(value.name, 128)
    && typeof value.use24Hour === 'boolean'
    && optional(value.briefingEnabled, (candidate): candidate is boolean => typeof candidate === 'boolean')
    && exactKeys(briefing, ['calendar', 'assignments', 'deployments', 'rain'])
    && Object.values(briefing).every((candidate) => typeof candidate === 'boolean')
    && color(value.panelColor)
    && color(value.widgetTextColor)
    && color(value.photoTextColor)
    && color(value.photoClockColor)
    && color(value.photoGreetingColor)
    && color(value.photoQuoteColor)
    && (value.units === 'metric' || value.units === 'imperial')
    && typeof value.muted === 'boolean'
    && FLOW_AMBIENCE_VALUES.includes(value.flowAmbience as typeof FLOW_AMBIENCE_VALUES[number])
    && Number.isInteger(value.flowVolume) && (value.flowVolume as number) >= 0 && (value.flowVolume as number) <= 100
    && LAYOUT_DENSITY_PREFERENCES.includes(value.layoutDensity as typeof LAYOUT_DENSITY_PREFERENCES[number])
    && exactKeys(widgets, WIDGET_KEYS)
    && WIDGET_KEYS.every((key) => typeof widgets[key] === 'boolean')
}

function validTodoItems(value: unknown): value is TodoItem[] {
  return Array.isArray(value) && value.length <= 1_000 && value.every((entry) => {
    if (!isPlainObject(entry) || !exactKeys(entry, ['id', 'text', 'done'])) return false
    return stableId(entry.id) && text(entry.text) && typeof entry.done === 'boolean'
  })
}

function validEntityId(entityType: SyncEntityType, entityId: string): boolean {
  switch (entityType) {
    case 'settings':
    case 'timer_config':
    case 'location':
    case 'notes':
    case 'legacy_layout':
    case 'layout_manifest':
    case 'calendar_week_start':
      return entityId === 'singleton'
    case 'focus':
      return dateKey(entityId)
    case 'world_clock':
      return ianaZone(entityId)
    case 'connector_preference':
      return CONNECTOR_ID_SET.has(entityId)
    case 'habit_completion': {
      const match = /^(.*):(\d{4}-\d{2}-\d{2})$/u.exec(entityId)
      return Boolean(match && stableId(match[1]) && dateKey(match[2]))
    }
    default:
      return stableId(entityId)
  }
}

export function isValidSyncEntityIdentity(entityType: SyncEntityType, entityId: string): boolean {
  return ENTITY_TYPE_SET.has(entityType) && validEntityId(entityType, entityId)
}

function validNamedLayoutValue(entityId: string, value: unknown): value is Omit<NamedLayout, 'id'> {
  if (!isPlainObject(value)) return false
  try {
    const cleaned = cleanLayoutsDocument({
      version: 1,
      activeLayoutId: entityId,
      layouts: [{ id: entityId, ...value }],
    }, { invalidStack: 'reject' })
    return cleaned.layouts.length === 1 && cleaned.layouts[0].id === entityId
  } catch {
    return false
  }
}

function validCalendarPreference(value: unknown): value is CalendarLayoutPreference {
  return isPlainObject(value)
    && exactKeys(value, ['defaultView', 'includePublicHolidays'])
    && (value.defaultView === 'agenda' || value.defaultView === 'month')
    && typeof value.includePublicHolidays === 'boolean'
}

function validProgressGoalValue(entityId: string, value: unknown): value is Omit<ProgressGoal, 'id'> {
  return isPlainObject(value) && validProgressGoals([{ id: entityId, ...value }]).length === 1
}

function validValue(entityType: SyncEntityType, entityId: string, value: unknown): boolean {
  switch (entityType) {
    case 'settings':
      return validSettings(value)
    case 'focus':
      return isPlainObject(value) && exactKeys(value, ['text', 'done']) && text(value.text) && typeof value.done === 'boolean'
    case 'todo_list':
      return isPlainObject(value) && exactKeys(value, ['name', 'items']) && nonEmptyText(value.name) && validTodoItems(value.items)
    case 'quick_link':
      return isPlainObject(value) && exactKeys(value, ['title', 'url']) && nonEmptyText(value.title)
        && typeof value.url === 'string' && isSafeQuickLinkUrl(value.url)
    case 'timer_config':
      return isPlainObject(value) && exactKeys(value, ['workMinutes', 'breakMinutes'])
        && Number.isInteger(value.workMinutes) && (value.workMinutes as number) > 0 && (value.workMinutes as number) <= 1_440
        && Number.isInteger(value.breakMinutes) && (value.breakMinutes as number) > 0 && (value.breakMinutes as number) <= 1_440
    case 'location':
      return isPlainObject(value) && exactKeys(value, ['lat', 'lon', 'label', 'manual'])
        && finite(value.lat) && value.lat >= -90 && value.lat <= 90
        && finite(value.lon) && value.lon >= -180 && value.lon <= 180
        && text(value.label, 256) && typeof value.manual === 'boolean'
    case 'notes':
      return isPlainObject(value) && exactKeys(value, ['text', 'updatedAt'])
        && text(value.text, 100_000) && nonNegativeNumber(value.updatedAt)
    case 'world_clock':
      return isPlainObject(value) && exactKeys(value, ['zone', 'label'])
        && value.zone === entityId && ianaZone(value.zone) && nonEmptyText(value.label)
    case 'countdown':
      return isPlainObject(value) && exactKeys(value, ['name', 'date']) && nonEmptyText(value.name) && dateKey(value.date)
    case 'legacy_layout':
      try {
        cleanStoredLayout(value)
        return true
      } catch {
        return false
      }
    case 'layout_manifest':
      return isPlainObject(value) && exactKeys(value, ['version', 'activeLayoutId'])
        && value.version === 1 && stableId(value.activeLayoutId)
    case 'named_layout':
      return validNamedLayoutValue(entityId, value)
    case 'calendar_preference':
      return validCalendarPreference(value)
    case 'calendar_week_start':
      return value === 'locale' || value === 'sunday' || value === 'monday'
    case 'connector_preference':
      try {
        applyConnectorPreference(entityId as ConnectorId, undefined, value)
        return true
      } catch {
        return false
      }
    case 'habit':
      return isPlainObject(value) && exactKeys(value, ['name', 'createdAt'])
        && nonEmptyText(value.name) && nonNegativeNumber(value.createdAt)
    case 'habit_completion':
      return isPlainObject(value) && exactKeys(value, ['done']) && typeof value.done === 'boolean'
    case 'progress_goal':
      return validProgressGoalValue(entityId, value)
  }
}

function assertValidEntity(value: unknown): asserts value is SyncEntityV1 {
  if (!isPlainObject(value)
    || !exactKeys(value, ['schemaVersion', 'entityType', 'entityId', 'value'])
    || value.schemaVersion !== 1
    || typeof value.entityType !== 'string'
    || !ENTITY_TYPE_SET.has(value.entityType)
    || typeof value.entityId !== 'string'
    || !validEntityId(value.entityType as SyncEntityType, value.entityId)
    || !validValue(value.entityType as SyncEntityType, value.entityId, value.value)) {
    throw new Error('sync_entity_invalid')
  }
}

function entity(entityType: SyncEntityType, entityId: string, value: unknown): SyncEntityV1 {
  const projected = { schemaVersion: 1 as const, entityType, entityId, value: structuredClone(value) }
  assertValidEntity(projected)
  return projected
}

export function projectSyncEntities(data: AuroraData): SyncEntityV1[] {
  const sourceKeys = Object.keys(data)
  for (const key of sourceKeys) classifyAuroraKey(key)
  if (Object.keys(defaults()).some((key) => !Object.prototype.hasOwnProperty.call(data, key))) {
    throw new Error('sync_key_unclassified')
  }

  const entities: SyncEntityV1[] = [entity('settings', 'singleton', data.settings)]
  if (data.focus) entities.push(entity('focus', data.focus.date, { text: data.focus.text, done: data.focus.done }))
  for (const list of data.todoLists) entities.push(entity('todo_list', list.id, { name: list.name, items: list.items }))
  for (const link of data.links) entities.push(entity('quick_link', link.id, { title: link.title, url: link.url }))
  entities.push(entity('timer_config', 'singleton', data.timerConfig))
  if (data.location) entities.push(entity('location', 'singleton', data.location))
  entities.push(entity('notes', 'singleton', data.notes))
  for (const clock of data.worldClocks) entities.push(entity('world_clock', clock.zone, clock))
  for (const countdown of data.countdowns) entities.push(entity('countdown', countdown.id, { name: countdown.name, date: countdown.date }))
  entities.push(entity('legacy_layout', 'singleton', data.layout))
  if (data.layouts) {
    for (const layout of data.layouts.layouts) {
      const { id, ...value } = layout
      entities.push(entity('named_layout', id, value))
    }
    entities.push(entity('layout_manifest', 'singleton', { version: data.layouts.version, activeLayoutId: data.layouts.activeLayoutId }))
  }
  for (const [layoutId, preference] of Object.entries(data.calendarPreferences)) {
    entities.push(entity('calendar_preference', layoutId, preference))
  }
  entities.push(entity('calendar_week_start', 'singleton', data.calendarWeekStart))
  for (const connectorId of CONNECTOR_IDS) {
    const config = data.connectors[connectorId]
    if (!config) continue
    const preference = projectConnectorPreference(connectorId, config)
    if (preference) entities.push(entity('connector_preference', connectorId, preference))
  }
  for (const habit of data.habits) {
    entities.push(entity('habit', habit.id, { name: habit.name, createdAt: habit.createdAt }))
    for (const date of [...new Set(habit.log)].sort()) {
      entities.push(entity('habit_completion', `${habit.id}:${date}`, { done: true }))
    }
  }
  for (const goal of data.progressGoals) {
    const { id, ...value } = goal
    entities.push(entity('progress_goal', id, value))
  }
  return entities
}

function upsertById<T extends { id: string }>(rows: readonly T[], value: T): T[] {
  const index = rows.findIndex((row) => row.id === value.id)
  if (index < 0) return [...rows, value]
  return rows.map((row, rowIndex) => rowIndex === index ? value : row)
}

export function applySyncEntity(data: AuroraData, incoming: SyncEntityV1): AuroraData {
  assertValidEntity(incoming)
  const next = structuredClone(data)
  const value = structuredClone(incoming.value) as Record<string, unknown>
  switch (incoming.entityType) {
    case 'settings':
      next.settings = value as unknown as AuroraData['settings']
      break
    case 'focus':
      next.focus = { date: incoming.entityId, text: value.text as string, done: value.done as boolean }
      break
    case 'todo_list':
      next.todoLists = upsertById(next.todoLists, { id: incoming.entityId, name: value.name as string, items: value.items as TodoItem[] })
      break
    case 'quick_link':
      next.links = upsertById(next.links, { id: incoming.entityId, title: value.title as string, url: value.url as string })
      break
    case 'timer_config':
      next.timerConfig = value as unknown as AuroraData['timerConfig']
      break
    case 'location':
      next.location = value as unknown as AuroraData['location']
      break
    case 'notes':
      next.notes = value as unknown as AuroraData['notes']
      break
    case 'world_clock':
      next.worldClocks = upsertById(next.worldClocks.map((clock) => ({ ...clock, id: clock.zone })), {
        id: incoming.entityId,
        zone: value.zone as string,
        label: value.label as string,
      }).map(({ id: _id, ...clock }) => clock)
      break
    case 'countdown':
      next.countdowns = upsertById(next.countdowns, { id: incoming.entityId, name: value.name as string, date: value.date as string })
      break
    case 'legacy_layout':
      next.layout = cleanStoredLayout(value)
      break
    case 'named_layout': {
      const named = { id: incoming.entityId, ...value } as unknown as NamedLayout
      const current = next.layouts ?? { version: 1 as const, activeLayoutId: incoming.entityId, layouts: [] }
      next.layouts = cleanLayoutsDocument({ ...current, layouts: upsertById(current.layouts, named) }, { invalidStack: 'reject' })
      break
    }
    case 'layout_manifest': {
      if (!next.layouts || !next.layouts.layouts.some((layout) => layout.id === value.activeLayoutId)) throw new Error('sync_entity_invalid')
      next.layouts = { ...next.layouts, version: 1, activeLayoutId: value.activeLayoutId as string }
      break
    }
    case 'calendar_preference':
      next.calendarPreferences = { ...next.calendarPreferences, [incoming.entityId]: value as unknown as CalendarLayoutPreference }
      if (!isCalendarLayoutPreferences(next.calendarPreferences)) throw new Error('sync_entity_invalid')
      break
    case 'calendar_week_start':
      next.calendarWeekStart = incoming.value as AuroraData['calendarWeekStart']
      break
    case 'connector_preference': {
      const id = incoming.entityId as ConnectorId
      const applied = applyConnectorPreference(id, next.connectors[id], incoming.value)
      if (applied) next.connectors = { ...next.connectors, [id]: applied }
      break
    }
    case 'habit': {
      const existing = next.habits.find((habit) => habit.id === incoming.entityId)
      next.habits = upsertById(next.habits, {
        id: incoming.entityId,
        name: value.name as string,
        createdAt: value.createdAt as number,
        log: existing?.log ?? [],
      })
      break
    }
    case 'habit_completion': {
      const match = /^(.*):(\d{4}-\d{2}-\d{2})$/u.exec(incoming.entityId)
      if (!match) throw new Error('sync_entity_invalid')
      const [, habitId, date] = match
      if (!next.habits.some((habit) => habit.id === habitId)) throw new Error('sync_entity_invalid')
      next.habits = next.habits.map((habit): Habit => {
        if (habit.id !== habitId) return habit
        const log = new Set(habit.log)
        if (value.done === true) log.add(date)
        else log.delete(date)
        return { ...habit, log: [...log].sort() }
      })
      break
    }
    case 'progress_goal':
      next.progressGoals = upsertById(next.progressGoals, { id: incoming.entityId, ...value } as unknown as ProgressGoal)
      break
  }
  return next
}

export function removeSyncEntity(
  data: AuroraData,
  entityType: SyncEntityType,
  entityId: string,
): AuroraData {
  if (!isValidSyncEntityIdentity(entityType, entityId)) throw new Error('sync_entity_invalid')
  const next = structuredClone(data)
  const fallback = defaults()
  switch (entityType) {
    case 'settings': next.settings = fallback.settings; break
    case 'focus': if (next.focus?.date === entityId) next.focus = null; break
    case 'todo_list': next.todoLists = next.todoLists.filter((item) => item.id !== entityId); break
    case 'quick_link': next.links = next.links.filter((item) => item.id !== entityId); break
    case 'timer_config': next.timerConfig = fallback.timerConfig; break
    case 'location': next.location = null; break
    case 'notes': next.notes = fallback.notes; break
    case 'world_clock': next.worldClocks = next.worldClocks.filter((item) => item.zone !== entityId); break
    case 'countdown': next.countdowns = next.countdowns.filter((item) => item.id !== entityId); break
    case 'legacy_layout': next.layout = fallback.layout; break
    case 'layout_manifest': next.layouts = null; break
    case 'named_layout':
      if (next.layouts) {
        const layouts = next.layouts.layouts.filter((item) => item.id !== entityId)
        next.layouts = layouts.length === 0
          ? null
          : {
              ...next.layouts,
              activeLayoutId: next.layouts.activeLayoutId === entityId
                ? layouts[0]!.id
                : next.layouts.activeLayoutId,
              layouts,
            }
      }
      break
    case 'calendar_preference': {
      const { [entityId]: _removed, ...remaining } = next.calendarPreferences
      next.calendarPreferences = remaining
      break
    }
    case 'calendar_week_start': next.calendarWeekStart = fallback.calendarWeekStart; break
    case 'connector_preference': {
      const id = entityId as ConnectorId
      next.connectors = { ...next.connectors, [id]: fallback.connectors[id] }
      break
    }
    case 'habit': next.habits = next.habits.filter((item) => item.id !== entityId); break
    case 'habit_completion': {
      const separator = entityId.lastIndexOf(':')
      const habitId = entityId.slice(0, separator)
      const date = entityId.slice(separator + 1)
      next.habits = next.habits.map((habit) => habit.id === habitId
        ? { ...habit, log: habit.log.filter((item) => item !== date) }
        : habit)
      break
    }
    case 'progress_goal': next.progressGoals = next.progressGoals.filter((item) => item.id !== entityId); break
  }
  return next
}
