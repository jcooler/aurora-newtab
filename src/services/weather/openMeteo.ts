import type { WeatherSnapshot } from '../../lib/storage/schema'
import type { WeatherProvider } from './types'
import {
  environmentRequestIdentity,
  environmentRequestUrl,
  mapEnvironmentPayload,
  unavailableEnvironmentSnapshot,
} from './environmentIdentity'
import { weatherRequestIdentity, weatherRequestUrl } from './identity'

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

export function openMeteoProvider(fetchFn: typeof fetch = fetch): WeatherProvider {
  return {
    async fetchSnapshot(lat, lon, label, options): Promise<WeatherSnapshot> {
      const url = weatherRequestUrl(lat, lon)
      const environmentUrl = environmentRequestUrl(lat, lon)
      const environmentIdentity = environmentRequestIdentity(lat, lon)
      const init = options?.signal ? { signal: options.signal } : undefined

      // Start both same-location legs together. The environmental promise owns
      // its rejection immediately, so a forecast-first failure cannot leave a
      // later environmental rejection unhandled.
      const environmentResult = (async () => {
        const response = await fetchFn(environmentUrl, init)
        if (!response.ok) {
          throw new Error(`Open-Meteo environmental request failed: HTTP ${response.status}`)
        }
        return response.json()
      })().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      )

      const forecastResult = (async () => {
        const response = await fetchFn(url, init)
        if (!response.ok) throw new Error(`Open-Meteo request failed: HTTP ${response.status}`)
        return response.json()
      })()

      const [data, settledEnvironment] = await Promise.all([forecastResult, environmentResult])
      const fetchedAt = Date.now()
      const environment = (() => {
        try {
          if (!settledEnvironment.ok) throw settledEnvironment.error
          return mapEnvironmentPayload(settledEnvironment.value, environmentIdentity, fetchedAt)
        } catch (caught) {
          if (isAbortError(caught)) throw caught
          return unavailableEnvironmentSnapshot(environmentIdentity, fetchedAt)
        }
      })()
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
        fetchedAt,
        locationLabel: label,
        requestIdentity: weatherRequestIdentity(lat, lon),
        sunriseISO: data.daily?.sunrise?.[0],
        sunsetISO: data.daily?.sunset?.[0],
        environment,
      }
    },
  }
}
