import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { edgeClampOffset } from './edgeClamp'
import type { CanvasSize } from '../../lib/layout/canvasTypes'
import type { LayoutRenderItem } from '../../lib/layout/renderLayout'
import type { WidgetRegistryEntry } from '../widgetRegistry'
import WidgetBoundary from '../components/WidgetBoundary'

interface CanvasItemProps {
  entry: WidgetRegistryEntry
  item: LayoutRenderItem
  /** Stable placement identity. Stack faces may change without remounting
   *  the one card or moving its geometry record. */
  objectId?: string
  movementLabel?: string
  /** The resolved render size (docked members resolve through
   *  dockedRenderSize); omitted = the item's own tier or compact. */
  size?: CanvasSize
  className?: string
  stackTargetLabel?: string
  /** Hover controls (named-layouts spec 2.5). 'none' (default) keeps strips
   *  and the narrow stack chrome-free; 'normal' fades in the grip + gear on
   *  hover/focus; 'editing' is Task 4's edit-session chrome. */
  chrome?: 'none' | 'normal' | 'editing'
  /** Edit-session selection (chrome="editing" only). */
  selected?: boolean
  onSelect?: (id: WidgetRegistryEntry['id']) => void
  onGripPointerDown?: (id: WidgetRegistryEntry['id'], e: React.PointerEvent) => void
  onGearClick?: (id: WidgetRegistryEntry['id']) => void
  onGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  onObjectGeometryChange?: (id: string, rect: DOMRectReadOnly | null) => void
  children: ReactNode
}

/** True when the wrapper holds real rendered content. WidgetBoundary returns
 *  its children verbatim, so a widget that returned null leaves no content
 *  node here — an exact DOM check, never a size measurement, identical in
 *  jsdom and the browser. Chrome and footprint spans are this component's
 *  own decoration and never count as content. */
function hasRenderedContent(node: HTMLElement): boolean {
  return [...node.childNodes].some((child) => {
    if (child.nodeType === 3) return (child.textContent ?? '').trim().length > 0
    if (!(child instanceof Element)) return false
    return !child.classList.contains('canvas-item-chrome')
      && !child.classList.contains('canvas-item-footprint')
      && !child.classList.contains('canvas-item-stack-target')
  })
}

export default function CanvasItem({
  entry,
  item,
  objectId = entry.id,
  movementLabel = entry.label,
  size: sizeProp,
  className = '',
  stackTargetLabel,
  chrome = 'none',
  selected = false,
  onSelect,
  onGripPointerDown,
  onGearClick,
  onGeometryChange,
  onObjectGeometryChange,
  children,
}: CanvasItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  // NL-P6 finding F7: a widget can be ENABLED but render nothing (World
  // clocks with no clocks, Countdown with no countdowns, Habits with no
  // habits, Sun/Moon on a polar day) — the no-husk law is honored INSIDE
  // each widget, but this wrapper still painted, leaving an invisible ghost
  // that was selectable, draggable, chrome-bearing, and counted in overlap
  // warnings. WidgetBoundary returns its children verbatim, so a
  // null-rendering widget leaves NO content node here: the check is exact
  // DOM content, never a size measurement, so it holds in jsdom and in the
  // browser alike (and re-runs every render, since a widget gains content
  // the moment the user configures it).
  const [empty, setEmpty] = useState(false)
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    const evaluate = () => setEmpty(!hasRenderedContent(node))
    evaluate()
    if (typeof MutationObserver === 'undefined') return
    // A MutationObserver, NOT a render-time check: widgets fill in
    // asynchronously (useStoredKey resolving, a connector snapshot landing),
    // and when a CHILD re-renders on its own this component does not, so a
    // render-time check would latch "empty" forever and permanently strip a
    // real widget's chrome. Watching the DOM is the only observation that
    // sees content appear AND disappear.
    const observer = new MutationObserver(evaluate)
    observer.observe(node, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if ((!onGeometryChange && !onObjectGeometryChange) || !ref.current) return
    // An empty widget occupies nothing, so it publishes nothing — that is
    // what keeps it out of the inspector's overlap warning. Read the DOM
    // directly rather than the `empty` STATE: state settles one render
    // later, and a transient rect would be exactly the stale-geometry bug
    // the overlap note already suffered once.
    const publish = () => {
      const node = ref.current
      if (!node) return
      const rect = hasRenderedContent(node) ? node.getBoundingClientRect() : null
      onGeometryChange?.(entry.id, rect)
      onObjectGeometryChange?.(objectId, rect)
    }
    publish()
    if (typeof ResizeObserver === 'undefined') return () => {
      onGeometryChange?.(entry.id, null)
      onObjectGeometryChange?.(objectId, null)
    }
    const observer = new ResizeObserver(publish)
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      onGeometryChange?.(entry.id, null)
      onObjectGeometryChange?.(objectId, null)
    }
  }, [empty, entry.id, objectId, onGeometryChange, onObjectGeometryChange])

  // ResizeObserver fires on SIZE changes only — a position-only move (drag,
  // nudge, dock/undock re-flow) would leave the published rect stale at the
  // OLD position (owner-reported 2026-08-18: the next grab computed a
  // garbage pointer offset and the widget leapt; the overlap note warned
  // about positions widgets left long ago). Every placement change
  // re-publishes; cheap, and the RO effect above keeps ownership of
  // observation and the null cleanup.
  useLayoutEffect(() => {
    if ((!onGeometryChange && !onObjectGeometryChange) || !ref.current) return
    const node = ref.current
    const rect = hasRenderedContent(node) ? node.getBoundingClientRect() : null
    onGeometryChange?.(entry.id, rect)
    onObjectGeometryChange?.(objectId, rect)
  }, [empty, entry.id, item, objectId, onGeometryChange, onObjectGeometryChange])

  // Edge safety clamp (NL-P6 finding F6, DY-P1 review I1). Anchored AND
  // dock placements are stored as PERCENT points while
  // widgets have PIXEL dimensions. The same document opened in a narrower
  // window, a restored backup, or a legal 0/100 dock point can otherwise
  // strand painted content beyond its live surface. The correction is
  // storage-neutral, recomputes on resize, and never moves a neighbour.
  const [clamp, setClamp] = useState({ dx: 0, dy: 0 })
  const clampRef = useRef(clamp)
  clampRef.current = clamp
  useLayoutEffect(() => {
    const node = ref.current
    const surface = node?.offsetParent as HTMLElement | null
    const docked = item.mode === 'docked'
    const explicitDock = docked && item.yPct !== undefined
    if (!node || !surface || (item.mode !== 'anchored' && !docked)) {
      if (clampRef.current.dx !== 0 || clampRef.current.dy !== 0) setClamp({ dx: 0, dy: 0 })
      return
    }
    const measure = () => {
      const applied = clampRef.current
      const rect = node.getBoundingClientRect()
      const surfaceRect = surface.getBoundingClientRect()
      // Measure the UNCLAMPED box (subtract what we already applied) so the
      // computation converges instead of chasing its own correction.
      const raw = {
        left: rect.left - surfaceRect.left - applied.dx,
        right: rect.right - surfaceRect.left - applied.dx,
        top: rect.top - surfaceRect.top - applied.dy,
        bottom: rect.bottom - surfaceRect.top - applied.dy,
      }
      // Canvas placements retain their 8px viewport safety inset. A dock's
      // band already owns the approved 5px viewport inset, so its
      // member only needs to stay inside the band itself.
      const measured = edgeClampOffset(
        raw,
        { width: surfaceRect.width, height: surfaceRect.height },
        docked ? 0 : undefined,
      )
      // An absent-Y legacy dock member still owns the exact historical row
      // baseline. Correct only inline overflow; explicit two-axis dock
      // placements remain safely clamped on both axes.
      const next = docked && !explicitDock ? { dx: measured.dx, dy: 0 } : measured
      if (Math.abs(next.dx - applied.dx) > 0.5 || Math.abs(next.dy - applied.dy) > 0.5) {
        setClamp(next)
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [item])

  // Content-tight (spec 2.2): the item box is the rendered content. Anchored
  // items are positioned by percent and centered on their point; no width or
  // height is ever imposed here. Docked members use the lane's grid-stack:
  // every member shares the single cell and offsets by its own x percent
  // (margin % resolves against the lane width), centered on that point —
  // the same ownership model as the canvas (owner-refined 2026-08-18).
  const style: CSSProperties = item.mode === 'anchored' ? {
    position: 'absolute',
    left: `${item.leftPct}%`,
    top: `${item.topPct}%`,
    transform: `translate(calc(-50% + ${clamp.dx}px), calc(-50% + ${clamp.dy}px))`,
    zIndex: item.layer,
  } : item.mode === 'docked' && item.yPct !== undefined ? {
    position: 'absolute',
    left: `${item.xPct}%`,
    top: `${item.yPct}%`,
    transform: `translate(calc(-50% + ${clamp.dx}px), calc(-50% + ${clamp.dy}px))`,
  } : item.mode === 'docked' ? {
    position: 'relative',
    gridColumn: '1',
    gridRow: item.dock === 'top' ? '1' : '2',
    justifySelf: 'start',
    // The immutable legacy lane had 2px inline padding. Express that exact
    // old content-box percentage against the new full-width shared grid so
    // mixed legacy/explicit DOM order does not move an absent-Y pixel.
    marginLeft: `calc(${item.xPct}% + ${2 - item.xPct * 0.04}px)`,
    transform: `translateX(calc(-50% + ${clamp.dx}px))`,
  } : {
    position: 'relative',
    flex: '0 0 auto',
  }

  const size = sizeProp ?? ('tier' in item ? item.tier : 'compact')
  const editing = chrome === 'editing'
  const editingClass = editing
    ? ` canvas-item--editing${selected ? ' canvas-item--selected' : ''}`
    : ''

  // Widget interiors become inert during an edit session (spec 2.5) WITHOUT
  // changing the DOM shape the interior CSS child selectors depend on: the
  // attribute is toggled directly on the rendered interior children, never
  // via an extra wrapper element.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    for (const child of node.children) {
      if (child.classList.contains('canvas-item-chrome') || child.hasAttribute('data-stack-card')) continue
      child.toggleAttribute('inert', editing)
    }
    return () => {
      for (const child of node.children) {
        if (!child.hasAttribute('data-stack-card')) child.removeAttribute('inert')
      }
    }
  }, [editing, children])

  return (
    <div
      ref={ref}
      // In an edit session the wrapper IS the selection target: interiors are
      // inert, clicking selects and never activates the widget (spec 2.5).
      // An EMPTY widget is inert everywhere (F7): no focus stop, no role, no
      // selection, no drag handle — it is not a thing the user can see, so
      // it must not be a thing the user can grab.
      tabIndex={editing && !empty ? 0 : -1}
      role={editing && !empty ? 'button' : undefined}
      aria-pressed={editing && !empty ? selected : undefined}
      aria-label={editing && !empty ? `Select ${movementLabel}` : undefined}
      onClick={editing && !empty ? () => onSelect?.(entry.id) : undefined}
      // In edit mode the whole widget is the drag handle (spec 2.5: "drag
      // moves with pointer capture"); a press with no movement is a click,
      // which selects. Docked items are draggable too (spec 2.4: order is
      // draggable; dragging out undocks).
      onPointerDown={editing && !empty && (item.mode === 'anchored' || item.mode === 'docked')
        ? (event) => onGripPointerDown?.(entry.id, event)
        : undefined}
      data-testid={`canvas-item-${objectId}`}
      data-block-id={entry.id}
      data-canvas-object-id={objectId}
      data-canvas-size={size}
      data-canvas-mode={item.mode}
      data-dock-positioning={item.mode === 'docked'
        ? item.yPct === undefined ? 'legacy' : 'explicit'
        : undefined}
      data-canvas-empty={empty ? '' : undefined}
      className={`canvas-item${editingClass}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <WidgetBoundary name={entry.label}>{children}</WidgetBoundary>
      {stackTargetLabel ? (
        <span className="canvas-item-stack-target" role="status">
          {stackTargetLabel}
        </span>
      ) : null}
      {editing && entry.expandedFootprint && item.mode === 'anchored' ? (
        // Dashed expansion footprint (spec 2.6): opens the way the real
        // panel does — toward the horizontal center, downward from the top
        // half — and renders at EVERY position including corners.
        <span
          className="canvas-item-footprint"
          data-testid={`canvas-footprint-${entry.id}`}
          aria-hidden
          style={{
            width: entry.expandedFootprint.width,
            height: entry.expandedFootprint.height,
            ...(item.leftPct < 50 ? { left: 0 } : { right: 0 }),
            ...(item.topPct < 50 ? { top: '100%' } : { bottom: '100%' }),
          }}
        />
      ) : null}
      {chrome === 'normal' && !empty ? (
        <span className="canvas-item-chrome">
          <button
            type="button"
            aria-label={`Move ${movementLabel}`}
            className="canvas-item-chrome__button"
            onPointerDown={(event) => onGripPointerDown?.(entry.id, event)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="8" cy="6" r="1.6" /><circle cx="16" cy="6" r="1.6" />
              <circle cx="8" cy="12" r="1.6" /><circle cx="16" cy="12" r="1.6" />
              <circle cx="8" cy="18" r="1.6" /><circle cx="16" cy="18" r="1.6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={`${entry.label} settings`}
            className="canvas-item-chrome__button"
            onClick={() => onGearClick?.(entry.id)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82-.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </span>
      ) : null}
    </div>
  )
}
