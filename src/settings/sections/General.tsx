import { useRef } from 'react'
import { THEMES } from '../../theme/index'
import type { Settings } from '../../lib/storage/schema'
import { row, label, control } from './shared'

/** Profile, Appearance (theme radiogroup), and Clock-and-units — the three
 *  sections that read/write plain `Settings` fields directly, with no
 *  section-local async state of their own. `settings`/`patch` are owned by
 *  SettingsPanel (shared across this and the Widgets section) and flow down
 *  as props; the theme radiogroup's ref and keyboard handler are
 *  section-local and live entirely here. */
export default function General({
  settings,
  patch,
}: {
  settings: Settings
  patch: (p: Partial<Settings>) => void
}) {
  const themeGroupRef = useRef<HTMLDivElement>(null)

  // APG radiogroup keyboard pattern: arrow keys move AND apply the selection
  // (this isn't a form that needs a separate "submit", so there's no reason
  // to make Left/Right merely preview a theme the user then has to commit).
  // Home/End jump to the first/last theme. Focus is moved imperatively via
  // .focus() on the target button — that works even though its tabIndex is
  // still -1 at the moment of the call, since script-driven focus ignores
  // tabIndex; the roving tabIndex only governs Tab-key navigation.
  function onThemeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = THEMES.findIndex((t) => t.id === settings.theme)
    let nextIndex: number
    switch (e.key) {
      // ArrowDown/ArrowUp alias Right/Left: this radiogroup lays its options
      // out horizontally, but APG allows either axis's arrows to work, and
      // some users reflexively reach for Up/Down on any roving-tabindex
      // group regardless of visual orientation.
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1 + THEMES.length) % THEMES.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
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
    <>
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
    </>
  )
}
