import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ResourceFeedback } from '../../../components/StateFeedback'
import { useDialogEscape } from '../../../lib/dialogStack'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { describeCode } from '../../../services/weather/codes'
import { rainCallout } from '../../../services/weather/callout'
import { aqiReading, pollenSummary, uvReading } from '../../../services/weather/environmentIdentity'
import { PRECIP_FLOOR, forecastRange, forecastSlots } from '../../../services/weather/forecast'
import {
  clockTime,
  compactHour,
  compassPoint,
  hourLabel,
  displayTemp,
  displayTempWithUnit,
  displayWind,
  unitLetter,
} from '../../../services/weather/units'
import LocationSetup from './LocationSetup'
import WeatherIcon from './WeatherIcon'
import { useWeather } from './useWeather'
import { weatherPanelAnchor, type WeatherPanelAnchor } from './weatherPanelAnchor'
import type { WidgetVariant } from '../../../lib/layout/types'

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
  stageVariant = 'standard',
  docked = false,
}: { onExpandedChange?: (expanded: boolean) => void; stageVariant?: WidgetVariant; docked?: boolean } = {}) {
  const [settings] = useStoredKey('settings')
  const [location] = useStoredKey('location')
  const { snapshot, stale, loading, enrichmentPending, error, refresh, state } = useWeather()
  const summarySize = stageVariant === 'expanded' ? 'full' : stageVariant
  const [expanded, setExpanded] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [panelAnchor, setPanelAnchor] = useState<WeatherPanelAnchor | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const feedbackId = useId()
  const environmentFeedbackId = useId()
  const detailsId = useId()

  const closeExpanded = useCallback(() => {
    setExpanded(false)
    triggerRef.current?.focus()
  }, [])

  useDialogEscape(closeExpanded, expanded)

  const updatePanelAnchor = useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return
    const panelRect = panel.getBoundingClientRect()
    const utilityRects = [...document.querySelectorAll<HTMLElement>('.utility-tray-trigger, .settings-gear')]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
    const utilityExclusion = utilityRects.length > 0
      ? ({
          left: Math.min(...utilityRects.map((rect) => rect.left)),
          top: Math.min(...utilityRects.map((rect) => rect.top)),
          right: Math.max(...utilityRects.map((rect) => rect.right)),
          bottom: Math.max(...utilityRects.map((rect) => rect.bottom)),
          width: Math.max(...utilityRects.map((rect) => rect.right)) - Math.min(...utilityRects.map((rect) => rect.left)),
          height: Math.max(...utilityRects.map((rect) => rect.bottom)) - Math.min(...utilityRects.map((rect) => rect.top)),
          x: Math.min(...utilityRects.map((rect) => rect.left)),
          y: Math.min(...utilityRects.map((rect) => rect.top)),
          toJSON: () => ({}),
        } as DOMRectReadOnly)
      : undefined
    // Clamp against the LAYOUT viewport, not window.inner*: on a scrollable
    // document real Chrome's classic scrollbar gutter lives inside inner*,
    // so an inner-clamped top-right panel could sit up to ~17px underneath
    // the scrollbar (the owner's reported right-edge cut). documentElement
    // client sizes exclude the gutter; jsdom reports 0 there, so fall back.
    const layoutViewport = {
      width: document.documentElement.clientWidth || window.innerWidth,
      height: document.documentElement.clientHeight || window.innerHeight,
    }
    const next = weatherPanelAnchor({
      trigger: trigger.getBoundingClientRect(),
      panel: {
        width: panelRect.width || Math.min(384, Math.max(0, layoutViewport.width - 16)),
        height: panel.scrollHeight || panelRect.height || 420,
      },
      viewport: layoutViewport,
      safeMargin: 8,
      utilityExclusion,
    })
    setPanelAnchor((current) => current
      && current.left === next.left
      && current.top === next.top
      && current.maxHeight === next.maxHeight
      && current.vertical === next.vertical
      && current.horizontal === next.horizontal
      ? current
      : next)
  }, [])

  useLayoutEffect(() => {
    if (!expanded) {
      setPanelAnchor(null)
      return
    }
    updatePanelAnchor()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePanelAnchor)
    if (panelRef.current) observer?.observe(panelRef.current)
    if (triggerRef.current) observer?.observe(triggerRef.current)
    window.addEventListener('resize', updatePanelAnchor)
    window.addEventListener('scroll', updatePanelAnchor, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePanelAnchor)
      window.removeEventListener('scroll', updatePanelAnchor, true)
    }
  }, [expanded, updatePanelAnchor])

  useEffect(() => {
    if (!expanded) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)
        || panelRef.current?.contains(target)
        || triggerRef.current?.contains(target)) return
      closeExpanded()
      // A pointer's native focus action runs after pointerdown dispatch and
      // can overwrite closeExpanded's immediate restoration. Reassert on the
      // next task so outside-click dismissal ends on the disclosure trigger
      // just like Escape and second activation do.
      window.setTimeout(() => triggerRef.current?.focus(), 0)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [closeExpanded, expanded])

  const requestRefresh = () => {
    setRetrying(true)
    void refresh().finally(() => setRetrying(false))
  }

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
  const surfaceOpen = expanded || location === null
  useEffect(() => {
    onExpandedChangeRef.current?.(surfaceOpen)
    return () => onExpandedChangeRef.current?.(false)
  }, [surfaceOpen])

  if (!settings?.widgets.weather) return null

  const callout = snapshot ? rainCallout(snapshot.hourly, settings.use24Hour) : null
  const hours = snapshot?.hourly ?? []
  // Jon's pick (variant A, "the numbers ARE the display"): a fixed six-slot
  // every-two-hours grid of real digits, no curve. `range` is computed over
  // the WHOLE window, not the sampled slots, so the day's true High/Low still
  // shows even when the peak falls on an odd hour the grid never samples.
  const slots = forecastSlots(hours)
  const range = forecastRange(hours)
  const trendSignal = callout ?? (range
    ? `High ${displayTemp(range.hiC, settings.units)} · Low ${displayTempWithUnit(range.loC, settings.units)}`
    : null)
  const summarySlots = slots.slice(0, 4)
  const environment = snapshot?.environment
  const environmentAqi = environment?.status === 'available' && environment.usAqi !== null
    ? aqiReading(environment.usAqi)
    : null
  const environmentUv = environment?.status === 'available' && environment.uvIndex !== null
    ? uvReading(environment.uvIndex)
    : null
  const environmentPollen = environment?.status === 'available'
    ? pollenSummary(environment.pollen)
    : null
  const hasEnvironmentalReadings = Boolean(
    environmentAqi || environmentUv || (environmentPollen && environmentPollen.kind !== 'unavailable'),
  )
  const environmentNeedsRetry = !enrichmentPending && (!environment || environment.status === 'unavailable')

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
  // SHORT-WIDE fix (the board's last open collision). At the extreme
  // short-wide end — 800x450 is the matrix's own fencepost — the centred
  // clock rides HIGH in a compressed short column while its FORCED-WIDE
  // (2-digit hour) box is also near its widest for that height, and this
  // chip's natural content width (icon + temp + condition/city + chevron,
  // whatever today's weather happens to be) reaches in far enough from the
  // right that the clock's top-right corner laps the chip's bottom-left —
  // real, measured (this fix's own probe, scripts/preview.mjs): clock right
  // edge 519.5px, chip left edge 470.6px at 800x450, a 48.9px horizontal
  // collision (61px of it vertical too — the chip's own forced 3-line worst
  // case, rain callout + stale line, only makes the vertical reach WORSE).
  //
  // The clock is the hero (canvas identity) — it does not give ground here.
  // At 450px of height its rendered size (90px, per --clock-font) is
  // already the height-scarce branch of its own fluid curve, not an
  // oversized default that merely needs a cap; shrinking it further to
  // clear the chip would either blow through its own 3rem floor or read as
  // visibly undersized against a 450px-tall canvas (judged directly off
  // this fix's own capture). The chip's `truncate` discipline already
  // exists for exactly this trade — a narrower cap forces the condition/
  // city text to ellipsis sooner, never wraps, never grows a second line —
  // so it is the one that gives.
  //
  // `xshort:` (<=450h — index.css) adds a THIRD term to the existing min():
  // the room actually left beside the clock's own right edge. The clock's
  // box is horizontally centred on the viewport centre (App.tsx's centred
  // column), so its right edge is always `50vw + --clock-half-w`; this
  // chip is right-anchored (`right-4` = 1rem inset) so its own right edge
  // is `100vw - 1rem`. Subtracting the clock's reach plus the house 16px
  // (1rem) floor from that gap leaves the room this chip may use:
  // `(100vw - 1rem) - (50vw + --clock-half-w) - 1rem` = `50vw - 2rem -
  // --clock-half-w` — a live formula, not a number pinned to 800x450, so it
  // holds at every width/height inside the xshort tier (verified at
  // 700/750/800/900/1000 widths — this fix's own probe, all clear by
  // >=16px), not merely the one matrix fencepost. It only ever NARROWS the
  // existing cap (the min() keeps the reading-measure and timer-pill terms
  // too) — at a wide-but-short window this term is generous and one of the
  // other two binds instead, exactly as before this fix.
  //
  // Written out as whole literal strings (rather than composed from a
  // `widthCap` constant) because Tailwind only ever sees source TEXT — a
  // class name assembled at runtime is never generated at build time.
  const widthClass = location === null
    ? 'w-[min(20rem,calc(100vw_-_2rem))]'
    : 'w-max max-w-[min(24rem,calc(100vw_-_8.5rem))] xshort:max-w-[min(24rem,calc(100vw_-_8.5rem),calc(50vw_-_2rem_-_var(--clock-half-w)))]'
  const effectiveAnchor = panelAnchor ?? {
    left: 8,
    top: 8,
    maxHeight: Math.max(0, (document.documentElement.clientHeight || window.innerHeight) - 16),
    vertical: 'below' as const,
    horizontal: 'inward-right' as const,
  }

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
        <div className="p-4 text-sm text-fg-muted">
          <ResourceFeedback
            state={state}
            loading={'Loading weather\u2026'}
            refreshing={'Refreshing\u2026'}
            stale="Updated a while ago"
            offline={'Offline \u2014 showing cached'}
            unavailable="Weather unavailable. Try again."
            id={feedbackId}
          />
          {state.operation === 'idle' && <p>No data yet.</p>}
          {(state.operation === 'error' || retrying) && (
            <button
              type="button"
              onClick={requestRefresh}
              disabled={loading}
              aria-busy={loading || undefined}
              aria-describedby={feedbackId}
              className="mt-3 inline-flex min-h-9 cursor-pointer items-center text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default"
            >
              Refresh
            </button>
          )}
        </div>
      )}
      {location && snapshot && (
        <>
          {docked ? (
            /* The Docked tier (named-layouts spec 2.3): one dense text-first
               line — temperature · location · condition, middle dots
               separating facts. The SAME trigger semantics as the free chip:
               clicking opens the identical details panel (spec 2.4), anchored
               from this line's own rect. */
            <button
              ref={triggerRef}
              type="button"
              aria-expanded={expanded}
              aria-controls={expanded ? detailsId : undefined}
              onClick={() => expanded ? closeExpanded() : setExpanded(true)}
              data-dock-line=""
              data-weather-summary=""
              className="dock-line cursor-pointer rounded-panel text-left transition-colors hover:bg-fg/5 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              <WeatherIcon
                icon={describeCode(snapshot.current.code, snapshot.current.isDay ?? true).icon}
                size={16}
              />
              {/* The digits carry the line (font-medium, chip scale); the
                  unit letter stays subordinate via the dock metadata size —
                  a second em-shrink here made the F read DOMINANT because
                  the digits, not the letter, ended up the smaller glyphs
                  (owner-reported 2026-08-18). */}
              <span data-canvas-type-role="body" className="font-medium tabular-nums">
                {displayTemp(snapshot.current.tempC, settings.units)}
                <span data-canvas-type-role="metadata" className="align-baseline opacity-[0.68]">
                  {unitLetter(settings.units)}
                </span>
              </span>
              <span aria-hidden className="opacity-[0.68]">·</span>
              <span data-canvas-type-role="body" className="opacity-[0.68]">{snapshot.locationLabel}</span>
              <span aria-hidden className="opacity-[0.68]">·</span>
              <span data-canvas-type-role="body" className="opacity-[0.68]">{describeCode(snapshot.current.code).label}</span>
            </button>
          ) : (
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
            ref={triggerRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            onClick={() => expanded ? closeExpanded() : setExpanded(true)}
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
            data-weather-summary=""
            data-weather-summary-size={summarySize}
            className="weather-summary flex w-full cursor-pointer flex-col gap-2 rounded-panel px-4 py-3 text-left transition-colors hover:bg-fg/5 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <span data-weather-summary-row="current" className="flex w-full items-center gap-3">
              <WeatherIcon
                icon={describeCode(snapshot.current.code, snapshot.current.isDay ?? true).icon}
                size={summarySize === 'compact' ? 28 : 32}
              />
              {/* font-display (Space Grotesk) is the page's own headline face
                  — the clock and greeting already speak it. Borrowing it for
                  the one number this widget exists to report ties the card to
                  the page instead of styling it like a generic tooltip. */}
              <span data-weather-current="" data-canvas-type-role="body" className="font-display text-[2rem] font-light leading-none tabular-nums">
                {displayTemp(snapshot.current.tempC, settings.units)}
                {/* Jon: "adding F or C to the card would be nice." Same
                    two-span idiom as the expanded grid's own end slots below
                    (~line 384): bright digits as the leading text node, the
                    scale letter smaller (0.7em) and quieter (text-fg-muted)
                    as a child span. The two pieces still concatenate to
                    exactly `displayTempWithUnit` — one derivation, styled
                    apart — never a second string for the same value. */}
                <span data-canvas-type-role="metadata" className="align-baseline text-[0.7em] text-fg-muted">
                  {unitLetter(settings.units)}
                </span>
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
                data-weather-condition-location=""
                data-canvas-type-role="body"
                title={`${describeCode(snapshot.current.code).label} - ${snapshot.locationLabel}`}
                aria-label={`${describeCode(snapshot.current.code).label} - ${snapshot.locationLabel}`}
                className="min-w-0 flex-1 truncate text-fg-muted"
              >
                {describeCode(snapshot.current.code).label} - {snapshot.locationLabel}
              </span>
              <span data-weather-disclosure=""><Chevron expanded={expanded} /></span>
            </span>
            {summarySize !== 'compact' && trendSignal ? (
              <span data-weather-summary-row="trend" data-weather-summary-trend="" data-canvas-type-role="body" className="truncate text-accent">
                {trendSignal}
              </span>
            ) : null}
            {summarySize !== 'compact' ? (
              <dl data-weather-summary-row="metrics" data-weather-summary-metrics="" className="grid grid-cols-3 gap-x-3 border-t border-panel-border pt-2">
                <div>
                  <dt data-canvas-type-role="metadata" className="text-fg-muted">Feels</dt>
                  <dd data-canvas-type-role="body" className="tabular-nums">{displayTemp(snapshot.current.feelsLikeC, settings.units)}</dd>
                </div>
                <div>
                  <dt data-canvas-type-role="metadata" className="text-fg-muted">Wind</dt>
                  <dd data-canvas-type-role="body" className="tabular-nums">{displayWind(snapshot.current.windKmh, settings.units)}</dd>
                </div>
                <div>
                  <dt data-canvas-type-role="metadata" className="text-fg-muted">Humidity</dt>
                  <dd data-canvas-type-role="body" className="tabular-nums">{snapshot.current.humidity}%</dd>
                </div>
              </dl>
            ) : null}
            {summarySize === 'full' && summarySlots.length > 0 ? (
              <div data-weather-summary-row="hourly" data-weather-summary-hourly="" className="grid grid-cols-4 gap-1 border-t border-panel-border pt-2">
                {summarySlots.map((slot) => (
                  <span key={slot.index} className="min-w-0 text-center">
                    <span data-canvas-type-role="metadata" className="block truncate text-fg-muted">
                      {slot.now ? 'Now' : compactHour(slot.point.time, settings.use24Hour)}
                    </span>
                    <span data-canvas-type-role="body" className="block tabular-nums">
                      {displayTemp(slot.point.tempC, settings.units)}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            <ResourceFeedback
              state={state}
              loading={'Loading weather\u2026'}
              refreshing={'Refreshing\u2026'}
              stale="Updated a while ago"
              offline={'Offline \u2014 showing cached'}
              unavailable="Weather unavailable. Try again."
              id={feedbackId}
              className="text-fg-muted"
            />
          </button>
          </>
          )}

          {expanded && createPortal(
            <section
              ref={panelRef}
              id={detailsId}
              role="dialog"
              aria-label="Weather details"
              data-weather-details=""
              data-weather-vertical={effectiveAnchor.vertical}
              data-weather-horizontal={effectiveAnchor.horizontal}
              className="fixed z-[70] w-96 max-w-[calc(100vw-1rem)] cursor-default overflow-y-auto rounded-panel border border-panel-border bg-panel-solid text-fg shadow-2xl shadow-black/35 backdrop-blur-[var(--panel-blur)]"
              style={{
                left: `${effectiveAnchor.left}px`,
                top: `${effectiveAnchor.top}px`,
                maxHeight: `${effectiveAnchor.maxHeight}px`,
              }}
            >
            <div className="px-4 py-4 short:py-3 xshort:py-3">
              {range && slots.length > 0 && (
                <div className="border-t border-panel-border pt-3 short:pt-2 xshort:pt-2">
                  <div data-canvas-type-role="metadata" className="flex items-baseline justify-between gap-3 text-fg-muted">
                    {/* CSS-uppercased, so the DOM text stays "Next 12 hours"
                        (screen readers and tests read the real word, the eye
                        reads the eyebrow). */}
                    <span className="uppercase tracking-[0.08em]">Next {hours.length} hours</span>
                    <span className="shrink-0">
                      High <span className="tabular-nums text-fg">{displayTemp(range.hiC, settings.units)}</span>
                      {' · '}
                      Low{' '}
                      <span className="tabular-nums text-fg">
                        {displayTempWithUnit(range.loC, settings.units)}
                      </span>
                    </span>
                  </div>

                  {/* Jon's pick — "the numbers ARE the display" (variant A). A
                      fixed six-slot grid, every two hours, in real digits: the
                      answer to "the graph isn't even readable, it's like a
                      line graph." No curve. The unit letter rides the FIRST
                      and LAST slot (the ends the eye enters and leaves) and
                      the Low above, so the row states °F/°C without repeating
                      it on every number — the other half of Jon's complaint
                      ("it doesn't even specify celsius or fahrenheit").

                      The day's true High may fall on an ODD hour this
                      every-two-hours grid never samples (e.g. an 84° 3 PM
                      peak); the header's High/Low line, computed over the
                      whole window, is where that exact number lives.

                      `grid-cols-6` tracks are `minmax(0,1fr)`, so the grid can
                      never widen the panel; the digits step down one size at
                      `narrow` (and shed the gap/padding) so six of them still
                      fit the ~197px the panel is capped to at its tightest
                      labelled viewport, 730x900 — the same no-overflow contract
                      the retired ridgeline held by being an SVG. Accent is
                      reserved for rain here and in the callout above; nothing
                      else in the panel uses it. */}
                  <div data-weather-hourly-grid className="mt-3 short:mt-2 xshort:mt-2 grid grid-cols-6 gap-x-1 narrow:gap-x-0">
                    {slots.map((slot, i) => {
                      const atEnd = i === 0 || i === slots.length - 1
                      const rain =
                        slot.point.precipProb >= PRECIP_FLOOR ? slot.point.precipProb : null
                      return (
                        <div
                          key={slot.index}
                          className={`flex flex-col gap-1 rounded-md px-1 py-1 narrow:px-0 ${
                            slot.now ? 'bg-fg/[0.07]' : ''
                          }`}
                        >
                          <span data-canvas-type-role="metadata" className="leading-none text-fg-muted">
                            {slot.now
                              ? 'NOW'
                              : hourLabel(slot.point.time, settings.use24Hour)}
                          </span>
                          {/* The scale letter on the end slots renders SMALLER
                              (0.7em, so it holds ~70% of the digit height at
                              both the default and `narrow` sizes) and QUIETER
                              (text-fg-muted) than the digits — matching the
                              picked render, where the bright number is the
                              display and the unit is a subscript-weight
                              annotation. This splits PRESENTATION only:
                              `displayTempWithUnit` stays the one canonical
                              full-string helper (the header Low, the screen-
                              reader reading via DOM order, and the tests all
                              use it), and it is `displayTemp` + `unitLetter`
                              by definition — so the grid renders those exact
                              two constituent pieces, styled apart, never a
                              second derivation of the string. */}
                          <span className="text-[15px] narrow:text-[12px] font-medium leading-none tabular-nums text-fg">
                            {displayTemp(slot.point.tempC, settings.units)}
                            {atEnd && (
                              <span data-canvas-type-role="metadata" className="align-baseline text-[0.7em] text-fg-muted">
                                {unitLetter(settings.units)}
                              </span>
                            )}
                          </span>
                          {rain !== null && (
                            <span data-canvas-type-role="metadata" className="leading-none tabular-nums text-accent">
                              <span className="sr-only">Rain chance </span>
                              {rain}%
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <dl data-weather-details-metrics="" className="mt-3 short:mt-2 xshort:mt-2 grid grid-cols-2 gap-x-4 gap-y-3 short:gap-y-2 xshort:gap-y-2 border-t border-panel-border pt-3 short:pt-2 xshort:pt-2">
                <div>
                  <dt data-canvas-type-role="metadata" className="text-fg-muted">Feels like</dt>
                  <dd data-canvas-type-role="body" className="mt-0.5 tabular-nums text-fg">
                    {displayTemp(snapshot.current.feelsLikeC, settings.units)}
                  </dd>
                </div>
                <div>
                  <dt data-canvas-type-role="metadata" className="text-fg-muted">Wind</dt>
                  <dd data-canvas-type-role="body" className="mt-0.5 flex items-center gap-1.5 tabular-nums text-fg">
                    {typeof snapshot.current.windDirection === 'number' && (
                      // Screen-up is north, and the arrow points AT the
                      // direction its own letters name (owner-reported
                      // 2026-08-21). The meteorologist's convention — letters
                      // for where the wind is from, arrow for where it is
                      // going — makes the two halves of one readout point
                      // opposite ways, which is correct on a weather map and
                      // baffling on a new tab. Self-consistency wins here.
                      <svg
                        data-weather-wind-arrow=""
                        aria-hidden="true"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-accent"
                        style={{ transform: `rotate(${snapshot.current.windDirection}deg)` }}
                      >
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    )}
                    <span>
                      {displayWind(snapshot.current.windKmh, settings.units)}
                      {typeof snapshot.current.windDirection === 'number'
                        ? ` ${compassPoint(snapshot.current.windDirection)}`
                        : ''}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt data-canvas-type-role="metadata" className="text-fg-muted">Humidity</dt>
                  <dd data-canvas-type-role="body" className="mt-0.5 tabular-nums text-fg">{snapshot.current.humidity}%</dd>
                </div>
                {/* Rain outlook from the ALREADY-FETCHED hourly precipitation
                    probabilities (owner 2026-08-18: fill the panel's empty
                    cell with something useful, no new request fields). */}
                <div>
                  <dt data-canvas-type-role="metadata" className="text-fg-muted">Rain</dt>
                  <dd data-canvas-type-role="body" className="mt-0.5 flex items-center gap-1.5 tabular-nums text-fg">
                    {(() => {
                      const peak = snapshot.hourly.reduce(
                        (best, point) => (best === null || point.precipProb > best.precipProb ? point : best),
                        null as (typeof snapshot.hourly)[number] | null,
                      )
                      if (!peak || peak.precipProb < 10) return <span>None expected</span>
                      return (
                        <>
                          <svg data-weather-rain-icon="" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent">
                            <path d="M6 14a4 4 0 0 1 .6-7.9 5 5 0 0 1 9.5-1.3A3.8 3.8 0 0 1 18 14" />
                            <path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2" />
                          </svg>
                          {/* hourLabel, not compactHour: "20% at 02" reads as
                              ambiguous the moment it leaves a column header
                              (owner-reported 2026-08-19). */}
                          <span>{`${peak.precipProb}% at ${hourLabel(peak.time, settings.use24Hour)}`}</span>
                        </>
                      )
                    })()}
                  </dd>
                </div>
                {/* Sunrise and sunset are two cells, not one stacked pair
                    (owner-reported 2026-08-19: bare arrows read as generic
                    glyphs, and the doubled cell left the grid a row short).
                    Real icons carry the meaning; the visible labels stay for
                    anyone who does not read the icon. */}
                {snapshot.sunriseISO && (
                  <div>
                    <dt data-canvas-type-role="metadata" className="text-fg-muted">Sunrise</dt>
                    <dd data-canvas-type-role="body" className="mt-0.5 flex items-center gap-1.5 tabular-nums text-fg">
                      {/* A plain sun and, below, a plain moon (owner-reported
                          2026-08-21). Two horizon-and-arrow variants read as
                          the same icon twice at 13px; sun versus crescent is
                          unmistakable at any size. */}
                      <svg data-weather-sunrise-icon="" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-300">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
                      </svg>
                      <span>{clockTime(snapshot.sunriseISO, settings.use24Hour)}</span>
                    </dd>
                  </div>
                )}
                {snapshot.sunsetISO && (
                  <div>
                    <dt data-canvas-type-role="metadata" className="text-fg-muted">Sunset</dt>
                    <dd data-canvas-type-role="body" className="mt-0.5 flex items-center gap-1.5 tabular-nums text-fg">
                      <svg data-weather-sunset-icon="" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-300">
                        <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />
                      </svg>
                      <span>{clockTime(snapshot.sunsetISO, settings.use24Hour)}</span>
                    </dd>
                  </div>
                )}
              </dl>

              <div data-weather-environment="" className="mt-3 border-t border-panel-border pt-3 short:mt-2 short:pt-2 xshort:mt-2 xshort:pt-2">
                <div data-canvas-type-role="metadata" className="uppercase tracking-[0.08em] text-fg-muted">
                  Environment
                </div>
                {enrichmentPending ? (
                  <p id={environmentFeedbackId} role="status" className="mt-2 text-sm text-fg-muted">
                    Loading environmental data…
                  </p>
                ) : environment?.status === 'available' && hasEnvironmentalReadings ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 short:gap-y-2 xshort:gap-y-2">
                    {environmentAqi && (
                      <div>
                        <dt data-canvas-type-role="metadata" className="text-fg-muted">Air quality</dt>
                        <dd data-canvas-type-role="body" className="mt-0.5 tabular-nums text-fg">
                          {environmentAqi.value} <span className="text-fg-muted">{environmentAqi.category}</span>
                        </dd>
                      </div>
                    )}
                    {environmentUv && (
                      <div>
                        <dt data-canvas-type-role="metadata" className="text-fg-muted">UV index</dt>
                        <dd data-canvas-type-role="body" className="mt-0.5 tabular-nums text-fg">
                          {environmentUv.value} <span className="text-fg-muted">{environmentUv.category}</span>
                        </dd>
                      </div>
                    )}
                    {environmentPollen && (
                      <div className={environmentAqi && environmentUv ? 'col-span-2' : undefined}>
                        <dt data-canvas-type-role="metadata" className="text-fg-muted">Pollen</dt>
                        <dd data-canvas-type-role="body" className="mt-0.5 tabular-nums text-fg">
                          {environmentPollen.kind === 'unavailable'
                            ? 'Pollen unavailable here'
                            : environmentPollen.kind === 'clear'
                              ? 'No pollen detected'
                              : `${environmentPollen.label} ${environmentPollen.grainsPerCubicMeter} grains/m³`}
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : environment?.status === 'available' ? (
                  <p className="mt-2 text-sm text-fg-muted">
                    Environmental readings unavailable for this location.
                  </p>
                ) : (
                  <p id={environmentFeedbackId} role="status" className="mt-2 text-sm text-fg-muted">
                    Environmental data unavailable.
                  </p>
                )}
                <a
                  href="https://open-meteo.com/en/docs/air-quality-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-canvas-type-role="metadata"
                  className="mt-2 inline-flex cursor-pointer text-fg-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Air quality and pollen: CAMS ENSEMBLE via Open-Meteo
                </a>
              </div>

              <div className="mt-3 short:mt-2 xshort:mt-2 flex items-center justify-between gap-3">
                {stale || error || retrying || enrichmentPending || environmentNeedsRetry ? (
                  <button
                    type="button"
                    onClick={requestRefresh}
                    disabled={loading || enrichmentPending || retrying}
                    aria-busy={loading || enrichmentPending || retrying || undefined}
                    aria-describedby={environmentNeedsRetry || enrichmentPending ? environmentFeedbackId : feedbackId}
                    className="inline-flex min-h-9 cursor-pointer items-center text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default"
                  >
                    Refresh
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
            </section>,
            document.body,
          )}
        </>
      )}
    </section>
  )
}
