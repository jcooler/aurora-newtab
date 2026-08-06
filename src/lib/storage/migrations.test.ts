import { describe, expect, it } from 'vitest'
import { defaults } from './schema'
import { migrate, type Migration } from './migrations'

describe('migrate', () => {
  it('fills an empty snapshot with defaults', () => {
    expect(migrate({}, 1)).toEqual(defaults())
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
      // upgrades v2 -> v3, registry[3] upgrades v3 -> v4 (CURRENT_VERSION)
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
    }
    const out = migrate({}, 0, registry)
    expect(calls).toEqual([0, 1, 2, 3])
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
    expect(out.layout).toEqual({})
  })
  it('a v1 snapshot chains through both migrations', () => {
    const out = migrate({}, 1)
    expect(out.settings.widgets.notes).toBe(true) // v1->v2 still ran
    expect(out.layout).toEqual({}) // v2->v3 ran after it
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
    expect(out.layout).toEqual({}) // v2->v3 ran
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
