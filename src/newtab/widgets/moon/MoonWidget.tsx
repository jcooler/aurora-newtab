import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { moonPhase } from '../../../lib/moon'
import type { StoredLocation } from '../../../lib/storage/schema'
import DockLine from '../shared/DockLine'

export default function MoonWidget({ docked }: { docked?: boolean } = {}) {
  // Gate BEFORE any other hook exists — same zero-hooks-in-the-gate split as
  // SunWidget (MonthCalWidget's own doc comment): both useStoredKey reads run
  // unconditionally every render (Rules of Hooks stay satisfied), but a
  // disabled toggle or an unset location never mounts MoonInner and therefore
  // never starts the local-day lifecycle. `location` is the same weather-owned
  // StoredLocation SunWidget gates on, not the weather widget's own toggle.
  const [settings] = useStoredKey('settings')
  const [location] = useStoredKey('location')
  if (!settings?.widgets.moon || !location) return null
  return <MoonInner location={location} docked={docked} />
}

function MoonInner({ location, docked }: { location: StoredLocation; docked?: boolean }) {
  const { now } = useLocalDay()
  // Southern hemisphere (lat < 0) mirrors the glyph, not the name (moon.ts's
  // own doc comment).
  const phase = moonPhase(now, location.lat < 0)
  const line = `${phase.glyph} ${phase.name}`

  // Docked tier (batch-2 owner review): the strip line drops the padded
  // panel — one bare dense line at the shared dock density.
  if (docked) return <DockLine label="Moon phase" facts={[line]} />

  return (
    <section
      aria-label="Moon phase"
      className="w-[200px] rounded-2xl bg-panel-solid px-3 py-2.5 dense:px-2 dense:py-2 text-sm text-fg shadow-lg"
    >
      {line}
    </section>
  )
}
