import { useEffect, useRef, type ReactNode } from 'react'
import { useDialogEscape } from '../lib/dialogStack'
import { useFocusTrap } from '../lib/hooks/useFocusTrap'
import BrandMark from '../brand/BrandMark'
import { PRODUCT_NAME } from '../brand/identity'

export default function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return
    const documentOverflow = document.documentElement.style.overflow
    const bodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = documentOverflow
      document.body.style.overflow = bodyOverflow
    }
  }, [open])

  // Newest-first shared stack: Escape closes whichever dialog registered most
  // recently (see src/lib/dialogStack.ts), so stacking this with the Tasks
  // panel, timer panel, or palette closes them one at a time, newest first.
  useDialogEscape(onClose, open)

  return (
    <>
      {open && (
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30"
        />
      )}
      {/* This element is simultaneously the scroll container, the blur surface, and
          the transform target. The Connectors tab's sticky search block (see
          Connectors.tsx ~line 81-95) depends on staying this way: never
          introduce a transformed/filtered/contained wrapper between this
          element and the tab content, and its p-6 is mirrored by the sticky
          block's -top-6. See also Connectors.tsx's own structural warning. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={open ? undefined : true}
        inert={!open} // off-screen drawer must not stay in the tab order
        data-settings-scroll-owner="document"
        className={`fixed inset-0 z-50 w-full max-w-none overflow-y-auto overflow-x-hidden border-0 border-panel-border bg-panel-solid p-6 text-fg backdrop-blur-[var(--panel-blur)] transition-transform duration-300 will-change-[translate] motion-reduce:transition-none max-[420px]:p-3 min-[900px]:inset-y-4 min-[900px]:right-4 min-[900px]:left-auto min-[900px]:w-[calc(100vw-2rem)] min-[900px]:max-w-[60rem] min-[900px]:rounded-[1.5rem] min-[900px]:border ${
          open
            ? 'visible pointer-events-auto translate-x-0'
            : 'pointer-events-none translate-x-[calc(100%+1rem)]'
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="size-9 shrink-0 rounded-[0.6rem]" />
            <div className="min-w-0">
              <p className="font-display text-base font-semibold tracking-[-0.025em] text-fg">{PRODUCT_NAME}</p>
              <h2 className="text-xs font-medium text-fg-muted">{title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-9 min-w-9 rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
