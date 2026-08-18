// Focused witness for the owner-reported 2026-08-18 dock/Month defects:
// production-mode preview build, real Chromium, real pointer interactions.
// Proves: (1) docked widgets show the hover grip + gear and the grip drags
// them OUT of the dock; (2) Month is never offered a dock zone; (3) a stored
// docked placement for a non-dockable widget renders free, never in the
// strip; (4) Month renders the complete month at every size and its
// inspector offers only Standard.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const repoRoot = process.cwd()
const dist = resolve('.preview-nl-p5-hotfix-dist')
const profileDir = resolve('.playwright-profile-nl-p5-hotfix')
const outDir = resolve('.preview-nl-p5-hotfix-out')
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-nl-p5-hotfix-dist'],
  [profileDir, '.playwright-profile-nl-p5-hotfix'],
  [outDir, '.preview-nl-p5-hotfix-out'],
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

const evidence = { stages: [], writes: [], runtimeErrors: [], failedRequests: [], failures: [] }
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

const waitForCanvas = async () => {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(300)
}
const armWriteLog = () => page.evaluate(() => {
  window.__writeLog = []
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') window.__writeLog.push(Object.keys(changes).sort().join(','))
  })
})
const harvestWrites = async () => {
  const writes = await page.evaluate(() => window.__writeLog ?? [])
  evidence.writes.push(...writes)
}
const reloadArmed = async () => {
  await harvestWrites()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await armWriteLog()
}
const stage = async (name, note) => {
  evidence.stages.push({ name, note })
  await page.screenshot({ path: resolve(outDir, `${name}.png`) })
}

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await armWriteLog()

  // ---- Seed: the owner's shape — weather docked bottom, bookmarks docked
  // top, Month free on the canvas. One layouts write + one settings write.
  await page.evaluate(async () => {
    const settings = (await chrome.storage.local.get('settings')).settings
    settings.widgets.weather = true
    settings.widgets.monthCal = true
    const layouts = {
      version: 1,
      activeLayoutId: 'witness',
      layouts: [{
        id: 'witness',
        name: 'Witness',
        widgets: {
          clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -25, tier: 'full', layer: 0 },
          monthCal: { kind: 'free', anchor: 'left', offsetX: 10, offsetY: 0, tier: 'standard', layer: 1 },
          weather: { kind: 'docked', dock: 'bottom', order: 0 },
          // Focus, not Bookmarks: always-available, so the top strip has a
          // real rendered member in a fresh profile with no bookmarks.
          focus: { kind: 'docked', dock: 'top', order: 0 },
        },
      }],
    }
    await chrome.storage.local.set({ settings, layouts })
  })
  await reloadArmed()

  // ---- Stage 1: docked widgets show the hover grip + gear, inside the strip ----
  const dockedWeather = page.locator('nav[aria-label="Bottom bar"] [data-block-id="weather"]')
  if (!await dockedWeather.count()) fail('stage1: seeded docked weather missing from the bottom strip')
  await dockedWeather.hover()
  await page.waitForTimeout(150)
  const weatherGrip = page.locator('button[aria-label="Move Weather"]')
  const weatherGear = page.locator('button[aria-label="Weather settings"]')
  const gripBox = await weatherGrip.boundingBox()
  const gearBox = await weatherGear.boundingBox()
  if (!gripBox) fail('stage1: docked Weather grip not visible on hover')
  if (!gearBox) fail('stage1: docked Weather gear not visible on hover')
  const stripBox = await page.locator('nav[aria-label="Bottom bar"]').boundingBox()
  if (gripBox && stripBox && (gripBox.y < stripBox.y - 1 || gripBox.y + gripBox.height > stripBox.y + stripBox.height + 1)) {
    fail(`stage1: grip vertically escapes the strip (grip ${gripBox.y}..${gripBox.y + gripBox.height} vs strip ${stripBox.y}..${stripBox.y + stripBox.height})`)
  }
  const chromeOpacity = await dockedWeather.evaluate((node) => (
    getComputedStyle(node.querySelector('.canvas-item-chrome')).opacity
  ))
  if (chromeOpacity !== '1') fail(`stage1: docked chrome opacity ${chromeOpacity} on hover`)
  await stage('1-docked-hover-chrome', 'docked Weather hover: grip + gear inside the strip')

  // Top dock too: the docked Focus line shows the same controls.
  await page.locator('nav[aria-label="Top bar"] [data-block-id="focus"]').hover()
  await page.waitForTimeout(150)
  if (!await page.locator('button[aria-label="Move Focus"]').boundingBox()) {
    fail('stage1: docked Focus grip not visible on hover')
  }
  await stage('1b-top-dock-hover', 'top-docked Focus hover: grip visible')

  // ---- Stage 2: the grip drags a docked widget OUT of the dock ----
  const grip2 = await page.locator('button[aria-label="Move Weather"]').boundingBox()
  await page.locator('nav[aria-label="Bottom bar"] [data-block-id="weather"]').hover()
  await page.mouse.move(grip2.x + grip2.width / 2, grip2.y + grip2.height / 2)
  await page.mouse.down()
  await page.mouse.move(500, 450, { steps: 10 })
  await page.waitForTimeout(150)
  const weatherMode = await page.evaluate(() => (
    document.querySelector('[data-block-id="weather"]')?.getAttribute('data-canvas-mode')
  ))
  if (weatherMode !== 'anchored') fail(`stage2: grip drag did not undock weather (${weatherMode})`)
  await page.mouse.up()
  await page.waitForTimeout(200)
  if (await page.locator('nav[aria-label="Bottom bar"]').count()) fail('stage2: emptied bottom dock still rendered')
  if (!await page.locator('[role="toolbar"]').count()) fail('stage2: grip drag did not enter the edit session')
  await stage('2-grip-undock', 'weather pulled out of the dock by its grip')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  if (!await page.locator('nav[aria-label="Bottom bar"] [data-block-id="weather"]').count()) {
    fail('stage2: exact Cancel did not restore the docked weather')
  }

  // ---- Stage 3: Month is never offered a dock zone ----
  const month = page.locator('[data-canvas-surface] [data-block-id="monthCal"]')
  await month.hover()
  const monthGrip = await page.locator('button[aria-label="Move Month"]').boundingBox()
  await page.mouse.move(monthGrip.x + 5, monthGrip.y + 5)
  await page.mouse.down()
  await page.mouse.move(800, 20, { steps: 10 })
  await page.waitForTimeout(150)
  if (await page.locator('.dock-drop-zone').count()) fail('stage3: dock zone offered for Month')
  await stage('3-month-no-zone', 'Month dragged to the top edge: no dock zone')
  // Park Month at the lower left so its inspector never covers the clock.
  await page.mouse.move(300, 600, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const monthMode = await page.evaluate(() => (
    document.querySelector('[data-block-id="monthCal"]')?.getAttribute('data-canvas-mode')
  ))
  if (monthMode !== 'anchored') fail(`stage3: Month left the canvas on an edge drop (${monthMode})`)
  // The same drag on a dockable widget still offers the zone (control case).
  const clockBox = await page.locator('[data-block-id="clock"]').boundingBox()
  await page.mouse.move(clockBox.x + clockBox.width / 2, clockBox.y + clockBox.height - 10)
  await page.mouse.down()
  await page.mouse.move(800, 20, { steps: 10 })
  await page.waitForTimeout(150)
  if (!await page.locator('.dock-drop-zone[data-edge="top"]').count()) fail('stage3: zone missing for dockable Clock (control)')
  await page.mouse.move(800, 400, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- Stage 4: a stored docked Month renders free, never in the strip ----
  await page.evaluate(async () => {
    const { layouts } = await chrome.storage.local.get('layouts')
    const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
    active.widgets.monthCal = { kind: 'docked', dock: 'bottom', order: 1 }
    await chrome.storage.local.set({ layouts })
  })
  await reloadArmed()
  const badDock = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="monthCal"]')
    return {
      mode: node?.getAttribute('data-canvas-mode'),
      inStrip: Boolean(node?.closest('nav')),
      cells: node?.querySelectorAll('[data-cell-key]').length ?? 0,
    }
  })
  if (badDock.mode !== 'anchored') fail(`stage4: stored docked Month renders ${badDock.mode}`)
  if (badDock.inStrip) fail('stage4: stored docked Month rendered inside a strip')
  if (badDock.cells < 28) fail(`stage4: Month grid incomplete (${badDock.cells} cells)`)
  if (!await page.locator('nav[aria-label="Bottom bar"] [data-block-id="weather"]').count()) {
    fail('stage4: legitimate docked weather lost by the safety rule')
  }
  await stage('4-bad-dock-recovered', 'stored docked Month renders free at its default slot; weather stays docked')

  // ---- Stage 5: Month inspector offers only Standard ----
  await month.hover()
  const monthGrip5 = await page.locator('button[aria-label="Move Month"]').boundingBox()
  await page.mouse.move(monthGrip5.x + 5, monthGrip5.y + 5)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(300)
  await page.locator('[data-testid="canvas-item-monthCal"]').click()
  await page.waitForTimeout(200)
  const inspector = page.locator('[role="dialog"][aria-label="Month inspector"]')
  if (!await inspector.count()) {
    fail('stage5: Month inspector did not open')
  } else {
    const radios = await inspector.locator('[role="radio"]').allTextContents()
    if (radios.join(',') !== 'Standard') fail(`stage5: Month inspector offers [${radios.join(', ')}]`)
  }
  const monthCells = await page.evaluate(() => (
    document.querySelector('[data-block-id="monthCal"]')?.querySelectorAll('[data-cell-key]').length ?? 0
  ))
  if (monthCells < 28) fail(`stage5: Month not rendering the complete month (${monthCells} cells)`)
  await stage('5-month-inspector', 'Month inspector: Standard only, complete month grid')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- Stage 6: every write in the whole run touched only seeded keys ----
  await harvestWrites()
  for (const keys of evidence.writes) {
    if (keys !== 'layouts' && keys !== 'layouts,settings' && keys !== 'settings') {
      fail(`stage6: write touched ${keys}`)
    }
    if (keys.split(',').includes('layout')) fail(`stage6: the frozen legacy layout key was written (${keys})`)
  }
} catch (error) {
  caughtError = error
} finally {
  try { await context.close() } catch { /* ignore */ }
}

writeFileSync(resolve(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify({
  stages: evidence.stages.length,
  writes: evidence.writes,
  failures: evidence.failures,
  runtimeErrors: evidence.runtimeErrors,
  failedRequests: evidence.failedRequests,
}, null, 2))
if (caughtError) {
  console.error('NL-P5 HOTFIX WITNESS ERROR:', caughtError)
  process.exitCode = 1
} else if (evidence.failures.length > 0 || evidence.runtimeErrors.length > 0 || evidence.failedRequests.length > 0) {
  console.error('FAIL: NL-P5 hotfix')
  process.exitCode = 1
} else {
  console.log('PASS: NL-P5 hotfix')
}
