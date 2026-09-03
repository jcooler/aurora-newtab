import type { Habit, TodoList } from '../lib/storage/schema'
import { isIcsData, type IcsEvent } from '../services/connectors/ics'
import { isGoogleCalendarSnapshot } from '../services/connectors/googleCalendar'
import { isMicrosoftCalendarSnapshot } from '../services/connectors/microsoftCalendar'
import type {
  ConnectorSnapshot,
  GoogleCalendarEvent,
  MicrosoftCalendarEvent,
} from '../services/connectors/types'
import { isMetricDateKey, metricsRetentionStart } from './history'
import type { MetricBucketInput } from './types'

interface DatedSignal {
  at: number
}

interface DeploymentSignal extends DatedSignal {
  failed: boolean
}

export interface DevelopmentSeriesInput {
  sourceInstanceId: string
  contributions?: Array<{ date: string; count: number }>
  reviews?: DatedSignal[]
  issues?: DatedSignal[]
  deployments?: DeploymentSignal[]
}

export interface FitnessSeriesInput {
  date: string
  activityType: string
  durationMinutes: number
  distanceMeters: number
  elevationMeters: number
  [privateField: string]: unknown
}

interface DatedTodoItem {
  done: boolean
  createdOn?: string
  completedOn?: string
}

const DEVELOPMENT_SOURCES = new Set(['github', 'gitlab', 'jira', 'linear', 'vercel'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function validSourceInstanceId(value: string, fixed: ReadonlySet<string>): boolean {
  return fixed.has(value) || UUID.test(value)
}

function localDateKey(epochMs: number): string | null {
  if (!Number.isFinite(epochMs)) return null
  const date = new Date(epochMs)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

function parseDateKey(value: string): Date {
  if (!isMetricDateKey(value)) throw new Error('metric_date_invalid')
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatLocalDate(value: Date): string {
  return `${value.getFullYear().toString().padStart(4, '0')}-${(value.getMonth() + 1).toString().padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}`
}

function addLocalDays(value: string, amount: number): string {
  const date = parseDateKey(value)
  date.setDate(date.getDate() + amount)
  return formatLocalDate(date)
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = []
  for (let date = start; date <= end; date = addLocalDays(date, 1)) days.push(date)
  return days
}

function boundedCount(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))
}

function habitStreakThrough(log: ReadonlySet<string>, day: string): number {
  let streak = 0
  for (let cursor = day; log.has(cursor); cursor = addLocalDays(cursor, -1)) streak += 1
  return streak
}

export function collectHabitSeries(habits: readonly Habit[], today: string): MetricBucketInput[] {
  const retentionStart = metricsRetentionStart(today)
  const normalized = habits.flatMap((habit) => {
    const createdOn = localDateKey(habit.createdAt)
    if (!createdOn) return []
    return [{ createdOn: createdOn < retentionStart ? retentionStart : createdOn, log: new Set(habit.log.filter(isMetricDateKey)) }]
  })
  if (normalized.length === 0) return []
  const first = normalized.reduce((earliest, habit) => habit.createdOn < earliest ? habit.createdOn : earliest, today)
  return daysBetween(first, today).flatMap((date): MetricBucketInput[] => {
    const tracked = normalized.filter((habit) => habit.createdOn <= date)
    if (tracked.length === 0) return []
    return [{
      date,
      source: 'habits',
      sourceInstanceId: 'local-habits',
      values: {
        kind: 'habits',
        completed: tracked.filter((habit) => habit.log.has(date)).length,
        tracked: tracked.length,
        streak: tracked.reduce((longest, habit) => Math.max(longest, habitStreakThrough(habit.log, date)), 0),
      },
    }]
  })
}

export function collectTaskSeries(lists: readonly TodoList[], today: string): MetricBucketInput[] {
  const retentionStart = metricsRetentionStart(today)
  const items = lists.flatMap((list) => list.items as DatedTodoItem[]).flatMap((item) => {
    if (!isMetricDateKey(item.createdOn)) return []
    if (item.completedOn !== undefined && !isMetricDateKey(item.completedOn)) return []
    return [{
      createdOn: item.createdOn < retentionStart ? retentionStart : item.createdOn,
      completedOn: item.completedOn,
    }]
  })
  if (items.length === 0) return []
  const first = items.reduce((earliest, item) => item.createdOn < earliest ? item.createdOn : earliest, today)
  return daysBetween(first, today).map((date): MetricBucketInput => ({
    date,
    source: 'tasks',
    sourceInstanceId: 'local-tasks',
    values: {
      kind: 'tasks',
      completed: items.filter((item) => item.completedOn === date).length,
      carriedForward: items.filter((item) => item.createdOn < date && (item.completedOn === undefined || item.completedOn >= date)).length,
    },
  }))
}

function localDayBounds(date: string): readonly [number, number] {
  const start = parseDateKey(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.getTime(), end.getTime()]
}

type CalendarMetricEvent = Pick<IcsEvent | GoogleCalendarEvent | MicrosoftCalendarEvent, 'start' | 'end' | 'allDay'> & {
  startDate?: string | null
  endDate?: string | null
}

function calendarEventOccursOn(
  event: CalendarMetricEvent,
  date: string,
  dayStart: number,
  dayEnd: number,
): boolean {
  if (
    event.allDay
    && typeof event.startDate === 'string'
    && typeof event.endDate === 'string'
    && isMetricDateKey(event.startDate)
    && isMetricDateKey(event.endDate)
    && event.endDate > event.startDate
  ) {
    return event.startDate <= date && date < event.endDate
  }
  return event.start < dayEnd && event.end > dayStart
}

function busyMinutes(events: readonly CalendarMetricEvent[], start: number, end: number): number {
  const intervals = events
    .filter((event) => !event.allDay && event.end > event.start && event.start < end && event.end > start)
    .map((event) => [Math.max(start, event.start), Math.min(end, event.end)] as const)
    .sort((left, right) => left[0] - right[0])
  let total = 0
  let currentStart = 0
  let currentEnd = 0
  for (const [intervalStart, intervalEnd] of intervals) {
    if (currentEnd === 0 || intervalStart > currentEnd) {
      total += Math.max(0, currentEnd - currentStart)
      currentStart = intervalStart
      currentEnd = intervalEnd
    } else {
      currentEnd = Math.max(currentEnd, intervalEnd)
    }
  }
  total += Math.max(0, currentEnd - currentStart)
  return Math.round(total / 60_000)
}

export function collectCalendarSeries(
  events: readonly CalendarMetricEvent[],
  sourceInstanceId: string,
  today: string,
): MetricBucketInput[] {
  if (!validSourceInstanceId(sourceInstanceId, new Set(['ics']))) throw new Error('metric_source_invalid')
  const retentionStart = metricsRetentionStart(today)
  return daysBetween(retentionStart, today).flatMap((date): MetricBucketInput[] => {
    const [start, end] = localDayBounds(date)
    const current = events.filter((event) =>
      Number.isFinite(event.start) && Number.isFinite(event.end)
      && event.end > event.start && calendarEventOccursOn(event, date, start, end))
    if (current.length === 0) return []
    return [{
      date,
      source: 'calendar',
      sourceInstanceId,
      values: { kind: 'calendar', events: current.length, busyMinutes: busyMinutes(current, start, end) },
    }]
  })
}

function emptyDevelopment(date: string, sourceInstanceId: string): MetricBucketInput {
  return {
    date,
    source: 'development',
    sourceInstanceId,
    values: { kind: 'development', commits: 0, reviews: 0, issues: 0, deployments: 0, failures: 0 },
  }
}

export function collectDevelopmentSeries(input: DevelopmentSeriesInput, today: string): MetricBucketInput[] {
  if (!validSourceInstanceId(input.sourceInstanceId, DEVELOPMENT_SOURCES)) throw new Error('metric_source_invalid')
  const start = metricsRetentionStart(today)
  const byDate = new Map<string, MetricBucketInput>()
  const get = (date: string): MetricBucketInput => {
    const current = byDate.get(date) ?? emptyDevelopment(date, input.sourceInstanceId)
    byDate.set(date, current)
    return current
  }
  for (const contribution of input.contributions ?? []) {
    if (!isMetricDateKey(contribution.date) || contribution.date < start || contribution.date > today) continue
    const count = boundedCount(contribution.count)
    if (count === null) continue
    const current = get(contribution.date)
    if (current.values.kind === 'development') current.values.commits += count
  }
  const addSignals = (signals: readonly DatedSignal[], field: 'reviews' | 'issues') => {
    for (const signal of signals) {
      const date = localDateKey(signal.at)
      if (!date || date < start || date > today) continue
      const current = get(date)
      if (current.values.kind === 'development') current.values[field] += 1
    }
  }
  addSignals(input.reviews ?? [], 'reviews')
  addSignals(input.issues ?? [], 'issues')
  for (const deployment of input.deployments ?? []) {
    const date = localDateKey(deployment.at)
    if (!date || date < start || date > today) continue
    const current = get(date)
    if (current.values.kind !== 'development') continue
    current.values.deployments += 1
    if (deployment.failed) current.values.failures += 1
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

function activityClass(value: string): 'run' | 'ride' | 'walk' | 'hike' | 'swim' | 'other' {
  const normalized = value.trim().toLowerCase()
  if (normalized.includes('run')) return 'run'
  if (normalized.includes('ride') || normalized.includes('cycl')) return 'ride'
  if (normalized.includes('walk')) return 'walk'
  if (normalized.includes('hike')) return 'hike'
  if (normalized.includes('swim')) return 'swim'
  return 'other'
}

export function collectFitnessSeries(
  sourceInstanceId: string,
  activities: readonly FitnessSeriesInput[],
  today: string,
): MetricBucketInput[] {
  if (!validSourceInstanceId(sourceInstanceId, new Set(['strava']))) throw new Error('metric_source_invalid')
  const start = metricsRetentionStart(today)
  const byDate = new Map<string, MetricBucketInput>()
  for (const activity of activities) {
    if (!isMetricDateKey(activity.date) || activity.date < start || activity.date > today) continue
    const durationMinutes = boundedCount(activity.durationMinutes)
    const distanceMeters = boundedCount(activity.distanceMeters)
    const elevationMeters = boundedCount(activity.elevationMeters)
    if (durationMinutes === null || distanceMeters === null || elevationMeters === null) continue
    const current = byDate.get(activity.date) ?? {
      date: activity.date,
      source: 'fitness',
      sourceInstanceId,
      values: {
        kind: 'fitness', activities: 0, durationMinutes: 0, distanceMeters: 0, elevationMeters: 0,
        types: { run: 0, ride: 0, walk: 0, hike: 0, swim: 0, other: 0 },
      },
    } satisfies MetricBucketInput
    if (current.values.kind !== 'fitness') continue
    current.values.activities += 1
    current.values.durationMinutes += durationMinutes
    current.values.distanceMeters += distanceMeters
    current.values.elevationMeters += elevationMeters
    current.values.types[activityClass(activity.activityType)] += 1
    byDate.set(activity.date, current)
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function contributionDays(value: unknown): Array<{ date: string; count: number }> | null {
  if (!isRecord(value) || !Array.isArray(value.days)) return null
  const days: Array<{ date: string; count: number }> = []
  for (const row of value.days) {
    if (!isRecord(row) || !isMetricDateKey(row.date) || boundedCount(row.count as number) === null) return null
    days.push({ date: row.date, count: row.count as number })
  }
  return days
}

export function collectConnectorSeries(
  snapshots: Partial<Record<
    'ics' | 'github' | 'gitlab' | 'vercel' | 'googleCalendar' | 'microsoftCalendar',
    ConnectorSnapshot
  >>,
  today: string,
): MetricBucketInput[] {
  const output: MetricBucketInput[] = []
  const ics = snapshots.ics?.data
  if (isIcsData(ics)) output.push(...collectCalendarSeries(ics.events, 'ics', today))

  const google = snapshots.googleCalendar?.data
  if (isGoogleCalendarSnapshot(google)) {
    const eventsByConnection = new Map<string, GoogleCalendarEvent[]>()
    for (const calendar of google.calendars) {
      const events = eventsByConnection.get(calendar.connectionId) ?? []
      events.push(...calendar.events)
      eventsByConnection.set(calendar.connectionId, events)
    }
    for (const [connectionId, events] of eventsByConnection) {
      output.push(...collectCalendarSeries(events, connectionId, today))
    }
  }

  const microsoft = snapshots.microsoftCalendar?.data
  if (isMicrosoftCalendarSnapshot(microsoft)) {
    const eventsByConnection = new Map<string, MicrosoftCalendarEvent[]>()
    for (const calendar of microsoft.calendars) {
      const events = eventsByConnection.get(calendar.connectionId) ?? []
      events.push(...calendar.events.filter((event) => !event.cancelled))
      eventsByConnection.set(calendar.connectionId, events)
    }
    for (const [connectionId, events] of eventsByConnection) {
      output.push(...collectCalendarSeries(events, connectionId, today))
    }
  }

  for (const source of ['github', 'gitlab'] as const) {
    const data = snapshots[source]?.data
    if (!isRecord(data) || data.contributions === null || data.contributions === undefined) continue
    const contributions = contributionDays(data.contributions)
    if (contributions) output.push(...collectDevelopmentSeries({ sourceInstanceId: source, contributions }, today))
  }

  const vercel = snapshots.vercel?.data
  if (isRecord(vercel) && Array.isArray(vercel.deployments)) {
    const deployments = vercel.deployments.flatMap((row): DeploymentSignal[] => {
      if (!isRecord(row) || typeof row.createdAt !== 'number' || !Number.isFinite(row.createdAt) || typeof row.state !== 'string') return []
      return [{ at: row.createdAt, failed: row.state === 'ERROR' }]
    })
    if (deployments.length > 0) output.push(...collectDevelopmentSeries({ sourceInstanceId: 'vercel', deployments }, today))
  }
  return output
}
