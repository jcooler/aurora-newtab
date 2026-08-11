// Synodic moon phase — pure math, no network/storage. PURE — no `Date.now()`,
// no `new Date()` with no arguments; every input comes from the `date`
// argument the caller passes.

export interface MoonPhase {
  name: string
  glyph: string
  age: number
  fraction: number
}

export const SYNODIC_DAYS = 29.530588853

const MS_PER_DAY = 86_400_000

// A known new moon, used as the phase-cycle anchor.
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0)

const NORTHERN_GLYPHS: Record<string, string> = {
  'New moon': '🌑',
  'Waxing crescent': '🌒',
  'First quarter': '🌓',
  'Waxing gibbous': '🌔',
  'Full moon': '🌕',
  'Waning gibbous': '🌖',
  'Last quarter': '🌗',
  'Waning crescent': '🌘',
}

// Southern-hemisphere view mirrors the crescent/gibbous/quarter glyphs
// left-right; New and Full stay the same symmetric disc either way.
const SOUTHERN_GLYPHS: Record<string, string> = {
  'New moon': '🌑',
  'Waxing crescent': '🌘',
  'First quarter': '🌗',
  'Waxing gibbous': '🌖',
  'Full moon': '🌕',
  'Waning gibbous': '🌔',
  'Last quarter': '🌓',
  'Waning crescent': '🌒',
}

// Eight equal 1/8-wide segments, each centered on its principal fraction
// (0, 0.25, 0.5, 0.75) or the midpoint of the gap between two principals.
function phaseNameFor(fraction: number): string {
  if (fraction < 1 / 16 || fraction >= 15 / 16) return 'New moon'
  if (fraction < 3 / 16) return 'Waxing crescent'
  if (fraction < 5 / 16) return 'First quarter'
  if (fraction < 7 / 16) return 'Waxing gibbous'
  if (fraction < 9 / 16) return 'Full moon'
  if (fraction < 11 / 16) return 'Waning gibbous'
  if (fraction < 13 / 16) return 'Last quarter'
  return 'Waning crescent'
}

/** Moon phase for `date`: `age` in days since the nearest-preceding new moon
 *  (measured from the 2000-01-06T18:14:00Z reference new moon, modulo
 *  SYNODIC_DAYS, negative-safe so it always lands in [0, SYNODIC_DAYS)),
 *  `fraction` = age / SYNODIC_DAYS in [0,1), and the phase `name` + `glyph`
 *  for one of the eight standard equal segments centered on the principal
 *  phases. `southern` mirrors the glyph for the four non-principal phases
 *  and the two quarters (names are unchanged — only the glyph differs
 *  between hemispheres). PURE. */
export function moonPhase(date: Date, southern = false): MoonPhase {
  let age = ((date.getTime() - REFERENCE_NEW_MOON) / MS_PER_DAY) % SYNODIC_DAYS
  if (age < 0) age += SYNODIC_DAYS
  const fraction = age / SYNODIC_DAYS
  const name = phaseNameFor(fraction)
  const glyph = (southern ? SOUTHERN_GLYPHS : NORTHERN_GLYPHS)[name]!
  return { name, glyph, age, fraction }
}
