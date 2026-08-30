import { describe, expect, it } from 'vitest'
import type { IcsEvent } from '../../../services/connectors/ics'
import type { PublicHoliday } from '../../../services/connectors/publicHolidays'
import { calendarMonthCells, composeCalendarItems } from './calendarComposition'

const now = Date.parse('2026-09-07T12:00:00.000Z')
const events: IcsEvent[] = [
  {
    summary: 'Labour Day',
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
const holidays: PublicHoliday[] = [{ date: '2026-09-07', name: 'Labour Day', localName: 'Labor Day' }]

describe('composeCalendarItems', () => {
  it('keeps a timed appointment primary while including a same-day holiday', () => {
    const items = composeCalendarItems({ events, holidays, includeHolidays: true, now, timeZone: 'UTC' })
    expect(items[0]).toMatchObject({ kind: 'event', title: 'Design sync' })
    expect(items).toContainEqual(expect.objectContaining({ kind: 'holiday', title: 'Labor Day', allDay: true }))
  })

  it('deduplicates an ICS holiday and public holiday without mutating either source', () => {
    const eventCopy = structuredClone(events)
    const holidayCopy = structuredClone(holidays)
    const items = composeCalendarItems({ events, holidays, includeHolidays: true, now, timeZone: 'UTC' })
    expect(items.filter((item) => /labou?r day/i.test(item.title))).toEqual([
      expect.objectContaining({ kind: 'holiday', title: 'Labor Day' }),
    ])
    expect(events).toEqual(eventCopy)
    expect(holidays).toEqual(holidayCopy)
  })

  it('does not include public holidays when the layout preference is off', () => {
    const items = composeCalendarItems({ events: [], holidays, includeHolidays: false, now, timeZone: 'UTC' })
    expect(items).toEqual([])
  })
})

describe('calendarMonthCells', () => {
  it.each([
    { label: 'four-row February', month: new Date(2026, 1, 1), weekStart: 'sunday' as const, length: 28, first: '2026-02-01', last: '2026-02-28', days: 28 },
    { label: 'five-row September', month: new Date(2026, 8, 1), weekStart: 'sunday' as const, length: 35, first: '2026-08-30', last: '2026-10-03', days: 30 },
    { label: 'six-row August', month: new Date(2026, 7, 1), weekStart: 'sunday' as const, length: 42, first: '2026-07-26', last: '2026-09-05', days: 31 },
    { label: 'Monday-start September', month: new Date(2026, 8, 1), weekStart: 'monday' as const, length: 35, first: '2026-08-31', last: '2026-10-04', days: 30 },
    { label: 'leap-year February', month: new Date(2028, 1, 1), weekStart: 'sunday' as const, length: 35, first: '2028-01-30', last: '2028-03-04', days: 29 },
  ])('returns the natural complete grid for $label', ({ month, weekStart, length, first, last, days }) => {
    const cells = calendarMonthCells(month, weekStart, 'en-US')
    expect(cells).toHaveLength(length)
    expect(cells[0]?.key).toBe(first)
    expect(cells.at(-1)?.key).toBe(last)
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(days)
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
