// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { IcsData, IcsEvent } from '../../../services/connectors/ics'
import type { IcsConfig } from '../../../services/connectors/types'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import CalendarWidget, { relNext } from './CalendarWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives
// across cases; reset it so one test's refresh can't dedupe the next — same
// discipline as every other connector widget test (CryptoWidget.test.tsx et
// al.).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const DAY_MS = 86_400_000
// Pinned "now" — a Friday, well clear of any DST transition — so every
// relative-time/agenda-membership assertion below is deterministic
// regardless of the wall-clock date the suite happens to run on.
const NOW = new Date(2026, 7, 7, 9, 0, 0).getTime() // 2026-08-07 09:00 local
const CONNECTED: IcsConfig = {
  enabled: true,
  calendars: [{ name: 'Personal', url: 'https://calendar.example.com/private-abc/basic.ics' }],
}

function ev(summary: string, start: number, end: number, cal = 0): IcsEvent {
  return { summary, start, end, cal }
}

const EVENT_NEXT = ev('Standup', new Date(2026, 7, 7, 11, 0, 0).getTime(), new Date(2026, 7, 7, 11, 30, 0).getTime()) // 2h out, today
const EVENT_B = ev('Design review', new Date(2026, 7, 7, 14, 0, 0).getTime(), new Date(2026, 7, 7, 14, 30, 0).getTime()) // today, later
const EVENT_C = ev('1:1 with Sam', new Date(2026, 7, 7, 16, 0, 0).getTime(), new Date(2026, 7, 7, 16, 30, 0).getTime()) // today, later still
const EVENT_TOMORROW = ev('Kickoff', new Date(2026, 7, 8, 9, 0, 0).getTime(), new Date(2026, 7, 8, 9, 30, 0).getTime())
const EVENT_ALL_DAY = ev(
  'Company Holiday',
  new Date(2026, 7, 7, 0, 0, 0).getTime(), // local midnight
  new Date(2026, 7, 7, 0, 0, 0).getTime() + DAY_MS, // exactly one whole day later
)

/** Storage seeded with a CONNECTED ics connector and a FRESH snapshot
 *  (fetchedAt = NOW) so useConnectorSnapshot treats it as fresh and never
 *  calls the real fetchIcs — the widget renders straight from cache, no
 *  network. Mirrors CryptoWidget.test.tsx's own seededStorage. */
async function seededStorage(config: IcsConfig, data: IcsData | null): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { ics: config })
  if (data) await storage.set('connectorSnapshots', { ics: { fetchedAt: NOW, data } })
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <CalendarWidget />
    </StorageProvider>,
  )
}

describe('CalendarWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the next-line + up to 2 agenda rows (today\'s remaining events, excluding next and tomorrow)', async () => {
    const storage = await seededStorage(CONNECTED, {
      events: [EVENT_NEXT, EVENT_B, EVENT_C, EVENT_TOMORROW],
    })
    mount(storage)
    // testing-library's own findBy/waitFor poll via setTimeout, which never
    // wakes up under fake timers — act(async) drains the pending storage
    // read's microtasks directly instead (same discipline as
    // Background.test.tsx's own fake-timer cases).
    await act(async () => {})

    expect(screen.getByText('Next: Standup · in 2 h')).toBeTruthy()
    expect(screen.getByText('14:00 Design review')).toBeTruthy()
    expect(screen.getByText('16:00 1:1 with Sam')).toBeTruthy()
    // Capped at 2 rows AND scoped to today: tomorrow's event appears nowhere.
    expect(screen.queryByText(/Kickoff/)).toBeNull()
  })

  it('an all-day event renders "All day · {summary}" and sorts before a same-day timed row, without ever becoming the headline', async () => {
    const storage = await seededStorage(CONNECTED, {
      events: [EVENT_ALL_DAY, EVENT_NEXT, EVENT_B, EVENT_C],
    })
    mount(storage)
    await act(async () => {})

    // The headline stays the next REAL appointment, not the all-day entry.
    expect(screen.getByText('Next: Standup · in 2 h')).toBeTruthy()
    const rows = [...document.querySelectorAll('section[aria-label="Calendar"] ul > li')].map(
      (li) => li.textContent,
    )
    // Capped at 2: the all-day row (earliest start of the day) plus the next
    // timed row after it — 1:1 with Sam is bumped off by the cap.
    expect(rows).toEqual(['All day · Company Holiday', '14:00 Design review'])
  })

  it('shows the empty-connected copy exactly when connected but nothing is left upcoming', async () => {
    const storage = await seededStorage(CONNECTED, { events: [] })
    mount(storage)
    await act(async () => {})

    const message = screen.getByText('No more events today.')
    // The empty copy now sits inside the solid card (Jon's darker-color
    // ruling), not as bare photo-floating text — so it no longer carries
    // text-photo; the card surface (bg-panel-solid) is what provides
    // legibility, matching GithubWidget's own in-card empty state.
    expect(message.className).not.toContain('text-photo')
    const card = message.closest('section[aria-label="Calendar"]') as HTMLElement
    expect(card.className).toContain('bg-panel-solid')
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).ics).toBeUndefined()
  })

  it('renders nothing when enabled but the url is empty', async () => {
    const storage = await seededStorage({ enabled: true, url: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).ics).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no url field — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { ics: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).ics).toBeUndefined()
  })

  it('a legacy single-url config still renders — icsCalendarsOf wraps it as one calendar, proving read-time migration end-to-end through the widget gate', async () => {
    const storage = await seededStorage(
      { enabled: true, url: 'https://calendar.example.com/private-abc/basic.ics' },
      { events: [EVENT_NEXT] },
    )
    mount(storage)
    await act(async () => {})

    expect(screen.getByText('Next: Standup · in 2 h')).toBeTruthy()
  })
})

describe('relNext', () => {
  it('an already-started (or negative) delta reads "now"', () => {
    expect(relNext(NOW, NOW - 1_000)).toBe('now')
  })

  it('just under 60 seconds away still reads "now" (the floor boundary)', () => {
    expect(relNext(NOW, NOW + 59_999)).toBe('now')
  })

  it('exactly 60 seconds away is the first "in N min" tick', () => {
    expect(relNext(NOW, NOW + 60_000)).toBe('in 1 min')
  })

  it('just under 60 minutes away stays in minutes', () => {
    expect(relNext(NOW, NOW + 59 * 60_000)).toBe('in 59 min')
  })

  it('minutes-scale formatting wins over the day boundary — 10 minutes away reads "in 10 min" even crossing midnight', () => {
    const lateNight = new Date(2026, 7, 7, 23, 55, 0).getTime()
    const justAfterMidnight = new Date(2026, 7, 8, 0, 5, 0).getTime()
    expect(relNext(lateNight, justAfterMidnight)).toBe('in 10 min')
  })

  it('same local calendar day, 60+ minutes away, reads "in N h" (the brief\'s own example)', () => {
    const start = new Date(2026, 7, 7, 12, 0, 0).getTime() // 3h after NOW (09:00)
    expect(relNext(NOW, start)).toBe('in 3 h')
  })

  it('the next local calendar day reads "tomorrow HH:MM" (the brief\'s own example)', () => {
    const lateNight = new Date(2026, 7, 7, 23, 0, 0).getTime()
    const start = new Date(2026, 7, 8, 9, 0, 0).getTime()
    expect(relNext(lateNight, start)).toBe('tomorrow 09:00')
  })

  it('two or more local calendar days out reads a short weekday + HH:MM', () => {
    const start = new Date(2026, 7, 10, 14, 30, 0).getTime() // 3 calendar days after NOW
    const expectedWeekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(start).getDay()]
    expect(relNext(NOW, start)).toBe(`${expectedWeekday} 14:30`)
  })
})
