// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createStorage, type AuroraStorage } from '../../lib/storage'
import { memoryDriver } from '../../lib/storage/driver'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { StorageProvider } from '../../lib/storage/context'
import type { SentryData } from '../../services/connectors/sentry'
import type { LinearWorkData } from '../../services/connectors/linear'
import type { TodoistData } from '../../services/connectors/todoist'
import type { LinearConfig, SentryConfig, TodoistConfig } from '../../services/connectors/types'
import { connectorSnapshotScope } from '../../services/connectors/snapshotIdentity'
import { initializePermissionMirror } from '../../services/permissionMirror'
import Connectors, { nextLinearConnection, nextSentryConnection, nextTodoistConnection } from './Connectors'

beforeAll(async () => {
  vi.stubGlobal('chrome', {
    permissions: {
      getAll: vi.fn(async () => ({ origins: [] })),
      request: vi.fn(async () => true),
      contains: vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) => origins.length === 0),
      remove: vi.fn(async () => false),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
  })
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, _options: LockOptions, work: () => Promise<unknown>) => work() },
  })
  await initializePermissionMirror()
})

afterAll(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
})

function Harness({ storage }: { storage: AuroraStorage }) {
  const [connectors] = useStoredKey('connectors')
  return <Connectors connectors={connectors} storage={storage} reportPendingCleanup={vi.fn()} />
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <Harness storage={storage} />
    </StorageProvider>,
  )
}

async function storageWithSentry() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const sentry: SentryConfig = {
    enabled: true,
    token: 'sentry_test_token',
    organization: 'aurora-test',
    region: 'us',
    projectSlugs: ['web'],
    itemLimit: 6,
  }
  const data: SentryData = {
    issues: [
      {
        id: '1', title: 'Web failed', shortId: 'WEB-1',
        project: { id: 'web', name: 'Web', slug: 'web' },
        level: 'error', severity: 'high', count: 2, userCount: 1,
        firstSeen: null, lastSeen: null, stats24h: [], events24h: 2,
        trend: 'steady', isRegression: false,
        permalink: 'https://us.sentry.io/issues/1/', priority: null,
      },
      {
        id: '2', title: 'API failed', shortId: 'API-2',
        project: { id: 'api', name: 'API', slug: 'api' },
        level: 'warning', severity: 'medium', count: 1, userCount: 1,
        firstSeen: null, lastSeen: null, stats24h: [], events24h: 1,
        trend: 'new', isRegression: false,
        permalink: 'https://us.sentry.io/issues/2/', priority: null,
      },
    ],
  }
  await storage.set('connectors', {
    sentry,
    github: { enabled: true, token: 'github_test', username: 'octocat' },
  })
  await storage.set('connectorSnapshots', {
    sentry: { scope: await connectorSnapshotScope('sentry', sentry), fetchedAt: 1, data },
    github: { scope: 'github-scope', fetchedAt: 2, data: { marker: true } },
  })
  return storage
}

async function storageWithLinear() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const linear: LinearConfig = { enabled: true, token: 'linear_test', displayName: 'Sam', teamIds: ['aurora'], itemLimit: 6 }
  const data: LinearWorkData = {
    issues: [
      {
        id: '1', identifier: 'AUR-1', title: 'Aurora issue', priority: 'normal', dueDate: null,
        dueStatus: 'none', dueSoon: false, url: 'https://linear.app/aurora/issue/AUR-1',
        state: { name: 'Started', type: 'started' }, team: { id: 'aurora', key: 'AUR', name: 'Aurora' }, cycle: null,
      },
      {
        id: '2', identifier: 'OPS-2', title: 'Ops issue', priority: 'high', dueDate: null,
        dueStatus: 'none', dueSoon: false, url: 'https://linear.app/aurora/issue/OPS-2',
        state: { name: 'Started', type: 'started' }, team: { id: 'ops', key: 'OPS', name: 'Ops' }, cycle: null,
      },
    ],
  }
  await storage.set('connectors', { linear })
  await storage.set('connectorSnapshots', { linear: { scope: await connectorSnapshotScope('linear', linear), fetchedAt: 1, data } })
  return storage
}

async function storageWithTodoist() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const todoist: TodoistConfig = { enabled: true, token: 'todoist_test', accountLabel: 'Todoist', projectIds: ['work'], itemLimit: 6 }
  const data: TodoistData = { projects: [{ id: 'work', name: 'Work' }, { id: 'personal', name: 'Personal' }], tasks: [] }
  await storage.set('connectors', { todoist })
  await storage.set('connectorSnapshots', { todoist: { scope: await connectorSnapshotScope('todoist', todoist), fetchedAt: 1, data } })
  return storage
}

describe('Work connector settings', () => {
  it('drops account-scoped picks when Work connector credentials are replaced', () => {
    const linear = nextLinearConnection(
      { enabled: true, token: 'old', displayName: 'Old', teamIds: ['old-team'], itemLimit: 7 },
      'new-linear-token',
      'New Linear user',
    )
    expect(linear).toMatchObject({ token: 'new-linear-token', displayName: 'New Linear user', itemLimit: 7 })
    expect(linear.teamIds).toBeUndefined()

    const sentry = nextSentryConnection(
      { enabled: true, token: 'old', organization: 'old-org', region: 'us', projectSlugs: ['old-project'], itemLimit: 8 },
      { token: 'new-sentry-token', region: 'de' },
      'new-org',
    )
    expect(sentry).toMatchObject({ token: 'new-sentry-token', organization: 'new-org', region: 'de', itemLimit: 8 })
    expect(sentry.projectSlugs).toBeUndefined()

    const todoist = nextTodoistConnection(
      { enabled: true, token: 'old', accountLabel: 'Old account', projectIds: ['old-project'], itemLimit: 9 },
      'new-todoist-token',
      'New account',
    )
    expect(todoist).toMatchObject({ token: 'new-todoist-token', accountLabel: 'New account', itemLimit: 9 })
    expect(todoist.projectIds).toBeUndefined()
  })

  it('opens a stripped Linear credential directly in reconnect mode', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      linear: { enabled: true, displayName: 'Sam', teamIds: ['aurora'], itemLimit: 7 },
    })

    mount(storage)

    expect(await screen.findByRole('dialog', { name: 'Linear reconnect' })).toBeTruthy()
    expect(screen.getByLabelText('Linear personal API key')).toBeTruthy()
    expect(screen.queryByLabelText('Show Linear on Canvas')).toBeNull()
  })

  it('renders Sentry fixed-region and provider-derived project controls', async () => {
    const storage = await storageWithSentry()
    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sentry' }))

    const region = screen.getByLabelText('Data region') as HTMLSelectElement
    expect(region.value).toBe('us')
    expect((await screen.findByRole('button', { name: 'Web' })).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'API' }).getAttribute('aria-pressed')).toBe('false')
    expect((screen.getByLabelText('Issues shown') as HTMLSelectElement).value).toBe('6')
  })

  it('updates Sentry picks from the authoritative map and clears only its snapshot', async () => {
    const storage = await storageWithSentry()
    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sentry' }))

    const api = await screen.findByRole('button', { name: 'API' })
    await act(async () => {
      fireEvent.click(api)
    })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Issues shown'), { target: { value: '8' } })
    })

    await waitFor(async () => {
      const config = (await storage.get('connectors')).sentry as SentryConfig
      expect(config.projectSlugs).toEqual(['web', 'api'])
      expect(config.itemLimit).toBe(8)
    })
    const connectors = await storage.get('connectors')
    expect(connectors.sentry).toMatchObject({ token: 'sentry_test_token', organization: 'aurora-test', region: 'us' })
    expect(connectors.github).toMatchObject({ username: 'octocat' })
    const snapshots = await storage.get('connectorSnapshots')
    expect(snapshots.sentry).toBeUndefined()
    expect(snapshots.github).toEqual({ scope: 'github-scope', fetchedAt: 2, data: { marker: true } })
    expect(screen.getByRole('button', { name: 'Web' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'API' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy()
  })

  it('drops old-account Sentry projects when the mounted connection owner changes', async () => {
    const storage = await storageWithSentry()
    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sentry' }))
    expect(await screen.findByRole('button', { name: 'API' })).toBeTruthy()

    const replacement = nextSentryConnection(
      (await storage.get('connectors')).sentry as SentryConfig,
      { token: 'new-sentry-token', region: 'de' },
      'new-org',
    )
    const replacementData: SentryData = {
      issues: [{
        id: '3', title: 'New project failed', shortId: 'NEW-3',
        project: { id: 'new', name: 'New project', slug: 'new' },
        level: 'error', severity: 'high', count: 1, userCount: 1,
        firstSeen: null, lastSeen: null, stats24h: [], events24h: 1,
        trend: 'new', isRegression: false,
        permalink: 'https://de.sentry.io/issues/3/', priority: null,
      }],
    }
    const replacementScope = await connectorSnapshotScope('sentry', replacement)
    await act(async () => {
      await storage.updateMany(['connectors', 'connectorSnapshots'], ({ connectors }) => ({
        connectors: { ...connectors, sentry: replacement },
        connectorSnapshots: { sentry: { scope: replacementScope, fetchedAt: 2, data: replacementData } },
      }))
    })

    expect(await screen.findByRole('button', { name: 'New project' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'API' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Web' })).toBeNull()
  })

  it('removes only the disconnected connector snapshot', async () => {
    const storage = await storageWithSentry()
    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sentry' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))

    await waitFor(async () => {
      expect((await storage.get('connectors')).sentry).toBeUndefined()
    })
    const snapshots = await storage.get('connectorSnapshots')
    expect(snapshots.sentry).toBeUndefined()
    expect(snapshots.github).toEqual({ scope: 'github-scope', fetchedAt: 2, data: { marker: true } })
  })

  it('renders and persists provider-derived Linear team controls', async () => {
    const storage = await storageWithLinear()
    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Linear' }))
    expect((await screen.findByRole('button', { name: 'Aurora' })).getAttribute('aria-pressed')).toBe('true')
    const ops = screen.getByRole('button', { name: 'Ops' })
    expect(ops.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(ops)
    fireEvent.change(screen.getByLabelText('Issues shown'), { target: { value: '7' } })
    await waitFor(async () => {
      const config = (await storage.get('connectors')).linear as LinearConfig
      expect(config.teamIds).toEqual(['aurora', 'ops'])
      expect(config.itemLimit).toBe(7)
    })
    expect((await storage.get('connectorSnapshots')).linear).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Aurora' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ops' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy()
  })

  it('drops old-account picker options when Linear reconnects in the mounted Settings view', async () => {
    const storage = await storageWithLinear()
    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Linear' }))
    expect(await screen.findByRole('button', { name: 'Ops' })).toBeTruthy()

    const replacement = nextLinearConnection(
      (await storage.get('connectors')).linear as LinearConfig,
      'new-linear-token',
      'New user',
    )
    const replacementData: LinearWorkData = {
      issues: [{
        id: '3', identifier: 'NEW-3', title: 'New account issue', priority: 'normal', dueDate: null,
        dueStatus: 'none', dueSoon: false, url: 'https://linear.app/aurora/issue/NEW-3',
        state: { name: 'Started', type: 'started' }, team: { id: 'new', key: 'NEW', name: 'New team' }, cycle: null,
      }],
    }
    const replacementScope = await connectorSnapshotScope('linear', replacement)
    await act(async () => {
      await storage.updateMany(['connectors', 'connectorSnapshots'], ({ connectors }) => ({
        connectors: { ...connectors, linear: replacement },
        connectorSnapshots: { linear: { scope: replacementScope, fetchedAt: 2, data: replacementData } },
      }))
    })

    expect(await screen.findByRole('button', { name: 'New team' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ops' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aurora' })).toBeNull()
  })

  it('does not derive picker options from a snapshot owned by another connection', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const linear: LinearConfig = {
      enabled: true,
      token: 'current-token',
      displayName: 'Current user',
      snapshotEpoch: 'current-epoch',
      teamIds: [],
      itemLimit: 6,
    }
    const foreignData: LinearWorkData = {
      issues: [{
        id: 'foreign', identifier: 'OLD-1', title: 'Foreign issue', priority: 'normal', dueDate: null,
        dueStatus: 'none', dueSoon: false, url: 'https://linear.app/aurora/issue/OLD-1',
        state: { name: 'Started', type: 'started' }, team: { id: 'foreign', key: 'OLD', name: 'Foreign team' }, cycle: null,
      }],
    }
    await storage.set('connectors', { linear })
    await storage.set('connectorSnapshots', {
      linear: { scope: 'linear:v1:not-the-current-scope', fetchedAt: 1, data: foreignData },
    })

    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Linear' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Foreign team' })).toBeNull()
    })
    expect(screen.getByText('Teams appear after the first successful refresh.')).toBeTruthy()
  })

  it('keeps a selected Linear team removable when no snapshot is available', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      linear: { enabled: true, token: 'linear_test', displayName: 'Sam', teamIds: ['stale-team'], itemLimit: 6 },
    })

    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Linear' }))

    expect(await screen.findByRole('button', { name: 'stale-team' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(async () => {
      expect(((await storage.get('connectors')).linear as LinearConfig).teamIds).toEqual([])
    })
  })

  it('keeps a selected Sentry project removable when no snapshot is available', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      sentry: { enabled: true, token: 'sentry_test', organization: 'aurora-test', region: 'us', projectSlugs: ['stale-project'], itemLimit: 6 },
    })

    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sentry' }))

    expect(await screen.findByRole('button', { name: 'stale-project' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(async () => {
      expect(((await storage.get('connectors')).sentry as SentryConfig).projectSlugs).toEqual([])
    })
  })

  it('renders and persists a real Todoist project picklist', async () => {
    const storage = await storageWithTodoist()
    mount(storage)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Todoist' }))
    expect((await screen.findByRole('button', { name: 'Work' })).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Personal' }))
    fireEvent.change(screen.getByLabelText('Tasks shown'), { target: { value: '9' } })
    await waitFor(async () => {
      const config = (await storage.get('connectors')).todoist as TodoistConfig
      expect(config.projectIds).toEqual(['work', 'personal'])
      expect(config.itemLimit).toBe(9)
    })
    expect((await storage.get('connectorSnapshots')).todoist).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Work' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Personal' })).toBeTruthy()
  })
})
