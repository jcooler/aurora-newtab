import type { WeatherSnapshot } from '../../lib/storage/schema'
import type { WeatherProvider } from './types'

const BASE = 'https://api.open-meteo.com/v1/forecast'
const PARAMS =
  'current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m' +
  '&hourly=temperature_2m,precipitation_probability,weather_code' +
  '&forecast_hours=12&timezone=auto'

export function openMeteoProvider(fetchFn: typeof fetch = fetch): WeatherProvider {
  return {
    async fetchSnapshot(lat, lon, label): Promise<WeatherSnapshot> {
      const url = `${BASE}?latitude=${lat}&longitude=${lon}&${PARAMS}`
      const res = await fetchFn(url)
      if (!res.ok) throw new Error(`Open-Meteo request failed: HTTP ${res.status}`)
      const data = await res.json()
      return {
        current: {
          tempC: data.current.temperature_2m,
          feelsLikeC: data.current.apparent_temperature,
          code: data.current.weather_code,
          windKmh: data.current.wind_speed_10m,
          humidity: data.current.relative_humidity_2m,
        },
        hourly: data.hourly.time.map((time: string, i: number) => ({
          time,
          tempC: data.hourly.temperature_2m[i],
          precipProb: data.hourly.precipitation_probability[i] ?? 0,
          code: data.hourly.weather_code[i],
        })),
        fetchedAt: Date.now(),
        locationLabel: label,
      }
    },
  }
}
