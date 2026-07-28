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
      // registry[0] upgrades v0 -> v1, registry[1] upgrades v1 -> v2 (CURRENT_VERSION)
      0: (data) => {
        calls.push(0)
        return { ...data, focus: { text: 'migrated', date: '2026-07-26', done: false } }
      },
      1: (data) => {
        calls.push(1)
        return data
      },
    }
    const out = migrate({}, 0, registry)
    expect(calls).toEqual([0, 1])
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
