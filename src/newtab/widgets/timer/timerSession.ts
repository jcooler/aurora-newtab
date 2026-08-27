import type { TimerConfig, TimerSession } from '../../../lib/storage/schema'
import { initialTimer, timerReducer, type TimerAction, type TimerState } from './timerReducer'

export type TimerSessionAction =
  | TimerAction
  | { type: 'enterFlow'; now: number }
  | { type: 'exitFlow'; now: number }

function fromReducerState(state: TimerState, flow: boolean): TimerSession {
  return {
    mode: state.mode,
    running: state.running,
    endsAt: state.endsAt,
    remainingMs: state.remainingMs,
    cycles: state.cycles,
    flow,
  }
}

export function materializeTimerSession(
  session: TimerSession | null,
  config: TimerConfig,
): TimerSession {
  return session ?? fromReducerState(initialTimer(config), false)
}

function toReducerState(session: TimerSession): TimerState {
  return { ...session, justFinished: null }
}

function isCanonicalIdle(session: TimerSession, config: TimerConfig): boolean {
  return (
    session.mode === 'work' &&
    !session.running &&
    session.endsAt === null &&
    session.remainingMs === config.workMinutes * 60_000 &&
    session.cycles === 0 &&
    !session.flow
  )
}

function normalizeTimerSession(session: TimerSession, config: TimerConfig): TimerSession | null {
  return isCanonicalIdle(session, config) ? null : session
}

/** Pure persisted-session reducer. Clock and storage reads belong to callers. */
export function reduceTimerSession(
  stored: TimerSession | null,
  action: TimerSessionAction,
  config: TimerConfig,
): TimerSession | null {
  const session = materializeTimerSession(stored, config)

  if (action.type === 'enterFlow') {
    const active = session.running
      ? session
      : fromReducerState(timerReducer(toReducerState(session), { type: 'start', now: action.now }, config), session.flow)
    return { ...active, flow: true }
  }

  if (action.type === 'exitFlow') {
    if (stored === null) return null
    return normalizeTimerSession({ ...session, flow: false }, config)
  }

  const reduced = timerReducer(toReducerState(session), action, config)
  return normalizeTimerSession(fromReducerState(reduced, session.flow), config)
}

/** Remaining time shown by every consumer. Running sessions trust endsAt. */
export function liveTimerRemainingMs(
  stored: TimerSession | null,
  now: number,
  config: TimerConfig,
): number {
  const session = materializeTimerSession(stored, config)
  return session.running && session.endsAt !== null
    ? Math.max(0, session.endsAt - now)
    : session.remainingMs
}
