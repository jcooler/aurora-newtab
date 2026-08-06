// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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

async function expandPanel() {
  const toggle = screen.getByRole('button', { expanded: false })
  await act(async () => {
    fireEvent.click(toggle)
  })
}

describe('WeatherWidget collapsed chip (must stay untouched by the expanded redesign)', () => {
  it('shows current temp and location without any expanded content', async () => {
    await renderWidget()
    const toggle = screen.getByRole('button', { expanded: false })
    expect(toggle.textContent).toContain('21°')
    expect(toggle.textContent).toContain('New York')
    expect(screen.queryByRole('list', { name: 'Hourly forecast' })).toBeNull()
  })

  it('keeps the rain callout visible even while collapsed', async () => {
    await renderWidget({
      snapshot: makeSnapshot({
        hourly: makeSnapshot().hourly.map((h, i) => (i === 1 ? { ...h, precipProb: 55 } : h)),
      }),
    })
    expect(screen.getByText(/rain likely/i)).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Hourly forecast' })).toBeNull()
  })
})

describe('WeatherWidget expanded panel structure', () => {
  it('reveals all 12 fetched hours once expanded', async () => {
    await renderWidget()
    await expandPanel()
    const list = screen.getByRole('list', { name: 'Hourly forecast' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(12)
  })

  it('shows wind, humidity, and sunrise/sunset as a structured meta row', async () => {
    await renderWidget()
    await expandPanel()
    expect(screen.getByText('Wind').nextElementSibling?.textContent).toContain('14 km/h')
    expect(screen.getByText('Humidity').nextElementSibling?.textContent).toContain('55%')
    expect(screen.getByText('Sun').nextElementSibling?.textContent).toContain('6:12 AM')
    expect(screen.getByText('Sun').nextElementSibling?.textContent).toContain('7:58 PM')
  })

  it('emphasizes hours with a notable (>=30%) rain chance; leaves the rest muted', async () => {
    await renderWidget()
    await expandPanel()
    const items = within(screen.getByRole('list', { name: 'Hourly forecast' })).getAllByRole(
      'listitem',
    )
    const heavy = items[3]! // precipProb 60, per makeSnapshot
    const light = items[0]! // precipProb 10
    expect(heavy.textContent).toContain('60%')
    expect(light.textContent).toContain('10%')
    expect(heavy.innerHTML).toContain('text-accent')
    expect(light.innerHTML).not.toContain('text-accent')
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
