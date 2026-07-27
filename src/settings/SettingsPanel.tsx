import { useRef } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { useStorage } from '../lib/storage/context'
import { THEMES } from '../theme/index'
import { ENGINES } from '../lib/search'
import { putUpload } from '../lib/idb'
import type { PhotoPrefs, Settings, WidgetToggles } from '../lib/storage/schema'

// Partial: WidgetToggles gains keys (bookmarks/notes/clocks/countdown) ahead
// of the widgets that back them (see Tasks 26-28) — this stays non-exhaustive
// on purpose so we don't render toggles for widgets that don't exist yet.
const WIDGET_LABELS: Partial<Record<keyof WidgetToggles, string>> = {
  search: 'Search bar',
  weather: 'Weather',
  links: 'Quick links',
  todo: 'To-do lists',
  timer: 'Focus timer',
  quote: 'Daily quote',
}

const row = 'flex items-center justify-between gap-4 py-2'
const label = 'text-sm text-fg-muted'
const control =
  'rounded border border-panel-border bg-transparent px-2 py-1 text-sm text-fg outline-none focus-visible:border-accent'

export default function SettingsPanel() {
  const storage = useStorage()
  const [settings, save] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  const [location] = useStoredKey('location')
  const themeGroupRef = useRef<HTMLDivElement>(null)
  if (!settings) return null
  const patch = (p: Partial<Settings>) => save({ ...settings, ...p })

  // APG radiogroup keyboard pattern: arrow keys move AND apply the selection
  // (this isn't a form that needs a separate "submit", so there's no reason
  // to make Left/Right merely preview a theme the user then has to commit).
  // Home/End jump to the first/last theme. Focus is moved imperatively via
  // .focus() on the target button — that works even though its tabIndex is
  // still -1 at the moment of the call, since script-driven focus ignores
  // tabIndex; the roving tabIndex only governs Tab-key navigation.
  function onThemeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!settings) return
    const currentIndex = THEMES.findIndex((t) => t.id === settings.theme)
    let nextIndex: number
    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1 + THEMES.length) % THEMES.length
        break
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + THEMES.length) % THEMES.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = THEMES.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    const next = THEMES[nextIndex]!
    patch({ theme: next.id })
    const radios = themeGroupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios?.[nextIndex]?.focus()
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Profile">
        <div className={row}>
          <label htmlFor="set-name" className={label}>
            Your name
          </label>
          <input
            id="set-name"
            key={settings.name} // remount on external change: a stale uncontrolled
            // value would otherwise be re-saved on blur, reverting another tab's rename
            defaultValue={settings.name}
            onBlur={(e) => patch({ name: e.currentTarget.value.trim() })}
            className={control}
          />
        </div>
      </section>

      <section aria-label="Appearance">
        <div className={row}>
          <span className={label} id="theme-label">
            Theme
          </span>
          <div
            role="radiogroup"
            aria-labelledby="theme-label"
            ref={themeGroupRef}
            onKeyDown={onThemeKeyDown}
            className="flex gap-2"
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={settings.theme === t.id}
                tabIndex={settings.theme === t.id ? 0 : -1}
                onClick={() => patch({ theme: t.id })}
                className={`rounded-full border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent ${
                  settings.theme === t.id
                    ? 'border-accent text-fg'
                    : 'border-panel-border text-fg-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Clock and units">
        <div className={row}>
          <label htmlFor="set-24h" className={label}>
            24-hour clock
          </label>
          <input
            id="set-24h"
            type="checkbox"
            checked={settings.use24Hour}
            onChange={(e) => patch({ use24Hour: e.currentTarget.checked })}
            className="size-4 accent-(--accent)"
          />
        </div>
        <div className={row}>
          <label htmlFor="set-units" className={label}>
            Units
          </label>
          <select
            id="set-units"
            value={settings.units}
            onChange={(e) => patch({ units: e.currentTarget.value as Settings['units'] })}
            className={control}
          >
            <option value="metric">Celsius</option>
            <option value="imperial">Fahrenheit</option>
          </select>
        </div>
        <div className={row}>
          <label htmlFor="set-engine" className={label}>
            Search engine
          </label>
          <select
            id="set-engine"
            value={settings.searchEngine}
            onChange={(e) =>
              patch({ searchEngine: e.currentTarget.value as Settings['searchEngine'] })
            }
            className={control}
          >
            {Object.entries(ENGINES).map(([id, engine]) => (
              <option key={id} value={id}>
                {engine.label}
              </option>
            ))}
          </select>
        </div>
        <div className={row}>
          <label htmlFor="set-muted" className={label}>
            Mute sounds
          </label>
          <input
            id="set-muted"
            type="checkbox"
            checked={settings.muted}
            onChange={(e) => patch({ muted: e.currentTarget.checked })}
            className="size-4 accent-(--accent)"
          />
        </div>
      </section>

      <section aria-label="Background">
        <h3 className="mb-1 text-sm font-medium text-fg">Background</h3>
        <div className={row}>
          <label htmlFor="set-bg-mode" className={label}>
            Source
          </label>
          <select
            id="set-bg-mode"
            value={photoPrefs?.mode ?? 'auto'}
            onChange={(e) =>
              photoPrefs &&
              savePhotoPrefs({ ...photoPrefs, mode: e.currentTarget.value as PhotoPrefs['mode'] })
            }
            className={control}
          >
            <option value="auto">Daily photo</option>
            <option value="upload">My photo</option>
            <option value="gradient">Gradient</option>
          </select>
        </div>
        {photoPrefs?.mode === 'upload' && (
          <div className={row}>
            <label htmlFor="set-bg-file" className={label}>
              Image file
            </label>
            <input
              id="set-bg-file"
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0]
                if (file) {
                  await putUpload(file)
                  // fresh read + changed value: a stale spread could revert concurrent
                  // writes, and a deep-equal write emits no chrome.storage event at all
                  await storage.update('photoPrefs', (p) => ({
                    ...p,
                    mode: 'upload',
                    uploadedAt: new Date().toISOString(),
                  }))
                }
              }}
              className="max-w-48 text-sm text-fg-muted file:mr-2 file:rounded file:border file:border-panel-border file:bg-transparent file:px-2 file:py-1 file:text-fg"
            />
          </div>
        )}
      </section>

      {location && (
        <section aria-label="Weather">
          <h3 className="mb-1 text-sm font-medium text-fg">Weather</h3>
          <div className={row}>
            <span className={label}>Location</span>
            <button
              type="button"
              onClick={() => {
                void storage.set('location', null)
                void storage.set('weatherCache', null)
              }}
              className="rounded border border-panel-border px-2 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {`${location.label} — clear`}
            </button>
          </div>
        </section>
      )}

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
                onChange={(e) =>
                  patch({ widgets: { ...settings.widgets, [key]: e.currentTarget.checked } })
                }
                className="size-4 accent-(--accent)"
              />
            </div>
          ),
        )}
      </section>
    </div>
  )
}
