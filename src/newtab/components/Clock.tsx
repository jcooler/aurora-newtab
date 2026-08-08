import { formatClock } from '../../lib/clock'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function Clock() {
  const [settings] = useStoredKey('settings')
  const now = useNow()
  if (!settings) return null
  return (
    <time
      dateTime={now.toISOString()}
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
      className="text-photo text-canvas-fg font-display text-[clamp(3rem,min(12vw,20vh),10rem)] font-medium tabular-nums tracking-[-0.02em]"
    >
      {formatClock(now, settings.use24Hour)}
    </time>
  )
}
