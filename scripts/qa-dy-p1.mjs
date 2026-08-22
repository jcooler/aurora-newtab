// DY-P1 two-axis dock witness. The baseline phase runs against the exact
// pre-packet checkpoint and permanently records how legacy dock placements
// with no `y` render. Later phases may compare against this ignored scratch
// evidence, but must never rewrite it without an explicit replacement flag.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { BLOCK_IDS } from '../src/lib/layout/types.ts'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import { prepareDyOutputDir } from './qa-dy-p1-output.mjs'

export const DY_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1366, height: 768 }),
  Object.freeze({ width: 1408, height: 445 }),
  Object.freeze({ width: 1600, height: 900 }),
  Object.freeze({ width: 599, height: 800 }),
  Object.freeze({ width: 600, height: 800 }),
])

const argv = process.argv.slice(2)
const phase = argv.find((value) => value.startsWith('--phase='))?.slice('--phase='.length) ?? 'baseline'
if (!['baseline', 'after'].includes(phase)) throw new Error(`unknown DY-P1 phase: ${phase}`)
const baselineOnly = argv.includes('--baseline-only')
if (phase === 'after' && !baselineOnly) {
  throw new Error('DY-P1 after-phase interactions are added in implementation Task 7')
}

const repoRoot = process.cwd()
const dist = resolve(repoRoot, '.qa-dy-p1-dist')
const profileDir = resolve(repoRoot, '.playwright-profile-qa-dy-p1')
let outDir = prepareDyOutputDir(argv, repoRoot, phase)
const evidencePath = resolve(outDir, 'evidence.json')
const replaceBaseline = argv.includes('--replace-baseline')
const baselineEvidencePath = resolve(repoRoot, '.qa-dy-p1-baseline', 'evidence.json')
const baselineEvidence = phase === 'after'
  ? JSON.parse(readFileSync(baselineEvidencePath, 'utf8'))
  : null

if (phase === 'baseline' && existsSync(evidencePath) && !replaceBaseline) {
  throw new Error('DY-P1 baseline already exists; pass --replace-baseline to replace it deliberately')
}
if (phase === 'baseline' && replaceBaseline) {
  rmSync(outDir, { recursive: true, force: true })
  outDir = prepareDyOutputDir(argv, repoRoot, phase)
}
if (phase === 'after') {
  rmSync(outDir, { recursive: true, force: true })
  outDir = prepareDyOutputDir(argv, repoRoot, phase)
}

for (const [path, suffix] of [
  [dist, '.qa-dy-p1-dist'],
  [profileDir, '.playwright-profile-qa-dy-p1'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe DY-P1 scratch path: ${path}`)
  rmSync(path, { recursive: true, force: true })
}

const commit = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).stdout.trim()
const build = spawnSync(process.execPath, [
  resolve(repoRoot, 'node_modules/vite/bin/vite.js'),
  'build', '--mode', 'preview', '--outDir', dist, '--emptyOutDir',
], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: { ...process.env, AURORA_BUILD_COMMIT: commit },
})
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`DY-P1 preview build failed: ${build.status}`)
}

const evidence = {
  phase,
  commit,
  ...(baselineEvidence ? { baselineCommit: baselineEvidence.commit } : {}),
  viewports: DY_VIEWPORTS,
  desktop: [],
  boundaries: [],
  writes: [],
  runtimeErrors: [],
  failedRequests: [],
  failures: [],
  comparisons: [],
}
const fail = (message) => { evidence.failures.push(message) }
const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const key = ({ width, height }) => `${width}x${height}`
const canonicalJson = (value) => JSON.stringify(value, (_key, candidate) => (
  candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? Object.fromEntries(Object.entries(candidate).sort(([a], [b]) => a.localeCompare(b)))
    : candidate
))

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !argv.includes('--headed'),
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(20_000)

const runtimeErrors = []
const failedRequests = []
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
})

const waitForCanvas = async () => {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForFunction(() => {
    const expected = ['weather', 'bookmarks', 'tasks', 'notes']
    return expected.every((id) => {
      const item = document.querySelector(`[data-block-id="${id}"]`)
      if (!item || item.hasAttribute('data-canvas-empty')) return false
      const rect = item.getBoundingClientRect()
      return rect.width >= 4 && rect.height >= 4
    })
  })
  await page.waitForTimeout(180)
}

const armWriteLog = () => page.evaluate(() => {
  window.__dyWriteLog = []
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') window.__dyWriteLog.push(Object.keys(changes).sort())
  })
})

const harvestWrites = async (label) => {
  const writes = await page.evaluate(() => window.__dyWriteLog ?? [])
  for (const keys of writes) {
    evidence.writes.push({ label, keys })
    fail(`${label}: unexpected storage write (${keys.join(',')})`)
  }
}

const reloadForViewport = async (viewport) => {
  await page.setViewportSize(viewport)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await armWriteLog()
}

let caughtError = null
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-canvas-surface]')
  await seedInformationFirstFixtures(page)

  const seeded = await page.evaluate(async ({ blockIds }) => {
    const { settings, location, weatherCache } = await chrome.storage.local.get([
      'settings', 'location', 'weatherCache',
    ])
    const widgetFlags = Object.fromEntries(Object.keys(settings.widgets).map((id) => [id, false]))
    Object.assign(widgetFlags, { weather: true, bookmarks: true, todo: true, notes: true })
    const widgets = Object.fromEntries(blockIds.map((id) => [id, { kind: 'hidden' }]))
    Object.assign(widgets, {
      weather: { kind: 'docked', dock: 'top', order: 0, x: 18 },
      bookmarks: { kind: 'docked', dock: 'top', order: 1, x: 72 },
      tasks: { kind: 'docked', dock: 'bottom', order: 0, x: 24 },
      notes: { kind: 'docked', dock: 'bottom', order: 1, x: 76 },
    })
    const layouts = {
      version: 1,
      activeLayoutId: 'dy-legacy-baseline',
      layouts: [{ id: 'dy-legacy-baseline', name: 'DY legacy baseline', widgets }],
    }
    const normalized = (value) => Number(value.toFixed(4))
    const environmentParams = new URLSearchParams()
    environmentParams.set('timezone', 'auto')
    environmentParams.set('current', 'us_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen')
    environmentParams.set('latitude', String(normalized(location.lat)))
    environmentParams.set('longitude', String(normalized(location.lon)))
    const now = Date.now()
    const currentWeather = {
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
    }
    await chrome.storage.local.set({
      settings: { ...settings, widgets: widgetFlags },
      layouts,
      weatherCache: currentWeather,
      weatherAlertCache: {
        requestIdentity: `nws-alerts:v1:https://api.weather.gov/alerts/active?point=${normalized(location.lat)},${normalized(location.lon)}`,
        fetchedAt: now,
        status: 'supported',
        alerts: [],
      },
    })
    return layouts
  }, { blockIds: BLOCK_IDS })

  // Settle and retire any pre-seed request before the witness begins. The
  // fully seeded reload must use the current forecast, environment, and NWS
  // caches without starting a replacement request.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await page.waitForTimeout(250)
  // Setup activity is outside the witness. Only the settled seeded product
  // surface may contribute runtime/request/write evidence.
  runtimeErrors.length = 0
  failedRequests.length = 0

  for (const viewport of DY_VIEWPORTS) {
    await reloadForViewport(viewport)
    const label = key(viewport)
    const state = await page.evaluate(async () => {
      const ids = ['weather', 'bookmarks', 'tasks', 'notes']
      const rects = Object.fromEntries(ids.map((id) => {
        const node = document.querySelector(`[data-block-id="${id}"]`)
        if (!node) return [id, null]
        const rect = node.getBoundingClientRect()
        return [id, Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map((field) => [
          field, Number(rect[field].toFixed(3)),
        ]))]
      }))
      const { layouts } = await chrome.storage.local.get('layouts')
      return {
        order: [...document.querySelectorAll('[data-block-id]')].map((node) => node.getAttribute('data-block-id')),
        modes: Object.fromEntries(ids.map((id) => [
          id,
          document.querySelector(`[data-block-id="${id}"]`)?.getAttribute('data-canvas-mode') ?? null,
        ])),
        rects,
        layouts,
      }
    })

    const layoutsJson = canonicalJson(state.layouts)
    if (layoutsJson !== canonicalJson(seeded)) fail(`${label}: layouts storage changed during render`)
    const expectedOrder = ['weather', 'bookmarks', 'tasks', 'notes']
    if (state.order.join(',') !== expectedOrder.join(',')) {
      fail(`${label}: render order ${state.order.join(',')}`)
    }
    const expectedMode = viewport.width < 600 ? 'stacked' : 'docked'
    for (const id of expectedOrder) {
      if (state.modes[id] !== expectedMode) fail(`${label}: ${id} mode ${state.modes[id]}`)
    }

    if (viewport.width !== 599 && viewport.width !== 600) {
      const screenshot = resolve(outDir, `${label}-legacy-baseline.png`)
      await page.screenshot({ path: screenshot })
      evidence.desktop.push({
        viewport,
        screenshot: `${label}-legacy-baseline.png`,
        screenshotSha256: sha256File(screenshot),
        rects: state.rects,
        layouts: layoutsJson,
      })
    } else {
      evidence.boundaries.push({ viewport, order: state.order, modes: state.modes, layouts: layoutsJson })
    }
    await harvestWrites(label)
  }

  if (evidence.desktop.length !== 3) fail(`expected 3 desktop captures, found ${evidence.desktop.length}`)
  const rectWitnesses = evidence.desktop.reduce((sum, capture) => (
    sum + Object.values(capture.rects).filter(Boolean).length
  ), 0)
  if (rectWitnesses !== 12) fail(`expected 12 desktop rectangle witnesses, found ${rectWitnesses}`)
  if (evidence.boundaries.length !== 2) fail(`expected 2 boundary witnesses, found ${evidence.boundaries.length}`)

  if (baselineEvidence) {
    for (const current of evidence.desktop) {
      const baseline = baselineEvidence.desktop.find((candidate) => (
        candidate.viewport.width === current.viewport.width
        && candidate.viewport.height === current.viewport.height
      ))
      if (!baseline) {
        fail(`${key(current.viewport)}: immutable baseline capture missing`)
        continue
      }
      for (const id of ['weather', 'bookmarks', 'tasks', 'notes']) {
        const exact = JSON.stringify(current.rects[id]) === JSON.stringify(baseline.rects[id])
        evidence.comparisons.push({ viewport: current.viewport, id, exact })
        if (!exact) {
          fail(`${key(current.viewport)}: absent-Y ${id} rectangle changed`)
        }
      }
      if (current.layouts !== baseline.layouts) {
        fail(`${key(current.viewport)}: layouts bytes differ from immutable baseline`)
      }
    }
    for (const current of evidence.boundaries) {
      const baseline = baselineEvidence.boundaries.find((candidate) => (
        candidate.viewport.width === current.viewport.width
        && candidate.viewport.height === current.viewport.height
      ))
      if (!baseline) {
        fail(`${key(current.viewport)}: immutable boundary baseline missing`)
        continue
      }
      if (JSON.stringify(current.order) !== JSON.stringify(baseline.order)) {
        fail(`${key(current.viewport)}: narrow boundary order changed`)
      }
      if (current.layouts !== baseline.layouts) {
        fail(`${key(current.viewport)}: boundary layouts bytes differ from immutable baseline`)
      }
    }
  }
} catch (error) {
  caughtError = error
  fail(`harness: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  try { await context.close() } catch { /* best-effort shutdown */ }
}

evidence.runtimeErrors.push(...runtimeErrors)
evidence.failedRequests.push(...failedRequests)
writeFileSync(resolve(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)

console.log(JSON.stringify({
  phase: evidence.phase,
  commit: evidence.commit,
  desktopCaptures: evidence.desktop.length,
  rectangleWitnesses: evidence.desktop.reduce((sum, capture) => sum + Object.values(capture.rects).filter(Boolean).length, 0),
  boundaries: evidence.boundaries.length,
  writes: evidence.writes.length,
  runtimeErrors: evidence.runtimeErrors.length,
  failedRequests: evidence.failedRequests.length,
  failures: evidence.failures,
  comparisons: evidence.comparisons.length,
}, null, 2))

if (caughtError || evidence.failures.length || evidence.runtimeErrors.length || evidence.failedRequests.length) {
  process.exitCode = 1
}
