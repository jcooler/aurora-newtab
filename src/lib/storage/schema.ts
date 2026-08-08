import type { Layout } from '../layout/types'
import type { ConnectorConfig, ConnectorId, ConnectorSnapshot } from '../../services/connectors/types'

export const CURRENT_VERSION = 8

/** STANDING RULE (final-review fix wave — this recurred TWICE, Tasks 57 and
 *  58, before review caught it, see migrations.ts's own v6->v7 step for the
 *  generic catch-up fix and its own limits): adding a member here REQUIRES,
 *  in the SAME change, both (1) bumping CURRENT_VERSION below and (2) adding
 *  a migration step keyed to the version being upgraded FROM (migrations.ts)
 *  that backfills the new key — copying migrations[6]'s generic
 *  `{...defaults().settings.widgets, ...stored}` shape under the next
 *  version number is sufficient, no need to hardcode the new key by name.
 *  Skip either half and this is the failure mode: `defaults()`'s own merge
 *  only backfills MISSING TOP-LEVEL KEYS, never new fields nested inside an
 *  already-present `settings.widgets` object, so an EXISTING user's stored
 *  settings simply won't have the new key — and backup.ts's own
 *  `isWidgetToggles` validator (deliberately strict, see its comment)
 *  requires EVERY key here present as a boolean, so any backup captured
 *  before this member existed gets rejected WHOLESALE on import, not
 *  partially degraded. */
export interface WidgetToggles {
  search: boolean
  weather: boolean
  links: boolean
  todo: boolean
  timer: boolean
  quote: boolean
  bookmarks: boolean
  notes: boolean
  clocks: boolean
  countdown: boolean
  habits: boolean
  monthCal: boolean
}

export interface Settings {
  name: string
  use24Hour: boolean
  /** The widget-color customizer (Task 60, which retired the three-theme
   *  system). `null` = the default surface defined by themes.css's :root. A
   *  `#rrggbb` string re-tints every widget's panel at runtime
   *  (src/theme/index.ts's applyPanelColor + src/lib/color.ts), with
   *  --fg/--fg-muted and the color-scheme flip derived from the pick's
   *  luminance so any color stays readable.
   *
   *  STANDING RULE (the same one WidgetToggles carries above): adding or
   *  removing a Settings field REQUIRES, in the SAME change, both (1) bumping
   *  CURRENT_VERSION and (2) a migrations.ts step keyed to the version upgraded
   *  FROM — migrations[7] is THIS field's step (it strips the dead `theme` and
   *  backfills `panelColor: null`, the searchEngine-strip precedent of
   *  migrations[3]). Skip it and this is the failure mode: `defaults()`'s own
   *  merge only backfills MISSING TOP-LEVEL KEYS, never a new field nested
   *  inside an already-present `settings` object, so an existing user's stored
   *  settings simply won't have the key — and backup.ts's isSettings validator
   *  requires panelColor present-and-valid (`null` or `#rrggbb`), so any backup
   *  captured before this field existed gets rejected WHOLESALE on import. */
  panelColor: string | null
  units: 'metric' | 'imperial'
  muted: boolean
  widgets: WidgetToggles
}

/** date is a local YYYY-MM-DD key; the focus resets when it stops matching today. */
export interface Focus {
  text: string
  date: string
  done: boolean
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

export interface TodoList {
  id: string
  name: string
  items: TodoItem[]
}

export interface QuickLink {
  id: string
  title: string
  url: string
}

export interface TimerConfig {
  workMinutes: number
  breakMinutes: number
}

export interface PhotoPrefs {
  mode: 'auto' | 'upload' | 'gradient'
  index: number
  lastRotated: string
  /** Bumped on every new upload so the write is never deep-equal (chrome.storage
   *  emits no onChanged event for equal writes). */
  uploadedAt?: string
}

export interface StoredLocation {
  lat: number
  lon: number
  label: string
  manual: boolean
}

export interface CurrentWeather {
  tempC: number
  feelsLikeC: number
  code: number // WMO weather code
  windKmh: number
  humidity: number
  /** From Open-Meteo is_day; optional so pre-existing caches stay valid
   *  (missing = treat as day; caches self-heal within the 30-min SWR window). */
  isDay?: boolean
}

export interface HourlyPoint {
  time: string // ISO local hour from Open-Meteo
  tempC: number
  precipProb: number // 0-100
  code: number
  isDay?: boolean // see CurrentWeather.isDay
}

export interface WeatherSnapshot {
  current: CurrentWeather
  hourly: HourlyPoint[] // next ~12h
  fetchedAt: number // epoch ms
  locationLabel: string
  sunriseISO?: string
  sunsetISO?: string
}

export interface Notes {
  text: string
  updatedAt: number
}

export interface WorldClock {
  zone: string
  label: string
}

export interface Countdown {
  id: string
  name: string
  date: string // YYYY-MM-DD
}

/** log = local YYYY-MM-DD keys, days marked done. Unordered-tolerant and
 *  duplicate-tolerant — src/lib/habits.ts reads it via Set membership, never
 *  by position. Capped at 6 habits at the UI boundary; tolerated structurally
 *  (an imported backup over the cap is not rejected here). */
export interface Habit {
  id: string
  name: string
  createdAt: number
  log: string[]
}

export interface AuroraData {
  settings: Settings
  focus: Focus | null
  todoLists: TodoList[]
  links: QuickLink[]
  timerConfig: TimerConfig
  photoPrefs: PhotoPrefs
  location: StoredLocation | null
  weatherCache: WeatherSnapshot | null
  notes: Notes
  worldClocks: WorldClock[]
  countdowns: Countdown[]
  layout: Layout
  connectors: Partial<Record<ConnectorId, ConnectorConfig>>
  connectorSnapshots: Partial<Record<ConnectorId, ConnectorSnapshot>>
  habits: Habit[]
}

export type DataKey = keyof AuroraData

export function defaults(): AuroraData {
  return {
    settings: {
      name: '',
      use24Hour: false,
      panelColor: null,
      units: 'metric',
      muted: false,
      widgets: {
        search: true,
        weather: true,
        links: true,
        todo: true,
        timer: false,
        quote: true,
        bookmarks: false,
        notes: true,
        clocks: false,
        countdown: false,
        habits: false,
        monthCal: false,
      },
    },
    focus: null,
    todoLists: [],
    links: [],
    timerConfig: { workMinutes: 25, breakMinutes: 5 },
    photoPrefs: { mode: 'auto', index: 0, lastRotated: '' },
    location: null,
    weatherCache: null,
    notes: { text: '', updatedAt: 0 },
    worldClocks: [],
    countdowns: [],
    layout: {},
    connectors: {},
    connectorSnapshots: {},
    habits: [],
  }
}
