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

/** The ROOMY hour label for the details panel (owner-reported 2026-08-19:
 *  a bare "02" is ambiguous the moment it leaves a column header). 24-hour
 *  mode gets a full clock hour, 12-hour mode a spaced meridiem — never the
 *  single-letter "2a" form, which `compactHour` keeps for the collapsed
 *  chip's own tight six-column strip. */
export function hourLabel(iso: string, use24Hour: boolean): string {
  const hour = Number(iso.slice(11, 13))
  if (use24Hour) return `${String(hour).padStart(2, '0')}:00`
  const h12 = hour % 12 || 12
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`
}

const COMPASS = Object.freeze([
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
])

/** The 16-point compass name for a meteorological bearing — the direction
 *  the wind blows FROM, which is what a weather reading means by "NW wind".
 *  Each sector spans 22.5 degrees, so the rounding boundary sits at 11.25. */
export function compassPoint(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360
  return COMPASS[Math.round(normalized / 22.5) % 16]
}
