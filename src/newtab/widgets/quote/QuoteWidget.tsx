import quotes from '../../../assets/quotes.json'
import { dayHash, todayKey } from '../../../lib/dates'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'

export default function QuoteWidget() {
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.quote || quotes.length === 0) return null
  const quote = quotes[dayHash(todayKey()) % quotes.length]
  return (
    <figure className="mx-auto max-w-xl narrow:max-w-sm px-16 narrow:px-6 text-center">
      <blockquote className="text-photo text-base short:text-sm xshort:text-xs font-medium text-fg">
        &ldquo;{quote.text}&rdquo;
      </blockquote>
      <figcaption className="text-photo mt-1 short:mt-0.5 xshort:mt-0.5 text-sm short:text-xs xshort:text-xs font-normal text-fg-muted">
        — {quote.author}
      </figcaption>
    </figure>
  )
}
