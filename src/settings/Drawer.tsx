import { useRef, type ReactNode } from 'react'
import { useDialogEscape } from '../lib/dialogStack'
import { useFocusTrap } from '../lib/hooks/useFocusTrap'

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
        inert={!open} // off-screen drawer must not stay in the tab order
        className={`fixed inset-0 z-50 w-full max-w-none overflow-y-auto border-0 border-panel-border bg-panel-solid p-6 text-fg backdrop-blur-[var(--panel-blur)] transition-transform duration-300 motion-reduce:transition-none max-[420px]:p-3 min-[900px]:inset-y-4 min-[900px]:right-4 min-[900px]:left-auto min-[900px]:w-[calc(100vw-2rem)] min-[900px]:max-w-5xl min-[900px]:rounded-2xl min-[900px]:border ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
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
