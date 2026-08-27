// src/services/connectors/github.test.ts — the GitHub connector's service
// layer: whoamiGithub (token validation), fetchGithub (three independent
// sections + ETag round-trip + quiet degradation), and the descriptor's shape.
// Same fake-Response/injectable-fetchFn idiom as http.test.ts (see its comment
// on the minimal Response stand-in), so nothing here touches a real network.
import { describe, expect, it, vi } from 'vitest'
import {
  fetchGithub,
  whoamiGithub,
  githubDescriptor,
  resolveGithubViews,
  DEFAULT_GITHUB_VIEWS,
  type GithubData,
} from './github'

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
  graphql?: ReturnType<typeof fakeResponse> | (() => never)
}) {
  return vi.fn(async (url: string) => {
    if (url.includes('/graphql')) {
      if (!routes.graphql) throw new Error(`unstubbed graphql: ${url}`)
      return typeof routes.graphql === 'function' ? routes.graphql() : routes.graphql
    }
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

const searchBody = (items: Array<{ id?: number | string; title: string; html_url: string; repository_url: string }>) => ({
  items: items.map((item, index) => ({ id: item.id ?? index + 1, ...item })),
})

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

describe('resolveGithubViews', () => {
  it('undefined, null, and {} (no views key) all resolve to the all-on default', () => {
    const allOn = { commitGraph: true, pulls: true, issues: true, notifications: true }
    expect(resolveGithubViews(undefined)).toEqual(allOn)
    expect(resolveGithubViews(null)).toEqual(allOn)
    expect(resolveGithubViews({})).toEqual(allOn)
  })

  it('a hand-edited partial views object fills missing fields from the default rather than crashing or dropping them', () => {
    const result = resolveGithubViews({ views: { commitGraph: false } as never })
    expect(result).toEqual({ commitGraph: false, pulls: true, issues: true, notifications: true })
  })
})

describe('fetchGithub — three independent sections', () => {
  it('parses PRs and issues from the search payload, deriving repo from repository_url', async () => {
    const fetchFn = router({
      prs: fakeResponse({
        status: 200,
        body: searchBody([
          { id: 101, title: 'Fix the flaky test', html_url: 'https://github.com/acme/app/pull/1', repository_url: 'https://api.github.com/repos/acme/app' },
        ]),
      }),
      issues: fakeResponse({
        status: 200,
        body: searchBody([
          { id: '202', title: 'Crash on launch', html_url: 'https://github.com/acme/web/issues/9', repository_url: 'https://api.github.com/repos/acme/web' },
        ]),
      }),
      notifications: fakeResponse({ status: 200, body: [{}, {}] }),
    })

    const data = await fetchGithub('t', null, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
    expect(data.prs).toEqual([{ id: '101', title: 'Fix the flaky test', url: 'https://github.com/acme/app/pull/1', repo: 'acme/app' }])
    expect(data.issues).toEqual([{ id: '202', title: 'Crash on launch', url: 'https://github.com/acme/web/issues/9', repo: 'acme/web' }])
    expect(data.notifications).toBe(2)
  })

  it('skips a search row without a provider-native stable id', async () => {
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      issues: fakeResponse({
        status: 200,
        body: {
          items: [{
            title: 'Untrackable issue',
            html_url: 'https://github.com/acme/web/issues/99',
            repository_url: 'https://api.github.com/repos/acme/web',
          }],
        },
      }),
      notifications: fakeResponse({ status: 200, body: [] }),
    })

    const data = await fetchGithub('t', null, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)

    expect(data.issues).toEqual([])
  })

  it('counts the unread notifications array length', async () => {
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, body: [{}, {}, {}, {}, {}] }),
    })
    const data = await fetchGithub('t', null, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
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
    const data = await fetchGithub('t', null, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
    expect(data.notifications).toBeNull()
    expect(data.prs).toHaveLength(1) // the bad section never blanked this one
    expect(data.issues).toEqual([])
  })

  it('a network failure on ONE section keeps that section\'s prev slice, others refresh', async () => {
    const prev: GithubData = {
      prs: [{ id: '7', title: 'Old PR', url: 'https://github.com/o/r/pull/7', repo: 'o/r' }],
      issues: [{ id: '8', title: 'Old issue', url: 'https://github.com/o/r/issues/8', repo: 'o/r' }],
      notifications: 4,
      etags: {},
      contributions: null,
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

    const data = await fetchGithub('t', prev, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
    expect(data.prs).toEqual(prev.prs) // kept verbatim through the failure
    expect(data.issues).toEqual([{ id: '1', title: 'Fresh issue', url: 'https://github.com/o/r/issues/10', repo: 'o/r' }])
    expect(data.notifications).toBe(1)
  })

  it('with no prev, a failing section falls back to [] (prs/issues) and null (notifications)', async () => {
    const fetchFn = router({
      prs: fakeResponse({ ok: false, status: 500 }),
      issues: fakeResponse({ ok: false, status: 500 }),
      notifications: fakeResponse({ ok: false, status: 500 }),
    })
    const data = await fetchGithub('t', null, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ prs: [], issues: [], notifications: null, etags: {}, contributions: null })
  })
})

describe('fetchGithub — ETag round-trip', () => {
  it('stores each section\'s etag keyed by request path on the first call', async () => {
    const fetchFn = router({
      prs: fakeResponse({ status: 200, etag: 'W/"prs-1"', body: searchBody([]) }),
      issues: fakeResponse({ status: 200, etag: 'W/"iss-1"', body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, etag: 'W/"ntf-1"', body: [] }),
    })
    const data = await fetchGithub('t', null, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
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
    const prev = await fetchGithub('t', null, DEFAULT_GITHUB_VIEWS, first as unknown as typeof fetch)

    // Second call: everything 304s. Assert the If-None-Match header carried the
    // stored etag, and the returned slices are the prev ones verbatim.
    const second = router({
      prs: fakeResponse({ ok: false, status: 304, etag: 'W/"prs-1"' }),
      issues: fakeResponse({ ok: false, status: 304, etag: 'W/"iss-1"' }),
      notifications: fakeResponse({ ok: false, status: 304, etag: 'W/"ntf-1"' }),
    })
    const data = await fetchGithub('t', prev, DEFAULT_GITHUB_VIEWS, second as unknown as typeof fetch)

    expect(data.prs).toEqual(prev.prs)
    expect(data.notifications).toBe(3)
    expect(data.etags['/search/issues?q=type:pr+state:open+review-requested:@me&per_page=10']).toBe('W/"prs-1"')

    const prCall = (second.mock.calls as unknown as Array<[string, RequestInit]>).find(([url]) =>
      url.includes('type:pr'),
    )
    expect((prCall?.[1].headers as Record<string, string>)['If-None-Match']).toBe('W/"prs-1"')
  })
})

/** Local yyyy-mm-dd of `base` minus `n` days — mirrors github.ts's private
 *  `isoDay`, used here only to build window-boundary fixtures. */
function daysAgo(base: Date, n: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyCalendarBody = {
  data: { viewer: { contributionsCollection: { contributionCalendar: { totalContributions: 0, weeks: [] } } } },
}

describe('fetchGithub — contributions section (GraphQL)', () => {
  it('flattens weeks into ascending days within the 112-day window, dropping GitHub\'s earlier padding', async () => {
    vi.useFakeTimers()
    try {
      const now = new Date(2024, 2, 15, 12, 0, 0)
      vi.setSystemTime(now)
      const windowStart = daysAgo(now, 111) // exactly the window's first day — kept
      const padded = daysAgo(now, 115) // before the window — GitHub's padding, dropped
      const today = daysAgo(now, 0)

      const fetchFn = router({
        prs: fakeResponse({ status: 200, body: searchBody([]) }),
        issues: fakeResponse({ status: 200, body: searchBody([]) }),
        notifications: fakeResponse({ status: 200, body: [] }),
        graphql: fakeResponse({
          status: 200,
          body: {
            data: { viewer: { contributionsCollection: { contributionCalendar: {
              totalContributions: 7,
              // Out of chronological order on purpose, to prove the sort step sorts.
              weeks: [
                { contributionDays: [{ date: today, contributionCount: 4 }] },
                { contributionDays: [
                  { date: padded, contributionCount: 9 },
                  { date: windowStart, contributionCount: 3 },
                ] },
              ],
            } } } },
          },
        }),
      })

      const data = await fetchGithub('t', null, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
      expect(data.contributions).toEqual({
        total: 7,
        days: [
          { date: windowStart, count: 3 },
          { date: today, count: 4 },
        ],
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a 200 carrying a GraphQL errors array carries prev.contributions, without throwing', async () => {
    const prev: GithubData = {
      prs: [], issues: [], notifications: null, etags: {},
      contributions: { days: [{ date: '2024-01-01', count: 2 }], total: 2 },
    }
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, body: [] }),
      graphql: fakeResponse({ status: 200, body: { errors: [{ message: 'Resource not accessible by personal access token' }] } }),
    })
    const data = await fetchGithub('t', prev, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
  })

  it('a 200 carrying a GraphQL errors array with no prev resolves contributions to null', async () => {
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, body: [] }),
      graphql: fakeResponse({ status: 200, body: { errors: [{ message: 'nope' }] } }),
    })
    const data = await fetchGithub('t', null, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toBeNull()
  })

  it('a non-OK GraphQL response carries prev.contributions', async () => {
    const prev: GithubData = {
      prs: [], issues: [], notifications: null, etags: {},
      contributions: { days: [{ date: '2024-01-01', count: 5 }], total: 5 },
    }
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, body: [] }),
      graphql: fakeResponse({ ok: false, status: 502 }),
    })
    const data = await fetchGithub('t', prev, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
  })

  it('a network failure on the GraphQL request carries prev.contributions', async () => {
    const prev: GithubData = {
      prs: [], issues: [], notifications: null, etags: {},
      contributions: { days: [{ date: '2024-01-01', count: 5 }], total: 5 },
    }
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, body: [] }),
      graphql: () => {
        throw new Error('network down')
      },
    })
    const data = await fetchGithub('t', prev, DEFAULT_GITHUB_VIEWS, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
  })

  it('views.commitGraph === false sends NO request to /graphql and carries prev.contributions', async () => {
    const prev: GithubData = {
      prs: [], issues: [], notifications: null, etags: {},
      contributions: { days: [{ date: '2024-01-01', count: 9 }], total: 9 },
    }
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, body: [] }),
      // graphql intentionally unstubbed — a request there would throw.
    })
    const views = { ...DEFAULT_GITHUB_VIEWS, commitGraph: false }
    const data = await fetchGithub('t', prev, views, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
    const calls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(calls.some((u) => u.includes('/graphql'))).toBe(false)
  })
})

describe('fetchGithub — per-view gating (disabled sections send no request)', () => {
  const PR_PATH = '/search/issues?q=type:pr+state:open+review-requested:@me&per_page=10'
  const ISSUE_PATH = '/search/issues?q=type:issue+state:open+assignee:@me&per_page=10'
  const NOTIF_PATH = '/notifications?per_page=50'

  it('views.pulls === false: no PR request; prev items + etag carried verbatim', async () => {
    const prev: GithubData = {
      prs: [{ id: '7', title: 'Old PR', url: 'https://github.com/o/r/pull/7', repo: 'o/r' }],
      issues: [],
      notifications: null,
      etags: { [PR_PATH]: 'W/"prs-old"' },
      contributions: null,
    }
    const fetchFn = router({
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, body: [] }),
      graphql: fakeResponse({ status: 200, body: emptyCalendarBody }),
      // prs intentionally unstubbed — a request there would throw.
    })
    const views = { ...DEFAULT_GITHUB_VIEWS, pulls: false }
    const data = await fetchGithub('t', prev, views, fetchFn as unknown as typeof fetch)
    expect(data.prs).toEqual(prev.prs)
    expect(data.etags[PR_PATH]).toBe('W/"prs-old"')
    const calls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(calls.some((u) => u.includes('type:pr'))).toBe(false)
  })

  it('views.issues === false: no issue request; prev items + etag carried verbatim', async () => {
    const prev: GithubData = {
      prs: [],
      issues: [{ id: '8', title: 'Old issue', url: 'https://github.com/o/r/issues/8', repo: 'o/r' }],
      notifications: null,
      etags: { [ISSUE_PATH]: 'W/"iss-old"' },
      contributions: null,
    }
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      notifications: fakeResponse({ status: 200, body: [] }),
      graphql: fakeResponse({ status: 200, body: emptyCalendarBody }),
      // issues intentionally unstubbed — a request there would throw.
    })
    const views = { ...DEFAULT_GITHUB_VIEWS, issues: false }
    const data = await fetchGithub('t', prev, views, fetchFn as unknown as typeof fetch)
    expect(data.issues).toEqual(prev.issues)
    expect(data.etags[ISSUE_PATH]).toBe('W/"iss-old"')
    const calls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(calls.some((u) => u.includes('type:issue'))).toBe(false)
  })

  it('views.notifications === false: no notifications request; prev count carried', async () => {
    const prev: GithubData = {
      prs: [],
      issues: [],
      notifications: 6,
      etags: { [NOTIF_PATH]: 'W/"ntf-old"' },
      contributions: null,
    }
    const fetchFn = router({
      prs: fakeResponse({ status: 200, body: searchBody([]) }),
      issues: fakeResponse({ status: 200, body: searchBody([]) }),
      graphql: fakeResponse({ status: 200, body: emptyCalendarBody }),
      // notifications intentionally unstubbed — a request there would throw.
    })
    const views = { ...DEFAULT_GITHUB_VIEWS, notifications: false }
    const data = await fetchGithub('t', prev, views, fetchFn as unknown as typeof fetch)
    expect(data.notifications).toBe(6)
    expect(data.etags[NOTIF_PATH]).toBe('W/"ntf-old"')
    const calls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(calls.some((u) => u.includes('/notifications'))).toBe(false)
  })
})

describe('githubDescriptor', () => {
  it('declares the token connector identity, secret, and single origin', () => {
    expect(githubDescriptor.id).toBe('github')
    expect(githubDescriptor.auth).toBe('token')
    expect(githubDescriptor.secretFields).toEqual(['token'])
    expect(githubDescriptor.identityField).toBe('username')
    expect(githubDescriptor.category).toBe('development')
    expect(githubDescriptor.origins({ enabled: true, token: 't', username: 'jon' })).toEqual([
      'https://api.github.com/*',
    ])
  })

  it('owns its constant origin only after both token and identity are configured, independent of enabled', () => {
    expect(githubDescriptor.ownsOrigins({ enabled: false, token: 't', username: 'jon' })).toBe(true)
    expect(githubDescriptor.ownsOrigins({ enabled: true } as never)).toBe(false)
    expect(githubDescriptor.ownsOrigins({ enabled: true, token: '', username: 'jon' })).toBe(false)
  })
})
