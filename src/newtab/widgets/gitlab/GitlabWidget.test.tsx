// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { GitlabData } from '../../../services/connectors/gitlab'
import type { GitlabConfig } from '../../../services/connectors/types'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import GitlabWidget from './GitlabWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives across
// cases; reset it so one test's refresh can't dedupe the next (same discipline
// as GithubWidget.test.tsx).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const DATA: GitlabData = {
  mrs: [
    {
      title: 'Add rate limiting to the ingest API',
      url: 'https://gitlab.com/acme/platform/-/merge_requests/204',
      project: 'acme/platform',
    },
    {
      title: 'Bump vite to 6.x',
      url: 'https://gitlab.com/acme/platform/-/merge_requests/207',
      project: 'acme/platform',
    },
  ],
  todos: 6,
}

const CONNECTED: GitlabConfig = {
  enabled: true,
  token: 'glpat_x',
  instanceUrl: 'https://gitlab.com',
  username: 'jcooler',
}

/** Storage seeded with a CONNECTED gitlab connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never calls
 *  the real fetchGitlab — the widget renders straight from cache, no network. */
async function seededStorage(
  config: GitlabConfig,
  data: GitlabData | null = DATA,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { gitlab: config })
  if (data) await storage.set('connectorSnapshots', { gitlab: { fetchedAt: Date.now(), data } })
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <GitlabWidget />
    </StorageProvider>,
  )
}

describe('GitlabWidget', () => {
  it('renders MR rows plus the to-dos count from the seeded snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    await screen.findByText('Add rate limiting to the ingest API')
    expect(screen.getByText('Bump vite to 6.x')).toBeTruthy()
    // to-dos header chip.
    expect(screen.getByText('6 to-dos')).toBeTruthy()
    // Project prefix rides above each title.
    expect(screen.getAllByText('acme/platform').length).toBeGreaterThan(0)
  })

  it('renders "20+" to-dos at the cap', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, todos: 20 })
    mount(storage)
    await screen.findByText('Add rate limiting to the ingest API')
    expect(screen.getByText('20+ to-dos')).toBeTruthy()
  })

  it('hides the to-dos row when the count is zero', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, todos: 0 })
    mount(storage)
    await screen.findByText('Add rate limiting to the ingest API')
    expect(screen.queryByText(/to-dos/)).toBeNull()
  })

  it('shows the empty-connected copy when connected but nothing is assigned', async () => {
    const storage = await seededStorage(CONNECTED, { mrs: [], todos: 0 })
    mount(storage)
    expect(await screen.findByText('No MRs assigned to you.')).toBeTruthy()
  })

  it('caps MR rows at 5', async () => {
    const many: GitlabData = {
      mrs: Array.from({ length: 8 }, (_, i) => ({
        title: `MR ${i}`,
        url: `https://gitlab.com/o/r/-/merge_requests/${i}`,
        project: 'o/r',
      })),
      todos: 0,
    }
    const storage = await seededStorage(CONNECTED, many)
    mount(storage)
    await screen.findByText('MR 0')
    expect(screen.queryByText('MR 5')).toBeNull()
  })

  it('each row is an external link (target=_blank, rel carries noopener + noreferrer, href + title intact)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    const link = (await screen.findByText('Add rate limiting to the ingest API')).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://gitlab.com/acme/platform/-/merge_requests/204')
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(link.getAttribute('title')).toBe('Add rate limiting to the ingest API')
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    // The gate returns before useConnectorSnapshot mounts, so no refresh wrote a
    // snapshot — the "zero hooks in the gate" proof.
    expect((await storage.get('connectorSnapshots')).gitlab).toBeUndefined()
  })

  it('renders nothing when enabled but no token is present (reconnect state)', async () => {
    const storage = await seededStorage({ ...CONNECTED, token: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).gitlab).toBeUndefined()
  })

  it('renders nothing when enabled + token present but instanceUrl is missing/empty', async () => {
    const storage = await seededStorage({ ...CONNECTED, instanceUrl: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).gitlab).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no token/instanceUrl fields — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { gitlab: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).gitlab).toBeUndefined()
  })
})
