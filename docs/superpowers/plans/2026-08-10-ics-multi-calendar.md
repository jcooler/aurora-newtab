# Calendar Multi-Feed + Webcal + Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `ics` connector accepts up to 5 named calendars (webcal:// links converted at save), merges them into the compact agenda widget with per-calendar colored dots, and offers three view modes (Today / Upcoming / One per calendar).

**Architecture:** Read-time config normalization (no storage migration): `icsCalendarsOf()` tolerates the legacy `{ url }` shape and the new `{ calendars }` shape at every read site. `fetchIcs` fans out per feed in parallel with per-feed quiet failure; events carry a `cal` index that drives dot colors and the per-calendar view. The settings card becomes an RSS-style named list.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 (`@theme` in `src/newtab/index.css`), vitest (`npm test` = `vitest run`), Playwright preview harness (`npm run build:preview` then `node scripts/preview.mjs`).

**Spec:** `docs/superpowers/specs/2026-08-10-ics-multi-calendar-design.md` — read it first; the Decisions log there is binding.

## Global Constraints

- Gesture chain: in every settings handler, `ensureOrigin()` (→ `chrome.permissions.request`) must be the FIRST await, zero awaits ahead of it. Synchronous validation only before it.
- Never throw out of a registry sweep: `origins()` degrades per-entry to fewer origins.
- Quiet failure everywhere: a failed feed keeps previous data; never blank siblings.
- Copy is exact: every user-visible string in this plan is verbatim — tests assert exact text.
- `parseIcs` stays pure (no `Date.now()`); the widget's refresh closure is the one impure boundary.
- Match surrounding comment density and idiom — this codebase documents WHY at every decision point; follow the neighboring files' style.
- All commits on `main`, one per task step below. There are unrelated uncommitted edits to gitlab/jira widget files in the working tree — NEVER `git add` those; stage only the files each task names.

---

### Task 1: Config types, normalization helpers, descriptor

**Files:**
- Modify: `src/services/connectors/types.ts:112-115` (IcsConfig)
- Modify: `src/services/connectors/ics.ts` (helpers + descriptor, lines 542-564)
- Test: `src/services/connectors/ics.test.ts` (descriptor describe at ~line 722, new helper describes)
- Test: `src/lib/backup.test.ts` (the ics strip case)

**Interfaces:**
- Consumes: existing `originPattern` (`src/services/permissions.ts:84`), `stripSecrets` (`src/lib/backup.ts:42` — generic over `secretFields`, needs no change).
- Produces (later tasks rely on these exact names):
  - `interface IcsCalendar { name: string; url: string }` (types.ts, exported)
  - `IcsConfig` = `{ enabled: boolean; url?: string; calendars?: IcsCalendar[]; view?: 'today' | 'upcoming' | 'per-calendar'; upcomingCount?: number }`
  - `icsCalendarsOf(config: IcsConfig | undefined): IcsCalendar[]` (ics.ts, exported)
  - `icsViewOf(config: IcsConfig | undefined): { view: 'today' | 'upcoming' | 'per-calendar'; upcomingCount: number }` (ics.ts, exported)
  - `CALENDAR_DOT_CLASSES: readonly string[]` (ics.ts, exported) = `['bg-accent', 'bg-sky-400', 'bg-emerald-400', 'bg-amber-400', 'bg-fuchsia-400']`

- [ ] **Step 1: Write the failing tests** — append to `ics.test.ts`:

```ts
describe('icsCalendarsOf — read-time config normalization', () => {
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
    expect(icsCalendarsOf({ enabled: true, url: 'https://old.example.com/o.ics', calendars: cals })).toEqual(cals)
  })
  it('empty-string legacy url, missing both fields, and undefined config all yield []', () => {
    expect(icsCalendarsOf({ enabled: true, url: '' })).toEqual([])
    expect(icsCalendarsOf({ enabled: true })).toEqual([])
    expect(icsCalendarsOf(undefined)).toEqual([])
  })
})

describe('icsViewOf — view defaults', () => {
  it('defaults to today/3 for missing or invalid values', () => {
    expect(icsViewOf(undefined)).toEqual({ view: 'today', upcomingCount: 3 })
    expect(icsViewOf({ enabled: true, view: 'bogus' as never, upcomingCount: 99 })).toEqual({
      view: 'today',
      upcomingCount: 3,
    })
  })
  it('passes through valid values', () => {
    expect(icsViewOf({ enabled: true, view: 'per-calendar', upcomingCount: 2 })).toEqual({
      view: 'per-calendar',
      upcomingCount: 2,
    })
    expect(icsViewOf({ enabled: true, view: 'upcoming', upcomingCount: 4 })).toEqual({
      view: 'upcoming',
      upcomingCount: 4,
    })
  })
})
```

Update the existing `icsDescriptor` describe (~line 722): `secretFields` expectation becomes `['url', 'calendars']`; the origins case becomes multi-entry with per-entry degradation:

```ts
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
  expect(icsDescriptor.origins({ enabled: true, url: 'https://calendar.example.com/x/basic.ics' })).toEqual([
    'https://calendar.example.com/*',
  ])
})
```

In `src/lib/backup.test.ts`, find the ics strip case (search `ics`) and extend it: a config `{ enabled: true, url: 'https://…', calendars: [{ name: 'P', url: 'https://…' }], view: 'upcoming', upcomingCount: 3 }` exports as `{ enabled: true, view: 'upcoming', upcomingCount: 3 }` — BOTH `url` and `calendars` stripped, view fields kept.

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/services/connectors/ics.test.ts src/lib/backup.test.ts`
Expected: FAIL — `icsCalendarsOf` not exported; `secretFields` still `['url']`.

- [ ] **Step 3: Implement** — in `types.ts` replace the `IcsConfig` block (keep the "the WHOLE url is the secret" comment spirit):

```ts
export interface IcsCalendar {
  name: string // display name, e.g. "Personal" — shown in settings; dots key by list position
  url: string // https-only at rest (webcal:// is converted before persist); the WHOLE url is the secret
}
export interface IcsConfig {
  enabled: boolean
  url?: string // LEGACY pre-multi-calendar shape; read by icsCalendarsOf, never written by new saves
  calendars?: IcsCalendar[] // max 5 (MAX_CALENDARS in Connectors.tsx)
  view?: 'today' | 'upcoming' | 'per-calendar' // widget row mode; absent → 'today' (icsViewOf)
  upcomingCount?: number // 2–4; absent/invalid → 3 (icsViewOf); meaningful only for view 'upcoming'
}
```

In `ics.ts` add (import `IcsCalendar` alongside `IcsConfig`):

```ts
/** Read-time migration — the ONLY place both at-rest shapes are understood.
 *  A valid `calendars` array wins (malformed entries filtered, not fatal);
 *  else a non-empty legacy `url` becomes one calendar named 'Calendar';
 *  else []. No storage migration exists: the first save from the new
 *  settings card writes the new shape. */
export function icsCalendarsOf(config: IcsConfig | undefined): IcsCalendar[] {
  if (!config) return []
  if (Array.isArray(config.calendars)) {
    return config.calendars.filter(
      (c): c is IcsCalendar =>
        !!c && typeof c === 'object' && typeof c.name === 'string' && typeof c.url === 'string' && c.url.length > 0,
    )
  }
  if (typeof config.url === 'string' && config.url.length > 0) return [{ name: 'Calendar', url: config.url }]
  return []
}

/** View defaults, same read-time-tolerance discipline as icsCalendarsOf. */
export function icsViewOf(config: IcsConfig | undefined): {
  view: 'today' | 'upcoming' | 'per-calendar'
  upcomingCount: number
} {
  const view = config?.view === 'upcoming' || config?.view === 'per-calendar' ? config.view : 'today'
  const n = config?.upcomingCount
  const upcomingCount = typeof n === 'number' && Number.isInteger(n) && n >= 2 && n <= 4 ? n : 3
  return { view, upcomingCount }
}

/** Dot color per calendar, keyed by LIST POSITION (index % length). Position
 *  1 is the theme accent; 2–5 are stock Tailwind hues checked against both
 *  themes at the visual gate. Lives here (not in a component) because both
 *  the widget rows and the settings legend render the same dot. */
export const CALENDAR_DOT_CLASSES: readonly string[] = [
  'bg-accent',
  'bg-sky-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-fuchsia-400',
]
```

Descriptor changes: `secretFields: ['url', 'calendars']` (legacy `url` persists at rest until a first re-save — an export must strip it too), and:

```ts
origins: (config) =>
  [
    ...new Set(
      icsCalendarsOf(config).flatMap((c) => {
        try {
          return [originPattern(c.url)]
        } catch {
          return []
        }
      }),
    ),
  ],
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/services/connectors/ics.test.ts src/lib/backup.test.ts`
Expected: PASS. Then `npm test` — full suite must stay green (nothing else reads `secretFields` shape or `IcsConfig.url` in a way this breaks: `url` went optional, and both current readers guard with `typeof … === 'string'`). Also `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/services/connectors/types.ts src/services/connectors/ics.ts src/services/connectors/ics.test.ts src/lib/backup.test.ts
git commit -m "feat(ics): config learns named calendars — legacy url reads on, both secrets strip"
```

---

### Task 2: Multi-feed fetch with per-feed fallback

**Files:**
- Modify: `src/services/connectors/ics.ts:36-44` (IcsEvent/IcsData), `:495-540` (parseIcs return type, fetchIcs)
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx:35-76` (gate + inner props, behavior-identical)
- Test: `src/services/connectors/ics.test.ts` (fetchIcs describe, ~line 671)
- Test: `src/newtab/widgets/calendar/CalendarWidget.test.tsx:24-58` (fixtures only)

**Interfaces:**
- Consumes: `icsCalendarsOf`, `icsViewOf` from Task 1.
- Produces:
  - `interface IcsEvent { summary: string; start: number; end: number; cal: number }` — `cal` = index into the calendars array.
  - `parseIcs(text, windowStart, windowDays): Omit<IcsEvent, 'cal'>[]` (signature otherwise unchanged; body untouched).
  - `fetchIcs(calendars: IcsCalendar[], windowStart: number, prev: IcsData | null, fetchFn: typeof fetch = fetch): Promise<IcsData>` — NOTE the first parameter changed from `url: string`.

- [ ] **Step 1: Write the failing tests** — in `ics.test.ts`, the `fetchIcs` describe: change `const url = …` to `const CALS = [{ name: 'A', url: 'https://calendar.example.com/private/basic.ics' }]` and update every existing call from `fetchIcs(url, …)` to `fetchIcs(CALS, …)`. Existing `prev` fixtures gain `cal: 0`. Add:

```ts
it('fetches every calendar in parallel and tags events with their calendar index', async () => {
  const bodyA = cal(vevent(['UID:a@test', 'SUMMARY:From A', 'DTSTART:20260610T120000Z', 'DTEND:20260610T130000Z']))
  const bodyB = cal(vevent(['UID:b@test', 'SUMMARY:From B', 'DTSTART:20260610T090000Z', 'DTEND:20260610T100000Z']))
  const fetchFn = vi.fn(async (u: string) => fakeResponse({ status: 200, text: u.includes('feed-a') ? bodyA : bodyB }))
  const two = [
    { name: 'A', url: 'https://calendar.example.com/feed-a.ics' },
    { name: 'B', url: 'https://calendar.example.com/feed-b.ics' },
  ]
  const data = await fetchIcs(two, JUNE_START, null, fetchFn as unknown as typeof fetch)
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
      { summary: 'Stale A', start: 1, end: 2, cal: 0 },
      { summary: 'Kept B', start: 3, end: 4, cal: 1 },
    ],
  }
  const two = [
    { name: 'A', url: 'https://calendar.example.com/feed-a.ics' },
    { name: 'B', url: 'https://calendar.example.com/feed-b.ics' },
  ]
  const data = await fetchIcs(two, JUNE_START, prev, fetchFn as unknown as typeof fetch)
  const summaries = data.events.map((e) => e.summary)
  expect(summaries).toContain('Fresh A')
  expect(summaries).toContain('Kept B')
  expect(summaries).not.toContain('Stale A')
})

it('an empty calendar list returns prev (or empty) without fetching', async () => {
  const fetchFn = vi.fn()
  expect(await fetchIcs([], JUNE_START, null, fetchFn as unknown as typeof fetch)).toEqual({ events: [] })
  expect(fetchFn).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/services/connectors/ics.test.ts`
Expected: FAIL — compile errors on the new signature, then assertion failures.

- [ ] **Step 3: Implement** — `IcsEvent` gains `cal: number` ("index into the calendars array — drives dot color and the per-calendar view; parseIcs emits events WITHOUT it, fetchIcs tags per feed"). `parseIcs`'s declared return type becomes `Omit<IcsEvent, 'cal'>[]` (its body and the internal `push` are unchanged — the object literals already match). Replace `fetchIcs`:

```ts
/** Fetches every calendar in PARALLEL (each with its own 8s abort), parses
 *  with the unchanged pure parseIcs, tags each event with its calendar
 *  index, merges and sorts. Failure is PER-FEED: a feed that errors
 *  contributes prev's events for that index instead of blanking, while the
 *  others refresh. Accepted edge (spec): the fallback keys by index, so a
 *  snapshot taken under a differently-ordered list can transiently mis-tag
 *  a failed feed's carried-over events until the next successful refresh. */
export async function fetchIcs(
  calendars: IcsCalendar[],
  windowStart: number,
  prev: IcsData | null,
  fetchFn: typeof fetch = fetch,
): Promise<IcsData> {
  if (calendars.length === 0) return prev ?? { events: [] }
  const perFeed = await Promise.all(
    calendars.map(async (c, i): Promise<IcsEvent[] | null> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const res = await fetchFn(c.url, { signal: controller.signal })
        if (!res.ok) return null
        const text = await res.text()
        return parseIcs(text, windowStart, WINDOW_DAYS).map((ev) => ({ ...ev, cal: i }))
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }),
  )
  const events = perFeed.flatMap((feed, i) => feed ?? prev?.events.filter((e) => e.cal === i) ?? [])
  events.sort((a, b) => a.start - b.start)
  return { events }
}
```

Widget minimal adaptation (behavior stays identical — today mode only until Task 3):

```tsx
export default function CalendarWidget() {
  const [connectors] = useStoredKey('connectors')
  const ics = connectors?.ics as IcsConfig | undefined
  const calendars = icsCalendarsOf(ics)
  if (!ics?.enabled || calendars.length === 0) return null
  // key: a config change (add/remove/reorder) REMOUNTS the inner widget so
  // useConnectorSnapshot's one-refresh-per-mount fires against the new list —
  // this is what makes the spec's index-keyed-fallback edge transient.
  return <CalendarInner key={calendars.map((c) => c.url).join('\n')} calendars={calendars} />
}

function CalendarInner({ calendars }: { calendars: IcsCalendar[] }) {
  const now = useNow(60_000)
  const { data } = useConnectorSnapshot<IcsData>('ics', (prev) => fetchIcs(calendars, Date.now(), prev))
  …rest unchanged…
```

In `CalendarWidget.test.tsx`: `ev()` gains a `cal = 0` default parameter (`function ev(summary, start, end, cal = 0): IcsEvent { return { summary, start, end, cal } }`); `CONNECTED` becomes `{ enabled: true, calendars: [{ name: 'Personal', url: 'https://calendar.example.com/private-abc/basic.ics' }] }`. Add one regression case: the legacy config `{ enabled: true, url: '…' }` still renders (proves read-time migration end-to-end through the widget gate).

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/services/connectors/ics.test.ts src/newtab/widgets/calendar/CalendarWidget.test.tsx`
Expected: PASS. Then `npm test` and `npx tsc --noEmit` — the ONE remaining caller of the old signature is none (widget updated here); Connectors.tsx compiles untouched because it never calls fetchIcs.

- [ ] **Step 5: Commit**

```bash
git add src/services/connectors/ics.ts src/services/connectors/ics.test.ts src/newtab/widgets/calendar/CalendarWidget.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx
git commit -m "feat(ics): fetch fans out per calendar — one dead feed never blanks the rest"
```

---

### Task 3: Widget view modes, day tokens, dots

**Files:**
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx` (selectAgenda, formatAgendaRow, render)
- Test: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`

**Interfaces:**
- Consumes: `icsViewOf`, `CALENDAR_DOT_CLASSES` (Task 1); `IcsEvent.cal` (Task 2).
- Produces: nothing consumed later — this is the leaf. `selectAgenda(events, now, view, upcomingCount, calendarCount)` and `formatAgendaRow(ev, now)` are module-internal; `relNext` export unchanged.

- [ ] **Step 1: Write the failing tests.** Fixtures: extend the existing NOW-pinned set (NOW = Fri 2026-08-07 09:00 local) with `EVENT_MON = ev('Family lunch', new Date(2026, 7, 10, 12, 0, 0).getTime(), new Date(2026, 7, 10, 13, 0, 0).getTime(), 1)` (3 days out → weekday token) and `EVENT_FAR = ev('Dentist', new Date(2026, 7, 18, 15, 30, 0).getTime(), new Date(2026, 7, 18, 16, 0, 0).getTime(), 1)` (11 days out → date token). A two-calendar config fixture: `CONNECTED_TWO = { enabled: true, calendars: [{ name: 'Personal', url: 'https://calendar.example.com/a.ics' }, { name: 'Family', url: 'https://calendar.example.com/b.ics' }] }`. Cases:

```tsx
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
  expect(rows).toEqual(['Sat 09:00 Kickoff', 'Mon 12:00 Family lunch', 'Aug 18 15:30 Dentist'])
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
  expect(rows).toEqual(['14:00 Design review', 'Mon 12:00 Family lunch'])
})

it('with 2+ calendars every row and the headline carry that calendar’s dot; with 1 calendar no dots render', async () => {
  const storage = await seededStorage({ ...CONNECTED_TWO, view: 'upcoming', upcomingCount: 2 }, { events: [EVENT_NEXT, EVENT_MON] })
  const { unmount } = mount(storage)
  await act(async () => {})
  const section = document.querySelector('section[aria-label="Calendar"]')!
  // bg-accent = calendar 0 (headline's Standup), bg-sky-400 = calendar 1 (row).
  expect(section.querySelectorAll('.bg-accent').length).toBe(1)
  expect(section.querySelectorAll('.bg-sky-400').length).toBe(1)
  unmount()
  const single = await seededStorage(CONNECTED, { events: [EVENT_NEXT, EVENT_B] })
  mount(single)
  await act(async () => {})
  expect(document.querySelector('section[aria-label="Calendar"] .bg-accent')).toBeNull()
})

it('upcoming/per-calendar empty state says "No upcoming events."; today keeps its copy', async () => {
  const storage = await seededStorage({ ...CONNECTED_TWO, view: 'upcoming', upcomingCount: 3 }, { events: [] })
  mount(storage)
  await act(async () => {})
  expect(screen.getByText('No upcoming events.')).toBeTruthy()
})

it('a multi-day all-day event already in progress renders with the today idiom, not a past date token', async () => {
  const started = ev('Vacation', new Date(2026, 7, 6, 0, 0, 0).getTime(), new Date(2026, 7, 9, 0, 0, 0).getTime()) // Thu–Sun, spans NOW
  const storage = await seededStorage({ ...CONNECTED_TWO, view: 'upcoming', upcomingCount: 2 }, { events: [started, EVENT_NEXT] })
  mount(storage)
  await act(async () => {})
  const rows = [...document.querySelectorAll('section[aria-label="Calendar"] ul > li')].map((li) => li.textContent)
  expect(rows).toEqual(['All day · Vacation'])
})
```

Also update the existing today-mode cases only where fixtures changed (`cal` defaults keep them compiling; assertions unchanged — today mode's behavior must NOT change).

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/newtab/widgets/calendar/CalendarWidget.test.tsx`
Expected: FAIL — no view plumbing, no day tokens, no dots.

- [ ] **Step 3: Implement.** Hoist `WEEKDAY_SHORT` out of `relNext` to module scope; add `MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']`. Add:

```tsx
/** Day prefix for a row that isn't today: weekday short for the next 6
 *  days, 'Mon DD' beyond. null (no token) for anything starting today OR
 *  earlier — an in-progress multi-day event renders with the today idiom,
 *  never a past date. */
function dayToken(start: number, now: number): string | null {
  const nowDay = localDayRange(now)
  const startDay = localDayRange(start)
  const dayDiff = Math.round((startDay.start - nowDay.start) / DAY_MS)
  if (dayDiff <= 0) return null
  const d = new Date(start)
  if (dayDiff <= 6) return WEEKDAY_SHORT[d.getDay()]!
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

function formatAgendaRow(ev: IcsEvent, now: number): string {
  const token = dayToken(ev.start, now)
  if (isAllDay(ev)) return token ? `${token} · ${ev.summary}` : `All day · ${ev.summary}`
  const start = new Date(ev.start)
  const hm = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`
  return token ? `${token} ${hm} ${ev.summary}` : `${hm} ${ev.summary}`
}
```

`selectAgenda` grows the mode switch (headline selection unchanged; document that per-calendar rows follow LIST order per the spec):

```tsx
function selectAgenda(
  events: IcsEvent[],
  now: number,
  view: 'today' | 'upcoming' | 'per-calendar',
  upcomingCount: number,
  calendarCount: number,
): { next: IcsEvent | null; rows: IcsEvent[] } {
  const upcoming = events.filter((ev) => ev.end > now)
  const timed = upcoming.filter((ev) => !isAllDay(ev))
  const next = timed[0] ?? upcoming[0] ?? null
  if (!next) return { next: null, rows: [] }
  const others = upcoming.filter((ev) => ev !== next)
  if (view === 'upcoming') return { next, rows: others.slice(0, upcomingCount) }
  if (view === 'per-calendar') {
    const rows: IcsEvent[] = []
    for (let i = 0; i < calendarCount; i++) {
      const first = others.find((ev) => ev.cal === i)
      if (first) rows.push(first)
    }
    return { next, rows }
  }
  const { end: todayEnd } = localDayRange(now)
  return { next, rows: others.filter((ev) => ev.start < todayEnd).slice(0, MAX_AGENDA_ROWS) }
}
```

`CalendarWidget` passes `view` down: `const { view, upcomingCount } = icsViewOf(ics)` before the gate, `<CalendarInner … view={view} upcomingCount={upcomingCount} />` (add both to the remount `key` too — a mode change should also refresh: `key={[view, upcomingCount, …urls].join('\n')}`). Render: `const multi = calendars.length > 1`; dot element (used for headline and rows):

```tsx
const dot = (cal: number) => (
  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${CALENDAR_DOT_CLASSES[cal % CALENDAR_DOT_CLASSES.length]}`} />
)
```

Headline becomes a flex row (`<p className="flex min-w-0 items-center gap-1.5 text-sm dense:text-xs font-medium text-fg">{multi && dot(next.cal)}<span className="block truncate">Next: {next.summary} · {relative}</span></p>`); each `<li>` becomes `flex min-w-0 items-center gap-1.5 text-xs text-fg-muted` wrapping `{multi && dot(ev.cal)}<span className="block truncate">{formatAgendaRow(ev, nowMs)}</span>`. Empty state: `view === 'today' ? 'No more events today.' : 'No upcoming events.'`.

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/newtab/widgets/calendar/CalendarWidget.test.tsx`
Expected: PASS, including all pre-existing today-mode cases byte-identical. Then `npm test` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/newtab/widgets/calendar/CalendarWidget.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx
git commit -m "feat(calendar): three views, day tokens, per-calendar dots"
```

---

### Task 4: Settings card — named list, webcal conversion, view controls

**Files:**
- Modify: `src/settings/sections/Connectors.tsx:871-1034` (IcsBody, full replacement)
- Test: `src/settings/SettingsPanel.test.tsx:2189-~2400` (the Calendar/ics describe)

**Interfaces:**
- Consumes: `icsCalendarsOf`, `icsViewOf`, `CALENDAR_DOT_CLASSES` (Task 1); `originPattern`, `ensureOrigin`, `removeOrigin` (permissions), `originOf` (Connectors.tsx:54), `releasableOrigins` (registry), `control`, `select`, `submitBtn` (sections/shared).
- Produces: user-visible copy (exact, tests assert):
  - Add-form labels: `Name` / `Secret calendar address (ICS URL)`; name placeholder `Personal`; url placeholder unchanged (`https://calendar.google.com/calendar/ical/…/basic.ics`); button `Add`.
  - Helper: `In Apple Calendar: turn on "Public Calendar" (only the calendar's owner sees the option) and paste the webcal link here. Google/Outlook: Settings → your calendar → "Secret address in iCal format". It stays on this device.`
  - Errors: `Enter a calendar address that starts with https:// or webcal://` / `That calendar is already in the list.` / `Permission to read that calendar was denied, so nothing was saved.`
  - View control: label `Show`, options `Today` / `Upcoming` / `One per calendar`; count select aria-label `How many upcoming events`, options 2/3/4.
  - Remove button aria-label: `Remove {name}`.

- [ ] **Step 1: Write the failing tests.** Rework the Calendar describe (SettingsPanel.test.tsx:2189+) following the RSS describe's idioms in the same file. Keep the card-shell cases (heading/blurb/toggle/no-chip) untouched. Replace/extend the body cases:

  1. **webcal converts:** type name `Personal`, url `webcal://p57-caldav.icloud.com/published/2/abc`, submit → `chrome.permissions.request` called with `{ origins: ['https://p57-caldav.icloud.com/*'] }`; persisted config is `{ enabled: true, calendars: [{ name: 'Personal', url: 'https://p57-caldav.icloud.com/published/2/abc' }], view: 'today', upcomingCount: 3 }`.
  2. **http:// still rejected** with the new copy `Enter a calendar address that starts with https:// or webcal://`, nothing persisted, no permission request.
  3. **Empty name defaults:** adding with a blank name yields `Calendar 1` (then a second add yields `Calendar 2`).
  4. **Duplicate rejected:** adding the same url (even via its webcal:// spelling) shows `That calendar is already in the list.`
  5. **Cap:** with 5 calendars configured, the Add button is disabled.
  6. **Denied permission:** request resolves false → error copy, nothing persisted (mirrors the existing denial case).
  7. **List renders:** two configured calendars show their names, hosts (via `new URL(url).host`), dots (first `.bg-accent`, second `.bg-sky-400`), and `Remove Personal` / `Remove Family` buttons.
  8. **Remove revokes only when last user:** two calendars on the SAME host — removing one keeps the grant; removing the second revokes `https://…/*` (mirror the RSS same-origin case at its line ~2367 sibling and the existing ics OTHER_HOST/SAME_HOST cases at 2343-2380, adapted to list removal).
  9. **Legacy config surfaces:** seed `{ ics: { enabled: true, url: ICS_URL } }` → the list shows one entry named `Calendar` with ICS_URL's host.
  10. **View controls write immediately:** selecting `One per calendar` persists `view: 'per-calendar'` (calendars preserved); selecting `Upcoming` then `4` persists `upcomingCount: 4`.

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/settings/SettingsPanel.test.tsx`
Expected: FAIL — old single-field body.

- [ ] **Step 3: Implement.** Replace IcsBody wholesale (keep its doc-comment style; state that it now mirrors RssBody's list + ics's derived-origin save). Core:

```tsx
const MAX_CALENDARS = 5

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

function IcsBody({ config, storage }: BodyProps) {
  const ics = config as IcsConfig | undefined
  const calendars = icsCalendarsOf(ics)
  const { view, upcomingCount } = icsViewOf(ics)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const atCap = calendars.length >= MAX_CALENDARS

  // Every write rebuilds the ics entry from normalized parts — the first
  // save is the migration moment: the legacy `url` key is dropped here.
  const updateIcs = (fn: (cals: IcsCalendar[]) => IcsCalendar[], patch?: Partial<Pick<IcsConfig, 'view' | 'upcomingCount'>>) =>
    storage.update('connectors', (prev) => {
      const prevIcs = prev.ics as IcsConfig | undefined
      const v = icsViewOf(prevIcs)
      return {
        ...prev,
        ics: { enabled: true, calendars: fn(icsCalendarsOf(prevIcs)), view: v.view, upcomingCount: v.upcomingCount, ...patch },
      }
    })

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    // webcal:// is an https ICS feed behind a different scheme — normalize
    // BEFORE validation so a link pasted straight from Apple just works.
    const normalized = url.trim().replace(/^webcal:\/\//i, 'https://')
    try {
      originPattern(normalized) // synchronous — costs the gesture nothing
    } catch {
      setError('Enter a calendar address that starts with https:// or webcal://')
      return
    }
    if (calendars.some((c) => c.url === normalized)) {
      setError('That calendar is already in the list.')
      return
    }
    if (atCap) return
    // ensureOrigin is the FIRST await — gesture chain, zero awaits ahead.
    let granted: boolean
    try {
      granted = await ensureOrigin(normalized)
    } catch {
      granted = false
    }
    if (!granted) {
      setError('Permission to read that calendar was denied, so nothing was saved.')
      return
    }
    const trimmedName = name.trim()
    await updateIcs((cals) =>
      cals.some((c) => c.url === normalized) ? cals : [...cals, { name: trimmedName || `Calendar ${cals.length + 1}`, url: normalized }],
    )
    setName('')
    setUrl('')
  }

  async function handleRemove(target: string) {
    // Pre-removal record: cross-connector sharing check needs ics's own
    // config still present. Survivors come from the WRITE's result (RSS's
    // two-removals-before-rerender discipline).
    const before = await storage.get('connectors')
    const next = await updateIcs((cals) => cals.filter((c) => c.url !== target))
    const origin = originOf(target)
    if (!origin) return
    const remaining = icsCalendarsOf(next.ics as IcsConfig | undefined)
    const stillUsed = remaining.some((c) => originOf(c.url) === origin)
    if (!stillUsed && releasableOrigins('ics', before).includes(origin)) await removeOrigin(origin)
  }
  …
```

Render (inside the same bordered-body idiom the current form uses): the list `<ul>` of calendar rows (dot / name / host / Remove per the Interfaces block), the add `<form>` (Name text input id `connector-ics-name`, URL password input id `connector-ics-url` keeping `aria-describedby` error wiring, submit `Add` disabled at cap), the helper `<p>` with the exact Apple/Google copy, and the view controls row (`Show` label + select id `connector-ics-view` writing `updateIcs((c) => c, { view: value })` on change; count select rendered only when `view === 'upcoming'`, writing `{ upcomingCount: Number(value) }`). Delete the old handleSave/handleClear and the save-over-save origin-release block entirely — per-item add/remove replaces that lifecycle.

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/settings/SettingsPanel.test.tsx`
Expected: PASS. Then `npm test` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/settings/sections/Connectors.tsx src/settings/SettingsPanel.test.tsx
git commit -m "feat(ics): settings card goes multi-calendar — named list, webcal welcome, view picker"
```

---

### Task 5: Preview fixtures at true display max + visual gate

**Files:**
- Modify: `scripts/preview.mjs` (ics block, ~line 4312-4400)
- No src changes expected; layout fixes only if probes fail.

**Interfaces:**
- Consumes: everything above, through the built extension.

- [ ] **Step 1: Update the fixture to the true display max** (the fixture law: sweep at what the feature can actually render, not a comfortable middle). In the ics block's `page.evaluate` seed, replace the single-url config with FIVE calendars and a per-calendar snapshot — 1 headline + 5 rows, the maximum the widget can now produce:

```js
connectors.ics = {
  enabled: true,
  view: 'per-calendar',
  upcomingCount: 3,
  calendars: [
    { name: 'Personal', url: 'https://calendar.example.com/personal.ics' },
    { name: 'Family', url: 'https://calendar.example.com/family.ics' },
    { name: 'Work', url: 'https://calendar.example.com/work.ics' },
    { name: 'School', url: 'https://calendar.example.com/school.ics' },
    { name: 'Travel', url: 'https://calendar.example.com/travel.ics' },
  ],
}
```

with snapshot events giving every calendar an upcoming event (cal 0's soonest timed one becomes the headline; include one tomorrow event and one 10+ days out so a weekday token AND a date token are both on screen; keep the fixture's existing relative-to-`Date.now()` event construction idiom so it's date-independent). Update the block's own doc comment — it still describes the Task 54 single-feed cap story.

- [ ] **Step 2: Extend the probes.** Keep the existing today-scoping probe logic where it still applies, and add: (a) row count === 5 with per-calendar view; (b) all five dot classes present (`.bg-accent`, `.bg-sky-400`, `.bg-emerald-400`, `.bg-amber-400`, `.bg-fuchsia-400` — one each); (c) the existing gap/collision probes for the left rail still PASS at every height tier the script sweeps (the taller card pushes RSS/Vercel down the flex column — the tier gates in index.css must still hold); (d) an interaction probe per the widget quality bar: the widget's static text has no pointer cursor, and the settings card's Add/Remove/selects respond (mirror the cursor-probe idiom at preview.mjs:1170).

- [ ] **Step 3: Build and run the sweep**

Run: `npm run build:preview` then `node scripts/preview.mjs`
Expected: every ics-related line prints PASS; zero console errors; screenshots land in `screenshots/`.

- [ ] **Step 4: Eyeball the screenshots** (both themes, all tiers the script captures): dots legible on the panel surface, rows truncate rather than wrap, nothing collides. If a tier fails, fix the LAYOUT (band/tier CSS), never data-cap the feature — then re-run until PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test` and `npx tsc --noEmit` — green.

```bash
git add scripts/preview.mjs
git commit -m "test(preview): calendar sweeps at true max — five calendars, five dots, tiers hold"
```

If Step 4 forced CSS/layout changes, include those files in the commit and name them in the message.

---

## Self-Review (completed at planning time)

- Spec coverage: config/migration → T1; multi-fetch/per-feed fallback/tagging → T2; views/tokens/dots/empty states → T3; settings list/webcal/controls/permissions → T4; fixture-law sweep + visual gate → T5. Backup strip (`['url','calendars']`) → T1. Single-calendar no-dots rule → T3. Legacy-config end-to-end → T2 (widget) + T4 (settings case 9).
- Copy check: helper text, all error strings, empty states, and control labels are pinned verbatim in Task 4's Interfaces block and Task 3's assertions.
- Type consistency: `fetchIcs(calendars, windowStart, prev, fetchFn)` (T2) matches the widget call (T2) and no other caller exists; `icsCalendarsOf`/`icsViewOf`/`CALENDAR_DOT_CLASSES` names match across T1/T3/T4.
