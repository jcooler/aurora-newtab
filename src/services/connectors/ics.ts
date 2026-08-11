// src/services/connectors/ics.ts — the ICS (iCalendar) connector's service
// layer: a PURE parser + bounded RRULE expander (parseIcs), the .text()/8s-abort
// fetch boundary (fetchIcs), and the registry descriptor. Task 53.
//
// PURITY: parseIcs takes `windowStart` (an epoch) and `windowDays` as
// parameters and never calls Date.now(). The widget (Task 54) supplies
// Date.now() inside its refresh closure — the one impure boundary — and hands
// the resulting windowStart to fetchIcs, which forwards it to parseIcs. No
// Date.now() appears anywhere in this file.
//
// AUTH: deliberately auth:'none', NOT 'token'. There is no identity to render —
// the secret is the URL itself (an ICS "private address" grants read access to
// the whole calendar). So secretFields:['url'] and there is no identityField.
// backup.test.ts's ics case is the first auth-'none' connector that DOES strip
// a secret (crypto/rss strip nothing) — see that file.
//
// TZID STRATEGY (decided up front): to convert a TZID-stamped local wall time
// to an epoch we use the JS runtime's own IANA zone database via Intl, NOT the
// VTIMEZONE block in the file. VTIMEZONE bodies are SKIPPED entirely (their
// DTSTART/RRULE lines describe the zone's own transitions, not events). The
// conversion is the well-known two-pass offset trick (see wallToEpochInZone):
// format a UTC guess in the target zone to read its offset, correct by that
// offset, then re-read once to settle DST transitions to the minute. If the
// runtime doesn't know the zone id, the event is treated as floating local and,
// for an RRULE, only its base occurrence is rendered (we can't safely expand a
// recurrence whose wall-time-to-instant mapping we don't know).
//
// BOUNDED PROMISE: FREQ=DAILY|WEEKLY|MONTHLY with INTERVAL/COUNT/UNTIL, plus
// BYDAY for WEEKLY (e.g. MO,WE,FR) and a single simple BYMONTHDAY (or the
// day-of-DTSTART) for MONTHLY. ANYTHING beyond that — YEARLY/other FREQ,
// BYSETPOS, ordinal BYDAY (2MO), multiple BYMONTHDAY, etc. — renders the base
// occurrence ONLY. Malformed input → [].
import type { ConnectorDescriptor, IcsCalendar, IcsConfig } from './types'
import { originPattern } from '../permissions'

export interface IcsEvent {
  summary: string
  start: number // epoch ms — an expanded occurrence's start instant
  end: number // epoch ms
  // First matched video-conferencing provider link found in LOCATION/
  // DESCRIPTION (Task 88) — see extractMeetUrl. ABSENT (the key itself, not
  // an undefined-valued one — expand() uses a conditional spread) when
  // neither field carries a recognized provider URL, so a stored/exported
  // event's JSON shape stays clean rather than growing a `meetUrl: undefined`
  // on every event without a link.
  meetUrl?: string
  cal: number // index into the calendars array — drives dot color and the per-calendar view; parseIcs emits events WITHOUT it, fetchIcs tags per feed
}

export interface IcsData {
  events: IcsEvent[] // sorted by start ascending
}

// ---------------------------------------------------------------------------
// PARSING (line unfolding + property extraction + VEVENT collection). This
// half does NOT count toward the 300-line RRULE-expander STOP budget — it is
// the line-unfolding/property parsing the brief explicitly excludes.
// ---------------------------------------------------------------------------

interface Wall {
  y: number
  mo: number // 1-12
  d: number
  h: number
  mi: number
  s: number
}

type Zone =
  | { kind: 'utc' }
  | { kind: 'floating' } // runtime local time
  | { kind: 'date' } // all-day (VALUE=DATE) — floating local midnight, 1-day default span
  | { kind: 'zoned'; tz: string } // named IANA zone via TZID

interface DateSpec {
  wall: Wall
  zone: Zone
  allDay: boolean
}

interface RRule {
  freq: string
  interval: number
  count: number | null
  until: DateSpec | null
  byday: number[] | null // weekday indices 0=SU..6=SA (WEEKLY only)
  bymonthday: number | null // single simple day-of-month (MONTHLY only)
  supported: boolean // false → render base occurrence only
}

interface ParsedEvent {
  summary: string
  start: DateSpec
  end: DateSpec | null
  duration: number | null // ms, from a DURATION property (used only when end is null)
  rrule: RRule | null
  exdates: DateSpec[]
  location: string // unescaped LOCATION text, '' when absent — scanned for a meeting link (Task 88)
  description: string // unescaped DESCRIPTION text, '' when absent — scanned for a meeting link (Task 88)
}

/** RFC 5545 line unfolding: a physical line beginning with a space or tab is a
 *  continuation of the previous one (the single leading whitespace is the fold
 *  marker and is removed). Tolerates CRLF, bare LF, and bare CR line endings. */
function unfold(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (out.length > 0 && (line.startsWith(' ') || line.startsWith('\t'))) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

/** Splits `s` on `sep`, ignoring separators inside double quotes. */
function splitUnquoted(s: string, sep: string): string[] {
  const out: string[] = []
  let buf = ''
  let inQuote = false
  for (const ch of s) {
    if (ch === '"') inQuote = !inQuote
    if (ch === sep && !inQuote) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out
}

interface ContentLine {
  name: string
  params: Map<string, string>
  value: string
}

/** Splits one unfolded content line into NAME, params, and value at the first
 *  unquoted colon (`NAME;PARAM=val;PARAM2="v:with:colons":VALUE`). */
function parseContentLine(line: string): ContentLine {
  let inQuote = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuote = !inQuote
    else if (ch === ':' && !inQuote) {
      colon = i
      break
    }
  }
  if (colon < 0) return { name: line.toUpperCase(), params: new Map(), value: '' }
  const left = splitUnquoted(line.slice(0, colon), ';')
  const params = new Map<string, string>()
  for (const part of left.slice(1)) {
    const eq = part.indexOf('=')
    if (eq > 0) params.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1).replace(/^"|"$/g, ''))
  }
  return { name: left[0]!.toUpperCase(), params, value: line.slice(colon + 1) }
}

/** Decodes iCalendar TEXT escapes in a property value: \n / \N → newline,
 *  \, → comma, \; → semicolon, \\ → backslash. */
function unescapeText(s: string): string {
  return s.replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch))
}

// ---------------------------------------------------------------------------
// MEETING LINKS (Task 88): LOCATION/DESCRIPTION are scanned for a first-party
// video-conferencing URL so the widget can render a one-click join button.
// https-ONLY: every supported provider serves its join links over https, and
// treating a bare http:// candidate as trustworthy would accept a spoofed or
// protocol-downgraded link. The candidate regex casts a wide net — everything
// up to the next whitespace/angle-bracket/quote — and `new URL()` is the real
// validator; a candidate that fails to parse (e.g. a truncated
// "https://[..." left by upstream text mangling) is skipped rather than
// aborting the whole scan, so one bad candidate never hides a good one
// appearing later in the same field.
// ---------------------------------------------------------------------------

const HTTPS_CANDIDATE_RE = /https:\/\/[^\s<>"]+/g

/** True if `url` points at a supported video-conferencing provider. Every
 *  host check is SUFFIX-safe — `endsWith('.host')` or an exact `===`, never
 *  `includes` — because a substring check lets a lookalike attacker domain
 *  such as `evilzoom.us.attacker.com` (which CONTAINS "zoom.us" but is
 *  neither the zoom.us host nor one of its subdomains) pass as a real Zoom
 *  link. meet.google.com and the Teams host are matched EXACTLY (neither has
 *  a legitimate subdomain variant for meeting links); zoom.us/webex.com/
 *  whereby.com accept any subdomain, since real deployments serve meetings
 *  from per-region or per-org subdomains (us02web.zoom.us,
 *  mycompany.webex.com, ...). Teams carries an extra constraint beyond the
 *  host: teams.microsoft.com hosts plenty of non-meeting pages, so the path
 *  must also contain the meetup-join segment to count as a join link.
 */
function isMeetingUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'zoom.us' || host.endsWith('.zoom.us')) return true
  if (host === 'meet.google.com') return true
  if (host === 'teams.microsoft.com' && url.pathname.includes('/l/meetup-join')) return true
  if (host === 'webex.com' || host.endsWith('.webex.com')) return true
  if (host === 'whereby.com' || host.endsWith('.whereby.com')) return true
  return false
}

/** Scans one field's text for the first https URL that resolves to a
 *  supported provider (isMeetingUrl above), or undefined if none does. */
function firstMeetingUrlIn(text: string): string | undefined {
  for (const candidate of text.match(HTTPS_CANDIDATE_RE) ?? []) {
    try {
      if (isMeetingUrl(new URL(candidate))) return candidate
    } catch {
      // Unparseable candidate — skip it, keep scanning the rest of the field.
    }
  }
  return undefined
}

/** Finds the meeting URL for one event: LOCATION is scanned before
 *  DESCRIPTION (an explicit LOCATION is the more deliberate signal — a
 *  DESCRIPTION's free-form body often quotes several URLs, including stale
 *  links left over from a rescheduled meeting or unrelated doc links), first
 *  match wins within each field. PURE — exported for direct testing, and
 *  because the caller (expand, below) must compute this ONCE per event and
 *  stamp the SAME value onto every expanded occurrence rather than
 *  recomputing it per occurrence. */
export function extractMeetUrl(location: string, description: string): string | undefined {
  return firstMeetingUrlIn(location) ?? firstMeetingUrlIn(description)
}

/** Parses a DATE or DATE-TIME property value + its params into wall components
 *  and a zone. Throws on a value that isn't a valid ICS date/date-time so the
 *  caller can drop just that event. */
function parseDateSpec(value: string, params: Map<string, string>): DateSpec {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/)
  if (!m) throw new Error(`ics: unparseable date value ${JSON.stringify(value)}`)
  const hasTime = m[4] !== undefined
  const wall: Wall = { y: +m[1]!, mo: +m[2]!, d: +m[3]!, h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0) }
  const allDay = (params.get('VALUE') === 'DATE' || !hasTime) && !m[7]
  const tzid = params.get('TZID')
  let zone: Zone
  if (allDay) zone = { kind: 'date' }
  else if (m[7]) zone = { kind: 'utc' }
  else if (tzid) zone = { kind: 'zoned', tz: tzid }
  else zone = { kind: 'floating' }
  return { wall, zone, allDay }
}

/** ISO 8601 duration (e.g. PT1H30M, P1DT2H, P1W) → ms, or null if unparseable. */
function parseDuration(value: string): number | null {
  const m = value.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m || (!m[2] && !m[3] && !m[4] && !m[5] && !m[6])) return null
  const sign = m[1] === '-' ? -1 : 1
  const ms = (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86_400_000 + +(m[4] ?? 0) * 3_600_000 + +(m[5] ?? 0) * 60_000 + +(m[6] ?? 0) * 1000
  return sign * ms
}

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** Parses an RRULE value, flagging `supported: false` for anything outside the
 *  bounded promise so the expander falls back to a single base occurrence. */
function parseRRule(value: string): RRule {
  const parts = new Map<string, string>()
  for (const seg of value.split(';')) {
    const eq = seg.indexOf('=')
    if (eq > 0) parts.set(seg.slice(0, eq).toUpperCase(), seg.slice(eq + 1))
  }
  const freq = (parts.get('FREQ') ?? '').toUpperCase()
  const interval = Math.max(1, Math.trunc(Number(parts.get('INTERVAL') ?? 1)) || 1)
  // Number(...) on a malformed value ("3x") yields NaN, not a thrown error —
  // left uncoerced, `rr.count !== null && counted >= rr.count` and
  // `rr.count === null && start >= winEnd` (the expander's two stop
  // conditions, below) both evaluate false against NaN, so a bad COUNT used
  // to defeat BOTH loop guards at once (bounded only by MAX_ITERATIONS,
  // wastefully). Number.isFinite folds that case to `null` — the same
  // "no COUNT" the field already means when absent entirely — restoring the
  // window-bounded stop.
  const countN = parts.has('COUNT') ? Number(parts.get('COUNT')) : NaN
  const count = Number.isFinite(countN) ? Math.trunc(countN) : null
  const until = parts.has('UNTIL') ? tryParseDate(parts.get('UNTIL')!) : null

  // Which BY* parts appear determines whether we can honor the rule exactly.
  const byPartKeys = [...parts.keys()].filter((k) => k.startsWith('BY'))
  let byday: number[] | null = null
  let bymonthday: number | null = null
  let supported = freq === 'DAILY' || freq === 'WEEKLY' || freq === 'MONTHLY'

  if (freq === 'DAILY') {
    if (byPartKeys.length > 0) supported = false // we don't filter DAILY by any BY* part
  } else if (freq === 'WEEKLY') {
    for (const key of byPartKeys) {
      if (key !== 'BYDAY') supported = false // BYMONTHDAY/BYSETPOS/... on WEEKLY → unsupported
    }
    if (parts.has('BYDAY')) {
      const days = parts.get('BYDAY')!.split(',')
      // Plain weekday codes only — an ordinal like 2MO/-1FR is beyond the promise.
      if (days.every((d) => d in WEEKDAYS)) byday = days.map((d) => WEEKDAYS[d]!)
      else supported = false
    }
  } else if (freq === 'MONTHLY') {
    for (const key of byPartKeys) {
      if (key !== 'BYMONTHDAY') supported = false // BYDAY/BYSETPOS/... on MONTHLY → unsupported
    }
    if (parts.has('BYMONTHDAY')) {
      const days = parts.get('BYMONTHDAY')!.split(',')
      const n = Number(days[0])
      if (days.length === 1 && Number.isInteger(n) && n >= 1 && n <= 31) bymonthday = n
      else supported = false // multiple days, or a negative (from-end) value → unsupported
    }
  }

  return { freq, interval, count, until, byday, bymonthday, supported }
}

/** parseDateSpec that returns null instead of throwing (for optional fields). */
function tryParseDate(value: string, params: Map<string, string> = new Map()): DateSpec | null {
  try {
    return parseDateSpec(value, params)
  } catch {
    return null
  }
}

/** Walks unfolded lines, collecting VEVENTs into ParsedEvents. VTIMEZONE blocks
 *  (and any nested sub-component of an event, e.g. VALARM) are skipped so their
 *  own DTSTART/RRULE lines never leak into an event. An event with no parseable
 *  DTSTART is dropped; a single bad event never blanks its siblings. */
function parseCalendar(text: string): ParsedEvent[] {
  const events: ParsedEvent[] = []
  let inTimezone = false
  let subDepth = 0 // nested components inside the current VEVENT (VALARM, …)
  let cur: Map<string, ContentLine[]> | null = null

  for (const line of unfold(text)) {
    const cl = parseContentLine(line)
    if (cl.name === 'BEGIN') {
      const block = cl.value.toUpperCase()
      if (block === 'VTIMEZONE') inTimezone = true
      else if (block === 'VEVENT' && !inTimezone && !cur) cur = new Map()
      else if (cur && !inTimezone) subDepth++
      continue
    }
    if (cl.name === 'END') {
      const block = cl.value.toUpperCase()
      if (block === 'VTIMEZONE') inTimezone = false
      else if (block === 'VEVENT' && cur && subDepth === 0) {
        const built = buildEvent(cur)
        if (built) events.push(built)
        cur = null
      } else if (cur && subDepth > 0) subDepth--
      continue
    }
    if (inTimezone || !cur || subDepth > 0) continue
    const bucket = cur.get(cl.name)
    if (bucket) bucket.push(cl)
    else cur.set(cl.name, [cl])
  }
  return events
}

/** Assembles one VEVENT's collected properties into a ParsedEvent, or null when
 *  it lacks a usable DTSTART. */
function buildEvent(props: Map<string, ContentLine[]>): ParsedEvent | null {
  const dtstartLine = props.get('DTSTART')?.[0]
  if (!dtstartLine) return null
  const start = tryParseDate(dtstartLine.value, dtstartLine.params)
  if (!start) return null

  const dtendLine = props.get('DTEND')?.[0]
  const end = dtendLine ? tryParseDate(dtendLine.value, dtendLine.params) : null
  const durationLine = props.get('DURATION')?.[0]
  const duration = durationLine ? parseDuration(durationLine.value) : null
  const rruleLine = props.get('RRULE')?.[0]
  const rrule = rruleLine ? parseRRule(rruleLine.value) : null
  const summary = unescapeText(props.get('SUMMARY')?.[0]?.value ?? '')
  // First instance only, same discipline as SUMMARY above — a well-formed
  // VEVENT carries at most one of each anyway.
  const location = unescapeText(props.get('LOCATION')?.[0]?.value ?? '')
  const description = unescapeText(props.get('DESCRIPTION')?.[0]?.value ?? '')

  const exdates: DateSpec[] = []
  for (const line of props.get('EXDATE') ?? []) {
    for (const v of line.value.split(',')) {
      const spec = tryParseDate(v, line.params)
      if (spec) exdates.push(spec)
    }
  }

  return { summary, start, end, duration, rrule, exdates, location, description }
}

// ===================== EXPANDER (counts toward the STOP budget) ==============
// Everything from here to the "end EXPANDER" marker is the recurrence
// expansion + TZID→epoch conversion the 300-line budget governs.

const DAY_MS = 86_400_000
// Hard bound on generated occurrences per event — the spec's "bounded"
// guarantee. ~27y of DAILY / ~192y of WEEKLY / ~833y of MONTHLY; a real
// window is 60 days, so this only ever trips on pathological input.
const MAX_ITERATIONS = 10_000

/** True if the runtime's Intl zone database knows `tz`. */
function isKnownZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The wall-clock components `t` (epoch ms) displays in `tz`. */
function zonePartsAt(t: number, tz: string): Wall {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date(t))) p[part.type] = part.value
  let h = +p.hour!
  if (h === 24) h = 0 // some engines render midnight as '24' under hour12:false
  return { y: +p.year!, mo: +p.month!, d: +p.day!, h, mi: +p.minute!, s: +p.second! }
}

/** `tz`'s UTC offset (ms east of UTC) at instant `t`. */
function offsetAt(t: number, tz: string): number {
  const p = zonePartsAt(t, tz)
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t
}

/** The two-pass inverse: the epoch at which `wall` is the local time in `tz`.
 *  Guess the instant as if the wall time were UTC, correct by the offset there,
 *  then re-read the offset once at the corrected instant to settle DST
 *  transitions (the offset can differ across the shift). Correct to the minute
 *  for spring-forward/fall-back boundaries. */
function wallToEpochInZone(wall: Wall, tz: string): number {
  const guess = Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s)
  const t1 = guess - offsetAt(guess, tz)
  return guess - offsetAt(t1, tz)
}

/** A wall time + its zone → an absolute epoch instant. A zoned event whose id
 *  the runtime doesn't know falls back to floating local (matched by the
 *  base-occurrence-only rule in expand). */
function toEpoch(wall: Wall, zone: Zone): number {
  switch (zone.kind) {
    case 'utc':
      return Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s)
    case 'floating':
    case 'date':
      return new Date(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s).getTime()
    case 'zoned':
      return isKnownZone(zone.tz)
        ? wallToEpochInZone(wall, zone.tz)
        : new Date(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s).getTime()
  }
}

/** Calendar arithmetic in UTC (no zone/DST interference): `wall` + n days,
 *  time-of-day preserved. UTC math rolls months/years over correctly. */
function addDays(wall: Wall, n: number): Wall {
  const d = new Date(Date.UTC(wall.y, wall.mo - 1, wall.d + n))
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: wall.h, mi: wall.mi, s: wall.s }
}

/** Weekday of a wall date, 0=Sunday..6=Saturday. */
function weekdayOf(wall: Wall): number {
  return new Date(Date.UTC(wall.y, wall.mo - 1, wall.d)).getUTCDay()
}

/** Days in a given (1-based) month. */
function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

/** Compares two wall times as calendar tuples (zone-independent ordering). */
function compareWall(a: Wall, b: Wall): number {
  return Date.UTC(a.y, a.mo - 1, a.d, a.h, a.mi, a.s) - Date.UTC(b.y, b.mo - 1, b.d, b.h, b.mi, b.s)
}

/** Expands one parsed event into its in-window occurrences. */
function expand(pe: ParsedEvent, windowStart: number, windowDays: number): Omit<IcsEvent, 'cal'>[] {
  const winEnd = windowStart + windowDays * DAY_MS
  const zone = pe.start.zone
  const startEpoch = toEpoch(pe.start.wall, zone)
  const endEpoch = pe.end ? toEpoch(pe.end.wall, pe.end.zone) : null
  const durationMs =
    endEpoch !== null ? Math.max(0, endEpoch - startEpoch) : pe.duration ?? (pe.start.allDay ? DAY_MS : 0)
  const exSet = new Set(pe.exdates.map((x) => toEpoch(x.wall, x.zone)))
  // Computed ONCE per event (not per occurrence) — LOCATION/DESCRIPTION don't
  // vary across an RRULE's expanded instances, so every occurrence below
  // shares this same value via the conditional spread.
  const meetUrl = extractMeetUrl(pe.location, pe.description)

  const out: Omit<IcsEvent, 'cal'>[] = []
  const push = (start: number): void => {
    if (exSet.has(start)) return
    const end = start + durationMs
    // Include when [start,end) intersects the window — an event that began
    // before windowStart but ends inside it still counts (controller ruling).
    // meetUrl is spread in conditionally so a no-match event gets NO key at
    // all (never a `meetUrl: undefined` property) — keeps the JSON shape of
    // an unlinked event identical to before Task 88.
    if (start < winEnd && end > windowStart)
      out.push({ summary: pe.summary, start, end, ...(meetUrl ? { meetUrl } : {}) })
  }

  const rr = pe.rrule
  const zonedUnknown = zone.kind === 'zoned' && !isKnownZone(zone.tz)
  if (!rr || !rr.supported || zonedUnknown) {
    push(startEpoch) // base occurrence only
    return out
  }

  const until = rr.until ? toEpoch(rr.until.wall, rr.until.zone) : null
  let counted = 0
  // Feeds one candidate wall time through the shared stop logic; returns false
  // to halt the driving loop. COUNT is measured on the FULL recurrence set
  // (before EXDATE/window filtering), and UNTIL is inclusive.
  const consume = (wall: Wall): boolean => {
    const start = toEpoch(wall, zone)
    if (until !== null && start > until) return false
    if (rr.count !== null && counted >= rr.count) return false
    counted++
    push(start)
    if (rr.count === null && start >= winEnd) return false // infinite rule: stop past the window
    return true
  }

  if (rr.freq === 'DAILY') {
    for (let k = 0; k < MAX_ITERATIONS; k++) if (!consume(addDays(pe.start.wall, k * rr.interval))) break
  } else if (rr.freq === 'WEEKLY' && rr.byday && rr.byday.length > 0) {
    const startOffset = (weekdayOf(pe.start.wall) + 6) % 7 // Mon=0..Sun=6
    const monday = addDays(pe.start.wall, -startOffset) // WKST defaults to MO
    const offsets = rr.byday.map((d) => (d + 6) % 7).sort((a, b) => a - b)
    for (let wk = 0; wk < MAX_ITERATIONS; wk++) {
      const weekMonday = addDays(monday, wk * rr.interval * 7)
      let stop = false
      for (const off of offsets) {
        const wall = addDays(weekMonday, off)
        if (compareWall(wall, pe.start.wall) < 0) continue // earlier in the first week than DTSTART
        if (!consume(wall)) {
          stop = true
          break
        }
      }
      if (stop) break
    }
  } else if (rr.freq === 'WEEKLY') {
    for (let k = 0; k < MAX_ITERATIONS; k++) if (!consume(addDays(pe.start.wall, k * rr.interval * 7))) break
  } else if (rr.freq === 'MONTHLY') {
    const day = rr.bymonthday ?? pe.start.wall.d
    for (let k = 0; k < MAX_ITERATIONS; k++) {
      const monthIndex = pe.start.wall.mo - 1 + k * rr.interval
      const y = pe.start.wall.y + Math.floor(monthIndex / 12)
      const mo = (monthIndex % 12) + 1
      if (day > daysInMonth(y, mo)) continue // e.g. no 31st in Feb — skip, consumes no COUNT slot
      const wall: Wall = { y, mo, d: day, h: pe.start.wall.h, mi: pe.start.wall.mi, s: pe.start.wall.s }
      if (compareWall(wall, pe.start.wall) < 0) continue
      if (!consume(wall)) break
    }
  }

  return out
}

// ===================== end EXPANDER ==========================================

/** Parses a VCALENDAR and expands recurrences across [windowStart,
 *  windowStart + windowDays). PURE — no Date.now(). Malformed input → []. A
 *  single un-expandable event is dropped rather than poisoning the rest. */
export function parseIcs(text: string, windowStart: number, windowDays: number): Omit<IcsEvent, 'cal'>[] {
  try {
    const out: Omit<IcsEvent, 'cal'>[] = []
    for (const pe of parseCalendar(text)) {
      try {
        out.push(...expand(pe, windowStart, windowDays))
      } catch {
        // One event's expansion failing must not blank the others.
      }
    }
    out.sort((a, b) => a.start - b.start)
    return out
  } catch {
    return []
  }
}

const FETCH_TIMEOUT_MS = 8_000
const WINDOW_DAYS = 60 // production window

/** Fetches every calendar in PARALLEL (each with its own 8s abort), parses
 *  with the unchanged pure parseIcs, tags each event with its calendar
 *  index, merges and sorts. Failure is PER-FEED: a feed that errors
 *  contributes prev's events for that index instead of blanking, while the
 *  others refresh. Accepted edge (spec): the fallback keys by index, so a
 *  snapshot taken under a differently-ordered list can transiently mis-tag
 *  a failed feed's carried-over events until the next successful refresh. */
export async function fetchIcs(
  calendars: IcsCalendar[],
  windowStart: number,
  prev: IcsData | null,
  fetchFn: typeof fetch = fetch,
): Promise<IcsData> {
  if (calendars.length === 0) return prev ?? { events: [] }
  const perFeed = await Promise.all(
    calendars.map(async (c, i): Promise<IcsEvent[] | null> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const res = await fetchFn(c.url, { signal: controller.signal })
        if (!res.ok) return null
        const text = await res.text()
        return parseIcs(text, windowStart, WINDOW_DAYS).map((ev) => ({ ...ev, cal: i }))
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }),
  )
  const events = perFeed.flatMap((feed, i) => feed ?? prev?.events.filter((e) => e.cal === i) ?? [])
  events.sort((a, b) => a.start - b.start)
  return { events }
}

// Cap on calendars — the cap BELONGS to the connector (not the settings
// card that happens to be the only writer today): icsCalendarsOf is the
// read-time boundary every caller (widget gate, IcsBody, origins()) goes
// through, so it's the one place that can guarantee hand-edited or
// backup-restored storage holding more than the swept display max never
// renders past it. Connectors.tsx imports this same constant (rather than
// keeping its own literal) so the write-time guard there and this read-time
// clamp can never drift apart — ics.ts itself must not import FROM settings,
// so the constant lives here and flows outward, never the other way.
export const MAX_CALENDARS = 5

/** Read-time migration — the ONLY place both at-rest shapes are understood.
 *  A valid `calendars` array wins (malformed entries filtered, not fatal,
 *  then capped at MAX_CALENDARS — see the constant's own doc comment above);
 *  else a non-empty legacy `url` becomes one calendar named 'Calendar'; else
 *  []. No storage migration exists: the first save from the new settings
 *  card writes the new shape. */
export function icsCalendarsOf(config: IcsConfig | undefined): IcsCalendar[] {
  if (!config) return []
  if (Array.isArray(config.calendars)) {
    return config.calendars
      .filter(
        (c): c is IcsCalendar =>
          !!c && typeof c === 'object' && typeof c.name === 'string' && typeof c.url === 'string' && c.url.length > 0,
      )
      .slice(0, MAX_CALENDARS)
  }
  if (typeof config.url === 'string' && config.url.length > 0) return [{ name: 'Calendar', url: config.url }]
  return []
}

/** View defaults, same read-time-tolerance discipline as icsCalendarsOf. */
export function icsViewOf(config: IcsConfig | undefined): {
  view: 'today' | 'upcoming' | 'per-calendar'
  upcomingCount: number
} {
  const view = config?.view === 'upcoming' || config?.view === 'per-calendar' ? config.view : 'today'
  const n = config?.upcomingCount
  const upcomingCount = typeof n === 'number' && Number.isInteger(n) && n >= 2 && n <= 4 ? n : 3
  return { view, upcomingCount }
}

/** Dot color per calendar, keyed by LIST POSITION (index % length). Position
 *  1 is the theme accent; 2–5 are stock Tailwind hues checked against both
 *  themes at the visual gate. Lives here (not in a component) because both
 *  the widget rows and the settings legend render the same dot. */
export const CALENDAR_DOT_CLASSES: readonly string[] = [
  'bg-accent',
  'bg-sky-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-fuchsia-400',
]

export const icsDescriptor: ConnectorDescriptor<IcsConfig> = {
  id: 'ics',
  label: 'Calendar',
  blurb: 'Your next events, from any calendar app',
  category: 'calendar-tasks', // the drawer groups by purpose — see types.ts's CATEGORY_LABELS
  // auth 'none', NOT 'token': there's no identity to render — the URL itself is
  // the secret (it grants read access to the whole calendar). Hence
  // secretFields:['url', 'calendars'] and no identityField (authState reads
  // 'none'). Both at-rest shapes strip: a config mid-migration (icsCalendarsOf
  // prefers `calendars` but a lingering legacy `url` can still be present) must
  // never leak either one on export.
  auth: 'none',
  ttlMs: 15 * 60_000,
  secretFields: ['url', 'calendars'],
  // One origin per calendar, filtered not thrown — same contract rss/crypto
  // document: a restored config can hold a non-https or unparseable url per
  // entry (import validates only `enabled` structurally), and origins() must
  // degrade to fewer origins rather than throwing out of a registry-wide
  // sweep. originPattern throws on non-https or an unparseable url; each
  // calendar's throw is swallowed independently so one bad entry never blanks
  // the rest. icsCalendarsOf folds in the legacy single-url shape too, so a
  // config that hasn't been re-saved through the new card still grants its
  // one origin. De-duped via Set (two calendars sharing a host — e.g. two
  // paths under the same iCloud account — collapse to one origin pattern).
  origins: (config) =>
    [
      ...new Set(
        icsCalendarsOf(config).flatMap((c) => {
          try {
            return [originPattern(c.url)]
          } catch {
            return []
          }
        }),
      ),
    ],
}
