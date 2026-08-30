// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttentionSignal } from '../../lib/attention'
import { createStorage, type AuroraStorage } from '../../lib/storage'
import { StorageProvider } from '../../lib/storage/context'
import { memoryDriver } from '../../lib/storage/driver'
import { defaults } from '../../lib/storage/schema'
import AuroraBriefing from './AuroraBriefing'

let hookResult: { ready: boolean; signals: AttentionSignal[] }

vi.mock('./useAttentionSignals', () => ({ useAttentionSignals: () => hookResult }))
vi.mock('./AttentionRefreshOwners', () => ({ default: () => <span data-attention-refresh-owner="" /> }))

const WORK: AttentionSignal = { key: 'assignment:github:42', kind: 'assignment', source: 'GitHub', title: 'Review authentication fix', detail: 'acme/aurora · First seen by Tab Two 2h ago', timestamp: 1 }
const FAILURE: AttentionSignal = { key: 'deployment:aurora', kind: 'deployment', source: 'Vercel', title: 'aurora-newtab', detail: 'Failed 18m ago', timestamp: 2 }

async function makeStorage(briefingEnabled: boolean | 'absent' = true): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const settings = defaults().settings
  if (briefingEnabled !== 'absent') settings.briefingEnabled = briefingEnabled
  await storage.setMany({ settings, todoLists: [{ id: 'old', name: 'Tasks', items: [{ id: '1', text: 'Old undated task', done: false }] }] })
  return storage
}

function mount(storage: AuroraStorage) {
  return render(<StorageProvider storage={storage}><AuroraBriefing /></StorageProvider>)
}

beforeEach(() => { hookResult = { ready: true, signals: [] } })
afterEach(() => vi.clearAllMocks())

describe('AuroraBriefing attention composition', () => {
  it('renders neither refresh ownership nor trigger when the master preference is absent or off', async () => {
    for (const enabled of ['absent', false] as const) {
      const view = mount(await makeStorage(enabled))
      await waitFor(() => expect(document.querySelector('[data-attention-refresh-owner]')).toBeNull())
      expect(screen.queryByRole('button', { name: /attention/i })).toBeNull()
      view.unmount()
    }
  })

  it('keeps refresh owners mounted while enabled even when no signal is visible', async () => {
    const { container } = mount(await makeStorage(true))
    await waitFor(() => expect(container.querySelector('[data-attention-refresh-owner]')).toBeTruthy())
    expect(container.querySelector('[data-aurora-briefing]')).toBeNull()
    expect(container.textContent).not.toContain('Old undated task')
    expect(container.textContent).not.toContain('Nothing urgent')
  })

  it('renders one plain text trigger with approved mixed summary copy and no card or icon chrome', async () => {
    hookResult = { ready: true, signals: [FAILURE, WORK] }
    const { container } = mount(await makeStorage(true))
    const trigger = await screen.findByRole('button', { name: '2 items need attention' })
    expect(container.querySelectorAll('[data-aurora-briefing]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-briefing-compact], [data-briefing-standard], [data-briefing-display]')).toHaveLength(0)
    expect(trigger.className).toContain('aurora-briefing__trigger')
    expect(trigger.className).not.toMatch(/(?:card|widget|panel)/)
    expect(trigger.querySelector('svg')).toBeNull()
    expect(container.querySelector('[data-preview]')).toBeNull()
    expect(container.textContent).not.toContain('Old undated task')
  })

  it('opens exact source details from the greeting helper', async () => {
    hookResult = { ready: true, signals: [FAILURE, WORK] }
    mount(await makeStorage(true))
    const trigger = await screen.findByRole('button', { name: '2 items need attention' })
    fireEvent.click(trigger)
    expect(screen.getByRole('region', { name: 'Attention details' })).toBeTruthy()
    expect(screen.getByText('GitHub')).toBeTruthy()
    expect(screen.getByText('Review authentication fix')).toBeTruthy()
    expect(screen.getByText(/First seen by Tab Two 2h ago/)).toBeTruthy()
    expect(screen.getByText('Vercel')).toBeTruthy()
    expect(screen.getByText('aurora-newtab')).toBeTruthy()
    expect(screen.getByText('Failed 18m ago')).toBeTruthy()
  })

  it('waits for scoped signal projection before exposing a trigger', async () => {
    hookResult = { ready: false, signals: [WORK] }
    const { container } = mount(await makeStorage(true))
    await waitFor(() => expect(container.querySelector('[data-attention-refresh-owner]')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /attention/i })).toBeNull()
  })
})
