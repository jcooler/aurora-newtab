import { describe, expect, it } from 'vitest'
import {
  LEGACY_LAYOUT_VALIDATION_MESSAGE,
  LegacyLayoutValidationError,
  layoutV2FromLegacy,
} from '../layout/v2'
import { CURRENT_VERSION, defaults, type AuroraData } from './schema'
import { migrate, type Migration } from './migrations'
import type { LayoutV2 } from '../layout/types'

const EMPTY_MIGRATED_LAYOUT = {
  version: 2,
  profiles: { compact: {}, standard: {}, display: {}, ultrawide: {} },
  legacy: {},
} as const

describe('migrate', () => {
  it('fills an empty snapshot with defaults', () => {
    expect(migrate({}, 1)).toEqual({ ...defaults(), layout: EMPTY_MIGRATED_LAYOUT })
  })

  it('preserves stored values over defaults', () => {
    const out = migrate({ settings: { ...defaults().settings, name: 'Jon' } }, 1)
    expect(out.settings.name).toBe('Jon')
    expect(out.timerConfig).toEqual({ workMinutes: 25, breakMinutes: 5 })
  })

  it('runs registered migrations in order up to the current version', () => {
    const calls: number[] = []
    const registry: Record<number, Migration> = {
      // registry[0] upgrades v0 -> v1, registry[1] upgrades v1 -> v2, registry[2]
      // upgrades v2 -> v3, registry[3] upgrades v3 -> v4, registry[4] upgrades
      // v4 -> v5, registry[5] upgrades v5 -> v6, registry[6] upgrades v6 -> v7,
      // registry[7] upgrades v7 -> v8, registry[8] upgrades v8 -> v9,
      // registry[9] upgrades v9 -> v10, registry[10] upgrades v10 -> v11,
      // registry[11] upgrades v11 -> v12, registry[12] upgrades v12 -> v13
      // (CURRENT_VERSION)
      0: (data) => {
        calls.push(0)
        return { ...data, focus: { text: 'migrated', date: '2026-07-26', done: false } }
      },
      1: (data) => {
        calls.push(1)
        return data
      },
      2: (data) => {
        calls.push(2)
        return data
      },
      3: (data) => {
        calls.push(3)
        return data
      },
      4: (data) => {
        calls.push(4)
        return data
      },
      5: (data) => {
        calls.push(5)
        return data
      },
      6: (data) => {
        calls.push(6)
        return data
      },
      7: (data) => {
        calls.push(7)
        return data
      },
      8: (data) => {
        calls.push(8)
        return data
      },
      9: (data) => {
        calls.push(9)
        return data
      },
      10: (data) => {
        calls.push(10)
        return data
      },
      11: (data) => {
        calls.push(11)
        return data
      },
      12: (data) => {
        calls.push(12)
        return data
      },
    }
    const out = migrate({}, 0, registry)
    expect(calls).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(out.focus?.text).toBe('migrated')
  })

  it('throws when a migration step is missing', () => {
    expect(() => migrate({}, -1, {})).toThrow(/No migration/)
  })
})

describe('v1 -> v2', () => {
  it('backfills the new nested widget toggles while preserving user choices', () => {
    const v1Settings = {
      ...defaults().settings,
      name: 'Jon',
      widgets: { search: false, weather: true, links: true, todo: true, timer: true, quote: false },
    }
    const out = migrate({ settings: v1Settings }, 1)
    expect(out.settings.name).toBe('Jon')
    expect(out.settings.widgets.search).toBe(false) // user choice preserved
    expect(out.settings.widgets.quote).toBe(false)
    expect(out.settings.widgets.bookmarks).toBe(false) // new keys backfilled
    expect(out.settings.widgets.notes).toBe(true)
    expect(out.settings.widgets.clocks).toBe(false)
    expect(out.settings.widgets.countdown).toBe(false)
  })

  it('tolerates a v1 snapshot with no settings at all', () => {
    const out = migrate({}, 1)
    expect(out.settings.widgets.notes).toBe(true)
    expect(out.notes).toEqual({ text: '', updatedAt: 0 })
  })

  it('guards against a non-object settings (e.g. a hand-edited string): defaults win, no garbage keys', () => {
    // A bare `?? {}` fallback treats a non-null string as present, and later
    // spreads it — `...'oops'` produces {0:'o', 1:'o', 2:'p', 3:'s'} — which
    // is exactly the reachable-via-import bug this guard closes.
    const out = migrate({ settings: 'oops' }, 1)
    expect(out.settings).toEqual(defaults().settings)
    expect(Object.keys(out.settings)).toEqual(Object.keys(defaults().settings))
  })

  it('guards against a non-object widgets nested inside a valid settings object', () => {
    const out = migrate({ settings: { ...defaults().settings, name: 'Jon', widgets: 'oops' } }, 1)
    expect(out.settings.name).toBe('Jon') // rest of settings still preserved
    expect(out.settings.widgets).toEqual(defaults().settings.widgets)
    expect(Object.keys(out.settings.widgets)).toEqual(Object.keys(defaults().settings.widgets))
  })

  it('guards against an array settings (arrays are typeof "object" too)', () => {
    const out = migrate({ settings: ['oops'] }, 1)
    expect(out.settings).toEqual(defaults().settings)
  })

  it('new top-level keys default for v1 snapshots', () => {
    const out = migrate({ links: [] }, 1)
    expect(out.worldClocks).toEqual([])
    expect(out.countdowns).toEqual([])
  })
})

describe('v2 -> v3', () => {
  it('backfills an empty layout map', () => {
    const out = migrate({ settings: defaults().settings }, 2)
    expect(out.layout).toEqual(EMPTY_MIGRATED_LAYOUT)
  })
  it('a v1 snapshot chains through both migrations', () => {
    const out = migrate({}, 1)
    expect(out.settings.widgets.notes).toBe(true) // v1->v2 still ran
    expect(out.layout).toEqual(EMPTY_MIGRATED_LAYOUT) // v2->v3 and v9->v10 ran after it
  })
})

// Red Argon remediation: the in-extension engine picker is gone, and
// Settings.searchEngine must not survive an import — see migrations.ts's
// comment on step 3 for why.
describe('v3 -> v4', () => {
  it('strips searchEngine from settings, keeping every other field', () => {
    const v3Settings = { ...defaults().settings, name: 'Jon', searchEngine: 'duckduckgo' }
    const out = migrate({ settings: v3Settings }, 3)
    expect(out.settings.name).toBe('Jon')
    expect('searchEngine' in out.settings).toBe(false)
  })

  it('tolerates a v3 snapshot with no settings at all', () => {
    const out = migrate({}, 3)
    expect('searchEngine' in out.settings).toBe(false)
  })

  it('guards against a non-object settings (e.g. a hand-edited string): no throw', () => {
    // Unlike v1->v2 (which always rebuilds settings from defaults() as part
    // of its own backfill and so incidentally repairs a corrupted value),
    // this step's only job is stripping one field — a non-object settings
    // is left untouched rather than crashing (destructuring a string by key
    // throws), and is caught downstream by backup.ts's validateBackupShape,
    // the same enforcement point the original v1 guard's comment points at
    // ("reachable via import").
    expect(() => migrate({ settings: 'oops' }, 3)).not.toThrow()
  })

  it('a v1 snapshot chains through all three migrations, ending with no searchEngine', () => {
    const v1Settings = {
      name: 'Jon',
      use24Hour: false,
      theme: 'aurora',
      units: 'metric',
      searchEngine: 'bing',
      muted: false,
      widgets: { search: false, weather: true, links: true, todo: true, timer: true, quote: false },
    }
    const out = migrate({ settings: v1Settings }, 1)
    expect(out.settings.name).toBe('Jon') // v1->v2 preserved it
    expect(out.settings.widgets.notes).toBe(true) // v1->v2 backfilled it
    expect(out.layout).toEqual(EMPTY_MIGRATED_LAYOUT) // v2->v3 and v9->v10 ran
    expect('searchEngine' in out.settings).toBe(false) // v3->v4 ran last
  })

  // The reason validateBackupShape's isSettings check no longer whitelists
  // searchEngine at all (backup.ts): an OLD (v<=3) backup's searchEngine
  // must be gone BEFORE shape validation ever sees it, not merely ignored
  // by it. Proven at the migrate() level here; backup.test.ts proves the
  // full parseBackup -> migrate -> validateBackupShape pipeline.
  it('an old backup carrying searchEngine no longer has it after migrate(), regardless of validation', () => {
    const out = migrate({ settings: { ...defaults().settings, searchEngine: 'google' } }, 3)
    expect(Object.keys(out.settings).sort()).toEqual(Object.keys(defaults().settings).sort())
  })
})

// Task 39: connector config/snapshot keys. Neither existed before v5, so this
// step is a plain top-level backfill — same style as v2->v3's `layout: {}`,
// not the defensive isPlainObject-guarded style v1->v2 needs (there's no
// prior shape to corrupt or preserve nested fields inside).
describe('v4 -> v5', () => {
  it('backfills empty connectors and connectorSnapshots maps', () => {
    const out = migrate({ settings: defaults().settings, layout: {} }, 4)
    expect(out.connectors).toEqual({})
    expect(out.connectorSnapshots).toEqual({})
  })

  it('tolerates a v4 snapshot with no connectors at all', () => {
    const out = migrate({}, 4)
    expect(out.connectors).toEqual({})
    expect(out.connectorSnapshots).toEqual({})
  })

  it('spread-preserves the rest of the snapshot untouched by this step', () => {
    const out = migrate({ settings: { ...defaults().settings, name: 'Jon' } }, 4)
    expect(out.settings.name).toBe('Jon')
  })

  it('a v1 snapshot chains through all four migrations: layout and connectors backfilled, searchEngine gone', () => {
    const out = migrate({}, 1)
    expect(out.settings.widgets.notes).toBe(true) // v1->v2 ran
    expect(out.layout).toEqual(EMPTY_MIGRATED_LAYOUT) // v2->v3 and v9->v10 ran
    expect('searchEngine' in out.settings).toBe(false) // v3->v4 ran
    expect(out.connectors).toEqual({}) // v4->v5 ran
    expect(out.connectorSnapshots).toEqual({}) // v4->v5 ran
  })
})

// Task 56: habits key (SP4). Brand new, like connectors/connectorSnapshots
// before it — a plain top-level backfill, same style as v4->v5.
describe('v5 -> v6', () => {
  it('backfills an empty habits array', () => {
    const out = migrate({ settings: defaults().settings, connectors: {}, connectorSnapshots: {} }, 5)
    expect(out.habits).toEqual([])
  })

  it('tolerates a v5 snapshot with no habits at all', () => {
    const out = migrate({}, 5)
    expect(out.habits).toEqual([])
  })

  it('spread-preserves the rest of the snapshot untouched by this step', () => {
    const out = migrate({ settings: { ...defaults().settings, name: 'Jon' } }, 5)
    expect(out.settings.name).toBe('Jon')
  })

  it('a v1 snapshot chains through all five migrations, ending with habits present and every v5-era key intact', () => {
    const out = migrate({}, 1)
    expect(out.settings.widgets.notes).toBe(true) // v1->v2 ran
    expect(out.layout).toEqual(EMPTY_MIGRATED_LAYOUT) // v2->v3 and v9->v10 ran
    expect('searchEngine' in out.settings).toBe(false) // v3->v4 ran
    expect(out.connectors).toEqual({}) // v4->v5 ran
    expect(out.connectorSnapshots).toEqual({}) // v4->v5 ran
    expect(out.habits).toEqual([]) // v5->v6 ran
  })
})

// Fix round 1 (post-review, Task 58): habits (Task 57) and monthCal (this
// task) BOTH added a new WidgetToggles member without bumping
// CURRENT_VERSION — the exact "nested keys are exactly what the final
// default-merge does NOT backfill" gap v1->v2 already exists to close (see
// that step's own comment), just reopened a second time. Any snapshot still
// tagged v6 can therefore be missing EITHER key depending on when it was
// captured relative to those two tasks landing (a backup taken between them
// has `habits` but not `monthCal`; one taken before both has neither) — this
// step is deliberately GENERIC (spreads defaults().settings.widgets under
// whatever's already stored, same shape as v1->v2's own step) rather than
// naming the two keys specifically, so it backfills whichever are actually
// missing and doesn't need a THIRD version of itself the next time a widget
// toggle lands without its own migration.
describe('v6 -> v7', () => {
  it('backfills habits AND monthCal while preserving a user choice for a key that already existed in v6', () => {
    const v6Widgets = {
      search: true, weather: false, links: true, todo: true, timer: false,
      quote: true, bookmarks: false, notes: true, clocks: false, countdown: false,
      habits: true, // already existed in v6's WidgetToggles (Task 57) — an explicit user choice
      // monthCal absent — the actual v6-era gap this step exists to close
    }
    const out = migrate({ settings: { ...defaults().settings, name: 'Jon', widgets: v6Widgets } }, 6)
    expect(out.settings.name).toBe('Jon')
    expect(out.settings.widgets.weather).toBe(false) // stored choice survives
    expect(out.settings.widgets.habits).toBe(true) // stored choice survives (an explicitly-true nested key)
    expect(out.settings.widgets.monthCal).toBe(false) // new key backfilled from defaults()
  })

  it('tolerates a v6 snapshot with no settings at all', () => {
    const out = migrate({}, 6)
    expect(out.settings.widgets.habits).toBe(false)
    expect(out.settings.widgets.monthCal).toBe(false)
  })

  it('guards against a non-object settings (e.g. a hand-edited string): defaults win, no garbage keys', () => {
    const out = migrate({ settings: 'oops' }, 6)
    expect(out.settings).toEqual(defaults().settings)
    expect(Object.keys(out.settings)).toEqual(Object.keys(defaults().settings))
  })

  it('guards against a non-object widgets nested inside a valid settings object', () => {
    const out = migrate({ settings: { ...defaults().settings, name: 'Jon', widgets: 'oops' } }, 6)
    expect(out.settings.name).toBe('Jon') // rest of settings still preserved
    expect(out.settings.widgets).toEqual(defaults().settings.widgets)
  })

  it('guards against an array settings (arrays are typeof "object" too)', () => {
    const out = migrate({ settings: ['oops'] }, 6)
    expect(out.settings).toEqual(defaults().settings)
  })

  it('spread-preserves the rest of the snapshot untouched by this step', () => {
    const out = migrate(
      { settings: defaults().settings, habits: [{ id: 'h1', name: 'Read', createdAt: 0, log: [] }] },
      6,
    )
    expect(out.habits).toEqual([{ id: 'h1', name: 'Read', createdAt: 0, log: [] }])
  })

  it('a v1 snapshot chains through all six migrations, ending with habits AND monthCal present and every v6-era key intact', () => {
    const out = migrate({}, 1)
    expect(out.settings.widgets.notes).toBe(true) // v1->v2 ran
    expect(out.layout).toEqual(EMPTY_MIGRATED_LAYOUT) // v2->v3 and v9->v10 ran
    expect('searchEngine' in out.settings).toBe(false) // v3->v4 ran
    expect(out.connectors).toEqual({}) // v4->v5 ran
    expect(out.habits).toEqual([]) // v5->v6 ran
    expect(out.settings.widgets.habits).toBe(false) // v6->v7 ran (backfilled)
    expect(out.settings.widgets.monthCal).toBe(false) // v6->v7 ran (backfilled)
  })

  it('an explicitly-true widget already present in a v1 snapshot survives the full v1->v7 chain untouched', () => {
    const v1Settings = {
      name: 'Jon',
      use24Hour: false,
      theme: 'aurora',
      units: 'metric',
      muted: false,
      widgets: { search: false, weather: true, links: true, todo: true, timer: true, quote: false },
    }
    const out = migrate({ settings: v1Settings }, 1)
    expect(out.settings.widgets.weather).toBe(true) // user's v1-era choice, still honored 6 steps later
    expect(out.settings.widgets.habits).toBe(false) // backfilled default (v1->v2 step, unaffected by v6->v7)
    expect(out.settings.widgets.monthCal).toBe(false) // backfilled default (v6->v7 step)
  })
})

// Task 60: the three-theme system collapsed into one surface + a live
// widget-color customizer. `settings.theme` is stripped from any older snapshot
// (searchEngine-strip precedent, step 3) and `settings.panelColor` (hex | null)
// is backfilled null — a NESTED settings key, so it needs its own explicit step
// (the final default-merge only backfills MISSING TOP-LEVEL keys).
describe('v7 -> v8', () => {
  it("strips settings.theme (a stored 'glass' vanishes) and backfills panelColor null", () => {
    const v7Settings = { ...defaults().settings, name: 'Jon', theme: 'glass' }
    const out = migrate({ settings: v7Settings }, 7)
    expect(out.settings.name).toBe('Jon') // rest of settings preserved
    expect('theme' in out.settings).toBe(false)
    expect(out.settings.panelColor).toBeNull()
  })

  it('tolerates a v7 snapshot with no settings at all', () => {
    const out = migrate({}, 7)
    expect('theme' in out.settings).toBe(false)
    expect(out.settings.panelColor).toBeNull()
  })

  it('guards against a non-object settings (e.g. a hand-edited string): no throw', () => {
    // Same restraint as v3->v4's strip step: destructuring a string by key
    // throws, so a non-object settings is left untouched here and caught
    // downstream by backup.ts's validateBackupShape.
    expect(() => migrate({ settings: 'oops' }, 7)).not.toThrow()
  })

  it('keeps an already-present panelColor rather than clobbering it', () => {
    const out = migrate({ settings: { ...defaults().settings, panelColor: '#12ab34' } }, 7)
    expect(out.settings.panelColor).toBe('#12ab34')
  })

  it('a v1 snapshot chains through all seven migrations, ending with theme gone and panelColor null', () => {
    const v1Settings = {
      name: 'Jon',
      use24Hour: false,
      theme: 'aurora',
      units: 'metric',
      muted: false,
      widgets: { search: false, weather: true, links: true, todo: true, timer: true, quote: false },
    }
    const out = migrate({ settings: v1Settings }, 1)
    expect(out.settings.name).toBe('Jon') // v1->v2 preserved it
    expect(out.settings.widgets.notes).toBe(true) // v1->v2 backfilled it
    expect(out.layout).toEqual(EMPTY_MIGRATED_LAYOUT) // v2->v3 and v9->v10 ran
    expect('searchEngine' in out.settings).toBe(false) // v3->v4 ran
    expect(out.connectors).toEqual({}) // v4->v5 ran
    expect(out.habits).toEqual([]) // v5->v6 ran
    expect(out.settings.widgets.monthCal).toBe(false) // v6->v7 ran
    expect('theme' in out.settings).toBe(false) // v7->v8 ran (stripped)
    expect(out.settings.panelColor).toBeNull() // v7->v8 ran (backfilled)
  })
})

// Task 93: sun and moon widget toggles. Brand new NESTED keys inside
// settings.widgets — exactly what the final default-merge does NOT backfill
// (see v1->v2's own comment) — so this step is deliberately the same
// GENERIC shape as v1->v2's and v6->v7's own steps (spreads
// defaults().settings.widgets under whatever's already stored), not
// hardcoded to `sun`/`moon` by name, per the STANDING RULE in schema.ts.
describe('v8 -> v9', () => {
  it('backfills sun AND moon while preserving a user choice for a key that already existed in v8', () => {
    const v8Widgets = {
      search: true, weather: false, links: true, todo: true, timer: false,
      quote: true, bookmarks: false, notes: true, clocks: false, countdown: false,
      habits: true, monthCal: false,
      // sun/moon absent — the actual v8-era gap this step exists to close
    }
    const out = migrate({ settings: { ...defaults().settings, name: 'Jon', widgets: v8Widgets } }, 8)
    expect(out.settings.name).toBe('Jon')
    expect(out.settings.widgets.weather).toBe(false) // stored choice survives
    expect(out.settings.widgets.habits).toBe(true) // stored choice survives (an explicitly-true nested key)
    expect(out.settings.widgets.sun).toBe(false) // new key backfilled from defaults()
    expect(out.settings.widgets.moon).toBe(false) // new key backfilled from defaults()
  })

  it('tolerates a v8 snapshot with no settings at all', () => {
    const out = migrate({}, 8)
    expect(out.settings.widgets.sun).toBe(false)
    expect(out.settings.widgets.moon).toBe(false)
  })

  it('guards against a non-object settings (e.g. a hand-edited string): defaults win, no garbage keys', () => {
    const out = migrate({ settings: 'oops' }, 8)
    expect(out.settings).toEqual(defaults().settings)
    expect(Object.keys(out.settings)).toEqual(Object.keys(defaults().settings))
  })

  it('guards against a non-object widgets nested inside a valid settings object', () => {
    const out = migrate({ settings: { ...defaults().settings, name: 'Jon', widgets: 'oops' } }, 8)
    expect(out.settings.name).toBe('Jon') // rest of settings still preserved
    expect(out.settings.widgets).toEqual(defaults().settings.widgets)
  })

  it('guards against an array settings (arrays are typeof "object" too)', () => {
    const out = migrate({ settings: ['oops'] }, 8)
    expect(out.settings).toEqual(defaults().settings)
  })

  it('spread-preserves the rest of the snapshot untouched by this step', () => {
    const out = migrate(
      { settings: defaults().settings, habits: [{ id: 'h1', name: 'Read', createdAt: 0, log: [] }] },
      8,
    )
    expect(out.habits).toEqual([{ id: 'h1', name: 'Read', createdAt: 0, log: [] }])
  })

  it('a v1 snapshot chains through all eight migrations, ending with sun AND moon present and every v8-era key intact', () => {
    const out = migrate({}, 1)
    expect(out.settings.widgets.notes).toBe(true) // v1->v2 ran
    expect(out.layout).toEqual(EMPTY_MIGRATED_LAYOUT) // v2->v3 and v9->v10 ran
    expect('searchEngine' in out.settings).toBe(false) // v3->v4 ran
    expect(out.connectors).toEqual({}) // v4->v5 ran
    expect(out.habits).toEqual([]) // v5->v6 ran
    expect(out.settings.widgets.monthCal).toBe(false) // v6->v7 ran
    expect('theme' in out.settings).toBe(false) // v7->v8 ran (stripped)
    expect(out.settings.panelColor).toBeNull() // v7->v8 ran (backfilled)
    expect(out.settings.widgets.sun).toBe(false) // v8->v9 ran (backfilled)
    expect(out.settings.widgets.moon).toBe(false) // v8->v9 ran (backfilled)
  })

  it('an explicitly-true widget already present in a v1 snapshot survives the full v1->v9 chain untouched', () => {
    const v1Settings = {
      name: 'Jon',
      use24Hour: false,
      theme: 'aurora',
      units: 'metric',
      muted: false,
      widgets: { search: false, weather: true, links: true, todo: true, timer: true, quote: false },
    }
    const out = migrate({ settings: v1Settings }, 1)
    expect(out.settings.widgets.weather).toBe(true) // user's v1-era choice, still honored 8 steps later
    expect(out.settings.widgets.monthCal).toBe(false) // backfilled default (v6->v7 step, unaffected by v8->v9)
    expect(out.settings.widgets.sun).toBe(false) // backfilled default (v8->v9 step)
    expect(out.settings.widgets.moon).toBe(false) // backfilled default (v8->v9 step)
  })
})

describe('v9 -> v10', () => {
  it('maps a populated legacy layout into exact preserved legacy data and deterministic all-profile overrides', () => {
    const legacy = {
      weather: { x: 12, y: 20 },
      focus: { x: 50, y: 50 },
      github: { x: 88, y: 30 },
      timer: { x: 50, y: 96 },
    }
    const snapshot = {
      ...defaults(),
      settings: { ...defaults().settings, name: 'Keep me' },
      layout: legacy,
    }
    const before = structuredClone(snapshot)

    const out = migrate(snapshot, 9)

    const expectedProfile = {
      weather: { zone: 'day', order: 0, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned' },
      focus: { zone: 'now', order: 0, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned' },
      github: { zone: 'pulse', order: 0, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned' },
      timer: { zone: 'dock', order: 0, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned' },
    }
    expect(out.layout).toEqual({
      version: 2,
      profiles: {
        compact: expectedProfile,
        standard: expectedProfile,
        display: expectedProfile,
        ultrawide: expectedProfile,
      },
      legacy,
    })
    expect(out.settings.name).toBe('Keep me')
    expect(snapshot).toEqual(before)
  })

  it('keeps migration deterministic across repeat runs and legacy insertion order', () => {
    const first = migrate({ layout: {
      weather: { x: 10, y: 20 },
      sun: { x: 10, y: 20 },
      clock: { x: 50, y: 50 },
    } }, 9).layout as LayoutV2
    const reordered = migrate({ layout: {
      clock: { x: 50, y: 50 },
      sun: { x: 10, y: 20 },
      weather: { x: 10, y: 20 },
    } }, 9).layout as LayoutV2

    expect(reordered).toEqual(first)
    expect(migrate({ layout: first.legacy }, 9).layout).toEqual(first)
  })

  it.each([
    ['primitive', 'oops'],
    ['array', []],
    ['malformed known row', { weather: { x: 10 } }],
    ['non-finite known x', { weather: { x: Number.NaN, y: 20 } }],
    ['non-finite known y', { weather: { x: 10, y: Number.POSITIVE_INFINITY } }],
  ])('rejects %s with the typed fixed-message validation error', (_label, layout) => {
    const error = (() => {
      try {
        migrate({ layout }, 9)
      } catch (caught) {
        return caught
      }
      return undefined
    })()

    expect(error).toBeInstanceOf(LegacyLayoutValidationError)
    expect((error as Error).message).toBe(LEGACY_LAYOUT_VALIDATION_MESSAGE)
  })

  it('drops valid or malformed unknown IDs only after validating every known row', () => {
    expect((migrate({ layout: {
      weather: { x: 10, y: 20 },
      unknownValid: { x: 1, y: 2 },
      unknownMalformed: 'ignored',
    } }, 9).layout as LayoutV2).legacy).toEqual({ weather: { x: 10, y: 20 } })

    expect(() => migrate({ layout: {
      weather: { x: 'bad', y: 20 },
      unknownMalformed: 'ignored',
    } }, 9)).toThrow(LegacyLayoutValidationError)
  })

  it('requires the v9 step before producing a v10 result', () => {
    const registry = { ...migrationsWithoutNine() }
    expect(() => migrate({ layout: {} }, 9, registry)).toThrow('No migration from schema v9')
  })
})

describe('v10 -> v11', () => {
  function v10Settings(extra: Record<string, unknown> = {}) {
    const { layoutDensity: _layoutDensity, ...settings } = defaults().settings as ReturnType<typeof defaults>['settings'] & {
      layoutDensity?: unknown
    }
    return { ...settings, ...extra }
  }

  it('adds Auto Fit only to a well-formed v10 Settings object', () => {
    const settings = v10Settings({ name: 'Keep me', muted: true })
    const out = migrate({ settings }, 10)

    expect(CURRENT_VERSION).toBe(13)
    expect(out.settings).toEqual({ ...settings, layoutDensity: 'auto' })
  })

  it.each([
    ['null settings', null],
    ['string settings', 'oops'],
    ['array settings', []],
  ])('does not repair malformed v10 %s', (_label, settings) => {
    const out = migrate({ settings }, 10) as unknown as Record<string, unknown>

    expect(out.settings).toEqual(settings)
  })

  it('keeps missing v10 settings explicitly invalid instead of defaulting them', () => {
    const out = migrate({}, 10) as unknown as Record<string, unknown>

    expect(Object.hasOwn(out, 'settings')).toBe(true)
    expect(out.settings).toBeUndefined()
  })

  it('does not normalize an invalid explicit v10 density', () => {
    const settings = v10Settings({ layoutDensity: 'dense' })
    const out = migrate({ settings }, 10)

    expect((out.settings as unknown as Record<string, unknown>).layoutDensity).toBe('dense')
  })

  it('preserves layout, legacy coordinates, connectors, unknown stores, and every Settings sibling', () => {
    const layout = layoutV2FromLegacy({ clock: { x: 12, y: 34 } })
    const connectors = { github: { enabled: true, token: 'local-only', username: 'octocat' } }
    const settings = v10Settings({ name: 'Jon', panelColor: '#123456' })
    const unknownStore = { future: ['keep'] }
    const out = migrate({ settings, layout, connectors, unknownStore }, 10) as AuroraData & {
      unknownStore: typeof unknownStore
    }

    expect(out.settings).toEqual({ ...settings, layoutDensity: 'auto' })
    expect(out.layout).toEqual(layout)
    expect((out.layout as LayoutV2).legacy).toEqual({ clock: { x: 12, y: 34 } })
    expect(out.connectors).toEqual(connectors)
    expect(out.unknownStore).toEqual(unknownStore)
  })

  it.each(['auto', 'compact', 'balanced', 'spacious'] as const)(
    'round-trips valid current-v11 density %s without mutation',
    (layoutDensity) => {
      const snapshot = {
        ...defaults(),
        settings: { ...defaults().settings, name: 'Current', layoutDensity },
      }
      const before = structuredClone(snapshot)

      expect(migrate(snapshot, 11)).toEqual(before)
      expect(snapshot).toEqual(before)
    },
  )

  it('is idempotent after a v10 migration and older snapshots run sequentially through v11', () => {
    const v10 = migrate({ settings: v10Settings(), layout: { version: 2, profiles: {} } }, 10)
    expect(migrate(v10 as unknown as Record<string, unknown>, 11)).toEqual(v10)

    const fromV9 = migrate({ settings: v10Settings(), layout: { clock: { x: 50, y: 50 } } }, 9)
    expect(fromV9.settings.layoutDensity).toBe('auto')
    expect((fromV9.layout as LayoutV2).version).toBe(2)
    expect((fromV9.layout as LayoutV2).legacy).toEqual({ clock: { x: 50, y: 50 } })
  })
})

describe('v11 -> v12', () => {
  it.each([
    ['V1', { clock: { x: 12.25, y: 34.75 } }],
    ['V2', { version: 2, profiles: {}, legacy: { focus: { x: 50, y: 60 } } }],
  ])('preserves the exact %s layout value and every sibling', (_label, layout) => {
    const snapshot = {
      ...defaults(),
      settings: { ...defaults().settings, name: 'Keep me' },
      layout,
      unknownStore: { future: ['keep'] },
    }
    const before = structuredClone(snapshot)

    const out = migrate(snapshot, 11) as AuroraData & { unknownStore: { future: string[] } }

    expect(CURRENT_VERSION).toBe(13)
    expect(out.layout).toEqual(layout)
    expect(out.settings).toEqual(snapshot.settings)
    expect(out.unknownStore).toEqual(snapshot.unknownStore)
    expect(snapshot).toEqual(before)
  })

  it('requires the identity v11 migration step', () => {
    expect(() => migrate({ layout: { version: 2, profiles: {} } }, 11, {}))
      .toThrow('No migration from schema v11')
  })
})

describe('v12 -> v13', () => {
  it('is the identity: layouts arrives as null via the default merge only', () => {
    const snapshot = { ...defaults(), settings: { ...defaults().settings, name: 'Kept' } } as Record<string, unknown>
    delete snapshot.layouts
    const migrated = migrate(snapshot, 12)
    expect(migrated.layouts).toBeNull()
    expect(migrated.settings.name).toBe('Kept')
  })

  it('a stored layouts document survives migrate untouched', () => {
    const document = {
      version: 1,
      activeLayoutId: 'a',
      layouts: [{ id: 'a', name: 'Desktop', widgets: {} }],
    }
    const migrated = migrate({ ...defaults(), layouts: document }, 12)
    expect(migrated.layouts).toEqual(document)
  })

  it('a v9 legacy snapshot still migrates to the current version with layouts null', () => {
    const migrated = migrate({ ...defaults(), layout: { clock: { x: 50, y: 20 } } }, 9)
    expect(migrated.layouts).toBeNull()
  })
})

function migrationsWithoutNine(): Record<number, Migration> {
  return {}
}
