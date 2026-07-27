import { todayKey } from '../../../lib/dates'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { countdownPhrase, daysUntil } from '../../../lib/worldTime'

export default function CountdownLine() {
  // Gate BEFORE reading the countdowns list: disabled tabs (the default —
  // settings.widgets.countdown starts false) never subscribe to that key.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.countdown) return null
  return <CountdownLineInner />
}

function CountdownLineInner() {
  const [countdowns] = useStoredKey('countdowns')
  if (!countdowns) return null

  const today = todayKey()
  const nearest = countdowns
    .map((c) => ({ name: c.name, days: daysUntil(c.date, today) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days)[0]
  if (!nearest) return null

  const phrase = countdownPhrase(nearest.name, nearest.days)
  if (!phrase) return null

  return <p className="mt-1 text-sm text-accent">{phrase}</p>
}
