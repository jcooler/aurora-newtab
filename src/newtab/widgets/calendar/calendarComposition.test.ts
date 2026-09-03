import { describe, expect, it } from 'vitest'
import type { IcsEvent } from '../../../services/connectors/ics'
import type {
  GoogleCalendarConfig,
  GoogleCalendarSnapshot,
  MicrosoftCalendarConfig,
  MicrosoftCalendarSnapshot,
} from '../../../services/connectors/types'
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

  it('keeps identical ICS and Google events distinct with explicit text and color source identity', () => {
    const firstConnection = '52000000-0000-4000-8000-000000000001'
    const secondConnection = '52000000-0000-4000-8000-000000000002'
    const googleConfig: GoogleCalendarConfig = {
      enabled: true,
      accountId: '42000000-0000-4000-8000-000000000001',
      accounts: [{
        connectionId: firstConnection,
        displayEmail: 'home@example.com',
        calendars: [{ calendarId: 'primary', name: 'Home', color: '#4285f4', primary: true }],
      }, {
        connectionId: secondConnection,
        displayEmail: 'work@example.com',
        calendars: [{ calendarId: 'work', name: 'Team', color: '#0b8043', primary: true }],
      }],
    }
    const googleSnapshot: GoogleCalendarSnapshot = {
      version: 1,
      fetchedAt: now,
      calendars: googleConfig.accounts.map((account, index) => ({
        connectionId: account.connectionId,
        calendarId: account.calendars[0]!.calendarId,
        color: account.calendars[0]!.color,
        windowStart: now - 86_400_000,
        windowEnd: now + 86_400_000,
        syncToken: `sync-${index}`,
        events: [{
          eventId: `same-${index}`,
          title: 'Design sync',
          status: 'confirmed',
          start: Date.parse('2026-09-07T14:00:00.000Z'),
          end: Date.parse('2026-09-07T14:30:00.000Z'),
          allDay: false,
          startDate: null,
          endDate: null,
          updatedAt: now,
        }],
      })),
    }
    const items = composeCalendarItems({
      events,
      icsCalendars: [{ name: 'Personal', url: 'https://example.test/private.ics', color: 'sky' }],
      googleConfig,
      googleSnapshot,
      holidays: [],
      includeHolidays: false,
      now,
      timeZone: 'UTC',
    }).filter((item) => item.kind === 'event' && item.title === 'Design sync')

    expect(items).toHaveLength(3)
    expect(items.map((item) => [item.authority, item.sourceLabel, item.sourceColor])).toEqual([
      ['ics', 'Personal', 'sky'],
      ['google_calendar', 'Home · home@example.com', '#4285f4'],
      ['google_calendar', 'Team · work@example.com', '#0b8043'],
    ])
  })

  it('uses Google all-day date identity instead of shifting UTC midnight across time zones', () => {
    const connectionId = '52000000-0000-4000-8000-000000000001'
    const googleConfig: GoogleCalendarConfig = {
      enabled: true,
      accountId: '42000000-0000-4000-8000-000000000001',
      accounts: [{
        connectionId,
        displayEmail: 'home@example.com',
        calendars: [{ calendarId: 'primary', name: 'Home', color: '#4285f4', primary: true }],
      }],
    }
    const googleSnapshot: GoogleCalendarSnapshot = {
      version: 1,
      fetchedAt: now,
      calendars: [{
        connectionId,
        calendarId: 'primary',
        color: '#4285f4',
        windowStart: now - 86_400_000,
        windowEnd: now + 2 * 86_400_000,
        syncToken: 'sync',
        events: [{
          eventId: 'all-day', title: 'Family day', status: 'confirmed',
          start: Date.parse('2026-09-08T00:00:00.000Z'),
          end: Date.parse('2026-09-09T00:00:00.000Z'),
          allDay: true, startDate: '2026-09-08', endDate: '2026-09-09', updatedAt: now,
        }],
      }],
    }
    const item = composeCalendarItems({
      events: [], googleConfig, googleSnapshot, holidays: [], includeHolidays: false,
      now, timeZone: 'America/New_York',
    })[0]
    expect(item).toMatchObject({ dateKey: '2026-09-08', allDay: true })
  })

  it('composes Microsoft rows with opaque ownership, account-qualified labels, provider colors, and local all-day identity', () => {
    const connectionId = '62000000-0000-4000-8000-000000000001'
    const microsoftConfig: MicrosoftCalendarConfig = {
      enabled: true,
      accountId: '42000000-0000-4000-8000-000000000001',
      accounts: [{
        connectionId,
        displayEmail: 'alex@contoso.example',
        accountKind: 'work_or_school',
        calendars: [{ calendarId: 'work', name: 'Work', color: '#0078d4', isDefault: true }],
      }],
    }
    const microsoftSnapshot: MicrosoftCalendarSnapshot = {
      version: 1,
      fetchedAt: now,
      calendars: [{
        connectionId,
        calendarId: 'work',
        color: '#0078d4',
        windowStart: now - 86_400_000,
        windowEnd: now + 3 * 86_400_000,
        deltaLink: 'https://graph.microsoft.com/v1.0/me/calendars/work/calendarView/delta?$deltatoken=opaque',
        events: [{
          eventId: 'same-title', title: 'Design sync', start: Date.parse('2026-09-07T14:00:00Z'),
          end: Date.parse('2026-09-07T14:30:00Z'), allDay: false, startDate: null, endDate: null,
          cancelled: false, showAs: 'busy', sensitivity: 'normal', eventType: 'singleInstance',
          seriesMasterId: null, updatedAt: now,
        }, {
          eventId: 'all-day', title: 'Offsite', start: Date.parse('2026-09-08T00:00:00Z'),
          end: Date.parse('2026-09-09T00:00:00Z'), allDay: true, startDate: '2026-09-08', endDate: '2026-09-09',
          cancelled: false, showAs: 'busy', sensitivity: 'normal', eventType: 'singleInstance',
          seriesMasterId: null, updatedAt: now,
        }, {
          eventId: 'cancelled', title: 'Cancelled', start: Date.parse('2026-09-08T15:00:00Z'),
          end: Date.parse('2026-09-08T16:00:00Z'), allDay: false, startDate: null, endDate: null,
          cancelled: true, showAs: 'free', sensitivity: 'normal', eventType: 'singleInstance',
          seriesMasterId: null, updatedAt: now,
        }, {
          eventId: 'expired', title: 'Expired', start: now - 120_000, end: now - 60_000,
          allDay: false, startDate: null, endDate: null, cancelled: false, showAs: 'busy',
          sensitivity: 'normal', eventType: 'singleInstance', seriesMasterId: null, updatedAt: now,
        }],
      }],
    }

    const items = composeCalendarItems({
      events,
      icsCalendars: [{ name: 'Personal', url: 'https://example.test/private.ics', color: 'sky' }],
      microsoftConfig,
      microsoftSnapshot,
      holidays: [],
      includeHolidays: false,
      now,
      timeZone: 'America/New_York',
    })
    const matching = items.filter((item) => item.kind === 'event' && item.title === 'Design sync')
    expect(matching).toHaveLength(2)
    expect(matching[1]).toMatchObject({
      authority: 'microsoft_calendar',
      sourceId: `${connectionId}\nwork`,
      sourceLabel: 'Work · alex@contoso.example',
      sourceColor: '#0078d4',
      eventId: 'same-title',
    })
    expect(items).toContainEqual(expect.objectContaining({
      authority: 'microsoft_calendar', title: 'Offsite', dateKey: '2026-09-08', allDay: true,
    }))
    expect(items.map((item) => item.title)).not.toContain('Cancelled')
    expect(items.map((item) => item.title)).not.toContain('Expired')
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
