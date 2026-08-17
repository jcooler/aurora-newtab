import { describe, expect, it } from 'vitest'
import {
  CanvasLayoutValidationError,
  cleanStoredLayout,
  emptyLayoutV3,
  isStoredLayout,
  type LayoutV3,
} from './canvasTypes'

describe('Canvas V3 layout validation', () => {
  it('creates an empty derived V3 document without materializing profiles', () => {
    expect(emptyLayoutV3()).toEqual({ version: 3, profiles: {} })
  })

  it('accepts Canvas and Bottom bar placements with finite normalized fields', () => {
    const layout: LayoutV3 = {
      version: 3,
      profiles: {
        standard: {
          mode: 'custom',
          placements: {
            clock: { kind: 'canvas', x: 50, y: 42, size: 'full', layer: 3 },
            timer: { kind: 'bottom-bar', order: 0, size: 'compact' },
          },
        },
      },
    }

    expect(cleanStoredLayout(layout)).toEqual(layout)
    expect(isStoredLayout(layout)).toBe(true)
  })

  it.each([
    ['non-finite x', { kind: 'canvas', x: Number.POSITIVE_INFINITY, y: 50, size: 'standard', layer: 0 }],
    ['non-finite y', { kind: 'canvas', x: 50, y: Number.NaN, size: 'standard', layer: 0 }],
    ['non-finite layer', { kind: 'canvas', x: 50, y: 50, size: 'standard', layer: Number.NaN }],
    ['negative Bottom bar order', { kind: 'bottom-bar', order: -1, size: 'compact' }],
    ['non-compact Bottom bar size', { kind: 'bottom-bar', order: 0, size: 'standard' }],
  ])('strict validation rejects a known block with %s', (_label, placement) => {
    const value = {
      version: 3,
      profiles: { standard: { mode: 'custom', placements: { clock: placement } } },
    }

    expect(() => cleanStoredLayout(value)).toThrow(CanvasLayoutValidationError)
    expect(isStoredLayout(value)).toBe(false)
  })

  it('runtime cleaning drops only the corrupt known block and all unknown identities', () => {
    const value = {
      version: 3,
      profiles: {
        standard: {
          mode: 'custom',
          placements: {
            clock: { kind: 'canvas', x: 'bad', y: 50, size: 'standard', layer: 0 },
            focus: { kind: 'canvas', x: 50, y: 60, size: 'standard', layer: 1 },
            futureWidget: { kind: 'canvas', x: 1, y: 2, size: 'compact', layer: 2 },
          },
        },
      },
    }

    expect(cleanStoredLayout(value, { invalidPlacement: 'drop' })).toEqual({
      version: 3,
      profiles: {
        standard: {
          mode: 'custom',
          placements: {
            focus: { kind: 'canvas', x: 50, y: 60, size: 'standard', layer: 1 },
          },
        },
      },
    })
  })

  it('accepts strict V1 and V2 inputs while dropping unknown IDs', () => {
    expect(cleanStoredLayout({ clock: { x: 12, y: 34 }, future: { x: 1, y: 2 } })).toEqual({
      clock: { x: 12, y: 34 },
    })
    expect(cleanStoredLayout({
      version: 2,
      profiles: {
        standard: {
          clock: { zone: 'now', order: 0, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned' },
          future: { zone: 'now', order: 1, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned' },
        },
      },
    })).toEqual({
      version: 2,
      profiles: {
        standard: {
          clock: { zone: 'now', order: 0, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned' },
        },
      },
    })
  })

  it('validates recovery layouts without rewriting their valid coordinates', () => {
    const semanticV2 = {
      version: 2 as const,
      profiles: {},
      legacy: { clock: { x: 12.25, y: 34.75 } },
    }
    const value = {
      version: 3 as const,
      profiles: {},
      recovery: { semanticV2 },
    }

    expect(cleanStoredLayout(value)).toEqual(value)
  })
})
