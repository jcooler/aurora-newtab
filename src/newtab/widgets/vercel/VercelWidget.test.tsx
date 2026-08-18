// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { VercelData } from '../../../services/connectors/vercel'
import type { VercelConfig } from '../../../services/connectors/types'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import VercelWidget from './VercelWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives across
// cases; reset it so one test's refresh can't dedupe the next (same discipline
// as every other connector widget test).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

// Fixed "now" the widget's own Date.now() call resolves to for every test in
// this file — makes relAge's output (rendered, not just internally computed)
// deterministic without touching vercel.test.ts's own pure boundary-math
// coverage of relAge itself.
const NOW = 1_700_000_000_000

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})
afterEach(() => {
  vi.mocked(Date.now).mockRestore()
})

const DATA: VercelData = {
  deployments: [
    // Deliberately NOT createdAt-sorted here — this is what fetchVercel's own
    // sortDeployments would have already produced (ERROR first, then
    // createdAt desc), and the widget must render it AS-IS rather than
    // re-sorting, so seeding it out of naive chronological order is what
    // actually falsifies "the widget trusts the service's order".
    { project: 'api-broken', state: 'ERROR', url: 'https://vercel.com/acme/api/err1', createdAt: NOW - 3_600_000 }, // 1h old, but ERROR sorts first
    { project: 'web-app', state: 'READY', url: 'https://vercel.com/acme/web/dep1', createdAt: NOW - 180_000 }, // 3m old
    { project: 'docs-site', state: 'BUILDING', url: 'https://vercel.com/acme/docs/dep2', createdAt: NOW - 86_400_000 }, // 1d old
  ],
}

const CONNECTED: VercelConfig = { enabled: true, token: 'vc_x', username: 'jon' }

/** Storage seeded with a CONNECTED vercel connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never calls
 *  the real fetchVercel — the widget renders straight from cache, no network. */
async function seededStorage(
  config: VercelConfig,
  data: VercelData | null = DATA,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { vercel: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      vercel: { scope: await connectorSnapshotScope('vercel', config), fetchedAt: Date.now(), data },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, canvasSize?: 'compact' | 'standard' | 'full') {
  return render(
    <StorageProvider storage={storage}>
      <VercelWidget canvasSize={canvasSize} />
    </StorageProvider>,
  )
}

describe('VercelWidget', () => {
  it('Docked renders one dense line from the same snapshot and no card (NL-P5 batch 2)', async () => {
    const storage = await seededStorage(CONNECTED)
    render(
      <StorageProvider storage={storage}>
        <VercelWidget docked />
      </StorageProvider>,
    )
    const line = await screen.findByLabelText('Vercel: 1 failure, 3 deployments')
    expect(line.getAttribute('data-dock-line')).toBe('')
    expect(line.getAttribute('data-work-pulse-summary')).toBeNull()
    // The dense line replaces the card entirely — no deployment rows.
    expect(screen.queryByText('api-broken')).toBeNull()
  })

  it('Compact keeps a real deployment health primary value and never claims there are no deployments', async () => {
    mount(await seededStorage(CONNECTED, DATA), 'compact')
    expect(await screen.findByLabelText('Vercel: 1 failure, 3 deployments')).toBeTruthy()
    expect(screen.queryByText('No deployments yet.')).toBeNull()
  })
  it('renders deployment rows (project, state chip, relative age) from the seeded snapshot, failed-first', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    await screen.findByText('api-broken')
    const rows = [...document.querySelectorAll('section[aria-label="Vercel"] li')]
    expect(rows.map((r) => r.querySelector('a')?.getAttribute('title'))).toEqual([
      'api-broken',
      'web-app',
      'docs-site',
    ])
    expect(screen.getByText('ERROR')).toBeTruthy()
    expect(screen.getByText('READY')).toBeTruthy()
    expect(screen.getByText('BUILDING')).toBeTruthy()
    expect(screen.getByText('1h')).toBeTruthy()
    expect(screen.getByText('3m')).toBeTruthy()
    expect(screen.getByText('1d')).toBeTruthy()
    expect(screen.getByLabelText('Vercel: 1 failure, 3 deployments').getAttribute('data-work-pulse-tone')).toBe('critical')
  })

  it('the failed-first order is exactly the DOM order (ERROR row precedes a chronologically-newer READY row)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    await screen.findByText('api-broken')

    const projects = [...document.querySelectorAll('section[aria-label="Vercel"] li span.font-medium')].map(
      (el) => el.textContent,
    )
    expect(projects[0]).toBe('api-broken') // the ERROR row, despite being 1h old
    expect(projects[1]).toBe('web-app') // the newest READY row, right behind it
  })

  it('colors the state chip: READY emerald, ERROR red, everything else muted', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    await screen.findByText('api-broken')

    const errorChip = screen.getByText('ERROR')
    const readyChip = screen.getByText('READY')
    const buildingChip = screen.getByText('BUILDING')
    expect(errorChip.className).toContain('text-red-400')
    expect(readyChip.className).toContain('text-emerald-300')
    expect(buildingChip.className).toContain('text-fg-muted')
  })

  it('shows the empty-connected copy exactly when connected but no deployments', async () => {
    const storage = await seededStorage(CONNECTED, { deployments: [] })
    mount(storage)
    expect(await screen.findByText('No deployments yet.')).toBeTruthy()
    expect(screen.getByLabelText('Vercel: No deployments').getAttribute('data-work-pulse-tone')).toBe('quiet')
  })

  it('caps rows at 5', async () => {
    const many: VercelData = {
      deployments: Array.from({ length: 8 }, (_, i) => ({
        project: `proj-${i}`,
        state: 'READY',
        url: `https://vercel.com/acme/proj-${i}/dep`,
        createdAt: NOW - i * 1000,
      })),
    }
    const storage = await seededStorage(CONNECTED, many)
    mount(storage)
    await screen.findByText('proj-0')
    expect(screen.queryByText('proj-5')).toBeNull()
  })

  it('each row is an external link (target=_blank, rel carries noopener + noreferrer, href + title intact)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    const link = (await screen.findByText('api-broken')).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://vercel.com/acme/api/err1')
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(link.getAttribute('title')).toBe('api-broken')
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    // The gate returns before useConnectorSnapshot mounts, so no refresh wrote a
    // snapshot — the "zero hooks in the gate" proof.
    expect((await storage.get('connectorSnapshots')).vercel).toBeUndefined()
  })

  it('renders nothing when enabled but no token is present (reconnect state)', async () => {
    const storage = await seededStorage({ enabled: true, token: '', username: 'jon' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).vercel).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no token field — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { vercel: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).vercel).toBeUndefined()
  })
})

// ── Task 75: the composed card (status summary) + no-husk law ──

const SUMMARY_DATA: VercelData = {
  deployments: [
    // Scrambled order — NOT the fixed READY/ERROR/BUILDING presentation
    // order, NOT count-sorted, NOT chronological — so a passing order
    // assertion actually falsifies "the summary derives its order from
    // STATE_ORDER", not from the array's own order or from count.
    { project: 'svc-building', state: 'BUILDING', url: 'https://vercel.com/x/building/1', createdAt: 1 },
    { project: 'svc-ready-1', state: 'READY', url: 'https://vercel.com/x/ready1/2', createdAt: 2 },
    { project: 'svc-error', state: 'ERROR', url: 'https://vercel.com/x/error/3', createdAt: 3 },
    { project: 'svc-ready-2', state: 'READY', url: 'https://vercel.com/x/ready2/4', createdAt: 4 },
    { project: 'svc-ready-3', state: 'READY', url: 'https://vercel.com/x/ready3/5', createdAt: 5 },
  ],
}

const SUMMARY_ON: VercelConfig = { ...CONNECTED, views: { deployments: true, statusSummary: true } }
const SUMMARY_ONLY: VercelConfig = { ...CONNECTED, views: { deployments: false, statusSummary: true } }
const DEPLOYMENTS_ONLY: VercelConfig = { ...CONNECTED, views: { deployments: true, statusSummary: false } }
const BOTH_OFF: VercelConfig = { ...CONNECTED, views: { deployments: false, statusSummary: false } }

describe('VercelWidget — composed card (wave 2)', () => {
  it('the status summary reads counts in the fixed READY -> ERROR -> BUILDING order, lowercased — not the array\'s own order, not count-sorted', async () => {
    mount(await seededStorage(SUMMARY_ON, SUMMARY_DATA))
    await screen.findByText('3 ready')
    expect(screen.getByText('1 error')).toBeTruthy()
    expect(screen.getByText('1 building')).toBeTruthy()
    const html = (document.querySelector('section[aria-label="Vercel"]') as HTMLElement).innerHTML
    expect(html.indexOf('3 ready')).toBeLessThan(html.indexOf('1 error'))
    expect(html.indexOf('1 error')).toBeLessThan(html.indexOf('1 building'))
  })

  it('colors only the ERROR segment in the danger tone; READY/BUILDING stay muted (deliberately NOT stateClass\'s emerald-for-READY)', async () => {
    mount(await seededStorage(SUMMARY_ON, SUMMARY_DATA))
    const error = await screen.findByText('1 error')
    const ready = screen.getByText('3 ready')
    const building = screen.getByText('1 building')
    expect(error.className).toContain('text-red-400')
    expect(ready.className).not.toContain('text-red-400')
    expect(ready.className).not.toContain('text-emerald-300')
    expect(building.className).not.toContain('text-red-400')
  })

  it('omits zero-count states (no QUEUED/CANCELED entries in this fixture)', async () => {
    mount(await seededStorage(SUMMARY_ON, SUMMARY_DATA))
    await screen.findByText('3 ready')
    expect(screen.queryByText(/queued/i)).toBeNull()
    expect(screen.queryByText(/canceled/i)).toBeNull()
  })

  it('the summary line renders ABOVE the deployment rows (order: summary -> rows)', async () => {
    mount(await seededStorage(SUMMARY_ON, SUMMARY_DATA))
    await screen.findByText('3 ready')
    const html = (document.querySelector('section[aria-label="Vercel"]') as HTMLElement).innerHTML
    expect(html.indexOf('3 ready')).toBeLessThan(html.indexOf('<ul'))
  })

  it('the summary derives from the UNSLICED deployments array — stays honest with the rows section OFF', async () => {
    mount(await seededStorage(SUMMARY_ONLY, SUMMARY_DATA))
    expect(await screen.findByText('3 ready')).toBeTruthy()
    // deployments off -> no rows list rendered at all, even though the
    // summary counted every one of them.
    expect(document.querySelector('section[aria-label="Vercel"] ul')).toBeNull()
  })

  it('deployments-only (statusSummary off) → no summary line, rows render exactly as wave 1', async () => {
    mount(await seededStorage(DEPLOYMENTS_ONLY, SUMMARY_DATA))
    await screen.findByText('svc-error')
    expect(screen.queryByText('1 error')).toBeNull()
    expect(screen.queryByText('3 ready')).toBeNull()
  })

  // ── No-husk law ──

  it('both views off → renders null (never a bare "Vercel" heading)', async () => {
    const { container } = mount(await seededStorage(BOTH_OFF, SUMMARY_DATA))
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('statusSummary-only with NO deployments → renders null', async () => {
    const { container } = mount(await seededStorage(SUMMARY_ONLY, { deployments: [] }))
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('statusSummary-only WITH deployments present → the card renders (the summary line carries it, no rows, no empty line)', async () => {
    mount(await seededStorage(SUMMARY_ONLY, SUMMARY_DATA))
    expect(await screen.findByText('3 ready')).toBeTruthy()
    expect(document.querySelector('section[aria-label="Vercel"] ul')).toBeNull()
    expect(screen.queryByText('No deployments yet.')).toBeNull()
  })
})

// ── Fix wave, Finding I2: the left-column-crowded reveal tier ──
// vercel is the left column's lowest card, stacked below ics and rss — at
// their OWN true display maxes (5 calendars, rss shownCount 8) the combined
// column overlaps the Notes pill once vercel's statusSummary line is also on
// (measured, real Chromium: 836 vs pillTop 846 at 900h, only 10px clear — 6px
// short of the 16px floor; a real overlap at the 865 dense fencepost). Fixed
// by raising vercel's OWN reveal threshold to `roomy` (995h) whenever BOTH
// `statusSummary` is on AND the column is genuinely crowded (ics AND rss both
// enabled — VercelWidget.tsx's own `leftColumnCrowded`, a conservative
// enabled-state read, not each sibling's own row count). These pin the CLASS
// SELECTION only — scripts/preview.mjs pins the real pixel fenceposts.

async function seededMulti(
  vercel: VercelConfig,
  data: VercelData | null,
  siblings: Record<string, unknown> = {},
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { vercel, ...siblings })
  if (data) {
    await storage.set('connectorSnapshots', {
      vercel: { scope: await connectorSnapshotScope('vercel', vercel), fetchedAt: Date.now(), data },
    })
  }
  return storage
}

const ICS_SIBLING = { enabled: true, calendars: [{ name: 'Personal', url: 'https://calendar.example.com/personal.ics' }] }
const RSS_SIBLING = { enabled: true, feeds: ['https://example.com/feed'], shownCount: 8 }

const vercelSection = () => document.querySelector('section[aria-label="Vercel"]') as HTMLElement
const hasRoomyTier = (el: HTMLElement) => el.classList.contains('hidden') && el.className.includes('roomy:block')

describe('VercelWidget — left-column-crowded reveal tier (Task 77 fix wave, Finding I2)', () => {
  it('statusSummary on, no ics/rss siblings at all → untiered (matches the Task 77 "vercel alone" composition — safe at every height without them)', async () => {
    mount(await seededStorage(SUMMARY_ON, SUMMARY_DATA))
    await screen.findByText('3 ready')
    expect(hasRoomyTier(vercelSection())).toBe(false)
  })

  it('statusSummary on, only ics enabled (no rss) → still untiered (BOTH siblings are required to threaten the floor)', async () => {
    mount(await seededMulti(SUMMARY_ON, SUMMARY_DATA, { ics: ICS_SIBLING }))
    await screen.findByText('3 ready')
    expect(hasRoomyTier(vercelSection())).toBe(false)
  })

  it('statusSummary on, only rss enabled (no ics) → still untiered', async () => {
    mount(await seededMulti(SUMMARY_ON, SUMMARY_DATA, { rss: RSS_SIBLING }))
    await screen.findByText('3 ready')
    expect(hasRoomyTier(vercelSection())).toBe(false)
  })

  it('statusSummary on with both former rail siblings stays represented without a height tier', async () => {
    mount(await seededMulti(SUMMARY_ON, SUMMARY_DATA, { ics: ICS_SIBLING, rss: RSS_SIBLING }))
    await screen.findByText('3 ready')
    expect(hasRoomyTier(vercelSection())).toBe(false)
  })

  it('statusSummary OFF, both ics and rss enabled → still untiered (the default path stays byte-identical — only statusSummary can ever trigger this tier)', async () => {
    mount(await seededMulti(DEPLOYMENTS_ONLY, SUMMARY_DATA, { ics: ICS_SIBLING, rss: RSS_SIBLING }))
    await screen.findByText('svc-error')
    expect(hasRoomyTier(vercelSection())).toBe(false)
  })
})
