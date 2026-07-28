import { useState } from 'react'
import { ensureBookmarksPermission } from '../../services/bookmarks'
import type { Settings, WidgetToggles } from '../../lib/storage/schema'
import { row, label } from './shared'

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
}

/** One checkbox per widget. `settings`/`patch` are shared with General
 *  (SettingsPanel owns the underlying useStoredKey call); the bookmarks
 *  permission-denied flag is section-local — nothing outside this toggle
 *  cares about it. */
export default function Widgets({
  settings,
  patch,
}: {
  settings: Settings
  patch: (p: Partial<Settings>) => void
}) {
  const [bookmarksPermissionDenied, setBookmarksPermissionDenied] = useState(false)

  // Every other widget toggle is a plain, synchronous patch. Bookmarks is
  // the one exception: turning it ON must first request the optional
  // 'bookmarks' permission from this click handler (a user gesture — the
  // only context Chrome will show its prompt in). Denied -> the toggle
  // stays off and an inline alert explains why; turning it back OFF never
  // needs the permission at all.
  async function handleWidgetToggle(key: keyof WidgetToggles, checked: boolean) {
    if (key === 'bookmarks' && checked) {
      const granted = await ensureBookmarksPermission()
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
      <h3 className="mb-1 text-sm font-medium text-fg">Widgets</h3>
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
    </section>
  )
}
