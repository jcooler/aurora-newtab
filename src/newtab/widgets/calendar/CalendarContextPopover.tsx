import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeAttentionPanel, type AttentionRect } from '../../../lib/layout/attentionPanelPlacement'
import { calendarColorClass, type CalendarColor } from '../../../services/connectors/calendarColors'

export interface CalendarContextRow {
  key: string
  kind: 'holiday' | 'event'
  title: string
  detail: string
  color?: CalendarColor
}

export default function CalendarContextPopover({
  label,
  heading,
  rows,
  className,
  children,
}: {
  label: string
  heading: string
  rows: readonly CalendarContextRow[]
  className: string
  children: ReactNode
}) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const open = hovered || focused || pinned

  const updatePinned = (next: boolean) => {
    pinnedRef.current = next
    setPinned(next)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && triggerRef.current?.contains(target)) return
      updatePinned(false)
      setHovered(false)
      setFocused(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return
    const place = () => {
      const owner = triggerRef.current?.closest<HTMLElement>('[data-testid^="canvas-item-"]')
      const trigger = owner?.getBoundingClientRect() ?? triggerRef.current?.getBoundingClientRect()
      const panel = panelRef.current?.getBoundingClientRect()
      if (!trigger || !panel) return
      const obstacles = [...document.querySelectorAll<HTMLElement>(
        '[data-testid^="canvas-item-"], .utility-tray-trigger, .chrome-tab-trigger, .settings-gear, .layout-badge-host, [role="dialog"][aria-label="Settings"]',
      )]
        .filter((node) => node !== owner && getComputedStyle(node).visibility !== 'hidden')
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0) as AttentionRect[]
      setPosition(placeAttentionPanel({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        trigger,
        panel,
        avoid: trigger,
        obstacles,
      }))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, rows])

  const close = () => {
    updatePinned(false)
    setHovered(false)
    setFocused(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={className}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => updatePinned(!pinnedRef.current)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          close()
        }}
      >
        {children}
      </button>
      {open ? createPortal(
        <div
          ref={panelRef}
          id={id}
          role="tooltip"
          data-calendar-context-panel=""
          className="pointer-events-none fixed z-[70] w-[min(18rem,calc(100vw-1rem))] rounded-xl border border-panel-border bg-panel-solid px-3 py-2.5 text-left text-fg shadow-xl shadow-black/35"
          style={position}
        >
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{heading}</p>
          <div className="space-y-1.5">
            {rows.map((row) => (
              <div key={row.key} data-calendar-context-kind={row.kind} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2">
                <span
                  data-calendar-color={row.color}
                  className={`mt-1.5 size-1.5 rounded-full ${row.color ? calendarColorClass(row.color) : 'bg-accent'}`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-fg">{row.title}</span>
                  <span className="block truncate text-[11px] text-fg-muted">{row.detail}</span>
                </span>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
