import { describe, expect, it } from 'vitest'
import { formatClock, formatDayContext, greetingFor } from './clock'

describe('formatClock', () => {
  const at = (h: number, m: number) => new Date(2026, 6, 26, h, m)
  it('formats 24-hour time zero-padded', () => {
    expect(formatClock(at(9, 5), true)).toBe('09:05')
    expect(formatClock(at(0, 0), true)).toBe('00:00')
  })
  it('formats 12-hour time without leading zero', () => {
    expect(formatClock(at(15, 40), false)).toBe('3:40')
    expect(formatClock(at(12, 0), false)).toBe('12:00')
    expect(formatClock(at(0, 30), false)).toBe('12:30')
  })
})

describe('greetingFor', () => {
  it('picks the day part by hour', () => {
    expect(greetingFor(6, '')).toBe('Good morning.')
    expect(greetingFor(13, '')).toBe('Good afternoon.')
    expect(greetingFor(19, '')).toBe('Good evening.')
    expect(greetingFor(3, '')).toBe('Good evening.')
  })
  it('includes the name when set', () => {
    expect(greetingFor(6, 'Jon')).toBe('Good morning, Jon.')
  })
})

describe('formatDayContext', () => {
  const date = new Date(2026, 7, 16, 11, 33)

  it('formats a compact responsive date label', () => {
    expect(formatDayContext(date, 'compact')).toBe('Sun, Aug 16')
  })

  it('formats useful long detail without a redundant year', () => {
    expect(formatDayContext(date, 'long')).toBe('Sunday, August 16')
  })
})
