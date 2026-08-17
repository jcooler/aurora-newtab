import { describe, expect, it } from 'vitest'
import {
  LAYOUTS_DOCUMENT_VALIDATION_MESSAGE,
  LayoutsDocumentValidationError,
  cleanLayoutsDocument,
  isLayoutsDocument,
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

describe('isLayoutsDocument', () => {
  it('answers true for valid and false for invalid without throwing', () => {
    expect(isLayoutsDocument(validDocument())).toBe(true)
    expect(isLayoutsDocument(null)).toBe(false)
    expect(isLayoutsDocument({ version: 1, activeLayoutId: 'x', layouts: [] })).toBe(false)
  })
})
