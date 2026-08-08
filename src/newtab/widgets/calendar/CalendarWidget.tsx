import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useNow } from '../../../lib/hooks/useNow'
import { fetchIcs, type IcsData, type IcsEvent } from '../../../services/connectors/ics'
import type { IcsConfig } from '../../../services/connectors/types'

// The calendar widget — Task 54, the seventh connector and the second
// no-auth one (ics.ts, Task 53) to reach the newtab page. Photo-floating
// TEXT, not a panel (controller ruling on the Task 54 brief): no
// bg-panel-solid/border/shadow surface, same idiom as RssWidget's headline
// rows and CryptoWidget's ticker strip.
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
  // connector, or an enabled one with no url yet, never mounts
  // CalendarInner and therefore never runs useConnectorSnapshot's own
  // subscribe/refresh or the 60s tick below.
  const [connectors] = useStoredKey('connectors')
  // BodyProps.config-style narrowing, same rationale as every sibling
  // widget: connectors.ics is the generic ConnectorConfig union at the type
  // level (schema.ts ties every id to the same union), but only the ics
  // connector ever writes here — one documented cast.
  const ics = connectors?.ics as IcsConfig | undefined
  // Gate defends BOTH shape checks a hand-edited/backup-restored config can
  // violate structurally (backup import validates only `enabled` — see
  // Connectors.tsx's own CryptoBody comment for the same discipline):
  // `typeof url === 'string'` (a stripped-then-partially-restored backup can
  // legally omit it) AND `url.length > 0` (an emptied field is not a URL).
  if (!ics?.enabled || typeof ics.url !== 'string' || ics.url.length === 0) return null
  return <CalendarInner url={ics.url} />
}

function CalendarInner({ url }: { url: string }) {
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
  const { data } = useConnectorSnapshot<IcsData>('ics', (prev) => fetchIcs(url, Date.now(), prev))
  if (!data) return null

  const nowMs = now.getTime()
  const { next, rows } = selectAgenda(data.events, nowMs)

  if (!next) {
    return (
      <section aria-label="Calendar" className="w-72 short:w-60 xshort:w-52">
        <p className="text-photo text-sm text-fg-muted">No more events today.</p>
      </section>
    )
  }

  const relative = isAllDay(next) ? 'All day' : relNext(nowMs, next.start)

  return (
    <section aria-label="Calendar" className="w-72 short:w-60 xshort:w-52">
      <p className="text-photo block truncate text-sm font-medium text-fg">
        Next: {next.summary} · {relative}
      </p>
      {rows.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {rows.map((ev) => (
            <li
              key={`${ev.start}-${ev.summary}`}
              className="text-photo block truncate text-xs text-fg-muted"
            >
              {formatAgendaRow(ev)}
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

/** `All day · {summary}` for an all-day row, else `HH:MM {summary}` — the
 *  brief's own two literal examples ('09:30 Standup', 'All day · {summary}').
 *  Deliberately a FIXED 24h zero-padded clock here, not settings.use24Hour
 *  (unlike Clock.tsx's own formatClock): this widget renders no other
 *  connector's cards ever read app settings for their own formatting either
 *  (CryptoWidget/VercelWidget format independently of them too), and both of
 *  the brief's literal examples are already in that exact zero-padded 24h
 *  shape. */
function formatAgendaRow(ev: IcsEvent): string {
  if (isAllDay(ev)) return `All day · ${ev.summary}`
  const start = new Date(ev.start)
  return `${pad2(start.getHours())}:${pad2(start.getMinutes())} ${ev.summary}`
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
 *  rather than the empty state.
 *
 *  `rows` is up to MAX_AGENDA_ROWS other upcoming events that overlap
 *  TODAY's local calendar day (`ev.start < todayEnd` — not `next` itself),
 *  in their already-ascending order. All-day events sort first among them
 *  FOR FREE (their start is local midnight, earlier than any timed event
 *  that day), so no separate all-day-priority sort step is needed — see the
 *  brief's own "All-day events render … first" line. */
function selectAgenda(events: IcsEvent[], now: number): { next: IcsEvent | null; rows: IcsEvent[] } {
  const upcoming = events.filter((ev) => ev.end > now)
  const timed = upcoming.filter((ev) => !isAllDay(ev))
  const next = timed[0] ?? upcoming[0] ?? null
  if (!next) return { next: null, rows: [] }

  const { end: todayEnd } = localDayRange(now)
  const rows = upcoming.filter((ev) => ev !== next && ev.start < todayEnd).slice(0, MAX_AGENDA_ROWS)
  return { next, rows }
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
  const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${WEEKDAY_SHORT[new Date(start).getDay()]} ${hh}:${mm}`
}
