import { useEffect, useReducer, useRef, useState } from 'react'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import { useNow } from '../../../lib/hooks/useNow'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { Settings, TimerConfig } from '../../../lib/storage/schema'
import { anchorPanel, type PanelPlacement } from '../../../lib/layout/anchor'
import { playChime } from './chime'
import { initialTimer, timerReducer, type TimerAction, type TimerState } from './timerReducer'

const DEFAULT_CONFIG: TimerConfig = { workMinutes: 25, breakMinutes: 5 }
const MIN_MINUTES = 1
const MAX_MINUTES = 180

// The panel has no fixed-height class (auto, sized to its content — header,
// countdown, controls, work/break inputs, and an optional "N sessions
// completed" line once cycles > 0); this is its measured height in the
// deterministic default-open state (cycles === 0, that line absent). Width
// matches the panel's w-64 class exactly.
export const TIMER_PANEL_SIZE = { w: 256, h: 175 }

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return MIN_MINUTES
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)))
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function TimerWidget() {
  // Gate BEFORE any of the ticking/reducer machinery exists: disabled tabs
  // (the default — settings.widgets.timer starts false) mount none of that
  // and so run zero interval work. Only useStoredKey is called out here, so
  // Rules of Hooks stay satisfied regardless of the toggle.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.timer) return null
  return <TimerInner settings={settings} />
}

function TimerInner({ settings }: { settings: Settings }) {
  const [timerConfig, saveTimerConfig] = useStoredKey('timerConfig')
  const config = timerConfig ?? DEFAULT_CONFIG

  // Latest-config ref so the wrapped reducer always sees the current work/break
  // minutes without needing to reconstruct the reducer function each render.
  const configRef = useRef(config)
  configRef.current = config

  const [state, dispatch] = useReducer(
    (s: TimerState, action: TimerAction) => timerReducer(s, action, configRef.current),
    config,
    initialTimer,
  )

  const now = useNow(500)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<PanelPlacement | null>(null)
  const [flash, setFlash] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const pillRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const prevJustFinished = useRef<TimerState['justFinished']>(state.justFinished)
  const prevConfigKey = useRef(`${config.workMinutes}:${config.breakMinutes}`)

  useFocusTrap(panelRef, open)

  // Drive the countdown from the shared 500ms clock: every tick of `now`
  // re-checks the reducer, which itself decides (using the timestamp we pass
  // in) whether the session actually completed. The reducer never reads the
  // clock itself, which is what keeps it trivially testable.
  useEffect(() => {
    if (!state.running) return
    dispatch({ type: 'tick', now: now.getTime() })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per `now` tick, not on every running-flag flip
  }, [now])

  // Editing work/break minutes while idle should retarget the idle countdown
  // immediately; editing mid-session leaves the active session alone and only
  // takes effect on the next phase change (via the ref the reducer reads).
  useEffect(() => {
    const key = `${config.workMinutes}:${config.breakMinutes}`
    if (key === prevConfigKey.current) return
    prevConfigKey.current = key
    if (!state.running) dispatch({ type: 'reset', now: Date.now() })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the config identity changing
  }, [config.workMinutes, config.breakMinutes])

  // Pill flash lifecycle: a pure function of the phase transition itself, so
  // it can't get stuck on. Kept in its own effect (deps: only
  // state.justFinished) so that settings.muted flipping mid-flash can never
  // cancel this effect's pending setTimeout without also rescheduling it —
  // React only tears down/reruns this effect when justFinished itself changes.
  useEffect(() => {
    if (!state.justFinished) return
    setFlash(true)
    const id = setTimeout(() => setFlash(false), 1200)
    return () => {
      clearTimeout(id)
      setFlash(false)
    }
  }, [state.justFinished])

  // Chime + screen-reader announcement, exactly once per phase transition
  // (edge-detected against the previous justFinished value, since the
  // reducer intentionally leaves it set until the next start/tick — and this
  // effect's own settings.muted dependency would otherwise re-fire it every
  // time muted is toggled). Muted flipping mid-transition may skip or allow
  // the chime; it can no longer touch the flash timer above.
  useEffect(() => {
    if (state.justFinished && state.justFinished !== prevJustFinished.current) {
      if (!settings.muted) playChime()
      setAnnouncement(state.justFinished === 'work' ? 'Break time.' : 'Back to work.')
    }
    prevJustFinished.current = state.justFinished
  }, [state.justFinished, settings.muted])

  // Newest-first shared stack (src/lib/dialogStack.ts), active only while
  // the panel is open.
  useDialogEscape(() => setOpen(false), open)

  if (timerConfig === undefined) return null

  const liveRemainingMs =
    state.running && state.endsAt !== null
      ? Math.max(0, state.endsAt - now.getTime())
      : state.remainingMs
  const display = formatRemaining(liveRemainingMs)

  const start = () => dispatch({ type: 'start', now: Date.now() })
  const pause = () => dispatch({ type: 'pause', now: Date.now() })
  const reset = () => dispatch({ type: 'reset', now: Date.now() })

  // The panel follows the pill: measured on open (not live-tracked — the
  // pill can't move while the panel is open today, since arrange mode closes
  // panels), via the same anchorPanel formula every peripheral panel uses.
  const togglePanel = () => {
    if (open) {
      setOpen(false)
      return
    }
    if (pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect()
      setAnchor(
        anchorPanel(rect, TIMER_PANEL_SIZE, { w: window.innerWidth, h: window.innerHeight }),
      )
    }
    setOpen(true)
  }

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        aria-expanded={open}
        aria-label={`Focus timer: ${display} remaining, ${state.mode} session, ${
          state.running ? 'running' : 'paused'
        }`}
        onClick={togglePanel}
        className={`rounded-panel border border-panel-border bg-panel px-3 py-2 text-sm tabular-nums backdrop-blur-[var(--panel-blur)] hover:text-accent focus-visible:outline-2 focus-visible:outline-accent ${
          flash ? 'text-accent' : 'text-fg'
        }`}
      >
        <span aria-hidden>⏱ </span>
        {display}
      </button>

      {open && anchor && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Focus timer"
          // `anchor` is `{left,top}` (opens downward) or `{left,bottom}`
          // (opens upward) — review fix I1; see anchor.ts's PanelPlacement
          // doc. Timer's own pill defaults to the top half (top-4), so this
          // panel opens downward today, but a dragged pill (arrange mode)
          // can land it in the bottom half too, so both shapes must be
          // handled here regardless.
          style={{
            position: 'fixed',
            left: anchor.left,
            ...('top' in anchor ? { top: anchor.top } : { bottom: anchor.bottom }),
          }}
          className="z-30 flex w-64 flex-col gap-3 rounded-panel border border-panel-border bg-panel-solid p-3 text-fg backdrop-blur-[var(--panel-blur)]"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium capitalize">{state.mode} session</h2>
            <button
              type="button"
              aria-label="Close focus timer"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              ✕
            </button>
          </div>

          <p className="text-center text-3xl font-light tabular-nums">{display}</p>

          <div className="flex items-center justify-center gap-2 text-sm">
            {state.running ? (
              <button
                type="button"
                onClick={pause}
                className="rounded-full border border-panel-border px-3 py-1 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                className="rounded-full border border-panel-border px-3 py-1 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                Start
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-panel-border px-3 py-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              Reset
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-fg-muted">
            <label className="flex items-center gap-1">
              Work
              <input
                type="number"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                value={config.workMinutes}
                disabled={state.running}
                onChange={(e) =>
                  saveTimerConfig({
                    ...config,
                    workMinutes: clampMinutes(e.currentTarget.valueAsNumber),
                  })
                }
                className="w-14 border-b border-panel-border bg-transparent px-1 py-0.5 text-fg outline-none focus-visible:border-accent disabled:opacity-50"
              />
              min
            </label>
            <label className="flex items-center gap-1">
              Break
              <input
                type="number"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                value={config.breakMinutes}
                disabled={state.running}
                onChange={(e) =>
                  saveTimerConfig({
                    ...config,
                    breakMinutes: clampMinutes(e.currentTarget.valueAsNumber),
                  })
                }
                className="w-14 border-b border-panel-border bg-transparent px-1 py-0.5 text-fg outline-none focus-visible:border-accent disabled:opacity-50"
              />
              min
            </label>
          </div>

          {state.cycles > 0 && (
            <p className="text-center text-xs text-fg-muted">
              {state.cycles} focus {state.cycles === 1 ? 'session' : 'sessions'} completed
            </p>
          )}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  )
}
