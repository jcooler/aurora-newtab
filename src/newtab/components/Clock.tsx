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
      // `min()` can only ever pull the preferred value DOWN from the old
      // 12vw-only curve, never up: at any viewport where height was already
      // generous relative to width (the common case — vw was already the
      // binding term, e.g. every existing preview capture at 1600x900+),
      // 20vh comfortably exceeds 12vw and this resolves to the exact same
      // value as before. It only engages when height is the scarcer
      // dimension, exactly the short-window case this exists to fix.
      className="text-photo font-display text-[clamp(3rem,min(12vw,20vh),10rem)] font-medium tabular-nums tracking-[-0.02em]"
    >
      {formatClock(now, settings.use24Hour)}
    </time>
  )
}
