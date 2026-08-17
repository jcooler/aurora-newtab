import { describe, expect, it } from 'vitest'
import type { LayoutV2, LegacyLayout } from './types'
import {
  adaptStoredLayout,
  restorePreviousLayout,
  saveCanvasProfile,
  semanticLayoutV2,
} from './canvasAdapter'

describe('Canvas layout adapter', () => {
  it('maps V1 coordinates into every custom profile without mutating the input', () => {
    const legacy: LegacyLayout = { clock: { x: 45.5, y: 31.25 }, notes: { x: 8, y: 90 } }
    const before = structuredClone(legacy)

    const adapted = adaptStoredLayout(legacy)

    for (const profile of ['compact', 'standard', 'display', 'ultrawide'] as const) {
      expect(adapted.profiles[profile]).toEqual({
        mode: 'custom',
        placements: {
          clock: { kind: 'canvas', x: 45.5, y: 31.25, size: 'standard', layer: 0 },
          notes: { kind: 'canvas', x: 8, y: 90, size: 'standard', layer: 1 },
        },
      })
    }
    expect(legacy).toEqual(before)
  })

  it('maps V2 zones and order to deterministic Canvas placements while leaving absent profiles derived', () => {
    const semantic: LayoutV2 = {
      version: 2,
      profiles: {
        standard: {
          weather: { zone: 'day', order: 1, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' },
          clock: { zone: 'now', order: 0, colSpan: 1, rowSpan: 1, variant: 'expanded', priority: 'automatic' },
          timer: { zone: 'dock', order: 2, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'dock' },
        },
      },
    }

    const adapted = adaptStoredLayout(semantic)

    expect(adapted.profiles.standard).toEqual({
      mode: 'custom',
      placements: {
        clock: { kind: 'canvas', x: 50, y: 50, size: 'full', layer: 0 },
        weather: { kind: 'canvas', x: 16.667, y: 56, size: 'compact', layer: 1 },
        timer: { kind: 'bottom-bar', order: 2, size: 'compact' },
      },
    })
    expect(adapted.profiles.compact).toBeUndefined()
  })

  it('returns a cleaned V3 clone and drops only a corrupt runtime placement', () => {
    const stored = {
      version: 3 as const,
      profiles: {
        standard: {
          mode: 'custom' as const,
          placements: {
            clock: { kind: 'canvas' as const, x: 50, y: 40, size: 'full' as const, layer: 4 },
            focus: { kind: 'canvas', x: 'bad', y: 60, size: 'standard', layer: 2 },
          },
        },
      },
    }

    expect(adaptStoredLayout(stored)).toEqual({
      version: 3,
      profiles: {
        standard: {
          mode: 'custom',
          placements: {
            clock: { kind: 'canvas', x: 50, y: 40, size: 'full', layer: 4 },
          },
        },
      },
    })
  })

  it('provides a semantic compatibility view without writing or changing stored V2', () => {
    const semantic: LayoutV2 = { version: 2, profiles: {} }
    expect(semanticLayoutV2(semantic)).toEqual(semantic)
    expect(semanticLayoutV2({ version: 3, profiles: {} })).toEqual({ version: 2, profiles: {} })
  })
})

describe('explicit Canvas save and recovery', () => {
  const draft = {
    mode: 'custom' as const,
    placements: {
      focus: { kind: 'canvas' as const, x: 50, y: 60, size: 'standard' as const, layer: 9 },
      clock: { kind: 'canvas' as const, x: 50, y: 40, size: 'full' as const, layer: 9 },
      timer: { kind: 'bottom-bar' as const, order: 7, size: 'compact' as const },
    },
  }

  it('stores an exact V1 recovery copy on the first Save and normalizes layers and Bottom bar order', () => {
    const legacy: LegacyLayout = { clock: { x: 49.25, y: 40.75 } }
    const before = structuredClone(legacy)

    const saved = saveCanvasProfile(legacy, 'standard', draft)

    expect(saved).toEqual({
      version: 3,
      profiles: {
        standard: {
          mode: 'custom',
          placements: {
            clock: { kind: 'canvas', x: 50, y: 40, size: 'full', layer: 0 },
            focus: { kind: 'canvas', x: 50, y: 60, size: 'standard', layer: 1 },
            timer: { kind: 'bottom-bar', order: 0, size: 'compact' },
          },
        },
      },
      recovery: { legacyV1: legacy },
    })
    expect(saved.recovery?.legacyV1).not.toBe(legacy)
    expect(legacy).toEqual(before)
  })

  it('preserves exact V2 recovery and all other V3 profiles across later Saves', () => {
    const semantic: LayoutV2 = {
      version: 2,
      profiles: {},
      legacy: { clock: { x: 10.5, y: 20.5 } },
    }
    const first = saveCanvasProfile(semantic, 'standard', draft)
    const second = saveCanvasProfile(first, 'compact', {
      mode: 'custom',
      placements: { clock: { kind: 'canvas', x: 40, y: 30, size: 'compact', layer: 5 } },
    })

    expect(second.recovery).toEqual({ semanticV2: semantic })
    expect(second.profiles.standard).toEqual(first.profiles.standard)
    expect(second.profiles.compact?.placements.clock).toEqual({
      kind: 'canvas', x: 40, y: 30, size: 'compact', layer: 0,
    })
  })

  it('preserves the exact serialized V2 recovery shape through Save and Restore', () => {
    const semantic = {
      legacy: {
        notes: { y: 82.5, x: 14.25 },
        clock: { y: 38.75, x: 51.5 },
      },
      profiles: {
        display: {
          notes: {
            priority: 'automatic', variant: 'standard', rowSpan: 2, colSpan: 2, order: 3, zone: 'pulse',
          },
        },
      },
      version: 2,
    } as LayoutV2
    const before = JSON.stringify(semantic)

    const saved = saveCanvasProfile(semantic, 'standard', draft)
    const restored = restorePreviousLayout(saved)

    expect(JSON.stringify(saved.recovery?.semanticV2)).toBe(before)
    expect(JSON.stringify(restored)).toBe(before)
    expect(saved.recovery?.semanticV2).not.toBe(semantic)
    expect(restored).not.toBe(saved.recovery?.semanticV2)
  })

  it('rejects the complete Save when any draft placement is invalid', () => {
    expect(() => saveCanvasProfile({ version: 3, profiles: {} }, 'standard', {
      mode: 'custom',
      placements: {
        clock: { kind: 'canvas', x: Number.NaN, y: 50, size: 'standard', layer: 0 },
      },
    })).toThrow('Canvas layout data is invalid.')
  })

  it('restores an exact previous layout while recovery exists and otherwise returns null', () => {
    const semantic: LayoutV2 = { version: 2, profiles: {}, legacy: { focus: { x: 50, y: 60 } } }
    const saved = saveCanvasProfile(semantic, 'standard', draft)

    const restored = restorePreviousLayout(saved)
    expect(restored).toEqual(semantic)
    expect(restored).not.toBe(semantic)
    expect(restorePreviousLayout({ version: 3, profiles: {} })).toBeNull()
  })
})
