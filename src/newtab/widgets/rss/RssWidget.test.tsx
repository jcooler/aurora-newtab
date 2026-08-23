// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { WidgetVariant } from '../../../lib/layout/types'
vi.mock('../../../services/connectors/rss', async (importActual) => {
  const actual = await importActual<typeof import('../../../services/connectors/rss')>()
  return { ...actual, fetchHeadlines: vi.fn(actual.fetchHeadlines) }
})
import { fetchHeadlines, type Headline } from '../../../services/connectors/rss'
import type { RssConfig } from '../../../services/connectors/types'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import RssWidget from './RssWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives across
// cases; reset it so one test's refresh can't dedupe the next (same discipline
// as useConnectorSnapshot.test.tsx).
beforeEach(() => {
  __resetInFlight()
  vi.mocked(fetchHeadlines).mockReset()
})
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
  config: RssConfig,
  data: Headline[] | null = HEADLINES,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { rss: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      rss: {
        scope: await connectorSnapshotScope('rss', config),
        fetchedAt: Date.now(),
        data,
      },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, stageVariant: WidgetVariant = 'expanded') {
  return render(
    <StorageProvider storage={storage}>
      <RssWidget stageVariant={stageVariant} />
    </StorageProvider>,
  )
}

describe('RssWidget', () => {
  it('Docked renders one dense line with the first headline and no card (NL-P5 batch 2)', async () => {
    const config: RssConfig = { enabled: true, feeds: ['https://feeds.example/a'], shownCount: 5 }
    const storage = await seededStorage(config)
    render(
      <StorageProvider storage={storage}>
        <RssWidget docked />
      </StorageProvider>,
    )
    const line = await screen.findByLabelText('Headlines: First headline about ships')
    expect(line.getAttribute('data-dock-line')).toBe('')
    // The dense line replaces the card entirely — no other rows, no source labels.
    expect(screen.queryByText('Second headline about robots')).toBeNull()
    expect(screen.queryByText('Hacker News')).toBeNull()
  })

  it.each([
    ['compact', 'compact', 1],
    ['standard', 'standard', 4],
    ['expanded', 'full', 6],
  ] as const)('uses the exact %s authored frame with bounded linked headlines', async (stageVariant, tier, expectedRows) => {
    const headlines = Array.from({ length: 10 }, (_, i): Headline => ({
      source: `Source ${i}`,
      title: `Framed headline ${i}`,
      url: `https://example.com/framed-${i}`,
      publishedAt: 100 - i,
    }))
    mount(await seededStorage({ enabled: true, feeds: ['https://example.com/feed'], shownCount: 10 }, headlines), stageVariant)
    await screen.findByText('Framed headline 0')
    const frame = screen.getByRole('region', { name: 'Headlines' })
    expect(frame.getAttribute('data-tier-frame')).toBe(tier)
    expect(frame.getAttribute('data-tier-frame-state')).toBe('ready')
    expect(frame.querySelectorAll('li')).toHaveLength(expectedRows)
    expect(frame.querySelectorAll('li a')).toHaveLength(expectedRows)
    expect(frame.className).not.toMatch(/overflow-(?:y-)?(?:auto|scroll)/)
    expect(frame.querySelector('[class*="overflow-y-auto"], [class*="overflow-y-scroll"]')).toBeNull()
  })

  it('drops feed A immediately while a preserved mount waits for feed B', async () => {
    const configForA: RssConfig = {
      enabled: true,
      feeds: ['https://feeds.example/a'],
      shownCount: 5,
    }
    const configForB: RssConfig = {
      enabled: true,
      feeds: ['https://feeds.example/b'],
      shownCount: 5,
    }
    const headlineA: Headline = {
      source: 'Feed A',
      title: 'Account A headline',
      url: 'https://news.example/a',
      publishedAt: 1,
    }
    const headlineB: Headline = {
      source: 'Feed B',
      title: 'Account B headline',
      url: 'https://news.example/b',
      publishedAt: 2,
    }
    let resolveB!: (value: Headline[]) => void
    vi.mocked(fetchHeadlines).mockReturnValue(
      new Promise((resolve) => {
        resolveB = resolve
      }),
    )
    const storage = await seededStorage(configForA, [headlineA])
    mount(storage)
    await screen.findByText(headlineA.title)

    await act(async () => {
      await storage.set('connectors', { rss: configForB })
    })

    expect(screen.queryByText(headlineA.title)).toBeNull()
    expect(screen.queryByText(headlineB.title)).toBeNull()
    await waitFor(() => {
      expect(fetchHeadlines).toHaveBeenCalledWith(configForB.feeds, configForB.shownCount)
    })

    await act(async () => {
      resolveB([headlineB])
    })
    expect(await screen.findByText(headlineB.title)).toBeTruthy()
  })

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

  it('progresses from prioritized headlines to a fuller configured feed by allocation variant', async () => {
    const eight: Headline[] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      source: `Src ${i}`,
      title: `Variant ${i} headline`,
      url: `https://example.com/variant-${i}`,
      publishedAt: 50 - i,
    }))
    const storage = await seededStorage(
      { enabled: true, feeds: ['https://news.ycombinator.com/rss'], shownCount: 8 },
      eight,
    )
    const view = mount(storage, 'compact')
    await screen.findByText('Variant 0 headline')
    expect(document.querySelectorAll('section[aria-label="Headlines"] li')).toHaveLength(1)

    view.rerender(<StorageProvider storage={storage}><RssWidget stageVariant="standard" /></StorageProvider>)
    expect(document.querySelectorAll('section[aria-label="Headlines"] li')).toHaveLength(4)

    view.rerender(<StorageProvider storage={storage}><RssWidget stageVariant="expanded" /></StorageProvider>)
    expect([...document.querySelectorAll('section[aria-label="Headlines"] li a')].map((row) => row.getAttribute('href'))).toEqual(
      eight.slice(0, 6).map(({ url }) => url),
    )
  })

  it('uses the Full frame cap for six configured headlines and routes each visible row to its article', async () => {
    const ten: Headline[] = Array.from({ length: 10 }, (_, i) => ({
      source: 'Example',
      title: `Full headline ${i}`,
      url: `https://example.test/${i}`,
      publishedAt: 50 - i,
    }))
    const storage = await seededStorage(
      { enabled: true, feeds: ['https://news.ycombinator.com/rss'], shownCount: 10 },
      ten,
    )
    mount(storage, 'expanded')

    await screen.findByText('Full headline 0')
    expect(document.querySelectorAll('section[aria-label="Headlines"] li')).toHaveLength(6)
    expect(screen.queryByText('Full headline 6')).toBeNull()
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
