import { resolvedLocalTimeZone, zoneOffsetAt } from './dates'

/** Framed clock context uses the offsets at this instant, including differing DST dates. */
export function zoneContext(zone: string, now: Date, localZone = resolvedLocalTimeZone(), locale?: string): string {
  try {
    const weekday = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: 'short' }).format(now)
    const hours = (zoneOffsetAt(now.getTime(), zone) - zoneOffsetAt(now.getTime(), localZone)) / 3_600_000
    if (hours === 0) return `${weekday} · Same time`
    const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Math.abs(hours))
    return `${weekday} · ${amount} ${Math.abs(hours) === 1 ? 'hour' : 'hours'} ${hours > 0 ? 'ahead' : 'behind'}`
  } catch {
    return 'Timezone unavailable'
  }
}

/** Formats `now` in `zone` as `H:MM AM/PM` (12-hour) or `HH:MM` (24-hour).
 *  An unrecognized IANA zone throws inside Intl — caught and reported as
 *  '—' rather than crashing the widget that renders it. */
export function zoneTime(zone: string, use24: boolean, now: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: !use24,
    }).format(now)
  } catch {
    return '—'
  }
}

/** Whole days from `todayKey` to `dateISO` (both `YYYY-MM-DD`), negative if
 *  `dateISO` is in the past. Parsed at UTC noon so DST transitions and
 *  leap days in between can never shift the result by rounding error. */
export function daysUntil(dateISO: string, todayKey: string): number {
  const target = new Date(`${dateISO}T12:00:00Z`).getTime()
  const today = new Date(`${todayKey}T12:00:00Z`).getTime()
  return Math.round((target - today) / 86_400_000)
}

/** Human phrase for a countdown, or null once it's in the past (days < 0) —
 *  callers use the null to skip rendering it entirely. */
export function countdownPhrase(name: string, days: number): string | null {
  if (days < 0) return null
  if (days === 0) return `${name} is today.`
  if (days === 1) return `1 day to ${name}.`
  return `${days} days to ${name}.`
}
