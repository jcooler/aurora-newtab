// @vitest-environment jsdom
import { createRef, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProgressIntent } from '../../lib/progress'
import type { ProgressGoal } from '../../lib/storage/schema'
import ProgressGoalDialog from './ProgressGoalDialog'

const SAVED_GOAL: ProgressGoal = {
  id: 'water',
  name: 'Water',
  unit: 'glasses',
  target: 8,
  createdAt: 100,
  today: { date: '2026-08-29', value: 4 },
}

function DialogHarness({ goal = null, onIntent = async () => true }: {
  goal?: ProgressGoal | null
  onIntent?: (intent: ProgressIntent) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const invokerRef = createRef<HTMLButtonElement>()
  return (
    <>
      <button ref={invokerRef} type="button" onClick={() => setOpen(true)}>
        {goal ? 'Edit Water' : 'Add progress'}
      </button>
      <ProgressGoalDialog
        open={open}
        kind={goal ? 'edit' : 'add'}
        goal={goal}
        invokerRef={invokerRef}
        onClose={() => setOpen(false)}
        onIntent={onIntent}
      />
    </>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProgressGoalDialog focus and close behavior', () => {
  it('focuses Name, wraps Tab in both directions, and Cancel restores the exact invoker', async () => {
    render(<DialogHarness />)
    const invoker = screen.getByRole('button', { name: 'Add progress' })
    fireEvent.click(invoker)

    const name = screen.getByRole('textbox', { name: 'Name' })
    const save = screen.getByRole('button', { name: 'Save' })
    await waitFor(() => expect(document.activeElement).toBe(name))

    save.focus()
    fireEvent.keyDown(save, { key: 'Tab' })
    expect(document.activeElement).toBe(name)
    fireEvent.keyDown(name, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(save)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(document.activeElement).toBe(invoker))
  })

  it('closes on Escape and restores the edit invoker', async () => {
    render(<DialogHarness goal={SAVED_GOAL} />)
    const invoker = screen.getByRole('button', { name: 'Edit Water' })
    fireEvent.click(invoker)
    await screen.findByRole('dialog', { name: 'Edit progress' })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(invoker)
  })

  it('closes only from the backdrop itself and returns focus', async () => {
    render(<DialogHarness />)
    const invoker = screen.getByRole('button', { name: 'Add progress' })
    fireEvent.click(invoker)
    const dialog = screen.getByRole('dialog', { name: 'Add progress' })

    fireEvent.click(dialog)
    expect(screen.getByRole('dialog', { name: 'Add progress' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('progress-dialog-backdrop'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(invoker)
  })

  it('submits normalized fields and restores focus after Save', async () => {
    const onIntent = vi.fn(async () => true)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    render(<DialogHarness onIntent={onIntent} />)
    const invoker = screen.getByRole('button', { name: 'Add progress' })
    fireEvent.click(invoker)

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: '  Read  ' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily target' }), { target: { value: '12' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Unit' }), { target: { value: ' pages ' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(onIntent).toHaveBeenCalledWith({
      kind: 'add',
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Read',
      unit: 'pages',
      target: 12,
      createdAt: 1234,
    })
    await waitFor(() => expect(document.activeElement).toBe(invoker))
  })
})

describe('ProgressGoalDialog edit-session state', () => {
  it('does not overwrite an in-progress edit when storage props refresh, but reseeds on the next open', async () => {
    const invokerRef = createRef<HTMLButtonElement>()
    const onIntent = vi.fn(async () => true)
    const view = render(
      <>
        <button ref={invokerRef}>Edit Water</button>
        <ProgressGoalDialog open kind="edit" goal={SAVED_GOAL} invokerRef={invokerRef} onClose={() => undefined} onIntent={onIntent} />
      </>,
    )
    const name = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
    await waitFor(() => expect(name.value).toBe('Water'))
    fireEvent.change(name, { target: { value: 'Draft name' } })

    const refreshed = { ...SAVED_GOAL, name: 'Fresh storage name', target: 10 }
    view.rerender(
      <>
        <button ref={invokerRef}>Edit Water</button>
        <ProgressGoalDialog open kind="edit" goal={refreshed} invokerRef={invokerRef} onClose={() => undefined} onIntent={onIntent} />
      </>,
    )
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Draft name')

    view.rerender(
      <>
        <button ref={invokerRef}>Edit Water</button>
        <ProgressGoalDialog open={false} kind="edit" goal={refreshed} invokerRef={invokerRef} onClose={() => undefined} onIntent={onIntent} />
      </>,
    )
    view.rerender(
      <>
        <button ref={invokerRef}>Edit Water</button>
        <ProgressGoalDialog open kind="edit" goal={refreshed} invokerRef={invokerRef} onClose={() => undefined} onIntent={onIntent} />
      </>,
    )
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Fresh storage name'))
  })
})
