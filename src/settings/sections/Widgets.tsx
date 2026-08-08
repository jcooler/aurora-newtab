import { useState } from 'react'
import { ensureBookmarksPermission } from '../../services/bookmarks'
import type { AuroraStorage } from '../../lib/storage/index'
import type { Habit, Settings, WidgetToggles } from '../../lib/storage/schema'
import { row, label, control } from './shared'

const WIDGET_LABELS: Record<keyof WidgetToggles, string> = {
  search: 'Search bar',
  weather: 'Weather',
  links: 'Quick links',
  todo: 'To-do lists',
  timer: 'Focus timer',
  quote: 'Daily quote',
  bookmarks: 'Bookmarks bar',
  notes: 'Notes',
  clocks: 'World clocks',
  countdown: 'Countdown',
  habits: 'Habits',
  monthCal: 'Month calendar',
}

// Editor-side cap — independent of HabitsWidget.tsx's own MAX_HABIT_CHIPS
// display cap (same widget-owns-its-cap convention as WorldClocks.tsx's
// MAX_WORLD_CLOCKS vs. WorldClocks.tsx the widget). Both happen to be 6
// today because the brief pins the widget's chip column at that count; a
// hand-edited backup can still legally exceed it (Habit's own doc comment in
// schema.ts), which is exactly why the widget re-enforces its own slice
// rather than trusting this editor's cap to hold.
const MAX_HABITS = 6

/** One checkbox per widget. `settings`/`patch` are shared with General
 *  (SettingsPanel owns the underlying useStoredKey call); the bookmarks
 *  permission-denied flag is section-local — nothing outside this toggle
 *  cares about it. */
export default function Widgets({
  settings,
  patch,
  habits,
  storage,
}: {
  settings: Settings
  patch: (p: Partial<Settings>) => void
  // Habits editor's own data — owned by SettingsPanel (its useStoredKey
  // read), same as WorldClocks/Countdowns' own list props, just threaded
  // through this file instead of a dedicated section component: the brief
  // scopes the habits editor to LIVE INSIDE the toggle list here rather than
  // getting its own always-mounted section file.
  habits: Habit[] | undefined
  storage: AuroraStorage
}) {
  const [bookmarksPermissionDenied, setBookmarksPermissionDenied] = useState(false)

  const updateHabits = (fn: (list: Habit[]) => Habit[]) => void storage.update('habits', fn)

  function handleAddHabit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    if (!name) return
    updateHabits((list) =>
      list.length >= MAX_HABITS
        ? list
        : [...list, { id: crypto.randomUUID(), name, createdAt: Date.now(), log: [] }],
    )
    e.currentTarget.reset()
  }

  // Every other widget toggle is a plain, synchronous patch. Bookmarks is
  // the one exception: turning it ON must first request the optional
  // 'bookmarks' permission from this click handler (a user gesture — the
  // only context Chrome will show its prompt in). Denied -> the toggle
  // stays off and an inline alert explains why; turning it back OFF never
  // needs the permission at all.
  async function handleWidgetToggle(key: keyof WidgetToggles, checked: boolean) {
    if (key === 'bookmarks' && checked) {
      // ensureBookmarksPermission can REJECT, not just resolve false (e.g.
      // the gesture context was somehow already lost by the time the
      // permission prompt would show) — without a catch here, that's an
      // unhandled promise rejection with no alert shown at all, which is
      // worse than the ordinary denial path below. Route both outcomes to
      // the same inline alert.
      let granted: boolean
      try {
        granted = await ensureBookmarksPermission()
      } catch {
        granted = false
      }
      if (!granted) {
        setBookmarksPermissionDenied(true)
        return
      }
    }
    if (key === 'bookmarks') setBookmarksPermissionDenied(false)
    patch({ widgets: { ...settings.widgets, [key]: checked } })
  }

  return (
    <section aria-label="Widgets">
      <h3 className="mb-1 text-sm font-semibold text-fg">Widgets</h3>
      {(Object.entries(WIDGET_LABELS) as [keyof WidgetToggles, string][]).map(
        ([key, widgetLabel]) => (
          <div key={key} className={row}>
            <label htmlFor={`w-${key}`} className={label}>
              {widgetLabel}
            </label>
            <input
              id={`w-${key}`}
              type="checkbox"
              checked={settings.widgets[key]}
              onChange={(e) => void handleWidgetToggle(key, e.currentTarget.checked)}
              aria-describedby={
                key === 'bookmarks' && bookmarksPermissionDenied ? 'w-bookmarks-error' : undefined
              }
              className="size-4 accent-(--accent)"
            />
          </div>
        ),
      )}
      {bookmarksPermissionDenied && (
        <p id="w-bookmarks-error" role="alert" className="text-xs text-fg-muted">
          Bookmarks permission was denied, so the widget stays off. Turn it on
          again to re-request it.
        </p>
      )}

      {/* Only mounted while the toggle above is ON (per the brief) — unlike
          World clocks/Countdowns, which stay mounted regardless so a user can
          pre-populate them before enabling the widget, habits scopes its
          editor to the toggled-on state specifically. A nested landmark
          (rather than a plain div) keeps this queryable the same way every
          other list editor on this tab is (worldClocksRegion/
          countdownsRegion in SettingsPanel.test.tsx). */}
      {settings.widgets.habits && (
        <section aria-label="Habits" className="mt-1 border-t border-panel-border pt-2">
          {(habits ?? []).map((h) => (
            <div key={h.id} className={row}>
              <label htmlFor={`habit-name-${h.id}`} className="sr-only">
                Habit name
              </label>
              <input
                id={`habit-name-${h.id}`}
                key={h.name} // remount on external change, same as World clocks/Countdowns' own rename inputs
                defaultValue={h.name}
                onBlur={(e) => {
                  const value = e.currentTarget.value.trim()
                  if (!value || value === h.name) return
                  updateHabits((list) =>
                    list.map((x) => (x.id === h.id ? { ...x, name: value } : x)),
                  )
                }}
                className={`${control} w-32`}
              />
              <button
                type="button"
                aria-label={`Remove ${h.name}`}
                onClick={() => updateHabits((list) => list.filter((x) => x.id !== h.id))}
                className="rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                ✕
              </button>
            </div>
          ))}
          {(habits?.length ?? 0) < MAX_HABITS ? (
            <form className={row} onSubmit={handleAddHabit}>
              <label htmlFor="habit-new-name" className="sr-only">
                New habit name
              </label>
              <input
                id="habit-new-name"
                name="name"
                placeholder="Habit name"
                className={`${control} w-32`}
              />
              <button
                type="submit"
                className="text-sm text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                Add
              </button>
            </form>
          ) : (
            <p className="text-xs text-fg-muted">Max 6 habits.</p>
          )}
        </section>
      )}
    </section>
  )
}
