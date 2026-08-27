import {
  ANCHOR_POINTS,
  dockedYPercent,
  dockedXPercent,
  type DockEdge,
  type LayoutsDocument,
  type NamedLayout,
  type WidgetTier,
} from './namedLayouts'
import { defaultFreePlacement } from './defaultPlacements'
import { BLOCK_IDS, type BlockId } from './types'

/** Spec 2.2 narrow floor: below approximately 600 CSS px of width the layout
 *  renders as one vertical stack. The only automatic behavior in the system,
 *  and purely mechanical. */
export const NARROW_FLOOR_WIDTH = 600

export interface RenderStack {
  id: string
  members: readonly BlockId[]
  facing: BlockId
}

export interface AnchoredRenderItem {
  id: BlockId
  mode: 'anchored'
  leftPct: number
  topPct: number
  tier: WidgetTier
  layer: number
  stack?: RenderStack
}
export interface StackedRenderItem { id: BlockId; mode: 'stacked'; order: number; tier: WidgetTier; stack?: RenderStack }
export interface DockedRenderItem { id: BlockId; mode: 'docked'; dock: DockEdge; order: number; xPct: number; yPct?: number; dockTier?: WidgetTier }
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

/** Corrects invalid docked placements ONCE at document resolve time (spec
 *  2.3, owner-reported 2026-08-18: docked Month): a widget with no Docked
 *  tier has no honest strip form, so its docked placement becomes the
 *  identity's designed free default slot. Everything downstream — rendering,
 *  edit sessions, the inspector — then sees one truthful placement. Pure and
 *  identity-stable: the input is never mutated, and the SAME document comes
 *  back when nothing needs correcting. Nothing is written here; a corrected
 *  placement persists only through the user's own explicit Save. */
export function enforceDockEligibility(
  document: LayoutsDocument,
  dockableIds: ReadonlySet<BlockId>,
): LayoutsDocument {
  let changed = false
  const layouts = document.layouts.map((layout) => {
    let maxLayer = -1
    const invalid: BlockId[] = []
    for (const id of BLOCK_IDS) {
      const placement = layout.widgets[id]
      if (placement?.kind === 'free') maxLayer = Math.max(maxLayer, placement.layer)
      if (placement?.kind === 'docked' && !dockableIds.has(id)) invalid.push(id)
    }
    if (invalid.length === 0) return layout
    changed = true
    const widgets = { ...layout.widgets }
    for (const id of invalid) {
      widgets[id] = defaultFreePlacement(id, maxLayer + 1 + BLOCK_IDS.indexOf(id))
    }
    return { ...layout, widgets }
  })
  return changed ? { ...document, layouts } : document
}

interface PlannedFree { id: BlockId; leftPct: number; topPct: number; tier: WidgetTier; layer: number; stack?: RenderStack }
interface PlannedDock { id: BlockId; dock: DockEdge; order: number; xPct: number; yPct?: number; dockTier?: WidgetTier }

/** The size a docked member renders at: its stored tier when the user chose
 *  one, else the widget's docked default — Bookmarks' full readable bar
 *  (spec 2.3 exemption) rides on 'standard'; every other widget's dock
 *  fallback is its compact composition. */
export function resolveDockedTier(
  supported: readonly WidgetTier[],
  dockTier: WidgetTier | undefined,
  defaultTier: WidgetTier,
): WidgetTier {
  return resolveRenderTier(supported, dockTier ?? defaultTier)
}

export function planLayoutRender(
  layout: NamedLayout,
  enabledIds: readonly BlockId[],
  viewportWidth: number,
  /** Widgets that declare a Docked tier. When provided, a stored docked
   *  placement for any OTHER widget is invalid contract data (it has no
   *  honest strip form) and renders FREE at the identity's designed static
   *  default slot instead — the safety half of the law: deterministic, never
   *  guessed, never written back. Omitted = every docked placement honored
   *  (pure-model callers with no registry knowledge). */
  dockableIds?: ReadonlySet<BlockId>,
): LayoutRenderPlan {
  const enabled = new Set<BlockId>(enabledIds)
  const free: PlannedFree[] = []
  const docked: PlannedDock[] = []
  const undockable: BlockId[] = []
  const stackMembers = new Set<BlockId>()
  let maxLayer = -1

  for (const stack of layout.stacks ?? []) {
    for (const member of stack.members) stackMembers.add(member)
    // The stored face is the only authority. If it is globally disabled,
    // suppress the card instead of guessing another member.
    if (!enabled.has(stack.facing)) continue
    const anchor = ANCHOR_POINTS[stack.anchor]
    free.push({
      id: stack.facing,
      leftPct: clampPct(anchor.x + stack.offsetX),
      topPct: clampPct(anchor.y + stack.offsetY),
      tier: stack.tier,
      layer: stack.layer,
      stack: { id: stack.id, members: stack.members, facing: stack.facing },
    })
    maxLayer = Math.max(maxLayer, stack.layer)
  }

  for (const id of BLOCK_IDS) {
    if (!enabled.has(id) || stackMembers.has(id)) continue
    const placement = layout.widgets[id]
    if (!placement) continue
    // Hidden = enabled globally but not shown in this layout (spec 2.5). The
    // entry's PRESENCE also keeps the default-slot loop below from re-adding
    // the widget.
    if (placement.kind === 'hidden') continue
    if (placement.kind === 'docked') {
      if (dockableIds && !dockableIds.has(id)) undockable.push(id)
      else {
        const yPct = dockedYPercent(placement)
        docked.push({
          id,
          dock: placement.dock,
          order: placement.order,
          xPct: dockedXPercent(placement),
          ...(yPct === undefined ? {} : { yPct }),
          ...(placement.tier ? { dockTier: placement.tier } : {}),
        })
      }
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

  // Enabled widgets the layout doesn't know yet: the designed STATIC default
  // slot for that identity (defaultPlacements.ts), the same rule
  // deriveMyLayout uses. The layer is identity-stable RELATIVE ordering
  // (BLOCK_IDS position offset above every stored layer): toggling one
  // widget never reorders its neighbours (the PR-P1 stability contract).
  // The ABSOLUTE number can shift when the stored widget carrying maxLayer
  // is disabled — positions never move and stacking order is invariant, but
  // NL-P3's save path must persist placements from the layout draft, never
  // by reading these derived absolute layers back. Nothing is written here;
  // membership persists at the user's next explicit save.
  for (const id of BLOCK_IDS) {
    if (!enabled.has(id) || stackMembers.has(id)) continue
    if (layout.widgets[id] && !undockable.includes(id)) continue
    const placement = defaultFreePlacement(id, maxLayer + 1 + BLOCK_IDS.indexOf(id))
    const anchor = ANCHOR_POINTS[placement.anchor]
    free.push({
      id,
      leftPct: clampPct(anchor.x + placement.offsetX),
      topPct: clampPct(anchor.y + placement.offsetY),
      tier: placement.tier,
      layer: placement.layer,
    })
  }

  // Left-to-right by position (free-x docks): position IS the order now;
  // the stored order integer only breaks exact-x ties.
  const dockSorted = [...docked].sort((a, b) => (
    a.dock === b.dock
      ? (a.xPct === b.xPct ? a.order - b.order : a.xPct - b.xPct)
      : a.dock === 'top' ? -1 : 1
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
    // Narrow is a mechanical order-only stack. Presentation X/Y never
    // changes it; the stored order is already the user's X-derived order.
    const dockOrderSorted = [...docked].sort((a, b) => (
      a.dock === b.dock
        ? a.order - b.order || BLOCK_IDS.indexOf(a.id) - BLOCK_IDS.indexOf(b.id)
        : a.dock === 'top' ? -1 : 1
    ))
    const items: StackedRenderItem[] = [...dockOrderSorted, ...freeSorted].map((item, order) => ({
      id: item.id,
      mode: 'stacked',
      order,
      tier: stackTier(item),
      ...('stack' in item && item.stack ? { stack: item.stack } : {}),
    }))
    return { narrow: true, items }
  }

  return {
    narrow: false,
    items: [
      ...dockSorted.map((item): DockedRenderItem => ({
        id: item.id, mode: 'docked', dock: item.dock, order: item.order, xPct: item.xPct,
        ...(item.yPct === undefined ? {} : { yPct: item.yPct }),
        ...(item.dockTier ? { dockTier: item.dockTier } : {}),
      })),
      ...free.map((item): AnchoredRenderItem => ({
        id: item.id, mode: 'anchored', leftPct: item.leftPct, topPct: item.topPct, tier: item.tier, layer: item.layer,
        ...(item.stack ? { stack: item.stack } : {}),
      })),
    ],
  }
}
