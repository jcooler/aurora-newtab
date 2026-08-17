import { describe, expect, it } from 'vitest'
import type { CanvasProfile } from './canvasTypes'
import { canvasMinimumHeight, fitCanvasProfile } from './canvasGeometry'

describe('Canvas display geometry', () => {
  it('converts percentages to finite pixels and clamps every block to an 8px safe margin', () => {
    const profile: CanvasProfile = {
      mode: 'custom',
      placements: {
        clock: { kind: 'canvas', x: 0, y: 0, size: 'full', layer: 4 },
        focus: { kind: 'canvas', x: 100, y: 100, size: 'standard', layer: 2 },
      },
    }

    const fitted = fitCanvasProfile(profile, { width: 1000, height: 800 })
    const clock = fitted.placements.clock
    const focus = fitted.placements.focus
    if (!clock || clock.kind !== 'canvas' || !focus || focus.kind !== 'canvas') throw new Error('Expected fitted Canvas blocks')

    for (const item of [clock, focus]) {
      expect(Number.isFinite(item.left)).toBe(true)
      expect(Number.isFinite(item.top)).toBe(true)
      expect(item.left - item.width / 2).toBeGreaterThanOrEqual(8)
      expect(item.left + item.width / 2).toBeLessThanOrEqual(992)
      expect(item.top - item.height / 2).toBeGreaterThanOrEqual(8)
      expect(item.top + item.height / 2).toBeLessThanOrEqual(792)
    }
    expect(clock.layer).toBe(4)
    expect(focus.layer).toBe(2)
  })

  it('keeps fitting display-only, preserves Bottom bar order, and drops one corrupt sibling', () => {
    const profile = {
      mode: 'custom' as const,
      placements: {
        clock: { kind: 'canvas' as const, x: Number.NaN, y: 50, size: 'full' as const, layer: 0 },
        focus: { kind: 'canvas' as const, x: 50, y: 60, size: 'standard' as const, layer: 1 },
        timer: { kind: 'bottom-bar' as const, order: 3, size: 'compact' as const },
      },
    }
    const before = structuredClone(profile)

    const fitted = fitCanvasProfile(profile, { width: 375, height: 812 })

    expect(fitted.placements.clock).toBeUndefined()
    expect(fitted.placements.focus?.kind).toBe('canvas')
    expect(fitted.placements.timer).toEqual(profile.placements.timer)
    expect(profile).toEqual(before)
  })

  it('derives a desktop side-column minimum from actual box heights, not a flat per-row constant', () => {
    // Hand-derived: personal side monthCal standard (base 304x184), sun
    // compact (192x72), ics compact (240x104); work side github compact
    // (240x128). Personal need = (184+8)+(72+8)+(104+8) = 384; work need =
    // 136. Derived standard minimum = 240 + max(384, 136) = 624 — NOT the
    // old 240 + 3*220 = 900 that pushed Focus below a short window's fold.
    const profile: CanvasProfile = {
      mode: 'derived',
      placements: {
        clock: { kind: 'canvas', x: 50, y: 24, size: 'full', layer: 0 },
        focus: { kind: 'canvas', x: 50, y: 62, size: 'standard', layer: 1 },
        monthCal: { kind: 'canvas', x: 13, y: 30, size: 'standard', layer: 2 },
        sun: { kind: 'canvas', x: 13, y: 55, size: 'compact', layer: 3 },
        ics: { kind: 'canvas', x: 13, y: 75, size: 'compact', layer: 4 },
        github: { kind: 'canvas', x: 87, y: 40, size: 'compact', layer: 5 },
      },
    }

    expect(canvasMinimumHeight('standard', profile, 445)).toBe(624)
    expect(canvasMinimumHeight('standard', profile, 900)).toBe(900)
  })

  it('splits two-column side minimums into alternating columns before taking the tallest', () => {
    // display uses two side columns (enabled BLOCK_IDS order, column =
    // index % 2). Personal side in BLOCK_IDS order: habits (compact 64)
    // then monthCal (standard base 184) then sun (compact 72). Column 0 =
    // (64+8)+(72+8) = 152; column 1 = (184+8) = 192. Need = 240 + 192 =
    // 432 when the viewport is shorter; a taller 800px base still wins.
    const profile: CanvasProfile = {
      mode: 'derived',
      placements: {
        monthCal: { kind: 'canvas', x: 9, y: 30, size: 'standard', layer: 0 },
        sun: { kind: 'canvas', x: 23, y: 30, size: 'compact', layer: 1 },
        habits: { kind: 'canvas', x: 9, y: 60, size: 'compact', layer: 2 },
      },
    }

    expect(canvasMinimumHeight('display', profile, 300)).toBe(432)
    expect(canvasMinimumHeight('display', profile, 800)).toBe(800)
  })

  it('gives a dense Small profile a tall document path without widening the viewport', () => {
    const placements: CanvasProfile['placements'] = {}
    for (const [index, id] of ['bookmarks', 'clock', 'greeting', 'search', 'focus', 'links', 'ics', 'github', 'notes', 'tasks'].entries()) {
      placements[id as keyof typeof placements] = {
        kind: 'canvas', x: 50, y: index * 10, size: index % 3 === 0 ? 'standard' : 'compact', layer: index,
      }
    }

    const height = canvasMinimumHeight('compact', { mode: 'derived', placements }, 812)
    const fitted = fitCanvasProfile({ mode: 'derived', placements }, { width: 375, height })

    expect(height).toBeGreaterThan(812)
    for (const placement of Object.values(fitted.placements)) {
      if (!placement || placement.kind !== 'canvas') continue
      expect(placement.left - placement.width / 2).toBeGreaterThanOrEqual(8)
      expect(placement.left + placement.width / 2).toBeLessThanOrEqual(367)
    }
  })
})
