// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import NotesPanel from './NotesPanel'

async function renderPanel() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const utils = render(
    <StorageProvider storage={storage}>
      <NotesPanel onClose={vi.fn()} />
    </StorageProvider>,
  )
  // Fake timers (below) block testing-library's setTimeout-polled findBy/
  // waitFor, same caveat as Background.test.tsx — drain the initial
  // useStoredKey('notes') resolution via act(async) instead.
  await act(async () => {})
  return { storage, unmount: utils.unmount }
}

describe('NotesPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('autosaves the debounced text to storage 500ms after the last keystroke', async () => {
    const { storage } = await renderPanel()
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'Remember the milk' } })
    expect((await storage.get('notes')).text).toBe('') // still debouncing

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect((await storage.get('notes')).text).toBe('Remember the milk')
  })

  it('flushes a pending debounced save on unmount instead of dropping it', async () => {
    const { storage, unmount } = await renderPanel()
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'Unsaved edit' } })
    unmount() // well before the 500ms debounce would have fired on its own
    await act(async () => {})

    expect((await storage.get('notes')).text).toBe('Unsaved edit')
  })

  it('applies an external update only while the textarea is unfocused (last-writer-wins)', async () => {
    const { storage } = await renderPanel()
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.focus(textarea)
    await act(async () => {
      await storage.set('notes', { text: 'ignored while focused', updatedAt: 1 })
    })
    expect(textarea.value).toBe('')

    fireEvent.blur(textarea)
    await act(async () => {
      await storage.set('notes', { text: 'applied while unfocused', updatedAt: 2 })
    })
    expect(textarea.value).toBe('applied while unfocused')
  })
})
