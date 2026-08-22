import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNow } from '../../../lib/hooks/useNow'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { TimerConfig, TimerSession } from '../../../lib/storage/schema'
import {
  liveTimerRemainingMs,
  materializeTimerSession,
  reduceTimerSession,
  type TimerSessionAction,
} from './timerSession'

const DEFAULT_CONFIG: TimerConfig = { workMinutes: 25, breakMinutes: 5 }

export interface TimerSessionController {
  hydrated: boolean
  config: TimerConfig
  session: TimerSession
  remainingMs: number
  progressPct: number
  justFinished: 'work' | 'break' | null
  clearFinished(): void
  start(): Promise<TimerSession | null>
  pause(): Promise<TimerSession | null>
  reset(): Promise<TimerSession | null>
  enterFlow(): Promise<TimerSession | null>
  exitFlow(): Promise<TimerSession | null>
}

const TimerSessionContext = createContext<TimerSessionController | null>(null)

export function TimerSessionProvider({ children }: { children: ReactNode }) {
  const storage = useStorage()
  const [storedSession] = useStoredKey('timerSession')
  const [storedConfig] = useStoredKey('timerConfig')
  const now = useNow(500)
  const [justFinished, setJustFinished] = useState<'work' | 'break' | null>(null)
  const transitionInFlight = useRef(false)
  const config = storedConfig ?? DEFAULT_CONFIG
  const configRef = useRef(config)
  configRef.current = config
  const session = materializeTimerSession(storedSession ?? null, config)
  const remainingMs = liveTimerRemainingMs(storedSession ?? null, now.getTime(), config)
  const totalMs = (session.mode === 'work' ? config.workMinutes : config.breakMinutes) * 60_000
  const progressPct = totalMs > 0
    ? Math.min(100, Math.max(0, ((totalMs - remainingMs) / totalMs) * 100))
    : 0
  const hydrated = storedSession !== undefined && storedConfig !== undefined

  const runAction = useCallback(async (action: TimerSessionAction) => {
    setJustFinished(null)
    return storage.update('timerSession', (current) => (
      reduceTimerSession(current, action, configRef.current)
    ))
  }, [storage])

  useEffect(() => {
    if (
      !hydrated ||
      storedSession === null ||
      !storedSession.running ||
      storedSession.endsAt === null ||
      now.getTime() < storedSession.endsAt ||
      transitionInFlight.current
    ) return

    transitionInFlight.current = true
    let completed: 'work' | 'break' | null = null
    void storage.updateMany(['timerSession'], ({ timerSession }) => {
      if (
        timerSession === null ||
        !timerSession.running ||
        timerSession.endsAt === null ||
        now.getTime() < timerSession.endsAt
      ) return {}
      completed = timerSession.mode
      return {
        timerSession: reduceTimerSession(
          timerSession,
          { type: 'tick', now: now.getTime() },
          configRef.current,
        ),
      }
    }).then((patch) => {
      if (Object.prototype.hasOwnProperty.call(patch, 'timerSession') && completed) {
        setJustFinished(completed)
      }
    }).finally(() => {
      transitionInFlight.current = false
    })
  }, [hydrated, now, storage, storedSession])

  const value = useMemo<TimerSessionController>(() => ({
    hydrated,
    config,
    session,
    remainingMs,
    progressPct,
    justFinished,
    clearFinished: () => setJustFinished(null),
    start: () => runAction({ type: 'start', now: Date.now() }),
    pause: () => runAction({ type: 'pause', now: Date.now() }),
    reset: () => runAction({ type: 'reset', now: Date.now() }),
    enterFlow: () => runAction({ type: 'enterFlow', now: Date.now() }),
    exitFlow: () => runAction({ type: 'exitFlow', now: Date.now() }),
  }), [config, hydrated, justFinished, progressPct, remainingMs, runAction, session])

  return <TimerSessionContext.Provider value={value}>{children}</TimerSessionContext.Provider>
}

export function useTimerSession(): TimerSessionController {
  const controller = useContext(TimerSessionContext)
  if (!controller) {
    throw new Error('useTimerSession must be used inside <TimerSessionProvider>')
  }
  return controller
}
