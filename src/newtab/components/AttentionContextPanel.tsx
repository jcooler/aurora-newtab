import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AttentionSignal } from '../../lib/attention'

const VIEWPORT_MARGIN = 8
const PANEL_GAP = 8
const CLOSE_DELAY_MS = 140

interface PanelPosition {
  left: number
  top: number
}

export default function AttentionContextPanel({
  summary,
  signals,
}: {
  summary: string
  signals: readonly AttentionSignal[]
}) {
  const generatedId = useId()
  const panelId = `aurora-attention-${generatedId.replace(/:/g, '')}`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const pointerActivation = useRef<{ active: boolean; wasOpen: boolean }>({ active: false, wasOpen: false })
  const returningFocus = useRef(false)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition>({ left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN })

  const cancelClose = () => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = undefined
    }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = undefined
      const active = document.activeElement
      if (active && (triggerRef.current?.contains(active) || panelRef.current?.contains(active))) return
      setOpen(false)
    }, CLOSE_DELAY_MS)
  }

  const closeAndReturnFocus = () => {
    cancelClose()
    setOpen(false)
    const trigger = triggerRef.current
    if (!trigger || document.activeElement === trigger) {
      returningFocus.current = false
      return
    }
    returningFocus.current = true
    trigger.focus()
  }

  useEffect(() => () => cancelClose(), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && (triggerRef.current?.contains(target) || panelRef.current?.contains(target))) return
      cancelClose()
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeAndReturnFocus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const panel = panelRef.current?.getBoundingClientRect()
      if (!trigger || !panel) return
      const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - panel.width - VIEWPORT_MARGIN)
      const left = Math.min(maxLeft, Math.max(VIEWPORT_MARGIN, trigger.left + trigger.width / 2 - panel.width / 2))
      const below = trigger.bottom + PANEL_GAP
      const preferredTop = below + panel.height <= window.innerHeight - VIEWPORT_MARGIN
        ? below
        : trigger.top - panel.height - PANEL_GAP
      const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - panel.height - VIEWPORT_MARGIN)
      const top = Math.min(maxTop, Math.max(VIEWPORT_MARGIN, preferredTop))
      setPosition({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, signals])

  const panel = open ? createPortal(
    <section
      id={panelId}
      ref={panelRef}
      aria-label="Attention details"
      className="aurora-attention-panel"
      style={{ position: 'fixed', left: `${position.left}px`, top: `${position.top}px` }}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onFocus={cancelClose}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && panelRef.current?.contains(event.relatedTarget)) return
        scheduleClose()
      }}
    >
      <ul className="aurora-attention-panel__list">
        {signals.map((signal) => (
          <li key={signal.key} className="aurora-attention-panel__row">
            <span className="aurora-attention-panel__source">{signal.source}</span>
            {signal.url ? (
              <a href={signal.url} target="_blank" rel="noreferrer" className="aurora-attention-panel__title">
                {signal.title}
              </a>
            ) : <span className="aurora-attention-panel__title">{signal.title}</span>}
            <span className="aurora-attention-panel__detail">{signal.detail}</span>
          </li>
        ))}
      </ul>
    </section>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="aurora-briefing__trigger"
        onMouseEnter={() => { cancelClose(); setOpen(true) }}
        onMouseLeave={scheduleClose}
        onPointerDown={() => {
          pointerActivation.current = { active: true, wasOpen: open }
        }}
        onPointerCancel={() => {
          pointerActivation.current = { active: false, wasOpen: false }
        }}
        onClick={() => {
          cancelClose()
          const pointer = pointerActivation.current
          setOpen(pointer.active ? !pointer.wasOpen : (current) => !current)
          pointerActivation.current = { active: false, wasOpen: false }
        }}
        onFocus={() => {
          cancelClose()
          if (returningFocus.current) {
            returningFocus.current = false
            return
          }
          if (!pointerActivation.current.active) setOpen(true)
        }}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && panelRef.current?.contains(event.relatedTarget)) return
          scheduleClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab' && !event.shiftKey && open) {
            const firstLink = panelRef.current?.querySelector<HTMLAnchorElement>('a[href]')
            if (firstLink) {
              event.preventDefault()
              firstLink.focus()
            }
            return
          }
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          cancelClose()
          setOpen((current) => !current)
        }}
      >
        {summary}
      </button>
      {panel}
    </>
  )
}
