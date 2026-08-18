import {
  cleanLayoutsDocument,
  freePlacementFromPoint,
  pointFromFreePlacement,
  type FreeWidgetPlacement,
  type LayoutsDocument,
  type NamedLayout,
  type WidgetTier,
} from './namedLayouts'
import { defaultFreePlacement } from './defaultPlacements'
import { BLOCK_IDS, type BlockId } from './types'

/** The live edit session's draft model (named-layouts spec 2.5). Pure: every
 *  operation returns a new session; the ONLY storage write in the whole
 *  feature is `saveLayoutsDocument(storage, session.draft)` on explicit
 *  Save. Cancel simply discards the session — exact by construction, since
 *  nothing was ever written.
 *
 *  `baseline` is the initial MATERIALIZED draft: enabled-but-absent widgets
 *  are placed into it at their designed default slots on entry, so what the
 *  user sees, edits, resets to, and saves are the same stored values (the
 *  NL-P2 review's layer guidance: persist from the draft, never from derived
 *  render output). */
export interface EditSession {
  baseline: LayoutsDocument
  draft: LayoutsDocument
  selectedId: BlockId | null
  past: readonly LayoutsDocument[]
  dirty: boolean
}

const UNDO_CAP = 50

/** cleanLayoutsDocument iterates widgets in BLOCK_IDS order and rebuilds
 *  every object, so stringify equality over cleaned documents is a sound
 *  structural comparison here. */
function documentsEqual(left: LayoutsDocument, right: LayoutsDocument): boolean {
  return JSON.stringify(cleanLayoutsDocument(left)) === JSON.stringify(cleanLayoutsDocument(right))
}

function activeIndex(document: LayoutsDocument): number {
  const index = document.layouts.findIndex((layout) => layout.id === document.activeLayoutId)
  return index === -1 ? 0 : index
}

export function activeDraftLayout(session: EditSession): NamedLayout {
  return session.draft.layouts[activeIndex(session.draft)]
}

function withActiveLayout(
  document: LayoutsDocument,
  update: (layout: NamedLayout) => NamedLayout,
): LayoutsDocument {
  const index = activeIndex(document)
  const layouts = document.layouts.map((layout, i) => (i === index ? update(layout) : layout))
  return { ...document, layouts }
}

export function beginEditSession(
  document: LayoutsDocument,
  enabledIds: readonly BlockId[],
): EditSession {
  const enabled = new Set<BlockId>(enabledIds)
  const materialized = withActiveLayout(cleanLayoutsDocument(document), (layout) => {
    const widgets = { ...layout.widgets }
    let maxLayer = -1
    for (const id of BLOCK_IDS) {
      const placement = widgets[id]
      if (placement?.kind === 'free') maxLayer = Math.max(maxLayer, placement.layer)
    }
    for (const id of BLOCK_IDS) {
      if (!enabled.has(id) || widgets[id]) continue
      widgets[id] = defaultFreePlacement(id, maxLayer + 1 + BLOCK_IDS.indexOf(id))
    }
    return { ...layout, widgets }
  })
  return {
    baseline: materialized,
    draft: materialized,
    selectedId: null,
    past: [],
    dirty: false,
  }
}

function commit(session: EditSession, draft: LayoutsDocument, pushUndo = true): EditSession {
  const cleaned = cleanLayoutsDocument(draft)
  return {
    ...session,
    draft: cleaned,
    past: pushUndo ? [...session.past.slice(-(UNDO_CAP - 1)), session.draft] : session.past,
    dirty: !documentsEqual(cleaned, session.baseline),
  }
}

export function selectWidget(session: EditSession, id: BlockId | null): EditSession {
  return { ...session, selectedId: id }
}

function selectedFree(session: EditSession): FreeWidgetPlacement | null {
  if (!session.selectedId) return null
  const placement = activeDraftLayout(session).widgets[session.selectedId]
  return placement?.kind === 'free' ? placement : null
}

function replaceSelected(
  session: EditSession,
  placement: FreeWidgetPlacement,
  pushUndo = true,
): EditSession {
  const id = session.selectedId
  if (!id) return session
  return commit(session, withActiveLayout(session.draft, (layout) => ({
    ...layout,
    widgets: { ...layout.widgets, [id]: placement },
  })), pushUndo)
}

function movedPlacement(
  current: FreeWidgetPlacement,
  point: { xPct: number; yPct: number },
): FreeWidgetPlacement {
  return freePlacementFromPoint({
    x: point.xPct,
    y: point.yPct,
    tier: current.tier,
    layer: current.layer,
  })
}

export function moveSelected(
  session: EditSession,
  point: { xPct: number; yPct: number },
): EditSession {
  const current = selectedFree(session)
  if (!current) return session
  return replaceSelected(session, movedPlacement(current, point))
}

/** Same re-anchoring as moveSelected but WITHOUT a new undo entry — a drag
 *  pushes one entry on its first move and streams the rest through this. */
export function moveSelectedLive(
  session: EditSession,
  point: { xPct: number; yPct: number },
): EditSession {
  const current = selectedFree(session)
  if (!current) return session
  return replaceSelected(session, movedPlacement(current, point), false)
}

export function nudgeSelected(
  session: EditSession,
  delta: { xPct: number; yPct: number },
): EditSession {
  const current = selectedFree(session)
  if (!current) return session
  const point = pointFromFreePlacement(current)
  return moveSelected(session, { xPct: point.x + delta.xPct, yPct: point.y + delta.yPct })
}

export function setSelectedTier(session: EditSession, tier: WidgetTier): EditSession {
  const current = selectedFree(session)
  if (!current) return session
  return replaceSelected(session, { ...current, tier })
}

export function stepSelectedLayer(
  session: EditSession,
  direction: 'forward' | 'backward',
): EditSession {
  const id = session.selectedId
  const current = selectedFree(session)
  if (!id || !current) return session
  const layout = activeDraftLayout(session)
  const free = BLOCK_IDS.flatMap((blockId) => {
    const placement = layout.widgets[blockId]
    return placement?.kind === 'free' ? [{ id: blockId, placement }] : []
  })
  const candidates = free
    .filter((entry) => entry.id !== id && (
      direction === 'forward'
        ? entry.placement.layer > current.layer
        : entry.placement.layer < current.layer
    ))
    .sort((a, b) => (
      direction === 'forward'
        ? a.placement.layer - b.placement.layer
        : b.placement.layer - a.placement.layer
    ))
  const neighbor = candidates[0]
  if (!neighbor) return session
  return commit(session, withActiveLayout(session.draft, (draftLayout) => ({
    ...draftLayout,
    widgets: {
      ...draftLayout.widgets,
      [id]: { ...current, layer: neighbor.placement.layer },
      [neighbor.id]: { ...neighbor.placement, layer: current.layer },
    },
  })))
}

export function hideSelected(session: EditSession): EditSession {
  const id = session.selectedId
  if (!id) return session
  const next = commit(session, withActiveLayout(session.draft, (layout) => ({
    ...layout,
    widgets: { ...layout.widgets, [id]: { kind: 'hidden' } },
  })))
  return { ...next, selectedId: null }
}

export function restoreSelectedDefaults(session: EditSession): EditSession {
  const id = session.selectedId
  if (!id) return session
  const current = activeDraftLayout(session).widgets[id]
  const layer = current?.kind === 'free' ? current.layer : BLOCK_IDS.indexOf(id)
  return commit(session, withActiveLayout(session.draft, (layout) => ({
    ...layout,
    widgets: { ...layout.widgets, [id]: defaultFreePlacement(id, layer) },
  })))
}

export function applyBulkTier(session: EditSession, tier: WidgetTier): EditSession {
  return commit(session, withActiveLayout(session.draft, (layout) => {
    const widgets = { ...layout.widgets }
    for (const id of BLOCK_IDS) {
      const placement = widgets[id]
      if (placement?.kind === 'free') widgets[id] = { ...placement, tier }
    }
    return { ...layout, widgets, bulkTier: tier }
  }))
}

export function undo(session: EditSession): EditSession {
  const previous = session.past[session.past.length - 1]
  if (!previous) return session
  return {
    ...session,
    draft: previous,
    past: session.past.slice(0, -1),
    dirty: !documentsEqual(previous, session.baseline),
  }
}

export function resetSession(session: EditSession): EditSession {
  return commit(session, session.baseline)
}
