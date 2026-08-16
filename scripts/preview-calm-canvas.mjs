// One-shot packaged-extension replay for the Calm Canvas remediation.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-calm-canvas')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/calm-canvas'
const focused = process.argv.includes('--focused')
const headed = process.argv.includes('--headed')
const nowMs = new Date(2026, 7, 16, 12, 0).getTime()

if (!profileDir.endsWith('.playwright-profile-calm-canvas')) throw new Error(`unsafe profile path: ${profileDir}`)
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const runtimeErrors = []
const failedRequests = []
const evidence = { mode: focused ? 'focused' : 'complete', captures: [], runtimeErrors, failedRequests, cleanup: {} }

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(10_000)
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`))

const waitForStage = async () => {
  await page.waitForSelector('main[data-adaptive-stage]')
  await page.waitForTimeout(220)
}

const seedDense = () => page.evaluate(async (fixedNow) => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, true]))
  widgets.bookmarks = false
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
  const connectors = {
    ics: {
      enabled: true,
      calendars: [{ name: 'Work', url: 'https://calendar.example.test/private.ics' }],
      view: 'today', upcomingCount: 3, meetLinks: true,
    },
    status: {
      enabled: true,
      services: [{ name: 'Aurora API', url: 'https://status.example.test/api/v2/status.json' }],
    },
    github: {
      enabled: true, token: 'fixture-github-token', username: 'aurora-fixture',
      views: { commitGraph: false, pulls: true, issues: true, notifications: true },
    },
    gitlab: {
      enabled: true, token: 'fixture-gitlab-token', instanceUrl: 'https://gitlab.example.test', username: 'aurora-fixture',
      views: { mergeRequests: true, reviewAsks: false, todos: true, activityGraph: false },
    },
    jira: {
      enabled: true, email: 'fixture@example.test', apiToken: 'fixture-jira-token',
      site: 'aurora.atlassian.net', displayName: 'Aurora Fixture',
      views: { assigned: true, statusChips: true, dueSoon: false },
    },
    vercel: {
      enabled: true, token: 'fixture-vercel-token', username: 'aurora-fixture',
      views: { deployments: true, statusSummary: true },
    },
    homeassistant: {
      enabled: true, instanceUrl: 'https://ha.example.test', token: 'fixture-ha-token',
      entities: [{ id: 'sensor.office', name: 'Office' }],
      actions: [{ id: 'scene.focus', name: 'Focus mode', domain: 'scene' }],
    },
    rss: { enabled: true, feeds: ['https://news.example.test/feed.xml'], shownCount: 3 },
    crypto: { enabled: true, coins: ['bitcoin', 'ethereum'] },
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const connectorSnapshots = {
    ics: {
      scope: await scopeOf('ics', connectors.ics, { timeZone }), fetchedAt: fixedNow,
      data: { events: [{ summary: 'Calm Canvas review', start: fixedNow + 3_600_000, end: fixedNow + 5_400_000, cal: 0, allDay: false }] },
    },
    status: {
      scope: await scopeOf('status', connectors.status), fetchedAt: fixedNow,
      data: { services: [{ name: 'Aurora API', indicator: 'none', description: 'All systems operational' }] },
    },
    github: {
      scope: await scopeOf('github', connectors.github), fetchedAt: fixedNow,
      data: {
        prs: [{ title: 'Review Calm Canvas', url: 'https://github.com/aurora/newtab/pull/44', repo: 'aurora/newtab' }],
        issues: [], notifications: 2, contributions: null, etags: {},
      },
    },
    gitlab: {
      scope: await scopeOf('gitlab', connectors.gitlab), fetchedAt: fixedNow,
      data: {
        mrs: [{ title: 'Ship visual reset', url: 'https://gitlab.example.test/aurora/newtab/-/merge_requests/8', project: 'aurora/newtab' }],
        reviewMrs: [], todos: 1, contributions: null,
      },
    },
    jira: {
      scope: await scopeOf('jira', connectors.jira), fetchedAt: fixedNow,
      data: {
        issues: [{ key: 'AUR-44', summary: 'Verify Calm Canvas', status: 'In Progress', url: 'https://aurora.atlassian.net/browse/AUR-44' }],
        counts: { 'In Progress': 1 }, dueSoon: [],
      },
    },
    vercel: {
      scope: await scopeOf('vercel', connectors.vercel), fetchedAt: fixedNow,
      data: { deployments: [{ project: 'aurora-newtab', state: 'READY', url: 'https://vercel.com/aurora/deployment-44', createdAt: fixedNow - 60_000 }] },
    },
    homeassistant: {
      scope: await scopeOf('homeassistant', connectors.homeassistant), fetchedAt: fixedNow,
      data: { entities: [{ id: 'sensor.office', state: '72', unit: 'Â°F', friendlyName: 'Office', domain: 'sensor' }] },
    },
    rss: {
      scope: await scopeOf('rss', connectors.rss), fetchedAt: fixedNow,
      data: [{ source: 'Aurora News', title: 'Calm Canvas is ready', url: 'https://news.example.test/story', publishedAt: fixedNow }],
    },
    crypto: {
      scope: await scopeOf('crypto', connectors.crypto), fetchedAt: fixedNow,
      data: { coins: [
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 67_412, change24h: 2.4 },
        { id: 'ethereum', symbol: 'eth', name: 'Ethereum', price: 3_245, change24h: -1.2 },
      ] },
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
    hourly: Array.from({ length: 12 }, (_, index) => ({
      time: `2026-08-16T${String(12 + index).padStart(2, '0')}:00`,
      tempC: 20 + index, precipProb: index === 3 ? 60 : 10, code: 2, isDay: index < 8,
    })),
    fetchedAt: fixedNow,
    locationLabel: 'New York',
    requestIdentity: `open-meteo:v1:https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`,
    sunriseISO: '2026-08-16T06:12', sunsetISO: '2026-08-16T19:58',
  }
  await chrome.storage.local.set({
    settings: { ...settings, name: 'Jon', widgets, layoutDensity: 'balanced' },
    layout: { version: 2, profiles: {} },
    links: [
      { id: 'calm-1', title: 'Roadmap', url: 'https://roadmap.example.test' },
      { id: 'calm-2', title: 'GitHub', url: 'https://github.example.test' },
      { id: 'calm-3', title: 'Notes', url: 'https://notes.example.test' },
    ],
    worldClocks: [
      { zone: 'America/New_York', label: 'New York' },
      { zone: 'Europe/London', label: 'London' },
    ],
    countdowns: [{ id: 'launch', name: 'Launch', date: '2026-09-01' }],
    habits: [
      { id: 'read', name: 'Read', createdAt: fixedNow - 1, log: [] },
      { id: 'walk', name: 'Walk', createdAt: fixedNow, log: ['2026-08-16'] },
    ],
    connectors,
    connectorSnapshots,
    location,
    weatherCache,
  })
}, nowMs)

const measure = (label) => page.evaluate((captureLabel) => {
  const rect = (node) => {
    if (!(node instanceof HTMLElement) || !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null
    const value = node.getBoundingClientRect()
    if (value.width <= 0 || value.height <= 0) return null
    return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height }
  }
  const zones = Object.fromEntries(['day', 'now', 'pulse', 'dock'].map((zone) => {
    const node = document.querySelector(`[data-stage-zone-container="${zone}"]`)
    const zoneRect = rect(node)
    const children = node instanceof HTMLElement
      ? [...node.querySelectorAll('[data-block-id], [data-day-context], [data-launcher-shelf]')]
        .map(rect).filter(Boolean)
      : []
    const blocks = node instanceof HTMLElement
      ? [...node.querySelectorAll('[data-block-id]')].map((block) => ({
          id: block.getAttribute('data-block-id'),
          rect: rect(block),
          text: block.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          childElementCount: block.childElementCount,
          display: getComputedStyle(block).display,
        }))
      : []
    return [zone, {
      rect: zoneRect,
      children,
      blocks,
      gridTemplateRows: node instanceof HTMLElement ? getComputedStyle(node).gridTemplateRows : '',
    }]
  }))
  const clock = rect(document.querySelector('[data-block-id="clock"]'))
  const allIds = [...document.querySelectorAll('[data-block-id]')].map((node) => node.getAttribute('data-block-id'))
  const duplicateIds = [...new Set(allIds.filter((id, index) => allIds.indexOf(id) !== index))]
  const launcherLabels = [...document.querySelectorAll('[data-block-id="links"] > section > div > span')].map((label) => ({
    text: label.textContent?.trim() ?? '',
    clientWidth: label instanceof HTMLElement ? label.clientWidth : 0,
    scrollWidth: label instanceof HTMLElement ? label.scrollWidth : 0,
  }))
  const root = document.documentElement
  const body = document.body
  return {
    label: captureLabel,
    viewport: { width: innerWidth, height: innerHeight },
    profile: root.dataset.stageProfile,
    inset: Number.parseFloat(getComputedStyle(root).getPropertyValue('--stage-inset')),
    gap: Number.parseFloat(getComputedStyle(root).getPropertyValue('--stage-gap')),
    clock,
    search: rect(document.querySelector('input[aria-label="Search the web"]')),
    dockQuote: rect(document.querySelector('[data-stage-zone="dock"][data-block-id="quote"]')),
    launcherLabels,
    zones,
    allIds,
    duplicateIds,
    documentOverflowX: root.scrollWidth > root.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
  }
}, label)

function assertComposition(result) {
  const { clock, zones, viewport, inset } = result
  assert(clock, `${result.label}: Clock is missing`)
  assert(Math.abs((clock.left + clock.width / 2) - viewport.width / 2) <= 2,
    `${result.label}: Clock is not viewport-centered: ${JSON.stringify(result)}`)
  for (const zone of ['day', 'pulse']) {
    const surface = zones[zone].rect
    const children = zones[zone].children
    if (children.length === 0) {
      assert(!surface || surface.height <= 2, `${result.label}: empty ${zone} surface is painted: ${JSON.stringify(surface)}`)
      continue
    }
    assert(surface, `${result.label}: ${zone} surface is missing`)
    const childBottom = Math.max(...children.map((child) => child.bottom))
    assert(surface.bottom <= childBottom + inset + 2,
      `${result.label}: ${zone} paints below its content: ${JSON.stringify({ surface, childBottom, inset })}`)
  }
  const dock = zones.dock.rect
  const dockChildren = zones.dock.children
  assert(dock, `${result.label}: Dock is missing`)
  if (dockChildren.length > 0) {
    const childLeft = Math.min(...dockChildren.map((child) => child.left))
    const childRight = Math.max(...dockChildren.map((child) => child.right))
    assert(dock.width <= childRight - childLeft + inset * 2 + 2,
      `${result.label}: Dock paints beyond its content: ${JSON.stringify({ dock, childLeft, childRight, inset })}`)
  }
  for (const zone of ['day', 'now', 'pulse']) {
    const surface = zones[zone].rect
    if (surface && dock && surface.bottom > dock.top + 1) {
      throw new Error(`${result.label}: ${zone} overlaps Dock: ${JSON.stringify({ surface, dock })}`)
    }
  }
  assert(!result.documentOverflowX, `${result.label}: document-level horizontal overflow`)
  assert(result.duplicateIds.length === 0, `${result.label}: duplicate registry identities ${result.duplicateIds.join(', ')}`)
  assert(!result.search || result.search.width <= 513,
    `${result.label}: Search is not restrained: ${JSON.stringify(result.search)}`)
  assert(result.launcherLabels.every((label) => label.scrollWidth <= label.clientWidth + 1),
    `${result.label}: launcher label truncation: ${JSON.stringify(result.launcherLabels)}`)
  assert(!result.dockQuote || result.dockQuote.width >= 223,
    `${result.label}: Dock quote is unreadably narrow: ${JSON.stringify(result.dockQuote)}`)
}

async function capture(label, viewport, file) {
  await page.setViewportSize(viewport)
  await page.reload()
  await waitForStage()
  const result = await measure(label)
  const path = `${outDir}/${file}`
  await page.screenshot({ path })
  assertComposition(result)
  evidence.captures.push({ ...result, path })
}

try {
  await page.clock.setFixedTime(nowMs)
  await page.goto('chrome://newtab/')
  await waitForStage()
  await capture('sparse Standard 1600x900', { width: 1600, height: 900 }, 'focused-sparse-1600x900.png')
  await seedDense()
  await capture('owner-like dense 2012x1397', { width: 2012, height: 1397 }, 'focused-dense-2012x1397.png')
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
  assert(failedRequests.length === 0, `failed requests: ${failedRequests.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/focused-failure.png` }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
  writeFileSync(`${outDir}/focused-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`)
}

if (evidence.error) throw new Error(evidence.error)
console.log('PASS: Calm Canvas focused composition')
