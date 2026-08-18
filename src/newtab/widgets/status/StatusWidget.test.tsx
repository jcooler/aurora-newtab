// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { StatusData } from '../../../services/connectors/status'
import type { StatusConfig } from '../../../services/connectors/types'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
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

function mount(storage: AuroraStorage, canvasSize?: 'compact' | 'standard' | 'full') {
  return render(
    <StorageProvider storage={storage}>
      <StatusWidget canvasSize={canvasSize} />
    </StorageProvider>,
  )
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

  it('Docked renders one dense line from the same snapshot and no strip (NL-P5 batch 2)', async () => {
    const storage = await seededStorage(CONNECTED, ALL_GREEN)
    render(
      <StorageProvider storage={storage}>
        <StatusWidget docked />
      </StorageProvider>,
    )
    const line = await screen.findByLabelText('Service status: All operational, 2 services')
    expect(line.getAttribute('data-dock-line')).toBe('')
    expect(line.getAttribute('data-work-pulse-summary')).toBeNull()
    // The dense line replaces the strip entirely — no heading, no dot row.
    expect(screen.queryByText('Service status')).toBeNull()
    expect(document.querySelectorAll('span[title]')).toHaveLength(0)
  })

  it('keeps the health summary in Compact while reserving service dots for Standard and Full', async () => {
    const storage = await seededStorage(CONNECTED, ALL_GREEN)
    const view = mount(storage, 'compact')
    const compact = await screen.findByRole('region', { name: 'Service status' })
    expect(screen.getByLabelText('Service status: All operational, 2 services')).toBeTruthy()
    expect(compact.querySelectorAll('span[title]')).toHaveLength(0)

    view.rerender(<StorageProvider storage={storage}><StatusWidget canvasSize="standard" /></StorageProvider>)
    expect((await screen.findByRole('region', { name: 'Service status' })).querySelectorAll('span[title]')).toHaveLength(2)

    view.rerender(<StorageProvider storage={storage}><StatusWidget canvasSize="full" /></StorageProvider>)
    expect((await screen.findByRole('region', { name: 'Service status' })).querySelectorAll('span[title]')).toHaveLength(2)
  })

  it('renders section[aria-label="Service status"] with the crypto strip language (w-88 text-center)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const section = await screen.findByRole('region', { name: 'Service status' })
    expect(section.className).toContain('w-88')
    expect(section.className).toContain('text-center')
  })

  it('renders one dot (span[title]) per service, index-aligned to the snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const section = await screen.findByRole('region', { name: 'Service status' })
    const dots = section.querySelectorAll('span[title]')
    expect(dots.length).toBe(2)
  })

  it('all-green renders dots only — zero <p> trouble lines', async () => {
    const storage = await seededStorage(CONNECTED, ALL_GREEN)
    mount(storage)
    const section = await screen.findByRole('region', { name: 'Service status' })
    expect(section.querySelectorAll('span[title]').length).toBe(2)
    expect(section.querySelectorAll('p').length).toBe(0)
    expect(screen.getByLabelText('Service status: All operational, 2 services').getAttribute('data-work-pulse-tone')).toBe('quiet')
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
    expect(screen.getByLabelText('Service status: 3 service issues, 5 services').getAttribute('data-work-pulse-tone')).toBe('critical')
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
    const section = await screen.findByRole('region', { name: 'Service status' })
    expect(section.querySelectorAll('span[title]').length).toBe(2)
    expect(section.querySelectorAll('p').length).toBe(0)
    expect(screen.getByLabelText('Service status: 1 unreachable, 2 services').getAttribute('data-work-pulse-tone')).toBe('unknown')
  })

  // FIX ROUND (post-Task 86, controller-approved): the trouble line now
  // ALSO carries `text-photo` (the house photo-floating-text shadow,
  // index.css's own `@utility text-photo` — this text sits directly on the
  // background photo, same as every other bottom-band text) and its own
  // `hidden tallest:block` CSS-visibility gate (the strip's outer
  // PositionedBlock reveals at the much-lower `ampler` floor now; the text
  // itself still needs `tallest`'s taller floor to have room — see
  // App.tsx/index.css). jsdom never evaluates the height media query behind
  // `tallest:block` (no real layout), so this only pins the CLASS NAMES
  // being present — scripts/preview.mjs's own real-browser fenceposts are
  // what prove the actual reveal-at-height behavior.
  it('exact trouble text "{name} — {description}" in the danger tone (text-red-400), with the photo shadow and its own tallest-gated visibility class', async () => {
    const data: StatusData = {
      services: [{ name: 'Bravo', indicator: 'critical', description: 'Major Outage' }],
    }
    const storage = await seededStorage(
      { enabled: true, services: [{ name: 'Bravo', url: 'https://example.com/b.json' }] },
      data,
    )
    mount(storage)
    const line = await screen.findByText('Bravo — Major Outage')
    expect(line.tagName).toBe('P')
    expect(line.className).toContain('text-red-400')
    expect(line.className).toContain('text-photo')
    expect(line.className).toContain('hidden')
    expect(line.className).toContain('tallest:block')
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
