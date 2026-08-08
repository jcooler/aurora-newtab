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

  // No modulo/bounds-checking needed on either side — monthGrid's own
  // out-of-range normalization (via Date's rollover) means passing m0-1 from
  // January (0-1=-1) or m0+1 from December (11+1=12) is already correct.
  const goPrev = () => setView((v) => ({ y: v.y, m0: v.m0 - 1 }))
  const goNext = () => setView((v) => ({ y: v.y, m0: v.m0 + 1 }))
  const goToday = () => setView({ y: now.getFullYear(), m0: now.getMonth() })

  const weeks = monthGrid(view.y, view.m0)
  const countdownKeys = new Set((countdowns ?? []).map((c) => c.date))
  const label = monthLabel(view.y, view.m0)

  return (
    <div className="w-56 rounded-2xl bg-panel-solid p-3 text-fg shadow-lg">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={goPrev}
          className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-sm font-medium text-fg">{label}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={goNext}
          className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Only rendered off the current month — snaps back to it, re-derived
          from the ticking `now` (not the mount-time `view` seed), so it's
          correct even across a midnight rollover while the widget sat open
          on a past/future month. This, plus the two chevrons above, are the
          ENTIRE tab surface — see the a11y doc comment on the table below. */}
      {!isCurrentMonth && (
        <button
          type="button"
          onClick={goToday}
          className="mt-1 text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Today
        </button>
      )}

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
