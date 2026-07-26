import { useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { describeCode } from '../../../services/weather/codes'
import { rainCallout } from '../../../services/weather/callout'
import { displayTemp } from '../../../services/weather/units'
import LocationSetup from './LocationSetup'
import { useWeather } from './useWeather'

export default function WeatherWidget() {
  const [settings] = useStoredKey('settings')
  const [location] = useStoredKey('location')
  const { snapshot, stale, loading, error, refresh } = useWeather()
  const [expanded, setExpanded] = useState(false)

  if (!settings?.widgets.weather) return null

  return (
    <section
      aria-label="Weather"
      className="fixed right-4 top-4 max-w-64 rounded-panel border border-panel-border bg-panel p-3 text-fg backdrop-blur-[var(--panel-blur)]"
    >
      {location === null && <LocationSetup />}
      {location && !snapshot && (
        <p className="text-sm text-fg-muted">{error ?? (loading ? 'Loading weather…' : 'No data yet.')}</p>
      )}
      {location && snapshot && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden className="text-2xl">
              {describeCode(snapshot.current.code).icon}
            </span>
            <span className="text-2xl font-light">
              {displayTemp(snapshot.current.tempC, settings.units)}
            </span>
            <span className="text-sm text-fg-muted">
              {describeCode(snapshot.current.code).label} · {snapshot.locationLabel}
            </span>
          </button>
          {rainCallout(snapshot.hourly, settings.use24Hour) && (
            <p className="text-sm text-accent">
              {rainCallout(snapshot.hourly, settings.use24Hour)}
            </p>
          )}
          {expanded && (
            <ol className="mt-1 flex gap-2 overflow-x-auto pb-1" aria-label="Hourly forecast">
              {snapshot.hourly.map((h) => (
                <li key={h.time} className="flex min-w-10 flex-col items-center text-xs">
                  <span className="text-fg-muted">{h.time.slice(11, 13)}</span>
                  <span aria-hidden>{describeCode(h.code).icon}</span>
                  <span>{displayTemp(h.tempC, settings.units)}</span>
                  <span className="text-fg-muted">{h.precipProb}%</span>
                </li>
              ))}
            </ol>
          )}
          {(stale || error) && (
            <button
              type="button"
              onClick={() => void refresh()}
              className="self-start text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {error ? 'Offline — showing cached · retry' : 'Updated a while ago · refresh'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
