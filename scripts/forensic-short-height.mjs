// Read-only forensic probe for the owner-rejected 1408x445 installed state.
// Reproduces the regression with a production-mode preview build, existing-
// layout-shaped storage (V1-adapted, unmarked custom V3, and derived
// defaults), and real pointer interactions. Writes evidence JSON + PNGs.
// It changes no production code and no tracked file.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const repoRoot = process.cwd()
const dist = resolve('.preview-forensic-dist')
const profileDir = resolve('.playwright-profile-forensic')
const outDir = resolve('.forensic-short-height-out')
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-forensic-dist'],
  [profileDir, '.playwright-profile-forensic'],
  [outDir, '.forensic-short-height-out'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe temporary path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const build = spawnSync(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'),
  'build', '--mode', 'preview', '--outDir', dist, '--emptyOutDir',
], { cwd: repoRoot, encoding: 'utf8' })
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`build failed: ${build.status}`)
}

const evidence = { scenarios: [], weather: [], runtimeErrors: [], failedRequests: [] }

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1408, height: 445 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(15_000)
page.on('console', (m) => { if (m.type() === 'error') evidence.runtimeErrors.push(`console: ${m.text()}`) })
page.on('pageerror', (e) => evidence.runtimeErrors.push(`page: ${String(e)}`))
page.on('requestfailed', (r) => {
  if (!r.url().startsWith('chrome-extension://')) {
    evidence.failedRequests.push(`${r.method()} ${r.url()}: ${r.failure()?.errorText ?? 'failed'}`)
  }
})

const waitForCanvas = async () => {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(200)
}

// The owner's widget selection from their Settings screenshot.
const OWNER_WIDGETS = ['search', 'weather', 'todo', 'timer', 'quote', 'bookmarks', 'notes', 'monthCal', 'sun', 'ics']

const seedBase = () => page.evaluate(async (ownerWidgets) => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
  for (const key of ownerWidgets) if (key in widgets) widgets[key] = true
  const location = { lat: 32.7767, lon: -96.797, label: 'Dallas', manual: true }
  const now = Date.now()
  const normalize = (v) => Number(v.toFixed(4))
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
  params.set('latitude', String(normalize(location.lat)))
  params.set('longitude', String(normalize(location.lon)))
  const requestIdentity = `open-meteo:v1:https://api.open-meteo.com/v1/forecast?${params.toString()}`
  const day = new Date(now).toISOString().slice(0, 10)
  const weatherCache = {
    current: { tempC: 35.6, feelsLikeC: 33.3, code: 0, windKmh: 11, humidity: 66, isDay: true },
    hourly: Array.from({ length: 12 }, (_, index) => ({
      time: `${day}T${String((9 + index) % 24).padStart(2, '0')}:00`,
      tempC: 28 + index,
      precipProb: index === 3 ? 5 : 0,
      code: 0,
      isDay: index < 10,
    })),
    fetchedAt: now,
    locationLabel: location.label,
    requestIdentity,
    sunriseISO: `${day}T07:02`,
    sunsetISO: `${day}T20:23`,
  }
  await chrome.storage.local.set({
    settings: { ...settings, widgets },
    location,
    weatherCache,
    focus: { text: 'Ship Aurora', done: false, date: day },
  })
  if (chrome.bookmarks) {
    const tree = await chrome.bookmarks.getTree()
    const bar = tree[0]?.children?.[0]
    if (bar && (bar.children ?? []).length === 0) {
      const leisure = await chrome.bookmarks.create({ parentId: bar.id, title: 'Leisure' })
      await chrome.bookmarks.create({ parentId: leisure.id, title: 'Photos', url: 'https://example.invalid/photos' })
      const reference = await chrome.bookmarks.create({ parentId: bar.id, title: 'Reference' })
      await chrome.bookmarks.create({ parentId: reference.id, title: 'Docs', url: 'https://example.invalid/docs' })
      const games = await chrome.bookmarks.create({ parentId: bar.id, title: 'Games' })
      await chrome.bookmarks.create({ parentId: games.id, title: 'Arcade', url: 'https://example.invalid/arcade' })
    }
  }
}, OWNER_WIDGETS)

// V1-shaped layout: percentages authored against a single visible page,
// the shape a longtime V1 user's storage actually holds.
const V1_LAYOUT = {
  bookmarks: { x: 50, y: 6 },
  timer: { x: 7, y: 12 },
  weather: { x: 93, y: 12 },
  clock: { x: 50, y: 30 },
  search: { x: 50, y: 52 },
  focus: { x: 50, y: 62 },
  quote: { x: 50, y: 88 },
  notes: { x: 7, y: 90 },
  todo: { x: 93, y: 90 },
  monthCal: { x: 12, y: 40 },
  sun: { x: 12, y: 62 },
  ics: { x: 12, y: 75 },
}

// Unmarked custom V3 compact profile: saved through the new Arrange against
// the 390x844 artboard, with NO coordinateHeight (legacy dynamic plane).
const V3_UNMARKED_CUSTOM = {
  version: 3,
  profiles: {
    compact: {
      mode: 'custom',
      placements: {
        bookmarks: { kind: 'canvas', x: 50, y: 6, size: 'compact', layer: 0 },
        weather: { kind: 'canvas', x: 50, y: 35, size: 'compact', layer: 1 },
        timer: { kind: 'canvas', x: 50, y: 20, size: 'compact', layer: 2 },
        clock: { kind: 'canvas', x: 50, y: 50, size: 'compact', layer: 3 },
        search: { kind: 'canvas', x: 50, y: 62, size: 'compact', layer: 4 },
        focus: { kind: 'canvas', x: 50, y: 71, size: 'compact', layer: 5 },
        quote: { kind: 'canvas', x: 50, y: 82, size: 'compact', layer: 6 },
        notes: { kind: 'canvas', x: 30, y: 92, size: 'compact', layer: 7 },
        todo: { kind: 'canvas', x: 70, y: 92, size: 'compact', layer: 8 },
        monthCal: { kind: 'canvas', x: 50, y: 12, size: 'compact', layer: 9 },
        sun: { kind: 'canvas', x: 50, y: 27, size: 'compact', layer: 10 },
        ics: { kind: 'canvas', x: 50, y: 43, size: 'compact', layer: 11 },
      },
    },
  },
}

const snapshotState = (label) => page.evaluate((label) => {
  const surface = document.querySelector('[data-canvas-surface]')
  const rect = surface?.getBoundingClientRect()
  const items = [...document.querySelectorAll('[data-canvas-surface] [data-block-id]')].map((node) => {
    const r = node.getBoundingClientRect()
    return {
      id: node.getAttribute('data-block-id'),
      size: node.getAttribute('data-canvas-size'),
      stageVariant: node.getAttribute('data-stage-variant'),
      className: node.className,
      top: Math.round(r.top), left: Math.round(r.left),
      width: Math.round(r.width), height: Math.round(r.height),
      fullyVisible: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0,
      partiallyVisible: r.bottom > 0 && r.top < window.innerHeight && r.width > 0,
    }
  })
  const bookmarkChips = [...document.querySelectorAll('[data-block-id="bookmarks"] nav > * , [data-block-id="bookmarks"] nav > div > button')]
    .slice(0, 8)
    .map((node) => {
      const r = node.getBoundingClientRect()
      const label = node.querySelector?.('[data-chip-label]')
      const marks = [...(node.querySelectorAll?.('[data-chip-mark]') ?? [])]
      return {
        tag: node.tagName,
        width: Math.round(r.width), height: Math.round(r.height),
        labelText: label?.textContent ?? null,
        labelDisplay: label ? getComputedStyle(label).display : null,
        labelVisibleWidth: label ? Math.round(label.getBoundingClientRect().width) : null,
        marks: marks.map((m) => ({ kind: m.getAttribute('data-bookmark-mark'), display: getComputedStyle(m).display, text: m.textContent?.trim() ?? '' })),
      }
    })
  return {
    label,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    profile: surface?.getAttribute('data-canvas-profile'),
    mode: surface?.getAttribute('data-canvas-mode'),
    coordinateHeight: surface?.getAttribute('data-canvas-coordinate-height'),
    surfaceHeight: rect ? Math.round(rect.height) : null,
    documentScrollHeight: document.documentElement.scrollHeight,
    documentClientHeight: document.documentElement.clientHeight,
    scrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    scrollOwner: (() => {
      const rootStyle = getComputedStyle(document.documentElement)
      const bodyStyle = getComputedStyle(document.body)
      return { rootOverflowY: rootStyle.overflowY, bodyOverflowY: bodyStyle.overflowY }
    })(),
    itemCount: items.length,
    fullyVisibleCount: items.filter((i) => i.fullyVisible).length,
    items,
    bookmarkChips,
  }
}, label)

const runScenario = async (name, seedLayout) => {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await seedBase()
  if (seedLayout === null) {
    await page.evaluate(() => chrome.storage.local.remove('layout'))
  } else {
    await page.evaluate((layout) => chrome.storage.local.set({ layout }), seedLayout)
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await page.waitForTimeout(600)
  const state = await snapshotState(name)
  await page.screenshot({ path: resolve(outDir, `${name}-1408x445.png`) })
  evidence.scenarios.push(state)
  return state
}

let caughtError
try {
  await runScenario('derived-default', null)
  await runScenario('v1-user-layout', V1_LAYOUT)
  await runScenario('v3-unmarked-custom', V3_UNMARKED_CUSTOM)

  // Weather expansion at the top-right with a saved desktop-profile custom
  // placement, exercised at short-height desktop windows through real clicks.
  for (const vp of [{ width: 1408, height: 445 }, { width: 1920, height: 500 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(vp)
    await page.evaluate((layout) => chrome.storage.local.set({ layout }), {
      version: 3,
      profiles: {
        compact: {
          mode: 'custom',
          placements: {
            weather: { kind: 'canvas', x: 93, y: 6, size: 'compact', layer: 0 },
            clock: { kind: 'canvas', x: 50, y: 50, size: 'compact', layer: 1 },
          },
        },
        standard: {
          mode: 'custom',
          placements: {
            weather: { kind: 'canvas', x: 93, y: 8, size: 'compact', layer: 0 },
            clock: { kind: 'canvas', x: 50, y: 45, size: 'full', layer: 1 },
          },
        },
      },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCanvas()
    const trigger = page.locator('[data-block-id="weather"] button[aria-expanded]').first()
    await trigger.waitFor({ state: 'visible' })
    const before = await page.evaluate(() => {
      const t = document.querySelector('[data-block-id="weather"] button[aria-expanded]')
      const r = t.getBoundingClientRect()
      return { trigger: { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) }, scrollY: window.scrollY }
    })
    await trigger.click()
    await page.waitForSelector('[data-weather-details]')
    await page.waitForTimeout(350)
    const panel = await page.evaluate(() => {
      const p = document.querySelector('[data-weather-details]')
      const r = p.getBoundingClientRect()
      const style = getComputedStyle(p)
      return {
        rect: { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) },
        position: style.position,
        vertical: p.getAttribute('data-weather-vertical'),
        horizontal: p.getAttribute('data-weather-horizontal'),
        scrollHeight: p.scrollHeight,
        clientHeight: p.clientHeight,
        withinViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        clientWidthDelta: window.innerWidth - document.documentElement.clientWidth,
        scrollY: window.scrollY,
      }
    })
    await page.screenshot({ path: resolve(outDir, `weather-topright-${vp.width}x${vp.height}.png`) })
    evidence.weather.push({ viewport: vp, before, panel })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
} catch (error) {
  caughtError = error
} finally {
  try { await context.close() } catch { /* ignore */ }
}

writeFileSync(resolve(outDir, 'forensic-evidence.json'), JSON.stringify(evidence, null, 2))
if (caughtError) {
  console.error('FORENSIC PROBE ERROR:', caughtError)
  process.exitCode = 1
} else {
  console.log('forensic probe complete')
}
console.log(JSON.stringify({
  scenarios: evidence.scenarios.map((s) => ({
    label: s.label, profile: s.profile, mode: s.mode,
    coordinateHeight: s.coordinateHeight, surfaceHeight: s.surfaceHeight,
    scrollable: s.scrollable, itemCount: s.itemCount, fullyVisibleCount: s.fullyVisibleCount,
  })),
  weather: evidence.weather.map((w) => ({ viewport: w.viewport, withinViewport: w.panel.withinViewport, rect: w.panel.rect, vertical: w.panel.vertical })),
  runtimeErrors: evidence.runtimeErrors.length,
  failedRequests: evidence.failedRequests.length,
}, null, 2))
