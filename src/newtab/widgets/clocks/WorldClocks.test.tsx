// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults } from '../../../lib/storage/schema'
import WorldClocks from './WorldClocks'

async function renderWithClocks(
  worldClocks: { zone: string; label: string }[],
  props: React.ComponentProps<typeof WorldClocks> = {},
) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, clocks: true },
  })
  await storage.set('worldClocks', worldClocks)
  const view = render(
    <StorageProvider storage={storage}>
      <WorldClocks {...props} />
    </StorageProvider>,
  )
  await act(async () => {})
  return view
}

describe('WorldClocks', () => {
  // vi.spyOn's own generic overloads don't infer cleanly through a
  // pre-declared `let`, so the spy is typed via a throwaway call rather than
  // spelling out MockInstance's generics by hand.
  let intervalSpy: ReturnType<typeof spyOnSetInterval>
  function spyOnSetInterval() {
    return vi.spyOn(window, 'setInterval')
  }

  beforeEach(() => {
    intervalSpy = spyOnSetInterval()
  })

  afterEach(() => {
    vi.useRealTimers()
    intervalSpy.mockRestore()
  })

  it('renders nothing while settings.widgets.clocks is off', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('worldClocks', [{ zone: 'Asia/Tokyo', label: 'Tokyo' }])
    const { container } = render(
      <StorageProvider storage={storage}>
        <WorldClocks />
      </StorageProvider>,
    )
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('an enabled-but-empty clocks widget renders nothing and never starts the ticking interval (the gate bug)', async () => {
    const { container } = await (async () => {
      const storage = createStorage(memoryDriver())
      await storage.init()
      await storage.set('settings', {
        ...defaults().settings,
        widgets: { ...defaults().settings.widgets, clocks: true },
      })
      // worldClocks left at its default ([]) — enabled, but no zones added.
      const result = render(
        <StorageProvider storage={storage}>
          <WorldClocks />
        </StorageProvider>,
      )
      await act(async () => {})
      return result
    })()

    expect(container.firstChild).toBeNull()
    // The bug this fixes: WorldClocksInner used to mount unconditionally
    // once the widget was on, calling useNow(30_000) — a 30s setInterval —
    // even though it immediately rendered null. The length check now lives
    // in the gate, so WorldClocksInner (and its interval) never mounts at
    // all for an empty list.
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('renders the joined zone list once clocks are added, and does start the interval', async () => {
    await renderWithClocks([
      { zone: 'Asia/Tokyo', label: 'Tokyo' },
      { zone: 'Europe/London', label: 'London' },
    ])

    expect(screen.getByText(/Tokyo/)).toBeTruthy()
    expect(screen.getByText(/London/)).toBeTruthy()
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000)
  })

  it('refreshes zone text immediately when a sleeping tab regains focus', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-26T12:00:00Z'))
    const view = await renderWithClocks([{ zone: 'Asia/Tokyo', label: 'Tokyo' }])
    const before = view.container.textContent
    vi.setSystemTime(new Date('2026-07-26T13:01:00Z'))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(view.container.textContent).not.toBe(before)
  })

  it('authors aligned Standard stack rows from the existing clock list', async () => {
    await renderWithClocks([
      { zone: 'Asia/Tokyo', label: 'Tokyo' },
      { zone: 'Europe/London', label: 'London' },
    ], { canvasSize: 'standard', presentation: 'stack' })
    expect(screen.getByRole('region', { name: 'World clocks' }).dataset.tierFrame).toBe('standard')
    expect(screen.getAllByTestId('world-clock-row')).toHaveLength(2)
  })
})
