import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDGET_POINTS, defaultFreePlacement } from './defaultPlacements'
import { pointFromFreePlacement } from './namedLayouts'
import { BLOCK_IDS } from './types'

describe('DEFAULT_WIDGET_POINTS', () => {
  it('covers every widget identity with an on-plane point', () => {
    for (const id of BLOCK_IDS) {
      const point = DEFAULT_WIDGET_POINTS[id]
      expect(point, `missing default for ${id}`).toBeDefined()
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(100)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(100)
    }
  })

  it('keeps the V1 hierarchy: Bookmarks at the top, the ritual centered, tools in corners', () => {
    expect(DEFAULT_WIDGET_POINTS.bookmarks).toEqual({ x: 50, y: 4 })
    for (const id of ['clock', 'greeting', 'search', 'focus', 'links', 'quote'] as const) {
      expect(DEFAULT_WIDGET_POINTS[id].x).toBe(50)
    }
    expect(DEFAULT_WIDGET_POINTS.clock.y).toBeLessThan(DEFAULT_WIDGET_POINTS.focus.y)
    expect(DEFAULT_WIDGET_POINTS.timer.x).toBeLessThan(50)
    expect(DEFAULT_WIDGET_POINTS.timer.y).toBeLessThan(50)
    expect(DEFAULT_WIDGET_POINTS.weather.x).toBeGreaterThan(50)
    expect(DEFAULT_WIDGET_POINTS.weather.y).toBeLessThan(50)
    expect(DEFAULT_WIDGET_POINTS.notes.x).toBeLessThan(50)
    expect(DEFAULT_WIDGET_POINTS.notes.y).toBeGreaterThan(50)
    expect(DEFAULT_WIDGET_POINTS.tasks.x).toBeGreaterThan(50)
    expect(DEFAULT_WIDGET_POINTS.tasks.y).toBeGreaterThan(50)
  })

  it('defaultFreePlacement round-trips the table point exactly and leads with a Full clock', () => {
    for (const id of BLOCK_IDS) {
      const placement = defaultFreePlacement(id, 5)
      expect(placement.layer).toBe(5)
      expect(placement.tier).toBe(id === 'clock' ? 'full' : 'standard')
      expect(pointFromFreePlacement(placement)).toEqual(DEFAULT_WIDGET_POINTS[id])
    }
  })
})
