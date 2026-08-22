import { isPlainObject } from '../object'
import { BLOCK_IDS, type BlockId } from './types'

/** Spec 2.2: nine anchor regions — four corners, four edge midlines, center. */
export const LAYOUT_ANCHORS = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
] as const
export type LayoutAnchor = (typeof LAYOUT_ANCHORS)[number]

/** Spec 2.3: the free-floating tiers. Docked is implied by dock membership. */
export const WIDGET_TIERS = ['compact', 'standard', 'full'] as const
export type WidgetTier = (typeof WIDGET_TIERS)[number]

export const DOCK_EDGES = ['top', 'bottom'] as const
export type DockEdge = (typeof DOCK_EDGES)[number]

export interface FreeWidgetPlacement {
  kind: 'free'
  anchor: LayoutAnchor
  /** Percent offsets from the anchor's reference point; NL-P1 stores them so
   *  the pre-migration center point reconstructs exactly (see
   *  pointFromFreePlacement). NL-P2 owns rendering them as percentages of the
   *  available span from the anchor. */
  offsetX: number
  offsetY: number
  tier: WidgetTier
  layer: number
}

/** Legacy strip sections (the interim 2026-08-18 model, superseded the same
 *  day by free `x` placement). Still READ from stored documents — never
 *  written — so section-era saves keep their positions. */
export const DOCK_ALIGNS = ['start', 'center', 'end'] as const
export type DockAlign = (typeof DOCK_ALIGNS)[number]

/** A legacy section's equivalent free position across the strip. */
export const DOCK_ALIGN_X: Readonly<Record<DockAlign, number>> = Object.freeze({
  start: 8,
  center: 50,
  end: 92,
})

export interface DockedWidgetPlacement {
  kind: 'docked'
  dock: DockEdge
  order: number
  /** The member's CENTER as a percent of the strip's width (owner direction
   *  2026-08-18: complete control — "far left, or 10 pixels to the right of
   *  that... just like the regular screen"). Absent: a legacy `align`
   *  resolves through DOCK_ALIGN_X, else center. */
  x?: number
  /** Legacy section (read-only compat; new writes store `x`). */
  align?: DockAlign
  /** The member's chosen size within the strip (owner direction 2026-08-18:
   *  docked Bookmarks compact = the one-letter mark bar). Absent = the
   *  widget's docked default: Bookmarks' full readable bar (spec 2.3
   *  exemption), every other widget's compact composition. */
  tier?: WidgetTier
}

/** The strip position a docked placement renders at (percent of the strip
 *  width, member center). */
export function dockedXPercent(placement: DockedWidgetPlacement): number {
  if (typeof placement.x === 'number') return Math.min(100, Math.max(0, placement.x))
  return placement.align ? DOCK_ALIGN_X[placement.align] : 50
}

/** Enabled globally but not shown in THIS layout (spec 2.5 "hide"). Distinct
 *  from an ABSENT entry, which means "never placed here" and renders at the
 *  widget's designed default slot. */
export interface HiddenWidgetPlacement { kind: 'hidden' }

export type NamedLayoutPlacement = FreeWidgetPlacement | DockedWidgetPlacement | HiddenWidgetPlacement

/** One manually paged canvas card. A stack is a placement, not a widget:
 *  every member keeps its existing data owner and renderer, while this row
 *  owns only shared geometry, tier, layer, order, and the explicit face. */
export interface WidgetStack {
  id: string
  members: readonly BlockId[]
  facing: BlockId
  anchor: LayoutAnchor
  offsetX: number
  offsetY: number
  tier: WidgetTier
  layer: number
}

/** Presence of a widget key means the widget is enabled in this layout
 *  (spec 2.1: a layout stores which widgets are enabled plus each enabled
 *  widget's position, tier, layer, and dock membership). */
export interface NamedLayout {
  id: string
  name: string
  widgets: Partial<Record<BlockId, NamedLayoutPlacement>>
  bulkTier?: WidgetTier
  /** Additive and absent-safe. Existing documents intentionally remain
   *  byte-shaped exactly as before until the user creates a stack. */
  stacks?: readonly WidgetStack[]
}

export const LAYOUTS_DOCUMENT_VERSION = 1

export interface LayoutsDocument {
  version: typeof LAYOUTS_DOCUMENT_VERSION
  activeLayoutId: string
  layouts: NamedLayout[]
}

export const LAYOUTS_DOCUMENT_VALIDATION_MESSAGE = 'Layouts data is invalid.' as const

export class LayoutsDocumentValidationError extends Error {
  constructor() {
    super(LAYOUTS_DOCUMENT_VALIDATION_MESSAGE)
    this.name = 'LayoutsDocumentValidationError'
  }
}

export interface CleanLayoutsDocumentOptions {
  /** 'reject' (default) throws on a malformed KNOWN widget placement; 'drop'
   *  removes it. Unknown widget ids are always dropped, matching
   *  cleanStoredLayout's unknown-block-id convention. Malformed layout rows
   *  and document-level shape always reject in both modes. */
  invalidPlacement?: 'reject' | 'drop'
  /** Runtime resolution cleans malformed stack membership according to the
   *  stack design's recovery rules. Backup import uses `reject` so malformed
   *  stack data is never laundered into a different document. */
  invalidStack?: 'clean' | 'reject'
}

const ANCHOR_SET: ReadonlySet<string> = new Set(LAYOUT_ANCHORS)
const TIER_SET: ReadonlySet<string> = new Set(WIDGET_TIERS)
const DOCK_SET: ReadonlySet<string> = new Set(DOCK_EDGES)
const BLOCK_ID_SET: ReadonlySet<string> = new Set(BLOCK_IDS)

function invalid(): never {
  throw new LayoutsDocumentValidationError()
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFreePlacement(value: unknown): value is FreeWidgetPlacement {
  return isPlainObject(value)
    && value.kind === 'free'
    && typeof value.anchor === 'string'
    && ANCHOR_SET.has(value.anchor)
    && finite(value.offsetX)
    && finite(value.offsetY)
    && typeof value.tier === 'string'
    && TIER_SET.has(value.tier)
    && finite(value.layer)
}

const ALIGN_SET: ReadonlySet<string> = new Set(DOCK_ALIGNS)

function isDockedPlacement(value: unknown): value is DockedWidgetPlacement {
  return isPlainObject(value)
    && value.kind === 'docked'
    && typeof value.dock === 'string'
    && DOCK_SET.has(value.dock)
    && Number.isInteger(value.order)
    && (value.order as number) >= 0
    && (value.align === undefined || (typeof value.align === 'string' && ALIGN_SET.has(value.align)))
    && (value.x === undefined || (typeof value.x === 'number' && Number.isFinite(value.x) && value.x >= 0 && value.x <= 100))
    && (value.tier === undefined || (typeof value.tier === 'string' && TIER_SET.has(value.tier)))
}

function isHiddenPlacement(value: unknown): value is HiddenWidgetPlacement {
  return isPlainObject(value) && value.kind === 'hidden'
}

function cleanNamedLayout(
  value: unknown,
  invalidPlacement: 'reject' | 'drop',
  invalidStack: 'clean' | 'reject',
): NamedLayout {
  if (!isPlainObject(value)
    || typeof value.id !== 'string' || value.id === ''
    || typeof value.name !== 'string' || value.name === ''
    || !isPlainObject(value.widgets)) {
    invalid()
  }
  const widgets: NamedLayout['widgets'] = {}
  for (const id of BLOCK_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value.widgets, id)) continue
    const placement = value.widgets[id]
    if (isHiddenPlacement(placement)) {
      // Canonical clone: extra members never survive.
      widgets[id] = { kind: 'hidden' }
      continue
    }
    if (isFreePlacement(placement) || isDockedPlacement(placement)) {
      widgets[id] = { ...placement }
      continue
    }
    if (invalidPlacement === 'reject') invalid()
  }
  const result: NamedLayout = { id: value.id, name: value.name, widgets }
  if (Object.prototype.hasOwnProperty.call(value, 'bulkTier')) {
    if (typeof value.bulkTier !== 'string' || !TIER_SET.has(value.bulkTier)) invalid()
    result.bulkTier = value.bulkTier as WidgetTier
  }

  if (Object.prototype.hasOwnProperty.call(value, 'stacks')) {
    if (!Array.isArray(value.stacks)) {
      if (invalidStack === 'reject') invalid()
      return result
    }

    const occupied = new Set<string>(Object.keys(widgets))
    const seenStackIds = new Set<string>()
    const stacks: WidgetStack[] = []
    for (const candidate of value.stacks) {
      if (!isPlainObject(candidate)
        || typeof candidate.id !== 'string' || candidate.id === ''
        || !Array.isArray(candidate.members)
        || typeof candidate.facing !== 'string'
        || typeof candidate.anchor !== 'string' || !ANCHOR_SET.has(candidate.anchor)
        || !finite(candidate.offsetX)
        || !finite(candidate.offsetY)
        || typeof candidate.tier !== 'string' || !TIER_SET.has(candidate.tier)
        || !finite(candidate.layer)) {
        if (invalidStack === 'reject') invalid()
        continue
      }

      if (seenStackIds.has(candidate.id)) {
        if (invalidStack === 'reject') invalid()
        continue
      }
      seenStackIds.add(candidate.id)

      const rawSeen = new Set<string>()
      const members: BlockId[] = []
      let malformedMembership = candidate.members.length < 2
      for (const rawMember of candidate.members) {
        if (typeof rawMember !== 'string'
          || !BLOCK_ID_SET.has(rawMember)
          || rawSeen.has(rawMember)
          || occupied.has(rawMember)) {
          malformedMembership = true
          continue
        }
        rawSeen.add(rawMember)
        members.push(rawMember as BlockId)
      }
      if (!members.includes(candidate.facing as BlockId)) malformedMembership = true
      if (invalidStack === 'reject' && malformedMembership) invalid()

      if (members.length === 0) continue
      const facing = members.includes(candidate.facing as BlockId)
        ? candidate.facing as BlockId
        : members[0]
      const geometry = {
        anchor: candidate.anchor as LayoutAnchor,
        offsetX: candidate.offsetX,
        offsetY: candidate.offsetY,
        tier: candidate.tier as WidgetTier,
        layer: candidate.layer,
      }

      if (members.length === 1) {
        const survivor = members[0]
        widgets[survivor] = { kind: 'free', ...geometry }
        occupied.add(survivor)
        continue
      }

      stacks.push({ id: candidate.id, members, facing, ...geometry })
      for (const member of members) occupied.add(member)
    }
    if (stacks.length > 0) result.stacks = stacks
  }
  return result
}

export function cleanLayoutsDocument(
  value: unknown,
  options: CleanLayoutsDocumentOptions = {},
): LayoutsDocument {
  const invalidPlacement = options.invalidPlacement ?? 'reject'
  const invalidStack = options.invalidStack ?? 'clean'
  if (!isPlainObject(value)
    || value.version !== LAYOUTS_DOCUMENT_VERSION
    || typeof value.activeLayoutId !== 'string'
    || !Array.isArray(value.layouts)
    || value.layouts.length === 0) {
    invalid()
  }
  const layouts = value.layouts.map((layout) => cleanNamedLayout(layout, invalidPlacement, invalidStack))
  const ids = new Set<string>()
  for (const layout of layouts) {
    if (ids.has(layout.id)) invalid()
    ids.add(layout.id)
  }
  if (!ids.has(value.activeLayoutId)) invalid()
  return { version: LAYOUTS_DOCUMENT_VERSION, activeLayoutId: value.activeLayoutId, layouts }
}

export function isLayoutsDocument(
  value: unknown,
  options: CleanLayoutsDocumentOptions = {},
): value is LayoutsDocument {
  try {
    cleanLayoutsDocument(value, options)
    return true
  } catch {
    return false
  }
}

export const ANCHOR_POINTS: Readonly<Record<LayoutAnchor, { x: number; y: number }>> = Object.freeze({
  'top-left': { x: 0, y: 0 },
  top: { x: 50, y: 0 },
  'top-right': { x: 100, y: 0 },
  left: { x: 0, y: 50 },
  center: { x: 50, y: 50 },
  right: { x: 100, y: 50 },
  'bottom-left': { x: 0, y: 100 },
  bottom: { x: 50, y: 100 },
  'bottom-right': { x: 100, y: 100 },
})

/** Nearest of {0, 50, 100} per axis; 25/75 are the equidistance boundaries
 *  and ties go to the edge. */
function axisBucket(value: number): 0 | 1 | 2 {
  if (value <= 25) return 0
  if (value >= 75) return 2
  return 1
}

const ANCHOR_GRID: readonly (readonly LayoutAnchor[])[] = [
  ['top-left', 'top', 'top-right'],
  ['left', 'center', 'right'],
  ['bottom-left', 'bottom', 'bottom-right'],
]

export function anchorForPoint(x: number, y: number): LayoutAnchor {
  return ANCHOR_GRID[axisBucket(y)][axisBucket(x)]
}

export function freePlacementFromPoint(
  point: { x: number; y: number; tier: WidgetTier; layer: number },
): FreeWidgetPlacement {
  const anchor = anchorForPoint(point.x, point.y)
  const reference = ANCHOR_POINTS[anchor]
  return {
    kind: 'free',
    anchor,
    offsetX: point.x - reference.x,
    offsetY: point.y - reference.y,
    tier: point.tier,
    layer: point.layer,
  }
}

export function pointFromFreePlacement(placement: FreeWidgetPlacement): { x: number; y: number } {
  const reference = ANCHOR_POINTS[placement.anchor]
  return { x: reference.x + placement.offsetX, y: reference.y + placement.offsetY }
}
