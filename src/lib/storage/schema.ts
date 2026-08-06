import type { Layout } from '../layout/types'

export const CURRENT_VERSION = 4

export type ThemeId = 'glass' | 'mono' | 'aurora'

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
}

export interface Settings {
  name: string
  use24Hour: boolean
  theme: ThemeId
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
}

export type DataKey = keyof AuroraData

export function defaults(): AuroraData {
  return {
    settings: {
      name: '',
      use24Hour: false,
      theme: 'aurora',
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
  }
}
