import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const repoRoot = process.cwd()
const dist = resolve('.preview-information-first-p1-dist')
const profileDir = resolve('.playwright-profile-information-first-p1')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/aurora-v1-canvas-implementation-session-prompt/outputs/information-first-pr-p1'
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-information-first-p1-dist'],
  [profileDir, '.playwright-profile-information-first-p1'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe temporary path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const build = spawnSync(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'),
  'build',
  '--mode',
  'preview',
  '--outDir',
  dist,
  '--emptyOutDir',
], { cwd: repoRoot, encoding: 'utf8' })
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`focused Vite build failed with status ${build.status}`)
}

const evidence = {
  packet: 'PR-P1',
  viewports: [],
  toggles: {},
  weatherCorners: [],
  runtimeErrors: [],
  failedRequests: [],
  cleanup: {},
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1366, height: 768 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(12_000)
page.on('console', (message) => {
  if (message.type() === 'error') evidence.runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  if (!request.url().startsWith('chrome-extension://')) {
    evidence.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
  }
})

const waitForCanvas = async () => {
  await page.waitForSelector('main[data-aurora-canvas]')
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(100)
}

const geometry = (ids) => page.evaluate((blockIds) => Object.fromEntries(blockIds.map((id) => {
  const node = document.querySelector(`[data-block-id="${id}"]`)
  if (!node) throw new Error(`missing Canvas identity ${id}`)
  const rect = node.getBoundingClientRect()
  return [id, {
    centerX: Number((rect.left + rect.width / 2).toFixed(3)),
    centerY: Number((rect.top + rect.height / 2).toFixed(3)),
    width: Number(rect.width.toFixed(3)),
    height: Number(rect.height.toFixed(3)),
    layer: getComputedStyle(node).zIndex,
  }]
})), ids)

const assertSameGeometry = (before, after, label) => {
  for (const id of Object.keys(before)) {
    for (const key of ['centerX', 'centerY', 'width', 'height', 'layer']) {
      const left = before[id][key]
      const right = after[id][key]
      const same = key === 'layer' ? left === right : Math.abs(left - right) <= 1
      assert(same, `${label}: ${id} ${key} changed from ${left} to ${right}`)
    }
  }
}

const closedDrawerEvidence = () => page.locator('[role="dialog"][aria-label="Settings"]').evaluate((node) => {
  const rect = node.getBoundingClientRect()
  const style = getComputedStyle(node)
  const hit = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))
  return {
    visibility: style.visibility,
    pointerEvents: style.pointerEvents,
    rect: { left: rect.left, right: rect.right, width: rect.width },
    rightEdgeHitsDrawer: !!hit && node.contains(hit),
    inert: node.hasAttribute('inert'),
    ariaHidden: node.getAttribute('aria-hidden'),
  }
})

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    for (const key of ['weather', 'search', 'bookmarks', 'quote', 'todo', 'notes', 'timer']) widgets[key] = true
    const location = { lat: 33.749, lon: -84.388, label: 'Atlanta', manual: true }
    const params = new URLSearchParams()
    params.set('temperature_unit', 'celsius')
    params.set('wind_speed_unit', 'kmh')
    params.set('forecast_hours', '12')
    params.set('forecast_days', '1')
    params.set('timezone', 'auto')
    params.set('timeformat', 'iso8601')
    params.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day')
    params.set('hourly', 'temperature_2m,precipitation_probability,weather_code,is_day')
    params.set('daily', 'sunrise,sunset')
    params.set('latitude', String(location.lat))
    params.set('longitude', String(location.lon))
    const requestIdentity = `open-meteo:v1:https://api.open-meteo.com/v1/forecast?${params.toString()}`
    const now = Date.now()
    await chrome.storage.local.set({
      settings: { ...settings, widgets },
      location,
      weatherCache: {
        current: { tempC: 24, feelsLikeC: 25, code: 0, windKmh: 8, humidity: 52, isDay: true },
        hourly: Array.from({ length: 12 }, (_, index) => ({
          time: `2026-08-17T${String(9 + index).padStart(2, '0')}:00`,
          tempC: 24 + index,
          precipProb: index === 3 ? 60 : 5,
          code: 0,
          isDay: true,
        })),
        fetchedAt: now,
        locationLabel: location.label,
        requestIdentity,
        sunriseISO: '2026-08-17T07:02',
        sunsetISO: '2026-08-17T20:23',
      },
      connectors: {},
      layout: { version: 3, profiles: {} },
      photoPrefs: { mode: 'auto', index: 3, lastRotated: '2026-08-17' },
    })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
  ]) {
    await page.setViewportSize(viewport)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCanvas()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    const drawer = await closedDrawerEvidence()
    assert(!overflow, `${viewport.width}x${viewport.height}: document horizontal overflow`)
    assert(drawer.visibility === 'hidden' && drawer.pointerEvents === 'none' && drawer.inert && drawer.ariaHidden === 'true',
      `${viewport.width}x${viewport.height}: closed Settings is exposed: ${JSON.stringify(drawer)}`)
    assert(!drawer.rightEdgeHitsDrawer && drawer.rect.left >= viewport.width - 0.5,
      `${viewport.width}x${viewport.height}: closed Settings remains in the viewport: ${JSON.stringify(drawer)}`)
    const profile = await page.locator('main[data-aurora-canvas]').getAttribute('data-canvas-profile')
    evidence.viewports.push({ ...viewport, profile, overflow, drawer })
  }

  await page.setViewportSize({ width: 1366, height: 768 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  const survivorIds = ['weather', 'clock', 'greeting', 'focus', 'search', 'tasks', 'notes']
  const layoutBefore = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))
  const beforeWidget = await geometry(survivorIds)
  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByRole('tab', { name: 'Widgets' }).click()
  await settings.getByRole('switch', { name: 'Daily quote' }).click()
  await settings.getByRole('button', { name: 'Close settings' }).click()
  await page.locator('[data-block-id="quote"]').waitFor({ state: 'detached' })
  const afterWidget = await geometry(survivorIds)
  assertSameGeometry(beforeWidget, afterWidget, 'Daily quote toggle')
  assert(await page.evaluate(async (before) => JSON.stringify((await chrome.storage.local.get('layout')).layout) === before, layoutBefore),
    'Daily quote toggle wrote layout')

  await page.getByRole('button', { name: 'Open settings' }).click()
  await settings.getByRole('tab', { name: 'Connectors' }).click()
  await settings.getByRole('switch', { name: 'Enable GitHub' }).click()
  await settings.getByRole('button', { name: 'Close settings' }).click()
  await page.locator('[data-block-id="github"]').waitFor()
  const afterConnector = await geometry(survivorIds)
  assertSameGeometry(beforeWidget, afterConnector, 'GitHub toggle')
  assert(await page.evaluate(async (before) => JSON.stringify((await chrome.storage.local.get('layout')).layout) === before, layoutBefore),
    'GitHub toggle wrote layout')
  evidence.toggles = { layoutBefore, beforeWidget, afterWidget, afterConnector }

  const cornerViewports = [
    { width: 375, height: 812 },
    { width: 1920, height: 1080 },
  ]
  const corners = [
    { name: 'top-left', x: 0, y: 0, expected: 'below' },
    { name: 'top-right', x: 100, y: 0, expected: 'below' },
    { name: 'bottom-left', x: 0, y: 100, expected: 'above' },
    { name: 'bottom-right', x: 100, y: 100, expected: 'above' },
  ]
  for (const viewport of cornerViewports) {
    await page.setViewportSize(viewport)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCanvas()
    const profile = await page.locator('main[data-aurora-canvas]').getAttribute('data-canvas-profile')
    assert(profile, 'Canvas profile missing')
    for (const corner of corners) {
      await page.evaluate(async ({ profile, corner }) => {
        await chrome.storage.local.set({
          layout: { version: 3, profiles: { [profile]: { mode: 'custom', placements: {
            weather: { kind: 'canvas', x: corner.x, y: corner.y, size: 'standard', layer: 20 },
          } } } },
        })
      }, { profile, corner })
      const trigger = page.locator('[data-block-id="weather"] button[aria-expanded="false"]')
      await trigger.scrollIntoViewIfNeeded()
      const siblings = await geometry(['weather', 'clock', 'greeting', 'focus', 'search', 'tasks', 'notes'])
      const canvasHeight = await page.locator('[data-canvas-surface]').evaluate((node) => node.getBoundingClientRect().height)
      await trigger.click()
      const details = page.getByRole('dialog', { name: 'Weather details' })
      await details.waitFor()
      const box = await details.boundingBox()
      assert(box, `${corner.name}: Weather details has no box`)
      assert(box.x >= 7.5 && box.y >= 7.5
        && box.x + box.width <= viewport.width - 7.5
        && box.y + box.height <= viewport.height - 7.5,
      `${viewport.width}x${viewport.height} ${corner.name}: panel escaped viewport: ${JSON.stringify(box)}`)
      const vertical = await details.getAttribute('data-weather-vertical')
      assert(vertical === corner.expected,
        `${viewport.width}x${viewport.height} ${corner.name}: expected ${corner.expected}, got ${vertical}`)
      assertSameGeometry(siblings, await geometry(Object.keys(siblings)), `${corner.name} Weather open`)
      assert(Math.abs(await page.locator('[data-canvas-surface]').evaluate((node) => node.getBoundingClientRect().height) - canvasHeight) <= 1,
        `${corner.name}: Weather changed Canvas height`)
      assert(await details.evaluate((node) => node.parentElement === document.body), `${corner.name}: details are not body-owned`)
      await page.keyboard.press('Escape')
      await details.waitFor({ state: 'detached' })
      assert(await trigger.evaluate((node) => node === document.activeElement), `${corner.name}: Escape did not restore trigger focus`)
      evidence.weatherCorners.push({ ...viewport, profile, corner: corner.name, vertical, box })
    }
    await page.screenshot({ path: `${outDir}/pr-p1-${viewport.width}x${viewport.height}.png`, fullPage: false })
  }

  assert(evidence.runtimeErrors.length === 0, `runtime errors: ${evidence.runtimeErrors.join('; ')}`)
  assert(evidence.failedRequests.length === 0, `failed requests: ${evidence.failedRequests.join('; ')}`)
} catch (error) {
  caughtError = error
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/pr-p1-failure.png`, fullPage: false }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true }).catch(() => {})
  await context.close().then(() => { evidence.cleanup.contextClosed = true }).catch(() => {})
  rmSync(profileDir, { recursive: true, force: true })
  rmSync(dist, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
  evidence.cleanup.distRemoved = true
  writeFileSync(`${outDir}/pr-p1-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`)
}

console.log(`EVIDENCE: ${JSON.stringify(evidence)}`)
if (caughtError) {
  console.error(`FAIL: information-first PR-P1 browser proof: ${evidence.error}`)
  process.exitCode = 1
} else {
  console.log('PASS: information-first PR-P1 browser proof')
}
