import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { formatClock } from '../../../lib/clock'
import { sunTimes } from '../../../lib/sun'
import type { Settings, StoredLocation } from '../../../lib/storage/schema'
import DockLine from '../shared/DockLine'

export default function SunWidget({ docked }: { docked?: boolean } = {}) {
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
  return <SunInner settings={settings} location={location} docked={docked} />
}

function SunInner({ settings, location, docked }: { settings: Settings; location: StoredLocation; docked?: boolean }) {
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

  return (
    <section
      aria-label="Sun times"
      className="w-[200px] rounded-2xl bg-panel-solid px-3 py-2.5 dense:px-2 dense:py-2 text-sm text-fg shadow-lg"
    >
      {primary}
      {golden && <span data-sun-golden>{golden}</span>}
    </section>
  )
}
