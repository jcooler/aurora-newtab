import { describe, expect, it } from 'vitest'
import { contrastRatio, derivedFg, isPanelColor, mutedInk, relativeLuminance } from './color'

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

  it('chooses the higher-contrast ink rather than a fixed luminance threshold', () => {
    expect(derivedFg('#b0b0b0').scheme).toBe('light')
  })

  it('flips at the ~0.45 luminance threshold — #bbbbbb (≈0.497) crosses to light-scheme', () => {
    // Just ABOVE the threshold: a "light" panel needing dark text.
    expect(derivedFg('#bbbbbb').scheme).toBe('light')
  })

  it.each(['#000000', '#e5e7eb', '#0057b8', '#ff69b4'])('keeps primary panel ink above 4.5:1 on %s', (panel) => {
    expect(contrastRatio(derivedFg(panel).fg, panel)).toBeGreaterThanOrEqual(4.5)
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

describe('contrastRatio / mutedInk (appearance system, 2026-08-18)', () => {
  it('white on black is 21:1, identical colors are 1:1, and order does not matter', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#ff69b4', '#ff69b4')).toBeCloseTo(1, 5)
  })

  it('flags the real failure case: dark text on a dark panel falls below the 4.5 floor', () => {
    expect(contrastRatio('#333333', '#0a0a0a')).toBeLessThan(4.5)
    expect(contrastRatio('#f5f5f4', '#0a0a0a')).toBeGreaterThan(4.5)
  })

  it('mutedInk derives the SAME color at the standing 0.68 alpha (0xad), from any pick', () => {
    expect(mutedInk('#ff69b4')).toBe('#ff69b4ad')
    expect(mutedInk('#112233')).toBe('#112233ad')
  })
})
