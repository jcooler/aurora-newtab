// Ephemeris fixtures — retrieved 2026-08-11 for Task 92 (build-time
// verification, the SP2 curated-list discipline). Source: USNO Astronomical
// Applications moon-phases API
// (https://aa.usno.navy.mil/api/moon/phases/date?date=YYYY-MM-DD&nump=N),
// times UTC.
//   2000-01-21 04:41  Full Moon   (the lunar-eclipse anchor near the epoch)
//   2026-01-18 19:52  New Moon
//   2026-06-21 21:55  First Quarter
//   2026-06-29 23:56  Full Moon
//   2026-09-04 07:51  Last Quarter
//
// Each fixture's fraction-of-cycle (computed independently from the
// SYNODIC_DAYS/reference-epoch constants the brief specifies, not from
// moonPhase() itself) lands well inside its principal-phase segment:
//   Full Moon(2000-01-21)  frac 0.4888  (segment [0.4375, 0.5625))
//   New Moon               frac 0.0074  (segment [0, 0.0625) / >=0.9375)
//   First Quarter          frac 0.2252  (segment [0.1875, 0.3125))
//   Full Moon(2026-06-29)  frac 0.4990  (segment [0.4375, 0.5625))
//   Last Quarter           frac 0.7451  (segment [0.6875, 0.8125))

import { describe, expect, it } from 'vitest'
import { moonPhase, SYNODIC_DAYS } from './moon'

const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0)

describe('moonPhase — principal-phase fixtures', () => {
  it('2000-01-21T04:41Z (the lunar-eclipse epoch anchor) is Full moon', () => {
    expect(moonPhase(new Date('2000-01-21T04:41:00Z')).name).toBe('Full moon')
  })

  it('2026-01-18T19:52Z is New moon', () => {
    expect(moonPhase(new Date('2026-01-18T19:52:00Z')).name).toBe('New moon')
  })

  it('2026-06-21T21:55Z is First quarter', () => {
    expect(moonPhase(new Date('2026-06-21T21:55:00Z')).name).toBe('First quarter')
  })

  it('2026-06-29T23:56Z is Full moon', () => {
    expect(moonPhase(new Date('2026-06-29T23:56:00Z')).name).toBe('Full moon')
  })

  it('2026-09-04T07:51Z is Last quarter', () => {
    expect(moonPhase(new Date('2026-09-04T07:51:00Z')).name).toBe('Last quarter')
  })
})

describe('moonPhase — derived cases', () => {
  it('4 days after a fixture new moon is Waxing crescent', () => {
    const fourDaysLater = new Date(new Date('2026-01-18T19:52:00Z').getTime() + 4 * 86_400_000)
    expect(moonPhase(fourDaysLater).name).toBe('Waxing crescent')
  })

  it('fenceposts the New moon / Waxing crescent boundary at fraction 1/16', () => {
    const boundaryMs = REF_NEW_MOON_MS + SYNODIC_DAYS * (1 / 16) * 86_400_000
    const justBefore = new Date(boundaryMs - 60_000)
    const justAfter = new Date(boundaryMs + 60_000)
    expect(moonPhase(justBefore).name).toBe('New moon')
    expect(moonPhase(justAfter).name).toBe('Waxing crescent')
  })

  it('southern mirrors the crescent glyph but keeps the name', () => {
    const fourDaysLater = new Date(new Date('2026-01-18T19:52:00Z').getTime() + 4 * 86_400_000)
    const northern = moonPhase(fourDaysLater, false)
    const southern = moonPhase(fourDaysLater, true)
    expect(northern.name).toBe('Waxing crescent')
    expect(southern.name).toBe('Waxing crescent')
    expect(northern.glyph).toBe('🌒')
    expect(southern.glyph).toBe('🌘')
  })

  it('southern mirrors the first-quarter glyph but keeps the name', () => {
    const date = new Date('2026-06-21T21:55:00Z')
    const northern = moonPhase(date, false)
    const southern = moonPhase(date, true)
    expect(northern.name).toBe('First quarter')
    expect(southern.name).toBe('First quarter')
    expect(northern.glyph).toBe('🌓')
    expect(southern.glyph).toBe('🌗')
  })

  it('age always stays within [0, SYNODIC_DAYS)', () => {
    const dates = [
      new Date('2000-01-21T04:41:00Z'), // at the reference epoch's neighborhood
      new Date('1999-06-15T00:00:00Z'), // before the reference epoch
      new Date('2026-01-18T19:52:00Z'),
      new Date('2026-09-04T07:51:00Z'),
      new Date(REF_NEW_MOON_MS), // exactly at the reference epoch (age should be ~0)
    ]
    for (const date of dates) {
      const { age } = moonPhase(date)
      expect(age).toBeGreaterThanOrEqual(0)
      expect(age).toBeLessThan(SYNODIC_DAYS)
    }
  })
})
