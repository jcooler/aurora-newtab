// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { useDialogEscape } from '../../../lib/dialogStack'
import LocationSetup from './LocationSetup'

// Same caveat as NotesPanel.test.tsx: fake timers block testing-library's
// setTimeout-polled findBy/waitFor, so every assertion below reads the DOM
// synchronously right after an awaited `act` + `advanceTimersByTimeAsync`.
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

const dallasTX = {
  name: 'Dallas',
  country: 'United States',
  admin1: 'Texas',
  latitude: 32.78,
  longitude: -96.8,
}
const dallasGA = {
  name: 'Dallas',
  country: 'United States',
  admin1: 'Georgia',
  latitude: 34.0,
  longitude: -84.8,
}

async function renderSetup() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  const utils = render(
    <StorageProvider storage={storage}>
      <LocationSetup />
    </StorageProvider>,
  )
  const input = screen.getByRole('combobox', { name: 'Search for a city' }) as HTMLInputElement
  return { storage, input, ...utils }
}

// Wraps LocationSetup in an ancestor dialog (the shared stack from
// src/lib/dialogStack.ts) so the "Escape must not bubble" test has a real
// outer Escape handler to prove it never reaches.
function DialogWrapper({ onClose }: { onClose: () => void }) {
  useDialogEscape(onClose)
  return <LocationSetup />
}

describe('LocationSetup typeahead', () => {
  it('does not search below the 2-character minimum, even once the debounce would have elapsed', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'D' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('debounces ~300ms and coalesces rapid typing into a single request for the final value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Da' } })
    fireEvent.change(input, { target: { value: 'Dal' } })
    fireEvent.change(input, { target: { value: 'Dall' } })
    expect(fetchMock).not.toHaveBeenCalled() // still debouncing

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('name=Dall')
  })

  it('shows a quiet "No matches" row when a completed search returns zero results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [] })))
    const { input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Zzzznotacity' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByText('No matches')).toBeTruthy()
  })

  it('renders each suggestion as name + admin1/country, and does not render a list while nothing has resolved yet', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )
    const { input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    // Request is in flight but unresolved — no spinner, no list.
    expect(screen.queryByRole('listbox')).toBeNull()

    await act(async () => {
      resolveFetch(jsonResponse({ results: [dallasTX, dallasGA] }))
    })

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0].textContent).toContain('Dallas')
    expect(options[0].textContent).toContain('Texas')
    expect(options[0].textContent).toContain('United States')
  })

  it('a stale response arriving after a newer one does not clobber the newer results (abort/race safety)', async () => {
    const deferred: Array<(v: unknown) => void> = []
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.push(resolve)
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Dal' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1) // request #1 now in flight

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2) // request #2 now in flight, #1 aborted

    // Resolve the NEWER request (#2) first...
    await act(async () => {
      deferred[1](jsonResponse({ results: [dallasTX] }))
    })
    expect(screen.getByText(/Dallas/)).toBeTruthy()
    expect(screen.queryByText(/Dalton/)).toBeNull()

    // ...then the STALE request (#1) resolves late. It must be ignored.
    await act(async () => {
      deferred[0](jsonResponse({ results: [{ ...dallasTX, name: 'Dalton', admin1: 'Georgia' }] }))
    })
    expect(screen.getByText(/Dallas/)).toBeTruthy()
    expect(screen.queryByText(/Dalton/)).toBeNull()
  })

  it('fails silently to a closed list on a network error (no error banner)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByText(/failed/i)).toBeNull()
  })

  it('ArrowDown twice then Enter selects the second suggestion and writes it to storage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX, dallasGA] })))
    const { storage, input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id)

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await storage.get('location')).toEqual({ lat: 34.0, lon: -84.8, label: 'Dallas', manual: true })
    expect(input.value).toBe('Dallas')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('ArrowUp wraps to the last option from the top', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX, dallasGA] })))
    const { input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    const options = screen.getAllByRole('option')
    expect(options[1].getAttribute('aria-selected')).toBe('true')
  })

  it('Enter with no arrow navigation selects the top match — old Enter muscle memory still works', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX, dallasGA] })))
    const { storage, input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await storage.get('location')).toEqual({ lat: 32.78, lon: -96.8, label: 'Dallas', manual: true })
  })

  it('clicking a suggestion selects it the same way as Enter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX] })))
    const { storage, input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    fireEvent.click(screen.getByRole('option'))

    expect(await storage.get('location')).toEqual({ lat: 32.78, lon: -96.8, label: 'Dallas', manual: true })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Escape closes the suggestion list without clearing the input, and does not bubble to close an ancestor dialog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX] })))
    const storage = createStorage(memoryDriver())
    await storage.init()
    const onClose = vi.fn()
    render(
      <StorageProvider storage={storage}>
        <DialogWrapper onClose={onClose} />
      </StorageProvider>,
    )
    const input = screen.getByRole('combobox', { name: 'Search for a city' }) as HTMLInputElement

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(screen.getByRole('listbox')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.value).toBe('Dallas') // input is NOT cleared
    expect(onClose).not.toHaveBeenCalled() // did not bubble to the ancestor dialog
  })

  it('Escape with the list already closed is a plain no-op here (nothing to stop, nothing to clear)', async () => {
    const { input } = await renderSetup()
    fireEvent.change(input, { target: { value: 'D' } }) // below min-chars, list never opens

    expect(() => fireEvent.keyDown(input, { key: 'Escape' })).not.toThrow()
    expect(input.value).toBe('D')
  })
})
