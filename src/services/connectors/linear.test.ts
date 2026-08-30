import { describe, expect, it, vi } from 'vitest'
import * as linear from './linear'

function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => opts.body ?? {}),
  }
}

function jsonFetch(body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse({ status: 200, body }))
}

function compactQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function issueWire(overrides: Record<string, unknown> = {}) {
  return {
    id: 'issue-1',
    identifier: 'AUR-1',
    title: 'Ship Linear boundary',
    priority: 2,
    dueDate: '2026-08-23',
    url: 'https://linear.app/aurora/issue/AUR-1/ship-linear-boundary',
    state: { name: 'In Progress', type: 'started' },
    team: { id: 'team-a', key: 'AUR', name: 'Aurora' },
    cycle: {
      id: 'cycle-1',
      name: 'August',
      startsAt: '2026-08-18T04:00:00.000Z',
      endsAt: '2026-09-01T03:59:59.999Z',
    },
    ...overrides,
  }
}

function workBody(nodes: unknown[]) {
  return { data: { viewer: { assignedIssues: { nodes } } } }
}

describe('Linear service boundary', () => {
  it('exports identity, work, and snapshot-validation operations', () => {
    expect(typeof (linear as Record<string, unknown>).whoamiLinear).toBe('function')
    expect(typeof (linear as Record<string, unknown>).fetchLinearWork).toBe('function')
    expect(typeof (linear as Record<string, unknown>).isLinearWorkData).toBe('function')
  })
})

describe('whoamiLinear', () => {
  it('posts the minimal viewer and team query with raw personal-key authorization', async () => {
    const fetchFn = jsonFetch({
      data: {
        viewer: {
          id: 'user-1',
          name: 'Jon',
          teams: {
            nodes: [
              { id: 'team-a', key: 'AUR', name: 'Aurora' },
              { id: 'team-a', key: 'OLD', name: 'Duplicate' },
              null,
              { id: 'team-b', key: null, name: 'Malformed' },
            ],
          },
        },
      },
    })

    const result = await linear.whoamiLinear('lin_api_secret', fetchFn as unknown as typeof fetch)

    expect(result).toEqual({
      ok: true,
      identity: 'Jon',
      userId: 'user-1',
      teams: [{ id: 'team-a', key: 'AUR', name: 'Aurora' }],
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://api.linear.app/graphql')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: 'lin_api_secret',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(String(init?.body)) as { query: string }
    expect(compactQuery(body.query)).toBe(
      'query TabTwoLinearIdentity { viewer { id name teams { nodes { id key name } } } }',
    )
    expect(String(init?.headers)).not.toContain('Bearer')
  })

  it('rejects GraphQL errors even when partial identity data accompanies HTTP 200', async () => {
    const fetchFn = jsonFetch({
      data: { viewer: { id: 'user-1', name: 'Jon', teams: { nodes: [] } } },
      errors: [{ message: 'secret provider body' }],
    })

    const result = await linear.whoamiLinear('lin_api_secret', fetchFn as unknown as typeof fetch)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).not.toContain('lin_api_secret')
      expect(result.message).not.toContain('secret provider body')
    }
  })

  it('fails safely when the viewer identity is malformed', async () => {
    const result = await linear.whoamiLinear(
      'token',
      jsonFetch({ data: { viewer: { id: null, name: null, teams: null } } }) as unknown as typeof fetch,
    )

    expect(result.ok).toBe(false)
  })

  it('keeps network and HTTP errors free of credentials and response details', async () => {
    const networkFetch = vi.fn(async () => {
      throw new Error('network exposed lin_api_secret')
    })
    const network = await linear.whoamiLinear('lin_api_secret', networkFetch as unknown as typeof fetch)
    const http = await linear.whoamiLinear(
      'lin_api_secret',
      vi.fn(async () => fakeResponse({ ok: false, status: 401, body: { detail: 'private response' } })) as unknown as typeof fetch,
    )

    expect(network.ok).toBe(false)
    expect(http.ok).toBe(false)
    if (!network.ok) expect(network.message).not.toMatch(/lin_api_secret|network exposed/)
    if (!http.ok) expect(http.message).not.toMatch(/lin_api_secret|private response/)
  })
})

describe('fetchLinearWork request and failure contract', () => {
  it('posts the bounded assigned-issues query and returns the normalized active issue', async () => {
    const fetchFn = jsonFetch(workBody([issueWire()]))

    const data = await linear.fetchLinearWork(
      'lin_api_secret',
      ['team-a'],
      fetchFn as unknown as typeof fetch,
      new Date(2026, 7, 22, 12, 0, 0),
    )

    expect(data).toEqual({
      issues: [{
        id: 'issue-1',
        identifier: 'AUR-1',
        title: 'Ship Linear boundary',
        priority: 'high',
        dueDate: '2026-08-23',
        dueStatus: 'soon',
        dueSoon: true,
        url: 'https://linear.app/aurora/issue/AUR-1/ship-linear-boundary',
        state: { name: 'In Progress', type: 'started' },
        team: { id: 'team-a', key: 'AUR', name: 'Aurora' },
        cycle: {
          id: 'cycle-1',
          name: 'August',
          startsAt: '2026-08-18T04:00:00.000Z',
          endsAt: '2026-09-01T03:59:59.999Z',
        },
      }],
    })

    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://api.linear.app/graphql')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: 'lin_api_secret',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(String(init?.body)) as { query: string; variables?: unknown }
    expect(compactQuery(body.query)).toBe(
      'query TabTwoLinearWork($filter: IssueFilter) { viewer { assignedIssues(first: 50, filter: $filter) { nodes { id identifier title priority dueDate url state { name type } team { id key name } cycle { id name startsAt endsAt } } } } }',
    )
    expect(body.variables).toEqual({ filter: { team: { id: { in: ['team-a'] } } } })
  })

  it('rejects an HTTP 200 with GraphQL errors instead of accepting partial work', async () => {
    const fetchFn = jsonFetch({
      ...workBody([issueWire()]),
      errors: [{ message: 'private response lin_api_secret' }],
    })

    await expect(
      linear.fetchLinearWork('lin_api_secret', [], fetchFn as unknown as typeof fetch),
    ).rejects.toThrow('Linear work request failed.')
  })

  it('sanitizes HTTP, network, and malformed-JSON failures', async () => {
    const cases = [
      vi.fn(async () => fakeResponse({ ok: false, status: 403, body: { message: 'private body' } })),
      vi.fn(async () => { throw new Error('network leaked lin_api_secret') }),
      vi.fn(async () => ({
        ...fakeResponse({ status: 200 }),
        json: vi.fn(async () => { throw new Error('bad JSON private body') }),
      })),
    ]

    for (const fetchFn of cases) {
      try {
        await linear.fetchLinearWork('lin_api_secret', [], fetchFn as unknown as typeof fetch)
        throw new Error('expected fetchLinearWork to reject')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Linear work request failed.')
        expect((error as Error).message).not.toMatch(/lin_api_secret|private body|network leaked|bad JSON/)
      }
    }
  })
})

describe('fetchLinearWork normalization', () => {
  it('drops null-heavy malformed rows, completed or canceled work, duplicate ids, and unsafe links', async () => {
    const fetchFn = jsonFetch(workBody([
      null,
      issueWire({ id: null }),
      issueWire({ id: 'complete', state: { name: 'Done', type: 'completed' } }),
      issueWire({ id: 'cancel', state: { name: 'Canceled', type: 'CANCELED' } }),
      issueWire({ id: 'unsafe-http', url: 'http://linear.app/aurora/issue/AUR-2' }),
      issueWire({ id: 'unsafe-host', url: 'https://linear.app.evil.example/aurora/issue/AUR-3' }),
      issueWire({ id: 'issue-1', title: 'First valid copy' }),
      issueWire({ id: 'issue-1', title: 'Duplicate copy' }),
    ]))

    const data = await linear.fetchLinearWork(
      'token',
      [],
      fetchFn as unknown as typeof fetch,
      new Date(2026, 7, 22, 12, 0, 0),
    )

    expect(data.issues).toHaveLength(1)
    expect(data.issues[0]?.title).toBe('First valid copy')
  })

  it('filters by selected team before applying the 25-item cap and preserves provider order', async () => {
    const nodes = Array.from({ length: 31 }, (_, index) => issueWire({
      id: `issue-${index + 1}`,
      identifier: `AUR-${index + 1}`,
      title: `Issue ${index + 1}`,
      team: index < 3
        ? { id: 'other-team', key: 'OTH', name: 'Other' }
        : { id: 'team-a', key: 'AUR', name: 'Aurora' },
    }))
    nodes.splice(6, 0, issueWire({ id: 'issue-4', title: 'Duplicate issue 4' }))
    const fetchFn = jsonFetch(workBody(nodes))

    const data = await linear.fetchLinearWork('token', [' team-a ', 'team-a'], fetchFn as unknown as typeof fetch)

    expect(data.issues).toHaveLength(25)
    expect(data.issues[0]?.id).toBe('issue-4')
    expect(data.issues[24]?.id).toBe('issue-28')
    expect(data.issues.every((issue) => issue.team.id === 'team-a')).toBe(true)
  })

  it('maps priority, due-soon, invalid due dates, and optional cycle dates deterministically', async () => {
    const fetchFn = jsonFetch(workBody([
      issueWire({ id: 'overdue', identifier: 'AUR-2', priority: 1, dueDate: '2026-08-21', cycle: null }),
      issueWire({ id: 'today', identifier: 'AUR-3', priority: 3, dueDate: '2026-08-22' }),
      issueWire({ id: 'seven', identifier: 'AUR-4', priority: 4, dueDate: '2026-08-29' }),
      issueWire({ id: 'eight', identifier: 'AUR-5', priority: 0, dueDate: '2026-08-30' }),
      issueWire({
        id: 'invalid',
        identifier: 'AUR-6',
        priority: 99,
        dueDate: '2026-02-30',
        cycle: { id: 'cycle-2', name: 'Bad dates', startsAt: 'not-a-date', endsAt: null },
      }),
    ]))

    const data = await linear.fetchLinearWork(
      'token',
      [],
      fetchFn as unknown as typeof fetch,
      new Date(2026, 7, 22, 23, 59, 59),
    )

    expect(data.issues.map(({ id, priority, dueDate, dueStatus, dueSoon, cycle }) => ({
      id, priority, dueDate, dueStatus, dueSoon, cycle,
    }))).toEqual([
      { id: 'overdue', priority: 'urgent', dueDate: '2026-08-21', dueStatus: 'overdue', dueSoon: true, cycle: null },
      { id: 'today', priority: 'normal', dueDate: '2026-08-22', dueStatus: 'today', dueSoon: true, cycle: issueWire().cycle },
      { id: 'seven', priority: 'low', dueDate: '2026-08-29', dueStatus: 'soon', dueSoon: true, cycle: issueWire().cycle },
      { id: 'eight', priority: 'none', dueDate: '2026-08-30', dueStatus: 'later', dueSoon: false, cycle: issueWire().cycle },
      {
        id: 'invalid',
        priority: 'none',
        dueDate: null,
        dueStatus: 'none',
        dueSoon: false,
        cycle: { id: 'cycle-2', name: 'Bad dates', startsAt: null, endsAt: null },
      },
    ])
  })

  it('rejects a malformed outer work envelope instead of caching a false empty state', async () => {
    await expect(
      linear.fetchLinearWork('token', [], jsonFetch({ data: { viewer: null } }) as unknown as typeof fetch),
    ).rejects.toThrow('Linear work request failed.')
  })
})

describe('isLinearWorkData', () => {
  const validIssue = {
    id: 'issue-1',
    identifier: 'AUR-1',
    title: 'Valid snapshot row',
    priority: 'high',
    dueDate: '2026-08-23',
    dueStatus: 'soon',
    dueSoon: true,
    url: 'https://linear.app/aurora/issue/AUR-1/valid-snapshot-row',
    state: { name: 'In Progress', type: 'started' },
    team: { id: 'team-a', key: 'AUR', name: 'Aurora' },
    cycle: null,
  }

  it('accepts normalized bounded work and rejects malformed or unsafe snapshot payloads', () => {
    expect(linear.isLinearWorkData({ issues: [validIssue] })).toBe(true)
    expect(linear.isLinearWorkData(null)).toBe(false)
    expect(linear.isLinearWorkData({ issues: [{ ...validIssue, url: 'https://evil.example/AUR-1' }] })).toBe(false)
    expect(linear.isLinearWorkData({ issues: [{ ...validIssue, dueSoon: false }] })).toBe(false)
    expect(linear.isLinearWorkData({ issues: [validIssue, { ...validIssue }] })).toBe(false)
    expect(linear.isLinearWorkData({
      issues: Array.from({ length: 26 }, (_, index) => ({ ...validIssue, id: `issue-${index}` })),
    })).toBe(false)
  })
})
