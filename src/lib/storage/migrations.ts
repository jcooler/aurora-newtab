import { CURRENT_VERSION, defaults, type AuroraData } from './schema'

type Snapshot = Record<string, unknown>

export type Migration = (data: Snapshot) => Snapshot

/** Keyed by the version being upgraded FROM: migrations[1] upgrades v1 -> v2. */
export const migrations: Record<number, Migration> = {
  // v1 -> v2: widget toggles gained nested keys (bookmarks/notes/clocks/countdown).
  // Nested keys are exactly what the final default-merge does NOT backfill.
  1: (data) => {
    const d = defaults()
    const settings = (data.settings ?? {}) as Record<string, unknown>
    const widgets = (settings.widgets ?? {}) as Record<string, unknown>
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
