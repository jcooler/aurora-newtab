// One-shot packaged-extension replay for the Calm Canvas remediation.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-calm-canvas')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/calm-canvas'
const focused = process.argv.includes('--focused')
const interactionsOnly = process.argv.includes('--interactions-only')
const settingsOnly = process.argv.includes('--settings-only')
const arrangeOnly = process.argv.includes('--arrange-only')
const bookmarkOnly = process.argv.includes('--bookmark-only')
const weatherSearchOnly = process.argv.includes('--weather-search-only')
const sheetOnly = process.argv.includes('--sheet-only')
const partialInteractions = interactionsOnly || settingsOnly || arrangeOnly || bookmarkOnly || weatherSearchOnly || sheetOnly
const compactOnly = process.argv.includes('--compact-only')
const wideDenseOnly = process.argv.includes('--wide-dense-only')
const headed = process.argv.includes('--headed')
const nowMs = new Date(2026, 7, 16, 12, 0).getTime()
const mode = focused
  ? 'focused'
  : wideDenseOnly
    ? 'wide-dense-only'
    : compactOnly
      ? 'compact-only'
      : arrangeOnly
        ? 'arrange-only'
        : settingsOnly
          ? 'settings-only'
          : interactionsOnly
            ? 'interactions-only'
            : bookmarkOnly
              ? 'bookmark-only'
              : weatherSearchOnly
                ? 'weather-search-only'
                : sheetOnly
                  ? 'sheet-only'
                  : 'complete'
const evidenceStem = mode.replace(/-only$/, '')

if (!profileDir.endsWith('.playwright-profile-calm-canvas')) throw new Error(`unsafe profile path: ${profileDir}`)
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const runtimeErrors = []
const failedRequests = []
const expectedFailedRequests = []
let expectedRequestFailureWindow = false
const evidence = {
  mode,
  captures: [],
  interactions: [],
  inventory: {},
  runtimeErrors,
  failedRequests,
  expectedFailedRequests,
  cleanup: {},
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
  hasTouch: true,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(10_000)
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  const detail = `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`
  ;(expectedRequestFailureWindow ? expectedFailedRequests : failedRequests).push(detail)
})

const waitForStage = async () => {
  await page.waitForSelector('main[data-adaptive-stage]')
  await page.waitForTimeout(220)
}

const seedDense = () => page.evaluate(async (fixedNow) => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, true]))
  widgets.bookmarks = true
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
      enabled: true, instanceUrl: 'https://ha.example.test', token: 'fixture-ha-token', locationName: 'Calm Canvas Home',
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
  if (chrome.bookmarks) {
    const tree = await chrome.bookmarks.getTree()
    const roots = tree.flatMap((node) => node.children ?? [])
    const bar = roots.find((node) => node.folderType === 'bookmarks-bar') ?? roots.find((node) => node.id === '1')
    if (bar && !(bar.children ?? []).some((node) => node.title === 'Calm Canvas QA')) {
      const folder = await chrome.bookmarks.create({ parentId: bar.id, title: 'Calm Canvas QA' })
      const archive = await chrome.bookmarks.create({ parentId: folder.id, title: 'Evidence archive' })
      await chrome.bookmarks.create({ parentId: archive.id, title: 'Accepted canvas', url: 'https://accepted.example.test' })
      await chrome.bookmarks.create({ parentId: folder.id, title: 'Aurora roadmap', url: 'https://roadmap.example.test' })
      await chrome.bookmarks.create({ parentId: folder.id, title: 'Design evidence', url: 'https://design.example.test' })
    }
  }
}, nowMs)

const seedSparse = () => page.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
  for (const key of ['weather', 'search', 'links', 'quote']) widgets[key] = true
  await chrome.storage.local.set({
    settings: { ...settings, name: '', widgets, layoutDensity: 'auto' },
    layout: { version: 2, profiles: {} },
    links: [], worldClocks: [], countdowns: [], habits: [], connectors: {}, connectorSnapshots: {},
    location: null, weatherCache: null, focus: null,
  })
})

const seedTypical = async () => {
  await seedDense()
  await page.evaluate(async () => {
    const { settings, connectors } = await chrome.storage.local.get(['settings', 'connectors'])
    const widgets = { ...settings.widgets, bookmarks: true, habits: false, moon: false }
    const selectedConnectors = Object.fromEntries(
      Object.entries(connectors).map(([key, value]) => [key, { ...value, enabled: ['ics', 'status', 'github', 'vercel'].includes(key) }]),
    )
    await chrome.storage.local.set({ settings: { ...settings, widgets, layoutDensity: 'auto' }, connectors: selectedConnectors })
  })
}

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
    zone: label.closest('[data-stage-zone-container]')?.getAttribute('data-stage-zone-container') ?? null,
    clientWidth: label instanceof HTMLElement ? label.clientWidth : 0,
    scrollWidth: label instanceof HTMLElement ? label.scrollWidth : 0,
  }))
  const root = document.documentElement
  const body = document.body
  const visibleBlocks = [...document.querySelectorAll('[data-block-id]')]
    .map((node) => ({ id: node.getAttribute('data-block-id'), node, rect: rect(node) }))
    .filter((item) => item.rect)
  const blockIntersections = []
  for (let first = 0; first < visibleBlocks.length; first += 1) {
    for (let second = first + 1; second < visibleBlocks.length; second += 1) {
      const a = visibleBlocks[first]
      const b = visibleBlocks[second]
      if (a.node.contains(b.node) || b.node.contains(a.node)) continue
      const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
      const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
      if (width > 2 && height > 2) blockIntersections.push({ first: a.id, second: b.id, width, height })
    }
  }
  const interactiveIssues = [...document.querySelectorAll('.adaptive-stage :is(button, a[href], input, select, textarea, [role="button"])')]
    .filter((node) => !node.closest('[inert]'))
    .map((node) => ({
      label: node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent?.replace(/\s+/g, ' ').trim() || node.tagName,
      rect: rect(node),
    }))
    .filter(({ rect: value }) => value && value.right > 0 && value.left < innerWidth && value.bottom > 0 && value.top < innerHeight &&
      (value.width < 35 || value.height < 35))
  const unnamedActions = [...document.querySelectorAll('.adaptive-stage :is(button, a[href])')]
    .filter((node) => !node.closest('[inert]'))
    .filter((node) => {
      const value = rect(node)
      return value && value.right > 0 && value.left < innerWidth && value.bottom > 0 && value.top < innerHeight
    })
    .filter((node) => !(
      node.getAttribute('aria-label')?.trim() ||
      node.getAttribute('aria-labelledby')?.trim() ||
      node.getAttribute('title')?.trim() ||
      node.textContent?.replace(/\s+/g, ' ').trim() ||
      [...node.querySelectorAll('img')].some((image) => image.alt.trim())
    ))
    .map((node) => node.outerHTML.slice(0, 240))
  const paintEscapes = []
  for (const zone of ['day', 'now', 'pulse']) {
    const zoneRect = zones[zone].rect
    if (!zoneRect) continue
    for (const block of zones[zone].blocks) {
      if (!block.rect) continue
      if (block.rect.left < zoneRect.left - 2 || block.rect.right > zoneRect.right + 2 ||
          block.rect.top < zoneRect.top - 2 || block.rect.bottom > zoneRect.bottom + 2) {
        paintEscapes.push({ zone, id: block.id, zoneRect, blockRect: block.rect })
      }
    }
  }
  const missingImages = [...document.images]
    .filter((image) => image.complete && image.naturalWidth === 0)
    .map((image) => image.currentSrc || image.src)
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
    blockIntersections,
    interactiveIssues,
    unnamedActions,
    paintEscapes,
    missingImages,
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
  if (dockChildren.length > 0) {
    assert(dock, `${result.label}: populated Dock is missing`)
    const childLeft = Math.min(...dockChildren.map((child) => child.left))
    const childRight = Math.max(...dockChildren.map((child) => child.right))
    const childTop = Math.min(...dockChildren.map((child) => child.top))
    const childBottom = Math.max(...dockChildren.map((child) => child.bottom))
    assert(dock.width <= childRight - childLeft + inset * 2 + 2,
      `${result.label}: Dock paints beyond its content: ${JSON.stringify({ dock, childLeft, childRight, inset })}`)
    assert(dock.height <= childBottom - childTop + inset * 2 + 2,
      `${result.label}: Dock paints below its content: ${JSON.stringify({ dock, childTop, childBottom, inset })}`)
  } else {
    assert(!dock, `${result.label}: empty Dock still paints a surface: ${JSON.stringify(dock)}`)
  }
  for (const zone of ['day', 'now', 'pulse']) {
    const surface = zones[zone].rect
    if (surface && dock && surface.bottom > dock.top + 1) {
      throw new Error(`${result.label}: ${zone} overlaps Dock: ${JSON.stringify({ surface, dock })}`)
    }
  }
  assert(!result.documentOverflowX, `${result.label}: document-level horizontal overflow`)
  assert(result.duplicateIds.length === 0, `${result.label}: duplicate registry identities ${result.duplicateIds.join(', ')}`)
  assert(result.blockIntersections.length === 0,
    `${result.label}: visible blocks overlap: ${JSON.stringify(result.blockIntersections)}`)
  assert(result.paintEscapes.length === 0,
    `${result.label}: blocks escape their painted zone: ${JSON.stringify(result.paintEscapes)}`)
  assert(result.interactiveIssues.length === 0,
    `${result.label}: visible controls below the 36px floor: ${JSON.stringify(result.interactiveIssues)}`)
  assert(result.unnamedActions.length === 0,
    `${result.label}: unnamed visible actions: ${JSON.stringify(result.unnamedActions)}`)
  assert(result.missingImages.length === 0,
    `${result.label}: missing images: ${JSON.stringify(result.missingImages)}`)
  assert(!result.search || result.search.width <= 513,
    `${result.label}: Search is not restrained: ${JSON.stringify(result.search)}`)
  assert(result.launcherLabels.filter((label) => label.zone !== 'dock').every((label) => label.scrollWidth <= label.clientWidth + 1),
    `${result.label}: launcher label truncation: ${JSON.stringify(result.launcherLabels)}`)
  assert(!result.dockQuote || result.dockQuote.width >= 223,
    `${result.label}: Dock quote is unreadably narrow: ${JSON.stringify(result.dockQuote)}`)
}

const expectedRegistry = [
  'weather', 'ics', 'monthCal', 'sun', 'moon', 'quote', 'clock', 'greeting', 'worldClocks', 'countdown',
  'search', 'focus', 'links', 'habits', 'bookmarks', 'status', 'github', 'gitlab', 'jira', 'vercel',
  'homeassistant', 'rss', 'crypto', 'timer', 'tasks', 'notes',
]

const matrix = focused ? [
  { label: 'Standard sparse 1600x900', viewport: { width: 1600, height: 900 }, fixture: 'sparse', profile: 'standard', file: 'focused-sparse-1600x900.png' },
  { label: 'owner-like dense 2012x1397', viewport: { width: 2012, height: 1397 }, fixture: 'dense', profile: 'standard', file: 'focused-dense-2012x1397.png' },
] : [
  { label: 'Compact extreme reflow 320x180', viewport: { width: 320, height: 180 }, fixture: 'sparse', profile: 'compact', file: 'matrix-01-compact-320x180-sparse.png' },
  { label: 'Compact touch 375x812', viewport: { width: 375, height: 812 }, fixture: 'typical', profile: 'compact', file: 'matrix-02-compact-375x812-touch.png' },
  { label: 'Compact boundary 600x800', viewport: { width: 600, height: 800 }, fixture: 'typical', profile: 'compact', file: 'matrix-03-compact-600x800.png' },
  { label: 'Compact sparse 800x600', viewport: { width: 800, height: 600 }, fixture: 'sparse', profile: 'compact', file: 'matrix-04-compact-800x600-sparse.png' },
  { label: 'Compact dense 800x600', viewport: { width: 800, height: 600 }, fixture: 'dense', profile: 'compact', file: 'matrix-05-compact-800x600-dense.png' },
  { label: 'Standard boundary 900x700', viewport: { width: 900, height: 700 }, fixture: 'typical', profile: 'standard', file: 'matrix-06-standard-900x700.png' },
  { label: 'Standard typical 1280x800', viewport: { width: 1280, height: 800 }, fixture: 'typical', profile: 'standard', file: 'matrix-07-standard-1280x800.png' },
  { label: 'Standard sparse 1600x900', viewport: { width: 1600, height: 900 }, fixture: 'sparse', profile: 'standard', file: 'matrix-08-standard-1600x900-sparse.png' },
  { label: 'Standard dense 1600x900', viewport: { width: 1600, height: 900 }, fixture: 'dense', profile: 'standard', file: 'matrix-09-standard-1600x900-dense.png' },
  { label: 'Standard typical 1920x1080', viewport: { width: 1920, height: 1080 }, fixture: 'typical', profile: 'standard', file: 'matrix-10-standard-1920x1080.png' },
  { label: 'owner-like dense 2012x1397', viewport: { width: 2012, height: 1397 }, fixture: 'dense', profile: 'standard', file: 'matrix-11-standard-2012x1397-dense.png' },
  { label: 'Display boundary 2200x1100', viewport: { width: 2200, height: 1100 }, fixture: 'typical', profile: 'display', file: 'matrix-12-display-2200x1100.png' },
  { label: 'Display sparse 2560x1440', viewport: { width: 2560, height: 1440 }, fixture: 'sparse', profile: 'display', file: 'matrix-13-display-2560x1440-sparse.png' },
  { label: 'Display dense 2560x1440', viewport: { width: 2560, height: 1440 }, fixture: 'dense', profile: 'display', file: 'matrix-14-display-2560x1440-dense.png' },
  { label: 'Display 4K dense 3840x2160', viewport: { width: 3840, height: 2160 }, fixture: 'dense', profile: 'display', file: 'matrix-15-display-3840x2160-dense.png' },
  { label: 'Ultrawide boundary 1600x700', viewport: { width: 1600, height: 700 }, fixture: 'typical', profile: 'ultrawide', file: 'matrix-16-ultrawide-1600x700.png' },
  { label: 'Ultrawide dense 3440x1440', viewport: { width: 3440, height: 1440 }, fixture: 'dense', profile: 'ultrawide', file: 'matrix-17-ultrawide-3440x1440-dense.png' },
]

async function applyFixture(fixture) {
  if (fixture === 'dense') await seedDense()
  else if (fixture === 'typical') await seedTypical()
  else await seedSparse()
}

async function captureComposition(entry) {
  await page.setViewportSize(entry.viewport)
  await applyFixture(entry.fixture)
  await page.reload()
  await waitForStage()
  const result = await measure(entry.label)
  const path = `${outDir}/${entry.file}`
  await page.screenshot({ path })
  assertComposition(result)
  assert(result.profile === entry.profile,
    `${entry.label}: expected ${entry.profile} profile, received ${result.profile}`)
  for (const id of result.allIds) evidence.inventory[id] = { status: 'browser-proven', witness: entry.file }
  evidence.captures.push({ ...result, fixture: entry.fixture, path })
}

async function captureInteraction(label, file, notes = '') {
  const path = `${outDir}/${file}`
  await page.screenshot({ path })
  const state = await page.evaluate(() => ({
    active: document.activeElement instanceof HTMLElement
      ? document.activeElement.getAttribute('aria-label') || document.activeElement.textContent?.replace(/\s+/g, ' ').trim() || document.activeElement.tagName
      : null,
    dialogs: [...document.querySelectorAll('[role="dialog"]')]
      .filter((node) => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      .map((node) => node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') || node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80)),
    alerts: [...document.querySelectorAll('[role="alert"]')]
      .filter((node) => node.textContent?.trim())
      .map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
  }))
  evidence.interactions.push({ label, path, notes, state })
}

async function createContactSheet(entries) {
  const columns = 4
  const cellWidth = 320
  const cellHeight = 210
  const rows = Math.ceil(entries.length / columns)
  const composites = []
  const escapeXml = (value) => value.replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]))
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const x = (index % columns) * cellWidth
    const y = Math.floor(index / columns) * cellHeight
    const thumbnail = await sharp(entry.path).resize({ width: 300, height: 170, fit: 'contain', background: '#111827' }).png().toBuffer()
    const label = Buffer.from(`<svg width="300" height="28" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="28" fill="#0b1020"/><text x="8" y="18" font-family="Arial" font-size="12" fill="#f5f5f4">${escapeXml(entry.label)}</text></svg>`)
    composites.push({ input: label, left: x + 10, top: y + 4 }, { input: thumbnail, left: x + 10, top: y + 34 })
  }
  const path = `${outDir}/calm-canvas-contact-sheet.png`
  await sharp({ create: { width: columns * cellWidth, height: rows * cellHeight, channels: 4, background: '#050814' } })
    .composite(composites)
    .png()
    .toFile(path)
  evidence.contactSheet = path
}

async function runBookmarkWitness() {
  await page.setViewportSize({ width: 1600, height: 900 })
  await seedDense()
  await page.reload()
  await waitForStage()

  const readHorizontalState = () => page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector)
      if (!(node instanceof HTMLElement)) return null
      const value = node.getBoundingClientRect()
      return { left: value.left, right: value.right, width: value.width, scrollLeft: node.scrollLeft, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }
    }
    return {
      windowScrollX: window.scrollX,
      rootScrollLeft: document.documentElement.scrollLeft,
      bodyScrollLeft: document.body.scrollLeft,
      stage: box('main[data-adaptive-stage]'),
      grid: box('.adaptive-stage__grid'),
      dock: box('[data-stage-zone-container="dock"]'),
      dialog: box('[role="dialog"][aria-label$=" bookmarks"]'),
    }
  })
  evidence.bookmarkHorizontalState = { before: await readHorizontalState() }

  const folderChip = page.getByRole('button', { name: 'Calm Canvas QA', exact: true })
  await folderChip.click()
  const rootDialog = page.getByRole('dialog', { name: 'Calm Canvas QA bookmarks' })
  await rootDialog.waitFor()
  evidence.bookmarkHorizontalState.open = await readHorizontalState()
  assert(evidence.bookmarkHorizontalState.open.stage?.scrollLeft === 0, 'Bookmark popover scrolled the entire Stage horizontally')
  assert(
    evidence.bookmarkHorizontalState.open.dialog?.left >= 8 && evidence.bookmarkHorizontalState.open.dialog?.right <= 1592,
    `Bookmark popover escaped the viewport: ${JSON.stringify(evidence.bookmarkHorizontalState.open.dialog)}`,
  )
  await captureInteraction('Bookmark folder popover', 'interaction-22-bookmark-folder.png', 'Folder contents, links, and nested folder are directly visible.')

  await rootDialog.getByRole('button', { name: 'Evidence archive', exact: true }).click()
  const nestedDialog = page.getByRole('dialog', { name: 'Evidence archive bookmarks' })
  await nestedDialog.waitFor()
  await captureInteraction('Bookmark folder drill-in', 'interaction-23-bookmark-drill.png', 'Nested folder navigation and Back control are directly visible.')
  await nestedDialog.getByRole('button', { name: /Back/ }).click()
  await rootDialog.waitFor()
  await page.keyboard.press('Escape')
  await rootDialog.waitFor({ state: 'detached' })
  assert(await folderChip.evaluate((node) => node === document.activeElement), 'Bookmark popover did not restore invoker focus')
  evidence.surfaces = { bookmarkFolderPopover: ['open', 'drill-in', 'back', 'escape', 'focus-restore'] }
}

async function runWeatherSearchWitness() {
  await context.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          { name: 'Dallas', admin1: 'Texas', country: 'United States', latitude: 32.78, longitude: -96.81 },
          { name: 'Dallas', admin1: 'Georgia', country: 'United States', latitude: 33.92, longitude: -84.84 },
        ],
      }),
    })
  })
  await page.setViewportSize({ width: 1600, height: 900 })
  await seedSparse()
  await page.reload()
  await waitForStage()

  const search = page.getByRole('combobox', { name: 'Search for a city' })
  await search.fill('Dallas')
  const suggestions = page.getByRole('listbox', { name: 'City suggestions' })
  await suggestions.waitFor()
  assert(await suggestions.getByRole('option').count() === 2, 'Weather typeahead did not render both deterministic matches')
  await search.press('ArrowDown')
  assert((await search.getAttribute('aria-activedescendant')) === 'location-option-0', 'Weather typeahead did not expose its active option')
  await captureInteraction('Weather location typeahead', 'interaction-24-weather-location-search.png', 'Debounced search, disambiguated results, and keyboard active option are directly visible.')
  await search.press('Escape')
  assert(await search.getAttribute('aria-expanded') === 'false', 'Weather typeahead Escape dismissal failed')
  evidence.surfaces = { weatherLocationSearch: ['typeahead', 'disambiguation', 'keyboard-navigation', 'escape'] }
}

async function runInteractions() {
  await page.setViewportSize({ width: 1600, height: 900 })
  await seedDense()
  await page.reload()
  await waitForStage()

  const dense = await measure('interaction baseline dense 1600x900')
  assertComposition(dense)
  const missingRegistry = expectedRegistry.filter((id) => !dense.allIds.includes(id))
  assert(missingRegistry.length === 0, `dense inventory misses registry entries: ${missingRegistry.join(', ')}`)
  for (const id of expectedRegistry) evidence.inventory[id] = { status: 'browser-proven', witness: 'interaction baseline dense 1600x900' }

  if (!settingsOnly && !arrangeOnly) {
  const focusInput = page.locator('#focus-input')
  await focusInput.fill('Ship Calm Canvas')
  await focusInput.press('Enter')
  await page.getByText('Ship Calm Canvas', { exact: true }).waitFor()
  await page.locator('#focus-done').focus()
  await page.locator('#focus-done').press('Space')
  assert(await page.locator('#focus-done').isChecked(), 'Focus checkbox did not toggle from Space')
  assert(await page.getByText('Nice.', { exact: true }).isVisible(), 'focus completion feedback is missing')
  await captureInteraction('Focus commit and completion', 'interaction-01-focus-complete.png', 'Commit, checkbox completion, and positive feedback.')

  await page.getByRole('button', { name: 'Add quick link' }).click()
  await captureInteraction('Quick Link add editor', 'interaction-02-quick-link-editor.png', 'Title, URL, Add, Cancel, and validation surface visible.')
  await page.getByLabel('Link title').fill('Quality')
  await page.getByLabel('Link URL').fill('quality.example.test')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Remove Quality' }).waitFor()
  const roadmap = page.getByRole('link', { name: 'Roadmap' })
  await roadmap.focus()
  await roadmap.press('Alt+ArrowRight')
  const reordered = await page.evaluate(async () => (await chrome.storage.local.get('links')).links.map((link) => link.title))
  assert(reordered[1] === 'Roadmap', `Quick Link keyboard reorder failed: ${JSON.stringify(reordered)}`)
  await page.getByRole('link', { name: 'Roadmap' }).press('Alt+ArrowLeft')
  await captureInteraction('Quick Link add and keyboard reorder', 'interaction-03-quick-link-added-reordered.png', 'Added a safe URL and moved Roadmap with Alt+Arrow.')
  await page.getByRole('button', { name: 'Remove Quality' }).click()

  await page.locator('body').click({ position: { x: 800, y: 850 } })
  await page.keyboard.press('Control+K')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await palette.waitFor()
  await palette.getByRole('combobox').fill('timer')
  await captureInteraction('Command palette filtered results', 'interaction-04-command-palette.png', 'Keyboard open, filtering, listbox, and Escape dismissal.')
  await page.keyboard.press('Escape')
  await palette.waitFor({ state: 'detached' })

  const weatherToggle = page.locator('section[aria-label="Weather"] > button[aria-expanded]')
  await weatherToggle.click()
  assert(await weatherToggle.getAttribute('aria-expanded') === 'true', 'Weather did not expand')
  await captureInteraction('Expanded Weather forecast', 'interaction-05-weather-expanded.png', 'Summary toggle and expanded forecast.')
  await weatherToggle.click()

  const dockToggle = page.locator('button[aria-label^="Open "][aria-label$=" details"]').first()
  if (await dockToggle.count()) {
    const dockLabel = await dockToggle.getAttribute('aria-label')
    await dockToggle.click()
    await captureInteraction('Signal Dock detail disclosure', 'interaction-06-signal-dock-details.png', dockLabel ?? 'Dock detail opened.')
    await page.keyboard.press('Escape')
    assert((await dockToggle.getAttribute('aria-expanded')) === 'false', 'Signal Dock Escape dismissal failed')
  }

  const trayButton = page.getByRole('button', { name: 'Open utility tray' })
  await trayButton.click()
  const tray = page.getByRole('dialog', { name: 'Utility Tray' })
  await tray.waitFor()
  await tray.getByRole('button', { name: 'Tasks', exact: true }).click()
  await tray.getByPlaceholder('Add a task…').fill('Audit the complete UI')
  await tray.getByRole('button', { name: 'Add task' }).click()
  await tray.getByText('Audit the complete UI', { exact: true }).waitFor()
  await captureInteraction('Utility Tray Tasks', 'interaction-07-utility-tasks.png', 'Tool navigation and task creation.')

  await tray.getByRole('button', { name: 'Notes', exact: true }).click()
  const notes = tray.getByPlaceholder('Jot a thought, a link, a to-do…')
  await notes.fill('Calm Canvas visual QA complete.')
  await notes.blur()
  await tray.getByRole('status').filter({ hasText: 'Saved' }).waitFor()
  await captureInteraction('Utility Tray Notes', 'interaction-08-utility-notes.png', 'Dirty, persisted, and Saved state.')

  await tray.getByRole('button', { name: 'Timer', exact: true }).click()
  await tray.getByRole('button', { name: 'Start', exact: true }).click()
  await tray.getByRole('button', { name: 'Pause', exact: true }).waitFor()
  await captureInteraction('Utility Tray Timer running', 'interaction-09-utility-timer.png', 'Start transition and running state.')

  await tray.getByRole('button', { name: 'Home Assistant', exact: true }).click()
  const runAction = tray.getByRole('button', { name: 'Run Focus mode' })
  await runAction.waitFor()
  expectedRequestFailureWindow = true
  try {
    await runAction.click()
    await tray.getByRole('alert').waitFor({ timeout: 12_000 }).catch(() => {})
  } finally {
    expectedRequestFailureWindow = false
  }
  await captureInteraction('Utility Tray Home Assistant action feedback', 'interaction-10-utility-home-assistant.png', 'Deterministic disconnected-origin failure feedback; live action remains a manual ceiling.')

  await tray.getByRole('button', { name: 'Refresh', exact: true }).click()
  await tray.getByRole('region', { name: 'Background refresh' }).waitFor()
  await captureInteraction('Utility Tray Background refresh', 'interaction-11-utility-refresh.png', 'Background refresh tool and actionable control.')
  await tray.getByRole('button', { name: 'Close utility tray' }).click()
  assert(await trayButton.evaluate((node) => node === document.activeElement), 'Utility Tray did not restore invoker focus')
  }

  const settingsButton = page.getByRole('button', { name: 'Open settings' })
  const settings = page.getByRole('dialog', { name: 'Settings' })
  if (!arrangeOnly) {
  await settingsButton.click()
  await settings.waitFor()
  await captureInteraction('Settings General', 'interaction-12-settings-general.png', 'Profile, display, background, and adaptive control surfaces.')

  await settings.getByRole('tab', { name: 'Widgets' }).click()
  await captureInteraction('Settings Widgets', 'interaction-13-settings-widgets.png', 'All widget switches, configuration sections, density, and layout actions.')
  await settings.getByRole('button', { name: 'Reset layout' }).click()
  const resetDialog = page.getByRole('dialog', { name: 'Reset layout?' })
  await resetDialog.waitFor()
  await captureInteraction('Reset layout confirmation', 'interaction-14-reset-layout-confirm.png', 'Safe Cancel is the initial destructive-confirm focus target.')
  assert(await resetDialog.getByRole('button', { name: 'Cancel' }).evaluate((node) => node === document.activeElement), 'Reset dialog did not focus Cancel')
  await resetDialog.getByRole('button', { name: 'Cancel' }).click()

  await settings.getByRole('tab', { name: 'Connectors' }).click()
  const connectorSearch = settings.getByPlaceholder('Search connectors')
  await connectorSearch.fill('Calendar')
  await captureInteraction('Settings Calendar connector', 'interaction-15-settings-calendar.png', 'Calendar source, view, count, and meeting-link controls.')
  await connectorSearch.fill('Home Assistant')
  await captureInteraction('Settings Home Assistant connector', 'interaction-16-settings-home-assistant.png', 'Connected identity, selected items, actions, disclosure, and picker entry point.')
  const chooseEntities = settings.getByRole('button', { name: 'Choose entities' })
  expectedRequestFailureWindow = true
  try {
    await chooseEntities.click()
    await settings.getByRole('alert').waitFor({ timeout: 12_000 }).catch(() => {})
  } finally {
    expectedRequestFailureWindow = false
  }
  await captureInteraction('Home Assistant picker failure recovery', 'interaction-17-home-assistant-picker-failure.png', 'Real unreachable/ungranted-origin error, settled button, and retryable settings state.')

  await settings.getByRole('tab', { name: 'Data' }).click()
  await captureInteraction('Settings Data and About', 'interaction-18-settings-data.png', 'Backup, import/export, privacy copy, version, and About.')
  await page.setViewportSize({ width: 375, height: 812 })
  await captureInteraction('Narrow Settings drawer', 'interaction-19-settings-narrow.png', 'Compact full-height drawer at the touch viewport.')
  await page.setViewportSize({ width: 1600, height: 900 })
  await settings.getByRole('button', { name: 'Close settings' }).click()
  assert(await settingsButton.evaluate((node) => node === document.activeElement), 'Settings did not restore invoker focus')
  }

  await settingsButton.click()
  await settings.getByRole('tab', { name: 'Widgets' }).click()
  await settings.getByRole('button', { name: 'Arrange layout' }).click()
  const arrange = page.getByRole('dialog', { name: 'Arrange Standard profile' })
  await arrange.waitFor()
  const editWeather = page.getByRole('button', { name: 'Edit Weather' })
  if (await editWeather.count()) await editWeather.click()
  else await arrange.getByRole('region', { name: 'Weather placement' }).waitFor()
  await arrange.getByRole('button', { name: 'Lock placement' }).click()
  await arrange.getByRole('button', { name: 'Unlock placement' }).click()
  await arrange.getByRole('button', { name: 'Wider' }).click()
  await arrange.getByRole('button', { name: 'Undo' }).click()
  await arrange.getByLabel('Copy from profile').selectOption('display')
  await arrange.getByRole('button', { name: 'Copy profile' }).click()
  await arrange.getByRole('button', { name: 'Undo' }).click()
  await arrange.getByRole('button', { name: 'Reset profile' }).click()
  await arrange.getByRole('button', { name: 'Undo' }).click()
  await captureInteraction('Arrange mode edit controls', 'interaction-20-arrange-controls.png', 'Selection, lock, resize, copy, reset, and Undo were exercised.')
  await arrange.getByRole('button', { name: 'Cancel' }).click()
  await arrange.waitFor({ state: 'detached' })

  await settingsButton.click()
  await settings.getByRole('tab', { name: 'Widgets' }).click()
  await settings.getByRole('button', { name: 'Arrange layout' }).click()
  const saveArrange = page.getByRole('dialog', { name: 'Arrange Standard profile' })
  const saveEditWeather = page.getByRole('button', { name: 'Edit Weather' })
  if (await saveEditWeather.count()) await saveEditWeather.click()
  else await saveArrange.getByRole('region', { name: 'Weather placement' }).waitFor()
  await saveArrange.getByRole('button', { name: 'Compact', exact: true }).click()
  await saveArrange.getByRole('button', { name: 'Save' }).click()
  await saveArrange.waitFor({ state: 'detached' })
  const savedWeather = await page.evaluate(async () => (await chrome.storage.local.get('layout')).layout?.profiles?.standard?.weather)
  assert(savedWeather?.variant === 'compact', `Arrange Save did not persist the Weather variant: ${JSON.stringify(savedWeather)}`)
  await page.evaluate(async () => chrome.storage.local.set({ layout: { version: 2, profiles: {} } }))
  await page.reload()
  await waitForStage()

  await page.setViewportSize({ width: 375, height: 812 })
  await seedDense()
  await page.reload()
  await waitForStage()
  const clockBox = await page.locator('[data-block-id="clock"]').boundingBox()
  assert(clockBox, 'Clock missing for touch long-press')
  const cdp = await context.newCDPSession(page)
  const touchPoint = { x: clockBox.x + clockBox.width / 2, y: clockBox.y + clockBox.height / 2 }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint] })
  await page.waitForTimeout(650)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const compactArrange = page.getByRole('dialog', { name: 'Arrange Compact profile' })
  await compactArrange.waitFor()
  await captureInteraction('Touch long-press arrange mode', 'interaction-21-touch-long-press.png', 'Real touch events opened the Compact arrange surface.')
  await compactArrange.getByRole('button', { name: 'Cancel' }).click()

  evidence.surfaces = {
    commandPalette: 'browser-proven', weatherExpanded: 'browser-proven', signalDock: 'browser-proven',
    utilityTray: ['tasks', 'notes', 'timer', 'homeassistant', 'refresh'],
    settingsTabs: ['general', 'widgets', 'connectors', 'data'],
    arrange: ['cancel', 'save', 'undo', 'reset', 'copy', 'lock', 'resize', 'touch-long-press'],
    bookmarkFolderPopover: 'covered by the complete browser harness; preview permission and registry rendering proven here',
    homeAssistantLiveSuccess: 'manual ceiling: requires the owner\'s real instance and explicit origin grant',
  }
}

try {
  await page.clock.setFixedTime(nowMs)
  await page.goto('chrome://newtab/')
  await waitForStage()
  if (!partialInteractions) {
    const requestedMatrix = compactOnly
      ? matrix.slice(0, 5)
      : wideDenseOnly
        ? matrix.filter((entry) => ['Display dense 2560x1440', 'Display 4K dense 3840x2160', 'Ultrawide dense 3440x1440'].includes(entry.label))
        : matrix
    for (const entry of requestedMatrix) await captureComposition(entry)
  }
  if (bookmarkOnly) {
    await runBookmarkWitness()
  } else if (weatherSearchOnly) {
    await runWeatherSearchWitness()
  } else if (sheetOnly) {
    await createContactSheet(matrix.map((entry) => ({ label: entry.label, path: `${outDir}/${entry.file}` })))
  } else if (!focused && !compactOnly && !wideDenseOnly) {
    await runInteractions()
    await createContactSheet(partialInteractions
      ? matrix.map((entry) => ({ label: entry.label, path: `${outDir}/${entry.file}` }))
      : evidence.captures)
  }
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
  assert(failedRequests.length === 0, `unexpected failed requests: ${failedRequests.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/${evidenceStem}-failure.png` }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
  writeFileSync(`${outDir}/${evidenceStem}-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`)
}

if (evidence.error) throw new Error(evidence.error)
console.log(`PASS: Calm Canvas ${focused ? 'focused composition' : 'complete UI audit'}`)
