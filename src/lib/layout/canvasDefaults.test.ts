import { describe, expect, it } from 'vitest'
import { WIDGET_REGISTRY } from '../../newtab/widgetRegistry'
import { CANVAS_PROFILE_LABELS, canvasDefaults, resolveCanvasProfile, SMALL_CANVAS_COORDINATE_HEIGHT } from './canvasDefaults'
import { fitCanvasProfile } from './canvasGeometry'

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

  it('gives the common Small information set stable non-overlapping source slots without a 3200px trailing gap', () => {
    const common = WIDGET_REGISTRY.filter(({ id }) => [
      'weather', 'clock', 'greeting', 'search', 'focus', 'links', 'quote', 'timer', 'tasks', 'notes', 'bookmarks', 'monthCal',
    ].includes(id))
    const fitted = fitCanvasProfile(canvasDefaults('compact', common), { width: 390, height: SMALL_CANVAS_COORDINATE_HEIGHT, inset: 8 })
    const boxes = Object.values(fitted.placements).flatMap((placement) => placement?.kind === 'canvas' ? [placement] : [])
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left]
        const b = boxes[right]
        expect(a.left - a.width / 2 < b.left + b.width / 2
          && a.left + a.width / 2 > b.left - b.width / 2
          && a.top - a.height / 2 < b.top + b.height / 2
          && a.top + a.height / 2 > b.top - b.height / 2).toBe(false)
      }
    }
    expect(Math.max(...boxes.map((box) => box.top + box.height / 2))).toBeLessThan(1400)
  })

  it.each(['compact', 'standard', 'display', 'ultrawide'] as const)(
    'keeps every surviving %s source slot unchanged when siblings are toggled',
    (profile) => {
      const survivingIds = ['clock', 'focus', 'ics', 'github'] as const
      const expected = {
        compact: {
          clock: { kind: 'canvas', x: 50, y: 7.5, size: 'compact', layer: 6 },
          focus: { kind: 'canvas', x: 50, y: 14.625, size: 'compact', layer: 11 },
          ics: { kind: 'canvas', x: 50, y: 33.375, size: 'compact', layer: 1 },
          github: { kind: 'canvas', x: 50, y: 53.25, size: 'compact', layer: 16 },
        },
        standard: {
          clock: { kind: 'canvas', x: 50, y: 24, size: 'full', layer: 6 },
          focus: { kind: 'canvas', x: 50, y: 62, size: 'standard', layer: 11 },
          ics: { kind: 'canvas', x: 13, y: 23, size: 'standard', layer: 1 },
          github: { kind: 'canvas', x: 87, y: 30.857142857142858, size: 'standard', layer: 16 },
        },
        display: {
          clock: { kind: 'canvas', x: 50, y: 24, size: 'full', layer: 6 },
          focus: { kind: 'canvas', x: 50, y: 62, size: 'standard', layer: 11 },
          ics: { kind: 'canvas', x: 9, y: 22, size: 'standard', layer: 1 },
          github: { kind: 'canvas', x: 77, y: 22, size: 'full', layer: 16 },
        },
        ultrawide: {
          clock: { kind: 'canvas', x: 50, y: 24, size: 'full', layer: 6 },
          focus: { kind: 'canvas', x: 50, y: 62, size: 'standard', layer: 11 },
          ics: { kind: 'canvas', x: 6, y: 22, size: 'standard', layer: 1 },
          github: { kind: 'canvas', x: 83, y: 22, size: 'full', layer: 16 },
        },
      } as const
      const survivingSet = new Set<string>(survivingIds)
      const sparse = WIDGET_REGISTRY.filter(({ id }) => survivingSet.has(id))
      const dense = WIDGET_REGISTRY.filter(({ id }) => [
        ...survivingIds,
        'weather',
        'monthCal',
        'sun',
        'status',
        'gitlab',
        'jira',
        'rss',
      ].includes(id))

      const sparsePlacements = canvasDefaults(profile, sparse).placements
      const densePlacements = canvasDefaults(profile, dense).placements
      const sparseSurvivors = Object.fromEntries(survivingIds.map((id) => [id, sparsePlacements[id]]))
      const denseSurvivors = Object.fromEntries(survivingIds.map((id) => [id, densePlacements[id]]))

      expect(sparseSurvivors).toEqual(expected[profile])
      expect(denseSurvivors).toEqual(expected[profile])
    },
  )

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

  it('places only a newly enabled identity at the nearest safe snapped position when its custom default is occupied', () => {
    const entries = WIDGET_REGISTRY.filter(({ id }) => ['clock', 'focus'].includes(id))
    const saved = {
      mode: 'custom' as const,
      placements: {
        clock: { kind: 'canvas' as const, x: 50, y: 62, size: 'standard' as const, layer: 7 },
      },
    }

    const resolved = resolveCanvasProfile('standard', entries, saved)
    const focus = resolved.placements.focus

    expect(resolved.placements.clock).toEqual(saved.placements.clock)
    expect(focus?.kind).toBe('canvas')
    expect(focus).not.toMatchObject({ x: 50, y: 62 })
  })
})
