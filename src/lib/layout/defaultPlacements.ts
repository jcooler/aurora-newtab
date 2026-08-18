import { freePlacementFromPoint, type FreeWidgetPlacement } from './namedLayouts'
import type { BlockId } from './types'

/** The designed default composition: one STATIC per-widget position table
 *  (the V1 Desktop composition), used when a widget is enabled but the
 *  layout has no placement for it — at first-run derivation and for a
 *  newly enabled widget before the user places it.
 *
 *  This is a lookup table, not a planner: positions are fixed literals per
 *  widget identity, independent of window size, widget count, or what else
 *  is enabled (the named-layouts spec §1 bans guessing and re-flow; a
 *  designed starting composition is not a guess). Enabling fewer widgets
 *  simply leaves the other slots empty. */
export const DEFAULT_WIDGET_POINTS: Readonly<Record<BlockId, { x: number; y: number }>> = Object.freeze({
  // Center ritual column (V1 hierarchy, top to bottom).
  bookmarks: { x: 50, y: 4 },
  clock: { x: 50, y: 24 },
  greeting: { x: 50, y: 37 },
  worldClocks: { x: 50, y: 43 },
  countdown: { x: 50, y: 48 },
  search: { x: 50, y: 54 },
  focus: { x: 50, y: 62 },
  links: { x: 50, y: 71 },
  quote: { x: 50, y: 87 },
  // Corner tools.
  timer: { x: 7, y: 13 },
  weather: { x: 93, y: 13 },
  notes: { x: 7, y: 91 },
  tasks: { x: 93, y: 91 },
  // Personal column, left edge.
  ics: { x: 13, y: 23 },
  monthCal: { x: 13, y: 37 },
  habits: { x: 13, y: 51 },
  sun: { x: 13, y: 65 },
  moon: { x: 13, y: 78 },
  // Work column, right edge.
  status: { x: 87, y: 23 },
  github: { x: 87, y: 31 },
  gitlab: { x: 87, y: 39 },
  jira: { x: 87, y: 47 },
  vercel: { x: 87, y: 55 },
  homeassistant: { x: 87, y: 62 },
  rss: { x: 87, y: 70 },
  crypto: { x: 87, y: 78 },
})

/** Default tier mirrors the retired preferred-size rule for the Desktop
 *  composition: the Clock leads at Full, everything else starts Standard
 *  (the renderer's resolveRenderTier clamps to what each widget declares). */
export function defaultFreePlacement(id: BlockId, layer: number): FreeWidgetPlacement {
  const point = DEFAULT_WIDGET_POINTS[id]
  return freePlacementFromPoint({
    x: point.x,
    y: point.y,
    tier: id === 'clock' ? 'full' : 'standard',
    layer,
  })
}
