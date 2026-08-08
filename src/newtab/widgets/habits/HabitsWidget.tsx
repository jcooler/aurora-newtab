import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useNow } from '../../../lib/hooks/useNow'
import { useStorage } from '../../../lib/storage/context'
import { localDateKey, streak, toggleDay } from '../../../lib/habits'
import type { Habit } from '../../../lib/storage/schema'

// Display cap — mirrors Widgets.tsx's own MAX_HABITS (the editor's write-side
// cap). Kept as an independent local constant, same as every other capped
// widget in this app (WorldClocks' MAX_WORLD_CLOCKS, GithubWidget's
// MAX_PRS/MAX_ISSUES): this is what makes the widget's OWN rendering capped
// "by construction" rather than merely by whatever the settings editor
// happens to enforce — a hand-edited backup can legally restore more than 6
// habits (src/lib/storage/schema.ts's own Habit doc comment says as much),
// and this slice is what keeps that case from ever rendering a 7th chip.
const MAX_HABIT_CHIPS = 6

export default function HabitsWidget() {
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
  return <HabitsInner habits={habits} />
}

function HabitsInner({ habits }: { habits: Habit[] }) {
  const storage = useStorage()
  // The ONE impure boundary in this widget (everything habits.ts exports is
  // pure — see its own top-of-file comment): today's local date key, derived
  // from a ticking `Date`. useNow(60_000) is the shared ticking hook
  // (Clock.tsx's own use is the precedent) — a full minute is coarse enough
  // to cost nothing while still rolling the widget over local midnight
  // within 60s of it actually happening, the same tradeoff WorldClocks'
  // useNow(30_000) makes for its own display refresh.
  const now = useNow(60_000)
  const todayKey = localDateKey(now)

  const toggleToday = (habitId: string) =>
    void storage.update('habits', (list) =>
      list.map((h) => (h.id === habitId ? { ...h, log: toggleDay(h.log, todayKey) } : h)),
    )

  return (
    <div className="flex flex-col gap-2 short:gap-1.5 xshort:gap-1">
      {habits.slice(0, MAX_HABIT_CHIPS).map((h) => {
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
            className="flex cursor-pointer items-center gap-2 rounded-full border border-panel-border bg-panel px-3 py-1.5 text-left shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] focus-visible:outline-2 focus-visible:outline-accent"
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
              <span className="shrink-0 text-xs text-fg-muted">🔥 {count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
