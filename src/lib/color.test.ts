import { describe, expect, it } from 'vitest'
import { relativeLuminance, derivedFg, isPanelColor } from './color'

describe('relativeLuminance (WCAG 2.x, linearized channels)', () => {
  it('is 0 for black and 1 for white (the endpoints)', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBe(1)
  })

  it('is ≈0.216 for mid-gray #808080 (the canonical linearized value)', () => {
    expect(relativeLuminance('#808080')).toBeCloseTo(0.216, 3)
  })

  it('reads a bright off-white as near-1', () => {
    expect(relativeLuminance('#f5f5f5')).toBeGreaterThan(0.9)
  })

  it('reads a deep indigo as near-0', () => {
    expect(relativeLuminance('#3b2f6b')).toBeLessThan(0.1)
  })

  it('is case-insensitive on the hex digits', () => {
    expect(relativeLuminance('#ABCDEF')).toBe(relativeLuminance('#abcdef'))
  })
})

describe('derivedFg (readable text + color-scheme for a panel color)', () => {
  it('a dark panel keeps the default off-white text and a dark scheme', () => {
    const { fg, fgMuted, scheme } = derivedFg('#3b2f6b')
    expect(scheme).toBe('dark')
    expect(fg).toBe('#f5f5f4')
    expect(fgMuted).toBe('rgb(245 245 244 / 0.68)')
  })

  it('pure black is dark: light text, dark scheme', () => {
    expect(derivedFg('#000000').scheme).toBe('dark')
    expect(derivedFg('#000000').fg).toBe('#f5f5f4')
  })

  it('a bright panel (#f5f5f5) flips to near-black text and a light scheme', () => {
    const { fg, fgMuted, scheme } = derivedFg('#f5f5f5')
    expect(scheme).toBe('light')
    expect(fg).toBe('#1a1a1a')
    expect(fgMuted).toBe('rgb(26 26 26 / 0.68)')
  })

  it('pure white is light: dark text, light scheme', () => {
    expect(derivedFg('#ffffff').scheme).toBe('light')
    expect(derivedFg('#ffffff').fg).toBe('#1a1a1a')
  })

  it('flips at the ~0.45 luminance threshold — #b0b0b0 (≈0.434) stays dark-scheme', () => {
    // Just BELOW the threshold: still a "dark" panel needing light text.
    expect(derivedFg('#b0b0b0').scheme).toBe('dark')
  })

  it('flips at the ~0.45 luminance threshold — #bbbbbb (≈0.497) crosses to light-scheme', () => {
    // Just ABOVE the threshold: a "light" panel needing dark text.
    expect(derivedFg('#bbbbbb').scheme).toBe('light')
  })
})

describe('isPanelColor (the stored #rrggbb shape)', () => {
  it('accepts a full 6-digit hex, case-insensitively', () => {
    expect(isPanelColor('#AbC123')).toBe(true)
    expect(isPanelColor('#000000')).toBe(true)
    expect(isPanelColor('#ffffff')).toBe(true)
  })

  it('rejects the 3-digit short form', () => {
    expect(isPanelColor('#fff')).toBe(false)
  })

  it('rejects garbage, an 8-digit hex, and a named color', () => {
    expect(isPanelColor('red')).toBe(false)
    expect(isPanelColor('#12ab34ff')).toBe(false)
    expect(isPanelColor('rgb(0,0,0)')).toBe(false)
    expect(isPanelColor('12ab34')).toBe(false)
  })

  it('null is not a panelColor string (narrows the union)', () => {
    expect(isPanelColor(null)).toBe(false)
    expect(isPanelColor(undefined)).toBe(false)
    expect(isPanelColor(0x12ab34)).toBe(false)
  })
})
