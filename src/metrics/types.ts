export const METRICS_HISTORY_VERSION = 1 as const

export const METRIC_SOURCES = [
  'habits',
  'focus',
  'tasks',
  'calendar',
  'development',
  'fitness',
] as const

export type MetricSource = (typeof METRIC_SOURCES)[number]
export type MetricRange = '7d' | '30d' | '90d' | '365d'

export interface HabitMetricValues {
  kind: 'habits'
  completed: number
  tracked: number
  streak: number
}

export interface FocusMetricValues {
  kind: 'focus'
  sessions: number
  minutes: number
}

export interface TaskMetricValues {
  kind: 'tasks'
  completed: number
  carriedForward: number
}

export interface CalendarMetricValues {
  kind: 'calendar'
  events: number
  busyMinutes: number
}

export interface DevelopmentMetricValues {
  kind: 'development'
  commits: number
  reviews: number
  issues: number
  deployments: number
  failures: number
}

export interface FitnessActivityTypes {
  run: number
  ride: number
  walk: number
  hike: number
  swim: number
  other: number
}

export interface FitnessMetricValues {
  kind: 'fitness'
  activities: number
  durationMinutes: number
  distanceMeters: number
  elevationMeters: number
  types: FitnessActivityTypes
}

export type MetricValues =
  | HabitMetricValues
  | FocusMetricValues
  | TaskMetricValues
  | CalendarMetricValues
  | DevelopmentMetricValues
  | FitnessMetricValues

export interface MetricBucketV1 {
  schemaVersion: 1
  id: string
  date: string
  source: MetricSource
  sourceInstanceId: string
  installationId: string
  sequence: number
  values: MetricValues
}

export interface MetricsHistoryV1 {
  version: 1
  installationId: string
  buckets: MetricBucketV1[]
}

export interface MetricBucketInput {
  date: string
  source: MetricSource
  sourceInstanceId: string
  values: MetricValues
}

export interface MetricTotals {
  habits: Omit<HabitMetricValues, 'kind'>
  focus: Omit<FocusMetricValues, 'kind'>
  tasks: Omit<TaskMetricValues, 'kind'>
  calendar: Omit<CalendarMetricValues, 'kind'>
  development: Omit<DevelopmentMetricValues, 'kind'>
  fitness: Omit<FitnessMetricValues, 'kind'>
}

export interface DailyMetricSummary extends MetricTotals {
  date: string
}

export interface MetricSummary {
  range: MetricRange
  start: string
  end: string
  totals: MetricTotals
  days: DailyMetricSummary[]
}
