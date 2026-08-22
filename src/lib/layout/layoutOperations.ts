import {
  cleanLayoutsDocument,
  type LayoutsDocument,
  type NamedLayout,
} from './namedLayouts'
import type { AuroraStorage } from '../storage/index'
import { setStackFacing, stepStackFacing } from './stacks'
import type { BlockId } from './types'

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

/** One name policy for every operation that accepts a name (review fix I2):
 *  trimmed, and a whitespace-only result is rejected before any document is
 *  built, so the NL-P3 switcher UI gets identical behavior from create,
 *  duplicate, and rename. */
function requireName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('Layout name cannot be empty')
  return trimmed
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
  const layout: NamedLayout = { id: next.id, name: requireName(next.name), widgets: {} }
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
    layouts: [...doc.layouts, { ...source, id: next.id, name: requireName(next.name) }],
  })
}

export function renameLayout(
  doc: LayoutsDocument,
  layoutId: string,
  name: string,
): LayoutsDocument {
  const index = requireIndex(doc, layoutId)
  const trimmed = requireName(name)
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

/** The ONLY named-layouts write path (named-layouts spec §4: explicit-save-
 *  only, atomic under the existing storage authority). Validates before
 *  writing; a rejected document leaves storage untouched. Writes exactly one
 *  key — never the legacy `layout` recovery input. */
export async function saveLayoutsDocument(
  storage: AuroraStorage,
  next: LayoutsDocument,
): Promise<void> {
  await storage.set('layouts', cleanLayoutsDocument(next))
}

export type StackFacingCommand = BlockId | 'next' | 'previous'

/** Normal-mode stack paging is the one intentional live layout write. It
 *  runs through the existing serialized storage authority so rapid arrows
 *  compose against fresh stored state, and it never touches the legacy
 *  `layout` recovery input. */
export async function updateStoredStackFacing(
  storage: AuroraStorage,
  layoutId: string,
  stackId: string,
  command: StackFacingCommand,
): Promise<void> {
  const before = await storage.get('layouts')
  const beforeLayout = before?.layouts.find((layout) => layout.id === layoutId)
  const beforeStack = beforeLayout?.stacks?.find((stack) => stack.id === stackId)
  if (!beforeStack) return
  if (command !== 'next' && command !== 'previous' && !beforeStack.members.includes(command)) return
  if (command !== 'next' && command !== 'previous' && beforeStack.facing === command) return

  await storage.update('layouts', (current) => {
    if (!current) return current
    const layoutIndex = current.layouts.findIndex((layout) => layout.id === layoutId)
    if (layoutIndex < 0) return current
    const layout = current.layouts[layoutIndex]
    if (!layout.stacks?.some((stack) => stack.id === stackId)) return current
    const nextLayout = command === 'next' || command === 'previous'
      ? stepStackFacing(layout, stackId, command === 'next' ? 1 : -1)
      : setStackFacing(layout, stackId, command)
    if (nextLayout === layout) return current
    const layouts = current.layouts.map((candidate, index) => (
      index === layoutIndex ? nextLayout : candidate
    ))
    return cleanLayoutsDocument({ ...current, layouts })
  })
}
