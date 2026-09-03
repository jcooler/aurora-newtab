import {
  METRIC_SOURCES,
  METRICS_HISTORY_VERSION,
  type DailyMetricSummary,
  type MetricBucketInput,
  type MetricBucketV1,
  type MetricRange,
  type MetricSource,
  type MetricSummary,
  type MetricTotals,
  type MetricValues,
  type MetricsHistoryV1,
} from './types'

const MAX_BUCKETS = 8_192
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/u
const SOURCE_INSTANCE_IDS = new Set([
  'local-habits',
  'local-tasks',
  'ics',
  'github',
  'gitlab',
  'jira',
  'linear',
  'vercel',
  'strava',
])
const SOURCE_SET: ReadonlySet<string> = new Set(METRIC_SOURCES)
const RANGE_DAYS: Readonly<Record<MetricRange, number>> = Object.freeze({
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
})

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function isCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
}

export function isMetricDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = DATE_KEY.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function parseDateKey(value: string): Date {
  if (!isMetricDateKey(value)) throw new Error('metric_date_invalid')
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDateKey(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1).toString().padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}`
}

function addDays(value: string, days: number): string {
  const date = parseDateKey(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDateKey(date)
}

function validSourceInstanceId(value: unknown): value is string {
  return typeof value === 'string' && (SOURCE_INSTANCE_IDS.has(value) || UUID.test(value))
}

function validFitnessTypes(value: unknown): boolean {
  return isPlainObject(value)
    && exactKeys(value, ['run', 'ride', 'walk', 'hike', 'swim', 'other'])
    && Object.values(value).every(isCount)
}

function validMetricValues(source: MetricSource, value: unknown): value is MetricValues {
  if (!isPlainObject(value) || value.kind !== source) return false
  switch (source) {
    case 'habits':
      return exactKeys(value, ['kind', 'completed', 'tracked', 'streak'])
        && isCount(value.completed) && isCount(value.tracked) && isCount(value.streak)
    case 'focus':
      return exactKeys(value, ['kind', 'sessions', 'minutes'])
        && isCount(value.sessions) && isCount(value.minutes)
    case 'tasks':
      return exactKeys(value, ['kind', 'completed', 'carriedForward'])
        && isCount(value.completed) && isCount(value.carriedForward)
    case 'calendar':
      return exactKeys(value, ['kind', 'events', 'busyMinutes'])
        && isCount(value.events) && isCount(value.busyMinutes)
    case 'development':
      return exactKeys(value, ['kind', 'commits', 'reviews', 'issues', 'deployments', 'failures'])
        && isCount(value.commits) && isCount(value.reviews) && isCount(value.issues)
        && isCount(value.deployments) && isCount(value.failures)
    case 'fitness':
      return exactKeys(value, ['kind', 'activities', 'durationMinutes', 'distanceMeters', 'elevationMeters', 'types'])
        && isCount(value.activities) && isCount(value.durationMinutes)
        && isCount(value.distanceMeters) && isCount(value.elevationMeters)
        && validFitnessTypes(value.types)
  }
}

export function assertMetricBucket(value: unknown): asserts value is MetricBucketV1 {
  if (!isPlainObject(value)
    || !exactKeys(value, ['schemaVersion', 'id', 'date', 'source', 'sourceInstanceId', 'installationId', 'sequence', 'values'])
    || value.schemaVersion !== METRICS_HISTORY_VERSION
    || typeof value.id !== 'string' || !UUID.test(value.id)
    || !isMetricDateKey(value.date)
    || typeof value.source !== 'string' || !SOURCE_SET.has(value.source)
    || !validSourceInstanceId(value.sourceInstanceId)
    || typeof value.installationId !== 'string' || !UUID.test(value.installationId)
    || !isCount(value.sequence) || value.sequence < 1
    || !validMetricValues(value.source as MetricSource, value.values)) {
    throw new Error('metric_bucket_invalid')
  }
}

export function assertMetricsHistory(value: unknown): asserts value is MetricsHistoryV1 {
  if (!isPlainObject(value)
    || !exactKeys(value, ['version', 'installationId', 'buckets'])
    || value.version !== METRICS_HISTORY_VERSION
    || typeof value.installationId !== 'string' || !UUID.test(value.installationId)
    || !Array.isArray(value.buckets)
    || value.buckets.length > MAX_BUCKETS) {
    throw new Error('metric_history_invalid')
  }
  const ids = new Set<string>()
  for (const candidate of value.buckets) {
    assertMetricBucket(candidate)
    if (ids.has(candidate.id)) throw new Error('metric_history_invalid')
    ids.add(candidate.id)
  }
}

export function emptyMetricsHistory(installationId: string): MetricsHistoryV1 {
  const value = { version: METRICS_HISTORY_VERSION, installationId, buckets: [] }
  assertMetricsHistory(value)
  return value
}

export function metricsRetentionStart(today: string): string {
  const date = parseDateKey(today)
  return formatDateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 12, 1)))
}

export function metricRangeStart(range: MetricRange, today: string): string {
  parseDateKey(today)
  return addDays(today, -(RANGE_DAYS[range] - 1))
}

export function pruneMetricsHistory(history: MetricsHistoryV1, today: string): MetricsHistoryV1 {
  assertMetricsHistory(history)
  const start = metricsRetentionStart(today)
  return {
    ...history,
    buckets: history.buckets.filter((candidate) => candidate.date >= start && candidate.date <= today),
  }
}

export function upsertLocalMetricBucket(
  history: MetricsHistoryV1,
  input: MetricBucketInput,
  createId: () => string = () => crypto.randomUUID(),
): MetricsHistoryV1 {
  assertMetricsHistory(history)
  const index = history.buckets.findIndex((candidate) =>
    candidate.installationId === history.installationId
    && candidate.date === input.date
    && candidate.source === input.source
    && candidate.sourceInstanceId === input.sourceInstanceId)
  const previous = index >= 0 ? history.buckets[index] : null
  const candidate: MetricBucketV1 = {
    schemaVersion: METRICS_HISTORY_VERSION,
    id: previous?.id ?? createId(),
    date: input.date,
    source: input.source,
    sourceInstanceId: input.sourceInstanceId,
    installationId: history.installationId,
    sequence: (previous?.sequence ?? 0) + 1,
    values: structuredClone(input.values),
  }
  assertMetricBucket(candidate)
  const buckets = index < 0
    ? [...history.buckets, candidate]
    : history.buckets.map((current, currentIndex) => currentIndex === index ? candidate : current)
  const next = { ...history, buckets }
  assertMetricsHistory(next)
  return next
}

function sameBucketIdentity(left: MetricBucketV1, right: MetricBucketV1): boolean {
  return left.id === right.id
    && left.date === right.date
    && left.source === right.source
    && left.sourceInstanceId === right.sourceInstanceId
    && left.installationId === right.installationId
}

function sameBucket(left: MetricBucketV1, right: MetricBucketV1): boolean {
  return sameBucketIdentity(left, right)
    && left.sequence === right.sequence
    && JSON.stringify(left.values) === JSON.stringify(right.values)
}

export function mergeMetricHistories(
  local: MetricsHistoryV1,
  incoming: MetricsHistoryV1,
  today: string,
): MetricsHistoryV1 {
  assertMetricsHistory(local)
  assertMetricsHistory(incoming)
  const buckets = [...local.buckets]
  const indexes = new Map(buckets.map((candidate, index) => [candidate.id, index]))
  for (const candidate of incoming.buckets) {
    const index = indexes.get(candidate.id)
    if (index === undefined) {
      indexes.set(candidate.id, buckets.length)
      buckets.push(structuredClone(candidate))
      continue
    }
    const current = buckets[index]!
    if (!sameBucketIdentity(current, candidate)) throw new Error('metric_history_conflict')
    if (candidate.sequence > current.sequence) buckets[index] = structuredClone(candidate)
    else if (candidate.sequence === current.sequence && !sameBucket(current, candidate)) {
      throw new Error('metric_history_conflict')
    }
  }
  return pruneMetricsHistory({ version: METRICS_HISTORY_VERSION, installationId: local.installationId, buckets }, today)
}

function emptyTotals(): MetricTotals {
  return {
    habits: { completed: 0, tracked: 0, streak: 0 },
    focus: { sessions: 0, minutes: 0 },
    tasks: { completed: 0, carriedForward: 0 },
    calendar: { events: 0, busyMinutes: 0 },
    development: { commits: 0, reviews: 0, issues: 0, deployments: 0, failures: 0 },
    fitness: {
      activities: 0,
      durationMinutes: 0,
      distanceMeters: 0,
      elevationMeters: 0,
      types: { run: 0, ride: 0, walk: 0, hike: 0, swim: 0, other: 0 },
    },
  }
}

function maxValues(left: MetricValues, right: MetricValues): MetricValues {
  if (left.kind !== right.kind) throw new Error('metric_history_conflict')
  switch (left.kind) {
    case 'habits': {
      const value = right as typeof left
      return { kind: 'habits', completed: Math.max(left.completed, value.completed), tracked: Math.max(left.tracked, value.tracked), streak: Math.max(left.streak, value.streak) }
    }
    case 'focus': {
      const value = right as typeof left
      return { kind: 'focus', sessions: Math.max(left.sessions, value.sessions), minutes: Math.max(left.minutes, value.minutes) }
    }
    case 'tasks': {
      const value = right as typeof left
      return { kind: 'tasks', completed: Math.max(left.completed, value.completed), carriedForward: Math.max(left.carriedForward, value.carriedForward) }
    }
    case 'calendar': {
      const value = right as typeof left
      return { kind: 'calendar', events: Math.max(left.events, value.events), busyMinutes: Math.max(left.busyMinutes, value.busyMinutes) }
    }
    case 'development': {
      const value = right as typeof left
      return {
        kind: 'development',
        commits: Math.max(left.commits, value.commits),
        reviews: Math.max(left.reviews, value.reviews),
        issues: Math.max(left.issues, value.issues),
        deployments: Math.max(left.deployments, value.deployments),
        failures: Math.max(left.failures, value.failures),
      }
    }
    case 'fitness': {
      const value = right as typeof left
      return {
        kind: 'fitness',
        activities: Math.max(left.activities, value.activities),
        durationMinutes: Math.max(left.durationMinutes, value.durationMinutes),
        distanceMeters: Math.max(left.distanceMeters, value.distanceMeters),
        elevationMeters: Math.max(left.elevationMeters, value.elevationMeters),
        types: {
          run: Math.max(left.types.run, value.types.run),
          ride: Math.max(left.types.ride, value.types.ride),
          walk: Math.max(left.types.walk, value.types.walk),
          hike: Math.max(left.types.hike, value.types.hike),
          swim: Math.max(left.types.swim, value.types.swim),
          other: Math.max(left.types.other, value.types.other),
        },
      }
    }
  }
}

function addValues(target: MetricTotals, value: MetricValues): void {
  switch (value.kind) {
    case 'habits':
      target.habits.completed += value.completed
      target.habits.tracked += value.tracked
      target.habits.streak = Math.max(target.habits.streak, value.streak)
      break
    case 'focus':
      target.focus.sessions += value.sessions
      target.focus.minutes += value.minutes
      break
    case 'tasks':
      target.tasks.completed += value.completed
      target.tasks.carriedForward += value.carriedForward
      break
    case 'calendar':
      target.calendar.events += value.events
      target.calendar.busyMinutes += value.busyMinutes
      break
    case 'development':
      target.development.commits += value.commits
      target.development.reviews += value.reviews
      target.development.issues += value.issues
      target.development.deployments += value.deployments
      target.development.failures += value.failures
      break
    case 'fitness':
      target.fitness.activities += value.activities
      target.fitness.durationMinutes += value.durationMinutes
      target.fitness.distanceMeters += value.distanceMeters
      target.fitness.elevationMeters += value.elevationMeters
      for (const kind of ['run', 'ride', 'walk', 'hike', 'swim', 'other'] as const) {
        target.fitness.types[kind] += value.types[kind]
      }
      break
  }
}

function dailySummary(date: string): DailyMetricSummary {
  return { date, ...emptyTotals() }
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date)
  return days
}

export function summarizeMetrics(
  history: MetricsHistoryV1,
  range: MetricRange,
  today: string,
): MetricSummary {
  assertMetricsHistory(history)
  const start = metricRangeStart(range, today)
  const days = daysBetween(start, today).map(dailySummary)
  const dayByDate = new Map(days.map((day) => [day.date, day]))
  const collapsed = new Map<string, MetricValues>()
  for (const bucket of history.buckets) {
    if (bucket.date < start || bucket.date > today) continue
    const logicalOwner = bucket.source === 'focus' ? bucket.installationId : bucket.sourceInstanceId
    const key = `${bucket.date}|${bucket.source}|${logicalOwner}`
    const previous = collapsed.get(key)
    collapsed.set(key, previous ? maxValues(previous, bucket.values) : structuredClone(bucket.values))
  }
  for (const [key, value] of collapsed) {
    const date = key.slice(0, 10)
    const day = dayByDate.get(date)
    if (day) addValues(day, value)
  }
  const totals = emptyTotals()
  for (const day of days) {
    for (const source of METRIC_SOURCES) {
      addValues(totals, { kind: source, ...day[source] } as MetricValues)
    }
  }
  return { range, start, end: today, totals, days }
}
