// DY-P1 two-axis dock witness. The baseline phase runs against the exact
// pre-packet checkpoint and permanently records how legacy dock placements
// with no `y` render. Later phases may compare against this ignored scratch
// evidence, but must never rewrite it without an explicit replacement flag.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { BLOCK_IDS } from '../src/lib/layout/types.ts'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import { assertCleanTrackedStatus } from './build-contracts.mjs'
import { assertBuildProvenance } from './work-connector-harness-contracts.mjs'
import { assertLegacyScreenshotEquality, prepareDyOutputDir } from './qa-dy-p1-output.mjs'

export const DY_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1366, height: 768 }),
  Object.freeze({ width: 1408, height: 445 }),
  Object.freeze({ width: 1600, height: 900 }),
  Object.freeze({ width: 599, height: 800 }),
  Object.freeze({ width: 600, height: 800 }),
])

export const DY_BEHAVIORS = Object.freeze([
  'return-tier',
  'pointer-cancel',
  'explicit-cancel',
  'alt-bypass',
  'top-to-bottom',
  'bottom-to-top',
  'two-axis-guides',
  'live-overlap',
  'legacy-baseline',
  'byte-stable-layouts',
  'legacy-layout-write-rejection',
  'legacy-screenshot-equality',
  'hidden-widget-recovery',
  'explicit-edge-clamp',
  'mixed-dock-reading-order',
  'bookmark-tier-choice',
  'narrow-boundary',
])

const argv = process.argv.slice(2)
if (argv.includes('--describe')) {
  console.log(JSON.stringify({
    viewports: DY_VIEWPORTS,
    behaviors: DY_BEHAVIORS,
    provenance: {
      build: 'git-head-preview-build',
      recordsCommit: true,
      rejectsDirtyTrackedSource: true,
      verifiesBuiltCommit: true,
    },
  }))
  process.exit(0)
}
const phase = argv.find((value) => value.startsWith('--phase='))?.slice('--phase='.length) ?? 'baseline'
if (!['baseline', 'after'].includes(phase)) throw new Error(`unknown DY-P1 phase: ${phase}`)
const baselineOnly = argv.includes('--baseline-only')

const repoRoot = process.cwd()
assertCleanTrackedStatus(spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).stdout)
const dist = resolve(repoRoot, '.qa-dy-p1-dist')
const profileDir = resolve(repoRoot, '.playwright-profile-qa-dy-p1')
let outDir = prepareDyOutputDir(argv, repoRoot, phase)
const evidencePath = resolve(outDir, 'evidence.json')
const replaceBaseline = argv.includes('--replace-baseline')
const baselineEvidencePath = resolve(repoRoot, '.qa-dy-p1-baseline', 'evidence.json')
const baselineEvidence = phase === 'after'
  ? JSON.parse(readFileSync(baselineEvidencePath, 'utf8'))
  : null

if (phase === 'baseline' && existsSync(evidencePath) && !replaceBaseline) {
  throw new Error('DY-P1 baseline already exists; pass --replace-baseline to replace it deliberately')
}
if (phase === 'baseline' && replaceBaseline) {
  rmSync(outDir, { recursive: true, force: true })
  outDir = prepareDyOutputDir(argv, repoRoot, phase)
}
if (phase === 'after') {
  rmSync(outDir, { recursive: true, force: true })
  outDir = prepareDyOutputDir(argv, repoRoot, phase)
}

for (const [path, suffix] of [
  [dist, '.qa-dy-p1-dist'],
  [profileDir, '.playwright-profile-qa-dy-p1'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe DY-P1 scratch path: ${path}`)
  rmSync(path, { recursive: true, force: true })
}

const commit = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).stdout.trim()
const build = spawnSync(process.execPath, [
  resolve(repoRoot, 'node_modules/vite/bin/vite.js'),
  'build', '--mode', 'preview', '--outDir', dist, '--emptyOutDir',
], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: { ...process.env, AURORA_BUILD_COMMIT: commit },
})
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`DY-P1 preview build failed: ${build.status}`)
}
assertBuildProvenance(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'), commit)

const evidence = {
  phase,
  commit,
  ...(baselineEvidence ? { baselineCommit: baselineEvidence.commit } : {}),
  viewports: DY_VIEWPORTS,
  desktop: [],
  boundaries: [],
  interactionBoundaries: [],
  interactions: [],
  writes: [],
  runtimeErrors: [],
  failedRequests: [],
  failures: [],
  comparisons: [],
  screenshotComparisons: [],
  edgeSafety: [],
}
const fail = (message) => { evidence.failures.push(message) }
const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const key = ({ width, height }) => `${width}x${height}`
const canonicalJson = (value) => JSON.stringify(value, (_key, candidate) => (
  candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? Object.fromEntries(Object.entries(candidate).sort(([a], [b]) => a.localeCompare(b)))
    : candidate
))

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !argv.includes('--headed'),
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(20_000)

const runtimeErrors = []
const failedRequests = []
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
})

const waitForCanvas = async () => {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForFunction(() => {
    const expected = ['weather', 'bookmarks', 'tasks', 'notes']
    return expected.every((id) => {
      const item = document.querySelector(`[data-block-id="${id}"]`)
      if (!item || item.hasAttribute('data-canvas-empty')) return false
      const rect = item.getBoundingClientRect()
      return rect.width >= 4 && rect.height >= 4
    })
  })
  await page.waitForTimeout(180)
}

const armWriteLog = () => page.evaluate(() => {
  window.__dyWriteLog = []
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') window.__dyWriteLog.push(Object.keys(changes).sort())
  })
})

const harvestWrites = async (label, allowed = []) => {
  const writes = await page.evaluate(() => {
    const current = window.__dyWriteLog ?? []
    window.__dyWriteLog = []
    return current
  })
  for (const keys of writes) {
    const joined = keys.join(',')
    const expected = allowed.includes(joined)
    evidence.writes.push({ label, keys, expected })
    if (keys.includes('layout')) fail(`${label}: forbidden legacy layout write (${joined})`)
    if (!expected) fail(`${label}: unexpected storage write (${joined})`)
  }
  return writes
}

const reloadForViewport = async (viewport) => {
  await page.setViewportSize(viewport)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await armWriteLog()
}

const currentLayoutsJson = () => page.evaluate(async () => {
  const { layouts } = await chrome.storage.local.get('layouts')
  return JSON.stringify(layouts)
})

const seedInteractionLayout = () => page.evaluate(async ({ blockIds }) => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgetFlags = Object.fromEntries(Object.keys(settings.widgets).map((id) => [id, false]))
  Object.assign(widgetFlags, { weather: true, bookmarks: true, todo: true, notes: true, clock: true })
  const widgets = Object.fromEntries(blockIds.map((id) => [id, { kind: 'hidden' }]))
  Object.assign(widgets, {
    weather: {
      kind: 'free', anchor: 'center', offsetX: 0, offsetY: -8,
      tier: 'standard', layer: 4,
    },
    bookmarks: {
      kind: 'docked', dock: 'top', order: 0, x: 12, y: 18,
      tier: 'compact', returnTier: 'standard',
    },
    tasks: {
      kind: 'docked', dock: 'bottom', order: 0, x: 50, y: 50,
      tier: 'compact', returnTier: 'compact',
    },
    notes: {
      kind: 'docked', dock: 'bottom', order: 1, x: 80, y: 70,
      tier: 'compact', returnTier: 'compact',
    },
  })
  const layouts = {
    version: 1,
    activeLayoutId: 'dy-interactions',
    layouts: [{ id: 'dy-interactions', name: 'DY interactions', widgets }],
  }
  await chrome.storage.local.set({ settings: { ...settings, widgets: widgetFlags }, layouts })
  return JSON.stringify(layouts)
}, { blockIds: BLOCK_IDS })

const rectOf = async (id) => {
  const box = await page.locator(`[data-block-id="${id}"]`).boundingBox()
  if (!box) throw new Error(`${id}: missing bounding box`)
  return box
}

const bandOf = async (edge) => page.evaluate((dock) => {
  const node = document.querySelector(dock === 'top' ? '.canvas-top-bar' : '.canvas-bottom-bar')
  if (!node) return null
  const rect = node.getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}, edge)

const enterEdit = async () => {
  if (await page.locator('[role="toolbar"][aria-label="Edit layout"]').count()) return
  await page.keyboard.press('Control+Shift+E')
  await page.waitForSelector('[role="toolbar"][aria-label="Edit layout"]')
}

const pointInBand = (band, xPct, yPct) => ({
  x: band.left + band.width * xPct / 100,
  y: band.top + band.height * yPct / 100,
})

const beginMouseDrag = async (id) => {
  const box = await rectOf(id)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  return box
}

const moveMouse = async (point, options = {}) => {
  if (options.alt) await page.keyboard.down('Alt')
  await page.mouse.move(point.x, point.y, { steps: options.steps ?? 7 })
  await page.waitForTimeout(options.settle ?? 90)
  if (options.alt) await page.keyboard.up('Alt')
}

const releaseMouse = async () => {
  await page.mouse.up()
  await page.waitForTimeout(120)
}

const modeAndSize = (id) => page.locator(`[data-block-id="${id}"]`).evaluate((node) => ({
  mode: node.getAttribute('data-canvas-mode'),
  size: node.getAttribute('data-canvas-size'),
}))

const guideState = () => page.evaluate(() => ({
  axes: [...document.querySelectorAll('.edit-guides--dock .edit-guide')]
    .map((node) => node.getAttribute('data-axis')),
  positions: [...document.querySelectorAll('.edit-guides--dock .edit-guide')]
    .map((node) => node.getAttribute('style')),
}))

const edgeSafetyState = () => page.evaluate(() => {
  const inspect = (edge, ids) => {
    const lane = document.querySelector(`.dock-lane[data-edge="${edge}"]`)
    if (!lane) return { order: [], tabOrder: [], lane: null, members: [] }
    const laneRect = lane.getBoundingClientRect()
    const members = ids.map((id) => {
      const node = lane.querySelector(`[data-block-id="${id}"]`)
      const rect = node?.getBoundingClientRect()
      return {
        id,
        rect: rect ? {
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          width: rect.width, height: rect.height,
        } : null,
        inside: Boolean(rect
          && rect.left >= laneRect.left - 0.5
          && rect.right <= laneRect.right + 0.5
          && rect.top >= laneRect.top - 0.5
          && rect.bottom <= laneRect.bottom + 0.5),
      }
    })
    return {
      order: [...lane.querySelectorAll('[data-block-id]')].map((node) => node.getAttribute('data-block-id')),
      tabOrder: [...lane.querySelectorAll('[data-block-id][tabindex="0"]')].map((node) => node.getAttribute('data-block-id')),
      lane: {
        left: laneRect.left, top: laneRect.top, right: laneRect.right, bottom: laneRect.bottom,
        width: laneRect.width, height: laneRect.height,
      },
      members,
    }
  }
  return {
    top: inspect('top', ['weather', 'bookmarks']),
    bottom: inspect('bottom', ['tasks', 'notes']),
  }
})

const runEdgeSafetyWitness = async () => {
  await seedInteractionLayout()
  await page.evaluate(async () => {
    const { layouts } = await chrome.storage.local.get('layouts')
    const draft = structuredClone(layouts)
    const widgets = draft.layouts[0].widgets
    widgets.weather = {
      kind: 'docked', dock: 'top', order: 0, x: 0, y: 0,
      tier: 'compact', returnTier: 'standard',
    }
    const { y: _bookmarkY, ...legacyBookmarks } = widgets.bookmarks
    widgets.bookmarks = { ...legacyBookmarks, order: 1, x: 72 }
    widgets.tasks = {
      kind: 'docked', dock: 'bottom', order: 0, x: 100, y: 100,
      tier: 'compact', returnTier: 'compact',
    }
    const { y: _notesY, ...legacyNotes } = widgets.notes
    widgets.notes = { ...legacyNotes, order: 1, x: 76 }
    await chrome.storage.local.set({ layouts: draft })
  })

  await reloadForViewport({ width: 600, height: 800 })
  const settledBytes = await currentLayoutsJson()
  await enterEdit()
  const at600 = await edgeSafetyState()
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.waitForTimeout(220)
  const at1366 = await edgeSafetyState()
  await page.setViewportSize({ width: 600, height: 800 })
  await page.waitForTimeout(220)
  const returned600 = await edgeSafetyState()

  for (const [label, state] of [['600', at600], ['1366', at1366], ['600-return', returned600]]) {
    if (JSON.stringify(state.top.order) !== JSON.stringify(['weather', 'bookmarks'])) {
      fail(`edge-${label}: mixed top reading order ${state.top.order.join(',')}`)
    }
    if (JSON.stringify(state.bottom.order) !== JSON.stringify(['tasks', 'notes'])) {
      fail(`edge-${label}: mixed bottom reading order ${state.bottom.order.join(',')}`)
    }
    if (JSON.stringify(state.top.tabOrder) !== JSON.stringify(['weather', 'bookmarks'])) {
      fail(`edge-${label}: mixed top tab order ${state.top.tabOrder.join(',')}`)
    }
    if (JSON.stringify(state.bottom.tabOrder) !== JSON.stringify(['tasks', 'notes'])) {
      fail(`edge-${label}: mixed bottom tab order ${state.bottom.tabOrder.join(',')}`)
    }
    for (const member of [...state.top.members, ...state.bottom.members]) {
      if (!member.inside) fail(`edge-${label}: ${member.id} crossed its dock safety boundary`)
    }
  }

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-editing]', { state: 'detached' })
  if (await currentLayoutsJson() !== settledBytes) fail('edge-resize: Cancel changed stored 0/100 dock points')
  await harvestWrites('edge-resize')
  await reloadForViewport({ width: 600, height: 800 })
  const reloaded600 = await edgeSafetyState()
  for (const member of [...reloaded600.top.members, ...reloaded600.bottom.members]) {
    if (!member.inside) fail(`edge-reload: ${member.id} crossed its dock safety boundary`)
  }
  if (await currentLayoutsJson() !== settledBytes) fail('edge-reload: stored 0/100 dock points changed')
  await harvestWrites('edge-reload')
  evidence.edgeSafety.push({ at600, at1366, returned600, reloaded600, byteStable: true })
}

const dispatchPointerCancel = async () => {
  await page.evaluate(() => {
    const pointerId = window.__dyLastPointerId ?? 1
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId }))
  })
  // Release Playwright's physical button after the product listener has
  // already torn down; this release must not become a product drop.
  await page.mouse.up()
  await page.waitForTimeout(120)
}

const runDesktopInteractions = async (viewport) => {
  const label = key(viewport)
  await seedInteractionLayout()
  await reloadForViewport(viewport)
  const seededJson = await currentLayoutsJson()
  const interaction = { viewport }
  evidence.interactions.push(interaction)
  await page.evaluate(() => {
    window.__dyLastPointerId = null
    document.addEventListener('pointerdown', (event) => {
      window.__dyLastPointerId = event.pointerId
    }, { capture: true })
  })
  const initialScrollY = await page.evaluate(() => window.scrollY)
  if (initialScrollY !== 0) fail(`${label}: page began scrolled at ${initialScrollY}`)

  const initial = await page.evaluate(() => Object.fromEntries(
    ['bookmarks', 'weather', 'tasks', 'notes'].map((id) => {
      const node = document.querySelector(`[data-block-id="${id}"]`)
      const rect = node?.getBoundingClientRect()
      return [id, {
        mode: node?.getAttribute('data-canvas-mode'),
        size: node?.getAttribute('data-canvas-size'),
        center: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null,
      }]
    }),
  ))
  if (initial.bookmarks.size !== 'compact') fail(`${label}: Bookmarks compact choice rendered ${initial.bookmarks.size}`)
  for (const id of ['bookmarks', 'tasks', 'notes']) {
    if (initial[id].mode !== 'docked') fail(`${label}: ${id} initial mode ${initial[id].mode}`)
  }

  await enterEdit()
  // Always-on identities (Clock, Greeting, Focus) remain active even when
  // every toggle-backed widget is disabled, so the count is fixture-shape
  // metadata. The behavior under test is the named recovery action itself.
  const hiddenSummary = page.getByText(/^Hidden \d+$/)
  await hiddenSummary.click()
  await page.getByRole('button', { name: 'Show Clock' }).click()
  await page.waitForSelector('[data-block-id="clock"]')
  await page.locator('[role="toolbar"][aria-label="Edit layout"] button', { hasText: 'Undo' }).click()
  await page.waitForSelector('[data-block-id="clock"]', { state: 'detached' })
  if ((await harvestWrites(`${label}:hidden-recovery`)).length !== 0) {
    fail(`${label}: hidden-widget recovery wrote storage before Save`)
  }
  const topBand = await bandOf('top')
  const bottomBand = await bandOf('bottom')
  if (!topBand || !bottomBand) throw new Error(`${label}: both dock bands must render`)

  // One gesture crosses free -> top -> bottom. Center guides prove both
  // dock axes; Alt at the same near-center point must suppress them all.
  await beginMouseDrag('weather')
  await moveMouse(pointInBand(topBand, 50, 50))
  const centeredGuides = await guideState()
  if (!centeredGuides.axes.includes('x') || !centeredGuides.axes.includes('y')) {
    fail(`${label}: top dock did not publish both center guides`)
  }
  await moveMouse(pointInBand(topBand, 50.35, 53), { alt: true })
  const altGuides = await guideState()
  if (altGuides.axes.length !== 0) fail(`${label}: Alt bypass left ${altGuides.axes.length} guide nodes`)
  await moveMouse(pointInBand(bottomBand, 74, 24))
  const preview = await rectOf('weather')
  const previewPlacement = await page.locator('[data-block-id="weather"]').evaluate((node) => ({
    mode: node.getAttribute('data-canvas-mode'),
    left: node.style.left,
    top: node.style.top,
  }))
  await releaseMouse()
  const settled = await rectOf('weather')
  const settledPlacement = await page.locator('[data-block-id="weather"]').evaluate((node) => ({
    mode: node.getAttribute('data-canvas-mode'),
    left: node.style.left,
    top: node.style.top,
  }))
  const previewDelta = Math.max(Math.abs(preview.x - settled.x), Math.abs(preview.y - settled.y))
  if (previewDelta > 2) fail(`${label}: drop settled ${previewDelta.toFixed(2)}px from final preview`)
  if ((await modeAndSize('weather')).mode !== 'docked') fail(`${label}: free -> top -> bottom did not dock Weather`)

  // The opposite traversal is one gesture too.
  await beginMouseDrag('weather')
  await moveMouse(pointInBand(topBand, 26, 76))
  await releaseMouse()
  if (!await page.locator('.canvas-top-bar [data-block-id="weather"]').count()) {
    fail(`${label}: bottom -> top did not finish in top dock`)
  }

  // Leaving the band restores the source Standard tier automatically.
  await beginMouseDrag('weather')
  await moveMouse({ x: viewport.width * 0.56, y: viewport.height * 0.52 })
  await releaseMouse()
  const freeWeather = await modeAndSize('weather')
  if (freeWeather.mode !== 'anchored' || freeWeather.size !== 'standard') {
    fail(`${label}: undock restored ${freeWeather.mode}/${freeWeather.size}, expected anchored/standard`)
  }

  // Peer-edge/center magnetism and live overlap are observed during the
  // gesture, then both warning and guides clear before pointerup.
  const notesRect = await rectOf('notes')
  await beginMouseDrag('tasks')
  await moveMouse({ x: notesRect.x + notesRect.width / 2, y: notesRect.y + notesRect.height / 2 })
  if (!await page.locator('[role="dialog"][aria-label="Tasks inspector"]').count()) {
    throw new Error(`${label}: Tasks drag did not select Tasks`)
  }
  const overlapText = await page.locator('[role="dialog"][aria-label="Tasks inspector"]').textContent()
  if (!overlapText?.includes('Overlaps Notes')) fail(`${label}: live same-dock overlap warning did not appear`)
  const peerGuides = await guideState()
  if (!peerGuides.axes.includes('x') || !peerGuides.axes.includes('y')) {
    fail(`${label}: peer alignment did not publish both axes`)
  }
  await moveMouse(pointInBand(bottomBand, 10, 18), { alt: true })
  const clearedText = await page.locator('[role="dialog"][aria-label="Tasks inspector"]').textContent()
  if (clearedText?.includes('Overlaps Notes')) fail(`${label}: live overlap warning stayed stale after separation`)
  if ((await guideState()).axes.length !== 0) fail(`${label}: dock guides stayed stale after Alt separation`)
  await releaseMouse()

  // Pointer cancellation restores the exact current draft geometry.
  const cancelBefore = await rectOf('weather')
  await beginMouseDrag('weather')
  await moveMouse(pointInBand(bottomBand, 50, 50))
  await dispatchPointerCancel()
  const cancelAfter = await rectOf('weather')
  const cancelDelta = Math.max(Math.abs(cancelBefore.x - cancelAfter.x), Math.abs(cancelBefore.y - cancelAfter.y))
  if (cancelDelta > 0.5 || (await modeAndSize('weather')).mode !== 'anchored') {
    fail(`${label}: pointercancel restored with ${cancelDelta.toFixed(2)}px delta and ${(await modeAndSize('weather')).mode} mode`)
  }

  // The visible Cancel closes a live drag, restores the seeded document,
  // and cannot leave a zone/guide listener alive for the next session.
  await beginMouseDrag('weather')
  await moveMouse(pointInBand(bottomBand, 50, 50))
  await page.locator('[role="toolbar"][aria-label="Edit layout"] button', { hasText: 'Cancel' }).evaluate((button) => button.click())
  await page.mouse.up()
  await page.waitForTimeout(100)
  if (await page.locator('[data-editing]').count()) fail(`${label}: explicit Cancel left edit mode open`)
  if (await page.locator('.dock-drop-zone, .edit-guides').count()) fail(`${label}: explicit Cancel left transient dock chrome`)
  if (await currentLayoutsJson() !== seededJson) fail(`${label}: explicit Cancel changed layouts storage`)
  await harvestWrites(`${label}:cancel`)

  // Fresh draft: Bookmarks retains its explicit compact/standard choice,
  // then an exact two-axis move saves once and reloads byte-stably.
  await enterEdit()
  await page.locator('[data-block-id="bookmarks"]').click()
  const inspector = page.getByRole('dialog', { name: 'Bookmarks inspector' })
  await inspector.getByRole('radio', { name: 'Standard' }).click()
  if ((await modeAndSize('bookmarks')).size !== 'standard') fail(`${label}: Bookmarks Standard choice did not render`)

  await beginMouseDrag('bookmarks')
  await moveMouse(pointInBand(topBand, 86, 78), { alt: true })
  await releaseMouse()
  await page.locator('[role="toolbar"][aria-label="Edit layout"] button', { hasText: 'Save' }).click()
  await page.waitForTimeout(180)
  const saveWrites = await harvestWrites(`${label}:save`, ['layouts'])
  if (saveWrites.length !== 1 || saveWrites[0].join(',') !== 'layouts') {
    fail(`${label}: Save write sequence was ${JSON.stringify(saveWrites)}`)
  }
  const savedBytes = await currentLayoutsJson()
  const savedPlacement = JSON.parse(savedBytes).layouts[0].widgets.bookmarks
  if (savedPlacement.kind !== 'docked' || savedPlacement.y === undefined || savedPlacement.tier !== 'standard') {
    fail(`${label}: saved Bookmarks placement missing X/Y/Standard choice`)
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await armWriteLog()
  const reloadedBytes = await currentLayoutsJson()
  if (reloadedBytes !== savedBytes) fail(`${label}: saved layouts were not byte-stable across reload`)
  const reloadedPlacement = await page.evaluate(async () => {
    const { layouts } = await chrome.storage.local.get('layouts')
    return layouts.layouts[0].widgets.bookmarks
  })
  if (reloadedPlacement.x !== savedPlacement.x || reloadedPlacement.y !== savedPlacement.y) {
    fail(`${label}: saved X/Y changed on reload`)
  }
  await harvestWrites(`${label}:reload`)

  const stripSafety = await page.evaluate(() => ({
    scrollY: window.scrollY,
    bars: [...document.querySelectorAll('.canvas-top-bar, .canvas-bottom-bar')].map((node) => {
      const style = getComputedStyle(node)
      return { overflowX: style.overflowX, maskImage: style.maskImage }
    }),
    staleChrome: document.querySelectorAll('.dock-drop-zone, .edit-guides').length,
  }))
  if (stripSafety.scrollY !== 0) fail(`${label}: dock interaction moved page to scrollY ${stripSafety.scrollY}`)
  if (stripSafety.bars.some((bar) => ['auto', 'scroll'].includes(bar.overflowX) || bar.maskImage !== 'none')) {
    fail(`${label}: a dock bar retained scroll/fade machinery`)
  }
  if (stripSafety.staleChrome !== 0) fail(`${label}: transient chrome survived Save/reload`)

  const screenshot = resolve(outDir, `${label}-interactions.png`)
  await page.screenshot({ path: screenshot })
  Object.assign(interaction, {
    screenshot: `${label}-interactions.png`,
    screenshotSha256: sha256File(screenshot),
    initial,
    centeredGuides,
    altGuideCount: altGuides.axes.length,
    peerGuides,
    previewDelta,
    preview,
    previewPlacement,
    settled,
    settledPlacement,
    cancelDelta,
    savedPlacement,
    byteStable: reloadedBytes === savedBytes,
    stripSafety,
  })
}

let caughtError = null
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-canvas-surface]')
  await seedInformationFirstFixtures(page)

  const seeded = await page.evaluate(async ({ blockIds }) => {
    const { settings, location, weatherCache } = await chrome.storage.local.get([
      'settings', 'location', 'weatherCache',
    ])
    const widgetFlags = Object.fromEntries(Object.keys(settings.widgets).map((id) => [id, false]))
    Object.assign(widgetFlags, { weather: true, bookmarks: true, todo: true, notes: true })
    const widgets = Object.fromEntries(blockIds.map((id) => [id, { kind: 'hidden' }]))
    Object.assign(widgets, {
      weather: { kind: 'docked', dock: 'top', order: 0, x: 18 },
      bookmarks: { kind: 'docked', dock: 'top', order: 1, x: 72 },
      tasks: { kind: 'docked', dock: 'bottom', order: 0, x: 24 },
      notes: { kind: 'docked', dock: 'bottom', order: 1, x: 76 },
    })
    const layouts = {
      version: 1,
      activeLayoutId: 'dy-legacy-baseline',
      layouts: [{ id: 'dy-legacy-baseline', name: 'DY legacy baseline', widgets }],
    }
    const normalized = (value) => Number(value.toFixed(4))
    const environmentParams = new URLSearchParams()
    environmentParams.set('timezone', 'auto')
    environmentParams.set('current', 'us_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen')
    environmentParams.set('latitude', String(normalized(location.lat)))
    environmentParams.set('longitude', String(normalized(location.lon)))
    const now = Date.now()
    const currentWeather = {
      ...weatherCache,
      fetchedAt: now,
      environment: {
        requestIdentity: `open-meteo-air:v1:https://air-quality-api.open-meteo.com/v1/air-quality?${environmentParams.toString()}`,
        fetchedAt: now,
        status: 'available',
        usAqi: 42,
        uvIndex: 3,
        pollen: { status: 'available', readings: [{ species: 'grass', grainsPerCubicMeter: 4 }] },
      },
    }
    await chrome.storage.local.set({
      settings: { ...settings, widgets: widgetFlags },
      layouts,
      weatherCache: currentWeather,
      weatherAlertCache: {
        requestIdentity: `nws-alerts:v1:https://api.weather.gov/alerts/active?point=${normalized(location.lat)},${normalized(location.lon)}`,
        fetchedAt: now,
        status: 'supported',
        alerts: [],
      },
    })
    return layouts
  }, { blockIds: BLOCK_IDS })

  // Settle and retire any pre-seed request before the witness begins. The
  // fully seeded reload must use the current forecast, environment, and NWS
  // caches without starting a replacement request.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await page.waitForTimeout(250)
  // Setup activity is outside the witness. Only the settled seeded product
  // surface may contribute runtime/request/write evidence.
  runtimeErrors.length = 0
  failedRequests.length = 0

  for (const viewport of DY_VIEWPORTS) {
    await reloadForViewport(viewport)
    const label = key(viewport)
    const state = await page.evaluate(async () => {
      const ids = ['weather', 'bookmarks', 'tasks', 'notes']
      const rects = Object.fromEntries(ids.map((id) => {
        const node = document.querySelector(`[data-block-id="${id}"]`)
        if (!node) return [id, null]
        const rect = node.getBoundingClientRect()
        return [id, Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map((field) => [
          field, Number(rect[field].toFixed(3)),
        ]))]
      }))
      const { layouts } = await chrome.storage.local.get('layouts')
      return {
        order: [...document.querySelectorAll('[data-block-id]')].map((node) => node.getAttribute('data-block-id')),
        modes: Object.fromEntries(ids.map((id) => [
          id,
          document.querySelector(`[data-block-id="${id}"]`)?.getAttribute('data-canvas-mode') ?? null,
        ])),
        rects,
        layouts,
      }
    })

    const layoutsJson = canonicalJson(state.layouts)
    if (layoutsJson !== canonicalJson(seeded)) fail(`${label}: layouts storage changed during render`)
    const expectedOrder = ['weather', 'bookmarks', 'tasks', 'notes']
    if (state.order.join(',') !== expectedOrder.join(',')) {
      fail(`${label}: render order ${state.order.join(',')}`)
    }
    const expectedMode = viewport.width < 600 ? 'stacked' : 'docked'
    for (const id of expectedOrder) {
      if (state.modes[id] !== expectedMode) fail(`${label}: ${id} mode ${state.modes[id]}`)
    }

    if (viewport.width !== 599 && viewport.width !== 600) {
      const screenshot = resolve(outDir, `${label}-legacy-baseline.png`)
      await page.screenshot({ path: screenshot })
      evidence.desktop.push({
        viewport,
        screenshot: `${label}-legacy-baseline.png`,
        screenshotSha256: sha256File(screenshot),
        rects: state.rects,
        layouts: layoutsJson,
      })
    } else {
      evidence.boundaries.push({ viewport, order: state.order, modes: state.modes, layouts: layoutsJson })
    }
    await harvestWrites(label)
  }

  if (evidence.desktop.length !== 3) fail(`expected 3 desktop captures, found ${evidence.desktop.length}`)
  const rectWitnesses = evidence.desktop.reduce((sum, capture) => (
    sum + Object.values(capture.rects).filter(Boolean).length
  ), 0)
  if (rectWitnesses !== 12) fail(`expected 12 desktop rectangle witnesses, found ${rectWitnesses}`)
  if (evidence.boundaries.length !== 2) fail(`expected 2 boundary witnesses, found ${evidence.boundaries.length}`)

  if (baselineEvidence) {
    try {
      evidence.screenshotComparisons = assertLegacyScreenshotEquality(
        baselineEvidence.desktop,
        evidence.desktop,
      )
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    }
    for (const current of evidence.desktop) {
      const baseline = baselineEvidence.desktop.find((candidate) => (
        candidate.viewport.width === current.viewport.width
        && candidate.viewport.height === current.viewport.height
      ))
      if (!baseline) {
        fail(`${key(current.viewport)}: immutable baseline capture missing`)
        continue
      }
      for (const id of ['weather', 'bookmarks', 'tasks', 'notes']) {
        const exact = JSON.stringify(current.rects[id]) === JSON.stringify(baseline.rects[id])
        evidence.comparisons.push({ viewport: current.viewport, id, exact })
        if (!exact) {
          fail(`${key(current.viewport)}: absent-Y ${id} rectangle changed`)
        }
      }
      if (current.layouts !== baseline.layouts) {
        fail(`${key(current.viewport)}: layouts bytes differ from immutable baseline`)
      }
    }
    for (const current of evidence.boundaries) {
      const baseline = baselineEvidence.boundaries.find((candidate) => (
        candidate.viewport.width === current.viewport.width
        && candidate.viewport.height === current.viewport.height
      ))
      if (!baseline) {
        fail(`${key(current.viewport)}: immutable boundary baseline missing`)
        continue
      }
      if (JSON.stringify(current.order) !== JSON.stringify(baseline.order)) {
        fail(`${key(current.viewport)}: narrow boundary order changed`)
      }
      if (current.layouts !== baseline.layouts) {
        fail(`${key(current.viewport)}: boundary layouts bytes differ from immutable baseline`)
      }
    }
  }

  if (phase === 'after' && !baselineOnly) {
    for (const viewport of DY_VIEWPORTS.filter(({ width }) => width > 600)) {
      await runDesktopInteractions(viewport)
    }
    for (const viewport of DY_VIEWPORTS.filter(({ width }) => width <= 600)) {
      await seedInteractionLayout()
      await reloadForViewport(viewport)
      // Compare against the browser's settled serialized document. Storage
      // normalization may canonicalize key order on hydration without a
      // write; raw pre-reload object construction order is not byte evidence.
      const seededBytes = await currentLayoutsJson()
      const boundary = await page.evaluate(async () => {
        const { layouts } = await chrome.storage.local.get('layouts')
        return {
          order: [...document.querySelectorAll('[data-block-id]')].map((node) => node.getAttribute('data-block-id')),
          modes: Object.fromEntries(['bookmarks', 'tasks', 'notes', 'weather'].map((id) => [
            id,
            document.querySelector(`[data-block-id="${id}"]`)?.getAttribute('data-canvas-mode') ?? null,
          ])),
          layoutsBytes: JSON.stringify(layouts),
        }
      })
      const expectedOrder = viewport.width < 600
        ? ['bookmarks', 'tasks', 'notes', 'weather']
        : ['bookmarks', 'weather', 'tasks', 'notes']
      if (JSON.stringify(boundary.order) !== JSON.stringify(expectedOrder)) {
        fail(`${key(viewport)}: explicit X/Y boundary order ${boundary.order.join(',')}`)
      }
      const expectedDockMode = viewport.width < 600 ? 'stacked' : 'docked'
      const expectedWeatherMode = viewport.width < 600 ? 'stacked' : 'anchored'
      for (const id of ['bookmarks', 'tasks', 'notes']) {
        if (boundary.modes[id] !== expectedDockMode) fail(`${key(viewport)}: ${id} boundary mode ${boundary.modes[id]}`)
      }
      if (boundary.modes.weather !== expectedWeatherMode) {
        fail(`${key(viewport)}: Weather boundary mode ${boundary.modes.weather}`)
      }
      if (boundary.layoutsBytes !== seededBytes) fail(`${key(viewport)}: boundary changed stored X/Y bytes`)
      evidence.interactionBoundaries.push({ viewport, ...boundary })
      await harvestWrites(`${key(viewport)}:explicit-boundary`)
    }
    await runEdgeSafetyWitness()
    if (evidence.interactions.length !== 3) fail(`expected 3 interaction captures, found ${evidence.interactions.length}`)
    if (evidence.interactionBoundaries.length !== 2) {
      fail(`expected 2 explicit boundary witnesses, found ${evidence.interactionBoundaries.length}`)
    }
    if (evidence.edgeSafety.length !== 1) fail(`expected one explicit edge-safety witness, found ${evidence.edgeSafety.length}`)
  }
} catch (error) {
  caughtError = error
  fail(`harness: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  try { await context.close() } catch { /* best-effort shutdown */ }
}

evidence.runtimeErrors.push(...runtimeErrors)
evidence.failedRequests.push(...failedRequests)
writeFileSync(resolve(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)

console.log(JSON.stringify({
  phase: evidence.phase,
  commit: evidence.commit,
  desktopCaptures: evidence.desktop.length,
  rectangleWitnesses: evidence.desktop.reduce((sum, capture) => sum + Object.values(capture.rects).filter(Boolean).length, 0),
  boundaries: evidence.boundaries.length,
  interactions: evidence.interactions.length,
  interactionBoundaries: evidence.interactionBoundaries.length,
  writes: evidence.writes.length,
  runtimeErrors: evidence.runtimeErrors.length,
  failedRequests: evidence.failedRequests.length,
  failures: evidence.failures,
  comparisons: evidence.comparisons.length,
}, null, 2))

if (caughtError || evidence.failures.length || evidence.runtimeErrors.length || evidence.failedRequests.length) {
  process.exitCode = 1
}
