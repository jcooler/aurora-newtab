// NL-P6 QA storage scenarios (plan: docs/superpowers/plans/2026-08-19-nl-p6-
// product-qa.md, Task 1): four storage shapes the product must be useful
// under, per the corrected A2-D060 standard's "existing-layout-shaped
// storage" demand. Each `seed(page)` runs against a page whose extension
// storage is already initialized (canvas selector present) and writes
// chrome.storage.local directly; the harness reloads after seeding.
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'

/** The saved v1 layouts document exercising EVERY placement kind and
 *  refinement at once: free (anchor+offset+tier+layer), docked with exact x,
 *  a stored docked tier (compact bookmarks marks), a legacy align-only
 *  docked member (compat read), a hidden widget, and custom appearance inks. */
async function seedNamedSaved(page) {
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    const day = new Date().toISOString().slice(0, 10)
    const location = { lat: 32.7767, lon: -96.797, label: 'Dallas', manual: true }
    const normalize = (v) => Number(v.toFixed(4))
    const params = new URLSearchParams()
    params.set('temperature_unit', 'celsius')
    params.set('wind_speed_unit', 'kmh')
    params.set('forecast_hours', '12')
    params.set('forecast_days', '1')
    params.set('timezone', 'auto')
    params.set('timeformat', 'iso8601')
    params.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day')
    params.set('hourly', 'temperature_2m,precipitation_probability,weather_code,is_day')
    params.set('daily', 'sunrise,sunset')
    params.set('latitude', String(normalize(location.lat)))
    params.set('longitude', String(normalize(location.lon)))
    await chrome.storage.local.set({
      // Sun, moon, and the weather dock line all gate on a stored location;
      // a fresh cache keeps the weather line factual with no network.
      location,
      weatherCache: {
        current: { tempC: 31.7, feelsLikeC: 35.6, code: 0, windKmh: 14, humidity: 55, isDay: true },
        hourly: Array.from({ length: 12 }, (_, index) => ({
          time: `${day}T${String((9 + index) % 24).padStart(2, '0')}:00`,
          tempC: 30 + index * 0.3,
          precipProb: 5,
          code: 0,
          isDay: index < 10,
        })),
        fetchedAt: Date.now(),
        locationLabel: location.label,
        requestIdentity: `open-meteo:v1:https://api.open-meteo.com/v1/forecast?${params.toString()}`,
        sunriseISO: `${day}T07:02`,
        sunsetISO: `${day}T20:22`,
      },
      settings: {
        ...settings,
        widgets: { ...settings.widgets, weather: true, monthCal: true, sun: true, moon: true, timer: true },
        panelColor: '#123a5e',
        widgetTextColor: '#e8f4ff',
        photoTextColor: null,
        photoClockColor: '#ffd9a0',
      },
      layouts: {
        version: 1,
        activeLayoutId: 'qa-main',
        layouts: [
          {
            id: 'qa-main',
            name: 'QA main',
            widgets: {
              clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -24, tier: 'full', layer: 0 },
              focus: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 8, tier: 'standard', layer: 1 },
              // offsetY +8, not -2: at short heights the month's top edge
              // (and its grip) otherwise sits under the fixed top strip,
              // where the docked sun member catches the pointer — a
              // scenario-authored collision recorded as a report Finding,
              // not a harness fight.
              monthCal: { kind: 'free', anchor: 'left', offsetX: 9, offsetY: 8, tier: 'standard', layer: 2 },
              quote: { kind: 'hidden' },
              weather: { kind: 'docked', dock: 'bottom', order: 0, x: 30 },
              timer: { kind: 'docked', dock: 'bottom', order: 1, x: 70, align: 'end' },
              sun: { kind: 'docked', dock: 'top', order: 0, x: 12 },
              bookmarks: { kind: 'docked', dock: 'top', order: 1, x: 55, tier: 'compact' },
            },
          },
          { id: 'qa-alt', name: 'QA alt', widgets: {} },
        ],
      },
    })
  })
}

export const SCENARIOS = [
  {
    id: 'fresh',
    note: 'Post-init defaults: no layouts document, no legacy layout content — the static default composition / derived My layout.',
    seed: async () => {},
  },
  {
    id: 'legacy-v1',
    note: 'A V1-shaped legacy `layout` key with user positions and NO layouts document: the migration-derivation path.',
    seed: async (page) => {
      await page.evaluate(async () => {
        await chrome.storage.local.set({
          layout: {
            clock: { x: 50, y: 22 },
            focus: { x: 50, y: 52 },
            quote: { x: 50, y: 84 },
            bookmarks: { x: 50, y: 4 },
          },
        })
      })
    },
  },
  {
    id: 'named-saved',
    note: 'A saved v1 layouts document: free/docked-x/docked-tier/legacy-align/hidden placements plus custom appearance inks.',
    seed: seedNamedSaved,
  },
  {
    id: 'connectors',
    note: 'named-saved plus the nine-connector fixture data: github docked with facts, gitlab/jira/vercel free on the right rail.',
    seed: async (page) => {
      await seedNamedSaved(page)
      await seedInformationFirstFixtures(page)
      await page.evaluate(async () => {
        const { layouts } = await chrome.storage.local.get('layouts')
        const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
        active.widgets.github = { kind: 'docked', dock: 'bottom', order: 2, x: 85 }
        active.widgets.gitlab = { kind: 'free', anchor: 'right', offsetX: -8, offsetY: -20, tier: 'standard', layer: 3 }
        active.widgets.jira = { kind: 'free', anchor: 'right', offsetX: -8, offsetY: 0, tier: 'standard', layer: 4 }
        active.widgets.vercel = { kind: 'free', anchor: 'right', offsetX: -8, offsetY: 20, tier: 'standard', layer: 5 }
        await chrome.storage.local.set({ layouts })
      })
    },
  },
]

// Appended by the NL-P6 judgment pass: the case NO other scenario covered —
// every connector enabled with PURELY DEFAULT placements. This is the real
// new-user shape ("I turned my connectors on"), and the only way to tell a
// PRODUCT defect (our designed default composition collides) from a user's
// own authored overlap (permitted; the spec warns but never re-flows).
SCENARIOS.push({
  id: 'connectors-default',
  note: 'All nine connectors enabled, NO layouts document and NO legacy layout: every widget renders at its designed default slot.',
  seed: async (page) => {
    await seedInformationFirstFixtures(page)
    await page.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings')
      // Every connector-adjacent widget ON, so the default work column and
      // personal column are both fully populated at once.
      await chrome.storage.local.set({
        settings: {
          ...settings,
          widgets: {
            ...settings.widgets,
            weather: true, monthCal: true, sun: true, moon: true,
            timer: true, todo: true, notes: true, habits: true,
            clocks: true, countdown: true, quote: true, links: true,
          },
        },
        // The fixtures module seeds a legacy layout; clear it so nothing is
        // derived from stored positions and every widget falls to its
        // DESIGNED default slot.
        layout: {},
        layouts: null,
      })
    })
  },
})

// Flow is storage-owned rather than widget-toggle-owned. Seed it from the
// same initialized store as every other scenario so the sweep proves the
// production App switch, not a preview-only route or component mount.
SCENARIOS.push({
  id: 'flow',
  note: 'A running persisted Flow session with today\'s focus and two unfinished tasks; the dashboard must be wholly absent.',
  seed: async (page) => {
    await page.evaluate(async () => {
      const parts = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date())
      const value = (type) => parts.find((part) => part.type === type)?.value
      const day = `${value('year')}-${value('month')}-${value('day')}`
      const remainingMs = 20 * 60_000
      await chrome.storage.local.set({
        focus: { text: 'Finish one meaningful thing', date: day, done: false },
        todoLists: [{
          id: 'flow-today',
          name: 'Today',
          items: [
            { id: 'flow-first', text: 'Review the quiet work surface', done: false },
            { id: 'flow-second', text: 'Record the cross-tab evidence', done: false },
          ],
        }],
        timerSession: {
          mode: 'work',
          running: true,
          endsAt: Date.now() + remainingMs,
          remainingMs,
          cycles: 1,
          flow: true,
        },
      })
    })
  },
})
