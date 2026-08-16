// Focused W3-P3 browser replay. This deliberately avoids rerunning the full
// historical preview harness after the packet's implementation has stabilized.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w3-p3')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w3-p3'
const headed = process.argv.includes('--headed')

rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}
const exact = (actual, expected) =>
  JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(expected))
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
const touchedKeys = ['settings', 'layout']
let originalPreimage
let captureErrors = false
const runtimeErrors = []
page.on('console', (message) => {
  if (captureErrors && message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => {
  if (captureErrors) runtimeErrors.push(`page: ${String(error)}`)
})

const waitForStage = async () => {
  await page.waitForSelector('main[data-adaptive-stage]')
  await page.waitForTimeout(100)
}
const openEditor = async () => {
  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByRole('tab', { name: 'Widgets' }).click()
  await page.getByRole('button', { name: 'Arrange layout' }).click()
  const dialog = page.getByRole('dialog', { name: /Arrange .* profile/ })
  await dialog.waitFor()
  return dialog
}
const captureProfile = async (width, height, file) => {
  await page.setViewportSize({ width, height })
  await page.reload()
  await waitForStage()
  const dialog = await openEditor()
  const geometry = await dialog.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const controls = [...node.querySelectorAll('button:not([disabled]),select:not([disabled])')]
      .filter((control) => control instanceof HTMLElement && control.getClientRects().length > 0)
      .map((control) => control.getBoundingClientRect())
    return {
      bounded: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      targetFloor: controls.every((rect) => rect.height >= 35.5),
      horizontalPageClip: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1,
    }
  })
  await page.screenshot({ path: `${outDir}/${file}` })
  await page.getByRole('button', { name: 'Cancel' }).click()
  return geometry
}

const fixtureLayout = {
  version: 2,
  profiles: {
    compact: {
      weather: { zone: 'day', order: 7, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' },
    },
    standard: {},
    display: {
      habits: { zone: 'now', order: 12, colSpan: 2, rowSpan: 2, variant: 'standard', priority: 'automatic' },
    },
  },
  legacy: { weather: { x: 14, y: 22 }, habits: { x: 55, y: 48 } },
}

const evidence = {}
try {
  await page.goto('chrome://newtab/')
  await waitForStage()
  originalPreimage = await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys)
  await page.evaluate(async (layout) => {
    const current = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(current.settings.widgets).map((key) => [key, false]))
    Object.assign(widgets, { weather: true, habits: true, monthCal: true })
    await chrome.storage.local.set({
      settings: { ...current.settings, widgets, layoutDensity: 'balanced' },
      layout,
    })
  }, fixtureLayout)

  captureErrors = true
  await page.reload()
  await waitForStage()
  const beforeSession = await page.evaluate(() => chrome.storage.local.get('layout'))
  const dialog = await openEditor()
  const editWeather = page.getByRole('button', { name: 'Edit Weather' })
  await editWeather.waitFor()
  evidence.entry = {
    profile: await dialog.getAttribute('aria-label'),
    focused: await editWeather.evaluate((node) => document.activeElement === node),
    underlyingInert: await page.locator('main[data-adaptive-stage] > .contents').evaluate((node) => node.hasAttribute('inert')),
  }

  await editWeather.press('ArrowDown')
  await page.getByRole('button', { name: 'Edit Habits' }).click()
  const habitsRegion = page.getByRole('region', { name: 'Habits placement' })
  await habitsRegion.getByRole('button', { name: 'Move to Day' }).click()
  await habitsRegion.getByRole('button', { name: 'Compact' }).click()
  await habitsRegion.getByRole('button', { name: 'Pinned' }).click()
  await habitsRegion.getByRole('button', { name: 'Wider' }).click()
  const wideSpan = await page.locator('[data-block-id="habits"]').evaluate((node) => getComputedStyle(node).getPropertyValue('--board-col-span').trim())
  await page.getByRole('button', { name: 'Undo' }).click()
  const undoneSpan = await page.locator('[data-block-id="habits"]').evaluate((node) => getComputedStyle(node).getPropertyValue('--board-col-span').trim())
  await habitsRegion.getByRole('button', { name: 'Lock placement' }).click()
  const locked = await habitsRegion.locator('fieldset').evaluate((node) => node.hasAttribute('disabled'))
  await habitsRegion.getByRole('button', { name: 'Unlock placement' }).click()
  const storageDuringPreview = await page.evaluate(() => chrome.storage.local.get('layout'))
  const habitsPreview = await page.locator('[data-block-id="habits"]').evaluate((node) => ({
    zone: node.getAttribute('data-stage-zone'),
    variant: node.getAttribute('data-stage-variant'),
    priority: node.getAttribute('data-stage-priority'),
  }))
  await page.screenshot({ path: `${outDir}/w3-p3-standard-editor-1600x900.png` })
  evidence.preview = { habitsPreview, wideSpan, undoneSpan, locked, storageUnchanged: exact(storageDuringPreview, beforeSession) }

  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForFunction(() => !document.querySelector('[data-arrange-overlay]'))
  const afterCancel = await page.evaluate(() => chrome.storage.local.get('layout'))
  evidence.cancel = {
    exactStorage: exact(afterCancel, beforeSession),
    habitsZoneRestored: await page.locator('[data-block-id="habits"]').getAttribute('data-stage-zone'),
    gearFocused: await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Open settings'),
  }

  await openEditor()
  await page.getByRole('button', { name: 'Copy profile' }).click()
  const copiedWeather = await page.locator('[data-block-id="weather"]').evaluate((node) => ({
    variant: node.getAttribute('data-stage-variant'),
    priority: node.getAttribute('data-stage-priority'),
  }))
  await page.getByRole('button', { name: 'Reset profile' }).click()
  const resetWeatherPriority = await page.locator('[data-block-id="weather"]').getAttribute('data-stage-priority')
  await page.getByRole('button', { name: 'Undo' }).click()
  const undoWeatherPriority = await page.locator('[data-block-id="weather"]').getAttribute('data-stage-priority')
  evidence.copyResetUndo = { copiedWeather, resetWeatherPriority, undoWeatherPriority }
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForFunction(() => !document.querySelector('[data-arrange-overlay]'))
  const saved = await page.evaluate(() => chrome.storage.local.get('layout'))
  evidence.save = {
    activeCopied: saved.layout.profiles.standard?.weather?.priority === 'pinned' && saved.layout.profiles.standard?.weather?.variant === 'compact',
    compactPreserved: exact(saved.layout.profiles.compact, fixtureLayout.profiles.compact),
    displayPreserved: exact(saved.layout.profiles.display, fixtureLayout.profiles.display),
    legacyPreserved: exact(saved.layout.legacy, fixtureLayout.legacy),
    normalizedOrders: Object.values(saved.layout.profiles.standard ?? {}).every((placement) => Number.isInteger(placement.order) && placement.order >= 0),
  }

  evidence.compact = await captureProfile(800, 600, 'w3-p3-compact-editor-800x600.png')
  evidence.display = await captureProfile(2560, 1440, 'w3-p3-display-editor-2560x1440.png')

  assert(evidence.entry.profile === 'Arrange Standard profile', 'active profile label is wrong')
  assert(evidence.entry.focused && evidence.entry.underlyingInert, 'dialog focus or inertness failed')
  assert(evidence.preview.habitsPreview.zone === 'day', 'zone preview failed')
  assert(evidence.preview.habitsPreview.variant === 'compact', 'variant preview failed')
  assert(evidence.preview.habitsPreview.priority === 'pinned', 'priority preview failed')
  assert(evidence.preview.wideSpan === '2' && evidence.preview.undoneSpan === '1', 'resize or undo failed')
  assert(evidence.preview.locked, `lock control failed: ${JSON.stringify(evidence.preview)}`)
  assert(evidence.preview.storageUnchanged, `draft-only persistence failed: ${JSON.stringify(evidence.preview)}`)
  assert(evidence.cancel.exactStorage && evidence.cancel.habitsZoneRestored === 'now' && evidence.cancel.gearFocused, 'Cancel contract failed')
  assert(evidence.copyResetUndo.copiedWeather.priority === 'pinned' && evidence.copyResetUndo.copiedWeather.variant === 'compact', 'Copy profile failed')
  assert(evidence.copyResetUndo.resetWeatherPriority === 'automatic' && evidence.copyResetUndo.undoWeatherPriority === 'pinned', 'Reset/Undo failed')
  assert(Object.values(evidence.save).every(Boolean), 'Save/profile preservation failed')
  assert(evidence.compact.bounded && evidence.compact.targetFloor && !evidence.compact.horizontalPageClip, 'Compact geometry failed')
  assert(evidence.display.bounded && evidence.display.targetFloor && !evidence.display.horizontalPageClip, 'Display geometry failed')
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)

  console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, captures: 3, runtimeErrors })}`)
  console.log('PASS: W3-P3 semantic Arrange/profile editor semantics')
} catch (error) {
  console.error(`EVIDENCE: ${JSON.stringify({ ...evidence, runtimeErrors })}`)
  console.error(`FAIL: W3-P3 semantic Arrange/profile editor semantics: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  captureErrors = false
  if (originalPreimage) {
    await page.evaluate(async ({ keys, snapshot }) => {
      const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(snapshot, key))
      if (missing.length > 0) await chrome.storage.local.remove(missing)
      if (Object.keys(snapshot).length > 0) await chrome.storage.local.set(snapshot)
    }, { keys: touchedKeys, snapshot: originalPreimage }).catch(() => {})
  }
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
}
