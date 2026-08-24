import type { ConnectorDescriptor, PublicHolidaysConfig } from './types'
import { getJson } from './http'

const NAGER_BASE = 'https://date.nager.at/api/v3'
const MAX_HOLIDAYS = 40
const MAX_LABEL_LENGTH = 160

export interface HolidayCountry {
  countryCode: string
  name: string
}

export interface PublicHoliday {
  date: string
  name: string
  localName?: string
}

export interface PublicHolidaysData {
  countryCode: string
  year: number
  holidays: PublicHoliday[]
}

export function normalizeHolidayCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

function validLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function localDateOrdinal(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!) / 86_400_000
}

export function daysUntilHoliday(date: string, now: Date): number {
  if (!validLocalDateKey(date)) return 0
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
  return Math.max(0, Math.round(localDateOrdinal(date) - today))
}

export function publicHolidayRequest(year: number, countryCode: string): string {
  const country = normalizeHolidayCountryCode(countryCode)
  if (!Number.isInteger(year) || !country) throw new Error('Invalid Public Holidays request.')
  return `${NAGER_BASE}/PublicHolidays/${year}/${country}`
}

export function publicHolidaysScope(countryCode: string, date: Date): string {
  const country = normalizeHolidayCountryCode(countryCode)
  if (!country) throw new Error('Invalid Public Holidays country.')
  return `public-holidays:v1:${country}:${date.getFullYear()}`
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().slice(0, MAX_LABEL_LENGTH)
  return normalized || null
}

/** Nager's `name` is its generic English label, while `localName` is the
 * label for the selected country (for example US "Labor Day" versus the
 * generic "Labour Day"). Prefer the country-local label everywhere Aurora
 * presents a holiday and tolerate older snapshots without one. */
export function publicHolidayDisplayName(holiday: PublicHoliday): string {
  return text(holiday.localName) ?? text(holiday.name) ?? ''
}

export async function fetchHolidayCountries(fetchFn: typeof fetch = fetch): Promise<HolidayCountry[]> {
  try {
    const result = await getJson<unknown>(`${NAGER_BASE}/AvailableCountries`, {}, fetchFn)
    if (!result.ok || !Array.isArray(result.body)) throw new Error('invalid response')
    const countries = result.body.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return []
      const row = candidate as { countryCode?: unknown; name?: unknown }
      const countryCode = normalizeHolidayCountryCode(row.countryCode)
      const name = text(row.name)
      return countryCode && name ? [{ countryCode, name }] : []
    })
    return [...new Map(countries.map((country) => [country.countryCode, country])).values()]
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    throw new Error('Country list is unavailable.')
  }
}

function normalizeHolidayRows(body: unknown, countryCode: string): PublicHoliday[] | null {
  if (!Array.isArray(body)) return null
  return body.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const row = candidate as {
      date?: unknown
      name?: unknown
      localName?: unknown
      countryCode?: unknown
      global?: unknown
      types?: unknown
    }
    if (!validLocalDateKey(row.date)) return []
    if (normalizeHolidayCountryCode(row.countryCode) !== countryCode) return []
    if (row.global !== true || !Array.isArray(row.types) || !row.types.includes('Public')) return []
    const name = text(row.name)
    if (!name) return []
    const localName = text(row.localName)
    return [{ date: row.date, name, ...(localName ? { localName } : {}) }]
  })
}

export function isPublicHolidaysData(value: unknown): value is PublicHolidaysData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<PublicHolidaysData>
  return normalizeHolidayCountryCode(data.countryCode) === data.countryCode
    && Number.isInteger(data.year)
    && Array.isArray(data.holidays)
    && data.holidays.length <= MAX_HOLIDAYS
    && data.holidays.every((holiday) => holiday && typeof holiday === 'object'
      && validLocalDateKey((holiday as PublicHoliday).date)
      && typeof (holiday as PublicHoliday).name === 'string')
}

export async function fetchPublicHolidays(
  countryCode: string,
  date: Date,
  fetchFn: typeof fetch = fetch,
): Promise<PublicHolidaysData> {
  try {
    const country = normalizeHolidayCountryCode(countryCode)
    if (!country) throw new Error('invalid country')
    const year = date.getFullYear()
    const [current, next] = await Promise.all([
      getJson<unknown>(publicHolidayRequest(year, country), {}, fetchFn),
      getJson<unknown>(publicHolidayRequest(year + 1, country), {}, fetchFn),
    ])
    if (!current.ok || !next.ok) throw new Error('request failed')
    const currentRows = normalizeHolidayRows(current.body, country)
    const nextRows = normalizeHolidayRows(next.body, country)
    if (!currentRows || !nextRows) throw new Error('invalid response')
    const unique = new Map<string, PublicHoliday>()
    for (const holiday of [...currentRows, ...nextRows]) {
      unique.set(`${holiday.date}\n${holiday.name}`, holiday)
    }
    return {
      countryCode: country,
      year,
      holidays: [...unique.values()]
        .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
        .slice(0, MAX_HOLIDAYS),
    }
  } catch {
    throw new Error('Public Holidays is unavailable.')
  }
}

export function isPublicHolidaysConfig(config: unknown): config is PublicHolidaysConfig {
  if (!config || typeof config !== 'object') return false
  const candidate = config as Partial<PublicHolidaysConfig>
  return typeof candidate.enabled === 'boolean'
    && normalizeHolidayCountryCode(candidate.countryCode) === candidate.countryCode
}

export const publicHolidaysDescriptor: ConnectorDescriptor<PublicHolidaysConfig> = {
  id: 'publicHolidays',
  label: 'Public Holidays',
  blurb: 'Upcoming national holidays for your chosen country',
  category: 'at-a-glance',
  auth: 'none',
  ttlMs: 24 * 60 * 60_000,
  secretFields: [],
  origins: () => [],
  ownsOrigins: isPublicHolidaysConfig,
}
