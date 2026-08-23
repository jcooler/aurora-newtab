import { useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { monthGrid, type MonthCell } from '../../../lib/monthGrid'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { WidgetVariant } from '../../../lib/layout/types'
import TierFrame from '../shared/TierFrame'

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

export default function MonthCalWidget(
  // Size props are accepted for renderer-interface parity but content is
  // size-invariant: the complete month is Month's only composition.
  _props: {
    canvasSize?: CanvasSize
    stageVariant?: WidgetVariant
  } = {},
) {
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
  // Coherent local-day identity for the ring and current-month control. The
  // scheduler covers midnight, restoration, and runtime timezone changes.
  const { key: todayKey } = useLocalDay()
  const [todayYear, todayMonth] = todayKey.split('-').map(Number) as [number, number, number]

  // The grid opens on the hook's local calendar month. Navigation remains
  // user-owned; only the Today control re-derives from later day samples.
  const [view, setView] = useState<{ y: number; m0: number }>(() => {
    return { y: todayYear, m0: todayMonth - 1 }
  })

  const isCurrentMonth = view.y === todayYear && view.m0 === todayMonth - 1

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
  const goToday = () => setView({ y: todayYear, m0: todayMonth - 1 })

  // The complete month is Month's ONLY composition (batch-2 owner review
  // removed the compact week: "takes up way too much space, just remove
  // it"). Size props are accepted for renderer-interface parity but never
  // change what renders — a stale stored 'compact' tier or the docked size
  // fallback still gets the real month.
  const weeks = monthGrid(view.y, view.m0)
  const countdownKeys = new Set((countdowns ?? []).map((c) => c.date))
  const label = monthLabel(view.y, view.m0)

  return (
    <TierFrame label="Month" tier="standard" state="ready" className="p-3">
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
        {/* Label and conditional Today action share one fixed-height row.
            min-w-0/truncate protect the Standard frame while retaining the
            14px routine-text floor. */}
        <span className="flex min-w-0 items-center justify-center gap-1.5">
          <span data-monthcal-label aria-label={label} className="truncate text-sm font-medium text-fg">
            {label}
          </span>
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
              className="shrink-0 rounded text-[11px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
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
      <table className="mt-1 w-full border-collapse text-center">
        <caption className="sr-only">Calendar: {label}</caption>
        <thead>
          <tr>
            {WEEKDAY_INITIALS.map((initial, i) => (
              // Sunday..Saturday all need their own key; the initial alone
              // collides twice (Sun/Sat both 'S', Tue/Thu both 'T') so the
              // index is the key, not the label.
              <th key={i} scope="col" data-stage-text-tier="metadata" className="pb-0.5 text-[11px] font-normal text-fg-muted">
                {initial}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr
              key={wi}
              data-current-week={week.some((cell) => cell.key === todayKey) ? '' : undefined}
            >
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
    </TierFrame>
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
          className={`flex size-5 items-center justify-center rounded-full text-sm ${
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
