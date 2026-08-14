import { describe, expect, it, vi } from 'vitest'
import { searchCity } from './geocode'

const ok = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch

describe('searchCity', () => {
  it('requests count=6 and maps admin1/country through without fabricating abbreviations', async () => {
    const fetchFn = ok({
      results: [
        { name: 'Dallas', country: 'United States', admin1: 'Texas', latitude: 32.78, longitude: -96.8 },
        { name: 'Dallas', country: 'United States', admin1: 'Georgia', latitude: 34.0, longitude: -84.8 },
      ],
    })
    const results = await searchCity('Dallas', fetchFn)

    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('count=6'))
    expect(results).toEqual([
      { name: 'Dallas', country: 'United States', admin1: 'Texas', lat: 32.78, lon: -96.8 },
      { name: 'Dallas', country: 'United States', admin1: 'Georgia', lat: 34.0, lon: -84.8 },
    ])
  })

  it('forwards the caller AbortSignal to fetch', async () => {
    const fetchFn = ok({ results: [] })
    const controller = new AbortController()
    await searchCity('Dallas', fetchFn, controller.signal)

    expect(fetchFn).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal })
  })

  it('strips a ", GA"-style qualifier before querying, so "Dallas, GA" still finds every Dallas', async () => {
    const fetchFn = ok({ results: [] })
    await searchCity('Dallas, GA', fetchFn)

    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('name=Dallas')
    expect(url).not.toContain('GA')
  })

  it('throws on HTTP failure', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    await expect(searchCity('Dallas', bad)).rejects.toThrow('Geocoding failed: HTTP 500')
  })

  it('defaults missing country/admin1 to empty strings rather than fabricating them', async () => {
    const fetchFn = ok({ results: [{ name: 'Nowhere', latitude: 1, longitude: 2 }] })
    const results = await searchCity('Nowhere', fetchFn)
    expect(results).toEqual([{ name: 'Nowhere', country: '', admin1: '', lat: 1, lon: 2 }])
  })
})
