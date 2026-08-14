// src/services/connectors/gitlab.test.ts — the GitLab connector's service
// layer: whoamiGitlab (token + instance validation), fetchGitlab (four
// independent, per-view-gated sections — assigned MRs, review-asks, to-dos,
// the activity graph — no ETag work, quiet degradation), the instance-url ->
// api-base derivation (trailing slash trim, non-gitlab.com instances keep
// their port), and the descriptor's shape. Same fake-Response/injectable-
// fetchFn idiom as github.test.ts, so nothing here touches a real network.
import { describe, expect, it, vi } from 'vitest'
import { fetchGitlab, whoamiGitlab, gitlabDescriptor, DEFAULT_GITLAB_VIEWS, type GitlabData } from './gitlab'

/** Minimal fetch Response stand-in — only the members getJson reads (ok,
 *  status, headers.get('etag'), json()). Cast through `unknown` at each
 *  fetchFn call site, same as github.test.ts. */
function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => opts.body ?? {}),
  }
}

/** Routes a fetch call to a fake Response by which endpoint its URL names —
 *  same dispatch-by-substring idiom as github.test.ts's router. The review
 *  MR search shares the /api/v4/merge_requests path with the assigned search,
 *  so its `reviewer_username` query marker is checked FIRST to keep the two
 *  distinct; the activity graph rides the instance web root (/calendar.json,
 *  no /api/v4). Unmatched URLs throw, so a test that forgot to stub an
 *  endpoint fails loudly. */
function router(routes: {
  mrs?: ReturnType<typeof fakeResponse> | (() => never)
  review?: ReturnType<typeof fakeResponse> | (() => never)
  todos?: ReturnType<typeof fakeResponse>
  calendar?: ReturnType<typeof fakeResponse> | (() => never) | { ok: boolean; status: number; headers: { get: () => null }; json: () => Promise<never> }
  user?: ReturnType<typeof fakeResponse>
}) {
  return vi.fn(async (url: string) => {
    if (url.includes('/api/v4/todos')) {
      if (!routes.todos) throw new Error(`unstubbed todos: ${url}`)
      return routes.todos
    }
    if (url.includes('reviewer_username')) {
      if (!routes.review) throw new Error(`unstubbed review: ${url}`)
      return typeof routes.review === 'function' ? routes.review() : routes.review
    }
    if (url.includes('/api/v4/merge_requests')) {
      if (!routes.mrs) throw new Error(`unstubbed mrs: ${url}`)
      return typeof routes.mrs === 'function' ? routes.mrs() : routes.mrs
    }
    if (url.includes('/calendar.json')) {
      if (!routes.calendar) throw new Error(`unstubbed calendar: ${url}`)
      return typeof routes.calendar === 'function' ? routes.calendar() : routes.calendar
    }
    if (url.endsWith('/api/v4/user')) {
      if (!routes.user) throw new Error(`unstubbed user: ${url}`)
      return routes.user
    }
    throw new Error(`unexpected url: ${url}`)
  })
}

/** Local yyyy-mm-dd of `base` minus `n` days — mirrors gitlab.ts's private
 *  `isoDay`, used here only to build activity-graph window fixtures. */
function daysAgo(base: Date, n: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** An empty prev, spelled out with the two wave-2 fields so a per-section test
 *  can carry it verbatim through a gated/failing section. */
const EMPTY_PREV: GitlabData = { mrs: [], reviewMrs: [], todos: 0, contributions: null }

describe('whoamiGitlab', () => {
  it('returns the username on a 200 /api/v4/user response', async () => {
    const fetchFn = router({ user: fakeResponse({ status: 200, body: { username: 'jcooler' } }) })
    const result = await whoamiGitlab('https://gitlab.com', 'glpat_good', fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: true, identity: 'jcooler' })
    expect(fetchFn).toHaveBeenCalledWith(
      'https://gitlab.com/api/v4/user',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer glpat_good' }) }),
    )
  })

  it('a 401 (bad token) fails with a message that names the status', async () => {
    const fetchFn = router({ user: fakeResponse({ ok: false, status: 401 }) })
    const result = await whoamiGitlab('https://gitlab.com', 'glpat_bad', fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('401')
  })

  it('a 200 with no username is treated as a rejection, not a silent empty identity', async () => {
    const fetchFn = router({ user: fakeResponse({ status: 200, body: {} }) })
    const result = await whoamiGitlab('https://gitlab.com', 'glpat_weird', fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
  })

  it('trims a trailing slash off the instance URL before building the request', async () => {
    const fetchFn = router({ user: fakeResponse({ status: 200, body: { username: 'jon' } }) })
    await whoamiGitlab('https://gitlab.com/', 'glpat_x', fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledWith('https://gitlab.com/api/v4/user', expect.anything())
  })

  it('a non-gitlab.com self-hosted instance keeps its port in the request URL', async () => {
    const fetchFn = router({ user: fakeResponse({ status: 200, body: { username: 'jon' } }) })
    await whoamiGitlab('https://gitlab.example.com:8443', 'glpat_x', fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledWith('https://gitlab.example.com:8443/api/v4/user', expect.anything())
  })
})

describe('fetchGitlab — assigned MRs + to-dos (the two wave-1 sections)', () => {
  it('parses MRs from the merge_requests payload, deriving project from references.full', async () => {
    const fetchFn = router({
      mrs: fakeResponse({
        status: 200,
        body: [
          {
            title: 'Add rate limiting to the ingest API',
            web_url: 'https://gitlab.com/acme/platform/-/merge_requests/204',
            references: { full: 'acme/platform!204' },
          },
        ],
      }),
      todos: fakeResponse({ status: 200, body: [{}, {}] }),
    })

    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', DEFAULT_GITLAB_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.mrs).toEqual([
      {
        title: 'Add rate limiting to the ingest API',
        url: 'https://gitlab.com/acme/platform/-/merge_requests/204',
        project: 'acme/platform',
      },
    ])
    expect(data.todos).toBe(2)
    // The two wave-2 sections are OFF by default (DEFAULT_GITLAB_VIEWS): no
    // request fired for either, so they carry their empty prev.
    expect(data.reviewMrs).toEqual([])
    expect(data.contributions).toBeNull()
  })

  it('falls back to deriving project from web_url when references.full is absent', async () => {
    const fetchFn = router({
      mrs: fakeResponse({
        status: 200,
        body: [
          {
            title: 'Bump vite to 6.x',
            web_url: 'https://gitlab.com/acme/platform/-/merge_requests/207',
          },
        ],
      }),
      todos: fakeResponse({ status: 200, body: [] }),
    })
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', DEFAULT_GITLAB_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.mrs).toEqual([
      {
        title: 'Bump vite to 6.x',
        url: 'https://gitlab.com/acme/platform/-/merge_requests/207',
        project: 'acme/platform',
      },
    ])
  })

  it('counts the todos array length', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [{}, {}, {}, {}, {}] }),
    })
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', DEFAULT_GITLAB_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.todos).toBe(5)
  })

  it('caps the todos count at 20 even if the body somehow carries more', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: Array.from({ length: 25 }, () => ({})) }),
    })
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', DEFAULT_GITLAB_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.todos).toBe(20)
  })

  it('a 403 on todos degrades to the prev count (0 with no prev) while MRs still populate', async () => {
    const fetchFn = router({
      mrs: fakeResponse({
        status: 200,
        body: [{ title: 'MR one', web_url: 'https://gitlab.com/o/r/-/merge_requests/1' }],
      }),
      todos: fakeResponse({ ok: false, status: 403 }),
    })
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', DEFAULT_GITLAB_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.todos).toBe(0)
    expect(data.mrs).toHaveLength(1) // the bad section never blanked this one
  })

  it("a network failure on ONE section keeps that section's prev slice, the other refreshes", async () => {
    const prev: GitlabData = {
      mrs: [{ title: 'Old MR', url: 'https://gitlab.com/o/r/-/merge_requests/7', project: 'o/r' }],
      reviewMrs: [],
      todos: 4,
      contributions: null,
    }
    const fetchFn = router({
      mrs: () => {
        throw new Error('network down') // MR section fails
      },
      todos: fakeResponse({ status: 200, body: [{}] }),
    })

    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', DEFAULT_GITLAB_VIEWS, prev, fetchFn as unknown as typeof fetch)
    expect(data.mrs).toEqual(prev.mrs) // kept verbatim through the failure
    expect(data.todos).toBe(1)
  })

  it('with no prev, a failing section falls back to [] (mrs) and 0 (todos)', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ ok: false, status: 500 }),
      todos: fakeResponse({ ok: false, status: 500 }),
    })
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', DEFAULT_GITLAB_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ mrs: [], reviewMrs: [], todos: 0, contributions: null })
  })

  it('trims a trailing slash off the instance URL before building both requests', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
    })
    await fetchGitlab('https://gitlab.example.com/', 't', 'jon', DEFAULT_GITLAB_VIEWS, null, fetchFn as unknown as typeof fetch)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.every((u) => !u.includes('.com//'))).toBe(true)
    expect(urls).toContain('https://gitlab.example.com/api/v4/merge_requests?scope=assigned_to_me&state=opened&per_page=10')
  })

  it('a non-gitlab.com self-hosted instance keeps its port in both request URLs', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
    })
    await fetchGitlab('https://gitlab.example.com:8443', 't', 'jon', DEFAULT_GITLAB_VIEWS, null, fetchFn as unknown as typeof fetch)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.startsWith('https://gitlab.example.com:8443/api/v4/merge_requests'))).toBe(true)
    expect(urls.some((u) => u.startsWith('https://gitlab.example.com:8443/api/v4/todos'))).toBe(true)
  })
})

describe('fetchGitlab — review-asks section (reviewer_username, parseMrs)', () => {
  it('parses review-requested MRs with the same shape as assigned MRs when reviewAsks is on', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      review: fakeResponse({
        status: 200,
        body: [
          {
            title: 'Review me',
            web_url: 'https://gitlab.com/o/r/-/merge_requests/9',
            references: { full: 'o/r!9' },
          },
        ],
      }),
      todos: fakeResponse({ status: 200, body: [] }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, reviewAsks: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, null, fetchFn as unknown as typeof fetch)
    expect(data.reviewMrs).toEqual([
      { title: 'Review me', url: 'https://gitlab.com/o/r/-/merge_requests/9', project: 'o/r' },
    ])
    // The request carried the username in the reviewer_username query param.
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.includes('reviewer_username=jon'))).toBe(true)
    expect(urls.some((u) => u.includes('scope=all&state=opened'))).toBe(true)
  })

  it('percent-encodes a username with reserved characters in the reviewer_username param', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      review: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, reviewAsks: true }
    await fetchGitlab('https://gitlab.com', 't', 'a b/c', views, null, fetchFn as unknown as typeof fetch)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.includes('reviewer_username=a%20b%2Fc'))).toBe(true)
  })

  it('an isolated review-section failure carries prev.reviewMrs while assigned MRs still land', async () => {
    const prev: GitlabData = {
      mrs: [],
      reviewMrs: [{ title: 'Old review', url: 'https://gitlab.com/o/r/-/merge_requests/1', project: 'o/r' }],
      todos: 0,
      contributions: null,
    }
    const fetchFn = router({
      mrs: fakeResponse({
        status: 200,
        body: [{ title: 'Fresh MR', web_url: 'https://gitlab.com/o/r/-/merge_requests/5', references: { full: 'o/r!5' } }],
      }),
      review: () => {
        throw new Error('network down')
      },
      todos: fakeResponse({ status: 200, body: [] }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, reviewAsks: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.reviewMrs).toEqual(prev.reviewMrs) // kept verbatim through the failure
    expect(data.mrs).toHaveLength(1) // the bad section never blanked this one
  })

  it('with no prev, a review-section non-OK falls back to []', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      review: fakeResponse({ ok: false, status: 500 }),
      todos: fakeResponse({ status: 200, body: [] }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, reviewAsks: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, null, fetchFn as unknown as typeof fetch)
    expect(data.reviewMrs).toEqual([])
  })
})

describe('fetchGitlab — activity graph (calendar.json on the web root)', () => {
  it('shapes a 200 date->count map into a zero-filled, ascending, 112-day window; total = window sum', async () => {
    vi.useFakeTimers()
    try {
      const now = new Date(2026, 7, 10, 12, 0, 0) // 2026-08-10 local
      vi.setSystemTime(now)
      const today = daysAgo(now, 0)
      const inWindow = daysAgo(now, 5)
      const windowStart = daysAgo(now, 111)
      const outside = daysAgo(now, 200) // older than the 112-day window — dropped

      const fetchFn = router({
        mrs: fakeResponse({ status: 200, body: [] }),
        todos: fakeResponse({ status: 200, body: [] }),
        calendar: fakeResponse({
          status: 200,
          body: { [inWindow]: 3, [today]: 2, [windowStart]: 4, [outside]: 9 },
        }),
      })
      const views = { ...DEFAULT_GITLAB_VIEWS, activityGraph: true }
      const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, null, fetchFn as unknown as typeof fetch)

      const contrib = data.contributions
      expect(contrib).not.toBeNull()
      // EVERY day present, ascending, exactly the 112-day window.
      expect(contrib?.days).toHaveLength(112)
      expect(contrib?.days[0]?.date).toBe(windowStart)
      expect(contrib?.days[111]?.date).toBe(today)
      // The window's own counts land; absent dates are zero-filled.
      expect(contrib?.days[0]?.count).toBe(4) // windowStart
      expect(contrib?.days.find((d) => d.date === inWindow)?.count).toBe(3)
      expect(contrib?.days.find((d) => d.date === today)?.count).toBe(2)
      expect(contrib?.days.find((d) => d.date === daysAgo(now, 4))?.count).toBe(0) // zero-filled
      // total sums the WINDOW's counts only — the older `outside` date is dropped.
      expect(contrib?.total).toBe(4 + 3 + 2)
      expect(contrib?.days.some((d) => d.date === outside)).toBe(false)
      // The request rode the instance web root (no /api/v4), carrying the username.
      const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
      expect(urls).toContain('https://gitlab.com/users/jon/calendar.json')
    } finally {
      vi.useRealTimers()
    }
  })

  it('an empty {} map (a user with no contributions) is a valid all-zeros window, not a degrade', async () => {
    const prev: GitlabData = { ...EMPTY_PREV, contributions: { days: [{ date: '2020-01-01', count: 9 }], total: 9 } }
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
      calendar: fakeResponse({ status: 200, body: {} }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, activityGraph: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.contributions?.days).toHaveLength(112)
    expect(data.contributions?.total).toBe(0)
  })

  it('a non-OK (404 — instance without calendar.json) carries prev.contributions', async () => {
    const prev: GitlabData = { ...EMPTY_PREV, contributions: { days: [{ date: '2026-01-01', count: 5 }], total: 5 } }
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
      calendar: fakeResponse({ ok: false, status: 404 }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, activityGraph: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
  })

  it('a network failure carries prev.contributions', async () => {
    const prev: GitlabData = { ...EMPTY_PREV, contributions: { days: [{ date: '2026-01-01', count: 5 }], total: 5 } }
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
      calendar: () => {
        throw new Error('network down')
      },
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, activityGraph: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
  })

  it('a 200 that returns HTML (a non-object body) carries prev.contributions', async () => {
    const prev: GitlabData = { ...EMPTY_PREV, contributions: { days: [{ date: '2026-01-01', count: 5 }], total: 5 } }
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
      calendar: fakeResponse({ status: 200, body: '<!doctype html><html>not json</html>' }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, activityGraph: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
  })

  it('a 200 object whose values are not numbers carries prev.contributions', async () => {
    const prev: GitlabData = { ...EMPTY_PREV, contributions: { days: [{ date: '2026-01-01', count: 5 }], total: 5 } }
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
      calendar: fakeResponse({ status: 200, body: { '2026-08-01': 'lots' } }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, activityGraph: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
  })

  it('a body whose json() throws (parse error) carries prev.contributions', async () => {
    const prev: GitlabData = { ...EMPTY_PREV, contributions: { days: [{ date: '2026-01-01', count: 5 }], total: 5 } }
    const throwingCalendar = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: vi.fn(async () => {
        throw new Error('invalid json')
      }),
    }
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
      calendar: throwingCalendar as unknown as ReturnType<typeof fakeResponse>,
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, activityGraph: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
  })

  it('with no prev, a calendar failure resolves contributions to null', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
      calendar: fakeResponse({ ok: false, status: 404 }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, activityGraph: true }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, null, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toBeNull()
  })
})

describe('fetchGitlab — per-view gating (disabled sections send no request)', () => {
  it('mergeRequests off: no assigned-MR request; prev.mrs carried verbatim', async () => {
    const prev: GitlabData = {
      mrs: [{ title: 'Old MR', url: 'https://gitlab.com/o/r/-/merge_requests/7', project: 'o/r' }],
      reviewMrs: [],
      todos: 0,
      contributions: null,
    }
    const fetchFn = router({
      // mrs intentionally unstubbed — a request there would throw.
      todos: fakeResponse({ status: 200, body: [] }),
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, mergeRequests: false }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.mrs).toEqual(prev.mrs)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.includes('scope=assigned_to_me'))).toBe(false)
  })

  it('reviewAsks off (the default): no reviewer_username request; prev.reviewMrs carried verbatim', async () => {
    const prev: GitlabData = {
      mrs: [],
      reviewMrs: [{ title: 'Old review', url: 'https://gitlab.com/o/r/-/merge_requests/1', project: 'o/r' }],
      todos: 0,
      contributions: null,
    }
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
      // review intentionally unstubbed — a request there would throw.
    })
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', DEFAULT_GITLAB_VIEWS, prev, fetchFn as unknown as typeof fetch)
    expect(data.reviewMrs).toEqual(prev.reviewMrs)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.includes('reviewer_username'))).toBe(false)
  })

  it('todos off: no todos request; prev.todos carried verbatim', async () => {
    const prev: GitlabData = { mrs: [], reviewMrs: [], todos: 6, contributions: null }
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      // todos intentionally unstubbed — a request there would throw.
    })
    const views = { ...DEFAULT_GITLAB_VIEWS, todos: false }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.todos).toBe(6)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.includes('/api/v4/todos'))).toBe(false)
  })

  it('activityGraph off (the default): no calendar request; prev.contributions carried verbatim', async () => {
    const prev: GitlabData = {
      mrs: [],
      reviewMrs: [],
      todos: 0,
      contributions: { days: [{ date: '2026-01-01', count: 9 }], total: 9 },
    }
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
      // calendar intentionally unstubbed — a request there would throw.
    })
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', DEFAULT_GITLAB_VIEWS, prev, fetchFn as unknown as typeof fetch)
    expect(data.contributions).toEqual(prev.contributions)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.includes('/calendar.json'))).toBe(false)
  })

  it('all four views off: NO request at all; every section carries prev verbatim', async () => {
    const prev: GitlabData = {
      mrs: [{ title: 'Old MR', url: 'https://gitlab.com/o/r/-/merge_requests/7', project: 'o/r' }],
      reviewMrs: [{ title: 'Old review', url: 'https://gitlab.com/o/r/-/merge_requests/1', project: 'o/r' }],
      todos: 6,
      contributions: { days: [{ date: '2026-01-01', count: 9 }], total: 9 },
    }
    const fetchFn = router({}) // nothing stubbed — any request throws
    const views = { mergeRequests: false, reviewAsks: false, todos: false, activityGraph: false }
    const data = await fetchGitlab('https://gitlab.com', 't', 'jon', views, prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('DEFAULT_GITLAB_VIEWS', () => {
  it('is the wave-2 default: the two existing sections ON, the two this wave adds OFF', () => {
    expect(DEFAULT_GITLAB_VIEWS).toEqual({
      mergeRequests: true,
      reviewAsks: false,
      todos: true,
      activityGraph: false,
    })
  })
})

describe('gitlabDescriptor', () => {
  it('declares the token connector identity and secret', () => {
    expect(gitlabDescriptor.id).toBe('gitlab')
    expect(gitlabDescriptor.auth).toBe('token')
    expect(gitlabDescriptor.secretFields).toEqual(['token'])
    expect(gitlabDescriptor.identityField).toBe('username')
    expect(gitlabDescriptor.category).toBe('development')
  })

  it('derives the origin from the configured instanceUrl', () => {
    expect(
      gitlabDescriptor.origins({ enabled: true, token: 't', instanceUrl: 'https://gitlab.com', username: 'jon' }),
    ).toEqual(['https://gitlab.com/*'])
  })

  it('the calendar endpoint rides the instance web root, so origins() needs no extra entry — still the single instance origin', () => {
    // calendar.json lives at {instance}/users/{username}/calendar.json — the
    // SAME origin as every /api/v4 request, so the wave-2 activity graph adds
    // no new host to grant. This test pins that: a single origin still covers
    // it, and a future refactor that split the calendar onto another host
    // would fail here.
    expect(
      gitlabDescriptor.origins({ enabled: true, token: 't', instanceUrl: 'https://gitlab.com', username: 'jon' }),
    ).toEqual(['https://gitlab.com/*'])
  })

  it('a non-gitlab.com instance origin keeps its port', () => {
    expect(
      gitlabDescriptor.origins({
        enabled: true,
        token: 't',
        instanceUrl: 'https://gitlab.example.com:8443',
        username: 'jon',
      }),
    ).toEqual(['https://gitlab.example.com:8443/*'])
  })

  it('a non-https instanceUrl degrades to no origins rather than throwing', () => {
    expect(
      gitlabDescriptor.origins({
        enabled: true,
        token: 't',
        instanceUrl: 'http://insecure.example.com',
        username: 'jon',
      }),
    ).toEqual([])
  })

  it('owns origins only for a complete validated connection, independent of enabled', () => {
    expect(
      gitlabDescriptor.ownsOrigins({
        enabled: false,
        token: 't',
        instanceUrl: 'https://gitlab.example.com',
        username: 'jon',
      }),
    ).toBe(true)
    expect(gitlabDescriptor.ownsOrigins({ enabled: true, token: '', instanceUrl: 'https://gitlab.com', username: 'jon' })).toBe(false)
    expect(gitlabDescriptor.ownsOrigins({ enabled: true } as never)).toBe(false)
  })
})
