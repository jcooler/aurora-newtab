import type { HourlyPoint } from '../../lib/storage/schema'

/** The expanded weather panel's forecast area. Replaces the 12-hour ridgeline
 *  curve with the thing Jon actually asked for after seeing three variants —
 *  "the numbers ARE the display" (variant A): a fixed six-slot grid of real
 *  temperatures at real hours, sampled every two hours. His complaint was that
 *  the curve "isn't even readable, it's like a line graph or something," so
 *  there is deliberately no curve here — pure, tabulated numbers.
 *
 *  Pure functions over already-fetched Open-Meteo data — no formatting (the
 *  widget owns units/locale), no DOM, no new network calls. */

/** Rain chances under this read as noise, not information: the grid shows
 *  nothing beneath a slot below it (the retired ridgeline used the same floor
 *  to decide which hours got a rain column). Distinct from callout.ts's
 *  NOTABLE_PRECIP (30%) — that governs the softer "possible rain" sentence, a
 *  higher bar than merely "worth a number in the grid." */
export const PRECIP_FLOOR = 10

export interface ForecastSlot {
  /** Index into the source hourly array — also the React key. */
  index: number
  point: HourlyPoint
  /** True for the current hour (the first slot), which the grid emphasises
   *  with a soft filled chip and a "NOW" label. */
  now: boolean
}

/** Samples the hourly forecast into the grid's fixed slots: now, +2h, +4h …
 *  up to `count` slots `stepHours` apart (six every-two-hours slots by
 *  default — now/+2/+4/+6/+8/+10). Stops early rather than inventing hours if
 *  the forecast is shorter than the grid, so a truncated window renders the
 *  slots it can rather than a degenerate one. */
export function forecastSlots(hourly: HourlyPoint[], stepHours = 2, count = 6): ForecastSlot[] {
  const slots: ForecastSlot[] = []
  for (let k = 0; k < count; k++) {
    const index = k * stepHours
    const point = hourly[index]
    if (!point) break
    slots.push({ index, point, now: k === 0 })
  }
  return slots
}

/** The window's true High/Low across ALL fetched hours, for the header line.
 *  Sampling every two hours means the single warmest hour (a 3 PM peak, say)
 *  can fall BETWEEN slots and never get its own column — so the header carries
 *  the exact number the grid can't, computed over the whole window, not just
 *  the six sampled slots. Returns null for an empty forecast so the caller can
 *  omit the whole block rather than render "High —°". */
export function forecastRange(hourly: HourlyPoint[]): { hiC: number; loC: number } | null {
  if (hourly.length === 0) return null
  let hiC = hourly[0]!.tempC
  let loC = hourly[0]!.tempC
  for (const h of hourly) {
    if (h.tempC > hiC) hiC = h.tempC
    if (h.tempC < loC) loC = h.tempC
  }
  return { hiC, loC }
}
