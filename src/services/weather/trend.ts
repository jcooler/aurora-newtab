import type { HourlyPoint } from '../../lib/storage/schema'

/** Geometry for the expanded weather panel's 12-hour "ridgeline" — one drawn
 *  curve (temperature) over a quiet field of rain-probability columns.
 *
 *  Why a drawing instead of the twelve tabulated columns it replaces: those
 *  columns were a fixed-width strip inside a horizontally-SCROLLING row (872px
 *  of cards in a 510px box), which is what produced the always-on Windows
 *  scrollbar, and — because a press on a native scrollbar targets the scroll
 *  container itself, which `useLongPress` does not treat as interactive —
 *  what let a scrollbar drag engage arrange mode. An SVG with a fixed viewBox
 *  and `width: 100%` cannot overflow its container at ANY viewport by
 *  construction: there is no width to run out of, so there is no scroll region
 *  to create, and nothing to grab. It also reads better: the SHAPE of the next
 *  twelve hours is the thing a glance actually wants.
 *
 *  Pure functions over already-fetched Open-Meteo data — no formatting (the
 *  widget owns units/locale), no DOM, no new network calls. */

/** Fixed drawing space. The rendered <svg> scales this uniformly via
 *  `viewBox` + `width: 100%`, so every number below is in viewBox units, not
 *  pixels, and the graphic is resolution- and container-independent. */
/** Drawing width, and the two drawing heights: the taller one reserves a band
 *  for the rain columns, the shorter one is used when the whole window is dry
 *  and that band would otherwise be an empty gutter. */
export const TREND_VIEWBOX = { w: 320, h: 96, hDry: 76 } as const

/** Horizontal inset so neither the "now" dot nor the first/last precip column
 *  can clip at the edges. */
const PAD_X = 10
/** The temperature curve lives in this vertical band; the precip columns rise
 *  from BASELINE into the band below it. The gap between AREA_BOTTOM and the
 *  tallest possible column keeps the two series legibly separate even when the
 *  curve bottoms out at the same hour rain peaks. */
const CURVE_TOP = 12
const CURVE_BOTTOM = 60
const AREA_BOTTOM = 70
const BASELINE = 94
/** Where the hairline sits when there are no columns to stand on it. */
const BASELINE_DRY = 74
const PRECIP_MAX_H = 22
/** Column width as a fraction of the spacing between hours — narrow enough
 *  that the field reads as texture under the curve, not as a second chart. */
const COLUMN_RATIO = 0.5
/** Radius of the "now" marker at the first hour. */
export const NOW_DOT_R = 3.5

/** Smallest temperature swing (°C) that fills the curve band top to bottom.
 *  Without this, normalising to the window's own min/max turns a night that
 *  only moves 1° into a dramatic mountain range — technically true, visually a
 *  lie. Below this span the curve is centred and drawn proportionally
 *  shallower, so a flat night looks flat. */
const MIN_SPAN_C = 5
/** Rain chances under this are noise, not information — drawn as nothing at
 *  all rather than as a sliver too short to read. Anything at or above it gets
 *  at least MIN_COLUMN_H so it is always visible. */
const PRECIP_FLOOR = 10
const MIN_COLUMN_H = 2.5

/** Rain chance at or above this reads as "worth knowing about" and is drawn
 *  at full strength. `rainCallout` (callout.ts) IMPORTS this constant for its
 *  own "possible rain" line rather than repeating the number, so the callout
 *  and the graphic can never disagree about which hours matter — they are
 *  read together, one naming the hour and the other showing the shape. */
export const NOTABLE_PRECIP = 30

export interface TrendColumn {
  /** Hour index in the source array — also the React key. */
  i: number
  x: number
  y: number
  w: number
  h: number
  notable: boolean
}

export interface TrendGeometry {
  /** Smooth cubic path through every hourly temperature. */
  line: string
  /** `line`, closed down to AREA_BOTTOM, for the soft gradient fill. */
  area: string
  /** One column per hour whose rain chance is worth drawing. */
  columns: TrendColumn[]
  /** Baseline y, for the hairline the columns stand on. */
  baseline: number
  /** Drawing height to render — shorter when there is no rain band to show. */
  height: number
  /** The first hour's point — where "now" is marked on the curve. */
  start: { x: number; y: number }
  hi: { tempC: number; index: number }
  lo: { tempC: number; index: number }
  /** Highest rain chance in the window, 0-100. */
  peakPrecip: { prob: number; index: number }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** Evenly spaced indices across `n` points, always including the first and
 *  last — the hour labels under the graphic. */
export function tickIndices(n: number, count = 4): number[] {
  if (n <= 0) return []
  if (n === 1) return [0]
  const wanted = Math.min(count, n)
  if (wanted <= 1) return [0]
  const out: number[] = []
  for (let k = 0; k < wanted; k++) {
    const i = Math.round((k * (n - 1)) / (wanted - 1))
    if (!out.includes(i)) out.push(i)
  }
  return out
}

/** Catmull-Rom through every point, emitted as cubic beziers — a curve that
 *  actually passes through each hour's temperature (unlike a smoothing spline
 *  that would draw a temperature the data never reported). */
function smoothPath(pts: { x: number; y: number }[]): string {
  let d = `M ${round(pts[0]!.x)} ${round(pts[0]!.y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] ?? p2
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += ` C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(p2.x)} ${round(p2.y)}`
  }
  return d
}

/** Returns null for anything unplottable (fewer than two hours) so the caller
 *  can omit the whole graphic rather than render a degenerate one. */
export function trendGeometry(hourly: HourlyPoint[]): TrendGeometry | null {
  const n = hourly.length
  if (n < 2) return null

  const temps = hourly.map((h) => h.tempC)
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  const span = max - min

  const step = (TREND_VIEWBOX.w - PAD_X * 2) / (n - 1)
  // Centred on the window's midpoint and scaled by at least MIN_SPAN_C, so a
  // genuinely flat night reads flat instead of being stretched to fill the
  // band. A span at or above MIN_SPAN_C still uses the full height.
  const mid = (min + max) / 2
  const effSpan = Math.max(span, MIN_SPAN_C)
  const pts = temps.map((t, i) => ({
    x: PAD_X + i * step,
    y: CURVE_BOTTOM - (0.5 + (t - mid) / effSpan) * (CURVE_BOTTOM - CURVE_TOP),
  }))

  const colW = step * COLUMN_RATIO
  const columns: TrendColumn[] = []
  for (let i = 0; i < n; i++) {
    const prob = Math.max(0, Math.min(100, hourly[i]!.precipProb ?? 0))
    if (prob < PRECIP_FLOOR) continue
    const h = Math.max(MIN_COLUMN_H, (prob / 100) * PRECIP_MAX_H)
    columns.push({
      i,
      x: round(pts[i]!.x - colW / 2),
      y: round(BASELINE - h),
      w: round(colW),
      h: round(h),
      notable: prob >= NOTABLE_PRECIP,
    })
  }

  const line = smoothPath(pts)
  const first = pts[0]!
  const last = pts[n - 1]!

  let peakIndex = 0
  for (let i = 1; i < n; i++) {
    if ((hourly[i]!.precipProb ?? 0) > (hourly[peakIndex]!.precipProb ?? 0)) peakIndex = i
  }

  return {
    line,
    area: `${line} L ${round(last.x)} ${AREA_BOTTOM} L ${round(first.x)} ${AREA_BOTTOM} Z`,
    columns,
    baseline: columns.length > 0 ? BASELINE : BASELINE_DRY,
    height: columns.length > 0 ? TREND_VIEWBOX.h : TREND_VIEWBOX.hDry,
    start: { x: round(first.x), y: round(first.y) },
    hi: { tempC: max, index: temps.indexOf(max) },
    lo: { tempC: min, index: temps.indexOf(min) },
    peakPrecip: { prob: hourly[peakIndex]!.precipProb ?? 0, index: peakIndex },
  }
}
