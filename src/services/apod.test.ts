// src/services/apod.test.ts — fetchApod: NASA's Astronomy Picture of the
// Day, keyless (DEMO_KEY) and quiet on any failure. Same fake-Response/
// injectable-fetchFn idiom as ./connectors/http.test.ts and
// ./connectors/vercel.test.ts — nothing here touches the real network. The
// response shape below (date/title/url/hdurl/copyright/media_type) is what a
// one-off manual `curl https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`
// actually returned during Task 95 (see the task report for the raw output).
import { describe, expect, it, vi } from 'vitest'
import { fetchApod, APOD_ENDPOINT, APOD_ORIGINS } from './apod'

function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown; jsonThrows?: boolean }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => {
      if (opts.jsonThrows) throw new SyntaxError('Unexpected token in JSON')
      return opts.body ?? {}
    }),
  }
}

function fetchFnFor(response: ReturnType<typeof fakeResponse>) {
  return vi.fn(async () => response)
}

describe('fetchApod', () => {
  it('prefers hdurl over url when both are present and pass the apod.nasa.gov host check', async () => {
    const fetchFn = fetchFnFor(
      fakeResponse({
        status: 200,
        body: {
          date: '2026-08-11',
          title: 'Six Moons of Saturn',
          url: 'https://apod.nasa.gov/apod/image/2608/sd.jpg',
          hdurl: 'https://apod.nasa.gov/apod/image/2608/hd.jpg',
          media_type: 'image',
          copyright: 'Alexandre Trentini',
        },
      }),
    )
    const photo = await fetchApod(fetchFn as unknown as typeof fetch)
    expect(photo).toEqual({
      url: 'https://apod.nasa.gov/apod/image/2608/hd.jpg',
      title: 'Six Moons of Saturn',
      copyright: 'Alexandre Trentini',
    })
    expect(fetchFn).toHaveBeenCalledWith(APOD_ENDPOINT, expect.anything())
  })

  it('falls back to url when hdurl is absent', async () => {
    const fetchFn = fetchFnFor(
      fakeResponse({
        status: 200,
        body: {
          title: 'Url Only',
          url: 'https://apod.nasa.gov/apod/image/2608/sd.jpg',
          media_type: 'image',
        },
      }),
    )
    const photo = await fetchApod(fetchFn as unknown as typeof fetch)
    expect(photo).toEqual({ url: 'https://apod.nasa.gov/apod/image/2608/sd.jpg', title: 'Url Only' })
  })

  it("a media_type of 'video' returns null", async () => {
    const fetchFn = fetchFnFor(
      fakeResponse({
        status: 200,
        body: {
          title: 'Some Video',
          url: 'https://apod.nasa.gov/apod/image/2608/vid.mp4',
          media_type: 'video',
        },
      }),
    )
    expect(await fetchApod(fetchFn as unknown as typeof fetch)).toBeNull()
  })

  it('an image whose hdurl and url both point off the apod.nasa.gov host returns null', async () => {
    const fetchFn = fetchFnFor(
      fakeResponse({
        status: 200,
        body: {
          title: 'Off Host',
          url: 'https://example.com/image.jpg',
          hdurl: 'https://evil.example.com/image.jpg',
          media_type: 'image',
        },
      }),
    )
    expect(await fetchApod(fetchFn as unknown as typeof fetch)).toBeNull()
  })

  it('an hdurl that fails the host check falls back to trying url before giving up', async () => {
    const fetchFn = fetchFnFor(
      fakeResponse({
        status: 200,
        body: {
          title: 'HD Off Host',
          hdurl: 'https://example.com/hd.jpg',
          url: 'https://apod.nasa.gov/apod/image/2608/sd.jpg',
          media_type: 'image',
        },
      }),
    )
    const photo = await fetchApod(fetchFn as unknown as typeof fetch)
    expect(photo).toEqual({ url: 'https://apod.nasa.gov/apod/image/2608/sd.jpg', title: 'HD Off Host' })
  })

  it('an http (non-https) url is rejected even on the right host, returning null', async () => {
    const fetchFn = fetchFnFor(
      fakeResponse({
        status: 200,
        body: {
          title: 'Insecure',
          url: 'http://apod.nasa.gov/apod/image/2608/sd.jpg',
          media_type: 'image',
        },
      }),
    )
    expect(await fetchApod(fetchFn as unknown as typeof fetch)).toBeNull()
  })

  it('a non-OK HTTP status (e.g. DEMO_KEY rate limit) returns null', async () => {
    const fetchFn = fetchFnFor(fakeResponse({ ok: false, status: 429 }))
    expect(await fetchApod(fetchFn as unknown as typeof fetch)).toBeNull()
  })

  it('a rejecting fetch (network error) returns null rather than throwing', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(fetchApod(fetchFn as unknown as typeof fetch)).resolves.toBeNull()
  })

  it('a garbage (unparseable) JSON body returns null rather than throwing', async () => {
    const fetchFn = fetchFnFor(fakeResponse({ status: 200, jsonThrows: true }))
    await expect(fetchApod(fetchFn as unknown as typeof fetch)).resolves.toBeNull()
  })

  it('copyright whitespace (NASA pads it with newlines) is trimmed', async () => {
    const fetchFn = fetchFnFor(
      fakeResponse({
        status: 200,
        body: {
          title: 'Padded Copyright',
          url: 'https://apod.nasa.gov/apod/image/2608/sd.jpg',
          media_type: 'image',
          copyright: '\nAlexandre Trentini\n',
        },
      }),
    )
    const photo = await fetchApod(fetchFn as unknown as typeof fetch)
    expect(photo?.copyright).toBe('Alexandre Trentini')
  })

  it('an absent copyright stays absent — no key at all on the result', async () => {
    const fetchFn = fetchFnFor(
      fakeResponse({
        status: 200,
        body: {
          title: 'No Copyright',
          url: 'https://apod.nasa.gov/apod/image/2608/sd.jpg',
          media_type: 'image',
        },
      }),
    )
    const photo = await fetchApod(fetchFn as unknown as typeof fetch)
    expect(photo && 'copyright' in photo).toBe(false)
  })

  it('a copyright that is empty after trimming is omitted, not kept as an empty string', async () => {
    const fetchFn = fetchFnFor(
      fakeResponse({
        status: 200,
        body: {
          title: 'Blank Copyright',
          url: 'https://apod.nasa.gov/apod/image/2608/sd.jpg',
          media_type: 'image',
          copyright: '   \n  ',
        },
      }),
    )
    const photo = await fetchApod(fetchFn as unknown as typeof fetch)
    expect(photo && 'copyright' in photo).toBe(false)
  })
})

describe('APOD_ENDPOINT / APOD_ORIGINS', () => {
  it('the endpoint targets api.nasa.gov/planetary/apod with the keyless DEMO_KEY', () => {
    expect(APOD_ENDPOINT).toBe('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY')
  })

  it('the origins cover both the JSON endpoint host and the separate image host', () => {
    expect(APOD_ORIGINS).toEqual(['https://api.nasa.gov/', 'https://apod.nasa.gov/'])
  })
})
