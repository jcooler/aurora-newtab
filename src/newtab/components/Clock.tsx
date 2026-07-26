import { formatClock } from '../../lib/clock'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function Clock() {
  const [settings] = useStoredKey('settings')
  const now = useNow()
  if (!settings) return null
  return (
    <time
      dateTime={now.toISOString()}
      className="text-8xl font-extralight tabular-nums tracking-tight"
    >
      {formatClock(now, settings.use24Hour)}
    </time>
  )
}
