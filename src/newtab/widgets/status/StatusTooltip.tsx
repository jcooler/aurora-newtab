import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ServiceStatus } from '../../../services/connectors/status'

const STATE_LABEL: Readonly<Record<ServiceStatus['indicator'], string>> = Object.freeze({
  none: 'Operational',
  minor: 'Partial outage',
  major: 'Major outage',
  critical: 'Critical outage',
  unknown: 'Unreachable',
})

export function statusContext(service: ServiceStatus): string {
  const state = STATE_LABEL[service.indicator]
  const detail = service.description.trim()
  if (!detail || service.indicator === 'unknown') return `${service.name}: ${state}`
  const normalizedDetail = detail.toLocaleLowerCase('en-US')
  if (normalizedDetail.includes(state.toLocaleLowerCase('en-US'))
    || (service.indicator === 'none' && normalizedDetail.includes('operational'))) {
    return `${service.name}: ${state}`
  }
  return `${service.name}: ${state}. ${detail}`
}

export default function StatusTooltip({ service, children }: { service: ServiceStatus; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = 280
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, rect.bottom + 6),
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  return (
    <>
      <span
        ref={triggerRef}
        data-status-service=""
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        className="flex min-w-0 items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
      >
        {children}
      </span>
      {open ? createPortal(
        <span id={id} role="tooltip" className="status-service-tooltip" style={position}>
          {statusContext(service)}
        </span>,
        document.body,
      ) : null}
    </>
  )
}
