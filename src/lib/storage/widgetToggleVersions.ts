import type { WidgetToggles } from './schema'

/** Schema version whose migration first materialized each widget toggle. */
export const WIDGET_TOGGLE_INTRO_VERSIONS = Object.freeze({
  search: 1,
  weather: 1,
  links: 1,
  todo: 1,
  timer: 1,
  quote: 1,
  bookmarks: 2,
  notes: 2,
  clocks: 2,
  countdown: 2,
  habits: 7,
  monthCal: 7,
  sun: 9,
  moon: 9,
  readingList: 16,
  recentlyClosed: 16,
  downloads: 16,
  tabGroups: 16,
  progress: 20,
  metrics: 22,
} satisfies Record<keyof WidgetToggles, number>)
