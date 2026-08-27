import { type ReactNode, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogEscape } from '../../../lib/dialogStack'
import { anchorPanel } from '../../../lib/layout/anchor'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import DockLine from '../shared/DockLine'
import type { WorkPulseTone } from '../shared/WorkPulseSummary'
import TierFrame from '../shared/TierFrame'
import type { WidgetPresentationState } from '../../widgetSizeContracts'
import { compactFacts, type WorkPresentationState } from './workPresentation'

const FRAME_STATE: Readonly<Record<WorkPresentationState, WidgetPresentationState>> = {
  setup: 'permission-required',
  loading: 'loading',
  empty: 'empty',
  'hard-error': 'hard-error',
  'retained-error': 'partial',
  stale: 'stale',
  ready: 'ready',
}

export function WorkResourceBody({
  title,
  presentation,
  emptyLabel,
  errorMessage,
  setupLabel,
  onRefresh,
  children,
}: {
  title: string
  presentation: WorkPresentationState
  emptyLabel: string
  errorMessage?: string
  setupLabel?: string
  onRefresh?: () => void
  children: ReactNode
}) {
  const showRows = presentation === 'ready' || presentation === 'stale' || presentation === 'retained-error'
  const message = presentation === 'setup'
    ? setupLabel ?? `Connect ${title} in Settings.`
    : presentation === 'loading'
      ? `Loading ${title}…`
      : presentation === 'empty'
        ? emptyLabel
        : presentation === 'hard-error'
          ? errorMessage ?? `${title} is unavailable.`
          : presentation === 'retained-error'
            ? errorMessage ?? 'Latest update failed. Showing saved data.'
            : presentation === 'stale'
              ? `Showing saved data while ${title} refreshes.`
              : null

  return (
    <>
      {showRows ? children : null}
      {message ? (
        <div className={showRows ? 'mt-2 border-t border-hairline pt-1' : ''}>
          <p
            role={presentation === 'hard-error' ? 'alert' : 'status'}
            className="text-xs text-fg-muted"
          >
            {message}
          </p>
          {onRefresh && (presentation === 'hard-error' || presentation === 'retained-error') ? (
            <button
              type="button"
              onClick={onRefresh}
              aria-label={`Refresh ${title}`}
              className={`${showRows ? 'mt-1' : 'mt-2'} inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent`}
            >
              Refresh
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

export function WorkWidgetShell({
  title,
  canvasSize = 'standard',
  presentation,
  emptyLabel,
  errorMessage,
  setupLabel,
  onRefresh,
  children,
}: {
  title: string
  canvasSize?: CanvasSize
  presentation: WorkPresentationState
  emptyLabel: string
  errorMessage?: string
  setupLabel?: string
  onRefresh?: () => void
  children: ReactNode
}) {
  return (
    <TierFrame
      label={title}
      tier={canvasSize}
      state={FRAME_STATE[presentation]}
      data-work-widget=""
      data-work-resource-state={presentation}
      className="flex min-h-0 flex-col"
    >
      <header className="flex min-h-10 items-center justify-between gap-3 border-b border-hairline px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {presentation === 'stale' || presentation === 'retained-error' ? (
          <span className="text-xs text-fg-muted">Saved</span>
        ) : null}
      </header>
      <div
        className="min-h-0 flex-1 overflow-hidden p-3"
      >
        <WorkResourceBody
          title={title}
          presentation={presentation}
          emptyLabel={emptyLabel}
          errorMessage={errorMessage}
          setupLabel={setupLabel}
          onRefresh={onRefresh}
        >
          {children}
        </WorkResourceBody>
      </div>
    </TierFrame>
  )
}

/** Truthful pre-fetch state for an enabled connector whose credential or
 * identity was stripped by restore, reconnect, or partial setup. This stays
 * outside every provider snapshot hook, so it cannot issue a request. */
export function WorkConnectorSetup({
  title,
  canvasSize = 'standard',
  docked = false,
}: {
  title: string
  canvasSize?: CanvasSize
  docked?: boolean
}) {
  if (docked) {
    return (
      <WorkDockDetail
        label={title}
        facts={['Setup needed']}
        presentation="setup"
        emptyLabel=""
      >
        {null}
      </WorkDockDetail>
    )
  }
  return (
    <WorkWidgetShell
      title={title}
      canvasSize={canvasSize}
      presentation="setup"
      emptyLabel=""
    >
      {null}
    </WorkWidgetShell>
  )
}

const DOCK_PANEL_SIZE = { w: 384, h: 440 }

export function WorkDockDetail({
  label,
  facts,
  tone = 'quiet',
  presentation,
  emptyLabel,
  errorMessage,
  setupLabel,
  onRefresh,
  children,
}: {
  label: string
  facts: readonly (string | null | undefined | false)[]
  tone?: WorkPulseTone
  presentation: WorkPresentationState
  emptyLabel: string
  errorMessage?: string
  setupLabel?: string
  onRefresh?: () => void
  children: ReactNode
}) {
  const surviving = compactFacts(facts)
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    queueMicrotask(() => triggerRef.current?.focus())
  }
  useDialogEscape(close, open)

  if (surviving.length === 0) return null

  const position = anchorRect
    ? anchorPanel(anchorRect, DOCK_PANEL_SIZE, {
      w: document.documentElement.clientWidth || window.innerWidth,
      h: document.documentElement.clientHeight || window.innerHeight,
    })
    : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${surviving.join(', ')}`}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close()
            return
          }
          setAnchorRect(triggerRef.current?.getBoundingClientRect() ?? null)
          setOpen(true)
        }}
        className="cursor-pointer rounded-panel text-left transition-colors hover:bg-fg/5 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        <DockLine label={label} facts={surviving} tone={tone} />
      </button>
      {open && position
        ? createPortal(
          <div
            role="dialog"
            aria-label={`${label} details`}
            data-work-dock-detail=""
            className="fixed z-50 flex max-h-[min(440px,calc(100vh_-_16px))] w-[min(24rem,calc(100vw_-_16px))] flex-col overflow-hidden rounded-panel border border-panel-border bg-panel-solid text-fg shadow-xl shadow-black/30 backdrop-blur-[var(--panel-blur)]"
            style={{
              left: position.left,
              ...('top' in position ? { top: position.top } : { bottom: position.bottom }),
            }}
          >
            <header className="flex min-h-11 items-center justify-between gap-3 border-b border-hairline px-3">
              <h2 className="text-sm font-semibold">{label}</h2>
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                aria-label={`Close ${label} details`}
              >
                ×
              </button>
            </header>
            <div className="min-h-0 overflow-y-auto p-3">
              <WorkResourceBody
                title={label}
                presentation={presentation}
                emptyLabel={emptyLabel}
                errorMessage={errorMessage}
                setupLabel={setupLabel}
                onRefresh={onRefresh}
              >
                {children}
              </WorkResourceBody>
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}
