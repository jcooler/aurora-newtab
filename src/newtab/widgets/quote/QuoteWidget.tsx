import quotes from '../../../assets/quotes.json'
import { dayHash } from '../../../lib/dates'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'

export default function QuoteWidget() {
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.quote || quotes.length === 0) return null
  return <DailyQuote />
}

function DailyQuote() {
  const { key: today } = useLocalDay()
  const quote = quotes[dayHash(today) % quotes.length]
  return (
    <figure className="mx-auto max-w-xl narrow:max-w-sm px-16 narrow:px-6 text-center">
      {/* Type steps DOWN under height pressure (mid → short → xshort), the
          companion to the center column's own `mid` compression (App.tsx /
          LinksWidget): a shorter quote block + a higher links row are together
          what let the quote's old `mid:hidden` DIE — it now clears the flowing
          links row at every height instead of vanishing across 601-864 and
          reappearing below. `mid` (601-864) is disjoint from short/xshort, so
          the four type tiers (base ≥865 / mid / short / xshort) never collide
          on source order. */}
      <blockquote className="text-photo text-base mid:text-sm short:text-sm xshort:text-xs font-medium text-canvas-fg">
        &ldquo;{quote.text}&rdquo;
      </blockquote>
      <figcaption className="text-photo mt-1 mid:mt-0.5 short:mt-0.5 xshort:mt-0.5 text-sm mid:text-xs short:text-xs xshort:text-xs font-normal text-canvas-fg-muted">
        — {quote.author}
      </figcaption>
    </figure>
  )
}
