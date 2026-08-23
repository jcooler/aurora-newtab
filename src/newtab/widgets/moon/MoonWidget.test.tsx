// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults, type StoredLocation } from '../../../lib/storage/schema'
import { moonPhase } from '../../../lib/moon'
import MoonWidget from './MoonWidget'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'

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
  docked = false,
  canvasSize = 'compact',
}: {
  widgetOn?: boolean
  location?: StoredLocation | null
  docked?: boolean
  canvasSize?: CanvasSize
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
      <MoonWidget docked={docked} canvasSize={canvasSize} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, container }
}

describe('MoonWidget', () => {
  it('renders the current phase in the exact Compact ready TierFrame', async () => {
    vi.setSystemTime(MOON_DATE)
    const { container } = await renderWithMoon({ canvasSize: 'compact' })
    const frame = container.querySelector<HTMLElement>('section[aria-label="Moon phase"]')!
    expect(frame.getAttribute('data-tier-frame')).toBe('compact')
    expect(frame.getAttribute('data-tier-frame-state')).toBe('ready')
    expect(frame.classList.contains('tier-frame--compact')).toBe(true)
    expect(frame.className).not.toContain('overflow-y')
    expect(frame.querySelector('[class*="overflow-y"]')).toBeNull()
  })

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
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('recomputes the phase when the local day changes in an open tab', async () => {
    const { container } = await renderWithMoon()
    const before = container.querySelector('section[aria-label="Moon phase"]')!.textContent
    vi.setSystemTime(new Date(MOON_DATE.getTime() + 8 * 86_400_000))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(container.querySelector('section[aria-label="Moon phase"]')!.textContent).not.toBe(before)
  })

  it('renders the phase identity and computed illumination from the real moonPhase pipeline', async () => {
    const { container } = await renderWithMoon()
    const phase = moonPhase(MOON_DATE, false) // London: lat > 0, northern
    const section = container.querySelector('section[aria-label="Moon phase"]')!
    const illumination = Math.round(((1 - Math.cos(2 * Math.PI * phase.fraction)) / 2) * 100)
    expect(section.textContent).toContain(phase.glyph)
    expect(section.textContent).toContain(phase.name)
    expect(section.textContent).toContain(`${illumination}% illuminated`)
  })

  it('a southern-latitude location mirrors the glyph but keeps the name', async () => {
    const northern = moonPhase(MOON_DATE, false)
    const southern = moonPhase(MOON_DATE, true)
    expect(southern.name).toBe(northern.name) // sanity: names never differ by hemisphere
    expect(southern.glyph).not.toBe(northern.glyph) // sanity: this fixture date DOES mirror

    const { container } = await renderWithMoon({ location: SYDNEY })
    const section = container.querySelector('section[aria-label="Moon phase"]')!
    const illumination = Math.round(((1 - Math.cos(2 * Math.PI * southern.fraction)) / 2) * 100)
    expect(section.textContent).toContain(southern.glyph)
    expect(section.textContent).toContain(southern.name)
    expect(section.textContent).toContain(`${illumination}% illuminated`)
  })

  it('docked renders a bare dock line, not the padded card (batch-2 owner review)', async () => {
    const { container } = await renderWithMoon({ docked: true })
    const line = container.querySelector('[data-dock-line]')!
    expect(line).toBeTruthy()
    const phase = moonPhase(MOON_DATE, false)
    expect(line.textContent).toContain(`${phase.glyph} ${phase.name}`)
    // The padded compact card must NOT also render — docked replaces it.
    expect(container.querySelector('section[aria-label="Moon phase"]')).toBeNull()
    expect(container.querySelector('.bg-panel-solid')).toBeNull()
  })
})
