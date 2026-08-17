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
