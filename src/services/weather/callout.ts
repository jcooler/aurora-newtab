import type { HourlyPoint } from '../../lib/storage/schema'
import { NOTABLE_PRECIP } from './trend'

/** Above this, rain stops being a possibility and becomes the forecast. Local
 *  to this file — it has no counterpart in the trend graphic, which draws one
 *  column per hour rather than picking a single headline hour. */
const LIKELY_PRECIP = 50

function formatHour(iso: string, use24Hour: boolean): string {
  const hour = Number(iso.slice(11, 13))
  if (use24Hour) return `${String(hour).padStart(2, '0')}:00`
  const h12 = hour % 12 || 12
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`
}

/** The expanded panel's trend graphic emphasises exactly the hours this
 *  callout is willing to mention, by importing the SAME `NOTABLE_PRECIP` it
 *  uses below (see trend.ts) rather than repeating the number. The two are
 *  read together — the callout names the hour, the graphic shows the shape —
 *  so a silent drift between them would put a highlighted column under a
 *  panel that says nothing about rain. */
export function rainCallout(hourly: HourlyPoint[], use24Hour: boolean): string | null {
  const likely = hourly.find((h) => h.precipProb >= LIKELY_PRECIP)
  if (likely) return `Rain likely around ${formatHour(likely.time, use24Hour)}.`
  const possible = hourly.find((h) => h.precipProb >= NOTABLE_PRECIP)
  if (possible) return `Possible rain around ${formatHour(possible.time, use24Hour)}.`
  return null
}
