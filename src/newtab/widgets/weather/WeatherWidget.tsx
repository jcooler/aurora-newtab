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
      // tight:max-w-[30vw] — see the matching comment on BookmarksBar.tsx's
      // nav className for the full writeup (goal 3): below 1300px width, a
      // proportional cap here paired with the bookmarks bar's own
      // proportional cap keeps a constant-width gap between the two
      // panels' worst-case edges at every width in range, rather than the
      // fixed 32rem ceiling (reachable only when this widget is expanded —
      // the collapsed state is already much narrower) eating into the
      // centered bookmarks bar's own space as the viewport narrows.
      className="w-max max-w-[32rem] tight:max-w-[30vw] rounded-panel border border-panel-border bg-panel p-3 text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]"
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
            <div className="mt-1 flex flex-col gap-3 xshort:gap-2">
              <p className="text-sm text-fg-muted">
                {`Feels ${displayTemp(snapshot.current.feelsLikeC, settings.units)}`}
              </p>

              {/* Fixed-width cards in a horizontally-scrolling row (not a
                  grid dividing the panel's width evenly) — the previous
                  auto-cols-fr grid was what squeezed 12 hours down to
                  unreadably tiny columns. The panel's own `w-max
                  max-w-[32rem] tight:max-w-[30vw]` cap (WeatherWidget's
                  outer section, unchanged by this redesign) now governs how
                  many cards show before scrolling kicks in, instead of
                  shrinking every card to fit. */}
              <ol
                aria-label="Hourly forecast"
                className="-mx-3 flex gap-4 overflow-x-auto px-3 pb-1 xshort:gap-3"
              >
                {snapshot.hourly.map((h) => {
                  const notable = h.precipProb >= 30
                  return (
                    <li key={h.time} className="flex w-14 shrink-0 flex-col items-center gap-1.5">
                      <span className="text-xs font-medium text-fg-muted">
                        {compactHour(h.time, settings.use24Hour)}
                      </span>
                      <WeatherIcon icon={describeCode(h.code, h.isDay ?? true).icon} size={26} />
                      <span className="text-sm font-medium tabular-nums">
                        {displayTemp(h.tempC, settings.units)}
                      </span>
                      {/* Precip-chance meter: a literal rain-risk skyline
                          reusing data already on the snapshot — no new
                          fetch, just a clearer read than a bare percentage. */}
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-1.5 items-end rounded-full bg-fg/10"
                      >
                        <span
                          className={`w-full rounded-full ${notable ? 'bg-accent' : 'bg-fg-muted/50'}`}
                          style={{ height: `${Math.max(h.precipProb, 8)}%` }}
                        />
                      </span>
                      <span
                        className={`text-[11px] tabular-nums ${notable ? 'text-accent' : 'text-fg-muted'}`}
                      >
                        {h.precipProb}%
                      </span>
                    </li>
                  )
                })}
              </ol>

              <dl className="grid grid-cols-3 gap-x-4 gap-y-2 border-t border-panel-border pt-2.5 text-xs narrow:grid-cols-1 narrow:gap-y-1.5">
                <div>
                  <dt className="text-fg-muted">Wind</dt>
                  <dd className="mt-0.5 tabular-nums text-fg">
                    {displayWind(snapshot.current.windKmh, settings.units)}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-muted">Humidity</dt>
                  <dd className="mt-0.5 tabular-nums text-fg">{snapshot.current.humidity}%</dd>
                </div>
                {snapshot.sunriseISO && snapshot.sunsetISO && (
                  <div>
                    <dt className="text-fg-muted">Sun</dt>
                    <dd className="mt-0.5 tabular-nums text-fg">
                      <span aria-hidden="true">↑</span>
                      <span className="sr-only">Sunrise </span>
                      {clockTime(snapshot.sunriseISO, settings.use24Hour)}{' '}
                      <span aria-hidden="true">↓</span>
                      <span className="sr-only"> Sunset </span>
                      {clockTime(snapshot.sunsetISO, settings.use24Hour)}
                    </dd>
                  </div>
                )}
              </dl>

              {/* Outbound, user-clicked navigation only — plain anchor, no
                  prefetch/favicon fetch/new origin. weather.com: see the
                  provider rationale in the task report. */}
              <a
                href={`https://weather.com/weather/today/l/${location.lat},${location.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Full forecast for ${snapshot.locationLabel}`}
                className="self-end text-xs text-fg-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                Full forecast <span aria-hidden="true">↗</span>
              </a>
            </div>
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
