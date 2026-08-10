// src/services/connectors/vercel.test.ts — the Vercel connector's service
// layer: whoamiVercel (token validation, with the username/email fallback),
// fetchVercel (deployment parsing incl. both documented API-shape fallbacks,
// failed-first sorting, and quiet degradation), relAge's pure boundary math,
// and the descriptor's shape. Same fake-Response/injectable-fetchFn idiom as
// http.test.ts / github.test.ts, so nothing here touches a real network.
import { describe, expect, it, vi } from 'vitest'
import { fetchVercel, whoamiVercel, relAge, vercelDescriptor, DEFAULT_VERCEL_VIEWS, type VercelData } from './vercel'

/** Minimal fetch Response stand-in — only the members getJson reads (ok,
 *  status, headers.get('etag'), json()). Cast through `unknown` at each
 *  fetchFn call site, same as http.test.ts. */
function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => opts.body ?? {}),
  }
}

/** Routes a fetch call to a fake Response by which endpoint its URL names.
 *  Unmatched URLs throw — a test that forgot to stub an endpoint fails
 *  loudly rather than silently. */
function router(routes: {
  deployments?: ReturnType<typeof fakeResponse> | (() => never)
  user?: ReturnType<typeof fakeResponse>
}) {
  return vi.fn(async (url: string) => {
    if (url.includes('/v6/deployments')) {
      if (!routes.deployments) throw new Error(`unstubbed deployments: ${url}`)
      return typeof routes.deployments === 'function' ? routes.deployments() : routes.deployments
    }
    if (url.endsWith('/v2/user')) {
      if (!routes.user) throw new Error(`unstubbed user: ${url}`)
      return routes.user
    }
    throw new Error(`unexpected url: ${url}`)
  })
}

describe('whoamiVercel', () => {
  it('returns user.username on a 200 /v2/user response', async () => {
    const fetchFn = router({ user: fakeResponse({ status: 200, body: { user: { username: 'jon' } } }) })
    const result = await whoamiVercel('vc_good', fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: true, identity: 'jon' })
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.vercel.com/v2/user',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer vc_good' }) }),
    )
  })

  it('falls back to user.email when no username is present', async () => {
    const fetchFn = router({
      user: fakeResponse({ status: 200, body: { user: { email: 'jon@acme.com' } } }),
    })
    const result = await whoamiVercel('vc_good', fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: true, identity: 'jon@acme.com' })
  })

  it('a 401 (bad token) fails with a message that names the status', async () => {
    const fetchFn = router({ user: fakeResponse({ ok: false, status: 401 }) })
    const result = await whoamiVercel('vc_bad', fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('401')
  })

  it('a 200 with neither username nor email is treated as a rejection, not a silent empty identity', async () => {
    const fetchFn = router({ user: fakeResponse({ status: 200, body: { user: {} } }) })
    const result = await whoamiVercel('vc_weird', fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
  })
})

describe('fetchVercel — parsing', () => {
  it('parses project/state/url/createdAt from the v6 payload (readyState + inspectorUrl + numeric createdAt)', async () => {
    const fetchFn = router({
      deployments: fakeResponse({
        status: 200,
        body: {
          deployments: [
            {
              name: 'my-app',
              readyState: 'READY',
              inspectorUrl: 'https://vercel.com/acme/my-app/abc123',
              createdAt: 1_700_000_000_000,
            },
          ],
        },
      }),
    })
    const data = await fetchVercel('t', DEFAULT_VERCEL_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.deployments).toEqual([
      { project: 'my-app', state: 'READY', url: 'https://vercel.com/acme/my-app/abc123', createdAt: 1_700_000_000_000 },
    ])
  })

  it('falls back to `state` when `readyState` is absent', async () => {
    const fetchFn = router({
      deployments: fakeResponse({
        status: 200,
        body: {
          deployments: [
            { name: 'my-app', state: 'ERROR', url: 'my-app-abc123.vercel.app', createdAt: 1 },
          ],
        },
      }),
    })
    const data = await fetchVercel('t', DEFAULT_VERCEL_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.deployments[0]!.state).toBe('ERROR')
  })

  it('prefixes https:// onto a bare `url` host when `inspectorUrl` is absent', async () => {
    const fetchFn = router({
      deployments: fakeResponse({
        status: 200,
        body: {
          deployments: [
            { name: 'my-app', readyState: 'READY', url: 'my-app-abc123.vercel.app', createdAt: 1 },
          ],
        },
      }),
    })
    const data = await fetchVercel('t', DEFAULT_VERCEL_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.deployments[0]!.url).toBe('https://my-app-abc123.vercel.app')
  })

  it('falls back to a nested `created` when `createdAt` is absent', async () => {
    const fetchFn = router({
      deployments: fakeResponse({
        status: 200,
        body: {
          deployments: [
            { name: 'my-app', readyState: 'READY', inspectorUrl: 'https://x/y', created: 42 },
          ],
        },
      }),
    })
    const data = await fetchVercel('t', DEFAULT_VERCEL_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.deployments[0]!.createdAt).toBe(42)
  })

  it('skips a row missing a project name or a resolvable url', async () => {
    const fetchFn = router({
      deployments: fakeResponse({
        status: 200,
        body: {
          deployments: [
            { readyState: 'READY', inspectorUrl: 'https://x/y', createdAt: 1 }, // no name
            { name: 'ok-project', readyState: 'READY', createdAt: 1 }, // no url/inspectorUrl
            { name: 'good', readyState: 'READY', inspectorUrl: 'https://x/z', createdAt: 1 },
          ],
        },
      }),
    })
    const data = await fetchVercel('t', DEFAULT_VERCEL_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.deployments).toEqual([{ project: 'good', state: 'READY', url: 'https://x/z', createdAt: 1 }])
  })
})

describe('fetchVercel — failed-first sort', () => {
  it('ERROR deployments sort first, then everything else by createdAt descending', async () => {
    const fetchFn = router({
      deployments: fakeResponse({
        status: 200,
        body: {
          deployments: [
            { name: 'oldest-ready', readyState: 'READY', inspectorUrl: 'https://x/1', createdAt: 100 },
            { name: 'newest-ready', readyState: 'READY', inspectorUrl: 'https://x/2', createdAt: 300 },
            { name: 'the-failure', readyState: 'ERROR', inspectorUrl: 'https://x/3', createdAt: 50 },
            { name: 'mid-ready', readyState: 'READY', inspectorUrl: 'https://x/4', createdAt: 200 },
          ],
        },
      }),
    })
    const data = await fetchVercel('t', DEFAULT_VERCEL_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.deployments.map((d) => d.project)).toEqual([
      'the-failure', // ERROR, sorts first despite being the OLDEST
      'newest-ready',
      'mid-ready',
      'oldest-ready',
    ])
  })

  it('is stable: two ERROR deployments (or two equal-createdAt non-errors) keep their original relative order', async () => {
    const fetchFn = router({
      deployments: fakeResponse({
        status: 200,
        body: {
          deployments: [
            { name: 'error-a', readyState: 'ERROR', inspectorUrl: 'https://x/1', createdAt: 100 },
            { name: 'error-b', readyState: 'ERROR', inspectorUrl: 'https://x/2', createdAt: 100 },
          ],
        },
      }),
    })
    const data = await fetchVercel('t', DEFAULT_VERCEL_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.deployments.map((d) => d.project)).toEqual(['error-a', 'error-b'])
  })
})

describe('fetchVercel — quiet degradation', () => {
  it('a network failure keeps the prev slice verbatim', async () => {
    const prev: VercelData = {
      deployments: [{ project: 'old', state: 'READY', url: 'https://x/old', createdAt: 1 }],
    }
    const fetchFn = router({
      deployments: () => {
        throw new Error('network down')
      },
    })
    const data = await fetchVercel('t', DEFAULT_VERCEL_VIEWS, prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
  })

  it('a non-OK status with no prev falls back to an empty deployments list', async () => {
    const fetchFn = router({ deployments: fakeResponse({ ok: false, status: 500 }) })
    const data = await fetchVercel('t', DEFAULT_VERCEL_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ deployments: [] })
  })
})

describe('fetchVercel — per-view gating (one endpoint feeds both sections)', () => {
  const DEPLOYMENT_BODY = {
    deployments: [{ name: 'my-app', readyState: 'READY', inspectorUrl: 'https://x/y', createdAt: 1 }],
  }

  it('both sections off: NO request; prev carried verbatim', async () => {
    const prev: VercelData = {
      deployments: [{ project: 'old', state: 'READY', url: 'https://x/old', createdAt: 1 }],
    }
    const fetchFn = router({}) // nothing stubbed — any request throws
    const views = { deployments: false, statusSummary: false }
    const data = await fetchVercel('t', views, prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('both sections off with no prev: NO request; empty deployments', async () => {
    const fetchFn = router({})
    const views = { deployments: false, statusSummary: false }
    const data = await fetchVercel('t', views, null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ deployments: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('only the deployments section on: ONE request, deployments populate', async () => {
    const fetchFn = router({ deployments: fakeResponse({ status: 200, body: DEPLOYMENT_BODY }) })
    const views = { deployments: true, statusSummary: false }
    const data = await fetchVercel('t', views, null, fetchFn as unknown as typeof fetch)
    expect(data.deployments).toHaveLength(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('only the statusSummary section on: STILL one request — the summary derives from the same deployments data', async () => {
    const fetchFn = router({ deployments: fakeResponse({ status: 200, body: DEPLOYMENT_BODY }) })
    const views = { deployments: false, statusSummary: true }
    const data = await fetchVercel('t', views, null, fetchFn as unknown as typeof fetch)
    // The data shape is unchanged — the widget derives the status summary from
    // `deployments`, so the fetch keys on the DATA being needed, not on a 1:1
    // section-to-request mapping.
    expect(data.deployments).toHaveLength(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe('DEFAULT_VERCEL_VIEWS', () => {
  it('is the wave-2 default: the deployments section ON, the status summary this wave adds OFF', () => {
    expect(DEFAULT_VERCEL_VIEWS).toEqual({ deployments: true, statusSummary: false })
  })
})

describe('relAge — boundary math', () => {
  const NOW = 1_700_000_000_000

  it('under 60s reads as "now"', () => {
    expect(relAge(NOW, NOW - 59_000)).toBe('now')
  })

  it('60s reads as "1m"', () => {
    expect(relAge(NOW, NOW - 60_000)).toBe('1m')
  })

  it('3599s (just under an hour) reads as "59m"', () => {
    expect(relAge(NOW, NOW - 3_599_000)).toBe('59m')
  })

  it('3600s reads as "1h"', () => {
    expect(relAge(NOW, NOW - 3_600_000)).toBe('1h')
  })

  it('86400s (a full day) reads as "1d"', () => {
    expect(relAge(NOW, NOW - 86_400_000)).toBe('1d')
  })
})

describe('vercelDescriptor', () => {
  it('declares the token connector identity, secret, and single origin', () => {
    expect(vercelDescriptor.id).toBe('vercel')
    expect(vercelDescriptor.auth).toBe('token')
    expect(vercelDescriptor.ttlMs).toBe(5 * 60_000)
    expect(vercelDescriptor.secretFields).toEqual(['token'])
    expect(vercelDescriptor.identityField).toBe('username')
    expect(vercelDescriptor.origins({ enabled: true, token: 't', username: 'jon' })).toEqual([
      'https://api.vercel.com/*',
    ])
  })
})
