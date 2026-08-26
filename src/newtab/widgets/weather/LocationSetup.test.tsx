// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import type { StorageAuthority } from '../../../lib/storage/authority'
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

async function renderSetup(
  driver = memoryDriver(),
  authority?: StorageAuthority,
  tier: 'compact' | 'standard' | 'full' = 'standard',
) {
  const storage = authority ? createStorage(driver, authority) : createStorage(driver)
  await storage.init()
  const utils = render(
    <StorageProvider storage={storage}>
      <LocationSetup tier={tier} />
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
  it.each(['compact', 'standard'] as const)('portals %s suggestions beyond the frame, preserves combobox ownership, and selects a result', async (tier) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX] })))
    const { storage, input } = await renderSetup(memoryDriver(), undefined, tier)
    input.focus()
    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    const list = screen.getByRole('listbox')
    expect(list.parentElement).toBe(document.body)
    expect(list.className).toContain('fixed')
    expect(input.getAttribute('aria-controls')).toBe(list.id)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(input)

    fireEvent.click(screen.getByRole('option', { name: /Dallas/ }))
    await act(async () => {})
    expect(await storage.get('location')).toEqual({ lat: 32.78, lon: -96.8, label: 'Dallas, TX', manual: true })
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes the portalled list on an outside pointer without moving input focus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX] })))
    const { input } = await renderSetup()
    input.focus()
    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(input)
  })

  it('uses tier context for compact adaptation and gives every setup control a 36px target', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX] })))
    const { input } = await renderSetup(memoryDriver(), undefined, 'compact')
    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    const root = input.closest('[data-location-setup]') as HTMLElement | null
    expect(root?.dataset.locationTier).toBe('compact')
    expect(root?.className).not.toContain('xshort:')
    expect(input.className).toContain('min-h-9')
    expect(input.className).not.toContain('max-[420px]')
    expect(screen.getByRole('button', { name: 'Use my location' }).className).toContain('min-h-9')
    expect(screen.getByRole('option').className).toContain('min-h-9')
  })

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
    expect(options[0].textContent).not.toContain('—')
    expect(options[0].textContent).toContain(', Texas, United States')
    const [name, secondary] = options[0].querySelectorAll('span')
    expect(name.classList.contains('shrink-0')).toBe(true)
    expect(secondary.classList.contains('min-w-0')).toBe(true)
    expect(secondary.classList.contains('flex-1')).toBe(true)
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
    await act(async () => {})

    expect(await storage.get('location')).toEqual({ lat: 34.0, lon: -84.8, label: 'Dallas, GA', manual: true })
    expect(input.value).toBe('Dallas, GA')
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
    await act(async () => {})

    expect(await storage.get('location')).toEqual({ lat: 32.78, lon: -96.8, label: 'Dallas, TX', manual: true })
  })

  it('clicking a suggestion selects it the same way as Enter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX] })))
    const { storage, input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    fireEvent.click(screen.getByRole('option'))
    await act(async () => {})

    expect(await storage.get('location')).toEqual({ lat: 32.78, lon: -96.8, label: 'Dallas, TX', manual: true })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('commits a manual selection and cache invalidation in one atomic patch', async () => {
    const driver = memoryDriver()
    const write = vi.spyOn(driver, 'write')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX] })))
    const { storage, input } = await renderSetup(driver)
    await storage.set('weatherCache', {
      current: { tempC: 20, feelsLikeC: 19, code: 0, windKmh: 5, humidity: 50 },
      hourly: [],
      fetchedAt: Date.now(),
      locationLabel: 'Old place',
    })
    write.mockClear()

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option'))
      await Promise.resolve()
    })

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith({
      location: { lat: 32.78, lon: -96.8, label: 'Dallas, TX', manual: true },
      weatherCache: null,
      weatherAlertCache: null,
    })
    expect(await storage.get('weatherCache')).toBeNull()
    expect(await storage.get('weatherAlertCache')).toBeNull()
  })

  it('keeps the prior state, reports a save failure, and permits retry', async () => {
    const driver = memoryDriver()
    const baseWrite = driver.write.bind(driver)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX] })))
    const { storage, input } = await renderSetup(driver)
    const oldLocation = { lat: 1, lon: 2, label: 'Old place', manual: true }
    await storage.setMany({ location: oldLocation, weatherCache: null })

    let failNext = true
    driver.write = vi.fn(async (patch) => {
      if (failNext) {
        failNext = false
        throw new Error('disk full')
      }
      await baseWrite(patch)
    })

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option'))
      await Promise.resolve()
    })

    expect(await storage.get('location')).toEqual(oldLocation)
    expect(screen.getByRole('alert').textContent).toContain('Could not save location')
    expect(screen.getByRole('listbox')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('option'))
      await Promise.resolve()
    })
    expect(await storage.get('location')).toMatchObject({ lat: 32.78, lon: -96.8, manual: true })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('review fix: selecting mid-debounce cancels the pending timer — no ghost second fetch, no reopened list', async () => {
    // First search resolves and the list is showing (its results stay
    // visible "by design" — see handleQueryChange — while a second
    // keystroke's debounce is still pending below).
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX] }))
    vi.stubGlobal('fetch', fetchMock)
    const { storage, input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Da' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('listbox')).toBeTruthy()

    // A further keystroke arms a NEW 300ms timer without touching the
    // still-visible results — deliberately left unresolved/un-advanced here.
    fireEvent.change(input, { target: { value: 'Dal' } })

    // Select the still-visible suggestion from the FIRST search before that
    // second timer ever fires.
    fireEvent.click(screen.getByRole('option'))
    await act(async () => {})

    expect(await storage.get('location')).toEqual({ lat: 32.78, lon: -96.8, label: 'Dallas, TX', manual: true })
    expect(input.value).toBe('Dallas, TX')
    expect(screen.queryByRole('listbox')).toBeNull()

    // Advance well past where the cancelled "Dal" timer would have fired —
    // it must NOT have dispatched a second fetch or reopened the list.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
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

describe('LocationSetup dropdown edge clamping', () => {
  // jsdom never lays anything out (getBoundingClientRect is always an
  // all-zero rect), so the edge-clamp effect is normally a no-op in tests —
  // this mock simulates a REAL browser well enough to exercise it: a fixed
  // 300px-wide list sitting with its un-shifted left edge at x=400 in a
  // 500px-wide viewport (so its un-shifted right edge, x=700, sits 208px
  // past the window — same numbers as the reviewer's repro), reading the
  // list's OWN currently-applied `style.left` the way a real render would.
  const originalInnerWidth = window.innerWidth
  let rectSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })
    rectSpy = vi.spyOn(HTMLUListElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLUListElement) {
        const appliedLeft = parseFloat(this.style.left || '0') || 0
        const baseLeft = 400
        const width = 300
        return {
          left: baseLeft + appliedLeft,
          right: baseLeft + width + appliedLeft,
          width,
          height: 40,
          top: 0,
          bottom: 40,
          x: baseLeft + appliedLeft,
          y: 0,
          toJSON() {},
        } as DOMRect
      },
    )
  })

  afterEach(() => {
    rectSpy.mockRestore()
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('review fix: a second completed search while the list stays open does not un-clamp it back off-screen', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [dallasTX] }))
      .mockResolvedValueOnce(jsonResponse({ results: [dallasTX, dallasGA] }))
    vi.stubGlobal('fetch', fetchMock)
    const inputRectSpy = vi.spyOn(HTMLInputElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 400, right: 560, top: 40, bottom: 76, width: 160, height: 36,
      x: 400, y: 40, toJSON() {},
    } as DOMRect)
    const { input } = await renderSetup()

    fireEvent.change(input, { target: { value: 'Dal' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    const list = screen.getByRole('listbox')
    // A fixed portal uses the clamped viewport coordinate directly.
    expect(list.style.left).toBe('192px')

    // A second search resolves while the SAME list is still open (results
    // change, list never closes) — re-measuring must land on the same
    // answer, not treat the already-shifted position as a fresh baseline.
    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(list.style.left).toBe('192px')
    inputRectSpy.mockRestore()
  })

  it('owns a viewport-derived height, scrolls the active descendant, and converges on resize without shift drift', async () => {
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { value: 180, configurable: true })
    const scrollIntoView = vi.fn()
    const scrollHeightSpy = vi.spyOn(HTMLUListElement.prototype, 'scrollHeight', 'get').mockReturnValue(162)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    const inputRectSpy = vi.spyOn(HTMLInputElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 400,
      right: 560,
      top: 110,
      bottom: 146,
      width: 160,
      height: 36,
      x: 400,
      y: 110,
      toJSON() {},
    } as DOMRect)
    rectSpy.mockImplementation(function (this: HTMLUListElement) {
      const appliedLeft = parseFloat(this.style.left || '0') || 0
      const baseLeft = 400
      const width = 300
      const height = Math.min(164, parseFloat(this.style.maxHeight || '164'))
      const top = this.style.bottom && this.style.bottom !== 'auto' ? 110 - 4 - height : 150
      return {
        left: baseLeft + appliedLeft,
        right: baseLeft + width + appliedLeft,
        width,
        height,
        top,
        bottom: top + height,
        x: baseLeft + appliedLeft,
        y: top,
        toJSON() {},
      } as DOMRect
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX, dallasGA] })))
    const { input } = await renderSetup()
    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    const list = screen.getByRole('listbox')

    expect(list.classList.contains('overflow-x-hidden')).toBe(true)
    expect(list.style.left).toBe('192px')
    expect(list.style.top).toBe('8px')
    expect(list.style.bottom).toBe('')
    expect(list.style.maxHeight).toBe('98px')
    expect(list.style.transform).toBe('')

    input.focus()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(input)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })

    // Reproduce the clean-browser race from the packet aggregate: keyboard
    // navigation can select an option while the list still owns its old
    // height, then the queued resize measurement commits a shorter cap. The
    // active descendant must be scrolled again after that geometry commit;
    // otherwise the same active id survives while its row falls below the
    // newly clipped viewport.
    scrollIntoView.mockClear()
    Object.defineProperty(window, 'innerHeight', { value: 160, configurable: true })
    inputRectSpy.mockReturnValue({
      left: 400,
      right: 560,
      top: 90,
      bottom: 126,
      width: 160,
      height: 36,
      x: 400,
      y: 90,
      toJSON() {},
    } as DOMRect)
    await act(async () => {
      fireEvent(window, new Event('resize'))
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(list.style.left).toBe('192px')
    expect(list.style.top).toBe('8px')
    expect(list.style.bottom).toBe('')
    expect(list.style.maxHeight).toBe('78px')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    inputRectSpy.mockRestore()
    scrollHeightSpy.mockRestore()
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })

  it('caps the list to available space on one side of the focused input so the composite never self-occludes at 320x180', async () => {
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 180, configurable: true })
    const inputRectSpy = vi.spyOn(HTMLInputElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 16,
      right: 176,
      top: 70,
      bottom: 106,
      width: 160,
      height: 36,
      x: 16,
      y: 70,
      toJSON() {},
    } as DOMRect)
    rectSpy.mockImplementation(function (this: HTMLUListElement) {
      const appliedLeft = parseFloat(this.style.left || '0') || 0
      const height = Math.min(164, parseFloat(this.style.maxHeight || '164'))
      const top = this.style.bottom && this.style.bottom !== 'auto' ? 70 - 4 - height : 110
      return {
        left: 16 + appliedLeft,
        right: 304 + appliedLeft,
        width: 288,
        height,
        top,
        bottom: top + height,
        x: 16 + appliedLeft,
        y: top,
        toJSON() {},
      } as DOMRect
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [dallasTX, dallasGA] })))
    const { input } = await renderSetup(memoryDriver(), undefined, 'compact')
    input.focus()
    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    const list = screen.getByRole('listbox')
    const compactControlRow = input.parentElement?.parentElement
    expect(compactControlRow?.className).toContain('location-setup__controls')
    expect(input.closest('[data-location-setup]')?.getAttribute('data-location-tier')).toBe('compact')
    expect(input.parentElement?.className).toContain('location-setup__search')
    expect(screen.getByRole('button', { name: 'Use my location' }).className).toContain('location-setup__device')
    expect(screen.getByText('Weather needs a location.').className).toContain('location-setup__prompt')
    expect(document.activeElement).toBe(input)
    expect(list.style.top).toBe('110px')
    expect(list.style.bottom).toBe('')
    expect(list.style.maxHeight).toBe('62px')
    expect(list.style.transform).toBe('')
    expect(list.className).toContain('overflow-x-hidden')
    expect(list.className).not.toContain('max-h-[calc(100dvh-1rem)]')

    inputRectSpy.mockRestore()
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })
})

describe('LocationSetup "Use my location" (geolocation is an install-time permission — no request gate)', () => {
  // jsdom doesn't implement navigator.geolocation at all — defined directly
  // (same idiom as this file's window.innerWidth stub, and Data.test.tsx's
  // URL.createObjectURL stub) rather than vi.stubGlobal('navigator', ...),
  // which would replace the whole navigator object and lose everything else
  // jsdom/testing-library relies on it for.
  let getCurrentPosition: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getCurrentPosition = vi.fn()
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })
  })

  it('review fix: the button disables synchronously on click, before getCurrentPosition settles — a second click while it is still pending does not fire a second concurrent call', async () => {
    let resolvePosition: (pos: unknown) => void = () => {}
    getCurrentPosition.mockImplementation((success: (pos: unknown) => void) => {
      resolvePosition = success
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ city: 'Dallas' })))
    const { storage } = await renderSetup()
    const button = screen.getByRole('button', { name: 'Use my location' }) as HTMLButtonElement

    fireEvent.click(button)
    // getCurrentPosition deliberately left unresolved — the button must
    // already be disabled from this same click, so a second click here is a
    // no-op rather than a second concurrent getCurrentPosition call.
    expect(button.disabled).toBe(true)
    fireEvent.click(button)

    expect(getCurrentPosition).toHaveBeenCalledTimes(1)

    // Resolve the (single) outstanding call and confirm the button
    // re-enables and the flow completes normally.
    await act(async () => {
      resolvePosition({ coords: { latitude: 32.7767, longitude: -96.797 } })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(button.disabled).toBe(false)
    expect(await storage.get('location')).not.toBeNull()
  })

  it('device-level denial (the browser/OS location prompt itself is declined) shows an inline alert and writes no location', async () => {
    getCurrentPosition.mockImplementation((_success: (pos: unknown) => void, error: (err: unknown) => void) => {
      error(new Error('User denied Geolocation'))
    })
    const { storage } = await renderSetup()
    const button = screen.getByRole('button', { name: 'Use my location' }) as HTMLButtonElement

    await act(async () => {
      fireEvent.click(button)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Location denied — search for your city instead.')
    expect(button.getAttribute('aria-describedby')).toBe(alert.id)
    expect(await storage.get('location')).toBeNull()
    expect(button.disabled).toBe(false)
  })

  it('clicking "Use my location" calls navigator.geolocation.getCurrentPosition directly (no permission request in front of it) and writes the resolved location', async () => {
    getCurrentPosition.mockImplementation((success: (pos: unknown) => void) => {
      success({ coords: { latitude: 32.7767, longitude: -96.797 } })
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ city: 'Dallas' })))
    const { storage } = await renderSetup()
    const button = screen.getByRole('button', { name: 'Use my location' })

    await act(async () => {
      fireEvent.click(button)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(await storage.get('location')).toEqual({
      lat: 32.78,
      lon: -96.8,
      label: 'Dallas',
      manual: false,
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a manual selection wins when an older device reverse-geocode finishes late', async () => {
    let resolvePosition: (pos: unknown) => void = () => {}
    let resolveReverse: (value: unknown) => void = () => {}
    getCurrentPosition.mockImplementation((success: (pos: unknown) => void) => {
      resolvePosition = success
    })
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('reverse-geocode-client')) {
        return new Promise((resolve) => {
          resolveReverse = resolve
        })
      }
      return Promise.resolve(jsonResponse({ results: [dallasGA] }))
    }))
    const { storage, input } = await renderSetup()
    await storage.set('weatherCache', {
      current: { tempC: 10, feelsLikeC: 9, code: 0, windKmh: 5, humidity: 50 },
      hourly: [],
      fetchedAt: Date.now(),
      locationLabel: 'Old place',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    await act(async () => {
      resolvePosition({ coords: { latitude: 32.7767, longitude: -96.797 } })
      await Promise.resolve()
    })
    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option'))
      await Promise.resolve()
    })
    await act(async () => {
      resolveReverse(jsonResponse({ city: 'Device Dallas' }))
      await Promise.resolve()
    })

    expect(await storage.get('location')).toEqual({
      lat: 34,
      lon: -84.8,
      label: 'Dallas, GA',
      manual: true,
    })
    expect(await storage.get('weatherCache')).toBeNull()
  })

  it('rechecks device ownership inside a delayed authority entry after a manual save rejects', async () => {
    let holdNext = false
    let releaseHeld: () => void = () => {}
    let announceHeld: () => void = () => {}
    let held = Promise.resolve()
    const authority: StorageAuthority = {
      runExclusive<T>(work: () => Promise<T>): Promise<T> {
        if (!holdNext) return work()
        holdNext = false
        const gate = new Promise<void>((resolve) => {
          releaseHeld = resolve
        })
        held = new Promise<void>((resolve) => {
          announceHeld = resolve
        })
        announceHeld()
        return gate.then(work)
      },
    }
    let resolvePosition: (pos: unknown) => void = () => {}
    let resolveReverse: (value: unknown) => void = () => {}
    getCurrentPosition.mockImplementation((success: (pos: unknown) => void) => {
      resolvePosition = success
    })
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('reverse-geocode-client')) {
        return new Promise((resolve) => {
          resolveReverse = resolve
        })
      }
      return Promise.resolve(jsonResponse({ results: [dallasGA] }))
    }))
    const driver = memoryDriver()
    const baseWrite = driver.write.bind(driver)
    const { storage, input } = await renderSetup(driver, authority)
    const priorLocation = { lat: 1, lon: 2, label: 'Prior', manual: true }
    const priorCache = {
      current: { tempC: 10, feelsLikeC: 9, code: 0, windKmh: 5, humidity: 50 },
      hourly: [],
      fetchedAt: Date.now(),
      locationLabel: 'Prior',
    }
    await storage.setMany({ location: priorLocation, weatherCache: priorCache })
    let failNext = true
    driver.write = vi.fn(async (patch) => {
      if (failNext) {
        failNext = false
        throw new Error('disk full')
      }
      await baseWrite(patch)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    await act(async () => {
      resolvePosition({ coords: { latitude: 32.7767, longitude: -96.797 } })
      await Promise.resolve()
    })
    holdNext = true
    await act(async () => {
      resolveReverse(jsonResponse({ city: 'Device Dallas' }))
      await Promise.resolve()
      await held
    })

    fireEvent.change(input, { target: { value: 'Dallas' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option'))
      await Promise.resolve()
    })
    expect(screen.getByRole('alert').textContent).toContain('Could not save location')

    await act(async () => {
      releaseHeld()
      await Promise.resolve()
    })
    expect(await storage.get('location')).toEqual(priorLocation)
    expect(await storage.get('weatherCache')).toEqual(priorCache)

    await act(async () => {
      fireEvent.click(screen.getByRole('option'))
      await Promise.resolve()
    })
    expect(await storage.get('location')).toMatchObject({ lat: 34, lon: -84.8, manual: true })
    expect(await storage.get('weatherCache')).toBeNull()
  })

  it('unmounting during reverse geocoding aborts and prevents a late write', async () => {
    let resolvePosition: (pos: unknown) => void = () => {}
    let resolveReverse: (value: unknown) => void = () => {}
    let reverseSignal: AbortSignal | undefined
    getCurrentPosition.mockImplementation((success: (pos: unknown) => void) => {
      resolvePosition = success
    })
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      reverseSignal = init?.signal ?? undefined
      return new Promise((resolve) => {
        resolveReverse = resolve
      })
    }))
    const { storage, unmount } = await renderSetup()

    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    await act(async () => {
      resolvePosition({ coords: { latitude: 32.7767, longitude: -96.797 } })
      await Promise.resolve()
    })
    unmount()
    expect(reverseSignal?.aborted).toBe(true)
    await act(async () => {
      resolveReverse(jsonResponse({ city: 'Too late' }))
      await Promise.resolve()
    })
    expect(await storage.get('location')).toBeNull()
  })
})
