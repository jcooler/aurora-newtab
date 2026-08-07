// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { Headline } from '../../../services/connectors/rss'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import RssWidget from './RssWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives across
// cases; reset it so one test's refresh can't dedupe the next (same discipline
// as useConnectorSnapshot.test.tsx).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const HEADLINES: Headline[] = [
  { source: 'Hacker News', title: 'First headline about ships', url: 'https://news.ycombinator.com/item?id=1', publishedAt: 30 },
  { source: 'The Verge', title: 'Second headline about robots', url: 'https://www.theverge.com/2', publishedAt: 20 },
  { source: 'Ars Technica', title: 'Third headline about space', url: 'https://arstechnica.com/3', publishedAt: 10 },
]

/** A storage seeded with an ENABLED rss connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never calls
 *  the real fetchHeadlines — the widget renders straight from cache, no
 *  network. */
async function seededStorage(
  config: { enabled: boolean; feeds: string[]; shownCount: number },
  data: Headline[] | null = HEADLINES,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { rss: config })
  if (data) await storage.set('connectorSnapshots', { rss: { fetchedAt: Date.now(), data } })
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <RssWidget />
    </StorageProvider>,
  )
}

describe('RssWidget', () => {
  it('renders up to shownCount headlines from the seeded snapshot, newest first', async () => {
    const storage = await seededStorage({ enabled: true, feeds: ['https://news.ycombinator.com/rss'], shownCount: 2 })
    mount(storage)

    await screen.findByText('First headline about ships')
    expect(screen.getByText('Second headline about robots')).toBeTruthy()
    // shownCount is 2, so the third row is capped by construction.
    expect(screen.queryByText('Third headline about space')).toBeNull()

    // The source label rides alongside each rendered headline.
    expect(screen.getByText('Hacker News')).toBeTruthy()
    expect(screen.getByText('The Verge')).toBeTruthy()
  })

  it("each headline is an external link (target=_blank, rel carries noopener + noreferrer)", async () => {
    const storage = await seededStorage({ enabled: true, feeds: ['https://news.ycombinator.com/rss'], shownCount: 5 })
    mount(storage)

    const link = (await screen.findByText('First headline about ships')).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://news.ycombinator.com/item?id=1')
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    // Full title on a title attribute so a truncated row is still recoverable.
    expect(link.getAttribute('title')).toBe('First headline about ships')
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled (gate short-circuits before the hook)', async () => {
    const storage = await seededStorage({ enabled: false, feeds: ['https://news.ycombinator.com/rss'], shownCount: 5 }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    // The gate returns before useConnectorSnapshot mounts, so no refresh ever
    // wrote a snapshot — the established "zero hooks in the gate" proof.
    expect((await storage.get('connectorSnapshots')).rss).toBeUndefined()
  })

  it('renders nothing — and never runs the snapshot refresh — when enabled but no feeds are configured', async () => {
    const storage = await seededStorage({ enabled: true, feeds: [], shownCount: 5 }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).rss).toBeUndefined()
  })

  it('renders nothing when enabled with feeds but the snapshot has no headlines yet', async () => {
    const storage = await seededStorage({ enabled: true, feeds: ['https://news.ycombinator.com/rss'], shownCount: 5 }, [])
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no feeds array — renders nothing, never throws', async () => {
    // Backup import validates connector configs only structurally (`enabled`
    // alone), so this shape can legally reach storage. The gate's
    // Array.isArray check is what stands between it and a render throw.
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { rss: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).rss).toBeUndefined()
  })
})
