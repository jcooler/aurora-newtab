import { useNow } from '../../../lib/hooks/useNow'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { Settings, WorldClock } from '../../../lib/storage/schema'
import { zoneTime } from '../../../lib/worldTime'

export default function WorldClocks() {
  // Gate BEFORE the ticking clock exists: disabled tabs (the default —
  // settings.widgets.clocks starts false), or an enabled-but-empty clocks
  // widget (toggled on but no zones added yet), never mount useNow's
  // interval. Both useStoredKey calls happen unconditionally here — every
  // render, regardless of the toggle/empty state — so Rules of Hooks stay
  // satisfied.
  const [settings] = useStoredKey('settings')
  const [worldClocks] = useStoredKey('worldClocks')
  if (!settings?.widgets.clocks || !worldClocks || worldClocks.length === 0) return null
  return <WorldClocksInner settings={settings} worldClocks={worldClocks} />
}

function WorldClocksInner({
  settings,
  worldClocks,
}: {
  settings: Settings
  worldClocks: WorldClock[]
}) {
  const now = useNow(30_000)
  return (
    <p className="mt-1 text-sm text-fg-muted">
      {worldClocks
        .map((c) => `${c.label} ${zoneTime(c.zone, settings.use24Hour, now)}`)
        .join(' · ')}
    </p>
  )
}
