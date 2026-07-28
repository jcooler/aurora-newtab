// src/lib/backup.ts — JSON export/import envelope for a full data backup.
// parseBackup deliberately stays version-agnostic: it hands the caller back
// the raw stored `version` alongside the raw `data` so migration (which
// knows how to walk old snapshots forward) stays the caller's job, not this
// module's. That's why the success shape is `{ data, version }` rather than
// an already-migrated `AuroraData`.
import { CURRENT_VERSION, defaults, type AuroraData, type DataKey } from './storage/schema'

const APP_ID = 'aurora'

export interface BackupEnvelope {
  app: typeof APP_ID
  version: number
  exportedAt: string
  data: AuroraData
}

export type ParseBackupResult =
  | { ok: true; data: Record<string, unknown>; version: number }
  | { ok: false; reason: string }

export function serializeBackup(data: AuroraData): string {
  const envelope: BackupEnvelope = {
    app: APP_ID,
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }
  return JSON.stringify(envelope, null, 2)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseBackup(raw: string): ParseBackupResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: "That file isn't valid JSON." }
  }

  // A non-object root (array, string, number, null) can never carry `app`,
  // so it's rejected the same way a wrong/missing `app` field is.
  const envelope = isPlainObject(parsed) ? parsed : {}
  if (envelope.app !== APP_ID) {
    return { ok: false, reason: "That file isn't an Aurora backup." }
  }

  const version = envelope.version
  if (version === undefined) {
    return { ok: false, reason: 'That backup is missing its version number.' }
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: "That backup's version number is invalid." }
  }
  if (version > CURRENT_VERSION) {
    return { ok: false, reason: 'That backup is newer than this Aurora — update the extension first.' }
  }

  if (!isPlainObject(envelope.data)) {
    return { ok: false, reason: 'That backup has no data to restore.' }
  }

  return { ok: true, data: envelope.data, version }
}

// --- validateBackupShape -----------------------------------------------
// parseBackup only validates the envelope. A hand-edited (or corrupted)
// backup can still carry e.g. `"settings": "oops"` past that check and past
// migrate() (which is a no-op once the version already matches CURRENT_VERSION),
// and get written to storage verbatim — which then throws at render time
// deep inside always-mounted UI. Each known DataKey gets its own structural
// check here, run AFTER migrate() so older-version backups are upgraded
// before their shape is judged.
//
// These checks are deliberately structural only (plain object vs array vs
// primitive types of the right kind) — not business-rule validation (e.g.
// enum membership for `theme` or `searchEngine`). That mirrors what
// `defaults()` in storage/schema.ts documents as the expected shape.

function isString(v: unknown): v is string {
  return typeof v === 'string'
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number'
}
function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean'
}
function isOptional(v: unknown, pred: (v: unknown) => boolean): boolean {
  return v === undefined || pred(v)
}

const WIDGET_KEYS = Object.keys(defaults().settings.widgets) as (keyof AuroraData['settings']['widgets'])[]

function isWidgetToggles(v: unknown): boolean {
  return isPlainObject(v) && WIDGET_KEYS.every((k) => isBoolean(v[k]))
}

function isSettings(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  return (
    isString(v.name) &&
    isBoolean(v.use24Hour) &&
    isString(v.theme) &&
    isString(v.units) &&
    isString(v.searchEngine) &&
    isBoolean(v.muted) &&
    isWidgetToggles(v.widgets)
  )
}

function isFocus(v: unknown): boolean {
  if (v === null) return true
  return isPlainObject(v) && isString(v.text) && isString(v.date) && isBoolean(v.done)
}

function isTodoItem(v: unknown): boolean {
  return isPlainObject(v) && isString(v.id) && isString(v.text) && isBoolean(v.done)
}
function isTodoLists(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every(
      (item) =>
        isPlainObject(item) &&
        isString(item.id) &&
        isString(item.name) &&
        Array.isArray(item.items) &&
        item.items.every(isTodoItem),
    )
  )
}

function isLinks(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every((item) => isPlainObject(item) && isString(item.id) && isString(item.title) && isString(item.url))
  )
}

function isTimerConfig(v: unknown): boolean {
  return isPlainObject(v) && isNumber(v.workMinutes) && isNumber(v.breakMinutes)
}

function isPhotoPrefs(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  return (
    isString(v.mode) &&
    isNumber(v.index) &&
    isString(v.lastRotated) &&
    isOptional(v.uploadedAt, isString)
  )
}

function isLocation(v: unknown): boolean {
  if (v === null) return true
  return isPlainObject(v) && isNumber(v.lat) && isNumber(v.lon) && isString(v.label) && isBoolean(v.manual)
}

function isCurrentWeather(v: unknown): boolean {
  return (
    isPlainObject(v) &&
    isNumber(v.tempC) &&
    isNumber(v.feelsLikeC) &&
    isNumber(v.code) &&
    isNumber(v.windKmh) &&
    isNumber(v.humidity) &&
    isOptional(v.isDay, isBoolean)
  )
}

function isHourlyPoint(v: unknown): boolean {
  return (
    isPlainObject(v) &&
    isString(v.time) &&
    isNumber(v.tempC) &&
    isNumber(v.precipProb) &&
    isNumber(v.code) &&
    isOptional(v.isDay, isBoolean)
  )
}

function isWeatherCache(v: unknown): boolean {
  if (v === null) return true
  if (!isPlainObject(v)) return false
  return (
    isCurrentWeather(v.current) &&
    Array.isArray(v.hourly) &&
    v.hourly.every(isHourlyPoint) &&
    isNumber(v.fetchedAt) &&
    isString(v.locationLabel) &&
    isOptional(v.sunriseISO, isString) &&
    isOptional(v.sunsetISO, isString)
  )
}

function isNotes(v: unknown): boolean {
  return isPlainObject(v) && isString(v.text) && isNumber(v.updatedAt)
}

function isWorldClocks(v: unknown): boolean {
  return Array.isArray(v) && v.every((item) => isPlainObject(item) && isString(item.zone) && isString(item.label))
}

function isCountdowns(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every((item) => isPlainObject(item) && isString(item.id) && isString(item.name) && isString(item.date))
  )
}

const VALIDATORS: Record<DataKey, (v: unknown) => boolean> = {
  settings: isSettings,
  focus: isFocus,
  todoLists: isTodoLists,
  links: isLinks,
  timerConfig: isTimerConfig,
  photoPrefs: isPhotoPrefs,
  location: isLocation,
  weatherCache: isWeatherCache,
  notes: isNotes,
  worldClocks: isWorldClocks,
  countdowns: isCountdowns,
}

const DATA_KEYS = Object.keys(defaults()) as DataKey[]

export type ValidateShapeResult =
  | { ok: true; data: AuroraData }
  | { ok: false; reason: string }

/**
 * Per-key structural check of an already-migrated backup. Only the known
 * `DataKey`s are read out and returned — any other top-level key in `data`
 * (e.g. a stray field a hand-edited file added) is silently dropped rather
 * than carried through to what gets written to storage.
 */
export function validateBackupShape(data: AuroraData): ValidateShapeResult {
  const source = data as unknown as Record<string, unknown>
  const cleaned = {} as Record<string, unknown>
  for (const key of DATA_KEYS) {
    const value = source[key]
    if (!VALIDATORS[key](value)) {
      return { ok: false, reason: `That backup's "${key}" data is invalid.` }
    }
    cleaned[key] = value
  }
  return { ok: true, data: cleaned as unknown as AuroraData }
}
