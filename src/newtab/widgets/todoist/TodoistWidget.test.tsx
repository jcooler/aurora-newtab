// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorage, type AuroraStorage } from '../../../lib/storage'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import type { TodoistData, TodoistTask } from '../../../services/connectors/todoist'
import type { TodoistConfig } from '../../../services/connectors/types'
import TodoistWidget from './TodoistWidget'

const NOW = 1_700_000_000_000
const CONNECTED: TodoistConfig = { enabled: true, token: 'todoist_test', accountLabel: 'Todoist', itemLimit: 6 }

function task(index: number, bucket: TodoistTask['bucket'] = index === 0 ? 'overdue' : 'today'): TodoistTask {
  return {
    id: `task-${index}`,
    content: `Ship Aurora ${index}`,
    projectId: index % 2 ? 'personal' : 'work',
    due: { date: '2026-08-22', datetime: null, timeZone: null, text: bucket, isRecurring: false },
    priority: index === 0 ? 4 : 2,
    labels: [],
    duration: null,
    parentId: null,
    bucket,
    url: `https://app.todoist.com/app/task/task-${index}`,
  }
}

const DATA: TodoistData = {
  projects: [{ id: 'work', name: 'Work' }, { id: 'personal', name: 'Personal' }],
  tasks: [task(0), task(1)],
}

async function seededStorage(config: TodoistConfig, data: TodoistData | null = DATA, fetchedAt = NOW): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { todoist: config })
  if (data) await storage.set('connectorSnapshots', { todoist: { scope: await connectorSnapshotScope('todoist', config), fetchedAt, data } })
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard' | 'full'; docked?: boolean } = {}) {
  return render(<StorageProvider storage={storage}><TodoistWidget {...props} /></StorageProvider>)
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

describe('TodoistWidget', () => {
  it('renders setup without starting the snapshot hook for incomplete config', async () => {
    const storage = await seededStorage({ ...CONNECTED, token: '' }, null)
    mount(storage)
    await act(async () => {})
    expect(screen.getByText('Connect Todoist in Settings.')).toBeTruthy()
    expect((await storage.get('connectorSnapshots')).todoist).toBeUndefined()
  })

  it.each(['compact', 'standard', 'full'] as const)('uses the exact %s frame for ready data', async (canvasSize) => {
    mount(await seededStorage(CONNECTED), { canvasSize })
    await screen.findByText('2 due')
    const frame = screen.getByRole('region', { name: 'Todoist' })
    expect(frame.getAttribute('data-tier-frame')).toBe(canvasSize)
    expect(frame.getAttribute('data-tier-frame-state')).toBe('ready')
    expect(frame.className).not.toMatch(/overflow-(?:y-)?(?:auto|scroll)/)
    expect(frame.querySelector('[data-work-widget-scroll]')).toBeNull()
  })

  it('renders Compact due facts without task rows', async () => {
    mount(await seededStorage(CONNECTED), { canvasSize: 'compact' })
    expect(await screen.findByText('2 due')).toBeTruthy()
    expect(screen.getByText('1 overdue')).toBeTruthy()
    expect(screen.getByText('1 due today')).toBeTruthy()
    expect(screen.getByText('Next: Ship Aurora 0')).toBeTruthy()
    expect(screen.queryByText('Ship Aurora 0')).toBeNull()
  })

  it('renders Standard named task, project, due context, and safe provider link', async () => {
    const recurring = {
      ...task(0),
      due: { ...task(0).due, text: 'Today at 2:00 PM', isRecurring: true },
      duration: { amount: 30, unit: 'minute' as const },
    }
    mount(await seededStorage(CONNECTED, { ...DATA, tasks: [recurring, task(1)] }), { canvasSize: 'standard' })
    const title = await screen.findByText('Ship Aurora 0')
    expect(screen.queryByRole('heading', { name: 'Overdue' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
    expect(title.closest('li')?.textContent).toContain('Today at 2:00 PM')
    expect(title.closest('li')?.textContent).toContain('Priority 4')
    expect(title.closest('li')?.textContent).toContain('Recurring')
    expect(title.closest('li')?.textContent).toContain('30 min')
    const second = screen.getByText('Ship Aurora 1').closest('li')
    expect(second?.textContent).toContain('Personal · Today')
    expect(second?.textContent).toContain('Today · Priority 2')
    const standardCopy = screen.getByText('Ship Aurora 1').parentElement
    expect(standardCopy?.children).toHaveLength(2)
    expect(standardCopy?.lastElementChild?.textContent).toBe('Personal · Today · Priority 2')
    expect(standardCopy?.lastElementChild?.getAttribute('title')).toBe('Personal · Today · Priority 2')
    expect(screen.getByRole('button', { name: 'Complete Ship Aurora 1' })).toBeTruthy()
    const link = title.closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://app.todoist.com/app/task/task-0')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('bounds Full to two due rows without a card scroll owner and keeps named Docked detail', async () => {
    const fullTasks = [task(0, 'overdue'), task(1, 'today'), ...Array.from({ length: 23 }, (_, index) => task(index + 2, 'upcoming'))]
    const full = mount(await seededStorage(CONNECTED, { ...DATA, tasks: fullTasks }), { canvasSize: 'full' })
    expect(await screen.findByText('Ship Aurora 1')).toBeTruthy()
    expect(screen.queryByText('Ship Aurora 2')).toBeNull()
    expect(screen.queryByText('Ship Aurora 24')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Overdue' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull()
    const frame = screen.getByRole('region', { name: 'Todoist' })
    expect(frame.getAttribute('data-tier-frame')).toBe('full')
    expect(frame.querySelector('[data-work-widget-scroll]')).toBeNull()
    full.unmount()

    mount(await seededStorage(CONNECTED), { docked: true })
    const trigger = await screen.findByRole('button', { name: 'Todoist: 1 due today, 1 overdue' })
    await act(async () => { trigger.click() })
    expect(screen.getByRole('dialog', { name: 'Todoist details' })).toBeTruthy()
    expect(screen.getByText('Ship Aurora 0')).toBeTruthy()
  })

  it('Cancel sends no request or write and restores focus to Complete', async () => {
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)
    const storage = await seededStorage(CONNECTED)
    const before = JSON.stringify({
      connectors: await storage.get('connectors'),
      connectorSnapshots: await storage.get('connectorSnapshots'),
    })
    mount(storage, { canvasSize: 'standard' })
    const complete = await screen.findByRole('button', { name: 'Complete Ship Aurora 0' })
    fireEvent.click(complete)
    const dialog = screen.getByRole('dialog', { name: 'Complete Ship Aurora 0?' })
    const cancel = screen.getByRole('button', { name: 'Cancel completion' })
    const confirm = screen.getByRole('button', { name: 'Confirm completion' })
    expect(document.activeElement).toBe(cancel)
    confirm.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
    fireEvent.click(cancel)
    await act(async () => { await Promise.resolve() })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(JSON.stringify({
      connectors: await storage.get('connectors'),
      connectorSnapshots: await storage.get('connectorSnapshots'),
    })).toBe(before)
    expect(document.activeElement).toBe(complete)
  })

  it('explains recurring-task advancement before confirmation', async () => {
    const recurring = { ...task(0), due: { ...task(0).due, isRecurring: true } }
    mount(await seededStorage(CONNECTED, { ...DATA, tasks: [recurring] }), { canvasSize: 'standard' })
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Ship Aurora 0' }))

    expect(screen.getByRole('dialog', { name: 'Complete Ship Aurora 0?' }).textContent)
      .toContain('Recurring tasks move to their next occurrence.')
  })

  it('Confirm is single-flight, posts once, clears only Todoist snapshot, and closes once', async () => {
    let resolveClose!: (value: unknown) => void
    const fetchFn = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') return new Promise((resolve) => { resolveClose = resolve })
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ results: [], next_cursor: null }),
      })
    })
    vi.stubGlobal('fetch', fetchFn)
    const storage = await seededStorage(CONNECTED)
    await storage.update('connectorSnapshots', (previous) => ({ ...previous, github: { scope: 'g', fetchedAt: 1, data: { kept: true } } }))
    mount(storage, { canvasSize: 'standard' })
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Ship Aurora 0' }))
    const confirm = screen.getByRole('button', { name: 'Confirm completion' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await act(async () => { await Promise.resolve() })
    expect(typeof resolveClose).toBe('function')
    expect(fetchFn.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
    await act(async () => {
      resolveClose({ ok: true, status: 200, headers: { get: () => null } })
      await Promise.resolve()
    })
    expect(screen.queryByRole('dialog', { name: 'Complete Ship Aurora 0?' })).toBeNull()
    const snapshots = await storage.get('connectorSnapshots')
    expect(snapshots.todoist?.data).toEqual({ projects: [], tasks: [] })
    expect(fetchFn.mock.calls.filter((call) => call[1]?.method !== 'POST')).toHaveLength(2)
    expect(snapshots.github).toEqual({ scope: 'g', fetchedAt: 1, data: { kept: true } })
  })

  it('keeps confirmation open with a retryable inline error on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, headers: { get: () => null } })))
    mount(await seededStorage(CONNECTED), { canvasSize: 'standard' })
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Ship Aurora 0' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' })) })
    expect(screen.getByRole('dialog', { name: 'Complete Ship Aurora 0?' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Todoist close failed with status 500.')
  })
})
