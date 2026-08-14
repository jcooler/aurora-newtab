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
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ) - wholeSecond
}

function midnightFor(year: number, month: number, day: number, timeZone: string): number {
  const wallAsUtc = Date.UTC(year, month - 1, day)
  let instant = wallAsUtc
  // Offset settling handles the case where the first UTC guess and the local
  // midnight live on opposite sides of a DST transition.
  for (let i = 0; i < 4; i++) {
    const next = wallAsUtc - zoneOffsetAt(instant, timeZone)
    if (next === instant) break
    instant = next
  }
  return instant
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
