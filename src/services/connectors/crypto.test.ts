// src/services/connectors/crypto.test.ts — fetchCrypto (markets parsing,
// the configured-order reorder, unknown-id absence, quiet degradation) and
// the descriptor's shape. Same fake-Response/injectable-fetchFn idiom as
// http.test.ts / vercel.test.ts, so nothing here touches a real network.
import { describe, expect, it, vi } from 'vitest'
import { fetchCrypto, cryptoDescriptor, type CryptoData } from './crypto'

/** Minimal fetch Response stand-in — only the members getJson reads (ok,
 *  status, headers.get('etag'), json()). Cast through `unknown` at each
 *  fetchFn call site, same as http.test.ts. */
function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => opts.body ?? []),
  }
}

describe('fetchCrypto — request shape', () => {
  it('GETs the markets endpoint with vs_currency=usd, the ids joined by comma, and per_page=5', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: [] }))
    await fetchCrypto(['bitcoin', 'ethereum'], null, fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&per_page=5',
      expect.objectContaining({ signal: expect.anything() }),
    )
  })

  it('per-request abort: the request carries an AbortSignal (routed through the shared http.ts getJson, same 8s-abort discipline as every other connector)', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse({ status: 200, body: [] }))
    await fetchCrypto(['bitcoin'], null, fetchFn as unknown as typeof fetch)
    const [, init] = fetchFn.mock.calls[0]!
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('an empty ids array returns the fallback without calling fetchFn at all', async () => {
    const fetchFn = vi.fn()
    const prev: CryptoData = { coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 1, change24h: 0 }] }
    const data = await fetchCrypto([], prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('fetchCrypto — parsing', () => {
  it('parses id/symbol/name/price/change24h from the markets payload', async () => {
    const fetchFn = vi.fn(async () =>
      fakeResponse({
        status: 200,
        body: [
          {
            id: 'bitcoin',
            symbol: 'btc',
            name: 'Bitcoin',
            current_price: 67_412,
            price_change_percentage_24h: 2.4,
          },
        ],
      }),
    )
    const data = await fetchCrypto(['bitcoin'], null, fetchFn as unknown as typeof fetch)
    expect(data.coins).toEqual([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 67_412, change24h: 2.4 }])
  })

  it('falls back to change24h: 0 when price_change_percentage_24h is missing/null', async () => {
    const fetchFn = vi.fn(async () =>
      fakeResponse({
        status: 200,
        body: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 100, price_change_percentage_24h: null }],
      }),
    )
    const data = await fetchCrypto(['bitcoin'], null, fetchFn as unknown as typeof fetch)
    expect(data.coins[0]!.change24h).toBe(0)
  })

  it('skips a row missing an id, a symbol, or a numeric price', async () => {
    const fetchFn = vi.fn(async () =>
      fakeResponse({
        status: 200,
        body: [
          { symbol: 'btc', name: 'Bitcoin', current_price: 1 }, // no id
          { id: 'ethereum', name: 'Ethereum', current_price: 2 }, // no symbol
          { id: 'litecoin', symbol: 'ltc', name: 'Litecoin' }, // no current_price
          { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', current_price: 0.1 },
        ],
      }),
    )
    const data = await fetchCrypto(['bitcoin', 'ethereum', 'litecoin', 'dogecoin'], null, fetchFn as unknown as typeof fetch)
    expect(data.coins.map((c) => c.id)).toEqual(['dogecoin'])
  })
})

describe('fetchCrypto — configured-order reorder', () => {
  it('reorders the API\'s market-cap order back to the CONFIGURED ids order', async () => {
    // API returns bitcoin (largest market cap) before ethereum/dogecoin —
    // the config below asks for them in the OPPOSITE order.
    const fetchFn = vi.fn(async () =>
      fakeResponse({
        status: 200,
        body: [
          { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 67_000, price_change_percentage_24h: 1 },
          { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3_000, price_change_percentage_24h: 2 },
          { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', current_price: 0.1, price_change_percentage_24h: 3 },
        ],
      }),
    )
    const data = await fetchCrypto(['dogecoin', 'bitcoin', 'ethereum'], null, fetchFn as unknown as typeof fetch)
    expect(data.coins.map((c) => c.id)).toEqual(['dogecoin', 'bitcoin', 'ethereum'])
  })

  it('unknown ids are simply absent: 3 configured, the API returns 2 -> 2 rows, in configured order', async () => {
    const fetchFn = vi.fn(async () =>
      fakeResponse({
        status: 200,
        body: [
          { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 67_000, price_change_percentage_24h: 1 },
          { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3_000, price_change_percentage_24h: 2 },
        ],
      }),
    )
    // 'not-a-real-coin' is configured but CoinGecko never returns a row for
    // it — it must be skipped entirely, not rendered as a blank/zero row.
    const data = await fetchCrypto(['ethereum', 'not-a-real-coin', 'bitcoin'], null, fetchFn as unknown as typeof fetch)
    expect(data.coins.map((c) => c.id)).toEqual(['ethereum', 'bitcoin'])
  })
})

describe('fetchCrypto — quiet degradation', () => {
  it('a network failure keeps the prev slice verbatim', async () => {
    const prev: CryptoData = { coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 1, change24h: 0 }] }
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    const data = await fetchCrypto(['bitcoin'], prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
  })

  it('a non-OK status with no prev falls back to an empty coins list', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: false, status: 500 }))
    const data = await fetchCrypto(['bitcoin'], null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ coins: [] })
  })

  it('a non-OK status WITH a prev keeps it', async () => {
    const prev: CryptoData = { coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 1, change24h: 0 }] }
    const fetchFn = vi.fn(async () => fakeResponse({ ok: false, status: 500 }))
    const data = await fetchCrypto(['bitcoin'], prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
  })
})

describe('cryptoDescriptor', () => {
  it('declares the no-auth connector identity: no secrets, no identity field, one constant origin', () => {
    expect(cryptoDescriptor.id).toBe('crypto')
    expect(cryptoDescriptor.label).toBe('Crypto')
    expect(cryptoDescriptor.blurb).toBe('Prices for the coins you watch')
    expect(cryptoDescriptor.auth).toBe('none')
    expect(cryptoDescriptor.ttlMs).toBe(5 * 60_000)
    expect(cryptoDescriptor.secretFields).toEqual([])
    expect(cryptoDescriptor.identityField).toBeUndefined()
    expect(cryptoDescriptor.origins({ enabled: true, coins: ['bitcoin'] })).toEqual([
      'https://api.coingecko.com/*',
    ])
  })
})
