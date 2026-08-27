import { useLayoutEffect, useRef, useState } from 'react'
import { searchWeb } from '../../services/search'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import type { CanvasSize } from '../../lib/layout/canvasTypes'
import type { WidgetPresentationMode } from '../widgetRenderers'
import TierFrame from '../widgets/shared/TierFrame'

const SEARCH_EDGE_MARGIN = 8
const SEARCH_UTILITY_GAP = 8
const SEARCH_FOCUS_EXTENT = 4

interface SearchGeometryInput {
  viewportWidth: number
  centerX: number
  requestedWidth: number
  utilityStart?: number
}

export interface SearchSafeGeometry {
  width: number
  translateX: number
  left: number
  right: number
}

/** Fits Search inside the viewport and before the right-side utility controls.
 * The focus ring extends 4px beyond the input, so that extent participates in
 * both edge and utility clearance instead of being visually clipped. */
export function projectSearchSafeGeometry({
  viewportWidth,
  centerX,
  requestedWidth,
  utilityStart,
}: SearchGeometryInput): SearchSafeGeometry {
  const safeLeft = SEARCH_EDGE_MARGIN + SEARCH_FOCUS_EXTENT
  const safeRight = Math.max(
    safeLeft,
    Math.min(
      viewportWidth - SEARCH_EDGE_MARGIN - SEARCH_FOCUS_EXTENT,
      (utilityStart ?? viewportWidth) - SEARCH_UTILITY_GAP - SEARCH_FOCUS_EXTENT,
    ),
  )
  const width = Math.max(0, Math.min(requestedWidth, safeRight - safeLeft))
  const idealLeft = centerX - width / 2
  const left = Math.min(Math.max(idealLeft, safeLeft), safeRight - width)
  return { width, translateX: left - idealLeft, left, right: left + width }
}

export default function SearchBar({
  canvasSize = 'standard',
  presentation = 'free',
}: {
  canvasSize?: CanvasSize
  presentation?: WidgetPresentationMode
} = {}) {
  const [settings] = useStoredKey('settings')
  const formRef = useRef<HTMLFormElement>(null)
  const [geometry, setGeometry] = useState<SearchSafeGeometry | null>(null)

  useLayoutEffect(() => {
    const form = formRef.current
    if (!form) return
    const parent = form.parentElement
    const controls = [...document.querySelectorAll<HTMLElement>('.utility-tray-trigger, .chrome-tab-trigger, .settings-gear')]
    const update = () => {
      const parentRect = parent?.getBoundingClientRect()
      const requestedWidth = Math.min(canvasSize === 'compact' ? 280 : 320, parentRect?.width || Number.POSITIVE_INFINITY)
      const centerX = parentRect && parentRect.width > 0
        ? parentRect.left + parentRect.width / 2
        : window.innerWidth / 2
      const utilityStart = controls
        .map((control) => control.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .reduce<number | undefined>((left, rect) => left === undefined ? rect.left : Math.min(left, rect.left), undefined)
      const next = projectSearchSafeGeometry({
        viewportWidth: window.innerWidth,
        centerX,
        requestedWidth,
        utilityStart,
      })
      setGeometry((current) => current
        && current.width === next.width
        && current.translateX === next.translateX
        && current.left === next.left
        && current.right === next.right
        ? current
        : next)
    }

    update()
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    if (parent) observer?.observe(parent)
    for (const control of controls) observer?.observe(control)
    return () => {
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [canvasSize, presentation, settings?.widgets.search])

  if (!settings?.widgets.search) return null
  const form = (
    <form
      ref={formRef}
      role="search"
      data-canvas-size={canvasSize}
      data-search-safe-zone=""
      data-search-presentation={presentation}
      className={presentation === 'stack'
        ? 'core-search-stack__form'
        : 'text-photo mt-8 mid:mt-4 short:mt-2 xshort:mt-1 max-[420px]:mb-3 flex items-center gap-2 text-canvas-fg'}
      style={presentation !== 'stack' && geometry ? { width: `${geometry.width}px`, transform: `translateX(${geometry.translateX}px)` } : undefined}
      onSubmit={(e) => {
        e.preventDefault()
        const q = String(new FormData(e.currentTarget).get('q') ?? '').trim()
        if (q) void searchWeb(q)
      }}
    >
      {presentation === 'stack' ? <span aria-hidden className="core-search-stack__icon">⌕</span> : (
        <svg
          data-testid="free-search-icon"
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4 shrink-0 text-canvas-fg-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </svg>
      )}
      <input
        name="q"
        type="search"
        placeholder="Search the web"
        aria-label="Search the web"
        autoComplete="off"
        data-canvas-type-role="body"
        className={presentation === 'stack'
          ? 'core-search-stack__input outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
          : 'text-photo min-w-0 flex-1 border-b border-canvas-fg-muted/50 bg-transparent px-1 py-2 mid:py-1 short:py-1 xshort:py-0.5 text-left text-canvas-fg placeholder:text-canvas-fg-muted outline-none focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'}
      />
      {presentation === 'stack' && canvasSize === 'standard' ? <kbd>Enter</kbd> : null}
    </form>
  )
  if (presentation === 'stack') {
    return (
      <TierFrame label="Search" tier={canvasSize} state="ready" className={`core-search-stack core-search-stack--${canvasSize}`}>
        {form}
      </TierFrame>
    )
  }
  return form
}
