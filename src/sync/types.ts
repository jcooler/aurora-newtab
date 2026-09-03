import type { Countdown, Notes, ProgressGoal, Settings, StoredLocation, TimerConfig, TodoItem, WorldClock } from '../lib/storage/schema'
import type { StoredLayout } from '../lib/layout/canvasTypes'
import type {
  CalendarLayoutPreference,
  CalendarWeekStart,
  NamedLayout,
} from '../lib/layout/namedLayouts'
import type { GithubViews, GitlabViews, JiraViews, VercelViews } from '../services/connectors/types'
import type { MetricBucketV1 } from '../metrics/types'

export const SYNC_ENTITY_TYPES = [
  'settings',
  'focus',
  'todo_list',
  'quick_link',
  'timer_config',
  'location',
  'notes',
  'world_clock',
  'countdown',
  'legacy_layout',
  'layout_manifest',
  'named_layout',
  'calendar_preference',
  'calendar_week_start',
  'connector_preference',
  'habit',
  'habit_completion',
  'progress_goal',
  'metric_bucket',
] as const

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number]

export interface ConnectorPreferenceById {
  rss: { enabled: boolean; shownCount: number }
  github: { enabled: boolean; views?: GithubViews }
  gitlab: { enabled: boolean; views?: GitlabViews }
  jira: { enabled: boolean; displayName?: string; views?: JiraViews }
  vercel: { enabled: boolean; views?: VercelViews }
  crypto: { enabled: boolean; coins: string[] }
  ics: { enabled: boolean; view?: 'today' | 'upcoming' | 'per-calendar'; upcomingCount?: number; meetLinks?: boolean }
  status: { enabled: boolean }
  homeassistant: {
    enabled: boolean
    locationName?: string
    entities?: Array<{ id: string; name: string }>
    actions?: Array<{ id: string; name: string; domain: 'scene' | 'script' | 'switch' }>
  }
  linear: { enabled: boolean; displayName?: string; teamIds?: string[]; itemLimit?: number }
  sentry: { enabled: boolean; organization?: string; region: 'global' | 'us' | 'de'; projectSlugs?: string[]; itemLimit?: number }
  todoist: { enabled: boolean; accountLabel?: string; projectIds?: string[]; itemLimit?: number }
  onThisDay: { enabled: boolean }
  publicHolidays: { enabled: boolean; countryCode: string }
  auroraKp: { enabled: boolean }
  googleCalendar: never
  microsoftCalendar: never
}

export type ConnectorPreferenceV1 = ConnectorPreferenceById[keyof ConnectorPreferenceById]

export interface SyncEntityValueByType {
  settings: Settings
  focus: { text: string; done: boolean }
  todo_list: { name: string; items: TodoItem[] }
  quick_link: { title: string; url: string }
  timer_config: TimerConfig
  location: StoredLocation
  notes: Notes
  world_clock: WorldClock
  countdown: Omit<Countdown, 'id'>
  legacy_layout: StoredLayout
  layout_manifest: { version: 1; activeLayoutId: string }
  named_layout: Omit<NamedLayout, 'id'>
  calendar_preference: CalendarLayoutPreference
  calendar_week_start: CalendarWeekStart
  connector_preference: ConnectorPreferenceV1
  habit: { name: string; createdAt: number }
  habit_completion: { done: boolean }
  progress_goal: Omit<ProgressGoal, 'id'>
  metric_bucket: Omit<MetricBucketV1, 'id'>
}

export interface SyncEntityV1<T = unknown> {
  schemaVersion: 1
  entityType: SyncEntityType
  entityId: string
  value: T
}

export type SyncMutationV1 =
  | { kind: 'put'; entity: SyncEntityV1 }
  | { kind: 'delete'; entityType: SyncEntityType; entityId: string }
