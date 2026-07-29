import { describe, expect, it } from 'vitest'
import { pickTier } from './tier'

describe('pickTier', () => {
  it('picks the 2.5K tier when physical pixels are below the 2560 boundary', () => {
    expect(pickTier(1920, 1)).toBe('2560x1600')
  })

  it('picks the 2.5K tier exactly at the 2560 boundary (no upscale needed yet)', () => {
    expect(pickTier(2560, 1)).toBe('2560x1600')
  })

  it('picks the 4K tier one pixel past the boundary', () => {
    expect(pickTier(2561, 1)).toBe('3840x2400')
  })

  it('picks the 4K tier for a high-DPR laptop panel under the 2560 CSS-px boundary', () => {
    // 1440 CSS px * 2 DPR = 2880 physical px, past the boundary even though
    // the CSS dimension alone is well under 2560.
    expect(pickTier(1440, 2)).toBe('3840x2400')
  })

  it('picks the 2.5K tier for a 1x display comfortably under the boundary', () => {
    expect(pickTier(1366, 1)).toBe('2560x1600')
  })

  it('picks the 4K tier for a 4K display at 1x DPR', () => {
    expect(pickTier(3840, 1)).toBe('3840x2400')
  })

  it('treats a DPR of exactly the boundary ratio as still 2.5K (product == 2560)', () => {
    expect(pickTier(1280, 2)).toBe('2560x1600')
  })
})
