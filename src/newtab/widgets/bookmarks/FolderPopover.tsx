import { useEffect, useLayoutEffect, useRef, useState, type SVGProps } from 'react'
import { createPortal } from 'react-dom'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import type { BookmarkFolder, BookmarkItem } from '../../../services/bookmarks'
import { faviconUrl } from '../links/linksLogic'

// Kept clear of the viewport edge when the panel is nudged back on-screen.
const EDGE_MARGIN = 8

export function FolderIcon({ className = '', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
      {...props}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

/** Drill-in popover for a bookmarks-bar chip (a folder, or the "»" overflow
 *  chip). `title`/`items`/`folders` describe the top-level view; drilling
 *  into a subfolder pushes onto `stack`, and "‹ Back" pops it — the
 *  top-level view is never itself pushed onto the stack, so popping back to
 *  it needs no special-casing. */
export default function FolderPopover({
  title,
  items,
  folders,
  anchor,
  onClose,
}: {
  title: string
  items: BookmarkItem[]
  folders: BookmarkFolder[]
  anchor: HTMLElement
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [stack, setStack] = useState<BookmarkFolder[]>([])
  const [position, setPosition] = useState({ left: EDGE_MARGIN, top: EDGE_MARGIN })
  const top = stack[stack.length - 1]
  const currentTitle = top ? top.title : title
  const currentItems = top ? top.items : items
  const currentFolders = top ? top.folders : folders

  useFocusTrap(panelRef, true)
  // Newest-first shared stack (src/lib/dialogStack.ts).
  useDialogEscape(onClose)

  // A full-viewport backdrop can sit above this anchored popover when any
  // ancestor creates a stacking context. Chromium then paints the menu but
  // routes every pointer event to the backdrop, making the visible controls
  // unusable. Listen for outside pointers instead, so dismissal never places
  // an element over the menu itself.
  useEffect(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node
        && !panelRef.current?.contains(target)
        && !anchor.contains(target)
      ) onClose()
    }
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [anchor, onClose])

  // The menu is portaled out of the Dock's horizontal scrollport. Position
  // it from the live chip rectangle and clamp it to the viewport on every
  // open, drill, resize, or content-size change.
  useLayoutEffect(() => {
    let frame: number | null = null
    const measure = () => {
      frame = null
      const el = panelRef.current
      if (!el) return
      const panelRect = el.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      if (panelRect.width === 0 || anchorRect.width === 0) return
      const maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - EDGE_MARGIN - panelRect.width)
      const left = Math.min(
        maxLeft,
        Math.max(EDGE_MARGIN, anchorRect.left + anchorRect.width / 2 - panelRect.width / 2),
      )
      const belowTop = anchorRect.bottom + 6
      const aboveTop = anchorRect.top - 6 - panelRect.height
      const belowSpace = window.innerHeight - EDGE_MARGIN - belowTop
      const aboveSpace = anchorRect.top - EDGE_MARGIN - 6
      const preferredTop = panelRect.height <= belowSpace || belowSpace >= aboveSpace ? belowTop : aboveTop
      const maxTop = Math.max(EDGE_MARGIN, window.innerHeight - EDGE_MARGIN - panelRect.height)
      const next = { left, top: Math.min(maxTop, Math.max(EDGE_MARGIN, preferredTop)) }
      setPosition((current) => current?.left === next.left && current.top === next.top ? current : next)
    }
    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('resize', schedule)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(panelRef.current!)
    observer?.observe(anchor)
    return () => {
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [anchor, currentTitle, currentItems.length, currentFolders.length])

  return createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${currentTitle} bookmarks`}
        style={{
          left: position.left,
          top: position.top,
        }}
        className="fixed z-50 max-h-[calc(100dvh-1rem)] w-64 overflow-y-auto rounded-panel border border-panel-border bg-panel-solid p-1 text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
      >
          {top && (
            <button
              type="button"
              onClick={() => setStack((s) => s.slice(0, -1))}
              className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-[420px]:min-h-9"
            >
              ‹ Back
            </button>
          )}
          {currentFolders.length === 0 && currentItems.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-fg-muted">Empty folder</p>
          ) : (
            <ul>
              {currentFolders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    onClick={() => setStack((s) => [...s, folder])}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-fg hover:bg-control-bg-hover focus-visible:outline-2 focus-visible:outline-accent max-[420px]:min-h-9"
                  >
                    <FolderIcon />
                    <span className="truncate">{folder.title}</span>
                  </button>
                </li>
              ))}
              {currentItems.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.url}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-fg hover:bg-control-bg-hover focus-visible:outline-2 focus-visible:outline-accent max-[420px]:min-h-9"
                  >
                    <img
                      src={faviconUrl(item.url)}
                      alt=""
                      width={14}
                      height={14}
                      className="shrink-0"
                    />
                    <span className="truncate">{item.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
      </div>,
    document.body,
  )
}
