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
      className="text-photo font-display text-[clamp(6rem,12vw,10rem)] font-medium tabular-nums tracking-[-0.02em]"
    >
      {formatClock(now, settings.use24Hour)}
    </time>
  )
}
