export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export interface ZonedWallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const zonedFormatters = new Map<string, Intl.DateTimeFormat>()

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zonedFormatters.get(timeZone)
  if (cached) return cached
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    // Force eager validation: some engines defer rejecting a bad zone until
    // the formatter is first used.
    formatter.format(0)
    zonedFormatters.set(timeZone, formatter)
    return formatter
  } catch {
    throw new Error(`Invalid time zone: ${timeZone}`)
  }
}

function zonedParts(nowMs: number, timeZone: string): ZonedParts {
  const values: Record<string, string> = {}
  for (const part of zonedFormatter(timeZone).formatToParts(new Date(nowMs))) {
    if (part.type !== 'literal') values[part.type] = part.value
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function zoneOffsetAt(nowMs: number, timeZone: string): number {
  const wholeSecond = Math.trunc(nowMs / 1000) * 1000
  const parts = zonedParts(wholeSecond, timeZone)
  return wallAsUtc(parts) - wholeSecond
}

function wallAsUtc(wall: ZonedWallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
}

function sameWall(left: ZonedParts, right: ZonedWallTime): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  )
}

/** Inverts an IANA-zone wall time with Temporal-compatible disambiguation:
 *  the earlier instant for an overlap, and the first same-offset candidate
 *  after a gap. Sampling two civil days around the target captures both sides
 *  of modern DST changes and even whole-day date-line jumps; every candidate
 *  is then validated by formatting it back through Intl. */
export function zonedWallTimeToEpoch(wall: ZonedWallTime, timeZone: string): number {
  zonedFormatter(timeZone)
  const target = wallAsUtc(wall)
  const offsets = new Set<number>()
  for (const delta of [-2 * 86_400_000, 0, 2 * 86_400_000]) {
    offsets.add(zoneOffsetAt(target + delta, timeZone))
  }

  const candidates = [...offsets].map((offset) => target - offset)
  const exact = candidates.filter((instant) => sameWall(zonedParts(instant, timeZone), wall))
  if (exact.length > 0) return Math.min(...exact)

  const afterGap = candidates
    .map((instant) => ({ instant, displayedWall: wallAsUtc(zonedParts(instant, timeZone)) }))
    .filter(({ displayedWall }) => displayedWall > target)
    .sort((a, b) => a.displayedWall - b.displayedWall || a.instant - b.instant)[0]
  if (afterGap) return afterGap.instant

  throw new Error(`Unable to resolve local time in ${timeZone}`)
}

function midnightFor(year: number, month: number, day: number, timeZone: string): number {
  return zonedWallTimeToEpoch({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone)
}

function dateOrdinal(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000
}

export function resolvedLocalTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!timeZone) throw new Error('Local timezone is unavailable')
  zonedFormatter(timeZone)
  return timeZone
}

export function zonedDateKey(nowMs: number, timeZone: string): string {
  const parts = zonedParts(nowMs, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function zonedLocalDayRange(
  nowMs: number,
  timeZone: string,
): { key: string; start: number; end: number } {
  const current = zonedParts(nowMs, timeZone)
  const nextDate = new Date(Date.UTC(current.year, current.month - 1, current.day + 1))
  return {
    key: `${current.year}-${String(current.month).padStart(2, '0')}-${String(current.day).padStart(2, '0')}`,
    start: midnightFor(current.year, current.month, current.day, timeZone),
    end: midnightFor(
      nextDate.getUTCFullYear(),
      nextDate.getUTCMonth() + 1,
      nextDate.getUTCDate(),
      timeZone,
    ),
  }
}

export function calendarDayDifference(fromMs: number, toMs: number, timeZone: string): number {
  return dateOrdinal(zonedParts(toMs, timeZone)) - dateOrdinal(zonedParts(fromMs, timeZone))
}

/** Stable per-day hash for deterministic daily rotation (quotes, photos). */
export function dayHash(key: string): number {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}
