import { describe, expect, it } from 'vitest'
import type { HourlyPoint } from '../../lib/storage/schema'
import { PRECIP_FLOOR, forecastRange, forecastSlots } from './forecast'

const hour = (h: number, tempC: number, precipProb = 0): HourlyPoint => ({
  time: `2026-08-06T${String(h).padStart(2, '0')}:00`,
  tempC,
  precipProb,
  code: 2,
  isDay: true,
})

const twelve = Array.from({ length: 12 }, (_, i) => hour(9 + i, 20 + i, i))

describe('forecastSlots', () => {
  it('samples six slots every two hours from a 12-hour window', () => {
    const slots = forecastSlots(twelve)
    expect(slots.map((s) => s.index)).toEqual([0, 2, 4, 6, 8, 10])
    expect(slots).toHaveLength(6)
  })

  it('marks only the first slot as "now"', () => {
    const slots = forecastSlots(twelve)
    expect(slots.map((s) => s.now)).toEqual([true, false, false, false, false, false])
  })

  it('carries each slot\'s own hourly point through unchanged', () => {
    const slots = forecastSlots(twelve)
    expect(slots[0]!.point).toBe(twelve[0])
    expect(slots[2]!.point).toBe(twelve[4])
  })

  it('stops early rather than inventing hours on a short window', () => {
    const slots = forecastSlots([hour(9, 20), hour(10, 21), hour(11, 22), hour(12, 23), hour(13, 24)])
    expect(slots.map((s) => s.index)).toEqual([0, 2, 4])
  })

  it('returns nothing for an empty forecast', () => {
    expect(forecastSlots([])).toEqual([])
  })
})

describe('forecastRange', () => {
  it('reports the high and low across the WHOLE window, not just the sampled slots', () => {
    // Peak 84 sits at an ODD hour (index 5), which no even-hour slot samples —
    // the header carries the number the grid never shows a column for.
    const hourly = [hour(9, 61), hour(10, 70), hour(11, 78), hour(12, 80), hour(13, 82), hour(14, 84), hour(15, 64)]
    expect(forecastRange(hourly)).toEqual({ hiC: 84, loC: 61 })
    expect(forecastSlots(hourly).some((s) => s.point.tempC === 84)).toBe(false)
  })

  it('handles a single-hour window', () => {
    expect(forecastRange([hour(9, 20)])).toEqual({ hiC: 20, loC: 20 })
  })

  it('returns null for an empty forecast', () => {
    expect(forecastRange([])).toBeNull()
  })
})

describe('PRECIP_FLOOR', () => {
  it('is the 10% grid floor, lower than the callout\'s notable threshold', () => {
    expect(PRECIP_FLOOR).toBe(10)
  })
})
