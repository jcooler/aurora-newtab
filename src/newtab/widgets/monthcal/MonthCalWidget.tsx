import { useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useNow } from '../../../lib/hooks/useNow'
import { localDateKey } from '../../../lib/habits'
import { monthGrid, type MonthCell } from '../../../lib/monthGrid'

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] // Sunday-origin, matching monthGrid's own fixed row-0 weekday
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** month name + year, e.g. "May 2026" — the header's own display string AND
 *  (prefixed, for uniqueness against the header) the sr-only caption's. */
function monthLabel(y: number, m0: number): string {
  return `${MONTH_NAMES[m0]} ${y}`
}

export default function MonthCalWidget() {
  // Gate BEFORE any other hook exists — same "zero hooks in the gate" split
  // every other toggle-gated widget in this app uses (RssWidget/HabitsWidget
  // own doc comments): the one useStoredKey read runs unconditionally every
  // render (Rules of Hooks stay satisfied), but a disabled toggle never
  // mounts MonthCalInner and therefore never starts useNow's 60s interval.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.monthCal) return null
  return <MonthCalInner />
}

function MonthCalInner() {
  const [countdowns] = useStoredKey('countdowns')
  // Ticking "today" — the ring (and the current-month check it depends on)
  // re-derives every 60s so the widget rolls over local midnight without a
  // reload, same cadence and rationale as HabitsWidget.tsx's own useNow(60_000).
  const now = useNow(60_000)
  const todayKey = localDateKey(now)

  // The ONE mount-time impure boundary in this widget: which month the grid
  // OPENS on. A lazy initializer so `new Date()` is read exactly once, at
  // first mount — navigating with prev/next/Today below never re-reads the
  // system clock again (Today explicitly re-derives from the ticking `now`
  // above instead, so it still lands on the right month even if the widget
  // has been open across a midnight rollover).
  const [view, setView] = useState<{ y: number; m0: number }>(() => {
    const d = new Date()
    return { y: d.getFullYear(), m0: d.getMonth() }
  })

  const isCurrentMonth = view.y === now.getFullYear() && view.m0 === now.getMonth()

  // Normalize (y, m0) through Date's own rollover on EVERY step, the same
  // technique monthGrid.ts's own top-of-function normalization uses (bug
  // fix, final-review wave — probe-logged: the harness's own forcing loop,
  // walking Next enough times to cross a year boundary, is what surfaced
  // this). monthGrid(view.y, view.m0) below DOES already normalize an
  // out-of-range month0 internally (its own doc comment is correct about
  // that), so the GRID itself never broke — but `view.y`/`view.m0` are also
  // read RAW by monthLabel() and isCurrentMonth above, and neither of those
  // gets monthGrid's normalization for free. Leaving `view` itself
  // unnormalized meant `m0` could drift outside 0-11 after enough clicks
  // (December's 11+1=12 has no 13th entry in MONTH_NAMES) while `y` never
  // even incremented on the way past December — `monthLabel` would then
  // render "undefined 2026" instead of "January 2027" for a perfectly
  // ordinary sequence of Next clicks. Normalizing here, once, keeps EVERY
  // reader of `view` (this file's own label/isCurrentMonth, monthGrid) on
  // the same always-valid (0-11, carried-year) representation.
  const goPrev = () =>
    setView((v) => {
      const d = new Date(v.y, v.m0 - 1, 1)
      return { y: d.getFullYear(), m0: d.getMonth() }
    })
  const goNext = () =>
    setView((v) => {
      const d = new Date(v.y, v.m0 + 1, 1)
      return { y: d.getFullYear(), m0: d.getMonth() }
    })
  const goToday = () => setView({ y: now.getFullYear(), m0: now.getMonth() })

  const weeks = monthGrid(view.y, view.m0)
  const countdownKeys = new Set((countdowns ?? []).map((c) => c.date))
  const label = monthLabel(view.y, view.m0)

  return (
    <div className="w-[200px] rounded-2xl bg-panel-solid p-3 text-fg shadow-lg">
      {/* data-monthcal-header — a stable hook (same convention as
          data-cell-key below) for this file's own tests and the harness's
          zero-height-guarantee probe: the Today affordance (below) lives
          INSIDE this row precisely so navigating never changes ITS height,
          and both consumers need a selector for "this row" to prove that,
          not just "the widget". */}
      <div data-monthcal-header className="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label="Previous month"
          onClick={goPrev}
          className="shrink-0 rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        {/* Label + (conditionally) the Today control share ONE line in the
            header row — a fix-wave correction (final review, MERGE-
            BLOCKING): this button used to render on its OWN line below the
            header, which added 21px of card height whenever it appeared
            (i.e. on any off-current month) and silently collapsed this
            column's floor to this widget's neighbor below in an off-current
            6-row month. Living here instead means the button changes WHICH
            controls the header row contains, never how TALL the row is —
            navigating months (or the widget sitting open across a midnight
            rollover into a new month) can no longer move anything below it.
            `min-w-0` lets this flex item shrink below its content's natural
            width (the flex default is `min-width: auto`, which would
            otherwise refuse to shrink and push the Next button off the
            right edge); `truncate` on the label span (data-monthcal-label,
            below) is a defensive floor for that same squeeze, not a design
            choice — scripts/preview.mjs's own monthCal block forces the
            header to "September" (this file's own MONTH_NAMES' longest
            entry) with the Today button showing and asserts the label
            renders in FULL (`scrollWidth === clientWidth`, i.e. `truncate`
            never actually engages) and the Next button stays inside the
            card's own right edge — if a future change ever makes it
            engage, that's the signal to revisit this layout (option (a) in
            the fix-wave ledger: raise the whole widget instead of
            shrinking the header), not to let the month name silently
            clip.

            LABEL FONT DROPPED text-sm -> text-xs (App.tsx's monthCal
            PositionedBlock comment, "WIDE-CLOCK FIX") when the card itself
            narrowed 224px -> 200px to clear the clock's real forced-wide
            left edge: at the old text-sm, "September 2026" + a visible
            Today button no longer fit the narrower 176px content row
            (176px = 200px card - the p-3 padding) — scrollWidth(104) >
            clientWidth(91), i.e. `truncate` actually DID engage, exactly
            the regression this comment's own probe exists to catch. text-xs
            (already the day-cell digits' own size, two lines down) closes
            it with real margin, not a squeak-by: measured (a throwaway
            harness run, numbers not asserted anywhere) at 89.4px label +
            22px x2 chevrons + 26.9px Today = 160.3px of actual content
            against the 176px row, 15.7px of which is the row's own
            intentional gaps (gap-1 x2 + gap-1.5 here) rendering exactly as
            designed, not stretched or squeezed to fit. */}
        <span className="flex min-w-0 items-center justify-center gap-1.5">
          <span data-monthcal-label className="truncate text-xs font-medium text-fg">{label}</span>
          {/* Re-derived from the ticking `now` (not the mount-time `view`
              seed), so it's correct even across a midnight rollover while
              the widget sat open on a past/future month. This, plus the two
              chevrons, are the ENTIRE tab surface — see the a11y doc comment
              on the table below. */}
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              aria-label="Back to today"
              className="shrink-0 rounded text-[10px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Today
            </button>
          )}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={goNext}
          className="shrink-0 rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* A11y decision (spec-sanctioned lighter path, taken deliberately):
          this grid is a STATIC <table>, not an interactive ARIA grid. The
          full grid pattern (role="grid", roving tabindex across cells,
          arrow-key navigation between them) exists for widgets where a cell
          IS an action — this one has none: no cell is clickable, selectable,
          or editable, the ring/dot are purely informational, and the only
          way to change what's showing is the three buttons above (prev/
          next/Today). A native <table> with a <caption> (sr-only — sighted
          users already read the header line above it) and <th scope="col">
          weekday initials gives a screen reader everything it needs (table
          semantics, column headers announced per cell) with zero extra
          keyboard-navigation code to build or maintain, and zero risk of a
          half-implemented roving-tabindex trap. If a future task ever makes
          a cell actionable (e.g. click-to-add-event), THAT is the moment to
          upgrade to the full grid pattern — not before. */}
      <table className="mt-2 w-full border-collapse text-center">
        <caption className="sr-only">Calendar: {label}</caption>
        <thead>
          <tr>
            {WEEKDAY_INITIALS.map((initial, i) => (
              // Sunday..Saturday all need their own key; the initial alone
              // collides twice (Sun/Sat both 'S', Tue/Thu both 'T') so the
              // index is the key, not the label.
              <th key={i} scope="col" className="pb-1 text-[10px] font-normal text-fg-muted">
                {initial}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((c) => (
                <MonthCalCell
                  key={c.key}
                  cell={c}
                  isToday={isCurrentMonth && c.key === todayKey}
                  hasCountdown={countdownKeys.has(c.key)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MonthCalCell({
  cell,
  isToday,
  hasCountdown,
}: {
  cell: MonthCell
  isToday: boolean
  hasCountdown: boolean
}) {
  return (
    // data-cell-key — a stable per-day selector for the harness's own
    // interaction/collision probes and this file's tests, same convention as
    // PositionedBlock's `data-block-id`: it carries no a11y meaning (the
    // <caption>/<th scope="col"> pairing above is what a screen reader
    // actually uses), it just gives automation an unambiguous hook that
    // never collides the way querying by visible day-number text would
    // (day 15 appears at most once per grid, but day 1 can appear twice —
    // once in-month, once trailing into next month's first week).
    <td data-cell-key={cell.key} className="py-0.5">
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={`flex size-5 items-center justify-center rounded-full text-xs ${
            cell.inMonth ? 'text-fg' : 'text-fg-muted/50'
          } ${isToday ? 'ring-1 ring-accent' : ''}`}
        >
          {cell.day}
        </span>
        {/* A reserved-space placeholder (not a conditional render) when no
            countdown lands here: `invisible` keeps every row the same
            height whether or not any cell in it has a dot, so a countdown
            appearing/disappearing never reflows the grid. */}
        <span
          aria-hidden
          data-countdown-dot={hasCountdown ? '' : undefined}
          className={`size-[3px] rounded-full bg-accent ${hasCountdown ? '' : 'invisible'}`}
        />
      </div>
    </td>
  )
}
