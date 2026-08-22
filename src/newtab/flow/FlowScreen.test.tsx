// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorageProvider } from '../../lib/storage/context'
import { memoryDriver } from '../../lib/storage/driver'
import { createStorage, type AuroraStorage } from '../../lib/storage/index'
import { defaults, type Focus, type TimerSession, type TodoList } from '../../lib/storage/schema'
import { TimerSessionProvider } from '../widgets/timer/TimerSessionProvider'
import FlowScreen from './FlowScreen'

vi.mock('../../lib/hooks/useLocalDay', () => ({
  useLocalDay: () => ({ key: '2026-08-21', timeZone: 'America/New_York', now: new Date('2026-08-21T12:00:00-04:00') }),
}))

const MIN = 60_000

function timer(overrides: Partial<TimerSession> = {}): TimerSession {
  return {
    mode: 'work',
    running: false,
    endsAt: null,
    remainingMs: 9 * MIN,
    cycles: 1,
    flow: true,
    ...overrides,
  }
}

async function renderFlow({
  focus = { text: 'Finish the Flow spec', date: '2026-08-21', done: false },
  todoLists = [{
    id: 'today',
    name: 'Today',
    items: [
      { id: 'done', text: 'Clear the desk', done: true },
      { id: 'first', text: 'Write the implementation', done: false },
      { id: 'second', text: 'Review the evidence', done: false },
    ],
  }],
  timerSession = timer(),
}: {
  focus?: Focus | null
  todoLists?: TodoList[]
  timerSession?: TimerSession
} = {}): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver({
    ...defaults(),
    focus,
    todoLists,
    timerSession,
    'aurora:version': 15,
  }))
  await storage.init()
  render(
    <StorageProvider storage={storage}>
      <TimerSessionProvider>
        <FlowScreen />
      </TimerSessionProvider>
    </StorageProvider>,
  )
  await act(async () => {})
  return storage
}

describe('FlowScreen', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reduces the page to the current focus, persisted timer, and first unfinished task', async () => {
    const storage = await renderFlow()

    expect(document.querySelector('[data-flow-screen]')).toBeTruthy()
    expect(screen.getByText('Finish the Flow spec')).toBeTruthy()
    expect(screen.getByText('09:00')).toBeTruthy()
    expect(screen.getByText('In flow')).toBeTruthy()
    expect(screen.getByText('Write the implementation')).toBeTruthy()
    expect(screen.getByText('1 more')).toBeTruthy()
    expect(document.querySelector('[data-flow-progress]')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Complete Write the implementation' }))
    await waitFor(() => expect(screen.getByText('Review the evidence')).toBeTruthy())
    expect((await storage.get('todoLists'))[0]?.items[1]?.done).toBe(true)
    expect(screen.queryByText('1 more')).toBeNull()
  })

  it('treats a stale focus as empty and commits the replacement to the same focus key', async () => {
    const storage = await renderFlow({
      focus: { text: 'Yesterday only', date: '2026-08-20', done: false },
    })

    expect(screen.queryByText('Yesterday only')).toBeNull()
    const input = screen.getByRole('textbox', { name: /main focus today/i })
    fireEvent.change(input, { target: { value: '  Ship the quiet screen  ' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(screen.getByText('Ship the quiet screen')).toBeTruthy())
    expect(await storage.get('focus')).toEqual({
      text: 'Ship the quiet screen',
      date: '2026-08-21',
      done: false,
    })
  })

  it('keeps timer controls on the persisted authority and exits without resetting time', async () => {
    const storage = await renderFlow()

    fireEvent.click(screen.getByRole('button', { name: 'Resume timer' }))
    await waitFor(async () => expect((await storage.get('timerSession'))?.running).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Pause timer' }))
    await waitFor(async () => expect((await storage.get('timerSession'))?.running).toBe(false))
    const pausedRemaining = (await storage.get('timerSession'))?.remainingMs

    fireEvent.click(screen.getByRole('button', { name: 'End flow' }))
    await waitFor(async () => expect((await storage.get('timerSession'))?.flow).toBe(false))
    expect((await storage.get('timerSession'))?.remainingMs).toBe(pausedRemaining)
  })

  it('routes Escape through the shared close stack and omits an empty task husk', async () => {
    const storage = await renderFlow({
      todoLists: [{ id: 'today', name: 'Today', items: [{ id: 'done', text: 'Done', done: true }] }],
    })

    expect(document.querySelector('[data-flow-task]')).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(async () => expect((await storage.get('timerSession'))?.flow).toBe(false))
  })

  it('names and displays the persisted break phase directly', async () => {
    await renderFlow({
      timerSession: timer({ mode: 'break', remainingMs: 4 * MIN }),
    })

    expect(screen.getByText('Break')).toBeTruthy()
    expect(screen.getByLabelText('Break timer 04:00')).toBeTruthy()
  })
})
