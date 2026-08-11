// src/services/connectors/jira.test.ts — the Jira connector's service layer:
// normalizeJiraSite (the shared site-shape rule), whoamiJira (email+token+site
// validation, Basic-auth header), fetchJira (TWO independent, per-view-gated
// searches — the assigned list and the new due-soon list — no ETag work, quiet
// degradation), and the descriptor's shape. Same fake-Response/injectable-
// fetchFn idiom as gitlab.test.ts, so nothing here touches a real network.
import { describe, expect, it, vi } from 'vitest'
import {
  fetchJira,
  whoamiJira,
  normalizeJiraSite,
  jiraDescriptor,
  JIRA_SITE_ERROR,
  DEFAULT_JIRA_VIEWS,
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
 *  same dispatch-by-substring idiom as gitlab.test.ts's router. The two
 *  /search/jql searches share a path; the due-soon one is the only one that
 *  asks for the `duedate` field, so that query marker distinguishes it from
 *  the assigned search. Unmatched URLs throw, so a test that forgot to stub an
 *  endpoint fails loudly. */
function router(routes: {
  search?: ReturnType<typeof fakeResponse> | (() => never)
  dueSoon?: ReturnType<typeof fakeResponse> | (() => never)
  myself?: ReturnType<typeof fakeResponse>
}) {
  return vi.fn(async (url: string) => {
    if (url.includes('/rest/api/3/search/jql')) {
      if (url.includes('duedate')) {
        if (!routes.dueSoon) throw new Error(`unstubbed dueSoon: ${url}`)
        return typeof routes.dueSoon === 'function' ? routes.dueSoon() : routes.dueSoon
      }
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

const SITE = 'yoursite.atlassian.net'
const browse = (key: string) => `https://${SITE}/browse/${key}`
/** All views on — for tests that want both searches to fire. */
const ALL_ON = { assigned: true, statusChips: true, dueSoon: true }

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
    const result = await whoamiJira(SITE, 'jon@acme.com', 'tok_123', fetchFn as unknown as typeof fetch)
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
    const result = await whoamiJira(SITE, 'jon@acme.com', 'bad', fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('401')
  })

  it('a 200 with no displayName is treated as a rejection, not a silent empty identity', async () => {
    const fetchFn = router({ myself: fakeResponse({ status: 200, body: {} }) })
    const result = await whoamiJira(SITE, 'jon@acme.com', 't', fetchFn as unknown as typeof fetch)
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

describe('fetchJira — the assigned search', () => {
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
    const data = await fetchJira(SITE, 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.issues).toEqual([
      {
        key: 'AUR-12',
        summary: 'Fix the flaky auth test',
        status: 'In Progress',
        url: browse('AUR-12'),
      },
    ])
    expect(data.counts).toEqual({ 'In Progress': 1 })
    // due-soon is OFF by default: no request, empty slice.
    expect(data.dueSoon).toEqual([])
  })

  it('sends the exact search/jql query string and Basic auth header the brief specifies', async () => {
    const fetchFn = router({ search: fakeResponse({ status: 200, body: { issues: [] } }) })
    await fetchJira(SITE, 'jon@acme.com', 'tok_123', DEFAULT_JIRA_VIEWS, null, fetchFn as unknown as typeof fetch)
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
    const data = await fetchJira(SITE, 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, null, fetchFn as unknown as typeof fetch)
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
    const data = await fetchJira(SITE, 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, null, fetchFn as unknown as typeof fetch)
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
    const data = await fetchJira(SITE, 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.issues).toEqual([
      {
        key: 'AUR-11',
        summary: 'no status field',
        status: 'Unknown',
        url: browse('AUR-11'),
      },
    ])
    expect(data.counts).toEqual({ Unknown: 1 })
  })

  it('an assigned row never carries a `due` field even when its payload includes duedate', async () => {
    const fetchFn = router({
      search: fakeResponse({
        status: 200,
        body: { issues: [{ key: 'AUR-1', fields: { summary: 'a', status: { name: 'To Do' }, duedate: '2026-08-11' } }] },
      }),
    })
    const data = await fetchJira(SITE, 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data.issues[0] && 'due' in data.issues[0]).toBe(false)
  })

  it('a non-OK status keeps the prev slice', async () => {
    const prev: JiraData = {
      issues: [{ key: 'AUR-1', summary: 'old', status: 'To Do', url: browse('AUR-1') }],
      counts: { 'To Do': 1 },
      dueSoon: [],
    }
    const fetchFn = router({ search: fakeResponse({ ok: false, status: 500 }) })
    const data = await fetchJira(SITE, 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
  })

  it('a network failure keeps the prev slice', async () => {
    const prev: JiraData = {
      issues: [{ key: 'AUR-1', summary: 'old', status: 'To Do', url: browse('AUR-1') }],
      counts: { 'To Do': 1 },
      dueSoon: [],
    }
    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })
    const data = await fetchJira(SITE, 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
  })

  it('with no prev, a failing fetch falls back to empty issues/counts/dueSoon', async () => {
    const fetchFn = router({ search: fakeResponse({ ok: false, status: 500 }) })
    const data = await fetchJira(SITE, 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ issues: [], counts: {}, dueSoon: [] })
  })

  it('strips an https:// prefix and trailing slash off the site before building the request', async () => {
    const fetchFn = router({ search: fakeResponse({ status: 200, body: { issues: [] } }) })
    await fetchJira('https://yoursite.atlassian.net/', 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, null, fetchFn as unknown as typeof fetch)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.startsWith('https://yoursite.atlassian.net/rest/api/3/search/jql'))).toBe(true)
    expect(urls.every((u) => !u.includes('.net//'))).toBe(true)
  })
})

describe('fetchJira — the due-soon search', () => {
  it('parses duedate into a `due` field (yyyy-mm-dd) on due-soon rows', async () => {
    const fetchFn = router({
      search: fakeResponse({ status: 200, body: { issues: [] } }),
      dueSoon: fakeResponse({
        status: 200,
        body: {
          issues: [
            { key: 'AUR-20', fields: { summary: 'Due tomorrow', status: { name: 'To Do' }, duedate: '2026-08-11' } },
          ],
        },
      }),
    })
    const data = await fetchJira(SITE, 'jon@acme.com', 't', ALL_ON, null, fetchFn as unknown as typeof fetch)
    expect(data.dueSoon).toEqual([
      { key: 'AUR-20', summary: 'Due tomorrow', status: 'To Do', url: browse('AUR-20'), due: '2026-08-11' },
    ])
  })

  it('keeps a due-soon row whose duedate is absent, malformed, or non-string — but WITHOUT a `due` field', async () => {
    const fetchFn = router({
      search: fakeResponse({ status: 200, body: { issues: [] } }),
      dueSoon: fakeResponse({
        status: 200,
        body: {
          issues: [
            { key: 'AUR-21', fields: { summary: 'No duedate', status: { name: 'To Do' } } },
            { key: 'AUR-22', fields: { summary: 'Malformed duedate', status: { name: 'To Do' }, duedate: 'soon' } },
            { key: 'AUR-23', fields: { summary: 'Numeric duedate', status: { name: 'To Do' }, duedate: 20260811 } },
          ],
        },
      }),
    })
    const data = await fetchJira(SITE, 'jon@acme.com', 't', ALL_ON, null, fetchFn as unknown as typeof fetch)
    expect(data.dueSoon.map((i) => i.key)).toEqual(['AUR-21', 'AUR-22', 'AUR-23'])
    // Every row kept, none carrying a `due` key.
    expect(data.dueSoon.every((i) => !('due' in i))).toBe(true)
  })

  it('sends the exact due-soon jql (encodeURIComponent of the brief string) + duedate field + Basic auth', async () => {
    const fetchFn = router({
      search: fakeResponse({ status: 200, body: { issues: [] } }),
      dueSoon: fakeResponse({ status: 200, body: { issues: [] } }),
    })
    await fetchJira(SITE, 'jon@acme.com', 'tok_123', ALL_ON, null, fetchFn as unknown as typeof fetch)
    const jql = encodeURIComponent('assignee=currentUser() AND resolution=Unresolved AND due <= 7d ORDER BY due ASC')
    expect(fetchFn).toHaveBeenCalledWith(
      `https://yoursite.atlassian.net/rest/api/3/search/jql?jql=${jql}&fields=summary,status,duedate&maxResults=10`,
      expect.objectContaining({ headers: { Authorization: 'Basic ' + btoa('jon@acme.com:tok_123') } }),
    )
  })
})

describe('fetchJira — the two searches are independent', () => {
  it('an assigned failure keeps prev.issues+counts while due-soon still lands', async () => {
    const prev: JiraData = {
      issues: [{ key: 'AUR-1', summary: 'old', status: 'To Do', url: browse('AUR-1') }],
      counts: { 'To Do': 1 },
      dueSoon: [],
    }
    const fetchFn = router({
      search: fakeResponse({ ok: false, status: 500 }), // assigned fails
      dueSoon: fakeResponse({
        status: 200,
        body: {
          issues: [{ key: 'AUR-9', fields: { summary: 'due soon', status: { name: 'In Progress' }, duedate: '2026-08-12' } }],
        },
      }),
    })
    const data = await fetchJira(SITE, 'jon@acme.com', 't', ALL_ON, prev, fetchFn as unknown as typeof fetch)
    expect(data.issues).toEqual(prev.issues) // assigned kept verbatim
    expect(data.counts).toEqual(prev.counts) // derived from assigned, so also kept
    expect(data.dueSoon).toEqual([
      { key: 'AUR-9', summary: 'due soon', status: 'In Progress', url: browse('AUR-9'), due: '2026-08-12' },
    ])
  })

  it('a due-soon failure keeps prev.dueSoon while the assigned list still refreshes', async () => {
    const prev: JiraData = {
      issues: [],
      counts: {},
      dueSoon: [{ key: 'AUR-5', summary: 'old due', status: 'To Do', url: browse('AUR-5'), due: '2026-08-09' }],
    }
    const fetchFn = router({
      search: fakeResponse({
        status: 200,
        body: { issues: [{ key: 'AUR-2', fields: { summary: 'fresh assigned', status: { name: 'To Do' } } }] },
      }),
      dueSoon: () => {
        throw new Error('network down')
      },
    })
    const data = await fetchJira(SITE, 'jon@acme.com', 't', ALL_ON, prev, fetchFn as unknown as typeof fetch)
    expect(data.dueSoon).toEqual(prev.dueSoon) // due-soon kept verbatim
    expect(data.issues).toEqual([{ key: 'AUR-2', summary: 'fresh assigned', status: 'To Do', url: browse('AUR-2') }])
    expect(data.counts).toEqual({ 'To Do': 1 }) // recomputed from the fresh assigned issues
  })
})

describe('fetchJira — per-view gating', () => {
  // Fix wave, Finding I4: the assigned search now fires when EITHER
  // `assigned` OR `statusChips` is on (counts are derived from it) — so
  // testing "assigned off" in isolation from statusChips no longer
  // distinguishes a real gate; this case now needs statusChips OFF too.
  it('assigned AND statusChips both off: no assigned request; prev.issues+counts carried (counts NOT recomputed)', async () => {
    const prev: JiraData = {
      issues: [{ key: 'AUR-1', summary: 'old', status: 'To Do', url: browse('AUR-1') }],
      counts: { 'To Do': 1 },
      dueSoon: [],
    }
    const fetchFn = router({
      dueSoon: fakeResponse({ status: 200, body: { issues: [] } }),
      // search intentionally unstubbed — a request there would throw.
    })
    const views = { assigned: false, statusChips: false, dueSoon: true }
    const data = await fetchJira(SITE, 'jon@acme.com', 't', views, prev, fetchFn as unknown as typeof fetch)
    expect(data.issues).toEqual(prev.issues)
    expect(data.counts).toEqual(prev.counts)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    // The assigned search is the one WITHOUT the duedate field — assert none fired.
    expect(urls.some((u) => u.includes('/rest/api/3/search/jql') && !u.includes('duedate'))).toBe(false)
  })

  // Fix wave, Finding I4 (Jon-ruled): the case this test used to pin (assigned
  // off, statusChips on → no request, counts frozen forever) was the BUG.
  // statusChips derives its counts from the assigned search, so a
  // chips-only card must still fetch — same "fetch gating keys on DATA
  // needs, not sections 1:1" principle as vercel.ts's own statusSummary.
  // Falsifies the fix: before it, this request never fires and the test
  // fails (fetchFn throws on the unstubbed `search` route).
  it('assigned off but statusChips ON: the assigned search STILL fires (I4 fix — chips need fresh data too)', async () => {
    const fetchFn = router({
      search: fakeResponse({
        status: 200,
        body: { issues: [{ key: 'AUR-7', fields: { summary: 'fresh', status: { name: 'To Do' } } }] },
      }),
    })
    const views = { assigned: false, statusChips: true, dueSoon: false }
    const data = await fetchJira(SITE, 'jon@acme.com', 't', views, null, fetchFn as unknown as typeof fetch)
    // The service returns the fetched issues regardless (the widget is the
    // one that re-gates the RENDERED list on `views.assigned` — see
    // JiraWidget.tsx's own `views.assigned ? ... : []`); counts are what a
    // chips-only card actually needs, and they land.
    expect(data.counts).toEqual({ 'To Do': 1 })
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.includes('/rest/api/3/search/jql') && !u.includes('duedate'))).toBe(true)
  })

  it('dueSoon off (the default): no due-soon request; prev.dueSoon carried', async () => {
    const prev: JiraData = {
      issues: [],
      counts: {},
      dueSoon: [{ key: 'AUR-5', summary: 'old', status: 'To Do', url: browse('AUR-5'), due: '2026-08-09' }],
    }
    const fetchFn = router({
      search: fakeResponse({ status: 200, body: { issues: [] } }),
      // dueSoon intentionally unstubbed — a request there would throw.
    })
    const data = await fetchJira(SITE, 'jon@acme.com', 't', DEFAULT_JIRA_VIEWS, prev, fetchFn as unknown as typeof fetch)
    expect(data.dueSoon).toEqual(prev.dueSoon)
    const urls = (fetchFn.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(urls.some((u) => u.includes('duedate'))).toBe(false)
  })

  // Fix wave, Finding I4: with statusChips now ALSO an assigned-fetch
  // trigger (see the "assigned off but statusChips ON" test above), the
  // whole-prev-carried case needs ALL THREE views off — not just assigned
  // and dueSoon — to genuinely issue zero requests.
  it('assigned, statusChips, AND dueSoon all off: NO request; whole prev carried verbatim', async () => {
    const prev: JiraData = {
      issues: [{ key: 'AUR-1', summary: 'old', status: 'To Do', url: browse('AUR-1') }],
      counts: { 'To Do': 1 },
      dueSoon: [{ key: 'AUR-5', summary: 'old', status: 'To Do', url: browse('AUR-5'), due: '2026-08-09' }],
    }
    const fetchFn = router({}) // nothing stubbed — any request throws
    const views = { assigned: false, statusChips: false, dueSoon: false }
    const data = await fetchJira(SITE, 'jon@acme.com', 't', views, prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('statusChips does not gate a request — counts are always derived from the assigned issues', async () => {
    const fetchFn = router({
      search: fakeResponse({
        status: 200,
        body: { issues: [{ key: 'AUR-1', fields: { summary: 'a', status: { name: 'To Do' } } }] },
      }),
    })
    // statusChips OFF, but assigned ON — the service still computes counts; the
    // chip toggle is a widget-render concern (like vercel's statusSummary), not
    // a fetch gate.
    const views = { assigned: true, statusChips: false, dueSoon: false }
    const data = await fetchJira(SITE, 'jon@acme.com', 't', views, null, fetchFn as unknown as typeof fetch)
    expect(data.counts).toEqual({ 'To Do': 1 })
  })
})

describe('fetchJira — site normalization', () => {
  it('an invalid site shape keeps the whole prev slice without attempting a request', async () => {
    const prev: JiraData = {
      issues: [{ key: 'AUR-1', summary: 'old', status: 'To Do', url: browse('AUR-1') }],
      counts: { 'To Do': 1 },
      dueSoon: [{ key: 'AUR-5', summary: 'old', status: 'To Do', url: browse('AUR-5'), due: '2026-08-09' }],
    }
    const fetchFn = router({})
    const data = await fetchJira('not-a-jira-site.com', 'jon@acme.com', 't', ALL_ON, prev, fetchFn as unknown as typeof fetch)
    expect(data).toEqual(prev) // whole fallback — both sections
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('with no prev, an invalid site shape falls back to the empty shape (no request)', async () => {
    const fetchFn = router({})
    const data = await fetchJira('not-a-jira-site.com', 'jon@acme.com', 't', ALL_ON, null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ issues: [], counts: {}, dueSoon: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('DEFAULT_JIRA_VIEWS', () => {
  it('is the wave-2 default: existing sections ON, the due-soon section this wave adds OFF', () => {
    expect(DEFAULT_JIRA_VIEWS).toEqual({ assigned: true, statusChips: true, dueSoon: false })
  })
})

describe('jiraDescriptor', () => {
  it('declares the token connector identity and secret', () => {
    expect(jiraDescriptor.id).toBe('jira')
    expect(jiraDescriptor.auth).toBe('token')
    expect(jiraDescriptor.ttlMs).toBe(10 * 60_000)
    expect(jiraDescriptor.secretFields).toEqual(['apiToken'])
    expect(jiraDescriptor.identityField).toBe('displayName')
    expect(jiraDescriptor.category).toBe('development')
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
