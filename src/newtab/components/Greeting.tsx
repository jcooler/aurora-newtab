import { greetingFor } from '../../lib/clock'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function Greeting() {
  const [settings] = useStoredKey('settings')
  const now = useNow(30_000)
  if (!settings) return null
  return (
    <p className="text-photo font-display mt-2 short:mt-0.5 xshort:mt-0.5 text-4xl short:text-2xl xshort:text-lg font-medium text-fg">
      {greetingFor(now.getHours(), settings.name)}
    </p>
  )
}
