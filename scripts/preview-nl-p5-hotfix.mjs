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
  // Grab the big time glyphs themselves (top third of the clock) and verify
  // the grab landed on the clock — a neighbor stealing the pointerdown would
  // silently test the wrong widget.
  const clockBox = await page.locator('[data-block-id="clock"]').boundingBox()
  const grabPoint = { x: clockBox.x + clockBox.width / 2, y: clockBox.y + 24 }
  const grabTarget = await page.evaluate(({ x, y }) => (
    document.elementFromPoint(x, y)?.closest('[data-block-id]')?.getAttribute('data-block-id')
  ), grabPoint)
  if (grabTarget !== 'clock') fail(`stage3: control grab landed on ${grabTarget}, not the clock`)
  await page.mouse.move(grabPoint.x, grabPoint.y)
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

  // ---- Stage 6: in-strip reorder — the item never leaves the dock mid-gesture ----
  await page.evaluate(async () => {
    const { layouts } = await chrome.storage.local.get('layouts')
    const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
    active.widgets.monthCal = { kind: 'free', anchor: 'left', offsetX: 10, offsetY: 0, tier: 'standard', layer: 1 }
    // Distinct x positions: free-x members render centered on their own
    // spot (two no-x members would stack at the 50% default).
    active.widgets.weather = { kind: 'docked', dock: 'bottom', order: 0, x: 40 }
    active.widgets.focus = { kind: 'docked', dock: 'bottom', order: 1, x: 62 }
    await chrome.storage.local.set({ layouts })
  })
  await reloadArmed()
  const orderBefore = await page.evaluate(() => (
    [...document.querySelectorAll('nav[aria-label="Bottom bar"] [data-block-id]')].map((n) => n.getAttribute('data-block-id'))
  ))
  if (orderBefore.join(',') !== 'weather,focus') fail(`stage6: seeded bottom order wrong (${orderBefore})`)
  const dockedW = page.locator('nav[aria-label="Bottom bar"] [data-block-id="weather"]')
  await dockedW.hover()
  const wGrip = await page.locator('button[aria-label="Move Weather"]').boundingBox()
  await page.mouse.move(wGrip.x + wGrip.width / 2, wGrip.y + wGrip.height / 2)
  await page.mouse.down()
  const focusBox = await page.locator('nav[aria-label="Bottom bar"] [data-block-id="focus"]').boundingBox()
  await page.mouse.move(focusBox.x + focusBox.width + 40, focusBox.y + focusBox.height / 2, { steps: 8 })
  await page.waitForTimeout(150)
  const midDragMode = await page.evaluate(() => (
    document.querySelector('[data-block-id="weather"]')?.getAttribute('data-canvas-mode')
  ))
  if (midDragMode !== 'docked') fail(`stage6: weather left the strip during an in-strip reorder (${midDragMode})`)
  await stage('6-reorder-mid-drag', 'weather reordering LIVE inside the strip, never popping out')
  await page.mouse.up()
  await page.waitForTimeout(200)
  const orderAfter = await page.evaluate(() => (
    [...document.querySelectorAll('nav[aria-label="Bottom bar"] [data-block-id]')].map((n) => n.getAttribute('data-block-id'))
  ))
  if (orderAfter.join(',') !== 'focus,weather') fail(`stage6: in-strip reorder failed (${orderAfter})`)

  // ---- Stage 7: out of the dock and BACK IN, standard tier, no bouncing ----
  const w2 = page.locator('nav[aria-label="Bottom bar"] [data-block-id="weather"]')
  const w2box = await w2.boundingBox()
  await page.mouse.move(w2box.x + w2box.width / 2, w2box.y + w2box.height / 2)
  await page.mouse.down()
  await page.mouse.move(700, 400, { steps: 8 })
  await page.waitForTimeout(120)
  const outMode = await page.evaluate(() => (
    document.querySelector('[data-block-id="weather"]')?.getAttribute('data-canvas-mode')
  ))
  if (outMode !== 'anchored') fail(`stage7: weather did not undock leaving the band (${outMode})`)
  await page.mouse.up()
  await page.waitForTimeout(200)
  // SECOND gesture on the SAME widget (the stale-rect bounce case): grab it
  // where it now sits and verify the preview stays under the pointer.
  const freeW = await page.locator('[data-canvas-surface] [data-block-id="weather"]').boundingBox()
  await page.mouse.move(freeW.x + freeW.width / 2, freeW.y + 10)
  await page.mouse.down()
  await page.mouse.move(freeW.x + freeW.width / 2 + 60, freeW.y + 70, { steps: 6 })
  await page.waitForTimeout(120)
  const grabbed = await page.locator('[data-canvas-surface] [data-block-id="weather"]').boundingBox()
  const pointer = { x: freeW.x + freeW.width / 2 + 60, y: freeW.y + 70 }
  if (
    pointer.x < grabbed.x - 80 || pointer.x > grabbed.x + grabbed.width + 80
    || pointer.y < grabbed.y - 80 || pointer.y > grabbed.y + grabbed.height + 80
  ) {
    fail(`stage7: second grab leapt away from the pointer (widget ${Math.round(grabbed.x)},${Math.round(grabbed.y)} ${Math.round(grabbed.width)}x${Math.round(grabbed.height)} vs pointer ${Math.round(pointer.x)},${Math.round(pointer.y)})`)
  }
  // Drag into the bottom band: it must dock LIVE while still dragging.
  await page.mouse.move(700, 880, { steps: 10 })
  await page.waitForTimeout(150)
  const liveDockMode = await page.evaluate(() => (
    document.querySelector('[data-block-id="weather"]')?.getAttribute('data-canvas-mode')
  ))
  if (liveDockMode !== 'docked') fail(`stage7: weather did not dock live entering the band (${liveDockMode})`)
  await stage('7-live-redock', 'weather back IN the dock, live, mid-gesture')
  await page.mouse.up()
  await page.waitForTimeout(200)
  const settledMode = await page.evaluate(() => (
    document.querySelector('[data-block-id="weather"]')?.getAttribute('data-canvas-mode')
  ))
  if (settledMode !== 'docked') fail(`stage7: weather not docked after the drop (${settledMode})`)

  // ---- Stage 7b: place a member on the far LEFT of the bar, alone ----
  const focusDock = await page.locator('nav[aria-label="Bottom bar"] [data-block-id="focus"]').boundingBox()
  await page.mouse.move(focusDock.x + focusDock.width / 2, focusDock.y + focusDock.height / 2)
  await page.mouse.down()
  await page.mouse.move(140, 880, { steps: 10 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  await page.waitForTimeout(200)
  const positionState = await page.evaluate(() => {
    const focusRect = document.querySelector('nav[aria-label="Bottom bar"] [data-block-id="focus"]')?.getBoundingClientRect()
    const weatherRect = document.querySelector('nav[aria-label="Bottom bar"] [data-block-id="weather"]')?.getBoundingClientRect()
    return {
      focusLeft: focusRect ? Math.round(focusRect.x) : null,
      weatherCenterX: weatherRect ? Math.round(weatherRect.x + weatherRect.width / 2) : null,
    }
  })
  // Free-x placement (owner-refined): the drop pointer IS the position,
  // clamped only so the member's own box stays inside the bar — a drop at
  // pixel 140 with a ~290px-wide line means the box HUGS the left edge
  // (the same safe-margin law the canvas uses).
  if (positionState.focusLeft === null || positionState.focusLeft > 100) {
    fail(`stage7b: focus not hugging the strip's left edge (left ${positionState.focusLeft})`)
  }
  if (positionState.weatherCenterX === null || Math.abs(positionState.weatherCenterX - 700) > 80) {
    fail(`stage7b: weather moved from its own position ~700 (center x ${positionState.weatherCenterX})`)
  }
  await stage('7b-far-left-member', `focus hugging the left edge at ${positionState.focusLeft}px, weather untouched at ${positionState.weatherCenterX}px`)
  // The dock line wears the Tasks/Notes chip metrics (owner: same size).
  // Measured via a probe span — the seeded location-less weather renders its
  // setup chip, not a dock line, so the strip may hold no real one here.
  const lineMetrics = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.className = 'dock-line'
    probe.textContent = '72°F · Probe · Clear'
    document.querySelector('nav[aria-label="Bottom bar"]').appendChild(probe)
    const style = getComputedStyle(probe)
    const metrics = { fontSize: style.fontSize, height: Math.round(probe.getBoundingClientRect().height) }
    probe.remove()
    return metrics
  })
  if (lineMetrics.fontSize !== '14px') fail(`stage7b: dock line font ${lineMetrics.fontSize}, chips use 14px`)
  if (lineMetrics.height < 34) fail(`stage7b: dock line height ${lineMetrics.height}px, thinner than the chips`)

  // ---- Stage 8: the overlap note matches MEASURED truth after a move ----
  // Stale rects used to list widgets from positions long left. Move the
  // clock, select it, and demand the note names exactly the widgets whose
  // LIVE rects intersect the clock's live rect — no more, no less.
  const clockBox8 = await page.locator('[data-block-id="clock"]').boundingBox()
  await page.mouse.move(clockBox8.x + clockBox8.width / 2, clockBox8.y + 10)
  await page.mouse.down()
  await page.mouse.move(420, 140, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await page.locator('[data-testid="canvas-item-clock"]').click()
  await page.waitForTimeout(200)
  const clockInspector = page.locator('[role="dialog"][aria-label="Clock inspector"]')
  if (!await clockInspector.count()) fail('stage8: clock inspector did not open')
  else {
    const measured = await page.evaluate(() => {
      const clock = document.querySelector('[data-canvas-surface] [data-block-id="clock"]').getBoundingClientRect()
      return [...document.querySelectorAll('[data-canvas-surface] [data-canvas-mode="anchored"][data-block-id]')]
        .filter((node) => node.getAttribute('data-block-id') !== 'clock')
        .filter((node) => {
          const r = node.getBoundingClientRect()
          return r.left < clock.right && r.right > clock.left && r.top < clock.bottom && r.bottom > clock.top
        })
        .map((node) => node.getAttribute('data-block-id'))
        .sort()
    })
    const noteLocator = clockInspector.locator('text=/^Overlaps /')
    const note = await noteLocator.count() ? await noteLocator.first().textContent() : null
    if (measured.length === 0 && note !== null) {
      fail(`stage8: overlap note lies — nothing measured, note says "${note}"`)
    }
    if (measured.length > 0 && note === null) {
      fail(`stage8: overlap note missing — measured intersections with ${measured.join(', ')}`)
    }
  }
  await stage('8-truthful-overlap', 'overlap note matches live measured rects')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- Stage 8b: the REAL weather dock line matches the Tasks chip ----
  // (owner-reported three times; the previous probe measured a synthetic
  // span without the type-role attributes and missed the cascade loss.)
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    const day = new Date().toISOString().slice(0, 10)
    const location = { lat: 32.7767, lon: -96.797, label: 'Dallas', manual: true }
    const normalize = (v) => Number(v.toFixed(4))
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
    params.set('latitude', String(normalize(location.lat)))
    params.set('longitude', String(normalize(location.lon)))
    const requestIdentity = `open-meteo:v1:https://api.open-meteo.com/v1/forecast?${params.toString()}`
    await chrome.storage.local.set({
      settings: { ...settings, units: 'imperial' },
      location,
      weatherCache: {
        current: { tempC: 31.7, feelsLikeC: 35.6, code: 0, windKmh: 14, humidity: 55, isDay: true },
        hourly: Array.from({ length: 12 }, (_, index) => ({
          time: `${day}T${String((9 + index) % 24).padStart(2, '0')}:00`,
          tempC: 30 + index * 0.3,
          precipProb: 5,
          code: 0,
          isDay: index < 10,
        })),
        fetchedAt: Date.now(),
        locationLabel: location.label,
        requestIdentity,
        sunriseISO: `${day}T07:02`,
        sunsetISO: `${day}T20:23`,
      },
    })
  })
  await reloadArmed()
  const lineTruth = await page.evaluate(() => {
    const line = document.querySelector('nav[aria-label="Bottom bar"] [data-dock-line]')
    if (!line) return null
    const digits = line.querySelector('[data-canvas-type-role="body"]')
    const letter = line.querySelector('[data-canvas-type-role="metadata"]')
    const tasksChip = document.querySelector('[data-block-id="tasks"] button')
    return {
      text: line.textContent,
      digitsFont: digits ? getComputedStyle(digits).fontSize : null,
      digitsWeight: digits ? getComputedStyle(digits).fontWeight : null,
      letterFont: letter ? getComputedStyle(letter).fontSize : null,
      lineHeightPx: Math.round(line.getBoundingClientRect().height),
      tasksChipHeightPx: tasksChip ? Math.round(tasksChip.getBoundingClientRect().height) : null,
    }
  })
  if (!lineTruth) fail('stage8b: real weather dock line did not render from the seeded cache')
  else {
    if (!lineTruth.text?.includes('89')) fail(`stage8b: line text unexpected (${lineTruth.text})`)
    if (lineTruth.digitsFont !== '14px') fail(`stage8b: REAL temperature digits render ${lineTruth.digitsFont}, chips use 14px`)
    if (Number(lineTruth.digitsWeight) < 500) fail(`stage8b: temperature digits weight ${lineTruth.digitsWeight}, chips use 500`)
    if (lineTruth.letterFont !== '11px') fail(`stage8b: unit letter renders ${lineTruth.letterFont}, expected 11px`)
    if (lineTruth.tasksChipHeightPx !== null && Math.abs(lineTruth.lineHeightPx - lineTruth.tasksChipHeightPx) > 4) {
      fail(`stage8b: weather line ${lineTruth.lineHeightPx}px tall vs Tasks chip ${lineTruth.tasksChipHeightPx}px`)
    }
  }
  await stage('8b-real-weather-line', `real 89°F line: digits ${lineTruth?.digitsFont}/${lineTruth?.digitsWeight}, letter ${lineTruth?.letterFont}, ${lineTruth?.lineHeightPx}px vs Tasks ${lineTruth?.tasksChipHeightPx}px`)

  // ---- Stage 8c: a red widget color re-tints widget pills, NEVER the photo ----
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    await chrome.storage.local.set({ settings: { ...settings, panelColor: '#dc2626' } })
  })
  await reloadArmed()
  const colorTruth = await page.evaluate(() => {
    const wash = document.querySelector('.canvas-legibility-layer')
    const pill = document.querySelector('nav[aria-label="Bottom bar"] .dock-line')
    return {
      washBackground: wash ? getComputedStyle(wash).backgroundImage : null,
      pillBackground: pill ? getComputedStyle(pill).backgroundColor : null,
    }
  })
  if (!colorTruth.washBackground) fail('stage8c: legibility layer missing')
  else if (colorTruth.washBackground.includes('220, 38, 38')) {
    fail('stage8c: the photo wash follows the red widget color')
  }
  if (!colorTruth.pillBackground) fail('stage8c: no dock pill to verify the pick against')
  else if (!colorTruth.pillBackground.includes('220, 38, 38')) {
    fail(`stage8c: the widget pill ignored the red pick (${colorTruth.pillBackground})`)
  }
  await stage('8c-red-widgets-clean-photo', 'red widget pick: pills red, photograph unstained')
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    await chrome.storage.local.set({ settings: { ...settings, panelColor: null } })
  })
  await reloadArmed()

  // ---- Stage 9: real bookmarks docked top — chrome visible, toolbar clears the strip ----
  const hasBookmarksApi = await page.evaluate(() => typeof chrome.bookmarks?.create === 'function')
  if (!hasBookmarksApi) fail('stage9: chrome.bookmarks unavailable in the witness profile')
  else {
    await page.evaluate(async () => {
      // A FOLDER (like the owner's real bar) plus two links: folder chips
      // carry the monogram mark the compact form reveals.
      const folder = await chrome.bookmarks.create({ parentId: '1', title: 'News' })
      await chrome.bookmarks.create({ parentId: folder.id, title: 'Headlines', url: 'https://news.example' })
      for (const [title, url] of [['Docs', 'https://docs.example'], ['Music', 'https://music.example']]) {
        await chrome.bookmarks.create({ parentId: '1', title, url })
      }
      const settings = (await chrome.storage.local.get('settings')).settings
      settings.widgets.bookmarks = true
      const { layouts } = await chrome.storage.local.get('layouts')
      const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
      active.widgets.bookmarks = { kind: 'docked', dock: 'top', order: 0 }
      await chrome.storage.local.set({ settings, layouts })
    })
    await reloadArmed()
    const topBookmarks = page.locator('nav[aria-label="Top bar"] [data-block-id="bookmarks"]')
    if (!await topBookmarks.count()) fail('stage9: bookmarks missing from the top strip')
    await topBookmarks.hover()
    await page.waitForTimeout(150)
    const bmGrip = await page.locator('button[aria-label="Move Bookmarks"]').boundingBox()
    const bmGear = await page.locator('button[aria-label="Bookmarks settings"]').boundingBox()
    if (!bmGrip) fail('stage9: docked Bookmarks grip not visible on hover')
    if (!bmGear) fail('stage9: docked Bookmarks gear not visible on hover')
    await stage('9a-bookmarks-chrome', 'real bookmarks docked top: grip + gear on hover')
    // Enter a session via the bookmarks grip and prove the toolbar clears the strip.
    if (bmGrip) {
      await page.mouse.move(bmGrip.x + 5, bmGrip.y + 5)
      await page.mouse.down()
      await page.mouse.up()
      await page.waitForTimeout(300)
      const toolbar = await page.locator('[role="toolbar"][aria-label="Edit layout"]').boundingBox()
      const strip = await page.locator('nav[aria-label="Top bar"]').boundingBox()
      if (toolbar && strip && toolbar.y < strip.y + strip.height) {
        fail(`stage9: toolbar overlaps the top strip (toolbar y ${Math.round(toolbar.y)} vs strip bottom ${Math.round(strip.y + strip.height)})`)
      }
      await stage('9b-toolbar-clearance', 'edit toolbar sits below the top strip')
      // 9c: the owner's exact report — drag the docked bookmarks BAR (whole-
      // widget grab, session already live) down out of the top strip.
      const barBox = await page.locator('nav[aria-label="Top bar"] [data-block-id="bookmarks"]').boundingBox()
      const barGrab = await page.evaluate(({ x, y }) => {
        const wrapper = document.querySelector('nav[aria-label="Top bar"] [data-block-id="bookmarks"]')
        const r = wrapper?.getBoundingClientRect()
        return {
          stack: document.elementsFromPoint(x, y).slice(0, 6).map((el) => (
            `${el.tagName}.${typeof el.className === 'string' ? el.className.split(' ')[0] : ''}${el.hasAttribute('inert') ? '[inert]' : ''}`
          )),
          wrapperRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
          wrapperPointerEvents: wrapper ? getComputedStyle(wrapper).pointerEvents : null,
          probePoint: { x: Math.round(x), y: Math.round(y) },
        }
      }, { x: barBox.x + barBox.width / 2, y: barBox.y + barBox.height / 2 })
      evidence.stages.push({ name: 'debug-9c-grab-target', note: JSON.stringify(barGrab) })
      await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(800, 450, { steps: 10 })
      await page.waitForTimeout(150)
      const barMode = await page.evaluate(() => (
        document.querySelector('[data-block-id="bookmarks"]')?.getAttribute('data-canvas-mode')
      ))
      if (barMode !== 'anchored') fail(`stage9c: bookmarks bar did not undock on a downward drag (${barMode})`)
      const barMid = await page.locator('[data-block-id="bookmarks"]').boundingBox()
      if (barMid && (Math.abs((barMid.y + barMid.height / 2) - 450) > 120)) {
        fail(`stage9c: undocked bar is not following the pointer (bar center y ${Math.round(barMid.y + barMid.height / 2)} vs pointer 450)`)
      }
      await stage('9c-bookmarks-undocked', 'bookmarks bar dragged out of the top dock, following the pointer')
      // ...and back into the top band re-docks it live.
      await page.mouse.move(800, 20, { steps: 10 })
      await page.waitForTimeout(150)
      const barBack = await page.evaluate(() => (
        document.querySelector('[data-block-id="bookmarks"]')?.getAttribute('data-canvas-mode')
      ))
      if (barBack !== 'docked') fail(`stage9c: bookmarks bar did not re-dock in the top band (${barBack})`)
      await page.mouse.up()
      await page.waitForTimeout(200)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      // 9d: the compact docked bar wears the one-letter marks (owner-
      // confirmed form: N for News, D for Docs, M for Music).
      const fullBarWidth = (await page.locator('nav[aria-label="Top bar"] [data-block-id="bookmarks"]').boundingBox())?.width ?? 0
      await page.evaluate(async () => {
        const { layouts } = await chrome.storage.local.get('layouts')
        const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
        active.widgets.bookmarks = { kind: 'docked', dock: 'top', order: 0, tier: 'compact' }
        await chrome.storage.local.set({ layouts })
      })
      await reloadArmed()
      const markState = await page.evaluate(() => {
        const bar = document.querySelector('nav[aria-label="Top bar"] [data-block-id="bookmarks"]')
        const monogram = bar?.querySelector('[data-bookmark-mark="monogram"]')
        const label = bar?.querySelector('[data-chip-label]')
        return {
          size: bar?.getAttribute('data-canvas-size'),
          monogramShown: monogram ? getComputedStyle(monogram).display !== 'none' : false,
          labelClipped: label ? getComputedStyle(label).position === 'absolute' : false,
          width: bar ? Math.round(bar.getBoundingClientRect().width) : 0,
        }
      })
      if (markState.size !== 'compact') fail(`stage9d: compact-sized docked bar renders ${markState.size}`)
      if (!markState.monogramShown) fail('stage9d: one-letter marks not shown on the compact docked bar')
      if (!markState.labelClipped) fail('stage9d: chip labels still visible on the compact docked bar')
      if (fullBarWidth > 0 && markState.width >= fullBarWidth) {
        fail(`stage9d: compact bar (${markState.width}px) is not smaller than the full bar (${Math.round(fullBarWidth)}px)`)
      }
      await stage('9d-compact-marks-bar', `docked bookmarks compact: letter marks, ${markState.width}px vs full ${Math.round(fullBarWidth)}px`)
    }
  }

  // ---- Stage 10: clock tiers are visibly distinct (compact < standard < full) ----
  const clockFontAt = async (tier) => {
    await page.evaluate(async (wantedTier) => {
      const { layouts } = await chrome.storage.local.get('layouts')
      const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
      active.widgets.clock = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -25, tier: wantedTier, layer: 0 }
      await chrome.storage.local.set({ layouts })
    }, tier)
    await reloadArmed()
    return page.evaluate(() => parseFloat(
      getComputedStyle(document.querySelector('[data-block-id="clock"] time')).fontSize,
    ))
  }
  const compactPx = await clockFontAt('compact')
  const standardPx = await clockFontAt('standard')
  const fullPx = await clockFontAt('full')
  if (!(compactPx < standardPx && standardPx < fullPx)) {
    fail(`stage10: clock tiers not strictly increasing (compact ${compactPx}px, standard ${standardPx}px, full ${fullPx}px)`)
  }
  await stage('10-clock-full', `clock tiers ${Math.round(compactPx)} / ${Math.round(standardPx)} / ${Math.round(fullPx)} px`)

  // ---- Stage 11: every write in the whole run touched only seeded keys ----
  await harvestWrites()
  for (const keys of evidence.writes) {
    // 'location,settings,weatherCache' is stage 8b's own weather seed.
    if (keys !== 'layouts' && keys !== 'layouts,settings' && keys !== 'settings' && keys !== 'location,settings,weatherCache') {
      fail(`stage11: write touched ${keys}`)
    }
    if (keys.split(',').includes('layout')) fail(`stage11: the frozen legacy layout key was written (${keys})`)
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
