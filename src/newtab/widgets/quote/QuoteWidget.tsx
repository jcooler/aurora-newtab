import quotes from '../../../assets/quotes.json'
import { dayHash } from '../../../lib/dates'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { WidgetPresentationMode } from '../../widgetRenderers'
import TierFrame from '../shared/TierFrame'

export default function QuoteWidget({
  canvasSize = 'standard',
  presentation = 'free',
}: {
  canvasSize?: CanvasSize
  presentation?: WidgetPresentationMode
} = {}) {
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.quote || quotes.length === 0) return null
  return <DailyQuote canvasSize={canvasSize} presentation={presentation} />
}

function DailyQuote({ canvasSize, presentation }: { canvasSize: CanvasSize; presentation: WidgetPresentationMode }) {
  const { key: today } = useLocalDay()
  const quote = quotes[dayHash(today) % quotes.length]
  const figure = (
    <figure className={presentation === 'stack'
      ? `core-quote-stack__figure${quote.text.length > 180 ? ' core-quote-stack__figure--long' : ''}`
      : 'mx-auto max-w-xl narrow:max-w-sm px-16 narrow:px-6 text-center'}>
      <blockquote data-canvas-type-role="quote" data-quote-copy="" className={presentation === 'stack'
        ? 'core-quote-stack__copy'
        : 'text-photo text-base mid:text-sm short:text-sm xshort:text-xs font-medium text-canvas-fg'}>
        &ldquo;{quote.text}&rdquo;
      </blockquote>
      <figcaption data-canvas-type-role="attribution" className={presentation === 'stack'
        ? 'core-quote-stack__author'
        : 'text-photo mt-1 mid:mt-0.5 short:mt-0.5 xshort:mt-0.5 text-sm mid:text-xs short:text-xs xshort:text-xs font-normal text-canvas-fg-muted'}>
        — {quote.author}
      </figcaption>
    </figure>
  )
  if (presentation === 'stack') {
    return (
      <TierFrame label="Quote" tier={canvasSize} state="ready" className={`core-quote-stack core-quote-stack--${canvasSize}`}>
        {figure}
      </TierFrame>
    )
  }
  return (
    figure
  )
}
