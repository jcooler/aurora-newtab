import { describe, expect, it } from 'vitest'
import {
  MY_LAYOUT_ID,
  MY_LAYOUT_NAME,
  deriveLayoutsDocument,
  deriveMyLayout,
  resolveLayoutsDocument,
} from './myLayoutAdapter'
import { pointFromFreePlacement, type FreeWidgetPlacement } from './namedLayouts'
import type { StoredLayout } from './canvasTypes'
import type { BlockId } from './types'

const V1_LAYOUT: StoredLayout = {
  clock: { x: 50, y: 18 },
  weather: { x: 88, y: 12 },
}

const V3_LAYOUT: StoredLayout = {
  version: 3,
  profiles: {
    standard: {
      mode: 'custom',
      placements: {
        clock: { kind: 'canvas', x: 50, y: 20, size: 'full', layer: 2 },
        weather: { kind: 'canvas', x: 90, y: 10, size: 'standard', layer: 1 },
        bookmarks: { kind: 'bottom-bar', order: 0, size: 'compact' },
      },
    },
  },
  recovery: { legacyV1: { clock: { x: 50, y: 18 } } },
}

const ENABLED: readonly BlockId[] = ['clock', 'weather', 'bookmarks', 'notes']

describe('deriveMyLayout', () => {
  it('maps a custom V3 profile: canvas rows become exact-round-trip free placements, bottom bar becomes the bottom dock', () => {
    const layout = deriveMyLayout(V3_LAYOUT, 'standard', ENABLED)
    expect(layout.id).toBe(MY_LAYOUT_ID)
    expect(layout.name).toBe(MY_LAYOUT_NAME)
    const clock = layout.widgets.clock as FreeWidgetPlacement
    expect(clock.kind).toBe('free')
    expect(clock.tier).toBe('full')
    expect(clock.layer).toBe(2)
    expect(pointFromFreePlacement(clock)).toEqual({ x: 50, y: 20 })
    const weather = layout.widgets.weather as FreeWidgetPlacement
    expect(pointFromFreePlacement(weather)).toEqual({ x: 90, y: 10 })
    expect(layout.widgets.bookmarks).toEqual({ kind: 'docked', dock: 'bottom', order: 0 })
  })

  it('gives an enabled widget with no stored placement a deterministic center default above every stored layer', () => {
    const layout = deriveMyLayout(V3_LAYOUT, 'standard', ENABLED)
    expect(layout.widgets.notes).toEqual({
      kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'standard', layer: 3,
    })
  })

  it('omits widgets that are not enabled', () => {
    const layout = deriveMyLayout(V3_LAYOUT, 'standard', ['clock'])
    expect(Object.keys(layout.widgets)).toEqual(['clock'])
  })

  it('adapts a V1 legacy layout through the existing adapter (standard size, sequential layers)', () => {
    const layout = deriveMyLayout(V1_LAYOUT, 'standard', ['clock', 'weather'])
    const clock = layout.widgets.clock as FreeWidgetPlacement
    expect(pointFromFreePlacement(clock)).toEqual({ x: 50, y: 18 })
    expect(clock.tier).toBe('standard')
  })

  it('never mutates the stored layout it reads', () => {
    const frozen = JSON.parse(JSON.stringify(V3_LAYOUT)) as StoredLayout
    deriveMyLayout(frozen, 'standard', ENABLED)
    expect(frozen).toEqual(V3_LAYOUT)
  })
})

describe('deriveLayoutsDocument / resolveLayoutsDocument', () => {
  it('derives a single-layout document with My layout active', () => {
    const doc = deriveLayoutsDocument(V3_LAYOUT, 'standard', ENABLED)
    expect(doc.version).toBe(1)
    expect(doc.activeLayoutId).toBe(MY_LAYOUT_ID)
    expect(doc.layouts).toHaveLength(1)
  })

  it('prefers a valid stored document and falls back to derivation otherwise', () => {
    const stored = {
      version: 1,
      activeLayoutId: 'work',
      layouts: [{ id: 'work', name: 'Work', widgets: {} }],
    }
    expect(resolveLayoutsDocument(stored, V3_LAYOUT, 'standard', ENABLED).activeLayoutId).toBe('work')
    for (const invalid of [null, undefined, { version: 1, activeLayoutId: 'x', layouts: [] }]) {
      const resolved = resolveLayoutsDocument(invalid, V3_LAYOUT, 'standard', ENABLED)
      expect(resolved.activeLayoutId).toBe(MY_LAYOUT_ID)
    }
  })
})
