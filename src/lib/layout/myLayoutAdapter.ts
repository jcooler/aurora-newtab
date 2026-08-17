import { adaptStoredLayout } from './canvasAdapter'
import type { CanvasProfileKey, StoredLayout } from './canvasTypes'
import { BLOCK_IDS, type BlockId } from './types'
import {
  cleanLayoutsDocument,
  freePlacementFromPoint,
  isLayoutsDocument,
  LAYOUTS_DOCUMENT_VERSION,
  type LayoutsDocument,
  type NamedLayout,
} from './namedLayouts'

export const MY_LAYOUT_ID = 'my-layout'
export const MY_LAYOUT_NAME = 'My layout'

/** Spec 2.1 migration: the current active state (enabled widgets plus the
 *  stored V1/V2/V3 layout, resolved through the caller's current profile)
 *  becomes one layout named "My layout". Pure and in-memory: the stored
 *  layout is never rewritten (spec 4, "No eager rewrite at boot, ever"). */
export function deriveMyLayout(
  stored: StoredLayout,
  profileKey: CanvasProfileKey,
  enabledIds: readonly BlockId[],
): NamedLayout {
  const profile = adaptStoredLayout(stored).profiles[profileKey]
  const enabled = new Set<BlockId>(enabledIds)
  const widgets: NamedLayout['widgets'] = {}
  let maxLayer = -1
  for (const id of BLOCK_IDS) {
    if (!enabled.has(id)) continue
    const placement = profile?.placements[id]
    if (placement?.kind === 'canvas') {
      widgets[id] = freePlacementFromPoint({
        x: placement.x,
        y: placement.y,
        tier: placement.size,
        layer: placement.layer,
      })
      maxLayer = Math.max(maxLayer, placement.layer)
    } else if (placement?.kind === 'bottom-bar') {
      widgets[id] = { kind: 'docked', dock: 'bottom', order: placement.order }
    }
  }
  // Enabled widgets without a stored placement: deterministic center default
  // in BLOCK_IDS order, layered above every stored layer. NL-P2 owns real
  // default geometry; NL-P1 only records a truthful, valid document.
  let nextLayer = maxLayer + 1
  for (const id of BLOCK_IDS) {
    if (!enabled.has(id) || widgets[id]) continue
    widgets[id] = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'standard', layer: nextLayer }
    nextLayer += 1
  }
  return { id: MY_LAYOUT_ID, name: MY_LAYOUT_NAME, widgets }
}

export function deriveLayoutsDocument(
  stored: StoredLayout,
  profileKey: CanvasProfileKey,
  enabledIds: readonly BlockId[],
): LayoutsDocument {
  return {
    version: LAYOUTS_DOCUMENT_VERSION,
    activeLayoutId: MY_LAYOUT_ID,
    layouts: [deriveMyLayout(stored, profileKey, enabledIds)],
  }
}

/** The read-side switcher plumbing: a valid stored document wins; anything
 *  else (null before first explicit save, or malformed data) falls back to
 *  the in-memory "My layout" derivation. Never writes. */
export function resolveLayoutsDocument(
  storedLayouts: unknown,
  storedLayout: StoredLayout,
  profileKey: CanvasProfileKey,
  enabledIds: readonly BlockId[],
): LayoutsDocument {
  if (isLayoutsDocument(storedLayouts)) return cleanLayoutsDocument(storedLayouts)
  return deriveLayoutsDocument(storedLayout, profileKey, enabledIds)
}
