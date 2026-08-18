import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { LayoutRenderItem } from '../../lib/layout/renderLayout'
import type { WidgetRegistryEntry } from '../widgetRegistry'
import WidgetBoundary from '../components/WidgetBoundary'

interface CanvasItemProps {
  entry: WidgetRegistryEntry
  item: LayoutRenderItem
  className?: string
  onGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  children: ReactNode
}

export default function CanvasItem({ entry, item, className = '', onGeometryChange, children }: CanvasItemProps) {
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
    </div>
  )
}
