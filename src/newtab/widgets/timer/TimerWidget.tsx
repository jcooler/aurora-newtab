import { useEffect, useReducer, useRef, useState } from 'react'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import { useNow } from '../../../lib/hooks/useNow'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { TimerConfig } from '../../../lib/storage/schema'
import { playChime } from './chime'
import { initialTimer, timerReducer, type TimerAction, type TimerState } from './timerReducer'

const DEFAULT_CONFIG: TimerConfig = { workMinutes: 25, breakMinutes: 5 }
const MIN_MINUTES = 1
const MAX_MINUTES = 180

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
  const [settings] = useStoredKey('settings')
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
  const [flash, setFlash] = useState(false)
  const [announcement, setAnnouncement] = useState('')
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

  // Chime + pill flash + screen-reader announcement, exactly once per phase
  // transition (edge-detected against the previous justFinished value, since
  // the reducer intentionally leaves it set until the next start/tick).
  useEffect(() => {
    if (state.justFinished && state.justFinished !== prevJustFinished.current) {
      if (!settings?.muted) playChime()
      setAnnouncement(state.justFinished === 'work' ? 'Break time.' : 'Back to work.')
      setFlash(true)
      const id = setTimeout(() => setFlash(false), 1200)
      prevJustFinished.current = state.justFinished
      return () => clearTimeout(id)
    }
    prevJustFinished.current = state.justFinished
  }, [state.justFinished, settings?.muted])

  useEffect(() => {
    if (!open) return
    // First-consumer convention: whichever open dialog's listener runs first
    // (registration order) claims the Escape and stops the rest from also
    // closing. A second press then closes the next one.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!settings?.widgets.timer || timerConfig === undefined) return null

  const liveRemainingMs =
    state.running && state.endsAt !== null
      ? Math.max(0, state.endsAt - now.getTime())
      : state.remainingMs
  const display = formatRemaining(liveRemainingMs)

  const start = () => dispatch({ type: 'start', now: Date.now() })
  const pause = () => dispatch({ type: 'pause', now: Date.now() })
  const reset = () => dispatch({ type: 'reset', now: Date.now() })

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Focus timer: ${display} remaining, ${state.mode} session, ${
          state.running ? 'running' : 'paused'
        }`}
        onClick={() => setOpen((v) => !v)}
        className={`fixed left-4 top-4 rounded-panel border border-panel-border bg-panel px-3 py-2 text-sm tabular-nums backdrop-blur-[var(--panel-blur)] hover:text-accent focus-visible:outline-2 focus-visible:outline-accent ${
          flash ? 'text-accent' : 'text-fg'
        }`}
      >
        <span aria-hidden>⏱ </span>
        {display}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Focus timer"
          className="fixed left-4 top-16 z-30 flex w-64 flex-col gap-3 rounded-panel border border-panel-border bg-panel p-3 text-fg backdrop-blur-[var(--panel-blur)]"
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
