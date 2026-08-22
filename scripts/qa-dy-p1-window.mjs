// DY-P1 real-window witness. This script never builds or mutates the caller's
// extension directory: Task 9 supplies the exact reviewed `dist`, whose
// build-provenance.json is recorded beside measured OS-window evidence.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { chromium } from 'playwright'
import { BLOCK_IDS } from '../src/lib/layout/types.ts'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'

export const DY_WINDOW_BEHAVIORS = Object.freeze([
  'fresh-profile-bootstrap',
  'isolated-weather-fixture',
  'return-tier',
  'pointer-cancel',
  'escape-zero-write',
  'top-to-bottom',
  'in-dock-two-axis',
  'byte-stable-layouts',
  'legacy-layout-write-rejection',
])

const argv = process.argv.slice(2)
if (argv.includes('--describe')) {
  console.log(JSON.stringify({
    viewport: null,
    targetFamily: '1408x445',
    behaviors: DY_WINDOW_BEHAVIORS,
    provenance: {
      build: 'caller-provided-exact-dist',
      distArgumentRequired: true,
      mutatesBuild: false,
    },
  }))
  process.exit(0)
}

const repoRoot = process.cwd()
const distArg = argv.find((value) => value.startsWith('--dist='))?.slice('--dist='.length)
if (!distArg) throw new Error('DY-P1 real-window witness requires --dist=<exact-reviewed-build>')
const dist = resolve(repoRoot, distArg)
const provenancePath = resolve(dist, 'build-provenance.json')
const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'))
if (!provenance.commit) throw new Error('DY-P1 reviewed dist has no build commit provenance')

const profileDir = resolve(repoRoot, '.playwright-profile-qa-dy-p1-window')
const outDir = resolve(repoRoot, '.qa-dy-p1-window')
for (const [path, suffix] of [
  [profileDir, '.playwright-profile-qa-dy-p1-window'],
  [outDir, '.qa-dy-p1-window'],
]) {
  if (dirname(path) !== repoRoot || basename(path) !== suffix) throw new Error(`unsafe DY-P1 window path: ${path}`)
  rmSync(path, { recursive: true, force: true })
}
mkdirSync(outDir, { recursive: true })

const evidence = {
  build: { dist, commit: provenance.commit },
  measuredInner: null,
  stages: [],
  writes: [],
  failures: [],
  runtimeErrors: [],
  failedRequests: [],
}
const fail = (message) => evidence.failures.push(message)

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  reducedMotion: 'reduce',
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    '--window-size=1424,597',
    '--window-position=40,40',
  ],
})
const page = await context.newPage()
page.setDefaultTimeout(20_000)
page.on('console', (message) => {
  if (message.type() === 'error') evidence.runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  evidence.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
})

const waitForCanvasRoot = async () => {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(220)
}
const waitForCanvas = async () => {
  await waitForCanvasRoot()
  await page.waitForFunction(() => ['weather', 'bookmarks', 'tasks'].every((id) => {
    const node = document.querySelector(`[data-block-id="${id}"]`)
    return node && !node.hasAttribute('data-canvas-empty') && node.getBoundingClientRect().width > 4
  }))
  await page.waitForTimeout(220)
}
const armWrites = () => page.evaluate(() => {
  window.__dyWindowWrites = []
  window.__dyWindowPointerId = null
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') window.__dyWindowWrites.push(Object.keys(changes).sort())
  })
  document.addEventListener('pointerdown', (event) => {
    window.__dyWindowPointerId = event.pointerId
  }, { capture: true })
})
const takeWrites = async (label, allowed = []) => {
  const writes = await page.evaluate(() => {
    const current = window.__dyWindowWrites ?? []
    window.__dyWindowWrites = []
    return current
  })
  for (const keys of writes) {
    const joined = keys.join(',')
    const expected = allowed.includes(joined)
    evidence.writes.push({ label, keys, expected })
    if (keys.includes('layout')) fail(`${label}: wrote frozen legacy layout key`)
    if (!expected) fail(`${label}: unexpected write ${joined}`)
  }
  return writes
}
const box = async (id) => {
  const value = await page.locator(`[data-block-id="${id}"]`).boundingBox()
  if (!value) throw new Error(`${id}: no real-window geometry`)
  return value
}
const band = (edge) => page.locator(edge === 'top' ? '.canvas-top-bar' : '.canvas-bottom-bar').evaluate((node) => {
  const rect = node.getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
})
const point = (rect, xPct, yPct) => ({
  x: rect.left + rect.width * xPct / 100,
  y: rect.top + rect.height * yPct / 100,
})
const beginDrag = async (id) => {
  const rect = await box(id)
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  return rect
}
const move = async (target) => {
  await page.mouse.move(target.x, target.y, { steps: 9 })
  await page.waitForTimeout(130)
}
const release = async () => {
  await page.mouse.up()
  await page.waitForTimeout(180)
}
const modeSize = (id) => page.locator(`[data-block-id="${id}"]`).evaluate((node) => ({
  mode: node.getAttribute('data-canvas-mode'),
  size: node.getAttribute('data-canvas-size'),
}))
const layoutsBytes = () => page.evaluate(async () => {
  const { layouts } = await chrome.storage.local.get('layouts')
  return JSON.stringify(layouts)
})
const stage = async (id, detail) => {
  const screenshot = resolve(outDir, `${id}.png`)
  await page.screenshot({ path: screenshot })
  evidence.stages.push({ id, detail, screenshot: `${id}.png` })
}

let caughtError = null
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  // A brand-new profile does not yet have the fixture-enabled Bookmarks and
  // Tasks identities. Prove the exact extension canvas loaded, measure the
  // real OS window, then seed before requiring fixture-dependent widgets.
  await waitForCanvasRoot()
  evidence.measuredInner = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio,
  }))
  const inner = evidence.measuredInner
  if (inner.width < 1380 || inner.width > 1430 || inner.height < 430 || inner.height > 460) {
    fail(`measured real window ${inner.width}x${inner.height} is outside the 1408x445 family`)
  }

  await seedInformationFirstFixtures(page)
  await page.evaluate(async ({ blockIds }) => {
    const { settings, location, weatherCache } = await chrome.storage.local.get([
      'settings', 'location', 'weatherCache',
    ])
    const flags = Object.fromEntries(Object.keys(settings.widgets).map((id) => [id, false]))
    Object.assign(flags, { weather: true, bookmarks: true, todo: true })
    const widgets = Object.fromEntries(blockIds.map((id) => [id, { kind: 'hidden' }]))
    Object.assign(widgets, {
      weather: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -8, tier: 'standard', layer: 3 },
      bookmarks: { kind: 'docked', dock: 'top', order: 0, x: 18, y: 24, tier: 'standard' },
      tasks: { kind: 'docked', dock: 'bottom', order: 0, x: 82, y: 72, tier: 'compact' },
    })
    const normalized = (value) => Number(value.toFixed(4))
    const environmentParams = new URLSearchParams()
    environmentParams.set('timezone', 'auto')
    environmentParams.set('current', 'us_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen')
    environmentParams.set('latitude', String(normalized(location.lat)))
    environmentParams.set('longitude', String(normalized(location.lon)))
    const now = Date.now()
    await chrome.storage.local.set({
      settings: { ...settings, widgets: flags },
      layouts: {
        version: 1,
        activeLayoutId: 'dy-window',
        layouts: [{ id: 'dy-window', name: 'DY real window', widgets }],
      },
      weatherCache: {
        ...weatherCache,
        fetchedAt: now,
        environment: {
          requestIdentity: `open-meteo-air:v1:https://air-quality-api.open-meteo.com/v1/air-quality?${environmentParams.toString()}`,
          fetchedAt: now,
          status: 'available',
          usAqi: 42,
          uvIndex: 3,
          pollen: { status: 'available', readings: [{ species: 'grass', grainsPerCubicMeter: 4 }] },
        },
      },
      weatherAlertCache: {
        requestIdentity: `nws-alerts:v1:https://api.weather.gov/alerts/active?point=${normalized(location.lat)},${normalized(location.lon)}`,
        fetchedAt: now,
        status: 'supported',
        alerts: [],
      },
    })
  }, { blockIds: BLOCK_IDS })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await page.waitForTimeout(250)
  // Fixture setup is not product interaction evidence. Once every current
  // cache is settled, start the write/network witness from a clean slate.
  evidence.runtimeErrors.length = 0
  evidence.failedRequests.length = 0
  await armWrites()
  const baselineBytes = await layoutsBytes()
  await stage('real-window-settled', `measured ${inner.width}x${inner.height} at DPR ${inner.dpr}`)

  await page.keyboard.press('Control+Shift+E')
  await page.waitForSelector('[role="toolbar"][aria-label="Edit layout"]')
  const top = await band('top')
  const bottom = await band('bottom')

  // Free Standard Weather docks directly, then returns to canvas as Standard,
  // traverses to the opposite dock, and moves in both dock axes.
  await beginDrag('weather')
  await move(point(bottom, 26, 74))
  await release()
  if ((await modeSize('weather')).mode !== 'docked') fail('real window: free Weather did not dock')

  await beginDrag('weather')
  await move({ x: inner.width * 0.54, y: inner.height * 0.5 })
  if ((await modeSize('weather')).size !== 'standard') fail('real window: undock did not restore Standard')
  await move(point(top, 74, 28))
  await release()
  if (!await page.locator('.canvas-top-bar [data-block-id="weather"]').count()) {
    fail('real window: opposite-dock traversal did not finish in top')
  }
  const placed = await page.locator('[data-block-id="weather"]').evaluate((node) => ({
    left: Number.parseFloat(node.style.left),
    top: Number.parseFloat(node.style.top),
  }))
  if (Math.abs(placed.left - 74) > 4 || Math.abs(placed.top - 28) > 6) {
    fail(`real window: in-dock X/Y settled at ${placed.left},${placed.top}`)
  }
  await stage('real-window-two-axis', `Weather top dock at ${placed.left.toFixed(2)}%, ${placed.top.toFixed(2)}%`)

  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(220)
  const saveWrites = await takeWrites('save', ['layouts'])
  if (saveWrites.length !== 1 || saveWrites[0].join(',') !== 'layouts') fail(`real window: Save writes ${JSON.stringify(saveWrites)}`)
  const savedBytes = await layoutsBytes()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await armWrites()
  if (await layoutsBytes() !== savedBytes) fail('real window: layouts bytes changed across reload')

  // Pointer cancellation restores the exact saved top-dock box.
  await page.keyboard.press('Control+Shift+E')
  const beforeCancel = await box('weather')
  await beginDrag('weather')
  await move({ x: inner.width * 0.5, y: inner.height * 0.5 })
  await page.evaluate(() => {
    document.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: window.__dyWindowPointerId ?? 1,
    }))
  })
  await page.mouse.up()
  await page.waitForTimeout(160)
  const afterCancel = await box('weather')
  const cancelDelta = Math.max(Math.abs(beforeCancel.x - afterCancel.x), Math.abs(beforeCancel.y - afterCancel.y))
  if (cancelDelta > 0.5) fail(`real window: pointercancel delta ${cancelDelta.toFixed(2)}px`)

  // Escape owns both the active drag and draft. It writes nothing and leaves
  // no guide/band chrome or listener to wake later.
  await beginDrag('weather')
  await move(point(bottom, 50, 50))
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(180)
  if (await page.locator('[data-editing], .dock-drop-zone, .edit-guides').count()) {
    fail('real window: Escape left edit or transient drag chrome')
  }
  if (await layoutsBytes() !== savedBytes) fail('real window: Escape changed saved layouts')
  await takeWrites('pointercancel-and-escape')
  await stage('real-window-cancelled', `pointercancel restored within ${cancelDelta.toFixed(2)}px; Escape was write-free`)

  if (baselineBytes === savedBytes) fail('real window: interaction Save did not change the layouts document')
} catch (error) {
  caughtError = error
  fail(`harness: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  try { await context.close() } catch { /* best effort */ }
}

writeFileSync(resolve(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
console.log(JSON.stringify({
  commit: evidence.build.commit,
  measuredInner: evidence.measuredInner,
  stages: evidence.stages.length,
  writes: evidence.writes,
  runtimeErrors: evidence.runtimeErrors.length,
  failedRequests: evidence.failedRequests.length,
  failures: evidence.failures,
}, null, 2))
if (caughtError || evidence.failures.length || evidence.runtimeErrors.length || evidence.failedRequests.length) {
  process.exitCode = 1
}
