// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver, type StorageDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { useDialogEscape } from '../../../lib/dialogStack'
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

  it('traps focus in the textarea once loaded, and restores focus to whatever was previously focused when it closes', async () => {
    // Stand-in for "the pill" that had focus before the panel opened — a
    // real click on NotesWidget's actual pill button isn't reproducible via
    // fireEvent.click in jsdom (unlike a real browser, it doesn't move
    // focus), so this asserts the same mechanism useFocusTrap actually keys
    // off: whatever `document.activeElement` was immediately before mount.
    const pillStandIn = document.createElement('button')
    document.body.appendChild(pillStandIn)
    pillStandIn.focus()
    expect(document.activeElement).toBe(pillStandIn)

    // notes resolves asynchronously (same as real chrome.storage), so the
    // panel's very first render has no ref-bearing dialog div yet — this
    // proves useFocusTrap's effect correctly re-fires once it appears,
    // rather than silently no-op'ing the way it would if `active` were
    // hardcoded `true` from that first, ref-less render (see the comment in
    // NotesPanel.tsx above the `useFocusTrap` call).
    const { unmount } = await renderPanel()
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(document.activeElement).toBe(textarea)

    unmount()
    expect(document.activeElement).toBe(pillStandIn)

    document.body.removeChild(pillStandIn)
  })

  it("doesn't register on the shared Escape stack until `notes` resolves, so a press during that window reaches whatever dialog is stacked below instead of being eaten", async () => {
    // A driver whose reads stay pending until releaseNotesRead() is called —
    // storage.init() itself runs against the fast base driver first (so
    // schema setup isn't blocked), and only the READS NotesPanel triggers
    // after that are held open, simulating the real (if usually <100ms)
    // async gap before useStoredKey('notes') resolves.
    const base = memoryDriver()
    let releaseNotesRead = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseNotesRead = resolve
    })
    const driver: StorageDriver = {
      read: (keys) => base.read(keys),
      write: (patch) => base.write(patch),
      onChanged: (cb) => base.onChanged(cb),
    }
    const storage = createStorage(driver)
    await storage.init()
    driver.read = async (keys) => {
      await gate
      return base.read(keys)
    }

    const belowOnClose = vi.fn()
    const notesOnClose = vi.fn()
    // Stands in for a dialog already open beneath Notes (e.g. the Drawer) —
    // registers immediately, same as any other always-active dialog.
    function BelowDialog() {
      useDialogEscape(belowOnClose)
      return null
    }

    render(
      <StorageProvider storage={storage}>
        <BelowDialog />
        <NotesPanel onClose={notesOnClose} />
      </StorageProvider>,
    )
    await act(async () => {}) // NotesPanel mounts; its notes read is gated, still pending

    // notes hasn't resolved yet — NotesPanel must not have claimed the top
    // of the stack, so Escape falls through to the dialog below it.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(belowOnClose).toHaveBeenCalledOnce()
    expect(notesOnClose).not.toHaveBeenCalled()

    releaseNotesRead()
    await act(async () => {}) // notes resolves; NotesPanel now registers

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(notesOnClose).toHaveBeenCalledOnce()
    expect(belowOnClose).toHaveBeenCalledOnce() // unchanged — this press was Notes'
  })
})
