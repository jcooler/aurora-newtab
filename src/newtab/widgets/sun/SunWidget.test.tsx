// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults, type StoredLocation } from '../../../lib/storage/schema'
import { formatClock } from '../../../lib/clock'
import { sunTimes } from '../../../lib/sun'
import SunWidget from './SunWidget'

// New York — the same fixture sun.test.ts already proves against the NOAA/
// USNO table (±2 minutes). Reusing it here doesn't re-verify the astronomy
// (that's sun.test.ts's job); it lets this file's "line text matches exactly"
// assertions compute their EXPECTED string from the real sunTimes/formatClock
// pipeline (the same parity approach MonthCalWidget's countdown-dot test
// uses) instead of hand-typing a wall-clock string that would silently drift
// with the test runner's local timezone — exactly the class of bug Task 92's
// own fix-round commit ("sun fixtures speak utc — green in any timezone")
// closed for sun.test.ts itself.
const NYC: StoredLocation = { lat: 40.7128, lon: -74.006, label: 'New York', manual: true }
const NYC_SOLSTICE = new Date(2026, 5, 21, 12, 0, 0) // local noon, 2026-06-21

// Tromso, 2026-06-21 — sun.test.ts's own proven polar-day fixture (sunTimes
// returns null: the sun never sets that day at this latitude).
const TROMSO: StoredLocation = { lat: 69.6492, lon: 18.9553, label: 'Tromso', manual: true }
const TROMSO_POLAR_DAY = new Date(2026, 5, 21, 12, 0, 0)

// Tromso, 2026-01-15 — a real date where the sun still rises AND sets (so
// sunTimes is non-null) but its noon elevation never reaches +6°, so
// goldenHour is null (verified directly against sun.ts's own hourAngle logic
// before writing this fixture, not guessed).
const TROMSO_NO_GOLDEN = new Date(2026, 0, 15, 12, 0, 0)

async function renderWithSun({
  widgetOn = true,
  location = NYC as StoredLocation | null,
  use24Hour = false,
  docked = false,
}: {
  widgetOn?: boolean
  location?: StoredLocation | null
  use24Hour?: boolean
  docked?: boolean
} = {}): Promise<{ storage: AuroraStorage; container: HTMLElement }> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('settings', {
    ...defaults().settings,
    use24Hour,
    widgets: { ...defaults().settings.widgets, sun: widgetOn },
  })
  await storage.set('location', location)
  const { container } = render(
    <StorageProvider storage={storage}>
      <SunWidget docked={docked} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, container }
}

describe('SunWidget', () => {
  it('Docked renders one bare dense line, smaller than the compact card (batch-2 owner review)', async () => {
    vi.setSystemTime(NYC_SOLSTICE)
    const { container } = await renderWithSun({ docked: true })
    const line = container.querySelector('[data-dock-line]')!
    expect(line).toBeTruthy()
    const times = sunTimes(NYC_SOLSTICE, NYC.lat, NYC.lon)!
    expect(line.textContent).toContain(`☀ ${formatClock(times.sunrise, false)} → ${formatClock(times.sunset, false)}`)
    // The dock line is bare — no padded panel card around it.
    expect(container.querySelector('section')).toBeNull()
  })

  // Same intervalSpy discipline as WorldClocks.test.tsx: this is the actual
  // proof the gate lives BEFORE useNow, not just an inference from "renders
  // nothing".
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
    vi.setSystemTime(NYC_SOLSTICE)
    intervalSpy = spyOnSetInterval()
  })
  afterEach(() => {
    intervalSpy.mockRestore()
    vi.useRealTimers()
  })

  it('renders nothing while settings.widgets.sun is off, and never starts the ticking interval (the gate bug)', async () => {
    const { container } = await renderWithSun({ widgetOn: false })
    expect(container.firstChild).toBeNull()
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('toggle on but location null renders nothing and never starts the interval', async () => {
    const { container } = await renderWithSun({ widgetOn: true, location: null })
    expect(container.firstChild).toBeNull()
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('toggle on with a location set renders the section and starts the interval', async () => {
    const { container } = await renderWithSun()
    expect(container.querySelector('section[aria-label="Sun times"]')).toBeTruthy()
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('recomputes sun times when the local day changes in an open tab', async () => {
    const { container } = await renderWithSun()
    const before = container.querySelector('section[aria-label="Sun times"]')!.textContent
    vi.setSystemTime(new Date(2026, 8, 21, 12, 0, 0))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(container.querySelector('section[aria-label="Sun times"]')!.textContent).not.toBe(before)
  })

  it('line text matches "☀ {rise} → {set} · golden hour {gh}" exactly, computed via the real pipeline', async () => {
    const { container } = await renderWithSun({ use24Hour: false })
    const times = sunTimes(NYC_SOLSTICE, NYC.lat, NYC.lon)!
    const expected = `☀ ${formatClock(times.sunrise, false)} → ${formatClock(times.sunset, false)} · golden hour ${formatClock(times.goldenHour!, false)}`
    const section = container.querySelector('section[aria-label="Sun times"]')!
    expect(section.textContent).toBe(expected)
    expect(section.querySelector('[data-sun-golden]')?.textContent).toContain('golden hour')
  })

  it('use24Hour is respected both ways', async () => {
    const times = sunTimes(NYC_SOLSTICE, NYC.lat, NYC.lon)!

    const { container: c12 } = await renderWithSun({ use24Hour: false })
    const expected12 = `☀ ${formatClock(times.sunrise, false)} → ${formatClock(times.sunset, false)} · golden hour ${formatClock(times.goldenHour!, false)}`
    expect(c12.querySelector('section[aria-label="Sun times"]')!.textContent).toBe(expected12)

    const { container: c24 } = await renderWithSun({ use24Hour: true })
    const expected24 = `☀ ${formatClock(times.sunrise, true)} → ${formatClock(times.sunset, true)} · golden hour ${formatClock(times.goldenHour!, true)}`
    expect(c24.querySelector('section[aria-label="Sun times"]')!.textContent).toBe(expected24)

    expect(expected12).not.toBe(expected24)
  })

  it('drops the trailing golden-hour segment on a date where goldenHour is null', async () => {
    vi.setSystemTime(TROMSO_NO_GOLDEN)
    const times = sunTimes(TROMSO_NO_GOLDEN, TROMSO.lat, TROMSO.lon)!
    expect(times.goldenHour).toBeNull() // fixture sanity — proves the case this test exercises

    const { container } = await renderWithSun({ location: TROMSO })
    const expected = `☀ ${formatClock(times.sunrise, false)} → ${formatClock(times.sunset, false)}`
    const section = container.querySelector('section[aria-label="Sun times"]')!
    expect(section.textContent).toBe(expected)
    expect(section.textContent).not.toContain('golden hour')
  })

  it('renders nothing on a polar-day date (the gate, not the data, decides — no husk)', async () => {
    vi.setSystemTime(TROMSO_POLAR_DAY)
    expect(sunTimes(TROMSO_POLAR_DAY, TROMSO.lat, TROMSO.lon)).toBeNull() // fixture sanity

    const { container } = await renderWithSun({ location: TROMSO })
    expect(container.firstChild).toBeNull()
  })
})
