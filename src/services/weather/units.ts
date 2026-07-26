export function displayTemp(tempC: number, units: 'metric' | 'imperial'): string {
  const value = units === 'imperial' ? tempC * 1.8 + 32 : tempC
  return `${Math.round(value)}°`
}

/** Narrow hour label for the 12-column hourly strip: "3p" / "12a" or "15". */
export function compactHour(iso: string, use24Hour: boolean): string {
  const hour = Number(iso.slice(11, 13))
  if (use24Hour) return String(hour).padStart(2, '0')
  const h12 = hour % 12 || 12
  return `${h12}${hour < 12 ? 'a' : 'p'}`
}
