// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { GithubData } from '../../../services/connectors/github'
import type { GithubConfig } from '../../../services/connectors/types'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import GithubWidget from './GithubWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives across
// cases; reset it so one test's refresh can't dedupe the next (same discipline
// as RssWidget.test.tsx).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const DATA: GithubData = {
  prs: [
    { title: 'Fix the flaky login test', url: 'https://github.com/acme/app/pull/12', repo: 'acme/app' },
    { title: 'Wire the new settings tab', url: 'https://github.com/acme/app/pull/13', repo: 'acme/app' },
  ],
  issues: [{ title: 'Crash on cold start', url: 'https://github.com/acme/web/issues/9', repo: 'acme/web' }],
  notifications: 3,
  etags: {},
}

const CONNECTED: GithubConfig = { enabled: true, token: 'github_pat_x', username: 'jon' }

/** Storage seeded with a CONNECTED github connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never calls
 *  the real fetchGithub — the widget renders straight from cache, no network. */
async function seededStorage(
  config: GithubConfig,
  data: GithubData | null = DATA,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { github: config })
  if (data) await storage.set('connectorSnapshots', { github: { fetchedAt: Date.now(), data } })
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <GithubWidget />
    </StorageProvider>,
  )
}

describe('GithubWidget', () => {
  it('renders PR and issue rows plus the unread count from the seeded snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    await screen.findByText('Fix the flaky login test')
    expect(screen.getByText('Wire the new settings tab')).toBeTruthy()
    expect(screen.getByText('Crash on cold start')).toBeTruthy()
    // Unread header chip.
    expect(screen.getByText('3 unread')).toBeTruthy()
    // Repo prefix rides above each title.
    expect(screen.getAllByText('acme/app').length).toBeGreaterThan(0)
    expect(screen.getByText('acme/web')).toBeTruthy()
  })

  it('renders "50+" unread at the cap', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, notifications: 50 })
    mount(storage)
    await screen.findByText('Fix the flaky login test')
    expect(screen.getByText('50+ unread')).toBeTruthy()
  })

  it('hides the unread row when notifications is null (endpoint unavailable)', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, notifications: null })
    mount(storage)
    await screen.findByText('Fix the flaky login test')
    expect(screen.queryByText(/unread/)).toBeNull()
  })

  it('hides the unread row when the count is zero (all caught up)', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, notifications: 0 })
    mount(storage)
    await screen.findByText('Fix the flaky login test')
    expect(screen.queryByText(/unread/)).toBeNull()
  })

  // Caps added/lowered (Task 55 fix round): this is a glance panel sharing
  // the right column's ~630px budget with gitlab's and jira's own cards (see
  // GithubWidget.tsx's own MAX_PRS/MAX_ISSUES comment). Seeds cap+1 of each
  // so a regression back to a looser cap (or no cap) fails visibly.
  it('caps PR rows at 3', async () => {
    const many: GithubData = {
      prs: Array.from({ length: 4 }, (_, i) => ({
        title: `PR ${i}`,
        url: `https://github.com/o/r/pull/${i}`,
        repo: 'o/r',
      })),
      issues: [],
      notifications: 0,
      etags: {},
    }
    const storage = await seededStorage(CONNECTED, many)
    mount(storage)
    await screen.findByText('PR 0')
    expect(screen.getByText('PR 2')).toBeTruthy()
    expect(screen.queryByText('PR 3')).toBeNull()
  })

  it('caps issue rows at 2', async () => {
    const many: GithubData = {
      prs: [],
      issues: Array.from({ length: 3 }, (_, i) => ({
        title: `Issue ${i}`,
        url: `https://github.com/o/r/issues/${i}`,
        repo: 'o/r',
      })),
      notifications: 0,
      etags: {},
    }
    const storage = await seededStorage(CONNECTED, many)
    mount(storage)
    await screen.findByText('Issue 0')
    expect(screen.getByText('Issue 1')).toBeTruthy()
    expect(screen.queryByText('Issue 2')).toBeNull()
  })

  it('shows the celebratory empty line when connected but nothing is waiting', async () => {
    const storage = await seededStorage(CONNECTED, { prs: [], issues: [], notifications: 0, etags: {} })
    mount(storage)
    expect(await screen.findByText('No PRs waiting on you 🎉')).toBeTruthy()
  })

  it('each row is an external link (target=_blank, rel carries noopener + noreferrer, href + title intact)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    const link = (await screen.findByText('Fix the flaky login test')).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://github.com/acme/app/pull/12')
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(link.getAttribute('title')).toBe('Fix the flaky login test')
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    // The gate returns before useConnectorSnapshot mounts, so no refresh wrote a
    // snapshot — the "zero hooks in the gate" proof.
    expect((await storage.get('connectorSnapshots')).github).toBeUndefined()
  })

  it('renders nothing when enabled but no token is present (reconnect state)', async () => {
    const storage = await seededStorage({ enabled: true, token: '', username: 'jon' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).github).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no token field — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { github: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).github).toBeUndefined()
  })
})
