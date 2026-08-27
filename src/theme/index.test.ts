// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { applyInkColors, applyPanelColor, type AppearanceInks } from './index'

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

  it('derives a panel accent/focus token that remains readable on bright pink', () => {
    const e = el()
    applyPanelColor(e, '#ff69b4')
    expect(e.style.getPropertyValue('--panel-accent')).toBe('#1a1a1a')
    expect(e.style.getPropertyValue('--fg')).toBe('#1a1a1a')
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

describe('applyInkColors (owner-approved 2026-08-18 appearance system)', () => {
  const AUTO: AppearanceInks = { widgetText: null, photoText: null, clock: null, greeting: null, quote: null }

  it('a widget-text pick overrides the panel-derived pair, muted DERIVING at the standing 0.68 alpha', () => {
    const e = el()
    applyPanelColor(e, '#ff69b4') // bright pink panels — never assume black
    applyInkColors(e, { ...AUTO, widgetText: '#112233' })
    expect(e.style.getPropertyValue('--fg')).toBe('#112233')
    expect(e.style.getPropertyValue('--fg-muted')).toBe('#112233ad')
  })

  it('clearing the widget-text pick re-derives from the panel on the next composed apply', () => {
    const e = el()
    applyPanelColor(e, '#ffffff')
    applyInkColors(e, { ...AUTO, widgetText: '#112233' })
    expect(e.style.getPropertyValue('--fg')).toBe('#112233')
    // The App effect always runs the pair in order: derive, then override.
    applyPanelColor(e, '#ffffff')
    applyInkColors(e, AUTO)
    expect(e.style.getPropertyValue('--fg')).toBe('#1a1a1a') // white panel derives dark ink
    expect(e.style.getPropertyValue('--fg-custom')).toBe('')
  })

  it('photo and per-element picks set their own var chains and clear deterministically', () => {
    const e = el()
    applyInkColors(e, { ...AUTO, photoText: '#aabbcc', clock: '#ddeeff' })
    expect(e.style.getPropertyValue('--photo-ink')).toBe('#aabbcc')
    expect(e.style.getPropertyValue('--photo-ink-muted')).toBe('#aabbccad')
    expect(e.style.getPropertyValue('--photo-ink-clock')).toBe('#ddeeff')
    expect(e.style.getPropertyValue('--photo-ink-greeting')).toBe('')
    applyInkColors(e, AUTO)
    expect(e.style.getPropertyValue('--photo-ink')).toBe('')
    expect(e.style.getPropertyValue('--photo-ink-clock')).toBe('')
    expect(e.style.getPropertyValue('--photo-ink-clock-muted')).toBe('')
  })
})
