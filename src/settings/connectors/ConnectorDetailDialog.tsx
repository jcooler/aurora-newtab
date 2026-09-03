import { createPortal } from 'react-dom'
import { useRef, type ReactNode } from 'react'
import { useDialogEscape } from '../../lib/dialogStack'
import { useFocusTrap } from '../../lib/hooks/useFocusTrap'
import type { ConnectorCardMode } from './connectorCardState'
import type { ConnectorExperience } from './connectorExperience'

export function connectorDialogName(label: string, mode: ConnectorCardMode): string {
  if (mode === 'setup') return `${label} setup`
  if (mode === 'reconnect') return `${label} reconnect`
  return `${label} settings`
}

export default function ConnectorDetailDialog({
  open,
  label,
  mode,
  experience,
  onClose,
  children,
}: {
  open: boolean
  label: string
  mode: ConnectorCardMode
  experience: ConnectorExperience
  onClose(): void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLElement>(null)
  useFocusTrap(dialogRef, open)
  useDialogEscape(onClose, open)

  if (!open || typeof document === 'undefined') return null
  const name = connectorDialogName(label, mode)

  return createPortal(
    <div
      data-connector-dialog-backdrop=""
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md max-[520px]:items-end max-[520px]:p-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        data-connector-detail-dialog=""
        className="relative my-auto w-full max-w-[52rem] overflow-hidden rounded-3xl border border-panel-border bg-panel-solid text-fg shadow-2xl shadow-black/60 max-[520px]:mb-0 max-[520px]:max-h-[calc(100dvh-3rem)] max-[520px]:overflow-y-auto max-[520px]:rounded-b-none"
      >
        <button
          type="button"
          aria-label={`Close ${name}`}
          onClick={onClose}
          className="absolute right-4 top-4 z-10 grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-full border border-control-border bg-control-bg/70 text-lg text-fg-muted transition-colors hover:bg-control-bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          ×
        </button>

        <header className="flex min-h-32 items-center gap-4 border-b border-hairline bg-[radial-gradient(circle_at_0_0,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_52%)] px-8 py-6 pr-20 max-[520px]:px-5 max-[520px]:pr-16">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-2xl border border-control-border bg-control-bg text-base font-bold text-fg"
          >
            {experience.mark}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
                {experience.categoryLabel}
              </span>
              {experience.entitlement === 'included' ? (
                <span className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Included today
                </span>
              ) : (
                <span className="rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  Premium
                </span>
              )}
            </div>
            <h2 className="mt-1 font-display text-[1.75rem] font-medium tracking-[-0.035em] text-fg">
              {label}
            </h2>
            <p className="mt-1 max-w-[34rem] text-xs leading-relaxed text-fg-muted">
              {experience.outcome}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(18rem,0.82fr)] max-[700px]:grid-cols-1">
          <section aria-label={`What ${label} adds`} className="border-r border-hairline p-8 max-[700px]:border-b max-[700px]:border-r-0 max-[520px]:p-5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.13em] text-fg-muted">What you will see</h3>
            <ul className="mt-4 grid gap-3 text-sm text-fg">
              {experience.benefits.map((benefit) => (
                <li key={benefit} className="flex gap-3 leading-relaxed">
                  <span aria-hidden="true" className="text-emerald-400">✓</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-xl border border-control-border bg-control-bg/25 p-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.13em] text-fg-muted">Connection & privacy</h3>
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">{experience.privacySummary}</p>
            </div>
          </section>

          <section aria-label={`${label} connection controls`} className="min-w-0 p-8 max-[520px]:p-5">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.13em] text-fg-muted">
              {mode === 'setup' ? 'Connect' : mode === 'reconnect' ? 'Reconnect' : 'Manage connection'}
            </h3>
            {children}
          </section>
        </div>
      </section>
    </div>,
    document.body,
  )
}
