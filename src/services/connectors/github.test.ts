// src/services/connectors/github.test.ts — the GitHub connector's service
// layer: whoamiGithub (token validation), fetchGithub (three independent
// sections + ETag round-trip + quiet degradation), and the descriptor's shape.
// Same fake-Response/injectable-fetchFn idiom as http.test.ts (see its comment
// on the minimal Response stand-in), so nothing here touches a real network.
import { describe, expect, it, vi } from 'vitest'
import { fetchGithub, whoamiGithub, githubDescriptor, type GithubData } from './github'

/** Minimal fetch Response stand-in — only the members getJson/
 *  conditionalGetJson read (ok, status, headers.get('etag'), json()). Cast
 *  through `unknown` at each fetchFn call site, same as http.test.ts. */
function fakeResponse(opts: { ok?: boolean; status: number; etag?: string | null; body?: unknown }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? (opts.etag ?? null) : null) },
    json: vi.fn(async () => opts.body ?? {}),
  }
}

/** Routes a fetch call to a fake Response by which endpoint its URL names, so
 *  a test can wire the three sections (PR search, issue search, notifications)
 *  independently. Unmatched URLs throw — a test that forgot to stub an endpoint
 *  fails loudly rather than silently. */
function router(routes: {
  prs?: ReturnType<typeof fakeResponse> | (() => never)
  issues?: ReturnType<typeof fakeResponse>
  notifications?: ReturnType<typeof fakeResponse>
  user?: ReturnType<typeof fakeResponse>
}) {
  return vi.fn(async (url: string) => {
    if (url.includes('/notifications')) {
      if (!routes.notifications) throw new Error(`unstubbed notifications: ${url}`)
      return routes.notifications
    }
    if (url.includes('type:pr')) {
      if (!routes.prs) throw new Error(`unstubbed prs: ${url}`)
      return typeof routes.prs === 'function' ? routes.prs() : routes.prs
    }
    if (url.includes('type:issue')) {
      if (!routes.issues) throw new Error(`unstubbed issues: ${url}`)
      return routes.issues
    }
    if (url.endsWith('/user')) {
      if (!routes.user) throw new Error(`unstubbed user: ${url}`)
      return routes.user
    }
    throw new Error(`unexpected url: ${url}`)
  })
}

const searchBody = (items: Array<{ title: string; html_url: string; repository_url: string }>) => ({ items })

describe('whoamiGithub', () => {
  it('returns the login on a 200 /user response', async () => {
    const fetchFn = router({ user: fakeResponse({ status: 200, body: { login: 'jon' } }) })
    const result = await whoamiGithub('ghp_good', fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: true, identity: 'jon' })
    // Bearer auth + the GitHub Accept/version headers on the request.
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ghp_good',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
      }),
    )
  })

  it('a 401 (bad token) fails with a message that names the status', async () => {
    const fetchFn = router({ user: fakeResponse({ ok: false, status: 401 }) })
    const result = await whoamiGithub('ghp_bad', fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('401')
  })

  it('a 200 with no login is treated as a rejection, not a silent empty identity', async () => {
    const fetchFn = router({ user: fakeResponse({ status: 200, body: {} }) })
    const result = await whoamiGithub('ghp_weird', fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
  })
})

describe('fetchGithub — three independent sections', () => {
  it('parses PRs and issues from the search payload, deriving repo from repository_url', async () => {
    const fetchFn = router({
      prs: fakeResponse({
        status: 200,
        body: searchBody([
          { title: 'Fix the flaky test', html_url: 'https://github.com/acme/app/pull/1', repository_url: 'https://api.github.com/repos/acme/app' },
        ]),
      }),
      issues: fakeResponse({
        status: 200,
        body: searchBody([
          { title: 'Crash on launch', html_url: 'https://github.com/acme/web/issues/9', repository_url: 'https://api.github.com/repos/acme/web' },
        ]),
      }),
      notifications: fakeResponse({ status: 200, body: [{}, {}] }),
    })

    const data = await fetchGithub('t', null, fetchFn as unknown as typeof fetch)
    expect(data.prs).toEqual([{ title: 'Fix the flaky test', url: 'https://github.com/acme/app/pull/1', repo: 'acme/app' }])
    expect(data.issues).toEqual([{ title: 'Crash on launch', url: 'https://github.com/acme/web/issues/9', repo: 'acme/web' }])
    expect(data.notifications).toBe(2)
  })

  it('counts the unread notifications array length', async () => {
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, body: [{}, {}, {}, {}, {}] }),
    })
    const data = await fetchGithub('t', null, fetchFn as unknown as typeof fetch)
    expect(data.notifications).toBe(5)
  })

  it('a 403 on notifications degrades to null while PRs/issues still populate', async () => {
    const fetchFn = router({
      prs: fakeResponse({
        status: 200,
        body: searchBody([
          { title: 'PR one', html_url: 'https://github.com/o/r/pull/1', repository_url: 'https://api.github.com/repos/o/r' },
        ]),
      }),
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ ok: false, status: 403 }),
    })
    const data = await fetchGithub('t', null, fetchFn as unknown as typeof fetch)
    expect(data.notifications).toBeNull()
    expect(data.prs).toHaveLength(1) // the bad section never blanked this one
    expect(data.issues).toEqual([])
  })

  it('a network failure on ONE section keeps that section\'s prev slice, others refresh', async () => {
    const prev: GithubData = {
      prs: [{ title: 'Old PR', url: 'https://github.com/o/r/pull/7', repo: 'o/r' }],
      issues: [{ title: 'Old issue', url: 'https://github.com/o/r/issues/8', repo: 'o/r' }],
      notifications: 4,
      etags: {},
    }
    const fetchFn = router({
      prs: () => {
        throw new Error('network down') // PR section fails
      },
      issues: fakeResponse({
        status: 200,
        body: searchBody([
          { title: 'Fresh issue', html_url: 'https://github.com/o/r/issues/10', repository_url: 'https://api.github.com/repos/o/r' },
        ]),
      }),
      notifications: fakeResponse({ status: 200, body: [{}] }),
    })

    const data = await fetchGithub('t', prev, fetchFn as unknown as typeof fetch)
    expect(data.prs).toEqual(prev.prs) // kept verbatim through the failure
    expect(data.issues).toEqual([{ title: 'Fresh issue', url: 'https://github.com/o/r/issues/10', repo: 'o/r' }])
    expect(data.notifications).toBe(1)
  })

  it('with no prev, a failing section falls back to [] (prs/issues) and null (notifications)', async () => {
    const fetchFn = router({
      prs: fakeResponse({ ok: false, status: 500 }),
      issues: fakeResponse({ ok: false, status: 500 }),
      notifications: fakeResponse({ ok: false, status: 500 }),
    })
    const data = await fetchGithub('t', null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ prs: [], issues: [], notifications: null, etags: {} })
  })
})

describe('fetchGithub — ETag round-trip', () => {
  it('stores each section\'s etag keyed by request path on the first call', async () => {
    const fetchFn = router({
      prs: fakeResponse({ status: 200, etag: 'W/"prs-1"', body: searchBody([]) }),
      issues: fakeResponse({ status: 200, etag: 'W/"iss-1"', body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, etag: 'W/"ntf-1"', body: [] }),
    })
    const data = await fetchGithub('t', null, fetchFn as unknown as typeof fetch)
    expect(data.etags['/search/issues?q=type:pr+state:open+review-requested:@me&per_page=10']).toBe('W/"prs-1"')
    expect(data.etags['/search/issues?q=type:issue+state:open+assignee:@me&per_page=10']).toBe('W/"iss-1"')
    expect(data.etags['/notifications?per_page=50']).toBe('W/"ntf-1"')
  })

  it('the second call sends If-None-Match; a 304 keeps the prev slice verbatim and re-stores the etag', async () => {
    // First call: populate prev + etags.
    const first = router({
      prs: fakeResponse({
        status: 200,
        etag: 'W/"prs-1"',
        body: searchBody([
          { title: 'PR one', html_url: 'https://github.com/o/r/pull/1', repository_url: 'https://api.github.com/repos/o/r' },
        ]),
      }),
      issues: fakeResponse({ status: 200, etag: 'W/"iss-1"', body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, etag: 'W/"ntf-1"', body: [{}, {}, {}] }),
    })
    const prev = await fetchGithub('t', null, first as unknown as typeof fetch)

    // Second call: everything 304s. Assert the If-None-Match header carried the
    // stored etag, and the returned slices are the prev ones verbatim.
    const second = router({
      prs: fakeResponse({ ok: false, status: 304, etag: 'W/"prs-1"' }),
      issues: fakeResponse({ ok: false, status: 304, etag: 'W/"iss-1"' }),
      notifications: fakeResponse({ ok: false, status: 304, etag: 'W/"ntf-1"' }),
    })
    const data = await fetchGithub('t', prev, second as unknown as typeof fetch)

    expect(data.prs).toEqual(prev.prs)
    expect(data.notifications).toBe(3)
    expect(data.etags['/search/issues?q=type:pr+state:open+review-requested:@me&per_page=10']).toBe('W/"prs-1"')

    const prCall = (second.mock.calls as unknown as Array<[string, RequestInit]>).find(([url]) =>
      url.includes('type:pr'),
    )
    expect((prCall?.[1].headers as Record<string, string>)['If-None-Match']).toBe('W/"prs-1"')
  })
})

describe('githubDescriptor', () => {
  it('declares the token connector identity, secret, and single origin', () => {
    expect(githubDescriptor.id).toBe('github')
    expect(githubDescriptor.auth).toBe('token')
    expect(githubDescriptor.secretFields).toEqual(['token'])
    expect(githubDescriptor.identityField).toBe('username')
    expect(githubDescriptor.origins({ enabled: true, token: 't', username: 'jon' })).toEqual([
      'https://api.github.com/*',
    ])
  })
})
