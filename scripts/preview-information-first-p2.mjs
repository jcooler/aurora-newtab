import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import sharp from 'sharp'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const repoRoot = process.cwd()
const dist = resolve('.preview-information-first-p2-dist')
const profileDir = resolve('.playwright-profile-information-first-p2')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/aurora-v1-canvas-implementation-session-prompt/outputs/information-first-pr-p2'
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-information-first-p2-dist'],
  [profileDir, '.playwright-profile-information-first-p2'],
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

const backgrounds = [
  { name: 'bright', index: 20, file: '25-GeReAnOMiZ8-2560x1600.avif', mean: 171.37, entropy: 6.91 },
  { name: 'dark', index: 7, file: '08-JWHSIG1kM2c-2560x1600.avif', mean: 8.77, entropy: 6.71 },
  { name: 'detailed', index: 10, file: '11-I_n_b44cqhk-2560x1600.avif', mean: 110.07, entropy: 7.82 },
]
const viewports = [
  { width: 375, height: 812 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
]

const evidence = {
  packet: 'PR-P2',
  backgrounds,
  captures: [],
  runtimeErrors: [],
  failedRequests: [],
  cleanup: {},
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1920, height: 1080 },
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
  await page.waitForFunction(() => {
    const image = document.querySelector('img[data-photo]')
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.classList.contains('opacity-100')
  })
  await page.waitForTimeout(100)
}

const parseRgb = (value) => {
  const match = value.match(/rgba?\((?:\s*)([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/)
  return match ? {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  } : null
}
const luminance = ([red, green, blue]) => {
  const linear = [red, green, blue].map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}
const contrast = (foreground, background) => {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const averagePatch = async (buffer, width, height, centerX, centerY) => {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const radius = 4
  const left = Math.max(0, Math.min(width - 1, Math.round(centerX) - radius))
  const top = Math.max(0, Math.min(height - 1, Math.round(centerY) - radius))
  const right = Math.max(left, Math.min(width - 1, Math.round(centerX) + radius))
  const bottom = Math.max(top, Math.min(height - 1, Math.round(centerY) + radius))
  const sum = [0, 0, 0]
  let count = 0
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const offset = (y * info.width + x) * info.channels
      sum[0] += data[offset]
      sum[1] += data[offset + 1]
      sum[2] += data[offset + 2]
      count += 1
    }
  }
  return sum.map((value) => Math.round(value / count))
}

const measureType = async () => page.evaluate(() => {
  const minimums = {
    standard: { clock: 48, date: 16, greeting: 32, support: 16, quote: 15, attribution: 13, body: 14, metadata: 12 },
    large: { clock: 72, date: 20, greeting: 48, support: 18, quote: 18, attribution: 16, body: 16, metadata: 14 },
  }
  const scale = document.querySelector('main[data-aurora-canvas]')?.getAttribute('data-canvas-text-scale')
  if (scale !== 'standard' && scale !== 'large') throw new Error(`unexpected Canvas text scale ${String(scale)}`)
  const values = []
  for (const role of Object.keys(minimums[scale])) {
    const nodes = [...document.querySelectorAll(`[data-canvas-type-role="${role}"]`)]
      .filter((node) => {
        const rect = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })
    if (nodes.length === 0) continue
    const node = nodes[0]
    const rect = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    const size = Number.parseFloat(style.fontSize)
    values.push({
      role,
      size,
      minimum: minimums[scale][role],
      color: style.color,
      textShadow: style.textShadow,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    })
  }
  return { scale, values }
})

const collectComposition = async () => page.evaluate(() => {
  const rect = (node) => {
    const box = node.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
  }
  const weather = document.querySelector('[data-block-id="weather"]')
  const summary = weather?.querySelector('[data-weather-summary]')
  const search = document.querySelector('[data-block-id="search"] input[type="search"]')
  const utility = [...document.querySelectorAll('.utility-tray-trigger, .chrome-tab-trigger, .settings-gear')]
  if (!(weather instanceof HTMLElement) || !(summary instanceof HTMLElement)) throw new Error('Weather composition is missing')
  if (!(search instanceof HTMLInputElement)) throw new Error('Search composition is missing')
  const weatherRect = rect(weather)
  const summaryRect = rect(summary)
  const searchRect = rect(search)
  const controlRects = utility.filter((node) => node instanceof HTMLElement).map(rect)
  const utilityStart = controlRects.length > 0 ? Math.min(...controlRects.map((box) => box.left)) : window.innerWidth
  const layer = document.querySelector('[data-canvas-legibility]')
  if (!(layer instanceof HTMLElement)) throw new Error('Canvas legibility layer is missing')
  const layerStyle = getComputedStyle(layer)
  return {
    profile: document.querySelector('main[data-aurora-canvas]')?.getAttribute('data-canvas-profile'),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    weather: {
      size: summary.getAttribute('data-weather-summary-size'),
      title: summary.querySelector('[data-weather-condition-location]')?.getAttribute('title'),
      rows: [...summary.querySelectorAll('[data-weather-summary-row]')].map((node) => node.getAttribute('data-weather-summary-row')),
      occupancy: Number((summaryRect.height / weatherRect.height).toFixed(3)),
      item: weatherRect,
      summary: summaryRect,
      disclosure: !!summary.querySelector('[data-weather-disclosure]'),
    },
    search: { box: searchRect, utilityStart, clearance: Number((utilityStart - searchRect.right).toFixed(3)), controls: controlRects },
    legibilityLayer: {
      count: document.querySelectorAll('[data-canvas-legibility]').length,
      pointerEvents: layerStyle.pointerEvents,
      backgroundImage: layerStyle.backgroundImage,
    },
  }
})

const seed = async () => page.evaluate(async () => {
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
    settings: { ...settings, name: 'Jon', widgets, layoutDensity: 'auto', briefingEnabled: true },
    focus: { text: 'Make this browser tab useful', date: '2026-08-17', done: false },
    todoLists: [{ id: 'today', name: 'Today', items: [
      { id: 'review', text: 'Review the production layout', done: false },
      { id: 'ship', text: 'Ship the extension', done: true },
    ] }],
    location,
    weatherCache: {
      current: { tempC: 28, feelsLikeC: 31, code: 0, windKmh: 11, humidity: 58, isDay: true },
      hourly: Array.from({ length: 12 }, (_, index) => ({
        time: `2026-08-17T${String(9 + index).padStart(2, '0')}:00`,
        tempC: 28 + Math.round(index / 3),
        precipProb: index === 3 ? 65 : 8,
        code: index === 3 ? 61 : 0,
        isDay: true,
      })),
      fetchedAt: now,
      locationLabel: location.label,
      requestIdentity,
      sunriseISO: '2026-08-17T07:02',
      sunsetISO: '2026-08-17T20:23',
    },
    connectors: {},
    connectorSnapshots: {},
    layout: { version: 3, profiles: {} },
    photoPrefs: { mode: 'auto', index: 20, lastRotated: '2026-08-17' },
  })
})

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main[data-aurora-canvas]')
  await seed()

  for (const background of backgrounds) {
    await page.evaluate(async ({ index }) => {
      const { photoPrefs } = await chrome.storage.local.get('photoPrefs')
      await chrome.storage.local.set({ photoPrefs: { ...photoPrefs, mode: 'auto', index, lastRotated: '2026-08-17' } })
    }, background)
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForCanvas()

      const type = await measureType()
      for (const value of type.values) {
        assert(value.size + 0.01 >= value.minimum,
          `${background.name} ${viewport.width}x${viewport.height}: ${value.role} is ${value.size}px, below ${value.minimum}px`)
      }
      const composition = await collectComposition()
      assert(!composition.overflow, `${background.name} ${viewport.width}x${viewport.height}: horizontal overflow`)
      assert(composition.weather.title?.includes(' - Atlanta'),
        `${background.name} ${viewport.width}x${viewport.height}: Weather does not identify Atlanta`)
      assert(composition.weather.disclosure,
        `${background.name} ${viewport.width}x${viewport.height}: Weather disclosure is missing`)
      assert(composition.weather.occupancy >= 0.5,
        `${background.name} ${viewport.width}x${viewport.height}: Weather occupies only ${composition.weather.occupancy}`)
      assert(composition.search.clearance >= 11.5,
        `${background.name} ${viewport.width}x${viewport.height}: Search has only ${composition.search.clearance}px control clearance`)
      assert(composition.legibilityLayer.count === 1
        && composition.legibilityLayer.pointerEvents === 'none'
        && (composition.legibilityLayer.backgroundImage.match(/gradient\(/g) ?? []).length === 4,
      `${background.name} ${viewport.width}x${viewport.height}: invalid legibility layer ${JSON.stringify(composition.legibilityLayer)}`)

      if (composition.weather.size === 'compact') {
        assert(composition.weather.rows.join(',') === 'current',
          `${background.name} ${viewport.width}x${viewport.height}: Compact Weather rows ${composition.weather.rows.join(',')}`)
      } else if (composition.weather.size === 'standard') {
        assert(composition.weather.rows.join(',') === 'current,trend,metrics',
          `${background.name} ${viewport.width}x${viewport.height}: Standard Weather rows ${composition.weather.rows.join(',')}`)
      } else if (composition.weather.size === 'full') {
        assert(composition.weather.rows.join(',') === 'current,trend,metrics,hourly',
          `${background.name} ${viewport.width}x${viewport.height}: Full Weather rows ${composition.weather.rows.join(',')}`)
      } else {
        throw new Error(`${background.name} ${viewport.width}x${viewport.height}: unexpected Weather size ${composition.weather.size}`)
      }

      const screenshotPath = `${outDir}/pr-p2-${background.name}-${viewport.width}x${viewport.height}.png`
      const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false })
      await page.evaluate(() => {
        for (const node of document.querySelectorAll('[data-canvas-type-role]')) {
          if (node instanceof HTMLElement) node.dataset.qaVisibility = node.style.visibility
          if (node instanceof HTMLElement) node.style.visibility = 'hidden'
        }
      })
      const backgroundOnly = await page.screenshot({ fullPage: false })
      await page.evaluate(() => {
        for (const node of document.querySelectorAll('[data-canvas-type-role]')) {
          if (!(node instanceof HTMLElement)) continue
          node.style.visibility = node.dataset.qaVisibility ?? ''
          delete node.dataset.qaVisibility
        }
      })
      const contrastSamples = []
      for (const value of type.values) {
        const foreground = parseRgb(value.color)
        if (!foreground) continue
        const backgroundRgb = await averagePatch(
          backgroundOnly,
          viewport.width,
          viewport.height,
          value.rect.left + value.rect.width / 2,
          value.rect.top + value.rect.height / 2,
        )
        const paintedForeground = foreground.rgb.map((channel, index) => Math.round(
          channel * foreground.alpha + backgroundRgb[index] * (1 - foreground.alpha),
        ))
        contrastSamples.push({
          role: value.role,
          foreground: foreground.rgb,
          alpha: foreground.alpha,
          paintedForeground,
          background: backgroundRgb,
          ratio: Number(contrast(paintedForeground, backgroundRgb).toFixed(2)),
          textShadow: value.textShadow,
        })
      }
      for (const sample of contrastSamples) {
        const minimum = sample.role === 'clock' || sample.role === 'greeting' ? 3 : 4.5
        assert(sample.ratio >= minimum,
          `${background.name} ${viewport.width}x${viewport.height}: ${sample.role} contrast ${sample.ratio}:1 is below ${minimum}:1`)
      }

      evidence.captures.push({
        background: background.name,
        viewport,
        screenshotPath,
        type,
        composition,
        contrastSamples,
        screenshotBytes: screenshot.byteLength,
      })
    }
  }

  assert(evidence.runtimeErrors.length === 0, `runtime errors: ${evidence.runtimeErrors.join('; ')}`)
  assert(evidence.failedRequests.length === 0, `failed requests: ${evidence.failedRequests.join('; ')}`)
} catch (error) {
  caughtError = error
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/pr-p2-failure.png`, fullPage: false }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true }).catch(() => {})
  await context.close().then(() => { evidence.cleanup.contextClosed = true }).catch(() => {})
  rmSync(profileDir, { recursive: true, force: true })
  rmSync(dist, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
  evidence.cleanup.distRemoved = true
  writeFileSync(`${outDir}/pr-p2-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`)
}

console.log(`EVIDENCE: ${JSON.stringify(evidence)}`)
if (caughtError) {
  console.error(`FAIL: information-first PR-P2 browser proof: ${evidence.error}`)
  process.exitCode = 1
} else {
  console.log('PASS: information-first PR-P2 browser proof')
}
