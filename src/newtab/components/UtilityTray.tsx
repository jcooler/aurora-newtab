import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'

export default function UtilityTray({
  open,
  modal,
  onClose,
  invokerRef,
  children,
}: {
  open: boolean
  modal: boolean
  onClose: () => void
  invokerRef: RefObject<HTMLButtonElement | null>
  children?: ReactNode
}) {
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const wasOpenRef = useRef(open)

  useFocusTrap(panelRef, open && modal)
  useDialogEscape(onClose, open)

  useEffect(() => {
    if (wasOpenRef.current && !open) invokerRef.current?.focus()
    wasOpenRef.current = open
  }, [invokerRef, open])

  // Desktop stays modeless, but opening still moves keyboard focus into the
  // anchored surface. Unlike the narrow sheet, focus may then leave freely.
  useEffect(() => {
    if (!open || modal) return
    panelRef.current?.querySelector<HTMLButtonElement>('[data-utility-tray-close]')?.focus()
    return () => invokerRef.current?.focus()
  }, [invokerRef, modal, open])

  // A modeless surface cannot use a full-screen click catcher because the
  // dashboard must remain operable. Observe genuine outside clicks without
  // intercepting their target action.
  useEffect(() => {
    if (!open || modal) return
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node) || panelRef.current?.contains(target) || invokerRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [invokerRef, modal, onClose, open])

  if (!open) return null

  return (
    <>
      {modal ? (
        <div
          data-utility-tray-backdrop=""
          aria-hidden="true"
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/45"
        />
      ) : null}
      <section
        ref={panelRef}
        role="dialog"
        aria-modal={modal ? true : undefined}
        aria-labelledby={titleId}
        data-utility-tray=""
        data-utility-tray-mode={modal ? 'modal' : 'modeless'}
        className={modal
          ? 'utility-tray utility-tray--modal fixed inset-x-2 bottom-2 z-[60] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl border border-panel-border bg-panel-solid p-4 text-fg shadow-2xl'
          : 'utility-tray utility-tray--modeless fixed bottom-16 right-4 z-40 max-h-[calc(100dvh-5rem)] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-panel-border bg-panel-solid p-4 text-fg shadow-2xl'}
      >
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold">Utility Tray</h2>
          <button
            data-utility-tray-close=""
            type="button"
            aria-label="Close utility tray"
            onClick={onClose}
            className="min-h-9 min-w-9 rounded-lg text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            ×
          </button>
        </header>
        {children ?? <p className="text-sm text-fg-muted">Working tools appear here.</p>}
      </section>
    </>
  )
}
