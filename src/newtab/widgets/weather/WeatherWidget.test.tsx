// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { StoredLocation, WeatherSnapshot } from '../../../lib/storage/schema'
import WeatherWidget from './WeatherWidget'

const NEW_YORK: StoredLocation = { lat: 40.71, lon: -74.01, label: 'New York', manual: true }

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
    sunriseISO: '2026-08-06T06:12',
    sunsetISO: '2026-08-06T19:58',
    ...overrides,
  }
}

async function renderWidget({
  location = NEW_YORK,
  snapshot = makeSnapshot(),
}: { location?: StoredLocation | null; snapshot?: WeatherSnapshot | null } = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('location', location)
  await storage.set('weatherCache', snapshot)
  render(
    <StorageProvider storage={storage}>
      <WeatherWidget />
    </StorageProvider>,
  )
  await act(async () => {})
  return storage
}

const toggle = () => screen.getByRole('button', { expanded: false })
const openToggle = () => screen.getByRole('button', { expanded: true })

async function expandPanel() {
  await act(async () => {
    fireEvent.click(toggle())
  })
}

describe('WeatherWidget collapsed chip', () => {
  it('shows current temp and location without any expanded content', async () => {
    await renderWidget()
    expect(toggle().textContent).toContain('21°')
    expect(toggle().textContent).toContain('New York')
    expect(screen.queryByRole('img', { name: /next 12 hours/i })).toBeNull()
  })

  // Narrow-window pass. At ~500px Jon's chip rendered "Clear ·" / "New" /
  // "York" stacked over three lines with the chevron stranded beside the
  // middle one. Two independent causes, fixed together below: the summary
  // line was allowed to WRAP, and the chip's width cap was a raw viewport
  // FRACTION (`tight:max-w-[30vw]` — 150px at 500px) while the chip's own
  // furniture (32px icon + 2rem temperature + chevron + padding ≈ 160px)
  // is a fixed number that doesn't shrink with the viewport, so the text
  // was handed a negative budget.
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
    expect(screen.queryByRole('img', { name: /next 12 hours/i })).toBeNull()
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

describe('WeatherWidget expanded panel structure', () => {
  it('draws the 12-hour trend with a text equivalent built from the fetched data', async () => {
    await renderWidget()
    await expandPanel()
    const graphic = screen.getByRole('img', { name: /next 12 hours/i })
    // makeSnapshot ramps 20°C..31°C with a 60% rain hour at index 3 (12:00).
    expect(graphic.getAttribute('aria-label')).toContain('high 31°')
    expect(graphic.getAttribute('aria-label')).toContain('low 20°')
    expect(graphic.getAttribute('aria-label')).toContain('60%')
    expect(graphic.getAttribute('aria-label')).toContain('12:00 PM')
  })

  it('labels the window high and low next to the graphic', async () => {
    await renderWidget()
    await expandPanel()
    expect(screen.getByText('Next 12 hours')).toBeTruthy()
    const range = screen.getByText(/^High/)
    expect(range.textContent).toContain('31°')
    expect(range.textContent).toContain('20°')
  })

  it('shows an hour tick for the first and last fetched hour', async () => {
    await renderWidget()
    await expandPanel()
    expect(screen.getByText('9a')).toBeTruthy()
    expect(screen.getByText('8p')).toBeTruthy()
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

  it('omits the graphic entirely rather than drawing a degenerate one', async () => {
    await renderWidget({ snapshot: makeSnapshot({ hourly: [] }) })
    await expandPanel()
    expect(screen.queryByRole('img')).toBeNull()
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
  it('reports staleness inside the chip and offers refresh only once expanded', async () => {
    await renderWidget({
      snapshot: makeSnapshot({ fetchedAt: Date.now() - 60 * 60 * 1000 }),
    })
    // Still exactly one button while collapsed — the chip stays one hit target
    // even in this state (the old markup put a second button here).
    const section = screen.getByRole('region', { name: 'Weather' })
    expect(section.querySelectorAll('button')).toHaveLength(1)
    expect(toggle().textContent).toContain('Updated a while ago')

    await expandPanel()
    expect(screen.getByRole('button', { name: /refresh/i })).toBeTruthy()
  })
})
