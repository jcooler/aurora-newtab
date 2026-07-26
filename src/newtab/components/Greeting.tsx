import { greetingFor } from '../../lib/clock'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function Greeting() {
  const [settings] = useStoredKey('settings')
  const now = useNow(30_000)
  if (!settings) return null
  return <p className="mt-2 text-2xl font-light text-fg">{greetingFor(now.getHours(), settings.name)}</p>
}
