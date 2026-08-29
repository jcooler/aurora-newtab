// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { defaults, type Habit, type ProgressGoal } from '../../../lib/storage/schema'
import { WIDGET_RENDERERS, type WidgetRenderer } from '../../widgetRenderers'

const TODAY = '2026-08-29'
const NEXT_DAY = '2026-08-30'

function goal(overrides: Partial<ProgressGoal> = {}): ProgressGoal {
  return {
    id: 'water',
    name: 'Water',
    unit: 'glasses',
    target: 8,
    createdAt: 10,
    today: { date: TODAY, value: 5 },
    ...overrides,
  }
}

function habit(overrides: Partial<Habit> = {}): Habit {
  return { id: 'walk', name: 'Walk', createdAt: 20, log: [], ...overrides }
}

async function renderProgressWidget({
  enabled = true,
  goals = [],
  habits = [],
  docked = false,
  onOpenProgress = () => undefined,
  suppliedStorage,
}: {
  enabled?: boolean
  goals?: ProgressGoal[]
  habits?: Habit[]
  docked?: boolean
  onOpenProgress?: () => void
  suppliedStorage?: AuroraStorage
} = {}) {
  const storage = suppliedStorage ?? createStorage(memoryDriver())
  if (!suppliedStorage) await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, progress: enabled },
  })
  await storage.set('progressGoals', goals)
  await storage.set('habits', habits)
  const Renderer = (WIDGET_RENDERERS as Partial<Record<string, WidgetRenderer>>).progress
  if (!Renderer) throw new Error('Progress renderer is missing')

  const view = render(
    <StorageProvider storage={storage}>
      <Renderer canvasSize="compact" presentation={docked ? 'docked' : 'stack'} docked={docked} onOpenProgress={onOpenProgress} />
    </StorageProvider>,
  )
  await act(async () => undefined)
  return { ...view, storage }
}

function localDayListeners() {
  const windowAdd = vi.spyOn(window, 'addEventListener')
  const documentAdd = vi.spyOn(document, 'addEventListener')
  const timeout = vi.spyOn(window, 'setTimeout')
  return {
    expectNone() {
      expect(windowAdd.mock.calls.filter(([type]) => type === 'focus' || type === 'pageshow')).toHaveLength(0)
      expect(documentAdd.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(0)
      expect(timeout).not.toHaveBeenCalled()
    },
  }
}

describe('Progress canvas rail gates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 29, 12, 0, 0))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders nothing and starts no local-day timer or listener while the toggle is off', async () => {
    const listeners = localDayListeners()
    const { container } = await renderProgressWidget({ enabled: false, goals: [goal()] })

    expect(container.childElementCount).toBe(0)
    listeners.expectNone()
  })

  it('renders nothing and starts no local-day timer or listener without a structurally valid row', async () => {
    const listeners = localDayListeners()
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', {
      ...defaults().settings,
      widgets: { ...defaults().settings.widgets, progress: true },
    })
    await storage.set('progressGoals', [{ nope: true }] as never)
    await storage.set('habits', [null] as never)
    const Renderer = (WIDGET_RENDERERS as Partial<Record<string, WidgetRenderer>>).progress
    if (!Renderer) throw new Error('Progress renderer is missing')
    const { container } = render(<StorageProvider storage={storage}><Renderer /></StorageProvider>)
    await act(async () => undefined)

    expect(container.childElementCount).toBe(0)
    listeners.expectNone()
  })
})

describe('Progress canvas rail content and actions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 29, 12, 0, 0))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders at most three manual-first rows and an exact quiet overflow route', async () => {
    const onOpenProgress = vi.fn()
    const { container } = await renderProgressWidget({
      goals: [
        goal(),
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 10, today: { date: TODAY, value: 10 } }),
      ],
      habits: [
        habit(),
        habit({ id: 'stretch', name: 'Stretch' }),
        habit({ id: 'journal', name: 'Journal' }),
      ],
      onOpenProgress,
    })

    const rows = screen.getAllByTestId('progress-canvas-row')
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => within(row).getByTestId('progress-canvas-name').textContent)).toEqual(['Water', 'Read', 'Walk'])
    expect(screen.getByText('2 more')).toBeTruthy()
    const route = screen.getByRole('button', { name: 'Open Progress' })
    expect(route.className).toContain('opacity-0')
    expect(route.className).toContain('group-focus-within/progress:opacity-100')
    expect(route.className).toContain('[@media(pointer:coarse)]:opacity-100')
    fireEvent.click(route)
    expect(onOpenProgress).toHaveBeenCalledOnce()
    expect(container.querySelector('.tier-frame')).toBeNull()
    expect(container.querySelector('[data-progress-presentation="stack"]')).toBeTruthy()
  })

  it('includes source, name, values, unit, completion, and truthful action in each accessible name', async () => {
    await renderProgressWidget({
      goals: [
        goal(),
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 10, today: { date: TODAY, value: 10 } }),
      ],
      habits: [habit()],
    })

    expect(screen.getByRole('button', { name: 'Manual Water: 5 of 8 glasses, incomplete. Increment by 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Manual Read: 10 of 10 pages, complete. Keep complete' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Habit Walk: 0 of 1 day, incomplete. Mark done today' })).toBeTruthy()
  })

  it('keeps the declared Docked face to one dense line of daily values', async () => {
    const { container } = await renderProgressWidget({
      docked: true,
      goals: [
        goal(),
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 10, today: { date: TODAY, value: 10 } }),
      ],
      habits: [habit()],
    })

    const line = container.querySelector('[data-dock-line]')
    expect(line?.textContent).toContain('Water 5/8')
    expect(line?.textContent).toContain('Read done')
    expect(line?.textContent).toContain('Walk open')
    expect(screen.queryByTestId('progress-canvas-row')).toBeNull()
  })

  it('increments one, toggles a Habit today, and clamps a completed manual item without touching other authorities', async () => {
    const notification = vi.fn()
    vi.stubGlobal('Notification', notification)
    const { storage } = await renderProgressWidget({
      goals: [
        goal(),
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 10, today: { date: TODAY, value: 10 } }),
      ],
      habits: [habit()],
    })
    const before = {
      attentionLedger: await storage.get('attentionLedger'),
      connectorSnapshots: await storage.get('connectorSnapshots'),
      focus: await storage.get('focus'),
      briefingSources: (await storage.get('settings')).briefingSources,
    }
    const update = vi.spyOn(storage, 'update')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Manual Water: 5 of 8 glasses, incomplete. Increment by 1' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Habit Walk: 0 of 1 day, incomplete. Mark done today' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Manual Read: 10 of 10 pages, complete. Keep complete' }))
    })

    expect((await storage.get('progressGoals')).map((row) => row.today.value)).toEqual([6, 10])
    expect((await storage.get('habits'))[0]!.log).toEqual([TODAY])
    expect(update.mock.calls.map(([key]) => key)).toEqual(['progressGoals', 'habits', 'progressGoals'])
    expect(await storage.get('attentionLedger')).toEqual(before.attentionLedger)
    expect(await storage.get('connectorSnapshots')).toEqual(before.connectorSnapshots)
    expect(await storage.get('focus')).toEqual(before.focus)
    expect((await storage.get('settings')).briefingSources).toEqual(before.briefingSources)
    expect(notification).not.toHaveBeenCalled()
  })

  it('retries the exact manual intent against fresh rows and the rolled-over local day', async () => {
    const base = memoryDriver()
    let rejectProgressWrite = false
    const storage = createStorage({
      ...base,
      async write(patch: Record<string, unknown>) {
        if (rejectProgressWrite && Object.hasOwn(patch, 'progressGoals')) {
          rejectProgressWrite = false
          throw new Error('quota')
        }
        await base.write(patch)
      },
    })
    await storage.init()
    await renderProgressWidget({
      suppliedStorage: storage,
      goals: [
        goal(),
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 20, today: { date: TODAY, value: 4 } }),
      ],
    })
    const untouched = {
      attentionLedger: await storage.get('attentionLedger'),
      connectorSnapshots: await storage.get('connectorSnapshots'),
      focus: await storage.get('focus'),
      briefingSources: (await storage.get('settings')).briefingSources,
      habits: await storage.get('habits'),
    }
    const update = vi.spyOn(storage, 'update')
    rejectProgressWrite = true

    fireEvent.click(screen.getByRole('button', { name: 'Manual Water: 5 of 8 glasses, incomplete. Increment by 1' }))
    expect(await screen.findByText('Progress was not saved. Try again.')).toBeTruthy()
    expect((await storage.get('progressGoals'))[0]!.today.value).toBe(5)

    vi.setSystemTime(new Date(2026, 7, 30, 12, 0, 0))
    await act(async () => {
      await storage.set('progressGoals', [
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 25, today: { date: NEXT_DAY, value: 9 } }),
        goal({ today: { date: TODAY, value: 6 } }),
      ])
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })

    await waitFor(async () => {
      expect(await storage.get('progressGoals')).toEqual([
        goal({ id: 'read', name: 'Read', unit: 'pages', target: 25, today: { date: NEXT_DAY, value: 9 } }),
        goal({ today: { date: NEXT_DAY, value: 1 } }),
      ])
    })
    expect(update.mock.calls.map(([key]) => key)).toEqual(['progressGoals', 'progressGoals'])
    expect(await storage.get('attentionLedger')).toEqual(untouched.attentionLedger)
    expect(await storage.get('connectorSnapshots')).toEqual(untouched.connectorSnapshots)
    expect(await storage.get('focus')).toEqual(untouched.focus)
    expect((await storage.get('settings')).briefingSources).toEqual(untouched.briefingSources)
    expect(await storage.get('habits')).toEqual(untouched.habits)
    expect(screen.queryByText('Progress was not saved. Try again.')).toBeNull()
  })

  it('retries only the failed Habit intent against fresh Habits after local-day rollover', async () => {
    const base = memoryDriver()
    let rejectHabitWrite = false
    const storage = createStorage({
      ...base,
      async write(patch: Record<string, unknown>) {
        if (rejectHabitWrite && Object.hasOwn(patch, 'habits')) {
          rejectHabitWrite = false
          throw new Error('quota')
        }
        await base.write(patch)
      },
    })
    await storage.init()
    await renderProgressWidget({
      suppliedStorage: storage,
      goals: [goal()],
      habits: [habit(), habit({ id: 'stretch', name: 'Stretch', log: [TODAY] })],
    })
    const notification = vi.fn()
    vi.stubGlobal('Notification', notification)
    const untouched = {
      progressGoals: await storage.get('progressGoals'),
      attentionLedger: await storage.get('attentionLedger'),
      connectorSnapshots: await storage.get('connectorSnapshots'),
      focus: await storage.get('focus'),
      briefingSources: (await storage.get('settings')).briefingSources,
    }
    const update = vi.spyOn(storage, 'update')
    rejectHabitWrite = true

    fireEvent.click(screen.getByRole('button', { name: 'Habit Walk: 0 of 1 day, incomplete. Mark done today' }))
    expect(await screen.findByText('Progress was not saved. Try again.')).toBeTruthy()
    expect(await storage.get('habits')).toEqual([
      habit(),
      habit({ id: 'stretch', name: 'Stretch', log: [TODAY] }),
    ])

    vi.setSystemTime(new Date(2026, 7, 30, 12, 0, 0))
    const freshHabits = [
      habit({ id: 'journal', name: 'Journal', log: [NEXT_DAY] }),
      habit({ log: [TODAY] }),
      habit({ id: 'stretch', name: 'Stretch', log: [TODAY, NEXT_DAY] }),
    ]
    await act(async () => {
      await storage.set('habits', freshHabits)
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })

    await waitFor(async () => {
      expect(await storage.get('habits')).toEqual([
        freshHabits[0],
        habit({ log: [TODAY, NEXT_DAY] }),
        freshHabits[2],
      ])
    })
    expect(update.mock.calls.map(([key]) => key)).toEqual(['habits', 'habits'])
    expect(await storage.get('progressGoals')).toEqual(untouched.progressGoals)
    expect(await storage.get('attentionLedger')).toEqual(untouched.attentionLedger)
    expect(await storage.get('connectorSnapshots')).toEqual(untouched.connectorSnapshots)
    expect(await storage.get('focus')).toEqual(untouched.focus)
    expect((await storage.get('settings')).briefingSources).toEqual(untouched.briefingSources)
    expect(notification).not.toHaveBeenCalled()
    expect(screen.queryByText('Progress was not saved. Try again.')).toBeNull()
  })
})
