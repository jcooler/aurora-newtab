import { describe, expect, it, vi } from 'vitest'
import {
  fetchMicrosoftCalendarList,
  isMicrosoftCalendarSnapshot,
  MicrosoftCalendarRequestError,
  microsoftCalendarDescriptor,
  parseMicrosoftCalendarConfig,
  parseMicrosoftCalendarSnapshot,
  refreshMicrosoftCalendarSnapshot,
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

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const text = JSON.stringify(body)
  return new Response(text, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

function graphEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'event-1',
    subject: 'Planning',
    start: { dateTime: '2026-09-04T14:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-09-04T14:30:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
    isCancelled: false,
    showAs: 'busy',
    sensitivity: 'normal',
    type: 'singleInstance',
    seriesMasterId: null,
    lastModifiedDateTime: '2026-09-03T18:59:59Z',
    bodyPreview: 'must be discarded',
    ...overrides,
  }
}

function refreshInput(overrides: Partial<Parameters<typeof refreshMicrosoftCalendarSnapshot>[0]> = {}) {
  return {
    config: config(),
    previous: null,
    windowStart,
    windowEnd,
    now: () => now,
    fetchFn: vi.fn<typeof fetch>().mockResolvedValue(json({
      value: [graphEvent()],
      '@odata.deltaLink': deltaLink,
    })),
    getAccessToken: vi.fn().mockResolvedValue('memory-only-token'),
    ...overrides,
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

describe('Microsoft Graph calendar discovery gateway', () => {
  it('requests the exact minimized calendar list and discards unapproved provider fields', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({
      value: [{
        id: 'calendar-1',
        name: 'Work',
        color: 'lightBlue',
        hexColor: '#0078D4',
        isDefaultCalendar: true,
        canViewPrivateItems: false,
        owner: { address: 'private@contoso.example' },
      }],
    }))

    await expect(fetchMicrosoftCalendarList('access-token', fetchFn)).resolves.toEqual([{
      calendarId: 'calendar-1',
      name: 'Work',
      color: '#0078d4',
      isDefault: true,
      canViewPrivateItems: false,
      readable: true,
    }])

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [rawUrl, init] = fetchFn.mock.calls[0]!
    const url = new URL(String(rawUrl))
    expect(`${url.origin}${url.pathname}`).toBe('https://graph.microsoft.com/v1.0/me/calendars')
    expect([...url.searchParams.keys()].sort()).toEqual(['$select'])
    expect(url.searchParams.get('$select')).toBe('id,name,color,hexColor,isDefaultCalendar,canViewPrivateItems')
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer access-token',
        Accept: 'application/json',
        Prefer: 'outlook.timezone="UTC"',
      },
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('follows only bounded exact-route next links and maps unusable colors deterministically', async () => {
    const next = 'https://graph.microsoft.com/v1.0/me/calendars?%24select=id%2Cname%2Ccolor%2ChexColor%2CisDefaultCalendar%2CcanViewPrivateItems&%24skiptoken=opaque'
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({
        value: [{ id: 'b', name: 'Beta', color: 'auto', hexColor: '', isDefaultCalendar: false, canViewPrivateItems: true }],
        '@odata.nextLink': next,
      }))
      .mockResolvedValueOnce(json({
        value: [{ id: 'a', name: 'Alpha', color: 'invalid', hexColor: '#ffffff', isDefaultCalendar: true, canViewPrivateItems: true }],
      }))

    const result = await fetchMicrosoftCalendarList('token', fetchFn)
    expect(result.map((calendar) => calendar.calendarId)).toEqual(['a', 'b'])
    expect(result.every((calendar) => /^#[0-9a-f]{6}$/u.test(calendar.color))).toBe(true)
    expect(await fetchMicrosoftCalendarList('token', vi.fn<typeof fetch>().mockResolvedValue(json({
      value: [{ id: 'b', name: 'Beta', color: 'auto', hexColor: '', isDefaultCalendar: false, canViewPrivateItems: true }],
    })))).toEqual([result[1]])

    for (const malicious of [
      'http://graph.microsoft.com/v1.0/me/calendars?$skiptoken=x',
      'https://graph.microsoft.com.evil.test/v1.0/me/calendars?$skiptoken=x',
      'https://graph.microsoft.com/beta/me/calendars?$skiptoken=x',
      'https://graph.microsoft.com/v1.0/me/events?$skiptoken=x',
      'https://graph.microsoft.com/v1.0/me/calendars?$filter=owner&$skiptoken=x',
    ]) {
      await expect(fetchMicrosoftCalendarList('token', vi.fn<typeof fetch>().mockResolvedValue(json({
        value: [], '@odata.nextLink': malicious,
      })))).rejects.toMatchObject({ code: 'invalid_response' })
    }
  })

  it('rejects duplicate IDs, invalid media, oversized bodies, calendar overflow, and pagination loops', async () => {
    await expect(fetchMicrosoftCalendarList('token', vi.fn<typeof fetch>().mockResolvedValue(json({
      value: [
        { id: 'same', name: 'One', color: 'auto', isDefaultCalendar: false, canViewPrivateItems: true },
        { id: 'same', name: 'Two', color: 'auto', isDefaultCalendar: false, canViewPrivateItems: true },
      ],
    })))).rejects.toMatchObject({ code: 'invalid_response' })
    await expect(fetchMicrosoftCalendarList('token', vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'text/html' } }),
    ))).rejects.toMatchObject({ code: 'invalid_response' })
    await expect(fetchMicrosoftCalendarList('token', vi.fn<typeof fetch>().mockResolvedValue(json(
      { value: [] }, 200, { 'content-length': String(1_048_577) },
    )))).rejects.toMatchObject({ code: 'response_too_large' })

    const calendars = Array.from({ length: 251 }, (_, index) => ({
      id: `calendar-${index}`, name: `Calendar ${index}`, color: 'auto', isDefaultCalendar: false,
      canViewPrivateItems: true,
    }))
    await expect(fetchMicrosoftCalendarList('token', vi.fn<typeof fetch>().mockResolvedValue(json({ value: calendars })))).rejects.toMatchObject({
      code: 'limit_exceeded',
    })

    const sameNext = 'https://graph.microsoft.com/v1.0/me/calendars?%24select=id%2Cname%2Ccolor%2ChexColor%2CisDefaultCalendar%2CcanViewPrivateItems&%24skiptoken=same'
    await expect(fetchMicrosoftCalendarList('token', vi.fn<typeof fetch>().mockImplementation(async () => json({
      value: [], '@odata.nextLink': sameNext,
    })))).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('Microsoft Graph atomic calendar delta refresh', () => {
  it('starts an exact no-select calendarView delta and minimizes timed and all-day events', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({
      value: [
        graphEvent(),
        graphEvent({
          id: 'all-day',
          subject: undefined,
          start: { dateTime: '2026-09-05T00:00:00.0000000', timeZone: 'UTC' },
          end: { dateTime: '2026-09-06T00:00:00.0000000', timeZone: 'UTC' },
          isAllDay: true,
          showAs: 'free',
          sensitivity: 'private',
          type: 'occurrence',
          seriesMasterId: 'series-1',
        }),
      ],
      '@odata.deltaLink': deltaLink,
    }))

    const result = await refreshMicrosoftCalendarSnapshot(refreshInput({ fetchFn }))
    expect(result.calendars[0]?.events).toEqual([
      event(),
      event({
        eventId: 'all-day',
        title: 'Untitled event',
        start: Date.UTC(2026, 8, 5),
        end: Date.UTC(2026, 8, 6),
        allDay: true,
        startDate: '2026-09-05',
        endDate: '2026-09-06',
        showAs: 'free',
        sensitivity: 'private',
        eventType: 'occurrence',
        seriesMasterId: 'series-1',
      }),
    ])
    expect(JSON.stringify(result)).not.toContain('bodyPreview')

    const [rawUrl, init] = fetchFn.mock.calls[0]!
    const url = new URL(String(rawUrl))
    expect(url.pathname).toBe('/v1.0/me/calendars/calendar-1/calendarView/delta')
    expect(url.searchParams.get('startDateTime')).toBe(new Date(windowStart).toISOString())
    expect(url.searchParams.get('endDateTime')).toBe(new Date(windowEnd).toISOString())
    expect(url.searchParams.has('$select')).toBe(false)
    expect(init).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store' })
  })

  it('uses a validated delta link, applies changes and deletions, and retains only the final cursor', async () => {
    const previous = snapshot([
      event({ eventId: 'delete-me' }),
      event({ eventId: 'update-me', title: 'Old title' }),
    ])
    const finalLink = 'https://graph.microsoft.com/v1.0/me/calendars/calendar-1/calendarView/delta?$deltatoken=next'
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({
      value: [
        { id: 'delete-me', '@removed': { reason: 'deleted' } },
        graphEvent({ id: 'update-me', subject: 'New title' }),
      ],
      '@odata.deltaLink': finalLink,
    }))

    const result = await refreshMicrosoftCalendarSnapshot(refreshInput({ previous, fetchFn }))
    expect(fetchFn.mock.calls[0]?.[0]).toBe(deltaLink)
    expect(result.calendars[0]?.deltaLink).toBe(finalLink)
    expect(result.calendars[0]?.events.map((row) => [row.eventId, row.title])).toEqual([
      ['update-me', 'New title'],
    ])
  })

  it('rebuilds only an expired cursor and never reuses a cursor for a changed window', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 410))
      .mockResolvedValueOnce(json({ value: [graphEvent()], '@odata.deltaLink': deltaLink }))
    const rebuilt = await refreshMicrosoftCalendarSnapshot(refreshInput({ previous: snapshot(), fetchFn }))
    expect(rebuilt.connectionIssues).toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[0]?.[0]).toBe(deltaLink)
    expect(new URL(String(fetchFn.mock.calls[1]?.[0])).searchParams.has('startDateTime')).toBe(true)

    const changedFetch = vi.fn<typeof fetch>().mockResolvedValue(json({ value: [], '@odata.deltaLink': deltaLink }))
    await refreshMicrosoftCalendarSnapshot(refreshInput({
      previous: snapshot(),
      windowStart: windowStart - 86_400_000,
      fetchFn: changedFetch,
    }))
    expect(String(changedFetch.mock.calls[0]?.[0])).not.toBe(deltaLink)
  })

  it('keeps an account atomic on interrupted pagination and reports a stable issue', async () => {
    const next = 'https://graph.microsoft.com/v1.0/me/calendars/calendar-1/calendarView/delta?$skiptoken=page-2'
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ value: [graphEvent({ id: 'new' })], '@odata.nextLink': next }))
      .mockRejectedValueOnce(new TypeError('offline'))

    const previous = snapshot([event({ eventId: 'retained', title: 'Retained' })])
    const result = await refreshMicrosoftCalendarSnapshot(refreshInput({ previous, fetchFn }))
    expect(result.calendars).toEqual(previous.calendars)
    expect(result.connectionIssues).toEqual([{ connectionId, code: 'offline' }])
  })

  it('rejects hostile delta links and maps provider status without retaining response text', async () => {
    for (const malicious of [
      'https://evil.example/v1.0/me/calendars/calendar-1/calendarView/delta?$skiptoken=x',
      'https://graph.microsoft.com/beta/me/calendars/calendar-1/calendarView/delta?$skiptoken=x',
      'https://graph.microsoft.com/v1.0/me/calendars/other/calendarView/delta?$skiptoken=x',
      'https://graph.microsoft.com/v1.0/me/calendars/calendar-1/calendarView/delta?$select=body&$skiptoken=x',
    ]) {
      const result = await refreshMicrosoftCalendarSnapshot(refreshInput({
        previous: snapshot(),
        fetchFn: vi.fn<typeof fetch>().mockResolvedValue(json({ value: [], '@odata.nextLink': malicious })),
      }))
      expect(result.calendars).toEqual(snapshot().calendars)
      expect(result.connectionIssues).toEqual([{ connectionId, code: 'invalid_response' }])
    }

    for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate_limited'], [500, 'provider_error']] as const) {
      const result = await refreshMicrosoftCalendarSnapshot(refreshInput({
        previous: snapshot(),
        fetchFn: vi.fn<typeof fetch>().mockResolvedValue(json({ error: { message: 'private provider text' } }, status)),
      }))
      expect(result.connectionIssues).toEqual([{ connectionId, code }])
      expect(JSON.stringify(result)).not.toContain('private provider text')
    }
  })

  it('limits total decoded traffic and normalized event count', async () => {
    const tooMany = Array.from({ length: 10_001 }, (_, index) => graphEvent({ id: `event-${index}` }))
    const countResult = await refreshMicrosoftCalendarSnapshot(refreshInput({
      previous: snapshot(),
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(json({ value: tooMany, '@odata.deltaLink': deltaLink })),
    }))
    expect(countResult.connectionIssues).toEqual([{ connectionId, code: 'limit_exceeded' }])
    expect(countResult.calendars).toEqual(snapshot().calendars)

    const bytesResult = await refreshMicrosoftCalendarSnapshot(refreshInput({
      previous: snapshot(),
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(json(
        { value: [], '@odata.deltaLink': deltaLink }, 200, { 'content-length': String(5 * 1_048_576 + 1) },
      )),
    }))
    expect(bytesResult.connectionIssues).toEqual([{ connectionId, code: 'response_too_large' }])

    const next = 'https://graph.microsoft.com/v1.0/me/calendars/calendar-1/calendarView/delta?$skiptoken=page-2'
    const accumulatedFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(
        { value: [], '@odata.nextLink': next }, 200, { 'content-length': String(3 * 1_048_576) },
      ))
      .mockResolvedValueOnce(json(
        { value: [], '@odata.deltaLink': deltaLink }, 200, { 'content-length': String(3 * 1_048_576) },
      ))
    const accumulated = await refreshMicrosoftCalendarSnapshot(refreshInput({
      previous: snapshot(),
      fetchFn: accumulatedFetch,
    }))
    expect(accumulatedFetch).toHaveBeenCalledTimes(2)
    expect(accumulated.connectionIssues).toEqual([{ connectionId, code: 'response_too_large' }])
    expect(accumulated.calendars).toEqual(snapshot().calendars)
  })

  it('isolates one failed connection while committing another connection atomically', async () => {
    const secondConnectionId = '62000000-0000-4000-8000-000000000001'
    const secondCalendarId = 'personal-calendar'
    const multiAccount: MicrosoftCalendarConfig = {
      ...config(),
      accounts: [
        config().accounts[0]!,
        {
          connectionId: secondConnectionId,
          displayEmail: 'alex@outlook.example',
          accountKind: 'personal',
          calendars: [{
            calendarId: secondCalendarId,
            name: 'Personal',
            color: '#9333ea',
            isDefault: true,
          }],
        },
      ],
    }
    const previous = snapshot([event({ eventId: 'work-retained', title: 'Work retained' })])
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname.includes('/calendar-1/')) return json({ error: {} }, 500)
      return json({
        value: [graphEvent({ id: 'personal-new', subject: 'Personal new' })],
        '@odata.deltaLink': `https://graph.microsoft.com/v1.0/me/calendars/${secondCalendarId}/calendarView/delta?$deltatoken=done`,
      })
    })

    const result = await refreshMicrosoftCalendarSnapshot(refreshInput({
      config: multiAccount,
      previous,
      fetchFn,
    }))
    expect(result.connectionIssues).toEqual([{ connectionId, code: 'provider_error' }])
    expect(result.calendars.map((source) => [source.connectionId, source.events[0]?.eventId])).toEqual([
      [connectionId, 'work-retained'],
      [secondConnectionId, 'personal-new'],
    ])
  })

  it('caps request concurrency at four and isolates a failed connection', async () => {
    const multi = config(5)
    let active = 0
    let maxActive = 0
    const releases: Array<() => void> = []
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active -= 1
      const path = new URL(String(input)).pathname
      const id = decodeURIComponent(path.split('/')[4] ?? '')
      return id === 'calendar-5'
        ? json({ error: {} }, 500)
        : json({ value: [], '@odata.deltaLink': `https://graph.microsoft.com${path}?$deltatoken=done` })
    })

    const getAccessToken = vi.fn().mockResolvedValue('memory-only-token')
    const pending = refreshMicrosoftCalendarSnapshot(refreshInput({ config: multi, fetchFn, getAccessToken }))
    await vi.waitFor(() => expect(active).toBe(4))
    while (releases.length) releases.shift()?.()
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(5))
    while (releases.length) releases.shift()?.()
    const result = await pending
    expect(maxActive).toBe(4)
    expect(result.connectionIssues).toEqual([{ connectionId, code: 'provider_error' }])
    expect(result.calendars).toHaveLength(0)
    expect(getAccessToken).toHaveBeenCalledTimes(1)
  })

  it('never puts access tokens in URLs or retained snapshots', async () => {
    const input = refreshInput()
    const result = await refreshMicrosoftCalendarSnapshot(input)
    expect((input.fetchFn as ReturnType<typeof vi.fn>).mock.calls.every(([url]) => !String(url).includes('memory-only-token'))).toBe(true)
    expect(JSON.stringify(result)).not.toContain('memory-only-token')
    expect(result).not.toHaveProperty('accessToken')
    expect(() => new MicrosoftCalendarRequestError('invalid_response')).not.toThrow()
  })
})
