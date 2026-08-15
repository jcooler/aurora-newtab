import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  anchorPanel,
  type HugRect,
  type PanelPlacement,
} from '../layout/anchor'
import type { Size } from '../layout/clamp'

interface ViewportPanelAnchorOptions {
  open: boolean
  invokerRef: RefObject<HTMLElement | null>
  panelRef: RefObject<HTMLElement | null>
  preferredSize: Size
  mapInvokerRect?: (rect: DOMRectReadOnly, viewportWidth: number) => DOMRectReadOnly | HugRect
}

function samePlacement(left: PanelPlacement | null, right: PanelPlacement): boolean {
  if (!left || left.left !== right.left) return false
  if ('top' in left && 'top' in right) return left.top === right.top
  if ('bottom' in left && 'bottom' in right) return left.bottom === right.bottom
  return false
}

/** Own the geometry lifecycle of one currently open anchored panel.
 *
 * The hook deliberately owns only measurement: the invoker remains the
 * placement source, the rendered panel border box becomes the live size, and
 * viewport/content changes coalesce through one animation frame. Callers keep
 * all persistence, timer, focus, and close semantics. */
export function useViewportPanelAnchor({
  open,
  invokerRef,
  panelRef,
  preferredSize,
  mapInvokerRect,
}: ViewportPanelAnchorOptions): PanelPlacement | null {
  const [anchor, setAnchor] = useState<PanelPlacement | null>(null)
  const generationRef = useRef(0)

  useLayoutEffect(() => {
    const generation = ++generationRef.current
    if (!open) {
      setAnchor(null)
      return
    }

    let disposed = false
    let frame: number | null = null
    let observedPanel: HTMLElement | null = null
    let observer: ResizeObserver | null = null

    const isCurrent = () => !disposed && generationRef.current === generation

    const measure = () => {
      if (!isCurrent()) return
      const invoker = invokerRef.current
      if (!invoker) return
      const viewport = { w: window.innerWidth, h: window.innerHeight }
      const measuredInvoker = invoker.getBoundingClientRect()
      const invokerRect = mapInvokerRect
        ? mapInvokerRect(measuredInvoker, viewport.w)
        : measuredInvoker
      const renderedRect = panelRef.current?.getBoundingClientRect()
      const panelSize = renderedRect && (renderedRect.width > 0 || renderedRect.height > 0)
        ? { w: renderedRect.width, h: renderedRect.height }
        : preferredSize
      const next = anchorPanel(invokerRect, panelSize, viewport)
      setAnchor((current) => samePlacement(current, next) ? current : next)
    }

    const observeCurrentPanel = () => {
      if (!observer || !isCurrent()) return
      const current = panelRef.current
      if (current === observedPanel) return
      if (observedPanel) observer.unobserve(observedPanel)
      observedPanel = current
      if (observedPanel) observer.observe(observedPanel)
    }

    const flush = () => {
      frame = null
      if (!isCurrent()) return
      observeCurrentPanel()
      measure()
    }

    const schedule = () => {
      if (!isCurrent() || frame !== null) return
      if (typeof requestAnimationFrame === 'function') {
        frame = requestAnimationFrame(flush)
      } else {
        flush()
      }
    }

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule)
    }
    measure()
    observeCurrentPanel()
    schedule()
    window.addEventListener('resize', schedule)

    return () => {
      disposed = true
      if (generationRef.current === generation) generationRef.current += 1
      window.removeEventListener('resize', schedule)
      if (frame !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frame)
      }
      observer?.disconnect()
      observer = null
      observedPanel = null
    }
  }, [open, invokerRef, panelRef, preferredSize.w, preferredSize.h, mapInvokerRect])

  return anchor
}
