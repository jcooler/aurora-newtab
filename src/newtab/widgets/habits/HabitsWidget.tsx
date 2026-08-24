import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useStorage } from '../../../lib/storage/context'
import { streak, toggleDay } from '../../../lib/habits'
import type { Habit } from '../../../lib/storage/schema'
import DockLine from '../shared/DockLine'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import TierFrame from '../shared/TierFrame'
import type { WidgetPresentationMode } from '../../widgetRenderers'

// The approved Compact frame shows four readable controls in a 2x2 list.
// Completion and streak calculations still include every stored habit, so an
// imported over-cap list cannot make the frame overflow or lose its true total.
const MAX_VISIBLE_HABITS = 4

export default function HabitsWidget({
  docked,
  canvasSize = 'compact',
  presentation = 'free',
}: { docked?: boolean; canvasSize?: CanvasSize; presentation?: WidgetPresentationMode } = {}) {
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
  return <HabitsInner habits={habits} docked={docked} canvasSize={canvasSize} presentation={presentation} />
}

function HabitsInner({
  habits,
  docked,
  canvasSize,
  presentation,
}: { habits: Habit[]; docked?: boolean; canvasSize: CanvasSize; presentation: WidgetPresentationMode }) {
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

  const visible = habits.slice(0, MAX_VISIBLE_HABITS)
  const doneToday = habits.filter((habit) => habit.log.includes(todayKey)).length
  const completion = Math.round((doneToday / habits.length) * 100)
  const longestStreak = Math.max(0, ...habits.map((habit) => streak(habit.log, todayKey)))
  return (
    <TierFrame label="Habits" tier={canvasSize === 'compact' ? canvasSize : 'compact'} state="ready" className="gap-1.5 p-3">
      <header className="flex min-h-4 items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]">Habits</h2>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2.5">
        <span
          role="img"
          aria-label={`${doneToday} of ${habits.length} habits complete today`}
          data-habits-progress={completion}
          data-habits-presentation={presentation}
          className="grid size-14 shrink-0 place-items-center rounded-full p-1.5"
          style={{ background: `conic-gradient(var(--accent) ${completion}%, color-mix(in srgb, var(--fg-muted) 28%, transparent) 0)` }}
        >
          <span
            aria-hidden="true"
            className="grid size-11 place-content-center rounded-full bg-panel-solid text-center"
          >
            <strong className="font-mono text-xs font-semibold leading-none text-fg">{doneToday}/{habits.length}</strong>
            <span className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-fg-muted">today</span>
          </span>
        </span>
        <div className="grid min-w-0 content-center gap-1">
          <div data-habits-grid="" className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-1">
            {visible.map((h) => {
              const todayDone = h.log.includes(todayKey)
              return (
                <button
                  key={h.id}
                  type="button"
                  aria-pressed={todayDone}
                  onClick={() => toggleToday(h.id)}
                  className="flex min-h-[22px] min-w-0 cursor-pointer items-center gap-1 rounded-sm text-left text-[11px] focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full border ${todayDone ? 'border-accent bg-accent' : 'border-fg-muted'}`}
                  />
                  <span title={h.name} className="min-w-0 flex-1 truncate font-medium text-fg">
                    {h.name}
                  </span>
                </button>
              )
            })}
          </div>
          <span data-stage-text-tier="metadata" className="font-mono text-[11px] text-fg-muted">
            {longestStreak} day streak
          </span>
        </div>
      </div>
    </TierFrame>
  )
}
