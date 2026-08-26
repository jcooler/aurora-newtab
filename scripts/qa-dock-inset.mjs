// Additive owner-refinement witness for the 5px outer dock perimeter.
// This runner never reads, writes, or replaces the immutable DY-P1 baseline.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { BLOCK_IDS } from '../src/lib/layout/types.ts'
import { assertCleanTrackedStatus } from './build-contracts.mjs'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import { assertBuildProvenance } from './work-connector-harness-contracts.mjs'

export const DOCK_INSET_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 600, height: 800 }),
  Object.freeze({ width: 1408, height: 445 }),
])

export const DOCK_INSET_BEHAVIORS = Object.freeze([
  'exact-five-pixel-bands',
  'inclusive-five-pixel-corners',
  'four-pixel-canvas-exit',
  'member-containment',
  'legacy-storage-byte-stability',
  'stored-reading-order',
  'toolbar-clearance',
  'layouts-only-write-rejection',
])

const argv = process.argv.slice(2)
if (argv.includes('--describe')) {
  console.log(JSON.stringify({
    viewports: DOCK_INSET_VIEWPORTS,
    behaviors: DOCK_INSET_BEHAVIORS,
    provenance: {
      build: 'git-head-preview-build',
      recordsCommit: true,
      rejectsDirtyTrackedSource: true,
      verifiesBuiltCommit: true,
      replacesFrozenBaseline: false,
    },
  }))
  process.exit(0)
}

const repoRoot = process.cwd()
const outDir = resolve(repoRoot, '.qa-dy-p1-inset')
const dist = resolve(repoRoot, '.qa-dy-p1-inset-dist')
const profileDir = resolve(repoRoot, '.playwright-profile-qa-dy-p1-inset')
for (const [path, suffix] of [
  [outDir, '.qa-dy-p1-inset'],
  [dist, '.qa-dy-p1-inset-dist'],
  [profileDir, '.playwright-profile-qa-dy-p1-inset'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe dock-inset scratch path: ${path}`)
}

assertCleanTrackedStatus(spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).stdout)
for (const path of [outDir, dist, profileDir]) rmSync(path, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

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
  throw new Error(`dock-inset preview build failed: ${build.status}`)
}
assertBuildProvenance(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'), commit)

const evidence = {
  commit,
  viewports: DOCK_INSET_VIEWPORTS,
  captures: [],
  writes: [],
  runtimeErrors: [],
  failedRequests: [],
  failures: [],
}
const fail = (message) => evidence.failures.push(message)
const closeTo = (actual, expected, label) => {
  if (Math.abs(actual - expected) > 0.5) fail(`${label}: ${actual}, expected ${expected}`)
}
const dockHeight = (height) => Math.min(78, Math.max(60, height * 0.1))

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !argv.includes('--headed'),
  viewport: DOCK_INSET_VIEWPORTS[1],
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
await page.addInitScript(() => {
  window.__dockInsetWrites = []
  if (!globalThis.chrome?.storage?.onChanged) return
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') window.__dockInsetWrites.push(Object.keys(changes).sort())
  })
})

const waitForWidgets = async () => {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForFunction(() => ['clock', 'tasks', 'notes'].every((id) => {
    const node = document.querySelector(`[data-block-id="${id}"]`)
    const rect = node?.getBoundingClientRect()
    return Boolean(rect && rect.width >= 4 && rect.height >= 4)
  }))
  await page.waitForTimeout(180)
}

const seedLegacyLayout = () => page.evaluate(async ({ blockIds }) => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgetFlags = Object.fromEntries(Object.keys(settings.widgets).map((id) => [id, false]))
  Object.assign(widgetFlags, { todo: true, notes: true })
  const widgets = Object.fromEntries(blockIds.map((id) => [id, { kind: 'hidden' }]))
  Object.assign(widgets, {
    clock: { kind: 'docked', dock: 'top', order: 0, x: 12 },
    tasks: { kind: 'docked', dock: 'bottom', order: 0, x: 30 },
    notes: { kind: 'docked', dock: 'bottom', order: 1, x: 70 },
  })
  const layouts = {
    version: 1,
    activeLayoutId: 'dock-inset-refinement',
    layouts: [{ id: 'dock-inset-refinement', name: 'Dock inset refinement', widgets }],
  }
  await chrome.storage.local.set({ settings: { ...settings, widgets: widgetFlags }, layouts })
}, { blockIds: BLOCK_IDS })

const layoutsBytes = () => page.evaluate(async () => {
  const { layouts } = await chrome.storage.local.get('layouts')
  return JSON.stringify(layouts)
})

const readWriteLog = () => page.evaluate(() => window.__dockInsetWrites ?? [])

const geometryState = () => page.evaluate(() => {
  const inspect = (edge) => {
    const lane = document.querySelector(`.dock-lane[data-edge="${edge}"]`)
    if (!lane) return null
    const rect = lane.getBoundingClientRect()
    const members = [...lane.querySelectorAll('[data-block-id]')].map((node) => {
      const memberRect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return {
        id: node.getAttribute('data-block-id'),
        positioning: node.getAttribute('data-dock-positioning'),
        rect: {
          left: memberRect.left,
          top: memberRect.top,
          right: memberRect.right,
          bottom: memberRect.bottom,
          width: memberRect.width,
          height: memberRect.height,
        },
        margins: {
          top: style.marginTop,
          right: style.marginRight,
          bottom: style.marginBottom,
        },
        inside: memberRect.left >= rect.left - 0.5
          && memberRect.right <= rect.right + 0.5
          && memberRect.top >= rect.top - 0.5
          && memberRect.bottom <= rect.bottom + 0.5,
      }
    })
    return {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      order: members.map(({ id }) => id),
      members,
    }
  }
  return { top: inspect('top'), bottom: inspect('bottom') }
})

const enterEdit = async () => {
  await page.keyboard.press('Control+Shift+E')
  await page.waitForSelector('[role="toolbar"][aria-label="Edit layout"]')
}

const modeOf = (id) => page.locator(`[data-block-id="${id}"]`).getAttribute('data-canvas-mode')

const pointerCancel = async () => {
  await page.evaluate(() => {
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))
  })
  await page.mouse.up()
  await page.waitForTimeout(120)
}

let caughtError = null
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-canvas-surface]')
  await seedInformationFirstFixtures(page)

  for (const viewport of DOCK_INSET_VIEWPORTS) {
    await seedLegacyLayout()
    const seededBytes = await layoutsBytes()
    await page.setViewportSize(viewport)
    runtimeErrors.length = 0
    failedRequests.length = 0
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWidgets()

    const loadedBytes = await layoutsBytes()
    if (loadedBytes !== seededBytes) fail(`${viewport.width}x${viewport.height}: measured load changed legacy layouts bytes`)
    const before = await geometryState()
    if (!before.top || !before.bottom) throw new Error(`${viewport.width}x${viewport.height}: missing dock lane`)
    const expectedHeight = dockHeight(viewport.height)
    for (const [edge, lane] of [['top', before.top], ['bottom', before.bottom]]) {
      closeTo(lane.rect.left, 5, `${viewport.width}x${viewport.height} ${edge} left`)
      closeTo(lane.rect.right, viewport.width - 5, `${viewport.width}x${viewport.height} ${edge} right`)
      closeTo(lane.rect.width, viewport.width - 10, `${viewport.width}x${viewport.height} ${edge} width`)
      closeTo(lane.rect.height, expectedHeight, `${viewport.width}x${viewport.height} ${edge} height`)
      closeTo(lane.rect.top, edge === 'top' ? 5 : viewport.height - 5 - expectedHeight, `${viewport.width}x${viewport.height} ${edge} top`)
      for (const member of lane.members) {
        if (!member.inside) fail(`${viewport.width}x${viewport.height}: ${member.id} escaped ${edge}`)
        if (member.positioning !== 'legacy') fail(`${viewport.width}x${viewport.height}: ${member.id} lost legacy positioning`)
        if (JSON.stringify(member.margins) !== JSON.stringify({ top: '16px', right: '2px', bottom: '2px' })) {
          fail(`${viewport.width}x${viewport.height}: ${member.id} internal margins changed`)
        }
      }
    }
    if (JSON.stringify(before.top.order) !== JSON.stringify(['clock'])) fail(`${viewport.width}x${viewport.height}: top order ${before.top.order}`)
    if (JSON.stringify(before.bottom.order) !== JSON.stringify(['tasks', 'notes'])) fail(`${viewport.width}x${viewport.height}: bottom order ${before.bottom.order}`)

    await enterEdit()
    const toolbarTop = await page.locator('[role="toolbar"][aria-label="Edit layout"]').evaluate((node) => node.getBoundingClientRect().top)
    closeTo(toolbarTop, 5 + expectedHeight + 8, `${viewport.width}x${viewport.height} toolbar top`)

    const clock = await page.locator('[data-block-id="clock"]').boundingBox()
    if (!clock) throw new Error(`${viewport.width}x${viewport.height}: missing Clock box`)
    await page.mouse.move(clock.x + clock.width / 2, clock.y + clock.height / 2)
    await page.mouse.down()
    await page.mouse.move(5, 5, { steps: 6 })
    await page.waitForTimeout(120)
    const atFive = await modeOf('clock')
    if (atFive !== 'docked') fail(`${viewport.width}x${viewport.height}: 5px corner became ${atFive}`)
    const screenshot = resolve(outDir, `${viewport.width}x${viewport.height}-five-pixel-corner.png`)
    await page.screenshot({ path: screenshot })

    await page.mouse.move(4, 4)
    await page.waitForTimeout(120)
    const atFour = await modeOf('clock')
    if (atFour !== 'anchored') fail(`${viewport.width}x${viewport.height}: 4px perimeter became ${atFour}`)
    await page.mouse.move(5, 5)
    await page.waitForTimeout(120)
    const returnedFive = await modeOf('clock')
    if (returnedFive !== 'docked') fail(`${viewport.width}x${viewport.height}: returning to 5px became ${returnedFive}`)
    await pointerCancel()
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-editing]', { state: 'detached' })

    const afterBytes = await layoutsBytes()
    if (afterBytes !== seededBytes) fail(`${viewport.width}x${viewport.height}: Cancel changed legacy layouts bytes`)
    const writes = await readWriteLog()
    for (const keys of writes) {
      const expected = keys.join(',') === 'layouts'
      evidence.writes.push({ viewport, keys, expected })
      if (keys.includes('layout')) fail(`${viewport.width}x${viewport.height}: wrote frozen legacy layout key`)
      if (!expected) fail(`${viewport.width}x${viewport.height}: unexpected write ${keys.join(',')}`)
    }
    if (writes.length !== 0) fail(`${viewport.width}x${viewport.height}: measured load/Cancel path wrote ${writes.length} times`)

    evidence.captures.push({
      viewport,
      screenshot: `${viewport.width}x${viewport.height}-five-pixel-corner.png`,
      bands: { top: before.top.rect, bottom: before.bottom.rect },
      order: { top: before.top.order, bottom: before.bottom.order },
      internalMargins: Object.fromEntries([...before.top.members, ...before.bottom.members].map((member) => [member.id, member.margins])),
      toolbarTop,
      cornerModes: { atFive, atFour, returnedFive },
      loadByteStable: loadedBytes === seededBytes,
      byteStable: afterBytes === seededBytes,
    })
    evidence.runtimeErrors.push(...runtimeErrors.map((message) => ({ viewport, message })))
    evidence.failedRequests.push(...failedRequests.map((message) => ({ viewport, message })))
    if (runtimeErrors.length) fail(`${viewport.width}x${viewport.height}: ${runtimeErrors.length} runtime errors`)
    if (failedRequests.length) fail(`${viewport.width}x${viewport.height}: ${failedRequests.length} failed requests`)
  }
} catch (error) {
  caughtError = error
  fail(error instanceof Error ? error.stack ?? error.message : String(error))
} finally {
  writeFileSync(resolve(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await context.close()
}

console.log(`dock inset commit: ${commit}`)
console.log(`captures: ${evidence.captures.length}`)
console.log(`writes: ${evidence.writes.length}`)
console.log(`runtime errors: ${evidence.runtimeErrors.length}`)
console.log(`failed requests: ${evidence.failedRequests.length}`)
console.log(`failures: ${evidence.failures.length}`)
for (const message of evidence.failures) console.error(`FAIL: ${message}`)
if (caughtError || evidence.failures.length > 0) process.exitCode = 1
