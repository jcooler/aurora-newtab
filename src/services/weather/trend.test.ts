import { describe, expect, it } from 'vitest'
import type { HourlyPoint } from '../../lib/storage/schema'
import { TREND_VIEWBOX, tickIndices, trendGeometry } from './trend'

const hour = (h: number, tempC: number, precipProb = 0): HourlyPoint => ({
  time: `2026-08-06T${String(h).padStart(2, '0')}:00`,
  tempC,
  precipProb,
  code: 2,
  isDay: true,
})

/** Every coordinate the graphic emits must land inside the viewBox — the one
 *  invariant that guarantees the <svg> can never overflow its container (and
 *  therefore never create the scroll region / scrollbar this graphic replaced). */
function numbersIn(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
}

describe('trendGeometry', () => {
  it('returns null when there is nothing plottable', () => {
    expect(trendGeometry([])).toBeNull()
    expect(trendGeometry([hour(9, 20)])).toBeNull()
  })

  it('draws a curve that starts at the first hour and passes through the last', () => {
    const geo = trendGeometry([hour(9, 10), hour(10, 20), hour(11, 15)])!
    expect(geo.line.startsWith('M 10 ')).toBe(true)
    expect(geo.line).toContain(` ${TREND_VIEWBOX.w - 10} `)
    expect(geo.start.x).toBe(10)
  })

  it('draws a small temperature swing shallow instead of stretching it to fill the band', () => {
    const flatish = trendGeometry([hour(9, 20), hour(10, 21), hour(11, 20)])!
    const dramatic = trendGeometry([hour(9, 10), hour(10, 30), hour(11, 10)])!
    const amplitude = (geo: NonNullable<ReturnType<typeof trendGeometry>>) => {
      const ys = numbersIn(geo.line).filter((_, i) => i % 2 === 1)
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(amplitude(flatish)).toBeLessThan(amplitude(dramatic) / 2)
  })

  it('keeps every coordinate inside the viewBox at both temperature extremes', () => {
    const geo = trendGeometry(
      Array.from({ length: 12 }, (_, i) => hour(9 + i, i % 2 === 0 ? -40 : 45, i * 9)),
    )!
    for (const n of [...numbersIn(geo.line), ...numbersIn(geo.area)]) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(TREND_VIEWBOX.w)
    }
    for (const c of geo.columns) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(TREND_VIEWBOX.w)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y + c.h).toBeLessThanOrEqual(TREND_VIEWBOX.h)
    }
  })

  it('centres a flat series instead of dividing by zero', () => {
    const geo = trendGeometry([hour(9, 20), hour(10, 20), hour(11, 20)])!
    for (const n of numbersIn(geo.line)) expect(Number.isFinite(n)).toBe(true)
    expect(geo.hi.tempC).toBe(20)
    expect(geo.lo.tempC).toBe(20)
  })

  it('closes the area path back to the baseline so the fill is bounded', () => {
    const geo = trendGeometry([hour(9, 10), hour(10, 20)])!
    expect(geo.area.endsWith('Z')).toBe(true)
    expect(geo.area.startsWith(geo.line)).toBe(true)
  })

  it('reports the window high and low with their hour indices', () => {
    const geo = trendGeometry([hour(9, 12), hour(10, 25), hour(11, 8)])!
    expect(geo.hi).toEqual({ tempC: 25, index: 1 })
    expect(geo.lo).toEqual({ tempC: 8, index: 2 })
  })

  it('draws a column only for hours whose rain chance is worth reading', () => {
    const geo = trendGeometry([hour(9, 20, 0), hour(10, 21, 40), hour(11, 22, 4), hour(12, 23, 10)])!
    expect(geo.columns.map((c) => c.i)).toEqual([1, 3])
  })

  it('gives a just-above-floor chance a legible minimum height', () => {
    const geo = trendGeometry([hour(9, 20, 10), hour(10, 21, 0)])!
    expect(geo.columns).toHaveLength(1)
    expect(geo.columns[0]!.h).toBeGreaterThanOrEqual(2)
  })

  it('marks only the columns at or above the callout threshold as notable', () => {
    const geo = trendGeometry([hour(9, 20, 29), hour(10, 21, 30), hour(11, 22, 90)])!
    expect(geo.columns.map((c) => c.notable)).toEqual([false, true, true])
  })

  it('draws no columns at all on a dry forecast, and drops the empty rain band', () => {
    const geo = trendGeometry([hour(9, 20, 0), hour(10, 21, 2), hour(11, 22, 0)])!
    expect(geo.columns).toEqual([])
    expect(geo.height).toBe(TREND_VIEWBOX.hDry)
    expect(geo.height).toBeLessThan(TREND_VIEWBOX.h)
    expect(geo.baseline).toBeLessThanOrEqual(geo.height)
  })

  it('keeps the full drawing height when there is rain to show', () => {
    const geo = trendGeometry([hour(9, 20, 0), hour(10, 21, 55)])!
    expect(geo.height).toBe(TREND_VIEWBOX.h)
  })

  it('scales column height with probability, clamped to the precip band', () => {
    const geo = trendGeometry([hour(9, 20, 100), hour(10, 21, 50)])!
    expect(geo.columns[0]!.h).toBeGreaterThan(geo.columns[1]!.h)
    expect(geo.columns[0]!.y + geo.columns[0]!.h).toBeCloseTo(geo.baseline, 5)
  })

  it('reports the peak rain chance for the accessible summary', () => {
    const geo = trendGeometry([hour(9, 20, 5), hour(10, 21, 70), hour(11, 22, 20)])!
    expect(geo.peakPrecip).toEqual({ prob: 70, index: 1 })
  })

  it('clamps out-of-range probabilities rather than drawing outside the band', () => {
    const geo = trendGeometry([hour(9, 20, 400), hour(10, 21, -20)])!
    expect(geo.columns).toHaveLength(1)
    expect(geo.columns[0]!.y).toBeGreaterThanOrEqual(0)
  })
})

describe('tickIndices', () => {
  it('spaces four labels across a 12-hour window, first and last included', () => {
    expect(tickIndices(12)).toEqual([0, 4, 7, 11])
  })
  it('never repeats an index on a short window', () => {
    expect(tickIndices(3)).toEqual([0, 1, 2])
    expect(tickIndices(2)).toEqual([0, 1])
    expect(tickIndices(1)).toEqual([0])
    expect(tickIndices(0)).toEqual([])
  })
})
