import { canvasBoxFor, fitCanvasProfile, type CanvasBounds } from '../../lib/layout/canvasGeometry'
import type {
  CanvasBlockPlacement,
  CanvasProfile,
  CanvasProfileKey,
  CanvasSize,
} from '../../lib/layout/canvasTypes'
import type { BlockId } from '../../lib/layout/types'
import type { WidgetRegistryEntry } from '../widgetRegistry'

export interface CanvasDraftFrame {
  placements: CanvasProfile['placements']
  selectedId: BlockId | null
  useDesktopLayoutEverywhere: boolean
  hiddenIds: readonly BlockId[]
}

export interface CanvasDraft extends CanvasDraftFrame {
  profile: CanvasProfileKey
  history: readonly CanvasDraftFrame[]
}

function clonePlacement(placement: CanvasBlockPlacement): CanvasBlockPlacement {
  return { ...placement }
}

function clonePlacements(placements: CanvasProfile['placements']): CanvasProfile['placements'] {
  return Object.fromEntries(Object.entries(placements).map(([id, placement]) => [
    id,
    placement ? clonePlacement(placement) : placement,
  ])) as CanvasProfile['placements']
}

function frameOf(draft: CanvasDraft): CanvasDraftFrame {
  return {
    placements: clonePlacements(draft.placements),
    selectedId: draft.selectedId,
    useDesktopLayoutEverywhere: draft.useDesktopLayoutEverywhere,
    hiddenIds: [...draft.hiddenIds],
  }
}

function samePlacement(left: CanvasBlockPlacement | undefined, right: CanvasBlockPlacement | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function commit(
  draft: CanvasDraft,
  next: Partial<Pick<CanvasDraft, 'placements' | 'selectedId' | 'useDesktopLayoutEverywhere' | 'hiddenIds'>>,
): CanvasDraft {
  const placements = next.placements ?? draft.placements
  const selectedId = next.selectedId === undefined ? draft.selectedId : next.selectedId
  const desktopEverywhere = next.useDesktopLayoutEverywhere ?? draft.useDesktopLayoutEverywhere
  const hiddenIds = next.hiddenIds ?? draft.hiddenIds
  const placementIds = new Set([...Object.keys(draft.placements), ...Object.keys(placements)] as BlockId[])
  const unchanged = [...placementIds].every((id) => samePlacement(draft.placements[id], placements[id]))
    && selectedId === draft.selectedId
    && desktopEverywhere === draft.useDesktopLayoutEverywhere
    && hiddenIds.length === draft.hiddenIds.length
    && hiddenIds.every((id, index) => id === draft.hiddenIds[index])
  if (unchanged) return draft
  return {
    ...draft,
    placements: clonePlacements(placements),
    selectedId,
    useDesktopLayoutEverywhere: desktopEverywhere,
    hiddenIds: [...hiddenIds],
    history: [...draft.history, frameOf(draft)],
  }
}

export function createCanvasDraft(
  profile: CanvasProfileKey,
  effective: CanvasProfile,
  _defaults: CanvasProfile,
  selectedId: BlockId | null = null,
): CanvasDraft {
  return {
    profile,
    placements: clonePlacements(effective.placements),
    history: [],
    selectedId,
    useDesktopLayoutEverywhere: false,
    hiddenIds: [],
  }
}

export function selectCanvasItem(draft: CanvasDraft, selectedId: BlockId): CanvasDraft {
  if (!draft.placements[selectedId] || draft.selectedId === selectedId) return draft
  return { ...draft, selectedId }
}

export function moveCanvasItem(
  draft: CanvasDraft,
  id: BlockId,
  position: Readonly<{ x: number; y: number }>,
): CanvasDraft {
  const current = draft.placements[id]
  if (current?.kind !== 'canvas' || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return draft
  if (current.x === position.x && current.y === position.y) return draft
  return commit(draft, { placements: { ...draft.placements, [id]: { ...current, ...position } } })
}

export function resizeCanvasItem(
  draft: CanvasDraft,
  entry: WidgetRegistryEntry,
  size: CanvasSize,
  bounds?: CanvasBounds,
): CanvasDraft {
  const current = draft.placements[entry.id]
  if (current?.kind !== 'canvas' || current.size === size || !entry.canvasSizes.includes(size)) return draft
  let next = { ...current, size }
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    const inset = bounds.inset ?? 8
    const box = canvasBoxFor(entry.id, size, bounds)
    const minX = (inset + box.width / 2) / bounds.width * 100
    const maxX = (bounds.width - inset - box.width / 2) / bounds.width * 100
    const minY = (inset + box.height / 2) / bounds.height * 100
    const maxY = (bounds.height - inset - box.height / 2) / bounds.height * 100
    next = {
      ...next,
      x: Math.min(maxX, Math.max(minX, current.x)),
      y: Math.min(maxY, Math.max(minY, current.y)),
    }
  }
  return commit(draft, { placements: { ...draft.placements, [entry.id]: next } })
}

export function moveCanvasItemToBottomBar(draft: CanvasDraft, id: BlockId): CanvasDraft {
  const current = draft.placements[id]
  if (!current || current.kind === 'bottom-bar') return draft
  const order = Object.values(draft.placements).reduce((maximum, placement) => (
    placement?.kind === 'bottom-bar' ? Math.max(maximum, placement.order) : maximum
  ), -1) + 1
  return commit(draft, {
    placements: { ...draft.placements, [id]: { kind: 'bottom-bar', order, size: 'compact' } },
  })
}

export function moveCanvasItemToCanvas(
  draft: CanvasDraft,
  id: BlockId,
  fallback: CanvasBlockPlacement | undefined,
): CanvasDraft {
  const current = draft.placements[id]
  if (current?.kind !== 'bottom-bar' || fallback?.kind !== 'canvas') return draft
  return commit(draft, { placements: { ...draft.placements, [id]: clonePlacement(fallback) } })
}

export function restoreCanvasItemDefault(
  draft: CanvasDraft,
  id: BlockId,
  fallback: CanvasBlockPlacement | undefined,
  part: 'position' | 'size',
): CanvasDraft {
  const current = draft.placements[id]
  if (current?.kind !== 'canvas' || fallback?.kind !== 'canvas') return draft
  const next = part === 'position'
    ? { ...current, x: fallback.x, y: fallback.y }
    : { ...current, size: fallback.size }
  return commit(draft, { placements: { ...draft.placements, [id]: next } })
}

function fittedRect(profile: CanvasProfile, bounds: CanvasBounds, id: BlockId) {
  const placement = fitCanvasProfile(profile, bounds).placements[id]
  return placement?.kind === 'canvas' ? placement : null
}

export function overlappingCanvasIds(
  draft: CanvasDraft,
  bounds: CanvasBounds,
  id: BlockId,
): BlockId[] {
  const profile: CanvasProfile = { mode: 'custom', placements: draft.placements }
  const selected = fittedRect(profile, bounds, id)
  if (!selected) return []
  return (Object.keys(draft.placements) as BlockId[]).filter((candidate) => {
    if (candidate === id) return false
    const other = fittedRect(profile, bounds, candidate)
    return other !== null
      && selected.left < other.left + other.width
      && selected.left + selected.width > other.left
      && selected.top < other.top + other.height
      && selected.top + selected.height > other.top
  })
}

function changeLayer(
  draft: CanvasDraft,
  id: BlockId,
  bounds: CanvasBounds,
  direction: 'forward' | 'backward',
): CanvasDraft {
  const current = draft.placements[id]
  if (current?.kind !== 'canvas') return draft
  const overlaps = overlappingCanvasIds(draft, bounds, id)
  if (overlaps.length === 0) return draft
  const layers = overlaps.flatMap((candidate) => {
    const placement = draft.placements[candidate]
    return placement?.kind === 'canvas' ? [placement.layer] : []
  })
  const layer = direction === 'forward' ? Math.max(...layers) + 1 : Math.min(...layers) - 1
  return commit(draft, { placements: { ...draft.placements, [id]: { ...current, layer } } })
}

export const bringCanvasItemForward = (draft: CanvasDraft, id: BlockId, bounds: CanvasBounds) => (
  changeLayer(draft, id, bounds, 'forward')
)

export const sendCanvasItemBackward = (draft: CanvasDraft, id: BlockId, bounds: CanvasBounds) => (
  changeLayer(draft, id, bounds, 'backward')
)

export function undoCanvasDraft(draft: CanvasDraft): CanvasDraft {
  const previous = draft.history.at(-1)
  if (!previous) return draft
  return {
    ...draft,
    ...previous,
    placements: clonePlacements(previous.placements),
    history: draft.history.slice(0, -1),
  }
}

export function resetCanvasDraft(
  draft: CanvasDraft,
  activeIds: readonly BlockId[],
  defaults: CanvasProfile,
): CanvasDraft {
  const placements = clonePlacements(draft.placements)
  for (const id of activeIds) {
    const placement = defaults.placements[id]
    if (placement) placements[id] = clonePlacement(placement)
    else delete placements[id]
  }
  const active = new Set(activeIds)
  return commit(draft, {
    placements,
    useDesktopLayoutEverywhere: false,
    hiddenIds: draft.hiddenIds.filter((id) => !active.has(id)),
  })
}

export function copyCanvasProfileIntoDraft(
  draft: CanvasDraft,
  activeIds: readonly BlockId[],
  source: CanvasProfile,
): CanvasDraft {
  const placements = clonePlacements(draft.placements)
  for (const id of activeIds) {
    const placement = source.placements[id]
    if (placement) placements[id] = clonePlacement(placement)
  }
  return commit(draft, { placements })
}

export function setDesktopEverywhere(draft: CanvasDraft, enabled: boolean): CanvasDraft {
  return commit(draft, { useDesktopLayoutEverywhere: enabled })
}

export function setCanvasItemVisibility(draft: CanvasDraft, id: BlockId, visible: boolean): CanvasDraft {
  const hidden = new Set(draft.hiddenIds)
  if (visible) hidden.delete(id)
  else hidden.add(id)
  return commit(draft, { hiddenIds: [...hidden].sort() })
}

export function normalizeCanvasDraft(draft: CanvasDraft): CanvasProfile {
  const canvasRows = (Object.entries(draft.placements) as [BlockId, CanvasBlockPlacement][])
    .filter((row): row is [BlockId, Extract<CanvasBlockPlacement, { kind: 'canvas' }>] => row[1].kind === 'canvas')
    .sort((left, right) => left[1].layer - right[1].layer || left[0].localeCompare(right[0]))
  const bottomRows = (Object.entries(draft.placements) as [BlockId, CanvasBlockPlacement][])
    .filter((row): row is [BlockId, Extract<CanvasBlockPlacement, { kind: 'bottom-bar' }>] => row[1].kind === 'bottom-bar')
    .sort((left, right) => left[1].order - right[1].order || left[0].localeCompare(right[0]))
  const normalized = new Map<BlockId, CanvasBlockPlacement>()
  canvasRows.forEach(([id, placement], layer) => normalized.set(id, { ...placement, layer }))
  bottomRows.forEach(([id, placement], order) => normalized.set(id, { ...placement, order }))
  const placements: CanvasProfile['placements'] = {}
  for (const id of Object.keys(draft.placements) as BlockId[]) {
    const placement = normalized.get(id)
    if (placement) placements[id] = placement
  }
  return { mode: 'custom', placements }
}
