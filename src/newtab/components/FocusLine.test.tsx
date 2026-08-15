// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import FocusLine from './FocusLine'

const localDay = vi.hoisted(() => ({
  sample: { key: '2026-07-26', timeZone: 'America/New_York', now: new Date('2026-07-26T12:00:00Z') },
}))
vi.mock('../../lib/hooks/useLocalDay', () => ({ useLocalDay: () => localDay.sample }))

function setup(focus: { text: string; date: string; done: boolean } | null) {
  const driver = memoryDriver({ focus })
  const storage = createStorage(driver)
  const view = render(
    <StorageProvider storage={storage}>
      <FocusLine />
    </StorageProvider>,
  )
  return { driver, storage, view }
}

describe('FocusLine editor ownership', () => {
  beforeEach(() => {
    localDay.sample = {
      key: '2026-07-26', timeZone: 'America/New_York', now: new Date('2026-07-26T12:00:00Z'),
    }
  })

  it('hands focus to the editor and preserves its draft and focus across a parent rerender', async () => {
    const { storage, view } = setup({ text: 'Ship W2-P2', date: '2026-07-26', done: false })
    const edit = await screen.findByRole('button', { name: 'Edit' })

    fireEvent.click(edit)
    const input = screen.getByLabelText(/main focus today/i) as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: 'Draft stays owned here' } })

    view.rerender(<StorageProvider storage={storage}><FocusLine /></StorageProvider>)
    expect(input.value).toBe('Draft stays owned here')
    expect(document.activeElement).toBe(input)
  })

  it('cancels on Escape without writing and restores focus to Edit', async () => {
    const { driver } = setup({ text: 'Keep me', date: '2026-07-26', done: false })
    let writes = 0
    const unsubscribe = driver.onChanged((changes) => {
      if ('focus' in changes) writes += 1
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const input = screen.getByLabelText(/main focus today/i)
    fireEvent.change(input, { target: { value: 'Discard me' } })
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })

    const edit = await screen.findByRole('button', { name: 'Edit' })
    await waitFor(() => expect(document.activeElement).toBe(edit))
    expect(driver.dump().focus).toEqual({ text: 'Keep me', date: '2026-07-26', done: false })
    expect(writes).toBe(0)
    unsubscribe()
  })

  it('commits Enter exactly once and restores focus to Edit', async () => {
    const { driver } = setup({ text: 'Before', date: '2026-07-26', done: false })
    let writes = 0
    const unsubscribe = driver.onChanged((changes) => {
      if ('focus' in changes) writes += 1
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const input = screen.getByLabelText(/main focus today/i)
    fireEvent.change(input, { target: { value: '  After  ' } })
    fireEvent.submit(input.closest('form')!)

    const edit = await screen.findByRole('button', { name: 'Edit' })
    await waitFor(() => expect(document.activeElement).toBe(edit))
    await waitFor(() => expect(driver.dump().focus).toEqual({ text: 'After', date: '2026-07-26', done: false }))
    expect(writes).toBe(1)
    unsubscribe()
  })

  it('commits a trimmed initial prompt on blur', async () => {
    const { driver } = setup(null)
    const input = await screen.findByLabelText(/main focus today/i)
    fireEvent.change(input, { target: { value: '  Start here  ' } })
    fireEvent.blur(input)

    await waitFor(() => expect(driver.dump().focus).toEqual({
      text: 'Start here', date: '2026-07-26', done: false,
    }))
  })

  it('does not let an empty submit poison a later prompt blur', async () => {
    const { driver } = setup(null)
    const input = await screen.findByLabelText(/main focus today/i)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)
    fireEvent.change(input, { target: { value: 'Recovered prompt' } })
    fireEvent.blur(input)

    await waitFor(() => expect(driver.dump().focus).toEqual({
      text: 'Recovered prompt', date: '2026-07-26', done: false,
    }))
  })

  it('expires the prior day without assigning an active old draft to the new day', async () => {
    const { driver, storage, view } = setup({ text: 'Yesterday', date: '2026-07-26', done: false })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const input = screen.getByLabelText(/main focus today/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Old-day draft' } })

    localDay.sample = {
      key: '2026-07-27', timeZone: 'America/New_York', now: new Date('2026-07-27T04:00:01Z'),
    }
    view.rerender(<StorageProvider storage={storage}><FocusLine /></StorageProvider>)
    expect(input.value).toBe('Old-day draft')
    expect(driver.dump().focus).toEqual({ text: 'Yesterday', date: '2026-07-26', done: false })

    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })
    expect(await screen.findByText(/main focus today/i)).toBeTruthy()
    expect(screen.queryByText('Yesterday')).toBeNull()
    expect(driver.dump().focus).toEqual({ text: 'Yesterday', date: '2026-07-26', done: false })
  })

  it('does not assign an old-day editor draft to the new day when Enter follows rollover', async () => {
    const { driver, storage, view } = setup({ text: 'Yesterday', date: '2026-07-26', done: false })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const input = screen.getByLabelText(/main focus today/i)
    fireEvent.change(input, { target: { value: 'Old-day Enter draft' } })

    localDay.sample = {
      key: '2026-07-27', timeZone: 'America/New_York', now: new Date('2026-07-27T04:00:01Z'),
    }
    view.rerender(<StorageProvider storage={storage}><FocusLine /></StorageProvider>)
    fireEvent.submit(input.closest('form')!)

    await screen.findByLabelText(/main focus today/i)
    expect(driver.dump().focus).toEqual({ text: 'Yesterday', date: '2026-07-26', done: false })
  })

  it('does not assign an old-day editor draft to the new day when blur follows rollover', async () => {
    const { driver, storage, view } = setup({ text: 'Yesterday', date: '2026-07-26', done: false })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const input = screen.getByLabelText(/main focus today/i)
    fireEvent.change(input, { target: { value: 'Old-day blur draft' } })

    localDay.sample = {
      key: '2026-07-27', timeZone: 'America/New_York', now: new Date('2026-07-27T04:00:01Z'),
    }
    view.rerender(<StorageProvider storage={storage}><FocusLine /></StorageProvider>)
    fireEvent.blur(input)

    await screen.findByLabelText(/main focus today/i)
    expect(driver.dump().focus).toEqual({ text: 'Yesterday', date: '2026-07-26', done: false })
  })

  it('gives the completion, Edit, and editor targets a local 36px floor', async () => {
    setup({ text: 'Sized', date: '2026-07-26', done: false })
    const checkbox = await screen.findByRole('checkbox')
    expect(checkbox.closest('label')?.className).toContain('min-h-9')
    expect(checkbox.closest('label')?.className).toContain('min-w-9')
    const edit = screen.getByRole('button', { name: 'Edit' })
    expect(edit.className).toContain('min-h-9')
    expect(edit.className).toContain('min-w-9')

    fireEvent.click(edit)
    const input = screen.getByLabelText(/main focus today/i)
    expect(input.className).toContain('min-h-9')
  })

  it('compensates the prompt input margin-box without shrinking its 36px target', async () => {
    setup(null)
    const input = await screen.findByLabelText(/main focus today/i)
    expect(input.className).toContain('min-h-9')
    expect(input.className).toContain('-mb-[3px]')
    expect(input.className).toContain('short:mb-0')
    expect(input.className).toContain('xshort:mb-0')
  })
})
