import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useNow } from '../../../lib/hooks/useNow'
import { formatClock } from '../../../lib/clock'
import { sunTimes } from '../../../lib/sun'
import type { Settings, StoredLocation } from '../../../lib/storage/schema'

export default function SunWidget() {
  // Gate BEFORE any other hook exists — zero-hooks-in-the-gate split
  // (MonthCalWidget's own doc comment): both useStoredKey reads run
  // unconditionally every render (Rules of Hooks stay satisfied), but a
  // disabled toggle or an unset location never mounts SunInner and therefore
  // never starts useNow's interval (the WorldClocks gate-bug precedent).
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
  return <SunInner settings={settings} location={location} />
}

function SunInner({ settings, location }: { settings: Settings; location: StoredLocation }) {
  const now = useNow(60_000)
  const times = sunTimes(now, location.lat, location.lon)
  // Polar day/night (no sunrise or no sunset today at this latitude): the
  // no-husk law — nothing to show today, so nothing renders, rather than an
  // empty or misleading card. The gate above decides WHETHER the widget can
  // ever show; this decides whether TODAY has anything to show.
  if (!times) return null

  const golden = times.goldenHour
    ? ` · golden hour ${formatClock(times.goldenHour, settings.use24Hour)}`
    : ''
  const line = `☀ ${formatClock(times.sunrise, settings.use24Hour)} → ${formatClock(times.sunset, settings.use24Hour)}${golden}`

  return (
    <section
      aria-label="Sun times"
      className="w-[200px] rounded-2xl bg-panel-solid px-3 py-2.5 dense:px-2 dense:py-2 text-sm text-fg shadow-lg"
    >
      {line}
    </section>
  )
}
