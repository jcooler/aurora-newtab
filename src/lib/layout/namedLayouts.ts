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

export interface DockedWidgetPlacement {
  kind: 'docked'
  dock: DockEdge
  order: number
}

export type NamedLayoutPlacement = FreeWidgetPlacement | DockedWidgetPlacement

/** Presence of a widget key means the widget is enabled in this layout
 *  (spec 2.1: a layout stores which widgets are enabled plus each enabled
 *  widget's position, tier, layer, and dock membership). */
export interface NamedLayout {
  id: string
  name: string
  widgets: Partial<Record<BlockId, NamedLayoutPlacement>>
  bulkTier?: WidgetTier
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
}

const ANCHOR_SET: ReadonlySet<string> = new Set(LAYOUT_ANCHORS)
const TIER_SET: ReadonlySet<string> = new Set(WIDGET_TIERS)
const DOCK_SET: ReadonlySet<string> = new Set(DOCK_EDGES)

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

function isDockedPlacement(value: unknown): value is DockedWidgetPlacement {
  return isPlainObject(value)
    && value.kind === 'docked'
    && typeof value.dock === 'string'
    && DOCK_SET.has(value.dock)
    && Number.isInteger(value.order)
    && (value.order as number) >= 0
}

function cleanNamedLayout(
  value: unknown,
  invalidPlacement: 'reject' | 'drop',
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
  return result
}

export function cleanLayoutsDocument(
  value: unknown,
  options: CleanLayoutsDocumentOptions = {},
): LayoutsDocument {
  const invalidPlacement = options.invalidPlacement ?? 'reject'
  if (!isPlainObject(value)
    || value.version !== LAYOUTS_DOCUMENT_VERSION
    || typeof value.activeLayoutId !== 'string'
    || !Array.isArray(value.layouts)
    || value.layouts.length === 0) {
    invalid()
  }
  const layouts = value.layouts.map((layout) => cleanNamedLayout(layout, invalidPlacement))
  const ids = new Set<string>()
  for (const layout of layouts) {
    if (ids.has(layout.id)) invalid()
    ids.add(layout.id)
  }
  if (!ids.has(value.activeLayoutId)) invalid()
  return { version: LAYOUTS_DOCUMENT_VERSION, activeLayoutId: value.activeLayoutId, layouts }
}

export function isLayoutsDocument(value: unknown): value is LayoutsDocument {
  try {
    cleanLayoutsDocument(value)
    return true
  } catch {
    return false
  }
}
