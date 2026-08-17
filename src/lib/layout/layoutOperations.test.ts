import { describe, expect, it } from 'vitest'
import {
  createLayout,
  deleteLayout,
  duplicateLayout,
  renameLayout,
  reorderLayouts,
  switchActiveLayout,
} from './layoutOperations'
import type { LayoutsDocument } from './namedLayouts'

function doc(): LayoutsDocument {
  return {
    version: 1,
    activeLayoutId: 'a',
    layouts: [
      { id: 'a', name: 'Desktop', widgets: { clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'full', layer: 0 } } },
      { id: 'b', name: 'Laptop', widgets: {} },
    ],
  }
}

describe('switchActiveLayout', () => {
  it('changes only activeLayoutId and never mutates its input', () => {
    const input = doc()
    const before = JSON.parse(JSON.stringify(input))
    const next = switchActiveLayout(input, 'b')
    expect(next.activeLayoutId).toBe('b')
    expect(next.layouts).toEqual(input.layouts)
    expect(input).toEqual(before)
  })

  it('throws on an unknown id', () => {
    expect(() => switchActiveLayout(doc(), 'zz')).toThrow('No layout with id "zz"')
  })
})

describe('createLayout / duplicateLayout', () => {
  it('appends an empty named layout without switching', () => {
    const next = createLayout(doc(), { id: 'c', name: 'Personal' })
    expect(next.layouts.map((l) => l.id)).toEqual(['a', 'b', 'c'])
    expect(next.layouts[2]).toEqual({ id: 'c', name: 'Personal', widgets: {} })
    expect(next.activeLayoutId).toBe('a')
  })

  it('duplicates a source layout deeply', () => {
    const next = duplicateLayout(doc(), 'a', { id: 'c', name: 'Desktop copy' })
    expect(next.layouts[2].widgets).toEqual(doc().layouts[0].widgets)
    expect(next.layouts[2].widgets).not.toBe(next.layouts[0].widgets)
  })

  it('rejects a duplicate id and an unknown source', () => {
    expect(() => createLayout(doc(), { id: 'a', name: 'X' })).toThrow('Layout id "a" already exists')
    expect(() => duplicateLayout(doc(), 'zz', { id: 'c', name: 'X' })).toThrow('No layout with id "zz"')
  })
})

describe('renameLayout', () => {
  it('renames with trimming and rejects an empty result', () => {
    expect(renameLayout(doc(), 'b', '  Travel  ').layouts[1].name).toBe('Travel')
    expect(() => renameLayout(doc(), 'b', '   ')).toThrow('Layout name cannot be empty')
  })
})

describe('deleteLayout', () => {
  it('deletes a non-active layout', () => {
    const next = deleteLayout(doc(), 'b')
    expect(next.layouts.map((l) => l.id)).toEqual(['a'])
    expect(next.activeLayoutId).toBe('a')
  })

  it('moves the active pointer to the nearest survivor when deleting the active layout', () => {
    const next = deleteLayout(doc(), 'a')
    expect(next.activeLayoutId).toBe('b')
  })

  it('refuses to delete the last layout', () => {
    const only = deleteLayout(doc(), 'b')
    expect(() => deleteLayout(only, 'a')).toThrow('Cannot delete the last layout')
  })
})

describe('reorderLayouts', () => {
  it('moves a layout and keeps the active pointer by id', () => {
    const next = reorderLayouts(doc(), 0, 1)
    expect(next.layouts.map((l) => l.id)).toEqual(['b', 'a'])
    expect(next.activeLayoutId).toBe('a')
  })

  it('rejects out-of-range indices', () => {
    expect(() => reorderLayouts(doc(), 0, 5)).toThrow('Layout index out of range')
  })
})
