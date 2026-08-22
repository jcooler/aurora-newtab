import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'

import { inspectAtAGlanceRequest } from './at-a-glance-harness-contracts.mjs'
import { assertCleanTrackedStatus } from './build-contracts.mjs'
import { assertAllowedStorageChange, assertBuildProvenance } from './work-connector-harness-contracts.mjs'
import { CATALOG_BATCHES } from './widget-catalog-manifest.mjs'

const repoRoot = resolve(process.cwd())
const protectedRoot = resolve('D:/DEV/Chrome plugin')
const dist = resolve('dist')
const profileDir = resolve('.qa-at-a-glance-profile')
const requestedOut = process.argv.find((arg) => arg.startsWith('--out-dir='))?.slice('--out-dir='.length)
const outDir = resolve(requestedOut || '.qa-at-a-glance-evidence')
const expectedCommit = process.argv.find((arg) => arg.startsWith('--expected-commit='))?.slice('--expected-commit='.length)
const headed = process.argv.includes('--headed')
const evidenceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()

if (!expectedCommit) throw new Error('expected-commit is required')
if (expectedCommit !== evidenceCommit) throw new Error(`expected-commit mismatch: ${expectedCommit} != ${evidenceCommit}`)
assertCleanTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }))

function safeScratch(path, prefix) {
  const normalized = resolve(path)
  if (dirname(normalized) !== repoRoot || !basename(normalized).startsWith(prefix)) {
    throw new Error(`unsafe At-a-glance evidence path: ${normalized}`)
  }
  if (normalized === repoRoot || normalized.startsWith(`${protectedRoot}\\`)) {
    throw new Error(`protected path refused: ${normalized}`)
  }
  let stat = null
  try { stat = lstatSync(normalized) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  if (stat?.isSymbolicLink()) throw new Error(`linked evidence path refused: ${normalized}`)
  if (stat) rmSync(normalized, { recursive: true, force: true })
  mkdirSync(normalized)
}

safeScratch(outDir, '.qa-at-a-glance-')
safeScratch(profileDir, '.qa-at-a-glance-')
assertBuildProvenance(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'), expectedCommit)

const VIEWPORTS = [
  { width: 1600, height: 900, label: 'common' },
  { width: 1408, height: 445, label: 'exact-short' },
]
const TIERS = ['compact', 'standard', 'full', 'docked']
const ALL_WIDGET_IDS = [...new Set(Object.values(CATALOG_BATCHES).flatMap((batch) => batch.map((entry) => entry.id)))]
const today = new Date()
const localDayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')
const WIDGETS = [
  { id: 'onThisDay', title: 'On This Day', config: { enabled: true }, useful: ['On This Day', 'Aurora history witness'] },
  { id: 'publicHolidays', title: 'Public Holidays', config: { enabled: true, countryCode: 'US' }, useful: ['Public Holidays', 'QA Holiday'] },
  { id: 'auroraKp', title: 'Aurora & Kp', config: { enabled: true }, useful: ['Kp', 'peak'] },
]

// Declarations are a static audit surface for the harness contract test.
const SCENARIOS = [
  { id: 'onThisDay', kind: 'max-data', tier: 'full' },
  { id: 'onThisDay', kind: 'empty', tier: 'standard' },
  { id: 'onThisDay', kind: 'stale', tier: 'standard' },
  { id: 'publicHolidays', kind: 'year-boundary', tier: 'full' },
  { id: 'auroraKp', kind: 'error', tier: 'standard' },
  { id: 'weather', kind: 'active', tier: 'standard' },
  { id: 'weather', kind: 'unsupported', tier: 'standard' },
  { id: 'weather', kind: 'empty', tier: 'standard' },
  { id: 'weather', kind: 'stale', tier: 'standard' },
  { id: 'weather', kind: 'error', tier: 'standard' },
  { id: 'onThisDay', kind: 'dock-detail', tier: 'docked' },
  { id: 'weather', kind: 'dock-detail', tier: 'docked' },
  { id: 'weather', kind: 'active', tier: 'compact' },
  { id: 'weather', kind: 'active', tier: 'full' },
]
void SCENARIOS

const evidence = {
  commit: evidenceCommit,
  startedAt: new Date().toISOString(),
  captures: [],
  contactSheets: [],
  requestLog: [],
  storage: [],
  runtimeErrors: [],
  failedRequests: [],
  failures: [],
}
const fail = (message) => evidence.failures.push(message)
const modes = new Map([
  ['onThisDay', 'ready'],
  ['publicHolidays', 'ready'],
  ['auroraKp', 'ready'],
  ['weatherAlerts', 'active'],
])
let activeScenario = 'bootstrap'
let navigating = false

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: VIEWPORTS[0],
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})

await context.addInitScript(() => {
  const writes = []
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') writes.push(Object.keys(changes).sort())
  })
  globalThis.__auroraAtAGlanceHarness = { writes }
})

function requestContract(request) {
  return {
    method: request.method(),
    url: request.url(),
    accept: request.headers().accept ?? null,
  }
}

async function auditedRoute(route, handler) {
  const request = route.request()
  try {
    const contract = inspectAtAGlanceRequest(requestContract(request))
    evidence.requestLog.push({ scenario: activeScenario, ...contract, url: request.url() })
    await handler(contract)
  } catch (error) {
    fail(`${activeScenario}: ${error instanceof Error ? error.message : String(error)}`)
    await route.abort('failed')
  }
}

const eventRows = (prefix, count, offset = 0) => Array.from({ length: count }, (_, index) => ({
  year: 1800 + offset + index,
  text: `${prefix} ${index + 1}: Aurora history witness with a bounded readable description.`,
  pages: [{ content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/Aurora_${offset + index + 1}` } } }],
}))

await context.route('https://en.wikipedia.org/**', (route) => auditedRoute(route, async () => {
  if (modes.get('onThisDay') === 'error') return route.fulfill({ status: 503, body: '{}' })
  const empty = modes.get('onThisDay') === 'empty'
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      selected: empty ? [] : eventRows('Selected event', 6),
      events: empty ? [] : eventRows('Event', 8, 20),
      births: empty ? [] : eventRows('Birth', 4, 40),
      deaths: empty ? [] : eventRows('Death', 4, 60),
    }),
  })
}))

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function holidayRows(year, countryCode) {
  const rows = []
  for (let index = 0; index < 20; index += 1) {
    const candidate = year === today.getFullYear()
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + index + 1)
      : new Date(year, 0, index * 7 + 1)
    if (candidate.getFullYear() !== year) continue
    rows.push({
      date: dateKey(candidate),
      localName: `QA Holiday ${index + 1}`,
      name: `QA Holiday ${index + 1}`,
      countryCode,
      fixed: false,
      global: true,
      counties: null,
      launchYear: null,
      types: ['Public'],
    })
  }
  return rows
}

await context.route('https://date.nager.at/**', (route) => auditedRoute(route, async (contract) => {
  if (modes.get('publicHolidays') === 'error') return route.fulfill({ status: 503, body: '[]' })
  if (contract.operation === 'holiday-countries') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ countryCode: 'US', name: 'United States' }]) })
  }
  const body = modes.get('publicHolidays') === 'empty' ? [] : holidayRows(contract.year, contract.countryCode)
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}))

function kpRows() {
  const header = ['time_tag', 'Kp', 'observed', 'noaa_scale']
  const rows = [[new Date(Date.now() - 3 * 60 * 60_000).toISOString().slice(0, 16).replace('T', ' '), '3.67', 'observed', null]]
  for (let index = 1; index <= 24; index += 1) {
    const kp = index === 7 ? 6 : 2 + (index % 4)
    rows.push([
      new Date(Date.now() + index * 3 * 60 * 60_000).toISOString().slice(0, 16).replace('T', ' '),
      String(kp),
      'predicted',
      kp >= 6 ? 'G2' : kp >= 5 ? 'G1' : null,
    ])
  }
  return [header, ...rows]
}

await context.route('https://services.swpc.noaa.gov/**', (route) => auditedRoute(route, async () => {
  if (modes.get('auroraKp') === 'error') return route.fulfill({ status: 503, body: '[]' })
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kpRows()) })
}))

const alertFeature = {
  type: 'Feature',
  id: 'https://api.weather.gov/alerts/urn:oid:aurora-qa',
  properties: {
    event: 'Severe Thunderstorm Warning', severity: 'Severe', urgency: 'Immediate',
    headline: 'Severe thunderstorms are moving through New York', areaDesc: 'New York County',
    effective: new Date(Date.now() - 10 * 60_000).toISOString(), onset: new Date().toISOString(),
    expires: new Date(Date.now() + 60 * 60_000).toISOString(),
    description: 'Damaging winds and heavy rain are possible.', instruction: 'Move indoors and stay away from windows.',
  },
}

await context.route('https://api.weather.gov/**', (route) => auditedRoute(route, async () => {
  const mode = modes.get('weatherAlerts')
  if (mode === 'error') return route.fulfill({ status: 503, body: '{}' })
  if (mode === 'unsupported') return route.fulfill({ status: 404, body: '{}' })
  return route.fulfill({
    status: 200,
    contentType: 'application/geo+json',
    body: JSON.stringify({ type: 'FeatureCollection', features: mode === 'empty' ? [] : [alertFeature] }),
  })
}))

const page = context.pages()[0] ?? await context.newPage()
page.setDefaultTimeout(20_000)
page.on('console', (message) => {
  if (message.type() !== 'error') return
  const value = message.text()
  if (!/Failed to load resource: the server responded with a status of (?:404|503)/.test(value)) evidence.runtimeErrors.push(`console: ${value}`)
})
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  if (!navigating && request.url().startsWith('http')) evidence.failedRequests.push(`${activeScenario}: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`)
})
page.on('request', (request) => {
  const url = request.url()
  const allowed = url.startsWith('chrome-extension://') ||
    url.startsWith('https://en.wikipedia.org/') || url.startsWith('https://date.nager.at/') ||
    url.startsWith('https://services.swpc.noaa.gov/') || url.startsWith('https://api.weather.gov/')
  if (url.startsWith('http') && !allowed) fail(`${activeScenario}: unexpected external request ${request.method()} ${url}`)
})

async function reload() {
  navigating = true
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(100)
  } finally {
    navigating = false
  }
  await page.locator('[data-canvas-surface]').waitFor()
}

async function clearWriteLog() {
  await page.evaluate(() => globalThis.__auroraAtAGlanceHarness?.writes.splice(0))
}

async function currentWrites() {
  return page.evaluate(() => globalThis.__auroraAtAGlanceHarness?.writes.splice(0) ?? [])
}

function weatherSnapshot() {
  const fetchedAt = Date.now()
  const location = { lat: 40.71, lon: -74.01, label: 'New York', manual: true }
  const forecast = new URL('https://api.open-meteo.com/v1/forecast')
  forecast.searchParams.set('temperature_unit', 'celsius')
  forecast.searchParams.set('wind_speed_unit', 'kmh')
  forecast.searchParams.set('forecast_hours', '12')
  forecast.searchParams.set('forecast_days', '1')
  forecast.searchParams.set('timezone', 'auto')
  forecast.searchParams.set('timeformat', 'iso8601')
  forecast.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day')
  forecast.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code,is_day')
  forecast.searchParams.set('daily', 'sunrise,sunset')
  forecast.searchParams.set('latitude', String(location.lat))
  forecast.searchParams.set('longitude', String(location.lon))
  const environment = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  environment.searchParams.set('timezone', 'auto')
  environment.searchParams.set('current', 'us_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen')
  environment.searchParams.set('latitude', String(location.lat))
  environment.searchParams.set('longitude', String(location.lon))
  const day = dateKey(today)
  return {
    location,
    snapshot: {
      current: { tempC: 21, feelsLikeC: 20, code: 61, windKmh: 14, windDirection: 315, humidity: 62, isDay: true },
      hourly: Array.from({ length: 12 }, (_, index) => ({
        time: `${day}T${String((8 + index) % 24).padStart(2, '0')}:00`, tempC: 20 + index / 2,
        precipProb: index === 3 ? 70 : 20, code: index === 3 ? 61 : 2, isDay: index < 10,
      })),
      fetchedAt, locationLabel: 'New York', requestIdentity: `open-meteo:v1:${forecast.toString()}`,
      sunriseISO: `${day}T06:12`, sunsetISO: `${day}T19:58`,
      environment: {
        requestIdentity: `open-meteo-air:v1:${environment.toString()}`, fetchedAt, status: 'available',
        usAqi: 42, uvIndex: 5, pollen: { status: 'available', readings: [{ species: 'grass', grainsPerCubicMeter: 7 }] },
      },
    },
  }
}

function alertCache(status = 'supported', stale = false) {
  return {
    requestIdentity: 'nws-alerts:v1:https://api.weather.gov/alerts/active?point=40.71,-74.01',
    fetchedAt: Date.now() - (stale ? 10 * 60_000 : 0),
    status,
    alerts: status === 'supported' ? [{
      id: alertFeature.id, event: alertFeature.properties.event, severity: alertFeature.properties.severity,
      urgency: alertFeature.properties.urgency, headline: alertFeature.properties.headline,
      areaDescription: alertFeature.properties.areaDesc, effective: alertFeature.properties.effective,
      onset: alertFeature.properties.onset, expires: alertFeature.properties.expires,
      description: alertFeature.properties.description, instruction: alertFeature.properties.instruction,
    }] : [],
  }
}

async function seed({ id, tier, config = null, snapshotData, snapshotFresh = true, preserveSnapshot = false, weatherAlert = undefined }) {
  const weather = weatherSnapshot()
  await page.evaluate(async ({ id, tier, config, snapshotData, snapshotFresh, preserveSnapshot, allWidgetIds, runtimeScope, weather, weatherAlert }) => {
    const canonical = (value) => {
      if (value === null) return 'null'
      if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
      if (typeof value === 'number') return JSON.stringify(value)
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
      return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    }
    const scopeFor = async () => {
      const identity = runtimeScope === undefined
        ? `${id}\n${canonical(config)}`
        : `${id}\n${canonical(config)}\n${canonical(runtimeScope)}`
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
      const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      return `${id}:v1:${hex}`
    }
    const current = await chrome.storage.local.get(null)
    const widgets = Object.fromEntries(allWidgetIds.map((widgetId) => [widgetId, { kind: 'hidden' }]))
    widgets[id] = tier === 'docked'
      ? { kind: 'docked', dock: 'bottom', order: 0, x: 50, tier: 'compact' }
      : { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 0 }
    const connectorSnapshots = preserveSnapshot ? current.connectorSnapshots ?? {} : {}
    if (snapshotData !== undefined) {
      connectorSnapshots[id] = { scope: await scopeFor(), fetchedAt: Date.now() - (snapshotFresh ? 0 : 48 * 60 * 60_000), data: snapshotData }
    }
    await chrome.storage.local.set({
      settings: { ...current.settings, widgets: { ...Object.fromEntries(allWidgetIds.map((widgetId) => [widgetId, false])), [id]: true } },
      connectors: config ? { [id]: config } : {},
      connectorSnapshots,
      location: id === 'weather' ? weather.location : current.location,
      weatherCache: id === 'weather' ? weather.snapshot : current.weatherCache,
      weatherAlertCache: id === 'weather' ? weatherAlert : current.weatherAlertCache,
      layouts: { version: 1, activeLayoutId: 'glance-qa', layouts: [{ id: 'glance-qa', name: 'Glance QA', widgets }] },
    })
  }, {
    id, tier, config, snapshotData, snapshotFresh, preserveSnapshot, allWidgetIds: ALL_WIDGET_IDS,
    runtimeScope: id === 'onThisDay' || id === 'publicHolidays' ? localDayKey : undefined,
    weather, weatherAlert,
  })
  await clearWriteLog()
  await reload()
  await page.locator(`[data-block-id="${id}"]`).waitFor()
}

async function waitReady(id, tier) {
  if (tier === 'docked') return page.locator(`[data-block-id="${id}"] [data-dock-line]`).waitFor()
  if (id === 'weather') return page.locator(`[data-block-id="weather"] [data-weather-summary]`).waitFor()
  return page.locator(`[data-block-id="${id}"] [data-work-resource-state="ready"]`).waitFor()
}

async function capture({ id, kind, tier, viewport = VIEWPORTS[0], openDetail = tier === 'docked', openWeather = false, expected = [] }) {
  activeScenario = `${id}:${kind}:${tier}:${viewport.label}`
  await page.setViewportSize(viewport)
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, viewport)
  await waitReady(id, tier).catch(() => undefined)
  if (openDetail) {
    await page.locator(`[data-block-id="${id}"] [data-dock-line]`).click()
    await page.getByRole('dialog', { name: `${id === 'auroraKp' ? 'Aurora & Kp' : id === 'onThisDay' ? 'On This Day' : id === 'publicHolidays' ? 'Public Holidays' : 'Weather'} details` }).waitFor()
  } else if (openWeather) {
    await page.getByRole('button', { name: 'Weather details' }).click()
    await page.getByRole('dialog', { name: 'Weather details' }).waitFor()
  }
  await page.waitForTimeout(150)
  const truth = await page.evaluate((widgetId) => {
    const item = document.querySelector(`[data-block-id="${widgetId}"]`)
    const detail = document.querySelector('[role="dialog"]')
    const rect = item?.getBoundingClientRect()
    const text = `${item?.textContent ?? ''} ${detail?.textContent ?? ''}`.replace(/\s+/g, ' ').trim()
    const scroll = item?.querySelector('[data-work-widget-scroll]')
    return {
      text,
      rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      localScroll: scroll ? { clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight } : null,
    }
  }, id)
  const label = `${id}-${kind}-${tier}-${viewport.label}`
  if (!truth.rect || truth.rect.width < 4 || truth.rect.height < 4 || !truth.text) fail(`${label}: empty or degenerate widget`)
  if (truth.horizontalOverflow) fail(`${label}: page horizontal overflow`)
  if (truth.rect && (truth.rect.left < -1 || truth.rect.right > viewport.width + 1 || truth.rect.top < -1 || truth.rect.bottom > viewport.height + 1)) {
    fail(`${label}: widget leaves viewport ${JSON.stringify(truth.rect)}`)
  }
  const missing = expected.filter((term) => !truth.text.toLowerCase().includes(term.toLowerCase()))
  if (missing.length) fail(`${label}: missing useful content ${missing.join(' | ')}`)
  const path = join(outDir, `${label}.png`)
  await page.screenshot({ path, fullPage: true })
  evidence.captures.push({ label, path, id, kind, tier, viewport, text: truth.text, geometry: truth.rect, localScroll: truth.localScroll, usefulness: missing.length ? 'failed' : 'useful' })
  if (openDetail || openWeather) await page.keyboard.press('Escape')
}

async function assertRuntimeWrites(label, before, allowedKeys) {
  await page.waitForTimeout(250)
  const after = await page.evaluate(() => chrome.storage.local.get(null))
  const writes = await currentWrites()
  try {
    const changedKeys = assertAllowedStorageChange(before, after, allowedKeys)
    const allowed = new Set(allowedKeys)
    const forbiddenWrites = [...new Set(writes.flat())].filter((key) => !allowed.has(key))
    if (forbiddenWrites.length) throw new Error(`Unexpected storage writes: ${forbiddenWrites.join(', ')}`)
    if (writes.some((keys) => keys.includes('layout'))) throw new Error('legacy layout key was written')
    evidence.storage.push({ label, changedKeys, writes })
  } catch (error) {
    fail(`${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()

  for (const widget of WIDGETS) {
    let preserveSnapshot = false
    for (const tier of TIERS) {
      modes.set(widget.id, 'ready')
      activeScenario = `${widget.id}:tiers:${tier}:seed`
      await seed({ id: widget.id, tier, config: widget.config, preserveSnapshot })
      await waitReady(widget.id, tier)
      preserveSnapshot = true
      await capture({ id: widget.id, kind: tier === 'docked' ? 'dock-detail' : 'tiers', tier, expected: widget.useful })
    }
    for (const tier of ['standard', 'full']) {
      await seed({ id: widget.id, tier, config: widget.config, preserveSnapshot: true })
      await capture({ id: widget.id, kind: 'short-window', tier, viewport: VIEWPORTS[1], expected: widget.useful })
    }
  }

  const onThisEmpty = { dateKey: localDayKey.slice(5), events: [], births: [], deaths: [] }
  await seed({ id: 'onThisDay', tier: 'standard', config: WIDGETS[0].config, snapshotData: onThisEmpty })
  await capture({ id: 'onThisDay', kind: 'empty', tier: 'standard', expected: ['No event returned for today'] })

  const retained = {
    dateKey: localDayKey.slice(5),
    events: eventRows('Saved historical event', 12).map(({ year, text, pages }) => ({ year, text, url: pages[0].content_urls.desktop.page })),
    births: [], deaths: [],
  }
  modes.set('onThisDay', 'error')
  activeScenario = 'onThisDay:stale:standard:seed'
  await seed({ id: 'onThisDay', tier: 'standard', config: WIDGETS[0].config, snapshotData: retained, snapshotFresh: false })
  await page.locator('[data-work-resource-state="retained-error"]').waitFor()
  await capture({ id: 'onThisDay', kind: 'stale', tier: 'standard', expected: ['Saved', 'Saved historical event'] })
  modes.set('onThisDay', 'ready')

  await seed({ id: 'publicHolidays', tier: 'full', config: WIDGETS[1].config, preserveSnapshot: true })
  await capture({ id: 'publicHolidays', kind: 'year-boundary', tier: 'full', expected: ['QA Holiday', String(today.getFullYear() + 1)] })

  modes.set('auroraKp', 'error')
  activeScenario = 'auroraKp:error:standard:seed'
  await seed({ id: 'auroraKp', tier: 'standard', config: WIDGETS[2].config })
  await page.locator('[data-work-resource-state="hard-error"]').waitFor()
  await capture({ id: 'auroraKp', kind: 'error', tier: 'standard', expected: ['Aurora & Kp is unavailable'] })
  modes.set('auroraKp', 'ready')

  let preserveAlert = false
  for (const tier of TIERS) {
    modes.set('weatherAlerts', 'active')
    activeScenario = `weather:active:${tier}:seed`
    await seed({ id: 'weather', tier, weatherAlert: preserveAlert ? alertCache() : null })
    await page.locator('[data-block-id="weather"] [data-weather-alert-badge]').waitFor()
    preserveAlert = true
    await capture({ id: 'weather', kind: tier === 'docked' ? 'dock-detail' : 'active', tier, expected: ['Severe Thunderstorm Warning'], openDetail: tier === 'docked' })
  }
  await seed({ id: 'weather', tier: 'standard', weatherAlert: alertCache() })
  await capture({ id: 'weather', kind: 'short-window', tier: 'standard', viewport: VIEWPORTS[1], expected: ['Severe Thunderstorm Warning'] })

  for (const mode of ['empty', 'unsupported']) {
    modes.set('weatherAlerts', mode)
    activeScenario = `weather:${mode}:standard:seed`
    await seed({ id: 'weather', tier: 'standard', weatherAlert: null })
    const before = await page.evaluate(() => chrome.storage.local.get(null))
    await page.waitForFunction((status) => chrome.storage.local.get('weatherAlertCache').then(({ weatherAlertCache }) => weatherAlertCache?.status === status), mode === 'unsupported' ? 'unsupported' : 'supported')
    await capture({ id: 'weather', kind: mode, tier: 'standard', openWeather: true, expected: [mode === 'unsupported' ? 'Forecast & conditions' : 'No active NWS alerts'] })
    await assertRuntimeWrites(`weather:${mode}`, before, ['weatherAlertCache'])
  }

  modes.set('weatherAlerts', 'error')
  activeScenario = 'weather:error:standard:seed'
  await seed({ id: 'weather', tier: 'standard', weatherAlert: null })
  await page.getByRole('button', { name: 'Weather details' }).waitFor()
  await capture({ id: 'weather', kind: 'error', tier: 'standard', openWeather: true, expected: ['NWS alerts unavailable', 'Hourly forecast'] })

  activeScenario = 'weather:stale:standard:seed'
  await seed({ id: 'weather', tier: 'standard', weatherAlert: alertCache('supported', true) })
  await capture({ id: 'weather', kind: 'stale', tier: 'standard', openWeather: true, expected: ['Saved data', 'Severe Thunderstorm Warning'] })
} finally {
  navigating = true
  await context.close()
  navigating = false
}

if (evidence.runtimeErrors.length) fail(`runtime errors: ${evidence.runtimeErrors.join(' | ')}`)
if (evidence.failedRequests.length) fail(`failed requests: ${evidence.failedRequests.join(' | ')}`)
for (const required of ['on-this-day', 'public-holidays', 'aurora-kp', 'weather-alerts']) {
  if (!evidence.requestLog.some((entry) => entry.operation === required)) fail(`provider operation was not witnessed: ${required}`)
}

for (const id of ['onThisDay', 'publicHolidays', 'auroraKp', 'weather']) {
  const captures = evidence.captures.filter((capture) => capture.id === id)
  const thumbs = await Promise.all(captures.map(async (capture) => ({
    input: await sharp(capture.path).resize({ width: 360, height: 203, fit: 'contain', background: '#111827' }).png().toBuffer(),
  })))
  const columns = 4
  const rows = Math.ceil(thumbs.length / columns)
  const path = join(outDir, `${id}-contact-sheet.png`)
  await sharp({ create: { width: columns * 360, height: rows * 203, channels: 4, background: '#111827' } })
    .composite(thumbs.map((image, index) => ({ input: image.input, left: (index % columns) * 360, top: Math.floor(index / columns) * 203 })))
    .png().toFile(path)
  evidence.contactSheets.push({ id, path, captures: captures.length })
}

evidence.finishedAt = new Date().toISOString()
writeFileSync(join(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
writeFileSync(join(outDir, 'REPORT.md'), `# Aurora At-a-glance Chromium Evidence\n\n- Commit: \`${evidenceCommit}\`\n- Captures: ${evidence.captures.length}\n- Provider requests: ${evidence.requestLog.length}\n- Runtime errors: ${evidence.runtimeErrors.length}\n- Failed requests: ${evidence.failedRequests.length}\n- Failures: ${evidence.failures.length}\n`, 'utf8')
process.stdout.write(`At-a-glance QA: ${evidence.captures.length} captures, ${evidence.requestLog.length} requests, ${evidence.failures.length} failures\n`)
for (const failure of evidence.failures) process.stderr.write(`FAIL ${failure}\n`)
if (evidence.failures.length) process.exitCode = 1
