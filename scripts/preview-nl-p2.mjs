// Focused NL-P2 anchored-canvas witness: production-mode preview build, real
// Chromium, existing-layout-shaped storage, real pointer interactions.
// Proves the named-layouts rendering contract (2026-08-17 spec §2.2/§6):
// anchored percent geometry, content-tight boxes, the 600px mechanical
// narrow floor, no selection ring on plain clicks, anchor-glued resizes, and
// stored-document rendering with docks. Writes evidence JSON + PNGs under
// .preview-nl-p2-out/. Changes no production code and no tracked file.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const repoRoot = process.cwd()
const dist = resolve('.preview-nl-p2-dist')
const profileDir = resolve('.playwright-profile-nl-p2')
const outDir = resolve('.preview-nl-p2-out')
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-nl-p2-dist'],
  [profileDir, '.playwright-profile-nl-p2'],
  [outDir, '.preview-nl-p2-out'],
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

const evidence = { captures: [], resize: null, storedDocument: null, runtimeErrors: [], failedRequests: [], failures: [] }
const fail = (message) => { evidence.failures.push(message) }

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
  await page.waitForTimeout(250)
}

const OWNER_WIDGETS = ['search', 'weather', 'todo', 'timer', 'quote', 'bookmarks', 'notes', 'monthCal', 'sun', 'ics']

const seedBase = () => page.evaluate(async (ownerWidgets) => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
  for (const key of ownerWidgets) if (key in widgets) widgets[key] = true
  const day = new Date().toISOString().slice(0, 10)
  await chrome.storage.local.set({
    settings: { ...settings, widgets },
    focus: { text: 'Ship Aurora', done: false, date: day },
  })
}, OWNER_WIDGETS)

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

const V3_CUSTOM = {
  version: 3,
  profiles: {
    standard: {
      mode: 'custom',
      placements: {
        bookmarks: { kind: 'bottom-bar', order: 0, size: 'compact' },
        clock: { kind: 'canvas', x: 50, y: 28, size: 'full', layer: 0 },
        weather: { kind: 'canvas', x: 90, y: 12, size: 'standard', layer: 1 },
        search: { kind: 'canvas', x: 50, y: 55, size: 'standard', layer: 2 },
        focus: { kind: 'canvas', x: 50, y: 66, size: 'standard', layer: 3 },
        quote: { kind: 'canvas', x: 50, y: 88, size: 'standard', layer: 4 },
        timer: { kind: 'canvas', x: 8, y: 12, size: 'compact', layer: 5 },
      },
    },
  },
}

// A stored layouts document (schema-v13 `layouts` key, document version 1):
// anchored items plus BOTH docks.
const LAYOUTS_DOCUMENT = {
  version: 1,
  activeLayoutId: 'witness',
  layouts: [{
    id: 'witness',
    name: 'Witness',
    widgets: {
      clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -22, tier: 'full', layer: 0 },
      search: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 5, tier: 'standard', layer: 1 },
      focus: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 14, tier: 'standard', layer: 2 },
      quote: { kind: 'free', anchor: 'bottom', offsetX: 0, offsetY: -12, tier: 'standard', layer: 3 },
      weather: { kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 12, tier: 'standard', layer: 4 },
      notes: { kind: 'free', anchor: 'bottom-left', offsetX: 7, offsetY: -9, tier: 'compact', layer: 5 },
      timer: { kind: 'docked', dock: 'top', order: 0 },
      todo: { kind: 'docked', dock: 'bottom', order: 0 },
      bookmarks: { kind: 'docked', dock: 'bottom', order: 1 },
    },
  }],
}

const snapshotState = (label) => page.evaluate((label) => {
  const surface = document.querySelector('[data-canvas-surface]')
  const items = [...document.querySelectorAll('[data-block-id]')].map((node) => {
    const r = node.getBoundingClientRect()
    const child = node.firstElementChild?.getBoundingClientRect() ?? null
    return {
      id: node.getAttribute('data-block-id'),
      size: node.getAttribute('data-canvas-size'),
      mode: node.getAttribute('data-canvas-mode'),
      leftStyle: node.style.left,
      topStyle: node.style.top,
      top: Math.round(r.top), left: Math.round(r.left),
      width: Math.round(r.width), height: Math.round(r.height),
      contentDeltaW: child ? Math.abs(r.width - child.width) : null,
      contentDeltaH: child ? Math.abs(r.height - child.height) : null,
      stageVariant: node.getAttribute('data-stage-variant'),
      hasBoardItemClass: node.classList.contains('board-item'),
    }
  })
  return {
    label,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    narrow: surface?.getAttribute('data-canvas-narrow'),
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    topBar: Boolean(document.querySelector('.canvas-top-bar')),
    bottomBar: Boolean(document.querySelector('.canvas-bottom-bar')),
    itemIds: items.map((i) => i.id),
    items,
  }
}, label)

const assertCommon = (state, name) => {
  const counts = new Map()
  for (const id of state.itemIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const [id, count] of counts) {
    if (count !== 1) fail(`${name}: ${id} rendered ${count} times`)
  }
  if (state.itemIds.length < 8) fail(`${name}: only ${state.itemIds.length} widgets rendered`)
  if (state.horizontalOverflow > 0) fail(`${name}: horizontal overflow ${state.horizontalOverflow}px`)
  for (const item of state.items) {
    if (item.stageVariant !== null) fail(`${name}: ${item.id} still emits data-stage-variant`)
    if (item.hasBoardItemClass) fail(`${name}: ${item.id} still emits board-item`)
  }
  // Content-tight witness (acceptance 3): sampled wrappers hug their content
  // within 1 CSS px per axis.
  for (const id of ['clock', 'quote', 'focus']) {
    const item = state.items.find((i) => i.id === id)
    if (!item || item.contentDeltaW === null) continue
    if (item.contentDeltaW > 1 || item.contentDeltaH > 1) {
      fail(`${name}: ${id} box is not content-tight (dW=${item.contentDeltaW}, dH=${item.contentDeltaH})`)
    }
  }
}

const assertStack = (state, name) => {
  if (state.narrow !== 'true') fail(`${name}: narrow floor not active`)
  const surfaceItems = state.items.filter((i) => i.mode === 'stacked')
  if (surfaceItems.length !== state.items.length) fail(`${name}: non-stacked items below the floor`)
  const sorted = [...surfaceItems].sort((a, b) => a.top - b.top)
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].top < sorted[i - 1].top + sorted[i - 1].height - 1) {
      fail(`${name}: ${sorted[i].id} overlaps ${sorted[i - 1].id} in the stack`)
    }
  }
  if (state.topBar || state.bottomBar) fail(`${name}: dock strips painted below the floor`)
}

const noRingWitness = async (name) => {
  // Plain click on a widget wrapper must paint no selection ring
  // (acceptance 4). Quote has pointer-events fall-through, so the click
  // reaches the wrapper itself.
  const target = page.locator('[data-block-id="quote"]')
  if (await target.count() === 0) return
  await target.click({ position: { x: 10, y: 10 }, force: true })
  await page.waitForTimeout(120)
  const ring = await page.evaluate(() => {
    const results = []
    for (const node of document.querySelectorAll('[data-block-id]')) {
      const style = getComputedStyle(node)
      if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) {
        results.push(`${node.getAttribute('data-block-id')}: ${style.outlineStyle} ${style.outlineWidth}`)
      }
    }
    return results
  })
  for (const entry of ring) fail(`${name}: selection ring painted on ${entry}`)
}

const applyState = async (seedLayout, layoutsDocument) => {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await seedBase()
  if (seedLayout === null) {
    await page.evaluate(() => chrome.storage.local.remove('layout'))
  } else {
    await page.evaluate((layout) => chrome.storage.local.set({ layout }), seedLayout)
  }
  if (layoutsDocument === null) {
    await page.evaluate(() => chrome.storage.local.remove('layouts'))
  } else {
    await page.evaluate((layouts) => chrome.storage.local.set({ layouts }), layoutsDocument)
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await page.waitForTimeout(500)
}

const DISPLAYS = [
  { width: 1408, height: 445 },
  { width: 1920, height: 1080 },
  { width: 800, height: 600 },
  { width: 599, height: 800 },
  { width: 390, height: 844 },
]

const SHAPES = [
  { name: 'fresh-derived', layout: null, layouts: null },
  { name: 'v1-user-layout', layout: V1_LAYOUT, layouts: null },
  { name: 'v3-custom', layout: V3_CUSTOM, layouts: null },
  { name: 'stored-document', layout: null, layouts: LAYOUTS_DOCUMENT },
]

let caughtError
try {
  for (const shape of SHAPES) {
    await page.setViewportSize(DISPLAYS[0])
    await applyState(shape.layout, shape.layouts)
    for (const vp of DISPLAYS) {
      await page.setViewportSize(vp)
      await page.waitForTimeout(350)
      const name = `${shape.name}-${vp.width}x${vp.height}`
      const state = await snapshotState(name)
      evidence.captures.push(state)
      assertCommon(state, name)
      if (vp.width < 600) assertStack(state, name)
      else if (state.narrow === 'true') fail(`${name}: narrow floor active above 600px`)
      if (shape.name === 'stored-document' && vp.width >= 600) {
        if (!state.topBar) fail(`${name}: top dock strip missing`)
        if (!state.bottomBar) fail(`${name}: bottom dock strip missing`)
        const timer = state.items.find((i) => i.id === 'timer')
        if (timer?.mode !== 'docked') fail(`${name}: timer not docked`)
      }
      await page.screenshot({ path: resolve(outDir, `${name}.png`) })
    }
    await page.setViewportSize(DISPLAYS[0])
    await page.waitForTimeout(300)
    await noRingWitness(shape.name)
  }

  // Resize witness (acceptance 2): anchored percent positions never move.
  await page.setViewportSize({ width: 1408, height: 445 })
  await applyState(null, LAYOUTS_DOCUMENT)
  const percentsAt = () => page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('[data-canvas-mode="anchored"]')]
      .map((node) => [node.getAttribute('data-block-id'), `${node.style.left}|${node.style.top}`]),
  ))
  const before = await percentsAt()
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.waitForTimeout(350)
  const at1920 = await percentsAt()
  await page.setViewportSize({ width: 1408, height: 445 })
  await page.waitForTimeout(350)
  const back = await percentsAt()
  evidence.resize = { before, at1920, back }
  for (const [id, value] of Object.entries(before)) {
    if (at1920[id] !== value) fail(`resize: ${id} moved at 1920x1080 (${value} -> ${at1920[id]})`)
    if (back[id] !== value) fail(`resize: ${id} did not restore (${value} -> ${back[id]})`)
  }

  // Stored-document reload witness: the document is byte-identical after a
  // reload and rendering still honors it (no boot rewrite, exact recovery).
  const storedBefore = await page.evaluate(() => chrome.storage.local.get(['layouts', 'layout']))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  const storedAfter = await page.evaluate(() => chrome.storage.local.get(['layouts', 'layout']))
  evidence.storedDocument = {
    identical: JSON.stringify(storedBefore) === JSON.stringify(storedAfter),
  }
  if (!evidence.storedDocument.identical) fail('stored layouts/layout changed across a reload')
} catch (error) {
  caughtError = error
} finally {
  try { await context.close() } catch { /* ignore */ }
}

writeFileSync(resolve(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
const summary = {
  captures: evidence.captures.length,
  failures: evidence.failures,
  runtimeErrors: evidence.runtimeErrors,
  failedRequests: evidence.failedRequests,
}
console.log(JSON.stringify(summary, null, 2))
if (caughtError) {
  console.error('NL-P2 WITNESS ERROR:', caughtError)
  process.exitCode = 1
} else if (evidence.failures.length > 0 || evidence.runtimeErrors.length > 0 || evidence.failedRequests.length > 0) {
  console.error('FAIL: NL-P2 anchored canvas')
  process.exitCode = 1
} else {
  console.log('PASS: NL-P2 anchored canvas')
}
