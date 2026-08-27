// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import indexCss from '../index.css?raw'
import CanvasLegibilityLayer from './CanvasLegibilityLayer'

describe('CanvasLegibilityLayer', () => {
  it('renders one inert, pointer-transparent layer for all four wash regions', () => {
    const { container } = render(<CanvasLegibilityLayer />)
    const layers = container.querySelectorAll('[data-canvas-legibility]')

    expect(layers).toHaveLength(1)
    expect(layers[0]?.getAttribute('aria-hidden')).toBe('true')
    expect(layers[0]?.getAttribute('data-legibility-washes')).toBe('top center sides bottom')
    expect(layers[0]?.className).toContain('canvas-legibility-layer')
  })

  it('stays behind Canvas content without a card edge or hit target', () => {
    expect(indexCss).toMatch(/\.canvas-legibility-layer\s*\{[\s\S]*?pointer-events: none;/)
    expect(indexCss).toMatch(/\.canvas-legibility-layer\s*\{[\s\S]*?z-index: 0;/)
    expect(indexCss).toMatch(/\.canvas-legibility-layer\s*\{[\s\S]*?linear-gradient\(to bottom/)
    expect(indexCss).toMatch(/\.canvas-legibility-layer\s*\{[\s\S]*?radial-gradient\(ellipse at center/)
    expect(indexCss).toMatch(/\.canvas-legibility-layer\s*\{[\s\S]*?linear-gradient\(to right/)
    expect(indexCss).toMatch(/\.canvas-legibility-layer\s*\{[\s\S]*?linear-gradient\(to top/)
    // The wash is built from the FIXED --canvas-wash, never --panel-solid:
    // a widget color pick must not tint the photo (owner-reported
    // 2026-08-18; CanvasSurface.test carries the not-panel-solid pin).
    expect(indexCss).toMatch(/\.canvas-legibility-layer\s*\{[\s\S]*?var\(--canvas-wash\)/)
    expect(indexCss).toMatch(/linear-gradient\(to bottom, color-mix\(in srgb, var\(--canvas-wash\) 56%/)
    expect(indexCss).toMatch(/radial-gradient\(ellipse at center, color-mix\(in srgb, var\(--canvas-wash\) 68%/)
    expect(indexCss).not.toMatch(/\.canvas-legibility-layer\s*\{[^}]*rgb\(2 6 23/)
    expect(indexCss).not.toMatch(/\.canvas-legibility-layer\s*\{[^}]*border-radius:/)
    expect(indexCss).not.toMatch(/\.canvas-legibility-layer\s*\{[^}]*background-color:/)
  })
})
