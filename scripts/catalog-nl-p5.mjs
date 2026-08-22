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
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import { checkCatalogArtifacts, parseCatalogArgs, renderCatalogMarkdown } from './catalog-nl-p5-content.mjs'
import { CATALOG_BATCHES, CATALOG_CONTRACTS, CODED_DOCK_LINES } from './widget-catalog-manifest.mjs'

const options = parseCatalogArgs(process.argv.slice(2))
const { batch, headed, outDir } = options
if (options.check) {
  const result = await checkCatalogArtifacts({ batch, outDir, readFile })
  if (!result.ok) result.errors.forEach((error) => process.stderr.write(`${error}\n`))
  process.exit(result.ok ? 0 : 1)
}

const repoRoot = process.cwd()
const dist = resolve('.preview-nl-p5-dist')
const profileDir = resolve('.playwright-profile-nl-p5')

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

// Shared with executable widget/tier contracts. Owner verdicts remain below.
const BATCH = CATALOG_BATCHES[batch]

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
const CONTRACTS = CATALOG_CONTRACTS[batch]

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

const catalogMarkdown = renderCatalogMarkdown({
  batch,
  captureHash: (name) => {
    try {
      return createHash('md5').update(readFileSync(resolve(outDir, `${name}.png`))).digest('hex')
    } catch {
      return null
    }
  },
})
writeFileSync(resolve(outDir, 'CATALOG.md'), catalogMarkdown)

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
