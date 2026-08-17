import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import {
  COMMON_DISPLAY_STATES,
  COMMON_DISPLAY_VIEWPORTS,
  DEEP_INTERACTION_VIEWPORTS,
  OWNER_CAPTURE_PATHS,
  WEATHER_CORNER_CASES,
  commonDisplayPath,
  viewportLabel,
} from './information-first-viewports.mjs'
import {
  CONNECTOR_SIZE_PROMISES,
  applyConnectorSizeFixture,
  restoreInformationFirstFixtures,
  seedInformationFirstFixtures,
} from './information-first-fixtures.mjs'
import { mergeInformationFirstEvidence } from './information-first-evidence.mjs'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const expected503Console = 'console: Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
const repoRoot = process.cwd()
const dist = resolve('.preview-information-first-dist')
const profileDir = resolve('.playwright-profile-information-first')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/aurora-v1-canvas-implementation-session-prompt/outputs/information-first-common-display'
const evidencePath = join(outDir, 'information-first-evidence.json')
const failurePath = join(outDir, 'information-first-failure.png')
const headed = process.argv.includes('--headed')
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length)
const after = process.argv.find((arg) => arg.startsWith('--after='))?.slice('--after='.length)
const redoConnector = process.argv.find((arg) => arg.startsWith('--redo-connector='))?.slice('--redo-connector='.length)
assert(!(only && after), 'use only one of --only or --after')
assert(!redoConnector || Object.hasOwn(CONNECTOR_SIZE_PROMISES, redoConnector), `unknown --redo-connector ${String(redoConnector)}`)

for (const [path, suffix] of [
  [dist, '.preview-information-first-dist'],
  [profileDir, '.playwright-profile-information-first'],
  [outDir.replaceAll('/', '\\'), '\\outputs\\information-first-common-display'],
]) {
  if (!path.toLowerCase().endsWith(suffix.toLowerCase())) throw new Error(`unsafe temporary path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })
if (!only && !after) rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const build = spawnSync(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'), 'build', '--mode', 'preview', '--outDir', dist, '--emptyOutDir',
], { cwd: repoRoot, encoding: 'utf8' })
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`preview build failed with status ${build.status}`)
}

const afterIndex = after ? COMMON_DISPLAY_VIEWPORTS.findIndex((item) => viewportLabel(item) === after) : -1
assert(!after || afterIndex >= 0, `unknown --after viewport ${String(after)}`)
const viewports = only
  ? COMMON_DISPLAY_VIEWPORTS.filter((item) => viewportLabel(item) === only)
  : after
    ? COMMON_DISPLAY_VIEWPORTS.slice(afterIndex + 1)
    : COMMON_DISPLAY_VIEWPORTS
assert(viewports.length > 0 || afterIndex === COMMON_DISPLAY_VIEWPORTS.length - 1, `no viewport selected for ${only ? `--only=${only}` : `--after=${after}`}`)
const outputEvidencePath = only ? join(outDir, `information-first-focused-${only}.json`) : evidencePath

const canonicalPrevious = after && existsSync(evidencePath)
  ? JSON.parse(readFileSync(evidencePath, 'utf8'))
  : null
const focusedPreviousPath = after ? join(outDir, `information-first-focused-${after}.json`) : null
const focusedPrevious = focusedPreviousPath && existsSync(focusedPreviousPath)
  ? JSON.parse(readFileSync(focusedPreviousPath, 'utf8'))
  : null
const previous = mergeInformationFirstEvidence(canonicalPrevious, focusedPrevious)
if (after) {
  assert(previous, `--after=${after} requires prior evidence`)
  const completedStates = previous.states.filter((entry) => entry.viewport === after)
  assert(completedStates.length === COMMON_DISPLAY_STATES.length, `--after=${after} requires all ${COMMON_DISPLAY_STATES.length} green states for that viewport`)
}

const evidence = {
  packet: 'PR-P6',
  deviceScaleFactor: 1,
  catalog: COMMON_DISPLAY_VIEWPORTS,
  stateNames: COMMON_DISPLAY_STATES,
  states: previous?.states ?? [],
  deepInteractions: previous?.deepInteractions ?? [],
  weatherCorners: previous?.weatherCorners ?? [],
  connectorSizes: (previous?.connectorSizes ?? []).filter((entry) => entry.id !== redoConnector),
  connectorStates: (previous?.connectorStates ?? []).filter((entry) => entry.id !== redoConnector),
  ownerCaptures: OWNER_CAPTURE_PATHS,
  runtimeErrors: (previous?.runtimeErrors ?? []).filter((message) => message !== expected503Console),
  failedRequests: previous?.failedRequests ?? [],
  unexpectedExternalRequests: previous?.unexpectedExternalRequests ?? [],
  expectedFixtureRequests: previous?.expectedFixtureRequests ?? [],
  cleanup: {},
}

let networkMode = 'unexpected'
let heldRoutes = []
const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: viewports[0] ?? COMMON_DISPLAY_VIEWPORTS.at(-1),
  deviceScaleFactor: 1,
  hasTouch: true,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
await context.route(/^https?:\/\//, async (route) => {
  const request = `${route.request().method()} ${route.request().url()}`
  if (networkMode === 'hold') {
    evidence.expectedFixtureRequests.push(`held ${request}`)
    heldRoutes.push(route)
    return
  }
  if (networkMode === 'error') {
    evidence.expectedFixtureRequests.push(`503 ${request}`)
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture"}' })
    return
  }
  evidence.unexpectedExternalRequests.push(request)
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
})

const page = await context.newPage()
page.setDefaultTimeout(15_000)
page.on('console', (message) => {
  if (message.type() !== 'error') return
  const entry = `console: ${message.text()}`
  if (networkMode === 'error' && entry === expected503Console) evidence.expectedFixtureRequests.push(entry)
  else evidence.runtimeErrors.push(entry)
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
  await page.waitForFunction(() => {
    const image = document.querySelector('img[data-photo]')
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
  })
  await page.waitForTimeout(80)
}

const reloadCanvas = async () => {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
}

const configureActiveConnectorsForViewport = async (viewport) => {
  const compact = viewport.width < 900 || viewport.height < 700
  const ultrawide = viewport.width >= 1600 && viewport.width / viewport.height >= 2.1
  const display = !compact && !ultrawide && viewport.width >= 2200 && viewport.height >= 1100
  const visible = compact
    ? ['ics', 'github', 'rss', 'crypto']
    : display || ultrawide
      ? Object.keys(CONNECTOR_SIZE_PROMISES)
      : ['ics', 'status', 'github', 'rss', 'crypto']
  await page.evaluate(async (ids) => {
    const { informationFirstFixture } = await chrome.storage.local.get('informationFirstFixture')
    const connectors = Object.fromEntries(Object.entries(informationFirstFixture.configs).map(([id, config]) => [
      id, { ...config, enabled: ids.includes(id) },
    ]))
    await chrome.storage.local.set({ connectors })
  }, visible)
}

const restoreForViewport = async (viewport) => {
  await restoreInformationFirstFixtures(page)
  await configureActiveConnectorsForViewport(viewport)
}

const screenshot = async (path) => {
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, animations: 'disabled', caret: 'hide' })
}

const rect = (value) => ({
  left: Number(value.left.toFixed(2)), top: Number(value.top.toFixed(2)),
  right: Number(value.right.toFixed(2)), bottom: Number(value.bottom.toFixed(2)),
  width: Number(value.width.toFixed(2)), height: Number(value.height.toFixed(2)),
})

const readGeometry = async (state) => page.evaluate(({ state }) => {
  const box = (node) => {
    const value = node.getBoundingClientRect()
    return {
      left: Number(value.left.toFixed(2)), top: Number(value.top.toFixed(2)),
      right: Number(value.right.toFixed(2)), bottom: Number(value.bottom.toFixed(2)),
      width: Number(value.width.toFixed(2)), height: Number(value.height.toFixed(2)),
    }
  }
  const visible = (node) => {
    const value = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return value.width > 0 && value.height > 0 && value.right > 0 && value.bottom > 0
      && value.left < innerWidth && value.top < innerHeight && style.display !== 'none' && style.visibility !== 'hidden'
  }
  const canvasItems = [...document.querySelectorAll('.canvas-item[data-canvas-kind="canvas"]')]
    .filter(visible)
    .map((node) => ({ id: node.getAttribute('data-block-id'), bounds: box(node) }))
  const intersections = []
  for (let leftIndex = 0; leftIndex < canvasItems.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < canvasItems.length; rightIndex += 1) {
      const left = canvasItems[leftIndex]
      const right = canvasItems[rightIndex]
      const width = Math.min(left.bounds.right, right.bounds.right) - Math.max(left.bounds.left, right.bounds.left)
      const height = Math.min(left.bounds.bottom, right.bounds.bottom) - Math.max(left.bounds.top, right.bounds.top)
      if (width > 1 && height > 1) intersections.push({ left: left.id, right: right.id, width, height })
    }
  }
  const missingImages = [...document.images]
    .filter((image) => visible(image) && (!image.complete || image.naturalWidth === 0))
    .map((image) => image.currentSrc || image.src)
  const pointerViolations = [...document.querySelectorAll('*')]
    .filter((node) => visible(node) && getComputedStyle(node).cursor === 'pointer')
    .filter((node) => !node.closest('button, a[href], input, select, textarea, label, summary, [role="button"], [role="tab"], [role="switch"], [tabindex="0"]'))
    .slice(0, 20)
    .map((node) => ({ tag: node.tagName, className: String(node.className), text: node.textContent?.trim().slice(0, 60) }))
  const typeScale = document.querySelector('main[data-aurora-canvas]')?.getAttribute('data-canvas-text-scale')
  const minimums = {
    standard: { clock: 48, date: 16, greeting: 32, support: 16, quote: 15, attribution: 13, body: 14, metadata: 12 },
    large: { clock: 72, date: 20, greeting: 48, support: 18, quote: 18, attribution: 16, body: 16, metadata: 14 },
  }
  const type = typeScale === 'standard' || typeScale === 'large'
    ? Object.entries(minimums[typeScale]).flatMap(([role, minimum]) => {
        const node = [...document.querySelectorAll(`[data-canvas-type-role="${role}"]`)].find(visible)
        return node ? [{ role, minimum, size: Number.parseFloat(getComputedStyle(node).fontSize), text: node.textContent?.trim().slice(0, 80) }] : []
      })
    : []
  const dialog = document.querySelector('[role="dialog"][aria-label="Settings"]')
  const details = document.querySelector('[data-weather-details]')
  const artboard = document.querySelector('[data-arrange-artboard-viewport]')
  const inspector = document.querySelector('[data-arrange-inspector-mode]')
  const finiteSurfaces = [dialog, details, artboard].filter((node) => node instanceof HTMLElement).map((node) => {
    const style = getComputedStyle(node)
    return {
      name: node.getAttribute('aria-label') ?? node.getAttribute('data-weather-details') ?? node.getAttribute('data-arrange-artboard-viewport') ?? node.tagName,
      bounds: box(node),
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: style.overflowY,
      scrollableWhenNeeded: node.scrollHeight <= node.clientHeight + 1 || style.overflowY === 'auto' || style.overflowY === 'scroll',
    }
  })
  const required = dialog ?? details ?? artboard
  return {
    state,
    viewport: { width: innerWidth, height: innerHeight },
    profile: document.querySelector('[data-canvas-surface]')?.getAttribute('data-canvas-profile'),
    documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    canvasItems,
    intersections,
    missingImages,
    pointerViolations,
    typeScale,
    type,
    requiredBounds: required instanceof HTMLElement ? box(required) : null,
    settingsScrollOwner: dialog?.getAttribute('data-settings-scroll-owner') ?? null,
    arrangeMode: document.querySelector('[data-arrange-artboard]')?.getAttribute('data-arrange-viewport-mode') ?? null,
    inspectorMode: inspector?.getAttribute('data-arrange-inspector-mode') ?? null,
    artboardLogical: document.querySelector('[data-arrange-artboard-logical]') instanceof HTMLElement
      ? {
          width: document.querySelector('[data-arrange-artboard-logical]').style.width,
          height: document.querySelector('[data-arrange-artboard-logical]').style.height,
          transform: document.querySelector('[data-arrange-artboard-logical]').style.transform,
        }
      : null,
    weather: details instanceof HTMLElement ? {
      bounds: box(details),
      vertical: details.dataset.weatherVertical,
      horizontal: details.dataset.weatherHorizontal,
    } : null,
    finiteSurfaces,
  }
}, { state })

const assertCommonGeometry = (geometry) => {
  const { width, height } = geometry.viewport
  assert(!geometry.documentHorizontalOverflow, `${width}x${height} ${geometry.state}: document horizontal overflow`)
  assert(geometry.missingImages.length === 0, `${width}x${height} ${geometry.state}: missing images ${JSON.stringify(geometry.missingImages)}`)
  assert(geometry.pointerViolations.length === 0, `${width}x${height} ${geometry.state}: pointer cursor on noninteractive content ${JSON.stringify(geometry.pointerViolations)}`)
  assert(geometry.finiteSurfaces.every((surface) => surface.scrollableWhenNeeded), `${width}x${height} ${geometry.state}: finite surface cannot scroll`)
  if (geometry.state === 'information-rich-canvas') {
    assert(geometry.canvasItems.length >= 5, `${width}x${height}: Canvas is not information rich`)
    assert(geometry.intersections.length === 0, `${width}x${height}: Canvas intersections ${JSON.stringify(geometry.intersections)}`)
  }
  if (geometry.state.startsWith('settings-')) {
    assert(geometry.requiredBounds, `${width}x${height}: Settings is missing`)
    assert(geometry.requiredBounds.left >= -0.5 && geometry.requiredBounds.right <= width + 0.5, `${width}x${height}: Settings clips horizontally`)
    assert(geometry.settingsScrollOwner === 'document', `${width}x${height}: Settings lost its one document scroll owner`)
    if (width < 900) assert(geometry.requiredBounds.width >= width - 1, `${width}x${height}: narrow Settings is not full viewport`)
    else assert(geometry.requiredBounds.width <= 866, `${width}x${height}: roomy Settings exceeds 54rem`)
  }
  if (geometry.state === 'weather-top-right-expanded') {
    assert(geometry.weather, `${width}x${height}: Weather details are missing`)
    assert(geometry.weather.bounds.left >= 7.5 && geometry.weather.bounds.top >= 7.5, `${width}x${height}: Weather misses the top/left safe margin`)
    assert(geometry.weather.bounds.right <= width - 7.5 && geometry.weather.bounds.bottom <= height - 7.5, `${width}x${height}: Weather misses the right/bottom safe margin`)
    assert(geometry.weather.vertical === 'below', `${width}x${height}: top Weather did not prefer down`)
  }
  if (geometry.state === 'arrange-small-inspector') {
    const expected = width >= 1100 ? 'side' : 'sheet'
    assert(geometry.arrangeMode === expected && geometry.inspectorMode === expected, `${width}x${height}: wrong Arrange modality`)
    assert(geometry.artboardLogical?.width === '390px' && geometry.artboardLogical?.height === '844px', `${width}x${height}: Small logical artboard is untruthful`)
  }
  if (geometry.state === 'information-rich-canvas' || geometry.state === 'weather-top-right-expanded') {
    for (const value of geometry.type) assert(value.size + 0.01 >= value.minimum, `${width}x${height}: ${value.role} ${value.size}px below ${value.minimum}px`)
    if (width === 3840 && height === 2160) {
      const clock = geometry.type.find(({ role }) => role === 'clock')
      assert(clock && clock.size >= 184, `4K Clock is ${clock?.size ?? 'missing'}px, expected at least 184px`)
    }
  }
}

const openSettings = async (tabName) => {
  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor()
  await settings.getByRole('tab', { name: tabName }).click()
  return settings
}

const openArrange = async () => {
  const settings = await openSettings('Widgets')
  await settings.getByRole('button', { name: 'Arrange layout' }).click()
  const toolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await toolbar.waitFor()
  await toolbar.getByRole('tab', { name: 'Small' }).click()
  await page.locator('[data-arrange-artboard]').waitFor()
  await page.getByRole('complementary').waitFor()
  return toolbar
}

const moveWeatherToTopRight = async () => page.evaluate(async () => {
  const { layout } = await chrome.storage.local.get('layout')
  const profile = document.querySelector('[data-canvas-surface]')?.getAttribute('data-canvas-profile')
  if (!profile || !layout?.profiles?.[profile]?.placements?.weather) throw new Error('Weather placement is unavailable')
  const current = layout.profiles[profile].placements.weather
  await chrome.storage.local.set({
    layout: {
      ...layout,
      profiles: {
        ...layout.profiles,
        [profile]: {
          ...layout.profiles[profile],
          placements: { ...layout.profiles[profile].placements, weather: { ...current, x: 100, y: 0 } },
        },
      },
    },
  })
})

const siblingRects = async () => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('.canvas-item[data-canvas-kind="canvas"]')]
    .filter((node) => node.getAttribute('data-block-id') !== 'weather')
    .map((node) => {
      const value = node.getBoundingClientRect()
      return [node.getAttribute('data-block-id'), [value.left, value.top, value.width, value.height].map((number) => Number(number.toFixed(3)))]
    }),
))

const runCommonStateMatrix = async () => {
  for (const viewport of viewports) {
    const label = viewportLabel(viewport)
    await page.setViewportSize(viewport)
    await restoreForViewport(viewport)
    await reloadCanvas()

    const canvasPath = commonDisplayPath(outDir, viewport, 'information-rich-canvas')
    await screenshot(canvasPath)
    const canvasGeometry = await readGeometry('information-rich-canvas')
    assertCommonGeometry(canvasGeometry)
    evidence.states.push({ viewport: label, state: 'information-rich-canvas', path: canvasPath, geometry: canvasGeometry })

    const widgets = await openSettings('Widgets')
    await widgets.getByRole('region', { name: 'Widgets' }).waitFor()
    const widgetsPath = commonDisplayPath(outDir, viewport, 'settings-widgets')
    await screenshot(widgetsPath)
    const widgetsGeometry = await readGeometry('settings-widgets')
    assertCommonGeometry(widgetsGeometry)
    evidence.states.push({ viewport: label, state: 'settings-widgets', path: widgetsPath, geometry: widgetsGeometry })

    await widgets.getByRole('tab', { name: 'Connectors' }).click()
    await widgets.getByRole('region', { name: 'Connectors' }).waitFor()
    const connectorsPath = commonDisplayPath(outDir, viewport, 'settings-connectors')
    await screenshot(connectorsPath)
    const connectorsGeometry = await readGeometry('settings-connectors')
    assertCommonGeometry(connectorsGeometry)
    evidence.states.push({ viewport: label, state: 'settings-connectors', path: connectorsPath, geometry: connectorsGeometry })
    await widgets.getByRole('button', { name: 'Close settings' }).click()
    await widgets.waitFor({ state: 'detached' })

    await restoreForViewport(viewport)
    await reloadCanvas()
    await moveWeatherToTopRight()
    await reloadCanvas()
    const siblingsBefore = await siblingRects()
    const weatherToggle = page.locator('[data-block-id="weather"] button[aria-expanded]')
    await weatherToggle.click()
    await page.locator('[data-weather-details]').waitFor()
    const siblingsAfter = await siblingRects()
    assert(JSON.stringify(siblingsAfter) === JSON.stringify(siblingsBefore), `${label}: opening Weather moved a sibling`)
    const weatherPath = commonDisplayPath(outDir, viewport, 'weather-top-right-expanded')
    await screenshot(weatherPath)
    const weatherGeometry = await readGeometry('weather-top-right-expanded')
    assertCommonGeometry(weatherGeometry)
    evidence.states.push({ viewport: label, state: 'weather-top-right-expanded', path: weatherPath, geometry: weatherGeometry, siblingStable: true })
    await page.keyboard.press('Escape')
    await page.locator('[data-weather-details]').waitFor({ state: 'detached' })
    assert(await weatherToggle.evaluate((node) => document.activeElement === node), `${label}: Weather Escape did not restore focus`)

    await restoreForViewport(viewport)
    await reloadCanvas()
    const toolbar = await openArrange()
    const arrangePath = commonDisplayPath(outDir, viewport, 'arrange-small-inspector')
    await screenshot(arrangePath)
    const arrangeGeometry = await readGeometry('arrange-small-inspector')
    assertCommonGeometry(arrangeGeometry)
    evidence.states.push({ viewport: label, state: 'arrange-small-inspector', path: arrangePath, geometry: arrangeGeometry })
    await toolbar.getByRole('button', { name: 'Cancel' }).click()
    await toolbar.waitFor({ state: 'detached' })
  }
}

const exerciseArrange = async (save) => {
  const before = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))
  const toolbar = await openArrange()
  await toolbar.getByRole('tab', { name: 'Desktop' }).click()
  const clock = page.getByRole('button', { name: 'Edit Clock' })
  await clock.click()
  await clock.evaluate((node) => {
    window.__prp6Capture = { got: 0, active: false }
    node.addEventListener('gotpointercapture', (event) => {
      window.__prp6Capture.got += 1
      window.__prp6Capture.active = node.hasPointerCapture(event.pointerId)
    })
  })
  const target = await clock.boundingBox()
  const canvas = await page.locator('[data-canvas-surface]').boundingBox()
  assert(target && canvas, 'Arrange drag geometry is missing')
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2)
  await page.mouse.down()
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 5 })
  const guides = await page.locator('[data-canvas-guide]').count()
  const capture = await page.evaluate(() => window.__prp6Capture)
  await page.mouse.up()
  assert(capture?.got > 0 && capture.active && guides > 0, `Arrange pointer capture/guides failed ${JSON.stringify({ capture, guides })}`)
  const beforeKeyboard = Number(await page.locator('[data-block-id="clock"]').getAttribute('data-canvas-x'))
  await clock.press('ArrowRight')
  const afterKeyboard = Number(await page.locator('[data-block-id="clock"]').getAttribute('data-canvas-x'))
  assert(afterKeyboard > beforeKeyboard, 'Arrange keyboard move failed')
  const overlap = page.getByRole('region', { name: 'Overlap' })
  if (await overlap.count()) {
    await overlap.getByRole('button', { name: 'Bring forward' }).click()
    await overlap.getByRole('button', { name: 'Send backward' }).click()
  }
  await toolbar.getByRole('tab', { name: 'Large' }).click()
  await toolbar.getByRole('tab', { name: 'Wide' }).click()
  await toolbar.getByRole('tab', { name: 'Small' }).click()
  if (save) {
    await toolbar.getByRole('button', { name: 'Save' }).click()
    await toolbar.waitFor({ state: 'detached' })
  } else {
    await toolbar.getByRole('button', { name: 'Cancel' }).click()
    await toolbar.waitFor({ state: 'detached' })
    const after = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))
    assert(after === before, 'Arrange Cancel did not restore exact layout bytes')
  }
  return { capture, guides, beforeKeyboard, afterKeyboard, saved: save }
}

const runDeepInteractions = async () => {
  const completed = new Set(evidence.deepInteractions.map((entry) => entry.viewport))
  for (const viewport of DEEP_INTERACTION_VIEWPORTS.filter((item) => (!only || viewportLabel(item) === only) && !completed.has(viewportLabel(item)))) {
    const label = viewportLabel(viewport)
    await page.setViewportSize(viewport)
    await restoreForViewport(viewport)
    await reloadCanvas()

    const settingsButton = page.getByRole('button', { name: 'Open settings' })
    const settings = await openSettings('Widgets')
    const widgetsTab = settings.getByRole('tab', { name: 'Widgets' })
    await widgetsTab.focus()
    await widgetsTab.press(viewport.width < 900 ? 'ArrowRight' : 'ArrowDown')
    assert(await settings.getByRole('tab', { name: 'Connectors' }).getAttribute('aria-selected') === 'true', `${label}: keyboard tab navigation failed`)
    await settings.getByRole('button', { name: 'Close settings' }).click()
    await settings.waitFor({ state: 'detached' })
    assert(await settingsButton.evaluate((node) => document.activeElement === node), `${label}: Settings focus restoration failed`)

    const weatherToggle = page.locator('[data-block-id="weather"] button[aria-expanded]')
    await weatherToggle.click()
    await page.locator('[data-weather-details]').waitFor()
    await page.keyboard.press('Escape')
    await page.locator('[data-weather-details]').waitFor({ state: 'detached' })
    assert(await weatherToggle.evaluate((node) => document.activeElement === node), `${label}: Weather focus restoration failed`)

    const tasks = page.getByRole('button', { name: 'Tasks', exact: true })
    await tasks.click()
    const tasksDialog = page.getByRole('dialog', { name: 'Tasks' })
    await tasksDialog.waitFor()
    await tasksDialog.getByRole('button', { name: 'Close tasks' }).click()
    await tasksDialog.waitFor({ state: 'detached' })
    assert(await tasks.evaluate((node) => document.activeElement === node), `${label}: Tasks focus restoration failed`)

    const arrange = await exerciseArrange(label === '1920x1080')
    await restoreForViewport(viewport)
    await reloadCanvas()

    await page.evaluate(async () => {
      const { connectors } = await chrome.storage.local.get('connectors')
      const { vercel, ...withoutVercel } = connectors
      void vercel
      await chrome.storage.local.set({ connectors: withoutVercel })
    })
    await reloadCanvas()
    const connectorSettings = await openSettings('Connectors')
    const connectorRegion = connectorSettings.getByRole('region', { name: 'Connectors' })
    const setup = connectorRegion.getByRole('button', { name: 'Set up Vercel' })
    await setup.click()
    const setupRegion = connectorRegion.getByRole('region', { name: 'Vercel setup' })
    await setupRegion.waitFor()
    await setupRegion.getByRole('button', { name: 'Cancel' }).click()
    assert(await setup.evaluate((node) => document.activeElement === node), `${label}: connector Setup Cancel focus failed`)
    const editCrypto = connectorRegion.getByRole('button', { name: 'Edit Crypto' })
    await editCrypto.click()
    await connectorRegion.getByRole('region', { name: 'Crypto settings' }).waitFor()
    await connectorRegion.getByRole('button', { name: 'Close Crypto editor' }).click()
    assert(await editCrypto.evaluate((node) => document.activeElement === node), `${label}: connector Edit close focus failed`)
    await connectorSettings.getByRole('button', { name: 'Close settings' }).click()

    await restoreForViewport(viewport)
    await reloadCanvas()
    const clockTime = page.locator('[data-block-id="clock"] time')
    const clockBox = await clockTime.boundingBox()
    assert(clockBox, `${label}: Clock is unavailable for long press`)
    await page.mouse.move(clockBox.x + clockBox.width / 2, clockBox.y + clockBox.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(650)
    const longPressToolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
    await longPressToolbar.waitFor()
    await page.mouse.up()
    await longPressToolbar.getByRole('button', { name: 'Cancel' }).click()

    evidence.deepInteractions.push({ viewport: label, settingsKeyboard: true, weather: true, tasks: true, connectors: true, longPress: true, arrange })
  }
}

const releaseHeldRoutes = async () => {
  const routes = heldRoutes
  heldRoutes = []
  await Promise.all(routes.map((route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }).catch(() => {})))
}

const runWeatherCorners = async () => {
  const completed = new Set(evidence.weatherCorners.map((entry) => entry.label))
  for (const item of WEATHER_CORNER_CASES.filter(({ viewport }) => !only || viewportLabel(viewport) === only)) {
    const label = `${viewportLabel(item.viewport)}-${item.corner}`
    if (completed.has(label)) continue
    await page.setViewportSize(item.viewport)
    await restoreForViewport(item.viewport)
    await reloadCanvas()
    await page.evaluate(async ({ x, y }) => {
      const { layout } = await chrome.storage.local.get('layout')
      const profile = document.querySelector('[data-canvas-surface]')?.getAttribute('data-canvas-profile')
      const current = layout.profiles[profile].placements.weather
      await chrome.storage.local.set({ layout: { ...layout, profiles: { ...layout.profiles, [profile]: { ...layout.profiles[profile], placements: { ...layout.profiles[profile].placements, weather: { ...current, x, y } } } } } })
    }, item)
    await reloadCanvas()
    const toggle = page.locator('[data-block-id="weather"] button[aria-expanded]')
    // Compact uses a truthful scrollable logical Canvas. Bring a stored
    // bottom-corner placement into the viewport before taking the baseline;
    // otherwise Playwright's click scroll is misreported as sibling movement.
    await toggle.scrollIntoViewIfNeeded()
    const siblingsBefore = await siblingRects()
    await toggle.click()
    const details = page.locator('[data-weather-details]')
    await details.waitFor()
    const box = await details.boundingBox()
    const direction = await details.evaluate((node) => ({ vertical: node.dataset.weatherVertical, horizontal: node.dataset.weatherHorizontal }))
    const siblingsAfter = await siblingRects()
    assert(box && box.x >= 7.5 && box.y >= 7.5 && box.x + box.width <= item.viewport.width - 7.5 && box.y + box.height <= item.viewport.height - 7.5, `${label}: Weather outside safe area`)
    assert(JSON.stringify(siblingsBefore) === JSON.stringify(siblingsAfter), `${label}: Weather moved a sibling; before=${JSON.stringify(siblingsBefore)} after=${JSON.stringify(siblingsAfter)}`)
    const path = join(outDir, 'weather-corners', `${label}.png`)
    await screenshot(path)
    await page.keyboard.press('Escape')
    await details.waitFor({ state: 'detached' })
    assert(await toggle.evaluate((node) => document.activeElement === node), `${label}: Escape did not restore Weather focus`)
    await toggle.click()
    await details.waitFor()
    await page.mouse.click(2, 2)
    await details.waitFor({ state: 'detached' })
    assert(await toggle.evaluate((node) => document.activeElement === node), `${label}: outside close did not restore Weather focus`)
    evidence.weatherCorners.push({ label, path, box, direction, siblingStable: true, escape: true, outside: true })
  }
}

const connectorTextSignature = async (id) => page.locator(`[data-block-id="${id}"]`).evaluate((node) => ({
  text: node.innerText.replace(/\s+/g, ' ').trim(),
  descendants: node.querySelectorAll('*').length,
  headings: [...node.querySelectorAll('h1,h2,h3,[role="heading"]')].map((item) => item.textContent?.trim()),
  lists: node.querySelectorAll('li').length,
  graphs: node.querySelectorAll('[role="img"], svg').length,
}))

const runConnectorMatrix = async () => {
  if (only) return
  await page.setViewportSize({ width: 1600, height: 900 })
  for (const [id, sizes] of Object.entries(CONNECTOR_SIZE_PROMISES)) {
    const signatures = []
    for (const size of sizes) {
      const priorEvidence = evidence.connectorSizes.find((entry) => entry.id === id && entry.size === size)
      if (priorEvidence) {
        signatures.push(priorEvidence.signature)
        continue
      }
      await applyConnectorSizeFixture(page, id, size)
      await reloadCanvas()
      const widget = page.locator(`[data-block-id="${id}"]`)
      await widget.waitFor()
      const path = join(outDir, 'connector-sizes', `${id}-${size}.png`)
      mkdirSync(dirname(path), { recursive: true })
      await widget.screenshot({ path, animations: 'disabled', caret: 'hide' })
      const signature = await connectorTextSignature(id)
      const bounds = await widget.boundingBox()
      signatures.push(signature)
      evidence.connectorSizes.push({ id, size, path, bounds, signature })
    }
    for (let index = 1; index < signatures.length; index += 1) {
      const prior = signatures[index - 1]
      const current = signatures[index]
      const addsContent = current.text !== prior.text || current.descendants > prior.descendants || current.lists > prior.lists || current.graphs > prior.graphs
      assert(addsContent, `${id} ${sizes[index]} adds no useful content over ${sizes[index - 1]}`)
    }
  }

  if (new Set(evidence.connectorStates.map((entry) => `${entry.id}:${entry.state}`)).size === 4) return

  await applyConnectorSizeFixture(page, 'rss', 'standard')
  await page.evaluate(async () => {
    const { connectorSnapshots } = await chrome.storage.local.get('connectorSnapshots')
    await chrome.storage.local.set({ connectorSnapshots: { ...connectorSnapshots, rss: { ...connectorSnapshots.rss, fetchedAt: Date.now(), data: [] } } })
  })
  await reloadCanvas()
  const emptyPath = join(outDir, 'connector-states', 'rss-empty.png')
  await page.locator('[data-block-id="rss"]').screenshot({ path: emptyPath })
  evidence.connectorStates.push({ id: 'rss', state: 'empty', path: emptyPath, text: (await connectorTextSignature('rss')).text })

  await applyConnectorSizeFixture(page, 'ics', 'standard')
  await page.evaluate(async () => {
    const { connectorSnapshots } = await chrome.storage.local.get('connectorSnapshots')
    await chrome.storage.local.set({ connectorSnapshots: { ...connectorSnapshots, ics: { ...connectorSnapshots.ics, fetchedAt: Date.now() - 86_400_000 } } })
  })
  networkMode = 'hold'
  await reloadCanvas()
  const stalePath = join(outDir, 'connector-states', 'ics-stale.png')
  await page.locator('[data-block-id="ics"]').screenshot({ path: stalePath })
  evidence.connectorStates.push({ id: 'ics', state: 'stale', path: stalePath, text: (await connectorTextSignature('ics')).text })
  await releaseHeldRoutes()
  networkMode = 'unexpected'

  await applyConnectorSizeFixture(page, 'gitlab', 'standard')
  await page.evaluate(async () => {
    const { connectorSnapshots } = await chrome.storage.local.get('connectorSnapshots')
    const { gitlab, ...rest } = connectorSnapshots
    void gitlab
    await chrome.storage.local.set({ connectorSnapshots: rest })
  })
  networkMode = 'hold'
  await reloadCanvas()
  const loadingPath = join(outDir, 'connector-states', 'gitlab-loading.png')
  await page.locator('[data-block-id="gitlab"]').screenshot({ path: loadingPath })
  evidence.connectorStates.push({ id: 'gitlab', state: 'loading', path: loadingPath, text: (await connectorTextSignature('gitlab')).text })
  await releaseHeldRoutes()
  networkMode = 'unexpected'

  await applyConnectorSizeFixture(page, 'github', 'standard')
  await page.evaluate(async () => {
    const { connectorSnapshots } = await chrome.storage.local.get('connectorSnapshots')
    const { github, ...rest } = connectorSnapshots
    void github
    await chrome.storage.local.set({ connectorSnapshots: rest })
  })
  networkMode = 'error'
  await reloadCanvas()
  await page.waitForTimeout(250)
  const errorPath = join(outDir, 'connector-states', 'github-error.png')
  await page.locator('[data-block-id="github"]').screenshot({ path: errorPath })
  evidence.connectorStates.push({ id: 'github', state: 'error', path: errorPath, text: (await connectorTextSignature('github')).text })
  networkMode = 'unexpected'
}

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await seedInformationFirstFixtures(page)
  await runCommonStateMatrix()
  await runDeepInteractions()
  await runWeatherCorners()
  await runConnectorMatrix()

  if (!only) {
    assert(evidence.states.length === 115, `expected 115 states, received ${evidence.states.length}`)
    assert(evidence.deepInteractions.length === 6, `expected 6 deep interaction fenceposts, received ${evidence.deepInteractions.length}`)
    assert(evidence.connectorSizes.length === 24, `expected 24 connector size captures, received ${evidence.connectorSizes.length}`)
    assert(evidence.connectorStates.length === 4, `expected 4 explicit non-ready connector states, received ${evidence.connectorStates.length}`)
    assert(evidence.weatherCorners.length === 4, `expected 4 Weather corners, received ${evidence.weatherCorners.length}`)
    assert(evidence.unexpectedExternalRequests.length === 0, `unexpected external requests ${JSON.stringify(evidence.unexpectedExternalRequests)}`)
    assert(evidence.runtimeErrors.length === 0, `runtime errors ${JSON.stringify(evidence.runtimeErrors)}`)
    assert(evidence.failedRequests.length === 0, `failed requests ${JSON.stringify(evidence.failedRequests)}`)
  }
} catch (error) {
  caughtError = error
  evidence.error = String(error?.stack ?? error)
  try { await screenshot(failurePath) } catch {}
} finally {
  await releaseHeldRoutes()
  try { await page.close(); evidence.cleanup.pageClosed = true } catch { evidence.cleanup.pageClosed = false }
  try { await context.close(); evidence.cleanup.contextClosed = true } catch { evidence.cleanup.contextClosed = false }
  try { rmSync(profileDir, { recursive: true, force: true }); evidence.cleanup.profileRemoved = true } catch { evidence.cleanup.profileRemoved = false }
  try { rmSync(dist, { recursive: true, force: true }); evidence.cleanup.distRemoved = true } catch { evidence.cleanup.distRemoved = false }
  writeFileSync(outputEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
}

if (caughtError) throw caughtError
process.stdout.write(`EVIDENCE: ${outputEvidencePath}\n`)
process.stdout.write(`PASS: information-first PR-P6 common-display gate (${evidence.states.length} states)\n`)
