// One-shot W6-P2 packaged-extension replay for named viewport gaps,
// zoom-equivalent CSS spaces, keyboard restoration, touch, and Chromium AX.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w6-p2')
const touchProfileDir = resolve('.playwright-profile-w6-p2-touch')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w6-p2'
const headed = process.argv.includes('--headed')

for (const path of [profileDir, touchProfileDir]) {
  if (!path.endsWith('.playwright-profile-w6-p2') && !path.endsWith('.playwright-profile-w6-p2-touch')) {
    throw new Error(`unsafe profile path: ${path}`)
  }
  rmSync(path, { recursive: true, force: true })
}
mkdirSync(outDir, { recursive: true })

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const evidence = {
  namedViewports: [],
  zoomEquivalent: [],
  keyboard: {},
  touch: {},
  accessibility: {},
  runtimeErrors: [],
  cleanup: {},
}

const launch = (userDataDir, viewport, hasTouch = false) => chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: !headed,
  viewport,
  hasTouch,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})

const context = await launch(profileDir, { width: 1366, height: 768 })
const page = await context.newPage()
page.setDefaultTimeout(10_000)
page.on('console', (message) => {
  if (message.type() === 'error') evidence.runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))

async function waitForStage(targetPage = page) {
  await targetPage.waitForSelector('main[data-adaptive-stage]')
  await targetPage.waitForTimeout(180)
}

async function measure(targetPage, label, path) {
  const result = await targetPage.evaluate(() => {
    const root = document.documentElement
    const body = document.body
    const stage = document.querySelector('main[data-adaptive-stage]')
    if (!(stage instanceof HTMLElement)) return { found: false }
    const style = getComputedStyle(stage)
    const target = Number.parseFloat(style.getPropertyValue('--stage-control-target'))
    const persistent = [
      ['settings', document.querySelector('button[aria-label="Open settings"]')],
      ['utility', document.querySelector('button[aria-label="Open utility tray"]')],
      ['background', document.querySelector('button[aria-label="New background photo"]')],
    ].map(([name, node]) => {
      const rect = node instanceof HTMLElement ? node.getBoundingClientRect() : null
      return { name, found: Boolean(rect), width: rect?.width ?? 0, height: rect?.height ?? 0 }
    })
    return {
      found: true,
      viewport: { width: innerWidth, height: innerHeight },
      profile: stage.dataset.stageProfile,
      target,
      persistent,
      documentOverflowX: root.scrollWidth > root.clientWidth + 1,
      bodyOverflowX: body.scrollWidth > body.clientWidth + 1,
      pageScrollWidth: root.scrollWidth,
      pageClientWidth: root.clientWidth,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }
  })
  assert(result.found, `${label}: Adaptive Stage missing`)
  assert(!result.documentOverflowX && !result.bodyOverflowX,
    `${label}: horizontal page overflow ${result.pageScrollWidth}/${result.pageClientWidth}`)
  assert(result.persistent.every((item) => item.found && item.width >= result.target - 0.5 && item.height >= result.target - 0.5),
    `${label}: persistent targets drifted ${JSON.stringify(result)}`)
  assert(result.reducedMotion, `${label}: reduced-motion media state missing`)
  await targetPage.screenshot({ path })
  return { label, path, ...result }
}

async function reachByTab(name) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  for (let index = 0; index < 120; index += 1) {
    await page.keyboard.press('Tab')
    const current = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
    if (current === name) return index + 1
  }
  throw new Error(`keyboard could not reach ${name}`)
}

try {
  await page.goto('chrome://newtab/')
  await waitForStage()

  const named = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 3440, height: 1440 },
    { width: 3840, height: 2160 },
  ]
  for (const viewport of named) {
    await page.setViewportSize(viewport)
    await waitForStage()
    const label = `${viewport.width}x${viewport.height}`
    evidence.namedViewports.push(await measure(page, label, `${outDir}/w6-p2-viewport-${label}.png`))
  }

  await page.setViewportSize({ width: 1366, height: 768 })
  await waitForStage()
  const settingsTabs = await reachByTab('Open settings')
  const settingsButton = page.getByRole('button', { name: 'Open settings' })
  const focusStyle = await settingsButton.evaluate((node) => {
    const style = getComputedStyle(node)
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
  })
  await page.keyboard.press('Enter')
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor()
  const cdp = await context.newCDPSession(page)
  const axTree = await cdp.send('Accessibility.getFullAXTree')
  evidence.accessibility.settingsDialogNamed = axTree.nodes.some((node) =>
    node.role?.value === 'dialog' && node.name?.value === 'Settings')
  await page.keyboard.press('Escape')
  const settingsRestored = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Open settings')

  const utilityButton = page.getByRole('button', { name: 'Open utility tray' })
  await utilityButton.focus()
  await page.keyboard.press('Enter')
  const tray = page.getByRole('dialog', { name: 'Utility Tray' })
  await tray.waitFor()
  const trayTransition = await tray.evaluate((node) => getComputedStyle(node).transitionDuration)
  await page.keyboard.press('Escape')
  const utilityRestored = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Open utility tray')
  evidence.keyboard = { settingsTabs, focusStyle, settingsRestored, utilityRestored, trayTransition }
  assert(focusStyle.outlineStyle !== 'none' && Number.parseFloat(focusStyle.outlineWidth) >= 2,
    `keyboard focus is not visibly outlined: ${JSON.stringify(focusStyle)}`)
  assert(settingsRestored && utilityRestored, `keyboard restoration failed: ${JSON.stringify(evidence.keyboard)}`)
  assert(evidence.accessibility.settingsDialogNamed, 'Chromium AX tree does not name the Settings dialog')
  assert(trayTransition === '0s', `Utility Tray still transitions under reduced motion: ${trayTransition}`)

  const zoomEquivalent = [
    { zoom: 125, width: 1024, height: 576 },
    { zoom: 150, width: 853, height: 480 },
    { zoom: 200, width: 640, height: 360 },
    { zoom: 400, width: 320, height: 180 },
  ]
  for (const row of zoomEquivalent) {
    await page.setViewportSize({ width: row.width, height: row.height })
    await waitForStage()
    const zoomEvidence = { zoom: row.zoom, ...(await measure(
      page,
      `${row.zoom}% equivalent ${row.width}x${row.height}`,
      `${outDir}/w6-p2-zoom-equivalent-${row.zoom}-${row.width}x${row.height}.png`,
    )) }
    if (row.zoom === 200 || row.zoom === 400) {
      zoomEvidence.weatherSetup = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Search for a city"]')
        const button = document.querySelector('button[aria-label="Use my location"]')
        const surface = input?.closest('section')
        if (!(input instanceof HTMLElement) || !(button instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
          return { found: false }
        }
        const inputRect = input.getBoundingClientRect()
        const buttonRect = button.getBoundingClientRect()
        const surfaceRect = surface.getBoundingClientRect()
        const compactLabel = button.querySelector('[data-location-label="compact"]')
        const fullLabel = button.querySelector('[data-location-label="full"]')
        const persistent = [
          document.querySelector('button[aria-label="Open settings"]'),
          document.querySelector('button[aria-label="Open utility tray"]'),
          document.querySelector('button[aria-label="New background photo"]'),
        ].filter((node) => node instanceof HTMLElement).map((node) => node.getBoundingClientRect())
        const contained = [inputRect, buttonRect].every((rect) =>
          rect.left >= surfaceRect.left - 1 && rect.right <= surfaceRect.right + 1 &&
          rect.top >= surfaceRect.top - 1 && rect.bottom <= surfaceRect.bottom + 1)
        const disjoint = buttonRect.bottom <= inputRect.top + 1 || inputRect.bottom <= buttonRect.top + 1
        const collidesPersistent = [inputRect, buttonRect].some((control) => persistent.some((fixed) =>
          control.left < fixed.right - 1 && control.right > fixed.left + 1 &&
          control.top < fixed.bottom - 1 && control.bottom > fixed.top + 1))
        return {
          found: true,
          contained,
          disjoint,
          collidesPersistent,
          visibleButtonText: compactLabel instanceof HTMLElement && getComputedStyle(compactLabel).display !== 'none'
            ? compactLabel.textContent?.trim()
            : fullLabel?.textContent?.trim(),
          buttonName: button.getAttribute('aria-label'),
          button: { width: buttonRect.width, height: buttonRect.height },
          input: { width: inputRect.width, height: inputRect.height },
        }
      })
      assert(zoomEvidence.weatherSetup.found && zoomEvidence.weatherSetup.contained &&
        zoomEvidence.weatherSetup.disjoint && !zoomEvidence.weatherSetup.collidesPersistent,
      `${row.zoom}% Weather setup overlaps or escapes: ${JSON.stringify(zoomEvidence.weatherSetup)}`)
      assert(zoomEvidence.weatherSetup.buttonName === 'Use my location' && zoomEvidence.weatherSetup.visibleButtonText === 'Locate',
        `${row.zoom}% Weather label contract drifted: ${JSON.stringify(zoomEvidence.weatherSetup)}`)
    }
    evidence.zoomEquivalent.push(zoomEvidence)
  }
  assert(evidence.runtimeErrors.length === 0, `runtime errors: ${evidence.runtimeErrors.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/w6-p2-failure.png` }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
}

let touchContext
let touchPage
try {
  touchContext = await launch(touchProfileDir, { width: 375, height: 812 }, true)
  touchPage = await touchContext.newPage()
  touchPage.setDefaultTimeout(10_000)
  const touchCdp = await touchContext.newCDPSession(touchPage)
  await touchCdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  touchPage.on('console', (message) => {
    if (message.type() === 'error') evidence.runtimeErrors.push(`touch console: ${message.text()}`)
  })
  touchPage.on('pageerror', (error) => evidence.runtimeErrors.push(`touch page: ${String(error)}`))
  await touchPage.goto('chrome://newtab/')
  await waitForStage(touchPage)
  const touchMeasure = await measure(touchPage, '375x812 touch', `${outDir}/w6-p2-viewport-375x812-touch.png`)
  const touchCapability = await touchPage.evaluate(() => ({
    maxTouchPoints: navigator.maxTouchPoints,
    coarseMedia: matchMedia('(pointer: coarse)').matches,
  }))
  const utility = touchPage.getByRole('button', { name: 'Open utility tray' })
  const utilityBox = await utility.boundingBox()
  assert(utilityBox, '375x812 touch utility target is missing')
  await touchPage.touchscreen.tap(utilityBox.x + utilityBox.width / 2, utilityBox.y + utilityBox.height / 2)
  const touchTray = touchPage.getByRole('dialog', { name: 'Utility Tray' })
  await touchTray.waitFor()
  const close = touchTray.getByRole('button', { name: 'Close utility tray' })
  const closeBox = await close.boundingBox()
  assert(closeBox, '375x812 touch close target is missing')
  await touchPage.touchscreen.tap(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2)
  await touchTray.waitFor({ state: 'hidden' })
  evidence.touch = { ...touchMeasure, ...touchCapability, tapOpenedAndClosedTray: true }
} catch (error) {
  evidence.error ??= error instanceof Error ? error.message : String(error)
  await touchPage?.screenshot({ path: `${outDir}/w6-p2-touch-failure.png` }).catch(() => {})
} finally {
  if (touchPage) await touchPage.close().then(() => { evidence.cleanup.touchPageClosed = true })
  if (touchContext) await touchContext.close()
  rmSync(touchProfileDir, { recursive: true, force: true })
  evidence.cleanup.touchProfileRemoved = true
}

console.log(`EVIDENCE: ${JSON.stringify(evidence)}`)
if (evidence.error || evidence.runtimeErrors.length > 0 ||
    !evidence.cleanup.pageClosed || !evidence.cleanup.profileRemoved ||
    !evidence.cleanup.touchPageClosed || !evidence.cleanup.touchProfileRemoved) {
  console.error(`FAIL: W6-P2 responsive/zoom/keyboard/accessibility QA: ${evidence.error ?? 'runtime or cleanup failure'}`)
  process.exitCode = 1
} else {
  console.log('PASS: W6-P2 responsive/zoom/keyboard/accessibility QA')
}
