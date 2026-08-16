import { useEffect, useState } from 'react'
import { collectBriefingSignals, formatBriefing, type BriefingEvent } from '../../lib/briefing'
import { useLocalDay } from '../../lib/hooks/useLocalDay'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { isIcsData, icsCalendarsOf } from '../../services/connectors/ics'
import { getConnector } from '../../services/connectors/registry'
import { connectorSnapshotScope } from '../../services/connectors/snapshotIdentity'
import type { IcsConfig } from '../../services/connectors/types'
import { weatherRequestIdentity } from '../../services/weather/identity'

const WEATHER_TTL_MS = 30 * 60 * 1000
const ICS_TTL_MS = getConnector('ics')?.ttlMs ?? 15 * 60 * 1000

interface ScopedCalendarData {
  events: BriefingEvent[]
  fetchedAt: number
}

export default function AuroraBriefing() {
  const [settings] = useStoredKey('settings')
  const [todoLists] = useStoredKey('todoLists')
  const [connectors] = useStoredKey('connectors')
  const [connectorSnapshots] = useStoredKey('connectorSnapshots')
  const [location] = useStoredKey('location')
  const [weatherCache] = useStoredKey('weatherCache')
  const localDay = useLocalDay()
  const now = useNow(60_000)
  const [calendarData, setCalendarData] = useState<ScopedCalendarData | null | undefined>(undefined)

  const ics = connectors?.ics as IcsConfig | undefined
  const icsSnapshot = connectorSnapshots?.ics

  useEffect(() => {
    let live = true
    const snapshotData = icsSnapshot?.data
    if (!ics?.enabled || icsCalendarsOf(ics).length === 0 || !icsSnapshot || !isIcsData(snapshotData)) {
      setCalendarData(null)
      return () => { live = false }
    }

    setCalendarData(undefined)
    void connectorSnapshotScope('ics', ics, { timeZone: localDay.timeZone }).then((scope) => {
      if (!live) return
      setCalendarData(icsSnapshot.scope === scope ? {
        fetchedAt: icsSnapshot.fetchedAt,
        events: snapshotData.events.map(({ summary, start, end, allDay }) => ({ summary, start, end, allDay })),
      } : null)
    }).catch(() => {
      if (live) setCalendarData(null)
    })
    return () => { live = false }
  }, [ics, icsSnapshot, localDay.timeZone])

  if (
    settings === undefined || todoLists === undefined || connectors === undefined ||
    connectorSnapshots === undefined || location === undefined || weatherCache === undefined ||
    calendarData === undefined
  ) return null

  const nowMs = now.getTime()
  const events = calendarData && nowMs - calendarData.fetchedAt < ICS_TTL_MS
    ? calendarData.events
    : []

  let hourly: { time: string; precipProb: number }[] = []
  if (location && weatherCache && nowMs - weatherCache.fetchedAt < WEATHER_TTL_MS) {
    try {
      if (weatherCache.requestIdentity === weatherRequestIdentity(location.lat, location.lon)) {
        hourly = weatherCache.hourly.map(({ time, precipProb }) => ({ time, precipProb }))
      }
    } catch {
      hourly = []
    }
  }

  const signals = collectBriefingSignals({
    now: nowMs,
    use24Hour: settings.use24Hour,
    events,
    todoLists,
    hourly,
  })

  return (
    <div data-aurora-briefing="" className="aurora-briefing text-photo text-canvas-fg-muted">
      <p data-briefing-compact="">{formatBriefing(signals, 'compact')}</p>
      <p data-briefing-standard="">{formatBriefing(signals, 'standard')}</p>
      <p data-briefing-display="">{formatBriefing(signals, 'display')}</p>
    </div>
  )
}
