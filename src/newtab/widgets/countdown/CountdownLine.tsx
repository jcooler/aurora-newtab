import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { Countdown } from '../../../lib/storage/schema'
import { countdownPhrase, daysUntil } from '../../../lib/worldTime'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { WidgetPresentationMode } from '../../widgetRenderers'
import TierFrame from '../shared/TierFrame'

export default function CountdownLine({
  canvasSize = 'standard',
  presentation = 'free',
  docked = false,
}: {
  canvasSize?: CanvasSize
  presentation?: WidgetPresentationMode
  docked?: boolean
} = {}) {
  // Gate BEFORE reading the countdowns list: disabled tabs (the default —
  // settings.widgets.countdown starts false) never subscribe to that key.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.countdown) return null
  return <CountdownLineInner canvasSize={canvasSize} presentation={presentation} docked={docked} />
}

function CountdownLineInner({ canvasSize, presentation, docked }: { canvasSize: CanvasSize; presentation: WidgetPresentationMode; docked: boolean }) {
  const [countdowns] = useStoredKey('countdowns')
  if (!Array.isArray(countdowns) || countdowns.length === 0) {
    return presentation === 'stack' ? (
      <TierFrame label="Countdown" tier={canvasSize} state="empty" className="core-countdown-stack core-countdown-stack--empty">
        <div className="core-countdown-stack__empty"><strong>Choose a date</strong><span>Add the next moment worth counting toward.</span></div>
      </TierFrame>
    ) : null
  }

  return <PopulatedCountdownLine countdowns={countdowns} canvasSize={canvasSize} presentation={presentation} docked={docked} />
}

function PopulatedCountdownLine({ countdowns, canvasSize, presentation, docked }: { countdowns: Countdown[]; canvasSize: CanvasSize; presentation: WidgetPresentationMode; docked: boolean }) {
  const { key: today } = useLocalDay()
  const nearest = countdowns
    .map((c) => ({ name: c.name, date: c.date, days: daysUntil(c.date, today) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days)[0]
  if (!nearest) return null

  const phrase = countdownPhrase(nearest.name, nearest.days)
  if (!phrase) return null

  if (docked) {
    return <p data-dock-line="" className="dock-line"><strong>{nearest.days === 0 ? 'Today' : `${nearest.days}d`}</strong><span>{nearest.name}</span></p>
  }

  if (presentation === 'stack') {
    const value = nearest.days === 0 ? 'Today' : `${nearest.days} ${nearest.days === 1 ? 'day' : 'days'}`
    return (
      <TierFrame label="Countdown" tier={canvasSize} state="ready" className={`core-countdown-stack core-countdown-stack--${canvasSize}`}>
        <div className="core-countdown-stack__face">
          <strong data-testid="countdown-value">{value}</strong>
          <span>{nearest.name}</span>
          {canvasSize === 'standard' ? <small>{nearest.date}</small> : null}
        </div>
      </TierFrame>
    )
  }

  return (
    <p className="text-photo mt-1 mid:mt-0.5 short:mt-0.5 xshort:mt-0.5 text-base mid:text-sm short:text-sm xshort:text-xs font-medium text-accent">
      {phrase}
    </p>
  )
}
