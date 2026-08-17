import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { CanvasProfileKey } from '../../lib/layout/canvasTypes'
import type { FittedCanvasBlockPlacement } from '../../lib/layout/canvasGeometry'
import type { WidgetRegistryEntry } from '../widgetRegistry'
import WidgetBoundary from '../components/WidgetBoundary'

interface CanvasItemProps {
  entry: WidgetRegistryEntry
  profile: CanvasProfileKey
  placement: FittedCanvasBlockPlacement
  className?: string
  onGeometryChange?: (id: WidgetRegistryEntry['id'], rect: DOMRectReadOnly | null) => void
  children: ReactNode
}

export default function CanvasItem({
  entry,
  profile,
  placement,
  className = '',
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

  const canvas = placement.kind === 'canvas'
  const style: CSSProperties = canvas ? {
    position: 'absolute',
    left: `${placement.left}px`,
    top: `${placement.top}px`,
    width: `${placement.width}px`,
    minHeight: `${placement.height}px`,
    transform: 'translate(-50%, -50%)',
    zIndex: placement.layer,
  } : {
    position: 'relative',
    flex: '0 0 auto',
  }

  return (
    <div
      ref={ref}
      data-testid={`canvas-item-${entry.id}`}
      data-block-id={entry.id}
      data-canvas-profile={profile}
      data-canvas-size={placement.size}
      data-canvas-kind={placement.kind}
      data-canvas-x={canvas ? placement.x : undefined}
      data-canvas-y={canvas ? placement.y : undefined}
      className={`canvas-item${className ? ` ${className}` : ''}`}
      style={style}
    >
      <WidgetBoundary name={entry.label}>{children}</WidgetBoundary>
    </div>
  )
}
