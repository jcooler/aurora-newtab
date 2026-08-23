import { describe, expect, it } from 'vitest'
import type { IcsEvent } from '../../../services/connectors/ics'
import type { PublicHoliday } from '../../../services/connectors/publicHolidays'
import { calendarMonthCells, composeCalendarItems } from './calendarComposition'

const now = Date.parse('2026-09-07T12:00:00.000Z')
const events: IcsEvent[] = [
  {
    summary: 'Labor Day',
    start: Date.parse('2026-09-07T00:00:00.000Z'),
    end: Date.parse('2026-09-08T00:00:00.000Z'),
    allDay: true,
    cal: 0,
  },
  {
    summary: 'Design sync',
    start: Date.parse('2026-09-07T14:00:00.000Z'),
    end: Date.parse('2026-09-07T14:30:00.000Z'),
    allDay: false,
    cal: 0,
  },
]
const holidays: PublicHoliday[] = [{ date: '2026-09-07', name: 'Labor Day' }]

describe('composeCalendarItems', () => {
  it('keeps a timed appointment primary while including a same-day holiday', () => {
    const items = composeCalendarItems({ events, holidays, includeHolidays: true, now, timeZone: 'UTC' })
    expect(items[0]).toMatchObject({ kind: 'event', title: 'Design sync' })
    expect(items).toContainEqual(expect.objectContaining({ kind: 'event', title: 'Labor Day', allDay: true }))
  })

  it('deduplicates an ICS holiday and public holiday without mutating either source', () => {
    const eventCopy = structuredClone(events)
    const holidayCopy = structuredClone(holidays)
    expect(composeCalendarItems({ events, holidays, includeHolidays: true, now, timeZone: 'UTC' })
      .filter((item) => item.title === 'Labor Day')).toHaveLength(1)
    expect(events).toEqual(eventCopy)
    expect(holidays).toEqual(holidayCopy)
  })

  it('does not include public holidays when the layout preference is off', () => {
    const items = composeCalendarItems({ events: [], holidays, includeHolidays: false, now, timeZone: 'UTC' })
    expect(items).toEqual([])
  })
})

describe('calendarMonthCells', () => {
  it.each(['locale', 'sunday', 'monday'] as const)('returns a complete %s month grid', (weekStart) => {
    const cells = calendarMonthCells(new Date(2026, 7, 1), weekStart, 'en-US')
    expect(cells).toHaveLength(42)
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31)
  })

  it('shifts the same complete month between Sunday and Monday origins', () => {
    const sunday = calendarMonthCells(new Date(2026, 7, 1), 'sunday', 'en-US')
    const monday = calendarMonthCells(new Date(2026, 7, 1), 'monday', 'en-US')
    expect(sunday[0]?.key).toBe('2026-07-26')
    expect(monday[0]?.key).toBe('2026-07-27')
    expect(new Set(sunday.map((cell) => cell.key)).size).toBe(42)
    expect(new Set(monday.map((cell) => cell.key)).size).toBe(42)
  })
})
