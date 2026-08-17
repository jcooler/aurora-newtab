// One-shot real-Chromium proof for the Aurora V1 Canvas early visual gate.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const repoRoot = process.cwd()
const dist = resolve('.preview-v1-canvas-dist')
const profileDir = resolve('.playwright-profile-v1-canvas')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/aurora-v1-canvas-implementation-session-prompt/outputs/canvas-p4'
const headed = process.argv.includes('--headed')

const assert = (condition, message) => { if (!condition) throw new Error(message) }
for (const [path, suffix] of [[dist, '.preview-v1-canvas-dist'], [profileDir, '.playwright-profile-v1-canvas']]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe temporary path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

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
    for (const key of ['search', 'weather', 'links', 'todo', 'timer', 'bookmarks', 'notes', 'clocks', 'countdown', 'monthCal']) {
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
      connectors: {},
      connectorSnapshots: {},
      photoPrefs: { mode: 'auto', index: 3, lastRotated: day },
      layout: { version: 3, profiles: {} },
    })

    if (chrome.bookmarks) {
      const tree = await chrome.bookmarks.getTree()
      const bar = tree[0]?.children?.find((node) => node.id === '1') ?? tree[0]?.children?.[0]
      if (bar && !(bar.children ?? []).some((node) => node.title === 'Aurora')) {
        const folder = await chrome.bookmarks.create({ parentId: bar.id, title: 'Aurora' })
        await chrome.bookmarks.create({ parentId: folder.id, title: 'Canvas plan', url: 'https://example.com/canvas-plan' })
        await chrome.bookmarks.create({ parentId: folder.id, title: 'QA evidence', url: 'https://example.com/qa-evidence' })
        await chrome.bookmarks.create({ parentId: bar.id, title: 'Reference', url: 'https://example.com/reference' })
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

const capture = async (label, file) => {
  const path = `${outDir}/${file}`
  await page.screenshot({ path, fullPage: false })
  evidence.captures.push({ label, path, viewport: page.viewportSize() })
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
  await capture('Desktop 1600x900 default', 'canvas-p4-desktop-1600x900-default.png')

  const folder = page.getByRole('button', { name: 'Aurora' })
  await folder.click()
  const bookmarkPopover = page.getByRole('dialog', { name: 'Aurora' })
  await bookmarkPopover.waitFor()
  evidence.interactions.bookmarks = await assertInsideViewport(bookmarkPopover, 'Bookmarks popover')
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
  evidence.interactions.focusPrompt = promptSurface
  await page.evaluate(async (focus) => chrome.storage.local.set({ focus }), storedFocus)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas('Desktop')

  const layoutBeforeArrange = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))
  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByRole('tab', { name: 'Widgets' }).click()
  await settings.getByRole('button', { name: 'Arrange layout' }).click()
  const toolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await toolbar.waitFor()
  const clockTarget = page.getByRole('button', { name: 'Edit Clock' })
  await clockTarget.click()
  const inspector = page.getByRole('complementary', { name: 'Clock inspector' })
  await inspector.waitFor()

  const beforePointerX = Number(await page.locator('[data-block-id="clock"]').getAttribute('data-canvas-x'))
  const targetBox = await rectOf(clockTarget)
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2 + 32, { steps: 4 })
  const guidesDuringDrag = await page.locator('[data-canvas-guide]').count()
  await page.mouse.up()
  const afterPointerX = Number(await page.locator('[data-block-id="clock"]').getAttribute('data-canvas-x'))
  const beforeKeyboardLeft = (await rectOf(page.locator('[data-block-id="clock"]'))).x
  await clockTarget.press('ArrowRight')
  const afterKeyboardLeft = (await rectOf(page.locator('[data-block-id="clock"]'))).x
  assert(Number.isFinite(afterPointerX) && afterPointerX === beforePointerX, 'vertical pointer drag changed Clock x unexpectedly')
  assert(afterKeyboardLeft > beforeKeyboardLeft, `ArrowRight did not move Clock: ${beforeKeyboardLeft} -> ${afterKeyboardLeft}`)
  assert(await inspector.getByText(/X \d+\.\d%/).count(), 'Clock inspector coordinates are not visible')
  evidence.interactions.arrange = {
    pointer: { beforeX: beforePointerX, afterX: afterPointerX },
    keyboard: { beforeLeft: beforeKeyboardLeft, afterLeft: afterKeyboardLeft },
    guidesDuringDrag,
    selected: await clockTarget.getAttribute('aria-pressed'),
    inspectorMode: await inspector.getAttribute('data-arrange-inspector-mode'),
  }
  await capture('Desktop 1600x900 Arrange with Clock selected', 'canvas-p4-desktop-1600x900-arrange-clock.png')
  await toolbar.getByRole('button', { name: 'Cancel' }).click()
  await toolbar.waitFor({ state: 'detached' })
  const layoutAfterCancel = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))
  assert(layoutAfterCancel === layoutBeforeArrange, 'Arrange Cancel changed stored layout')

  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas('Small')
  await assertNoHorizontalOverflow('Small default')
  await capture('Small 375x812 default', 'canvas-p4-small-375x812-default.png')

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
  await capture('Small 375x812 Arrange', 'canvas-p4-small-375x812-arrange.png')
  await smallToolbar.getByRole('button', { name: 'Cancel' }).click()

  assert(evidence.runtimeErrors.length === 0, `runtime errors: ${evidence.runtimeErrors.join('; ')}`)
  assert(evidence.failedRequests.length === 0, `failed requests: ${evidence.failedRequests.join('; ')}`)
} catch (error) {
  caughtError = error
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/canvas-p4-failure.png`, fullPage: false }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true }).catch(() => {})
  await context.close().then(() => { evidence.cleanup.contextClosed = true }).catch(() => {})
  rmSync(profileDir, { recursive: true, force: true })
  rmSync(dist, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
  evidence.cleanup.distRemoved = true
  writeFileSync(`${outDir}/canvas-p4-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`)
}

console.log(`EVIDENCE: ${JSON.stringify(evidence)}`)
if (caughtError) {
  console.error(`FAIL: Aurora V1 Canvas focused browser proof: ${evidence.error}`)
  process.exitCode = 1
} else {
  console.log('PASS: Aurora V1 Canvas focused browser proof')
}
