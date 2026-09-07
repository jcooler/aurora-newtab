import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { moonPhase } from '../../../lib/moon'
import type { StoredLocation } from '../../../lib/storage/schema'
import DockLine from '../shared/DockLine'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import TierFrame from '../shared/TierFrame'

export default function MoonWidget({
  docked,
  canvasSize = 'compact',
}: { docked?: boolean; canvasSize?: CanvasSize } = {}) {
  // Gate BEFORE any other hook exists — same zero-hooks-in-the-gate split as
  // SunWidget (MonthCalWidget's own doc comment): both useStoredKey reads run
  // unconditionally every render (Rules of Hooks stay satisfied), but a
  // disabled toggle or an unset location never mounts MoonInner and therefore
  // never starts the local-day lifecycle. `location` is the same weather-owned
  // StoredLocation SunWidget gates on, not the weather widget's own toggle.
  const [settings] = useStoredKey('settings')
  const [location] = useStoredKey('location')
  if (!settings?.widgets.moon || !location) return null
  return <MoonInner location={location} docked={docked} canvasSize={canvasSize} />
}

function MoonInner({
  location,
  docked,
  canvasSize,
}: { location: StoredLocation; docked?: boolean; canvasSize: CanvasSize }) {
  const { now } = useLocalDay()
  // Southern hemisphere (lat < 0) mirrors the glyph, not the name (moon.ts's
  // own doc comment).
  const phase = moonPhase(now, location.lat < 0)
  const line = `${phase.glyph} ${phase.name}`
  const illumination = Math.round(((1 - Math.cos(2 * Math.PI * phase.fraction)) / 2) * 100)

  // Docked tier (batch-2 owner review): the strip line drops the padded
  // panel — one bare dense line at the shared dock density.
  if (docked) return <DockLine label="Moon phase" facts={[line]} />

  return (
    <TierFrame label="Moon phase" tier={canvasSize === 'compact' ? canvasSize : 'compact'} state="ready" className="moon-frame">
      <h2>Moon phase</h2>
      <div className="moon-composition">
        <svg viewBox="0 0 64 64" aria-hidden style={{ transform: (phase.fraction > 0.5) !== (location.lat < 0) ? 'scaleX(-1)' : undefined }}>
          <circle cx="32" cy="32" r="24" fill="currentColor" opacity=".12" />
          <path d={`M32 8 A24 24 0 0 1 32 56 A${Math.max(.01, Math.abs(Math.cos(2 * Math.PI * phase.fraction)) * 24)} 24 0 0 ${illumination >= 50 ? 1 : 0} 32 8Z`} fill="currentColor" />
        </svg>
        <div><strong>{phase.name}</strong><span>{illumination}% illuminated</span></div>
      </div>
      <p>{location.label}</p>
    </TierFrame>
  )
}
