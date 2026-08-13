import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useNow } from '../../../lib/hooks/useNow'
import {
  CALENDAR_DOT_CLASSES,
  fetchIcs,
  icsCalendarsOf,
  icsViewOf,
  type IcsData,
  type IcsEvent,
} from '../../../services/connectors/ics'
import type { IcsCalendar, IcsConfig } from '../../../services/connectors/types'

// The calendar widget — Task 54, the seventh connector and the second
// no-auth one (ics.ts, Task 53) to reach the newtab page. SOLID CARD as of
// Jon's darker-color ruling (this batch): it sits directly above RSS's own
// new card, and a bare-text widget above a card reads unfinished — so it now
// wears the same bg-panel-solid + rounded-2xl + shadow-lg + p-2.5 card
// language as RssWidget/GithubWidget, dropping the text-photo shadow the bare
// version used (that utility is only for text floating directly on the
// photo). This was a JUDGMENT-CALL consistency completion — Jon named the
// "news rss stuff"; the calendar is the widget one row up that would look
// half-done left bare — he can veto it. The card's chrome (p-2.5) and its
// placement are pinned against the left-column floors just like RSS's — see
// App.tsx's ics PositionedBlock and scripts/preview.mjs's ics gap probe.
//
// COMPACT-FORMAT AMENDMENT (controller ruling, this task): the brief's own
// starting spec called for up to 4 agenda rows below the "Next: …" line at
// `left-8 top-[62vh]`. Neither survived a real measurement against the
// shipped layout — top-[62vh] is Vercel's slot as of Task 51, and even a
// free band nearby is too tight for 4 text rows. The ruling that replaced
// it: cap agenda rows at TWO (not four) — a fixed, CONSTRUCTION-time cap
// (MAX_AGENDA_ROWS below), not a runtime clamp that only happens to fit
// today's fixture — placed in whichever band scripts/preview.mjs's own
// collision probe actually measures clear (see App.tsx's own comment on the
// ics PositionedBlock for the measured numbers). Arrange mode still lets a
// user drag this anywhere they prefer.
const MAX_AGENDA_ROWS = 2

const DAY_MS = 86_400_000

export default function CalendarWidget() {
  // Zero-hooks-in-the-gate split, same as every other connector widget
  // (RssWidget/CryptoWidget's own doc comments): the one useStoredKey read
  // runs every render (Rules of Hooks stay satisfied), but a disabled
  // connector, or an enabled one with no calendars yet, never mounts
  // CalendarInner and therefore never runs useConnectorSnapshot's own
  // subscribe/refresh or the 60s tick below.
  const [connectors] = useStoredKey('connectors')
  // BodyProps.config-style narrowing, same rationale as every sibling
  // widget: connectors.ics is the generic ConnectorConfig union at the type
  // level (schema.ts ties every id to the same union), but only the ics
  // connector ever writes here — one documented cast.
  const ics = connectors?.ics as IcsConfig | undefined
  // icsCalendarsOf (Task 1) is now the ONLY place that understands both
  // at-rest shapes (new `calendars` array, legacy single `url`) and defends
  // every malformed-entry edge a hand-edited/backup-restored config can hit
  // structurally — this gate just checks enabled + non-empty.
  const calendars = icsCalendarsOf(ics)
  // icsViewOf (Task 1) reads config.view/upcomingCount with the same
  // read-time-tolerance discipline as icsCalendarsOf — an absent or
  // malformed value defaults rather than throwing. Read unconditionally
  // (before the gate below) so the Rules-of-Hooks-free gate stays a single
  // early return; icsViewOf itself is a pure function, not a hook.
  const { view, upcomingCount, meetLinks } = icsViewOf(ics)
  if (!ics?.enabled || calendars.length === 0) return null
  // key: a config change (add/remove/reorder, OR a view-mode/count change)
  // REMOUNTS the inner widget so selectAgenda re-runs from a clean slate
  // against the new calendars/view. The remount ALONE does not force a
  // refetch — useConnectorSnapshot's mount effect only fetches when the
  // cached snapshot is stale or absent (its own TTL-gated contract, see
  // that hook's doc comment). What actually makes an add/remove refresh
  // immediately (and is what makes the spec's index-keyed-fallback edge
  // transient) is IcsBody (Connectors.tsx) deleting connectorSnapshots.ics
  // as part of that same write — the remounted widget then finds no
  // snapshot at all and fetches right away. A view-mode/count-only change
  // does NOT clear the snapshot (IcsBody's own clearIcsSnapshot doc
  // comment), so it remounts against the same cached data with no
  // unnecessary fetch.
  return (
    <CalendarInner
      config={ics}
      key={[view, upcomingCount, ...calendars.map((c) => c.url)].join('\n')}
      calendars={calendars}
      view={view}
      upcomingCount={upcomingCount}
      meetLinks={meetLinks}
    />
  )
}

function CalendarInner({
  config,
  calendars,
  view,
  upcomingCount,
  meetLinks,
}: {
  config: IcsConfig
  calendars: IcsCalendar[]
  view: 'today' | 'upcoming' | 'per-calendar'
  upcomingCount: number
  // Task 89 — deliberately NOT folded into CalendarWidget's own `key` above:
  // unlike view/upcomingCount/calendars (which change what selectAgenda
  // computes, so need a clean remount), meetLinks only gates whether the
  // headline's ALREADY-selected `next` event renders its Join anchor — a pure
  // render decision. A toggle flip re-renders this component with a new
  // meetLinks prop through the normal parent-rerender path (useStoredKey's
  // connectors subscription), no remount required.
  meetLinks: boolean
}) {
  // Re-render cadence: reuses the app's existing minute-scale time source
  // (useNow, exported by Clock.tsx's own module and already parameterized
  // by interval) rather than rolling a second bespoke setInterval — Clock
  // itself calls useNow(1000) for its own 1s second-hand; this widget only
  // needs to notice a MINUTE boundary crossing (relative-time text and
  // which events count as "today's remaining" don't change any faster than
  // that), so a distinct 60_000ms interval is passed. useNow's own cleanup
  // (clearInterval on unmount) covers this call too — nothing bespoke to
  // clean up here.
  const now = useNow(60_000)

  // Stale-while-refreshing, same shape as every other connector widget:
  // cached snapshot renders immediately, one refresh per mount. Date.now()
  // lives at exactly this ONE impure call boundary — fetchIcs forwards it
  // to parseIcs as `windowStart`, and parseIcs itself never calls
  // Date.now() (see ics.ts's own doc comment). `prev` carries the
  // last-known events forward through fetchIcs's own quiet-failure path.
  const { data } = useConnectorSnapshot<IcsData>('ics', config, (prev) =>
    fetchIcs(calendars, Date.now(), prev),
  )
  if (!data) return null

  const nowMs = now.getTime()
  const { next, rows } = selectAgenda(data.events, nowMs, view, upcomingCount, calendars.length)

  // Single-calendar rule (spec): with exactly one configured calendar, no
  // dots render anywhere — the color-coding only earns its keep once there's
  // more than one calendar to distinguish. `multi` gates every dot below.
  const multi = calendars.length > 1
  const dot = (cal: number) => (
    <span
      aria-hidden
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${CALENDAR_DOT_CLASSES[cal % CALENDAR_DOT_CLASSES.length]}`}
    />
  )

  if (!next) {
    return (
      <section
        aria-label="Calendar"
        className="w-72 short:w-60 xshort:w-52 rounded-2xl bg-panel-solid p-2.5 dense:p-2 text-fg shadow-lg"
      >
        <p className="text-sm dense:text-xs text-fg-muted">
          {view === 'today' ? 'No more events today.' : 'No upcoming events.'}
        </p>
      </section>
    )
  }

  const relative = isAllDay(next) ? 'All day' : relNext(nowMs, next.start)

  // Task 89 — Join visibility, the HEADLINE event only (never an agenda row —
  // rows render through formatAgendaRow below, which never touches meetUrl):
  // the connector's own meetLinks flag is on, `next` actually carries a link,
  // and its meeting is either already running or starts within 15 minutes.
  // `next.start - nowMs` goes negative once the meeting has started — still
  // <=15*60_000, so an in-progress meeting keeps showing Join until `end`.
  // !isAllDay(next) (whole-SP review finding): an all-day block's start is
  // always local midnight, deeply in the past for a multi-day event already
  // in progress, so start-now<=15min is trivially true for its ENTIRE span,
  // and selectAgenda's own fallback (see its doc comment) lets an all-day
  // event become `next` once no timed event remains — without this
  // exclusion a multi-day "Company Offsite" with a meetUrl would show Join
  // continuously for days. Join is a real-time meeting affordance; an
  // all-day block is not a meeting you join at a moment. `relative` above
  // already computes isAllDay(next) — reused here, not recomputed.
  const showJoin = !isAllDay(next) && meetLinks && !!next.meetUrl && next.start - nowMs <= 15 * 60_000 && nowMs < next.end

  return (
    <section
      aria-label="Calendar"
      className="w-72 short:w-60 xshort:w-52 rounded-2xl bg-panel-solid p-2.5 dense:p-2 text-fg shadow-lg"
    >
      <p className="flex min-w-0 items-center gap-1.5 text-sm dense:text-xs font-medium text-fg">
        {multi && dot(next.cal)}
        {/* min-w-0 (not just the row's own): with the Join anchor as a shrink-0
            sibling, this span must be free to shrink below its own content
            width for `truncate` to actually bite — otherwise a flex item's
            default min-width:auto would push Join out past the card edge
            before the title ever gives up space. */}
        <span className="block min-w-0 truncate">
          Next: {next.summary} · {relative}
        </span>
        {showJoin && (
          <a
            href={next.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 cursor-pointer text-accent transition-colors hover:text-accent/80 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            Join
          </a>
        )}
      </p>
      {rows.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {rows.map((ev) => (
            <li
              // `cal` included: the spec explicitly promises an event on two
              // calendars renders TWICE — same start+summary, different
              // cal — so start+summary alone collides (React duplicate-key
              // warning, undefined reconciliation between the two rows).
              key={`${ev.cal}-${ev.start}-${ev.summary}`}
              className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted"
            >
              {multi && dot(ev.cal)}
              <span className="block truncate">{formatAgendaRow(ev, nowMs)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The [start, start+1day) local-calendar-day window `t` falls in, as epoch
 *  ms bounds. Built from LOCAL date components (not `t - (t % DAY_MS)`), so
 *  it's correct across DST — the runtime's own local Date arithmetic
 *  resolves "midnight" for whatever offset that calendar day actually has,
 *  including a 23h or 25h one. */
function localDayRange(t: number): { start: number; end: number } {
  const d = new Date(t)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return { start, end: start + DAY_MS }
}

/** ics.ts's own IcsEvent carries no explicit all-day flag (its expander only
 *  ever emits start/end epochs — see that file's own IcsEvent doc comment),
 *  so this infers it from the shape an all-day occurrence always has: a
 *  start at exact local midnight, spanning a whole number of 24h days. A
 *  timed event that happens to start at exactly local midnight for a whole
 *  number of days is indistinguishable from a real all-day one by this
 *  heuristic — an accepted, vanishingly rare edge case, not a silently
 *  swallowed one. */
function isAllDay(ev: IcsEvent): boolean {
  const start = new Date(ev.start)
  const midnight =
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    start.getSeconds() === 0 &&
    start.getMilliseconds() === 0
  const span = ev.end - ev.start
  return midnight && span > 0 && span % DAY_MS === 0
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Short weekday names, Sunday-first (Date#getDay() indexing) — hoisted to
// module scope (was local to relNext) so dayToken can share the one array
// rather than each function carrying its own copy.
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

/** `{token} · {summary}` (or bare `All day · {summary}` for today) for an
 *  all-day row, else `{token} HH:MM {summary}` (or bare `HH:MM {summary}`
 *  for today) — the brief's own literal examples ('09:30 Standup', 'All day
 *  · {summary}', 'Sat 09:00 Kickoff', 'Aug 18 15:30 Dentist'). Deliberately a
 *  FIXED 24h zero-padded clock here, not settings.use24Hour (unlike
 *  Clock.tsx's own formatClock): this widget renders no other connector's
 *  cards ever read app settings for their own formatting either
 *  (CryptoWidget/VercelWidget format independently of them too), and every
 *  one of the brief's literal examples is already in that exact zero-padded
 *  24h shape. */
function formatAgendaRow(ev: IcsEvent, now: number): string {
  const token = dayToken(ev.start, now)
  if (isAllDay(ev)) return token ? `${token} · ${ev.summary}` : `All day · ${ev.summary}`
  const start = new Date(ev.start)
  const hm = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`
  return token ? `${token} ${hm} ${ev.summary}` : `${hm} ${ev.summary}`
}

/** Pure selection over an ALREADY-sorted-ascending event list (ics.ts's own
 *  contract): `next` is the earliest UPCOMING event that isn't all-day (an
 *  all-day event always starts at local midnight — the earliest possible
 *  instant of whichever day it's active — so picking strictly-by-start would
 *  make it "Next" on every day it's active, which reads wrong: "Next:
 *  Company Holiday · All day" is a worse headline than seeing the holiday as
 *  an agenda row and the next REAL appointment as the headline). Falls back
 *  to the earliest upcoming event of any kind (including all-day) only when
 *  no timed one remains, so a day that's ALL-DAY-only still shows something
 *  rather than the empty state. Headline selection is the SAME across all
 *  three view modes — only `rows` varies by `view`:
 *
 *   - 'today' (unchanged behavior): up to MAX_AGENDA_ROWS other upcoming
 *     events that overlap TODAY's local calendar day (`ev.start < todayEnd`
 *     — not `next` itself), in their already-ascending order. All-day events
 *     sort first among them FOR FREE (their start is local midnight, earlier
 *     than any timed event that day), so no separate all-day-priority sort
 *     step is needed — see the brief's own "All-day events render … first"
 *     line.
 *   - 'upcoming': the next `upcomingCount` other upcoming events regardless
 *     of day, in ascending order — the day tokens (dayToken/formatAgendaRow)
 *     are what make a multi-day list readable.
 *   - 'per-calendar': each calendar's own soonest not-already-shown event
 *     (i.e. excluding `next`), ONE row per calendar, in calendar-INDEX order
 *     (0, 1, 2, …) — not chronological order across calendars. A calendar
 *     with nothing left upcoming simply contributes no row. */
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

/** now/start both epoch ms, both read in the LOCAL runtime timezone —
 *  forward-looking sibling to vercel.ts's own relAge (same floor-to-largest-
 *  unit idiom), with two calendar-aware upgrades an AGE never needs (an age
 *  is always in the past, so "today vs tomorrow" never arises there):
 *
 *   - under 60s (or already started/negative): 'now' — an event this close
 *     or already in progress isn't meaningfully counted down.
 *   - under 60 MINUTES: 'in {n} min', regardless of whether that crosses a
 *     midnight boundary — "in 10 min" beats "tomorrow 00:05" for something
 *     that's 10 minutes away, even if the clock just ticked over.
 *   - 60+ minutes away, same LOCAL calendar day as `now`: 'in {n} h'
 *     (floored — always >=1 by construction, since the branch above already
 *     claimed everything under 60 minutes).
 *   - 60+ minutes away, the NEXT local calendar day: 'tomorrow HH:MM'.
 *   - two or more local calendar days out: '{Weekday} HH:MM' — the same
 *     idiom one step further, rather than open-ended day counting.
 *
 *  Calendar-day math goes through local MIDNIGHT instants (localDayRange),
 *  not `Math.floor(diffMs / DAY_MS)`: a raw ms-per-day division misdates a
 *  DST-transition day (23h/25h long) by up to a day; comparing local
 *  midnights and rounding the result absorbs that (a 23h or 25h "day" still
 *  rounds to exactly 1). PURE — the widget's own render supplies `now`. */
export function relNext(now: number, start: number): string {
  const diffMs = start - now
  if (diffMs < 60_000) return 'now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `in ${diffMin} min`

  const nowDay = localDayRange(now)
  if (start < nowDay.end) return `in ${Math.floor(diffMs / 3_600_000)} h`

  const startDay = localDayRange(start)
  const dayDiff = Math.round((startDay.start - nowDay.start) / DAY_MS)
  const hh = pad2(new Date(start).getHours())
  const mm = pad2(new Date(start).getMinutes())
  if (dayDiff === 1) return `tomorrow ${hh}:${mm}`
  return `${WEEKDAY_SHORT[new Date(start).getDay()]} ${hh}:${mm}`
}
