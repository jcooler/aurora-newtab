import { emptyLayoutV3, type StoredLayout } from '../layout/canvasTypes'
import type { CalendarLayoutPreferences, CalendarWeekStart, LayoutsDocument } from '../layout/namedLayouts'
import type { LayoutDensityPreference } from '../layout/types'
import type { ConnectorConfig, ConnectorId, ConnectorSnapshot } from '../../services/connectors/types'

export const CURRENT_VERSION = 16

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
  sun: boolean
  moon: boolean
  readingList: boolean
  recentlyClosed: boolean
  downloads: boolean
  tabGroups: boolean
}

export interface Settings {
  name: string
  use24Hour: boolean
  /** Opt-in Canvas briefing. Missing remains equivalent to false so existing
   *  settings load without a migration or eager rewrite. */
  briefingEnabled?: boolean
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
  /** Appearance ink overrides (owner-approved 2026-08-18 color system, all
   *  `null` = auto). Nested Settings fields, so per the STANDING RULE above
   *  they shipped WITH the v13->v14 bump, migrations[13], the
   *  METADATA_ONLY_FLOOR move to 14, and backup isSettings coverage.
   *  widgetTextColor re-inks every panel surface (--fg; muted derives at 68%
   *  alpha — DERIVED from the pick, never tuned to any one panel color);
   *  photoTextColor re-inks text on the photograph (--canvas-fg via the
   *  --photo-ink chain); the three per-element overrides beat photoTextColor
   *  for their own block only. */
  widgetTextColor: string | null
  photoTextColor: string | null
  photoClockColor: string | null
  photoGreetingColor: string | null
  photoQuoteColor: string | null
  units: 'metric' | 'imperial'
  muted: boolean
  /** Independent Adaptive Stage preference. Auto Fit resolves the roomiest
   *  density that keeps automatic items on the board; manual choices persist
   *  unchanged across placement resets. */
  layoutDensity: LayoutDensityPreference
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

/** One persisted timer authority shared by the dashboard Timer and Flow.
 *  `endsAt` is the running phase's absolute deadline; paused sessions retain
 *  `remainingMs` instead. `null` at the AuroraData key is the canonical idle,
 *  non-Flow state. */
export interface TimerSession {
  mode: 'work' | 'break'
  running: boolean
  endsAt: number | null
  remainingMs: number
  cycles: number
  flow: boolean
}

export interface PhotoPrefs {
  // 'apod' (Task 96): NASA's Astronomy Picture of the Day — the fourth
  // source, sitting alongside auto/upload/gradient. Its own cache lives in
  // AuroraData.apodCache below (a top-level key, not nested here), keyed by
  // LOCAL day rather than the index/lastRotated rotation pair the other two
  // photo modes share — a single daily photo has nothing to rotate through.
  mode: 'auto' | 'upload' | 'gradient' | 'apod'
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
  /** Meteorological bearing in degrees — the direction the wind blows FROM.
   *  Optional: caches captured before this field was requested remain
   *  valid, and the widget simply omits the compass point for them. */
  windDirection?: number
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

export type PollenSpecies = 'alder' | 'birch' | 'grass' | 'mugwort' | 'olive' | 'ragweed'

export interface PollenReading {
  species: PollenSpecies
  grainsPerCubicMeter: number
}

export type WeatherPollenSnapshot =
  | { status: 'available'; readings: PollenReading[] }
  | { status: 'unavailable' }

export type WeatherEnvironmentSnapshot =
  | {
      requestIdentity: string
      fetchedAt: number
      status: 'available'
      usAqi: number | null
      uvIndex: number | null
      pollen: WeatherPollenSnapshot
    }
  | {
      requestIdentity: string
      fetchedAt: number
      status: 'unavailable'
      usAqi: null
      uvIndex: null
      pollen: { status: 'unavailable' }
    }

export interface WeatherSnapshot {
  current: CurrentWeather
  hourly: HourlyPoint[] // next ~12h
  fetchedAt: number // epoch ms
  locationLabel: string
  /** Versioned normalized provider request identity. Legacy caches omit this
   *  and remain parseable, but are never reusable by the Weather hook. */
  requestIdentity?: string
  sunriseISO?: string
  sunsetISO?: string
  /** Separately identified optional provider leg. Pre-enrichment caches omit
   *  it and remain usable for forecast display while the hook self-heals. */
  environment?: WeatherEnvironmentSnapshot
}

export type WeatherAlertSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown'

export interface WeatherAlert {
  id: string
  event: string
  severity: WeatherAlertSeverity
  urgency: string
  headline: string
  areaDescription: string
  effective: string | null
  onset: string | null
  expires: string | null
  description: string
  instruction: string
}

/** Independent five-minute NWS enrichment. It is intentionally separate from
 *  WeatherSnapshot because alert coverage, failure, and freshness must never
 *  suppress the useful Open-Meteo forecast or environmental data. */
export interface WeatherAlertCache {
  requestIdentity: string
  fetchedAt: number
  status: 'supported' | 'unsupported'
  alerts: WeatherAlert[]
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

/** One APOD (Astronomy Picture of the Day) photo, already validated down to
 *  exactly what the widget needs to render — see src/services/apod.ts's
 *  fetchApod for the parsing/host-validation contract that produces this
 *  shape. `copyright` is present only when NASA's response carried a
 *  non-empty one after whitespace-trimming (the API pads the field with
 *  newlines). */
export interface ApodPhoto {
  url: string
  title: string
  copyright?: string
}

/** The daily APOD cache: `date` is the LOCAL day the extension last
 *  attempted a fetch (not necessarily NASA's own `date` field in the
 *  response), so a second render on the same day trusts the cache instead of
 *  re-fetching. `photo: null` means that day's attempt was made and failed
 *  (rate limit, network, a non-image APOD, ...) — a fallback day, not an
 *  error; Task 96's render side is the one that decides what a null photo
 *  falls back to. */
export interface ApodCache {
  date: string
  photo: ApodPhoto | null
}

export interface AuroraData {
  settings: Settings
  focus: Focus | null
  todoLists: TodoList[]
  links: QuickLink[]
  timerConfig: TimerConfig
  timerSession: TimerSession | null
  photoPrefs: PhotoPrefs
  location: StoredLocation | null
  weatherCache: WeatherSnapshot | null
  weatherAlertCache: WeatherAlertCache | null
  notes: Notes
  worldClocks: WorldClock[]
  countdowns: Countdown[]
  layout: StoredLayout
  /** Named-layouts document (NL-P1, 2026-08-17 named-layouts design spec §4).
   *  A TOP-LEVEL key: like apodCache, missing values are backfilled by
   *  migrate()'s default-merge, so no data-rewriting migration step exists
   *  (migrations[12] is the identity and live init stamps only the version).
   *  `null` means the user has never explicitly saved a layouts document; the
   *  runtime derives an in-memory "My layout" from the legacy `layout` key
   *  (lib/layout/myLayoutAdapter.ts) and MUST NOT write it at boot. The
   *  legacy `layout` key above stays byte-for-byte as recovery input and is
   *  never written by named-layouts code. */
  layouts: LayoutsDocument | null
  /** Presentation-only Calendar choices keyed by stable named-layout id.
   *  Separate from `layouts` so ordinary Agenda/Month switching never writes
   *  placement geometry or bypasses edit-mode Save/Cancel. */
  calendarPreferences: CalendarLayoutPreferences
  /** Global Calendar convention; top-level so old stores default safely. */
  calendarWeekStart: CalendarWeekStart
  connectors: Partial<Record<ConnectorId, ConnectorConfig>>
  connectorSnapshots: Partial<Record<ConnectorId, ConnectorSnapshot>>
  habits: Habit[]
  // apodCache (Task 95): a top-level key, so it needs neither a
  // CURRENT_VERSION bump nor a new migrations.ts step — migrate()'s own
  // contract comment on its final default-merge covers exactly this case:
  // "the default-merge below backfills MISSING TOP-LEVEL KEYS ONLY". An
  // existing user's stored snapshot simply won't have this key yet, and the
  // merge backfills it to `null` on load, the same way connectors/
  // connectorSnapshots (v4->v5) and habits (v5->v6) were backfilled before
  // either needed its own dedicated migration step.
  apodCache: ApodCache | null
}

export type DataKey = keyof AuroraData

export function defaults(): AuroraData {
  return {
    settings: {
      name: '',
      use24Hour: false,
      panelColor: null,
      widgetTextColor: null,
      photoTextColor: null,
      photoClockColor: null,
      photoGreetingColor: null,
      photoQuoteColor: null,
      units: 'metric',
      muted: false,
      layoutDensity: 'auto',
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
        sun: false,
        moon: false,
        readingList: false,
        recentlyClosed: false,
        downloads: false,
        tabGroups: false,
      },
    },
    focus: null,
    todoLists: [],
    links: [],
    timerConfig: { workMinutes: 25, breakMinutes: 5 },
    timerSession: null,
    photoPrefs: { mode: 'auto', index: 0, lastRotated: '' },
    location: null,
    weatherCache: null,
    weatherAlertCache: null,
    notes: { text: '', updatedAt: 0 },
    worldClocks: [],
    countdowns: [],
    layout: emptyLayoutV3(),
    layouts: null,
    calendarPreferences: {},
    calendarWeekStart: 'locale',
    connectors: {},
    connectorSnapshots: {},
    habits: [],
    apodCache: null,
  }
}
