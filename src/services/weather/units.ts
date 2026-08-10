export function displayTemp(tempC: number, units: 'metric' | 'imperial'): string {
  const value = units === 'imperial' ? tempC * 1.8 + 32 : tempC
  return `${Math.round(value)}°`
}

/** The scale letter for a unit system: F for imperial, C for metric. */
export function unitLetter(units: 'metric' | 'imperial'): string {
  return units === 'imperial' ? 'F' : 'C'
}

/** `displayTemp` with the scale letter appended — "72°F" / "21°C". The base
 *  helper emits only "°", which left Jon's complaint standing ("It doesn't even
 *  specify celsius or fahrenheit on the widget"): this is the variant used
 *  exactly where the expanded forecast grid labels the scale — the first and
 *  last temperatures the eye enters and leaves, and the header's Low — so the
 *  row says which scale it is in without repeating the letter on every number. */
export function displayTempWithUnit(tempC: number, units: 'metric' | 'imperial'): string {
  return `${displayTemp(tempC, units)}${unitLetter(units)}`
}

/** Narrow hour label for the 12-column hourly strip: "3p" / "12a" or "15". */
export function compactHour(iso: string, use24Hour: boolean): string {
  const hour = Number(iso.slice(11, 13))
  if (use24Hour) return String(hour).padStart(2, '0')
  const h12 = hour % 12 || 12
  return `${h12}${hour < 12 ? 'a' : 'p'}`
}

export function displayWind(kmh: number, units: 'metric' | 'imperial'): string {
  const value = units === 'imperial' ? kmh * 0.621371 : kmh
  return `${Math.round(value)} ${units === 'imperial' ? 'mph' : 'km/h'}`
}

/** Full clock time from an ISO local timestamp: "5:42 AM" / "05:42". */
export function clockTime(iso: string, use24Hour: boolean): string {
  const hour = Number(iso.slice(11, 13))
  const minutes = iso.slice(14, 16)
  if (use24Hour) return `${String(hour).padStart(2, '0')}:${minutes}`
  const h12 = hour % 12 || 12
  return `${h12}:${minutes} ${hour < 12 ? 'AM' : 'PM'}`
}
