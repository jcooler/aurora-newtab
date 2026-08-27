import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { formatClock } from '../../../lib/clock'
import { sunTimes } from '../../../lib/sun'
import type { Settings, StoredLocation } from '../../../lib/storage/schema'
import DockLine from '../shared/DockLine'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import TierFrame from '../shared/TierFrame'

export default function SunWidget({
  docked,
  canvasSize = 'compact',
}: { docked?: boolean; canvasSize?: CanvasSize } = {}) {
  // Gate BEFORE any other hook exists — zero-hooks-in-the-gate split
  // (MonthCalWidget's own doc comment): both useStoredKey reads run
  // unconditionally every render (Rules of Hooks stay satisfied), but a
  // disabled toggle or an unset location never mounts SunInner and therefore
  // never starts the local-day lifecycle.
  //
  // `location` (StoredLocation | null | undefined) doubles as the gate for
  // BOTH this widget and MoonWidget — it's the weather widget's own stored
  // location, not gated on the weather TOGGLE (that toggle is irrelevant
  // here; `location` is a top-level key that outlives the weather widget).
  // `undefined` (not yet loaded) is treated the same as `null` (unset):
  // render nothing, same as every other gated widget's not-yet-loaded case.
  const [settings] = useStoredKey('settings')
  const [location] = useStoredKey('location')
  if (!settings?.widgets.sun || !location) return null
  return <SunInner settings={settings} location={location} docked={docked} canvasSize={canvasSize} />
}

function SunInner({
  settings,
  location,
  docked,
  canvasSize,
}: {
  settings: Settings
  location: StoredLocation
  docked?: boolean
  canvasSize: CanvasSize
}) {
  const { now } = useLocalDay()
  const times = sunTimes(now, location.lat, location.lon)
  // Polar day/night (no sunrise or no sunset today at this latitude): the
  // no-husk law — nothing to show today, so nothing renders, rather than an
  // empty or misleading card. The gate above decides WHETHER the widget can
  // ever show; this decides whether TODAY has anything to show.
  if (!times) return null

  const golden = times.goldenHour
    ? ` · golden hour ${formatClock(times.goldenHour, settings.use24Hour)}`
    : ''
  const primary = `☀ ${formatClock(times.sunrise, settings.use24Hour)} → ${formatClock(times.sunset, settings.use24Hour)}`

  // Docked tier (batch-2 owner review): the strip line drops the padded
  // panel entirely — one bare dense line at the shared dock density, from
  // the same derivation.
  if (docked) return <DockLine label="Sun times" facts={[primary]} />

  const tier = canvasSize === 'standard' ? 'standard' : 'compact'
  if (tier === 'compact') {
    return (
      <TierFrame label="Sun times" tier="compact" state="ready" className="justify-center p-3 text-sm">
        {primary}
        {golden && <span data-sun-golden>{golden}</span>}
      </TierFrame>
    )
  }

  const daylightMinutes = Math.max(0, Math.round((times.sunset.getTime() - times.sunrise.getTime()) / 60_000))
  const daylight = `${Math.floor(daylightMinutes / 60)}h ${daylightMinutes % 60}m`
  return (
    <TierFrame label="Sun times" tier="standard" state="ready" className="gap-3 p-4">
      <header>
        <h2 className="text-sm font-semibold">Sun times</h2>
        <p className="text-[11px] text-fg-muted">{location.label}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <p><span data-sunrise-glyph="" aria-hidden className="mr-2 text-xl text-amber-300">☀</span><span className="text-fg-muted">Sunrise</span><strong className="block font-medium">{formatClock(times.sunrise, settings.use24Hour)}</strong></p>
        <p><span data-sunset-glyph="" aria-hidden className="mr-2 text-xl text-orange-300">◓</span><span className="text-fg-muted">Sunset</span><strong className="block font-medium">{formatClock(times.sunset, settings.use24Hour)}</strong></p>
      </div>
      <div className="mt-auto flex items-center justify-between text-[11px] text-fg-muted">
        <span>Daylight {daylight}</span>
        {times.goldenHour ? <span data-sun-golden>Golden {formatClock(times.goldenHour, settings.use24Hour)}</span> : null}
      </div>
    </TierFrame>
  )
}
