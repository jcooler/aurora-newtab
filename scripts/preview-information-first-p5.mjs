import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const repoRoot = process.cwd()
const dist = resolve('.preview-information-first-p5-dist')
const profileDir = resolve('.playwright-profile-information-first-p5')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/aurora-v1-canvas-implementation-session-prompt/outputs/information-first-pr-p5'
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-information-first-p5-dist'],
  [profileDir, '.playwright-profile-information-first-p5'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe temporary path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const build = spawnSync(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'),
  'build',
  '--mode',
  'preview',
  '--outDir',
  dist,
  '--emptyOutDir',
], { cwd: repoRoot, encoding: 'utf8' })
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`focused Vite build failed with status ${build.status}`)
}

const viewports = [
  { width: 375, height: 812 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3440, height: 1440 },
  { width: 3840, height: 2160 },
]
const profiles = [
  ['Small', 'compact', 390, 844],
  ['Desktop', 'standard', 1440, 900],
  ['Large', 'display', 2560, 1440],
  ['Wide', 'ultrawide', 3440, 1440],
]
const evidence = {
  packet: 'PR-P5',
  viewports: [],
  runtimeErrors: [],
  failedRequests: [],
  interceptedExternalRequests: [],
  cleanup: {},
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: viewports[0],
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
await context.route(/^https?:\/\//, async (route) => {
  evidence.interceptedExternalRequests.push(`${route.request().method()} ${route.request().url()}`)
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
})

const page = await context.newPage()
page.setDefaultTimeout(12_000)
page.on('console', (message) => {
  if (message.type() === 'error') evidence.runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  if (!request.url().startsWith('chrome-extension://')) {
    evidence.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
  }
})

const waitForCanvas = async () => {
  await page.waitForSelector('main[data-aurora-canvas]')
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(80)
}

const seed = () => page.evaluate(async () => {
  const current = await chrome.storage.local.get(['settings', 'connectors'])
  const widgets = Object.fromEntries(Object.keys(current.settings.widgets).map((key) => [key, false]))
  Object.assign(widgets, {
    search: true,
    weather: true,
    todo: true,
    timer: true,
    bookmarks: true,
    notes: true,
    monthCal: true,
  })
  const connectors = Object.fromEntries(Object.entries(current.connectors).map(([id, value]) => [
    id,
    value && typeof value === 'object' ? { ...value, enabled: false } : value,
  ]))
  await chrome.storage.local.remove(['location', 'weatherCache'])
  await chrome.storage.local.set({
    settings: { ...current.settings, widgets, briefingEnabled: false },
    connectors,
  })
})

const storageLayout = () => page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))

const openArrange = async () => {
  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor()
  await settings.getByRole('tab', { name: 'Widgets' }).click()
  await settings.getByRole('button', { name: 'Arrange layout' }).click()
  const toolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await toolbar.waitFor()
  await page.locator('[data-arrange-artboard]').waitFor()
  return toolbar
}

const inspectProfile = async (label, key, logicalWidth, logicalHeight, expectedMode) => {
  const toolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await toolbar.getByRole('tab', { name: label }).click()
  await page.waitForFunction(({ key, logicalWidth, logicalHeight }) => {
    const canvas = document.querySelector('[data-canvas-surface]')
    return canvas?.getAttribute('data-canvas-profile') === key
      && Number(canvas.getAttribute('data-canvas-viewport-width')) === logicalWidth
  }, { key, logicalWidth, logicalHeight })

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector)
      if (!(node instanceof HTMLElement)) throw new Error(`missing ${selector}`)
      const value = node.getBoundingClientRect()
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height }
    }
    const frame = document.querySelector('[data-arrange-artboard]')
    const logical = document.querySelector('[data-arrange-artboard-logical]')
    const root = document.querySelector('[data-canvas-root]')
    const inspector = document.querySelector('[data-arrange-inspector-mode]')
    const canvas = document.querySelector('[data-canvas-surface]')
    if (!(frame instanceof HTMLElement) || !(logical instanceof HTMLElement) || !(root instanceof HTMLElement)
      || !(inspector instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
      throw new Error('Arrange structure is incomplete')
    }
    const artboard = rect('[data-arrange-artboard-viewport]')
    const inspectorRect = rect('[data-arrange-inspector-mode]')
    return {
      viewport: { width: innerWidth, height: innerHeight },
      mode: frame.dataset.arrangeViewportMode,
      scale: Number(logical.dataset.arrangeScale),
      logicalStyle: { width: logical.style.width, height: logical.style.height, transform: logical.style.transform },
      rootTransform: root.style.transform,
      canvasContentHeight: Number(canvas.dataset.canvasViewportHeight),
      artboard,
      inspector: inspectorRect,
      inspectorMode: inspector.dataset.arrangeInspectorMode,
      visiblePreviewHeight: Math.max(0, Math.min(artboard.bottom, inspectorRect.top) - artboard.top),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      targets: document.querySelectorAll('.arrange-target').length,
    }
  })

  assert(geometry.mode === expectedMode && geometry.inspectorMode === expectedMode,
    `${geometry.viewport.width}: ${label} used ${geometry.mode}/${geometry.inspectorMode}, expected ${expectedMode}`)
  assert(geometry.logicalStyle.width === `${logicalWidth}px` && geometry.logicalStyle.height === `${logicalHeight}px`,
    `${label}: wrong logical artboard ${JSON.stringify(geometry.logicalStyle)}`)
  assert(geometry.scale > 0 && geometry.scale <= 1, `${label}: invalid scale ${geometry.scale}`)
  assert(geometry.canvasContentHeight >= logicalHeight, `${label}: Canvas content is shorter than its logical viewport`)
  assert(geometry.rootTransform === '', `${label}: production Canvas root is transformed`)
  assert(!geometry.horizontalOverflow && geometry.targets > 0, `${label}: overflow or missing targets ${JSON.stringify(geometry)}`)
  if (expectedMode === 'side') {
    assert(geometry.inspector.width >= 320 && geometry.inspector.width <= 340,
      `${label}: side inspector width is ${geometry.inspector.width}`)
    assert(geometry.artboard.right <= geometry.inspector.left + 1, `${label}: side inspector occludes the artboard`)
  } else {
    assert(geometry.inspector.height <= geometry.viewport.height * 0.5 + 1, `${label}: sheet exceeds 50dvh`)
    assert(geometry.visiblePreviewHeight >= 80, `${label}: sheet hides the complete Canvas preview`)
  }
  return geometry
}

const exerciseArrange = async (toolbar, expectedMode) => {
  await toolbar.getByRole('tab', { name: 'Desktop' }).click()
  const clock = page.getByRole('button', { name: 'Edit Clock' })
  await clock.click()
  await clock.evaluate((node) => {
    window.__p5Capture = { got: 0, lost: 0, active: false }
    node.addEventListener('gotpointercapture', (event) => {
      window.__p5Capture.got += 1
      window.__p5Capture.active = node.hasPointerCapture(event.pointerId)
    })
    node.addEventListener('lostpointercapture', () => { window.__p5Capture.lost += 1 })
  })
  const clockItem = page.locator('[data-block-id="clock"]')
  const beforeX = Number(await clockItem.getAttribute('data-canvas-x'))
  const beforeY = Number(await clockItem.getAttribute('data-canvas-y'))
  const target = await clock.boundingBox()
  const canvas = await page.locator('[data-canvas-surface]').boundingBox()
  assert(target && canvas, 'Clock target or Canvas geometry is unavailable')
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2)
  await page.mouse.down()
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 5 })
  const guides = await page.locator('[data-canvas-guide]').count()
  const capture = await page.evaluate(() => window.__p5Capture)
  assert(capture?.got > 0 && capture.active, `actual pointer capture missing: ${JSON.stringify(capture)}`)
  assert(guides > 0, 'Canvas center drag did not expose a snap guide')
  await page.mouse.up()
  const afterDragX = Number(await clockItem.getAttribute('data-canvas-x'))
  const afterDragY = Number(await clockItem.getAttribute('data-canvas-y'))
  const beforeKeyboardX = afterDragX
  await clock.press('ArrowRight')
  const afterKeyboardX = Number(await clockItem.getAttribute('data-canvas-x'))
  assert(Math.abs(afterDragX - beforeX) > 0.001 || Math.abs(afterDragY - beforeY) > 0.001,
    `scaled pointer drag did not move Clock: ${beforeX},${beforeY} -> ${afterDragX},${afterDragY}`)
  assert(afterKeyboardX > beforeKeyboardX, `keyboard move did not move Clock: ${beforeKeyboardX} -> ${afterKeyboardX}`)

  const overlap = page.getByRole('region', { name: 'Overlap' })
  const layer = await overlap.count() > 0
  if (layer) {
    await overlap.getByRole('button', { name: 'Bring forward' }).click()
    await overlap.getByRole('button', { name: 'Send backward' }).click()
  }
  await toolbar.getByRole('button', { name: 'Undo' }).click()

  if (expectedMode === 'sheet') {
    const inspector = page.getByRole('complementary')
    await inspector.getByRole('button', { name: 'Close inspector' }).click()
    await inspector.waitFor({ state: 'detached' })
    assert(await page.locator('[data-arrange-artboard]').isVisible(), 'closing the sheet hid the artboard')
    await clock.click()
    await page.getByRole('complementary').waitFor()
  }

  return { beforeX, beforeY, afterDragX, afterDragY, afterKeyboardX, guides, capture, layer }
}

const exerciseLongPress = async () => {
  const clock = page.locator('[data-block-id="clock"] time')
  const box = await clock.boundingBox()
  assert(box, 'Clock time is unavailable for long press')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(650)
  const toolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await toolbar.waitFor()
  await page.mouse.up()
  await toolbar.getByRole('button', { name: 'Cancel' }).click()
  await toolbar.waitFor({ state: 'detached' })
  return true
}

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await seed()

  for (const viewport of viewports) {
    const name = `${viewport.width}x${viewport.height}`
    await page.setViewportSize(viewport)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCanvas()
    const before = await storageLayout()
    const toolbar = await openArrange()
    const expectedMode = viewport.width >= 1100 ? 'side' : 'sheet'
    const profileEvidence = {}
    for (const [label, key, logicalWidth, logicalHeight] of profiles) {
      profileEvidence[label] = await inspectProfile(label, key, logicalWidth, logicalHeight, expectedMode)
    }
    await toolbar.getByRole('tab', { name: 'Small' }).click()
    await page.screenshot({ path: `${outDir}/arrange-p5-${name}.png`, fullPage: false })
    const interactions = await exerciseArrange(toolbar, expectedMode)
    await toolbar.getByRole('button', { name: 'Cancel' }).click()
    await toolbar.waitFor({ state: 'detached' })
    assert(await storageLayout() === before, `${name}: Cancel changed exact stored layout`)
    const longPress = await exerciseLongPress()

    evidence.viewports.push({ viewport, expectedMode, profiles: profileEvidence, interactions, longPress })
  }

  const beforeSave = await storageLayout()
  const saveToolbar = await openArrange()
  await saveToolbar.getByRole('tab', { name: 'Desktop' }).click()
  const saveClock = page.getByRole('button', { name: 'Edit Clock' })
  await saveClock.press('ArrowRight')
  await saveToolbar.getByRole('button', { name: 'Save' }).click()
  await saveToolbar.waitFor({ state: 'detached' })
  const afterSave = await storageLayout()
  assert(afterSave !== beforeSave && JSON.parse(afterSave).version === 3, 'explicit Save did not persist a changed V3 layout')

  assert(evidence.runtimeErrors.length === 0, `runtime errors: ${evidence.runtimeErrors.join('; ')}`)
  assert(evidence.failedRequests.length === 0, `failed requests: ${evidence.failedRequests.join('; ')}`)
} catch (error) {
  caughtError = error
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/arrange-p5-failure.png`, fullPage: false }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true }).catch(() => {})
  await context.close().then(() => { evidence.cleanup.contextClosed = true }).catch(() => {})
  rmSync(profileDir, { recursive: true, force: true })
  rmSync(dist, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
  evidence.cleanup.distRemoved = true
  writeFileSync(`${outDir}/arrange-p5-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`)
}

console.log(`EVIDENCE: ${JSON.stringify(evidence)}`)
if (caughtError) {
  console.error(`FAIL: information-first PR-P5 Arrange proof: ${evidence.error}`)
  process.exitCode = 1
} else {
  console.log('PASS: information-first PR-P5 Arrange proof')
}
