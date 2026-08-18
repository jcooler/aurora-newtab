import { formatClock, formatDayContext } from '../../lib/clock'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function Clock({ docked = false }: { docked?: boolean } = {}) {
  const [settings] = useStoredKey('settings')
  const now = useNow()
  if (!settings) return null
  if (docked) {
    // The Docked tier (named-layouts spec 2.3): one dense text-first line —
    // time · date, middle dots separating facts. Same clock sample and
    // accessible <time> value as the free face; no big-glyph block.
    return (
      <div data-dock-line="" className="dock-line">
        <time dateTime={now.toISOString()} data-canvas-type-role="body" className="tabular-nums font-medium">
          {formatClock(now, settings.use24Hour)}
        </time>
        <span aria-hidden className="text-fg-muted">·</span>
        <span data-canvas-type-role="body" className="text-fg-muted">
          {formatDayContext(now, 'compact')}
        </span>
      </div>
    )
  }
  return (
    <div data-clock-face="" className="clock-face">
      <time
        dateTime={now.toISOString()}
        data-canvas-type-role="clock"
      // The scale term is `min(12vw, 20vh)`, not `12vw` alone — the old
      // width-only clamp() rendered ~160px tall at the owner's ~1420x437
      // short-wide window (12vw already exceeded the 10rem ceiling there) and
      // collided with the greeting below it. Adding a height term makes the
      // scale continuous across BOTH axes, so it degrades smoothly as the
      // window gets shorter instead of jumping at a breakpoint (unlike the
      // secondary type below, which steps via the `short`/`xshort` variants
      // — the clock is the one element worth a fluid curve, since it's the
      // single biggest overlap risk and the thing Jon actually screenshotted).
      // This curve is monotonically ≤ the old `clamp(6rem, 12vw, 10rem)` at
      // every viewport (review-verified algebraically), via TWO mechanisms:
      // (1) the `min()` height term engages when height is the scarcer
      // dimension — the short-window case this exists to fix; (2) the floor
      // dropped 6rem→3rem, which independently shrinks the clock on NARROW
      // windows even at generous heights (e.g. 500x900: 96px→60px) so a
      // skinny side-window isn't dominated by a floor-clamped clock. At
      // standard sizes (1600x900 and up) both old and new saturate against
      // the shared 10rem ceiling and render identically.
      //
      // `var(--clock-font)`, not the clamp() written out here — index.css
      // now owns this expression (VALUE unchanged) as the single source of
      // truth, because the collapsed weather chip needs the clock's own
      // rendered half-width to stay clear of it at short-wide sizes
      // (`--clock-half-w`, derived from this SAME property) and a second,
      // hand-copied clamp() in WeatherWidget.tsx would be one more place
      // this number could silently drift. See index.css's own comment on
      // both properties for the full derivation.
      //
      // The explicit `length:` type hint is LOAD-BEARING, not decoration —
      // `text-[var(--clock-font)]` alone is ambiguous (a bare `var()` gives
      // Tailwind's arbitrary-value type sniffer nothing to recognise as a
      // length, unlike the literal `clamp(3rem,…)` this replaced), and it
      // silently resolved as `text-{color}` instead: the clock rendered at
      // an inherited ~12px with `color: var(--clock-font)` quietly doing
      // nothing (an invalid color, dropped) — found by this fix's own
      // measurement probe, not by inspection.
        className="text-photo text-canvas-fg font-display text-[length:var(--clock-font)] font-medium tabular-nums tracking-[-0.02em]"
      >
        {formatClock(now, settings.use24Hour)}
      </time>
      <span data-clock-date="" data-canvas-type-role="date" className="text-photo text-canvas-fg-muted">
        {formatDayContext(now, 'long')}
      </span>
    </div>
  )
}
