import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { LayoutRenderItem } from '../../lib/layout/renderLayout'
import type { WidgetRegistryEntry } from '../widgetRegistry'
import WidgetBoundary from '../components/WidgetBoundary'

interface CanvasItemProps {
  entry: WidgetRegistryEntry
  item: LayoutRenderItem
  className?: string
  /** Hover controls (named-layouts spec 2.5). 'none' (default) keeps strips
   *  and the narrow stack chrome-free; 'normal' fades in the grip + gear on
   *  hover/focus; 'editing' is Task 4's edit-session chrome. */
  chrome?: 'none' | 'normal' | 'editing'
  onGripPointerDown?: (id: WidgetRegistryEntry['id'], e: React.PointerEvent) => void
  onGearClick?: (id: WidgetRegistryEntry['id']) => void
  onGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  children: ReactNode
}

export default function CanvasItem({
  entry,
  item,
  className = '',
  chrome = 'none',
  onGripPointerDown,
  onGearClick,
  onGeometryChange,
  children,
}: CanvasItemProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!onGeometryChange || !ref.current) return
    const publish = () => {
      if (ref.current) onGeometryChange(entry.id, ref.current.getBoundingClientRect())
    }
    publish()
    if (typeof ResizeObserver === 'undefined') return () => onGeometryChange(entry.id, null)
    const observer = new ResizeObserver(publish)
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      onGeometryChange(entry.id, null)
    }
  }, [entry.id, onGeometryChange])

  // Content-tight (spec 2.2): the item box is the rendered content. Anchored
  // items are positioned by percent and centered on their point; no width or
  // height is ever imposed here.
  const style: CSSProperties = item.mode === 'anchored' ? {
    position: 'absolute',
    left: `${item.leftPct}%`,
    top: `${item.topPct}%`,
    transform: 'translate(-50%, -50%)',
    zIndex: item.layer,
  } : {
    position: 'relative',
    flex: '0 0 auto',
  }

  const size = 'tier' in item ? item.tier : 'compact'

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-testid={`canvas-item-${entry.id}`}
      data-block-id={entry.id}
      data-canvas-size={size}
      data-canvas-mode={item.mode}
      className={`canvas-item${className ? ` ${className}` : ''}`}
      style={style}
    >
      <WidgetBoundary name={entry.label}>{children}</WidgetBoundary>
      {chrome === 'normal' ? (
        <span className="canvas-item-chrome">
          <button
            type="button"
            aria-label={`Move ${entry.label}`}
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
