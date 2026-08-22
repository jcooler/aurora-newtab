import { describe, expect, it, vi } from 'vitest'

import {
  fetchOnThisDay,
  isOnThisDayData,
  nextLocalMidnightDelay,
  onThisDayRequest,
  onThisDayScope,
} from './onThisDay'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

describe('On This Day provider boundary', () => {
  it('uses the exact zero-padded per-wiki route and local-day scope', () => {
    const local = new Date(2026, 7, 2, 15, 30)
    expect(onThisDayRequest(local)).toEqual({
      url: 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/08/02',
      headers: { Accept: 'application/json' },
    })
    expect(onThisDayScope(local)).toBe('on-this-day:v1:en:08-02')
    expect(nextLocalMidnightDelay(local)).toBe(new Date(2026, 7, 3).getTime() - local.getTime())
  })

  it('normalizes selected events first, deduplicates, bounds categories, and keeps safe article links', async () => {
    const selected = [
      { year: 1969, text: 'Apollo 11 returns safely.', pages: [{ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Apollo_11' } } }] },
      { year: 1969, text: 'Apollo 11 returns safely.' },
      { year: 'bad', text: 'Drop me' },
    ]
    const events = Array.from({ length: 14 }, (_, index) => ({
      year: 1900 + index,
      text: `Event ${index}`,
      pages: [{ content_urls: { desktop: { page: index === 0 ? 'https://example.com/nope' : `https://en.wikipedia.org/wiki/Event_${index}` } } }],
    }))
    const births = Array.from({ length: 6 }, (_, index) => ({ year: 1800 + index, text: `Birth ${index}` }))
    const deaths = Array.from({ length: 5 }, (_, index) => ({ year: 1700 + index, text: `Death ${index}` }))
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response({ selected, events, births, deaths }))

    const data = await fetchOnThisDay(new Date(2026, 7, 2, 15), fetchFn)

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(data.events).toHaveLength(12)
    expect(data.events[0]).toEqual({
      year: 1969,
      text: 'Apollo 11 returns safely.',
      url: 'https://en.wikipedia.org/wiki/Apollo_11',
    })
    expect(data.events.filter((event) => event.year === 1969)).toHaveLength(1)
    expect(data.events.find((event) => event.text === 'Event 0')?.url).toBeUndefined()
    expect(data.births).toHaveLength(4)
    expect(data.deaths).toHaveLength(4)
    expect(isOnThisDayData(data)).toBe(true)
  })

  it('fails invalid top-level data and exposes neither fetched text nor response bodies', async () => {
    const secret = 'provider-body-must-not-leak'
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(response({ selected: 'wrong', events: [] }))
    await expect(fetchOnThisDay(new Date(2026, 7, 2), malformed)).rejects.toThrow('On This Day is unavailable')

    const failed = vi.fn<typeof fetch>().mockResolvedValue(response({ secret }, 503))
    let message = ''
    try {
      await fetchOnThisDay(new Date(2026, 7, 2), failed)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toBe('On This Day is unavailable.')
    expect(message).not.toContain(secret)
  })
})
