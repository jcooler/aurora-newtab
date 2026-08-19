// NL-P6 real-window witness (plan Task 3): a REAL OS window — not viewport
// emulation — at the owner's exact short-desktop shape, per the corrected
// A2-D060 standard. `viewport: null` hands Playwright the actual window
// inner size; the script MEASURES it and records the truth rather than
// trusting the request. Interaction smoke on the named-saved scenario:
// free drag, dock-out-and-back, save round-trip, exact cancel.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { SCENARIOS } from './qa-nl-p6-scenarios.mjs'

const repoRoot = process.cwd()
const dist = resolve('.qa-nl-p6-dist')
const profileDir = resolve('.playwright-profile-qa-nl-p6-window')
const outDir = resolve('docs/superpowers/qa/nl-p6')

for (const [path, suffix] of [
  [dist, '.qa-nl-p6-dist'],
  [profileDir, '.playwright-profile-qa-nl-p6-window'],
  [outDir, 'nl-p6'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe path: ${path}`)
}
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

if (!existsSync(dist)) {
  const build = spawnSync(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'),
    'build', '--mode', 'preview', '--outDir', dist, '--emptyOutDir',
  ], { cwd: repoRoot, encoding: 'utf8' })
  if (build.status !== 0) {
    process.stdout.write(build.stdout ?? '')
    process.stderr.write(build.stderr ?? '')
    throw new Error(`build failed: ${build.status}`)
  }
}

const evidence = { measuredInner: null, stages: [], writes: [], failures: [], runtimeErrors: [], failedRequests: [] }
const fail = (message) => { evidence.failures.push(message) }

// HEADED with a real window: the outer size approximates the target; the
// measured inner size is the evidence.
const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    '--window-size=1424,532',
    '--window-position=40,40',
  ],
})
const page = await context.newPage()
page.setDefaultTimeout(20_000)
page.on('console', (m) => { if (m.type() === 'error') evidence.runtimeErrors.push(`console: ${m.text()}`) })
page.on('pageerror', (e) => evidence.runtimeErrors.push(`page: ${String(e)}`))
page.on('requestfailed', (r) => {
  if (!r.url().startsWith('chrome-extension://')) {
    evidence.failedRequests.push(`${r.method()} ${r.url()}: ${r.failure()?.errorText ?? 'failed'}`)
  }
})

const waitForCanvas = async () => {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(400)
}
const armWriteLog = () => page.evaluate(() => {
  window.__writeLog = []
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') window.__writeLog.push(Object.keys(changes).sort().join(','))
  })
})
const stage = async (name, note) => {
  evidence.stages.push({ name, note })
  await page.screenshot({ path: resolve(outDir, `${name}.png`) })
}

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()

  const inner = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  evidence.measuredInner = inner
  if (inner.width < 1380 || inner.width > 1430 || inner.height < 420 || inner.height > 470) {
    fail(`real window inner ${inner.width}x${inner.height} outside the 1408x445 family band`)
  }

  const namedSaved = SCENARIOS.find((scenario) => scenario.id === 'named-saved')
  await namedSaved.seed(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await armWriteLog()
  await stage('window-1408x445-settled', `real window ${inner.width}x${inner.height}, named-saved scenario`)

  // (1) Free drag: grab the focus line by its grip, move 200px right.
  const focusItem = page.locator('[data-canvas-surface] [data-block-id="focus"]')
  const before = await focusItem.boundingBox()
  await focusItem.hover()
  const grip = await page.locator('button[aria-label="Move Focus"]').boundingBox()
  if (!grip) throw new Error('focus grip not visible')
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 200, before.y + before.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const after = await focusItem.boundingBox()
  if (Math.abs((after.x - before.x) - 200) > 24) {
    fail(`window drag: focus moved ${Math.round(after.x - before.x)}px, expected ~200`)
  }
  const overlapNote = await page.evaluate(() => (
    document.querySelector('[role="dialog"][aria-label="Focus inspector"]')?.textContent?.includes('Overlaps') ?? false
  ))
  if (overlapNote) fail('window drag: overlap note shown with nothing overlapping')
  await stage('window-1408x445-mid-edit', 'focus dragged 200px right in the live session')

  // (2) Weather out of the bottom dock and back to center.
  const dockedWeather = page.locator('nav[aria-label="Bottom bar"] [data-block-id="weather"]')
  const weatherBox = await dockedWeather.boundingBox()
  await page.mouse.move(weatherBox.x + weatherBox.width / 2, weatherBox.y + weatherBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(inner.width / 2, inner.height / 2, { steps: 8 })
  await page.waitForTimeout(150)
  const outMode = await page.evaluate(() => (
    document.querySelector('[data-block-id="weather"]')?.getAttribute('data-canvas-mode')
  ))
  if (outMode !== 'anchored') fail(`window undock: weather mode ${outMode}`)
  await page.mouse.move(inner.width / 2, inner.height - 12, { steps: 8 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  await page.waitForTimeout(250)
  const backMode = await page.evaluate(() => (
    document.querySelector('[data-block-id="weather"]')?.getAttribute('data-canvas-mode')
  ))
  if (backMode !== 'docked') fail(`window re-dock: weather mode ${backMode}`)

  // (3) Save; reload; the document round-trips with weather near center.
  await page.locator('[role="toolbar"] button:has-text("Save")').click()
  await page.waitForTimeout(400)
  const savedX = await page.evaluate(async () => {
    const { layouts } = await chrome.storage.local.get('layouts')
    const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
    return active.widgets.weather?.kind === 'docked' ? active.widgets.weather.x : null
  })
  if (savedX === null || Math.abs(savedX - 50) > 4) fail(`window save: stored weather x ${savedX}, expected ~50`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await armWriteLog()
  const reloadedMode = await page.evaluate(() => (
    document.querySelector('nav[aria-label="Bottom bar"] [data-block-id="weather"]') ? 'docked' : 'missing'
  ))
  if (reloadedMode !== 'docked') fail('window reload: weather not docked after round-trip')
  await stage('window-1408x445-after-reload', `saved document round-tripped; weather x ${savedX}`)

  // (4) Exact cancel: a second session with a nudge, Escape, zero writes.
  await page.keyboard.press('Control+Shift+E')
  await page.waitForTimeout(250)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const cancelWrites = await page.evaluate(() => window.__writeLog ?? [])
  if (cancelWrites.length > 0) fail(`window cancel: session wrote ${cancelWrites.join(';')}`)
} catch (error) {
  caughtError = error
} finally {
  try { await context.close() } catch { /* ignore */ }
}

writeFileSync(resolve(outDir, 'window-evidence.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify({
  measuredInner: evidence.measuredInner,
  stages: evidence.stages.length,
  failures: evidence.failures,
  runtimeErrors: evidence.runtimeErrors,
  failedRequests: evidence.failedRequests,
}, null, 2))
if (caughtError) {
  console.error('NL-P6 WINDOW ERROR:', caughtError)
  process.exitCode = 1
} else if (evidence.failures.length > 0 || evidence.runtimeErrors.length > 0 || evidence.failedRequests.length > 0) {
  console.error('FAIL: NL-P6 window')
  process.exitCode = 1
} else {
  console.log('PASS: NL-P6 window')
}
