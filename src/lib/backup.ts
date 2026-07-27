// src/lib/backup.ts — JSON export/import envelope for a full data backup.
// parseBackup deliberately stays version-agnostic: it hands the caller back
// the raw stored `version` alongside the raw `data` so migration (which
// knows how to walk old snapshots forward) stays the caller's job, not this
// module's. That's why the success shape is `{ data, version }` rather than
// an already-migrated `AuroraData`.
import { CURRENT_VERSION, type AuroraData } from './storage/schema'

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
