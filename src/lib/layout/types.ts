export const BLOCK_IDS = [
  'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links',
  'quote', 'weather', 'timer', 'tasks', 'notes', 'bookmarks', 'rss', 'github', 'gitlab', 'jira', 'vercel', 'crypto',
  'readingList', 'recentlyClosed', 'downloads', 'tabGroups',
  'ics', 'habits', 'monthCal', 'sun', 'moon', 'status', 'homeassistant',
  'linear', 'sentry', 'todoist',
  'onThisDay', 'publicHolidays', 'auroraKp',
  'progress',
  'metrics',
] as const
export type BlockId = (typeof BLOCK_IDS)[number]
/** Block CENTER as percent of viewport (0-100 each axis), finite. */
export interface BlockPos { x: number; y: number }
export type LegacyLayout = Partial<Record<BlockId, BlockPos>>

export const LAYOUT_PROFILES = ['compact', 'standard', 'display', 'ultrawide'] as const
export type LayoutProfile = (typeof LAYOUT_PROFILES)[number]

export const WIDGET_VARIANTS = ['compact', 'standard', 'expanded'] as const
export type WidgetVariant = (typeof WIDGET_VARIANTS)[number]

export const ZONES = ['day', 'now', 'pulse', 'dock'] as const
export type Zone = (typeof ZONES)[number]

export const PRIORITIES = ['pinned', 'automatic', 'dock'] as const
export type Priority = (typeof PRIORITIES)[number]

export const LAYOUT_DENSITY_PREFERENCES = ['auto', 'compact', 'balanced', 'spacious'] as const
export type LayoutDensityPreference = (typeof LAYOUT_DENSITY_PREFERENCES)[number]
export type ResolvedLayoutDensity = Exclude<LayoutDensityPreference, 'auto'>

export interface Placement {
  zone: Zone
  order: number
  colSpan: number
  rowSpan: number
  variant: WidgetVariant
  priority: Priority
  locked?: boolean
}

export interface LayoutV2 {
  version: 2
  profiles: Partial<Record<LayoutProfile, Partial<Record<BlockId, Placement>>>>
  legacy?: LegacyLayout
}
