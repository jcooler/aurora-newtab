import { describe, expect, it } from 'vitest'
import {
  isMicrosoftCalendarSnapshot,
  microsoftCalendarDescriptor,
  parseMicrosoftCalendarConfig,
  parseMicrosoftCalendarSnapshot,
} from './microsoftCalendar'
import type {
  MicrosoftCalendarConfig,
  MicrosoftCalendarEvent,
  MicrosoftCalendarSnapshot,
} from './types'

const accountId = '42000000-0000-4000-8000-000000000001'
const connectionId = '52000000-0000-4000-8000-000000000001'
const now = Date.UTC(2026, 8, 3, 19, 0, 0)
const windowStart = Date.UTC(2026, 8, 1)
const windowEnd = Date.UTC(2026, 9, 1)
const deltaLink = 'https://graph.microsoft.com/v1.0/me/calendars/calendar-1/calendarView/delta?$deltatoken=opaque'

function config(calendarCount = 1): MicrosoftCalendarConfig {
  return {
    enabled: true,
    accountId,
    accounts: [{
      connectionId,
      displayEmail: 'alex@contoso.example',
      accountKind: 'work_or_school',
      calendars: Array.from({ length: calendarCount }, (_, index) => ({
        calendarId: `calendar-${index + 1}`,
        name: index === 0 ? 'Work' : `Calendar ${index + 1}`,
        color: index === 0 ? '#0078d4' : '#5c2d91',
        isDefault: index === 0,
      })),
    }],
  }
}

function event(overrides: Partial<MicrosoftCalendarEvent> = {}): MicrosoftCalendarEvent {
  return {
    eventId: 'event-1',
    title: 'Planning',
    start: Date.UTC(2026, 8, 4, 14),
    end: Date.UTC(2026, 8, 4, 14, 30),
    allDay: false,
    startDate: null,
    endDate: null,
    cancelled: false,
    showAs: 'busy',
    sensitivity: 'normal',
    eventType: 'singleInstance',
    seriesMasterId: null,
    updatedAt: now - 1_000,
    ...overrides,
  }
}

function snapshot(events: MicrosoftCalendarEvent[] = [event()]): MicrosoftCalendarSnapshot {
  return {
    version: 1,
    fetchedAt: now,
    calendars: [{
      connectionId,
      calendarId: 'calendar-1',
      color: '#0078d4',
      windowStart,
      windowEnd,
      deltaLink,
      events,
    }],
  }
}

describe('Microsoft Calendar local config authority', () => {
  it.each(['personal', 'work_or_school'] as const)(
    'accepts and freezes exact account-bound %s selections',
    (accountKind) => {
      const candidate = config(2)
      candidate.accounts[0]!.accountKind = accountKind
      const parsed = parseMicrosoftCalendarConfig(candidate)

      expect(parsed).toEqual(candidate)
      expect(Object.isFrozen(parsed)).toBe(true)
      expect(Object.isFrozen(parsed?.accounts[0]?.calendars)).toBe(true)
    },
  )

  it.each([
    ['account id', { ...config(), accountId: 'account' }],
    ['six accounts', {
      ...config(),
      accounts: Array.from({ length: 6 }, (_, index) => ({
        ...config().accounts[0]!,
        connectionId: `52000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      })),
    }],
    ['duplicate connections', { ...config(), accounts: [config().accounts[0], config().accounts[0]] }],
    ['unknown account kind', {
      ...config(), accounts: [{ ...config().accounts[0], accountKind: 'consumer' }],
    }],
    ['eleven calendars for one account', config(11)],
    ['duplicate calendar ids', {
      ...config(2),
      accounts: [{
        ...config(2).accounts[0],
        calendars: [config().accounts[0]!.calendars[0]!, config().accounts[0]!.calendars[0]!],
      }],
    }],
    ['unsafe calendar name', {
      ...config(),
      accounts: [{
        ...config().accounts[0],
        calendars: [{ ...config().accounts[0]!.calendars[0], name: 'Private\ncalendar' }],
      }],
    }],
    ['invalid color', {
      ...config(),
      accounts: [{
        ...config().accounts[0],
        calendars: [{ ...config().accounts[0]!.calendars[0], color: 'blue' }],
      }],
    }],
    ['secret field', { ...config(), refreshToken: 'secret' }],
    ['tenant field', { ...config(), accounts: [{ ...config().accounts[0], tenantId: 'secret' }] }],
    ['raw provider calendar field', {
      ...config(),
      accounts: [{
        ...config().accounts[0],
        calendars: [{ ...config().accounts[0]!.calendars[0], owner: { address: 'private' } }],
      }],
    }],
  ])('rejects %s', (_name, candidate) => {
    expect(parseMicrosoftCalendarConfig(candidate)).toBeNull()
  })

  it('rejects more than twenty selected calendars across accounts', () => {
    const candidate = {
      ...config(),
      accounts: [1, 2, 3].map((index) => ({
        ...config(7).accounts[0]!,
        connectionId: `52000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      })),
    }
    expect(parseMicrosoftCalendarConfig(candidate)).toBeNull()
  })

  it('owns only the exact Graph origin for a complete local selection', () => {
    expect(microsoftCalendarDescriptor).toMatchObject({
      id: 'microsoftCalendar',
      auth: 'oauth',
      category: 'calendar-tasks',
      ttlMs: 15 * 60_000,
      excludeFromBackup: true,
    })
    expect(microsoftCalendarDescriptor.origins(config())).toEqual(['https://graph.microsoft.com/*'])
    expect(microsoftCalendarDescriptor.ownsOrigins(config())).toBe(true)
    expect(microsoftCalendarDescriptor.ownsOrigins({ enabled: true } as MicrosoftCalendarConfig)).toBe(false)
  })
})

describe('Microsoft Calendar normalized snapshot boundary', () => {
  it('accepts, sorts, and freezes only the minimized event allowlist', () => {
    const candidate = snapshot([
      event({ eventId: 'later', start: Date.UTC(2026, 8, 5, 14), end: Date.UTC(2026, 8, 5, 15) }),
      event({ eventId: 'earlier', start: Date.UTC(2026, 8, 4, 14), end: Date.UTC(2026, 8, 4, 15) }),
    ])
    const parsed = parseMicrosoftCalendarSnapshot(candidate)

    expect(parsed?.calendars[0]?.events.map((row) => row.eventId)).toEqual(['earlier', 'later'])
    expect(isMicrosoftCalendarSnapshot(parsed)).toBe(true)
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed?.calendars[0]?.events)).toBe(true)
  })

  it.each([
    ['non-Graph delta link', snapshot().calendars.map((row) => ({ ...row, deltaLink: 'https://evil.example/token' }))],
    ['credentialed delta link', snapshot().calendars.map((row) => ({ ...row, deltaLink: 'https://user:secret@graph.microsoft.com/v1.0/me/calendarView/delta' }))],
    ['unknown event field', snapshot([{ ...event(), bodyPreview: 'private' } as MicrosoftCalendarEvent])],
    ['duplicate event id', snapshot([event(), event()])],
    ['invalid showAs', snapshot([event({ showAs: 'occupied' as MicrosoftCalendarEvent['showAs'] })])],
    ['invalid sensitivity', snapshot([event({ sensitivity: 'secret' as MicrosoftCalendarEvent['sensitivity'] })])],
    ['invalid event type', snapshot([event({ eventType: 'meeting' as MicrosoftCalendarEvent['eventType'] })])],
    ['timed event carrying local dates', snapshot([event({ startDate: '2026-09-04' })])],
    ['all-day event with invalid dates', snapshot([event({
      allDay: true,
      startDate: '2026-02-30',
      endDate: '2026-03-01',
    })])],
  ])('rejects %s', (_name, input) => {
    const candidate = Array.isArray(input) ? { ...snapshot(), calendars: input } : input
    expect(parseMicrosoftCalendarSnapshot(candidate)).toBeNull()
    expect(isMicrosoftCalendarSnapshot(candidate)).toBe(false)
  })

  it('caps sources, events, issues, and window duration', () => {
    const tooManySources = {
      ...snapshot(),
      calendars: Array.from({ length: 21 }, (_, index) => ({
        ...snapshot().calendars[0]!, calendarId: `calendar-${index}`,
      })),
    }
    const tooManyEvents = snapshot(Array.from({ length: 10_001 }, (_, index) => (
      event({ eventId: `event-${index}` })
    )))
    const tooManyIssues = {
      ...snapshot(),
      connectionIssues: Array.from({ length: 6 }, (_, index) => ({
        connectionId: `52000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        code: 'offline' as const,
      })),
    }
    const oversizedWindow = {
      ...snapshot(),
      calendars: [{
        ...snapshot().calendars[0]!,
        windowEnd: windowStart + 371 * 86_400_000,
      }],
    }

    for (const candidate of [tooManySources, tooManyEvents, tooManyIssues, oversizedWindow]) {
      expect(isMicrosoftCalendarSnapshot(candidate)).toBe(false)
    }
  })

  it('isolates one stable issue per connection without provider error bodies', () => {
    const candidate = {
      ...snapshot(),
      connectionIssues: [{ connectionId, code: 'organization_approval_required' as const }],
    }
    expect(parseMicrosoftCalendarSnapshot(candidate)).toEqual(candidate)
    expect(parseMicrosoftCalendarSnapshot({
      ...candidate,
      connectionIssues: [...candidate.connectionIssues, candidate.connectionIssues[0]],
    })).toBeNull()
    expect(parseMicrosoftCalendarSnapshot({
      ...candidate,
      connectionIssues: [{ ...candidate.connectionIssues[0], message: 'private provider body' }],
    })).toBeNull()
  })
})
