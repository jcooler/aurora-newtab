// NL-P5 visual tier catalog: production-mode preview build, real Chromium,
// one widget per capture at every supported tier, seeded data. Writes
// TRACKED owner-review artifacts to docs/superpowers/catalog/batch-<n>/
// (PNG per widget-tier plus CATALOG.md). The catalog is the owner gate's
// input (named-layouts spec 2.3): reviewed widget-by-widget before the
// batch's tier family is accepted. Changes no production code.
//
//   node scripts/catalog-nl-p5.mjs            # batch 1 (owner-approved 2026-08-18)
//   node scripts/catalog-nl-p5.mjs --batch=2  # batch 2 (connectors + small widgets)
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'

const batch = process.argv.includes('--batch=2') ? '2' : '1'
const repoRoot = process.cwd()
const dist = resolve('.preview-nl-p5-dist')
const profileDir = resolve('.playwright-profile-nl-p5')
const outDir = resolve(`docs/superpowers/catalog/batch-${batch}`)
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-nl-p5-dist'],
  [profileDir, '.playwright-profile-nl-p5'],
  [outDir, `batch-${batch}`],
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

// Per-batch widget matrices with their supported tiers, mirrored from
// WIDGET_SIZE_CONTRACTS (drift-guarded against the source below).
const BATCH_1 = [
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

const BATCH_2 = [
  { id: 'github', label: 'GitHub', tiers: ['compact', 'standard', 'full', 'docked'] },
  { id: 'gitlab', label: 'GitLab', tiers: ['compact', 'standard', 'full', 'docked'] },
  { id: 'jira', label: 'Jira', tiers: ['compact', 'standard', 'full', 'docked'] },
  { id: 'vercel', label: 'Vercel', tiers: ['compact', 'standard', 'full', 'docked'] },
  { id: 'status', label: 'Status', tiers: ['compact', 'standard', 'docked'] },
  { id: 'rss', label: 'Headlines', tiers: ['compact', 'standard', 'full', 'docked'] },
  { id: 'crypto', label: 'Crypto', tiers: ['compact', 'standard', 'docked'] },
  { id: 'homeassistant', label: 'Home Assistant', tiers: ['compact', 'standard', 'full', 'docked'] },
  { id: 'ics', label: 'Calendar', tiers: ['compact', 'standard', 'docked'] },
  { id: 'habits', label: 'Habits', tiers: ['compact', 'docked'] },
  { id: 'worldClocks', label: 'World clocks', tiers: ['compact', 'standard', 'full', 'docked'] },
  { id: 'countdown', label: 'Countdown', tiers: ['compact', 'standard', 'docked'] },
  { id: 'sun', label: 'Sun', tiers: ['compact', 'standard', 'docked'] },
  { id: 'moon', label: 'Moon', tiers: ['compact', 'docked'] },
  { id: 'monthCal', label: 'Month', tiers: ['compact', 'standard'] },
  { id: 'links', label: 'Quick Links', tiers: ['compact', 'standard'] },
]

// The ten batch-2 widgets with CODED dock lines (declare-only widgets render
// their compact composition in the strip; the catalog shows it for judgment).
const CODED_DOCK_LINES = new Set([
  'weather', 'clock',
  'github', 'gitlab', 'jira', 'vercel', 'status', 'rss', 'crypto', 'homeassistant', 'ics', 'habits',
])

const BATCH = batch === '2' ? BATCH_2 : BATCH_1

const evidence = { captures: [], failures: [], runtimeErrors: [], failedRequests: [] }
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
if (batch === '2') {
  // The authoritative nine-connector fixture (configs + scope-valid
  // snapshots), shared with the information-first evidence path.
  await seedInformationFirstFixtures(page)
}
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
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  await chrome.storage.local.set({
    settings: { ...settings, name: 'Jon', units: 'imperial' },
    focus: { text: 'Review the tier catalog', done: false, date: day },
    notes: { text: 'Catalog notes', updatedAt: Date.now() },
    todoLists: [{ id: 'catalog', name: 'Today', items: [
      { id: 'a', text: 'Review batch captures', done: false },
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
    worldClocks: [
      { zone: 'Europe/London', label: 'London' },
      { zone: 'Asia/Tokyo', label: 'Tokyo' },
    ],
    countdowns: [{ id: 'launch', name: 'Aurora 2.0 launch', date: new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10) }],
    habits: [
      { id: 'walk', name: 'Walk', createdAt: Date.now() - 30 * 86_400_000, log: [yesterday, day] },
      { id: 'read', name: 'Read', createdAt: Date.now() - 30 * 86_400_000, log: [day] },
      { id: 'water', name: 'Water', createdAt: Date.now() - 30 * 86_400_000, log: [yesterday] },
    ],
    links: [
      { id: 'roadmap', title: 'Roadmap', url: 'https://example.invalid/roadmap' },
      { id: 'design', title: 'Design', url: 'https://example.invalid/design' },
    ],
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

const captureWidget = async ({ id, tiers }) => {
  for (const tier of tiers) {
    const name = `${id}-${tier}`
    const toggleKey = { tasks: 'todo', worldClocks: 'clocks' }[id] ?? id
    await page.evaluate(async ({ id, tier, toggleKey, isBatch2 }) => {
      const stored = await chrome.storage.local.get(['settings', 'informationFirstFixture'])
      const settings = stored.settings
      const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
      if (toggleKey in widgets) widgets[toggleKey] = true
      // Isolate the target: for batch 2 every connector except the target is
      // disabled (config preserved; only the target's scope must stay valid,
      // and its config is untouched).
      const patch = { settings: { ...settings, widgets } }
      if (isBatch2 && stored.informationFirstFixture) {
        patch.connectors = Object.fromEntries(
          Object.entries(stored.informationFirstFixture.configs).map(([cid, config]) => [
            cid,
            { ...config, enabled: cid === id },
          ]),
        )
      }
      const placement = tier === 'docked'
        ? { kind: 'docked', dock: 'bottom', order: 0 }
        : { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 10 }
      // The always-available ritual widgets ignore toggles; park them in the
      // far top-left corner so the tight clip isolates the target.
      const parked = {}
      let parkRow = 0
      for (const alwaysId of ['clock', 'greeting', 'search', 'focus']) {
        if (alwaysId === id) continue
        parked[alwaysId] = { kind: 'free', anchor: 'top-left', offsetX: 1, offsetY: 1 + parkRow * 4, tier: 'compact', layer: parkRow }
        parkRow += 1
      }
      patch.layouts = {
        version: 1,
        activeLayoutId: 'catalog',
        layouts: [{ id: 'catalog', name: 'Catalog', widgets: { ...parked, [id]: placement } }],
      }
      await chrome.storage.local.set(patch)
    }, { id, tier, toggleKey, isBatch2: batch === '2' })
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
    if (tier === 'docked' && CODED_DOCK_LINES.has(id) && !box.dockLine) {
      fail(`${name}: designed dock line missing`)
    }
    if (tier === 'docked' && !CODED_DOCK_LINES.has(id) && box.height > 48) {
      fail(`${name}: declare-only dock member exceeds one-line geometry (${Math.round(box.height)}px)`)
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
// widgetSizeContracts.ts — and VERIFIED against it below (drift in this map
// fails the run), so the owner never reads a stale contract.
const CONTRACTS_1 = {
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

const CONTRACTS_2 = {
  github: { compact: 'Selected primary count or graph', standard: 'Selected graph or rows', full: 'Graph, stats, and all selected row families', docked: 'Selected activity counts' },
  gitlab: { compact: 'Selected primary count or graph', standard: 'Selected graph or rows', full: 'All selected GitLab sections', docked: 'Selected activity counts' },
  jira: { compact: 'Selected-view count', standard: 'Prioritized issue rows', full: 'All selected Jira sections', docked: 'Selected issue counts' },
  vercel: { compact: 'Deployment health', standard: 'Selected deployment rows or summary', full: 'All selected deployment sections', docked: 'Deployment health' },
  status: { compact: 'Service health', standard: 'Service dots and active issues', docked: 'Service health' },
  rss: { compact: 'Top headline', standard: 'Selected headlines', full: 'All selected headlines that fit', docked: 'Top headline' },
  crypto: { compact: 'Primary coin price', standard: 'Selected coin prices', docked: 'Primary coin price' },
  homeassistant: { compact: 'Selected entity or action', standard: 'Selected entities and actions', full: 'Complete selected home composition', docked: 'Selected entity state' },
  ics: { compact: 'Next event', standard: 'Selected calendar view', docked: 'Next event' },
  habits: { compact: 'Habit action', docked: 'Habits done today' },
  worldClocks: { compact: 'Primary world clock', standard: 'Selected clocks', full: 'All selected clocks', docked: 'Primary world clock' },
  countdown: { compact: 'Countdown', standard: 'Countdown detail', docked: 'Next countdown' },
  sun: { compact: 'Next sun event', standard: 'Sunrise and sunset', docked: 'Next sun event' },
  moon: { compact: 'Current phase', docked: 'Current phase' },
  monthCal: { compact: 'Current week', standard: 'Complete month' },
  links: { compact: 'Primary link action', standard: 'Selected quick links' },
}

const CONTRACTS = batch === '2' ? CONTRACTS_2 : CONTRACTS_1

// Drift guard (batch-1 review fix I1): every contract string in the active
// map must appear verbatim in widgetSizeContracts.ts, or the run fails.
const contractsSource = readFileSync(resolve('src/newtab/widgetSizeContracts.ts'), 'utf8')
for (const [id, tiers] of Object.entries(CONTRACTS)) {
  for (const [tier, text] of Object.entries(tiers)) {
    if (!contractsSource.includes(`'${text}'`)) {
      fail(`CATALOG drift: ${id}.${tier} contract "${text}" not found in widgetSizeContracts.ts`)
    }
  }
}

// Identical-capture disclosure (batch-1 review fix I2): tiers whose captures
// are byte-identical are annotated so the owner's verdict is informed — a
// contract column promising more than the pixels show would be a lie.
const captureHash = (name) => {
  try {
    return createHash('md5').update(readFileSync(resolve(outDir, `${name}.png`))).digest('hex')
  } catch {
    return null
  }
}
const identicalTo = (id, tier, tiers) => {
  const own = captureHash(`${id}-${tier}`)
  if (!own) return null
  for (const other of tiers) {
    if (other === tier) break
    if (captureHash(`${id}-${other}`) === own) return other
  }
  return null
}

const HEADER_1 = [
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
  '- The docked Weather line omits the free chip\'s staleness/offline feedback text (a one-dense-line tradeoff); a stale cache reads like a fresh one in the strip. Owner call: accept, or add a muted staleness marker.',
  '',
]

const HEADER_2 = [
  '# NL-P5 Tier Catalog — Batch 2',
  '',
  'Owner review per the named-layouts spec §2.3: the nine connector widgets',
  'plus the remaining small widgets, each at every supported tier. Docked',
  'lines are one dense text-first row (middle dots separate facts), built',
  'from the SAME snapshot each widget already renders — no second fetch.',
  'Captures were taken from the production preview build at 1600x900 with',
  'the authoritative nine-connector fixture data.',
  '',
  'Batch-2 notes for the review:',
  '- Connector dock lines are non-interactive readouts: their free forms offer no panel or expansion, so a readout IS click parity (spec 2.4). Overrule here if a docked connector should open something.',
  '- worldClocks, countdown, sun, and moon declare Docked with their existing compact single-line compositions (declared, not rebuilt); judge them in the strip captures.',
  '- monthCal and links declare NO Docked tier (a month grid and a launcher grid have no honest one-line form); overrule here if wanted.',
  '- The GitHub line follows the spec\'s own example shape (PRs · issues · unread). Quiet states read "All clear".',
  '',
]

const APPROVED = 'Approved (owner review 2026-08-18)'
const VERDICTS_1 = {
  'weather-compact': 'Approved with refinement (2026-08-18): the F/C scale letter was a smidge too large — pinned to the 12px metadata floor. Applied.',
  'bookmarks-compact': 'Approved with refinement (2026-08-18): single-letter folder marks (N for News, D for Docs, M for Music). Applied.',
}

const lines = batch === '2' ? [...HEADER_2] : [...HEADER_1]
const verdicts = batch === '2' ? {} : VERDICTS_1
const defaultVerdict = batch === '2' ? '_pending_' : APPROVED

for (const { id, label, tiers } of BATCH) {
  lines.push(`## ${label}`, '')
  lines.push('| Tier | Content contract | Capture | Owner verdict |')
  lines.push('| --- | --- | --- | --- |')
  for (const tier of tiers) {
    const twin = identicalTo(id, tier, tiers)
    const disclosure = twin
      ? `<br>_Currently renders identically to ${twin}${id === 'bookmarks' ? ' (spec exemption: the full readable bar at every tier)' : ' — tier differentiation pending owner direction'}_`
      : ''
    const verdict = verdicts[`${id}-${tier}`] ?? defaultVerdict
    lines.push(`| ${tier} | ${CONTRACTS[id][tier]}${disclosure} | ![${id} ${tier}](${id}-${tier}.png) | ${verdict} |`)
  }
  lines.push('')
}
writeFileSync(resolve(outDir, 'CATALOG.md'), lines.join('\n'))

const summary = {
  batch,
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
  console.error(`FAIL: NL-P5 batch ${batch} catalog`)
  process.exitCode = 1
} else {
  console.log(`PASS: NL-P5 batch ${batch} catalog`)
}
