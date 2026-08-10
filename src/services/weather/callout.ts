import type { HourlyPoint } from '../../lib/storage/schema'

/** Rain chance at or above this reads as "worth mentioning" — the boundary
 *  between the softer "Possible rain" line and staying silent. Exported so the
 *  test can pin the seam at the exact boundary from both sides. (It used to be
 *  shared with the ridgeline graphic, which emphasised its columns at the same
 *  threshold; the graphic retired with Jon's grid redesign, so this constant
 *  now lives with its one remaining consumer, the callout.) */
export const NOTABLE_PRECIP = 30

/** Above this, rain stops being a possibility and becomes the forecast. Local
 *  to this file — the grid draws a number under every hour at or above its own
 *  lower PRECIP_FLOOR rather than picking a single headline hour. */
const LIKELY_PRECIP = 50

function formatHour(iso: string, use24Hour: boolean): string {
  const hour = Number(iso.slice(11, 13))
  if (use24Hour) return `${String(hour).padStart(2, '0')}:00`
  const h12 = hour % 12 || 12
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`
}

/** The one-line rain headline above the forecast grid — it names the hour rain
 *  first crosses a threshold; the grid below shows the per-slot chances. The
 *  callout picks a single headline hour at LIKELY/NOTABLE, a higher bar than
 *  the grid's own PRECIP_FLOOR, so the sentence stays quiet on a drizzly
 *  window the grid still annotates. */
export function rainCallout(hourly: HourlyPoint[], use24Hour: boolean): string | null {
  const likely = hourly.find((h) => h.precipProb >= LIKELY_PRECIP)
  if (likely) return `Rain likely around ${formatHour(likely.time, use24Hour)}.`
  const possible = hourly.find((h) => h.precipProb >= NOTABLE_PRECIP)
  if (possible) return `Possible rain around ${formatHour(possible.time, use24Hour)}.`
  return null
}
