// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { WidgetVariant } from '../../../lib/layout/types'
import type { StoredLocation, WeatherAlertCache, WeatherEnvironmentSnapshot, WeatherSnapshot } from '../../../lib/storage/schema'
import { environmentRequestIdentity } from '../../../services/weather/environmentIdentity'
import { weatherRequestIdentity } from '../../../services/weather/identity'
import { weatherAlertRequestIdentity } from '../../../services/weatherAlerts'
import WeatherWidget from './WeatherWidget'

const NEW_YORK: StoredLocation = { lat: 40.71, lon: -74.01, label: 'New York', manual: true }

afterEach(() => vi.restoreAllMocks())

// 12 hours starting 9 AM, one (index 3) with a notable rain chance — mirrors
// the shape openMeteoProvider actually produces (12 fetch_hours, see
// openMeteo.ts), just handwritten so these tests never touch fetch.
function environmentFor(
  overrides: Partial<Extract<WeatherEnvironmentSnapshot, { status: 'available' }>> = {},
): WeatherEnvironmentSnapshot {
  return {
    requestIdentity: environmentRequestIdentity(NEW_YORK.lat, NEW_YORK.lon),
    fetchedAt: Date.now(),
    status: 'available',
    usAqi: 42,
    uvIndex: 3,
    pollen: { status: 'available', readings: [{ species: 'grass', grainsPerCubicMeter: 2 }] },
    ...overrides,
  }
}

function makeSnapshot(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  const fetchedAt = overrides.fetchedAt ?? Date.now()
  return {
    current: { tempC: 21, feelsLikeC: 19, code: 2, windKmh: 14, humidity: 55, isDay: true },
    hourly: Array.from({ length: 12 }, (_, i) => ({
      time: `2026-08-06T${String(9 + i).padStart(2, '0')}:00`,
      tempC: 20 + i,
      precipProb: i === 3 ? 60 : 10,
      code: 2,
      isDay: true,
    })),
    fetchedAt, // fresh — useWeather's SWR check must not refetch
    locationLabel: 'New York',
    requestIdentity: weatherRequestIdentity(NEW_YORK.lat, NEW_YORK.lon),
    sunriseISO: '2026-08-06T06:12',
    sunsetISO: '2026-08-06T19:58',
    environment: environmentFor({ fetchedAt }),
    ...overrides,
  }
}

async function renderWidget({
  location = NEW_YORK,
  snapshot = makeSnapshot(),
  onExpandedChange,
  stageVariant = 'standard',
  docked = false,
  use24Hour = false,
  units = 'metric',
  alertCache,
}: {
  location?: StoredLocation | null
  snapshot?: WeatherSnapshot | null
  onExpandedChange?: (expanded: boolean) => void
  stageVariant?: WidgetVariant
  docked?: boolean
  use24Hour?: boolean
  units?: 'metric' | 'imperial'
  alertCache?: WeatherAlertCache | null
} = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  if (use24Hour || units !== 'metric') {
    const current = await storage.get('settings')
    await storage.set('settings', { ...current, use24Hour, units })
  }
  await storage.set('location', location)
  await storage.set('weatherCache', snapshot)
  await storage.set('weatherAlertCache', alertCache === undefined
    ? {
        requestIdentity: weatherAlertRequestIdentity(NEW_YORK.lat, NEW_YORK.lon),
        fetchedAt: Date.now(),
        status: 'unsupported',
        alerts: [],
      }
    : alertCache)
  const view = render(
    <StorageProvider storage={storage}>
      <WeatherWidget onExpandedChange={onExpandedChange} stageVariant={stageVariant} docked={docked} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, view }
}

function activeAlertCache(severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' = 'Severe'): WeatherAlertCache {
  return {
    requestIdentity: weatherAlertRequestIdentity(NEW_YORK.lat, NEW_YORK.lon),
    fetchedAt: Date.now(),
    status: 'supported',
    alerts: [{
      id: 'https://api.weather.gov/alerts/urn:oid:test',
      event: 'Severe Thunderstorm Warning',
      severity,
      urgency: 'Immediate',
      headline: 'Severe thunderstorms are moving through New York',
      areaDescription: 'New York County',
      effective: '2026-08-22T12:00:00.000Z',
      onset: '2026-08-22T12:00:00.000Z',
      expires: '2026-08-22T13:00:00.000Z',
      description: 'Damaging winds are possible.',
      instruction: 'Move indoors.',
    }],
  }
}

const toggle = () => screen.getByRole('button', { expanded: false })
const openToggle = () => screen.getByRole('button', { expanded: true })

function frame(tier: 'compact' | 'standard' | 'full'): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-tier-frame="${tier}"]`)
  expect(element, `missing ${tier} Weather frame`).toBeTruthy()
  return element!
}

function expectFlatFrame(element: HTMLElement): void {
  expect(element.querySelector('.rounded-panel')).toBeNull()
  expect(element.querySelector('.overflow-y-auto, .overflow-y-scroll')).toBeNull()
}

function expectNoFrameScroll(element: HTMLElement): void {
  expect(element.querySelector('.overflow-y-auto:not([hidden]), .overflow-y-scroll:not([hidden])')).toBeNull()
}

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

function environmentResponse(current: Record<string, number | null>): Response {
  return new Response(JSON.stringify({ current }), { status: 200 })
}

async function activateWithModeledNativeClick(button: HTMLButtonElement) {
  button.focus()
  fireEvent.click(button)
}

function domRect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('WeatherWidget collapsed chip', () => {
  it('authors Compact ready Weather inside the selected frame without metrics', async () => {
    await renderWidget({
      stageVariant: 'compact',
      units: 'imperial',
      snapshot: makeSnapshot({ current: { ...makeSnapshot().current, tempC: 22 } }),
    })

    const compact = frame('compact')
    expect(compact.getAttribute('data-tier-frame')).toBe('compact')
    expect(within(compact).getByText(/72/)).toBeTruthy()
    expect(within(compact).queryByText('Feels')).toBeNull()
    expectFlatFrame(compact)
  })

  it('authors Standard ready Weather with trend and flat supporting metrics', async () => {
    await renderWidget({ stageVariant: 'standard' })

    const standard = frame('standard')
    expect(standard.dataset.tierFrame).toBe('standard')
    expect(within(standard).getByText('Feels')).toBeTruthy()
    expect(within(standard).getByText('Wind')).toBeTruthy()
    expect(within(standard).getByText('Humidity')).toBeTruthy()
    expect(standard.querySelector('[data-weather-summary-trend]')).toBeTruthy()
    expectFlatFrame(standard)
  })

  it('authors Full ready Weather with its four-slot hourly signature', async () => {
    await renderWidget({ stageVariant: 'expanded' })

    const full = frame('full')
    expect(within(full).getByTestId('weather-summary-hourly')).toBeTruthy()
    expect(full.querySelectorAll('[data-weather-summary-hourly] > span')).toHaveLength(4)
    expectFlatFrame(full)
  })

  it('uses a Full allocation for useful inline hourly and metric content without auto-opening details', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await renderWidget({ stageVariant: 'expanded' })
    expect(document.querySelector('[data-weather-summary-size="full"]')).toBeTruthy()
    expect(document.querySelector('[data-weather-summary-hourly]')).toBeTruthy()
    expect(document.querySelector('[data-weather-summary-metrics]')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Weather details' })).toBeNull()
    expect(toggle()).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('removes only the Full hourly preview when an allocation becomes Standard', async () => {
    const { storage, view } = await renderWidget({ stageVariant: 'expanded' })
    expect(document.querySelector('[data-weather-summary-hourly]')).toBeTruthy()

    view.rerender(
      <StorageProvider storage={storage}>
        <WeatherWidget stageVariant="standard" />
      </StorageProvider>,
    )
    await act(async () => {})

    expect(document.querySelector('[data-weather-summary-size="standard"]')).toBeTruthy()
    expect(document.querySelector('[data-weather-summary-hourly]')).toBeNull()
    expect(document.querySelector('[data-weather-summary-trend]')).toBeTruthy()
    expect(document.querySelector('[data-weather-summary-metrics]')).toBeTruthy()
    expect(toggle()).toBeTruthy()
  })

  it('keeps Compact to icon, temperature, condition-location, freshness, and disclosure only', async () => {
    await renderWidget({ stageVariant: 'compact' })
    const summary = document.querySelector('[data-weather-summary-size="compact"]')!
    expect(summary.querySelector('[data-weather-current]')).toBeTruthy()
    expect(summary.querySelector('[data-weather-condition-location]')?.textContent).toBe('Partly cloudy - New York')
    expect(summary.querySelector('[data-weather-disclosure]')).toBeTruthy()
    expect(summary.querySelector('[data-weather-freshness]')?.textContent).toMatch(/^Updated (just now|\d+[mh] ago)$/)
    expect(summary.querySelector('[data-weather-summary-trend]')).toBeNull()
    expect(summary.querySelector('[data-weather-summary-metrics]')).toBeNull()
    expect(summary.querySelector('[data-weather-summary-hourly]')).toBeNull()
  })

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

  it('keeps a long condition and location on one line with accessible full hyphenated text', async () => {
    const label = 'The Extremely Long Metropolitan District of New York'
    await renderWidget({ location: { ...NEW_YORK, label }, snapshot: makeSnapshot({ locationLabel: label }) })
    const full = `Partly cloudy - ${label}`
    const summary = screen.getByTitle(full)
    expect(summary.textContent).toBe(full)
    expect(summary.getAttribute('aria-label')).toBe(full)
    // `truncate` is white-space:nowrap + ellipsis + overflow:hidden: the
    // line can shorten but can never become two lines, so the chevron
    // beside it can never be orphaned.
    expect(summary.classList.contains('truncate')).toBe(true)
  })

  it.each([
    ['compact', 'compact'],
    ['standard', 'standard'],
    ['expanded', 'full'],
  ] as const)('renders %s with no empty summary spacer rows', async (stageVariant, size) => {
    await renderWidget({ stageVariant })
    const summary = document.querySelector(`[data-weather-summary-size="${size}"]`)!
    expect([...summary.querySelectorAll('[data-weather-summary-row]')].every((row) => row.textContent?.trim())).toBe(true)
    expect(summary.querySelector('[data-weather-empty-row]')).toBeNull()
  })

  it('opens as a viewport-owned finite sheet rather than a narrow Canvas sliver', async () => {
    await renderWidget()
    await expandPanel()
    const section = screen.getByRole('region', { name: 'Weather' })
    // 30vw of a 500px window is 150px — narrower than the panel's own
    // header furniture. Below `compact` the panel takes a real width
    // instead, still stopping short of the timer pill.
    const details = screen.getByRole('dialog', { name: 'Weather details' }) as HTMLElement
    expect(section.children).toHaveLength(1)
    expect(details.parentElement).toBe(document.body)
    expect(details.className).toContain('w-96')
    expect(details.className).toContain('max-w-[calc(100vw-1rem)]')
    expect(Number.parseFloat(details.style.maxHeight)).toBeGreaterThan(0)
  })

  // Measured regression (730x900): 30vw alone put the expanded panel's left
  // edge 12.3px INSIDE the right edge of a centred "Good afternoon." — a
  // collision no matrix viewport could see, since the only tall ones were
  // >=1024px wide and the 800px one is `xshort`, where the greeting is 18px
  // type. The second term states the rule the first only approximated: stay
  // out of the centred column's half of the page, plus that greeting's
  // overhang.
  it('removes expanded details from the centred Canvas geometry entirely', async () => {
    await renderWidget()
    const section = screen.getByRole('region', { name: 'Weather' })
    const classBefore = section.className
    await expandPanel()
    const details = screen.getByRole('dialog', { name: 'Weather details' })
    expect(details.parentElement).toBe(document.body)
    expect(section.className).toBe(classBefore)
    expect(section.contains(details)).toBe(false)
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

describe('WeatherWidget tier frame states', () => {
  it('keeps Compact setup inside a permission-required frame with both existing location paths', async () => {
    await renderWidget({ location: null, snapshot: null, stageVariant: 'compact' })

    const compact = frame('compact')
    expect(compact.dataset.tierFrameState).toBe('permission-required')
    expect(within(compact).getByText('Weather needs a location.')).toBeTruthy()
    expect(within(compact).getByRole('button', { name: 'Use my location' })).toBeTruthy()
    expect(within(compact).getByRole('combobox', { name: 'Search for a city' })).toBeTruthy()
    expectNoFrameScroll(compact)
  })

  it('keeps Standard initial loading inside its selected frame with named status', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}))
    await renderWidget({ snapshot: null, stageVariant: 'standard' })

    const standard = frame('standard')
    expect(standard.dataset.tierFrameState).toBe('loading')
    expect(within(standard).getByRole('heading', { name: 'Weather' })).toBeTruthy()
    expect(standard.querySelector('[data-weather-state-skeleton]')).toBeTruthy()
    expect(within(standard).getByRole('status').textContent).toBe('Loading weather\u2026')
    expectNoFrameScroll(standard)
  })

  it('authors an empty Compact frame with a truthful refresh action and no second fetch owner', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await renderWidget({ snapshot: null, stageVariant: 'compact' })

    const compact = frame('compact')
    expect(compact.dataset.tierFrameState).toBe('empty')
    expect(within(compact).getByRole('heading', { name: 'Weather' })).toBeTruthy()
    expect(within(compact).getByText('No data yet.')).toBeTruthy()
    expect(within(compact).getByRole('button', { name: 'Refresh' })).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
    expectNoFrameScroll(compact)
  })

  it('keeps cached current conditions inside a stale Full frame while refresh is pending', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}))
    await renderWidget({
      snapshot: makeSnapshot({ fetchedAt: Date.now() - 60 * 60 * 1000 }),
      stageVariant: 'expanded',
    })

    const full = frame('full')
    expect(full.dataset.tierFrameState).toBe('stale')
    expect(within(full).getByText(/21/)).toBeTruthy()
    expect(within(full).getByRole('status').textContent).toBe('Refreshing\u2026')
    expectNoFrameScroll(full)
  })

  it('keeps current conditions inside a partial Standard frame when environment and alerts fail', async () => {
    const unavailable: WeatherEnvironmentSnapshot = {
      requestIdentity: environmentRequestIdentity(NEW_YORK.lat, NEW_YORK.lon),
      fetchedAt: Date.now(),
      status: 'unavailable',
      usAqi: null,
      uvIndex: null,
      pollen: { status: 'unavailable' },
    }
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('enrichment unavailable'))
    await renderWidget({
      snapshot: makeSnapshot({ environment: unavailable }),
      alertCache: { ...activeAlertCache(), fetchedAt: Date.now() - 60 * 60 * 1000 },
      stageVariant: 'standard',
    })

    const standard = frame('standard')
    await waitFor(() => expect(standard.dataset.tierFrameState).toBe('partial'))
    expect(within(standard).getByText(/21/)).toBeTruthy()
    expect(within(standard).getByRole('status').textContent).toBe('Weather details partially unavailable.')
    expectNoFrameScroll(standard)
  })

  it('keeps a Compact hard error fixed with Weather named and the existing Retry action', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private provider detail'))
    await renderWidget({ snapshot: null, stageVariant: 'compact' })
    await screen.findByRole('alert')

    const compact = frame('compact')
    expect(compact.dataset.tierFrameState).toBe('hard-error')
    expect(within(compact).getByRole('alert').textContent).toBe('Weather unavailable. Try again.')
    expect(within(compact).getByRole('button', { name: 'Refresh' })).toBeTruthy()
    expectNoFrameScroll(compact)
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

  it('keeps the Canvas chip non-scrollable and gives details one finite vertical scrollport', async () => {
    await renderWidget()
    const section = screen.getByRole('region', { name: 'Weather' })
    const scrolly = /overflow-(x-|y-)?(auto|scroll)/
    expect(section.outerHTML).not.toMatch(scrolly)
    await expandPanel()
    expect(section.outerHTML).not.toMatch(scrolly)
    const details = screen.getByRole('dialog', { name: 'Weather details' }) as HTMLElement
    expect(details.className).toContain('overflow-y-auto')
    expect(details.querySelectorAll('.overflow-y-auto')).toHaveLength(0)
    expect(Number.parseFloat(details.style.maxHeight)).toBeGreaterThan(0)
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
    expect(labels).toEqual(['NOW', '11 AM', '1 PM', '3 PM', '5 PM', '7 PM'])
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

  it('shows feels-like, wind, humidity, rain outlook, and sunrise/sunset as a structured meta grid', async () => {
    await renderWidget()
    await expandPanel()
    const details = within(screen.getByRole('dialog', { name: 'Weather details' }))
    expect(details.getByText('Feels like').nextElementSibling?.textContent).toContain('19°')
    expect(details.getByText('Wind').nextElementSibling?.textContent).toContain('14 km/h')
    expect(details.getByText('Humidity').nextElementSibling?.textContent).toContain('55%')
    // Rain outlook (owner 2026-08-18: fill the panel's empty cell): the PEAK
    // hourly precipitation probability with its hour, from data already
    // fetched — no new request fields.
    expect(details.getByText('Rain').nextElementSibling?.textContent).toMatch(/%\sat\s/)
    expect(details.getByText('Sunrise').nextElementSibling?.textContent).toContain('6:12 AM')
    expect(details.getByText('Sunset').nextElementSibling?.textContent).toContain('7:58 PM')
  })

  it('points the wind arrow AT the direction its own letters name, screen-up as north (owner 2026-08-21)', async () => {
    const base = makeSnapshot()
    await renderWidget({ snapshot: makeSnapshot({ current: { ...base.current, windDirection: 315 } }) })
    await expandPanel()
    const details = screen.getByRole('dialog', { name: 'Weather details' }) as HTMLElement
    // 315 degrees is a NW wind, and the arrow agrees with the letters: with
    // screen-up as north, rotating an up-pointing arrow by the bearing
    // itself aims it up-and-left, at the NW the label names. Adding 180
    // (the weather-map convention) would aim it SE while the text said NW.
    expect(within(details).getByText('Wind').nextElementSibling?.textContent).toContain('NW')
    const arrow = details.querySelector('[data-weather-wind-arrow]') as HTMLElement
    expect(arrow).toBeTruthy()
    expect(arrow.style.transform).toBe('rotate(315deg)')
  })

  it('omits the compass point entirely for a cache captured without a bearing', async () => {
    await renderWidget()
    await expandPanel()
    const details = screen.getByRole('dialog', { name: 'Weather details' }) as HTMLElement
    expect(details.querySelector('[data-weather-wind-arrow]')).toBeNull()
    expect(within(details).getByText('Wind').nextElementSibling?.textContent).toBe('14 km/h')
  })

  it('gives sunrise and sunset their own icon-led cells instead of bare arrows', async () => {
    await renderWidget()
    await expandPanel()
    const details = screen.getByRole('dialog', { name: 'Weather details' }) as HTMLElement
    expect(within(details).getByText('Sunrise').nextElementSibling?.textContent).toContain('6:12 AM')
    expect(within(details).getByText('Sunset').nextElementSibling?.textContent).toContain('7:58 PM')
    expect(details.querySelector('[data-weather-sunrise-icon]')).toBeTruthy()
    expect(details.querySelector('[data-weather-sunset-icon]')).toBeTruthy()
    // The generic up/down glyphs are retired, not merely restyled.
    expect(within(details).queryByText('Sun')).toBeNull()
    expect(details.textContent).not.toContain('\u2191')
    expect(details.textContent).not.toContain('\u2193')
  })

  it('states the rain hour unambiguously in 24-hour mode, with an icon', async () => {
    await renderWidget({ use24Hour: true })
    await expandPanel()
    const details = screen.getByRole('dialog', { name: 'Weather details' }) as HTMLElement
    const rain = within(details).getByText('Rain').nextElementSibling
    // "20% at 02" was the owner's complaint; a full clock hour replaces it.
    expect(rain?.textContent).toMatch(/% at \d{2}:00$/)
    expect(details.querySelector('[data-weather-rain-icon]')).toBeTruthy()
  })

  it('reads None expected when every hourly rain probability is negligible', async () => {
    await renderWidget({
      snapshot: makeSnapshot({
        hourly: Array.from({ length: 6 }, (_, index) => ({
          time: `2026-05-15T${String(10 + index).padStart(2, '0')}:00`,
          tempC: 20,
          precipProb: 4,
          code: 1,
          isDay: true,
        })),
      }),
    })
    await expandPanel()
    const details = within(screen.getByRole('dialog', { name: 'Weather details' }))
    expect(details.getByText('Rain').nextElementSibling?.textContent).toBe('None expected')
  })

  it('omits the grid entirely rather than drawing a degenerate one', async () => {
    await renderWidget({ snapshot: makeSnapshot({ hourly: [] }) })
    await expandPanel()
    expect(screen.queryByText('Next 12 hours')).toBeNull()
    // The rest of the panel still renders from the current conditions.
    expect(within(screen.getByRole('dialog', { name: 'Weather details' })).getByText('Humidity')).toBeTruthy()
  })
})

describe('WeatherWidget environmental briefing', () => {
  it('shows rounded AQI and UV categories, dominant pollen, and exact linked attribution', async () => {
    await renderWidget({
      snapshot: makeSnapshot({
        environment: environmentFor({
          usAqi: 50.5,
          uvIndex: 2.5,
          pollen: {
            status: 'available',
            readings: [
              { species: 'grass', grainsPerCubicMeter: 2.25 },
              { species: 'ragweed', grainsPerCubicMeter: 12.5 },
            ],
          },
        }),
      }),
    })
    await expandPanel()
    const details = within(screen.getByRole('dialog', { name: 'Weather details' }))
    expect(details.getByText('Air quality').nextElementSibling?.textContent).toBe('51 Moderate')
    expect(details.getByText('UV index').nextElementSibling?.textContent).toBe('3 Moderate')
    expect(details.getByText('Pollen').nextElementSibling?.textContent).toBe('Ragweed 12.5 grains/m³')

    const attribution = details.getByRole('link', {
      name: 'Air quality and pollen: CAMS ENSEMBLE via Open-Meteo',
    })
    expect(attribution.getAttribute('href')).toBe('https://open-meteo.com/en/docs/air-quality-api')
    expect(attribution.getAttribute('target')).toBe('_blank')
    expect(attribution.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it.each([
    ['AQI only', environmentFor({ usAqi: 42, uvIndex: null, pollen: { status: 'unavailable' } }), true, false, 'Pollen unavailable here'],
    ['UV only', environmentFor({ usAqi: null, uvIndex: 6, pollen: { status: 'unavailable' } }), false, true, 'Pollen unavailable here'],
    ['pollen only', environmentFor({ usAqi: null, uvIndex: null, pollen: { status: 'available', readings: [{ species: 'birch', grainsPerCubicMeter: 4 }] } }), false, false, 'Birch 4 grains/m³'],
    ['zero pollen', environmentFor({ usAqi: null, uvIndex: null, pollen: { status: 'available', readings: [{ species: 'grass', grainsPerCubicMeter: 0 }] } }), false, false, 'No pollen detected'],
  ])('renders the %s payload without blank definition cells', async (_name, environment, hasAqi, hasUv, pollenText) => {
    await renderWidget({ snapshot: makeSnapshot({ environment }) })
    await expandPanel()
    const details = within(screen.getByRole('dialog', { name: 'Weather details' }))
    expect(Boolean(details.queryByText('Air quality'))).toBe(hasAqi)
    expect(Boolean(details.queryByText('UV index'))).toBe(hasUv)
    expect(details.getByText('Pollen').nextElementSibling?.textContent).toBe(pollenText)
    const environmental = screen.getByRole('dialog', { name: 'Weather details' }).querySelector('[data-weather-environment]')
    expect(environmental?.querySelectorAll('dt').length).toBe(environmental?.querySelectorAll('dd').length)
    for (const value of environmental?.querySelectorAll('dd') ?? []) expect(value.textContent?.trim()).not.toBe('')
  })

  it('replaces empty successful readings with one truthful full-width message', async () => {
    await renderWidget({
      snapshot: makeSnapshot({
        environment: environmentFor({
          usAqi: null,
          uvIndex: null,
          pollen: { status: 'unavailable' },
        }),
      }),
    })
    await expandPanel()
    const environment = screen.getByRole('dialog', { name: 'Weather details' })
      .querySelector('[data-weather-environment]')!
    expect(within(environment as HTMLElement).getByText(
      'Environmental readings unavailable for this location.',
    )).toBeTruthy()
    expect(environment.querySelector('dl')).toBeNull()
  })

  it('shows complete environmental failure as useful forecast plus a visible retry', async () => {
    const unavailable: WeatherEnvironmentSnapshot = {
      requestIdentity: environmentRequestIdentity(NEW_YORK.lat, NEW_YORK.lon),
      fetchedAt: Date.now(),
      status: 'unavailable',
      usAqi: null,
      uvIndex: null,
      pollen: { status: 'unavailable' },
    }
    await renderWidget({ snapshot: makeSnapshot({ environment: unavailable }) })
    await expandPanel()
    const details = within(screen.getByRole('dialog', { name: 'Weather details' }))
    expect(details.getByText('Environmental data unavailable.')).toBeTruthy()
    expect(details.getByText('Feels like')).toBeTruthy()
    expect(details.getByRole('button', { name: 'Refresh' })).toBeTruthy()
  })

  it.each([
    ['compact' as const, false],
    ['standard' as const, true],
  ])('keeps %s closed content unchanged while old-cache enrichment is pending', async (stageVariant, docked) => {
    const pending = new Promise<Response>(() => {})
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending)
    const { environment: _environment, ...oldCache } = makeSnapshot()
    const { view } = await renderWidget({ snapshot: oldCache, stageVariant, docked })
    const closed = docked
      ? document.querySelector('[data-dock-line]')
      : document.querySelector('[data-weather-summary]')
    expect(closed?.textContent).not.toContain('Loading environmental data')
    expect(closed?.textContent).not.toContain('Refreshing')
    if (docked) {
      expect(closed?.textContent).toContain('21°C·New York·Partly cloudy')
    } else {
      expect(document.querySelectorAll('[data-weather-summary-row]')).toHaveLength(1)
    }

    await expandPanel()
    expect(within(screen.getByRole('dialog', { name: 'Weather details' })).getByText('Loading environmental data…')).toBeTruthy()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    view.unmount()
  })

  it('retries unavailable enrichment inside the dialog and replaces it without hiding forecast', async () => {
    const unavailable: WeatherEnvironmentSnapshot = {
      requestIdentity: environmentRequestIdentity(NEW_YORK.lat, NEW_YORK.lon),
      fetchedAt: Date.now(),
      status: 'unavailable',
      usAqi: null,
      uvIndex: null,
      pollen: { status: 'unavailable' },
    }
    let resolveEnvironment!: (response: Response) => void
    const environmental = new Promise<Response>((resolve) => {
      resolveEnvironment = resolve
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      return url.includes('air-quality-api.open-meteo.com')
        ? environmental
        : Promise.resolve(weatherResponse(22))
    })
    const { view } = await renderWidget({ snapshot: makeSnapshot({ environment: unavailable }) })
    await expandPanel()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    })
    const details = within(screen.getByRole('dialog', { name: 'Weather details' }))
    expect(details.getByText('Loading environmental data…')).toBeTruthy()
    expect(details.getByText('Feels like')).toBeTruthy()
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveEnvironment(environmentResponse({
        us_aqi: 35,
        uv_index: 1,
        alder_pollen: null,
        birch_pollen: null,
        grass_pollen: 7,
        mugwort_pollen: null,
        olive_pollen: null,
        ragweed_pollen: null,
      }))
      await environmental
    })
    await waitFor(() => expect(details.getByText('Air quality').nextElementSibling?.textContent).toBe('35 Good'))
    expect(details.queryByText('Environmental data unavailable.')).toBeNull()
    view.unmount()
  })
})

describe('WeatherWidget official NWS alerts', () => {
  it('adds a named Severe or Extreme badge to Compact without replacing weather', async () => {
    await renderWidget({ stageVariant: 'compact', alertCache: activeAlertCache('Severe') })
    expect(document.querySelector('[data-weather-current]')?.textContent).toBe('21°C')
    expect(screen.getByLabelText('Partly cloudy - New York')).toBeTruthy()
    expect(screen.getByText('Severe Thunderstorm Warning')).toBeTruthy()
  })

  it('adds the highest named active alert to Standard', async () => {
    await renderWidget({ stageVariant: 'standard', alertCache: activeAlertCache('Moderate') })
    expect(screen.getByText('Moderate · Severe Thunderstorm Warning')).toBeTruthy()
  })

  it('adds ALERT and the event to Docked while preserving click parity', async () => {
    await renderWidget({ docked: true, alertCache: activeAlertCache('Extreme') })
    const trigger = screen.getByRole('button', { name: /ALERT, Severe Thunderstorm Warning/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Weather details' })).toBeTruthy()
  })

  it('shows supported empty and active context only in expanded Weather details', async () => {
    const empty = { ...activeAlertCache(), alerts: [] }
    const first = await renderWidget({ alertCache: empty })
    await expandPanel()
    expect(screen.getByText('No active NWS alerts')).toBeTruthy()
    expect(screen.getByText('National Weather Service')).toBeTruthy()
    first.view.unmount()

    await renderWidget({ alertCache: activeAlertCache() })
    await expandPanel()
    const alerts = screen.getByRole('region', { name: 'NWS alerts' })
    expect(within(alerts).getByText('Severe Thunderstorm Warning')).toBeTruthy()
    expect(within(alerts).getByText('Severe thunderstorms are moving through New York')).toBeTruthy()
    expect(within(alerts).getByText('New York County')).toBeTruthy()
    fireEvent.click(within(alerts).getByText('Details and instructions'))
    expect(within(alerts).getByText('Damaging winds are possible.')).toBeTruthy()
    expect(within(alerts).getByText('Move indoors.')).toBeTruthy()
  })

  it('omits NWS entirely when coverage is unsupported', async () => {
    await renderWidget()
    await expandPanel()
    expect(screen.queryByRole('region', { name: 'NWS alerts' })).toBeNull()
    expect(screen.queryByText(/NWS alert/i)).toBeNull()
  })

  it('keeps forecast and environment useful when alert enrichment fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await renderWidget({ alertCache: null })
    expect(document.querySelector('[data-weather-current]')?.textContent).toBe('21°C')
    await expandPanel()
    expect(screen.getByText('Environment')).toBeTruthy()
    expect(screen.getByText('NWS alerts unavailable.')).toBeTruthy()
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
    let forecastAttempt = 0
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).includes('air-quality-api.open-meteo.com')) {
        return Promise.resolve(environmentResponse({ us_aqi: 35, uv_index: 1 }))
      }
      forecastAttempt += 1
      return forecastAttempt === 1 ? Promise.reject(new Error('private provider detail')) : retry
    })
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
    expect(fetchSpy).toHaveBeenCalledTimes(4)
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
    expect(document.querySelector('[data-weather-current]')?.textContent).toContain('22\u00b0')
    view.unmount()
    fetchSpy.mockRestore()
  })

  it('keeps a 36px cached Refresh control and announces retry politely inside the one collapsed toggle status', async () => {
    let resolveRetry!: (value: Response) => void
    const retry = new Promise<Response>((resolve) => {
      resolveRetry = resolve
    })
    let forecastAttempt = 0
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).includes('air-quality-api.open-meteo.com')) {
        return Promise.resolve(environmentResponse({ us_aqi: 35, uv_index: 1 }))
      }
      forecastAttempt += 1
      return forecastAttempt === 1 ? Promise.reject(new Error('private provider detail')) : retry
    })
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
    expect(fetchSpy).toHaveBeenCalledTimes(4)
    const pendingRefresh = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement
    expect(pendingRefresh).toBe(refresh)
    expect(pendingRefresh.disabled).toBe(true)
    expect(pendingRefresh.getAttribute('aria-busy')).toBe('true')
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Refreshing\u2026')
    expect(pendingRefresh.getAttribute('aria-describedby')).toBe(status.id)
    expect(screen.getByTitle('Partly cloudy - New York')).toBeTruthy()

    await act(async () => {
      resolveRetry(weatherResponse(24))
      await retry
    })
    expect(openToggle().textContent).toContain('24\u00b0')
    view.unmount()
    fetchSpy.mockRestore()
  })
})

describe('WeatherWidget viewport-owned details', () => {
  it('portals details without changing the collapsed Canvas footprint', async () => {
    await renderWidget()
    const section = screen.getByRole('region', { name: 'Weather' })
    const classBefore = section.className

    await expandPanel()

    const details = screen.getByRole('dialog', { name: 'Weather details' })
    expect(details.parentElement).toBe(document.body)
    expect(section.children).toHaveLength(1)
    expect(section.firstElementChild).toBe(openToggle())
    expect(section.className).toBe(classBefore)
    expect(details.className).toContain('overflow-y-auto')
  })

  it('anchors down and inward at the legal top-right edge', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.matches('button[aria-expanded]')) return domRect(792, 8, 992, 88)
      if (this.matches('[data-weather-details]')) return domRect(0, 0, 320, 400)
      return domRect(0, 0, 0, 0)
    })
    await renderWidget()

    await expandPanel()

    const details = screen.getByRole('dialog', { name: 'Weather details' }) as HTMLElement
    expect(details.dataset.weatherVertical).toBe('below')
    expect(details.dataset.weatherHorizontal).toBe('inward-left')
    expect(details.style.left).toBe('672px')
    expect(details.style.top).toBe('96px')
    expect(details.style.maxHeight).toBe('784px')
  })

  it('clamps against the layout viewport so a classic scrollbar gutter cannot cut the panel', async () => {
    // Real Windows Chrome lays out a scrollable document inside
    // documentElement.clientWidth/Height, while window.inner* still
    // includes the classic scrollbar gutter. Anchoring against inner*
    // let a top-right panel sit up to ~17px underneath the scrollbar —
    // the owner-reported right-edge cut. The anchor must clamp against
    // the layout viewport instead.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 983 })
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 780 })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.matches('button[aria-expanded]')) return domRect(792, 8, 992, 88)
      if (this.matches('[data-weather-details]')) return domRect(0, 0, 320, 400)
      return domRect(0, 0, 0, 0)
    })
    try {
      await renderWidget()

      await expandPanel()

      const details = screen.getByRole('dialog', { name: 'Weather details' }) as HTMLElement
      // maximumLeft = clientWidth 983 - 8 - 320 = 655: the panel's right
      // edge ends at 975 <= 983 instead of 992, which sat under the
      // scrollbar gutter when the clamp used window.innerWidth.
      expect(details.style.left).toBe('655px')
      expect(details.style.maxHeight).toBe('764px')
    } finally {
      Reflect.deleteProperty(document.documentElement, 'clientWidth')
      Reflect.deleteProperty(document.documentElement, 'clientHeight')
    }
  })

  it('re-anchors after a physical viewport resize without changing its Canvas owner', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    let triggerRect = domRect(792, 8, 992, 88)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.matches('button[aria-expanded]')) return triggerRect
      if (this.matches('[data-weather-details]')) return domRect(0, 0, 320, 400)
      return domRect(0, 0, 0, 0)
    })
    await renderWidget()
    const section = screen.getByRole('region', { name: 'Weather' })
    const ownerClass = section.className
    await expandPanel()
    const details = screen.getByRole('dialog', { name: 'Weather details' }) as HTMLElement
    expect(details.style.left).toBe('672px')
    expect(details.style.top).toBe('96px')

    triggerRect = domRect(8, 700, 208, 780)
    act(() => window.dispatchEvent(new Event('resize')))

    expect(details.dataset.weatherVertical).toBe('above')
    expect(details.dataset.weatherHorizontal).toBe('inward-right')
    expect(details.style.left).toBe('8px')
    expect(details.style.top).toBe('292px')
    expect(section.className).toBe(ownerClass)
    expect(section.contains(details)).toBe(false)
  })

  it('closes on Escape, outside pointer, and second activation while restoring the trigger', async () => {
    await renderWidget()
    const trigger = toggle()

    trigger.focus()
    await expandPanel()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Weather details' })).toBeNull()
    expect(document.activeElement).toBe(trigger)

    await expandPanel()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'Weather details' })).toBeNull()
    expect(document.activeElement).toBe(trigger)

    await expandPanel()
    fireEvent.click(openToggle())
    expect(screen.queryByRole('dialog', { name: 'Weather details' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('reasserts trigger focus after an outside pointer default action moves it', async () => {
    await renderWidget()
    const trigger = toggle()
    trigger.focus()
    await expandPanel()

    act(() => {
      fireEvent.pointerDown(document.body)
      document.body.tabIndex = -1
      document.body.focus()
    })
    expect(document.activeElement).toBe(document.body)

    await waitFor(() => expect(document.activeElement).toBe(trigger))
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

describe('Docked tier line (NL-P5 batch 1)', () => {
  it('renders one dense text-first line - temperature, location, condition - separated by middle dots', async () => {
    await renderWidget({ docked: true })
    const line = document.querySelector('[data-dock-line]') as HTMLElement
    expect(line).toBeTruthy()
    expect(line.tagName).toBe('BUTTON')
    expect(line.textContent).toContain('21')
    expect(line.textContent).toContain('New York')
    expect(line.textContent).toContain('Partly cloudy')
    expect(line.textContent).toContain('·')
    // One line by construction: the dock-line row never wraps.
    expect(line.className).toContain('dock-line')
    expect(document.querySelector('[data-weather-summary-row]')).toBeNull()
  })

  it('clicking the docked line opens the SAME details panel the free form offers (spec 2.4)', async () => {
    await renderWidget({ docked: true })
    await act(async () => {
      fireEvent.click(document.querySelector('[data-dock-line]') as HTMLElement)
    })
    expect(await screen.findByRole('dialog', { name: 'Weather details' })).toBeTruthy()
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog', { name: 'Weather details' })).toBeNull()
  })

  it('the digits carry the chip weight and the unit letter has no extra em shrink (owner-reported: F dominant)', async () => {
    await renderWidget({ docked: true })
    const temp = document.querySelector('[data-dock-line] [data-canvas-type-role="body"]') as HTMLElement
    expect(temp.className).toContain('font-medium')
    const letter = temp.querySelector('[data-canvas-type-role="metadata"]') as HTMLElement
    expect(letter).toBeTruthy()
    expect(letter.className).not.toContain('0.75em')
  })

  it('with no location the docked form keeps the honest setup affordance', async () => {
    await renderWidget({ docked: true, location: null, snapshot: null })
    expect(screen.getByText('Weather needs a location.')).toBeTruthy()
  })
})
