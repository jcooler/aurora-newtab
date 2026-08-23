// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorage, type AuroraStorage } from '../../../lib/storage'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import type { LinearIssue, LinearWorkData } from '../../../services/connectors/linear'
import type { LinearConfig } from '../../../services/connectors/types'
import LinearWidget from './LinearWidget'

const NOW = 1_700_000_000_000
const CONNECTED: LinearConfig = { enabled: true, token: 'lin_api_test', displayName: 'Sam', itemLimit: 6 }

function issue(index: number, overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: `issue-${index}`,
    identifier: `AUR-${index}`,
    title: `Build Aurora ${index}`,
    priority: index === 0 ? 'urgent' : 'normal',
    dueDate: index === 0 ? '2026-08-21' : null,
    dueStatus: index === 0 ? 'overdue' : 'none',
    dueSoon: index === 0,
    url: `https://linear.app/aurora/issue/AUR-${index}`,
    state: { name: 'In Progress', type: 'started' },
    team: { id: index % 2 ? 'ops' : 'aurora', key: index % 2 ? 'OPS' : 'AUR', name: index % 2 ? 'Ops' : 'Aurora' },
    cycle: { id: 'cycle', name: 'August', startsAt: null, endsAt: null },
    ...overrides,
  }
}

async function seededStorage(config: LinearConfig, data: LinearWorkData | null = { issues: [issue(0), issue(1)] }, fetchedAt = NOW): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { linear: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      linear: { scope: await connectorSnapshotScope('linear', config), fetchedAt, data },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard' | 'full'; docked?: boolean } = {}) {
  return render(<StorageProvider storage={storage}><LinearWidget {...props} /></StorageProvider>)
}

beforeEach(() => {
  __resetInFlight()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})
afterEach(() => {
  __resetInFlight()
  vi.unstubAllGlobals()
  vi.mocked(Date.now).mockRestore()
})

describe('LinearWidget', () => {
  it('renders setup without starting the snapshot hook for an enabled incomplete config', async () => {
    const storage = await seededStorage({ ...CONNECTED, token: '' }, null)
    mount(storage)
    await act(async () => {})
    expect(screen.getByText('Connect Linear in Settings.')).toBeTruthy()
    expect((await storage.get('connectorSnapshots')).linear).toBeUndefined()
  })

  it.each(['compact', 'standard', 'full'] as const)('uses the exact %s frame for ready data', async (canvasSize) => {
    mount(await seededStorage(CONNECTED), { canvasSize })
    await screen.findByText('2 assigned')
    const frame = screen.getByRole('region', { name: 'Linear' })
    expect(frame.getAttribute('data-tier-frame')).toBe(canvasSize)
    expect(frame.getAttribute('data-tier-frame-state')).toBe('ready')
    expect(frame.className).not.toMatch(/overflow-(?:y-)?(?:auto|scroll)/)
    expect(frame.querySelector('[data-work-widget-scroll]')).toBeNull()
  })

  it('renders Compact assigned and due facts without rows', async () => {
    mount(await seededStorage(CONNECTED), { canvasSize: 'compact' })
    expect(await screen.findByText('2 assigned')).toBeTruthy()
    expect(screen.getByText('1 due soon')).toBeTruthy()
    expect(screen.getByText('AUR-0')).toBeTruthy()
    expect(screen.queryByText('Build Aurora 0')).toBeNull()
  })

  it('chooses the nearest due date instead of the first provider-ordered due issue', async () => {
    const data = {
      issues: [
        issue(0, { dueDate: '2026-08-28', dueStatus: 'soon', dueSoon: true }),
        issue(1, { dueDate: '2026-08-23', dueStatus: 'soon', dueSoon: true }),
      ],
    }
    mount(await seededStorage(CONNECTED, data), { canvasSize: 'compact' })
    expect(await screen.findByText('AUR-1')).toBeTruthy()
    expect(screen.queryByText('AUR-0')).toBeNull()
  })

  it('renders Standard issue, team, state, due, and safe provider link context', async () => {
    mount(await seededStorage(CONNECTED), { canvasSize: 'standard' })
    const title = await screen.findByText('Build Aurora 0')
    expect(screen.getByText('AUR-0 · Aurora · In Progress')).toBeTruthy()
    expect(screen.getByText('Overdue · August')).toBeTruthy()
    expect(title.closest('li')?.textContent).toContain('Urgent priority')
    const link = title.closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://linear.app/aurora/issue/AUR-0')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('bounds Full to three prioritized rows without an internal scroll owner', async () => {
    const issues = Array.from({ length: 25 }, (_, index) => issue(index, index === 1 ? { state: { name: 'Todo', type: 'unstarted' } } : {}))
    mount(await seededStorage(CONNECTED, { issues }), { canvasSize: 'full' })
    expect(await screen.findByText('Build Aurora 0')).toBeTruthy()
    expect(screen.getByText('Build Aurora 2')).toBeTruthy()
    expect(screen.queryByText('Build Aurora 3')).toBeNull()
    expect(screen.queryByText('Build Aurora 24')).toBeNull()
    expect(screen.getByRole('heading', { name: 'In Progress' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Todo' })).toBeTruthy()
    const frame = screen.getByRole('region', { name: 'Linear' })
    expect(frame.getAttribute('data-tier-frame')).toBe('full')
    expect(frame.querySelector('[data-work-widget-scroll]')).toBeNull()
  })

  it('opens Docked detail with named top work', async () => {
    mount(await seededStorage(CONNECTED), { docked: true })
    const trigger = await screen.findByRole('button', { name: 'Linear: 2 assigned, 1 due soon' })
    await act(async () => { trigger.click() })
    expect(screen.getByRole('dialog', { name: 'Linear details' })).toBeTruthy()
    expect(screen.getByText('Build Aurora 0')).toBeTruthy()
  })

  it('renders empty and hard-error states truthfully', async () => {
    const empty = mount(await seededStorage(CONNECTED, { issues: [] }), { canvasSize: 'standard' })
    expect(await screen.findByText('No assigned issues.')).toBeTruthy()
    empty.unmount()

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    mount(await seededStorage(CONNECTED, null), { canvasSize: 'standard' })
    expect(await screen.findByText('Linear work request failed.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh Linear' })).toBeTruthy()
  })
})
