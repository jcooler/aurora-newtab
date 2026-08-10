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

  it('trims to the first RSS_SHORT_ROWS (4) rows on the short tier: rows past the 4th carry short:hidden, the first four do not (re-derived with the compact card — 4 compact rows clear the Notes pill by 35px at the 451 short floor)', async () => {
    // Six headlines so there are rows beyond the 4-row short cap. jsdom has no
    // media queries, so this pins the class WIRING; the live 451h no-overlap +
    // pill-clickable proof is scripts/preview.mjs's rail probe.
    const six: Headline[] = [0, 1, 2, 3, 4, 5].map((i) => ({
      source: `Src ${i}`,
      title: `Row ${i} headline`,
      url: `https://example.com/${i}`,
      publishedAt: 50 - i,
    }))
    const storage = await seededStorage(
      { enabled: true, feeds: ['https://news.ycombinator.com/rss'], shownCount: 8 },
      six,
    )
    const { container } = mount(storage)
    await screen.findByText('Row 0 headline')
    const rows = [...container.querySelectorAll('li')]
    expect(rows.length).toBe(6)
    // First four always visible; rows 5th+ drop on short (row-level, so the
    // card CONDENSES rather than disappearing entirely — headlines survive short).
    expect(rows[0].className).toBe('')
    expect(rows[3].className).toBe('')
    expect(rows[4].classList.contains('short:hidden')).toBe(true)
    expect(rows[5].classList.contains('short:hidden')).toBe(true)
  })

  it('does NOT trim on the mid tier anymore: the compact (dense) 8-row card fits the 601px mid floor with 41px to spare, so no row carries mid:hidden (RSS_MID_ROWS raised to the display max)', async () => {
    // Eight headlines (RSS's display max, shownCount:8). jsdom has no media
    // queries, so this pins the class WIRING; the live 601h no-overlap +
    // pill-clickable proof is the mid-height and resize-sweep probes in
    // scripts/preview.mjs.
    const eight: Headline[] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      source: `Src ${i}`,
      title: `Row ${i} headline`,
      url: `https://example.com/${i}`,
      publishedAt: 50 - i,
    }))
    const storage = await seededStorage(
      { enabled: true, feeds: ['https://news.ycombinator.com/rss'], shownCount: 8 },
      eight,
    )
    const { container } = mount(storage)
    await screen.findByText('Row 0 headline')
    const rows = [...container.querySelectorAll('li')]
    expect(rows.length).toBe(8)
    // NO row carries mid:hidden — the compact card shows every headline on mid
    // (the deploys card below it yields on dense instead, freeing the room).
    for (let i = 0; i < 8; i++) expect(rows[i].classList.contains('mid:hidden')).toBe(false)
    // The short trim still applies to rows past the 4th (a disjoint tier).
    expect(rows[3].classList.contains('short:hidden')).toBe(false)
    expect(rows[4].classList.contains('short:hidden')).toBe(true)
    expect(rows[7].classList.contains('short:hidden')).toBe(true)
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
