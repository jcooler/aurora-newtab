import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useFocusTrap } from '../../../lib/hooks/useFocusTrap'
import { useNow } from '../../../lib/hooks/useNow'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useViewportPanelAnchor } from '../../../lib/hooks/useViewportPanelAnchor'
import type { Settings, TimerConfig } from '../../../lib/storage/schema'
import { playChime } from './chime'
import { initialTimer, timerReducer, type TimerAction, type TimerState } from './timerReducer'
// The control kit (Task 61) — start/pause is the primary action, reset the
// quiet one, and the work/break minutes fields reuse the exact Settings input
// class, so the panel's controls speak the same language as the drawer's.
import { btnPrimary, btnQuiet, control } from '../../../settings/sections/shared'
import type { UtilityTrayBridge } from '../../components/utilityTrayBridge'

const DEFAULT_CONFIG: TimerConfig = { workMinutes: 25, breakMinutes: 5 }
const MIN_MINUTES = 1
const MAX_MINUTES = 180

// The panel has no fixed-height class (auto, sized to its content — header,
// countdown, progress rail, controls, work/break inputs, and an optional "N
// sessions completed" line once cycles > 0); this is its measured height in
// the deterministic default-open state (cycles === 0, that line absent). Width
// matches the panel's w-64 class exactly. Re-measured after the Task-62 polish
// pass (display-face digits + the progress rail grew it from 175) — the value
// is read straight off scripts/preview.mjs's timer-panel occlusion probe,
// which prints the live rendered rect (t=108, b=326 → 218), so it can't
// silently drift.
export const TIMER_PANEL_SIZE = { w: 256, h: 218 }

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

export default function TimerWidget({
  onOpenChange,
  utilityTray,
}: { onOpenChange?: (open: boolean) => void; utilityTray?: UtilityTrayBridge } = {}) {
  // Gate BEFORE any of the ticking/reducer machinery exists: disabled tabs
  // (the default — settings.widgets.timer starts false) mount none of that
  // and so run zero interval work. Only useStoredKey is called out here, so
  // Rules of Hooks stay satisfied regardless of the toggle. This is also
  // what makes the onOpenChange cleanup below (in TimerInner) fire reliably
  // on a mid-session disable: TimerInner actually UNMOUNTS rather than one
  // instance persisting across the toggle. See WeatherWidget's own
  // onExpandedChange comment for the full writeup of why that matters.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.timer) return null
  return <TimerInner settings={settings} onOpenChange={onOpenChange} utilityTray={utilityTray} />
}

function TimerInner({
  settings,
  onOpenChange,
  utilityTray,
}: {
  settings: Settings
  onOpenChange?: (open: boolean) => void
  utilityTray?: UtilityTrayBridge
}) {
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
  const pillRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const getDockBoundaryElement = useCallback(
    () => document.querySelector<HTMLElement>('[data-stage-zone-container="dock"]'),
    [],
  )
  const anchor = useViewportPanelAnchor({
    open: utilityTray ? false : open,
    invokerRef: pillRef,
    panelRef,
    preferredSize: TIMER_PANEL_SIZE,
    getBottomBoundaryElement: getDockBoundaryElement,
  })
  const prevJustFinished = useRef<TimerState['justFinished']>(state.justFinished)
  const prevConfigKey = useRef(`${config.workMinutes}:${config.breakMinutes}`)

  const panelReady = !utilityTray && open && anchor !== null
  useFocusTrap(panelRef, panelReady)

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
  useDialogEscape(() => setOpen(false), panelReady)

  // Final-review fix wave, Fix 1 — the exact idiom WeatherWidget's own
  // `onExpandedChange` uses (see its comment for the full writeup): a ref
  // keeps this always calling the LATEST callback, never a stale closure,
  // and the cleanup resets the mirrored App state to false on unmount so a
  // disabled/removed widget can never strand the wrapper's elevated z-index
  // open. Same root cause as weather's: this widget's own PositionedBlock
  // wrapper is `fixed` (an unconditional new stacking context), every
  // connector PositionedBlock mounts LATER in App.tsx than this one, and
  // this panel's own internal z-30 is trapped inside that wrapper's local
  // stacking order — so a connector card the open panel geometrically
  // covers paints ON TOP of it at matched (auto) stacking, the DOM-order
  // defect a real-Chromium reviewer probe confirmed (Focus-timer panel
  // under Calendar's card). App.tsx turns this into a conditional `z-30`
  // on the wrapper, only while open.
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  useEffect(() => {
    onOpenChangeRef.current?.(open)
    return () => onOpenChangeRef.current?.(false)
  }, [open])

  if (timerConfig === undefined) return null

  const liveRemainingMs =
    state.running && state.endsAt !== null
      ? Math.max(0, state.endsAt - now.getTime())
      : state.remainingMs
  const display = formatRemaining(liveRemainingMs)

  // Fraction of the current session already elapsed, for the progress bar.
  // Purely derived from the same live remaining time the digits show — no new
  // state, no new clock read — so it stays in lockstep with the countdown and
  // reads 0% at rest (idle remaining === session length). Clamped both ends
  // against a config edit that could momentarily make remaining exceed total.
  const sessionTotalMs =
    (state.mode === 'work' ? config.workMinutes : config.breakMinutes) * 60_000
  const progressPct =
    sessionTotalMs > 0
      ? Math.min(100, Math.max(0, ((sessionTotalMs - liveRemainingMs) / sessionTotalMs) * 100))
      : 0

  const start = () => dispatch({ type: 'start', now: Date.now() })
  const pause = () => dispatch({ type: 'pause', now: Date.now() })
  const reset = () => dispatch({ type: 'reset', now: Date.now() })

  // The panel follows the pill and live rendered panel size while open, via
  // the same anchorPanel formula every peripheral panel uses.
  const togglePanel = () => {
    if (utilityTray && pillRef.current) {
      utilityTray.requestTool('timer', pillRef.current)
      return
    }
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
  }

  const panelOpen = utilityTray ? utilityTray.activeTool === 'timer' : open

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        aria-expanded={panelOpen}
        aria-label={`Focus timer: ${display} remaining, ${state.mode} session, ${
          state.running ? 'running' : 'paused'
        }`}
        onClick={togglePanel}
        className={`rounded-panel border border-panel-border bg-panel-solid px-3 py-2 text-sm font-medium tabular-nums shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] hover:text-accent focus-visible:outline-2 focus-visible:outline-accent ${
          flash ? 'text-accent' : 'text-fg'
        }`}
      >
        <span aria-hidden>⏱ </span>
        {display}
      </button>

      {open && anchor && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Focus timer"
          data-canvas-tool-panel=""
          // `anchor` is `{left,top}` (opens downward) or `{left,bottom}`
          // (opens upward) — review fix I1; see anchor.ts's PanelPlacement
          // doc. Timer's own pill defaults to the top half
          // (top-[var(--top-band)], below the bookmarks band), so this
          // panel opens downward today, but a dragged pill (arrange mode)
          // can land it in the bottom half too, so both shapes must be
          // handled here regardless.
          style={{
            position: 'fixed',
            left: anchor.left,
            maxHeight: anchor.maxHeight,
            ...('top' in anchor ? { top: anchor.top } : { bottom: anchor.bottom }),
          }}
          className="z-30 flex max-h-[calc(100dvh-1rem)] w-[min(16rem,calc(100vw-1rem))] flex-col gap-3 overflow-y-auto rounded-panel border border-panel-border bg-panel-solid p-3 text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold capitalize tracking-tight">{state.mode} session</h2>
            <button
              type="button"
              aria-label="Close focus timer"
              onClick={() => setOpen(false)}
              className="-mr-1 rounded p-1 text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-[420px]:size-9 motion-reduce:transition-none"
            >
              ✕
            </button>
          </div>

          <p className="text-center font-display text-5xl font-light tabular-nums tracking-tight leading-none">
            {display}
          </p>

          {/* Progress rail — thin, fg-derived track with an accent fill that
              tracks the elapsed fraction; decorative (the time is announced via
              the pill's aria-label + the live region), width eased so it glides
              with the 500ms tick and snaps under motion-reduce. */}
          <div
            aria-hidden
            className="h-1.5 w-full overflow-hidden rounded-full bg-control-bg"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-linear motion-reduce:transition-none"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex items-center justify-center gap-2">
            {state.running ? (
              <button type="button" onClick={pause} className={`${btnPrimary} justify-center px-5`}>
                Pause
              </button>
            ) : (
              <button type="button" onClick={start} className={`${btnPrimary} justify-center px-5`}>
                Start
              </button>
            )}
            <button type="button" onClick={reset} className={`${btnQuiet} justify-center`}>
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
                className={`${control} w-14 text-center [appearance:textfield] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
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
                className={`${control} w-14 text-center [appearance:textfield] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
              />
              min
            </label>
          </div>

          {state.cycles > 0 && (
            <p className="border-t border-hairline pt-2.5 text-center text-xs text-fg-muted">
              {state.cycles} focus {state.cycles === 1 ? 'session' : 'sessions'} completed
            </p>
          )}
        </div>
      , document.body)}

      {utilityTray?.host && panelOpen
        ? createPortal(
            <TimerTrayDetails
              state={state}
              display={display}
              progressPct={progressPct}
              config={config}
              saveTimerConfig={saveTimerConfig}
              start={start}
              pause={pause}
              reset={reset}
            />,
            utilityTray.host,
          )
        : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  )
}

function TimerTrayDetails({
  state,
  display,
  progressPct,
  config,
  saveTimerConfig,
  start,
  pause,
  reset,
}: {
  state: TimerState
  display: string
  progressPct: number
  config: TimerConfig
  saveTimerConfig: (next: TimerConfig) => void
  start: () => void
  pause: () => void
  reset: () => void
}) {
  return (
    <section aria-label="Focus timer" className="flex w-full flex-col gap-3 text-fg">
      <h3 className="text-sm font-semibold capitalize tracking-tight">{state.mode} session</h3>
      <p className="text-center font-display text-5xl font-light tabular-nums tracking-tight leading-none">{display}</p>
      <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-control-bg">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-linear motion-reduce:transition-none" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="flex items-center justify-center gap-2">
        {state.running ? (
          <button type="button" onClick={pause} className={`${btnPrimary} justify-center px-5`}>Pause</button>
        ) : (
          <button type="button" onClick={start} className={`${btnPrimary} justify-center px-5`}>Start</button>
        )}
        <button type="button" onClick={reset} className={`${btnQuiet} justify-center`}>Reset</button>
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
            onChange={(event) => saveTimerConfig({ ...config, workMinutes: clampMinutes(event.currentTarget.valueAsNumber) })}
            className={`${control} w-14 text-center [appearance:textfield] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
          /> min
        </label>
        <label className="flex items-center gap-1">
          Break
          <input
            type="number"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            value={config.breakMinutes}
            disabled={state.running}
            onChange={(event) => saveTimerConfig({ ...config, breakMinutes: clampMinutes(event.currentTarget.valueAsNumber) })}
            className={`${control} w-14 text-center [appearance:textfield] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
          /> min
        </label>
      </div>
      {state.cycles > 0 ? (
        <p className="border-t border-hairline pt-2.5 text-center text-xs text-fg-muted">
          {state.cycles} focus {state.cycles === 1 ? 'session' : 'sessions'} completed
        </p>
      ) : null}
    </section>
  )
}
