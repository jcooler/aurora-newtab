import { describe, expect, it } from 'vitest'
import { rainCallout } from './callout'
import { NOTABLE_PRECIP, trendGeometry } from './trend'

const hour = (h: number, precipProb: number) => ({
  time: `2026-07-26T${String(h).padStart(2, '0')}:00`,
  tempC: 20,
  precipProb,
  code: 61,
})

describe('rainCallout', () => {
  it('announces the first hour with >=50% probability', () => {
    expect(rainCallout([hour(13, 10), hour(14, 20), hour(15, 60)], false)).toBe(
      'Rain likely around 3 PM.',
    )
  })
  it('softens the message between 30 and 49%', () => {
    expect(rainCallout([hour(13, 10), hour(15, 35)], false)).toBe(
      'Possible rain around 3 PM.',
    )
  })
  it('respects 24-hour format', () => {
    expect(rainCallout([hour(15, 80)], true)).toBe('Rain likely around 15:00.')
  })
  it('stays quiet on a dry forecast', () => {
    expect(rainCallout([hour(13, 0), hour(14, 20)], false)).toBeNull()
  })
  it('handles an empty forecast', () => {
    expect(rainCallout([], false)).toBeNull()
  })
})

// The callout and the expanded panel's trend graphic are read together — the
// callout names the hour, the graphic shows the shape. They share
// NOTABLE_PRECIP (trend.ts) precisely so they can't drift into disagreeing;
// this pins the seam from both sides at the exact boundary.
describe('rainCallout / trend graphic shared threshold', () => {
  it('speaks up at exactly the probability the graphic starts emphasising', () => {
    const at = [hour(13, NOTABLE_PRECIP), hour(14, 0)]
    expect(rainCallout(at, false)).toContain('Possible rain')
    expect(trendGeometry(at)!.columns.some((c) => c.notable)).toBe(true)
  })

  it('stays quiet one point below it, where the graphic draws nothing notable', () => {
    const below = [hour(13, NOTABLE_PRECIP - 1), hour(14, 0)]
    expect(rainCallout(below, false)).toBeNull()
    expect(trendGeometry(below)!.columns.some((c) => c.notable)).toBe(false)
  })
})
