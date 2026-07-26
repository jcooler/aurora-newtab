import type { TimerConfig } from '../../../lib/storage/schema'

export interface TimerState {
  mode: 'work' | 'break'
  running: boolean
  endsAt: number | null
  remainingMs: number
  cycles: number
  justFinished: 'work' | 'break' | null
}

export type TimerAction = { type: 'start' | 'pause' | 'reset' | 'tick'; now: number }

const MIN = 60_000

export function initialTimer(config: TimerConfig): TimerState {
  return {
    mode: 'work',
    running: false,
    endsAt: null,
    remainingMs: config.workMinutes * MIN,
    cycles: 0,
    justFinished: null,
  }
}

export function timerReducer(
  state: TimerState,
  action: TimerAction,
  config: TimerConfig,
): TimerState {
  switch (action.type) {
    case 'start':
      if (state.running) return state
      return {
        ...state,
        running: true,
        endsAt: action.now + state.remainingMs,
        justFinished: null,
      }
    case 'pause':
      if (!state.running || state.endsAt === null) return state
      return {
        ...state,
        running: false,
        endsAt: null,
        remainingMs: Math.max(0, state.endsAt - action.now),
      }
    case 'reset':
      return initialTimer(config)
    case 'tick': {
      if (!state.running || state.endsAt === null) return state
      if (action.now < state.endsAt) return state
      if (state.mode === 'work') {
        return {
          mode: 'break',
          running: true,
          endsAt: action.now + config.breakMinutes * MIN,
          remainingMs: config.breakMinutes * MIN,
          cycles: state.cycles + 1,
          justFinished: 'work',
        }
      }
      return { ...initialTimer(config), justFinished: 'break' }
    }
  }
}
