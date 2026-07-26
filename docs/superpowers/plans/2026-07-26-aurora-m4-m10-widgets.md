# Aurora Widgets (M4–M10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every remaining v1 widget — weather, quick links, to-dos, focus timer, daily quote, command palette — plus the polish milestone, completing the Aurora spec in full.

**Architecture:** Each widget is an isolated folder under `src/newtab/widgets/<name>/` gated by `settings.widgets.<name>` and wrapped in `WidgetBoundary`. All state flows through the typed storage wrapper; the weather service lives behind a `WeatherProvider` interface in `src/services/weather/`. Pure logic (reducers, fuzzy matcher, callout, unit conversion) is TDD'd; components stay thin.

**Tech Stack:** unchanged (Vite 6, crxjs 2, React 19, TS 5 strict, Tailwind 4, Vitest 3). No new runtime dependencies. Playwright preview harness (`scripts/preview.mjs`) for visual verification.

**Spec:** `docs/superpowers/specs/2026-07-26-aurora-newtab-design.md`
**Prior plan:** `docs/superpowers/plans/2026-07-26-aurora-m1-m3-foundation.md` (M1–M3, merged)

## Global Constraints

- Local-first: the ONLY outbound network calls are Open-Meteo forecast + geocoding, isolated in `src/services/weather/`. Nothing else in `src/` may fetch.
- All storage through the wrapper (`useStoredKey` / `useStorage`); `chrome.storage` only inside `src/lib/storage/chrome.ts`. `chrome.runtime.getURL` is permitted where a task says so (favicons).
- No new runtime dependencies. No UI kit. Lazy-load panel-heavy widgets via `React.lazy`.
- Accessibility: keyboard reachable, visible `focus-visible` ring, `prefers-reduced-motion` respected (`motion-reduce:` variants on transitions), labels/aria as specified per task.
- **chrome.storage gotcha (bit us once):** writes that deep-equal the stored value emit NO onChanged event. Any write that must trigger a re-read has to actually change the value (nonce pattern: `PhotoPrefs.uploadedAt`). The memoryDriver mirrors this — a test relying on a no-op write notifying will fail, correctly.
- Screenshot verification: tasks that change visible UI end with `npm run build && node scripts/preview.mjs` (extended when the task says so). The controller reviews the PNGs; implementers report that the run succeeded with no console errors.
- Widget visual language (matches drawer/panels): container `rounded-panel border border-panel-border bg-panel backdrop-blur-[var(--panel-blur)]`, text `text-fg` / `text-fg-muted`, accents `text-accent`, focus ring `focus-visible:outline-2 focus-visible:outline-accent`.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (`<footer>` below).
- Work directly on `main` (Jon's explicit continuous-build directive supersedes the branch-per-feature flow; history stays commit-per-task).
- Weather data is stored metric (°C, km/h) regardless of display units; conversion happens at render. Cache is unit-agnostic.
- World clocks + countdown remain backlog (spec marks them optional stretch), NOT part of this plan.

---

### Task 12: Storage hardening + schema additions (M4 prerequisite)

**Files:**
- Modify: `src/lib/storage/index.ts`, `src/lib/storage/schema.ts`
- Modify: `src/newtab/components/Background.test.tsx` (fixture fix)
- Test: `src/lib/storage/index.test.ts` (extend)

**Interfaces:**
- Consumes: existing wrapper/driver/schema.
- Produces: `AuroraData.weatherCache: WeatherSnapshot | null` (type re-exported from schema as an import from `../../services/weather/types` is NOT allowed — schema must not depend on services; instead schema declares the shape locally, see Step 1). Serialized per-key `update()` that no longer uses `this`.

- [ ] **Step 1: Add `weatherCache` to the schema** — in `src/lib/storage/schema.ts` add (schema owns the persisted shape; the weather service imports THESE types, never the reverse):

```ts
export interface CurrentWeather {
  tempC: number
  feelsLikeC: number
  code: number // WMO weather code
  windKmh: number
  humidity: number
}

export interface HourlyPoint {
  time: string // ISO local hour from Open-Meteo
  tempC: number
  precipProb: number // 0-100
  code: number
}

export interface WeatherSnapshot {
  current: CurrentWeather
  hourly: HourlyPoint[] // next ~12h
  fetchedAt: number // epoch ms
  locationLabel: string
}
```

Add to `AuroraData`: `weatherCache: WeatherSnapshot | null`, and to `defaults()`: `weatherCache: null`. No version bump — new TOP-LEVEL key, covered by the default-merge contract (see the loud comment in migrations.ts).

- [ ] **Step 2: Write failing tests for update() serialization and this-binding**

Append to `src/lib/storage/index.test.ts`:

```ts
  it('serializes concurrent update() calls on the same key', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('todoLists', [{ id: 'l1', name: 'A', items: [] }])
    const slow = storage.update('todoLists', (lists) => [
      ...lists,
      { id: 'l2', name: 'B', items: [] },
    ])
    const fast = storage.update('todoLists', (lists) => [
      ...lists,
      { id: 'l3', name: 'C', items: [] },
    ])
    await Promise.all([slow, fast])
    const ids = (await storage.get('todoLists')).map((l) => l.id)
    expect(ids).toEqual(['l1', 'l2', 'l3']) // neither write lost
  })

  it('update() works when destructured (no this-binding)', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const { update, get } = storage
    await update('focus', () => ({ text: 'x', date: '2026-07-26', done: false }))
    expect((await get('focus'))?.text).toBe('x')
  })
```

- [ ] **Step 3: Run to verify the serialization test fails** — `npm test`. (The interleaved read-modify-write drops 'l2' or 'l3' today.)

- [ ] **Step 4: Rework `createStorage`** — replace the object-literal-with-`this` with closures + a per-key promise chain:

```ts
export function createStorage(driver: StorageDriver): AuroraStorage {
  const chains = new Map<string, Promise<unknown>>()

  async function get<K extends DataKey>(key: K): Promise<AuroraData[K]> {
    const found = await driver.read([key])
    return (key in found ? found[key] : defaults()[key]) as AuroraData[K]
  }

  async function set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void> {
    await driver.write({ [key]: value })
  }

  function update<K extends DataKey>(
    key: K,
    fn: (value: AuroraData[K]) => AuroraData[K],
  ): Promise<AuroraData[K]> {
    // Serialize read-modify-write per key: concurrent updates in THIS context
    // can no longer drop writes. (Cross-tab remains last-write-wins.)
    const prev = chains.get(key) ?? Promise.resolve()
    const next = prev.then(async () => {
      const value = fn(await get(key))
      await set(key, value)
      return value
    })
    chains.set(key, next.catch(() => undefined))
    return next
  }

  return {
    async init() { /* unchanged body from current implementation */ },
    get,
    set,
    update,
    subscribe(key, cb) { /* unchanged body */ },
  }
}
```

Keep `init`/`subscribe` bodies exactly as they are today (move them into the new shape; `subscribe`'s existing comment stays).

- [ ] **Step 5: Run tests** — `npm test`, all green (including the two new ones).

- [ ] **Step 6: Fix the Background gradient-test fixture** — in `src/newtab/components/Background.test.tsx`, the gradient-mode case must use a STALE `lastRotated` (e.g. `'2020-01-01'`) so `rotated` would be true without the mode gate — that makes the "never calls onPrefsChange in gradient mode" assertion actually exercise the gate.

- [ ] **Step 7: Verify + commit** — `npm test`, `npm run build`.

```bash
git add -A
git commit -m "feat: serialize storage updates, add weatherCache key, harden gradient test

<footer>"
```

---

### Task 13: Weather service (TDD, no UI)

**Files:**
- Create: `src/services/weather/types.ts`, `src/services/weather/codes.ts`, `src/services/weather/openMeteo.ts`, `src/services/weather/geocode.ts`, `src/services/weather/callout.ts`, `src/services/weather/units.ts`
- Test: `src/services/weather/callout.test.ts`, `src/services/weather/codes.test.ts`, `src/services/weather/units.test.ts`, `src/services/weather/openMeteo.test.ts` (mocked fetch)

**Interfaces:**
- Consumes: `WeatherSnapshot`, `CurrentWeather`, `HourlyPoint` from `src/lib/storage/schema.ts` (Task 12).
- Produces:
  - `types.ts`: `interface WeatherProvider { fetchSnapshot(lat: number, lon: number, label: string): Promise<WeatherSnapshot> }`; `interface GeoMatch { name: string; country: string; lat: number; lon: number }`
  - `codes.ts`: `describeCode(code: number): { label: string; icon: string }`
  - `openMeteo.ts`: `openMeteoProvider(fetchFn?: typeof fetch): WeatherProvider`
  - `geocode.ts`: `searchCity(query: string, fetchFn?: typeof fetch): Promise<GeoMatch[]>`
  - `callout.ts`: `rainCallout(hourly: HourlyPoint[], use24Hour: boolean): string | null`
  - `units.ts`: `displayTemp(tempC: number, units: 'metric' | 'imperial'): string` (e.g. `"21°"` / `"70°"`, rounded)

- [ ] **Step 1: Write `types.ts`** (verbatim from Interfaces above, with the two imports from `../../lib/storage/schema`).

- [ ] **Step 2: Failing tests for pure logic** — write these three test files, run `npm test`, confirm module-not-found failures:

```ts
// src/services/weather/units.test.ts
import { describe, expect, it } from 'vitest'
import { displayTemp } from './units'

describe('displayTemp', () => {
  it('rounds and formats metric', () => {
    expect(displayTemp(21.4, 'metric')).toBe('21°')
  })
  it('converts to fahrenheit', () => {
    expect(displayTemp(21.4, 'imperial')).toBe('71°') // 70.52 rounds to 71
    expect(displayTemp(0, 'imperial')).toBe('32°')
  })
})
```

```ts
// src/services/weather/codes.test.ts
import { describe, expect, it } from 'vitest'
import { describeCode } from './codes'

describe('describeCode', () => {
  it('maps representative WMO codes', () => {
    expect(describeCode(0).label).toBe('Clear')
    expect(describeCode(2).label).toBe('Partly cloudy')
    expect(describeCode(45).label).toBe('Fog')
    expect(describeCode(63).label).toBe('Rain')
    expect(describeCode(75).label).toBe('Snow')
    expect(describeCode(95).label).toBe('Thunderstorm')
  })
  it('falls back for unknown codes', () => {
    expect(describeCode(42).label).toBe('Cloudy')
  })
  it('every description has an icon', () => {
    for (const code of [0, 1, 2, 3, 45, 51, 61, 71, 80, 85, 95]) {
      expect(describeCode(code).icon.length).toBeGreaterThan(0)
    }
  })
})
```

```ts
// src/services/weather/callout.test.ts
import { describe, expect, it } from 'vitest'
import { rainCallout } from './callout'

const hour = (h: number, precipProb: number) => ({
  time: `2026-07-26T${String(h).padStart(2, '0')}:00`,
  tempC: 20,
  precipProb,
  code: 61,
})

describe('rainCallout', () => {
  it('announces the first hour with >=50% probability', () => {
    expect(rainCallout([hour(13, 10), hour(14, 20), hour(15, 60)], false)).toBe(
      'Rain likely around 3 PM.',
    )
  })
  it('softens the message between 30 and 49%', () => {
    expect(rainCallout([hour(13, 10), hour(15, 35)], false)).toBe(
      'Possible rain around 3 PM.',
    )
  })
  it('respects 24-hour format', () => {
    expect(rainCallout([hour(15, 80)], true)).toBe('Rain likely around 15:00.')
  })
  it('stays quiet on a dry forecast', () => {
    expect(rainCallout([hour(13, 0), hour(14, 20)], false)).toBeNull()
  })
  it('handles an empty forecast', () => {
    expect(rainCallout([], false)).toBeNull()
  })
})
```

- [ ] **Step 3: Implement the three pure modules**

```ts
// src/services/weather/units.ts
export function displayTemp(tempC: number, units: 'metric' | 'imperial'): string {
  const value = units === 'imperial' ? tempC * 1.8 + 32 : tempC
  return `${Math.round(value)}°`
}
```

```ts
// src/services/weather/codes.ts
const TABLE: [codes: number[], label: string, icon: string][] = [
  [[0], 'Clear', '☀️'],
  [[1], 'Mostly clear', '🌤️'],
  [[2], 'Partly cloudy', '⛅'],
  [[3], 'Overcast', '☁️'],
  [[45, 48], 'Fog', '🌫️'],
  [[51, 53, 55, 56, 57], 'Drizzle', '🌦️'],
  [[61, 63, 65, 66, 67], 'Rain', '🌧️'],
  [[71, 73, 75, 77], 'Snow', '🌨️'],
  [[80, 81, 82], 'Showers', '🌧️'],
  [[85, 86], 'Snow showers', '🌨️'],
  [[95, 96, 99], 'Thunderstorm', '⛈️'],
]

export function describeCode(code: number): { label: string; icon: string } {
  for (const [codes, label, icon] of TABLE) {
    if (codes.includes(code)) return { label, icon }
  }
  return { label: 'Cloudy', icon: '☁️' }
}
```

```ts
// src/services/weather/callout.ts
import type { HourlyPoint } from '../../lib/storage/schema'

function formatHour(iso: string, use24Hour: boolean): string {
  const hour = Number(iso.slice(11, 13))
  if (use24Hour) return `${String(hour).padStart(2, '0')}:00`
  const h12 = hour % 12 || 12
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`
}

export function rainCallout(hourly: HourlyPoint[], use24Hour: boolean): string | null {
  const likely = hourly.find((h) => h.precipProb >= 50)
  if (likely) return `Rain likely around ${formatHour(likely.time, use24Hour)}.`
  const possible = hourly.find((h) => h.precipProb >= 30)
  if (possible) return `Possible rain around ${formatHour(possible.time, use24Hour)}.`
  return null
}
```

- [ ] **Step 4: Run tests** — the three suites pass.

- [ ] **Step 5: Failing test for the provider (mocked fetch)**

```ts
// src/services/weather/openMeteo.test.ts
import { describe, expect, it, vi } from 'vitest'
import { openMeteoProvider } from './openMeteo'

const payload = {
  current: {
    temperature_2m: 21.4,
    apparent_temperature: 22.1,
    weather_code: 2,
    wind_speed_10m: 14.2,
    relative_humidity_2m: 60,
  },
  hourly: {
    time: ['2026-07-26T13:00', '2026-07-26T14:00'],
    temperature_2m: [21.0, 22.5],
    precipitation_probability: [10, 55],
    weather_code: [2, 61],
  },
}

describe('openMeteoProvider', () => {
  it('maps the Open-Meteo response to a WeatherSnapshot', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    })
    const snap = await openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(
      52.52,
      13.4,
      'Berlin',
    )
    expect(fetchFn.mock.calls[0][0]).toContain('latitude=52.52')
    expect(snap.current).toEqual({
      tempC: 21.4,
      feelsLikeC: 22.1,
      code: 2,
      windKmh: 14.2,
      humidity: 60,
    })
    expect(snap.hourly).toEqual([
      { time: '2026-07-26T13:00', tempC: 21, precipProb: 10, code: 2 },
      { time: '2026-07-26T14:00', tempC: 22.5, precipProb: 55, code: 61 },
    ])
    expect(snap.locationLabel).toBe('Berlin')
    expect(snap.fetchedAt).toBeTypeOf('number')
  })

  it('throws a descriptive error on HTTP failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    await expect(
      openMeteoProvider(fetchFn as unknown as typeof fetch).fetchSnapshot(0, 0, 'x'),
    ).rejects.toThrow(/429/)
  })
})
```

- [ ] **Step 6: Implement provider + geocoder**

```ts
// src/services/weather/openMeteo.ts
import type { WeatherSnapshot } from '../../lib/storage/schema'
import type { WeatherProvider } from './types'

const BASE = 'https://api.open-meteo.com/v1/forecast'
const PARAMS =
  'current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m' +
  '&hourly=temperature_2m,precipitation_probability,weather_code' +
  '&forecast_hours=12&timezone=auto'

export function openMeteoProvider(fetchFn: typeof fetch = fetch): WeatherProvider {
  return {
    async fetchSnapshot(lat, lon, label): Promise<WeatherSnapshot> {
      const url = `${BASE}?latitude=${lat}&longitude=${lon}&${PARAMS}`
      const res = await fetchFn(url)
      if (!res.ok) throw new Error(`Open-Meteo request failed: HTTP ${res.status}`)
      const data = await res.json()
      return {
        current: {
          tempC: data.current.temperature_2m,
          feelsLikeC: data.current.apparent_temperature,
          code: data.current.weather_code,
          windKmh: data.current.wind_speed_10m,
          humidity: data.current.relative_humidity_2m,
        },
        hourly: data.hourly.time.map((time: string, i: number) => ({
          time,
          tempC: data.hourly.temperature_2m[i],
          precipProb: data.hourly.precipitation_probability[i] ?? 0,
          code: data.hourly.weather_code[i],
        })),
        fetchedAt: Date.now(),
        locationLabel: label,
      }
    },
  }
}
```

```ts
// src/services/weather/geocode.ts
import type { GeoMatch } from './types'

export async function searchCity(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeoMatch[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query.trim(),
  )}&count=5&language=en&format=json`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Geocoding failed: HTTP ${res.status}`)
  const data = await res.json()
  return (data.results ?? []).map(
    (r: { name: string; country?: string; latitude: number; longitude: number }) => ({
      name: r.name,
      country: r.country ?? '',
      lat: r.latitude,
      lon: r.longitude,
    }),
  )
}
```

- [ ] **Step 7: Run all tests + build** — `npm test`, `npm run build`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Open-Meteo weather service with callout, codes, units (TDD)

<footer>"
```

---

### Task 14: Weather widget UI (M4 complete)

**Files:**
- Create: `src/newtab/widgets/weather/WeatherWidget.tsx`, `src/newtab/widgets/weather/useWeather.ts`, `src/newtab/widgets/weather/LocationSetup.tsx`
- Modify: `src/manifest.ts` (add `'geolocation'` permission), `src/newtab/App.tsx` (mount top-right), `scripts/preview.mjs` (seed a location + screenshot weather)

**Interfaces:**
- Consumes: everything from Task 13; `useStoredKey`, `useStorage`; `StoredLocation`, `WeatherSnapshot` from schema; `displayTemp`, `describeCode`, `rainCallout`.
- Produces: `<WeatherWidget />` self-gating on `settings.widgets.weather`. `useWeather(): { snapshot, stale, loading, error, refresh }` hook encapsulating cache + SWR.

- [ ] **Step 1: Add `'geolocation'` to `permissions` in `src/manifest.ts`.**

- [ ] **Step 2: Write `useWeather.ts`** — stale-while-revalidate over `weatherCache`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import { openMeteoProvider } from '../../../services/weather/openMeteo'

const MAX_AGE_MS = 30 * 60 * 1000 // refetch after 30 min

export function useWeather() {
  const storage = useStorage()
  const [location] = useStoredKey('location')
  const [snapshot] = useStoredKey('weatherCache')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!location || inFlight.current) return
    inFlight.current = true
    setLoading(true)
    setError(null)
    try {
      const snap = await openMeteoProvider().fetchSnapshot(
        location.lat,
        location.lon,
        location.label,
      )
      await storage.set('weatherCache', snap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Weather unavailable')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [location, storage])

  useEffect(() => {
    if (!location) return
    const fresh =
      snapshot &&
      snapshot.locationLabel === location.label &&
      Date.now() - snapshot.fetchedAt < MAX_AGE_MS
    if (!fresh) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on location change only
  }, [location?.label])

  const stale = !!snapshot && Date.now() - snapshot.fetchedAt >= MAX_AGE_MS
  return { snapshot: snapshot ?? null, stale, loading, error, refresh }
}
```

- [ ] **Step 3: Write `LocationSetup.tsx`** — the no-location empty state:

```tsx
import { useState } from 'react'
import { searchCity } from '../../../services/weather/geocode'
import type { GeoMatch } from '../../../services/weather/types'
import { useStorage } from '../../../lib/storage/context'

export default function LocationSetup() {
  const storage = useStorage()
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GeoMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function useDevice() {
    setBusy(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await storage.set('location', {
          lat: Math.round(pos.coords.latitude * 100) / 100, // ~1km precision is plenty
          lon: Math.round(pos.coords.longitude * 100) / 100,
          label: 'My location',
          manual: false,
        })
        setBusy(false)
      },
      () => {
        setBusy(false)
        setError('Location denied — search for your city instead.')
      },
      { timeout: 8000 },
    )
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    try {
      const found = await searchCity(query)
      setMatches(found)
      if (found.length === 0) setError('No matching city found.')
    } catch {
      setError('City search failed — are you offline?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-fg-muted">Weather needs a location.</p>
      <button
        type="button"
        onClick={useDevice}
        disabled={busy}
        className="self-start rounded-panel border border-panel-border px-2 py-1 text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        Use my location
      </button>
      <form onSubmit={search} className="flex gap-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="or search a city"
          aria-label="Search for a city"
          className="w-32 border-b border-panel-border bg-transparent text-fg outline-none focus-visible:border-accent"
        />
      </form>
      {matches && matches.length > 0 && (
        <ul className="flex flex-col gap-1">
          {matches.map((m) => (
            <li key={`${m.lat},${m.lon}`}>
              <button
                type="button"
                onClick={() =>
                  storage.set('location', {
                    lat: m.lat,
                    lon: m.lon,
                    label: m.name,
                    manual: true,
                  })
                }
                className="text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                {m.name}
                {m.country ? `, ${m.country}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-fg-muted">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Write `WeatherWidget.tsx`**

```tsx
import { useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { describeCode } from '../../../services/weather/codes'
import { rainCallout } from '../../../services/weather/callout'
import { displayTemp } from '../../../services/weather/units'
import LocationSetup from './LocationSetup'
import { useWeather } from './useWeather'

export default function WeatherWidget() {
  const [settings] = useStoredKey('settings')
  const [location] = useStoredKey('location')
  const { snapshot, stale, loading, error, refresh } = useWeather()
  const [expanded, setExpanded] = useState(false)

  if (!settings?.widgets.weather) return null

  return (
    <section
      aria-label="Weather"
      className="fixed right-4 top-4 max-w-64 rounded-panel border border-panel-border bg-panel p-3 text-fg backdrop-blur-[var(--panel-blur)]"
    >
      {location === null && <LocationSetup />}
      {location && !snapshot && (
        <p className="text-sm text-fg-muted">{error ?? (loading ? 'Loading weather…' : 'No data yet.')}</p>
      )}
      {location && snapshot && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden className="text-2xl">
              {describeCode(snapshot.current.code).icon}
            </span>
            <span className="text-2xl font-light">
              {displayTemp(snapshot.current.tempC, settings.units)}
            </span>
            <span className="text-sm text-fg-muted">
              {describeCode(snapshot.current.code).label} · {snapshot.locationLabel}
            </span>
          </button>
          {rainCallout(snapshot.hourly, settings.use24Hour) && (
            <p className="text-sm text-accent">
              {rainCallout(snapshot.hourly, settings.use24Hour)}
            </p>
          )}
          {expanded && (
            <ol className="mt-1 flex gap-2 overflow-x-auto pb-1" aria-label="Hourly forecast">
              {snapshot.hourly.map((h) => (
                <li key={h.time} className="flex min-w-10 flex-col items-center text-xs">
                  <span className="text-fg-muted">{h.time.slice(11, 13)}</span>
                  <span aria-hidden>{describeCode(h.code).icon}</span>
                  <span>{displayTemp(h.tempC, settings.units)}</span>
                  <span className="text-fg-muted">{h.precipProb}%</span>
                </li>
              ))}
            </ol>
          )}
          {(stale || error) && (
            <button
              type="button"
              onClick={() => void refresh()}
              className="self-start text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {error ? 'Offline — showing cached · retry' : 'Updated a while ago · refresh'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Mount in `App.tsx`** — inside `<main>`, after the centered column div, add a boundary-wrapped mount:

```tsx
      <WidgetBoundary name="weather">
        <WeatherWidget />
      </WidgetBoundary>
```

with `import WeatherWidget from './widgets/weather/WeatherWidget'`.

- [ ] **Step 6: Extend `scripts/preview.mjs`** — before the screenshots, seed a manual location so weather renders deterministically-ish (live Open-Meteo call; acceptable for preview):

```js
// After page.goto + waitForSelector('time'):
await page.evaluate(() =>
  chrome.storage.local.set({
    location: { lat: 40.71, lon: -74.01, label: 'New York', manual: true },
  }),
)
await page.reload()
await page.waitForSelector('time')
await page.waitForTimeout(2500) // weather fetch
```

Also add, after the drawer/theme captures: close the drawer (press Escape), click the weather summary button (`section[aria-label="Weather"] button`), and capture `weather-expanded.png`.

- [ ] **Step 7: Verify** — `npm test`, `npm run build`, `node scripts/preview.mjs` — no console errors; report completion. Controller reviews `newtab.png` + `weather-expanded.png`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: weather widget — current conditions, hourly strip, rain callout

<footer>"
```

---

### Task 15: Quick links widget (M5)

**Files:**
- Create: `src/newtab/widgets/links/linksLogic.ts`, `src/newtab/widgets/links/LinksWidget.tsx`, `src/newtab/widgets/links/LinkTile.tsx`
- Modify: `src/manifest.ts` (add `'favicon'` permission), `src/newtab/App.tsx` (mount below the center column)
- Test: `src/newtab/widgets/links/linksLogic.test.ts`

**Interfaces:**
- Consumes: `QuickLink` from schema; `useStoredKey`.
- Produces: `linksLogic.ts`: `addLink(links, title, url): QuickLink[]` (id via `crypto.randomUUID()`, url normalized — prepend `https://` when scheme missing), `removeLink(links, id)`, `moveLink(links, from, to)`, `faviconUrl(url: string): string` (chrome `_favicon` endpoint). `<LinksWidget />` gated on `settings.widgets.links`.

- [ ] **Step 1: Failing tests**

```ts
// src/newtab/widgets/links/linksLogic.test.ts
import { describe, expect, it } from 'vitest'
import { addLink, moveLink, removeLink } from './linksLogic'

const seed = [
  { id: 'a', title: 'A', url: 'https://a.example' },
  { id: 'b', title: 'B', url: 'https://b.example' },
  { id: 'c', title: 'C', url: 'https://c.example' },
]

describe('addLink', () => {
  it('appends with a generated id and normalized url', () => {
    const out = addLink([], 'Mail', 'gmail.com')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://gmail.com')
    expect(out[0].id).toBeTruthy()
  })
  it('keeps an explicit scheme', () => {
    expect(addLink([], 'X', 'http://x.test')[0].url).toBe('http://x.test')
  })
  it('trims the title and falls back to the hostname', () => {
    expect(addLink([], '   ', 'https://news.ycombinator.com')[0].title).toBe(
      'news.ycombinator.com',
    )
  })
})

describe('removeLink', () => {
  it('removes by id', () => {
    expect(removeLink(seed, 'b').map((l) => l.id)).toEqual(['a', 'c'])
  })
})

describe('moveLink', () => {
  it('reorders forward and backward', () => {
    expect(moveLink(seed, 0, 2).map((l) => l.id)).toEqual(['b', 'c', 'a'])
    expect(moveLink(seed, 2, 0).map((l) => l.id)).toEqual(['c', 'a', 'b'])
  })
  it('ignores out-of-range moves', () => {
    expect(moveLink(seed, 5, 0)).toEqual(seed)
  })
})
```

- [ ] **Step 2: Run to fail, then implement**

```ts
// src/newtab/widgets/links/linksLogic.ts
import type { QuickLink } from '../../../lib/storage/schema'

export function addLink(links: QuickLink[], title: string, url: string): QuickLink[] {
  const normalized = /^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
  const fallback = new URL(normalized).hostname
  return [
    ...links,
    { id: crypto.randomUUID(), title: title.trim() || fallback, url: normalized },
  ]
}

export function removeLink(links: QuickLink[], id: string): QuickLink[] {
  return links.filter((l) => l.id !== id)
}

export function moveLink(links: QuickLink[], from: number, to: number): QuickLink[] {
  if (from < 0 || from >= links.length || to < 0 || to >= links.length) return links
  const next = [...links]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Chrome-local favicon cache — no external favicon service (requires the
 *  'favicon' permission). */
export function faviconUrl(url: string): string {
  const base = chrome.runtime.getURL('/_favicon/')
  return `${base}?pageUrl=${encodeURIComponent(url)}&size=32`
}
```

Note: `faviconUrl` touches `chrome.runtime` so tests must not import it transitively in node env — it lives in the same module but is only CALLED from components; the pure functions above must not reference `chrome`. That is satisfied as written (the `chrome` global is only dereferenced when `faviconUrl` runs).

- [ ] **Step 3: `LinkTile.tsx`** — one tile: favicon img (with letter fallback on error), title, drag handles + keyboard move:

```tsx
import { useState } from 'react'
import type { QuickLink } from '../../../lib/storage/schema'
import { faviconUrl } from './linksLogic'

export default function LinkTile({
  link,
  index,
  count,
  onMove,
  onRemove,
  onDragStart,
  onDropOn,
}: {
  link: QuickLink
  index: number
  count: number
  onMove: (from: number, to: number) => void
  onRemove: (id: string) => void
  onDragStart: (index: number) => void
  onDropOn: (index: number) => void
}) {
  const [iconFailed, setIconFailed] = useState(false)
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDropOn(index)}
      className="group relative flex w-20 flex-col items-center gap-1"
    >
      <a
        href={link.url}
        onKeyDown={(e) => {
          // Keyboard reorder: Alt+Arrow moves the tile
          if (e.altKey && e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault()
            onMove(index, index - 1)
          } else if (e.altKey && e.key === 'ArrowRight' && index < count - 1) {
            e.preventDefault()
            onMove(index, index + 1)
          }
        }}
        className="flex size-12 items-center justify-center rounded-panel border border-panel-border bg-panel backdrop-blur-[var(--panel-blur)] transition group-hover:border-accent focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        {iconFailed ? (
          <span aria-hidden className="text-lg text-fg-muted">
            {link.title.charAt(0).toUpperCase()}
          </span>
        ) : (
          <img
            src={faviconUrl(link.url)}
            alt=""
            width={20}
            height={20}
            onError={() => setIconFailed(true)}
          />
        )}
      </a>
      <span className="max-w-full truncate text-xs text-fg-muted">{link.title}</span>
      <button
        type="button"
        aria-label={`Remove ${link.title}`}
        onClick={() => onRemove(link.id)}
        className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-panel text-xs text-fg-muted hover:text-fg focus-visible:flex focus-visible:outline-2 focus-visible:outline-accent group-hover:flex"
      >
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 4: `LinksWidget.tsx`** — row of tiles + inline add form:

```tsx
import { useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import { addLink, moveLink, removeLink } from './linksLogic'
import LinkTile from './LinkTile'

export default function LinksWidget() {
  const [settings] = useStoredKey('settings')
  const [links] = useStoredKey('links')
  const storage = useStorage()
  const [adding, setAdding] = useState(false)
  const dragFrom = useRef<number | null>(null)

  if (!settings?.widgets.links || links === undefined) return null

  const update = (fn: (l: typeof links) => typeof links) =>
    void storage.update('links', fn)

  return (
    <section aria-label="Quick links" className="mt-10 flex flex-wrap items-start justify-center gap-3">
      {links.map((link, i) => (
        <LinkTile
          key={link.id}
          link={link}
          index={i}
          count={links.length}
          onMove={(from, to) => update((l) => moveLink(l, from, to))}
          onRemove={(id) => update((l) => removeLink(l, id))}
          onDragStart={(i2) => (dragFrom.current = i2)}
          onDropOn={(to) => {
            if (dragFrom.current !== null) update((l) => moveLink(l, dragFrom.current!, to))
            dragFrom.current = null
          }}
        />
      ))}
      {adding ? (
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            const url = String(data.get('url') ?? '').trim()
            if (url) update((l) => addLink(l, String(data.get('title') ?? ''), url))
            setAdding(false)
          }}
        >
          <input name="title" placeholder="Title" aria-label="Link title" autoFocus className="w-28 border-b border-panel-border bg-transparent text-sm text-fg outline-none focus-visible:border-accent" />
          <input name="url" placeholder="example.com" aria-label="Link URL" className="w-28 border-b border-panel-border bg-transparent text-sm text-fg outline-none focus-visible:border-accent" />
          <div className="flex gap-2 text-xs">
            <button type="submit" className="text-accent focus-visible:outline-2 focus-visible:outline-accent">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="text-fg-muted focus-visible:outline-2 focus-visible:outline-accent">Cancel</button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          aria-label="Add quick link"
          onClick={() => setAdding(true)}
          className="flex size-12 items-center justify-center rounded-panel border border-dashed border-panel-border text-xl text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          +
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Manifest + mount** — add `'favicon'` to permissions in `src/manifest.ts`. In `App.tsx`, mount inside the centered column, after the focus boundary:

```tsx
        <WidgetBoundary name="links">
          <LinksWidget />
        </WidgetBoundary>
```

- [ ] **Step 6: Extend preview** — in `scripts/preview.mjs`, after the weather seed evaluate, also seed two links so tiles render:

```js
await page.evaluate(() =>
  chrome.storage.local.set({
    links: [
      { id: 'l1', title: 'GitHub', url: 'https://github.com' },
      { id: 'l2', title: 'HN', url: 'https://news.ycombinator.com' },
    ],
  }),
)
```

(one reload covers both seeds — keep the single existing reload after all seeding.)

- [ ] **Step 7: Verify** — `npm test`, `npm run build`, `node scripts/preview.mjs`; controller reviews `newtab.png` (tiles visible with favicons or letter fallbacks).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: quick links widget with drag/keyboard reorder and local favicons

<footer>"
```

---

### Task 16: To-do widget (M6)

**Files:**
- Create: `src/newtab/widgets/todo/todoReducer.ts`, `src/newtab/widgets/todo/TodoWidget.tsx`, `src/newtab/widgets/todo/TodoPanel.tsx`
- Modify: `src/newtab/App.tsx`
- Test: `src/newtab/widgets/todo/todoReducer.test.ts`

**Interfaces:**
- Consumes: `TodoList`, `TodoItem` from schema; `useStoredKey`, `useStorage` (serialized `update()` from Task 12).
- Produces: `todoReducer(lists: TodoList[], action: TodoAction): TodoList[]` with `TodoAction =`
  `{ type: 'addList'; name: string } | { type: 'renameList'; listId: string; name: string } | { type: 'removeList'; listId: string } | { type: 'addItem'; listId: string; text: string } | { type: 'toggleItem'; listId: string; itemId: string } | { type: 'removeItem'; listId: string; itemId: string } | { type: 'moveItem'; listId: string; from: number; to: number } | { type: 'clearDone'; listId: string }`.
  `<TodoWidget />` = bottom-right "Tasks" pill that lazy-loads `TodoPanel`.

- [ ] **Step 1: Failing reducer tests** — cover: addList (id generated, name trimmed, empty name → 'List'); addItem appends undone; toggleItem flips only its item; removeItem/removeList; renameList; moveItem reorders with out-of-range no-op; clearDone removes only done items; unknown listId → unchanged input (same reference). Write ~10 `it()` cases in `todoReducer.test.ts` following the linksLogic test style, run, confirm module-not-found.

- [ ] **Step 2: Implement `todoReducer.ts`**

```ts
import type { TodoItem, TodoList } from '../../../lib/storage/schema'

export type TodoAction =
  | { type: 'addList'; name: string }
  | { type: 'renameList'; listId: string; name: string }
  | { type: 'removeList'; listId: string }
  | { type: 'addItem'; listId: string; text: string }
  | { type: 'toggleItem'; listId: string; itemId: string }
  | { type: 'removeItem'; listId: string; itemId: string }
  | { type: 'moveItem'; listId: string; from: number; to: number }
  | { type: 'clearDone'; listId: string }

function mapList(
  lists: TodoList[],
  listId: string,
  fn: (list: TodoList) => TodoList,
): TodoList[] {
  let touched = false
  const next = lists.map((l) => {
    if (l.id !== listId) return l
    touched = true
    return fn(l)
  })
  return touched ? next : lists
}

export function todoReducer(lists: TodoList[], action: TodoAction): TodoList[] {
  switch (action.type) {
    case 'addList':
      return [
        ...lists,
        { id: crypto.randomUUID(), name: action.name.trim() || 'List', items: [] },
      ]
    case 'renameList':
      return mapList(lists, action.listId, (l) => ({
        ...l,
        name: action.name.trim() || l.name,
      }))
    case 'removeList':
      return lists.filter((l) => l.id !== action.listId)
    case 'addItem': {
      const text = action.text.trim()
      if (!text) return lists
      const item: TodoItem = { id: crypto.randomUUID(), text, done: false }
      return mapList(lists, action.listId, (l) => ({ ...l, items: [...l.items, item] }))
    }
    case 'toggleItem':
      return mapList(lists, action.listId, (l) => ({
        ...l,
        items: l.items.map((i) => (i.id === action.itemId ? { ...i, done: !i.done } : i)),
      }))
    case 'removeItem':
      return mapList(lists, action.listId, (l) => ({
        ...l,
        items: l.items.filter((i) => i.id !== action.itemId),
      }))
    case 'moveItem':
      return mapList(lists, action.listId, (l) => {
        const { from, to } = action
        if (from < 0 || from >= l.items.length || to < 0 || to >= l.items.length) return l
        const items = [...l.items]
        const [moved] = items.splice(from, 1)
        items.splice(to, 0, moved)
        return { ...l, items }
      })
    case 'clearDone':
      return mapList(lists, action.listId, (l) => ({
        ...l,
        items: l.items.filter((i) => !i.done),
      }))
  }
}
```

- [ ] **Step 3: Run tests green.**

- [ ] **Step 4: `TodoPanel.tsx`** — floating panel (fixed bottom-right above the pill): list tabs across the top (+ new list button), item list with checkbox/delete per item and Alt+Arrow up/down reorder on focused items, add-item input at the bottom, clear-done + delete-list actions in a footer row. All mutations go through ONE dispatch helper: `const dispatch = (a: TodoAction) => void storage.update('todoLists', (l) => todoReducer(l, a))`. Active list id is component state (default first list; create 'Today' automatically when empty on first open). Escape closes the panel. Full JSX left to the implementer — match the drawer's visual language and a11y patterns (labels, focus-visible, aria-pressed on tabs); this panel is the one place in this plan where layout detail is the implementer's call, reviewed by screenshot.

- [ ] **Step 5: `TodoWidget.tsx`** — gated pill + lazy panel:

```tsx
import { Suspense, lazy, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'

const TodoPanel = lazy(() => import('./TodoPanel'))

export default function TodoWidget() {
  const [settings] = useStoredKey('settings')
  const [open, setOpen] = useState(false)
  if (!settings?.widgets.todo) return null
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-16 rounded-panel border border-panel-border bg-panel px-3 py-2 text-sm text-fg backdrop-blur-[var(--panel-blur)] hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        Tasks
      </button>
      {open && (
        <Suspense fallback={null}>
          <TodoPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
```

- [ ] **Step 6: Mount** in `App.tsx` (sibling of the gear button, inside `<main>`):

```tsx
      <WidgetBoundary name="todo">
        <TodoWidget />
      </WidgetBoundary>
```

- [ ] **Step 7: Extend preview** — after existing captures: click the Tasks pill, wait for the panel, type a todo ("Ship Aurora") via the add-item input, press Enter, screenshot `todo-panel.png`.

- [ ] **Step 8: Verify** — `npm test`, `npm run build`, `node scripts/preview.mjs`; controller reviews `todo-panel.png`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: multi-list to-do widget with lazy panel and reducer (TDD)

<footer>"
```

---

### Task 17: Focus timer widget (M7)

**Files:**
- Create: `src/newtab/widgets/timer/timerReducer.ts`, `src/newtab/widgets/timer/chime.ts`, `src/newtab/widgets/timer/TimerWidget.tsx`
- Modify: `src/newtab/App.tsx`
- Test: `src/newtab/widgets/timer/timerReducer.test.ts`

**Interfaces:**
- Consumes: `TimerConfig` from schema; `settings.muted`.
- Produces:
  - `timerReducer.ts`: `interface TimerState { mode: 'work' | 'break'; running: boolean; endsAt: number | null; remainingMs: number; cycles: number; justFinished: 'work' | 'break' | null }`; `initialTimer(config: TimerConfig): TimerState`; `timerReducer(state, action, config): TimerState` with `action = { type: 'start' | 'pause' | 'reset' | 'tick'; now: number }`.
  - `chime.ts`: `playChime(): void` — WebAudio two-note soft bell, no asset.
  - `<TimerWidget />` top-left pill with remaining time; expands to controls.

- [ ] **Step 1: Failing reducer tests** — timestamps passed in explicitly (never `Date.now()` inside the reducer):

```ts
// src/newtab/widgets/timer/timerReducer.test.ts
import { describe, expect, it } from 'vitest'
import { initialTimer, timerReducer } from './timerReducer'

const config = { workMinutes: 25, breakMinutes: 5 }
const MIN = 60_000

describe('timerReducer', () => {
  it('starts a work session ending workMinutes later', () => {
    const s = timerReducer(initialTimer(config), { type: 'start', now: 1000 }, config)
    expect(s.running).toBe(true)
    expect(s.endsAt).toBe(1000 + 25 * MIN)
  })

  it('pause preserves remaining time and resume continues from it', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'pause', now: 10 * MIN }, config)
    expect(s.running).toBe(false)
    expect(s.remainingMs).toBe(15 * MIN)
    s = timerReducer(s, { type: 'start', now: 20 * MIN }, config)
    expect(s.endsAt).toBe(35 * MIN)
  })

  it('tick before the end changes nothing material', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'tick', now: 5 * MIN }, config)
    expect(s.mode).toBe('work')
    expect(s.justFinished).toBeNull()
  })

  it('work completion flips to a running break and flags justFinished', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'tick', now: 25 * MIN }, config)
    expect(s.mode).toBe('break')
    expect(s.running).toBe(true)
    expect(s.endsAt).toBe(25 * MIN + 5 * MIN)
    expect(s.justFinished).toBe('work')
    expect(s.cycles).toBe(1)
  })

  it('break completion returns to an idle work state', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'tick', now: 25 * MIN }, config)
    s = timerReducer(s, { type: 'tick', now: 30 * MIN }, config)
    expect(s.mode).toBe('work')
    expect(s.running).toBe(false)
    expect(s.remainingMs).toBe(25 * MIN)
    expect(s.justFinished).toBe('break')
  })

  it('reset returns to initial for the current config', () => {
    let s = timerReducer(initialTimer(config), { type: 'start', now: 0 }, config)
    s = timerReducer(s, { type: 'reset', now: 1 }, config)
    expect(s).toEqual(initialTimer(config))
  })
})
```

- [ ] **Step 2: Implement `timerReducer.ts`**

```ts
import type { TimerConfig } from '../../../lib/storage/schema'

export interface TimerState {
  mode: 'work' | 'break'
  running: boolean
  endsAt: number | null
  remainingMs: number
  cycles: number
  justFinished: 'work' | 'break' | null
}

export type TimerAction = { type: 'start' | 'pause' | 'reset' | 'tick'; now: number }

const MIN = 60_000

export function initialTimer(config: TimerConfig): TimerState {
  return {
    mode: 'work',
    running: false,
    endsAt: null,
    remainingMs: config.workMinutes * MIN,
    cycles: 0,
    justFinished: null,
  }
}

export function timerReducer(
  state: TimerState,
  action: TimerAction,
  config: TimerConfig,
): TimerState {
  switch (action.type) {
    case 'start':
      if (state.running) return state
      return {
        ...state,
        running: true,
        endsAt: action.now + state.remainingMs,
        justFinished: null,
      }
    case 'pause':
      if (!state.running || state.endsAt === null) return state
      return {
        ...state,
        running: false,
        endsAt: null,
        remainingMs: Math.max(0, state.endsAt - action.now),
      }
    case 'reset':
      return initialTimer(config)
    case 'tick': {
      if (!state.running || state.endsAt === null) return state
      if (action.now < state.endsAt) return state
      if (state.mode === 'work') {
        return {
          mode: 'break',
          running: true,
          endsAt: action.now + config.breakMinutes * MIN,
          remainingMs: config.breakMinutes * MIN,
          cycles: state.cycles + 1,
          justFinished: 'work',
        }
      }
      return { ...initialTimer(config), justFinished: 'break' }
    }
  }
}
```

- [ ] **Step 3: Tests green.**

- [ ] **Step 4: `chime.ts`**

```ts
/** Two-note soft bell via WebAudio — no bundled asset, respects nothing
 *  itself: callers must check settings.muted before invoking. */
export function playChime(): void {
  const ctx = new AudioContext()
  const play = (freq: number, at: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 1.2)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime + at)
    osc.stop(ctx.currentTime + at + 1.3)
  }
  play(880, 0)
  play(660, 0.35)
  setTimeout(() => void ctx.close(), 2000)
}
```

- [ ] **Step 5: `TimerWidget.tsx`** — top-left pill: `⏱ 25:00` (mm:ss remaining, derived `endsAt - now` while running via a 500ms `useNow`-style interval — reuse `useNow(500)`); click toggles an inline panel with Start/Pause/Reset buttons, work/break minute number inputs (write through to `timerConfig` via `storage.set`; a config change while idle resets remaining). On `justFinished` transition: if `!settings.muted` call `playChime()`; also flash the pill via a brief `text-accent` class. Timer state is per-tab (ephemeral `useReducer`); config persists. `aria-live="polite"` announcement on phase change ("Break time." / "Back to work."). Gate on `settings.widgets.timer`. Structure and classes follow the established pill/panel pattern (TodoWidget); implementer's JSX, screenshot-reviewed.

- [ ] **Step 6: Mount** in `App.tsx` with `<WidgetBoundary name="timer">`. 

- [ ] **Step 7: Extend preview** — seed `settings` widgets.timer=true (evaluate merges: read current settings from chrome.storage, set widgets.timer true, write back — do this in the same evaluate as other seeds), and after captures click the timer pill and capture `timer-panel.png`.

- [ ] **Step 8: Verify** — `npm test`, `npm run build`, `node scripts/preview.mjs`; controller reviews `timer-panel.png`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: pomodoro focus timer with drift-proof reducer and soft chime (TDD)

<footer>"
```

---

### Task 18: Daily quote widget (M8)

**Files:**
- Create: `src/assets/quotes.json`, `src/newtab/widgets/quote/QuoteWidget.tsx`
- Modify: `src/lib/dates.ts` (add `dayHash`), `src/newtab/App.tsx`
- Test: `src/lib/dates.test.ts` (extend)

**Interfaces:**
- Consumes: `todayKey`; `settings.widgets.quote`.
- Produces: `dayHash(key: string): number` (same 31-multiplier rolling hash as photos rotation — stable, unsigned). `quotes.json`: `[{ "text": string, "author": string }, ...]` ≥ 60 entries. `<QuoteWidget />` bottom-center.

- [ ] **Step 1: Harvest quotes** — read `legacy/scripts/quote.js` (the archived Tide extension, repo root `legacy/` — it exists locally but is git-ignored; READ ONLY). Extract every `{ text, author }` across its categories into `src/assets/quotes.json`, dedupe, then extend with additional well-known public-domain/attributed motivational quotes to reach at least 60 total. Keep attributions accurate; when authorship is folk wisdom use "Proverb".

- [ ] **Step 2: Failing test for `dayHash`** — append to `src/lib/dates.test.ts`:

```ts
import { dayHash } from './dates'

describe('dayHash', () => {
  it('is deterministic and non-negative', () => {
    expect(dayHash('2026-07-26')).toBe(dayHash('2026-07-26'))
    expect(dayHash('2026-07-26')).toBeGreaterThanOrEqual(0)
  })
  it('differs across adjacent days', () => {
    expect(dayHash('2026-07-26')).not.toBe(dayHash('2026-07-27'))
  })
})
```

- [ ] **Step 3: Implement** — append to `src/lib/dates.ts`:

```ts
/** Stable per-day hash for deterministic daily rotation (quotes, photos). */
export function dayHash(key: string): number {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}
```

- [ ] **Step 4: `QuoteWidget.tsx`**

```tsx
import quotes from '../../../assets/quotes.json'
import { dayHash, todayKey } from '../../../lib/dates'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'

export default function QuoteWidget() {
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.quote || quotes.length === 0) return null
  const quote = quotes[dayHash(todayKey()) % quotes.length]
  return (
    <figure className="fixed inset-x-0 bottom-6 mx-auto max-w-xl px-16 text-center">
      <blockquote className="text-sm text-fg">&ldquo;{quote.text}&rdquo;</blockquote>
      <figcaption className="mt-1 text-xs text-fg-muted">— {quote.author}</figcaption>
    </figure>
  )
}
```

- [ ] **Step 5: Mount** with `<WidgetBoundary name="quote">` in `App.tsx`.

- [ ] **Step 6: Verify** — `npm test`, `npm run build`, `node scripts/preview.mjs`; quote visible bottom-center in `newtab.png` without colliding with the Tasks/gear buttons (the `px-16` inset is for that; flag if it still overlaps at 1600×900).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: daily quote widget from bundled local set

<footer>"
```

---

### Task 19: Command palette (M9)

**Files:**
- Create: `src/lib/fuzzy.ts`, `src/newtab/widgets/palette/commands.ts`, `src/newtab/widgets/palette/Palette.tsx`, `src/newtab/widgets/palette/PaletteHost.tsx`
- Modify: `src/newtab/App.tsx`
- Test: `src/lib/fuzzy.test.ts`, `src/newtab/widgets/palette/commands.test.ts`

**Interfaces:**
- Consumes: `searchUrl`/`ENGINES`, `todoReducer`, `QuickLink`, `THEMES`, `applyTheme`, storage.
- Produces:
  - `fuzzy.ts`: `fuzzyScore(needle: string, haystack: string): number | null` (null = no match; higher = better; case-insensitive subsequence with consecutive-run and word-start bonuses).
  - `commands.ts`: `interface Command { id: string; label: string; hint?: string; run(): void | Promise<void> }`; `buildCommands(ctx): Command[]`; `filterCommands(commands, query): Command[]` (fuzzy over label, falls back to a "Search the web for …" command when nothing matches and query non-empty; an `add todo:`-prefixed query yields an "Add to-do" command).
  - `<PaletteHost />`: global Ctrl/Cmd+K listener, lazy-loads `Palette` overlay.

- [ ] **Step 1: Failing fuzzy tests**

```ts
// src/lib/fuzzy.test.ts
import { describe, expect, it } from 'vitest'
import { fuzzyScore } from './fuzzy'

describe('fuzzyScore', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('gh', 'GitHub')).not.toBeNull()
    expect(fuzzyScore('xyz', 'GitHub')).toBeNull()
  })
  it('prefers consecutive and word-start matches', () => {
    const consecutive = fuzzyScore('git', 'GitHub')!
    const scattered = fuzzyScore('gtb', 'GitHub')!
    expect(consecutive).toBeGreaterThan(scattered)
    const wordStart = fuzzyScore('nt', 'New Tab')!
    const midWord = fuzzyScore('et', 'New Tab')!
    expect(wordStart).toBeGreaterThan(midWord)
  })
  it('empty needle matches with zero score', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
})
```

- [ ] **Step 2: Implement `fuzzy.ts`**

```ts
/** Case-insensitive subsequence match. Returns null when needle isn't a
 *  subsequence; otherwise a score where consecutive runs (+3) and word-start
 *  hits (+2) beat scattered matches (+1 each). */
export function fuzzyScore(needle: string, haystack: string): number | null {
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (n.length === 0) return 0
  let score = 0
  let hi = 0
  let prevHit = -2
  for (const ch of n) {
    const found = h.indexOf(ch, hi)
    if (found === -1) return null
    score += 1
    if (found === prevHit + 1) score += 3
    if (found === 0 || h[found - 1] === ' ') score += 2
    prevHit = found
    hi = found + 1
  }
  return score
}
```

- [ ] **Step 3: Failing command tests** — `commands.test.ts` with a fake ctx (vi.fn() runners): filtering by fuzzy label; empty query returns all commands ordered as built; unmatched non-empty query yields exactly one web-search fallback whose label contains the query; a query starting with `todo:` (or `add todo:`) yields an add-to-do command carrying the remainder as text. Then implement:

```ts
// src/newtab/widgets/palette/commands.ts
import { fuzzyScore } from '../../../lib/fuzzy'
import type { QuickLink, Settings, ThemeId } from '../../../lib/storage/schema'

export interface Command {
  id: string
  label: string
  hint?: string
  run(): void | Promise<void>
}

export interface CommandContext {
  links: QuickLink[]
  settings: Settings
  openUrl(url: string): void
  webSearch(query: string): void
  addTodo(text: string): Promise<void>
  setTheme(theme: ThemeId): Promise<void>
  openSettings(): void
}

export function buildCommands(ctx: CommandContext): Command[] {
  return [
    ...ctx.links.map((l) => ({
      id: `link:${l.id}`,
      label: l.title,
      hint: l.url,
      run: () => ctx.openUrl(l.url),
    })),
    ...(['aurora', 'glass', 'mono'] as const).map((t) => ({
      id: `theme:${t}`,
      label: `Theme: ${t.charAt(0).toUpperCase()}${t.slice(1)}`,
      run: () => void ctx.setTheme(t),
    })),
    { id: 'settings', label: 'Open settings', run: () => ctx.openSettings() },
  ]
}

export function filterCommands(
  commands: Command[],
  query: string,
  ctx: CommandContext,
): Command[] {
  const q = query.trim()
  const todoMatch = /^(?:add\s+)?todo:\s*(.+)$/i.exec(q)
  if (todoMatch) {
    const text = todoMatch[1]
    return [
      {
        id: 'todo:add',
        label: `Add to-do: “${text}”`,
        run: () => void ctx.addTodo(text),
      },
    ]
  }
  if (q === '') return commands
  const scored = commands
    .map((c) => ({ c, s: fuzzyScore(q, c.label) }))
    .filter((x): x is { c: Command; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c)
  return [
    ...scored,
    {
      id: 'web-search',
      label: `Search the web for “${q}”`,
      run: () => ctx.webSearch(q),
    },
  ]
}
```

- [ ] **Step 4: `Palette.tsx`** — centered overlay (`role="dialog" aria-modal`, combobox pattern: `role="combobox"` input + `role="listbox"`/`role="option"` results, `aria-activedescendant`); ArrowUp/Down move selection, Enter runs + closes, Escape closes; backdrop click closes; focus trapped (reuse `useFocusTrap`). ctx wiring: `openUrl` = `location.assign`; `webSearch` = `location.assign(searchUrl(settings.searchEngine, q))`; `addTodo` = `storage.update('todoLists', ...)` appending to the first list (auto-create 'Today' when none — same behavior as TodoPanel); `setTheme` = settings patch; `openSettings` = callback prop from App that opens the drawer. Implementer's JSX, matching drawer visuals; screenshot-reviewed.

- [ ] **Step 5: `PaletteHost.tsx`**

```tsx
import { Suspense, lazy, useEffect, useState } from 'react'

const Palette = lazy(() => import('./Palette'))

export default function PaletteHost({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault() // page-level Ctrl/Cmd+K is interceptable on the new tab
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <Palette onClose={() => setOpen(false)} onOpenSettings={onOpenSettings} />
    </Suspense>
  )
}
```

- [ ] **Step 6: Mount** in `App.tsx` (always mounted, not gated — it's keyboard-only): `<PaletteHost onOpenSettings={() => setSettingsOpen(true)} />` inside a `<WidgetBoundary name="palette">`.

- [ ] **Step 7: Extend preview** — after other captures: `page.keyboard.press('Control+k')`, wait for `[role="combobox"]`, type "git", screenshot `palette.png` (should show the seeded GitHub link ranked first).

- [ ] **Step 8: Verify** — `npm test`, `npm run build`, `node scripts/preview.mjs`; controller reviews `palette.png`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Ctrl+K command palette — fuzzy links, web search, quick todo (TDD)

<footer>"
```

---

### Task 20: M10 polish — icons, a11y, README, v1.0.0

**Files:**
- Create: `scripts/make-icons.mjs`, `public/icons/icon16.png`, `public/icons/icon48.png`, `public/icons/icon128.png`, `README.md`
- Modify: `src/manifest.ts` (icons + version 1.0.0), `src/settings/SettingsPanel.tsx` (radiogroup), `src/newtab/App.tsx` (tab order), `src/settings/Drawer.tsx` (if needed for tab order)

**Interfaces:** none new — this is the finishing pass.

- [ ] **Step 1: Icons** — write `scripts/make-icons.mjs`: Playwright page rendering an inline SVG (rounded square, aurora gradient `#0f172a → #312e81 → #7dd3fc` diagonal, a thin crescent arc suggesting a horizon glow), screenshot the element at 128/48/16 into `public/icons/`. Add to `src/manifest.ts`:

```ts
  icons: {
    16: 'public/icons/icon16.png',
    48: 'public/icons/icon48.png',
    128: 'public/icons/icon128.png',
  },
```

(crxjs resolves `public/` paths; verify in dist output that `icons` paths exist after build — adjust to `icons/icon16.png` etc. if crxjs copies them to dist root; whichever form makes `dist/manifest.json` point at real files wins.)

- [ ] **Step 2: Theme radiogroup APG fix** — in `SettingsPanel.tsx`: roving tabindex (`tabIndex={settings.theme === t.id ? 0 : -1}`), ArrowLeft/ArrowRight/Home/End move selection AND apply it (`onKeyDown` on the radiogroup container), retaining click behavior. Selected radio is the only tab stop.

- [ ] **Step 3: Tab order** — first Tab press must land on the search bar, then focus line, then quick links, then photo refresh, then Tasks, then gear. DOM order in `App.tsx` mostly handles this already since Background renders first; move the Background refresh button AFTER the center column in DOM (it's already a sibling of the aria-hidden layer — relocate its JSX so it follows the centered column; keep `fixed bottom-4 left-4` positioning).

- [ ] **Step 4: README.md** — features list, install/load steps (`npm i`, `npm run build`, chrome://extensions → Load unpacked → `dist/`), dev commands (`npm run dev`, `npm test`, `node scripts/preview.mjs`, `node scripts/fetch-photos.mjs`), weather note (Open-Meteo, no API key, location stays local), how to add a theme (CSS block + `THEMES` entry), how to add a widget (folder + toggle key + `WidgetBoundary` mount), privacy statement (all data in `chrome.storage.local`/IndexedDB; only outbound calls = Open-Meteo when weather enabled).

- [ ] **Step 5: Version** — `src/manifest.ts` + `package.json` → `1.0.0`.

- [ ] **Step 6: Full verify** — `npm test`, `npm run build`, `node scripts/preview.mjs`; controller does a final review of ALL screenshots (all three theme drawer shots + newtab + widget shots) and checks `dist/manifest.json` icon paths resolve.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: v1.0.0 polish — icons, radiogroup a11y, tab order, README

<footer>"
```

---

## Out of scope

World clocks + countdown, JSON export/import backup, quote favorites, bookmarks-bar toggle, Pomodoro stats, shortcut cheat-sheet, OpenWeather alternate provider — spec backlog, unchanged.
