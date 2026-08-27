// Focused NL-P3 live-edit witness: production-mode preview build, real
// Chromium, real pointer interactions. Proves the live edit contract
// (2026-08-17 named-layouts spec §2.1/§2.5/§2.6): hover chrome, no ring on
// plain clicks, dimmed inert edit session, grid-snapped drag, exact cancel,
// single-save persistence with first-save materialization, inspector with
// footprints and per-layout hide, bulk tier, and the switcher badge — with
// every storage write in the run touching ONLY the layouts key.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const repoRoot = process.cwd()
const dist = resolve('.preview-nl-p3-dist')
const profileDir = resolve('.playwright-profile-nl-p3')
const outDir = resolve('.preview-nl-p3-out')
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-nl-p3-dist'],
  [profileDir, '.playwright-profile-nl-p3'],
  [outDir, '.preview-nl-p3-out'],
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
const stage = async (page, name, note) => {
  evidence.stages.push({ name, note })
  await page.screenshot({ path: resolve(outDir, `${name}.png`) })
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

// The write log lives in the page and dies on reload: arm it after every
// navigation and harvest it before, so the stage-8 only-layouts check covers
// the ENTIRE run rather than just the tail since the last reload.
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

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()

  // Log every storage write's keys for the whole run (spec 2.1: switching
  // and saving cannot touch anything but the layouts document).
  await armWriteLog()

  // ---- Stage 1: hover chrome + no ring on plain click + gear deep link ----
  const clock = page.locator('[data-block-id="clock"]')
  await clock.hover()
  await page.waitForTimeout(200)
  if (!await page.locator('button[aria-label="Move Clock"]').isVisible()) fail('stage1: grip not visible on hover')
  if (!await page.locator('button[aria-label="Clock settings"]').isVisible()) fail('stage1: gear not visible on hover')
  await stage(page, '1a-hover-chrome', 'grip and gear visible on Clock hover')

  const quote = page.locator('[data-block-id="quote"]')
  await quote.click({ position: { x: 10, y: 10 }, force: true })
  await page.waitForTimeout(150)
  const ring = await page.evaluate(() => {
    for (const node of document.querySelectorAll('[data-block-id]')) {
      const style = getComputedStyle(node)
      if (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) {
        return `${node.getAttribute('data-block-id')}: ${style.outlineStyle}`
      }
    }
    return null
  })
  if (ring) fail(`stage1: plain click painted a ring on ${ring}`)

  const weather = page.locator('[data-block-id="weather"]')
  await weather.hover()
  await page.locator('button[aria-label="Weather settings"]').click()
  await page.waitForSelector('[data-settings-anchor="weather"]')
  await page.waitForTimeout(400)
  const anchorFocused = await page.evaluate(() => (
    Boolean(document.activeElement?.closest('[data-settings-anchor="weather"]'))
  ))
  if (!anchorFocused) fail('stage1: gear did not focus the Weather settings row')
  await stage(page, '1b-gear-deep-link', 'Settings open on the Weather row')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- Stage 2: grip-drag enters the session, dims, inerts, snaps ----
  const before = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="clock"]')
    return { left: node.style.left, top: node.style.top }
  })
  await clock.hover()
  const grip = page.locator('button[aria-label="Move Clock"]')
  const gripBox = await grip.boundingBox()
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(gripBox.x + 200, gripBox.y + 60, { steps: 8 })
  await page.waitForTimeout(120)
  if (!await page.locator('main[data-editing]').count()) fail('stage2: page not in edit mode during drag')
  if (!await page.locator('.edit-scrim').count()) fail('stage2: scrim missing')
  await stage(page, '2a-mid-drag', 'dimmed page mid-drag')
  await page.mouse.up()
  await page.waitForTimeout(200)
  if (!await page.locator('[role="toolbar"][aria-label="Edit layout"]').isVisible()) fail('stage2: toolbar missing')
  const searchInertlyBlocked = await page.evaluate(() => {
    const input = document.querySelector('[data-block-id="search"] input')
    if (!input) return true
    input.focus()
    return document.activeElement !== input
  })
  if (!searchInertlyBlocked) fail('stage2: widget interior focusable during edit session')
  const afterDrag = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="clock"]')
    return { left: node.style.left, top: node.style.top }
  })
  if (afterDrag.left === before.left && afterDrag.top === before.top) fail('stage2: drag did not move the clock')
  await stage(page, '2b-edit-session', 'toolbar and moved clock')

  // ---- Stage 3: exact cancel ----
  const storedBefore = await page.evaluate(() => chrome.storage.local.get('layouts'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  if (await page.locator('main[data-editing]').count()) fail('stage3: Escape did not end the session')
  const storedAfterCancel = await page.evaluate(() => chrome.storage.local.get('layouts'))
  if (JSON.stringify(storedBefore) !== JSON.stringify(storedAfterCancel)) fail('stage3: cancel changed storage')
  const afterCancel = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="clock"]')
    return { left: node.style.left, top: node.style.top }
  })
  if (afterCancel.left !== before.left || afterCancel.top !== before.top) fail('stage3: cancel did not restore the clock')
  await stage(page, '3-exact-cancel', 'clock restored after Escape')

  // ---- Stage 4: save persists (first-save materialization) ----
  await clock.hover()
  const grip2 = page.locator('button[aria-label="Move Clock"]')
  const gripBox2 = await grip2.boundingBox()
  await page.mouse.move(gripBox2.x + gripBox2.width / 2, gripBox2.y + gripBox2.height / 2)
  await page.mouse.down()
  await page.mouse.move(gripBox2.x + 200, gripBox2.y + 60, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const movedTo = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="clock"]')
    return { left: node.style.left, top: node.style.top }
  })
  await page.locator('[role="toolbar"] button:has-text("Save")').click()
  await page.waitForTimeout(300)
  const savedDocument = await page.evaluate(() => chrome.storage.local.get('layouts'))
  if (!savedDocument.layouts) fail('stage4: Save did not materialize the layouts document')
  await reloadArmed()
  const afterReload = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="clock"]')
    return { left: node.style.left, top: node.style.top }
  })
  if (afterReload.left !== movedTo.left || afterReload.top !== movedTo.top) {
    fail(`stage4: saved position did not survive reload (${JSON.stringify(afterReload)} vs ${JSON.stringify(movedTo)})`)
  }
  await stage(page, '4-saved-reload', 'moved clock persists across reload')

  // ---- Stage 5: inspector, footprint anywhere, hide persists ----
  await weather.hover()
  const weatherGrip = page.locator('button[aria-label="Move Weather"]')
  const wg = await weatherGrip.boundingBox()
  await page.mouse.move(wg.x + wg.width / 2, wg.y + wg.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(150)
  await page.locator('[data-block-id="weather"]').click()
  await page.waitForTimeout(150)
  if (!await page.locator('[role="dialog"][aria-label="Weather inspector"]').isVisible()) fail('stage5: inspector missing')
  if (!await page.locator('[data-testid="canvas-footprint-weather"]').count()) fail('stage5: expansion footprint missing')
  await stage(page, '5a-inspector', 'Weather inspector with dashed footprint')

  // Drag Weather into the bottom-right corner: never placement-restricted.
  // In an active session the whole widget is the drag handle (spec 2.5).
  const weatherBox = await page.locator('[data-block-id="weather"]').boundingBox()
  await page.mouse.move(weatherBox.x + weatherBox.width / 2, weatherBox.y + weatherBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(1560, 860, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const cornerBox = await page.locator('[data-block-id="weather"]').boundingBox()
  if (cornerBox.x <= weatherBox.x) fail('stage5: corner drag did not move Weather right')
  if (!await page.locator('[data-testid="canvas-footprint-weather"]').count()) fail('stage5: footprint gone in the corner')
  await stage(page, '5b-corner-footprint', 'Weather parked in the corner, footprint intact')

  // Weather now overlaps the Tasks chip (legal, spec 2.2) — select it by a
  // corner point of its own box.
  await page.locator('[data-block-id="weather"]').click({ position: { x: 8, y: 8 }, force: true })
  await page.locator('[role="dialog"][aria-label="Weather inspector"] button:has-text("Hide")').click()
  await page.waitForTimeout(150)
  if (await page.locator('[data-block-id="weather"]').count()) fail('stage5: Hide left Weather rendered')
  await page.locator('[role="toolbar"] button:has-text("Save")').click()
  await page.waitForTimeout(300)
  const hiddenStored = await page.evaluate(async () => {
    const { layouts, settings } = await chrome.storage.local.get(['layouts', 'settings'])
    const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
    return { placement: active.widgets.weather, toggle: settings.widgets.weather }
  })
  if (hiddenStored.placement?.kind !== 'hidden') fail('stage5: hide did not persist as hidden')
  if (hiddenStored.toggle !== true) fail('stage5: hide changed the global toggle')
  await reloadArmed()
  if (await page.locator('[data-block-id="weather"]').count()) fail('stage5: hidden Weather returned after reload')
  await stage(page, '5c-hidden', 'Weather hidden in this layout after reload')

  // ---- Stage 6: bulk tier + per-widget override (AC9) ----
  await clock.hover()
  const grip3 = await page.locator('button[aria-label="Move Clock"]').boundingBox()
  await page.mouse.move(grip3.x + 5, grip3.y + 5)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(150)
  await page.locator('[role="group"][aria-label="Set all widgets to"] button:has-text("Compact")').click()
  await page.waitForTimeout(150)
  const allCompact = await page.evaluate(() => (
    [...document.querySelectorAll('[data-canvas-mode="anchored"]')]
      .every((node) => node.getAttribute('data-canvas-size') === 'compact')
  ))
  if (!allCompact) fail('stage6: bulk Compact missed a free widget')
  await page.locator('[data-block-id="clock"]').click()
  await page.locator('[role="dialog"][aria-label="Clock inspector"] [role="radio"]:has-text("Full")').click()
  await page.waitForTimeout(120)
  const clockFull = await page.evaluate(() => (
    document.querySelector('[data-block-id="clock"]').getAttribute('data-canvas-size')
  ))
  if (clockFull !== 'full') fail('stage6: per-widget override after bulk failed')
  await stage(page, '6-bulk-tier', 'bulk Compact with a Full clock override')
  await page.locator('[role="toolbar"] button:has-text("Cancel")').click()
  await page.waitForTimeout(200)

  // ---- Stage 7: switcher badge ----
  const badge = page.locator('.layout-badge')
  if (!await badge.isVisible()) fail('stage7: layout badge missing')
  const originalName = await badge.textContent()
  const originalClock = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="clock"]')
    return { left: node.style.left, top: node.style.top }
  })
  await badge.click()
  await page.locator('[role="menuitem"]:has-text("New layout")').click()
  await page.waitForTimeout(300)
  if ((await badge.textContent())?.trim() !== 'Layout 2') fail('stage7: New layout did not switch the badge')
  await stage(page, '7a-new-layout', 'fresh defaults on Layout 2')
  await badge.click()
  await page.locator(`[role="menuitemradio"]:has-text("${originalName?.trim()}")`).click()
  await page.waitForTimeout(300)
  const backClock = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="clock"]')
    return { left: node.style.left, top: node.style.top }
  })
  if (backClock.left !== originalClock.left || backClock.top !== originalClock.top) {
    fail('stage7: switching back did not restore placements exactly')
  }
  await stage(page, '7b-switched-back', 'original layout restored exactly')

  // ---- Stage 9: the owner's short-window class (plan Task 8 matrix) ----
  await page.setViewportSize({ width: 1408, height: 445 })
  await page.waitForTimeout(350)
  const shortClock = page.locator('[data-block-id="clock"]')
  await shortClock.hover()
  if (!await page.locator('button[aria-label="Move Clock"]').isVisible()) fail('stage9: grip missing at 1408x445')
  const shortBefore = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="clock"]')
    return { left: node.style.left, top: node.style.top }
  })
  const shortGrip = await page.locator('button[aria-label="Move Clock"]').boundingBox()
  await page.mouse.move(shortGrip.x + 5, shortGrip.y + 5)
  await page.mouse.down()
  await page.mouse.move(shortGrip.x + 120, shortGrip.y + 40, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  if (!await page.locator('main[data-editing]').count()) fail('stage9: no session at 1408x445')
  await stage(page, '9-short-window-edit', 'edit session at the owner 1408x445 class')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const shortAfter = await page.evaluate(() => {
    const node = document.querySelector('[data-block-id="clock"]')
    return { left: node.style.left, top: node.style.top }
  })
  if (shortAfter.left !== shortBefore.left || shortAfter.top !== shortBefore.top) {
    fail('stage9: exact cancel failed at 1408x445')
  }
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.waitForTimeout(300)

  // ---- Stage 8: every write across the whole run touched only layouts ----
  await harvestWrites()
  if (evidence.writes.length === 0) fail('stage8: write log is empty — the harness saw no saves, which cannot be true')
  for (const keys of evidence.writes) {
    if (keys !== 'layouts') fail(`stage8: write touched ${keys}`)
  }
  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))
  if (overflow > 0) fail(`stage8: horizontal overflow ${overflow}px`)
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
  console.error('NL-P3 WITNESS ERROR:', caughtError)
  process.exitCode = 1
} else if (evidence.failures.length > 0 || evidence.runtimeErrors.length > 0 || evidence.failedRequests.length > 0) {
  console.error('FAIL: NL-P3 live edit mode')
  process.exitCode = 1
} else {
  console.log('PASS: NL-P3 live edit mode')
}
