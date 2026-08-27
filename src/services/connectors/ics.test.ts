// src/services/connectors/ics.test.ts — parseIcs (a PURE parser + bounded
// RRULE expander) and fetchIcs (the .text()/8s-abort fetch boundary) and the
// registry descriptor. Fixtures are realistic exported Google Calendar /
// Outlook snippets (VCALENDAR wrapper, PRODID, METHOD, VTIMEZONE blocks, X-
// props), anonymized. No test touches a real network (injectable fetchFn).
//
// The DST assertions are EXACT epochs, not just wall-clock relationships: a
// weekly 09:00 America/New_York event across the 2026-03-08 spring-forward
// keeps 09:00 WALL time, so its epoch shifts by the offset delta (EST -5 ->
// EDT -4) — the delta between consecutive weekly occurrences is one hour
// SHORTER than a bare 7-day span. Both absolute epochs are pinned below.
import { describe, expect, it, vi } from 'vitest'
import {
  parseIcs,
  fetchIcs,
  isIcsData,
  extractMeetUrl,
  icsDescriptor,
  icsCalendarsOf,
  icsViewOf,
  MAX_CALENDARS,
  type IcsData,
} from './ics'

/** Wraps a VEVENT (or several) in a realistic VCALENDAR envelope. */
function cal(body: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test Corp//Aurora Fixtures//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    body,
    'END:VCALENDAR',
  ].join('\r\n')
}

/** One VEVENT from an array of property lines. */
function vevent(lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')
}

const DAY = 86_400_000
const TEST_ZONE = 'America/New_York'

describe('W1-P7 explicit all-day and runtime-timezone semantics', () => {
  it.each([
    ['America/New_York', '20260308', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z'],
    ['America/New_York', '20261101', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z'],
    ['Europe/Berlin', '20260329', '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z'],
    ['Europe/Berlin', '20261025', '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z'],
    ['America/Havana', '20260308', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z'],
    ['America/Santiago', '20260906', '2026-09-06T04:00:00.000Z', '2026-09-07T03:00:00.000Z'],
    ['Atlantic/Azores', '20260329', '2026-03-29T01:00:00.000Z', '2026-03-30T00:00:00.000Z'],
  ])('constructs the next calendar midnight for %s on %s', (timeZone, date, startIso, endIso) => {
    const [event] = parseIcs(
      cal(vevent(['SUMMARY:All day', `DTSTART;VALUE=DATE:${date}`])),
      Date.parse(startIso) - DAY,
      4,
      timeZone,
    )
    expect(event).toMatchObject({ allDay: true })
    expect(new Date(event!.start).toISOString()).toBe(startIso)
    expect(new Date(event!.end).toISOString()).toBe(endIso)
  })

  it('preserves an exclusive multi-day DATE span for every recurrence across DST', () => {
    const events = parseIcs(
      cal(
        vevent([
          'SUMMARY:Retreat',
          'DTSTART;VALUE=DATE:20260307',
          'DTEND;VALUE=DATE:20260310',
          'RRULE:FREQ=DAILY;COUNT=2',
        ]),
      ),
      Date.parse('2026-03-06T00:00:00Z'),
      10,
      'America/New_York',
    )
    expect(
      events.map((event) => ({
        allDay: event.allDay,
        start: new Date(event.start).toISOString(),
        end: new Date(event.end).toISOString(),
      })),
    ).toEqual([
      {
        allDay: true,
        start: '2026-03-07T05:00:00.000Z',
        end: '2026-03-10T04:00:00.000Z',
      },
      {
        allDay: true,
        start: '2026-03-08T05:00:00.000Z',
        end: '2026-03-11T04:00:00.000Z',
      },
    ])
  })

  it.each(['PT23H', 'P1D', 'PT25H'])('keeps a timed midnight %s event explicitly timed', (duration) => {
    const [event] = parseIcs(
      cal(vevent(['SUMMARY:Timed midnight', 'DTSTART:20260308T000000', `DURATION:${duration}`])),
      Date.parse('2026-03-07T00:00:00Z'),
      4,
      'America/New_York',
    )
    expect(event?.allDay).toBe(false)
  })

  it('interprets floating wall time in the required runtime zone but leaves TZID independent', () => {
    const floating = cal(vevent(['SUMMARY:Floating', 'DTSTART:20260308T090000', 'DURATION:PT1H']))
    const nyFloating = parseIcs(floating, Date.parse('2026-03-07T00:00:00Z'), 4, 'America/New_York')[0]!
    const berlinFloating = parseIcs(floating, Date.parse('2026-03-07T00:00:00Z'), 4, 'Europe/Berlin')[0]!
    expect(new Date(nyFloating.start).toISOString()).toBe('2026-03-08T13:00:00.000Z')
    expect(new Date(berlinFloating.start).toISOString()).toBe('2026-03-08T08:00:00.000Z')

    const zoned = cal(vevent(['SUMMARY:Zoned', 'DTSTART;TZID=America/New_York:20260308T090000', 'DURATION:PT1H']))
    const ny = parseIcs(zoned, Date.parse('2026-03-07T00:00:00Z'), 4, 'America/New_York')[0]!
    const berlin = parseIcs(zoned, Date.parse('2026-03-07T00:00:00Z'), 4, 'Europe/Berlin')[0]!
    expect(ny.start).toBe(berlin.start)
  })
})

describe('isIcsData', () => {
  const event = { summary: 'Standup', start: 1, end: 2, cal: 0, allDay: false }

  it('accepts only the explicit current event shape', () => {
    expect(
      isIcsData({
        events: [event, { ...event, allDay: true, meetUrl: 'https://meet.google.com/a' }],
      }),
    ).toBe(true)
  })

  it.each([
    null,
    {},
    { events: 'nope' },
    { events: [{ ...event, allDay: undefined }] },
    { events: [{ ...event, allDay: 'false' }] },
    { events: [{ ...event, start: Number.NaN }] },
    { events: [{ ...event, end: Number.POSITIVE_INFINITY }] },
    { events: [{ ...event, cal: 0.5 }] },
    { events: [{ ...event, meetUrl: 42 }] },
  ])('rejects malformed payload %#', (value) => {
    expect(isIcsData(value)).toBe(false)
  })
})

// A wide window covering all of June 2026 (most fixtures live here).
const JUNE_START = Date.UTC(2026, 5, 1, 0, 0, 0)
const JUNE_DAYS = 60

describe('parseIcs — line unfolding & basic parsing', () => {
  it('reassembles a folded long SUMMARY (CRLF + leading space) into one string', () => {
    const text = cal(
      vevent([
        'UID:1@test',
        'DTSTART:20260610T120000Z',
        'DTEND:20260610T130000Z',
        'SUMMARY:This is a very long event title that the exporter folded across',
        '  multiple physical lines because it exceeded seventy-five octets in one',
        '  line of iCalendar text',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events).toHaveLength(1)
    expect(events[0]!.summary).toBe(
      'This is a very long event title that the exporter folded across multiple physical lines because it exceeded seventy-five octets in one line of iCalendar text',
    )
  })

  it('also unfolds a continuation marked by a leading TAB (not just a space)', () => {
    const text = cal(
      vevent(['UID:2@test', 'DTSTART:20260610T120000Z', 'DTEND:20260610T130000Z', 'SUMMARY:Split by', '\ta tab char']),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events[0]!.summary).toBe('Split bya tab char')
  })

  it('decodes text escapes \\n \\, \\; and \\\\ in SUMMARY', () => {
    const text = cal(
      vevent([
        'UID:3@test',
        'DTSTART:20260610T120000Z',
        'DTEND:20260610T130000Z',
        'SUMMARY:Line one\\nafter newline\\, comma\\; semicolon\\\\ backslash',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events[0]!.summary).toBe('Line one\nafter newline, comma; semicolon\\ backslash')
  })

  it('gives an untitled event an empty summary rather than dropping it', () => {
    const text = cal(vevent(['UID:4@test', 'DTSTART:20260610T120000Z', 'DTEND:20260610T130000Z']))
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events).toHaveLength(1)
    expect(events[0]!.summary).toBe('')
  })
})

describe('parseIcs — date/time forms', () => {
  it('parses a UTC (Z) DTSTART/DTEND to the exact epoch instant', () => {
    const text = cal(vevent(['UID:u1@test', 'SUMMARY:UTC event', 'DTSTART:20260610T120000Z', 'DTEND:20260610T133000Z']))
    const [event] = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(event!.start).toBe(Date.UTC(2026, 5, 10, 12, 0, 0))
    expect(event!.end).toBe(Date.UTC(2026, 5, 10, 13, 30, 0))
  })

  it('all-day VALUE=DATE with no DTEND renders a full-day (local midnight -> midnight) span', () => {
    const text = cal(vevent(['UID:a1@test', 'SUMMARY:All day', 'DTSTART;VALUE=DATE:20260610']))
    const [event] = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    // Floating local midnight — computed the same way the impl does, so the
    // assertion holds regardless of the machine's timezone.
    const expectedStart = new Date(2026, 5, 10, 0, 0, 0).getTime()
    expect(event!.start).toBe(expectedStart)
    expect(event!.end - event!.start).toBe(DAY)
  })

  it('floating (no Z, no TZID) DTSTART is interpreted in local time', () => {
    const text = cal(vevent(['UID:f1@test', 'SUMMARY:Floating', 'DTSTART:20260610T090000', 'DTEND:20260610T100000']))
    const [event] = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(event!.start).toBe(new Date(2026, 5, 10, 9, 0, 0).getTime())
    expect(event!.end).toBe(new Date(2026, 5, 10, 10, 0, 0).getTime())
  })

  it('DURATION fills in the end when DTEND is absent (PT1H30M)', () => {
    const text = cal(vevent(['UID:d1@test', 'SUMMARY:With duration', 'DTSTART:20260610T120000Z', 'DURATION:PT1H30M']))
    const [event] = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(event!.start).toBe(Date.UTC(2026, 5, 10, 12, 0, 0))
    expect(event!.end).toBe(Date.UTC(2026, 5, 10, 13, 30, 0))
  })

  it('DURATION supports day+time components (P1DT2H)', () => {
    const text = cal(
      vevent(['UID:d2@test', 'SUMMARY:Multiday duration', 'DTSTART:20260610T120000Z', 'DURATION:P1DT2H']),
    )
    const [event] = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(event!.end - event!.start).toBe(DAY + 2 * 3_600_000)
  })
})

describe('parseIcs — RRULE DAILY', () => {
  it('COUNT=5 yields exactly 5 occurrences, one day apart', () => {
    const text = cal(
      vevent([
        'UID:daily1@test',
        'SUMMARY:Daily standup',
        'DTSTART:20260601T140000Z',
        'DTEND:20260601T141500Z',
        'RRULE:FREQ=DAILY;COUNT=5',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events).toHaveLength(5)
    expect(events.map((e) => e.start)).toEqual([
      Date.UTC(2026, 5, 1, 14, 0, 0),
      Date.UTC(2026, 5, 2, 14, 0, 0),
      Date.UTC(2026, 5, 3, 14, 0, 0),
      Date.UTC(2026, 5, 4, 14, 0, 0),
      Date.UTC(2026, 5, 5, 14, 0, 0),
    ])
  })

  it('UNTIL in UTC that lands mid-window stops expansion exactly (inclusive)', () => {
    const text = cal(
      vevent([
        'UID:daily2@test',
        'SUMMARY:Daily until',
        'DTSTART:20260601T120000Z',
        'DTEND:20260601T123000Z',
        'RRULE:FREQ=DAILY;UNTIL=20260604T120000Z',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    // Jun 1,2,3,4 — the Jun-4 instant equals UNTIL exactly and is INCLUDED.
    expect(events.map((e) => e.start)).toEqual([
      Date.UTC(2026, 5, 1, 12, 0, 0),
      Date.UTC(2026, 5, 2, 12, 0, 0),
      Date.UTC(2026, 5, 3, 12, 0, 0),
      Date.UTC(2026, 5, 4, 12, 0, 0),
    ])
  })

  it('INTERVAL=3 daily skips two days between occurrences', () => {
    const text = cal(
      vevent([
        'UID:daily3@test',
        'SUMMARY:Every third day',
        'DTSTART:20260601T120000Z',
        'DTEND:20260601T130000Z',
        'RRULE:FREQ=DAILY;INTERVAL=3;COUNT=3',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([
      Date.UTC(2026, 5, 1, 12, 0, 0),
      Date.UTC(2026, 5, 4, 12, 0, 0),
      Date.UTC(2026, 5, 7, 12, 0, 0),
    ])
  })

  // Final-review fix wave, Fix 3b — a malformed COUNT (e.g. a stray trailing
  // character) used to coerce to NaN, which is not `null`, so it silently
  // defeated BOTH of the expander's stop conditions at once: the
  // COUNT-reached check (`counted >= rr.count`, always false against NaN)
  // AND the COUNT-less window check (`rr.count === null`, also false, since
  // NaN !== null) — bounded only by MAX_ITERATIONS, not the window. The fix
  // (parseRRule's own Number.isFinite coercion) folds a NaN COUNT to `null`,
  // the same value the field already carries when it's absent entirely, so
  // this asserts the malformed and genuinely-absent cases produce the
  // IDENTICAL window-bounded result — not just "eventually terminates".
  it('a malformed COUNT (e.g. COUNT=3x) is treated as no-COUNT — window-bounded expansion matching the genuinely COUNT-less rule exactly', () => {
    const malformed = cal(
      vevent([
        'UID:daily4@test',
        'SUMMARY:Malformed count',
        'DTSTART:20260601T120000Z',
        'DTEND:20260601T130000Z',
        'RRULE:FREQ=DAILY;COUNT=3x',
      ]),
    )
    const noCount = cal(
      vevent([
        'UID:daily4@test',
        'SUMMARY:Malformed count',
        'DTSTART:20260601T120000Z',
        'DTEND:20260601T130000Z',
        'RRULE:FREQ=DAILY',
      ]),
    )
    const malformedEvents = parseIcs(malformed, JUNE_START, 5, TEST_ZONE)
    const noCountEvents = parseIcs(noCount, JUNE_START, 5, TEST_ZONE)
    expect(malformedEvents.map((e) => e.start)).toEqual(noCountEvents.map((e) => e.start))
    expect(malformedEvents.map((e) => e.start)).toEqual([
      Date.UTC(2026, 5, 1, 12, 0, 0),
      Date.UTC(2026, 5, 2, 12, 0, 0),
      Date.UTC(2026, 5, 3, 12, 0, 0),
      Date.UTC(2026, 5, 4, 12, 0, 0),
      Date.UTC(2026, 5, 5, 12, 0, 0),
    ])
  })
})

describe('parseIcs — RRULE WEEKLY', () => {
  it('INTERVAL=2 weekly skips alternate weeks (14 days apart)', () => {
    const text = cal(
      vevent([
        'UID:wk1@test',
        'SUMMARY:Biweekly',
        'DTSTART:20260601T120000Z',
        'DTEND:20260601T130000Z',
        'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([
      Date.UTC(2026, 5, 1, 12, 0, 0),
      Date.UTC(2026, 5, 15, 12, 0, 0),
      Date.UTC(2026, 5, 29, 12, 0, 0),
    ])
  })

  it('BYDAY=MO,WE,FR expands multiple weekdays per week in chronological order', () => {
    // 2026-06-01 is a Monday. Week 0: Mon 1, Wed 3, Fri 5. Week 1: Mon 8...
    const text = cal(
      vevent([
        'UID:wk2@test',
        'SUMMARY:MWF class',
        'DTSTART:20260601T120000Z',
        'DTEND:20260601T130000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=4',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([
      Date.UTC(2026, 5, 1, 12, 0, 0),
      Date.UTC(2026, 5, 3, 12, 0, 0),
      Date.UTC(2026, 5, 5, 12, 0, 0),
      Date.UTC(2026, 5, 8, 12, 0, 0),
    ])
  })

  it('BYDAY does not emit weekdays earlier in the first week than DTSTART', () => {
    // DTSTART is Wed Jun 3; BYDAY MO,WE,FR — the Mon Jun 1 of that same week
    // precedes DTSTART and must NOT appear. First occurrence is DTSTART itself.
    const text = cal(
      vevent([
        'UID:wk3@test',
        'SUMMARY:Starts midweek',
        'DTSTART:20260603T120000Z',
        'DTEND:20260603T130000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=3',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([
      Date.UTC(2026, 5, 3, 12, 0, 0), // Wed
      Date.UTC(2026, 5, 5, 12, 0, 0), // Fri
      Date.UTC(2026, 5, 8, 12, 0, 0), // next Mon
    ])
  })
})

describe('parseIcs — RRULE MONTHLY', () => {
  it('repeats on the day-of-month of DTSTART', () => {
    const text = cal(
      vevent([
        'UID:mo1@test',
        'SUMMARY:Monthly review',
        'DTSTART:20260610T150000Z',
        'DTEND:20260610T160000Z',
        'RRULE:FREQ=MONTHLY;COUNT=3',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS + 30, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([
      Date.UTC(2026, 5, 10, 15, 0, 0),
      Date.UTC(2026, 6, 10, 15, 0, 0),
      Date.UTC(2026, 7, 10, 15, 0, 0),
    ])
  })

  it('a single simple BYMONTHDAY drives the day of month', () => {
    const text = cal(
      vevent([
        'UID:mo2@test',
        'SUMMARY:15th of the month',
        'DTSTART:20260615T090000Z',
        'DTEND:20260615T093000Z',
        'RRULE:FREQ=MONTHLY;BYMONTHDAY=15;COUNT=2',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS + 30, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([Date.UTC(2026, 5, 15, 9, 0, 0), Date.UTC(2026, 6, 15, 9, 0, 0)])
  })

  it('skips months where the day-of-month does not exist (Jan 31 -> no Feb 31)', () => {
    const text = cal(
      vevent([
        'UID:mo3@test',
        'SUMMARY:End of month',
        'DTSTART:20260131T120000Z',
        'DTEND:20260131T130000Z',
        'RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=2',
      ]),
    )
    // Window spanning Jan..Apr 2026. Feb has no 31st (skipped), Mar does.
    const events = parseIcs(text, Date.UTC(2026, 0, 1), 120, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([Date.UTC(2026, 0, 31, 12, 0, 0), Date.UTC(2026, 2, 31, 12, 0, 0)])
  })
})

describe('parseIcs — EXDATE', () => {
  it('removes exactly the excluded occurrence, matched on its start instant', () => {
    const text = cal(
      vevent([
        'UID:ex1@test',
        'SUMMARY:Daily with a skip',
        'DTSTART:20260601T120000Z',
        'DTEND:20260601T123000Z',
        'RRULE:FREQ=DAILY;COUNT=3',
        'EXDATE:20260602T120000Z',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([Date.UTC(2026, 5, 1, 12, 0, 0), Date.UTC(2026, 5, 3, 12, 0, 0)])
  })

  it('honors multiple EXDATE properties AND comma-separated lists', () => {
    const text = cal(
      vevent([
        'UID:ex2@test',
        'SUMMARY:Daily with several skips',
        'DTSTART:20260601T120000Z',
        'DTEND:20260601T123000Z',
        'RRULE:FREQ=DAILY;COUNT=5',
        'EXDATE:20260602T120000Z,20260603T120000Z',
        'EXDATE:20260605T120000Z',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([Date.UTC(2026, 5, 1, 12, 0, 0), Date.UTC(2026, 5, 4, 12, 0, 0)])
  })

  it('an EXDATE still consumes a COUNT slot (COUNT counts the full set, then excludes)', () => {
    // COUNT=3 over Jun 1,2,3; EXDATE removes Jun 2 -> 2 rendered, NOT 3.
    const text = cal(
      vevent([
        'UID:ex3@test',
        'SUMMARY:Count vs exdate',
        'DTSTART:20260601T120000Z',
        'DTEND:20260601T123000Z',
        'RRULE:FREQ=DAILY;COUNT=3',
        'EXDATE:20260602T120000Z',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events).toHaveLength(2)
  })
})

describe('parseIcs — DST / TZID (the mandatory spring-forward case)', () => {
  it('weekly 09:00 America/New_York across 2026-03-08 spring-forward keeps 09:00 WALL time; epoch shifts by the offset delta', () => {
    const text = cal(
      vevent([
        'UID:dst1@test',
        'SUMMARY:Weekly NY standup',
        'DTSTART;TZID=America/New_York:20260304T090000',
        'DTEND;TZID=America/New_York:20260304T093000',
        'RRULE:FREQ=WEEKLY;COUNT=2',
      ]),
    )
    const events = parseIcs(text, Date.UTC(2026, 2, 1), 30, TEST_ZONE)
    expect(events).toHaveLength(2)
    // Mar 4 is EST (UTC-5): 09:00 wall == 14:00Z. Mar 11 is EDT (UTC-4):
    // 09:00 wall == 13:00Z. Wall time held at 09:00 across the transition.
    expect(events[0]!.start).toBe(Date.UTC(2026, 2, 4, 14, 0, 0))
    expect(events[1]!.start).toBe(Date.UTC(2026, 2, 11, 13, 0, 0))
    // The consecutive-occurrence delta is a full week MINUS one hour, because
    // the offset moved -5 -> -4 while the wall clock stayed at 09:00.
    expect(events[1]!.start - events[0]!.start).toBe(7 * DAY - 3_600_000)
  })

  it('converts a single TZID event to the right instant (America/Los_Angeles)', () => {
    // 2026-06-10 is PDT (UTC-7): 12:00 wall == 19:00Z.
    const text = cal(
      vevent([
        'UID:tz2@test',
        'SUMMARY:LA lunch',
        'DTSTART;TZID=America/Los_Angeles:20260610T120000',
        'DTEND;TZID=America/Los_Angeles:20260610T130000',
      ]),
    )
    const [event] = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(event!.start).toBe(Date.UTC(2026, 5, 10, 19, 0, 0))
    expect(event!.end).toBe(Date.UTC(2026, 5, 10, 20, 0, 0))
  })
})

describe('parseIcs — bounded promise: unsupported parts render the base occurrence only', () => {
  it('FREQ=YEARLY renders only the base occurrence', () => {
    const text = cal(
      vevent([
        'UID:un1@test',
        'SUMMARY:Anniversary',
        'DTSTART:20260610T120000Z',
        'DTEND:20260610T130000Z',
        'RRULE:FREQ=YEARLY;COUNT=5',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([Date.UTC(2026, 5, 10, 12, 0, 0)])
  })

  it('an ordinal BYDAY (2MO) in a MONTHLY rule falls back to the base occurrence', () => {
    const text = cal(
      vevent([
        'UID:un2@test',
        'SUMMARY:Second Monday',
        'DTSTART:20260608T120000Z',
        'DTEND:20260608T130000Z',
        'RRULE:FREQ=MONTHLY;BYDAY=2MO;COUNT=4',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS + 60, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([Date.UTC(2026, 5, 8, 12, 0, 0)])
  })

  it('BYSETPOS falls back to the base occurrence', () => {
    const text = cal(
      vevent([
        'UID:un3@test',
        'SUMMARY:Last weekday',
        'DTSTART:20260630T120000Z',
        'DTEND:20260630T130000Z',
        'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=6',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS + 60, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([Date.UTC(2026, 5, 30, 12, 0, 0)])
  })

  it('an unknown TZID is treated as floating local AND renders base occurrence only for an RRULE', () => {
    const text = cal(
      vevent([
        'UID:un4@test',
        'SUMMARY:Bogus zone weekly',
        'DTSTART;TZID=Mars/Olympus_Mons:20260610T090000',
        'DTEND;TZID=Mars/Olympus_Mons:20260610T100000',
        'RRULE:FREQ=WEEKLY;COUNT=4',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    // Floating local fallback for the base instant; no expansion.
    expect(events).toHaveLength(1)
    expect(events[0]!.start).toBe(new Date(2026, 5, 10, 9, 0, 0).getTime())
  })
})

describe('parseIcs — window bounds', () => {
  it('excludes occurrences before windowStart and after windowStart+windowDays', () => {
    const text = cal(
      vevent([
        'UID:win1@test',
        'SUMMARY:Long daily run',
        'DTSTART:20260501T120000Z',
        'DTEND:20260501T130000Z',
        'RRULE:FREQ=DAILY;COUNT=90',
      ]),
    )
    // Window: Jun 10 (00:00Z) for 5 days -> occurrences Jun 10..14 only.
    const windowStart = Date.UTC(2026, 5, 10, 0, 0, 0)
    const events = parseIcs(text, windowStart, 5, TEST_ZONE)
    expect(events.map((e) => e.start)).toEqual([
      Date.UTC(2026, 5, 10, 12, 0, 0),
      Date.UTC(2026, 5, 11, 12, 0, 0),
      Date.UTC(2026, 5, 12, 12, 0, 0),
      Date.UTC(2026, 5, 13, 12, 0, 0),
      Date.UTC(2026, 5, 14, 12, 0, 0),
    ])
  })

  it('includes an event that STARTED before windowStart but ENDS inside the window ([start,end) intersects)', () => {
    const text = cal(
      vevent(['UID:win2@test', 'SUMMARY:Straddles the boundary', 'DTSTART:20260601T080000Z', 'DTEND:20260601T110000Z']),
    )
    // Window opens at 09:00Z — after the 08:00 start but before the 11:00 end.
    const windowStart = Date.UTC(2026, 5, 1, 9, 0, 0)
    const events = parseIcs(text, windowStart, 30, TEST_ZONE)
    expect(events).toHaveLength(1)
    expect(events[0]!.start).toBe(Date.UTC(2026, 5, 1, 8, 0, 0))
  })

  it('excludes an event that ended before windowStart', () => {
    const text = cal(
      vevent(['UID:win3@test', 'SUMMARY:Fully in the past', 'DTSTART:20260601T080000Z', 'DTEND:20260601T083000Z']),
    )
    const windowStart = Date.UTC(2026, 5, 1, 9, 0, 0)
    expect(parseIcs(text, windowStart, 30, TEST_ZONE)).toHaveLength(0)
  })

  it('excludes an event that starts at/after windowStart+windowDays', () => {
    const text = cal(
      vevent(['UID:win4@test', 'SUMMARY:Beyond the window', 'DTSTART:20260701T120000Z', 'DTEND:20260701T130000Z']),
    )
    // 30-day window from Jun 1 ends Jul 1 00:00Z — the Jul 1 12:00 event is out.
    expect(parseIcs(text, JUNE_START, 30, TEST_ZONE)).toHaveLength(0)
  })
})

describe('parseIcs — robustness / realistic exports', () => {
  it('SKIPS a VTIMEZONE block safely (its DTSTART lines must not become events)', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE',
      'TZID:America/New_York',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0400',
      'TZNAME:EDT',
      'DTSTART:19700308T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:-0400',
      'TZOFFSETTO:-0500',
      'TZNAME:EST',
      'DTSTART:19701101T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:real1@test',
      'SUMMARY:The only real event',
      'DTSTART:20260610T120000Z',
      'DTEND:20260610T130000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events).toHaveLength(1)
    expect(events[0]!.summary).toBe('The only real event')
  })

  it('ignores X- properties and unknown lines without choking', () => {
    const text = cal(
      vevent([
        'UID:x1@test',
        'SUMMARY:Event with vendor extensions',
        'DTSTART:20260610T120000Z',
        'DTEND:20260610T130000Z',
        'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
        'X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC',
        'TRANSP:OPAQUE',
        'SEQUENCE:0',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events).toHaveLength(1)
    expect(events[0]!.summary).toBe('Event with vendor extensions')
  })

  it('sorts events by start ascending across multiple VEVENTs given out of order', () => {
    const text = cal(
      [
        vevent(['UID:s1@test', 'SUMMARY:Third', 'DTSTART:20260612T120000Z', 'DTEND:20260612T130000Z']),
        vevent(['UID:s2@test', 'SUMMARY:First', 'DTSTART:20260610T080000Z', 'DTEND:20260610T090000Z']),
        vevent(['UID:s3@test', 'SUMMARY:Second', 'DTSTART:20260611T120000Z', 'DTEND:20260611T130000Z']),
      ].join('\r\n'),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events.map((e) => e.summary)).toEqual(['First', 'Second', 'Third'])
  })

  it('returns [] for malformed input (not a calendar at all)', () => {
    expect(parseIcs('this is not a calendar, just some text', JUNE_START, JUNE_DAYS, TEST_ZONE)).toEqual([])
  })

  it('returns [] for an empty string', () => {
    expect(parseIcs('', JUNE_START, JUNE_DAYS, TEST_ZONE)).toEqual([])
  })

  it('drops an event with no DTSTART but keeps the well-formed sibling', () => {
    const text = cal(
      [
        vevent(['UID:bad1@test', 'SUMMARY:No start here']),
        vevent(['UID:ok1@test', 'SUMMARY:Fine', 'DTSTART:20260610T120000Z', 'DTEND:20260610T130000Z']),
      ].join('\r\n'),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events.map((e) => e.summary)).toEqual(['Fine'])
  })
})

describe('extractMeetUrl — provider matching (LOCATION/DESCRIPTION → a join link)', () => {
  it('matches a Zoom link on any subdomain', () => {
    expect(extractMeetUrl('https://us02web.zoom.us/j/1234567890', '')).toBe('https://us02web.zoom.us/j/1234567890')
  })

  it('matches a bare zoom.us host (no subdomain)', () => {
    expect(extractMeetUrl('https://zoom.us/j/1234567890', '')).toBe('https://zoom.us/j/1234567890')
  })

  it('matches meet.google.com', () => {
    expect(extractMeetUrl('https://meet.google.com/abc-defg-hij', '')).toBe('https://meet.google.com/abc-defg-hij')
  })

  it('does NOT match a meet.google.com subdomain (exact-host rule, no subdomain variant)', () => {
    expect(extractMeetUrl('https://sub.meet.google.com/abc-defg-hij', '')).toBeUndefined()
  })

  it('matches a Teams link that carries the /l/meetup-join path', () => {
    const url = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0'
    expect(extractMeetUrl(url, '')).toBe(url)
  })

  it('does NOT match teams.microsoft.com WITHOUT the /l/meetup-join path', () => {
    expect(extractMeetUrl('https://teams.microsoft.com/some-other-page', '')).toBeUndefined()
  })

  it('matches a Webex link on any subdomain', () => {
    expect(extractMeetUrl('https://mycompany.webex.com/meet/jdoe', '')).toBe('https://mycompany.webex.com/meet/jdoe')
  })

  it('matches a Whereby link', () => {
    expect(extractMeetUrl('https://whereby.com/team-standup', '')).toBe('https://whereby.com/team-standup')
  })

  it('rejects a lookalike host that merely CONTAINS "zoom.us" as a substring (suffix-safety)', () => {
    // evilzoom.us.attacker.com is NOT zoom.us and does NOT end with .zoom.us —
    // an `includes('zoom.us')` check would wrongly match this; endsWith must not.
    expect(extractMeetUrl('https://evilzoom.us.attacker.com/j/123', '')).toBeUndefined()
  })

  it('rejects an http:// (non-https) link even to a real provider host', () => {
    expect(extractMeetUrl('http://zoom.us/j/123', '')).toBeUndefined()
  })

  it('rejects a non-provider https URL', () => {
    expect(extractMeetUrl('https://example.com/meeting-room', '')).toBeUndefined()
  })

  it('LOCATION wins over DESCRIPTION when both carry a provider link', () => {
    const location = 'https://us02web.zoom.us/j/111'
    const description = 'Backup link: https://meet.google.com/abc-defg-hij'
    expect(extractMeetUrl(location, description)).toBe('https://us02web.zoom.us/j/111')
  })

  it('falls back to DESCRIPTION when LOCATION carries no provider link', () => {
    const description = 'Join via https://whereby.com/team-standup for the call'
    expect(extractMeetUrl('Conference Room 4B', description)).toBe('https://whereby.com/team-standup')
  })

  it('tolerates surrounding prose — the URL is extracted cleanly, not the sentence around it', () => {
    const description = 'Join here: https://us02web.zoom.us/j/555 — agenda attached, dial in 10 min early'
    expect(extractMeetUrl('', description)).toBe('https://us02web.zoom.us/j/555')
  })

  it('returns undefined when neither field has any candidate URL', () => {
    expect(extractMeetUrl('Conference Room 4B', 'Bring your laptop')).toBeUndefined()
  })

  it('skips a candidate that fails URL parsing and keeps scanning for a later valid one', () => {
    // "https://[bad" is an unparseable candidate (unterminated IPv6 literal);
    // the scan must not abort there — it keeps going and finds the real link.
    const description = 'https://[bad then the real link https://meet.google.com/xyz-abcd-efg'
    expect(extractMeetUrl('', description)).toBe('https://meet.google.com/xyz-abcd-efg')
  })

  it('skips a non-provider candidate that appears before the real provider link', () => {
    const description = 'Doc: https://example.com/notes — call: https://meet.google.com/xyz-abcd-efg'
    expect(extractMeetUrl('', description)).toBe('https://meet.google.com/xyz-abcd-efg')
  })

  it('rejects a lookalike host that merely CONTAINS "webex.com" as a substring (suffix-safety)', () => {
    expect(extractMeetUrl('https://evilwebex.com.attacker.com/meet/x', '')).toBeUndefined()
  })

  it('rejects a lookalike host that merely CONTAINS "whereby.com" as a substring (suffix-safety)', () => {
    expect(extractMeetUrl('https://evilwhereby.com.attacker.com/room', '')).toBeUndefined()
  })
})

describe('extractMeetUrl — trailing punctuation from calendar-invite prose does not leak into the link', () => {
  it('a bare sentence period right after the URL (no space) is trimmed off', () => {
    expect(extractMeetUrl('', 'Join: https://us02web.zoom.us/j/123.')).toBe('https://us02web.zoom.us/j/123')
  })

  it('a wrapping close-paren right after the URL is trimmed off', () => {
    expect(extractMeetUrl('', '(https://meet.google.com/xyz-abcd-efg)')).toBe('https://meet.google.com/xyz-abcd-efg')
  })

  it('mixed trailing punctuation ("url.).") is trimmed fully, not just the last character', () => {
    expect(extractMeetUrl('', 'Call in at https://us02web.zoom.us/j/456.).')).toBe('https://us02web.zoom.us/j/456')
  })

  it('does NOT trim legitimate path/query content — only the actual trailing punctuation run comes off', () => {
    // The query string ?pwd=abc is part of the real link; only the sentence-
    // ending period after it is prose, not URL content.
    expect(extractMeetUrl('https://us02web.zoom.us/j/123?pwd=abc.', '')).toBe('https://us02web.zoom.us/j/123?pwd=abc')
  })
})

describe('parseIcs — meeting links (LOCATION/DESCRIPTION → IcsEvent.meetUrl)', () => {
  it('stamps meetUrl onto every occurrence of a recurring event whose LOCATION carries a provider link', () => {
    const text = cal(
      vevent([
        'UID:meet1@test',
        'SUMMARY:Daily sync',
        'DTSTART:20260601T140000Z',
        'DTEND:20260601T141500Z',
        'LOCATION:https://us02web.zoom.us/j/998877',
        'RRULE:FREQ=DAILY;COUNT=3',
      ]),
    )
    const events = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(events).toHaveLength(3)
    for (const event of events) {
      expect(event.meetUrl).toBe('https://us02web.zoom.us/j/998877')
    }
  })

  it('an event with no recognizable meeting link in LOCATION has NO meetUrl key at all (absent, not undefined-valued)', () => {
    const text = cal(
      vevent([
        'UID:meet2@test',
        'SUMMARY:In-person review',
        'DTSTART:20260610T120000Z',
        'DTEND:20260610T130000Z',
        'LOCATION:Conference Room 4B',
      ]),
    )
    const [event] = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect('meetUrl' in event!).toBe(false)
  })

  it('an event with neither LOCATION nor DESCRIPTION at all also has no meetUrl key', () => {
    const text = cal(
      vevent(['UID:meet3@test', 'SUMMARY:No fields', 'DTSTART:20260610T120000Z', 'DTEND:20260610T130000Z']),
    )
    const [event] = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect('meetUrl' in event!).toBe(false)
  })

  it('falls back to DESCRIPTION when LOCATION is a plain room name, and unescapes DESCRIPTION before scanning it', () => {
    // The escaped comma and escaped newline sit right next to the URL —
    // decoding must happen BEFORE the scan, or the raw backslash-n / backslash-
    // comma text would still get swept into the URL candidate (via WHATWG's
    // backslash-as-slash normalization for special schemes), corrupting the
    // extracted string.
    const text = cal(
      vevent([
        'UID:meet4@test',
        'SUMMARY:Escaped description',
        'DTSTART:20260610T120000Z',
        'DTEND:20260610T130000Z',
        'LOCATION:Conference Room 4B',
        'DESCRIPTION:Notes\\, then the link https://us02web.zoom.us/j/998877\\nEnd of description',
      ]),
    )
    const [event] = parseIcs(text, JUNE_START, JUNE_DAYS, TEST_ZONE)
    expect(event!.meetUrl).toBe('https://us02web.zoom.us/j/998877')
  })
})

// ---------------------------------------------------------------------------
// fetchIcs — the impure boundary (response .text(), 8s abort, quiet failure)
// ---------------------------------------------------------------------------

/** Minimal fetch Response stand-in exposing only what fetchIcs reads (ok,
 *  status, text()). Cast through `unknown` at each fetchFn call site. */
function fakeResponse(opts: { ok?: boolean; status: number; text?: string }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    text: vi.fn(async () => opts.text ?? ''),
  }
}

describe('fetchIcs', () => {
  const CALS = [{ name: 'A', url: 'https://calendar.example.com/private/basic.ics' }]

  it('reads response.text() (NOT json) and parses it into events', async () => {
    const body = cal(
      vevent(['UID:fetch1@test', 'SUMMARY:Fetched', 'DTSTART:20260610T120000Z', 'DTEND:20260610T130000Z']),
    )
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, text: body }))
    const data = await fetchIcs(CALS, JUNE_START, null, TEST_ZONE, fetchFn as unknown as typeof fetch)
    expect(data.events).toHaveLength(1)
    expect(data.events[0]!.summary).toBe('Fetched')
  })

  it('carries an AbortSignal (shared 8s-abort discipline)', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse({ status: 200, text: cal('') }))
    await fetchIcs(CALS, JUNE_START, null, TEST_ZONE, fetchFn as unknown as typeof fetch)
    const [, init] = fetchFn.mock.calls[0]!
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('a non-OK status returns prev unchanged', async () => {
    const prev: IcsData = {
      events: [{ summary: 'Old', start: 1, end: 2, cal: 0, allDay: false }],
    }
    const fetchFn = vi.fn(async () => fakeResponse({ ok: false, status: 404 }))
    const data = await fetchIcs(CALS, JUNE_START, prev, TEST_ZONE, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
  })

  it('a non-OK status with no prev falls back to an empty events list', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: false, status: 500 }))
    const data = await fetchIcs(CALS, JUNE_START, null, TEST_ZONE, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ events: [] })
  })

  it('a network/abort rejection keeps prev verbatim', async () => {
    const prev: IcsData = {
      events: [{ summary: 'Old', start: 1, end: 2, cal: 0, allDay: false }],
    }
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    const data = await fetchIcs(CALS, JUNE_START, prev, TEST_ZONE, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
  })

  it('a network rejection with no prev returns an empty events list', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('boom')
    })
    const data = await fetchIcs(CALS, JUNE_START, null, TEST_ZONE, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ events: [] })
  })

  it('fetches every calendar in parallel and tags events with their calendar index', async () => {
    const bodyA = cal(vevent(['UID:a@test', 'SUMMARY:From A', 'DTSTART:20260610T120000Z', 'DTEND:20260610T130000Z']))
    const bodyB = cal(vevent(['UID:b@test', 'SUMMARY:From B', 'DTSTART:20260610T090000Z', 'DTEND:20260610T100000Z']))
    const fetchFn = vi.fn(async (u: string) =>
      fakeResponse({ status: 200, text: u.includes('feed-a') ? bodyA : bodyB }),
    )
    const two = [
      { name: 'A', url: 'https://calendar.example.com/feed-a.ics' },
      { name: 'B', url: 'https://calendar.example.com/feed-b.ics' },
    ]
    const data = await fetchIcs(two, JUNE_START, null, TEST_ZONE, fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    // Merged AND sorted ascending across feeds — B's 09:00 sorts before A's 12:00.
    expect(data.events.map((e) => [e.summary, e.cal])).toEqual([
      ['From B', 1],
      ['From A', 0],
    ])
  })

  it('one failing feed keeps ITS previous events while the healthy feed refreshes', async () => {
    const bodyA = cal(vevent(['UID:a2@test', 'SUMMARY:Fresh A', 'DTSTART:20260610T120000Z', 'DTEND:20260610T130000Z']))
    const fetchFn = vi.fn(async (u: string) =>
      u.includes('feed-a') ? fakeResponse({ status: 200, text: bodyA }) : fakeResponse({ ok: false, status: 500 }),
    )
    const prev: IcsData = {
      events: [
        { summary: 'Stale A', start: 1, end: 2, cal: 0, allDay: false },
        { summary: 'Kept B', start: 3, end: 4, cal: 1, allDay: false },
      ],
    }
    const two = [
      { name: 'A', url: 'https://calendar.example.com/feed-a.ics' },
      { name: 'B', url: 'https://calendar.example.com/feed-b.ics' },
    ]
    const data = await fetchIcs(two, JUNE_START, prev, TEST_ZONE, fetchFn as unknown as typeof fetch)
    const summaries = data.events.map((e) => e.summary)
    expect(summaries).toContain('Fresh A')
    expect(summaries).toContain('Kept B')
    expect(summaries).not.toContain('Stale A')
  })

  it('passes meetUrl through untouched alongside cal tagging', async () => {
    const body = cal(
      vevent([
        'UID:fetchmeet@test',
        'SUMMARY:Fetched with link',
        'DTSTART:20260610T120000Z',
        'DTEND:20260610T130000Z',
        'LOCATION:https://whereby.com/team-standup',
      ]),
    )
    const two = [
      { name: 'A', url: 'https://calendar.example.com/feed-a.ics' },
      { name: 'B', url: 'https://calendar.example.com/feed-b.ics' },
    ]
    const fetchFn = vi.fn(async (u: string) =>
      fakeResponse({
        status: 200,
        text: u.includes('feed-b') ? body : cal(''),
      }),
    )
    const data = await fetchIcs(two, JUNE_START, null, TEST_ZONE, fetchFn as unknown as typeof fetch)
    expect(data.events).toHaveLength(1)
    expect(data.events[0]!.meetUrl).toBe('https://whereby.com/team-standup')
    expect(data.events[0]!.cal).toBe(1)
  })

  it('an empty calendar list returns prev (or empty) without fetching', async () => {
    const fetchFn = vi.fn()
    expect(await fetchIcs([], JUNE_START, null, TEST_ZONE, fetchFn as unknown as typeof fetch)).toEqual({ events: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('icsDescriptor', () => {
  it('declares the URL-is-the-secret, no-identity connector shape', () => {
    expect(icsDescriptor.id).toBe('ics')
    expect(icsDescriptor.label).toBe('Calendar')
    expect(icsDescriptor.blurb).toBe('Your next events, from any calendar app')
    expect(icsDescriptor.auth).toBe('none')
    expect(icsDescriptor.ttlMs).toBe(15 * 60_000)
    // The WHOLE url is the secret — it grants read access to the entire
    // calendar; `calendars` strips too (each entry's url is the same kind of
    // secret) so a legacy config mid-migration never leaks either shape.
    expect(icsDescriptor.secretFields).toEqual(['url', 'calendars'])
    expect(icsDescriptor.identityField).toBeUndefined()
    expect(icsDescriptor.category).toBe('calendar-tasks')
  })

  it('derives the https origin from the config url', () => {
    expect(
      icsDescriptor.origins({
        enabled: true,
        url: 'https://calendar.example.com/x/basic.ics',
      }),
    ).toEqual(['https://calendar.example.com/*'])
  })

  it('derives one https origin per calendar, degrading per-entry on bad urls', () => {
    expect(
      icsDescriptor.origins({
        enabled: true,
        calendars: [
          { name: 'A', url: 'https://calendar.example.com/x/basic.ics' },
          { name: 'Bad', url: 'not a url' },
          { name: 'B', url: 'https://p57-caldav.icloud.com/published/2/abc' },
        ],
      }),
    ).toEqual(['https://calendar.example.com/*', 'https://p57-caldav.icloud.com/*'])
  })
  it('still derives the origin from a legacy single-url config', () => {
    expect(
      icsDescriptor.origins({
        enabled: true,
        url: 'https://calendar.example.com/x/basic.ics',
      }),
    ).toEqual(['https://calendar.example.com/*'])
  })

  it('owns origins only when a valid calendar is configured, including disabled and legacy rows', () => {
    expect(
      icsDescriptor.ownsOrigins({
        enabled: false,
        url: 'https://calendar.example.com/x.ics',
      }),
    ).toBe(true)
    expect(icsDescriptor.ownsOrigins({ enabled: true, calendars: [] })).toBe(false)
    expect(
      icsDescriptor.ownsOrigins({
        enabled: true,
        calendars: [{ name: 'Bad', url: 'not a url' }],
      }),
    ).toBe(false)
  })

  it('redacts capability URLs into a valid empty calendar list and uses effective calendar completeness for backups', () => {
    const stored = {
      enabled: true,
      calendars: [
        {
          name: 'Family',
          url: 'https://calendar.example.test/private.ics?token=calendar-capability',
        },
      ],
      view: 'upcoming' as const,
      upcomingCount: 4,
    }
    expect(
      icsDescriptor.redactForBackup?.({
        enabled: true,
        view: 'upcoming',
        upcomingCount: 4,
      }),
    ).toEqual({
      enabled: true,
      calendars: [],
      view: 'upcoming',
      upcomingCount: 4,
    })
    expect(icsDescriptor.backupReentryRequired?.({ enabled: true, calendars: [] })).toBe(true)
    expect(icsDescriptor.backupReentryRequired?.({ enabled: false, calendars: [] })).toBe(false)
    expect(
      icsDescriptor.backupReentryRequired?.({
        enabled: true,
        url: 'https://calendar.example.test/legacy.ics',
      }),
    ).toBe(false)
    expect(stored.calendars[0]?.url).toContain('calendar-capability')
  })
})

describe('icsCalendarsOf — read-time config normalization', () => {
  it('keeps a valid optional color while reading invalid or absent colors as Auto without writing one', () => {
    const calendars = icsCalendarsOf({
      enabled: true,
      calendars: [
        { name: 'Personal', url: 'https://a.example.com/x.ics', color: 'sky' },
        { name: 'Family', url: 'https://b.example.com/y.ics', color: 'invalid' },
        { name: 'Work', url: 'https://c.example.com/z.ics' },
      ],
    } as never)
    expect(calendars).toEqual([
      { name: 'Personal', url: 'https://a.example.com/x.ics', color: 'sky' },
      { name: 'Family', url: 'https://b.example.com/y.ics' },
      { name: 'Work', url: 'https://c.example.com/z.ics' },
    ])
  })

  it('returns a structurally valid calendars array as-is', () => {
    const cals = [{ name: 'Personal', url: 'https://a.example.com/x.ics' }]
    expect(icsCalendarsOf({ enabled: true, calendars: cals })).toEqual(cals)
  })
  it('filters malformed entries instead of rejecting the whole list', () => {
    const good = { name: 'Family', url: 'https://b.example.com/y.ics' }
    const cals = [good, { name: 'NoUrl' }, { name: 7, url: 'https://c.example.com/z.ics' }, null, 'junk']
    expect(icsCalendarsOf({ enabled: true, calendars: cals as never })).toEqual([good])
  })
  it('wraps the legacy single-url shape as one calendar named "Calendar"', () => {
    expect(icsCalendarsOf({ enabled: true, url: 'https://a.example.com/x.ics' })).toEqual([
      { name: 'Calendar', url: 'https://a.example.com/x.ics' },
    ])
  })
  it('calendars array wins over a lingering legacy url', () => {
    const cals = [{ name: 'New', url: 'https://new.example.com/n.ics' }]
    expect(
      icsCalendarsOf({
        enabled: true,
        url: 'https://old.example.com/o.ics',
        calendars: cals,
      }),
    ).toEqual(cals)
  })
  it('empty-string legacy url, missing both fields, and undefined config all yield []', () => {
    expect(icsCalendarsOf({ enabled: true, url: '' })).toEqual([])
    expect(icsCalendarsOf({ enabled: true })).toEqual([])
    expect(icsCalendarsOf(undefined)).toEqual([])
  })
  // Final-review fix wave (Finding 3): the settings card re-checks the cap
  // at write time, but icsCalendarsOf is the READ-time boundary every
  // caller goes through — hand-edited/backup-restored storage holding more
  // than MAX_CALENDARS valid entries must never render past the swept
  // display max (5 dots, 5 rows).
  it(`caps at MAX_CALENDARS (${MAX_CALENDARS}): more valid entries than the cap returns only the first ${MAX_CALENDARS}`, () => {
    const cals = Array.from({ length: MAX_CALENDARS + 1 }, (_, i) => ({
      name: `Cal ${i + 1}`,
      url: `https://calendar${i}.example.com/basic.ics`,
    }))
    const result = icsCalendarsOf({ enabled: true, calendars: cals })
    expect(result).toHaveLength(MAX_CALENDARS)
    expect(result).toEqual(cals.slice(0, MAX_CALENDARS))
  })
})

describe('icsViewOf — view defaults', () => {
  it('defaults to today/3 for missing or invalid values', () => {
    expect(icsViewOf(undefined)).toEqual({
      view: 'today',
      upcomingCount: 3,
      meetLinks: true,
    })
    expect(icsViewOf({ enabled: true, view: 'bogus' as never, upcomingCount: 99 })).toEqual({
      view: 'today',
      upcomingCount: 3,
      meetLinks: true,
    })
  })
  it('passes through valid values', () => {
    expect(icsViewOf({ enabled: true, view: 'per-calendar', upcomingCount: 2 })).toEqual({
      view: 'per-calendar',
      upcomingCount: 2,
      meetLinks: true,
    })
    expect(icsViewOf({ enabled: true, view: 'upcoming', upcomingCount: 4 })).toEqual({
      view: 'upcoming',
      upcomingCount: 4,
      meetLinks: true,
    })
  })
})

// Task 89 — meetLinks joined the same reader (see icsViewOf's own doc
// comment for why); same read-time-tolerance discipline as view/upcomingCount
// above: absent or non-boolean defaults ON, an explicit boolean passes through.
describe('icsViewOf — meetLinks (Task 89)', () => {
  it('defaults to true when the flag is absent or not a boolean', () => {
    expect(icsViewOf(undefined).meetLinks).toBe(true)
    expect(icsViewOf({ enabled: true }).meetLinks).toBe(true)
    expect(icsViewOf({ enabled: true, meetLinks: 'yes' as never }).meetLinks).toBe(true)
  })
  it('passes through an explicit true or false', () => {
    expect(icsViewOf({ enabled: true, meetLinks: true }).meetLinks).toBe(true)
    expect(icsViewOf({ enabled: true, meetLinks: false }).meetLinks).toBe(false)
  })
})
