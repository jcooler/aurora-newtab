// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { applyPanelColor } from './index'

function el() {
  return document.createElement('div')
}

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-scheme')
})

describe('applyPanelColor', () => {
  it('null removes every inline override so themes.css :root wins', () => {
    const e = el()
    // Pre-seed overrides, then clear them.
    applyPanelColor(e, '#123456')
    applyPanelColor(e, null)
    expect(e.style.getPropertyValue('--panel-solid')).toBe('')
    expect(e.style.getPropertyValue('--panel')).toBe('')
    expect(e.style.getPropertyValue('--fg')).toBe('')
    expect(e.style.getPropertyValue('--fg-muted')).toBe('')
    expect(e.hasAttribute('data-scheme')).toBe(false)
  })

  it('an invalid (non-#rrggbb) value is treated as null', () => {
    const e = el()
    applyPanelColor(e, '#123456')
    applyPanelColor(e, 'red')
    expect(e.style.getPropertyValue('--panel-solid')).toBe('')
    expect(e.hasAttribute('data-scheme')).toBe(false)
  })

  it('a dark color sets --panel-solid at 95% and --panel at 40%, keeps light fg, no light scheme', () => {
    const e = el()
    applyPanelColor(e, '#3b2f6b')
    expect(e.style.getPropertyValue('--panel-solid')).toBe('#3b2f6bf2')
    expect(e.style.getPropertyValue('--panel')).toBe('#3b2f6b66')
    expect(e.style.getPropertyValue('--fg')).toBe('#f5f5f4')
    expect(e.style.getPropertyValue('--fg-muted')).toBe('rgb(245 245 244 / 0.68)')
    expect(e.hasAttribute('data-scheme')).toBe(false)
  })

  it('a light color flips --fg to near-black and stamps data-scheme="light"', () => {
    const e = el()
    applyPanelColor(e, '#f5f5f5')
    expect(e.style.getPropertyValue('--panel-solid')).toBe('#f5f5f5f2')
    expect(e.style.getPropertyValue('--fg')).toBe('#1a1a1a')
    expect(e.style.getPropertyValue('--fg-muted')).toBe('rgb(26 26 26 / 0.68)')
    expect(e.getAttribute('data-scheme')).toBe('light')
  })

  it('a light pick adapts the PANEL ink (--fg) but NEVER the CANVAS ink (--canvas-fg)', () => {
    // The photo-floating text set reads --canvas-fg/--canvas-fg-muted, which the
    // engine must leave entirely alone (Task 60 fix round): a light panel pick
    // darkens panel text for legibility on the now-light panels, but the clock/
    // greeting/quote sit on the unchanged photograph and must keep light ink.
    const e = el()
    applyPanelColor(e, '#f5f5f5')
    expect(e.style.getPropertyValue('--fg')).toBe('#1a1a1a') // panel ink adapts
    expect(e.style.getPropertyValue('--canvas-fg')).toBe('') // canvas ink untouched
    expect(e.style.getPropertyValue('--canvas-fg-muted')).toBe('') // ditto
  })

  it('re-applying a dark color after a light one clears the light scheme stamp', () => {
    const e = el()
    applyPanelColor(e, '#ffffff')
    expect(e.getAttribute('data-scheme')).toBe('light')
    applyPanelColor(e, '#000000')
    expect(e.hasAttribute('data-scheme')).toBe(false)
  })
})
