import { type ReactNode, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { BrowserResourceState } from '../../../lib/hooks/useBrowserResource'
import { useDialogEscape } from '../../../lib/dialogStack'
import { anchorPanel } from '../../../lib/layout/anchor'
import TierFrame from '../shared/TierFrame'
import type { WidgetPresentationState } from '../../widgetSizeContracts'

function browserFrameState<T>(state: BrowserResourceState<T>, empty: boolean): WidgetPresentationState {
  if (state.status === 'checking') return 'loading'
  if (state.status === 'permission-required') return 'permission-required'
  if (state.status === 'error') return state.data === null ? 'hard-error' : 'partial'
  if (empty) return 'empty'
  return state.refreshing ? 'stale' : 'ready'
}

export function browserDockSummary<T>(
  label: string,
  state: BrowserResourceState<T>,
  readySummary: string,
): string {
  if (state.status === 'checking') return `Checking ${label}`
  if (state.status === 'permission-required') return `${label} · Enable in Settings`
  if (state.status === 'error') {
    return state.data === null ? `${label} unavailable` : `${readySummary} · Update failed`
  }
  return readySummary
}

function BrowserResourceBody<T>({
  title,
  state,
  empty,
  emptyLabel,
  onRefresh,
  children,
}: {
  title: string
  state: BrowserResourceState<T>
  empty: boolean
  emptyLabel: string
  onRefresh?: () => void
  children: ReactNode
}) {
  const hasRetainedData = state.status === 'error' && state.data !== null
  const showContent = state.status === 'ready' || hasRetainedData

  return (
    <>
      {state.status === 'permission-required' ? (
        <p className="text-sm text-fg-muted">Enable {title} in Settings.</p>
      ) : state.status === 'checking' ? (
        <p className="text-sm text-fg-muted">Checking {title}…</p>
      ) : showContent && empty ? (
        <p className="text-sm text-fg-muted">{emptyLabel}</p>
      ) : showContent ? children : null}

      {state.status === 'error' ? (
        <div className={hasRetainedData ? 'mt-2 border-t border-hairline pt-1' : ''}>
          <p role="status" className="text-xs text-fg-muted">{state.message}</p>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className={`${hasRetainedData ? 'mt-1' : 'mt-2'} inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent`}
              aria-label={`Refresh ${title}`}
            >
              Refresh
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

export function BrowserWidgetShell<T>({
  title,
  canvasSize = 'standard',
  state,
  empty,
  emptyLabel,
  onRefresh,
  children,
}: {
  title: string
  canvasSize?: CanvasSize
  state: BrowserResourceState<T>
  empty: boolean
  emptyLabel: string
  onRefresh?: () => void
  children: ReactNode
}) {
  return (
    <TierFrame
      label={title}
      tier={canvasSize}
      state={browserFrameState(state, empty)}
      data-browser-widget=""
      data-browser-resource-state={state.status}
      className="flex min-h-0 flex-col"
    >
      <header className="flex min-h-10 items-center justify-between gap-3 border-b border-hairline px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {state.status === 'ready' && state.refreshing ? (
          <span className="text-xs text-fg-muted">Refreshing…</span>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <BrowserResourceBody
          title={title}
          state={state}
          empty={empty}
          emptyLabel={emptyLabel}
          onRefresh={onRefresh}
        >
          {children}
        </BrowserResourceBody>
      </div>
    </TierFrame>
  )
}

const DOCK_PANEL_SIZE = { w: 384, h: 440 }

export function BrowserDockDetail({
  label,
  summary,
  state,
  empty,
  emptyLabel,
  onRefresh,
  children,
}: {
  label: string
  summary: ReactNode
  state: BrowserResourceState<unknown>
  empty: boolean
  emptyLabel: string
  onRefresh?: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    queueMicrotask(() => triggerRef.current?.focus())
  }
  useDialogEscape(close, open)

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
        data-dock-line=""
        aria-label={`${label}: ${typeof summary === 'string' ? summary : 'Open details'}`}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close()
            return
          }
          setAnchorRect(triggerRef.current?.getBoundingClientRect() ?? null)
          setOpen(true)
        }}
        className="dock-line cursor-pointer rounded-panel text-left transition-colors hover:bg-fg/5 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        {summary}
      </button>
      {open && position
        ? createPortal(
          <div
            role="dialog"
            aria-label={`${label} details`}
            data-browser-dock-detail=""
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
              <BrowserResourceBody
                title={label}
                state={state}
                empty={empty}
                emptyLabel={emptyLabel}
                onRefresh={onRefresh}
              >
                {children}
              </BrowserResourceBody>
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}
