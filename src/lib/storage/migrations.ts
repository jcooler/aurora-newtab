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
  // v2 -> v3: free-layout map for arrange mode. Absent for every v2 user.
  2: (data) => ({ ...data, layout: {} }),
  // v3 -> v4: Red Argon remediation — the in-extension engine picker
  // (google/duckduckgo/bing) is gone; all search now routes through
  // chrome.search.query (see src/services/search.ts), which respects
  // whatever engine the user actually has set in their own browser, so
  // Settings.searchEngine no longer means anything and must not survive an
  // import. Spread-omit (not `delete`), same style as every migration here:
  // a fresh object without the key, rather than mutating the stored one.
  // Guarded the same way v1->v2 guards `widgets` — a hand-edited backup can
  // carry `"settings": "oops"`, and `const { searchEngine, ...rest } =
  // 'oops'` would throw (destructuring a string by key is not the same as
  // spreading one), so settings is shape-checked first.
  3: (data) => {
    const settings = data.settings
    if (!isPlainObject(settings)) return data
    const { searchEngine: _searchEngine, ...rest } = settings
    return { ...data, settings: rest }
  },
  // v4 -> v5: connector config + snapshot cache (Task 39). Both keys are
  // brand new — no v4 user has ever had them — so this is a plain top-level
  // backfill, same style as v2->v3's `layout: {}`, not the defensive
  // isPlainObject-guarded style v1->v2 needs (there's no prior shape to
  // corrupt or nested user data to preserve here).
  4: (data) => ({ ...data, connectors: {}, connectorSnapshots: {} }),
  // v5 -> v6: habits key (Task 56). Brand new — no v5 user has ever had it —
  // so this is a plain top-level backfill, same style as v4->v5's
  // `connectors: {}` / `connectorSnapshots: {}`.
  5: (data) => ({ ...data, habits: [] }),
  // v6 -> v7: widget toggles gained MORE nested keys — `habits` (Task 57)
  // and `monthCal` (Task 58) — and NEITHER task bumped CURRENT_VERSION when
  // it landed (each merely added a new WidgetToggles member and a
  // defaults() entry). That reopened the exact gap v1->v2 exists to close
  // (see that step's own comment: "Nested keys are exactly what the final
  // default-merge does NOT backfill") — caught in review when a real v6
  // backup (predating one or both keys, depending on when it was captured)
  // was rejected wholesale by backup.ts's isWidgetToggles, which requires
  // EVERY known widget key present as a boolean.
  //
  // Deliberately GENERIC, not hardcoded to `habits`/`monthCal` by name —
  // byte-identical shape to v1->v2's own step, spreading
  // `defaults().settings.widgets` under whatever's already stored so any
  // widget key missing from an older snapshot gets backfilled (stored
  // values always win), without needing a THIRD version of this same fix
  // the next time a widget toggle ships without its own migration.
  //
  // CLARIFICATION (final-review fix wave — the wording above actively
  // invites the wrong reading): this step only RUNS for a snapshot whose
  // stored version is <=6 (see `migrate()`'s own loop below — `registry[v]`
  // runs only for `v` from `fromVersion` up to `CURRENT_VERSION - 1`). Once
  // a store has been upgraded to v7, this step never runs for it again. A
  // FUTURE widget toggle added without its own CURRENT_VERSION bump + a NEW
  // migration step (see WidgetToggles' own doc comment in schema.ts) is
  // NOT automatically backfilled by this one for anyone already sitting at
  // v7 — "generic" means "not hardcoded to today's key names", not "covers
  // every future addition for free".
  6: (data) => {
    const d = defaults()
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
  // v7 -> v8: the three-theme system (Task 60) collapsed into one surface plus
  // a live widget-color customizer. `settings.theme` no longer means anything
  // and must not survive an import — spread-omitted the same way v3->v4 strips
  // `searchEngine` (step 3), not `delete`d. `settings.panelColor` (hex | null)
  // is brand new; it's NESTED inside settings, exactly the kind of key the
  // final default-merge does NOT backfill (see v1->v2's own comment), so it's
  // filled in explicitly here — `?? null` keeps any already-present value while
  // defaulting a genuine v7 snapshot (which never had the key) to null.
  //
  // Guarded like step 3: a hand-edited backup can carry `"settings": "oops"`,
  // and destructuring a string by key throws, so a non-object settings is left
  // untouched and caught downstream by backup.ts's validateBackupShape.
  7: (data) => {
    const settings = data.settings
    if (!isPlainObject(settings)) return data
    const { theme: _theme, ...rest } = settings
    return { ...data, settings: { ...rest, panelColor: rest.panelColor ?? null } }
  },
  // v8 -> v9: sun and moon widget toggles (Task 93). Brand new NESTED keys
  // inside settings.widgets — exactly what the final default-merge does NOT
  // backfill (see v1->v2's own comment) — so, per the STANDING RULE in
  // schema.ts, this step is a byte-identical copy of v1->v2's and v6->v7's
  // own generic shape: spreads defaults().settings.widgets under whatever's
  // already stored (stored values always win), rather than hardcoding
  // `sun`/`moon` by name, so any widget key missing from an older snapshot
  // gets backfilled without needing yet another version of this same fix the
  // next time a widget toggle ships without its own migration.
  //
  // Guarded the same way v1->v2 and v6->v7 guard `widgets` — a hand-edited
  // backup can carry `"settings": "oops"` or a non-object `widgets`, and
  // both are shape-checked before spreading, falling back to `{}` otherwise.
  8: (data) => {
    const d = defaults()
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
