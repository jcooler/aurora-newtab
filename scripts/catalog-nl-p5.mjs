// NL-P5 batch-1 visual tier catalog: production-mode preview build, real
// Chromium, one widget per capture at every supported tier, seeded data.
// Writes TRACKED owner-review artifacts to docs/superpowers/catalog/batch-1/
// (PNG per widget-tier plus CATALOG.md). The catalog is the owner gate's
// input (named-layouts spec 2.3): reviewed widget-by-widget before the
// batch's tier family is accepted. Changes no production code.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const repoRoot = process.cwd()
const dist = resolve('.preview-nl-p5-dist')
const profileDir = resolve('.playwright-profile-nl-p5')
const outDir = resolve('docs/superpowers/catalog/batch-1')
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-nl-p5-dist'],
  [profileDir, '.playwright-profile-nl-p5'],
  [outDir, 'batch-1'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe path: ${path}`)
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

// Batch-1 widgets with their supported tiers, mirrored from
// WIDGET_SIZE_CONTRACTS (asserted against the page at runtime below).
const BATCH = [
  { id: 'clock', label: 'Clock', tiers: ['compact', 'standard', 'full', 'docked'] },
  { id: 'greeting', label: 'Greeting', tiers: ['compact', 'standard'] },
  { id: 'search', label: 'Search', tiers: ['compact', 'standard'] },
  { id: 'focus', label: 'Focus', tiers: ['compact', 'standard', 'docked'] },
  { id: 'quote', label: 'Quote', tiers: ['compact', 'standard'] },
  { id: 'weather', label: 'Weather', tiers: ['compact', 'standard', 'full', 'docked'] },
  { id: 'timer', label: 'Timer', tiers: ['compact', 'docked'] },
  { id: 'tasks', label: 'Tasks', tiers: ['compact', 'docked'] },
  { id: 'notes', label: 'Notes', tiers: ['compact', 'docked'] },
  { id: 'bookmarks', label: 'Bookmarks', tiers: ['compact', 'standard', 'docked'] },
]

// Widget-toggle key differs from block id for tasks (todo).
const TOGGLE_KEY = { tasks: 'todo' }

const evidence = { captures: [], failures: [], runtimeErrors: [], failedRequests: [], contracts: null }
const fail = (message) => { evidence.failures.push(message) }

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
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

await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-canvas-surface]')

// One rich seed for every capture: content-full widgets per the no-whitespace
// law (empty widgets photograph as empty pads, not compositions).
await page.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings')
  const day = new Date().toISOString().slice(0, 10)
  const location = { lat: 32.7767, lon: -96.797, label: 'Dallas', manual: true }
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
  await chrome.storage.local.set({
    settings: { ...settings, name: 'Jon', units: 'imperial' },
    focus: { text: 'Review the tier catalog', done: false, date: day },
    notes: { text: 'Catalog notes', updatedAt: Date.now() },
    todoLists: [{ id: 'catalog', name: 'Today', items: [
      { id: 'a', text: 'Review batch 1', done: false },
      { id: 'b', text: 'Approve Docked lines', done: false },
    ] }],
    weatherCache: {
      current: { tempC: 24.4, feelsLikeC: 25, code: 2, windKmh: 11, humidity: 48, isDay: true },
      hourly: Array.from({ length: 12 }, (_, index) => ({
        time: `${day}T${String((9 + index) % 24).padStart(2, '0')}:00`,
        tempC: 22 + index * 0.6,
        precipProb: index === 4 ? 35 : 5,
        code: 2,
        isDay: index < 10,
      })),
      fetchedAt: Date.now(),
      locationLabel: location.label,
      requestIdentity,
      sunriseISO: `${day}T07:02`,
      sunsetISO: `${day}T20:23`,
    },
    location,
  })
  if (chrome.bookmarks) {
    const tree = await chrome.bookmarks.getTree()
    const bar = tree[0]?.children?.[0]
    if (bar && (bar.children ?? []).length === 0) {
      for (const title of ['News', 'Docs', 'Music']) {
        const folder = await chrome.bookmarks.create({ parentId: bar.id, title })
        await chrome.bookmarks.create({ parentId: folder.id, title: `${title} link`, url: `https://example.invalid/${title.toLowerCase()}` })
      }
    }
  }
})

// Cross-check the hardcoded batch matrix against the page's real contracts.
evidence.contracts = await page.evaluate(() => window.__auroraTierContracts ?? null)

const captureWidget = async ({ id, tiers }) => {
  for (const tier of tiers) {
    const name = `${id}-${tier}`
    const toggleKey = { tasks: 'todo' }[id] ?? id
    await page.evaluate(async ({ id, tier, toggleKey }) => {
      const { settings } = await chrome.storage.local.get('settings')
      const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
      if (toggleKey in widgets) widgets[toggleKey] = true
      const placement = tier === 'docked'
        ? { kind: 'docked', dock: 'bottom', order: 0 }
        : { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 0 }
      // The always-available ritual widgets ignore toggles; park them in the
      // far top-left corner so the tight clip isolates the target.
      const parked = {}
      let parkRow = 0
      for (const alwaysId of ['clock', 'greeting', 'search', 'focus']) {
        if (alwaysId === id) continue
        parked[alwaysId] = { kind: 'free', anchor: 'top-left', offsetX: 1, offsetY: 1 + parkRow * 4, tier: 'compact', layer: parkRow }
        parkRow += 1
      }
      await chrome.storage.local.set({
        settings: { ...settings, widgets },
        layouts: {
          version: 1,
          activeLayoutId: 'catalog',
          layouts: [{ id: 'catalog', name: 'Catalog', widgets: { ...parked, [id]: placement.kind === 'free' ? { ...placement, layer: 10 } : placement } }],
        },
      })
    }, { id, tier, toggleKey })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-canvas-surface]')
    await page.waitForTimeout(450)
    const box = await page.evaluate((id) => {
      const nodes = document.querySelectorAll(`[data-block-id="${id}"]`)
      if (nodes.length !== 1) return { error: `${nodes.length} nodes` }
      const rect = nodes[0].getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, dockLine: Boolean(nodes[0].querySelector('[data-dock-line]')) }
    }, id)
    if (box.error) { fail(`${name}: ${box.error}`); continue }
    if (box.width < 8 || box.height < 8) { fail(`${name}: degenerate size ${box.width}x${box.height}`); continue }
    if (tier === 'docked' && (id === 'weather' || id === 'clock') && !box.dockLine) {
      fail(`${name}: designed dock line missing`)
    }
    const pad = 12
    await page.screenshot({
      path: resolve(outDir, `${name}.png`),
      clip: {
        x: Math.max(0, box.left - pad),
        y: Math.max(0, box.top - pad),
        width: Math.min(1600, box.width + pad * 2),
        height: Math.min(900, box.height + pad * 2),
      },
    })
    evidence.captures.push({ name, width: Math.round(box.width), height: Math.round(box.height) })
  }
}

let caughtError
try {
  for (const widget of BATCH) await captureWidget(widget)
} catch (error) {
  caughtError = error
} finally {
  try { await context.close() } catch { /* ignore */ }
}

// CATALOG.md: the owner-review index. Contract strings mirrored from
// widgetSizeContracts.ts; per-tier verdict lines for the review session.
const CONTRACTS = {
  clock: { compact: 'Current time', standard: 'Time and date', full: 'Large, legible time and date', docked: 'Time · date' },
  greeting: { compact: 'Greeting', standard: 'More legible greeting' },
  search: { compact: 'Search action', standard: 'More legible search action' },
  focus: { compact: 'Focus action', standard: 'Focus detail', docked: 'Focus text and completion' },
  quote: { compact: 'Quote', standard: 'Readable full quote' },
  weather: { compact: 'Current temperature and condition', standard: 'Forecast context', full: 'Detailed forecast', docked: 'Temperature · location · condition' },
  timer: { compact: 'Timer action', docked: 'Timer state' },
  tasks: { compact: 'Tasks action', docked: 'Tasks action' },
  notes: { compact: 'Notes action', docked: 'Notes action' },
  bookmarks: { compact: 'Bookmark marks', standard: 'Named bookmark bar', docked: 'Full readable bookmark bar' },
}

const lines = [
  '# NL-P5 Tier Catalog — Batch 1',
  '',
  'Owner review per the named-layouts spec §2.3: each widget, each supported',
  'tier, judged as a designed composition under the no-whitespace law. Docked',
  'lines are one dense text-first row (middle dots separate facts). Captures',
  'were taken from the production preview build at 1600x900 with seeded data.',
  '',
  'Batch-1 notes for the review:',
  '- Timer/Tasks/Notes Docked lines are their existing dense launcher chips, declared rather than rebuilt.',
  '- Bookmarks Docked is the full readable bar (spec exemption).',
  '- Focus Docked is its existing single-line form rendered in the strip.',
  '- greeting, search, and quote declare NO Docked tier in batch 1 (no honest one-line dock form); overrule here if wanted.',
  '',
]
for (const { id, label, tiers } of BATCH) {
  lines.push(`## ${label}`, '')
  lines.push('| Tier | Content contract | Capture | Owner verdict |')
  lines.push('| --- | --- | --- | --- |')
  for (const tier of tiers) {
    lines.push(`| ${tier} | ${CONTRACTS[id][tier]} | ![${id} ${tier}](${id}-${tier}.png) | _pending_ |`)
  }
  lines.push('')
}
writeFileSync(resolve(outDir, 'CATALOG.md'), lines.join('\n'))

const summary = {
  captures: evidence.captures.length,
  failures: evidence.failures,
  runtimeErrors: evidence.runtimeErrors,
  failedRequests: evidence.failedRequests,
}
console.log(JSON.stringify(summary, null, 2))
if (caughtError) {
  console.error('CATALOG ERROR:', caughtError)
  process.exitCode = 1
} else if (evidence.failures.length > 0 || evidence.runtimeErrors.length > 0 || evidence.failedRequests.length > 0) {
  console.error('FAIL: NL-P5 batch 1 catalog')
  process.exitCode = 1
} else {
  console.log('PASS: NL-P5 batch 1 catalog')
}
