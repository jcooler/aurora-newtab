// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorage, type AuroraStorage } from '../../lib/storage'
import { StorageProvider } from '../../lib/storage/context'
import { memoryDriver } from '../../lib/storage/driver'
import { defaults, type AttentionLedger, type AuroraData, type BriefingSources } from '../../lib/storage/schema'
import { resolvedLocalTimeZone } from '../../lib/dates'
import { attentionRuntimeScope } from '../../services/connectors/attentionPolicy'
import type { GithubData } from '../../services/connectors/github'
import { connectorSnapshotScope } from '../../services/connectors/snapshotIdentity'
import type {
  GithubConfig,
  GitlabConfig,
  IcsConfig,
  JiraConfig,
  LinearConfig,
  VercelConfig,
} from '../../services/connectors/types'
import { weatherRequestIdentity } from '../../services/weather/identity'
import { useAttentionSignals } from './useAttentionSignals'

const NOW = Date.UTC(2026, 7, 26, 16, 0, 0)
const SOURCES: BriefingSources = { calendar: true, assignments: true, deployments: true, rain: true }
const GITHUB: GithubConfig = { enabled: true, token: 'gh_secret', username: 'jon', views: { commitGraph: false, pulls: false, issues: false, notifications: false } }
const GITLAB: GitlabConfig = { enabled: true, token: 'gl_secret', instanceUrl: 'https://gitlab.example.com', username: 'jon' }
const JIRA: JiraConfig = { enabled: true, email: 'jon@example.com', apiToken: 'jira_secret', site: 'aurora.atlassian.net', displayName: 'Jon' }
const LINEAR: LinearConfig = { enabled: true, token: 'linear_secret', displayName: 'Jon' }
const VERCEL: VercelConfig = { enabled: true, token: 'vercel_secret', username: 'jon' }
const ICS: IcsConfig = { enabled: true, calendars: [{ name: 'Work', url: 'https://calendar.example/private/basic.ics' }] }

function githubData(items: GithubData['issues']): GithubData {
  return { prs: [], issues: items, notifications: null, contributions: null, etags: {} }
}

async function makeStorage(overrides: Partial<AuroraData> = {}): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const base = defaults()
  await storage.setMany({
    settings: { ...base.settings, briefingEnabled: true, briefingSources: SOURCES },
    ...overrides,
  })
  return storage
}

function wrapper(storage: AuroraStorage) {
  return ({ children }: { children: ReactNode }) => <StorageProvider storage={storage}>{children}</StorageProvider>
}

async function scopeFor(
  id: 'github' | 'gitlab' | 'jira' | 'linear' | 'vercel',
  config: GithubConfig | GitlabConfig | JiraConfig | LinearConfig | VercelConfig,
) {
  return connectorSnapshotScope(id, config, attentionRuntimeScope(true, SOURCES))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAttentionSignals', () => {
  it('silently baselines the first valid GitHub snapshot and signals only a later ID', async () => {
    const scope = await scopeFor('github', GITHUB)
    const storage = await makeStorage({
      connectors: { github: GITHUB },
      connectorSnapshots: {
        github: {
          scope,
          fetchedAt: NOW - 2_000,
          data: githubData([{ id: 'old', title: 'Existing issue', repo: 'acme/app', url: 'https://github.com/acme/app/issues/1' }]),
        },
      },
    })
    const result = renderHook(() => useAttentionSignals(), { wrapper: wrapper(storage) })

    await waitFor(() => expect(result.result.current.ready).toBe(true))
    await waitFor(async () => expect((await storage.get('attentionLedger')).sources.github?.items).toEqual({ old: { firstSeenAt: null } }))
    expect(result.result.current.signals).toEqual([])

    await act(async () => {
      await storage.set('connectorSnapshots', {
        github: {
          scope,
          fetchedAt: NOW - 1_000,
          data: githubData([
            { id: 'old', title: 'Existing issue', repo: 'acme/app', url: 'https://github.com/acme/app/issues/1' },
            { id: 'new', title: 'New issue', repo: 'acme/app', url: 'https://github.com/acme/app/issues/2' },
          ]),
        },
      })
    })

    await waitFor(() => expect(result.result.current.signals).toEqual([
      expect.objectContaining({ kind: 'assignment', source: 'GitHub', title: 'New issue' }),
    ]))
  })

  it('ignores wrong-scope and older snapshots without rolling the ledger backward', async () => {
    const validScope = await scopeFor('github', GITHUB)
    const storage = await makeStorage({
      connectors: { github: GITHUB },
      connectorSnapshots: {
        github: { scope: 'github:v1:wrong', fetchedAt: NOW - 1_000, data: githubData([{ id: 'wrong', title: 'Wrong', repo: '', url: '' }]) },
      },
    })
    const result = renderHook(() => useAttentionSignals(), { wrapper: wrapper(storage) })

    await waitFor(() => expect(result.result.current.ready).toBe(true))
    expect((await storage.get('attentionLedger')).sources.github).toBeUndefined()

    await act(async () => {
      await storage.set('connectorSnapshots', {
        github: { scope: validScope, fetchedAt: NOW - 500, data: githubData([{ id: 'current', title: 'Current', repo: '', url: '' }]) },
      })
    })
    await waitFor(async () => expect((await storage.get('attentionLedger')).sources.github?.observedAt).toBe(NOW - 500))

    await act(async () => {
      await storage.set('connectorSnapshots', {
        github: { scope: validScope, fetchedAt: NOW - 1_500, data: githubData([{ id: 'older', title: 'Older', repo: '', url: '' }]) },
      })
    })
    await waitFor(() => expect(result.result.current.ready).toBe(true))
    expect((await storage.get('attentionLedger')).sources.github).toEqual({
      observedAt: NOW - 500,
      items: { current: { firstSeenAt: null } },
    })
  })

  it('ignores disabled sources and disabled connectors', async () => {
    const config = { ...GITHUB, enabled: false }
    const storage = await makeStorage({
      settings: { ...defaults().settings, briefingEnabled: true, briefingSources: { ...SOURCES, assignments: false } },
      connectors: { github: config },
      connectorSnapshots: {
        github: {
          scope: await connectorSnapshotScope('github', config),
          fetchedAt: NOW - 1_000,
          data: githubData([{ id: 'disabled', title: 'Disabled row', repo: 'acme/app', url: 'https://github.com/acme/app/issues/1' }]),
        },
      },
    })
    const result = renderHook(() => useAttentionSignals(), { wrapper: wrapper(storage) })
    await waitFor(() => expect(result.result.current.ready).toBe(true))
    expect(result.result.current.signals).toEqual([])
    expect((await storage.get('attentionLedger')).sources).toEqual({})
  })

  it('does not baseline legacy GitHub or GitLab cached rows that lack stable IDs', async () => {
    const runtime = attentionRuntimeScope(true, SOURCES)
    const storage = await makeStorage({
      connectors: { github: GITHUB, gitlab: GITLAB },
      connectorSnapshots: {
        github: {
          scope: await connectorSnapshotScope('github', GITHUB, runtime),
          fetchedAt: NOW - 1_000,
          data: githubData([{ title: 'Legacy GitHub row', repo: 'acme/app', url: 'https://github.com/acme/app/issues/1' } as never]),
        },
        gitlab: {
          scope: await connectorSnapshotScope('gitlab', GITLAB, runtime),
          fetchedAt: NOW - 1_000,
          data: {
            mrs: [{ title: 'Legacy GitLab row', project: 'acme/app', url: 'https://gitlab.example.com/acme/app/-/merge_requests/1' }],
            reviewMrs: [],
            todos: 0,
            contributions: null,
          },
        },
      },
    })
    const result = renderHook(() => useAttentionSignals(), { wrapper: wrapper(storage) })
    await waitFor(() => expect(result.result.current.ready).toBe(true))
    expect(result.result.current.signals).toEqual([])
    expect((await storage.get('attentionLedger')).sources).toEqual({})
  })

  it('maps provider-native IDs and admits only provider-owned HTTPS destinations', async () => {
    const connectors = { github: GITHUB, gitlab: GITLAB, jira: JIRA, linear: LINEAR, vercel: VERCEL }
    const ledger: AttentionLedger = {
      version: 1,
      sources: Object.fromEntries(['github', 'gitlab', 'jira', 'linear'].map((source) => [source, {
        observedAt: NOW - 2_000,
        items: {
          [`${source}-good`]: { firstSeenAt: NOW - 60 * 60_000 },
          [`${source}-evil`]: { firstSeenAt: NOW - 60 * 60_000 },
        },
      }])) as AttentionLedger['sources'],
    }
    const storage = await makeStorage({
      connectors,
      attentionLedger: ledger,
      connectorSnapshots: {
        github: { scope: await scopeFor('github', GITHUB), fetchedAt: NOW - 1_000, data: githubData([
          { id: 'github-good', title: 'GitHub good', repo: 'acme/app', url: 'https://github.com/acme/app/issues/1' },
          { id: 'github-evil', title: 'GitHub evil', repo: 'acme/app', url: 'https://evil.example/1' },
        ]) },
        gitlab: { scope: await scopeFor('gitlab', GITLAB), fetchedAt: NOW - 1_000, data: {
          mrs: [
            { id: 'gitlab-good', title: 'GitLab good', project: 'acme/app', url: 'https://gitlab.example.com/acme/app/-/merge_requests/1' },
            { id: 'gitlab-evil', title: 'GitLab evil', project: 'acme/app', url: 'https://gitlab.com/acme/app/-/merge_requests/2' },
          ], reviewMrs: [], todos: 0, contributions: null,
        } },
        jira: { scope: await scopeFor('jira', JIRA), fetchedAt: NOW - 1_000, data: {
          issues: [
            { key: 'jira-good', summary: 'Jira good', status: 'Open', url: 'https://aurora.atlassian.net/browse/jira-good' },
            { key: 'jira-evil', summary: 'Jira evil', status: 'Open', url: 'https://evil.example/jira-evil' },
          ], counts: { Open: 2 }, dueSoon: [],
        } },
        linear: { scope: await scopeFor('linear', LINEAR), fetchedAt: NOW - 1_000, data: { issues: [
          { id: 'linear-good', identifier: 'AUR-1', title: 'Linear good', priority: 'normal', dueDate: null, dueStatus: 'none', dueSoon: false, url: 'https://linear.app/acme/issue/AUR-1', state: { name: 'Open', type: 'started' }, team: { id: 'team', key: 'AUR', name: 'Aurora' }, cycle: null },
          { id: 'linear-evil', identifier: 'AUR-2', title: 'Linear evil', priority: 'normal', dueDate: null, dueStatus: 'none', dueSoon: false, url: 'javascript:alert(1)', state: { name: 'Open', type: 'started' }, team: { id: 'team', key: 'AUR', name: 'Aurora' }, cycle: null },
        ] } },
        vercel: { scope: await scopeFor('vercel', VERCEL), fetchedAt: NOW - 1_000, data: { deployments: [
          { project: 'Vercel good', state: 'ERROR', url: 'https://vercel.com/acme/good', createdAt: NOW - 30 * 60_000 },
          { project: 'Vercel unsafe', state: 'ERROR', url: 'javascript:alert(1)', createdAt: NOW - 20 * 60_000 },
        ] } },
      },
    })
    const result = renderHook(() => useAttentionSignals(), { wrapper: wrapper(storage) })

    await waitFor(() => expect(result.result.current.signals).toHaveLength(10))
    const signals = result.result.current.signals
    expect(signals.find((signal) => signal.title === 'GitHub good')?.url).toBe('https://github.com/acme/app/issues/1')
    expect(signals.find((signal) => signal.title === 'GitHub evil')?.url).toBeUndefined()
    expect(signals.find((signal) => signal.title === 'GitLab good')?.url).toContain('gitlab.example.com')
    expect(signals.find((signal) => signal.title === 'GitLab evil')?.url).toBeUndefined()
    expect(signals.find((signal) => signal.title === 'Jira good')?.url).toContain('aurora.atlassian.net')
    expect(signals.find((signal) => signal.title === 'Jira evil')?.url).toBeUndefined()
    expect(signals.find((signal) => signal.title === 'Linear good')?.url).toContain('linear.app')
    expect(signals.find((signal) => signal.title === 'Linear evil')?.url).toBeUndefined()
    expect(signals.find((signal) => signal.title === 'Vercel good')?.url).toContain('vercel.com')
    expect(signals.find((signal) => signal.title === 'Vercel unsafe')?.url).toBeUndefined()
  })

  it('lets two hook instances converge on one privacy-minimal ledger', async () => {
    const scope = await scopeFor('github', GITHUB)
    const storage = await makeStorage({
      connectors: { github: GITHUB },
      connectorSnapshots: { github: { scope, fetchedAt: NOW - 1_000, data: githubData([
        { id: 'stable-42', title: 'Secret remote title', repo: 'private/repo', url: 'https://github.com/private/repo/issues/42' },
      ]) } },
    })
    renderHook(() => [useAttentionSignals(), useAttentionSignals()], { wrapper: wrapper(storage) })

    await waitFor(async () => expect((await storage.get('attentionLedger')).sources.github?.items).toEqual({
      'stable-42': { firstSeenAt: null },
    }))
    const serialized = JSON.stringify(await storage.get('attentionLedger'))
    expect(serialized).not.toContain('Secret remote title')
    expect(serialized).not.toContain('private/repo')
    expect(serialized).not.toContain('https://')
  })

  it('keeps Calendar timezone scope and Weather request identity and freshness authoritative', async () => {
    const timeZone = resolvedLocalTimeZone()
    const location = { label: 'New York', lat: 40.71, lon: -74.01, manual: true }
    const storage = await makeStorage({
      settings: { ...defaults().settings, briefingEnabled: true, briefingSources: { calendar: true, assignments: false, deployments: false, rain: true } },
      connectors: { ics: ICS },
      connectorSnapshots: { ics: {
        scope: await connectorSnapshotScope('ics', ICS, { timeZone }),
        fetchedAt: NOW - 1_000,
        data: { events: [{ summary: 'Design review', start: NOW + 60 * 60_000, end: NOW + 2 * 60 * 60_000, allDay: false, cal: 0 }] },
      } },
      location,
      weatherCache: {
        current: { tempC: 20, feelsLikeC: 20, code: 1, windKmh: 5, humidity: 40 },
        hourly: [{ time: '2026-08-26T19:00', tempC: 18, precipProb: 70, code: 61 }],
        fetchedAt: NOW - 1_000,
        locationLabel: location.label,
        requestIdentity: weatherRequestIdentity(location.lat, location.lon),
      },
    })
    const result = renderHook(() => useAttentionSignals(), { wrapper: wrapper(storage) })
    await waitFor(() => expect(result.result.current.signals.map((signal) => signal.kind)).toEqual(['calendar', 'rain']))

    await act(async () => {
      await storage.setMany({
        connectorSnapshots: { ics: { ...(await storage.get('connectorSnapshots')).ics!, scope: 'ics:v2:wrong' } },
        weatherCache: { ...(await storage.get('weatherCache'))!, fetchedAt: NOW - 31 * 60_000 },
      })
    })
    await waitFor(() => expect(result.result.current.signals).toEqual([]))
  })
})
