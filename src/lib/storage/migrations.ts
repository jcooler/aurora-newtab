import { CURRENT_VERSION, DEFAULT_BRIEFING_SOURCES, defaults, type AuroraData } from './schema'
import { isPlainObject } from '../object'
import { layoutV2FromLegacy } from '../layout/v2'
import {
  isMicrosoftCalendarSnapshot,
  parseMicrosoftCalendarConfig,
} from '../../services/connectors/microsoftCalendar'

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
  // v9 -> v10: preserve the complete known legacy percentage layout and map
  // its explicit user positions into deterministic overrides for every
  // future layout profile. The pure mapper validates before returning, so a
  // malformed known row cannot produce a partial migration target.
  9: (data) => ({
    ...data,
    layout: layoutV2FromLegacy(
      Object.prototype.hasOwnProperty.call(data, 'layout') ? data.layout : {},
    ),
  }),
  // v10 -> v11: density is one new nested Settings preference. Preserve an
  // explicitly present value verbatim so strict backup validation can reject
  // malformed v11-shaped data instead of laundering it into a valid import.
  // A malformed Settings container is likewise left untouched for the backup
  // boundary to reject; live current-schema repair is deliberately narrower
  // and lives in storage/index.ts.
  10: (data) => {
    const settings = data.settings
    if (!isPlainObject(settings)) {
      return Object.prototype.hasOwnProperty.call(data, 'settings')
        ? data
        : { ...data, settings: undefined }
    }
    return {
      ...data,
      settings: {
        ...settings,
        layoutDensity: Object.prototype.hasOwnProperty.call(settings, 'layoutDensity')
          ? settings.layoutDensity
          : 'auto',
      },
    }
  },
  // v11 -> v12: the stored layout key becomes an explicit V1/V2/V3 union.
  // This step is intentionally the identity function. Live initialization
  // handles this version boundary as a metadata-only transaction so no
  // Aurora data key is rewritten merely because the extension booted.
  11: (data) => data,
  // v12 -> v13: the named-layouts document key (NL-P1). Intentionally the
  // identity, exactly like 11: live initialization treats every boundary from
  // v11 on as a metadata-only version stamp (index.ts METADATA_ONLY_FLOOR) so
  // no Aurora data key is rewritten merely because the extension booted.
  // `layouts` itself is a brand-new top-level key backfilled to null by
  // migrate()'s default-merge, the same way apodCache arrived.
  12: (data) => data,
  // v13 -> v14: the five appearance ink overrides (owner-approved 2026-08-18
  // color system) are NESTED Settings fields — exactly what the final
  // default-merge does NOT backfill (v1->v2's own comment) — so each is
  // filled explicitly, `?? null` preserving any already-present value, the
  // byte-for-byte style of v7->v8's panelColor backfill. NOT the identity,
  // so METADATA_ONLY_FLOOR moved to 14 in the same change (index.ts's own
  // rule on that constant). Guarded like steps 3/7/10: a non-object settings
  // is left for backup.ts's validators to reject.
  13: (data) => {
    const settings = data.settings
    if (!isPlainObject(settings)) return data
    return {
      ...data,
      settings: {
        ...settings,
        widgetTextColor: settings.widgetTextColor ?? null,
        photoTextColor: settings.photoTextColor ?? null,
        photoClockColor: settings.photoClockColor ?? null,
        photoGreetingColor: settings.photoGreetingColor ?? null,
        photoQuoteColor: settings.photoQuoteColor ?? null,
      },
    }
  },
  // v14 -> v15: Flow adds timerSession as a new top-level key. The migration
  // registry step stays identity; migrate()'s final defaults merge supplies
  // null without touching any prior user value.
  14: (data) => data,
  // v15 -> v16: Program F adds four nested browser-native widget toggles.
  // This is the same generic nested-widget merge used by v6 -> v7 and
  // v8 -> v9: current defaults fill only missing toggle keys while every
  // stored choice and Settings sibling wins unchanged.
  15: (data) => {
    const d = defaults()
    const settings = data.settings
    if (!isPlainObject(settings)) return data
    if (!isPlainObject(settings.widgets)) {
      throw new Error('Invalid settings.widgets in schema v15')
    }
    return {
      ...data,
      settings: {
        ...settings,
        widgets: { ...d.settings.widgets, ...settings.widgets },
      },
    }
  },
  // v16 -> v17: Flow ambience is a new nested Settings preference. Preserve
  // any explicit value verbatim so backup validation can reject malformed
  // current-schema data instead of normalizing it silently.
  16: (data) => {
    const settings = data.settings
    if (!isPlainObject(settings)) return data
    return {
      ...data,
      settings: {
        ...settings,
        flowAmbience: Object.prototype.hasOwnProperty.call(settings, 'flowAmbience')
          ? settings.flowAmbience
          : 'off',
      },
    }
  },
  // v17 -> v18: make Flow volume explicit so existing users receive the new
  // quieter baseline without resetting their selected sound.
  17: (data) => {
    const settings = data.settings
    if (!isPlainObject(settings)) return data
    return {
      ...data,
      settings: {
        ...settings,
        flowVolume: Object.prototype.hasOwnProperty.call(settings, 'flowVolume')
          ? settings.flowVolume
          : 15,
      },
    }
  },
  // v18 -> v19: Greeting helper source preferences are nested Settings state.
  // Merge defaults below any stored partial object so every new source is
  // explicit while an existing user choice remains authoritative.
  18: (data) => {
    const settings = data.settings
    if (!isPlainObject(settings)) return data
    const stored = isPlainObject(settings.briefingSources) ? settings.briefingSources : {}
    return {
      ...data,
      settings: {
        ...settings,
        briefingSources: { ...DEFAULT_BRIEFING_SOURCES, ...stored },
      },
    }
  },
  // v19 -> v20: Progress adds one top-level local-content authority and one
  // nested widget toggle. The top-level value is preserved verbatim when it
  // already exists; strict backup validation owns malformed current data.
  19: (data) => {
    const settings = data.settings
    if (!isPlainObject(settings)) return { ...data, progressGoals: [] }
    if (!isPlainObject(settings.widgets)) throw new Error('Invalid settings.widgets in schema v19')
    return {
      ...data,
      progressGoals: Object.prototype.hasOwnProperty.call(data, 'progressGoals')
        ? data.progressGoals
        : [],
      settings: {
        ...settings,
        widgets: {
          ...settings.widgets,
          progress: Object.prototype.hasOwnProperty.call(settings.widgets, 'progress')
            ? settings.widgets.progress
            : false,
        },
      },
    }
  },
  // v20 -> v21: aggregate metrics history is a new nullable top-level key.
  // Keep this registry step identity; migrate()'s final defaults merge
  // materializes null without rewriting any existing user authority.
  20: (data) => data,
  // v21 -> v22: Metrics is an optional Canvas identity. Backfill only the
  // new nested toggle; existing widget choices and named layouts remain the
  // user's exact authority and no placement is materialized here.
  21: (data) => {
    const settings = data.settings
    if (!isPlainObject(settings)) return data
    if (!isPlainObject(settings.widgets)) throw new Error('Invalid settings.widgets in schema v21')
    return {
      ...data,
      settings: {
        ...settings,
        widgets: {
          ...settings.widgets,
          metrics: Object.prototype.hasOwnProperty.call(settings.widgets, 'metrics')
            ? settings.widgets.metrics
            : false,
        },
      },
    }
  },
  // v22 -> v23: Google Calendar adds only an append-only connector identity.
  // Keep the registry step identity so no connection is enabled, configured,
  // or placed and every prior authority remains byte-equivalent.
  22: (data) => data,
  // v23 -> v24: Microsoft Calendar adds a device-local provider authority.
  // Preserve an already-valid development snapshot, but strip malformed or
  // secret-bearing injected rows. No default config or enabled state is ever
  // materialized by this migration.
  23: (data) => {
    const connectors = isPlainObject(data.connectors) ? { ...data.connectors } : data.connectors
    if (isPlainObject(connectors)
      && Object.prototype.hasOwnProperty.call(connectors, 'microsoftCalendar')
      && parseMicrosoftCalendarConfig(connectors.microsoftCalendar) === null) {
      delete connectors.microsoftCalendar
    }
    const connectorSnapshots = isPlainObject(data.connectorSnapshots)
      ? { ...data.connectorSnapshots }
      : data.connectorSnapshots
    if (isPlainObject(connectorSnapshots)
      && Object.prototype.hasOwnProperty.call(connectorSnapshots, 'microsoftCalendar')) {
      const entry = connectorSnapshots.microsoftCalendar
      const valid = isPlainObject(entry)
        && Object.keys(entry).every((key) => ['scope', 'fetchedAt', 'data'].includes(key))
        && (entry.scope === undefined || typeof entry.scope === 'string')
        && Number.isSafeInteger(entry.fetchedAt)
        && (entry.fetchedAt as number) >= 0
        && isMicrosoftCalendarSnapshot(entry.data)
      if (!valid) delete connectorSnapshots.microsoftCalendar
    }
    return {
      ...data,
      ...(connectors === undefined ? {} : { connectors }),
      ...(connectorSnapshots === undefined ? {} : { connectorSnapshots }),
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
