// src/services/connectors/jira.test.ts — the Jira connector's service layer:
// normalizeJiraSite (the shared site-shape rule), whoamiJira (email+token+site
// validation, Basic-auth header), fetchJira (the one /search/jql section, no
// ETag work, quiet degradation), and the descriptor's shape. Same
// fake-Response/injectable-fetchFn idiom as gitlab.test.ts, so nothing here
// touches a real network.
import { describe, expect, it, vi } from 'vitest'
import {
  fetchJira,
  whoamiJira,
  normalizeJiraSite,
  jiraDescriptor,
  JIRA_SITE_ERROR,
  type JiraData,
} from './jira'

/** Minimal fetch Response stand-in — only the members getJson reads (ok,
 *  status, headers.get('etag'), json()). Cast through `unknown` at each
 *  fetchFn call site, same as gitlab.test.ts. */
function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => opts.body ?? {}),
  }
}

/** Routes a fetch call to a fake Response by which endpoint its URL names —
 *  same dispatch-by-substring idiom as gitlab.test.ts's router. Unmatched
 *  URLs throw, so a test that forgot to stub an endpoint fails loudly. */
function router(routes: {
  search?: ReturnType<typeof fakeResponse> | (() => never)
  myself?: ReturnType<typeof fakeResponse>
}) {
  return vi.fn(async (url: string) => {
    if (url.includes('/rest/api/3/search/jql')) {
      if (!routes.search) throw new Error(`unstubbed search: ${url}`)
      return typeof routes.search === 'function' ? routes.search() : routes.search
    }
    if (url.includes('/rest/api/3/myself')) {
      if (!routes.myself) throw new Error(`unstubbed myself: ${url}`)
      return routes.myself
    }
    throw new Error(`unexpected url: ${url}`)
  })
}

describe('normalizeJiraSite — the shared site-shape rule', () => {
  it('accepts a bare *.atlassian.net domain unchanged', () => {
    expect(normalizeJiraSite('yoursite.atlassian.net')).toBe('yoursite.atlassian.net')
  })

  it('strips an accidental https:// prefix', () => {
    expect(normalizeJiraSite('https://yoursite.atlassian.net')).toBe('yoursite.atlassian.net')
  })

  it('strips a trailing slash', () => {
    expect(normalizeJiraSite('yoursite.atlassian.net/')).toBe('yoursite.atlassian.net')
  })

  it('strips both an https:// prefix and a trailing slash together', () => {
    expect(normalizeJiraSite('https://yoursite.atlassian.net/')).toBe('yoursite.atlassian.net')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeJiraSite('  yoursite.atlassian.net  ')).toBe('yoursite.atlassian.net')
  })

  it('is case-insensitive on the atlassian.net suffix', () => {
    expect(normalizeJiraSite('YourSite.Atlassian.Net')).toBe('YourSite.Atlassian.Net')
  })

  it('throws the exact site-format message for a non-atlassian.net domain', () => {
    expect(() => normalizeJiraSite('yoursite.com')).toThrow(JIRA_SITE_ERROR)
  })

  it('throws the exact site-format message for an email typed into the site field', () => {
    expect(() => normalizeJiraSite('jon@yoursite.atlassian.net')).toThrow(JIRA_SITE_ERROR)
  })

  it('throws the exact site-format message for an empty string', () => {
    expect(() => normalizeJiraSite('')).toThrow(JIRA_SITE_ERROR)
  })
})

describe('whoamiJira', () => {
  it('returns the displayName on a 200 /rest/api/3/myself response, sending Basic auth', async () => {
    const fetchFn = router({ myself: fakeResponse({ status: 200, body: { displayName: 'Jon Cooler' } }) })
    const result = await whoamiJira(
      'yoursite.atlassian.net',
      'jon@acme.com',
      'tok_123',
      fetchFn as unknown as typeof fetch,
    )
    expect(result).toEqual({ ok: true, identity: 'Jon Cooler' })
    expect(fetchFn).toHaveBeenCalledWith(
      'https://yoursite.atlassian.net/rest/api/3/myself',
      expect.objectContaining({
        headers: { Authorization: 'Basic ' + btoa('jon@acme.com:tok_123') },
      }),
    )
  })

  it('a 401 (bad token) fails with a message that names the status', async () => {
    const fetchFn = router({ myself: fakeResponse({ ok: false, status: 401 }) })
    const result = await whoamiJira('yoursite.atlassian.net', 'jon@acme.com', 'bad', fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('401')
  })

  it('a 200 with no displayName is treated as a rejection, not a silent empty identity', async () => {
    const fetchFn = router({ myself: fakeResponse({ status: 200, body: {} }) })
    const result = await whoamiJira('yoursite.atlassian.net', 'jon@acme.com', 't', fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
  })

  it('a malformed site is rejected synchronously with the exact copy, no request attempted', async () => {
    const fetchFn = router({})
    const result = await whoamiJira('not-a-jira-site.com', 'jon@acme.com', 't', fetchFn as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, message: JIRA_SITE_ERROR })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('strips an https:// prefix and trailing slash off the site before building the request', async () => {
    const fetchFn = router({ myself: fakeResponse({ status: 200, body: { displayName: 'Jon' } }) })
    await whoamiJira('https://yoursite.atlassian.net/', 'jon@acme.com', 't', fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledWith('https://yoursite.atlassian.net/rest/api/3/myself', expect.anything())
  })
})

describe('fetchJira — the one /search/jql section', () => {
  it('parses issues from the search/jql payload (key, fields.summary, fields.status.name), building the browse url', async () => {
    const fetchFn = router({
      search: fakeResponse({
        status: 200,
        body: {
          issues: [
            { key: 'AUR-12', fields: { summary: 'Fix the flaky auth test', status: { name: 'In Progress' } } },
          ],
        },
      }),
    })
    const data = await fetchJira('yoursite.atlassian.net', 'jon@acme.com', 't', null, fetchFn as unknown as typeof fetch)
    expect(data.issues).toEqual([
      {
        key: 'AUR-12',
        summary: 'Fix the flaky auth test',
        status: 'In Progress',
        url: 'https://yoursite.atlassian.net/browse/AUR-12',
      },
    ])
    expect(data.counts).toEqual({ 'In Progress': 1 })
  })

  it('sends the exact search/jql query string and Basic auth header the brief specifies', async () => {
    const fetchFn = router({ search: fakeResponse({ status: 200, body: { issues: [] } }) })
    await fetchJira('yoursite.atlassian.net', 'jon@acme.com', 'tok_123', null, fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://yoursite.atlassian.net/rest/api/3/search/jql?jql=assignee%3DcurrentUser()%20AND%20resolution%3DUnresolved%20ORDER%20BY%20updated%20DESC&fields=summary,status&maxResults=10',
      expect.objectContaining({
        headers: { Authorization: 'Basic ' + btoa('jon@acme.com:tok_123') },
      }),
    )
  })

  it('counts issues by status, insertion-ordered from the issues array', async () => {
    const fetchFn = router({
      search: fakeResponse({
        status: 200,
        body: {
          issues: [
            { key: 'AUR-1', fields: { summary: 'a', status: { name: 'In Progress' } } },
            { key: 'AUR-2', fields: { summary: 'b', status: { name: 'To Do' } } },
            { key: 'AUR-3', fields: { summary: 'c', status: { name: 'In Progress' } } },
            { key: 'AUR-4', fields: { summary: 'd', status: { name: 'To Do' } } },
            { key: 'AUR-5', fields: { summary: 'e', status: { name: 'To Do' } } },
          ],
        },
      }),
    })
    const data = await fetchJira('yoursite.atlassian.net', 'jon@acme.com', 't', null, fetchFn as unknown as typeof fetch)
    expect(data.counts).toEqual({ 'In Progress': 2, 'To Do': 3 })
    // Insertion order: 'In Progress' was the FIRST status seen in the issues
    // array, so it is the first key, even though 'To Do' ends with a higher
    // count.
    expect(Object.keys(data.counts)).toEqual(['In Progress', 'To Do'])
  })

  it('skips an issue missing a key or a summary', async () => {
    const fetchFn = router({
      search: fakeResponse({
        status: 200,
        body: {
          issues: [
            { fields: { summary: 'no key', status: { name: 'To Do' } } },
            { key: 'AUR-9', fields: { status: { name: 'To Do' } } }, // no summary
            { key: 'AUR-10', fields: { summary: 'keeper', status: { name: 'To Do' } } },
          ],
        },
      }),
    })
    const data = await fetchJira('yoursite.atlassian.net', 'jon@acme.com', 't', null, fetchFn as unknown as typeof fetch)
    expect(data.issues).toHaveLength(1)
    expect(data.issues[0]?.key).toBe('AUR-10')
  })

  it('defaults a missing/non-string status name to "Unknown" rather than skipping the row', async () => {
    const fetchFn = router({
      search: fakeResponse({
        status: 200,
        body: { issues: [{ key: 'AUR-11', fields: { summary: 'no status field' } }] },
      }),
    })
    const data = await fetchJira('yoursite.atlassian.net', 'jon@acme.com', 't', null, fetchFn as unknown as typeof fetch)
    expect(data.issues).toEqual([
      {
        key: 'AUR-11',
        summary: 'no status field',
        status: 'Unknown',
        url: 'https://yoursite.atlassian.net/browse/AUR-11',
      },
    ])
    expect(data.counts).toEqual({ Unknown: 1 })
  })

  it('a non-OK status keeps the prev slice', async () => {
    const prev: JiraData = {
      issues: [{ key: 'AUR-1', summary: 'old', status: 'To Do', url: 'https://yoursite.atlassian.net/browse/AUR-1' }],
      counts: { 'To Do': 1 },
    }
    const fetchFn = router({ search: fakeResponse({ ok: false, status: 500 }) })
    const data = await fetchJira('yoursite.atlassian.net', 'jon@acme.com', 't', prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
  })

  it('a network failure keeps the prev slice', async () => {
    const prev: JiraData = {
      issues: [{ key: 'AUR-1', summary: 'old', status: 'To Do', url: 'https://yoursite.atlassian.net/browse/AUR-1' }],
      counts: { 'To Do': 1 },
    }
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    const data = await fetchJira('yoursite.atlassian.net', 'jon@acme.com', 't', prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
  })

  it('with no prev, a failing fetch falls back to empty issues/counts', async () => {
    const fetchFn = router({ search: fakeResponse({ ok: false, status: 500 }) })
    const data = await fetchJira('yoursite.atlassian.net', 'jon@acme.com', 't', null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ issues: [], counts: {} })
  })

  it('an invalid site shape keeps the prev slice without attempting a request', async () => {
    const prev: JiraData = {
      issues: [{ key: 'AUR-1', summary: 'old', status: 'To Do', url: 'https://yoursite.atlassian.net/browse/AUR-1' }],
      counts: { 'To Do': 1 },
    }
    const fetchFn = router({})
    const data = await fetchJira('not-a-jira-site.com', 'jon@acme.com', 't', prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('strips an https:// prefix and trailing slash off the site before building the request', async () => {
    const fetchFn = router({ search: fakeResponse({ status: 200, body: { issues: [] } }) })
    await fetchJira('https://yoursite.atlassian.net/', 'jon@acme.com', 't', null, fetchFn as unknown as typeof fetch)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.startsWith('https://yoursite.atlassian.net/rest/api/3/search/jql'))).toBe(true)
    expect(urls.every((u) => !u.includes('.net//'))).toBe(true)
  })
})

describe('jiraDescriptor', () => {
  it('declares the token connector identity and secret', () => {
    expect(jiraDescriptor.id).toBe('jira')
    expect(jiraDescriptor.auth).toBe('token')
    expect(jiraDescriptor.ttlMs).toBe(10 * 60_000)
    expect(jiraDescriptor.secretFields).toEqual(['apiToken'])
    expect(jiraDescriptor.identityField).toBe('displayName')
  })

  it('derives the origin from the configured site', () => {
    expect(
      jiraDescriptor.origins({
        enabled: true,
        email: 'jon@acme.com',
        apiToken: 't',
        site: 'yoursite.atlassian.net',
        displayName: 'Jon',
      }),
    ).toEqual(['https://yoursite.atlassian.net/*'])
  })

  it('normalizes an https:// prefix / trailing slash before deriving the origin', () => {
    expect(
      jiraDescriptor.origins({
        enabled: true,
        email: 'jon@acme.com',
        apiToken: 't',
        site: 'https://yoursite.atlassian.net/',
        displayName: 'Jon',
      }),
    ).toEqual(['https://yoursite.atlassian.net/*'])
  })

  it('a non-atlassian.net site degrades to no origins rather than throwing', () => {
    expect(
      jiraDescriptor.origins({
        enabled: true,
        email: 'jon@acme.com',
        apiToken: 't',
        site: 'insecure.example.com',
        displayName: 'Jon',
      }),
    ).toEqual([])
  })
})
