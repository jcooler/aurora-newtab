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
  // Center ritual column (V1 hierarchy, top to bottom). Spacing re-derived
  // in the NL-P6 QA gate (2026-08-19): at the owner's exact 1408x445 window
  // the full clock block (30vh-capped glyph plus its date line) is ~20% of
  // the viewport HEIGHT, so the greeting needs >=22 points of clearance or
  // the two strike through each other on a FRESH INSTALL — the confirmed
  // F1/F2 findings. Clock rises to 20, greeting drops to 42, focus to 64.
  bookmarks: { x: 50, y: 4 },
  clock: { x: 50, y: 20 },
  greeting: { x: 50, y: 42 },
  worldClocks: { x: 50, y: 47 },
  countdown: { x: 50, y: 51 },
  search: { x: 50, y: 55 },
  focus: { x: 50, y: 64 },
  links: { x: 50, y: 72 },
  quote: { x: 50, y: 87 },
  // Corner tools. Tasks at 84, not 91: the fixed layout-badge/gear cluster
  // occupies the bottom-right 60-110px band and covered the launcher at
  // <=1024 widths (QA finding F3).
  timer: { x: 7, y: 13 },
  weather: { x: 93, y: 13 },
  notes: { x: 7, y: 91 },
  tasks: { x: 93, y: 84 },
  // Personal column, left edge. Re-derived AGAIN in the NL-P6 judgment pass
  // (finding F8, measured not eyeballed): the Calendar card and the Month
  // card overlapped by 25-40px at EVERY common height, 1920x1080 included,
  // because the month grid is ~215px tall while the gap was 11 percentage
  // points. Percent positions against pixel-height cards shrink as the
  // window shortens, so the literals are chosen to clear at the 768px
  // common-desktop floor and everything above it.
  ics: { x: 13, y: 23 },
  monthCal: { x: 13, y: 43 },
  habits: { x: 13, y: 62 },
  sun: { x: 13, y: 78 },
  moon: { x: 13, y: 90 },
  // Work column, right edge. The 9-point gaps (F8: 8 was half a card short,
  // so Jira struck through Vercel at 1366x768, and Status struck the
  // Weather chip above it) hold one-line COMPACT glances (see
  // defaultFreePlacement below) — nine simultaneous STANDARD cards can
  // never compose in one column at any common height (QA F5), so
  // connectors default to their glance tier and the user upsizes the ones
  // they care about.
  status: { x: 87, y: 25 },
  github: { x: 87, y: 33 },
  gitlab: { x: 87, y: 42 },
  jira: { x: 87, y: 51 },
  vercel: { x: 87, y: 60 },
  homeassistant: { x: 87, y: 69 },
  rss: { x: 87, y: 78 },
  crypto: { x: 87, y: 87 },
  // Browser-native pulse column. These are static starting points, separate
  // from the connector column, so enabling one never moves another widget.
  readingList: { x: 72, y: 28 },
  recentlyClosed: { x: 72, y: 47 },
  downloads: { x: 72, y: 66 },
  tabGroups: { x: 72, y: 85 },
  // New Work connectors use their own static glance column. They never move
  // the existing work or browser-native columns and remain user-placeable.
  linear: { x: 28, y: 34 },
  sentry: { x: 28, y: 51 },
  todoist: { x: 28, y: 68 },
  // Public-data widgets get fixed slots of their own. Enabling one never
  // moves another identity; any crowding remains user-owned.
  onThisDay: { x: 38, y: 28 },
  publicHolidays: { x: 38, y: 50 },
  auroraKp: { x: 38, y: 72 },
  // Optional local-only daily progress rail. Appended as a new identity so
  // every legacy source index and layer remains stable.
  progress: { x: 13, y: 70 },
})

/** Work-column connector identities that DEFAULT to their compact glance
 *  tier (QA F5): a column of one-line glances composes; a column of cards
 *  cannot. The user's own tier choices always override defaults. */
const COMPACT_DEFAULT_IDS: ReadonlySet<BlockId> = new Set([
  'status', 'github', 'gitlab', 'jira', 'vercel', 'homeassistant', 'rss', 'crypto',
  'readingList', 'recentlyClosed', 'downloads', 'tabGroups',
  'linear', 'sentry', 'todoist',
  'onThisDay',
  'publicHolidays',
  'auroraKp',
  'progress',
])

/** Default tier mirrors the retired preferred-size rule for the Desktop
 *  composition: the Clock leads at Full, the work-column connectors glance
 *  at Compact, everything else starts Standard (the renderer's
 *  resolveRenderTier clamps to what each widget declares). */
export function defaultFreePlacement(id: BlockId, layer: number): FreeWidgetPlacement {
  const point = DEFAULT_WIDGET_POINTS[id]
  return freePlacementFromPoint({
    x: point.x,
    y: point.y,
    tier: id === 'clock' ? 'full' : COMPACT_DEFAULT_IDS.has(id) ? 'compact' : 'standard',
    layer,
  })
}
