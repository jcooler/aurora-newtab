import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const OUTPUT_PREFIX = '.qa-weather-enrichment-'

export function resolveWeatherOutputDir(argv, cwd) {
  const raw = argv.find((arg) => arg.startsWith('--out-dir='))?.slice('--out-dir='.length)
  if (!raw) throw new Error('Weather --out-dir scratch output is required')
  const output = resolve(cwd, raw)
  const root = resolve(cwd)
  const name = basename(output)
  if (dirname(output) !== root || !/^\.qa-weather-enrichment-[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error('Weather --out-dir must be a .qa-weather-enrichment-* scratch output')
  }
  return output
}

export function prepareWeatherOutputDir(argv, cwd, { empty = false } = {}) {
  const output = resolveWeatherOutputDir(argv, cwd)
  let existing = null
  try {
    existing = lstatSync(output)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (existing?.isSymbolicLink()) {
    throw new Error('Weather scratch output cannot be a symbolic link or junction')
  }
  if (existing && !existing.isDirectory()) throw new Error('Weather scratch output must be a directory')
  if (empty && existing) rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  const prepared = lstatSync(output)
  if (prepared.isSymbolicLink() || !prepared.isDirectory()) {
    throw new Error('Weather scratch output must be a real directory, not a symbolic link or junction')
  }
  if (realpathSync(dirname(output)) !== realpathSync(resolve(cwd))) {
    throw new Error('Weather scratch output must remain a direct repository child')
  }
  return output
}

function prepareProfileDir(cwd) {
  const profile = resolve(cwd, '.qa-weather-enrichment-profile')
  if (dirname(profile) !== resolve(cwd) || !basename(profile).startsWith(OUTPUT_PREFIX)) {
    throw new Error(`unsafe Weather profile path: ${profile}`)
  }
  let existing = null
  try {
    existing = lstatSync(profile)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (existing?.isSymbolicLink()) throw new Error('Weather profile cannot be a symbolic link or junction')
  if (existing) rmSync(profile, { recursive: true, force: true })
  mkdirSync(profile)
  return profile
}

const LOCATION = { lat: 52.52, lon: 13.405, label: 'Berlin', manual: true }
const FORECAST_URL_TOKEN = 'api.open-meteo.com/v1/forecast'
const ENVIRONMENT_URL_TOKEN = 'air-quality-api.open-meteo.com/v1/air-quality'

const FORECAST_PAYLOAD = {
  current: {
    temperature_2m: 21.4,
    apparent_temperature: 22.1,
    weather_code: 2,
    wind_speed_10m: 14.2,
    wind_direction_10m: 315,
    relative_humidity_2m: 60,
    is_day: 1,
  },
  hourly: {
    time: Array.from({ length: 12 }, (_, index) => `2026-08-22T${String(9 + index).padStart(2, '0')}:00`),
    temperature_2m: Array.from({ length: 12 }, (_, index) => 20 + index * 0.5),
    precipitation_probability: Array.from({ length: 12 }, (_, index) => index === 3 ? 60 : 10),
    weather_code: Array.from({ length: 12 }, () => 2),
    is_day: Array.from({ length: 12 }, (_, index) => index < 10 ? 1 : 0),
  },
  daily: {
    sunrise: ['2026-08-22T06:02'],
    sunset: ['2026-08-22T20:14'],
  },
}

const ENVIRONMENT_PAYLOADS = {
  available: {
    current: {
      us_aqi: 54,
      uv_index: 3.2,
      alder_pollen: 0,
      birch_pollen: 1.5,
      grass_pollen: 4,
      mugwort_pollen: 0.2,
      olive_pollen: 0,
      ragweed_pollen: 0,
    },
  },
  'pollen-unavailable': {
    current: {
      us_aqi: 33,
      uv_index: 0,
      alder_pollen: null,
      birch_pollen: null,
      grass_pollen: null,
      mugwort_pollen: null,
      olive_pollen: null,
      ragweed_pollen: null,
    },
  },
}

const STATES = [
  { state: 'available' },
  { state: 'pollen-unavailable' },
  { state: 'environment-failure' },
]
void STATES

const CORNERS = [
  { anchor: 'top-left', offsetX: 12, offsetY: 18 },
  { anchor: 'top-right', offsetX: -12, offsetY: 18 },
  { anchor: 'bottom-left', offsetX: 12, offsetY: -18 },
  { anchor: 'bottom-right', offsetX: -12, offsetY: -18 },
]

const VIEWPORTS = [
  { width: 1408, height: 445 },
  { width: 1600, height: 900 },
]

function normalizedCoordinate(value) {
  return Number(value.toFixed(4))
}

function forecastRequestIdentity(lat, lon) {
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
  params.set('latitude', String(normalizedCoordinate(lat)))
  params.set('longitude', String(normalizedCoordinate(lon)))
  return `open-meteo:v1:https://api.open-meteo.com/v1/forecast?${params.toString()}`
}

function environmentRequestIdentity(lat, lon) {
  const params = new URLSearchParams()
  params.set('timezone', 'auto')
  params.set('current', 'us_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen')
  params.set('latitude', String(normalizedCoordinate(lat)))
  params.set('longitude', String(normalizedCoordinate(lon)))
  return `open-meteo-air:v1:https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`
}

function stableBoundary(value) {
  const permissions = [...(value.permissions ?? [])].sort()
  const origins = [...(value.origins ?? [])].sort()
  return { permissions, origins }
}

async function run() {
  const repoRoot = process.cwd()
  const dist = resolve('dist')
  const outDir = prepareWeatherOutputDir(process.argv.slice(2), repoRoot, { empty: true })
  const profileDir = prepareProfileDir(repoRoot)
  const headed = process.argv.includes('--headed')
  const manifestPath = resolve(dist, 'manifest.json')
  const productionManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const manifestSource = readFileSync(resolve('src/manifest.ts'), 'utf8')
  const previewManifest = {
    permissions: ['storage', 'favicon', 'bookmarks', 'geolocation', 'search'],
    optional_permissions: [],
    optional_host_permissions: ['https://*/*'],
  }
  if (!manifestSource.includes("? ['storage', 'favicon', 'bookmarks', 'geolocation', 'search']")) {
    throw new Error('preview manifest permission contract drifted')
  }
  if (productionManifest.permissions.join(',') !== 'storage,favicon,geolocation,search') {
    throw new Error(`production dist permission drift: ${productionManifest.permissions.join(',')}`)
  }
  if (productionManifest.optional_permissions.join(',') !== 'bookmarks') {
    throw new Error('production dist optional permission drift')
  }
  if (JSON.stringify(productionManifest.optional_host_permissions) !== JSON.stringify(['https://*/*'])) {
    throw new Error('production dist optional host permission drift')
  }

  const weatherSources = [
    'src/newtab/widgets/weather/WeatherWidget.tsx',
    'src/newtab/widgets/weather/useWeather.ts',
    'src/services/weather/openMeteo.ts',
  ]
  for (const file of weatherSources) {
    const source = readFileSync(resolve(file), 'utf8')
    if (/chrome\.permissions|permissionTransactions|ensureOrigins|originOwnership/.test(source)) {
      throw new Error(`${file} imports or invokes a permission transaction`)
    }
  }

  const evidence = {
    reviewedDistManifest: productionManifest,
    previewManifest,
    captures: [],
    failures: [],
    runtimeErrors: [],
    expectedRuntimeErrors: [],
    failedRequests: [],
    requestLog: [],
    writes: [],
    permissionBoundary: null,
    sourcePermissionAssertion: weatherSources,
  }
  const fail = (message) => evidence.failures.push(message)
  let environmentMode = 'environment-failure'
  let heldEnvironment = null
  let releaseHeldEnvironment = null

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless: !headed,
    viewport: VIEWPORTS[1],
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  await context.route(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/, async (route) => {
    evidence.requestLog.push({ kind: 'forecast', state: environmentMode, url: route.request().url() })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST_PAYLOAD) })
  })
  await context.route(/^https:\/\/air-quality-api\.open-meteo\.com\/v1\/air-quality\?/, async (route) => {
    evidence.requestLog.push({ kind: 'environment', state: environmentMode, url: route.request().url() })
    if (heldEnvironment) await heldEnvironment
    if (environmentMode === 'environment-failure') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ENVIRONMENT_PAYLOADS[environmentMode]),
    })
  })

  const pages = context.pages()
  const page = pages[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  await page.addInitScript(() => {
    window.__weatherWrites = []
    if (globalThis.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') window.__weatherWrites.push(Object.keys(changes).sort())
      })
    }
  })
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = `console: ${message.text()}`
    if (environmentMode === 'environment-failure' && text.includes('status of 503')) {
      evidence.expectedRuntimeErrors.push(text)
    } else {
      evidence.runtimeErrors.push(text)
    }
  })
  page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
  page.on('requestfailed', (request) => {
    if (!request.url().startsWith('chrome-extension://')) {
      evidence.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
    }
  })
  page.on('request', (request) => {
    const url = request.url()
    if (
      url.startsWith('http') &&
      !url.includes(FORECAST_URL_TOKEN) &&
      !url.includes(ENVIRONMENT_URL_TOKEN)
    ) fail(`unexpected request: ${request.method()} ${url}`)
  })

  const waitForSurface = async () => {
    await page.waitForSelector('[data-canvas-surface]')
    await page.waitForTimeout(150)
  }
  const permissionSnapshot = () => page.evaluate(async () => ({
    permissions: await chrome.permissions.getAll(),
    originOwners: await chrome.storage.local.get(['connectors', 'photoPrefs']),
    originLifecycle: await navigator.locks.query().then((state) => ({
      held: state.held.filter((lock) => lock.name === 'aurora:origin-permission-lifecycle:v1'),
      pending: state.pending.filter((lock) => lock.name === 'aurora:origin-permission-lifecycle:v1'),
    })),
  }))
  const setPlacement = async (placement) => {
    await page.evaluate(async (nextPlacement) => {
      const { layouts } = await chrome.storage.local.get('layouts')
      const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
      active.widgets.weather = nextPlacement
      await chrome.storage.local.set({ layouts })
    }, placement)
  }
  const seedBase = async (placement) => {
    await page.evaluate(async ({ location, weatherPlacement }) => {
      const { settings } = await chrome.storage.local.get('settings')
      const widgets = Object.fromEntries(Object.keys(settings.widgets).map((id) => [id, false]))
      widgets.weather = true
      await chrome.storage.local.set({
        settings: { ...settings, widgets },
        location,
        weatherCache: null,
        layout: { weather: { x: 17, y: 19 } },
        layouts: {
          version: 1,
          activeLayoutId: 'weather-qa',
          layouts: [{
            id: 'weather-qa',
            name: 'Weather QA',
            widgets: {
              clock: { kind: 'hidden' },
              greeting: { kind: 'hidden' },
              focus: { kind: 'hidden' },
              weather: weatherPlacement,
            },
          }],
        },
      })
    }, { location: LOCATION, weatherPlacement: placement })
  }
  const clearWeatherCache = () => page.evaluate(async () => {
    await chrome.storage.local.set({ weatherCache: null })
  })
  const waitForEnvironment = async (state, pollenStatus = null) => {
    await page.waitForFunction(async ({ expectedState, expectedPollen }) => {
      const cache = (await chrome.storage.local.get('weatherCache')).weatherCache
      return cache?.environment?.status === expectedState
        && (!expectedPollen || cache.environment.pollen?.status === expectedPollen)
    }, { expectedState: state, expectedPollen: pollenStatus })
  }
  const openDetails = async () => {
    const summary = page.locator('[data-weather-summary], [data-dock-line]').first()
    await summary.click()
    const dialog = page.getByRole('dialog', { name: 'Weather details' })
    await dialog.waitFor()
    return dialog
  }
  const closeDetails = async () => {
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Weather details' }).waitFor({ state: 'detached' })
  }
  const assertDialogState = async (label, state) => {
    const dialog = page.getByRole('dialog', { name: 'Weather details' })
    await page.getByText('Feels like', { exact: true }).waitFor()
    await page.getByRole('link', { name: 'Air quality and pollen: CAMS ENSEMBLE via Open-Meteo' }).waitFor()
    if (state === 'available') {
      if (await dialog.getByText('54 Moderate', { exact: true }).count() !== 1) fail(`${label}: AQI is not 54 Moderate`)
      if (await dialog.getByText('3 Moderate', { exact: true }).count() !== 1) fail(`${label}: UV is not 3 Moderate`)
      if (await dialog.getByText('Grass 4 grains/m³', { exact: true }).count() !== 1) fail(`${label}: dominant pollen is missing`)
    } else if (state === 'pollen-unavailable') {
      if (await dialog.getByText('Pollen unavailable here', { exact: true }).count() !== 1) fail(`${label}: pollen unavailable truth is missing`)
    } else {
      if (await dialog.getByText('Environmental data unavailable.', { exact: true }).count() !== 1) fail(`${label}: environmental failure truth is missing`)
      await dialog.getByRole('button', { name: 'Refresh' }).waitFor()
    }
  }
  const assertGeometry = async (label) => {
    const truth = await page.evaluate(() => {
      const doc = document.documentElement
      const weather = document.querySelector('[data-block-id="weather"]')
      const dialog = document.querySelector('[data-weather-details]')
      const weatherRect = weather?.getBoundingClientRect()
      const dialogRect = dialog?.getBoundingClientRect()
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        weatherBox: weatherRect ? { left: weatherRect.left, top: weatherRect.top, right: weatherRect.right, bottom: weatherRect.bottom, width: weatherRect.width, height: weatherRect.height } : null,
        dialogBox: dialogRect ? { left: dialogRect.left, top: dialogRect.top, right: dialogRect.right, bottom: dialogRect.bottom, width: dialogRect.width, height: dialogRect.height } : null,
        selected: document.querySelectorAll('.canvas-item--selected').length,
        editing: document.querySelectorAll('.canvas-item--editing').length,
        environment: Boolean(document.querySelector('[data-weather-environment]')),
        viewport: { width: doc.clientWidth, height: doc.clientHeight },
      }
    })
    if (truth.horizontalOverflow) fail(`${label}: horizontal page overflow`)
    if (!truth.environment) fail(`${label}: data-weather-environment missing`)
    for (const [name, box] of [['weather', truth.weatherBox], ['dialog', truth.dialogBox]]) {
      if (!box || !Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width < 4 || box.height < 4) {
        fail(`${label}: ${name} has a degenerate box`)
      }
    }
    const box = truth.dialogBox
    if (box && (box.left < -1 || box.top < -1 || box.right > truth.viewport.width + 1 || box.bottom > truth.viewport.height + 1)) {
      fail(`${label}: dialog is not clamped to the viewport`)
    }
    if (truth.selected || truth.editing) fail(`${label}: plain click painted edit selection chrome`)
  }
  const harvestWrites = async (label, allowed = ['weatherCache']) => {
    const batches = await page.evaluate(() => {
      const result = window.__weatherWrites ?? []
      window.__weatherWrites = []
      return result
    })
    const storageWrites = batches.flat()
    evidence.writes.push({ label, batches })
    if (storageWrites.includes('layout')) fail(`${label}: forbidden legacy layout write`)
    const unrelated = storageWrites.filter((key) => !allowed.includes(key))
    if (unrelated.length) fail(`${label}: unrelated storage writes ${[...new Set(unrelated)].join(',')}`)
  }
  const capture = async (name, state) => {
    await assertDialogState(name, state)
    await assertGeometry(name)
    const path = resolve(outDir, `${name}.png`)
    await page.screenshot({ path: path })
    evidence.captures.push({ name, state, viewport: page.viewportSize(), path: `${name}.png` })
  }

  let caughtError = null
  try {
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await waitForSurface()
    await page.evaluate(async () => { await chrome.storage.local.clear() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForSurface()
    await seedBase({ kind: 'free', anchor: 'top-right', offsetX: -12, offsetY: 18, tier: 'standard', layer: 0 })

    const boundaryBefore = await permissionSnapshot()
    environmentMode = 'environment-failure'
    await page.setViewportSize(VIEWPORTS[0])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForSurface()
    await waitForEnvironment('unavailable')
    await openDetails()
    await capture('environment-failure-1408x445', 'environment-failure')
    await harvestWrites('environment-failure')

    environmentMode = 'available'
    heldEnvironment = new Promise((resolve) => { releaseHeldEnvironment = resolve })
    await page.getByRole('button', { name: 'Refresh' }).click()
    await page.getByText('Loading environmental data…', { exact: true }).waitFor()
    if (await page.getByText('Feels like', { exact: true }).count() !== 1) fail('recovery: forecast disappeared while enrichment was pending')
    releaseHeldEnvironment()
    heldEnvironment = null
    await waitForEnvironment('available', 'available')
    await page.getByText('54 Moderate', { exact: true }).waitFor()
    await capture('environment-recovered-1408x445', 'available')
    const recoveredCache = await page.evaluate(async () => (await chrome.storage.local.get('weatherCache')).weatherCache)
    if (recoveredCache.requestIdentity !== forecastRequestIdentity(LOCATION.lat, LOCATION.lon)) {
      fail('recovery: persisted forecast identity drifted')
    }
    if (recoveredCache.environment?.requestIdentity !== environmentRequestIdentity(LOCATION.lat, LOCATION.lon)) {
      fail('recovery: persisted environmental identity drifted')
    }
    await harvestWrites('environment-recovery')
    await closeDetails()

    const boundaryAfter = await permissionSnapshot()
    evidence.permissionBoundary = { before: boundaryBefore, after: boundaryAfter }
    if (JSON.stringify(stableBoundary(boundaryBefore.permissions)) !== JSON.stringify(stableBoundary(boundaryAfter.permissions))) {
      fail('recovery: chrome permission set changed')
    }
    if (JSON.stringify(boundaryBefore.originOwners) !== JSON.stringify(boundaryAfter.originOwners)) {
      fail('recovery: origin-owner storage changed')
    }
    if (boundaryAfter.originLifecycle.held.length || boundaryAfter.originLifecycle.pending.length) {
      fail('recovery: origin lifecycle lock remained active')
    }

    await page.setViewportSize(VIEWPORTS[1])
    for (const corner of CORNERS) {
      await setPlacement({ kind: 'free', ...corner, tier: 'standard', layer: 0 })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForSurface()
      await openDetails()
      await capture(`available-${corner.anchor}-1600x900`, 'available')
      await harvestWrites(`corner-${corner.anchor}`)
      await closeDetails()
    }

    environmentMode = 'pollen-unavailable'
    await clearWeatherCache()
    await waitForEnvironment('available', 'unavailable')
    await openDetails()
    await capture('pollen-unavailable-1600x900', 'pollen-unavailable')
    await harvestWrites('pollen-unavailable')
    await closeDetails()

    environmentMode = 'available'
    await page.evaluate(async (cache) => {
      await chrome.storage.local.set({ weatherCache: cache })
    }, recoveredCache)
    await setPlacement({ kind: 'docked', dock: 'bottom', order: 0, x: 22, tier: 'compact' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForSurface()
    await waitForEnvironment('available', 'available')
    const bottomBar = page.getByRole('navigation', { name: 'Bottom bar' })
    await bottomBar.locator('[data-block-id="weather"] [data-dock-line]').click()
    await page.getByRole('dialog', { name: 'Weather details' }).waitFor()
    await capture('available-docked-1600x900', 'available')
    await harvestWrites('docked')
    await closeDetails()

    const requestCountBeforeReload = evidence.requestLog.length
    const persistedIdentity = (await page.evaluate(async () => (await chrome.storage.local.get('weatherCache')).weatherCache.environment.requestIdentity))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForSurface()
    await bottomBar.locator('[data-block-id="weather"] [data-dock-line]').click()
    await page.getByRole('dialog', { name: 'Weather details' }).waitFor()
    await capture('available-docked-reload-1600x900', 'available')
    if (evidence.requestLog.length !== requestCountBeforeReload) fail('reload: fresh weather cache requested again')
    const reloadedIdentity = await page.evaluate(async () => (await chrome.storage.local.get('weatherCache')).weatherCache.environment.requestIdentity)
    if (reloadedIdentity !== persistedIdentity) fail('reload: environmental identity changed')
    await harvestWrites('reload')

    const forecastRequests = evidence.requestLog.filter((entry) => entry.kind === 'forecast')
    const environmentRequests = evidence.requestLog.filter((entry) => entry.kind === 'environment')
    if (forecastRequests.length !== 3 || environmentRequests.length !== 3) {
      fail(`request accounting: forecast=${forecastRequests.length}, environment=${environmentRequests.length}`)
    }
    for (const entry of evidence.requestLog) {
      const url = new URL(entry.url)
      if (url.searchParams.get('latitude') !== '52.52' || url.searchParams.get('longitude') !== '13.405') {
        fail(`request coordinates drifted: ${entry.url}`)
      }
    }
  } catch (error) {
    caughtError = error
  } finally {
    try { await context.close() } catch { /* ignore */ }
  }

  const report = [
    '# Weather Enrichment Browser Evidence',
    '',
    `Production manifest permissions: ${productionManifest.permissions.join(', ')}`,
    `Preview manifest permissions: ${previewManifest.permissions.join(', ')}`,
    '',
    '| Capture | State | Viewport |',
    '| --- | --- | --- |',
    ...evidence.captures.map((captureEntry) => `| ![${captureEntry.name}](${captureEntry.path}) | ${captureEntry.state} | ${captureEntry.viewport.width}x${captureEntry.viewport.height} |`),
    '',
  ].join('\n')
  writeFileSync(resolve(outDir, 'REPORT.md'), report)
  writeFileSync(resolve(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({
    captures: evidence.captures.length,
    requests: evidence.requestLog.length,
    failures: evidence.failures,
    runtimeErrors: evidence.runtimeErrors,
    failedRequests: evidence.failedRequests,
  }, null, 2))
  if (caughtError) throw caughtError
  if (evidence.failures.length || evidence.runtimeErrors.length || evidence.failedRequests.length) {
    throw new Error('Weather enrichment browser witness failed')
  }
  console.log('PASS: Weather enrichment browser witness')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run()
}
