// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { JiraData } from '../../../services/connectors/jira'
import type { JiraConfig } from '../../../services/connectors/types'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import JiraWidget from './JiraWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives across
// cases; reset it so one test's refresh can't dedupe the next (same discipline
// as GitlabWidget.test.tsx).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const DATA: JiraData = {
  issues: [
    {
      key: 'AUR-12',
      summary: 'Fix the flaky auth test on CI',
      status: 'In Progress',
      url: 'https://yoursite.atlassian.net/browse/AUR-12',
    },
    {
      key: 'AUR-13',
      summary: 'Weather chip overlaps the bar at 800px wide',
      status: 'To Do',
      url: 'https://yoursite.atlassian.net/browse/AUR-13',
    },
  ],
  counts: { 'In Progress': 3, 'To Do': 2 },
}

const CONNECTED: JiraConfig = {
  enabled: true,
  email: 'jon@acme.com',
  apiToken: 'tok_x',
  site: 'yoursite.atlassian.net',
  displayName: 'Jon Cooler',
}

/** Storage seeded with a CONNECTED jira connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never calls
 *  the real fetchJira — the widget renders straight from cache, no network. */
async function seededStorage(config: JiraConfig, data: JiraData | null = DATA): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { jira: config })
  if (data) await storage.set('connectorSnapshots', { jira: { fetchedAt: Date.now(), data } })
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <JiraWidget />
    </StorageProvider>,
  )
}

describe('JiraWidget', () => {
  it('renders issue rows plus the counts line from the seeded snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    await screen.findByText('AUR-12')
    expect(screen.getByText('Fix the flaky auth test on CI')).toBeTruthy()
    expect(screen.getByText('AUR-13')).toBeTruthy()
    expect(screen.getByText('Weather chip overlaps the bar at 800px wide')).toBeTruthy()
    // Counts line: first two statuses by count, descending.
    expect(screen.getByText('3 In Progress · 2 To Do')).toBeTruthy()
  })

  it('shows only one status in the counts line when only one is present', async () => {
    const storage = await seededStorage(CONNECTED, {
      issues: [{ key: 'AUR-1', summary: 'Solo', status: 'To Do', url: 'https://yoursite.atlassian.net/browse/AUR-1' }],
      counts: { 'To Do': 1 },
    })
    mount(storage)
    await screen.findByText('AUR-1')
    expect(screen.getByText('1 To Do')).toBeTruthy()
  })

  it('hides the counts line when there are no issues', async () => {
    const storage = await seededStorage(CONNECTED, { issues: [], counts: {} })
    mount(storage)
    expect(await screen.findByText('Nothing assigned to you.')).toBeTruthy()
    expect(screen.queryByText(/·/)).toBeNull()
  })

  it('shows the empty-connected copy when connected but nothing is assigned', async () => {
    const storage = await seededStorage(CONNECTED, { issues: [], counts: {} })
    mount(storage)
    expect(await screen.findByText('Nothing assigned to you.')).toBeTruthy()
  })

  it('caps issue rows at 5', async () => {
    const many: JiraData = {
      issues: Array.from({ length: 8 }, (_, i) => ({
        key: `AUR-${i}`,
        summary: `Issue ${i}`,
        status: 'To Do',
        url: `https://yoursite.atlassian.net/browse/AUR-${i}`,
      })),
      counts: { 'To Do': 8 },
    }
    const storage = await seededStorage(CONNECTED, many)
    mount(storage)
    await screen.findByText('AUR-0')
    expect(screen.queryByText('AUR-5')).toBeNull()
  })

  it('each row is an external link (target=_blank, rel carries noopener + noreferrer, href + title intact)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    const link = (await screen.findByText('Fix the flaky auth test on CI')).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://yoursite.atlassian.net/browse/AUR-12')
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(link.getAttribute('title')).toBe('Fix the flaky auth test on CI')
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    // The gate returns before useConnectorSnapshot mounts, so no refresh wrote a
    // snapshot — the "zero hooks in the gate" proof.
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })

  it('renders nothing when enabled but no email is present (reconnect state)', async () => {
    const storage = await seededStorage({ ...CONNECTED, email: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })

  it('renders nothing when enabled but no apiToken is present (reconnect state)', async () => {
    const storage = await seededStorage({ ...CONNECTED, apiToken: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })

  it('renders nothing when enabled + credentials present but site is missing/empty', async () => {
    const storage = await seededStorage({ ...CONNECTED, site: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no site/email/apiToken fields — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { jira: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })
})
