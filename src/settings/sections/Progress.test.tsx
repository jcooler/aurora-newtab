// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { StorageProvider } from '../../lib/storage/context'
import { memoryDriver } from '../../lib/storage/driver'
import { createStorage, type AuroraStorage } from '../../lib/storage/index'
import type { Habit, ProgressGoal } from '../../lib/storage/schema'
import Progress from './Progress'

const TODAY = '2026-08-29'

function goal(overrides: Partial<ProgressGoal>): ProgressGoal {
  return {
    id: 'water',
    name: 'Water',
    unit: 'glasses',
    target: 8,
    createdAt: 100,
    today: { date: TODAY, value: 5 },
    ...overrides,
  }
}

function Harness({ storage }: { storage: AuroraStorage }) {
  const [goals] = useStoredKey('progressGoals')
  const [habits] = useStoredKey('habits')
  return (
    <Progress
      goals={goals}
      habits={habits}
      storage={storage}
    />
  )
}

async function renderProgress({ goals = [], habits = [], suppliedDriver }: {
  goals?: ProgressGoal[]
  habits?: Habit[]
  suppliedDriver?: ReturnType<typeof memoryDriver>
} = {}) {
  const driver = suppliedDriver ?? memoryDriver()
  const storage = createStorage(driver)
  await storage.init()
  await storage.set('progressGoals', goals)
  await storage.set('habits', habits)
  render(
    <StorageProvider storage={storage}>
      <Harness storage={storage} />
    </StorageProvider>,
  )
  await screen.findByRole('region', { name: 'Progress' })
  await waitFor(() => {
    expect(screen.queryAllByTestId('progress-row')).toHaveLength(goals.length + habits.length)
  })
  return { driver, storage }
}

describe('Progress overview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 29, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the approved quiet empty state and one clear starting action', async () => {
    await renderProgress()

    const region = screen.getByRole('region', { name: 'Progress' })
    expect(within(region).getByRole('heading', { name: 'Progress' })).toBeTruthy()
    expect(within(region).getByRole('heading', { name: 'Keep what matters moving.' })).toBeTruthy()
    expect(within(region).getByText('Use light reminders for personal goals. Progress never becomes an attention alert.')).toBeTruthy()
    expect(within(region).getByText('Choose one thing to keep moving.')).toBeTruthy()
    expect(within(region).getByText('Add a simple daily value. It stays in this Chrome profile.')).toBeTruthy()
    expect(within(region).getByRole('button', { name: 'Add progress' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Metrics history' })).toBeTruthy()
  })

  it('renders manual goals in stored order before Habits in their stored order', async () => {
    await renderProgress({
      goals: [
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 20, today: { date: TODAY, value: 7 } }),
        goal({ id: 'water', name: 'Water', unit: 'glasses', target: 8, today: { date: TODAY, value: 5 } }),
      ],
      habits: [
        { id: 'walk', name: 'Walk', createdAt: 10, log: [TODAY] },
        { id: 'stretch', name: 'Stretch', createdAt: 20, log: ['2026-08-28'] },
      ],
    })

    const rows = screen.getAllByTestId('progress-row')
    expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
      'Read', 'Water', 'Walk', 'Stretch',
    ])
    expect(rows.map((row) => within(row).getByText(/^(Manual|Habit)$/).textContent)).toEqual([
      'Manual', 'Manual', 'Habit', 'Habit',
    ])
    expect(within(rows[0]!).getByText('7 / 20 pages')).toBeTruthy()
    expect(within(rows[2]!).getByText('1 day streak')).toBeTruthy()
    expect(within(rows[2]!).getByRole('button', { name: 'Reopen Walk' })).toBeTruthy()
    expect(within(rows[3]!).getByRole('button', { name: 'Done Stretch' })).toBeTruthy()
  })

  it('projects a stale manual value as zero without writing storage', async () => {
    const { driver } = await renderProgress({
      goals: [goal({ today: { date: '2026-08-28', value: 8 } })],
    })
    const write = vi.spyOn(driver, 'write')

    expect(screen.getByText('0 / 8 glasses')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: '0 of 8 glasses complete' })).toBeTruthy()
    await act(async () => undefined)
    expect(write).not.toHaveBeenCalled()
  })

  it('does not offer a seventh manual goal', async () => {
    await renderProgress({
      goals: Array.from({ length: 6 }, (_, index) => goal({ id: `goal-${index}`, name: `Goal ${index}` })),
    })

    expect(screen.getByText('Maximum of 6 manual goals.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add progress' })).toBeNull()
  })

  it('opens the add dialog from Add progress', async () => {
    await renderProgress()
    fireEvent.click(screen.getByRole('button', { name: 'Add progress' }))
    expect(screen.getByRole('dialog', { name: 'Add progress' })).toBeTruthy()
  })
})

describe('Progress manual goal mutations', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 29, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    [{ name: '', target: '2', unit: 'pages' }, 'Enter a goal name.'],
    [{ name: 'Read', target: '2', unit: '' }, 'Enter a unit such as glasses, pages, or minutes.'],
    [{ name: 'Read', target: '0', unit: 'pages' }, 'Choose a daily target from 1 to 999999.'],
  ])('shows exact validation and writes nothing for an invalid draft', async (draft, message) => {
    const { driver } = await renderProgress()
    const write = vi.spyOn(driver, 'write')
    fireEvent.click(screen.getByRole('button', { name: 'Add progress' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: draft.name } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily target' }), { target: { value: draft.target } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Unit' }), { target: { value: draft.unit } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText(message)).toBeTruthy()
    expect(write).not.toHaveBeenCalled()
  })

  it('increments, completes, resets, and reorders through fresh progressGoals updaters', async () => {
    const { storage } = await renderProgress({
      goals: [
        goal({ id: 'water', today: { date: TODAY, value: 5 } }),
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 10, today: { date: TODAY, value: 2 } }),
      ],
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Increment Water' }))
    })
    expect((await storage.get('progressGoals'))[0]!.today.value).toBe(6)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Water' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Complete today' }))
    })
    expect((await storage.get('progressGoals'))[0]!.today.value).toBe(8)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset Water' }))
    })
    expect((await storage.get('progressGoals'))[0]!.today.value).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Read' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Move up' }))
    })
    expect((await storage.get('progressGoals')).map((item) => item.id)).toEqual(['read', 'water'])
  })

  it('requires two delete gestures and disarms deletion after the dialog closes', async () => {
    const { storage } = await renderProgress({ goals: [goal({})] })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Water' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete goal' }))
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit Water' }))
    expect(screen.getByRole('button', { name: 'Delete goal' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm delete' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Delete goal' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    })
    expect(await storage.get('progressGoals')).toEqual([])
    await waitFor(() => expect(document.activeElement?.getAttribute('data-settings-anchor')).toBe('progress-overview'))
  })

  it('applies an old row action to the same-id cross-tab refresh without losing fresh order, target, or value', async () => {
    const { storage } = await renderProgress({
      goals: [goal({}), goal({ id: 'read', name: 'Read', unit: 'pages', target: 20 })],
    })
    await act(async () => {
      await storage.set('progressGoals', [
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 20, today: { date: TODAY, value: 9 } }),
        goal({ target: 12, today: { date: TODAY, value: 10 } }),
      ])
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Increment Water' }))
    })

    const stored = await storage.get('progressGoals')
    expect(stored.map((item) => item.id)).toEqual(['read', 'water'])
    expect(stored[1]).toEqual(goal({ target: 12, today: { date: TODAY, value: 11 } }))
  })

  it('cannot recreate a goal removed from storage while its edit dialog remains open', async () => {
    const { storage } = await renderProgress({ goals: [goal({})] })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Water' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Hydrate' } })
    await act(async () => {
      await storage.set('progressGoals', [])
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(await storage.get('progressGoals')).toEqual([])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement?.getAttribute('data-settings-anchor')).toBe('progress-overview')
  })

  it('keeps failed Edit Save recovery inside the dialog and retries its intent against fresh storage', async () => {
    const base = memoryDriver()
    let rejectProgressWrite = false
    const driver = {
      ...base,
      async write(patch: Record<string, unknown>) {
        if (rejectProgressWrite && Object.hasOwn(patch, 'progressGoals')) {
          rejectProgressWrite = false
          throw new Error('quota')
        }
        await base.write(patch)
      },
    }
    const { storage } = await renderProgress({ goals: [goal({})], suppliedDriver: driver })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Water' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Hydrate' } })
    rejectProgressWrite = true

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    const dialog = screen.getByRole('dialog', { name: 'Edit progress' })
    expect(within(dialog).getByText('Progress was not saved. Try again.')).toBeTruthy()
    expect(screen.getAllByText('Progress was not saved. Try again.')).toHaveLength(1)
    const retry = within(dialog).getByRole('button', { name: 'Retry' })
    retry.focus()
    expect(document.activeElement).toBe(retry)

    await act(async () => {
      await storage.set('progressGoals', [
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 20, today: { date: TODAY, value: 9 } }),
        goal({ today: { date: TODAY, value: 6 } }),
      ])
    })
    await act(async () => {
      fireEvent.click(retry)
    })

    const stored = await storage.get('progressGoals')
    expect(stored.map((item) => item.id)).toEqual(['read', 'water'])
    expect(stored[1]).toEqual(goal({ name: 'Hydrate', today: { date: TODAY, value: 6 } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the stored value visible after failure and retries the intent against fresh storage', async () => {
    const base = memoryDriver()
    let rejectProgressWrite = false
    const driver = {
      ...base,
      async write(patch: Record<string, unknown>) {
        if (rejectProgressWrite && Object.hasOwn(patch, 'progressGoals')) {
          rejectProgressWrite = false
          throw new Error('quota')
        }
        await base.write(patch)
      },
    }
    const { storage } = await renderProgress({ goals: [goal({ today: { date: TODAY, value: 5 } })], suppliedDriver: driver })
    rejectProgressWrite = true

    fireEvent.click(screen.getByRole('button', { name: 'Increment Water' }))
    expect(await screen.findByText('Progress was not saved. Try again.')).toBeTruthy()
    expect(screen.getByText('5 / 8 glasses')).toBeTruthy()
    expect((await storage.get('progressGoals'))[0]!.today.value).toBe(5)

    await act(async () => {
      await storage.set('progressGoals', [goal({ today: { date: TODAY, value: 6 } })])
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })
    await waitFor(() => expect(screen.getByText('7 / 8 glasses')).toBeTruthy())
    expect((await storage.get('progressGoals'))[0]!.today.value).toBe(7)
  })
})

describe('Progress Habit bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 29, 12, 0, 0))
  })

  afterEach(() => vi.useRealTimers())

  it('toggles and renames a habit in Progress without replacing its log', async () => {
    const { storage } = await renderProgress({
      habits: [{ id: 'walk', name: 'Walk', createdAt: 10, log: [] }],
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done Walk' }))
    })
    expect(await storage.get('habits')).toEqual([{ id: 'walk', name: 'Walk', createdAt: 10, log: [TODAY] }])
    expect(await storage.get('progressGoals')).toEqual([])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reopen Walk' }))
    })
    expect((await storage.get('habits'))[0]!.log).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Edit Walk' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Habit name' }), { target: { value: 'Morning walk' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save habit' }))
    })
    expect(await storage.get('habits')).toEqual([
      { id: 'walk', name: 'Morning walk', createdAt: 10, log: [] },
    ])
  })

  it('adds and two-step deletes habits from the Progress authority', async () => {
    const { storage } = await renderProgress()
    fireEvent.change(screen.getByRole('textbox', { name: 'New habit name' }), { target: { value: 'Read' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add habit' }))
    })
    expect((await storage.get('habits'))[0]?.name).toBe('Read')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Read' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete habit' }))
    expect(screen.getByRole('button', { name: 'Confirm delete habit' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete habit' }))
    })
    expect(await storage.get('habits')).toEqual([])
  })
})
