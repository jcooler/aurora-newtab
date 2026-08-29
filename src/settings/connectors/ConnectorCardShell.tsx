import { useRef, type ReactNode } from 'react'
import type { ConnectorId } from '../../services/connectors/types'
import Switch from '../Switch'
import type { ConnectorCardMode, ConnectorCardPresentation } from './connectorCardState'
import ConnectorDetailDialog from './ConnectorDetailDialog'
import type { ConnectorExperience } from './connectorExperience'

export default function ConnectorCardShell({
  id,
  label,
  blurb: _blurb,
  experience,
  presentation,
  activeMode,
  onOpen,
  onClose,
  onVisibilityChange,
  children,
}: {
  id: ConnectorId
  label: string
  blurb: string
  experience: ConnectorExperience
  presentation: ConnectorCardPresentation
  activeMode: ConnectorCardMode | null
  onOpen(mode: ConnectorCardMode, invoker: HTMLButtonElement): void
  onClose(invoker: HTMLButtonElement | null): void
  onVisibilityChange(visible: boolean): void
  children?: ReactNode
}) {
  const actionRef = useRef<HTMLButtonElement>(null)
  const active = activeMode !== null
  const stateTone = presentation.state === 'configured-visible'
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    : presentation.state === 'reconnect-required'
      ? 'border-amber-300/25 bg-amber-300/10 text-amber-200'
      : 'border-hairline bg-surface/45 text-fg-muted'

  return (
    <article
      data-connector-card={id}
      data-settings-anchor={id}
      tabIndex={-1}
      data-connector-state={presentation.state}
      className="group flex min-h-[11rem] flex-col rounded-2xl border border-control-border bg-control-bg/25 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.08)] transition-colors hover:border-fg/20 hover:bg-control-bg/35"
    >
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-xl border border-hairline bg-surface/55 text-xs font-semibold tracking-tight text-fg shadow-inner"
        >
          {experience.mark}
        </span>
        <div className="min-w-0 pt-0.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-fg">{label}</h4>
              <p className="mt-0.5 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-fg-muted">
                {experience.categoryLabel}
              </p>
            </div>
            <span className={`rounded-full border px-2 py-1 text-[0.65rem] font-medium ${stateTone}`}>
              {presentation.stateLabel}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-fg-muted">{experience.outcome}</p>
      {presentation.identityLabel ? (
        <p className="mt-2 truncate text-xs font-medium text-fg/80">{presentation.identityLabel}</p>
      ) : null}

      <div className="mt-auto flex min-h-10 items-end justify-between gap-3 pt-3">
        <div className="min-w-0">
          {presentation.showVisibilityControl ? (
            <div className="flex items-center gap-2">
              <label htmlFor={`connector-${id}-visible`} className="text-xs text-fg-muted">
                Show on Canvas
              </label>
              <Switch
                id={`connector-${id}-visible`}
                label={`Show ${label} on Canvas`}
                checked={presentation.visible}
                onChange={onVisibilityChange}
              />
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">
          <button
            ref={actionRef}
            id={`connector-${id}-action`}
            type="button"
            hidden={active}
            aria-label={`${presentation.primaryActionLabel} ${label}`}
            onClick={(event) => onOpen(presentation.mode, event.currentTarget)}
            className="min-h-9 cursor-pointer rounded-lg border border-accent/25 bg-accent/10 px-3 text-xs font-semibold text-accent transition-colors hover:border-accent/40 hover:bg-accent/15 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            {presentation.primaryActionLabel}
          </button>
        </div>
      </div>

      {active && children ? (
        <ConnectorDetailDialog
          open
          label={label}
          mode={activeMode}
          experience={experience}
          onClose={() => onClose(actionRef.current)}
        >
          {children}
        </ConnectorDetailDialog>
      ) : null}
    </article>
  )
}
