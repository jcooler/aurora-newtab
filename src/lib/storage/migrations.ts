import { CURRENT_VERSION, defaults, type AuroraData } from './schema'
import { isPlainObject } from '../object'

type Snapshot = Record<string, unknown>

export type Migration = (data: Snapshot) => Snapshot

/** Keyed by the version being upgraded FROM: migrations[1] upgrades v1 -> v2. */
export const migrations: Record<number, Migration> = {
  // v1 -> v2: widget toggles gained nested keys (bookmarks/notes/clocks/countdown).
  // Nested keys are exactly what the final default-merge does NOT backfill.
  1: (data) => {
    const d = defaults()
    // A bare `?? {}` only catches null/undefined — a hand-edited backup with
    // e.g. `"settings": "oops"` sails through it, and `...'oops'` below would
    // then spread the string's characters in as numeric-keyed garbage
    // ({0:'o', 1:'o', ...}). Reachable via import (see backup.ts), so both
    // `settings` and its nested `widgets` are checked for real object shape
    // before spreading, falling back to `{}` otherwise.
    const settings = isPlainObject(data.settings) ? data.settings : {}
    const widgets = isPlainObject(settings.widgets) ? settings.widgets : {}
    return {
      ...data,
      settings: {
        ...d.settings,
        ...settings,
        widgets: { ...d.settings.widgets, ...widgets },
      },
    }
  },
}

export function migrate(
  snapshot: Snapshot,
  fromVersion: number,
  registry: Record<number, Migration> = migrations,
): AuroraData {
  let data = snapshot
  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    const step = registry[v]
    if (!step) throw new Error(`No migration from schema v${v}`)
    data = step(data)
  }
  // Top-level keys missing from storage fall back to defaults.
  // CONTRACT for migration authors: the default-merge below backfills MISSING
  // TOP-LEVEL KEYS ONLY. A stored object (e.g. `settings`) replaces the default
  // wholesale — new NESTED fields added in a schema bump will be undefined for
  // existing users unless your migration step fills them in explicitly.
  return { ...defaults(), ...data } as AuroraData
}
