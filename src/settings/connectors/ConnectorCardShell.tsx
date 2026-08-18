import { useRef, type ReactNode } from 'react'
import type { ConnectorId } from '../../services/connectors/types'
import Switch from '../Switch'
import type { ConnectorCardMode, ConnectorCardPresentation } from './connectorCardState'

function regionName(label: string, mode: ConnectorCardMode): string {
  if (mode === 'setup') return `${label} setup`
  if (mode === 'reconnect') return `${label} reconnect`
  return `${label} settings`
}

export default function ConnectorCardShell({
  id,
  label,
  blurb,
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
    ? 'text-emerald-400'
    : presentation.state === 'reconnect-required'
      ? 'text-amber-300'
      : 'text-fg-muted'

  return (
    <article
      data-connector-card={id}
      data-settings-anchor={id}
      tabIndex={-1}
      data-connector-state={presentation.state}
      className="rounded-xl border border-control-border bg-control-bg/20 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-fg">{label}</h4>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className={`font-medium ${stateTone}`}>{presentation.stateLabel}</span>
            {presentation.identityLabel ? (
              <span className="truncate text-fg-muted">{presentation.identityLabel}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{blurb}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
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
          <button
            ref={actionRef}
            id={`connector-${id}-action`}
            type="button"
            hidden={active}
            aria-label={`${presentation.primaryActionLabel} ${label}`}
            onClick={(event) => onOpen(presentation.mode, event.currentTarget)}
            className="min-h-9 cursor-pointer rounded-md px-2 text-xs font-medium text-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            {presentation.primaryActionLabel}
          </button>
        </div>
      </div>

      {active && children ? (
        <div
          role="region"
          aria-label={regionName(label, activeMode)}
          className="mt-3 border-t border-hairline pt-3"
        >
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              aria-label={`Close ${label} editor`}
              onClick={() => onClose(actionRef.current)}
              className="min-h-9 cursor-pointer rounded-md px-2 text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              Close editor
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </article>
  )
}
