// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { StoredLocation, WeatherSnapshot } from '../../../lib/storage/schema'
import { weatherRequestIdentity } from '../../../services/weather/identity'
import WeatherWidget from './WeatherWidget'

const NEW_YORK: StoredLocation = { lat: 40.71, lon: -74.01, label: 'New York', manual: true }

afterEach(() => vi.restoreAllMocks())

// 12 hours starting 9 AM, one (index 3) with a notable rain chance — mirrors
// the shape openMeteoProvider actually produces (12 fetch_hours, see
// openMeteo.ts), just handwritten so these tests never touch fetch.
function makeSnapshot(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    current: { tempC: 21, feelsLikeC: 19, code: 2, windKmh: 14, humidity: 55, isDay: true },
    hourly: Array.from({ length: 12 }, (_, i) => ({
      time: `2026-08-06T${String(9 + i).padStart(2, '0')}:00`,
      tempC: 20 + i,
      precipProb: i === 3 ? 60 : 10,
      code: 2,
      isDay: true,
    })),
    fetchedAt: Date.now(), // fresh — useWeather's SWR check must not refetch
    locationLabel: 'New York',
    requestIdentity: weatherRequestIdentity(NEW_YORK.lat, NEW_YORK.lon),
    sunriseISO: '2026-08-06T06:12',
    sunsetISO: '2026-08-06T19:58',
    ...overrides,
  }
}

async function renderWidget({
  location = NEW_YORK,
  snapshot = makeSnapshot(),
  onExpandedChange,
}: {
  location?: StoredLocation | null
  snapshot?: WeatherSnapshot | null
  onExpandedChange?: (expanded: boolean) => void
} = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('location', location)
  await storage.set('weatherCache', snapshot)
  const view = render(
    <StorageProvider storage={storage}>
      <WeatherWidget onExpandedChange={onExpandedChange} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, view }
}

const toggle = () => screen.getByRole('button', { expanded: false })
const openToggle = () => screen.getByRole('button', { expanded: true })

async function expandPanel() {
  await act(async () => {
    fireEvent.click(toggle())
  })
}

function weatherResponse(tempC: number): Response {
  return new Response(
    JSON.stringify({
      current: {
        temperature_2m: tempC,
        apparent_temperature: tempC,
        weather_code: 0,
        wind_speed_10m: 5,
        relative_humidity_2m: 50,
        is_day: 1,
      },
      hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [], is_day: [] },
    }),
    { status: 200 },
  )
}

async function activateWithModeledNativeClick(button: HTMLButtonElement) {
  button.focus()
  fireEvent.click(button)
}

describe('WeatherWidget collapsed chip', () => {
  it('shows current temp and location without any expanded content', async () => {
    await renderWidget()
    expect(toggle().textContent).toContain('21°')
    expect(toggle().textContent).toContain('New York')
    expect(screen.queryByText('Next 12 hours')).toBeNull()
  })

  // Narrow-window pass. At ~500px Jon's chip rendered "Clear ·" / "New" /
  // "York" stacked over three lines with the chevron stranded beside the
  // middle one. Two independent causes, fixed together below: the summary
  // line was allowed to WRAP, and the chip's width cap was a raw viewport
  // FRACTION (`tight:max-w-[30vw]` — 150px at 500px) while the chip's own
  // furniture (32px icon + 2rem temperature + chevron + padding ≈ 160px)
  // is a fixed number that doesn't shrink with the viewport, so the text
  // was handed a negative budget.
  // Jon: "adding F or C to the card would be nice." The collapsed chip's big
  // number gets the same treatment the expanded grid's end slots already use
  // (Task 72): the bright digits stay a leading text node, and the scale
  // letter rides a smaller, muted CHILD span — never a second derivation of
  // the string. The two pieces still concatenate to exactly
  // `displayTempWithUnit`, so DOM order (and screen-reader reading) matches
  // the picked render.
  it('labels the big temperature with its unit letter (metric → °C)', async () => {
    await renderWidget() // default settings are metric
    const big = toggle().querySelector('span.font-display.text-\\[2rem\\]')!
    expect(big.firstChild!.textContent).toBe('21°')
    const letter = big.querySelector('span')!
    expect(letter.textContent).toBe('C')
    expect(letter.className).toContain('text-[0.7em]')
    expect(letter.className).toContain('text-fg-muted')
    expect(big.textContent).toBe('21°C') // == displayTempWithUnit(21, 'metric')
  })

  it('labels the big temperature with its unit letter (imperial → °F)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('location', NEW_YORK)
    await storage.set('weatherCache', makeSnapshot())
    const settings = await storage.get('settings')
    await storage.set('settings', { ...settings!, units: 'imperial' })
    render(
      <StorageProvider storage={storage}>
        <WeatherWidget />
      </StorageProvider>,
    )
    await act(async () => {})
    const big = toggle().querySelector('span.font-display.text-\\[2rem\\]')!
    expect(big.firstChild!.textContent).toBe('70°') // 21°C → 70°F
    const letter = big.querySelector('span')!
    expect(letter.textContent).toBe('F')
    expect(letter.className).toContain('text-[0.7em]')
    expect(letter.className).toContain('text-fg-muted')
    expect(big.textContent).toBe('70°F') // == displayTempWithUnit(21, 'imperial')
  })

  it('reformats a mounted snapshot when display units change without refetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { storage, view } = await renderWidget()
    expect(toggle().textContent).toContain('21°C')

    await act(async () => {
      const settings = await storage.get('settings')
      await storage.set('settings', { ...settings!, units: 'imperial' })
    })

    expect(toggle().textContent).toContain('70°F')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((await storage.get('weatherCache'))?.requestIdentity).toBe(
      weatherRequestIdentity(NEW_YORK.lat, NEW_YORK.lon),
    )
    view.unmount()
    fetchSpy.mockRestore()
  })

  it('keeps condition and location on one line, with the full text in a title', async () => {
    await renderWidget()
    const summary = screen.getByTitle('Partly cloudy · New York')
    expect(summary.textContent).toBe('Partly cloudy · New York')
    // `truncate` is white-space:nowrap + ellipsis + overflow:hidden: the
    // line can shorten but can never become two lines, so the chevron
    // beside it can never be orphaned.
    expect(summary.classList.contains('truncate')).toBe(true)
  })

  it('caps the collapsed chip against the room left beside the timer pill, not a viewport fraction', async () => {
    await renderWidget()
    const section = screen.getByRole('region', { name: 'Weather' })
    // 8.5rem reserves both 1rem gutters plus the timer pill that bookends
    // the same row (App.tsx: timer `left-4`, weather `right-4`).
    expect(section.className).toContain('max-w-[min(24rem,calc(100vw_-_8.5rem))]')
    expect(section.className).not.toContain('tight:max-w-[30vw]')
  })

  it('gives the no-location setup a viewport-contained narrow sheet instead of the collapsed chip cap', async () => {
    await renderWidget({ location: null, snapshot: null })
    const section = screen.getByRole('region', { name: 'Weather' })

    expect(section.className).toContain('w-[min(20rem,calc(100vw_-_2rem))]')
    expect(section.className).not.toContain('xshort:max-w-')
  })

  // The short-wide fix (the board's last open collision): at 800x450 the
  // FORCED-WIDE (2-digit hour) clock's own right edge and this chip's
  // natural-content left edge measured 48.9px into each other (this fix's
  // own real-Chromium probe). jsdom can't compute the live calc()/var()
  // against a real viewport (same limitation the height-aware clamp test
  // above notes for Clock.tsx), so this pins the FORMULA the className
  // carries — the real cross-size, both-worst-states proof is the preview
  // harness's dedicated fencepost (scripts/preview.mjs).
  it('narrows the collapsed cap at xshort to clear the clock\'s own rendered half-width', async () => {
    await renderWidget()
    const section = screen.getByRole('region', { name: 'Weather' })
    // `50vw - 2rem - --clock-half-w`: the room left of this chip's own
    // right-anchored edge (100vw - 1rem) after the clock's reach from
    // viewport-centre (50vw + --clock-half-w) and the house 16px (1rem)
    // floor are both subtracted. min() with the two EXISTING terms means
    // this only ever narrows the cap, never widens it beyond the reading
    // measure or the timer-pill room.
    expect(section.className).toContain(
      'xshort:max-w-[min(24rem,calc(100vw_-_8.5rem),calc(50vw_-_2rem_-_var(--clock-half-w)))]',
    )
  })

  it('opens as a compact sheet rather than a sliver below the compact threshold', async () => {
    await renderWidget()
    await expandPanel()
    const section = screen.getByRole('region', { name: 'Weather' })
    // 30vw of a 500px window is 150px — narrower than the panel's own
    // header furniture. Below `compact` the panel takes a real width
    // instead, still stopping short of the timer pill.
    expect(section.className).toContain('compact:w-[min(20rem,calc(100vw_-_8.5rem))]')
  })

  // Measured regression (730x900): 30vw alone put the expanded panel's left
  // edge 12.3px INSIDE the right edge of a centred "Good afternoon." — a
  // collision no matrix viewport could see, since the only tall ones were
  // >=1024px wide and the 800px one is `xshort`, where the greeting is 18px
  // type. The second term states the rule the first only approximated: stay
  // out of the centred column's half of the page, plus that greeting's
  // overhang.
  it('keeps the expanded panel clear of the centred column in the tight band, not just of 30vw', async () => {
    await renderWidget()
    await expandPanel()
    const section = screen.getByRole('region', { name: 'Weather' })
    expect(section.className).toContain('tight:w-[min(30vw,calc(50vw_-_10.5rem))]')
    expect(section.className).not.toContain('tight:w-[30vw]')
  })

  it('keeps the rain callout visible even while collapsed', async () => {
    await renderWidget({
      snapshot: makeSnapshot({
        hourly: makeSnapshot().hourly.map((h, i) => (i === 1 ? { ...h, precipProb: 55 } : h)),
      }),
    })
    expect(screen.getByText(/rain likely/i)).toBeTruthy()
    expect(screen.queryByText('Next 12 hours')).toBeNull()
  })
})

// C1 (Jon: "you cannot click in to expand it unless you click on a very
// specific place in that box"). The chip's hit target must be the WHOLE chip,
// which structurally means: exactly one button, and every visible thing in the
// collapsed state is inside it. The real-geometry half of this — that clicks
// at each corner and the centre all expand — is a Playwright probe in
// scripts/preview.mjs; jsdom has no layout engine to measure hit areas with.
describe('WeatherWidget hit target', () => {
  it('renders the collapsed chip as a single button wrapping its entire content', async () => {
    await renderWidget({
      snapshot: makeSnapshot({
        hourly: makeSnapshot().hourly.map((h, i) => (i === 1 ? { ...h, precipProb: 55 } : h)),
      }),
    })
    const section = screen.getByRole('region', { name: 'Weather' })
    const buttons = section.querySelectorAll('button')
    expect(buttons).toHaveLength(1)

    const chip = buttons[0]!
    // Nothing renders outside the button while collapsed: the section's only
    // element child is the button itself.
    expect(section.children).toHaveLength(1)
    expect(section.firstElementChild).toBe(chip)
    // …including the rain callout, which used to be a sibling <p>.
    expect(chip.textContent).toContain('Rain likely')
    // The button carries the panel's own padding, so there is no padded
    // gutter left over for a click to fall into.
    expect(chip.className).toContain('px-4')
    expect(chip.className).toContain('w-full')
  })

  it('exposes an expanded close affordance on the same control', async () => {
    await renderWidget()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    await expandPanel()
    expect(openToggle().getAttribute('aria-expanded')).toBe('true')
    await act(async () => {
      fireEvent.click(openToggle())
    })
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })
})

// C3. The structural half of "pointer cursor ONLY on real controls": the
// section sets `cursor-default` (which INHERITS, killing the text I-beam on
// every label below it) and only the controls opt back in with
// `cursor-pointer`. Computed-cursor verification in a real browser is the
// preview harness's job.
describe('WeatherWidget affordances', () => {
  it('marks only the real controls as clickable', async () => {
    await renderWidget()
    await expandPanel()
    const section = screen.getByRole('region', { name: 'Weather' })
    expect(section.className).toContain('cursor-default')

    const controls = [...section.querySelectorAll('button, a')]
    expect(controls.length).toBeGreaterThan(0)
    for (const el of controls) expect(el.className).toContain('cursor-pointer')

    // Nothing that merely displays data may claim to be clickable.
    for (const el of section.querySelectorAll('dl *, svg, [aria-hidden]')) {
      expect(el.className.toString()).not.toContain('cursor-pointer')
    }
  })

  it('carries no scrollable region in either state', async () => {
    await renderWidget()
    const section = screen.getByRole('region', { name: 'Weather' })
    const scrolly = /overflow-(x-|y-)?(auto|scroll)/
    expect(section.outerHTML).not.toMatch(scrolly)
    await expandPanel()
    expect(section.outerHTML).not.toMatch(scrolly)
  })
})

describe('WeatherWidget expanded forecast grid (Jon\'s pick — "the numbers ARE the display")', () => {
  // makeSnapshot: 12 hours from 9 AM, tempC 20..31, rain 60% at index 3, 10%
  // elsewhere. The grid samples every two hours: indices 0,2,4,6,8,10 →
  // 9 AM (NOW), 11 AM, 1 PM, 3 PM, 5 PM, 7 PM.
  const grid = () =>
    screen.getByText('Next 12 hours').closest('div.border-t')!.querySelector('div.grid')!
  // The temperature span in a slot is the bright, digit-sized one (tabular-nums
  // text-fg); the label above it is muted, the rain below it is accent.
  const tempOf = (cell: Element) => cell.querySelector('span.tabular-nums.text-fg')!

  it('renders exactly six every-two-hours slots with real temperature digits', async () => {
    await renderWidget()
    await expandPanel()
    expect(grid().hasAttribute('data-weather-hourly-grid')).toBe(true)
    const cells = grid().children
    expect(cells).toHaveLength(6)
    // The first slot is labelled NOW; the rest carry compact, uppercased hours.
    const labels = [...cells].map((c) => c.querySelector('span')!.textContent)
    expect(labels).toEqual(['NOW', '11A', '1P', '3P', '5P', '7P'])
    // Every slot shows a real temperature (20..31°C sampled at even indices).
    const temps = [20, 22, 24, 26, 28, 30]
    ;[...cells].forEach((c, i) => {
      expect(c.textContent).toContain(`${temps[i]}°`)
    })
  })

  it('labels the scale on the first and last slot and on the Low (metric → °C)', async () => {
    await renderWidget() // default settings are metric
    await expandPanel()
    const cells = [...grid().children]
    // The end slots split the temp: bright digits (a leading text node) plus a
    // SMALLER, MUTED scale letter — matching the picked render, where the unit
    // is a subscript-weight annotation on the number, not a peer of it.
    for (const i of [0, 5]) {
      const temp = tempOf(cells[i]!)
      const letter = temp.querySelector('span')!
      expect(letter).toBeTruthy()
      expect(letter.textContent).toBe('C')
      expect(letter.className).toContain('text-fg-muted') // quieter than the digits
      expect(letter.className).toContain('text-[0.7em]') // ~70% of the digit height
      // The digits themselves are the bright leading text node, at full size.
      expect(temp.firstChild!.textContent).toBe(`${i === 0 ? 20 : 30}°`)
      expect(temp.textContent).toBe(`${i === 0 ? 20 : 30}°C`) // full string still assembled in the DOM
    }
    // Middle slots carry no letter at all — no nested span under the temp.
    expect(tempOf(cells[1]!).querySelector('span')).toBeNull()
    expect(tempOf(cells[1]!).textContent).toBe('22°')
    // Header range: High unlettered, Low lettered (full-size — that treatment
    // is faithful and stays).
    const range = screen.getByText(/^High/)
    expect(range.textContent).toContain('High 31°')
    expect(range.textContent).toContain('Low 20°C')
    expect(range.textContent).not.toContain('High 31°C')
  })

  it('uses °F on the ends and Low when settings.units is imperial', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('location', NEW_YORK)
    await storage.set('weatherCache', makeSnapshot())
    const settings = await storage.get('settings')
    await storage.set('settings', { ...settings!, units: 'imperial' })
    render(
      <StorageProvider storage={storage}>
        <WeatherWidget />
      </StorageProvider>,
    )
    await act(async () => {})
    await expandPanel()
    const cells = [...grid().children]
    // 20°C → 68°F, 30°C → 86°F. Same split: bright digits + a muted "F".
    const first = tempOf(cells[0]!)
    expect(first.firstChild!.textContent).toBe('68°')
    expect(first.querySelector('span')!.textContent).toBe('F')
    expect(first.querySelector('span')!.className).toContain('text-fg-muted')
    expect(first.textContent).toBe('68°F')
    expect(tempOf(cells[5]!).textContent).toBe('86°F')
    const range = screen.getByText(/^High/)
    expect(range.textContent).toContain('Low 68°F')
  })

  it('shows rain-chance only under slots at or above the 10% floor, in accent', async () => {
    await renderWidget({
      snapshot: makeSnapshot({
        // index 0 (NOW): 5% → hidden; index 2: 40% → shown; index 4: 9% → hidden.
        hourly: makeSnapshot().hourly.map((h, i) => ({
          ...h,
          precipProb: i === 0 ? 5 : i === 2 ? 40 : i === 4 ? 9 : h.precipProb,
        })),
      }),
    })
    await expandPanel()
    const cells = [...grid().children]
    expect(cells[0]!.textContent).not.toContain('%') // 5% — below floor, hidden
    expect(cells[1]!.textContent).toContain('40%') // index 2 → 40%, shown
    expect(cells[2]!.textContent).not.toContain('%') // 9% — below floor, hidden
    const rain = cells[1]!.querySelector('.text-accent')
    expect(rain).toBeTruthy()
    expect(rain!.textContent).toContain('40%')
  })

  it('emphasises the NOW slot with a filled chip', async () => {
    await renderWidget()
    await expandPanel()
    const cells = [...grid().children]
    expect(cells[0]!.className).toContain('bg-fg/[0.07]')
    // …and no other slot carries the emphasis.
    for (const c of cells.slice(1)) expect(c.className).not.toContain('bg-fg')
  })

  it('shows feels-like, wind, humidity and sunrise/sunset as a structured meta grid', async () => {
    await renderWidget()
    await expandPanel()
    expect(screen.getByText('Feels like').nextElementSibling?.textContent).toContain('19°')
    expect(screen.getByText('Wind').nextElementSibling?.textContent).toContain('14 km/h')
    expect(screen.getByText('Humidity').nextElementSibling?.textContent).toContain('55%')
    expect(screen.getByText('Sun').nextElementSibling?.textContent).toContain('6:12 AM')
    expect(screen.getByText('Sun').nextElementSibling?.textContent).toContain('7:58 PM')
  })

  it('omits the grid entirely rather than drawing a degenerate one', async () => {
    await renderWidget({ snapshot: makeSnapshot({ hourly: [] }) })
    await expandPanel()
    expect(screen.queryByText('Next 12 hours')).toBeNull()
    // The rest of the panel still renders from the current conditions.
    expect(screen.getByText('Humidity')).toBeTruthy()
  })
})

describe('WeatherWidget full-forecast link', () => {
  it('renders with the saved location coordinates substituted into the href', async () => {
    await renderWidget()
    await expandPanel()
    const link = screen.getByRole('link', { name: /full forecast/i })
    expect(link.getAttribute('href')).toBe('https://weather.com/weather/today/l/40.71,-74.01')
  })

  it('opens safely in a new tab: target=_blank, rel=noopener noreferrer', async () => {
    await renderWidget()
    await expandPanel()
    const link = screen.getByRole('link', { name: /full forecast/i })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('is absent entirely when there is no saved location', async () => {
    await renderWidget({ location: null, snapshot: null })
    expect(screen.queryByRole('link', { name: /full forecast/i })).toBeNull()
  })
})

describe('WeatherWidget stale data', () => {
  it('announces a pending stale refresh inside the chip and offers Refresh only once expanded', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>(() => {}),
    )
    const { view } = await renderWidget({
      snapshot: makeSnapshot({ fetchedAt: Date.now() - 60 * 60 * 1000 }),
    })
    // Still exactly one button while collapsed — the chip stays one hit target
    // even in this state (the old markup put a second button here).
    const section = screen.getByRole('region', { name: 'Weather' })
    expect(section.querySelectorAll('button')).toHaveLength(1)
    expect(toggle().textContent).toContain('Refreshing…')

    await expandPanel()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
    view.unmount()
    fetchSpy.mockRestore()
  })

  it('uses bounded alert copy and keeps a 36px named no-data Refresh control associated while retry is pending', async () => {
    let resolveRetry!: (value: Response) => void
    const retry = new Promise<Response>((resolve) => {
      resolveRetry = resolve
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('private provider detail'))
      .mockReturnValueOnce(retry)
    const { view } = await renderWidget({ snapshot: null })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Weather unavailable. Try again.')
    expect(screen.queryByText('private provider detail')).toBeNull()
    const refresh = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement
    expect(refresh.disabled).toBe(false)
    expect(refresh.classList.contains('min-h-9')).toBe(true)
    expect(refresh.closest('button')).toBe(refresh)

    await act(async () => {
      await activateWithModeledNativeClick(refresh)
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const pendingRefresh = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement
    expect(pendingRefresh).toBe(refresh)
    expect(pendingRefresh.disabled).toBe(true)
    expect(pendingRefresh.getAttribute('aria-busy')).toBe('true')
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Loading weather\u2026')
    expect(pendingRefresh.getAttribute('aria-describedby')).toBe(status.id)

    await act(async () => {
      resolveRetry(weatherResponse(22))
      await retry
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('22\u00b0')).toBeTruthy()
    view.unmount()
    fetchSpy.mockRestore()
  })

  it('keeps a 36px cached Refresh control and announces retry politely inside the one collapsed toggle status', async () => {
    let resolveRetry!: (value: Response) => void
    const retry = new Promise<Response>((resolve) => {
      resolveRetry = resolve
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('private provider detail'))
      .mockReturnValueOnce(retry)
    const { view } = await renderWidget({
      snapshot: makeSnapshot({ fetchedAt: Date.now() - 60 * 60 * 1000 }),
    })

    const offline = await screen.findByRole('status')
    expect(offline.textContent).toBe('Offline \u2014 showing cached')
    expect(screen.queryByText('private provider detail')).toBeNull()
    expect(screen.getByRole('region', { name: 'Weather' }).querySelectorAll('[role="status"]')).toHaveLength(1)
    await expandPanel()
    const refresh = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement
    expect(refresh.disabled).toBe(false)
    expect(refresh.classList.contains('min-h-9')).toBe(true)
    expect(refresh.closest('button')).toBe(refresh)

    await act(async () => {
      await activateWithModeledNativeClick(refresh)
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const pendingRefresh = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement
    expect(pendingRefresh).toBe(refresh)
    expect(pendingRefresh.disabled).toBe(true)
    expect(pendingRefresh.getAttribute('aria-busy')).toBe('true')
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Refreshing\u2026')
    expect(pendingRefresh.getAttribute('aria-describedby')).toBe(status.id)
    expect(screen.getByTitle('Partly cloudy · New York')).toBeTruthy()

    await act(async () => {
      resolveRetry(weatherResponse(24))
      await retry
    })
    expect(openToggle().textContent).toContain('24\u00b0')
    view.unmount()
    fetchSpy.mockRestore()
  })
})

// Task 55 (combined-defaults gate) — mirrors BookmarksBar's own
// onPopoverOpenChange coverage (BookmarksBar.test.tsx): jsdom can't verify
// real stacking/paint order (that's the real-Chromium preview probe's job —
// scripts/preview.mjs's own combined-defaults gate is what actually caught
// the github card painting on top of an expanded weather panel that
// geometrically covered it), but it CAN verify the mechanism App.tsx's
// conditional `z-30` depends on: the callback fires true on open, false on
// close, and false again on unmount, never a stale value.
describe('WeatherWidget onExpandedChange (Task 55)', () => {
  it('reports the no-location setup as an open surface so its composite owns stacking', async () => {
    const onExpandedChange = vi.fn()
    const { view } = await renderWidget({ location: null, snapshot: null, onExpandedChange })

    expect(onExpandedChange).toHaveBeenLastCalledWith(true)
    view.unmount()
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
  })

  it('calls onExpandedChange(true) on open and onExpandedChange(false) on close', async () => {
    const onExpandedChange = vi.fn()
    await renderWidget({ onExpandedChange })

    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
    onExpandedChange.mockClear()

    await expandPanel()
    expect(onExpandedChange).toHaveBeenLastCalledWith(true)

    await act(async () => {
      fireEvent.click(openToggle())
    })
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
  })

  // Same rationale as BookmarksBar's own unmount-cleanup test: without this,
  // App's mirrored `weatherExpanded` state would stick at `true` forever if
  // WeatherWidget ever unmounts while expanded (e.g. the connector's own
  // slot is dropped by arrange mode, or the widget toggle is switched off
  // mid-session), permanently outranking every connector card's own
  // z-index:auto wrapper.
  it('calls onExpandedChange(false) on unmount, even while expanded', async () => {
    const onExpandedChange = vi.fn()
    const { view } = await renderWidget({ onExpandedChange })
    await expandPanel()
    expect(onExpandedChange).toHaveBeenLastCalledWith(true)

    onExpandedChange.mockClear()
    view.unmount()
    expect(onExpandedChange).toHaveBeenCalledTimes(1)
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)
  })
})
