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
import type { WidgetRegistryEntry } from '../widgetRegistry'

interface CanvasSurfaceProps {
  activeLayout: NamedLayout
  entries: readonly WidgetRegistryEntry[]
  viewport: { width: number; height: number }
  elevatedIds?: ReadonlySet<WidgetRegistryEntry['id']>
  /** Hover chrome for ANCHORED items only (spec 2.5); strips and the narrow
   *  stack stay chrome-free. */
  chrome?: 'none' | 'normal' | 'editing'
  selectedId?: WidgetRegistryEntry['id'] | null
  onSelectItem?: (id: WidgetRegistryEntry['id']) => void
  onGripPointerDown?: (id: WidgetRegistryEntry['id'], e: React.PointerEvent) => void
  onGearClick?: (id: WidgetRegistryEntry['id']) => void
  onItemGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  renderWidget: (entry: WidgetRegistryEntry, size: CanvasSize) => ReactNode
}

export default function CanvasSurface({
  activeLayout,
  entries,
  viewport,
  elevatedIds,
  chrome = 'none',
  selectedId = null,
  onSelectItem,
  onGripPointerDown,
  onGearClick,
  onItemGeometryChange,
  renderWidget,
}: CanvasSurfaceProps) {
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const plan = useMemo(() => {
    const enabledIds = entries.map((entry) => entry.id)
    const raw = planLayoutRender(activeLayout, enabledIds, viewport.width)
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
    const size = 'tier' in item ? item.tier : 'compact'
    return (
      <CanvasItem
        key={entry.id}
        entry={entry}
        item={item}
        className={elevatedIds?.has(entry.id) ? 'canvas-item--elevated' : ''}
        chrome={item.mode === 'anchored' ? chrome : 'none'}
        selected={selectedId === entry.id}
        onSelect={onSelectItem}
        onGripPointerDown={onGripPointerDown}
        onGearClick={onGearClick}
        onGeometryChange={onItemGeometryChange}
      >
        {renderWidget(entry, size)}
      </CanvasItem>
    )
  }

  return (
    <div data-canvas-root="" className="canvas-root">
      {topDock.length > 0 ? (
        <nav aria-label="Top bar" className="canvas-top-bar">{topDock.map(renderItem)}</nav>
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
      </section>
      {bottomDock.length > 0 ? (
        <nav aria-label="Bottom bar" className="canvas-bottom-bar">{bottomDock.map(renderItem)}</nav>
      ) : null}
    </div>
  )
}
