import { useNow } from '../../../lib/hooks/useNow'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { Settings } from '../../../lib/storage/schema'
import { zoneTime } from '../../../lib/worldTime'

export default function WorldClocks() {
  // Gate BEFORE the ticking clock exists: disabled tabs (the default —
  // settings.widgets.clocks starts false) never mount useNow's interval.
  // Only useStoredKey is called out here, so Rules of Hooks stay satisfied
  // regardless of the toggle.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.clocks) return null
  return <WorldClocksInner settings={settings} />
}

function WorldClocksInner({ settings }: { settings: Settings }) {
  const [worldClocks] = useStoredKey('worldClocks')
  const now = useNow(30_000)
  if (!worldClocks || worldClocks.length === 0) return null
  return (
    <p className="mt-1 text-sm text-fg-muted">
      {worldClocks
        .map((c) => `${c.label} ${zoneTime(c.zone, settings.use24Hour, now)}`)
        .join(' · ')}
    </p>
  )
}
