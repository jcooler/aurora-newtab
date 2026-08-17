import {
  cleanLayoutsDocument,
  type LayoutsDocument,
  type NamedLayout,
} from './namedLayouts'

function requireIndex(doc: LayoutsDocument, layoutId: string): number {
  const index = doc.layouts.findIndex((layout) => layout.id === layoutId)
  if (index === -1) throw new Error(`No layout with id "${layoutId}"`)
  return index
}

function requireFreshId(doc: LayoutsDocument, id: string): void {
  if (doc.layouts.some((layout) => layout.id === id)) {
    throw new Error(`Layout id "${id}" already exists`)
  }
}

/** Every operation returns a freshly validated document (cleanLayoutsDocument
 *  deep-clones), so callers can hand the result straight to the explicit-save
 *  write path without aliasing the input. */
function finish(doc: LayoutsDocument): LayoutsDocument {
  return cleanLayoutsDocument(doc)
}

export function switchActiveLayout(doc: LayoutsDocument, layoutId: string): LayoutsDocument {
  requireIndex(doc, layoutId)
  return finish({ ...doc, activeLayoutId: layoutId })
}

export function createLayout(
  doc: LayoutsDocument,
  next: { id: string; name: string },
): LayoutsDocument {
  requireFreshId(doc, next.id)
  const layout: NamedLayout = { id: next.id, name: next.name, widgets: {} }
  return finish({ ...doc, layouts: [...doc.layouts, layout] })
}

export function duplicateLayout(
  doc: LayoutsDocument,
  sourceId: string,
  next: { id: string; name: string },
): LayoutsDocument {
  const source = doc.layouts[requireIndex(doc, sourceId)]
  requireFreshId(doc, next.id)
  return finish({
    ...doc,
    layouts: [...doc.layouts, { ...source, id: next.id, name: next.name }],
  })
}

export function renameLayout(
  doc: LayoutsDocument,
  layoutId: string,
  name: string,
): LayoutsDocument {
  const index = requireIndex(doc, layoutId)
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('Layout name cannot be empty')
  const layouts = doc.layouts.map((layout, i) => (
    i === index ? { ...layout, name: trimmed } : layout
  ))
  return finish({ ...doc, layouts })
}

export function deleteLayout(doc: LayoutsDocument, layoutId: string): LayoutsDocument {
  const index = requireIndex(doc, layoutId)
  if (doc.layouts.length === 1) throw new Error('Cannot delete the last layout')
  const layouts = doc.layouts.filter((_, i) => i !== index)
  const activeLayoutId = doc.activeLayoutId === layoutId
    ? layouts[Math.max(0, index - 1)].id
    : doc.activeLayoutId
  return finish({ ...doc, activeLayoutId, layouts })
}

export function reorderLayouts(
  doc: LayoutsDocument,
  fromIndex: number,
  toIndex: number,
): LayoutsDocument {
  const max = doc.layouts.length - 1
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
    || fromIndex < 0 || fromIndex > max || toIndex < 0 || toIndex > max) {
    throw new Error('Layout index out of range')
  }
  const layouts = [...doc.layouts]
  const [moved] = layouts.splice(fromIndex, 1)
  layouts.splice(toIndex, 0, moved)
  return finish({ ...doc, layouts })
}
