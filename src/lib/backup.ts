// src/lib/backup.ts — JSON export/import envelope for a full data backup.
// parseBackup deliberately stays version-agnostic: it hands the caller back
// the raw stored `version` alongside the raw `data` so migration (which
// knows how to walk old snapshots forward) stays the caller's job, not this
// module's. That's why the success shape is `{ data, version }` rather than
// an already-migrated `AuroraData`.
import { CURRENT_VERSION, defaults, type AuroraData, type DataKey } from './storage/schema'
import { isPlainObject } from './object'
import { isPanelColor } from './color'
import { LAYOUT_DENSITY_PREFERENCES } from './layout/types'
import { cleanStoredLayout, type StoredLayout } from './layout/canvasTypes'
import { LegacyLayoutValidationError } from './layout/v2'
import { CONNECTOR_IDS, type ConnectorConfig, type ConnectorDescriptor, type ConnectorId } from '../services/connectors/types'
import { CONNECTORS } from '../services/connectors/registry'
import { ownedOriginPatterns } from '../services/originOwnership'
import { migrate } from './storage/migrations'
import { isSafeQuickLinkUrl } from './quickLinkUrl'

const APP_ID = 'aurora'
export const BACKUP_REDACTION_NOTICE = 'Connector secrets and capability URLs were not included. Re-enter them after restore.' as const

export interface BackupRedactions {
  reentryRequired: ConnectorId[]
  notice: typeof BACKUP_REDACTION_NOTICE
}

export interface BackupEnvelope {
  app: typeof APP_ID
  version: number
  exportedAt: string
  redactions: BackupRedactions
  // connectorSnapshots and apodCache are both cache, not user data —
  // deliberately excluded from every export (smaller files, and one less
  // validator surface on import: see validateBackupShape's matching
  // never-trust-it-on-import handling below). `connectors` (user-chosen
  // config) IS exported, minus anything a connector's registry descriptor
  // lists in `secretFields`.
  data: Omit<AuroraData, 'connectorSnapshots' | 'apodCache'>
}

export type ParseBackupResult =
  | {
      ok: true
      data: Record<string, unknown>
      version: number
      exportedAt?: string
      redactionsPresent: boolean
      redactions: BackupRedactions
    }
  | { ok: false; reason: string }

export type PrepareBackupResult =
  | {
      ok: true
      data: AuroraData
      exportedAt?: string
      redactions: BackupRedactions
      legacyReentryMayBeRequired: boolean
      requiredOrigins: string[]
    }
  | { ok: false; reason: string }

/** Returns a new connectors map with every field a connector's descriptor
 *  lists in `secretFields` removed — the single source of truth is the
 *  registry (no local secret list to keep in sync). Capability-URL connectors
 *  can additionally use `redactForBackup` for nested or whole-list values;
 *  RSS and Calendar both use that second-stage policy today.
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

function descriptorFor(id: ConnectorId, descriptors: readonly ConnectorDescriptor[] = CONNECTORS): ConnectorDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.id === id)
}

function redactConnectorConfig(config: ConnectorConfig, descriptor: ConnectorDescriptor | undefined): ConnectorConfig {
  const clone: Partial<ConnectorConfig> = { ...config }
  for (const field of descriptor?.secretFields ?? []) delete clone[field]
  const redacted = descriptor?.redactForBackup?.(clone as ConnectorConfig) ?? clone
  return { ...redacted } as ConnectorConfig
}

/** Produces a new exportable data object and trusted reconnect metadata.
 *  Neither the stored configs nor their nested config values are mutated. */
export function redactBackupData(data: AuroraData): { data: BackupEnvelope['data']; redactions: BackupRedactions } {
  const connectors: AuroraData['connectors'] = {}
  for (const id of Object.keys(data.connectors) as ConnectorId[]) {
    const config = data.connectors[id]
    if (!config) continue
    connectors[id] = redactConnectorConfig(config, descriptorFor(id))
  }
  const { connectorSnapshots: _connectorSnapshots, apodCache: _apodCache, ...rest } = data
  const redactedData = { ...rest, connectors }
  return {
    data: redactedData,
    redactions: {
      reentryRequired: requiredReentryConnectorIds(connectors, undefined, true),
      notice: BACKUP_REDACTION_NOTICE,
    },
  }
}

export function serializeBackup(data: AuroraData): string {
  const redacted = redactBackupData(data)
  const envelope: BackupEnvelope = {
    app: APP_ID,
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    redactions: redacted.redactions,
    data: redacted.data,
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

  const exportedAt = envelope.exportedAt
  if (exportedAt !== undefined) {
    if (typeof exportedAt !== 'string') return { ok: false, reason: "That backup's export date is invalid." }
    try {
      if (new Date(exportedAt).toISOString() !== exportedAt) return { ok: false, reason: "That backup's export date is invalid." }
    } catch {
      return { ok: false, reason: "That backup's export date is invalid." }
    }
  }

  const redactionsPresent = Object.prototype.hasOwnProperty.call(envelope, 'redactions')
  if (!redactionsPresent) {
    return { ok: true, data: envelope.data, version, exportedAt, redactionsPresent: false, redactions: { reentryRequired: [], notice: BACKUP_REDACTION_NOTICE } }
  }
  const redactions = envelope.redactions
  if (!isValidBackupRedactions(redactions)) return { ok: false, reason: "That backup's redaction metadata is invalid." }
  return { ok: true, data: envelope.data, version, exportedAt, redactionsPresent: true, redactions }
}

function isValidBackupRedactions(value: unknown): value is BackupRedactions {
  if (!isPlainObject(value) || Object.keys(value).length !== 2 || value.notice !== BACKUP_REDACTION_NOTICE || !Array.isArray(value.reentryRequired)) return false
  const seen = new Set<string>()
  for (const id of value.reentryRequired) {
    if (typeof id !== 'string' || !CONNECTOR_IDS.includes(id as ConnectorId) || seen.has(id)) return false
    seen.add(id)
  }
  return true
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
const LAYOUT_DENSITY_SET: ReadonlySet<unknown> = new Set(LAYOUT_DENSITY_PREFERENCES)

// Deliberately strict on purpose (not defensive-loosened to "extra keys ok,
// missing keys default"): requiring EVERY known widget key present as a
// boolean is the tripwire that catches a widget toggle shipped without its
// CURRENT_VERSION bump + migration step (see WidgetToggles' own doc comment
// in schema.ts) — a backup missing a key fails validation loudly here
// instead of silently importing with that toggle undefined.
function isWidgetToggles(v: unknown): boolean {
  return isPlainObject(v) && WIDGET_KEYS.every((k) => isBoolean(v[k]))
}

function isSettings(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  return (
    isString(v.name) &&
    isBoolean(v.use24Hour) &&
    // panelColor (Task 60) is `null` or a `#rrggbb` hex; anything else (a named
    // color like 'red', a short #fff, a non-string) rejects the whole settings
    // key, per the structural convention. `theme` is NOT checked here anymore:
    // it's gone from Settings entirely, and migrate()'s v7->v8 step strips it
    // from any older backup BEFORE this validator runs — the same
    // migrate-then-validate order the retired `searchEngine` field relied on
    // (see migrations.ts step 7, and validateBackupShape's doc comment below).
    (v.panelColor === null || isPanelColor(v.panelColor)) &&
    isString(v.units) &&
    isBoolean(v.muted) &&
    LAYOUT_DENSITY_SET.has(v.layoutDensity) &&
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
    v.every(
      (item) =>
        isPlainObject(item) &&
        isString(item.id) &&
        isString(item.title) &&
        isString(item.url) &&
        isSafeQuickLinkUrl(item.url),
    )
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
  return (
    isPlainObject(v) &&
    isNumber(v.lat) &&
    v.lat >= -90 &&
    v.lat <= 90 &&
    isNumber(v.lon) &&
    v.lon >= -180 &&
    v.lon <= 180 &&
    isString(v.label) &&
    isBoolean(v.manual)
  )
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
    isOptional(v.requestIdentity, isString) &&
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

function isLayout(v: unknown): boolean {
  try {
    cleanLayout(v)
    return true
  } catch {
    return false
  }
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

// Habits gets its own, more lenient top-level check than e.g. isTodoLists:
// only the container shape (an array) is validated here. Individual rows
// (and log entries within a row) are validated and dropped one at a time by
// cleanHabits below, rather than failing the whole import — a single
// corrupted habit shouldn't cost the user every other one.
function isHabits(v: unknown): boolean {
  return Array.isArray(v)
}

const VALIDATORS: Record<Exclude<DataKey, 'connectorSnapshots' | 'apodCache'>, (v: unknown) => boolean> = {
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
  habits: isHabits,
}

/** Strictly validates V1/V2/V3 known members while dropping future ids. */
function cleanLayout(v: unknown): StoredLayout {
  return cleanStoredLayout(v)
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

const LOG_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Drops any habit row with a non-string id/name or non-array log entirely
 *  (isHabits above only confirmed the container is an array — row shape is
 *  this function's job); a surviving row's log is filtered down to
 *  well-formed date-key entries one at a time, same restraint as
 *  cleanLayout/cleanConnectors: never throw, drop the bad part, keep the
 *  rest. createdAt isn't part of the drop criteria (not user-facing
 *  identity like id/name) — a malformed value falls back to 0 rather than
 *  losing the whole row. */
function cleanHabits(v: unknown): AuroraData['habits'] {
  const rows = v as unknown[]
  const cleaned: AuroraData['habits'] = []
  for (const row of rows) {
    if (!isPlainObject(row)) continue
    const { id, name, createdAt, log } = row
    if (!isString(id) || !isString(name) || !Array.isArray(log)) continue
    cleaned.push({
      id,
      name,
      createdAt: isNumber(createdAt) ? createdAt : 0,
      log: log.filter((entry): entry is string => isString(entry) && LOG_KEY_RE.test(entry)),
    })
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
    // connectorSnapshots and apodCache are both cache, not user data (see
    // serializeBackup's doc comment): neither is ever trusted from an
    // import, both are always reset regardless of what — if anything — is
    // present for the key. No validator needed for either; they're simply
    // never read. Their "empty" values differ by shape: connectorSnapshots
    // is a Partial<Record<...>> (empty object), apodCache is a nullable
    // single value (null) — see schema.ts's AuroraData.apodCache/defaults().
    if (key === 'connectorSnapshots') {
      cleaned[key] = {}
      continue
    }
    if (key === 'apodCache') {
      cleaned[key] = null
      continue
    }
    const value = source[key]
    if (!VALIDATORS[key](value)) {
      return { ok: false, reason: `That backup's "${key}" data is invalid.` }
    }
    // Known block/connector ids pass VALIDATORS as-is; unknown ones (extra
    // keys inside an otherwise-valid layout/connectors object) are dropped
    // here, matching the unknown-top-level-key convention above rather than
    // failing the import. habits follows the same drop-rather-than-fail
    // spirit, but per malformed ROW (and per malformed log entry within an
    // otherwise-valid row) rather than by a fixed id whitelist — see
    // cleanHabits.
    cleaned[key] =
      key === 'layout'
        ? cleanLayout(value)
        : key === 'connectors'
          ? cleanConnectors(value)
          : key === 'habits'
            ? cleanHabits(value)
            : value
  }
  return { ok: true, data: cleaned as unknown as AuroraData }
}

function hasNonEmptyString(config: ConnectorConfig, field: string): boolean {
  const value = Reflect.get(config, field)
  return typeof value === 'string' && value !== ''
}

function reentryIsRequired(descriptor: ConnectorDescriptor, config: ConnectorConfig): boolean {
  try {
    if (descriptor.backupReentryRequired) return descriptor.backupReentryRequired(config) === true
    if (!descriptor.identityField || descriptor.secretFields.length === 0) return false
    return hasNonEmptyString(config, descriptor.identityField) && descriptor.secretFields.some((field) => !hasNonEmptyString(config, field))
  } catch {
    return false
  }
}

function isAmbiguousLegacyReentry(descriptor: ConnectorDescriptor, config: ConnectorConfig): boolean {
  return !descriptor.identityField && descriptor.secretFields.length > 0 && reentryIsRequired(descriptor, config)
}

/** Derives only registry-trusted reconnect ids. Legacy envelopes without
 * metadata may identify the unambiguous identity-plus-missing-token shape,
 * but never name a no-identity capability connector from an ambiguous shell. */
export function requiredReentryConnectorIds(
  connectors: AuroraData['connectors'],
  declaredIds?: readonly ConnectorId[],
  metadataPresent = false,
): ConnectorId[] {
  const detected: ConnectorId[] = []
  for (const descriptor of CONNECTORS) {
    const config = connectors[descriptor.id]
    if (!config) continue
    const required = metadataPresent
      ? reentryIsRequired(descriptor, config)
      : Boolean(descriptor.identityField) && reentryIsRequired(descriptor, config)
    if (required) detected.push(descriptor.id)
  }

  if (metadataPresent && declaredIds) {
    for (const id of declaredIds) {
      if (!detected.includes(id)) throw new Error('inconsistent redaction metadata')
    }
  }
  return detected
}

export function prepareBackup(raw: string): PrepareBackupResult {
  const parsed = parseBackup(raw)
  if (!parsed.ok) return parsed

  let migrated: AuroraData
  try {
    migrated = migrate(parsed.data, parsed.version)
  } catch (error) {
    if (error instanceof LegacyLayoutValidationError) {
      return { ok: false, reason: 'That backup\'s "layout" data is invalid.' }
    }
    return { ok: false, reason: 'That backup cannot be migrated by this Aurora version.' }
  }

  const shape = validateBackupShape(migrated)
  if (!shape.ok) return shape

  let requiredIds: ConnectorId[]
  try {
    requiredIds = requiredReentryConnectorIds(
      shape.data.connectors,
      parsed.redactionsPresent ? parsed.redactions.reentryRequired : undefined,
      parsed.redactionsPresent,
    )
  } catch {
    return { ok: false, reason: "That backup's redaction metadata is invalid." }
  }

  const legacyReentryMayBeRequired = !parsed.redactionsPresent && CONNECTORS.some((descriptor) => {
    const config = shape.data.connectors[descriptor.id]
    return config ? isAmbiguousLegacyReentry(descriptor, config) : false
  })

  return {
    ok: true,
    data: shape.data,
    exportedAt: parsed.exportedAt,
    redactions: { reentryRequired: requiredIds, notice: BACKUP_REDACTION_NOTICE },
    legacyReentryMayBeRequired,
    requiredOrigins: ownedOriginPatterns({ connectors: shape.data.connectors, photoPrefs: shape.data.photoPrefs }),
  }
}
