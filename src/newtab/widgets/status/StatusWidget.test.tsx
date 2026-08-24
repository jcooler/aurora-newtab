// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { StatusData } from '../../../services/connectors/status'
import type { StatusConfig } from '../../../services/connectors/types'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { WidgetPresentationMode } from '../../widgetRenderers'
import StatusWidget from './StatusWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives
// across cases; reset it so one test's refresh can't dedupe the next — same
// discipline as every other connector widget test (CryptoWidget.test.tsx's
// own idiom, the Task 84 brief's named template).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const CONNECTED: StatusConfig = {
  enabled: true,
  services: [
    { name: 'GitHub', url: 'https://www.githubstatus.com/api/v2/status.json' },
    { name: 'Cloudflare', url: 'https://www.cloudflarestatus.com/api/v2/status.json' },
  ],
}

const ALL_GREEN: StatusData = {
  services: [
    { name: 'GitHub', indicator: 'none', description: 'All Systems Operational' },
    { name: 'Cloudflare', indicator: 'none', description: 'All Systems Operational' },
  ],
}

/** Storage seeded with a CONNECTED status connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never
 *  calls the real fetchStatus — the widget renders straight from cache, no
 *  network. Same idiom as CryptoWidget.test.tsx's own seededStorage. */
async function seededStorage(
  config: StatusConfig,
  data: StatusData | null = ALL_GREEN,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { status: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      status: { scope: await connectorSnapshotScope('status', config), fetchedAt: Date.now(), data },
    })
  }
  return storage
}

function mount(
  storage: AuroraStorage,
  canvasSize: CanvasSize = 'standard',
  presentation: WidgetPresentationMode = 'stack',
) {
  return render(
    <StorageProvider storage={storage}>
      <StatusWidget canvasSize={canvasSize} presentation={presentation} />
    </StorageProvider>,
  )
}

async function readyFrame() {
  await waitFor(() => expect(screen.getByRole('region', { name: 'Service status' }).getAttribute('data-tier-frame-state')).toBe('ready'))
  return screen.getByRole('region', { name: 'Service status' })
}

describe('StatusWidget — gate (zero-hooks-in-the-gate, no-husk law)', () => {
  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).status).toBeUndefined()
  })

  it('renders nothing when enabled but no services are configured', async () => {
    const storage = await seededStorage({ enabled: true, services: [] }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).status).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no services field — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { status: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).status).toBeUndefined()
  })

  it('positive twin: enabled with services present renders the section (not null)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const section = await screen.findByRole('region', { name: 'Service status' })
    expect(section).toBeTruthy()
  })
})

describe('StatusWidget — DOM contract', () => {
  it('renders free Service status as intrinsic text without a tier card', async () => {
    mount(await seededStorage(CONNECTED, ALL_GREEN), 'standard', 'free')
    await screen.findByText('GitHub')
    const status = await screen.findByRole('region', { name: 'Service status' })
    expect(status.getAttribute('data-service-status-surface')).toBe('intrinsic')
    expect(status.closest('[data-tier-frame]')).toBeNull()
    expect(within(status).getByText('GitHub')).toBeTruthy()
    expect(within(status).getByText('Cloudflare')).toBeTruthy()
    expect(within(status).getByRole('button', { name: 'Service status details' })).toBeTruthy()
  })

  it('keeps Service status in an exact frame when it is a stack member', async () => {
    mount(await seededStorage(CONNECTED, ALL_GREEN), 'standard', 'stack')
    const status = await screen.findByRole('region', { name: 'Service status' })
    expect(status.getAttribute('data-tier-frame')).toBe('standard')
    expect(status.getAttribute('data-tier-surface')).toBe('card')
  })

  it('keeps free loading and empty states cardless', async () => {
    const loadingView = mount(await seededStorage(CONNECTED, null), 'standard', 'free')
    const loading = await screen.findByRole('region', { name: 'Service status' })
    expect(loading.getAttribute('data-service-status-surface')).toBe('intrinsic')
    expect(loading.closest('[data-tier-frame]')).toBeNull()
    loadingView.unmount()

    mount(await seededStorage(CONNECTED, { services: [] }), 'standard', 'free')
    const empty = await screen.findByRole('region', { name: 'Service status' })
    expect(empty.getAttribute('data-service-status-surface')).toBe('intrinsic')
    expect(empty.closest('[data-tier-frame]')).toBeNull()
  })

  it('preserves the exact frame while the first snapshot is loading', async () => {
    mount(await seededStorage(CONNECTED, null), 'compact')
    const frame = await screen.findByRole('region', { name: 'Service status' })
    expect(frame.getAttribute('data-tier-frame')).toBe('compact')
    expect(frame.getAttribute('data-tier-frame-state')).toBe('loading')
  })

  it.each(['compact', 'standard'] as const)('uses the exact %s frame with named service dots and no card scrollbar', async (tier) => {
    const storage = await seededStorage(CONNECTED, {
      services: [
        { name: 'GitHub', indicator: 'none', description: 'All systems operational' },
        { name: 'Vercel', indicator: 'minor', description: 'Elevated build latency' },
      ],
    })
    mount(storage, tier)
    const frame = await readyFrame()
    expect(frame.getAttribute('data-tier-frame')).toBe(tier)
    expect(frame.getAttribute('data-tier-frame-state')).toBe('ready')
    expect(frame.className).toContain(`tier-frame--${tier}`)
    expect(frame.className).not.toMatch(/overflow-(?:y-)?(?:auto|scroll)/)
    expect(frame.textContent).toContain('GitHub')
    expect(frame.textContent).toContain('Vercel')
    if (tier === 'standard') {
      const issue = screen.getByText('Vercel — Elevated build latency')
      expect(issue.className).not.toContain('hidden')
    }
  })

  it('routes bounded-card overflow through the existing service details panel', async () => {
    const storage = await seededStorage(CONNECTED, ALL_GREEN)
    mount(storage, 'standard')
    const trigger = await screen.findByRole('button', { name: 'Service status details' })
    await act(async () => { trigger.click() })
    const panel = screen.getByRole('dialog', { name: 'Service status details' })
    expect(panel.textContent).toContain('GitHub')
    expect(panel.textContent).toContain('Cloudflare')
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('dialog', { name: 'Service status details' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('names every service beside its dot so status reads without hovering (batch-2 owner review)', async () => {
    const storage = await seededStorage(CONNECTED, {
      services: [
        { name: 'GitHub', indicator: 'none', description: 'All systems operational' },
        { name: 'Vercel', indicator: 'minor', description: 'Elevated build latency' },
      ],
    })
    mount(storage, 'standard')
    const dots = await screen.findByTestId('status-dots')
    expect(dots.textContent).toContain('GitHub')
    expect(dots.textContent).toContain('Vercel')
    // Hover context stays: the dot's title carries state and description.
    expect(dots.querySelector('[title*="Elevated build latency"]')).toBeTruthy()
  })

  it('Docked renders clickable dots that open a per-service panel (owner direction 2026-08-21)', async () => {
    const storage = await seededStorage(CONNECTED, ALL_GREEN)
    render(
      <StorageProvider storage={storage}>
        <StatusWidget docked />
      </StorageProvider>,
    )
    // The dots ARE the readout: no summary text on the line itself, but the
    // button still NAMES the state for a screen reader.
    const line = await screen.findByRole('button', { name: 'Service status: All operational, 2 services' })
    expect(line.getAttribute('data-dock-line')).toBe('')
    expect(line.textContent).toBe('')
    expect(line.querySelectorAll('span[title]')).toHaveLength(2)
    // The dense line replaces the strip entirely — no heading, no section.
    expect(screen.queryByText('Service status')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()

    // ...and the detail a dense line cannot carry is one click away.
    await act(async () => { line.click() })
    const panel = screen.getByRole('dialog', { name: 'Service status details' })
    expect(panel.textContent).toContain('GitHub')
    expect(panel.textContent).toContain('Cloudflare')
    expect(panel.textContent).toContain('All Systems Operational')
    expect(line.getAttribute('aria-expanded')).toBe('true')

    await act(async () => { line.click() })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows named dots at every explicit framed size', async () => {
    const storage = await seededStorage(CONNECTED, ALL_GREEN)
    const view = mount(storage, 'compact')
    const compact = await readyFrame()
    // Compact still names each service; the exact frame bounds the row.
    expect(compact.querySelectorAll('span[title]')).toHaveLength(2)
    expect(compact.textContent).toContain('GitHub')
    expect(compact.querySelector('[title="GitHub: All Systems Operational"]')).toBeTruthy()

    view.rerender(<StorageProvider storage={storage}><StatusWidget canvasSize="standard" presentation="stack" /></StorageProvider>)
    const standard = await readyFrame()
    expect(standard.querySelectorAll('span[title]')).toHaveLength(2)
    expect(standard.textContent).toContain('GitHub')

    view.rerender(<StorageProvider storage={storage}><StatusWidget canvasSize="full" presentation="stack" /></StorageProvider>)
    const full = await readyFrame()
    expect(full.querySelectorAll('span[title]')).toHaveLength(2)
    expect(full.textContent).toContain('Cloudflare')
  })

  it('defaults an unqualified board render to the exact Standard frame', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const section = await readyFrame()
    expect(section.getAttribute('data-tier-frame')).toBe('standard')
    expect(section.className).toContain('tier-frame--standard')
  })

  it('renders one dot (span[title]) per service, index-aligned to the snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const section = await readyFrame()
    const dots = section.querySelectorAll('span[title]')
    expect(dots.length).toBe(2)
  })

  it('all-green renders dots only — zero <p> trouble lines', async () => {
    const storage = await seededStorage(CONNECTED, ALL_GREEN)
    mount(storage)
    const section = await readyFrame()
    expect(section.querySelectorAll('span[title]').length).toBe(2)
    expect(section.querySelectorAll('p').length).toBe(0)
    expect(screen.getByText('All operational, 2 services')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Service status' }).getAttribute('data-status-tone')).toBe('quiet')
  })

  it('keeps an empty frame when a configured status poll returns no services', async () => {
    mount(await seededStorage(CONNECTED, { services: [] }), 'standard')
    await waitFor(() => expect(screen.getByRole('region', { name: 'Service status' }).getAttribute('data-tier-frame-state')).toBe('empty'))
    expect(screen.getByText('No service results right now.')).toBeTruthy()
  })
})

describe('StatusWidget — dot color + title per indicator', () => {
  const MIXED: StatusData = {
    services: [
      { name: 'Alpha', indicator: 'none', description: 'All Systems Operational' },
      { name: 'Bravo', indicator: 'minor', description: 'Degraded Performance' },
      { name: 'Charlie', indicator: 'major', description: 'Partial Outage' },
      { name: 'Delta', indicator: 'critical', description: 'Major Outage' },
      { name: 'Echo', indicator: 'unknown', description: '' },
    ],
  }
  const CONNECTED_5: StatusConfig = {
    enabled: true,
    services: MIXED.services.map((s) => ({ name: s.name, url: `https://example.com/${s.name}.json` })),
  }

  it('none -> bg-emerald-400, title "{name}: {description}"', async () => {
    const storage = await seededStorage(CONNECTED_5, MIXED)
    mount(storage)
    const dot = await screen.findByTitle('Alpha: All Systems Operational')
    expect(dot.firstElementChild?.className).toContain('bg-emerald-400')
  })

  it('minor -> bg-amber-400, title "{name}: {description}"', async () => {
    const storage = await seededStorage(CONNECTED_5, MIXED)
    mount(storage)
    const dot = await screen.findByTitle('Bravo: Degraded Performance')
    expect(dot.firstElementChild?.className).toContain('bg-amber-400')
  })

  it('major -> bg-red-400, title "{name}: {description}"', async () => {
    const storage = await seededStorage(CONNECTED_5, MIXED)
    mount(storage)
    const dot = await screen.findByTitle('Charlie: Partial Outage')
    expect(dot.firstElementChild?.className).toContain('bg-red-400')
  })

  it('critical -> bg-red-400, title "{name}: {description}"', async () => {
    const storage = await seededStorage(CONNECTED_5, MIXED)
    mount(storage)
    const dot = await screen.findByTitle('Delta: Major Outage')
    expect(dot.firstElementChild?.className).toContain('bg-red-400')
    expect(screen.getByText('3 service issues, 5 services')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Service status' }).getAttribute('data-status-tone')).toBe('critical')
  })

  // FIX ROUND (post-Task 86, controller-approved): was `bg-fg-muted/40`
  // (panel-adaptive ink) — wrong axis for a strip that floats on the photo,
  // never a panel; now the fixed, theme-independent `-canvas-` family
  // (same discipline CryptoWidget.tsx's own zero-tint cell already uses).
  it('unknown -> bg-canvas-fg-muted/40 (fixed canvas ink, not panel-adaptive), title "{name}: unreachable"', async () => {
    const storage = await seededStorage(CONNECTED_5, MIXED)
    mount(storage)
    const dot = await screen.findByTitle('Echo: unreachable')
    expect(dot.firstElementChild?.className).toContain('bg-canvas-fg-muted/40')
  })
})

describe('StatusWidget — trouble lines', () => {
  it('unknown is NOT trouble: a gray dot renders, but no <p> line for it', async () => {
    const data: StatusData = {
      services: [
        { name: 'GitHub', indicator: 'none', description: 'All Systems Operational' },
        { name: 'Cloudflare', indicator: 'unknown', description: '' },
      ],
    }
    const storage = await seededStorage(CONNECTED, data)
    mount(storage)
    const section = await readyFrame()
    expect(section.querySelectorAll('span[title]').length).toBe(2)
    expect(section.querySelectorAll('p').length).toBe(0)
    expect(screen.getByText('1 unreachable, 2 services')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Service status' }).getAttribute('data-status-tone')).toBe('unknown')
  })

  it('keeps free trouble text visible at the owner witness size with photo shadow and danger tone', async () => {
    const data: StatusData = {
      services: [{ name: 'Bravo', indicator: 'critical', description: 'Major Outage' }],
    }
    const storage = await seededStorage(
      { enabled: true, services: [{ name: 'Bravo', url: 'https://example.com/b.json' }] },
      data,
    )
    mount(storage, 'standard', 'free')
    const line = await screen.findByText('Bravo — Major Outage')
    expect(line.tagName).toBe('P')
    expect(line.className).toContain('text-red-400')
    expect(line.className).toContain('text-photo')
    expect(line.className).not.toContain('hidden')
    expect(line.className).not.toContain('tallest:block')
  })

  it('worst-first ordering: critical > major > minor, regardless of configured order', async () => {
    const data: StatusData = {
      services: [
        { name: 'Alpha', indicator: 'minor', description: 'Degraded Performance' },
        { name: 'Bravo', indicator: 'critical', description: 'Major Outage' },
        { name: 'Charlie', indicator: 'major', description: 'Partial Outage' },
      ],
    }
    const storage = await seededStorage(
      {
        enabled: true,
        services: data.services.map((s) => ({ name: s.name, url: `https://example.com/${s.name}.json` })),
      },
      data,
    )
    mount(storage)
    await screen.findByText('Bravo — Major Outage')
    const section = document.querySelector('section[aria-label="Service status"]')!
    const lines = [...section.querySelectorAll('p')].map((p) => p.textContent)
    expect(lines).toEqual(['Bravo — Major Outage', 'Charlie — Partial Outage', 'Alpha — Degraded Performance'])
  })

  it('caps trouble lines at 3 with a 4-affected fixture, worst-first, ties keep configured order', async () => {
    const data: StatusData = {
      services: [
        { name: 'One', indicator: 'minor', description: 'd1' },
        { name: 'Two', indicator: 'major', description: 'd2' },
        { name: 'Three', indicator: 'critical', description: 'd3' },
        { name: 'Four', indicator: 'critical', description: 'd4' },
      ],
    }
    const storage = await seededStorage(
      {
        enabled: true,
        services: data.services.map((s) => ({ name: s.name, url: `https://example.com/${s.name}.json` })),
      },
      data,
    )
    mount(storage)
    await screen.findByText('Three — d3')
    const section = document.querySelector('section[aria-label="Service status"]')!
    const lines = [...section.querySelectorAll('p')].map((p) => p.textContent)
    // Three and Four both critical (tie -> configured order), Two is major,
    // One (minor) is dropped by the MAX_TROUBLE_LINES=3 cap.
    expect(lines).toEqual(['Three — d3', 'Four — d4', 'Two — d2'])
    expect(screen.queryByText('One — d1')).toBeNull()
  })
})
