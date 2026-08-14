const COORDINATE_DECIMALS = 4

export interface WeatherRequestContract {
  readonly origin: string
  readonly path: string
  readonly temperatureUnit: 'celsius'
  readonly windSpeedUnit: 'kmh'
  readonly forecastHours: number
  readonly forecastDays: number
  readonly timezone: 'auto'
  readonly timeformat: 'iso8601'
  readonly current: readonly string[]
  readonly hourly: readonly string[]
  readonly daily: readonly string[]
}

export const OPEN_METEO_REQUEST_CONTRACT: WeatherRequestContract = Object.freeze({
  origin: 'https://api.open-meteo.com',
  path: '/v1/forecast',
  temperatureUnit: 'celsius',
  windSpeedUnit: 'kmh',
  forecastHours: 12,
  forecastDays: 1,
  timezone: 'auto',
  timeformat: 'iso8601',
  current: Object.freeze([
    'temperature_2m',
    'apparent_temperature',
    'weather_code',
    'wind_speed_10m',
    'relative_humidity_2m',
    'is_day',
  ]),
  hourly: Object.freeze([
    'temperature_2m',
    'precipitation_probability',
    'weather_code',
    'is_day',
  ]),
  daily: Object.freeze(['sunrise', 'sunset']),
})

function normalizeCoordinate(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error('Invalid weather coordinates')
  }
  const rounded = Number(value.toFixed(COORDINATE_DECIMALS))
  return Object.is(rounded, -0) ? 0 : rounded
}

export function normalizeWeatherCoordinates(lat: number, lon: number): { lat: number; lon: number } {
  return {
    lat: normalizeCoordinate(lat, -90, 90),
    lon: normalizeCoordinate(lon, -180, 180),
  }
}

export function serializeWeatherRequestContract(contract: WeatherRequestContract): string {
  const params = new URLSearchParams()
  params.set('temperature_unit', contract.temperatureUnit)
  params.set('wind_speed_unit', contract.windSpeedUnit)
  params.set('forecast_hours', String(contract.forecastHours))
  params.set('forecast_days', String(contract.forecastDays))
  params.set('timezone', contract.timezone)
  params.set('timeformat', contract.timeformat)
  params.set('current', contract.current.join(','))
  params.set('hourly', contract.hourly.join(','))
  params.set('daily', contract.daily.join(','))
  return `${contract.origin}${contract.path}?${params.toString()}`
}

export function weatherRequestUrl(lat: number, lon: number): string {
  const normalized = normalizeWeatherCoordinates(lat, lon)
  const url = new URL(serializeWeatherRequestContract(OPEN_METEO_REQUEST_CONTRACT))
  url.searchParams.set('latitude', String(normalized.lat))
  url.searchParams.set('longitude', String(normalized.lon))
  return url.toString()
}

export function weatherRequestIdentity(lat: number, lon: number): string {
  return `open-meteo:v1:${weatherRequestUrl(lat, lon)}`
}
