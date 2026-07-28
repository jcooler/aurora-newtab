import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import type { BookmarkFolder, BookmarkItem } from '../../../services/bookmarks'
import { faviconUrl } from '../links/linksLogic'

// Kept clear of the viewport edge when the panel is nudged back on-screen.
const EDGE_MARGIN = 8

export function FolderIcon({ className = '' }: { className?: string }) {
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
  onClose,
}: {
  title: string
  items: BookmarkItem[]
  folders: BookmarkFolder[]
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [stack, setStack] = useState<BookmarkFolder[]>([])
  const [edgeShift, setEdgeShift] = useState(0)
  const top = stack[stack.length - 1]
  const currentTitle = top ? top.title : title
  const currentItems = top ? top.items : items
  const currentFolders = top ? top.folders : folders

  useFocusTrap(panelRef, true)
  // Newest-first shared stack (src/lib/dialogStack.ts).
  useDialogEscape(onClose)

  // The panel is centered under its chip by default (left-1/2 -translate-x-1/2
  // below) — CSS alone can't correct for a chip near the left/right edge of
  // the viewport, since that centering is relative to the chip, not the
  // viewport. Measure once per open/drill (jsdom has no layout engine, so
  // getBoundingClientRect() is an all-zero rect there — the width===0 guard
  // makes this a no-op in tests unless a test deliberately mocks it) and
  // nudge horizontally by the smallest amount that brings both edges back
  // within EDGE_MARGIN of the viewport.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    let shift = 0
    if (rect.left < EDGE_MARGIN) shift = EDGE_MARGIN - rect.left
    else if (rect.right > window.innerWidth - EDGE_MARGIN) {
      shift = window.innerWidth - EDGE_MARGIN - rect.right
    }
    setEdgeShift(shift)
  }, [currentTitle])

  return (
    <>
      {/* The click-outside catcher must NOT render inside the bar: the nav's
          -translate-x-1/2 transform makes it the containing block for fixed
          descendants, which would shrink "inset-0" to the bar's own box and
          stack the catcher ABOVE the sibling chips — turning every chip click
          into a close. Portal to <body>, where fixed inset-0 is really the
          viewport. Transparent (no dim): this is a dropdown menu, not a
          modal — the first outside click just dismisses, like the native
          bookmarks bar. Kept a SIBLING of the dialog, not an ancestor —
          nesting role="dialog" inside an aria-hidden element trips Chrome's
          "Blocked aria-hidden" warning when useFocusTrap moves focus in. */}
      {createPortal(
        <div aria-hidden onClick={onClose} className="fixed inset-0 z-40" />,
        document.body,
      )}
      {/* Anchored under the clicked chip via its `relative` wrapper —
          absolute positioning resolves against that wrapper, so the nav's
          transform is harmless here (unlike position:fixed). z-50 inside the
          nav's stacking context (the nav itself is z-50 while open), above
          the body-level z-40 catcher. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${currentTitle} bookmarks`}
        // Tailwind v4 compiles -translate-x-1/2 to the native CSS `translate`
        // property (not `transform`), so overriding it here — rather than
        // `style.transform` — is what actually wins over the class. Only set
        // when a shift is needed: leaving it undefined otherwise means the
        // class alone controls centering, unchanged from before this effect
        // existed.
        style={
          edgeShift
            ? { translate: `calc(-50% ${edgeShift >= 0 ? '+' : '-'} ${Math.abs(edgeShift)}px) 0` }
            : undefined
        }
        className="absolute left-1/2 top-full z-50 mt-1.5 max-h-[60vh] w-64 -translate-x-1/2 overflow-y-auto rounded-panel border border-panel-border bg-[#17171c]/95 p-1 text-fg backdrop-blur-[var(--panel-blur)]"
      >
          {top && (
            <button
              type="button"
              onClick={() => setStack((s) => s.slice(0, -1))}
              className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
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
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-fg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent"
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
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-fg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent"
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
      </div>
    </>
  )
}
