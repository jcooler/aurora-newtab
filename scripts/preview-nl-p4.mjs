// Focused NL-P4 docks witness: production-mode preview build, real Chromium,
// real pointer interactions. Proves the dock contract (2026-08-17
// named-layouts spec §2.4 / AC7): docks are created only by dragging into
// the edge zone, order is draggable, dragging out undocks, empty docks
// disappear, docked clicks keep their free-form behavior, and the strip is a
// clean status band — no scrollbar ever, true-overflow fades, local scroll.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const repoRoot = process.cwd()
const dist = resolve('.preview-nl-p4-dist')
const profileDir = resolve('.playwright-profile-nl-p4')
const outDir = resolve('.preview-nl-p4-out')
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-nl-p4-dist'],
  [profileDir, '.playwright-profile-nl-p4'],
  [outDir, '.preview-nl-p4-out'],
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

  // ---- Stage 1: create the top dock by dragging the Clock into the zone ----
  const clock = page.locator('[data-block-id="clock"]')
  await clock.hover()
  const clockGrip = await page.locator('button[aria-label="Move Clock"]').boundingBox()
  await page.mouse.move(clockGrip.x + 5, clockGrip.y + 5)
  await page.mouse.down()
  await page.mouse.move(800, 30, { steps: 10 })
  await page.waitForTimeout(150)
  if (!await page.locator('.dock-drop-zone[data-edge="top"]').count()) fail('stage1: top zone highlight missing')
  await stage('1a-top-zone', 'top dock drop zone highlighted mid-drag')
  await page.mouse.up()
  await page.waitForTimeout(200)
  const clockDocked = await page.evaluate(() => (
    document.querySelector('[data-block-id="clock"]')?.getAttribute('data-canvas-mode')
  ))
  if (clockDocked !== 'docked') fail(`stage1: clock not docked after drop (${clockDocked})`)
  if (!await page.locator('nav[aria-label="Top bar"]').count()) fail('stage1: top strip missing')
  await page.locator('[role="toolbar"] button:has-text("Save")').click()
  await page.waitForTimeout(300)
  const storedTop = await page.evaluate(async () => {
    const { layouts } = await chrome.storage.local.get('layouts')
    const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
    return active.widgets.clock
  })
  if (storedTop?.kind !== 'docked' || storedTop.dock !== 'top') fail('stage1: stored placement is not top-docked')
  await reloadArmed()
  if (!await page.locator('nav[aria-label="Top bar"]').count()) fail('stage1: top strip gone after reload')
  await stage('1b-top-dock-saved', 'clock docked top, persisted across reload')

  // ---- Stage 2: reorder within a seeded bottom dock ----
  await page.evaluate(async () => {
    const { layouts } = await chrome.storage.local.get('layouts')
    const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
    active.widgets.timer = { kind: 'docked', dock: 'bottom', order: 0 }
    active.widgets.tasks = { kind: 'docked', dock: 'bottom', order: 1 }
    active.widgets.notes = { kind: 'docked', dock: 'bottom', order: 2 }
    const settings = (await chrome.storage.local.get('settings')).settings
    settings.widgets.timer = true
    await chrome.storage.local.set({ layouts, settings })
  })
  await reloadArmed()
  const orderBefore = await page.evaluate(() => (
    [...document.querySelectorAll('nav[aria-label="Bottom bar"] [data-block-id]')]
      .map((node) => node.getAttribute('data-block-id'))
  ))
  if (orderBefore.join(',') !== 'timer,tasks,notes') fail(`stage2: seeded order wrong (${orderBefore})`)
  // Enter edit via the badge, then drag Tasks left past Timer, dropping in the bottom zone.
  await page.locator('.layout-badge').click()
  await page.locator('[role="menuitem"]:has-text("Edit layout")').click()
  await page.waitForTimeout(200)
  const tasksBox = await page.locator('nav[aria-label="Bottom bar"] [data-block-id="tasks"]').boundingBox()
  const timerBox = await page.locator('nav[aria-label="Bottom bar"] [data-block-id="timer"]').boundingBox()
  await page.mouse.move(tasksBox.x + tasksBox.width / 2, tasksBox.y + tasksBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(timerBox.x - 20, 890, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await page.locator('[role="toolbar"] button:has-text("Save")').click()
  await page.waitForTimeout(300)
  const orderAfter = await page.evaluate(() => (
    [...document.querySelectorAll('nav[aria-label="Bottom bar"] [data-block-id]')]
      .map((node) => node.getAttribute('data-block-id'))
  ))
  if (orderAfter.join(',') !== 'tasks,timer,notes') fail(`stage2: reorder failed (${orderAfter})`)
  await stage('2-reordered', 'tasks dragged ahead of timer in the bottom dock')

  // ---- Stage 3: undock by dragging onto the canvas; empty dock disappears ----
  await page.locator('.layout-badge').click()
  await page.locator('[role="menuitem"]:has-text("Edit layout")').click()
  await page.waitForTimeout(200)
  const topClock = await page.locator('nav[aria-label="Top bar"] [data-block-id="clock"]').boundingBox()
  await page.mouse.move(topClock.x + topClock.width / 2, topClock.y + topClock.height / 2)
  await page.mouse.down()
  await page.mouse.move(800, 400, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const clockMode = await page.evaluate(() => (
    document.querySelector('[data-block-id="clock"]')?.getAttribute('data-canvas-mode')
  ))
  if (clockMode !== 'anchored') fail(`stage3: clock did not undock (${clockMode})`)
  if (await page.locator('nav[aria-label="Top bar"]').count()) fail('stage3: empty top dock still rendered')
  await page.locator('[role="toolbar"] button:has-text("Save")').click()
  await page.waitForTimeout(300)
  await stage('3-undocked', 'clock dragged out; empty top dock gone')

  // ---- Stage 4: clean overflow at 900x600 with many docked widgets ----
  await page.evaluate(async () => {
    const { layouts, settings } = await chrome.storage.local.get(['layouts', 'settings'])
    const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
    // Dock-eligible widgets only (the NL-P5 hotfix gate: a widget with no
    // Docked tier renders free, so seeding one here would thin the overflow).
    const docked = ['timer', 'tasks', 'notes', 'focus', 'sun', 'moon', 'worldClocks', 'countdown', 'habits', 'weather']
    docked.forEach((id, order) => {
      active.widgets[id] = { kind: 'docked', dock: 'bottom', order }
    })
    for (const key of ['timer', 'todo', 'notes', 'sun', 'moon', 'clocks', 'countdown', 'habits', 'weather']) {
      settings.widgets[key] = true
    }
    await chrome.storage.local.set({ layouts, settings })
  })
  await page.setViewportSize({ width: 900, height: 600 })
  await reloadArmed()
  const scroller = page.locator('nav[aria-label="Bottom bar"] .dock-scroller')
  const overflowState = await scroller.evaluate((node) => ({
    overflowing: node.scrollWidth > node.clientWidth + 1,
    attr: node.getAttribute('data-dock-overflow'),
    scrollbarSpace: node.offsetHeight - node.clientHeight,
    scrollbarWidthStyle: getComputedStyle(node).scrollbarWidth,
    mask: getComputedStyle(node).maskImage,
    scrollY: window.scrollY,
  }))
  if (!overflowState.overflowing) fail('stage4: seeded dock does not truly overflow')
  if (overflowState.attr !== 'true') fail('stage4: data-dock-overflow missing on true overflow')
  if (overflowState.scrollbarSpace !== 0) fail(`stage4: scrollbar consumes ${overflowState.scrollbarSpace}px`)
  if (overflowState.scrollbarWidthStyle !== 'none') fail('stage4: scrollbar-width is not none')
  if (overflowState.mask === 'none') fail('stage4: no fade mask on the clipped edge')
  await stage('4a-overflow-start', 'true overflow, end-side fade, no scrollbar')
  const scrolled = await scroller.evaluate((node) => {
    const before = { left: node.scrollLeft, pageY: window.scrollY }
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: 160, bubbles: true, cancelable: true }))
    return { before, after: { left: node.scrollLeft, pageY: window.scrollY } }
  })
  if (scrolled.after.left <= scrolled.before.left) fail('stage4: wheel did not scroll the dock')
  if (scrolled.after.pageY !== 0) fail('stage4: dock wheel moved the page')
  await scroller.evaluate((node) => { node.scrollLeft = node.scrollWidth })
  await page.waitForTimeout(200)
  const endState = await scroller.evaluate((node) => ({
    atEnd: node.getAttribute('data-dock-at-end'),
    atStart: node.getAttribute('data-dock-at-start'),
  }))
  if (endState.atEnd !== 'true') fail('stage4: at-end not reported after scrolling to the end')
  if (endState.atStart === 'true') fail('stage4: at-start incorrectly reported at the end')
  await stage('4b-overflow-end', 'scrolled to the end: start-side fade only')
  // Few members -> no overflow affordances at all.
  await page.evaluate(async () => {
    const { layouts } = await chrome.storage.local.get('layouts')
    const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
    for (const id of ['focus', 'sun', 'moon', 'worldClocks', 'countdown', 'habits', 'weather']) {
      delete active.widgets[id]
    }
    await chrome.storage.local.set({ layouts })
  })
  await reloadArmed()
  const fitState = await page.locator('nav[aria-label="Bottom bar"] .dock-scroller').evaluate((node) => ({
    attr: node.getAttribute('data-dock-overflow'),
    mask: getComputedStyle(node).maskImage,
  }))
  if (fitState.attr === 'true') fail('stage4: overflow reported with content that fits')
  if (fitState.mask !== 'none') fail('stage4: fade mask painted without true overflow')
  await stage('4c-no-overflow', 'few members: no fade, no scroll affordance')

  // ---- Stage 6 (before 5): every DOCK-flow write touched only layouts ----
  // (The panel interaction in stage 5 exercises pre-existing widget
  //  behavior with its own storage ownership — outside this invariant.)
  await harvestWrites()
  if (evidence.writes.length === 0) fail('stage6: write log empty — cannot be true')
  for (const keys of evidence.writes) {
    if (keys !== 'layouts' && keys !== 'layouts,settings' && keys !== 'settings') {
      fail(`stage6: write touched ${keys}`)
    }
  }
  // The only settings writes are the two explicit witness seeds.
  const settingsWrites = evidence.writes.filter((keys) => keys.includes('settings')).length
  if (settingsWrites > 2) fail(`stage6: unexpected settings writes (${settingsWrites})`)

  // ---- Stage 5: docked click keeps the free-form behavior ----
  await page.locator('nav[aria-label="Bottom bar"] [data-block-id="tasks"] button').first().click()
  await page.waitForTimeout(300)
  if (!await page.locator('[role="dialog"]').count()) fail('stage5: docked Tasks click opened nothing')
  await stage('5-docked-click', 'docked Tasks opens its panel')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  // The panel owns its own storage keys, but it must NEVER touch the frozen
  // legacy layout key.
  const panelWrites = await page.evaluate(() => window.__writeLog ?? [])
  for (const keys of panelWrites) {
    if (keys.split(',').includes('layout')) fail(`stage5: panel interaction wrote the legacy layout key (${keys})`)
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
  console.error('NL-P4 WITNESS ERROR:', caughtError)
  process.exitCode = 1
} else if (evidence.failures.length > 0 || evidence.runtimeErrors.length > 0 || evidence.failedRequests.length > 0) {
  console.error('FAIL: NL-P4 docks')
  process.exitCode = 1
} else {
  console.log('PASS: NL-P4 docks')
}
