// src/lib/backup.ts — JSON export/import envelope for a full data backup.
// parseBackup deliberately stays version-agnostic: it hands the caller back
// the raw stored `version` alongside the raw `data` so migration (which
// knows how to walk old snapshots forward) stays the caller's job, not this
// module's. That's why the success shape is `{ data, version }` rather than
// an already-migrated `AuroraData`.
import { CURRENT_VERSION, defaults, type AuroraData, type DataKey } from './storage/schema'
import { isPlainObject } from './object'
import { BLOCK_IDS, type BlockId, type Layout } from './layout/types'
import { CONNECTOR_IDS, type ConnectorConfig, type ConnectorDescriptor, type ConnectorId } from '../services/connectors/types'
import { CONNECTORS } from '../services/connectors/registry'

const APP_ID = 'aurora'

export interface BackupEnvelope {
  app: typeof APP_ID
  version: number
  exportedAt: string
  // connectorSnapshots is cache, not user data — deliberately excluded from
  // every export (smaller files, and one less validator surface on import:
  // see validateBackupShape's matching never-trust-it-on-import handling
  // below). `connectors` (user-chosen config) IS exported, minus anything a
  // connector's registry descriptor lists in `secretFields`.
  data: Omit<AuroraData, 'connectorSnapshots'>
}

export type ParseBackupResult =
  | { ok: true; data: Record<string, unknown>; version: number }
  | { ok: false; reason: string }

/** Returns a new connectors map with every field a connector's descriptor
 *  lists in `secretFields` removed — the single source of truth is the
 *  registry (no local secret list to keep in sync). RSS declares none today,
 *  so this is an identity over its config; the first secret-bearing connector
 *  only adds `secretFields` to its descriptor, nothing here changes.
 *
 *  Never mutates its input — `data.connectors` is what's actually sitting in
 *  storage and must survive an export untouched (each stripped entry is a fresh
 *  clone). `descriptors` is a test-only injection seam defaulting to CONNECTORS;
 *  production always uses the real registry. */
export function stripSecrets(
  connectors: AuroraData['connectors'],
  descriptors: readonly ConnectorDescriptor[] = CONNECTORS,
): AuroraData['connectors'] {
  const result: AuroraData['connectors'] = {}
  for (const id of Object.keys(connectors) as ConnectorId[]) {
    const config = connectors[id]
    if (!config) continue
    const secretFields = descriptors.find((d) => d.id === id)?.secretFields
    if (!secretFields || secretFields.length === 0) {
      result[id] = config
      continue
    }
    // Clone as Partial so `delete` is legal (optional keys) with no cast at the
    // delete site; one honest Partial->full assertion at assignment. No
    // `as unknown as` round trip — the export intentionally emits a config
    // shorn of its secret fields, and this is the single place that states it.
    const clone: Partial<ConnectorConfig> = { ...config }
    for (const field of secretFields) delete clone[field]
    result[id] = clone as ConnectorConfig
  }
  return result
}

export function serializeBackup(data: AuroraData): string {
  const { connectorSnapshots: _connectorSnapshots, ...rest } = data
  const envelope: BackupEnvelope = {
    app: APP_ID,
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    data: { ...rest, connectors: stripSecrets(data.connectors) },
  }
  return JSON.stringify(envelope, null, 2)
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
// enum membership for `theme`). That mirrors what `defaults()` in
// storage/schema.ts documents as the expected shape.

function isString(v: unknown): v is string {
  return typeof v === 'string'
}
// Number.isFinite (not a bare typeof check) rejects NaN and +/-Infinity too:
// JSON can't encode NaN at all, but an oversized numeric literal (e.g.
// `1e400`) parses to Infinity and would otherwise sail through as a
// syntactically-valid "number" straight into e.g. timerConfig.workMinutes.
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
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
    // No searchEngine check here anymore (Red Argon remediation): the field
    // is gone from Settings entirely, and migrate()'s v3->v4 step strips it
    // from any older backup BEFORE this validator ever runs (see
    // storage/migrations.ts's step 3, and validateBackupShape's own doc
    // comment below for why migration always runs first).
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

function isBlockPos(v: unknown): boolean {
  return isPlainObject(v) && isNumber(v.x) && isNumber(v.y)
}

// Structural only: every entry must be a finite {x,y} pair. Unknown block ids
// (keys outside BLOCK_IDS) are NOT rejected here — they're silently dropped
// later in the cleaned-assembly step below, matching the unknown-top-level-key
// convention rather than failing the whole import.
function isLayout(v: unknown): boolean {
  return isPlainObject(v) && Object.values(v).every(isBlockPos)
}

// Structural only, same restraint as every other validator here: just
// `enabled` (a boolean every ConnectorConfig has), not per-connector fields
// like RssConfig.feeds — those are the service boundary's job, not a
// generic backup-shape check's.
function isConnectorConfig(v: unknown): boolean {
  return isPlainObject(v) && isBoolean(v.enabled)
}

function isConnectors(v: unknown): boolean {
  return isPlainObject(v) && Object.values(v).every(isConnectorConfig)
}

const VALIDATORS: Record<Exclude<DataKey, 'connectorSnapshots'>, (v: unknown) => boolean> = {
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
  layout: isLayout,
  connectors: isConnectors,
}

const BLOCK_ID_SET: ReadonlySet<string> = new Set(BLOCK_IDS)

/** Drops any layout entry whose key isn't a known BlockId. */
function cleanLayout(v: unknown): Layout {
  const layout = v as Layout
  const cleaned: Layout = {}
  for (const id of Object.keys(layout) as BlockId[]) {
    if (BLOCK_ID_SET.has(id)) cleaned[id] = layout[id]
  }
  return cleaned
}

const CONNECTOR_ID_SET: ReadonlySet<string> = new Set(CONNECTOR_IDS)

/** Drops any connector entry whose key isn't a known ConnectorId — same
 *  unknown-key convention as cleanLayout's unknown block ids. */
function cleanConnectors(v: unknown): AuroraData['connectors'] {
  const connectors = v as Record<string, ConnectorConfig>
  const cleaned: AuroraData['connectors'] = {}
  for (const id of Object.keys(connectors) as ConnectorId[]) {
    if (CONNECTOR_ID_SET.has(id)) cleaned[id] = connectors[id]
  }
  return cleaned
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
    // connectorSnapshots is cache, not user data (see serializeBackup's doc
    // comment): never trusted from an import, always reset to empty
    // regardless of what — if anything — is present for this key. No
    // validator needed; it's simply never read.
    if (key === 'connectorSnapshots') {
      cleaned[key] = {}
      continue
    }
    const value = source[key]
    if (!VALIDATORS[key](value)) {
      return { ok: false, reason: `That backup's "${key}" data is invalid.` }
    }
    // Known block/connector ids pass VALIDATORS as-is; unknown ones (extra
    // keys inside an otherwise-valid layout/connectors object) are dropped
    // here, matching the unknown-top-level-key convention above rather than
    // failing the import.
    cleaned[key] =
      key === 'layout' ? cleanLayout(value) : key === 'connectors' ? cleanConnectors(value) : value
  }
  return { ok: true, data: cleaned as unknown as AuroraData }
}
