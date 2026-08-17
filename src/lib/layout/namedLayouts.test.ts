import { describe, expect, it } from 'vitest'
import {
  ANCHOR_POINTS,
  LAYOUTS_DOCUMENT_VALIDATION_MESSAGE,
  LayoutsDocumentValidationError,
  anchorForPoint,
  cleanLayoutsDocument,
  freePlacementFromPoint,
  isLayoutsDocument,
  pointFromFreePlacement,
  type LayoutsDocument,
} from './namedLayouts'

function validDocument(): LayoutsDocument {
  return {
    version: 1,
    activeLayoutId: 'a',
    layouts: [
      {
        id: 'a',
        name: 'Desktop',
        widgets: {
          clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -10.5, tier: 'full', layer: 0 },
          weather: { kind: 'free', anchor: 'top-right', offsetX: -4, offsetY: 6, tier: 'standard', layer: 1 },
          bookmarks: { kind: 'docked', dock: 'top', order: 0 },
        },
      },
      { id: 'b', name: 'Laptop', widgets: {}, bulkTier: 'compact' },
    ],
  }
}

describe('cleanLayoutsDocument', () => {
  it('returns a deep clone of a valid document', () => {
    const input = validDocument()
    const cleaned = cleanLayoutsDocument(input)
    expect(cleaned).toEqual(input)
    expect(cleaned).not.toBe(input)
    expect(cleaned.layouts[0]).not.toBe(input.layouts[0])
    expect(cleaned.layouts[0].widgets.clock).not.toBe(input.layouts[0].widgets.clock)
  })

  it('rejects a non-object, a wrong version, and an empty layout list', () => {
    for (const bad of [null, 'oops', { ...validDocument(), version: 2 }, { ...validDocument(), layouts: [] }]) {
      expect(() => cleanLayoutsDocument(bad)).toThrow(LAYOUTS_DOCUMENT_VALIDATION_MESSAGE)
    }
  })

  it('rejects an activeLayoutId that names no layout', () => {
    expect(() => cleanLayoutsDocument({ ...validDocument(), activeLayoutId: 'missing' }))
      .toThrow(LayoutsDocumentValidationError)
  })

  it('rejects duplicate layout ids, empty ids, and empty names', () => {
    const dupe = validDocument()
    dupe.layouts[1].id = 'a'
    const emptyId = validDocument()
    emptyId.layouts[1].id = ''
    const emptyName = validDocument()
    emptyName.layouts[0].name = ''
    for (const bad of [dupe, emptyId, emptyName]) {
      expect(() => cleanLayoutsDocument(bad)).toThrow(LayoutsDocumentValidationError)
    }
  })

  it('rejects malformed placements in reject mode and drops them in drop mode', () => {
    const doc = validDocument() as unknown as {
      layouts: { widgets: Record<string, unknown> }[]
    }
    doc.layouts[0].widgets.clock = { kind: 'free', anchor: 'nowhere', offsetX: 0, offsetY: 0, tier: 'full', layer: 0 }
    expect(() => cleanLayoutsDocument(doc)).toThrow(LayoutsDocumentValidationError)
    const dropped = cleanLayoutsDocument(doc, { invalidPlacement: 'drop' })
    expect(dropped.layouts[0].widgets.clock).toBeUndefined()
    expect(dropped.layouts[0].widgets.weather).toBeDefined()
  })

  it('always drops unknown widget ids without failing the document', () => {
    const doc = validDocument() as unknown as {
      layouts: { widgets: Record<string, unknown> }[]
    }
    doc.layouts[0].widgets.futureWidget = { kind: 'docked', dock: 'top', order: 1 }
    const cleaned = cleanLayoutsDocument(doc)
    expect('futureWidget' in cleaned.layouts[0].widgets).toBe(false)
  })

  it('rejects a bad bulkTier, a non-integer dock order, and non-finite offsets', () => {
    const badBulk = validDocument() as unknown as { layouts: { bulkTier?: string }[] }
    badBulk.layouts[1].bulkTier = 'docked'
    const badOrder = validDocument() as unknown as {
      layouts: { widgets: Record<string, unknown> }[]
    }
    badOrder.layouts[0].widgets.bookmarks = { kind: 'docked', dock: 'top', order: 1.5 }
    const badOffset = validDocument() as unknown as {
      layouts: { widgets: Record<string, unknown> }[]
    }
    badOffset.layouts[0].widgets.clock = { kind: 'free', anchor: 'center', offsetX: Infinity, offsetY: 0, tier: 'full', layer: 0 }
    for (const bad of [badBulk, badOrder, badOffset]) {
      expect(() => cleanLayoutsDocument(bad)).toThrow(LayoutsDocumentValidationError)
    }
  })
})

describe('anchor math', () => {
  it('picks the nearest of nine anchors per axis with 25/75 boundaries', () => {
    expect(anchorForPoint(0, 0)).toBe('top-left')
    expect(anchorForPoint(50, 50)).toBe('center')
    expect(anchorForPoint(100, 100)).toBe('bottom-right')
    expect(anchorForPoint(24.9, 50)).toBe('left')
    expect(anchorForPoint(25, 50)).toBe('left') // tie goes to the edge
    expect(anchorForPoint(25.1, 50)).toBe('center')
    expect(anchorForPoint(50, 75)).toBe('bottom') // tie goes to the edge
    expect(anchorForPoint(74.9, 10)).toBe('top')
    expect(anchorForPoint(75, 10)).toBe('top-right')
  })

  it('round-trips every quadrant point exactly through placement and back', () => {
    for (const point of [
      { x: 12.25, y: 88.5 }, { x: 50, y: 50 }, { x: 0, y: 0 },
      { x: 99.9, y: 3.2 }, { x: 33.4, y: 66.6 },
    ]) {
      const placement = freePlacementFromPoint({ ...point, tier: 'standard', layer: 3 })
      expect(pointFromFreePlacement(placement)).toEqual({ x: point.x, y: point.y })
      expect(placement.tier).toBe('standard')
      expect(placement.layer).toBe(3)
      expect(ANCHOR_POINTS[placement.anchor]).toBeDefined()
    }
  })
})

describe('isLayoutsDocument', () => {
  it('answers true for valid and false for invalid without throwing', () => {
    expect(isLayoutsDocument(validDocument())).toBe(true)
    expect(isLayoutsDocument(null)).toBe(false)
    expect(isLayoutsDocument({ version: 1, activeLayoutId: 'x', layouts: [] })).toBe(false)
  })
})
