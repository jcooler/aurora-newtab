import type { WeatherSnapshot } from '../../lib/storage/schema'
import type { WeatherProvider } from './types'
import { weatherRequestIdentity, weatherRequestUrl } from './identity'

export function openMeteoProvider(fetchFn: typeof fetch = fetch): WeatherProvider {
  return {
    async fetchSnapshot(lat, lon, label, options): Promise<WeatherSnapshot> {
      const url = weatherRequestUrl(lat, lon)
      const res = await fetchFn(url, options?.signal ? { signal: options.signal } : undefined)
      if (!res.ok) throw new Error(`Open-Meteo request failed: HTTP ${res.status}`)
      const data = await res.json()
      return {
        current: {
          tempC: data.current.temperature_2m,
          feelsLikeC: data.current.apparent_temperature,
          code: data.current.weather_code,
          windKmh: data.current.wind_speed_10m,
          // Optional so a cache captured before the bearing was requested
          // stays parseable; the versioned requestIdentity means such a
          // cache is refreshed rather than reused anyway.
          ...(typeof data.current.wind_direction_10m === 'number'
            ? { windDirection: data.current.wind_direction_10m }
            : {}),
          humidity: data.current.relative_humidity_2m,
          isDay: data.current.is_day !== 0,
        },
        hourly: data.hourly.time.map((time: string, i: number) => ({
          time,
          tempC: data.hourly.temperature_2m[i],
          precipProb: data.hourly.precipitation_probability[i] ?? 0,
          code: data.hourly.weather_code[i],
          isDay: (data.hourly.is_day?.[i] ?? 1) !== 0,
        })),
        fetchedAt: Date.now(),
        locationLabel: label,
        requestIdentity: weatherRequestIdentity(lat, lon),
        sunriseISO: data.daily?.sunrise?.[0],
        sunsetISO: data.daily?.sunset?.[0],
      }
    },
  }
}
