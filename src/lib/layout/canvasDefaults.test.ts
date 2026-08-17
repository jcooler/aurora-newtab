import { describe, expect, it } from 'vitest'
import { WIDGET_REGISTRY } from '../../newtab/widgetRegistry'
import { CANVAS_PROFILE_LABELS, canvasDefaults, resolveCanvasProfile } from './canvasDefaults'

describe('source-owned V1 Canvas defaults', () => {
  it('names the four compatibility profiles as real user-facing canvases', () => {
    expect(CANVAS_PROFILE_LABELS).toEqual({
      compact: 'Small',
      standard: 'Desktop',
      display: 'Large',
      ultrawide: 'Wide',
    })
  })

  it('restores the Desktop V1 hierarchy for every enabled identity', () => {
    const profile = canvasDefaults('standard', WIDGET_REGISTRY)
    const placements = profile.placements

    expect(Object.keys(placements)).toHaveLength(WIDGET_REGISTRY.length)
    expect(placements.bookmarks).toMatchObject({ kind: 'canvas', x: 50 })
    expect(placements.clock).toMatchObject({ kind: 'canvas', x: 50, size: 'full' })
    expect(placements.focus).toMatchObject({ kind: 'canvas', x: 50 })
    expect(placements.timer).toMatchObject({ kind: 'canvas', size: 'compact' })
    expect(placements.notes).toMatchObject({ kind: 'canvas', size: 'compact' })
    expect(placements.tasks).toMatchObject({ kind: 'canvas', size: 'compact' })

    if (placements.bookmarks?.kind !== 'canvas'
      || placements.timer?.kind !== 'canvas'
      || placements.weather?.kind !== 'canvas'
      || placements.notes?.kind !== 'canvas'
      || placements.tasks?.kind !== 'canvas'
      || placements.ics?.kind !== 'canvas'
      || placements.github?.kind !== 'canvas') throw new Error('Expected Canvas placements')

    expect(placements.bookmarks.y).toBeLessThan(10)
    expect(placements.timer.x).toBeLessThan(20)
    expect(placements.timer.y).toBeLessThan(20)
    expect(placements.weather.x).toBeGreaterThan(80)
    expect(placements.weather.y).toBeLessThan(20)
    expect(placements.notes.x).toBeLessThan(20)
    expect(placements.notes.y).toBeGreaterThan(80)
    expect(placements.tasks.x).toBeGreaterThan(80)
    expect(placements.tasks.y).toBeGreaterThan(80)
    expect(placements.ics.x).toBeLessThan(35)
    expect(placements.github.x).toBeGreaterThan(65)
  })

  it('makes Small a vertical path and gives Large and Wide distinct edge columns', () => {
    const small = canvasDefaults('compact', WIDGET_REGISTRY)
    const desktop = canvasDefaults('standard', WIDGET_REGISTRY)
    const large = canvasDefaults('display', WIDGET_REGISTRY)
    const wide = canvasDefaults('ultrawide', WIDGET_REGISTRY)

    expect(Object.values(small.placements).every((placement) => placement?.kind !== 'canvas' || placement.x === 50)).toBe(true)
    expect(large.placements.github).not.toEqual(desktop.placements.github)
    expect(wide.placements.github).not.toEqual(large.placements.github)
    expect(new Set(Object.values(large.placements)
      .filter((placement) => placement?.kind === 'canvas')
      .map((placement) => placement.kind === 'canvas' ? placement.x : -1)).size).toBeGreaterThan(4)
  })

  it('merges a custom profile without moving saved blocks and defaults only missing active identities', () => {
    const entries = WIDGET_REGISTRY.filter(({ id }) => ['clock', 'focus', 'weather'].includes(id))
    const saved = {
      mode: 'custom' as const,
      placements: {
        clock: { kind: 'canvas' as const, x: 44, y: 33, size: 'standard' as const, layer: 7 },
      },
    }

    const resolved = resolveCanvasProfile('standard', entries, saved)

    expect(resolved.mode).toBe('custom')
    expect(resolved.placements.clock).toEqual(saved.placements.clock)
    expect(resolved.placements.focus).toBeDefined()
    expect(resolved.placements.weather).toBeDefined()
    expect(Object.keys(resolved.placements)).toEqual(['weather', 'clock', 'focus'])
  })
})
