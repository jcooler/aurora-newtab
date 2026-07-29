import { describe, expect, it } from 'vitest'
import { pickTier } from './tier'

describe('pickTier', () => {
  it('picks the 2.5K tier when physical pixels are below the 2400 boundary', () => {
    expect(pickTier(1920, 1)).toBe('2560x1600')
  })

  it('picks the 4K tier exactly at the 2400 boundary (1440p-class and up is generous)', () => {
    expect(pickTier(2400, 1)).toBe('3840x2400')
  })

  it('picks the 2.5K tier one pixel below the boundary', () => {
    expect(pickTier(2399, 1)).toBe('2560x1600')
  })

  it('picks the 4K tier for a 2.5K display at 1x DPR (well past the 1440p-class boundary)', () => {
    expect(pickTier(2560, 1)).toBe('3840x2400')
  })

  it('picks the 4K tier for a high-DPR laptop panel under the 2400 CSS-px boundary', () => {
    // 1440 CSS px * 2 DPR = 2880 physical px, past the boundary even though
    // the CSS dimension alone is well under 2400.
    expect(pickTier(1440, 2)).toBe('3840x2400')
  })

  it('picks the 2.5K tier for a 1x display comfortably under the boundary', () => {
    expect(pickTier(1366, 1)).toBe('2560x1600')
  })

  it('picks the 4K tier for a 4K display at 1x DPR', () => {
    expect(pickTier(3840, 1)).toBe('3840x2400')
  })

  it('picks the 4K tier once DPR scaling carries a sub-1440p CSS size past the boundary', () => {
    // 1280 CSS px * 2 DPR = 2560 physical px, comfortably past 2400.
    expect(pickTier(1280, 2)).toBe('3840x2400')
  })

  // Fractional DPR (Windows 150% display scaling reports devicePixelRatio
  // 1.5) can land exactly on the 2400 boundary from a whole logical pixel —
  // 2400 / 1.5 = 1600 — so the two cases below pin the integer just below
  // and exactly at the boundary, matching how a real 150%-scaled Windows
  // display would report itself.
  it('picks the 2.5K tier at DPR 1.5 just below the boundary (1599 CSS px * 1.5 = 2398.5 physical)', () => {
    expect(pickTier(1599, 1.5)).toBe('2560x1600')
  })

  it('picks the 4K tier at DPR 1.5 exactly at the boundary (1600 CSS px * 1.5 = 2400 physical)', () => {
    expect(pickTier(1600, 1.5)).toBe('3840x2400')
  })
})
