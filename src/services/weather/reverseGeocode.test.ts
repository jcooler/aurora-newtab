import { describe, expect, it, vi } from 'vitest'
import { reverseGeocode } from './reverseGeocode'

const ok = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch

describe('reverseGeocode', () => {
  it('prefers city, then locality, then region', async () => {
    expect(await reverseGeocode(34, -84, ok({ city: 'Dallas', locality: 'x' }))).toBe('Dallas')
    expect(await reverseGeocode(34, -84, ok({ city: '', locality: 'Braswell' }))).toBe('Braswell')
    expect(
      await reverseGeocode(34, -84, ok({ city: '', locality: '', principalSubdivision: 'Georgia' })),
    ).toBe('Georgia')
  })

  it('returns null on HTTP failure, empty payload, or network error', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    expect(await reverseGeocode(0, 0, bad)).toBeNull()
    expect(await reverseGeocode(0, 0, ok({}))).toBeNull()
    const boom = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    expect(await reverseGeocode(0, 0, boom)).toBeNull()
  })

  it('forwards the caller AbortSignal and preserves abort rejection', async () => {
    const controller = new AbortController()
    const fetchFn = ok({ city: 'Dallas' })
    await expect(reverseGeocode(34, -84, fetchFn, controller.signal)).resolves.toBe('Dallas')
    expect(fetchFn).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal })

    const aborted = new DOMException('aborted', 'AbortError')
    const rejecting = vi.fn().mockRejectedValue(aborted) as unknown as typeof fetch
    await expect(reverseGeocode(34, -84, rejecting, controller.signal)).rejects.toBe(aborted)
  })
})
