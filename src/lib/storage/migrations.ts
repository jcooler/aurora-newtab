import { CURRENT_VERSION, defaults, type AuroraData } from './schema'

type Snapshot = Record<string, unknown>

export type Migration = (data: Snapshot) => Snapshot

/** Keyed by the version being upgraded FROM: migrations[1] upgrades v1 -> v2. */
export const migrations: Record<number, Migration> = {}

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
  return { ...defaults(), ...data } as AuroraData
}
