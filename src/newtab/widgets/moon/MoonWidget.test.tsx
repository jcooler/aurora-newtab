// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults, type StoredLocation } from '../../../lib/storage/schema'
import { moonPhase } from '../../../lib/moon'
import MoonWidget from './MoonWidget'

// A northern location (sign of lat doesn't matter for the "renders" trio,
// only for the southern-mirror test below).
const LONDON: StoredLocation = { lat: 51.5074, lon: -0.1278, label: 'London', manual: true }
// A southern location — Sydney. moon.test.ts's own fixture (4 days after the
// 2026-01-18T19:52Z new moon) is reused here so this file's assertion is
// computed via the real moonPhase pipeline (parity, not a hand-typed glyph).
const SYDNEY: StoredLocation = { lat: -33.8688, lon: 151.2093, label: 'Sydney', manual: true }
const MOON_DATE = new Date(new Date('2026-01-18T19:52:00Z').getTime() + 4 * 86_400_000)

async function renderWithMoon({
  widgetOn = true,
  location = LONDON as StoredLocation | null,
}: {
  widgetOn?: boolean
  location?: StoredLocation | null
} = {}): Promise<{ storage: AuroraStorage; container: HTMLElement }> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    widgets: { ...defaults().settings.widgets, moon: widgetOn },
  })
  await storage.set('location', location)
  const { container } = render(
    <StorageProvider storage={storage}>
      <MoonWidget />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, container }
}

describe('MoonWidget', () => {
  // vi.spyOn's own generic overloads don't infer cleanly through a
  // pre-declared `let` (WorldClocks.test.tsx's own comment on the identical
  // issue) — typed via a throwaway call rather than spelling out
  // MockInstance's generics by hand.
  let intervalSpy: ReturnType<typeof spyOnSetInterval>
  function spyOnSetInterval() {
    return vi.spyOn(window, 'setInterval')
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(MOON_DATE)
    intervalSpy = spyOnSetInterval()
  })
  afterEach(() => {
    intervalSpy.mockRestore()
    vi.useRealTimers()
  })

  it('renders nothing while settings.widgets.moon is off, and never starts the ticking interval (the gate bug)', async () => {
    const { container } = await renderWithMoon({ widgetOn: false })
    expect(container.firstChild).toBeNull()
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('toggle on but location null renders nothing and never starts the interval', async () => {
    const { container } = await renderWithMoon({ widgetOn: true, location: null })
    expect(container.firstChild).toBeNull()
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('toggle on with a location set renders the section and starts the interval', async () => {
    const { container } = await renderWithMoon()
    expect(container.querySelector('section[aria-label="Moon phase"]')).toBeTruthy()
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000)
  })

  it('renders "{glyph} {name}" exactly, computed via the real moonPhase pipeline', async () => {
    const { container } = await renderWithMoon()
    const phase = moonPhase(MOON_DATE, false) // London: lat > 0, northern
    const section = container.querySelector('section[aria-label="Moon phase"]')!
    expect(section.textContent).toBe(`${phase.glyph} ${phase.name}`)
  })

  it('a southern-latitude location mirrors the glyph but keeps the name', async () => {
    const northern = moonPhase(MOON_DATE, false)
    const southern = moonPhase(MOON_DATE, true)
    expect(southern.name).toBe(northern.name) // sanity: names never differ by hemisphere
    expect(southern.glyph).not.toBe(northern.glyph) // sanity: this fixture date DOES mirror

    const { container } = await renderWithMoon({ location: SYDNEY })
    const section = container.querySelector('section[aria-label="Moon phase"]')!
    expect(section.textContent).toBe(`${southern.glyph} ${southern.name}`)
  })
})
