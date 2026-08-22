import { describe, expect, it, vi } from 'vitest'
import {
  fetchSentryIssues,
  isSentryData,
  isSentryDataForRegion,
  sentryBaseUrl,
  sentryDescriptor,
  sentryItemLimit,
  sentryProjectSlugs,
  sentryRegion,
  validateSentryConnection,
  type SentryData,
  type SentryIssue,
} from './sentry'

function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown; jsonError?: Error }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => {
      if (opts.jsonError) throw opts.jsonError
      return opts.body ?? []
    }),
  }
}

function rawIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: '100',
    title: 'Checkout crashes on submit',
    shortId: 'SHOP-100',
    project: { id: '9', name: 'Shop', slug: 'shop' },
    level: 'error',
    count: '12',
    userCount: 3,
    firstSeen: '2026-08-21T00:00:00Z',
    lastSeen: '2026-08-22T12:00:00Z',
    stats: { '24h': [[100, 1], [200, 2], [300, 6], [400, 8]] },
    permalink: 'https://us.sentry.io/issues/100/',
    priority: 'high',
    status: 'unresolved',
    statusDetails: { type: 'regression' },
    ...overrides,
  }
}

function config(overrides: Record<string, unknown> = {}) {
  return {
    region: 'us' as const,
    organization: 'acme',
    token: 'sentry-token',
    projectSlugs: [] as string[],
    ...overrides,
  }
}

function fetchCalls(fetchFn: ReturnType<typeof vi.fn>): Array<[string, RequestInit]> {
  return fetchFn.mock.calls as unknown as Array<[string, RequestInit]>
}

describe('Sentry region and descriptor boundary', () => {
  it('maps only global, US, and DE to fixed official HTTPS hosts', () => {
    expect(sentryBaseUrl('global')).toBe('https://sentry.io')
    expect(sentryBaseUrl('us')).toBe('https://us.sentry.io')
    expect(sentryBaseUrl('de')).toBe('https://de.sentry.io')
    expect(sentryRegion('self-hosted.example.com')).toBe('global')
    expect(sentryBaseUrl('self-hosted.example.com')).toBe('https://sentry.io')
  })

  it('normalizes bounded project selections and item limits without changing order', () => {
    expect(sentryProjectSlugs({ projectSlugs: [' web ', 'api', 'web', '', ' api '] })).toEqual(['web', 'api'])
    expect(sentryItemLimit({ itemLimit: 3 })).toBe(3)
    expect(sentryItemLimit({ itemLimit: 10 })).toBe(10)
    expect(sentryItemLimit({ itemLimit: 11 })).toBe(6)
  })

  it('derives exactly one selected-region origin and redacts the token from backup', () => {
    const connected = {
      enabled: true,
      token: 'secret',
      organization: 'acme',
      region: 'de' as const,
      projectSlugs: ['web'],
      itemLimit: 8,
    }
    expect(sentryDescriptor.origins(connected)).toEqual(['https://de.sentry.io/*'])
    expect(sentryDescriptor.ownsOrigins(connected)).toBe(true)
    expect(sentryDescriptor.redactForBackup?.(connected)).toEqual({ enabled: true, region: 'de', itemLimit: 8 })
  })
})

describe('fetchSentryIssues request boundary', () => {
  it('encodes the organization and exact query while preserving repeated project order', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: [] }))

    const result = await fetchSentryIssues(
      config({ organization: 'acme / ops', token: ' secret ', projectSlugs: ['web api', 'mobile', 'web api'] }),
      fetchFn as unknown as typeof fetch,
    )

    expect(result).toEqual({ ok: true, data: { issues: [] } })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchCalls(fetchFn)[0]!
    expect(url).toBe(
      'https://us.sentry.io/api/0/organizations/acme%20%2F%20ops/issues/?query=is%3Aunresolved&sort=trends&statsPeriod=24h&groupStatsPeriod=24h&limit=25&project=web+api&project=mobile',
    )
    expect(init?.headers).toEqual({ Authorization: 'Bearer secret' })
  })

  it('uses the selected region and no project parameter when selection is empty', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: [] }))

    await fetchSentryIssues(config({ region: 'de', projectSlugs: [] }), fetchFn as unknown as typeof fetch)

    const [url] = fetchCalls(fetchFn)[0]!
    expect(url).toBe(
      'https://de.sentry.io/api/0/organizations/acme/issues/?query=is%3Aunresolved&sort=trends&statsPeriod=24h&groupStatsPeriod=24h&limit=25',
    )
  })

  it('rejects missing credentials without issuing a request', async () => {
    const fetchFn = vi.fn()

    const result = await fetchSentryIssues(config({ token: ' ' }), fetchFn as unknown as typeof fetch)

    expect(result).toEqual({ ok: false, status: null, message: 'Sentry connection is incomplete.' })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('fetchSentryIssues normalization', () => {
  it('normalizes the useful issue fields and deterministic facts', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: [rawIssue()] }))

    const result = await fetchSentryIssues(config(), fetchFn as unknown as typeof fetch)

    expect(result).toEqual({
      ok: true,
      data: {
        issues: [{
          id: '100',
          title: 'Checkout crashes on submit',
          shortId: 'SHOP-100',
          project: { id: '9', name: 'Shop', slug: 'shop' },
          level: 'error',
          severity: 'high',
          count: 12,
          userCount: 3,
          firstSeen: '2026-08-21T00:00:00.000Z',
          lastSeen: '2026-08-22T12:00:00.000Z',
          stats24h: [[100, 1], [200, 2], [300, 6], [400, 8]],
          events24h: 17,
          trend: 'rising',
          isRegression: true,
          permalink: 'https://us.sentry.io/issues/100/',
          priority: 'high',
        }],
      },
    })
  })

  it('skips malformed rows, deduplicates by id, and caps normalized output at 25', async () => {
    const rows = [
      null,
      rawIssue({ id: '' }),
      rawIssue({ id: 'duplicate', shortId: 'SHOP-1' }),
      rawIssue({ id: 'duplicate', shortId: 'SHOP-2' }),
      ...Array.from({ length: 40 }, (_, index) => rawIssue({ id: `id-${index}`, shortId: `SHOP-${index + 10}` })),
    ]
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: rows }))

    const result = await fetchSentryIssues(config(), fetchFn as unknown as typeof fetch)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.issues).toHaveLength(25)
      expect(result.data.issues[0]?.id).toBe('duplicate')
      expect(result.data.issues[0]?.shortId).toBe('SHOP-1')
      expect(new Set(result.data.issues.map((issue) => issue.id)).size).toBe(25)
    }
  })

  it('keeps a useful row when optional values are malformed and rejects a permalink on any other host', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({
      status: 200,
      body: [rawIssue({
        count: 'not-a-count',
        userCount: -4,
        firstSeen: 'yesterday',
        lastSeen: null,
        stats: { '24h': [[1, 'bad'], ['bad', 2], [2, -1], [3, 4], null] },
        permalink: 'https://evil.example/issues/100/?token=sentry-token',
        priority: { name: 'high' },
        statusDetails: null,
      })],
    }))

    const result = await fetchSentryIssues(config(), fetchFn as unknown as typeof fetch)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.issues[0]).toMatchObject({
        count: 0,
        userCount: 0,
        firstSeen: null,
        lastSeen: null,
        stats24h: [[3, 4]],
        events24h: 4,
        trend: 'new',
        isRegression: false,
        permalink: null,
        priority: null,
      })
    }
  })

  it.each([
    ['fatal', [[1, 0], [2, 0], [3, 1], [4, 2]], 'critical', 'new'],
    ['warning', [[1, 8], [2, 4], [3, 2], [4, 1]], 'medium', 'falling'],
    ['info', [[1, 3], [2, 3], [3, 3], [4, 3]], 'low', 'steady'],
    ['future-level', [], 'unknown', 'unknown'],
  ] as const)('derives %s severity and %s trend facts deterministically', async (level, stats, severity, trend) => {
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: [rawIssue({ level, stats: { '24h': stats } })] }))

    const result = await fetchSentryIssues(config(), fetchFn as unknown as typeof fetch)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.issues[0]).toMatchObject({ severity, trend })
  })

  it('accepts a provider permalink only on the selected region exact HTTPS host', async () => {
    const bodies = [
      rawIssue({ id: 'good', permalink: 'https://de.sentry.io/issues/1/' }),
      rawIssue({ id: 'http', permalink: 'http://de.sentry.io/issues/2/' }),
      rawIssue({ id: 'subdomain', permalink: 'https://acme.de.sentry.io/issues/3/' }),
      rawIssue({ id: 'credentials', permalink: 'https://token@de.sentry.io/issues/4/' }),
    ]
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: bodies }))

    const result = await fetchSentryIssues(config({ region: 'de' }), fetchFn as unknown as typeof fetch)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.issues.map((issue) => issue.permalink)).toEqual([
      'https://de.sentry.io/issues/1/',
      null,
      null,
      null,
    ])
  })
})

describe('Sentry failures and validation', () => {
  it('returns a status-only HTTP error without leaking the token or response body', async () => {
    const secret = 'sentry-secret-token'
    const bodySecret = 'provider-internal-body'
    const fetchFn = vi.fn(async () => fakeResponse({ ok: false, status: 403, body: { detail: bodySecret } }))

    const result = await fetchSentryIssues(config({ token: secret }), fetchFn as unknown as typeof fetch)

    expect(result).toEqual({ ok: false, status: 403, message: 'Sentry request failed (status 403).' })
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(result)).not.toContain(bodySecret)
  })

  it('sanitizes thrown network and JSON errors even when they contain credentials or body text', async () => {
    const secret = 'sentry-secret-token'
    const fetchFn = vi.fn(async () => fakeResponse({
      status: 200,
      jsonError: new Error(`bad body with ${secret}`),
    }))

    const result = await fetchSentryIssues(config({ token: secret }), fetchFn as unknown as typeof fetch)

    expect(result).toEqual({ ok: false, status: null, message: 'Sentry request failed (network error).' })
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('validates a credential with the same bounded issues request and returns only the identity', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: [rawIssue()] }))

    const result = await validateSentryConnection(
      { region: 'global', organization: ' acme ', token: 'secret' },
      fetchFn as unknown as typeof fetch,
    )

    expect(result).toEqual({ ok: true, identity: 'acme' })
    const [url] = fetchCalls(fetchFn)[0]!
    expect(url).toContain('https://sentry.io/api/0/organizations/acme/issues/')
    expect(url).toContain('limit=25')
  })

  it('returns the sanitized fetch failure from validation', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ ok: false, status: 401 }))

    const result = await validateSentryConnection(config(), fetchFn as unknown as typeof fetch)

    expect(result).toEqual({ ok: false, message: 'Sentry request failed (status 401).' })
  })
})

describe('isSentryData', () => {
  it('accepts normalized snapshots and rejects malformed snapshot rows', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ status: 200, body: [rawIssue()] }))
    const result = await fetchSentryIssues(config(), fetchFn as unknown as typeof fetch)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(isSentryData(result.data)).toBe(true)
    expect(isSentryData({ issues: [{ ...result.data.issues[0], count: '12' }] })).toBe(false)
    expect(isSentryData({ issues: Array.from({ length: 26 }, () => result.data.issues[0]) })).toBe(false)
    expect(isSentryData({ issues: [{ ...result.data.issues[0], permalink: 'https://evil.example/issues/100/' }] })).toBe(false)
    expect(isSentryData({ issues: [{ ...result.data.issues[0], permalink: 'https://us.sentry.io:444/issues/100/' }] })).toBe(false)
    expect(isSentryDataForRegion(result.data, 'us')).toBe(true)
    expect(isSentryDataForRegion(result.data, 'global')).toBe(false)
  })

  it('narrows a valid snapshot to the exported normalized types', () => {
    const issue: SentryIssue | undefined = undefined
    const data: SentryData = { issues: issue ? [issue] : [] }
    expect(isSentryData(data)).toBe(true)
  })
})
