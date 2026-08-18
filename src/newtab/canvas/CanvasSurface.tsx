import { useEffect, useMemo, useRef, type ReactNode } from 'react'
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
import { dockedRenderSize, type WidgetRegistryEntry } from '../widgetRegistry'

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
  guides?: readonly CanvasGuide[]
  onSelectItem?: (id: WidgetRegistryEntry['id']) => void
  onGripPointerDown?: (id: WidgetRegistryEntry['id'], e: React.PointerEvent) => void
  onGearClick?: (id: WidgetRegistryEntry['id']) => void
  onItemGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  renderWidget: (entry: WidgetRegistryEntry, size: CanvasSize, docked: boolean) => ReactNode
}

/** One dock strip (named-layouts spec 2.4): a clean status band spanning
 *  the width, with start/center/end sections (owner-refined 2026-08-18: the
 *  user owns placement WITHIN the bar). The scrollbar never shows; TRUE
 *  overflow is signaled by masked edge fades and scrolled by wheel,
 *  trackpad, drag, and keyboard — locally, never moving the page. Subtle
 *  arrow nubs appear on hover at the faded edge. */
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
  const overflowingRef = useRef(overflow.overflowing)
  overflowingRef.current = overflow.overflowing
  const scrollBy = (delta: number) => {
    scrollerRef.current?.scrollBy({ left: delta })
  }

  // React registers onWheel passively, which rejects preventDefault — the
  // local-scroll contract (spec 2.4: dock scrolling never moves the page)
  // needs a native non-passive listener.
  useEffect(() => {
    const element = scrollerRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!overflowingRef.current) return
      event.preventDefault()
      element.scrollBy({ left: event.deltaY !== 0 ? event.deltaY : event.deltaX })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])
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

  const renderSections = (dockItems: readonly DockedRenderItem[]) => (
    (['start', 'center', 'end'] as const).map((align) => (
      <div key={align} className="dock-section" data-align={align}>
        {dockItems.filter((item) => item.align === align).map(renderItem)}
      </div>
    ))
  )

  return (
    <div data-canvas-root="" className="canvas-root">
      {topDock.length > 0 ? (
        <DockStrip edge="top" label="Top bar" memberCount={topDock.length}>
          {renderSections(topDock)}
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
          {renderSections(bottomDock)}
        </DockStrip>
      ) : null}
    </div>
  )
}
