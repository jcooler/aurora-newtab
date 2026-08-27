import { describe, expect, it, vi } from 'vitest'

import {
  AURORA_KP_URL,
  auroraActivity,
  fetchAuroraKp,
  isAuroraKpData,
} from './auroraKp'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

describe('NOAA planetary K-index provider boundary', () => {
  it('normalizes current and bounded future forecast with deterministic peak selection', async () => {
    const now = new Date('2026-08-22T12:00:00Z')
    const body = [
      ['time_tag', 'Kp', 'observed', 'noaa_scale'],
      ['2026-08-22 06:00:00', '2.00', 'observed', null],
      ['2026-08-22 09:00:00', '3.67', 'estimated', null],
      ['2026-08-22 15:00:00', '4.00', 'predicted', null],
      ['2026-08-22 18:00:00', '6.00', 'predicted', 'G2'],
      ['2026-08-22 21:00:00', '6.00', 'predicted', 'G2'],
      ['2026-08-26 18:00:00', '9.00', 'predicted', 'G5'],
      ['bad', '5.00', 'predicted', 'G1'],
      ['2026-08-23 00:00:00', '10.00', 'predicted', 'G5'],
    ]
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response(body))

    const data = await fetchAuroraKp(now, fetchFn)

    expect(fetchFn).toHaveBeenCalledWith(AURORA_KP_URL, expect.objectContaining({
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    }))
    expect(data.current).toEqual({
      time: '2026-08-22T09:00:00.000Z',
      kp: 3.67,
      source: 'estimated',
      scale: null,
    })
    expect(data.forecast).toHaveLength(3)
    expect(data.peak).toEqual({
      time: '2026-08-22T18:00:00.000Z',
      kp: 6,
      source: 'predicted',
      scale: 'G2',
    })
    expect(isAuroraKpData(data)).toBe(true)
  })

  it('uses conservative activity labels without claiming local visibility', () => {
    expect(auroraActivity(2.99)).toBe('Quiet')
    expect(auroraActivity(3)).toBe('Unsettled')
    expect(auroraActivity(4.99)).toBe('Unsettled')
    expect(auroraActivity(5)).toBe('Storm')
  })

  it('fails invalid data without exposing the provider body', async () => {
    const secret = 'kp-provider-body-must-not-leak'
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response({ secret }, 503))
    let message = ''
    try {
      await fetchAuroraKp(new Date('2026-08-22T12:00:00Z'), fetchFn)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toBe('Aurora & Kp is unavailable.')
    expect(message).not.toContain(secret)
  })
})
