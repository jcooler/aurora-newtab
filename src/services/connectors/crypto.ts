// src/services/connectors/crypto.ts — the Crypto ticker's service layer:
// the one-endpoint markets fetch the widget renders, and the registry
// descriptor. Task 52 is the first NO-AUTH connector since rss.ts itself —
// no token, no identity, no reconnect state (authState's own rule: `auth ===
// 'none'` always reads 'none') — so this file has no whoami probe at all,
// and (like rss.ts) `secretFields: []` means backup export never strips
// anything from a persisted crypto config (see backup.test.ts's negative
// case asserting exactly that).
//
// Every request goes through http.ts's getJson (Task 47) — never a
// hand-rolled fetch — so the 8s abort, the network-vs-HTTP status split, and
// the typed-error discipline are shared with every token connector, even
// though this one sends no Authorization header at all (CoinGecko's markets
// endpoint is public). `fetchFn` stays injectable so tests never touch a
// real network.
import type { ConnectorDescriptor, CryptoConfig } from './types'
import { getJson } from './http'

const BASE = 'https://api.coingecko.com/api/v3'
const MARKETS_PATH = '/coins/markets'
// CryptoConfig caps at 5 configured coins (types.ts's own comment); per_page
// mirrors that cap so the API request never asks for more rows than the
// widget could ever show, not because the API would return more anyway (it
// only ever returns rows for the `ids` actually passed).
const PER_PAGE = 5

export interface CoinRow {
  id: string
  symbol: string
  name: string
  price: number
  change24h: number
}

export interface CryptoData {
  coins: CoinRow[]
}

interface MarketRow {
  id?: unknown
  symbol?: unknown
  name?: unknown
  current_price?: unknown
  price_change_percentage_24h?: unknown
}

/** markets body -> a Map keyed by coin id, defensive at every field, same
 *  skip-don't-crash discipline as vercel.ts's parseDeployments: a row
 *  missing an id, a symbol, or a numeric price is skipped entirely (it can
 *  never be shown or reordered against the configured list below). A
 *  missing/null `price_change_percentage_24h` (CoinGecko hasn't priced a
 *  24h delta for every coin at every moment) falls back to 0 rather than
 *  skipping the row — a coin with a real price but no 24h figure yet is
 *  still worth showing, just flat. Returning a Map (not an array) is what
 *  makes the REORDER step in fetchCrypto below an O(1)-per-id lookup rather
 *  than a re-scan per configured id. */
function parseRows(body: unknown): Map<string, CoinRow> {
  const items = Array.isArray(body) ? (body as MarketRow[]) : []
  const byId = new Map<string, CoinRow>()
  for (const item of items) {
    const id = typeof item.id === 'string' ? item.id : ''
    const symbol = typeof item.symbol === 'string' ? item.symbol : ''
    const price = typeof item.current_price === 'number' ? item.current_price : NaN
    if (!id || !symbol || !Number.isFinite(price)) continue
    const name = typeof item.name === 'string' && item.name.length > 0 ? item.name : symbol
    const change24h =
      typeof item.price_change_percentage_24h === 'number' ? item.price_change_percentage_24h : 0
    byId.set(id, { id, symbol, name, price, change24h })
  }
  return byId
}

/** Fetches the one section (prices for the coins the user configured) for
 *  one request, carrying `prev` forward so a failure (network error or
 *  non-OK status) keeps the last-known slice — `prev ?? { coins: [] }`, same
 *  quiet-degradation idiom as vercel.ts's own fetchVercel (no ETag
 *  round-trip here either — CoinGecko's markets endpoint is a plain GET).
 *
 *  ORDER: the markets endpoint returns rows in market-cap order, not the
 *  order the user configured their watchlist in — this reorders the parsed
 *  rows back to `ids`' own order (the config's own order is what the widget
 *  renders as-is, same division of labor as vercel.ts's sortDeployments:
 *  the service owns ordering, the widget just displays it). An id CoinGecko
 *  doesn't recognize (or hasn't returned a row for) is simply ABSENT from
 *  the result — no placeholder, no error — same "quiet" contract as the
 *  brief: "unknown ids simply return no row from the API". */
export async function fetchCrypto(
  ids: string[],
  prev: CryptoData | null,
  fetchFn: typeof fetch = fetch,
): Promise<CryptoData> {
  const fallback = prev ?? { coins: [] }
  if (ids.length === 0) return fallback
  const url = `${BASE}${MARKETS_PATH}?vs_currency=usd&ids=${ids.join(',')}&per_page=${PER_PAGE}`
  try {
    const result = await getJson<unknown>(url, {}, fetchFn)
    if (!result.ok) return fallback
    const byId = parseRows(result.body)
    const coins = ids.flatMap((id) => {
      const row = byId.get(id)
      return row ? [row] : []
    })
    return { coins }
  } catch {
    return fallback
  }
}

export const cryptoDescriptor: ConnectorDescriptor<CryptoConfig> = {
  id: 'crypto',
  label: 'Crypto',
  blurb: 'Prices for the coins you watch',
  auth: 'none',
  ttlMs: 5 * 60_000,
  secretFields: [],
  // The single origin every request above targets. Constant (no per-config
  // derivation, unlike gitlab's instanceUrl or jira's site), same shape as
  // githubDescriptor's/vercelDescriptor's — never throws, needs no
  // defensive wrapper. No `identityField`: auth 'none' connectors have no
  // identity to show a "Connected as X" chip for (authState's own rule).
  origins: () => ['https://api.coingecko.com/*'],
}
