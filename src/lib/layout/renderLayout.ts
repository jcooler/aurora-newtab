import {
  ANCHOR_POINTS,
  type DockEdge,
  type NamedLayout,
  type WidgetTier,
} from './namedLayouts'
import { BLOCK_IDS, type BlockId } from './types'

/** Spec 2.2 narrow floor: below approximately 600 CSS px of width the layout
 *  renders as one vertical stack. The only automatic behavior in the system,
 *  and purely mechanical. */
export const NARROW_FLOOR_WIDTH = 600

export interface AnchoredRenderItem {
  id: BlockId
  mode: 'anchored'
  leftPct: number
  topPct: number
  tier: WidgetTier
  layer: number
}
export interface StackedRenderItem { id: BlockId; mode: 'stacked'; order: number; tier: WidgetTier }
export interface DockedRenderItem { id: BlockId; mode: 'docked'; dock: DockEdge; order: number }
export type LayoutRenderItem = AnchoredRenderItem | StackedRenderItem | DockedRenderItem
export interface LayoutRenderPlan { narrow: boolean; items: LayoutRenderItem[] }

const TIER_ORDER: readonly WidgetTier[] = ['compact', 'standard', 'full']

/** Deterministic fallback when a stored tier isn't supported by the widget:
 *  nearest supported size in tier order, ties toward the smaller size. Never
 *  invents a composition — only picks among what the widget declares. */
export function resolveRenderTier(supported: readonly WidgetTier[], tier: WidgetTier): WidgetTier {
  if (supported.length === 0 || supported.includes(tier)) return tier
  const target = TIER_ORDER.indexOf(tier)
  let best: WidgetTier = supported[0]
  let bestDistance = Infinity
  for (const candidate of TIER_ORDER) {
    if (!supported.includes(candidate)) continue
    const distance = Math.abs(TIER_ORDER.indexOf(candidate) - target)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value))
}

interface PlannedFree { id: BlockId; leftPct: number; topPct: number; tier: WidgetTier; layer: number }
interface PlannedDock { id: BlockId; dock: DockEdge; order: number }

export function planLayoutRender(
  layout: NamedLayout,
  enabledIds: readonly BlockId[],
  viewportWidth: number,
): LayoutRenderPlan {
  const enabled = new Set<BlockId>(enabledIds)
  const free: PlannedFree[] = []
  const docked: PlannedDock[] = []
  let maxLayer = -1

  for (const id of BLOCK_IDS) {
    if (!enabled.has(id)) continue
    const placement = layout.widgets[id]
    if (!placement) continue
    if (placement.kind === 'docked') {
      docked.push({ id, dock: placement.dock, order: placement.order })
      continue
    }
    const anchor = ANCHOR_POINTS[placement.anchor]
    free.push({
      id,
      leftPct: clampPct(anchor.x + placement.offsetX),
      topPct: clampPct(anchor.y + placement.offsetY),
      tier: placement.tier,
      layer: placement.layer,
    })
    maxLayer = Math.max(maxLayer, placement.layer)
  }

  // Enabled widgets the layout doesn't know yet: the same deterministic
  // in-memory center default deriveMyLayout uses. Nothing is written;
  // membership persists at the user's next explicit save (NL-P3).
  let nextLayer = maxLayer + 1
  for (const id of BLOCK_IDS) {
    if (!enabled.has(id)) continue
    if (layout.widgets[id]) continue
    free.push({ id, leftPct: 50, topPct: 50, tier: 'standard', layer: nextLayer })
    nextLayer += 1
  }

  const dockSorted = [...docked].sort((a, b) => (
    a.dock === b.dock ? a.order - b.order : a.dock === 'top' ? -1 : 1
  ))

  if (viewportWidth < NARROW_FLOOR_WIDTH) {
    // Spec 2.2: docks render first, then free-floating widgets in layer
    // order. Mechanical: stable BLOCK_IDS position breaks layer ties.
    const blockIndex = new Map<BlockId, number>(BLOCK_IDS.map((id, index) => [id, index]))
    const freeSorted = [...free].sort((a, b) => (
      a.layer === b.layer
        ? (blockIndex.get(a.id) ?? 0) - (blockIndex.get(b.id) ?? 0)
        : a.layer - b.layer
    ))
    const stackTier = (item: PlannedFree | PlannedDock): WidgetTier => (
      'tier' in item ? item.tier : 'compact'
    )
    const items: StackedRenderItem[] = [...dockSorted, ...freeSorted].map((item, order) => ({
      id: item.id,
      mode: 'stacked',
      order,
      tier: stackTier(item),
    }))
    return { narrow: true, items }
  }

  return {
    narrow: false,
    items: [
      ...dockSorted.map((item): DockedRenderItem => ({
        id: item.id, mode: 'docked', dock: item.dock, order: item.order,
      })),
      ...free.map((item): AnchoredRenderItem => ({
        id: item.id, mode: 'anchored', leftPct: item.leftPct, topPct: item.topPct, tier: item.tier, layer: item.layer,
      })),
    ],
  }
}
