// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { WidgetVariant } from '../../../lib/layout/types'
import type { IcsData, IcsEvent } from '../../../services/connectors/ics'
import type { IcsConfig } from '../../../services/connectors/types'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import CalendarWidget, {
  calendarDayToken,
  calendarSourceName,
  eventStartsBeforeLocalDayEnd,
  relNext,
} from './CalendarWidget'

beforeAll(() => {
  const digest = vi.fn(async (_algorithm: AlgorithmIdentifier, source: BufferSource) => {
    const bytes =
      source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    const output = new Uint8Array(32)
    bytes.forEach((byte, index) => {
      const slot = index % output.length
      output[slot] = ((output[slot] ?? 0) * 33 + byte + index) & 0xff
    })
    return output.buffer
  })
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: { digest },
  })
})

// The snapshot hook's in-flight dedupe map is module-level and survives
// across cases; reset it so one test's refresh can't dedupe the next — same
// discipline as every other connector widget test (CryptoWidget.test.tsx et
// al.).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const DAY_MS = 86_400_000
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
// Pinned "now" — a Friday, well clear of any DST transition — so every
// relative-time/agenda-membership assertion below is deterministic
// regardless of the wall-clock date the suite happens to run on.
const NOW = new Date(2026, 7, 7, 9, 0, 0).getTime() // 2026-08-07 09:00 local
const CONNECTED: IcsConfig = {
  enabled: true,
  calendars: [
    {
      name: 'Personal',
      url: 'https://calendar.example.com/private-abc/basic.ics',
    },
  ],
}
const CONNECTED_TWO: IcsConfig = {
  enabled: true,
  calendars: [
    { name: 'Personal', url: 'https://calendar.example.com/a.ics' },
    { name: 'Family', url: 'https://calendar.example.com/b.ics' },
  ],
}

// meetUrl optional (Task 89): the widget-boundary Join-link cases below pass
// it; every pre-existing fixture call omits it and gets the same
// no-meetUrl-key shape ics.ts's own expand() produces for a no-match event
// (conditional spread, never a `meetUrl: undefined` property).
function ev(summary: string, start: number, end: number, cal = 0, meetUrl?: string, allDay = false): IcsEvent {
  return { summary, start, end, cal, allDay, ...(meetUrl ? { meetUrl } : {}) }
}

// A realistic provider link (Task 88's own extractMeetUrl fixtures use the
// same host) — the Join-link cases below only need A string to assert the
// anchor's href against, not a parsed one.
const MEET_URL = 'https://meet.google.com/abc-defg-hij'

const EVENT_NEXT = ev('Standup', new Date(2026, 7, 7, 11, 0, 0).getTime(), new Date(2026, 7, 7, 11, 30, 0).getTime()) // 2h out, today
const EVENT_B = ev('Design review', new Date(2026, 7, 7, 14, 0, 0).getTime(), new Date(2026, 7, 7, 14, 30, 0).getTime()) // today, later
const EVENT_C = ev('1:1 with Sam', new Date(2026, 7, 7, 16, 0, 0).getTime(), new Date(2026, 7, 7, 16, 30, 0).getTime()) // today, later still
const EVENT_TOMORROW = ev('Kickoff', new Date(2026, 7, 8, 9, 0, 0).getTime(), new Date(2026, 7, 8, 9, 30, 0).getTime())
const EVENT_ALL_DAY = ev(
  'Company Holiday',
  new Date(2026, 7, 7, 0, 0, 0).getTime(), // local midnight
  new Date(2026, 7, 7, 0, 0, 0).getTime() + DAY_MS, // exactly one whole day later
  0,
  undefined,
  true,
)
// cal 1 fixtures for the multi-calendar view-mode cases below.
const EVENT_MON = ev(
  'Family lunch',
  new Date(2026, 7, 10, 12, 0, 0).getTime(),
  new Date(2026, 7, 10, 13, 0, 0).getTime(),
  1,
) // 3 days out (Mon) → weekday token
const EVENT_FAR = ev(
  'Dentist',
  new Date(2026, 7, 18, 15, 30, 0).getTime(),
  new Date(2026, 7, 18, 16, 0, 0).getTime(),
  1,
) // 11 days out → date token

/** Storage seeded with a CONNECTED ics connector and a FRESH snapshot
 *  (fetchedAt = NOW) so useConnectorSnapshot treats it as fresh and never
 *  calls the real fetchIcs — the widget renders straight from cache, no
 *  network. Mirrors CryptoWidget.test.tsx's own seededStorage. */
async function seededStorage(
  config: IcsConfig,
  data: IcsData | null,
  snapshotConfig: IcsConfig = config,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { ics: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      ics: {
        scope: await connectorSnapshotScope('ics', snapshotConfig, {
          timeZone: TIME_ZONE,
        }),
        fetchedAt: NOW,
        data,
      },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, stageVariant: WidgetVariant = 'standard') {
  return render(
    <StorageProvider storage={storage}>
      <CalendarWidget stageVariant={stageVariant} />
    </StorageProvider>,
  )
}

describe('CalendarWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("renders the next-line + up to 2 agenda rows (today's remaining events, excluding next and tomorrow)", async () => {
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

  it('progresses from next event to today to a fuller agenda by allocation variant', async () => {
    const events = [
      EVENT_NEXT,
      EVENT_B,
      EVENT_C,
      ev('Planning', new Date(2026, 7, 7, 17, 0).getTime(), new Date(2026, 7, 7, 17, 30).getTime()),
      ev('Wrap-up', new Date(2026, 7, 7, 18, 0).getTime(), new Date(2026, 7, 7, 18, 30).getTime()),
      ev('Dinner', new Date(2026, 7, 7, 19, 0).getTime(), new Date(2026, 7, 7, 19, 30).getTime()),
    ]
    const storage = await seededStorage(CONNECTED, { events })
    const view = mount(storage, 'compact')
    await act(async () => {})
    expect(document.querySelectorAll('section[aria-label="Calendar"] li')).toHaveLength(0)

    view.rerender(<StorageProvider storage={storage}><CalendarWidget stageVariant="standard" /></StorageProvider>)
    expect(document.querySelectorAll('section[aria-label="Calendar"] li')).toHaveLength(2)

    view.rerender(<StorageProvider storage={storage}><CalendarWidget stageVariant="expanded" /></StorageProvider>)
    expect([...document.querySelectorAll('section[aria-label="Calendar"] li')].map((row) => row.textContent)).toEqual([
      '14:00 Design review',
      '16:00 1:1 with Sam',
      '17:00 Planning',
      '18:00 Wrap-up',
      '19:00 Dinner',
    ])
  })

  it('an all-day event renders "All day · {summary}" and sorts before a same-day timed row, without ever becoming the headline', async () => {
    const storage = await seededStorage(CONNECTED, {
      events: [EVENT_ALL_DAY, EVENT_NEXT, EVENT_B, EVENT_C],
    })
    mount(storage)
    await act(async () => {})

    // The headline stays the next REAL appointment, not the all-day entry.
    expect(screen.getByText('Next: Standup · in 2 h')).toBeTruthy()
    const rows = [...document.querySelectorAll('section[aria-label="Calendar"] ul > li')].map((li) => li.textContent)
    // Capped at 2: the all-day row (earliest start of the day) plus the next
    // timed row after it — 1:1 with Sam is bumped off by the cap.
    expect(rows).toEqual(['All day · Company Holiday', '14:00 Design review'])
  })

  it('renders a timed local-midnight 24-hour event as timed, never as all-day', async () => {
    const midnight = ev(
      'Midnight maintenance',
      new Date(2026, 7, 8, 0, 0, 0).getTime(),
      new Date(2026, 7, 9, 0, 0, 0).getTime(),
    )
    const storage = await seededStorage(CONNECTED, { events: [midnight] })
    mount(storage)
    await act(async () => {})

    expect(screen.getByText(/Next: Midnight maintenance/).textContent).toContain('tomorrow 00:00')
    expect(screen.queryByText(/All day/)).toBeNull()
  })

  it('rejects a matching-scope snapshot that omits allDay instead of inferring a timed fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    )
    const malformed = {
      events: [{ summary: 'Legacy', start: NOW + 60_000, end: NOW + 120_000, cal: 0 }],
    }
    const storage = await seededStorage(CONNECTED, malformed as unknown as IcsData)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.querySelector('section[aria-label="Calendar"]')).toBeNull()
    expect(screen.queryByText(/Legacy/)).toBeNull()
    vi.unstubAllGlobals()
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
      {
        enabled: true,
        url: 'https://calendar.example.com/private-abc/basic.ics',
      },
      { events: [EVENT_NEXT] },
    )
    mount(storage)
    await act(async () => {})

    expect(screen.getByText('Next: Standup · in 2 h')).toBeTruthy()
  })

  it('upcoming view shows the next N events across days with day tokens', async () => {
    const storage = await seededStorage(
      { ...CONNECTED_TWO, view: 'upcoming', upcomingCount: 3 },
      { events: [EVENT_NEXT, EVENT_TOMORROW, EVENT_MON, EVENT_FAR] },
    )
    mount(storage)
    await act(async () => {})
    expect(screen.getByText('Next: Standup · in 2 h')).toBeTruthy()
    const rows = [...document.querySelectorAll('section[aria-label="Calendar"] ul > li')].map((li) => li.textContent)
    // Tomorrow (Sat) and Monday get weekday tokens; 11 days out gets a date token.
    expect(rows).toEqual(['Sat 09:00 KickoffPersonal', 'Mon 12:00 Family lunchFamily', 'Aug 18 15:30 DentistFamily'])
  })

  it('per-calendar view shows each calendar’s soonest not-already-shown event, in list order', async () => {
    const storage = await seededStorage(
      { ...CONNECTED_TWO, view: 'per-calendar' },
      { events: [EVENT_NEXT, EVENT_B, EVENT_MON, EVENT_FAR] }, // NEXT+B are cal 0; MON+FAR are cal 1
    )
    mount(storage)
    await act(async () => {})
    const rows = [...document.querySelectorAll('section[aria-label="Calendar"] ul > li')].map((li) => li.textContent)
    // Headline consumed EVENT_NEXT (cal 0), so cal 0's row is its SECOND event;
    // cal 1 contributes its first. List order (cal 0 then cal 1), not chronological.
    expect(rows).toEqual(['14:00 Design reviewPersonal', 'Mon 12:00 Family lunchFamily'])
  })

  it('with 2+ calendars every row and the headline carry that calendar’s dot; with 1 calendar no dots render', async () => {
    const storage = await seededStorage(
      { ...CONNECTED_TWO, view: 'upcoming', upcomingCount: 2 },
      { events: [EVENT_NEXT, EVENT_MON] },
    )
    const { unmount } = mount(storage)
    await act(async () => {})
    const section = document.querySelector('section[aria-label="Calendar"]')!
    // bg-accent = calendar 0 (headline's Standup), bg-sky-400 = calendar 1 (row).
    expect(section.querySelectorAll('.bg-accent').length).toBe(1)
    expect(section.querySelectorAll('.bg-sky-400').length).toBe(1)
    unmount()
    const single = await seededStorage(CONNECTED, {
      events: [EVENT_NEXT, EVENT_B],
    })
    mount(single)
    await act(async () => {})
    expect(document.querySelector('section[aria-label="Calendar"] .bg-accent')).toBeNull()
  })

  it('uses each calendar identity’s explicit color for event dots rather than its list position', async () => {
    const base = {
      ...CONNECTED_TWO,
      view: 'upcoming' as const,
      upcomingCount: 2,
    }
    const storage = await seededStorage({
      ...CONNECTED_TWO,
      calendars: [
        { name: 'Personal', url: 'https://calendar.example.com/a.ics', color: 'fuchsia' },
        { name: 'Family', url: 'https://calendar.example.com/b.ics', color: 'emerald' },
      ],
      view: 'upcoming',
      upcomingCount: 2,
    }, { events: [EVENT_NEXT, EVENT_MON] }, base)
    mount(storage)
    await act(async () => {})
    const section = document.querySelector('section[aria-label="Calendar"]')!
    expect(section.querySelectorAll('.bg-fuchsia-400')).toHaveLength(1)
    expect(section.querySelectorAll('.bg-emerald-400')).toHaveLength(1)
  })

  it('upcoming/per-calendar empty state says "No upcoming events."; today keeps its copy', async () => {
    const storage = await seededStorage({ ...CONNECTED_TWO, view: 'upcoming', upcomingCount: 3 }, { events: [] })
    mount(storage)
    await act(async () => {})
    expect(screen.getByText('No upcoming events.')).toBeTruthy()
  })

  // Final-review fix wave (Finding 2): the spec explicitly promises an event
  // on two calendars renders TWICE (no cross-calendar dedup). Both copies
  // share summary/start/end, so a key built from only those two fields
  // collides — React logs a duplicate-key warning and reconciliation between
  // the two rows is undefined. The fix folds `ev.cal` into the key.
  it('two events sharing summary/start/end on different calendars both render, with no React duplicate-key warning', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dupCal0 = ev('Standup', new Date(2026, 7, 8, 9, 0, 0).getTime(), new Date(2026, 7, 8, 9, 30, 0).getTime(), 0)
    const dupCal1 = ev('Standup', new Date(2026, 7, 8, 9, 0, 0).getTime(), new Date(2026, 7, 8, 9, 30, 0).getTime(), 1)
    const storage = await seededStorage(
      { ...CONNECTED_TWO, view: 'upcoming', upcomingCount: 2 },
      { events: [EVENT_NEXT, dupCal0, dupCal1] },
    )
    mount(storage)
    await act(async () => {})

    const rows = [...document.querySelectorAll('section[aria-label="Calendar"] ul > li')].map((li) => li.textContent)
    expect(rows).toEqual(['Sat 09:00 StandupPersonal', 'Sat 09:00 StandupFamily'])

    const keyWarning = consoleError.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && (a.includes('same key') || a.includes('unique "key"'))),
    )
    expect(keyWarning).toBe(false)
    consoleError.mockRestore()
  })

  it('visibly and programmatically distinguishes identical multi-calendar events and the Join action', async () => {
    const duplicateStart = NOW + 10 * 60_000
    const headline = ev('Opening sync', NOW + 5 * 60_000, NOW + 35 * 60_000, 0, MEET_URL)
    const personalDuplicate = ev('Duplicate review', duplicateStart, duplicateStart + 30 * 60_000, 0)
    const workDuplicate = ev('Duplicate review', duplicateStart, duplicateStart + 30 * 60_000, 1)
    const storage = await seededStorage(
      {
        enabled: true,
        view: 'upcoming',
        upcomingCount: 3,
        meetLinks: true,
        calendars: [
          { name: '  Personal  ', url: 'https://calendar.example.com/private-personal.ics' },
          { name: 'Work', url: 'https://calendar.example.com/private-work.ics' },
        ],
      },
      { events: [headline, personalDuplicate, workDuplicate] },
    )
    mount(storage)
    await act(async () => {})

    const section = document.querySelector('section[aria-label="Calendar"]')!
    const headlineRow = section.querySelector('p')!
    const rows = [...section.querySelectorAll('ul > li')]
    const programmaticText = (element: Element) => element.getAttribute('aria-label') ?? element.textContent ?? ''
    expect(programmaticText(headlineRow).split('Personal').length - 1).toBe(1)
    expect(rows.map(programmaticText)).toEqual([
      expect.stringContaining('Duplicate review'),
      expect.stringContaining('Duplicate review'),
    ])
    expect(programmaticText(rows[0]!).split('Personal').length - 1).toBe(1)
    expect(programmaticText(rows[0]!)).not.toContain('Work')
    expect(programmaticText(rows[1]!).split('Work').length - 1).toBe(1)
    expect(programmaticText(rows[1]!)).not.toContain('Personal')

    const visibleText = (element: Element) => {
      const clone = element.cloneNode(true) as Element
      clone.querySelectorAll('.sr-only').forEach((node) => node.remove())
      return clone.textContent?.replace(/\s+/g, ' ').trim()
    }
    expect(rows.map(visibleText)).toEqual(['09:10 Duplicate reviewPersonal', '09:10 Duplicate reviewWork'])
    const join = screen.getByRole('link', { name: 'Join Opening sync — Personal' })
    expect(join.textContent).toBe('Join')
    expect(join.className).toContain('min-h-9')
    expect(join.className).toContain('min-w-9')
  })

  it('visibly attributes neutral multi-calendar events in the next-event and agenda rows', async () => {
    const releasePlanning = ev('Release planning', NOW + 5 * 60_000, NOW + 35 * 60_000, 0)
    const quarterlyCheckpoint = ev('Quarterly checkpoint', NOW + 65 * 60_000, NOW + 95 * 60_000, 1)
    const storage = await seededStorage(
      {
        enabled: true,
        view: 'upcoming',
        upcomingCount: 2,
        calendars: [
          { name: 'Studio', url: 'https://calendar.example.com/studio.ics' },
          { name: 'Family', url: 'https://calendar.example.com/family.ics' },
        ],
      },
      { events: [releasePlanning, quarterlyCheckpoint] },
    )
    mount(storage)
    await act(async () => {})

    const section = document.querySelector('section[aria-label="Calendar"]')!
    const next = section.querySelector('p')!
    const rows = [...section.querySelectorAll('ul > li')]
    expect(next.textContent).toContain('Studio')
    expect(rows[0]?.textContent).toContain('Family')
    expect(section.querySelectorAll('[data-calendar-source]')).toHaveLength(2)
  })

  it('keeps single-calendar semantics quiet while preserving the visible Join label', async () => {
    const soon = ev('Standup', NOW + 10 * 60_000, NOW + 40 * 60_000, 0, MEET_URL)
    const storage = await seededStorage(CONNECTED, { events: [soon] })
    mount(storage)
    await act(async () => {})

    expect(screen.getByRole('link', { name: 'Join' })).toBeTruthy()
    expect(document.querySelector('section[aria-label="Calendar"]')?.textContent).not.toContain('Personal')
  })

  it('derives source names only from trimmed configured names or safe index fallbacks, never capability URLs', () => {
    const calendars = [
      { name: '  Personal  ', url: 'https://calendar.example.com/private-personal.ics' },
      { name: '   ', url: 'https://calendar.example.com/private-work.ics' },
    ]
    expect(calendarSourceName(0, calendars)).toBe('Personal')
    expect(calendarSourceName(1, calendars)).toBe('Calendar 2')
    expect(calendarSourceName(4, calendars)).toBe('Calendar 5')
    expect(calendarSourceName(-1, calendars)).toBe('Calendar')
    expect(calendarSourceName(1.5, calendars)).toBe('Calendar')
    expect(calendarSourceName(Number.NaN, calendars)).toBe('Calendar')
    expect(calendarSourceName('1', calendars)).toBe('Calendar')
    expect(calendarSourceName(undefined, calendars)).toBe('Calendar')
    for (const value of [0, 1, 4, -1, 1.5, Number.NaN, '1', undefined]) {
      expect(calendarSourceName(value, calendars)).not.toContain('https://')
    }
  })

  // Final-review fix wave (Finding 5): dayToken's own 6-vs-7-day fencepost —
  // pure test addition, dayToken's logic is unchanged. NOW is Fri 2026-08-07;
  // +6 days is Thu 2026-08-13 (still a weekday token), +7 days is Fri
  // 2026-08-14 (crosses into the date-token branch).
  it('day token fencepost: exactly 6 days out uses the weekday token, exactly 7 days out uses the date token', async () => {
    const sixDaysOut = ev(
      'Six out',
      new Date(2026, 7, 13, 10, 0, 0).getTime(),
      new Date(2026, 7, 13, 10, 30, 0).getTime(),
    )
    const sevenDaysOut = ev(
      'Seven out',
      new Date(2026, 7, 14, 10, 0, 0).getTime(),
      new Date(2026, 7, 14, 10, 30, 0).getTime(),
    )
    const storage = await seededStorage(
      { ...CONNECTED, view: 'upcoming', upcomingCount: 3 },
      { events: [EVENT_NEXT, sixDaysOut, sevenDaysOut] },
    )
    mount(storage)
    await act(async () => {})

    const rows = [...document.querySelectorAll('section[aria-label="Calendar"] ul > li')].map((li) => li.textContent)
    expect(rows).toEqual(['Thu 10:00 Six out', 'Aug 14 10:00 Seven out'])
  })

  it('a multi-day all-day event already in progress renders with the today idiom, not a past date token', async () => {
    const started = ev(
      'Vacation',
      new Date(2026, 7, 6, 0, 0, 0).getTime(),
      new Date(2026, 7, 9, 0, 0, 0).getTime(),
      0,
      undefined,
      true,
    ) // Thu–Sun, spans NOW
    const storage = await seededStorage(
      { ...CONNECTED_TWO, view: 'upcoming', upcomingCount: 2 },
      { events: [started, EVENT_NEXT] },
    )
    mount(storage)
    await act(async () => {})
    const rows = [...document.querySelectorAll('section[aria-label="Calendar"] ul > li')].map((li) => li.textContent)
    expect(rows).toEqual(['All day · VacationPersonal'])
  })

  // Task 89 — the Join link. Visibility rule (the plan's own words): meetLinks
  // ON && HEADLINE event has meetUrl && (start - now <= 15min && now < end).
  // Never on agenda rows.
  describe('the Join link (Task 89)', () => {
    it('shows on the headline when its meeting starts within 15 minutes — and CONNECTED carries no meetLinks key, proving absent-flag defaults to ON', async () => {
      const soon = ev('Standup', NOW + 10 * 60_000, NOW + 40 * 60_000, 0, MEET_URL) // 10 min out
      const storage = await seededStorage(CONNECTED, { events: [soon] })
      mount(storage)
      await act(async () => {})

      const link = screen.getByRole('link', {
        name: 'Join',
      }) as HTMLAnchorElement
      expect(link.getAttribute('href')).toBe(MEET_URL)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    })

    it('is absent when the headline is more than 15 minutes out; an already-ended event with a meetUrl never becomes headline (and so never leaks a Join) either', async () => {
      const ended = ev('Old standup', NOW - 60 * 60_000, NOW - 30 * 60_000, 0, MEET_URL) // ended 30 min ago
      const farOut = ev('Design review', NOW + 30 * 60_000, NOW + 60 * 60_000, 0, MEET_URL) // 30 min out
      const storage = await seededStorage(CONNECTED, {
        events: [ended, farOut],
      })
      mount(storage)
      await act(async () => {})

      expect(screen.getByText(/Next: Design review/)).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Join' })).toBeNull()
    })

    it('shows for a currently-running meeting (started before now, ends after now)', async () => {
      const running = ev(
        'Standup',
        new Date(2026, 7, 7, 8, 50, 0).getTime(),
        new Date(2026, 7, 7, 9, 30, 0).getTime(),
        0,
        MEET_URL,
      )
      const storage = await seededStorage(CONNECTED, { events: [running] })
      mount(storage)
      await act(async () => {})

      expect(screen.getByRole('link', { name: 'Join' })).toBeTruthy()
    })

    it('never renders on an agenda row, even when that row event carries a meetUrl and would itself qualify time-wise', async () => {
      const headline = ev('Standup', NOW + 2 * 60_000, NOW + 20 * 60_000) // 2 min out, no meetUrl — claims the headline slot
      const row = ev('Design review', NOW + 10 * 60_000, NOW + 40 * 60_000, 0, MEET_URL) // 10 min out — inside the 15-min window, but this is a ROW
      const storage = await seededStorage(CONNECTED, {
        events: [headline, row],
      })
      mount(storage)
      await act(async () => {})

      expect(screen.getByText(/Design review/)).toBeTruthy() // the row itself renders
      expect(screen.queryByRole('link', { name: 'Join' })).toBeNull()
      expect(document.querySelector('section[aria-label="Calendar"] ul a')).toBeNull()
    })

    it('meetLinks: false suppresses the Join link even when the headline is imminent and has a meetUrl', async () => {
      const soon = ev('Standup', NOW + 5 * 60_000, NOW + 35 * 60_000, 0, MEET_URL)
      const storage = await seededStorage({ ...CONNECTED, meetLinks: false }, { events: [soon] })
      mount(storage)
      await act(async () => {})

      expect(screen.getByText(/Next: Standup/)).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Join' })).toBeNull()
    })

    it('never shows on an all-day headline — a multi-day all-day block spanning NOW with a meetUrl and no timed events left is not a meeting you "join"', async () => {
      // Thu-Sun, spans NOW (start deeply in the past → start-now is always
      // <=15min; end is days out → now<end holds too) — the same shape that
      // made the pre-fix guard, which never excluded isAllDay, keep Join lit
      // for the block's entire multi-day span. No timed events remain, so
      // selectAgenda's own fallback (see its doc comment) makes this all-day
      // event the headline itself.
      const offsite = ev(
        'Company Offsite',
        new Date(2026, 7, 6, 0, 0, 0).getTime(), // Thu, local midnight
        new Date(2026, 7, 9, 0, 0, 0).getTime(), // Sun, local midnight — spans NOW
        0,
        MEET_URL,
        true,
      )
      const storage = await seededStorage(CONNECTED, { events: [offsite] })
      mount(storage)
      await act(async () => {})

      expect(screen.getByText('Next: Company Offsite · All day')).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Join' })).toBeNull()
    })
  })
})

describe('Calendar timezone day boundaries', () => {
  it.each([
    ['America/New_York', '2026-03-05T17:00:00Z', '2026-03-11T16:00:00Z', 'Wed', '2026-03-12T16:00:00Z', 'Mar 12'],
    ['America/New_York', '2026-10-29T16:00:00Z', '2026-11-04T17:00:00Z', 'Wed', '2026-11-05T17:00:00Z', 'Nov 5'],
    ['Europe/Berlin', '2026-03-26T11:00:00Z', '2026-04-01T10:00:00Z', 'Wed', '2026-04-02T10:00:00Z', 'Apr 2'],
    ['Europe/Berlin', '2026-10-22T10:00:00Z', '2026-10-28T11:00:00Z', 'Wed', '2026-10-29T11:00:00Z', 'Oct 29'],
  ])('keeps the 6/7-day token fence exact in %s', (timeZone, now, six, sixToken, seven, sevenToken) => {
    expect(calendarDayToken(Date.parse(six), Date.parse(now), timeZone)).toBe(sixToken)
    expect(calendarDayToken(Date.parse(seven), Date.parse(now), timeZone)).toBe(sevenToken)
  })

  it.each([
    ['America/New_York', '2026-03-08T06:00:00Z', '2026-03-09T04:00:00Z'],
    ['America/New_York', '2026-11-01T06:00:00Z', '2026-11-02T05:00:00Z'],
    ['Europe/Berlin', '2026-03-29T01:30:00Z', '2026-03-29T22:00:00Z'],
    ['Europe/Berlin', '2026-10-25T01:30:00Z', '2026-10-25T23:00:00Z'],
  ])('includes the instant before and excludes the exact local-day end in %s', (timeZone, now, end) => {
    expect(eventStartsBeforeLocalDayEnd(Date.parse(end) - 1, Date.parse(now), timeZone)).toBe(true)
    expect(eventStartsBeforeLocalDayEnd(Date.parse(end), Date.parse(now), timeZone)).toBe(false)
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
