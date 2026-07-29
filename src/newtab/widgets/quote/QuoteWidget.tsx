import quotes from '../../../assets/quotes.json'
import { dayHash, todayKey } from '../../../lib/dates'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'

export default function QuoteWidget() {
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.quote || quotes.length === 0) return null
  const quote = quotes[dayHash(todayKey()) % quotes.length]
  return (
    <figure className="mx-auto max-w-xl px-16 text-center">
      <blockquote className="text-photo text-base font-medium text-fg">&ldquo;{quote.text}&rdquo;</blockquote>
      <figcaption className="text-photo mt-1 text-sm font-normal text-fg-muted">— {quote.author}</figcaption>
    </figure>
  )
}
