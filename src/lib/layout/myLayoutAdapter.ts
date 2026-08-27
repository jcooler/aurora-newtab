import { adaptStoredLayout } from './canvasAdapter'
import type { CanvasProfileKey, StoredLayout } from './canvasTypes'
import { defaultFreePlacement } from './defaultPlacements'
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

/** The frozen interpreter of PRE-named-layouts storage: which stored V3
 *  profile represents "the user's layout" when deriving My layout. This is
 *  migration input, NOT runtime profile selection — once a layouts document
 *  is saved, rendering never consults window size again (beyond the
 *  mechanical narrow floor). Width-only per the a325891 short-height fix. */
export function migrationSourceProfile(viewport: { width: number; height: number }): CanvasProfileKey {
  const { width, height } = viewport
  if (width < 900) return 'compact'
  if (width >= 1600 && width / height >= 2.1) return 'ultrawide'
  if (width >= 2200 && height >= 1100) return 'display'
  return 'standard'
}

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
  // Enabled widgets without a stored placement: the designed STATIC default
  // slot for that identity (defaultPlacements.ts). The layer is identity-
  // stable RELATIVE ordering (BLOCK_IDS position offset above every stored
  // layer): toggling one widget never reorders its neighbours (the PR-P1
  // stability contract), though the absolute number can shift when the
  // stored widget carrying maxLayer is disabled — see renderLayout.ts.
  for (const id of BLOCK_IDS) {
    if (!enabled.has(id) || widgets[id]) continue
    widgets[id] = defaultFreePlacement(id, maxLayer + 1 + BLOCK_IDS.indexOf(id))
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
