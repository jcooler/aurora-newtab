import { describe, expect, it } from 'vitest'
import type { TimerSession } from '../../../lib/storage/schema'
import {
  liveTimerRemainingMs,
  materializeTimerSession,
  reduceTimerSession,
} from './timerSession'

const config = { workMinutes: 25, breakMinutes: 5 }
const MIN = 60_000

function paused(overrides: Partial<TimerSession> = {}): TimerSession {
  return {
    mode: 'work',
    running: false,
    endsAt: null,
    remainingMs: 15 * MIN,
    cycles: 1,
    flow: false,
    ...overrides,
  }
}

describe('persisted timer session model', () => {
  it('materializes null as the canonical idle work session', () => {
    expect(materializeTimerSession(null, config)).toEqual({
      mode: 'work',
      running: false,
      endsAt: null,
      remainingMs: 25 * MIN,
      cycles: 0,
      flow: false,
    })
  })

  it('starts from null, pauses by absolute deadline, and resumes from stored remaining time', () => {
    const running = reduceTimerSession(null, { type: 'start', now: 0 }, config)
    expect(running).toEqual({
      mode: 'work',
      running: true,
      endsAt: 25 * MIN,
      remainingMs: 25 * MIN,
      cycles: 0,
      flow: false,
    })

    const stopped = reduceTimerSession(running, { type: 'pause', now: 10 * MIN }, config)
    expect(stopped).toEqual(paused({ cycles: 0 }))

    const resumed = reduceTimerSession(stopped, { type: 'start', now: 20 * MIN }, config)
    expect(resumed?.endsAt).toBe(35 * MIN)
    expect(resumed?.remainingMs).toBe(15 * MIN)
  })

  it('derives a running reload from endsAt and a paused reload from remainingMs', () => {
    const running = paused({ running: true, endsAt: 40 * MIN, remainingMs: 25 * MIN })
    expect(liveTimerRemainingMs(running, 30 * MIN, config)).toBe(10 * MIN)
    expect(liveTimerRemainingMs(running, 50 * MIN, config)).toBe(0)
    expect(liveTimerRemainingMs(paused(), 50 * MIN, config)).toBe(15 * MIN)
    expect(liveTimerRemainingMs(null, 50 * MIN, config)).toBe(25 * MIN)
  })

  it('moves an overdue work phase to a running break and increments cycles', () => {
    const work = paused({ running: true, endsAt: 25 * MIN, remainingMs: 25 * MIN, cycles: 3 })
    const next = reduceTimerSession(work, { type: 'tick', now: 26 * MIN }, config)
    expect(next).toEqual({
      mode: 'break',
      running: true,
      endsAt: 31 * MIN,
      remainingMs: 5 * MIN,
      cycles: 4,
      flow: false,
    })
  })

  it('returns an overdue non-Flow break to canonical null idle without a negative countdown', () => {
    const activeBreak = paused({
      mode: 'break',
      running: true,
      endsAt: 5 * MIN,
      remainingMs: 5 * MIN,
      cycles: 2,
    })
    expect(reduceTimerSession(activeBreak, { type: 'tick', now: 7 * MIN }, config)).toBeNull()
  })

  it('reset normalizes a non-Flow session to null but keeps Flow active at idle', () => {
    expect(reduceTimerSession(paused(), { type: 'reset', now: 0 }, config)).toBeNull()
    expect(reduceTimerSession(paused({ flow: true }), { type: 'reset', now: 0 }, config)).toEqual({
      ...materializeTimerSession(null, config),
      flow: true,
    })
  })

  it('enters Flow atomically and starts null or paused sessions', () => {
    expect(reduceTimerSession(null, { type: 'enterFlow', now: 1_000 }, config)).toEqual({
      ...materializeTimerSession(null, config),
      running: true,
      endsAt: 1_000 + 25 * MIN,
      flow: true,
    })

    const resumed = reduceTimerSession(paused(), { type: 'enterFlow', now: 20 * MIN }, config)
    expect(resumed).toEqual({
      ...paused(),
      running: true,
      endsAt: 35 * MIN,
      flow: true,
    })
  })

  it('enters Flow without changing an already-running deadline', () => {
    const running = paused({ running: true, endsAt: 40 * MIN, remainingMs: 25 * MIN })
    expect(reduceTimerSession(running, { type: 'enterFlow', now: 30 * MIN }, config)).toEqual({
      ...running,
      flow: true,
    })
  })

  it('keeps Flow independent from pause and preserves timer state when Flow ends', () => {
    const runningFlow = paused({ running: true, endsAt: 40 * MIN, flow: true })
    const pausedFlow = reduceTimerSession(runningFlow, { type: 'pause', now: 30 * MIN }, config)
    expect(pausedFlow).toEqual(paused({ remainingMs: 10 * MIN, flow: true }))

    expect(reduceTimerSession(pausedFlow, { type: 'exitFlow', now: 31 * MIN }, config)).toEqual(
      paused({ remainingMs: 10 * MIN, flow: false }),
    )
  })

  it('normalizes Flow exit only when it produces the canonical idle state', () => {
    const idleFlow = { ...materializeTimerSession(null, config), flow: true }
    expect(reduceTimerSession(idleFlow, { type: 'exitFlow', now: 0 }, config)).toBeNull()

    const activeFlow = paused({ running: true, endsAt: 40 * MIN, flow: true })
    expect(reduceTimerSession(activeFlow, { type: 'exitFlow', now: 30 * MIN }, config)).toEqual({
      ...activeFlow,
      flow: false,
    })
  })

  it('keeps Flow present when a break completes and resets the timer to idle work', () => {
    const activeBreak = paused({
      mode: 'break',
      running: true,
      endsAt: 5 * MIN,
      remainingMs: 5 * MIN,
      cycles: 2,
      flow: true,
    })
    expect(reduceTimerSession(activeBreak, { type: 'tick', now: 7 * MIN }, config)).toEqual({
      ...materializeTimerSession(null, config),
      flow: true,
    })
  })
})
