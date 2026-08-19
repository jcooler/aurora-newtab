import { useEffect, useRef, useState } from 'react'
import type { LayoutsDocument } from '../../lib/layout/namedLayouts'

/** The layout badge near the fixed utility controls (named-layouts spec
 *  2.1): shows the current layout's name and opens the switcher — one radio
 *  item per layout, then "Edit layout" and "New layout". Switching is an
 *  explicit user action; nothing switches automatically, ever. */
export default function LayoutBadge({
  document: layoutsDocument,
  clearsTray = false,
  onSwitch,
  onEdit,
  onNew,
}: {
  document: LayoutsDocument
  /** True while the utility-tray trigger renders beside the gear: the badge
   *  slides left to clear it, and hugs the gear otherwise (owner-reported
   *  2026-08-19: the fixed 108px offset left a dead gap once the trigger
   *  learned to hide). */
  clearsTray?: boolean
  onSwitch: (layoutId: string) => void
  onEdit: (invoker: HTMLElement | null) => void
  onNew: () => void
}) {
  const [open, setOpen] = useState(false)
  const invokerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const active = layoutsDocument.layouts.find(
    (layout) => layout.id === layoutsDocument.activeLayoutId,
  )

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || invokerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      invokerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const item = 'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs text-fg transition-colors hover:bg-control-bg-hover'

  return (
    <div className="layout-badge-host" data-clears-tray={clearsTray ? 'true' : undefined}>
      <button
        ref={invokerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Layout: ${active?.name ?? ''}`}
        className="layout-badge"
        onClick={() => setOpen((value) => !value)}
      >
        {active?.name ?? ''}
      </button>
      {open ? (
        <div ref={menuRef} role="menu" aria-label="Layouts" className="layout-badge-menu">
          {layoutsDocument.layouts.map((layout) => (
            <button
              key={layout.id}
              type="button"
              role="menuitemradio"
              aria-checked={layout.id === layoutsDocument.activeLayoutId}
              className={item}
              onClick={() => {
                setOpen(false)
                invokerRef.current?.focus()
                if (layout.id !== layoutsDocument.activeLayoutId) onSwitch(layout.id)
              }}
            >
              <span>{layout.name}</span>
              {layout.id === layoutsDocument.activeLayoutId ? <span aria-hidden>•</span> : null}
            </button>
          ))}
          <hr className="my-1 border-hairline" />
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false)
              onEdit(invokerRef.current)
            }}
          >
            Edit layout
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false)
              invokerRef.current?.focus()
              onNew()
            }}
          >
            New layout
          </button>
        </div>
      ) : null}
    </div>
  )
}
