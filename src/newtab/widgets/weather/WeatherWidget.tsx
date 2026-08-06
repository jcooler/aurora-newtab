import { useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { describeCode } from '../../../services/weather/codes'
import { rainCallout } from '../../../services/weather/callout'
import { NOW_DOT_R, TREND_VIEWBOX, tickIndices, trendGeometry } from '../../../services/weather/trend'
import { clockTime, compactHour, displayTemp, displayWind } from '../../../services/weather/units'
import LocationSetup from './LocationSetup'
import WeatherIcon from './WeatherIcon'
import { useWeather } from './useWeather'

// Referenced by the trend graphic's `fill="url(#…)"`. A module constant, not
// `useId()`: React's generated ids contain colons, which are invalid inside a
// CSS `url(#…)` reference without escaping, and there is exactly one weather
// widget on the page. Two instances would simply share one identical
// gradient definition — harmless.
const TREND_FILL_ID = 'aurora-weather-trend-fill'

/** Chevron — the panel's disclosure affordance, in both directions. Rotates
 *  rather than swapping glyphs so the control reads as one continuous thing. */
function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 text-fg-muted transition-transform duration-200 motion-reduce:transition-none ${
        expanded ? 'rotate-180' : ''
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function WeatherWidget() {
  const [settings] = useStoredKey('settings')
  const [location] = useStoredKey('location')
  const { snapshot, stale, loading, error, refresh } = useWeather()
  const [expanded, setExpanded] = useState(false)

  if (!settings?.widgets.weather) return null

  const callout = snapshot ? rainCallout(snapshot.hourly, settings.use24Hour) : null
  const geo = snapshot ? trendGeometry(snapshot.hourly) : null
  const hours = snapshot?.hourly ?? []
  const ticks = tickIndices(hours.length)

  // The graphic's text equivalent, built from the same fetched numbers it
  // draws — a curve is unreadable to a screen reader, and a per-hour table
  // read aloud is worse than a sentence.
  const trendSummary =
    geo && snapshot
      ? `Next ${hours.length} hours: high ${displayTemp(geo.hi.tempC, settings.units)}, low ${displayTemp(
          geo.lo.tempC,
          settings.units,
        )}.` +
        (geo.peakPrecip.prob > 0
          ? ` Rain chance peaks at ${geo.peakPrecip.prob}% around ${clockTime(
              hours[geo.peakPrecip.index]!.time,
              settings.use24Hour,
            )}.`
          : ' No rain expected.')
      : ''

  // Width caps (goal: the panel can never reach the centred bookmarks bar, in
  // EITHER state, at any viewport — Jon's overlap report).
  //
  // The bar is centred with `max-w-[52vw]` (BookmarksBar.tsx), so its
  // worst-case right edge is 50vw + 26vw = 76vw. This panel is anchored
  // `right-4` (App.tsx), so its left edge is 100vw − 16px − W. Requiring
  // 100vw − 16px − W > 76vw gives W < 24vw − 16px; `24vw − 2rem` leaves a
  // guaranteed 16px gap on top of that at every width in the band, and the
  // 24rem ceiling stops the card ballooning on a 4K display. Below the
  // `tight` breakpoint the bar's own cap drops to 24vw (right edge 62vw), so
  // 30vw here still clears it by 8vw − 16px.
  //
  // The OLD `max-w-[32rem]` (512px, unconditional above `tight`) is exactly
  // what overlapped: measured 1600×900, bar right edge 1216px vs. this
  // panel's left edge 1072px — 144px of collision, and 187px at 1420×437.
  // The previous harness never saw it because it only ever measured the
  // COLLAPSED chip, which is far too narrow to reach.
  //
  // Written out as whole literal strings (rather than composed from a
  // `widthCap` constant) because Tailwind only ever sees source TEXT — a
  // class name assembled at runtime is never generated at build time.
  const widthClass = expanded
    ? 'w-[min(24rem,calc(24vw_-_2rem))] tight:w-[30vw]'
    : 'w-max max-w-[min(24rem,calc(24vw_-_2rem))] tight:max-w-[30vw]'

  return (
    <section
      aria-label="Weather"
      // `cursor-default` is load-bearing, not cosmetic. `cursor` inherits, and
      // its initial value `auto` resolves to the TEXT I-beam over text — so
      // every label, temperature and forecast line in here used to advertise
      // itself as something you could act on (Jon: "the cursor changes when
      // you hover over the weather alerts like possible rain"). Meanwhile
      // Tailwind v4's preflight sets `button { cursor: default }`, so the one
      // element that WAS a control gave no pointer feedback at all — exactly
      // inverted. Setting `default` here and `cursor-pointer` on the real
      // controls (the toggle, the refresh button, the forecast link) puts the
      // signal back where it belongs and nowhere else.
      //
      // Surface: bg-panel (50%) as a chip, bg-panel-solid (95%) once expanded
      // — the convention floating panels follow (TimerWidget's pill vs. its
      // own expanded dialog is the same-file precedent).
      className={`cursor-default rounded-panel border border-panel-border text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] ${widthClass} ${
        expanded ? 'bg-panel-solid' : 'bg-panel'
      }`}
    >
      {location === null && (
        <div className="p-4">
          <LocationSetup />
        </div>
      )}
      {location && !snapshot && (
        <p className="p-4 text-sm text-fg-muted">
          {error ?? (loading ? 'Loading weather…' : 'No data yet.')}
        </p>
      )}
      {location && snapshot && (
        <>
          {/* THE toggle — one button covering the entire chip, padding and
              corners included, rather than a content-sized row floating
              inside a padded panel. The old markup put `p-3` on the section
              and sized the button to its own text, so only ~48% of the
              collapsed chip's area (and ~5% of the expanded panel's) actually
              responded to a click; corner clicks resolved to the <section>
              and did nothing. Everything that is part of "the summary" —
              including the rain callout — lives inside the button, so there
              is no dead pixel anywhere on the collapsed chip. */}
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className={`flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-fg/5 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none ${
              expanded ? 'rounded-t-panel' : 'rounded-panel'
            }`}
          >
            <span className="flex w-full items-center gap-3">
              <WeatherIcon
                icon={describeCode(snapshot.current.code, snapshot.current.isDay ?? true).icon}
                size={32}
              />
              {/* font-display (Space Grotesk) is the page's own headline face
                  — the clock and greeting already speak it. Borrowing it for
                  the one number this widget exists to report ties the card to
                  the page instead of styling it like a generic tooltip. */}
              <span className="font-display text-[2rem] font-light leading-none tabular-nums">
                {displayTemp(snapshot.current.tempC, settings.units)}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-snug text-fg-muted">
                {describeCode(snapshot.current.code).label} · {snapshot.locationLabel}
              </span>
              <Chevron expanded={expanded} />
            </span>
            {callout && <span className="text-sm text-accent">{callout}</span>}
            {(stale || error) && (
              <span className="text-xs text-fg-muted">
                {error ? 'Offline — showing cached' : 'Updated a while ago'}
              </span>
            )}
          </button>

          {expanded && (
            <div className="px-4 pb-4">
              {geo && (
                <div className="border-t border-panel-border pt-3">
                  <div className="flex items-baseline justify-between gap-3 text-[11px] text-fg-muted">
                    <span>Next {hours.length} hours</span>
                    <span className="shrink-0">
                      High <span className="tabular-nums text-fg">{displayTemp(geo.hi.tempC, settings.units)}</span>
                      {' · '}
                      Low <span className="tabular-nums text-fg">{displayTemp(geo.lo.tempC, settings.units)}</span>
                    </span>
                  </div>

                  {/* The signature: one continuous temperature ridgeline over
                      a quiet field of rain-chance columns. A fixed viewBox at
                      `width: 100%` scales to any container, so — unlike the
                      872px-wide scrolling card strip it replaces — it cannot
                      overflow, cannot produce a scrollbar, and leaves nothing
                      for a scrollbar drag to accidentally long-press into
                      arrange mode. Accent is reserved for rain here and in
                      the callout above; nothing else in the panel uses it. */}
                  <svg
                    viewBox={`0 0 ${TREND_VIEWBOX.w} ${geo.height}`}
                    className="mt-2 h-auto w-full text-fg"
                    role="img"
                    aria-label={trendSummary}
                  >
                    <defs>
                      <linearGradient id={TREND_FILL_ID} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={geo.area} fill={`url(#${TREND_FILL_ID})`} />
                    <line
                      x1="0"
                      y1={geo.baseline}
                      x2={TREND_VIEWBOX.w}
                      y2={geo.baseline}
                      stroke="currentColor"
                      strokeOpacity="0.16"
                      strokeWidth="1"
                    />
                    {geo.columns.map((c) => (
                      <rect
                        key={c.i}
                        x={c.x}
                        y={c.y}
                        width={c.w}
                        height={c.h}
                        rx="1.5"
                        fill="var(--accent)"
                        fillOpacity={c.notable ? 0.7 : 0.3}
                      />
                    ))}
                    <path
                      d={geo.line}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* "You are here" — the only accent mark on the curve, so
                        the eye knows which end is the current hour. */}
                    <circle cx={geo.start.x} cy={geo.start.y} r={NOW_DOT_R} fill="var(--accent)" />
                  </svg>

                  {/* Orientation ticks, in HTML rather than inside the SVG so
                      they stay at a real, readable font size no matter how the
                      graphic scales. `justify-between` can never overflow —
                      an absolutely-positioned tick centred on the last data
                      point would push past the right edge and reintroduce the
                      overflow this redesign exists to remove. */}
                  <div
                    aria-hidden
                    className="mt-1 flex justify-between text-[11px] tabular-nums text-fg-muted"
                  >
                    {ticks.map((i) => (
                      <span key={i}>{compactHour(hours[i]!.time, settings.use24Hour)}</span>
                    ))}
                  </div>
                </div>
              )}

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-panel-border pt-3">
                <div>
                  <dt className="text-[11px] text-fg-muted">Feels like</dt>
                  <dd className="mt-0.5 text-sm tabular-nums text-fg">
                    {displayTemp(snapshot.current.feelsLikeC, settings.units)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-fg-muted">Wind</dt>
                  <dd className="mt-0.5 text-sm tabular-nums text-fg">
                    {displayWind(snapshot.current.windKmh, settings.units)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-fg-muted">Humidity</dt>
                  <dd className="mt-0.5 text-sm tabular-nums text-fg">{snapshot.current.humidity}%</dd>
                </div>
                {snapshot.sunriseISO && snapshot.sunsetISO && (
                  <div>
                    <dt className="text-[11px] text-fg-muted">Sun</dt>
                    <dd className="mt-0.5 text-sm tabular-nums text-fg">
                      <span className="block">
                        <span aria-hidden="true">↑ </span>
                        <span className="sr-only">Sunrise </span>
                        {clockTime(snapshot.sunriseISO, settings.use24Hour)}
                      </span>
                      <span className="block">
                        <span aria-hidden="true">↓ </span>
                        <span className="sr-only">Sunset </span>
                        {clockTime(snapshot.sunsetISO, settings.use24Hour)}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-3 flex items-center justify-between gap-3">
                {stale || error ? (
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="cursor-pointer text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {loading ? 'Refreshing…' : 'Refresh'}
                  </button>
                ) : (
                  <span />
                )}
                {/* Outbound, user-clicked navigation only — plain anchor, no
                    prefetch/favicon fetch/new origin. weather.com takes raw
                    coordinates and shows hourly + daily on one page. */}
                <a
                  href={`https://weather.com/weather/today/l/${location.lat},${location.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Full forecast for ${snapshot.locationLabel}`}
                  className="cursor-pointer text-xs text-fg-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Full forecast <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
