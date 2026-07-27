import { useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { describeCode } from '../../../services/weather/codes'
import { rainCallout } from '../../../services/weather/callout'
import { clockTime, compactHour, displayTemp, displayWind } from '../../../services/weather/units'
import LocationSetup from './LocationSetup'
import WeatherIcon from './WeatherIcon'
import { useWeather } from './useWeather'

export default function WeatherWidget() {
  const [settings] = useStoredKey('settings')
  const [location] = useStoredKey('location')
  const { snapshot, stale, loading, error, refresh } = useWeather()
  const [expanded, setExpanded] = useState(false)

  if (!settings?.widgets.weather) return null

  const callout = snapshot ? rainCallout(snapshot.hourly, settings.use24Hour) : null

  return (
    <section
      aria-label="Weather"
      className="fixed right-4 top-4 w-max max-w-[32rem] rounded-panel border border-panel-border bg-panel p-3 text-fg backdrop-blur-[var(--panel-blur)]"
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
            <WeatherIcon
              icon={describeCode(snapshot.current.code, snapshot.current.isDay ?? true).icon}
              size={30}
            />
            <span className="text-2xl font-light">
              {displayTemp(snapshot.current.tempC, settings.units)}
            </span>
            <span className="text-sm text-fg-muted">
              {describeCode(snapshot.current.code).label} · {snapshot.locationLabel}
            </span>
          </button>
          {callout && <p className="text-sm text-accent">{callout}</p>}
          {expanded && (
            <>
              <ol
                className="mt-2 grid auto-cols-fr grid-flow-col gap-x-1.5"
                aria-label="Hourly forecast"
              >
                {snapshot.hourly.map((h) => (
                  <li key={h.time} className="flex flex-col items-center gap-0.5 text-xs">
                    <span className="text-fg-muted">
                      {compactHour(h.time, settings.use24Hour)}
                    </span>
                    <WeatherIcon icon={describeCode(h.code, h.isDay ?? true).icon} size={18} />
                    <span className="tabular-nums">
                      {displayTemp(h.tempC, settings.units)}
                    </span>
                    <span
                      className={
                        h.precipProb >= 30
                          ? 'tabular-nums text-accent'
                          : 'tabular-nums text-fg-muted opacity-50'
                      }
                    >
                      {h.precipProb}%
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-1 text-xs text-fg-muted">
                {`Feels ${displayTemp(snapshot.current.feelsLikeC, settings.units)}`}
                {' · '}
                {`Wind ${displayWind(snapshot.current.windKmh, settings.units)}`}
                {' · '}
                {`Humidity ${snapshot.current.humidity}%`}
                {snapshot.sunriseISO && snapshot.sunsetISO && (
                  <>
                    {' · '}
                    <span>
                      <span aria-hidden="true">↑</span>
                      <span className="sr-only">Sunrise </span>
                      {clockTime(snapshot.sunriseISO, settings.use24Hour)}
                    </span>{' '}
                    <span>
                      <span aria-hidden="true">↓</span>
                      <span className="sr-only">Sunset </span>
                      {clockTime(snapshot.sunsetISO, settings.use24Hour)}
                    </span>
                  </>
                )}
              </p>
            </>
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
