import type { ConnectorDescriptor, OnThisDayConfig } from './types'
import { getJson } from './http'

const ON_THIS_DAY_BASE = 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/all'
const MAX_TEXT_LENGTH = 500

export interface OnThisDayEvent {
  year: number
  text: string
  url?: string
}

export interface OnThisDayData {
  dateKey: string
  events: OnThisDayEvent[]
  births: OnThisDayEvent[]
  deaths: OnThisDayEvent[]
}

interface ProviderRow {
  year?: unknown
  text?: unknown
  pages?: unknown
}

interface ProviderBody {
  selected?: unknown
  events?: unknown
  births?: unknown
  deaths?: unknown
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function localDateKey(date: Date): string {
  return `${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`
}

export function onThisDayRequest(date: Date): { url: string; headers: Record<string, string> } {
  const dateKey = localDateKey(date)
  return {
    url: `${ON_THIS_DAY_BASE}/${dateKey.replace('-', '/')}`,
    headers: { Accept: 'application/json' },
  }
}

export function onThisDayScope(date: Date): string {
  return `on-this-day:v1:en:${localDateKey(date)}`
}

export function nextLocalMidnightDelay(date: Date): number {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return Math.max(0, next.getTime() - date.getTime())
}

function safeArticleUrl(pages: unknown): string | undefined {
  if (!Array.isArray(pages)) return undefined
  for (const page of pages) {
    if (!page || typeof page !== 'object') continue
    const contentUrls = (page as { content_urls?: unknown }).content_urls
    if (!contentUrls || typeof contentUrls !== 'object') continue
    const desktop = (contentUrls as { desktop?: unknown }).desktop
    if (!desktop || typeof desktop !== 'object') continue
    const value = (desktop as { page?: unknown }).page
    if (typeof value !== 'string') continue
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' && url.hostname === 'en.wikipedia.org') return url.href
    } catch {
      // Malformed provider links are omitted; the historical fact remains useful.
    }
  }
  return undefined
}

function normalizeRows(rows: unknown, cap: number, seen?: Set<string>): OnThisDayEvent[] {
  if (!Array.isArray(rows)) return []
  const output: OnThisDayEvent[] = []
  const keys = seen ?? new Set<string>()
  for (const candidate of rows as ProviderRow[]) {
    if (!candidate || typeof candidate !== 'object') continue
    if (!Number.isFinite(candidate.year) || !Number.isInteger(candidate.year)) continue
    if (typeof candidate.text !== 'string') continue
    const text = candidate.text.trim().slice(0, MAX_TEXT_LENGTH)
    if (!text) continue
    const year = candidate.year as number
    const key = `${year}\n${text}`
    if (keys.has(key)) continue
    keys.add(key)
    const url = safeArticleUrl(candidate.pages)
    output.push({ year, text, ...(url ? { url } : {}) })
    if (output.length === cap) break
  }
  return output
}

function normalizeBody(body: unknown, dateKey: string): OnThisDayData | null {
  if (!body || typeof body !== 'object') return null
  const provider = body as ProviderBody
  if (![provider.selected, provider.events, provider.births, provider.deaths].every(Array.isArray)) return null
  const seenEvents = new Set<string>()
  const events = [
    ...normalizeRows(provider.selected, 12, seenEvents),
    ...normalizeRows(provider.events, 12, seenEvents),
  ].slice(0, 12)
  return {
    dateKey,
    events,
    births: normalizeRows(provider.births, 4),
    deaths: normalizeRows(provider.deaths, 4),
  }
}

export function isOnThisDayData(value: unknown): value is OnThisDayData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<OnThisDayData>
  const validRows = (rows: unknown, cap: number) => Array.isArray(rows)
    && rows.length <= cap
    && rows.every((row) => row && typeof row === 'object'
      && Number.isInteger((row as OnThisDayEvent).year)
      && typeof (row as OnThisDayEvent).text === 'string')
  return typeof data.dateKey === 'string'
    && /^\d{2}-\d{2}$/.test(data.dateKey)
    && validRows(data.events, 12)
    && validRows(data.births, 4)
    && validRows(data.deaths, 4)
}

export async function fetchOnThisDay(
  date: Date,
  fetchFn: typeof fetch = fetch,
): Promise<OnThisDayData> {
  try {
    const request = onThisDayRequest(date)
    const result = await getJson<unknown>(request.url, request.headers, fetchFn)
    if (!result.ok) throw new Error('request failed')
    const normalized = normalizeBody(result.body, localDateKey(date))
    if (!normalized) throw new Error('invalid response')
    return normalized
  } catch {
    throw new Error('On This Day is unavailable.')
  }
}

export function isOnThisDayConfig(config: unknown): config is OnThisDayConfig {
  if (!config || typeof config !== 'object') return false
  return typeof (config as Partial<OnThisDayConfig>).enabled === 'boolean'
}

export const onThisDayDescriptor: ConnectorDescriptor<OnThisDayConfig> = {
  id: 'onThisDay',
  label: 'On This Day',
  blurb: 'A historical event for today',
  category: 'at-a-glance',
  auth: 'none',
  ttlMs: 24 * 60 * 60_000,
  secretFields: [],
  origins: () => [],
  ownsOrigins: isOnThisDayConfig,
}
