export type WeatherIconKey =
  | 'sun'
  | 'sun-cloud'
  | 'moon'
  | 'moon-cloud'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm'

const TABLE: [codes: number[], label: string, icon: WeatherIconKey][] = [
  [[0], 'Clear', 'sun'],
  [[1], 'Mostly clear', 'sun-cloud'],
  [[2], 'Partly cloudy', 'sun-cloud'],
  [[3], 'Overcast', 'cloud'],
  [[45, 48], 'Fog', 'fog'],
  [[51, 53, 55, 56, 57], 'Drizzle', 'drizzle'],
  [[61, 63, 65, 66, 67], 'Rain', 'rain'],
  [[71, 73, 75, 77], 'Snow', 'snow'],
  [[80, 81, 82], 'Showers', 'rain'],
  [[85, 86], 'Snow showers', 'snow'],
  [[95, 96, 99], 'Thunderstorm', 'storm'],
]

/** Sun-based icons flip to their moon variants at night (Open-Meteo is_day).
 *  Labels stay the same — "Clear" at 3 AM is still clear. */
export function describeCode(
  code: number,
  isDay = true,
): { label: string; icon: WeatherIconKey } {
  for (const [codes, label, icon] of TABLE) {
    if (codes.includes(code)) {
      if (!isDay && icon === 'sun') return { label, icon: 'moon' }
      if (!isDay && icon === 'sun-cloud') return { label, icon: 'moon-cloud' }
      return { label, icon }
    }
  }
  return { label: 'Cloudy', icon: 'cloud' }
}
