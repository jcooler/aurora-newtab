import { useEffect, useRef, useState } from 'react'
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

export default function WeatherWidget({
  onExpandedChange,
}: { onExpandedChange?: (expanded: boolean) => void } = {}) {
  const [settings] = useStoredKey('settings')
  const [location] = useStoredKey('location')
  const { snapshot, stale, loading, error, refresh } = useWeather()
  const [expanded, setExpanded] = useState(false)

  // Mirrors BookmarksBar's own `onPopoverOpenChange` idiom (App.tsx): a ref
  // keeps this always calling the LATEST callback (never a stale closure
  // from an earlier render), and the cleanup resets the mirrored App state
  // to false on unmount so a disabled/removed widget can never strand the
  // wrapper's elevated z-index open. Task 55's combined-defaults gate is WHY
  // this exists: expanded, this panel is tall/wide enough to legitimately
  // reach into the right column's connector cards (github's own slot
  // starts right where this panel's own worst-case height gets to) — but
  // every connector PositionedBlock mounts LATER in this file than this
  // one, so at equal (auto) stacking those cards would paint ON TOP of an
  // expanded panel that geometrically covers them: the exact inverse of the
  // disciplined-occlusion contract the narrow-viewport case already proves
  // for the centre column below. App.tsx turns this into a conditional
  // `z-30` on weather's OWN wrapper — the same value TodoPanel/NotesPanel/
  // TimerWidget's own open-state panels already use — only while expanded,
  // so the collapsed chip (which never reaches that far) is unaffected.
  const onExpandedChangeRef = useRef(onExpandedChange)
  onExpandedChangeRef.current = onExpandedChange
  useEffect(() => {
    onExpandedChangeRef.current?.(expanded)
    return () => onExpandedChangeRef.current?.(false)
  }, [expanded])

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

  // Width caps. ORIGINALLY derived to keep this panel clear of the centred
  // bookmarks bar HORIZONTALLY, back when the two shared the top line: the
  // bar was capped at `max-w-[52vw]` (worst-case right edge 50vw + 26vw =
  // 76vw) and this panel is anchored `right-4`, so requiring 100vw − 16px −
  // W > 76vw gave W < 24vw − 16px; `24vw − 2rem` added a guaranteed 16px on
  // top, and the `tight` pair (24vw bar / 30vw panel) held an 8vw − 16px gap
  // all the way down. The OLD unconditional `max-w-[32rem]` is what actually
  // overlapped in Jon's report: measured 1600×900, bar right edge 1216px vs.
  // this panel's left edge 1072px — 144px of collision, and 187px at
  // 1420×437, invisible to a harness that only ever measured the COLLAPSED
  // chip.
  //
  // THAT PREMISE IS GONE: the bookmarks bar now owns the top band alone and
  // this widget's DEFAULT placement is a full band below it (App.tsx's
  // `top-[var(--top-band)]`), so the two no longer share a line to compete
  // for — the clearance is vertical, asserted as such in scripts/preview.mjs,
  // and the bar's own cap has been widened to match (it is bounded by the
  // viewport now, not by this panel).
  //
  // The caps stay, for reasons that survive the move:
  //   · Arrange mode can put this panel back up beside the bar — a stored
  //     layout is the user's, and a panel that stays a bounded fraction of
  //     the viewport degrades far better up there than an unbounded one.
  //   · 24rem/24vw is a sane reading measure for a two-column data card, and
  //     the ceiling is what stops it ballooning on a 4K display.
  //   · `tight:30vw` keeps the card proportional rather than letting a fixed
  //     px width swallow a small viewport whole (30vw of 800 = 240px).
  //
  // NARROW-WINDOW PASS (2026-08-07). A viewport FRACTION is the wrong tool
  // for the COLLAPSED chip, and Jon's ~500px window is where that showed:
  // 30vw is 150px there, while the chip's own furniture — 32px icon + a
  // 2rem temperature + the chevron + 2rem of padding — is a fixed ~160px
  // that doesn't shrink with the viewport. The condition/location line was
  // therefore handed a NEGATIVE budget and did the only thing it could,
  // which is wrap: "Clear ·" / "New" / "York" over three lines with the
  // chevron stranded beside the middle one, exactly as reported.
  //
  // What actually bounds this chip is not a share of the viewport but the
  // room left in its own row: the timer pill bookends it (App.tsx —
  // `left-4` against this widget's `right-4`), so the honest cap is the
  // viewport minus both 1rem gutters minus the pill. `8.5rem` is that: 2rem
  // of gutters plus 6.5rem for a pill measured at 77px, with margin for a
  // three-digit countdown. It needs no breakpoint at all — `min()` picks
  // whichever of the reading measure and the available room binds, at every
  // width — so `tight:` comes off the collapsed cap entirely and the chip
  // gets a full one-line summary at 500px (~270px of content in a 364px
  // cap) exactly as it does at 1600px.
  //
  // The EXPANDED panel keeps its breakpoints, because it has a second
  // constraint the chip doesn't: it is tall enough to reach down into the
  // centre column, so its width is what keeps it clear of the clock and
  // greeting at desktop sizes (asserted in scripts/preview.mjs).
  //
  // `tight` now states that constraint instead of approximating it. 30vw
  // alone held only by luck, and only for the shorter greetings: the
  // greeting is CENTRED, so its right edge is at 50vw + half its width, and
  // at 36px display type "Good afternoon." is 284.5px against "Good
  // morning."'s 253.7px. Measured at 730x900: 30vw put the panel's left edge
  // at 495px, which clears the morning greeting by 3.1px and OVERLAPS the
  // afternoon one by 12.3px — a real collision that no existing matrix
  // viewport could see, because the only tall viewports were >=1024px wide
  // and the 800px one is `xshort`, where the greeting is 18px type. The
  // second term is the actual rule: keep the panel out of the half of the
  // page the centred column occupies, plus the widest default greeting's
  // overhang (10.5rem = half of 284.5px, plus ~10px of margin). It binds
  // only in the 721-900px band where the collision was; at 1024px and up
  // 30vw is still the smaller of the two and nothing changes.
  //
  // The guarantee is sized against the longest DEFAULT greeting. A user-set
  // name makes it unbounded ("Good afternoon, Bartholomew."), which no
  // width rule can chase — that case falls back to the same answer as
  // `compact` below: an opaque panel, painted and hit-tested on top.
  //
  // Below `compact` the clearance is arithmetically unreachable even for the
  // default text — at 500px a right-anchored panel would have to be ~107px
  // to miss the greeting, narrower than this panel's own header — so the
  // panel stops chasing it and becomes a proper compact SHEET instead: 20rem
  // where there's room, still stopping short of the timer pill, deliberately
  // overlaying the column the way any disclosure panel does at that size.
  // The harness asserts that overlay is disciplined (opaque surface, on top
  // at every covered point, on screen, clear of the band and the pill)
  // rather than pretending it isn't there.
  //
  // Written out as whole literal strings (rather than composed from a
  // `widthCap` constant) because Tailwind only ever sees source TEXT — a
  // class name assembled at runtime is never generated at build time.
  const widthClass = expanded
    ? 'w-[min(24rem,calc(24vw_-_2rem))] tight:w-[min(30vw,calc(50vw_-_10.5rem))] compact:w-[min(20rem,calc(100vw_-_8.5rem))]'
    : 'w-max max-w-[min(24rem,calc(100vw_-_8.5rem))]'

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
      // Surface: bg-panel-solid in BOTH states (Jon's darker-color ruling —
      // every on-page surface now carries the connector cards' opaque token).
      // The collapsed chip used to be the translucent bg-panel; it now matches
      // the expanded panel and the rest of the page.
      className={`cursor-default rounded-panel border border-panel-border bg-panel-solid text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] ${widthClass}`}
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
            // The `short`/`xshort` steps repeated across this panel are one
            // decision, not eight: expanded, this card is ~383px tall, and
            // the viewports the app is tuned for include 1420x437 and
            // 800x450 — 88% of the window for one widget. Now that it opens
            // BELOW the bookmarks bar's band rather than inside it (App.tsx),
            // that stopped being merely ungainly and started running off the
            // bottom edge. Only the internal RHYTHM tightens — no content is
            // dropped, no type shrinks, nothing gains a scroll region — the
            // same compression the centre column already applies at these
            // heights. Both variants carry the same value (they're disjoint
            // ranges covering height <= 600px together), so there is no
            // source-order tie to break between them.
            className={`flex w-full cursor-pointer flex-col gap-1 px-4 py-3 short:py-2 xshort:py-2 text-left transition-colors hover:bg-fg/5 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none ${
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
              {/* ONE LINE, always. `truncate` is white-space:nowrap plus an
                  ellipsis, so this can shorten but can never become two
                  lines — which is what used to strand the chevron beside a
                  three-line block of text at ~500px. The width cap above is
                  what makes the ellipsis a rare event rather than the normal
                  state; this is the guarantee that holds even when a long
                  condition meets a long city ("Thunderstorm · San Francisco"),
                  and `title` is where the rest of it goes when it does. */}
              <span
                title={`${describeCode(snapshot.current.code).label} · ${snapshot.locationLabel}`}
                className="min-w-0 flex-1 truncate text-sm leading-snug text-fg-muted"
              >
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
            <div className="px-4 pb-4 short:pb-3 xshort:pb-3">
              {geo && (
                <div className="border-t border-panel-border pt-3 short:pt-2 xshort:pt-2">
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
                    className="mt-2 short:mt-1 xshort:mt-1 h-auto w-full text-fg"
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

              <dl className="mt-3 short:mt-2 xshort:mt-2 grid grid-cols-2 gap-x-4 gap-y-3 short:gap-y-2 xshort:gap-y-2 border-t border-panel-border pt-3 short:pt-2 xshort:pt-2">
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

              <div className="mt-3 short:mt-2 xshort:mt-2 flex items-center justify-between gap-3">
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
