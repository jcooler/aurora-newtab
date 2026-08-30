import { useRef } from 'react'
import { DEFAULT_BRIEFING_SOURCES, type BriefingSources, type FlowAmbience, type Settings } from '../../lib/storage/schema'
import { contrastRatio, derivedFg, relativeLuminance } from '../../lib/color'
import Section from '../Section'
import ColorPickerRow from '../ColorPickerRow'
import Switch from '../Switch'
import { row, label, control, select } from './shared'

// The default panel surface color — themes.css's :root --panel-solid base is
// rgb(10 10 10), i.e. #0a0a0a — shown in the swatch when the user hasn't picked
// one (settings.panelColor is null).
const DEFAULT_PANEL_HEX = '#0a0a0a'
// The fixed photo ink default (themes.css --canvas-fg fallback).
const DEFAULT_PHOTO_HEX = '#f5f5f4'
// Advisory floors (never blocking — the user owns the pick, and every check
// derives from the ACTUAL chosen colors, not any assumed palette): WCAG AA
// body-text contrast for widget text on the panel, and a luminance floor
// below which photo text tends to vanish into dark photographs.
const CONTRAST_FLOOR = 4.5
const PHOTO_LUMINANCE_FLOOR = 0.25

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
  // patch is a fresh closure each render; the picker rows read it through a
  // ref-backed writer so their commit listeners stay mount-once.
  const patchRef = useRef(patch)
  patchRef.current = patch

  const panelHex = settings.panelColor ?? DEFAULT_PANEL_HEX
  // What "auto" widget text currently resolves to — the panel-derived ink.
  const autoWidgetInk = derivedFg(panelHex).fg
  const effectiveWidgetInk = settings.widgetTextColor ?? autoWidgetInk
  const effectivePhotoInk = settings.photoTextColor ?? DEFAULT_PHOTO_HEX
  const widgetContrast = contrastRatio(effectiveWidgetInk, panelHex)
  const briefingSources = settings.briefingSources ?? DEFAULT_BRIEFING_SOURCES
  const patchBriefingSource = (key: keyof BriefingSources, checked: boolean) => {
    patch({ briefingSources: { ...briefingSources, [key]: checked } })
  }

  return (
    <>
      <Section title="Profile">
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
      </Section>

      <Section title="Appearance">
        <ColorPickerRow
          id="set-panel-color"
          labelText="Widget color"
          resetLabel="Reset widget color"
          stored={settings.panelColor}
          fallbackHex={DEFAULT_PANEL_HEX}
          onWrite={(hex) => patchRef.current({ panelColor: hex })}
        />
        <p className="pb-2 text-xs text-fg-muted">Tints every widget. Text adapts automatically unless you pick one below.</p>
        <ColorPickerRow
          id="set-widget-text-color"
          labelText="Widget text"
          resetLabel="Reset widget text"
          stored={settings.widgetTextColor}
          fallbackHex={autoWidgetInk}
          onWrite={(hex) => patchRef.current({ widgetTextColor: hex })}
          advisory={settings.widgetTextColor !== null && widgetContrast < CONTRAST_FLOOR ? (
            <p data-testid="widget-text-contrast-warning" className="pb-2 text-xs text-amber-300">
              Low contrast against your widget color — this text may be hard to read.
            </p>
          ) : (
            <p className="pb-2 text-xs text-fg-muted">Colors every widget's text; the softer secondary tone derives automatically.</p>
          )}
        />
        <ColorPickerRow
          id="set-photo-text-color"
          labelText="Photo text"
          resetLabel="Reset photo text"
          stored={settings.photoTextColor}
          fallbackHex={DEFAULT_PHOTO_HEX}
          onWrite={(hex) => patchRef.current({ photoTextColor: hex })}
          advisory={settings.photoTextColor !== null && relativeLuminance(settings.photoTextColor) < PHOTO_LUMINANCE_FLOOR ? (
            <p data-testid="photo-text-dark-warning" className="pb-2 text-xs text-amber-300">
              Dark colors can disappear against dark photos.
            </p>
          ) : (
            <p className="pb-2 text-xs text-fg-muted">Colors the clock, greeting, quote, and other text on the photo.</p>
          )}
        />
        <details className="pb-2">
          <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">
            Per-element photo colors
          </summary>
          <div className="mt-1 flex flex-col">
            <ColorPickerRow
              id="set-photo-clock-color"
              labelText="Clock color"
              resetLabel="Reset clock color"
              stored={settings.photoClockColor}
              fallbackHex={effectivePhotoInk}
              onWrite={(hex) => patchRef.current({ photoClockColor: hex })}
            />
            <ColorPickerRow
              id="set-photo-greeting-color"
              labelText="Greeting color"
              resetLabel="Reset greeting color"
              stored={settings.photoGreetingColor}
              fallbackHex={effectivePhotoInk}
              onWrite={(hex) => patchRef.current({ photoGreetingColor: hex })}
            />
            <ColorPickerRow
              id="set-photo-quote-color"
              labelText="Quote color"
              resetLabel="Reset quote color"
              stored={settings.photoQuoteColor}
              fallbackHex={effectivePhotoInk}
              onWrite={(hex) => patchRef.current({ photoQuoteColor: hex })}
            />
          </div>
        </details>
        <div className={row}>
          <label htmlFor="set-text-size" className={label}>
            Text size
          </label>
          <select
            id="set-text-size"
            aria-describedby="set-text-size-description"
            value={settings.layoutDensity === 'compact' ? 'balanced' : settings.layoutDensity}
            onChange={(event) => patch({ layoutDensity: event.currentTarget.value as Settings['layoutDensity'] })}
            className={`${select} w-36`}
          >
            <option value="auto">Automatic</option>
            <option value="balanced">Standard</option>
            <option value="spacious">Large</option>
          </select>
        </div>
        <p id="set-text-size-description" className="pb-2 text-xs text-fg-muted">
          Automatic uses larger type on larger displays.
        </p>
      </Section>

      <Section title="Clock, Flow, and units">
        <div className={row}>
          <label htmlFor="set-24h" className={label}>
            24-hour clock
          </label>
          <Switch
            id="set-24h"
            checked={settings.use24Hour}
            onChange={(checked) => patch({ use24Hour: checked })}
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
            className={select}
          >
            <option value="metric">Celsius</option>
            <option value="imperial">Fahrenheit</option>
          </select>
        </div>
        <div className={row}>
          <label htmlFor="set-timer-sound" className={label}>
            Timer completion sound
          </label>
          <Switch
            id="set-timer-sound"
            checked={!settings.muted}
            onChange={(checked) => patch({ muted: !checked })}
          />
        </div>
        <div className={row}>
          <label htmlFor="set-flow-ambience" className={label}>
            Flow sound
          </label>
          <select
            id="set-flow-ambience"
            aria-describedby="set-flow-ambience-description"
            value={settings.flowAmbience}
            onChange={(event) => patch({ flowAmbience: event.currentTarget.value as FlowAmbience })}
            className={select}
          >
            <option value="off">Off</option>
            <option value="creek">Creek</option>
            <option value="rain">Rain</option>
            <option value="ocean">Ocean</option>
            <option value="forest">Forest</option>
          </select>
        </div>
        <p id="set-flow-ambience-description" className="pb-2 text-xs text-fg-muted">
          Plays your selected local sound only while the Flow timer is running.
        </p>
        <div className={row}>
          <label htmlFor="set-daily-summary" className={label}>
            Greeting helper
          </label>
          <Switch
            id="set-daily-summary"
            checked={settings.briefingEnabled === true}
            onChange={(checked) => patch({ briefingEnabled: checked })}
            describedBy="set-daily-summary-description"
          />
        </div>
        <p id="set-daily-summary-description" className="pb-2 text-xs text-fg-muted">
          Shows useful upcoming context and recent attention beneath your greeting.
        </p>
        {settings.briefingEnabled === true ? (
          <div role="group" aria-label="Greeting helper sources" className="ml-2 border-l border-panel-border pl-3">
            <div className={row}>
              <label htmlFor="set-briefing-calendar" className={label}>Upcoming calendar</label>
              <Switch
                id="set-briefing-calendar"
                checked={briefingSources.calendar}
                onChange={(checked) => patchBriefingSource('calendar', checked)}
                describedBy="set-briefing-calendar-description"
              />
            </div>
            <p id="set-briefing-calendar-description" className="pb-2 text-xs text-fg-muted">
              Shows the next useful event within 24 hours.
            </p>
            <div className={row}>
              <label htmlFor="set-briefing-assignments" className={label}>Assigned work</label>
              <Switch
                id="set-briefing-assignments"
                checked={briefingSources.assignments}
                onChange={(checked) => patchBriefingSource('assignments', checked)}
                describedBy="set-briefing-assignments-description"
              />
            </div>
            <p id="set-briefing-assignments-description" className="pb-2 text-xs text-fg-muted">
              Newly observed GitHub, GitLab, Jira, and Linear items stay here for six hours. Undated tasks are not counted.
            </p>
            <div className={row}>
              <label htmlFor="set-briefing-deployments" className={label}>Deployment failures</label>
              <Switch
                id="set-briefing-deployments"
                checked={briefingSources.deployments}
                onChange={(checked) => patchBriefingSource('deployments', checked)}
                describedBy="set-briefing-deployments-description"
              />
            </div>
            <p id="set-briefing-deployments-description" className="pb-2 text-xs text-fg-muted">
              Shows failed Vercel builds from the last six hours.
            </p>
            <div className={row}>
              <label htmlFor="set-briefing-rain" className={label}>Rain</label>
              <Switch
                id="set-briefing-rain"
                checked={briefingSources.rain}
                onChange={(checked) => patchBriefingSource('rain', checked)}
                describedBy="set-briefing-rain-description"
              />
            </div>
            <p id="set-briefing-rain-description" className="pb-2 text-xs text-fg-muted">
              Shows the first forecast hour with at least a 50% chance of rain.
            </p>
          </div>
        ) : null}
      </Section>
    </>
  )
}
