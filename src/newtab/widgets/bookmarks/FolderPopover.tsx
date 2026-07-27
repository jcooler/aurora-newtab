import { useRef, useState } from 'react'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import type { BookmarkFolder, BookmarkItem } from '../../../services/bookmarks'
import { faviconUrl } from '../links/linksLogic'

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
  const top = stack[stack.length - 1]
  const currentTitle = top ? top.title : title
  const currentItems = top ? top.items : items
  const currentFolders = top ? top.folders : folders

  useFocusTrap(panelRef, true)
  // Newest-first shared stack (src/lib/dialogStack.ts).
  useDialogEscape(onClose)

  return (
    <>
      {/* Backdrop is a SIBLING of the dialog, not an ancestor — nesting
          role="dialog" inside an aria-hidden element trips Chrome's "Blocked
          aria-hidden on an element because its descendant retained focus"
          warning the instant useFocusTrap moves focus in. Same structure as
          Palette.tsx. */}
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-40 bg-black/30" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-16">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${currentTitle} bookmarks`}
          className="pointer-events-auto max-h-[60vh] w-64 overflow-y-auto rounded-panel border border-panel-border bg-[#17171c]/95 p-1 text-fg backdrop-blur-[var(--panel-blur)]"
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
      </div>
    </>
  )
}
