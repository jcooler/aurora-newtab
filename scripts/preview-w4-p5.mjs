// Focused W4-P5 built-extension replay for launcher and content variants.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w4-p5')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w4-p5'
const touchedKeys = ['settings', 'layout', 'links', 'connectors', 'connectorSnapshots', 'location', 'weatherCache']
const nowMs = new Date(2026, 7, 16, 12, 0).getTime()
const headed = process.argv.includes('--headed')

if (!profileDir.endsWith('.playwright-profile-w4-p5')) throw new Error(`unsafe profile path: ${profileDir}`)
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  return value
}
const exact = (actual, wanted) => JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(wanted))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 800, height: 600 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
let originalPreimage
let fixtureFolderId
let captureErrors = false
const runtimeErrors = []
const externalRequests = []
page.on('console', (message) => {
  if (captureErrors && message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => {
  if (captureErrors) runtimeErrors.push(`page: ${String(error)}`)
})
page.on('request', (request) => {
  if (captureErrors && /^https?:/.test(request.url())) externalRequests.push(request.url())
})

const seed = async () => page.evaluate(async (fixedNow) => {
  const { settings } = await chrome.storage.local.get('settings')
  const canonical = (input) => {
    if (input === null) return 'null'
    if (typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number') return JSON.stringify(input)
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`
    return `{${Object.keys(input).filter((key) => input[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(input[key])}`).join(',')}}`
  }
  const scopeOf = async (id, config, runtimeScope) => {
    const identity = runtimeScope === undefined
      ? `${id}\n${canonical(config)}`
      : `${id}\n${canonical(config)}\n${canonical(runtimeScope)}`
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${id}:${id === 'ics' || id === 'homeassistant' ? 'v2' : 'v1'}:${hex}`
  }
  const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
  Object.assign(widgets, { weather: true, links: true, bookmarks: true })
  const links = [
    { id: 'w4p5-1', title: 'Aurora', url: 'https://aurora.example.test' },
    { id: 'w4p5-2', title: 'Docs', url: 'https://docs.example.test' },
    { id: 'w4p5-3', title: 'Status', url: 'https://status.example.test' },
  ]
  const ics = {
    enabled: true,
    calendars: [{ name: 'Work', url: 'https://calendar.example.test/private.ics' }],
    view: 'today', upcomingCount: 4, meetLinks: true,
  }
  const rss = { enabled: true, feeds: ['https://news.example.test/feed.xml'], shownCount: 8 }
  const homeassistant = {
    enabled: true,
    instanceUrl: 'https://ha.example.test', token: 'fixture-ha-token',
    entities: Array.from({ length: 6 }, (_, i) => ({ id: `sensor.room_${i + 1}`, name: `Room ${i + 1}` })),
    actions: Array.from({ length: 3 }, (_, i) => ({ id: `scene.mode_${i + 1}`, name: `Mode ${i + 1}`, domain: 'scene' })),
  }
  const connectors = { ics, rss, homeassistant }
  const events = Array.from({ length: 6 }, (_, i) => ({
    summary: ['Standup', 'Design review', 'Planning', 'Wrap-up', 'Dinner', 'Read'][i],
    start: fixedNow + (i + 1) * 3_600_000,
    end: fixedNow + (i + 1) * 3_600_000 + 1_800_000,
    cal: 0,
    allDay: false,
  }))
  const connectorSnapshots = {
    ics: {
      scope: await scopeOf('ics', ics, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      fetchedAt: fixedNow,
      data: { events },
    },
    rss: {
      scope: await scopeOf('rss', rss), fetchedAt: fixedNow,
      data: Array.from({ length: 8 }, (_, i) => ({
        source: `Source ${i + 1}`, title: `Priority headline ${i + 1}`,
        url: `https://news.example.test/story-${i + 1}`, publishedAt: fixedNow - i * 60_000,
      })),
    },
    homeassistant: {
      scope: await scopeOf('homeassistant', homeassistant), fetchedAt: fixedNow,
      data: { entities: Array.from({ length: 6 }, (_, i) => ({
        id: `sensor.room_${i + 1}`, friendlyName: `Room ${i + 1}`,
        state: String(70 + i), unit: '°F', domain: 'sensor',
      })) },
    },
  }
  const placement = (zone, order, variant, colSpan, rowSpan, priority = 'pinned') => ({
    zone, order, variant, colSpan, rowSpan, priority,
  })
  const layout = {
    version: 2,
    profiles: {
      compact: {
        weather: placement('day', 0, 'compact', 1, 1),
        ics: placement('day', 1, 'compact', 1, 1),
        homeassistant: placement('pulse', 0, 'compact', 1, 1),
        rss: placement('pulse', 1, 'compact', 1, 1),
      },
      standard: {
        weather: placement('day', 0, 'standard', 2, 2),
        ics: placement('day', 1, 'standard', 2, 2),
        homeassistant: placement('pulse', 0, 'standard', 2, 2),
        rss: placement('pulse', 1, 'standard', 2, 2),
        links: placement('now', 6, 'compact', 1, 1, 'automatic'),
        bookmarks: placement('now', 7, 'compact', 1, 1, 'automatic'),
      },
      display: {
        weather: placement('day', 0, 'expanded', 3, 2),
        ics: placement('day', 1, 'expanded', 3, 2),
        homeassistant: placement('pulse', 0, 'expanded', 3, 2),
        rss: placement('pulse', 1, 'expanded', 3, 2),
        links: placement('now', 6, 'standard', 2, 1, 'automatic'),
        bookmarks: placement('now', 7, 'standard', 2, 1, 'automatic'),
      },
      ultrawide: {},
    },
  }
  const location = { lat: 40.71, lon: -74.01, label: 'New York', manual: true }
  const weatherParams = new URLSearchParams({
    temperature_unit: 'celsius', wind_speed_unit: 'kmh', forecast_hours: '12', forecast_days: '1',
    timezone: 'auto', timeformat: 'iso8601',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day', daily: 'sunrise,sunset',
    latitude: String(location.lat), longitude: String(location.lon),
  })
  const weatherCache = {
    current: { tempC: 21, feelsLikeC: 19, code: 2, windKmh: 14, humidity: 55, isDay: true },
    hourly: Array.from({ length: 12 }, (_, i) => ({
      time: `2026-08-16T${String(12 + i).padStart(2, '0')}:00`, tempC: 20 + i,
      precipProb: i === 3 ? 60 : 10, code: 2, isDay: i < 8,
    })),
    fetchedAt: fixedNow,
    locationLabel: 'New York',
    requestIdentity: `open-meteo:v1:https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`,
    sunriseISO: '2026-08-16T06:12', sunsetISO: '2026-08-16T19:58',
  }
  await chrome.storage.local.set({
    settings: { ...settings, widgets, layoutDensity: 'auto' },
    layout, links, connectors, connectorSnapshots, location, weatherCache,
  })
}, nowMs)

const observe = () => page.evaluate(() => {
  const count = (selector) => document.querySelectorAll(selector).length
  const launcher = document.querySelector('[data-launcher-shelf]')
  const launcherLinks = [...document.querySelectorAll('[data-launcher-shelf] a[href]')]
  const launcherRect = launcher?.getBoundingClientRect()
  const launcherControls = launcher ? [...launcher.querySelectorAll('a, button')] : []
  const stage = document.querySelector('main[data-adaptive-stage]')
  return {
    profile: document.documentElement.dataset.stageProfile,
    density: document.documentElement.dataset.stageDensity,
    shelfCount: count('[data-launcher-shelf]'),
    shelfHeight: launcherRect?.height ?? 0,
    shelfControlsContained: !!launcherRect && launcherControls.every((control) => {
      if (!control.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return true
      const rect = control.getBoundingClientRect()
      return rect.left >= launcherRect.left - 1 && rect.right <= launcherRect.right + 1
        && rect.top >= launcherRect.top - 1 && rect.bottom <= launcherRect.bottom + 1
    }),
    shelfIds: launcher ? [...launcher.querySelectorAll('[data-block-id]')].map((node) => node.getAttribute('data-block-id')) : [],
    exactIds: Object.fromEntries(['links', 'bookmarks', 'weather', 'ics', 'homeassistant', 'rss'].map((id) => [id, count(`[data-block-id="${id}"]`)])),
    variants: Object.fromEntries(['weather', 'ics', 'homeassistant', 'rss'].map((id) => [id, document.querySelector(`[data-block-id="${id}"]`)?.getAttribute('data-stage-variant')])),
    calendarRows: count('section[aria-label="Calendar"] li'),
    rssRows: count('section[aria-label="Headlines"] li'),
    haStates: count('section[aria-label="Home Assistant"] li'),
    haActions: count('section[aria-label="Home Assistant"] button[aria-label^="Run "]'),
    weatherTrend: !![...document.querySelectorAll('span')].find((node) => node.textContent?.trim() === 'Next 12 hours'),
    bookmarksVisible: !!document.querySelector('nav[aria-label="Bookmarks bar"]'),
    launcherSchemesSafe: launcherLinks.every((link) => {
      try { return new URL(link.href).protocol === 'https:' } catch { return false }
    }),
    noPageClip: document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1,
    stageFits: stage?.getAttribute('data-stage-geometry-fits') === 'true',
  }
})

const capture = async ({ width, height, file }) => {
  await page.setViewportSize({ width, height })
  await page.reload()
  await page.waitForSelector('main[data-adaptive-stage]')
  await page.waitForFunction(() => ['weather', 'ics', 'homeassistant', 'rss'].every((id) => document.querySelector(`[data-block-id="${id}"]`)))
  await page.waitForTimeout(200)
  const result = await observe()
  await page.screenshot({ path: `${outDir}/${file}` })
  return result
}

const evidence = { captures: {}, interaction: {}, cleanup: {} }
try {
  await page.clock.setFixedTime(nowMs)
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')
  originalPreimage = await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys)
  fixtureFolderId = await page.evaluate(async () => {
    const folder = await chrome.bookmarks.create({ parentId: '1', title: 'W4-P5 launchers' })
    await chrome.bookmarks.create({ parentId: folder.id, title: 'Aurora roadmap', url: 'https://roadmap.example.test' })
    await chrome.bookmarks.create({ parentId: folder.id, title: 'Delivery notes', url: 'https://notes.example.test' })
    return folder.id
  })
  captureErrors = true
  await seed()

  evidence.captures.compact = await capture({ width: 800, height: 600, file: 'w4-p5-compact-800x600.png' })
  evidence.captures.standard = await capture({ width: 1600, height: 900, file: 'w4-p5-standard-1600x900.png' })
  evidence.captures.display = await capture({ width: 2560, height: 1440, file: 'w4-p5-display-2560x1440.png' })

  const expected = {
    compact: { profile: 'compact', variants: 'compact', calendarRows: 0, rssRows: 2, haStates: 2, haActions: 0, weatherTrend: false },
    standard: { profile: 'standard', variants: 'standard', calendarRows: 2, rssRows: 6, haStates: 4, haActions: 2, weatherTrend: false },
    display: { profile: 'display', variants: 'expanded', calendarRows: 5, rssRows: 8, haStates: 6, haActions: 3, weatherTrend: true },
  }
  for (const [name, result] of Object.entries(evidence.captures)) {
    const wanted = expected[name]
    assert(result.profile === wanted.profile, `${name}: wrong profile ${result.profile}`)
    assert(Object.values(result.exactIds).every((value) => value === 1), `${name}: active ID duplication/loss`)
    assert(Object.values(result.variants).every((value) => value === wanted.variants), `${name}: wrong content variant ${JSON.stringify(result.variants)}`)
    assert(result.calendarRows === wanted.calendarRows && result.rssRows === wanted.rssRows, `${name}: calendar/RSS budget failed`)
    assert(result.haStates === wanted.haStates && result.haActions === wanted.haActions, `${name}: HA budget failed`)
    assert(result.weatherTrend === wanted.weatherTrend, `${name}: weather progression failed`)
    assert(result.launcherSchemesSafe && result.noPageClip && result.stageFits, `${name}: safety/geometry failed`)
  }
  for (const name of ['standard', 'display']) {
    const result = evidence.captures[name]
    assert(result.shelfCount === 1 && exact(result.shelfIds.sort(), ['bookmarks', 'links']), `${name}: launcher shelf did not consolidate exact IDs`)
    assert(result.shelfHeight <= 225 && result.shelfControlsContained, `${name}: launcher shelf is oversized or clips visible controls (${result.shelfHeight}px)`)
    assert(result.bookmarksVisible, `${name}: preview bookmarks permission/content missing`)
  }

  await page.setViewportSize({ width: 1600, height: 900 })
  await page.reload()
  const add = page.getByRole('button', { name: 'Add quick link' })
  await add.focus()
  await page.keyboard.press('Enter')
  await page.waitForSelector('input[aria-label="Link URL"]')
  await page.keyboard.press('Escape')
  evidence.interaction = {
    focusRestored: await add.evaluate((button) => document.activeElement === button),
    shelfCount: await page.locator('[data-launcher-shelf]').count(),
  }
  assert(evidence.interaction.focusRestored && evidence.interaction.shelfCount === 1, 'launcher keyboard operation/focus restoration failed')
  assert(externalRequests.length === 0, `presentation caused request(s): ${externalRequests.join(', ')}`)
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
} finally {
  captureErrors = false
  try {
    if (fixtureFolderId) await page.evaluate((id) => chrome.bookmarks.removeTree(id), fixtureFolderId)
    if (originalPreimage) {
      await page.evaluate(async ({ keys, snapshot }) => {
        const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(snapshot, key))
        if (missing.length > 0) await chrome.storage.local.remove(missing)
        if (Object.keys(snapshot).length > 0) await chrome.storage.local.set(snapshot)
      }, { keys: touchedKeys, snapshot: originalPreimage })
      evidence.cleanup.restored = exact(await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys), originalPreimage)
    }
  } catch (error) {
    evidence.cleanup.error = error instanceof Error ? error.message : String(error)
  }
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
}

console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, externalRequests, runtimeErrors })}`)
if (evidence.error || !evidence.cleanup.restored || !evidence.cleanup.pageClosed) {
  console.error(`FAIL: W4-P5 launcher/content variants: ${evidence.error ?? 'cleanup failure'}`)
  process.exitCode = 1
} else {
  console.log('PASS: W4-P5 launcher/content variants')
}
