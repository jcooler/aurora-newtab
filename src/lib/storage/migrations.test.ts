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
      // registry[0] upgrades v0 -> v1 (CURRENT_VERSION)
      0: (data) => {
        calls.push(0)
        return { ...data, focus: { text: 'migrated', date: '2026-07-26', done: false } }
      },
    }
    const out = migrate({}, 0, registry)
    expect(calls).toEqual([0])
    expect(out.focus?.text).toBe('migrated')
  })

  it('throws when a migration step is missing', () => {
    expect(() => migrate({}, -1, {})).toThrow(/No migration/)
  })
})
