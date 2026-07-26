// src/services/photos/rotation.test.ts
import { describe, expect, it } from 'vitest'
import { nextPhoto, resolvePhoto } from './rotation'

describe('resolvePhoto', () => {
  it('rotates to a deterministic daily index on a new day', () => {
    const prefs = { mode: 'auto' as const, index: 2, lastRotated: '2026-07-25' }
    const a = resolvePhoto(prefs, '2026-07-26', 10)
    const b = resolvePhoto(prefs, '2026-07-26', 10)
    expect(a).toEqual(b)
    expect(a.rotated).toBe(true)
    expect(a.index).toBeGreaterThanOrEqual(0)
    expect(a.index).toBeLessThan(10)
  })

  it('keeps the stored index within the same day', () => {
    const prefs = { mode: 'auto' as const, index: 7, lastRotated: '2026-07-26' }
    expect(resolvePhoto(prefs, '2026-07-26', 10)).toEqual({ index: 7, rotated: false })
  })

  it('clamps a stale index when the photo count shrank', () => {
    const prefs = { mode: 'auto' as const, index: 99, lastRotated: '2026-07-26' }
    expect(resolvePhoto(prefs, '2026-07-26', 10).index).toBeLessThan(10)
  })

  it('handles an empty photo set', () => {
    const prefs = { mode: 'auto' as const, index: 0, lastRotated: '' }
    expect(resolvePhoto(prefs, '2026-07-26', 0)).toEqual({ index: 0, rotated: false })
  })
})

describe('nextPhoto', () => {
  it('advances with wraparound and marks today as rotated', () => {
    // lastRotated is today's date (not yesterday's): nextPhoto composes on top of
    // resolvePhoto, which only preserves prefs.index when lastRotated === today;
    // otherwise it substitutes the day's hash-rotated index. Setting lastRotated to
    // yesterday here would make resolvePhoto discard index 9 in favor of the hash
    // index for '2026-07-26', making the +1 wraparound-to-0 assertion below
    // unreachable regardless of implementation. See task-6-report.md for the
    // brief-vs-implementation discrepancy this fixture originally had.
    const prefs = { mode: 'auto' as const, index: 9, lastRotated: '2026-07-26' }
    expect(nextPhoto(prefs, '2026-07-26', 10)).toEqual({
      mode: 'auto',
      index: 0,
      lastRotated: '2026-07-26',
    })
  })
})
