import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useStorage } from '../../../lib/storage/context'
import { streak, toggleDay } from '../../../lib/habits'
import type { Habit } from '../../../lib/storage/schema'
import DockLine from '../shared/DockLine'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import TierFrame from '../shared/TierFrame'

// Display cap — mirrors Widgets.tsx's own MAX_HABITS (the editor's write-side
// cap). Kept as an independent local constant, same as every other capped
// widget in this app (WorldClocks' MAX_WORLD_CLOCKS, GithubWidget's
// MAX_PRS/MAX_ISSUES): this is what makes the widget's OWN rendering capped
// "by construction" rather than merely by whatever the settings editor
// happens to enforce — a hand-edited backup can legally restore more than 6
// habits (src/lib/storage/schema.ts's own Habit doc comment says as much),
// and this slice is what keeps that case from ever rendering a 7th chip.
const MAX_HABIT_CHIPS = 6

export default function HabitsWidget({
  docked,
  canvasSize = 'compact',
}: { docked?: boolean; canvasSize?: CanvasSize } = {}) {
  // Gate BEFORE the ticking clock exists — same shape as WorldClocks/
  // BookmarksBar/TimerWidget: disabled tabs (the default — settings.widgets
  // .habits starts false) or an enabled-but-empty list never mount
  // HabitsInner, so useNow's 60s interval never starts for either case. Both
  // useStoredKey calls happen unconditionally here, every render, so Rules of
  // Hooks stay satisfied regardless of the toggle/empty state.
  //
  // Array.isArray is load-bearing, not paranoia (RssWidget's identical
  // rationale for `feeds`): backup import validates the `habits` key only
  // shape-checks the array itself (src/lib/backup.ts), but a hand-edited or
  // pre-Task-56 backup could in principle restore something else entirely —
  // this keeps that case rendering nothing instead of throwing on
  // `habits.length`.
  const [settings] = useStoredKey('settings')
  const [habits] = useStoredKey('habits')
  if (!settings?.widgets.habits || !Array.isArray(habits) || habits.length === 0) return null
  return <HabitsInner habits={habits} docked={docked} canvasSize={canvasSize} />
}

function HabitsInner({
  habits,
  docked,
  canvasSize,
}: { habits: Habit[]; docked?: boolean; canvasSize: CanvasSize }) {
  const storage = useStorage()
  // The ONE impure boundary in this widget: the coherent local-day identity.
  // The shared scheduler handles midnight, restoration, and timezone changes
  // without a permanent polling interval.
  const { key: todayKey } = useLocalDay()

  const toggleToday = (habitId: string) =>
    void storage.update('habits', (list) =>
      list.map((h) => (h.id === habitId ? { ...h, log: toggleDay(h.log, todayKey) } : h)),
    )

  // Docked tier (NL-P5 batch 2): the done-today tally as one dense fact —
  // the SAME log/todayKey membership check each chip renders, no writes.
  if (docked) {
    const doneToday = habits.filter((h) => h.log.includes(todayKey)).length
    return <DockLine label="Habits" facts={[`${doneToday}/${habits.length} today`]} />
  }

  const visible = habits.slice(0, MAX_HABIT_CHIPS)
  const doneToday = habits.filter((habit) => habit.log.includes(todayKey)).length
  return (
    <TierFrame label="Habits" tier={canvasSize === 'compact' ? canvasSize : 'compact'} state="ready" className="gap-2 p-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Habits</h2>
        <span className="text-[11px] text-fg-muted">{doneToday}/{habits.length} today</span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1.5">
      {visible.map((h) => {
        const todayDone = h.log.includes(todayKey)
        const count = streak(h.log, todayKey)
        return (
          // The WHOLE chip is the check control (per the brief) — one tap
          // marks today, a second tap unmarks it via toggleDay, and the
          // streak recomputes live off the very same log this write just
          // produced (no separate "recompute" step: `count` above is
          // derived fresh every render from `habits`, which useStoredKey
          // re-delivers the instant this storage.update's echo lands).
          <button
            key={h.id}
            type="button"
            aria-pressed={todayDone}
            onClick={() => toggleToday(h.id)}
            className="flex min-h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border border-panel-border bg-control-bg px-2 text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span
              aria-hidden
              className={`shrink-0 text-sm leading-none ${todayDone ? 'text-accent' : 'text-fg-muted/40'}`}
            >
              {todayDone ? '✓' : '○'}
            </span>
            {/* min-w-0 is load-bearing: a flex item's automatic minimum size
                is its content width unless overridden, and `truncate` sets
                `white-space: nowrap` (whose min-content IS the full string)
                — without it a long name refuses to shrink and pushes the
                chip wider than its column instead of truncating (same
                min-w-0 rationale BookmarksBar's own CHIP class documents). */}
            <span title={h.name} className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
              {h.name}
            </span>
            {count > 0 && (
              <span data-stage-text-tier="metadata" className="shrink-0 text-[11px] text-fg-muted">🔥 {count}</span>
            )}
          </button>
        )
      })}
      </div>
    </TierFrame>
  )
}
