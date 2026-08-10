import { describe, expect, it } from 'vitest'
import { NOTABLE_PRECIP, rainCallout } from './callout'

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

// The "possible rain" line is gated on NOTABLE_PRECIP; this pins the seam at
// the exact boundary from both sides so a one-point drift can't slip through.
describe('rainCallout NOTABLE_PRECIP boundary', () => {
  it('speaks up at exactly the notable threshold', () => {
    expect(rainCallout([hour(13, NOTABLE_PRECIP), hour(14, 0)], false)).toContain('Possible rain')
  })

  it('stays quiet one point below it', () => {
    expect(rainCallout([hour(13, NOTABLE_PRECIP - 1), hour(14, 0)], false)).toBeNull()
  })
})
