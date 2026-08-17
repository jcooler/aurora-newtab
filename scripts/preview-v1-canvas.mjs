// One-shot real-Chromium proof for the Aurora V1 Canvas connector/calendar gate.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const repoRoot = process.cwd()
const dist = resolve('.preview-v1-canvas-dist')
const profileDir = resolve('.playwright-profile-v1-canvas')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/aurora-v1-canvas-implementation-session-prompt/outputs/canvas-p7'
const failureCapture = `${outDir}/canvas-p7-failure.png`
const headed = process.argv.includes('--headed')

const assert = (condition, message) => { if (!condition) throw new Error(message) }
for (const [path, suffix] of [[dist, '.preview-v1-canvas-dist'], [profileDir, '.playwright-profile-v1-canvas']]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe temporary path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
rmSync(failureCapture, { force: true })

const vite = resolve('node_modules/vite/bin/vite.js')
const build = spawnSync(process.execPath, [vite, 'build', '--mode', 'preview', '--outDir', dist, '--emptyOutDir'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`focused Vite build failed with status ${build.status}`)
}

const evidence = {
  packet: 'Canvas-P7',
  captures: [],
  interactions: {},
  layout: {},
  runtimeErrors: [],
  failedRequests: [],
  cleanup: {},
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  hasTouch: true,
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
  evidence.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
})

const waitForCanvas = async (label) => {
  await page.waitForSelector('main[data-aurora-canvas]')
  await page.waitForSelector(`[data-canvas-layout="${label}"]`)
  await page.waitForSelector('img[data-photo].opacity-100')
  await page.waitForTimeout(120)
}

const localDay = () => page.evaluate(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
})

async function seedRealContent() {
  const day = await localDay()
  await page.evaluate(async ({ day }) => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    for (const key of ['search', 'weather', 'todo', 'timer', 'bookmarks', 'notes', 'monthCal']) {
      widgets[key] = true
    }

    const normalize = (value, minimum, maximum) => {
      if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error('invalid weather coordinate')
      const rounded = Number(value.toFixed(4))
      return Object.is(rounded, -0) ? 0 : rounded
    }
    const weatherUrl = (lat, lon) => {
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
      params.set('latitude', String(normalize(lat, -90, 90)))
      params.set('longitude', String(normalize(lon, -180, 180)))
      return `https://api.open-meteo.com/v1/forecast?${params.toString()}`
    }
    const location = { lat: 40.7128, lon: -74.006, label: 'New York', manual: true }
    const now = Date.now()
    const configs = {
      ics: {
        enabled: true,
        calendars: [
          { name: 'Studio', url: 'https://calendar.invalid/studio.ics', color: 'fuchsia' },
          { name: 'Family', url: 'https://calendar.invalid/family.ics' },
        ],
        view: 'upcoming', upcomingCount: 3, meetLinks: true,
      },
      status: { enabled: true, services: [{ name: 'GitHub', url: 'https://status.invalid/github.json' }, { name: 'Vercel', url: 'https://status.invalid/vercel.json' }] },
      github: { enabled: true, token: 'fixture-github-token', username: 'fixture-jon', views: { commitGraph: true, pulls: true, issues: true, notifications: true } },
      gitlab: { enabled: true, token: 'fixture-gitlab-token', instanceUrl: 'https://gitlab.invalid', username: 'fixture-jon', views: { mergeRequests: true, reviewAsks: true, todos: true, activityGraph: true } },
      jira: { enabled: true, email: 'fixture@example.invalid', apiToken: 'fixture-jira-token', site: 'fixture.atlassian.net', displayName: 'Fixture Jon', views: { assigned: true, dueSoon: true, statusChips: true } },
      vercel: { enabled: true, token: 'fixture-vercel-token', username: 'fixture-jon', views: { deployments: true, statusSummary: true } },
      homeassistant: {
        enabled: true, instanceUrl: 'https://home.invalid', token: 'fixture-ha-token', locationName: 'Fixture Home',
        entities: [{ id: 'sensor.studio_temperature', name: 'Studio temperature' }, { id: 'light.desk', name: 'Desk light' }],
        actions: [{ id: 'scene.focus', name: 'Focus scene', domain: 'scene' }, { id: 'switch.office', name: 'Office switch', domain: 'switch' }],
      },
      rss: { enabled: true, feeds: ['https://feeds.invalid/aurora.xml', 'https://feeds.invalid/release.xml'], shownCount: 5 },
      crypto: { enabled: true, coins: ['bitcoin', 'ethereum', 'solana'] },
    }
    const canonical = (value) => {
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
      return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    }
    const scope = async (id, config, runtimeScope) => {
      const eventConfig = id === 'ics' && Array.isArray(config.calendars)
        ? { ...config, calendars: config.calendars.map(({ color, ...calendar }) => calendar) }
        : config
      const runtime = runtimeScope === undefined ? '' : `\n${canonical(runtimeScope)}`
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id}\n${canonical(eventConfig)}${runtime}`))
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      return `${id}:${id === 'homeassistant' || id === 'ics' ? 'v2' : 'v1'}:${hash}`
    }
    const at = Date.now()
    const noon = new Date(`${day}T12:00:00`).getTime()
    const contributionDays = (modulus) => Array.from({ length: 28 }, (_, index) => {
      const date = new Date(`${day}T12:00:00`)
      date.setDate(date.getDate() - 27 + index)
      return { date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, count: index % modulus }
    })
    const snapshots = {
      ics: { fetchedAt: at, scope: await scope('ics', configs.ics, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), data: { events: [
        { summary: 'Release planning', start: noon + 60 * 60_000, end: noon + 90 * 60_000, allDay: false, cal: 0 },
        { summary: 'Quarterly checkpoint', start: noon + 3 * 60 * 60_000, end: noon + 4 * 60 * 60_000, allDay: false, cal: 1 },
        { summary: 'Roadmap review', start: noon + 25 * 60 * 60_000, end: noon + 26 * 60 * 60_000, allDay: false, cal: 0 },
      ] } },
      status: { fetchedAt: at, scope: await scope('status', configs.status), data: { services: [{ name: 'GitHub', indicator: 'none', description: 'All systems operational' }, { name: 'Vercel', indicator: 'minor', description: 'Elevated build latency' }] } },
      github: { fetchedAt: at, scope: await scope('github', configs.github), data: { prs: [{ title: 'Ship the Canvas owner gate', url: 'https://github.invalid/aurora/pull/7', repo: 'aurora/canvas' }, { title: 'Preserve visual regression evidence', url: 'https://github.invalid/aurora/pull/8', repo: 'aurora/canvas' }], issues: [{ title: 'Verify screenshot metadata', url: 'https://github.invalid/aurora/issues/21', repo: 'aurora/qa' }], notifications: 4, contributions: { total: 42, days: contributionDays(5) }, etags: {} } },
      gitlab: { fetchedAt: at, scope: await scope('gitlab', configs.gitlab), data: { mrs: [{ title: 'Review compact layout', url: 'https://gitlab.invalid/aurora/-/merge_requests/1', project: 'aurora/web' }], reviewMrs: [{ title: 'Approve calendar colors', url: 'https://gitlab.invalid/aurora/-/merge_requests/2', project: 'aurora/web' }], todos: 3, contributions: { total: 18, days: contributionDays(4) } } },
      jira: { fetchedAt: at, scope: await scope('jira', configs.jira), data: { issues: [{ key: 'AUR-101', summary: 'Prove the dense connector composition', status: 'In Progress', url: 'https://fixture.atlassian.net/browse/AUR-101' }, { key: 'AUR-102', summary: 'Inspect direct interaction traces', status: 'To Do', url: 'https://fixture.atlassian.net/browse/AUR-102' }], counts: { 'In Progress': 1, 'To Do': 1 }, dueSoon: [{ key: 'AUR-103', summary: 'Owner capture review', status: 'To Do', due: day, url: 'https://fixture.atlassian.net/browse/AUR-103' }] } },
      vercel: { fetchedAt: at, scope: await scope('vercel', configs.vercel), data: { deployments: [{ project: 'aurora', state: 'READY', url: 'aurora-fixture.vercel.app', createdAt: at }, { project: 'canvas-lab', state: 'ERROR', url: 'canvas-fixture.vercel.app', createdAt: at - 60_000 }] } },
      homeassistant: { fetchedAt: at, scope: await scope('homeassistant', configs.homeassistant), data: { entities: [{ id: 'sensor.studio_temperature', state: '22.4', unit: '°C', friendlyName: 'Studio temperature', domain: 'sensor' }, { id: 'light.desk', state: 'on', unit: null, friendlyName: 'Desk light', domain: 'light' }] } },
      rss: { fetchedAt: at, scope: await scope('rss', configs.rss), data: [{ source: 'Aurora', title: 'Canvas gate opens', url: 'https://news.invalid/canvas-gate', publishedAt: at }, { source: 'Release', title: 'Calendar colors land', url: 'https://news.invalid/calendar-colors', publishedAt: at - 60_000 }] },
      crypto: { fetchedAt: at, scope: await scope('crypto', configs.crypto), data: { coins: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 102400, change24h: 2.4 }, { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 3900, change24h: -1.1 }, { id: 'solana', symbol: 'SOL', name: 'Solana', price: 180, change24h: 4.2 }] } },
    }
    await chrome.storage.local.set({
      settings: { ...settings, name: 'Jon', briefingEnabled: false, widgets },
      focus: { text: 'Ship Aurora Canvas', date: day, done: false },
      links: [
        { id: 'roadmap', title: 'Roadmap', url: 'https://example.com/roadmap' },
        { id: 'design', title: 'Design', url: 'https://example.com/design' },
        { id: 'release', title: 'Release notes', url: 'https://example.com/releases' },
      ],
      todoLists: [{
        id: 'today',
        name: 'Today',
        items: [
          { id: 'qa', text: 'Inspect the Canvas', done: false },
          { id: 'notes', text: 'Capture owner evidence', done: false },
          { id: 'storage', text: 'Preserve exact recovery', done: true },
        ],
      }],
      notes: { text: 'Owner visual gate\n\nCheck the photo-first hierarchy and direct arrangement.', updatedAt: now },
      timerConfig: { workMinutes: 25, breakMinutes: 5 },
      worldClocks: [
        { zone: 'America/Los_Angeles', label: 'San Francisco' },
        { zone: 'Europe/London', label: 'London' },
      ],
      countdowns: [{ id: 'launch', name: 'Canvas launch', date: '2026-09-01' }],
      location,
      weatherCache: {
        current: { tempC: 24, feelsLikeC: 24, code: 1, windKmh: 8, humidity: 48, isDay: true },
        hourly: [
          { time: `${day}T13:00`, tempC: 24, precipProb: 10, code: 1, isDay: true },
          { time: `${day}T14:00`, tempC: 25, precipProb: 15, code: 2, isDay: true },
        ],
        fetchedAt: now,
        locationLabel: location.label,
        requestIdentity: `open-meteo:v1:${weatherUrl(location.lat, location.lon)}`,
        sunriseISO: `${day}T06:11`,
        sunsetISO: `${day}T19:52`,
      },
      connectors: Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, { ...config, enabled: id === 'github' || id === 'jira' }])),
      connectorSnapshots: snapshots,
      canvasP7FixtureConfigs: configs,
      photoPrefs: { mode: 'auto', index: 3, lastRotated: day },
      layout: { version: 3, profiles: {
        standard: { mode: 'custom', placements: {
          bookmarks: { kind: 'canvas', x: 50, y: 7, size: 'standard', layer: 1 }, weather: { kind: 'canvas', x: 89, y: 12, size: 'standard', layer: 2 }, timer: { kind: 'canvas', x: 7, y: 17, size: 'compact', layer: 3 },
          clock: { kind: 'canvas', x: 50, y: 31, size: 'full', layer: 4 }, focus: { kind: 'canvas', x: 50, y: 51, size: 'standard', layer: 5 }, search: { kind: 'canvas', x: 50, y: 60, size: 'standard', layer: 6 },
          monthCal: { kind: 'canvas', x: 12, y: 52, size: 'compact', layer: 7 }, github: { kind: 'canvas', x: 84, y: 45, size: 'full', layer: 8 }, jira: { kind: 'canvas', x: 84, y: 84, size: 'full', layer: 9 },
          notes: { kind: 'canvas', x: 7, y: 92, size: 'compact', layer: 10 }, tasks: { kind: 'canvas', x: 7, y: 83, size: 'compact', layer: 11 }, greeting: { kind: 'canvas', x: 50, y: 69, size: 'standard', layer: 12 },
        } },
        display: { mode: 'derived', placements: {
          ics: { kind: 'canvas', x: 7, y: 35, size: 'standard', layer: 20 }, status: { kind: 'canvas', x: 20, y: 35, size: 'standard', layer: 21 }, github: { kind: 'canvas', x: 33, y: 35, size: 'standard', layer: 22 },
          gitlab: { kind: 'canvas', x: 67, y: 35, size: 'standard', layer: 23 }, jira: { kind: 'canvas', x: 80, y: 35, size: 'standard', layer: 24 }, vercel: { kind: 'canvas', x: 93, y: 35, size: 'standard', layer: 25 },
          homeassistant: { kind: 'canvas', x: 7, y: 70, size: 'standard', layer: 26 }, rss: { kind: 'canvas', x: 20, y: 70, size: 'standard', layer: 27 }, crypto: { kind: 'canvas', x: 33, y: 70, size: 'standard', layer: 28 }, monthCal: { kind: 'canvas', x: 67, y: 70, size: 'standard', layer: 29 },
        } },
        ultrawide: { mode: 'derived', placements: {
          ics: { kind: 'canvas', x: 7, y: 35, size: 'standard', layer: 20 }, status: { kind: 'canvas', x: 20, y: 35, size: 'standard', layer: 21 }, github: { kind: 'canvas', x: 33, y: 35, size: 'standard', layer: 22 },
          gitlab: { kind: 'canvas', x: 67, y: 35, size: 'standard', layer: 23 }, jira: { kind: 'canvas', x: 80, y: 35, size: 'standard', layer: 24 }, vercel: { kind: 'canvas', x: 93, y: 35, size: 'standard', layer: 25 },
          homeassistant: { kind: 'canvas', x: 7, y: 70, size: 'standard', layer: 26 }, rss: { kind: 'canvas', x: 20, y: 70, size: 'standard', layer: 27 }, crypto: { kind: 'canvas', x: 33, y: 70, size: 'standard', layer: 28 }, monthCal: { kind: 'canvas', x: 67, y: 70, size: 'standard', layer: 29 },
        } },
      } },
    })

    if (chrome.bookmarks) {
      const tree = await chrome.bookmarks.getTree()
      const bar = tree[0]?.children?.find((node) => node.id === '1') ?? tree[0]?.children?.[0]
      if (bar) {
        const folder = await chrome.bookmarks.create({ parentId: bar.id, title: 'A' })
        const nested = await chrome.bookmarks.create({ parentId: folder.id, title: 'QA' })
        await chrome.bookmarks.create({ parentId: nested.id, title: 'Capture ledger', url: 'https://example.invalid/capture-ledger' })
        for (let index = 1; index <= 32; index += 1) {
          await chrome.bookmarks.create({ parentId: nested.id, title: `Evidence item ${index}`, url: `https://example.invalid/evidence-${index}` })
        }
        await chrome.bookmarks.create({ parentId: folder.id, title: 'Canvas plan', url: 'https://example.invalid/canvas-plan' })
        await chrome.bookmarks.create({ parentId: bar.id, title: 'Loose reference', url: 'https://example.invalid/reference' })
        await chrome.bookmarks.create({ parentId: bar.id, title: '   ' })
      }
    }
  }, { day })
}

const rectOf = async (locator) => {
  const box = await locator.boundingBox()
  assert(box, 'expected a visible bounding box')
  return box
}

const assertInsideViewport = async (locator, label) => {
  const box = await rectOf(locator)
  const viewport = page.viewportSize()
  assert(viewport, `${label}: viewport missing`)
  assert(box.x >= -0.5 && box.y >= -0.5, `${label}: starts outside viewport: ${JSON.stringify(box)}`)
  assert(box.x + box.width <= viewport.width + 0.5, `${label}: overflows viewport width: ${JSON.stringify(box)}`)
  assert(box.y + box.height <= viewport.height + 0.5, `${label}: overflows viewport height: ${JSON.stringify(box)}`)
  return box
}

const assertNoHorizontalOverflow = async (label) => {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  assert(widths.document <= widths.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(widths)}`)
  evidence.layout[label] = widths
}

const ARRANGE_LABELS = {
  weather: 'Weather', ics: 'Calendar', monthCal: 'Month', sun: 'Sun times', moon: 'Moon phase', quote: 'Quote',
  clock: 'Clock', greeting: 'Greeting', worldClocks: 'World clocks', countdown: 'Countdown', search: 'Search', focus: 'Focus', links: 'Links', habits: 'Habits', bookmarks: 'Bookmarks',
  status: 'Service status', github: 'GitHub', gitlab: 'GitLab', jira: 'Jira', vercel: 'Deploys', homeassistant: 'Home Assistant', rss: 'Headlines', crypto: 'Crypto',
  timer: 'Timer', tasks: 'Tasks', notes: 'Notes',
}

const assertArrangeSelections = async (profile) => {
  const ids = await page.locator('[data-block-id]').evaluateAll((nodes) => nodes
    .filter((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    })
    .map((node) => node.getAttribute('data-block-id')))
  const selections = {}
  for (const id of ids) {
    const label = ARRANGE_LABELS[id]
    assert(label, `No Arrange label mapping for visible ${id}`)
    const target = page.getByRole('button', { name: `Edit ${label}`, exact: true })
    await target.click()
    const pressed = await target.getAttribute('aria-pressed')
    assert(pressed === 'true', `${profile} Arrange did not select visible ${id}`)
    selections[id] = { label, pressed }
  }
  return selections
}

const capture = async (label, file) => {
  const path = `${outDir}/${file}`
  await page.screenshot({ path, fullPage: false })
  const inspection = await page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight }
    const blocks = [...document.querySelectorAll('[data-block-id]')]
      .filter((node) => {
        const style = getComputedStyle(node)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      .map((node) => {
        const rect = node.getBoundingClientRect()
        return { id: node.getAttribute('data-block-id'), size: node.getAttribute('data-canvas-size'), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
      })
    const intersections = []
    for (let i = 0; i < blocks.length; i += 1) for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i].rect; const b = blocks[j].rect
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) intersections.push([blocks[i].id, blocks[j].id])
    }
    const clippedBlocks = blocks.filter(({ rect }) => rect.x < -0.5 || rect.y < -0.5 || rect.x + rect.width > viewport.width + 0.5 || rect.y + rect.height > viewport.height + 0.5)
    const controls = [...document.querySelectorAll('button, a, input, select, textarea')]
      .filter((node) => { const s = getComputedStyle(node); return s.display !== 'none' && s.visibility !== 'hidden' })
      .map((node) => { const r = node.getBoundingClientRect(); return { name: node.getAttribute('aria-label') ?? node.textContent?.trim() ?? '', width: r.width, height: r.height } })
    return {
      viewport, blocks, intersections, clippedBlocks,
      overflow: { document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth },
      missingImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
      unnamedActions: controls.filter((control) => !control.name).length,
      controls,
    }
  })
  evidence.captures.push({ label, path, viewport: page.viewportSize(), originalDimensions: inspection.viewport, ...inspection })
}

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main[data-aurora-canvas]')
  await seedRealContent()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas('Desktop')

  const canvas = page.getByRole('region', { name: 'Canvas' })
  const canvasBox = await rectOf(canvas)
  const clockBox = await rectOf(page.locator('[data-block-id="clock"]'))
  const focusBox = await rectOf(page.locator('[data-block-id="focus"]'))
  const bookmarksBox = await rectOf(page.locator('[data-block-id="bookmarks"]'))
  for (const [label, box] of [['Clock', clockBox], ['Focus', focusBox], ['Bookmarks', bookmarksBox]]) {
    assert(Math.abs(box.x + box.width / 2 - (canvasBox.x + canvasBox.width / 2)) <= 1,
      `${label} is not centered: ${JSON.stringify(box)}`)
  }
  assert(bookmarksBox.y < clockBox.y, 'Bookmarks are not above Clock')
  for (const id of ['timer', 'tasks', 'notes']) {
    const item = page.locator(`[data-block-id="${id}"]`)
    await item.waitFor()
    assert(await item.getAttribute('data-canvas-kind') === 'canvas', `${id} is not a movable Canvas identity`)
  }
  const visibleText = await page.locator('body').innerText()
  for (const retired of ['Nothing urgent.', 'Work Pulse', 'Signal Dock', 'Move earlier', 'Move later']) {
    assert(!visibleText.includes(retired), `retired copy is visible: ${retired}`)
  }
  await assertNoHorizontalOverflow('Desktop default')
  for (const witness of ['Ship the Canvas owner gate', 'Prove the dense connector composition']) {
    assert(visibleText.includes(witness), `Desktop is missing fixture witness: ${witness}`)
  }
  const compactMonth = page.locator('[data-block-id="monthCal"]')
  assert(await compactMonth.locator('tbody tr').count() === 1 && await compactMonth.locator('tbody tr td').count() === 7, 'Compact Month is not exactly seven days')
  const compactMonthGeometry = await compactMonth.locator('tbody tr td').evaluateAll((cells) => cells.map((cell) => {
    const rect = cell.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }))
  const compactMonthRowTop = compactMonthGeometry[0]?.top
  const compactMonthSingleRow = compactMonthGeometry.length === 7
    && compactMonthGeometry.every((cell) => Math.abs(cell.top - compactMonthRowTop) <= 1)
    && compactMonthGeometry.every((cell, index) => index === 0 || cell.left > compactMonthGeometry[index - 1].left)
  assert(compactMonthSingleRow, `Compact Month dates are not one left-to-right seven-day row: ${JSON.stringify(compactMonthGeometry)}`)
  evidence.interactions.month = { compactDays: compactMonthGeometry.length, geometry: compactMonthGeometry }
  await capture('Desktop 1600x900 bookmarks, GitHub, and Jira', 'canvas-p7-desktop-1600x900-bookmarks-github-jira.png')
  const desktopCapture = evidence.captures.at(-1)
  assert(desktopCapture.intersections.length === 0, `Desktop owner capture intersects: ${JSON.stringify(desktopCapture.intersections)}`)
  assert(desktopCapture.clippedBlocks.length === 0, `Desktop owner capture has clipped blocks: ${JSON.stringify(desktopCapture.clippedBlocks)}`)
  await compactMonth.getByRole('button', { name: 'Next month' }).click()
  await compactMonth.getByRole('button', { name: 'Previous month' }).click()
  await compactMonth.getByRole('button', { name: 'Next month' }).click()
  await compactMonth.getByRole('button', { name: 'Back to today' }).click()
  evidence.interactions.month.controls = 'Previous, Next, Today'

  const folder = page.getByRole('button', { name: 'A', exact: true })
  await folder.click()
  const bookmarkPopover = page.getByRole('dialog', { name: 'A bookmarks' })
  await bookmarkPopover.waitFor()
  evidence.interactions.bookmarks = await assertInsideViewport(bookmarkPopover, 'Bookmarks popover')
  const nestedFolder = bookmarkPopover.getByRole('button', { name: 'QA', exact: true })
  await nestedFolder.click()
  const nestedPopover = page.getByRole('dialog', { name: 'QA bookmarks' })
  await nestedPopover.waitFor()
  evidence.interactions.nestedBookmarks = await assertInsideViewport(nestedPopover, 'Nested bookmarks popover')
  const nestedScroll = await nestedPopover.evaluate((node) => {
    const before = node.scrollTop
    node.scrollTop = Math.min(48, Math.max(0, node.scrollHeight - node.clientHeight))
    return {
      overflowY: getComputedStyle(node).overflowY,
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      before,
      after: node.scrollTop,
    }
  })
  assert(nestedScroll.overflowY === 'auto' && nestedScroll.scrollHeight > nestedScroll.clientHeight && nestedScroll.after > nestedScroll.before,
    `Nested Bookmarks is not locally scrollable: ${JSON.stringify(nestedScroll)}`)
  evidence.interactions.nestedBookmarksScroll = nestedScroll
  await page.keyboard.press('Escape')
  assert(await folder.evaluate((node) => node === document.activeElement), 'Bookmarks did not restore invoker focus')

  const notes = page.locator('[data-block-id="notes"]').getByRole('button', { name: 'Notes', exact: true })
  await notes.click()
  const notesPanel = page.getByRole('dialog', { name: 'Notes' })
  await notesPanel.waitFor()
  evidence.interactions.notesPanel = await assertInsideViewport(notesPanel, 'Notes panel')
  await notesPanel.getByLabel('Scratchpad').fill('Canvas direct panel proof')
  await page.keyboard.press('Escape')
  await notesPanel.waitFor({ state: 'detached' })
  assert(await notes.evaluate((node) => node === document.activeElement), 'Notes did not restore invoker focus')

  const tasks = page.locator('[data-block-id="tasks"]').getByRole('button', { name: 'Tasks', exact: true })
  await tasks.click()
  const tasksPanel = page.getByRole('dialog', { name: 'Tasks' })
  await tasksPanel.waitFor()
  evidence.interactions.tasksPanel = await assertInsideViewport(tasksPanel, 'Tasks panel')
  await tasksPanel.getByRole('button', { name: 'Close tasks' }).click()
  await tasksPanel.waitFor({ state: 'detached' })
  assert(await tasks.evaluate((node) => node === document.activeElement), 'Tasks did not restore invoker focus')

  const timer = page.getByRole('button', { name: /Focus timer:/ })
  await timer.click()
  const timerPanel = page.getByRole('dialog', { name: 'Focus timer' })
  await timerPanel.waitFor()
  evidence.interactions.timerPanel = await assertInsideViewport(timerPanel, 'Timer panel')
  await timerPanel.getByRole('button', { name: 'Start' }).click()
  await timerPanel.getByRole('button', { name: 'Close focus timer' }).click()
  await timerPanel.waitFor({ state: 'detached' })
  assert(await timer.evaluate((node) => node === document.activeElement), 'Timer did not restore invoker focus')
  assert((await timer.getAttribute('aria-label'))?.includes('running'), 'Timer did not continue after its panel closed')

  const cursorStates = await page.evaluate(() => {
    const cursorOf = (selector) => {
      const node = document.querySelector(selector)
      if (!node) throw new Error(`cursor witness missing: ${selector}`)
      return getComputedStyle(node).cursor
    }
    return {
      folder: cursorOf('button[title="A"]'),
      weatherToggle: cursorOf('[data-block-id="weather"] button[aria-expanded]'),
      weatherSurface: cursorOf('[data-block-id="weather"] section'),
      passiveCalendar: cursorOf('[data-block-id="monthCal"] tbody'),
    }
  })
  assert(cursorStates.folder === 'pointer' && cursorStates.weatherToggle === 'pointer' && cursorStates.weatherSurface === 'default' && cursorStates.passiveCalendar !== 'pointer',
    `Computed cursor contract failed: ${JSON.stringify(cursorStates)}`)
  evidence.interactions.cursors = cursorStates

  const storedFocus = await page.evaluate(async () => (await chrome.storage.local.get('focus')).focus)
  await page.evaluate(async () => chrome.storage.local.set({ focus: null }))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas('Desktop')
  const prompt = page.getByText(/main focus today/i)
  const promptSurface = await prompt.evaluate((node) => ({
    backgroundColor: getComputedStyle(node).backgroundColor,
    hasRetiredClass: node.classList.contains('focus-prompt-label'),
    footprint: node.closest('[data-focus-footprint]')?.getAttribute('data-focus-state'),
  }))
  assert(promptSurface.backgroundColor === 'rgba(0, 0, 0, 0)', `Focus prompt is opaque: ${promptSurface.backgroundColor}`)
  assert(!promptSurface.hasRetiredClass && promptSurface.footprint === 'empty', `Focus prompt contract failed: ${JSON.stringify(promptSurface)}`)
  const focusFootprint = async (expectedState) => {
    const value = await page.locator('[data-focus-footprint]').evaluate((node) => {
      const footprint = node.getBoundingClientRect()
      const block = node.closest('[data-block-id="focus"]')?.getBoundingClientRect()
      if (!block) throw new Error('Focus block missing')
      return {
        state: node.getAttribute('data-focus-state'),
        blockCenter: { x: block.x + block.width / 2, y: block.y + block.height / 2 },
        footprintCenter: { x: footprint.x + footprint.width / 2, y: footprint.y + footprint.height / 2 },
        canvasCenter: (() => {
          const canvas = document.querySelector('[data-canvas-surface]')?.getBoundingClientRect()
          if (!canvas) throw new Error('Canvas surface missing')
          return { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 }
        })(),
      }
    })
    value.blockDelta = {
      x: Math.abs(value.footprintCenter.x - value.blockCenter.x),
      y: Math.abs(value.footprintCenter.y - value.blockCenter.y),
    }
    value.canvasDelta = {
      x: Math.abs(value.footprintCenter.x - value.canvasCenter.x),
      y: Math.abs(value.footprintCenter.y - value.canvasCenter.y),
    }
    assert(value.state === expectedState && value.blockDelta.x <= 1 && value.blockDelta.y <= 1 && value.canvasDelta.x <= 1 && value.canvasDelta.y <= 12,
      `Focus ${expectedState} footprint is not centered: ${JSON.stringify(value)}`)
    return value
  }
  const focusLifecycle = { empty: await focusFootprint('empty') }
  const focusInput = page.getByLabel(/main focus today/i)
  await focusInput.fill('Lifecycle focus')
  focusLifecycle.firstEntry = await focusFootprint('empty')
  await focusInput.press('Enter')
  focusLifecycle.committed = await focusFootprint('committed')
  await page.locator('label[for="focus-done"]').last().click()
  focusLifecycle.completed = await focusFootprint('completed')
  await page.getByRole('button', { name: 'Edit' }).click({ force: true })
  focusLifecycle.editing = await focusFootprint('editing')
  await page.getByLabel(/main focus today/i).fill('Lifecycle focus revised')
  await page.getByLabel(/main focus today/i).press('Enter')
  focusLifecycle.editedAgain = await focusFootprint('committed')
  evidence.interactions.focusLifecycle = focusLifecycle
  evidence.interactions.focusPrompt = promptSurface
  const lifecycleRevision = { text: 'Lifecycle focus revised', date: storedFocus?.date, done: false }
  await page.waitForFunction(async (expected) => {
    const { focus } = await chrome.storage.local.get('focus')
    return JSON.stringify(focus) === JSON.stringify(expected)
  }, lifecycleRevision)
  await page.evaluate(async (focus) => chrome.storage.local.set({ focus }), storedFocus)
  await page.waitForFunction(async (expected) => {
    const { focus } = await chrome.storage.local.get('focus')
    return JSON.stringify(focus) === JSON.stringify(expected)
  }, storedFocus)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas('Desktop')
  const restoredFocusText = await page.locator('[data-block-id="focus"] [data-focus-footprint]').innerText()
  assert(restoredFocusText.includes(storedFocus?.text ?? ''), `Seeded Focus did not restore before captures: ${restoredFocusText}`)
  evidence.interactions.focusRestore = { storedText: storedFocus?.text, visibleText: restoredFocusText }

  const longPressSurface = page.locator('[data-block-id="clock"] time')
  const longPressBox = await rectOf(longPressSurface)
  await page.mouse.move(longPressBox.x + longPressBox.width / 2, longPressBox.y + longPressBox.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(650)
  const longPressToolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await longPressToolbar.waitFor()
  await page.mouse.up()
  evidence.interactions.longPress = { target: 'Clock time', holdMs: 650, toolbarVisible: await longPressToolbar.isVisible() }
  assert(evidence.interactions.longPress.toolbarVisible, 'Real Clock long-press did not enter Arrange')
  await longPressToolbar.getByRole('button', { name: 'Cancel' }).click()
  await longPressToolbar.waitFor({ state: 'detached' })

  const layoutBeforeArrange = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))
  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByRole('tab', { name: 'Widgets' }).click()
  await settings.getByRole('button', { name: 'Arrange layout' }).click()
  const toolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await toolbar.waitFor()
  evidence.interactions.desktopArrangeSelections = await assertArrangeSelections('Desktop')
  const clockTarget = page.getByRole('button', { name: 'Edit Clock' })
  await clockTarget.click()
  const inspector = page.getByRole('complementary', { name: 'Clock inspector' })
  await inspector.waitFor()
  await clockTarget.evaluate((node) => {
    window.__canvasP7PointerCapture = { got: 0, lost: 0, active: false, pointerId: null }
    node.addEventListener('gotpointercapture', (event) => {
      window.__canvasP7PointerCapture.got += 1
      window.__canvasP7PointerCapture.pointerId = event.pointerId
      window.__canvasP7PointerCapture.active = node.hasPointerCapture(event.pointerId)
    })
    node.addEventListener('lostpointercapture', () => { window.__canvasP7PointerCapture.lost += 1 })
  })

  const beforePointerX = Number(await page.locator('[data-block-id="clock"]').getAttribute('data-canvas-x'))
  const targetBox = await rectOf(clockTarget)
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2 + 32, { steps: 4 })
  const guidesDuringDrag = await page.locator('[data-canvas-guide]').count()
  const pointerCaptureDuringDrag = await page.evaluate(() => window.__canvasP7PointerCapture)
  assert(pointerCaptureDuringDrag?.got > 0 && pointerCaptureDuringDrag.active,
    `Arrange drag did not acquire actual pointer capture: ${JSON.stringify(pointerCaptureDuringDrag)}`)
  await page.mouse.up()
  const afterPointerX = Number(await page.locator('[data-block-id="clock"]').getAttribute('data-canvas-x'))
  const beforeKeyboardLeft = (await rectOf(page.locator('[data-block-id="clock"]'))).x
  await clockTarget.press('ArrowRight')
  const afterKeyboardLeft = (await rectOf(page.locator('[data-block-id="clock"]'))).x
  assert(Number.isFinite(afterPointerX) && afterPointerX === beforePointerX, 'vertical pointer drag changed Clock x unexpectedly')
  assert(afterKeyboardLeft > beforeKeyboardLeft, `ArrowRight did not move Clock: ${beforeKeyboardLeft} -> ${afterKeyboardLeft}`)
  assert(await inspector.getByText(/X \d+\.\d%/).count(), 'Clock inspector coordinates are not visible')
  await inspector.getByRole('radio', { name: 'Standard' }).click()
  await inspector.getByRole('radio', { name: 'Full' }).click()
  const focusTarget = page.getByRole('button', { name: 'Edit Focus' })
  const focusTargetBox = await rectOf(focusTarget)
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(focusTargetBox.x + focusTargetBox.width / 2, focusTargetBox.y + focusTargetBox.height / 2, { steps: 4 })
  await page.mouse.up()
  const overlap = inspector.getByRole('region', { name: 'Overlap' })
  await overlap.waitFor()
  await overlap.getByRole('button', { name: 'Bring forward' }).click()
  await toolbar.getByRole('tab', { name: 'Large' }).click()
  await toolbar.getByRole('button', { name: 'Use Desktop layout everywhere' }).click()
  await toolbar.getByRole('button', { name: 'Copy Desktop layout' }).click()
  await toolbar.getByRole('tab', { name: 'Desktop' }).click()
  evidence.interactions.arrange = {
    pointer: { beforeX: beforePointerX, afterX: afterPointerX, capture: pointerCaptureDuringDrag },
    keyboard: { beforeLeft: beforeKeyboardLeft, afterLeft: afterKeyboardLeft },
    guidesDuringDrag,
    selected: await clockTarget.getAttribute('aria-pressed'),
    inspectorMode: await inspector.getAttribute('data-arrange-inspector-mode'),
    overlap: await overlap.innerText(),
    profilePreview: 'Large, Desktop-everywhere, Copy Desktop, Desktop',
  }
  assert(guidesDuringDrag >= 0, 'pointer drag did not complete')
  await toolbar.getByRole('button', { name: 'Undo' }).click()
  await toolbar.getByRole('button', { name: 'Cancel' }).click()
  await toolbar.waitFor({ state: 'detached' })
  const layoutAfterCancel = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))
  assert(layoutAfterCancel === layoutBeforeArrange, 'Arrange Cancel changed stored layout')

  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas('Small')
  await assertNoHorizontalOverflow('Small default')
  const searchBox = page.getByRole('searchbox', { name: 'Search the web' })
  const utilityButton = page.getByRole('button', { name: 'Open utility tray' })
  const smallGap = await page.evaluate(() => {
    const search = document.querySelector('[aria-label="Search the web"]')
    const utility = document.querySelector('[aria-label="Open utility tray"]')
    if (!search || !utility) throw new Error('Small clearance controls missing')
    const a = search.getBoundingClientRect(); const b = utility.getBoundingClientRect()
    return Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom)
  })
  assert(smallGap >= 8, `Small Search/Utility clearance is below 8px: ${smallGap}`)
  const weatherText = await page.locator('[data-block-id="weather"]').innerText()
  assert(/New York/.test(weatherText) && /24/.test(weatherText) && /·/.test(weatherText), `Compact Weather contract missing: ${weatherText}`)
  evidence.interactions.small = { searchUtilityGap: smallGap, weatherText }

  const smallNotes = page.locator('[data-block-id="notes"]').getByRole('button', { name: 'Notes', exact: true })
  await smallNotes.scrollIntoViewIfNeeded()
  await smallNotes.click()
  const smallSheet = page.getByRole('dialog', { name: 'Notes' })
  await smallSheet.waitFor()
  const smallSheetBox = await assertInsideViewport(smallSheet, 'Small Notes sheet')
  const smallSheetStyle = await smallSheet.evaluate((node) => ({
    left: getComputedStyle(node).left,
    right: getComputedStyle(node).right,
    bottom: getComputedStyle(node).bottom,
    width: getComputedStyle(node).width,
  }))
  assert(Math.abs(smallSheetBox.x - 8) <= 0.5 && Math.abs(smallSheetBox.width - 359) <= 1,
    `Small tool sheet does not use shared safe geometry: ${JSON.stringify(smallSheetBox)}`)
  evidence.interactions.smallSheet = { box: smallSheetBox, style: smallSheetStyle }
  await page.keyboard.press('Escape')
  await smallSheet.waitFor({ state: 'detached' })
  assert(await smallNotes.evaluate((node) => node === document.activeElement), 'Small Notes did not restore invoker focus')
  await page.evaluate(() => window.scrollTo(0, 0))

  await page.getByRole('button', { name: 'Open settings' }).click()
  const smallSettings = page.getByRole('dialog', { name: 'Settings' })
  await smallSettings.getByRole('tab', { name: 'Widgets' }).click()
  await smallSettings.getByRole('button', { name: 'Arrange layout' }).click()
  const smallToolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await smallToolbar.waitFor()
  const smallInspector = page.getByRole('complementary')
  if (await smallInspector.count()) {
    await smallInspector.getByRole('button', { name: 'Close inspector' }).click()
    await page.waitForFunction(() => !document.querySelector('main[data-arrange-small-sheet="true"]'))
  }
  const smallClockText = await page.locator('[data-block-id="clock"] time').innerText()
  assert(smallClockText.includes(':'), `Small Arrange lost real Clock content: ${smallClockText}`)
  await page.evaluate(() => window.scrollTo(0, 0))
  await assertNoHorizontalOverflow('Small Arrange')
  await smallToolbar.getByRole('button', { name: 'Cancel' }).click()

  await page.evaluate(async () => {
    const { canvasP7FixtureConfigs } = await chrome.storage.local.get('canvasP7FixtureConfigs')
    await chrome.storage.local.set({ connectors: canvasP7FixtureConfigs })
  })
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas('Large')
  await assertNoHorizontalOverflow('Large default')
  const largeMonth = page.locator('[data-block-id="monthCal"]')
  assert(await largeMonth.locator('tbody tr').count() >= 4, 'Large Month does not show a natural full month')
  assert(await page.getByText('Release planning').count() > 0 && await page.getByText('Studio', { exact: true }).count() > 0 && await page.getByText('Family', { exact: true }).count() > 0,
    'Large Calendar is missing visibly attributed neutral multi-feed events')
  await capture('Large 2560x1440 dense connectors', 'canvas-p7-large-2560x1440-dense.png')
  assert(evidence.captures.at(-1).intersections.length === 0, `Large owner capture intersects: ${JSON.stringify(evidence.captures.at(-1).intersections)}`)
  assert(evidence.captures.at(-1).clippedBlocks.length === 0, `Large owner capture has clipped blocks: ${JSON.stringify(evidence.captures.at(-1).clippedBlocks)}`)
  await page.getByRole('button', { name: 'Open settings' }).click()
  const largeSettings = page.getByRole('dialog', { name: 'Settings' })
  await largeSettings.getByRole('tab', { name: 'Widgets' }).click()
  await largeSettings.getByRole('button', { name: 'Arrange layout' }).click()
  const largeArrange = page.getByRole('toolbar', { name: 'Arrange layout' })
  await largeArrange.waitFor()
  evidence.interactions.largeArrangeSelections = await assertArrangeSelections('Large')
  await largeArrange.getByRole('button', { name: 'Cancel' }).click()
  await largeArrange.waitFor({ state: 'detached' })

  await page.setViewportSize({ width: 3440, height: 1440 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas('Wide')
  await assertNoHorizontalOverflow('Wide default')
  for (const id of ['ics', 'status', 'github', 'gitlab', 'jira', 'vercel', 'homeassistant', 'rss', 'crypto']) {
    assert(await page.locator(`[data-block-id="${id}"]`).count() === 1, `Wide is missing ${id}`)
  }
  await capture('Wide 3440x1440 dense connectors', 'canvas-p7-wide-3440x1440-dense.png')
  assert(evidence.captures.at(-1).intersections.length === 0, `Wide owner capture intersects: ${JSON.stringify(evidence.captures.at(-1).intersections)}`)
  assert(evidence.captures.at(-1).clippedBlocks.length === 0, `Wide owner capture has clipped blocks: ${JSON.stringify(evidence.captures.at(-1).clippedBlocks)}`)
  await page.getByRole('button', { name: 'Open settings' }).click()
  const wideSettings = page.getByRole('dialog', { name: 'Settings' })
  await wideSettings.getByRole('tab', { name: 'Widgets' }).click()
  await wideSettings.getByRole('button', { name: 'Arrange layout' }).click()
  const wideArrange = page.getByRole('toolbar', { name: 'Arrange layout' })
  await wideArrange.waitFor()
  evidence.interactions.wideArrangeSelections = await assertArrangeSelections('Wide')
  await wideArrange.getByRole('button', { name: 'Cancel' }).click()
  await wideArrange.waitFor({ state: 'detached' })

  await page.getByRole('button', { name: 'Open settings' }).click()
  const connectorSettings = page.getByRole('dialog', { name: 'Settings' })
  await connectorSettings.getByRole('tab', { name: 'Connectors' }).click()
  const icsSnapshotBeforeColor = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('connectorSnapshots')).connectorSnapshots.ics))
  const studioColor = connectorSettings.getByLabel('Color for Studio')
  await studioColor.selectOption('emerald')
  await page.waitForFunction(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    return connectors?.ics?.calendars?.[0]?.color === 'emerald'
  })
  assert(await studioColor.inputValue() === 'emerald', 'Calendar Settings color did not update')
  await connectorSettings.getByRole('button', { name: 'Close settings' }).click()
  const calendarColor = await page.evaluate(async (before) => {
    const { connectors, connectorSnapshots } = await chrome.storage.local.get(['connectors', 'connectorSnapshots'])
    return {
      studio: connectors.ics.calendars[0]?.color,
      family: connectors.ics.calendars[1]?.color ?? 'auto',
      snapshotUnchanged: JSON.stringify(connectorSnapshots.ics) === before,
    }
  }, icsSnapshotBeforeColor)
  const visibleDotClasses = await page.locator('[data-block-id="ics"] span').evaluateAll((nodes) => nodes
    .map((node) => node.className)
    .filter((className) => typeof className === 'string' && /bg-(?:fuchsia|emerald|sky)-400/.test(className)))
  assert(calendarColor.studio === 'emerald' && calendarColor.family === 'auto' && calendarColor.snapshotUnchanged,
    `Calendar Settings persistence/cache neutrality failed: ${JSON.stringify(calendarColor)}`)
  assert(visibleDotClasses.some((className) => className.includes('bg-emerald-400')) && !visibleDotClasses.some((className) => className.includes('bg-fuchsia-400')),
    `Visible Calendar dots did not match persisted Emerald selection: ${JSON.stringify(visibleDotClasses)}`)
  evidence.interactions.calendarColor = { ...calendarColor, visibleDotClasses }

  await page.getByRole('button', { name: 'Open settings' }).click()
  const saveSettings = page.getByRole('dialog', { name: 'Settings' })
  await saveSettings.getByRole('tab', { name: 'Widgets' }).click()
  await saveSettings.getByRole('button', { name: 'Arrange layout' }).click()
  const saveToolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await saveToolbar.waitFor()
  const saveClock = page.getByRole('button', { name: 'Edit Clock' })
  await saveClock.click()
  await saveClock.press('ArrowRight')
  await saveToolbar.getByRole('button', { name: 'Save' }).click()
  await saveToolbar.waitFor({ state: 'detached' })
  evidence.interactions.save = await page.evaluate(async () => ({ layoutVersion: (await chrome.storage.local.get('layout')).layout?.version }))
  assert(evidence.interactions.save.layoutVersion === 3, 'Explicit Arrange Save did not persist V3 layout')

  assert(evidence.runtimeErrors.length === 0, `runtime errors: ${evidence.runtimeErrors.join('; ')}`)
  assert(evidence.failedRequests.length === 0, `failed requests: ${evidence.failedRequests.join('; ')}`)
} catch (error) {
  caughtError = error
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/canvas-p7-failure.png`, fullPage: false }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true }).catch(() => {})
  await context.close().then(() => { evidence.cleanup.contextClosed = true }).catch(() => {})
  rmSync(profileDir, { recursive: true, force: true })
  rmSync(dist, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
  evidence.cleanup.distRemoved = true
  writeFileSync(`${outDir}/canvas-p7-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`)
}

console.log(`EVIDENCE: ${JSON.stringify(evidence)}`)
if (caughtError) {
  console.error(`FAIL: Aurora V1 Canvas focused browser proof: ${evidence.error}`)
  process.exitCode = 1
} else {
  console.log('PASS: Aurora V1 Canvas focused browser proof')
}
