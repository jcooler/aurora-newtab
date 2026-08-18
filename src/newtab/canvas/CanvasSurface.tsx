import { useMemo, useRef, type ReactNode } from 'react'
import { useDockOverflow } from '../edit/useDockOverflow'
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
  guides?: readonly CanvasGuide[]
  onSelectItem?: (id: WidgetRegistryEntry['id']) => void
  onGripPointerDown?: (id: WidgetRegistryEntry['id'], e: React.PointerEvent) => void
  onGearClick?: (id: WidgetRegistryEntry['id']) => void
  onItemGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  renderWidget: (entry: WidgetRegistryEntry, size: CanvasSize) => ReactNode
}

/** One dock strip (named-layouts spec 2.4): a clean status band. The
 *  scrollbar never shows; TRUE overflow is signaled by masked edge fades and
 *  scrolled by wheel, trackpad, drag, and keyboard — locally, never moving
 *  the page. Subtle arrow nubs appear on hover at the faded edge. */
function DockStrip({
  edge,
  label,
  memberCount,
  children,
}: {
  edge: 'top' | 'bottom'
  label: string
  memberCount: number
  children: ReactNode
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const overflow = useDockOverflow(scrollerRef, memberCount)
  const scrollBy = (delta: number) => {
    scrollerRef.current?.scrollBy({ left: delta })
  }
  return (
    <nav
      aria-label={label}
      className={edge === 'top' ? 'canvas-top-bar' : 'canvas-bottom-bar'}
    >
      <div
        ref={scrollerRef}
        className="dock-scroller"
        data-dock-overflow={overflow.overflowing ? 'true' : undefined}
        data-dock-at-start={overflow.atStart ? 'true' : undefined}
        data-dock-at-end={overflow.atEnd ? 'true' : undefined}
        onWheel={(event) => {
          if (!overflow.overflowing) return
          // Dock scrolling is local and never moves the page (spec 2.4).
          event.preventDefault()
          scrollBy(event.deltaY !== 0 ? event.deltaY : event.deltaX)
        }}
        onKeyDown={(event) => {
          if (!overflow.overflowing) return
          if (event.target instanceof Element && event.target.closest('input, textarea, select, [role="listbox"]')) return
          if (event.key === 'ArrowLeft') { event.preventDefault(); scrollBy(-80) }
          if (event.key === 'ArrowRight') { event.preventDefault(); scrollBy(80) }
        }}
      >
        {children}
      </div>
      {overflow.overflowing && !overflow.atStart ? (
        <button type="button" tabIndex={-1} aria-hidden className="dock-nub" data-direction="start" onClick={() => scrollBy(-160)}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      ) : null}
      {overflow.overflowing && !overflow.atEnd ? (
        <button type="button" tabIndex={-1} aria-hidden className="dock-nub" data-direction="end" onClick={() => scrollBy(160)}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      ) : null}
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
  guides = [],
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
        <DockStrip edge="top" label="Top bar" memberCount={topDock.length}>
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
        <DockStrip edge="bottom" label="Bottom bar" memberCount={bottomDock.length}>
          {bottomDock.map(renderItem)}
        </DockStrip>
      ) : null}
    </div>
  )
}
