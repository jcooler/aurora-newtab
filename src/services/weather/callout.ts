import type { HourlyPoint } from '../../lib/storage/schema'

function formatHour(iso: string, use24Hour: boolean): string {
  const hour = Number(iso.slice(11, 13))
  if (use24Hour) return `${String(hour).padStart(2, '0')}:00`
  const h12 = hour % 12 || 12
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`
}

export function rainCallout(hourly: HourlyPoint[], use24Hour: boolean): string | null {
  const likely = hourly.find((h) => h.precipProb >= 50)
  if (likely) return `Rain likely around ${formatHour(likely.time, use24Hour)}.`
  const possible = hourly.find((h) => h.precipProb >= 30)
  if (possible) return `Possible rain around ${formatHour(possible.time, use24Hour)}.`
  return null
}
