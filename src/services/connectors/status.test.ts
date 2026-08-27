// src/services/connectors/status.test.ts — statusServicesOf (read-time
// tolerance, same discipline as ics.ts's icsCalendarsOf), fetchStatus
// (parallel fan-out, per-service degrade-to-unknown, the anti-staleness
// rule), and the registry descriptor. Same fake-Response/injectable-fetchFn
// idiom as crypto.test.ts / ics.test.ts, so nothing here touches a real
// network.
import { describe, expect, it, vi } from 'vitest'
import {
  CURATED_STATUS,
  MAX_SERVICES,
  fetchStatus,
  statusDescriptor,
  statusServicesOf,
  type StatusData,
} from './status'
import type { StatusConfig, StatusService } from './types'

/** Minimal fetch Response stand-in — only the members getJson reads (ok,
 *  status, headers.get('etag'), json()). Cast through `unknown` at each
 *  fetchFn call site, same as crypto.test.ts. */
function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => opts.body ?? {}),
  }
}

describe('statusServicesOf', () => {
  it('undefined config -> []', () => {
    expect(statusServicesOf(undefined)).toEqual([])
  })

  it('a config with no services field -> []', () => {
    expect(statusServicesOf({ enabled: true })).toEqual([])
  })

  it('passes through well-formed entries verbatim, in order', () => {
    const services: StatusService[] = [
      { name: 'GitHub', url: 'https://www.githubstatus.com/api/v2/status.json' },
      { name: 'npm', url: 'https://status.npmjs.org/api/v2/status.json' },
    ]
    const config: StatusConfig = { enabled: true, services }
    expect(statusServicesOf(config)).toEqual(services)
  })

  it('filters out malformed entries (missing/empty url, non-string name) but keeps well-formed siblings', () => {
    const config = {
      enabled: true,
      services: [
        { name: 'Good', url: 'https://good.example.com/api/v2/status.json' },
        { name: 'No URL' }, // missing url
        { name: 'Empty URL', url: '' }, // empty url
        { name: 123, url: 'https://bad-name.example.com/api/v2/status.json' }, // non-string name
        null,
        'not an object',
        { name: 'Also Good', url: 'https://also-good.example.com/api/v2/status.json' },
      ],
    } as unknown as StatusConfig
    expect(statusServicesOf(config)).toEqual([
      { name: 'Good', url: 'https://good.example.com/api/v2/status.json' },
      { name: 'Also Good', url: 'https://also-good.example.com/api/v2/status.json' },
    ])
  })

  it(`slices to MAX_SERVICES (${MAX_SERVICES})`, () => {
    const services: StatusService[] = Array.from({ length: MAX_SERVICES + 3 }, (_, i) => ({
      name: `Service ${i}`,
      url: `https://service-${i}.example.com/api/v2/status.json`,
    }))
    const config: StatusConfig = { enabled: true, services }
    const result = statusServicesOf(config)
    expect(result).toHaveLength(MAX_SERVICES)
    expect(result).toEqual(services.slice(0, MAX_SERVICES))
  })

  it('a non-array services field -> []', () => {
    const config = { enabled: true, services: 'nope' } as unknown as StatusConfig
    expect(statusServicesOf(config)).toEqual([])
  })
})

describe('fetchStatus — fan-out & index alignment', () => {
  it('an empty list returns { services: [] } without calling fetchFn at all', async () => {
    const fetchFn = vi.fn()
    const data = await fetchStatus([], null, fetchFn as unknown as typeof fetch)
    expect(data).toEqual({ services: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches every configured service in parallel and aligns results to the configured order', async () => {
    const services: StatusService[] = [
      { name: 'A', url: 'https://a.example.com/status.json' },
      { name: 'B', url: 'https://b.example.com/status.json' },
      { name: 'C', url: 'https://c.example.com/status.json' },
    ]
    const fetchFn = vi.fn(async (url: string) => {
      const indicator = url.includes('a.example') ? 'none' : url.includes('b.example') ? 'major' : 'critical'
      return fakeResponse({ status: 200, body: { status: { indicator, description: `${indicator} desc` } } })
    })
    const data = await fetchStatus(services, null, fetchFn as unknown as typeof fetch)
    expect(data.services).toEqual([
      { name: 'A', indicator: 'none', description: 'none desc' },
      { name: 'B', indicator: 'major', description: 'major desc' },
      { name: 'C', indicator: 'critical', description: 'critical desc' },
    ])
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('the stored url is fetched EXACTLY as given — nothing appended at fetch time', async () => {
    const services: StatusService[] = [{ name: 'X', url: 'https://x.example.com/api/v2/status.json' }]
    const fetchFn = vi.fn(async () =>
      fakeResponse({ status: 200, body: { status: { indicator: 'none', description: 'ok' } } }),
    )
    await fetchStatus(services, null, fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledWith('https://x.example.com/api/v2/status.json', expect.anything())
  })

  it('carries an AbortSignal per request (8s abort discipline)', async () => {
    const services: StatusService[] = [{ name: 'X', url: 'https://x.example.com/status.json' }]
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeResponse({ status: 200, body: { status: { indicator: 'none', description: '' } } }),
    )
    await fetchStatus(services, null, fetchFn as unknown as typeof fetch)
    const [, init] = fetchFn.mock.calls[0]!
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('fetchStatus — per-service degrade to unknown, siblings unaffected', () => {
  const services: StatusService[] = [
    { name: 'Healthy', url: 'https://healthy.example.com/status.json' },
    { name: 'Broken', url: 'https://broken.example.com/status.json' },
  ]

  async function run(brokenFetch: () => Promise<unknown>) {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('broken')) return brokenFetch()
      return fakeResponse({ status: 200, body: { status: { indicator: 'none', description: 'all good' } } })
    })
    return fetchStatus(services, null, fetchFn as unknown as typeof fetch)
  }

  it('a non-OK HTTP status -> unknown for that entry', async () => {
    const data = await run(async () => fakeResponse({ ok: false, status: 500 }))
    expect(data.services).toEqual([
      { name: 'Healthy', indicator: 'none', description: 'all good' },
      { name: 'Broken', indicator: 'unknown', description: '' },
    ])
  })

  it('a network throw -> unknown for that entry', async () => {
    const data = await run(async () => {
      throw new Error('network down')
    })
    expect(data.services).toEqual([
      { name: 'Healthy', indicator: 'none', description: 'all good' },
      { name: 'Broken', indicator: 'unknown', description: '' },
    ])
  })

  it('a JSON parse throw -> unknown for that entry', async () => {
    const data = await run(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: vi.fn(async () => {
        throw new SyntaxError('bad json')
      }),
    }))
    expect(data.services).toEqual([
      { name: 'Healthy', indicator: 'none', description: 'all good' },
      { name: 'Broken', indicator: 'unknown', description: '' },
    ])
  })

  it('a body with no status key -> unknown for that entry', async () => {
    const data = await run(async () => fakeResponse({ status: 200, body: {} }))
    expect(data.services).toEqual([
      { name: 'Healthy', indicator: 'none', description: 'all good' },
      { name: 'Broken', indicator: 'unknown', description: '' },
    ])
  })

  it('an unrecognized indicator string -> unknown for that entry', async () => {
    const data = await run(async () =>
      fakeResponse({ status: 200, body: { status: { indicator: 'not-a-real-indicator', description: 'huh' } } }),
    )
    expect(data.services).toEqual([
      { name: 'Healthy', indicator: 'none', description: 'all good' },
      { name: 'Broken', indicator: 'unknown', description: '' },
    ])
  })
})

describe('fetchStatus — anti-staleness (the pinned design departure)', () => {
  it('a service that was "none" on the previous fetch and now fails reads "unknown", NEVER the stale "none"', async () => {
    const services: StatusService[] = [{ name: 'Flaky', url: 'https://flaky.example.com/status.json' }]
    const prev: StatusData = { services: [{ name: 'Flaky', indicator: 'none', description: 'all good last time' }] }
    const fetchFn = vi.fn(async () => {
      throw new Error('network down this time')
    })
    const data = await fetchStatus(services, prev, fetchFn as unknown as typeof fetch)
    expect(data.services).toEqual([{ name: 'Flaky', indicator: 'unknown', description: '' }])
  })

  it('prev is entirely ignored even when it perfectly matches the requested services shape', async () => {
    const services: StatusService[] = [{ name: 'Flaky', url: 'https://flaky.example.com/status.json' }]
    const prev: StatusData = {
      services: [{ name: 'Flaky', indicator: 'critical', description: 'was on fire' }],
    }
    const fetchFn = vi.fn(async () =>
      fakeResponse({ status: 200, body: { status: { indicator: 'none', description: 'fixed now' } } }),
    )
    const data = await fetchStatus(services, prev, fetchFn as unknown as typeof fetch)
    // A fresh good read wins outright — nothing about prev leaks into the result.
    expect(data.services).toEqual([{ name: 'Flaky', indicator: 'none', description: 'fixed now' }])
  })
})

describe('statusDescriptor', () => {
  it('declares the no-auth connector identity: no secrets, no identity field, development category', () => {
    expect(statusDescriptor.id).toBe('status')
    expect(statusDescriptor.label).toBe('Status')
    expect(statusDescriptor.blurb).toBe('Green dots for the services you depend on')
    expect(statusDescriptor.category).toBe('development')
    expect(statusDescriptor.auth).toBe('none')
    expect(statusDescriptor.ttlMs).toBe(5 * 60_000)
    expect(statusDescriptor.secretFields).toEqual([])
    expect(statusDescriptor.identityField).toBeUndefined()
  })

  it('origins() maps configured services through originPattern, one origin per entry', () => {
    const config: StatusConfig = {
      enabled: true,
      services: [
        { name: 'GitHub', url: 'https://www.githubstatus.com/api/v2/status.json' },
        { name: 'npm', url: 'https://status.npmjs.org/api/v2/status.json' },
      ],
    }
    expect(statusDescriptor.origins(config)).toEqual([
      'https://www.githubstatus.com/*',
      'https://status.npmjs.org/*',
    ])
  })

  it('origins() degrades (filters, does not throw) on a malformed/non-https entry', () => {
    const config = {
      enabled: true,
      services: [
        { name: 'Good', url: 'https://good.example.com/api/v2/status.json' },
        { name: 'Bad scheme', url: 'http://insecure.example.com/api/v2/status.json' },
        { name: 'Unparseable', url: 'not a url' },
      ],
    } as unknown as StatusConfig
    expect(() => statusDescriptor.origins(config)).not.toThrow()
    expect(statusDescriptor.origins(config)).toEqual(['https://good.example.com/*'])
  })

  it('origins() on an empty/undefined-services config is []', () => {
    expect(statusDescriptor.origins({ enabled: true })).toEqual([])
  })

  it('owns origins only when a valid service is configured, independent of enabled', () => {
    expect(
      statusDescriptor.ownsOrigins({
        enabled: false,
        services: [{ name: 'Good', url: 'https://good.example.com/api/v2/status.json' }],
      }),
    ).toBe(true)
    expect(statusDescriptor.ownsOrigins({ enabled: true })).toBe(false)
    expect(
      statusDescriptor.ownsOrigins({
        enabled: true,
        services: [{ name: 'Bad', url: 'http://bad.example.com/status.json' }],
      }),
    ).toBe(false)
  })
})

describe('CURATED_STATUS', () => {
  it('is a non-empty, verified list of live statuspage-shaped endpoints', () => {
    expect(CURATED_STATUS.length).toBeGreaterThan(0)
    for (const service of CURATED_STATUS) {
      expect(service.name.length).toBeGreaterThan(0)
      expect(service.url.startsWith('https://')).toBe(true)
    }
  })

  it('never exceeds MAX_SERVICES', () => {
    expect(CURATED_STATUS.length).toBeLessThanOrEqual(MAX_SERVICES)
  })

  it('excludes Stripe and Slack (custom status APIs, not statuspage-conforming)', () => {
    const names = CURATED_STATUS.map((s) => s.name.toLowerCase())
    expect(names).not.toContain('stripe')
    expect(names).not.toContain('slack')
  })
})
