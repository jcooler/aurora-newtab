import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { Countdown } from '../../../lib/storage/schema'
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
  if (!Array.isArray(countdowns) || countdowns.length === 0) return null

  return <PopulatedCountdownLine countdowns={countdowns} />
}

function PopulatedCountdownLine({ countdowns }: { countdowns: Countdown[] }) {
  const { key: today } = useLocalDay()
  const nearest = countdowns
    .map((c) => ({ name: c.name, days: daysUntil(c.date, today) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days)[0]
  if (!nearest) return null

  const phrase = countdownPhrase(nearest.name, nearest.days)
  if (!phrase) return null

  return (
    <p className="text-photo mt-1 mid:mt-0.5 short:mt-0.5 xshort:mt-0.5 text-base mid:text-sm short:text-sm xshort:text-xs font-medium text-accent">
      {phrase}
    </p>
  )
}
