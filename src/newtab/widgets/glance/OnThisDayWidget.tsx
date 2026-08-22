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
import {
  GlanceDockDetail,
  GlanceWidgetShell,
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

  const visible = canvasSize === 'full'
    ? events.slice(0, 6)
    : canvasSize === 'standard'
      ? events.slice(0, 3)
      : events.slice(0, 1)

  return (
    <GlanceWidgetShell
      title="On This Day"
      canvasSize={canvasSize}
      presentation={presentation}
      emptyLabel="No event returned for today."
      errorMessage={lastError ?? undefined}
      onRefresh={retry}
    >
      <EventList events={visible} clamp={canvasSize === 'compact'} />
      {canvasSize === 'full' && data ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <EventSection title="Born" events={data.births} />
          <EventSection title="Died" events={data.deaths} />
        </div>
      ) : null}
      {canvasSize !== 'compact' && data ? <Attribution /> : null}
    </GlanceWidgetShell>
  )
}

function EventSection({ title, events }: { title: string; events: readonly OnThisDayEvent[] }) {
  if (events.length === 0) return null
  return (
    <section aria-label={`${title} on this day`}>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h3>
      <EventList events={events} />
    </section>
  )
}

function EventList({
  events,
  clamp = false,
}: {
  events: readonly OnThisDayEvent[]
  clamp?: boolean
}) {
  if (events.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={`${event.year}-${event.text}`} className="group flex min-w-0 items-start gap-3">
          <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-accent">{event.year}</span>
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              title={clamp ? event.text : undefined}
              className={`min-w-0 text-sm leading-5 focus-visible:outline-2 focus-visible:outline-accent ${clamp ? 'overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]' : ''} ${glanceRowClass}`}
            >
              {event.text}
            </a>
          ) : (
            <span
              title={clamp ? event.text : undefined}
              className={`min-w-0 text-sm leading-5 ${clamp ? 'overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]' : ''} ${glanceRowClass}`}
            >
              {event.text}
            </span>
          )}
        </li>
      ))}
    </ul>
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
