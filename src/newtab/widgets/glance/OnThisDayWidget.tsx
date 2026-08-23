import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { useStorage } from '../../../lib/storage/context'
import {
  fetchOnThisDay,
  isOnThisDayData,
  type OnThisDayData,
  type OnThisDayEvent,
} from '../../../services/connectors/onThisDay'
import type { OnThisDayConfig } from '../../../services/connectors/types'
import type { WidgetPresentationState } from '../../widgetSizeContracts'
import TierFrame from '../shared/TierFrame'
import {
  GlanceDockDetail,
  GlanceResourceBody,
  glancePresentationState,
  glanceRowClass,
} from './GlanceWidgetShell'

export default function OnThisDayWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const [connectors] = useStoredKey('connectors')
  const candidate = connectors?.onThisDay as OnThisDayConfig | undefined
  if (!candidate?.enabled) return null
  return <OnThisDayInner config={candidate} canvasSize={canvasSize} docked={docked} />
}

function OnThisDayInner({
  config,
  canvasSize,
  docked,
}: {
  config: OnThisDayConfig
  canvasSize: CanvasSize
  docked: boolean
}) {
  const storage = useStorage()
  const localDay = useLocalDay()
  const { data, state, lastError } = useConnectorSnapshot<OnThisDayData>(
    'onThisDay',
    config,
    () => fetchOnThisDay(localDay.now),
    undefined,
    localDay.key,
    isOnThisDayData,
  )
  const events = data?.events ?? []
  const presentation = glancePresentationState(true, state, data !== null && events.length === 0)
  const retry = () => {
    void storage.update('connectorSnapshots', (previous) => {
      const next = { ...previous }
      delete next.onThisDay
      return next
    })
  }
  const first = events[0]
  const details = events.slice(0, 3)

  if (docked) {
    return (
      <GlanceDockDetail
        label="On This Day"
        facts={presentation === 'hard-error'
          ? ['On This Day unavailable']
          : presentation === 'loading'
            ? ['Loading On This Day']
            : first
              ? [String(first.year), first.text]
              : ['No event today']}
        presentation={presentation}
        emptyLabel="No event returned for today."
        errorMessage={lastError ?? undefined}
        onRefresh={retry}
      >
        <EventList events={details} />
        <Attribution />
      </GlanceDockDetail>
    )
  }

  const retainedLimit = presentation === 'retained-error' ? 1 : presentation === 'stale' ? 2 : null
  const visible = retainedLimit !== null
    ? events.slice(0, retainedLimit)
    : canvasSize === 'full'
      ? events.slice(0, 3)
      : canvasSize === 'standard'
        ? events.slice(0, 3)
        : events.slice(0, 1)
  const dateLabel = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' }).format(localDay.now)
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long' }).format(localDay.now)
  const providerHref = `https://en.wikipedia.org/wiki/${monthLabel}_${localDay.now.getDate()}`
  const hasMoreContext = data !== null && (canvasSize === 'full'
    ? data.events.length > 3 || data.births.length > 1 || data.deaths.length > 1
    : canvasSize === 'standard'
      ? data.events.length > 3 || data.births.length > 0 || data.deaths.length > 0
      : data.events.length > 1 || data.births.length > 0 || data.deaths.length > 0)
  const dataBearing = presentation === 'ready' || presentation === 'stale' || presentation === 'retained-error'
  const frameState: WidgetPresentationState = presentation === 'retained-error'
    ? 'stale'
    : presentation === 'setup'
      ? 'permission-required'
      : presentation

  return (
    <TierFrame label="On This Day" tier={canvasSize} state={frameState} className="on-this-day-tier-frame">
      <header className="on-this-day-tier-header">
        <h2>On This Day</h2>
        <p>{dateLabel}</p>
      </header>
      <div className={`on-this-day-tier-content ${dataBearing ? '' : 'on-this-day-tier-state'} ${presentation === 'loading' ? 'on-this-day-tier-content--loading' : ''}`.trim()}>
        {presentation === 'loading' ? <OnThisDaySkeleton tier={canvasSize} /> : null}
        <GlanceResourceBody
          title="On This Day"
          presentation={presentation}
          emptyLabel="No event returned for today."
          errorMessage={lastError ?? undefined}
          onRefresh={retry}
        >
          <EventList
            events={visible}
            clamp={canvasSize === 'compact' || canvasSize === 'full' ? 2 : 1}
            framed
          />
          {canvasSize === 'full' && data ? (
            <div className="on-this-day-tier-sections">
              <EventSection title="Born" events={data.births.slice(0, 1)} clamp={2} framed />
              <EventSection title="Died" events={data.deaths.slice(0, 1)} clamp={2} framed />
            </div>
          ) : null}
          {hasMoreContext ? <ProviderDestination href={providerHref} /> : null}
        </GlanceResourceBody>
      </div>
    </TierFrame>
  )
}

function OnThisDaySkeleton({ tier }: { tier: CanvasSize }) {
  const rows = tier === 'compact' ? 1 : 3
  return (
    <div data-on-this-day-skeleton="" aria-hidden="true" className="on-this-day-tier-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index}><i /><b /></span>
      ))}
    </div>
  )
}

function EventSection({
  title,
  events,
  clamp,
  framed = false,
}: {
  title: string
  events: readonly OnThisDayEvent[]
  clamp?: 1 | 2
  framed?: boolean
}) {
  if (events.length === 0) return null
  return (
    <section aria-label={`${title} on this day`}>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h3>
      <EventList events={events} clamp={clamp} framed={framed} />
    </section>
  )
}

function EventList({
  events,
  clamp,
  framed = false,
}: {
  events: readonly OnThisDayEvent[]
  clamp?: 1 | 2
  framed?: boolean
}) {
  if (events.length === 0) return null
  const clampClass = clamp === 1
    ? 'overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]'
    : clamp === 2
      ? 'overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]'
      : ''
  return (
    <ul className={framed ? 'on-this-day-tier-list' : 'flex flex-col gap-2'}>
      {events.map((event) => (
        <li key={`${event.year}-${event.text}`} className={`group flex min-w-0 items-start ${framed ? 'on-this-day-tier-item' : 'gap-3'}`}>
          <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-accent">{event.year}</span>
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              title={clamp ? event.text : undefined}
              className={`min-h-9 min-w-0 text-sm leading-5 focus-visible:outline-2 focus-visible:outline-accent ${clampClass} ${glanceRowClass}`}
            >
              {event.text}
            </a>
          ) : (
            <span
              title={clamp ? event.text : undefined}
              className={`min-w-0 text-sm leading-5 ${clampClass} ${glanceRowClass}`}
            >
              {event.text}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function ProviderDestination({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="on-this-day-tier-provider min-h-9"
    >
      More on Wikipedia
    </a>
  )
}

function Attribution() {
  return (
    <a
      href="https://en.wikipedia.org/wiki/Main_Page"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
    >
      From Wikipedia
    </a>
  )
}
