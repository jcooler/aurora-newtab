// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { VercelData } from '../../../services/connectors/vercel'
import type { VercelConfig } from '../../../services/connectors/types'
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
  if (data) await storage.set('connectorSnapshots', { vercel: { fetchedAt: Date.now(), data } })
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <VercelWidget />
    </StorageProvider>,
  )
}

describe('VercelWidget', () => {
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
