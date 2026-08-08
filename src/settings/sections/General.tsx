import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../../lib/storage/schema'
import { row, label, control } from './shared'

// The default panel surface color — themes.css's :root --panel-solid base is
// rgb(10 10 10), i.e. #0a0a0a — shown in the swatch when the user hasn't picked
// one (settings.panelColor is null).
const DEFAULT_PANEL_HEX = '#0a0a0a'
// Live-drag writes are debounced so dragging the native picker doesn't storm
// storage; the final value ALSO commits immediately on the picker's own
// `change`. Deep-equal writes are no-ops at the storage layer (memoryDriver /
// chrome.storage both dedupe), so the debounced trailing write and the commit
// never fight even when they carry the same color.
const PANEL_COLOR_DEBOUNCE_MS = 150

/** Profile, Appearance (the widget-color customizer), and Clock-and-units —
 *  the three sections that read/write plain `Settings` fields directly, with no
 *  section-local async state of their own. `settings`/`patch` are owned by
 *  SettingsPanel (shared across this and the Widgets section) and flow down as
 *  props; the color picker's debounce/commit machinery is section-local and
 *  lives entirely here. */
export default function General({
  settings,
  patch,
}: {
  settings: Settings
  patch: (p: Partial<Settings>) => void
}) {
  // patch is a fresh closure each render; read it through a ref so the
  // commit-on-`change` effect below can stay mount-once (register/unregister
  // exactly once) rather than re-subscribing on every render — same idiom
  // NotesPanel uses for its flush-on-unmount.
  const patchRef = useRef(patch)
  patchRef.current = patch

  const effectiveHex = settings.panelColor ?? DEFAULT_PANEL_HEX
  // Local draft so dragging the native picker isn't snapped back by the
  // controlled `value` before the (debounced) write lands; re-synced whenever
  // the stored value actually changes — our own commit, Reset, or another tab.
  const [draftHex, setDraftHex] = useState(effectiveHex)
  useEffect(() => {
    setDraftHex(effectiveHex)
  }, [effectiveHex])

  const colorInputRef = useRef<HTMLInputElement>(null)
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearWriteTimer() {
    if (writeTimer.current !== null) {
      clearTimeout(writeTimer.current)
      writeTimer.current = null
    }
  }

  // Debounced live write during a drag — the picker's `input` stream surfaces
  // as React's onChange for a color input.
  function onColorInput(hex: string) {
    setDraftHex(hex)
    clearWriteTimer()
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null
      patchRef.current({ panelColor: hex })
    }, PANEL_COLOR_DEBOUNCE_MS)
  }

  // Final commit when the picker closes (its native `change` event): write now
  // and cancel any pending debounce. Mount-once (patch read via patchRef); also
  // clears a leaked debounce timer on unmount.
  useEffect(() => {
    const el = colorInputRef.current
    if (!el) return
    const onCommit = () => {
      clearWriteTimer()
      patchRef.current({ panelColor: el.value })
    }
    el.addEventListener('change', onCommit)
    return () => {
      el.removeEventListener('change', onCommit)
      clearWriteTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once; patch is read via patchRef
  }, [])

  function resetColor() {
    clearWriteTimer()
    patchRef.current({ panelColor: null })
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
          <span className={label} id="panel-color-label">
            Widget color
          </span>
          <div className="flex items-center gap-3">
            {/* The visible 28px swatch IS the label: clicking it opens the
                native picker (the real <input type="color"> is visually hidden
                but keyboard-reachable and label-associated). `peer` on the
                input lets the swatch carry the focus ring. */}
            <label
              htmlFor="set-panel-color"
              className="relative inline-flex size-7 cursor-pointer items-center justify-center rounded-full"
            >
              <input
                ref={colorInputRef}
                id="set-panel-color"
                type="color"
                aria-label="Widget color"
                value={draftHex}
                onChange={(e) => onColorInput(e.currentTarget.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                style={{ backgroundColor: draftHex }}
                className="size-7 rounded-full border border-white/25 shadow-inner shadow-black/30 transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-transparent"
              />
            </label>
            {/* Quiet Reset, present only when a color is actually set (null =
                the default surface, nothing to reset). */}
            {settings.panelColor !== null && (
              <button
                type="button"
                aria-label="Reset widget color"
                onClick={resetColor}
                className="rounded-full px-2 py-1 text-xs text-fg-muted transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <p className="pb-2 text-xs text-fg-muted">Tints every widget. Text adapts automatically.</p>
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
