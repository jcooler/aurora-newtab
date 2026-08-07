// src/services/connectors/gitlab.test.ts — the GitLab connector's service
// layer: whoamiGitlab (token + instance validation), fetchGitlab (two
// independent sections, no ETag work, quiet degradation), the instance-url ->
// api-base derivation (trailing slash trim, non-gitlab.com instances keep
// their port), and the descriptor's shape. Same fake-Response/injectable-
// fetchFn idiom as github.test.ts, so nothing here touches a real network.
import { describe, expect, it, vi } from 'vitest'
import { fetchGitlab, whoamiGitlab, gitlabDescriptor, type GitlabData } from './gitlab'

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
 *  same dispatch-by-substring idiom as github.test.ts's router. Unmatched
 *  URLs throw, so a test that forgot to stub an endpoint fails loudly. */
function router(routes: {
  mrs?: ReturnType<typeof fakeResponse> | (() => never)
  todos?: ReturnType<typeof fakeResponse>
  user?: ReturnType<typeof fakeResponse>
}) {
  return vi.fn(async (url: string) => {
    if (url.includes('/api/v4/todos')) {
      if (!routes.todos) throw new Error(`unstubbed todos: ${url}`)
      return routes.todos
    }
    if (url.includes('/api/v4/merge_requests')) {
      if (!routes.mrs) throw new Error(`unstubbed mrs: ${url}`)
      return typeof routes.mrs === 'function' ? routes.mrs() : routes.mrs
    }
    if (url.endsWith('/api/v4/user')) {
      if (!routes.user) throw new Error(`unstubbed user: ${url}`)
      return routes.user
    }
    throw new Error(`unexpected url: ${url}`)
  })
}

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

describe('fetchGitlab — two independent sections', () => {
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

    const data = await fetchGitlab('https://gitlab.com', 't', null, fetchFn as unknown as typeof fetch)
    expect(data.mrs).toEqual([
      {
        title: 'Add rate limiting to the ingest API',
        url: 'https://gitlab.com/acme/platform/-/merge_requests/204',
        project: 'acme/platform',
      },
    ])
    expect(data.todos).toBe(2)
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
    const data = await fetchGitlab('https://gitlab.com', 't', null, fetchFn as unknown as typeof fetch)
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
    const data = await fetchGitlab('https://gitlab.com', 't', null, fetchFn as unknown as typeof fetch)
    expect(data.todos).toBe(5)
  })

  it('caps the todos count at 20 even if the body somehow carries more', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: Array.from({ length: 25 }, () => ({})) }),
    })
    const data = await fetchGitlab('https://gitlab.com', 't', null, fetchFn as unknown as typeof fetch)
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
    const data = await fetchGitlab('https://gitlab.com', 't', null, fetchFn as unknown as typeof fetch)
    expect(data.todos).toBe(0)
    expect(data.mrs).toHaveLength(1) // the bad section never blanked this one
  })

  it("a network failure on ONE section keeps that section's prev slice, the other refreshes", async () => {
    const prev: GitlabData = {
      mrs: [{ title: 'Old MR', url: 'https://gitlab.com/o/r/-/merge_requests/7', project: 'o/r' }],
      todos: 4,
    }
    const fetchFn = router({
      mrs: () => {
        throw new Error('network down') // MR section fails
      },
      todos: fakeResponse({ status: 200, body: [{}] }),
    })

    const data = await fetchGitlab('https://gitlab.com', 't', prev, fetchFn as unknown as typeof fetch)
    expect(data.mrs).toEqual(prev.mrs) // kept verbatim through the failure
    expect(data.todos).toBe(1)
  })

  it('with no prev, a failing section falls back to [] (mrs) and 0 (todos)', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ ok: false, status: 500 }),
      todos: fakeResponse({ ok: false, status: 500 }),
    })
    const data = await fetchGitlab('https://gitlab.com', 't', null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ mrs: [], todos: 0 })
  })

  it('trims a trailing slash off the instance URL before building both requests', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
    })
    await fetchGitlab('https://gitlab.example.com/', 't', null, fetchFn as unknown as typeof fetch)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.every((u) => !u.includes('.com//'))).toBe(true)
    expect(urls).toContain('https://gitlab.example.com/api/v4/merge_requests?scope=assigned_to_me&state=opened&per_page=10')
  })

  it('a non-gitlab.com self-hosted instance keeps its port in both request URLs', async () => {
    const fetchFn = router({
      mrs: fakeResponse({ status: 200, body: [] }),
      todos: fakeResponse({ status: 200, body: [] }),
    })
    await fetchGitlab('https://gitlab.example.com:8443', 't', null, fetchFn as unknown as typeof fetch)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.startsWith('https://gitlab.example.com:8443/api/v4/merge_requests'))).toBe(true)
    expect(urls.some((u) => u.startsWith('https://gitlab.example.com:8443/api/v4/todos'))).toBe(true)
  })
})

describe('gitlabDescriptor', () => {
  it('declares the token connector identity and secret', () => {
    expect(gitlabDescriptor.id).toBe('gitlab')
    expect(gitlabDescriptor.auth).toBe('token')
    expect(gitlabDescriptor.secretFields).toEqual(['token'])
    expect(gitlabDescriptor.identityField).toBe('username')
  })

  it('derives the origin from the configured instanceUrl', () => {
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
})
