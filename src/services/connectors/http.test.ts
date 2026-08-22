// src/services/connectors/http.test.ts — getJson/conditionalGetJson, the
// shared JSON-fetch helpers every token connector (Tasks 48-51) builds its
// service call on. Same fake-timer/abort-on-signal mock idiom as
// rss.test.ts's fetchHeadlines abort case (see that file's comment for why
// the mock rejects on the signal's 'abort' event rather than a bare timeout).
import { describe, expect, it, vi } from 'vitest'
import { getJson, conditionalGetJson, postEmpty, postJson, type JsonError } from './http'

// Minimal fetch Response stand-in: only the members getJson/conditionalGetJson
// actually touch (ok, status, headers.get, json()). Cast through `unknown` at
// each call site, same pattern rss.test.ts uses for its fetchFn doubles.
function fakeResponse(opts: { ok: boolean; status: number; etag?: string | null; body?: unknown }) {
  const jsonFn = vi.fn(async () => opts.body ?? {})
  return {
    ok: opts.ok,
    status: opts.status,
    headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? (opts.etag ?? null) : null) },
    json: jsonFn,
  }
}

describe('getJson', () => {
  it('parses an ok JSON response and captures its etag header', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: true, status: 200, etag: 'W/"abc"', body: { hello: 'world' } }))

    const result = await getJson<{ hello: string }>(
      'https://api.example.com/x',
      { Authorization: 'Bearer t' },
      fetchFn as unknown as typeof fetch,
    )

    expect(result).toEqual({ ok: true, status: 200, body: { hello: 'world' }, etag: 'W/"abc"' })
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/x',
      expect.objectContaining({ headers: { Authorization: 'Bearer t' }, signal: expect.anything() }),
    )
  })

  it('etag is null when the response carries no etag header', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: true, status: 200, body: {} }))
    const result = await getJson('https://api.example.com/x', {}, fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(true)
    expect(result.ok && result.etag).toBeNull()
  })

  it('a non-OK status becomes a JsonError carrying that status', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: false, status: 401 }))
    const result = await getJson('https://api.example.com/x', {}, fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    expect((result as JsonError).status).toBe(401)
    expect((result as JsonError).message).toBeTruthy()
  })

  it('a rejecting fetch (network error) becomes a JsonError with status null', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    const result = await getJson('https://api.example.com/x', {}, fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, status: null, message: 'network down' })
  })

  it('aborts after 8s and reports it as a JsonError with status null, without hanging', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }),
      )

      const promise = getJson('https://api.example.com/slow', {}, fetchFn as unknown as typeof fetch)
      await vi.advanceTimersByTimeAsync(8_000)
      const result = await promise

      expect(result.ok).toBe(false)
      expect((result as JsonError).status).toBeNull()
      expect(fetchFn).toHaveBeenCalledWith(
        'https://api.example.com/slow',
        expect.objectContaining({ signal: expect.anything() }),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('conditionalGetJson', () => {
  it('omits If-None-Match when no etag is passed', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: true, status: 200, body: { a: 1 } }))
    await conditionalGetJson('https://api.example.com/x', { Authorization: 'Bearer t' }, null, fetchFn as unknown as typeof fetch)

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/x',
      expect.objectContaining({ headers: { Authorization: 'Bearer t' } }),
    )
  })

  it('sends If-None-Match when an etag is present', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: true, status: 200, body: { a: 1 } }))
    await conditionalGetJson('https://api.example.com/x', { Authorization: 'Bearer t' }, 'W/"old"', fetchFn as unknown as typeof fetch)

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/x',
      expect.objectContaining({ headers: { Authorization: 'Bearer t', 'If-None-Match': 'W/"old"' } }),
    )
  })

  it('a 304 returns ok:true with a null body and the SAME etag, without parsing a body', async () => {
    const res = fakeResponse({ ok: false, status: 304 })
    const fetchFn = vi.fn(async () => res)

    const result = await conditionalGetJson('https://api.example.com/x', {}, 'W/"old"', fetchFn as unknown as typeof fetch)

    expect(result).toEqual({ ok: true, status: 304, body: null, etag: 'W/"old"' })
    expect(res.json).not.toHaveBeenCalled()
  })

  it('a fresh 200 parses the body and captures the NEW etag', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: true, status: 200, etag: 'W/"new"', body: { b: 2 } }))
    const result = await conditionalGetJson('https://api.example.com/x', {}, 'W/"old"', fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: true, status: 200, body: { b: 2 }, etag: 'W/"new"' })
  })

  it('a non-OK, non-304 status becomes a JsonError', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: false, status: 500 }))
    const result = await conditionalGetJson('https://api.example.com/x', {}, null, fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    expect((result as JsonError).status).toBe(500)
  })

  it('a network rejection becomes a JsonError with status null', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('down')
    })
    const result = await conditionalGetJson('https://api.example.com/x', {}, null, fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, status: null, message: 'down' })
  })
})

describe('postJson', () => {
  it('POSTs with Content-Type merged into headers and the body JSON-stringified', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: true, status: 200, body: { ok: 1 } }))

    await postJson(
      'https://api.example.com/graphql',
      { Authorization: 'Bearer t' },
      { query: 'x', variables: { a: 1 } },
      fetchFn as unknown as typeof fetch,
    )

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/graphql',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'x', variables: { a: 1 } }),
        headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
        signal: expect.anything(),
      }),
    )
  })

  it('a 200 parses the JSON body into a JsonResult, capturing the etag header', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: true, status: 200, etag: 'W/"g"', body: { data: { a: 1 } } }))
    const result = await postJson<{ data: { a: number } }>(
      'https://api.example.com/graphql',
      {},
      { query: 'x' },
      fetchFn as unknown as typeof fetch,
    )
    expect(result).toEqual({ ok: true, status: 200, body: { data: { a: 1 } }, etag: 'W/"g"' })
  })

  it('a non-OK status becomes a JsonError carrying that status', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: false, status: 502 }))
    const result = await postJson('https://api.example.com/graphql', {}, {}, fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    expect((result as JsonError).status).toBe(502)
  })

  it('a rejecting fetch (network error) becomes a JsonError with status null', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    const result = await postJson('https://api.example.com/graphql', {}, {}, fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, status: null, message: 'network down' })
  })
})

describe('postEmpty', () => {
  it('POSTs without a request body or content-type and returns a typed empty success', async () => {
    const res = fakeResponse({ ok: true, status: 204, etag: 'W/"closed"' })
    const fetchFn = vi.fn(async () => res)

    const result = await postEmpty(
      'https://api.example.com/items/one/close',
      { Authorization: 'Bearer t' },
      fetchFn as unknown as typeof fetch,
    )

    expect(result).toEqual({ ok: true, status: 204, body: null, etag: 'W/"closed"' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [, init] = (fetchFn.mock.calls as unknown as Array<[string, RequestInit]>)[0]
    expect(init).toEqual(expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
      signal: expect.anything(),
    }))
    expect(init).not.toHaveProperty('body')
    expect(init).not.toHaveProperty('Content-Type')
    expect(res.json).not.toHaveBeenCalled()
  })

  it('preserves the shared typed status failure without reading the response body', async () => {
    const res = fakeResponse({ ok: false, status: 409, body: { secret: 'do not read' } })
    const fetchFn = vi.fn(async () => res)

    const result = await postEmpty('https://api.example.com/items/one/close', {}, fetchFn as unknown as typeof fetch)

    expect(result).toEqual({ ok: false, status: 409, message: 'Request failed with status 409' })
    expect(res.json).not.toHaveBeenCalled()
  })

  it('preserves the shared typed network failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })

    const result = await postEmpty('https://api.example.com/items/one/close', {}, fetchFn as unknown as typeof fetch)

    expect(result).toEqual({ ok: false, status: null, message: 'network down' })
  })

  it('uses the shared eight-second abort discipline', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const error = new Error('The operation was aborted')
              error.name = 'AbortError'
              reject(error)
            })
          }),
      )

      const promise = postEmpty('https://api.example.com/items/one/close', {}, fetchFn as unknown as typeof fetch)
      await vi.advanceTimersByTimeAsync(8_000)

      expect(await promise).toEqual({ ok: false, status: null, message: 'The operation was aborted' })
    } finally {
      vi.useRealTimers()
    }
  })
})
