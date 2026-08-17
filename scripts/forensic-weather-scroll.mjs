// Weather expansion in the compact tall-document state: expand mid-document,
// then scroll while open, and measure the panel against the visual viewport.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('.preview-forensic-dist')
const profileDir = resolve('.playwright-profile-forensic-weather')
const outDir = resolve('.forensic-short-height-out')
if (!profileDir.endsWith('.playwright-profile-forensic-weather')) throw new Error('unsafe path')
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const evidence = { steps: [], runtimeErrors: [] }
const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1408, height: 445 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(15_000)
page.on('pageerror', (e) => evidence.runtimeErrors.push(String(e)))

const measure = (label) => page.evaluate((label) => {
  const p = document.querySelector('[data-weather-details]')
  if (!p) return { label, panel: null }
  const r = p.getBoundingClientRect()
  const style = getComputedStyle(p)
  const clippedRows = (() => {
    const first = p.querySelector('[data-canvas-type-role="metadata"]')
    return first ? first.getBoundingClientRect().top < r.top : null
  })()
  return {
    label,
    scrollY: window.scrollY,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    clientWidth: document.documentElement.clientWidth,
    panel: {
      top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom),
      height: Math.round(r.height), width: Math.round(r.width),
      maxHeight: style.maxHeight,
      scrollHeight: p.scrollHeight, clientHeight: p.clientHeight,
      internalScroll: p.scrollHeight > p.clientHeight + 1,
      overflowsRight: r.right > document.documentElement.clientWidth,
      outsideViewport: r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth,
      hiddenContentPx: Math.max(0, p.scrollHeight - p.clientHeight),
    },
  }
}, label)

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-canvas-surface]')
  // Owner-shaped state: many widgets on, compact document, weather mid-page.
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    for (const key of ['search', 'weather', 'todo', 'timer', 'quote', 'bookmarks', 'notes', 'monthCal', 'sun']) {
      if (key in widgets) widgets[key] = true
    }
    const location = { lat: 32.7767, lon: -96.797, label: 'Dallas', manual: true }
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
    params.set('latitude', '32.7767')
    params.set('longitude', '-96.797')
    const requestIdentity = `open-meteo:v1:https://api.open-meteo.com/v1/forecast?${params.toString()}`
    const now = Date.now()
    const day = new Date(now).toISOString().slice(0, 10)
    await chrome.storage.local.set({
      settings: { ...settings, widgets },
      location,
      weatherCache: {
        current: { tempC: 35.6, feelsLikeC: 33.3, code: 0, windKmh: 11, humidity: 66, isDay: true },
        hourly: Array.from({ length: 12 }, (_, index) => ({
          time: `${day}T${String((9 + index) % 24).padStart(2, '0')}:00`,
          tempC: 28 + index,
          precipProb: 0,
          code: 0,
          isDay: index < 10,
        })),
        fetchedAt: now,
        locationLabel: location.label,
        requestIdentity,
        sunriseISO: `${day}T07:02`,
        sunsetISO: `${day}T20:23`,
      },
    })
    await chrome.storage.local.remove('layout')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(500)

  const trigger = page.locator('[data-block-id="weather"] button[aria-expanded]').first()
  await trigger.waitFor({ state: 'visible' })
  await trigger.click()
  await page.waitForSelector('[data-weather-details]')
  await page.waitForTimeout(300)
  evidence.steps.push(await measure('expanded-at-top'))
  await page.screenshot({ path: resolve(outDir, 'weather-doc-expanded.png') })

  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(300)
  evidence.steps.push(await measure('after-scroll-300'))
  await page.screenshot({ path: resolve(outDir, 'weather-doc-scrolled.png') })
} catch (error) {
  caughtError = error
} finally {
  try { await context.close() } catch { /* ignore */ }
}
writeFileSync(resolve(outDir, 'weather-scroll-evidence.json'), JSON.stringify(evidence, null, 2))
if (caughtError) { console.error('ERROR:', caughtError); process.exitCode = 1 }
console.log(JSON.stringify(evidence, null, 2))
