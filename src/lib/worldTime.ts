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
