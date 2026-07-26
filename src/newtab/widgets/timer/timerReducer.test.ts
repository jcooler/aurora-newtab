import { describe, expect, it } from 'vitest'
import { initialTimer, timerReducer } from './timerReducer'

const config = { workMinutes: 25, breakMinutes: 5 }
const MIN = 60_000

describe('timerReducer', () => {
  it('starts a work session ending workMinutes later', () => {
    const s = timerReducer(initialTimer(config), { type: 'start', now: 1000 }, config)
    expect(s.running).toBe(true)
    expect(s.endsAt).toBe(1000 + 25 * MIN)
  })

  it('pause preserves remaining time and resume continues from it', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'pause', now: 10 * MIN }, config)
    expect(s.running).toBe(false)
    expect(s.remainingMs).toBe(15 * MIN)
    s = timerReducer(s, { type: 'start', now: 20 * MIN }, config)
    expect(s.endsAt).toBe(35 * MIN)
  })

  it('tick before the end changes nothing material', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'tick', now: 5 * MIN }, config)
    expect(s.mode).toBe('work')
    expect(s.justFinished).toBeNull()
  })

  it('work completion flips to a running break and flags justFinished', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'tick', now: 25 * MIN }, config)
    expect(s.mode).toBe('break')
    expect(s.running).toBe(true)
    expect(s.endsAt).toBe(25 * MIN + 5 * MIN)
    expect(s.justFinished).toBe('work')
    expect(s.cycles).toBe(1)
  })

  it('break completion returns to an idle work state', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'tick', now: 25 * MIN }, config)
    s = timerReducer(s, { type: 'tick', now: 30 * MIN }, config)
    expect(s.mode).toBe('work')
    expect(s.running).toBe(false)
    expect(s.remainingMs).toBe(25 * MIN)
    expect(s.justFinished).toBe('break')
  })

  it('reset returns to initial for the current config', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'reset', now: 1 }, config)
    expect(s).toEqual(initialTimer(config))
  })
})
