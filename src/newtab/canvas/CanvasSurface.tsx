import { useMemo, type ReactNode } from 'react'
import {
  planLayoutRender,
  resolveRenderTier,
  type AnchoredRenderItem,
  type DockedRenderItem,
  type LayoutRenderItem,
  type StackedRenderItem,
} from '../../lib/layout/renderLayout'
import type { NamedLayout } from '../../lib/layout/namedLayouts'
import type { CanvasSize } from '../../lib/layout/canvasTypes'
import CanvasItem from './CanvasItem'
import CanvasLegibilityLayer from './CanvasLegibilityLayer'
import GuideOverlay from '../edit/GuideOverlay'
import type { CanvasGuide } from '../arrange/canvasSnap'
import { dockedRenderSize, type WidgetRegistryEntry } from '../widgetRegistry'
import StackCard, { type StackCardMember } from './StackCard'
import type { BlockId } from '../../lib/layout/types'

interface CanvasSurfaceProps {
  activeLayout: NamedLayout
  entries: readonly WidgetRegistryEntry[]
  viewport: { width: number; height: number }
  elevatedIds?: ReadonlySet<WidgetRegistryEntry['id']>
  /** Hover chrome for anchored AND docked items (spec 2.5: "hovering a
   *  widget fades in two small controls" — the grip is also the visible way
   *  out of a dock); only the mechanical narrow stack stays chrome-free. */
  chrome?: 'none' | 'normal' | 'editing'
  selectedId?: WidgetRegistryEntry['id'] | null
  selectedStackId?: string | null
  guides?: readonly CanvasGuide[]
  onSelectItem?: (id: WidgetRegistryEntry['id']) => void
  onGripPointerDown?: (id: WidgetRegistryEntry['id'], e: React.PointerEvent) => void
  onGearClick?: (id: WidgetRegistryEntry['id']) => void
  onItemGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  onStackGeometryChange?: (id: string, rect: DOMRectReadOnly | null) => void
  onStepStack?: (stackId: string, direction: -1 | 1) => void
  onFaceStack?: (stackId: string, id: BlockId) => void
  renderWidget: (entry: WidgetRegistryEntry, size: CanvasSize, docked: boolean) => ReactNode
}

/** One dock strip (named-layouts spec 2.4, owner-refined 2026-08-18): a
 *  free one-row lane spanning the width. Every member sits at its OWN
 *  stored x — complete positional control, exactly like the canvas — via
 *  the grid-stack technique (all members share one cell, offset by
 *  percent margins), so the tallest member still sizes the lane and no
 *  scroller, clip, or nub machinery exists to fight the placement. */
function DockStrip({
  edge,
  label,
  children,
}: {
  edge: 'top' | 'bottom'
  label: string
  children: ReactNode
}) {
  return (
    <nav
      aria-label={label}
      className={edge === 'top' ? 'canvas-top-bar' : 'canvas-bottom-bar'}
    >
      <div className="dock-lane">{children}</div>
    </nav>
  )
}

export default function CanvasSurface({
  activeLayout,
  entries,
  viewport,
  elevatedIds,
  chrome = 'none',
  selectedId = null,
  selectedStackId = null,
  guides = [],
  onSelectItem,
  onGripPointerDown,
  onGearClick,
  onItemGeometryChange,
  onStackGeometryChange,
  onStepStack,
  onFaceStack,
  renderWidget,
}: CanvasSurfaceProps) {
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const plan = useMemo(() => {
    const enabledIds = entries.map((entry) => entry.id)
    // Dock eligibility (spec 2.3): a stored docked placement for a widget
    // with no Docked tier renders free at its default slot (planner safety).
    const dockableIds = new Set(entries.filter((entry) => entry.supportsDocked).map((entry) => entry.id))
    const raw = planLayoutRender(activeLayout, enabledIds, viewport.width, dockableIds)
    // Resolve stored tiers against each widget's declared sizes exactly once.
    const items = raw.items.map((item): LayoutRenderItem => {
      if (!('tier' in item)) return item
      const entry = byId.get(item.id)
      return entry ? { ...item, tier: resolveRenderTier(entry.canvasSizes, item.tier) } : item
    })
    return { ...raw, items }
  }, [activeLayout, byId, entries, viewport.width])

  const anchored = plan.items.filter((item): item is AnchoredRenderItem => item.mode === 'anchored')
  const stacked = plan.items.filter((item): item is StackedRenderItem => item.mode === 'stacked')
  const topDock = plan.items
    .filter((item): item is DockedRenderItem => item.mode === 'docked' && item.dock === 'top')
    .sort((a, b) => a.order - b.order)
  const bottomDock = plan.items
    .filter((item): item is DockedRenderItem => item.mode === 'docked' && item.dock === 'bottom')
    .sort((a, b) => a.order - b.order)

  const renderItem = (item: LayoutRenderItem) => {
    const entry = byId.get(item.id)
    if (!entry) return null
    const size = item.mode === 'docked'
      ? dockedRenderSize(entry, item.dockTier)
      : 'tier' in item ? item.tier : 'compact'
    if ('stack' in item && item.stack) {
      const stack = item.stack
      const objectId = `stack:${stack.id}`
      const members = stack.members.flatMap((memberId): StackCardMember[] => {
        const memberEntry = byId.get(memberId)
        if (!memberEntry) return []
        const memberSize = resolveRenderTier(memberEntry.canvasSizes, item.tier)
        return [{
          id: memberId,
          label: memberEntry.label,
          size: memberSize,
          content: renderWidget(memberEntry, memberSize, false),
        }]
      })
      return (
        <CanvasItem
          key={objectId}
          entry={entry}
          item={item}
          objectId={objectId}
          movementLabel={`${entry.label} +${Math.max(0, members.length - 1)}`}
          size={size}
          className={stack.members.some((id) => elevatedIds?.has(id)) ? 'canvas-item--elevated' : ''}
          chrome={item.mode === 'stacked' ? 'none' : chrome}
          selected={selectedStackId === stack.id}
          onSelect={onSelectItem}
          onGripPointerDown={onGripPointerDown}
          onGearClick={onGearClick}
          onObjectGeometryChange={onStackGeometryChange}
        >
          <StackCard
            id={stack.id}
            members={members}
            facing={stack.facing}
            editing={chrome === 'editing'}
            onStep={(direction) => onStepStack?.(stack.id, direction)}
            onFace={(id) => onFaceStack?.(stack.id, id)}
          />
        </CanvasItem>
      )
    }

    return (
      <CanvasItem
        key={entry.id}
        entry={entry}
        item={item}
        size={size}
        className={elevatedIds?.has(entry.id) ? 'canvas-item--elevated' : ''}
        // Spec 2.5's "hovering a widget fades in two small controls" applies
        // to docked members too — the grip is the visible way OUT of a dock
        // (owner-reported 2026-08-18). Only the mechanical narrow stack is
        // chrome-free: it has no placement to edit.
        chrome={item.mode === 'stacked' ? 'none' : chrome}
        selected={selectedId === entry.id}
        onSelect={onSelectItem}
        onGripPointerDown={onGripPointerDown}
        onGearClick={onGearClick}
        onGeometryChange={onItemGeometryChange}
      >
        {renderWidget(entry, size, item.mode === 'docked')}
      </CanvasItem>
    )
  }

  return (
    <div data-canvas-root="" className="canvas-root">
      {topDock.length > 0 ? (
        <DockStrip edge="top" label="Top bar">
          {topDock.map(renderItem)}
        </DockStrip>
      ) : null}
      <section
        aria-label="Canvas"
        data-canvas-surface=""
        data-canvas-narrow={plan.narrow ? 'true' : undefined}
        className={plan.narrow ? 'canvas-surface canvas-surface--stack' : 'canvas-surface'}
        style={plan.narrow ? undefined : { minHeight: `${viewport.height}px` }}
      >
        <CanvasLegibilityLayer />
        {plan.narrow ? stacked.map(renderItem) : anchored.map(renderItem)}
        <GuideOverlay guides={guides} />
      </section>
      {bottomDock.length > 0 ? (
        <DockStrip edge="bottom" label="Bottom bar">
          {bottomDock.map(renderItem)}
        </DockStrip>
      ) : null}
    </div>
  )
}
