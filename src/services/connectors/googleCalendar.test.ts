import { describe, expect, it, vi } from 'vitest'
import {
  GoogleCalendarRequestError,
  fetchGoogleCalendarList,
  isGoogleCalendarSnapshot,
  parseGoogleCalendarConfig,
  refreshGoogleCalendarSnapshot,
} from './googleCalendar'
import type {
  GoogleCalendarConfig,
  GoogleCalendarSnapshot,
} from './types'

const now = Date.UTC(2026, 8, 3, 16, 0, 0)
const windowStart = Date.UTC(2026, 7, 1)
const windowEnd = Date.UTC(2026, 9, 1)
const connectionId = '52000000-0000-4000-8000-000000000001'

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

function config(calendarCount = 1): GoogleCalendarConfig {
  return {
    enabled: true,
    accounts: [{
      connectionId,
      displayEmail: 'jon@example.com',
      calendars: Array.from({ length: calendarCount }, (_, index) => ({
        calendarId: index === 0 ? 'primary' : `calendar-${index}@group.calendar.google.com`,
        name: index === 0 ? 'Jon' : `Calendar ${index}`,
        color: index === 0 ? '#4285f4' : '#0b8043',
        primary: index === 0,
      })),
    }],
  }
}

function page(items: unknown[] = [], syncToken = 'next-sync-token'): Response {
  return json({ items, nextSyncToken: syncToken })
}

function priorSnapshot(): GoogleCalendarSnapshot {
  return {
    version: 1,
    fetchedAt: now - 60_000,
    calendars: [{
      connectionId,
      calendarId: 'primary',
      color: '#4285f4',
      windowStart,
      windowEnd,
      syncToken: 'old-sync-token',
      events: [
        {
          eventId: 'event-1', title: 'Remove me', status: 'confirmed',
          start: Date.UTC(2026, 8, 4, 14), end: Date.UTC(2026, 8, 4, 15),
          allDay: false, startDate: null, endDate: null, updatedAt: now - 2_000,
        },
        {
          eventId: 'event-2', title: 'Keep me', status: 'confirmed',
          start: Date.UTC(2026, 8, 5, 14), end: Date.UTC(2026, 8, 5, 15),
          allDay: false, startDate: null, endDate: null, updatedAt: now - 1_000,
        },
      ],
    }],
  }
}

describe('Google Calendar local config', () => {
  it('accepts only bounded selected account and calendar metadata', () => {
    const parsed = parseGoogleCalendarConfig(config(2))
    expect(parsed).toEqual(config(2))
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed?.accounts[0]?.calendars)).toBe(true)
  })

  it.each([
    ['connection token', { ...config(), accessToken: 'secret' }],
    ['refresh token', { ...config(), refreshToken: 'secret' }],
    ['cursor', { ...config(), syncToken: 'cursor' }],
    ['raw response', { ...config(), providerResponse: { items: [] } }],
    ['unknown account field', { ...config(), accounts: [{ ...config().accounts[0], providerSubject: 'subject' }] }],
    ['unknown calendar field', { ...config(), accounts: [{ ...config().accounts[0], calendars: [{ ...config().accounts[0]!.calendars[0], description: 'private' }] }] }],
    ['too many calendars for one account', config(11)],
  ])('rejects %s', (_name, candidate) => {
    expect(parseGoogleCalendarConfig(candidate)).toBeNull()
  })

  it('rejects more than twenty calendars across all connections', () => {
    const candidate = {
      enabled: true,
      accounts: [1, 2, 3].map((account) => ({
        ...config(7).accounts[0],
        connectionId: `52000000-0000-4000-8000-${String(account).padStart(12, '0')}`,
      })),
    }
    expect(parseGoogleCalendarConfig(candidate)).toBeNull()
  })
})

describe('Google Calendar discovery', () => {
  it('paginates the exact Google endpoint and keeps only safe display fields', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({
        items: [{
          id: 'primary', summary: 'Jon', primary: true, accessRole: 'owner',
          selected: true, backgroundColor: '#4285f4', foregroundColor: '#ffffff',
        }],
        nextPageToken: 'page-2',
      }))
      .mockResolvedValueOnce(json({
        items: [{
          id: 'family@example.com', summary: 'Family', accessRole: 'reader',
          backgroundColor: '#0b8043', foregroundColor: '#ffffff',
          description: 'must be discarded',
        }],
      }))

    await expect(fetchGoogleCalendarList('access-token', fetchFn)).resolves.toEqual([
      {
        calendarId: 'primary', name: 'Jon', color: '#4285f4', foregroundColor: '#ffffff',
        primary: true, selected: true, accessRole: 'owner',
      },
      {
        calendarId: 'family@example.com', name: 'Family', color: '#0b8043', foregroundColor: '#ffffff',
        primary: false, selected: false, accessRole: 'reader',
      },
    ])
    expect(fetchFn).toHaveBeenCalledTimes(2)
    for (const [url, init] of fetchFn.mock.calls) {
      const parsed = new URL(String(url))
      expect(parsed.protocol).toBe('https:')
      expect(parsed.hostname).toBe('www.googleapis.com')
      expect(parsed.pathname).toBe('/calendar/v3/users/me/calendarList')
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token')
    }
    expect(new URL(String(fetchFn.mock.calls[1]![0])).searchParams.get('pageToken')).toBe('page-2')
  })

  it('rejects duplicate pagination tokens, non-JSON responses, and oversized bodies', async () => {
    const duplicate = vi.fn<typeof fetch>()
      .mockImplementation(async () => json({ items: [], nextPageToken: 'same-page' }))
    await expect(fetchGoogleCalendarList('token', duplicate)).rejects.toMatchObject({
      code: 'invalid_response',
    })

    await expect(fetchGoogleCalendarList('token', vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>wrong</html>', { headers: { 'Content-Type': 'text/html' } }),
    ))).rejects.toMatchObject({ code: 'invalid_response' })

    await expect(fetchGoogleCalendarList('token', vi.fn<typeof fetch>().mockResolvedValue(
      json({ items: [] }, 200, { 'Content-Length': String(1_048_577) }),
    ))).rejects.toMatchObject({ code: 'response_too_large' })
  })
})

describe('Google Calendar event refresh', () => {
  it('normalizes minimized event fields and discards raw private provider fields', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(page([{
      id: 'event-1', status: 'confirmed', summary: 'Planning',
      start: { dateTime: '2026-09-04T10:00:00-04:00' },
      end: { dateTime: '2026-09-04T10:30:00-04:00' },
      updated: '2026-09-03T15:59:00Z',
      htmlLink: 'https://calendar.google.com/calendar/event?eid=safe',
      hangoutLink: 'https://meet.google.com/abc-defg-hij',
      attendees: [{ email: 'private@example.com' }],
      description: 'private notes',
      location: 'private room',
    }, {
      id: 'all-day', status: 'tentative', summary: 'Away',
      start: { date: '2026-09-06' }, end: { date: '2026-09-07' },
      updated: '2026-09-03T15:58:00Z',
      htmlLink: 'https://evil.example.com/calendar',
      hangoutLink: 'https://meet.google.com.evil.example.com/abc',
    }]))

    const snapshot = await refreshGoogleCalendarSnapshot({
      config: config(), previous: null, windowStart, windowEnd,
      getAccessToken: async () => 'access-token', fetchFn, now: () => now,
    })

    expect(snapshot).toEqual({
      version: 1,
      fetchedAt: now,
      calendars: [{
        connectionId, calendarId: 'primary', color: '#4285f4',
        windowStart, windowEnd, syncToken: 'next-sync-token',
        events: [{
          eventId: 'event-1', title: 'Planning', status: 'confirmed',
          start: Date.parse('2026-09-04T10:00:00-04:00'),
          end: Date.parse('2026-09-04T10:30:00-04:00'),
          allDay: false, startDate: null, endDate: null,
          updatedAt: Date.parse('2026-09-03T15:59:00Z'),
          calendarUrl: 'https://calendar.google.com/calendar/event?eid=safe',
          meetUrl: 'https://meet.google.com/abc-defg-hij',
        }, {
          eventId: 'all-day', title: 'Away', status: 'tentative',
          start: Date.parse('2026-09-06T00:00:00Z'),
          end: Date.parse('2026-09-07T00:00:00Z'),
          allDay: true, startDate: '2026-09-06', endDate: '2026-09-07',
          updatedAt: Date.parse('2026-09-03T15:58:00Z'),
        }],
      }],
    })
    expect(JSON.stringify(snapshot)).not.toMatch(/attendees|description|location|private@example|evil\.example/u)
    expect(isGoogleCalendarSnapshot(snapshot)).toBe(true)

    const request = new URL(String(fetchFn.mock.calls[0]![0]))
    expect(request.hostname).toBe('www.googleapis.com')
    expect(request.pathname).toBe('/calendar/v3/calendars/primary/events')
    expect(request.searchParams.get('timeMin')).toBe(new Date(windowStart).toISOString())
    expect(request.searchParams.get('timeMax')).toBe(new Date(windowEnd).toISOString())
    expect(request.searchParams.get('showDeleted')).toBe('true')
    expect(request.searchParams.has('syncToken')).toBe(false)
  })

  it('applies cancellation tombstones without disturbing another cached event', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(page([{
      id: 'event-1', status: 'cancelled',
    }], 'replacement-token'))

    const snapshot = await refreshGoogleCalendarSnapshot({
      config: config(), previous: priorSnapshot(), windowStart, windowEnd,
      getAccessToken: async () => 'token', fetchFn, now: () => now,
    })

    expect(snapshot.calendars[0]?.events.map((event) => event.eventId)).toEqual(['event-2'])
    expect(snapshot.calendars[0]?.syncToken).toBe('replacement-token')
    const request = new URL(String(fetchFn.mock.calls[0]![0]))
    expect(request.searchParams.get('syncToken')).toBe('old-sync-token')
    expect(request.searchParams.has('timeMin')).toBe(false)
    expect(request.searchParams.has('timeMax')).toBe(false)
  })

  it('replaces only a 410-expired calendar cursor with a bounded full refresh', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { code: 410 } }, 410))
      .mockResolvedValueOnce(page([{
        id: 'replacement', status: 'confirmed', summary: 'Fresh',
        start: { dateTime: '2026-09-05T10:00:00Z' }, end: { dateTime: '2026-09-05T11:00:00Z' },
        updated: '2026-09-03T16:00:00Z',
      }], 'fresh-token'))

    const snapshot = await refreshGoogleCalendarSnapshot({
      config: config(), previous: priorSnapshot(), windowStart, windowEnd,
      getAccessToken: async () => 'token', fetchFn, now: () => now,
    })

    expect(snapshot.calendars[0]?.events.map((event) => event.eventId)).toEqual(['replacement'])
    expect(new URL(String(fetchFn.mock.calls[0]![0])).searchParams.get('syncToken')).toBe('old-sync-token')
    expect(new URL(String(fetchFn.mock.calls[1]![0])).searchParams.has('syncToken')).toBe(false)
    expect(new URL(String(fetchFn.mock.calls[1]![0])).searchParams.get('timeMin')).toBe(new Date(windowStart).toISOString())
  })

  it('starts a bounded full refresh when the rolling window changes', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(page())
    await refreshGoogleCalendarSnapshot({
      config: config(), previous: priorSnapshot(), windowStart: windowStart + 1, windowEnd,
      getAccessToken: async () => 'token', fetchFn, now: () => now,
    })
    expect(new URL(String(fetchFn.mock.calls[0]![0])).searchParams.has('syncToken')).toBe(false)
  })

  it('limits direct Calendar API work to four requests and returns no partial snapshot', async () => {
    let inFlight = 0
    let maximum = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => {
      inFlight += 1
      maximum = Math.max(maximum, inFlight)
      await gate
      inFlight -= 1
      return page()
    })
    const pending = refreshGoogleCalendarSnapshot({
      config: config(5), previous: null, windowStart, windowEnd,
      getAccessToken: async () => 'token', fetchFn, now: () => now,
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(inFlight).toBe(4)
    release()
    await expect(pending).resolves.toMatchObject({ calendars: expect.any(Array) })
    expect(maximum).toBe(4)

    const previous = priorSnapshot()
    const before = structuredClone(previous)
    const failingConfig: GoogleCalendarConfig = {
      ...config(2),
      accounts: [{ ...config(2).accounts[0]!, calendars: config(2).accounts[0]!.calendars.slice(0, 2) }],
    }
    const failingFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(json({ error: 'failed' }, 500))
    await expect(refreshGoogleCalendarSnapshot({
      config: failingConfig, previous, windowStart, windowEnd,
      getAccessToken: async () => 'token', fetchFn: failingFetch, now: () => now,
    })).rejects.toBeInstanceOf(GoogleCalendarRequestError)
    expect(previous).toEqual(before)
  })
})
