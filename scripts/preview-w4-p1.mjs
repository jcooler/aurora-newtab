// Focused W4-P1 built-extension replay for sparse/populated Day and the
// Clock/Greeting/Search/Focus hierarchy. The historical matrix runs once as
// the packet's final gate; this script owns only the new acceptance evidence.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w4-p1')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w4-p1'
const touchedKeys = ['settings', 'layout', 'connectors']
const nowIds = ['clock', 'greeting', 'search', 'focus']
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
const exact = (actual, expected) => JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(expected))
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 800, height: 600 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
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
  await page.waitForFunction((ids) => ids.every((id) => document.querySelectorAll(`[data-block-id="${id}"]`).length === 1), nowIds)
  await page.waitForTimeout(100)
}
const setDayPopulated = async (populated) => {
  await page.evaluate(async (nextPopulated) => {
    const { settings } = await chrome.storage.local.get('settings')
    await chrome.storage.local.set({
      settings: {
        ...settings,
        widgets: { ...settings.widgets, monthCal: nextPopulated },
      },
    })
  }, populated)
  await page.reload()
  await waitForStage()
}
const observe = () => page.evaluate((ids) => {
  const day = document.querySelector('[data-stage-zone="day"]')
  const now = document.querySelector('[data-stage-zone="now"]')
  const contextNode = day?.querySelector('[data-day-context]')
  const clockDate = document.querySelector('[data-clock-date]')
  const controls = [
    document.querySelector('[data-block-id="search"] input'),
    document.querySelector('[data-block-id="focus"] input'),
  ].filter((node) => node instanceof HTMLElement)
  const nowStyle = now instanceof HTMLElement ? getComputedStyle(now) : null
  const clockDateStyle = clockDate instanceof HTMLElement ? getComputedStyle(clockDate) : null
  const board = [...document.querySelectorAll('[data-block-id]')].map((node) => {
    const rect = node.getBoundingClientRect()
    return {
      id: node.getAttribute('data-block-id'),
      represented: rect.width > 0 && rect.height > 0,
      position: node instanceof HTMLElement ? node.style.position : '',
      left: node instanceof HTMLElement ? node.style.left : '',
      top: node instanceof HTMLElement ? node.style.top : '',
    }
  })
  return {
    profile: document.documentElement.dataset.stageProfile,
    dayContext: contextNode ? {
      compact: contextNode.querySelector('[data-day-context-compact]')?.textContent,
      long: contextNode.querySelector('[data-day-context-long]')?.textContent,
    } : null,
    dayAllocationIds: [...(day?.querySelectorAll(':scope > [data-block-id]') ?? [])].map((node) => node.getAttribute('data-block-id')),
    nowIds: [...(now?.querySelectorAll(':scope > [data-block-id]') ?? [])].map((node) => node.getAttribute('data-block-id')),
    nowPhotoForward: nowStyle?.borderTopColor === 'rgba(0, 0, 0, 0)' && nowStyle?.boxShadow === 'none',
    clockDate: clockDate?.textContent,
    clockDateVisible: clockDateStyle?.display !== 'none',
    board,
    unique: board.every((item) => document.querySelectorAll(`[data-block-id="${item.id}"]`).length === 1),
    controls: controls.map((node) => {
      const rect = node.getBoundingClientRect()
      return { width: rect.width, height: rect.height, visible: rect.width > 0 && rect.height > 0 }
    }),
    noHorizontalPageClip: document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1,
  }
}, nowIds)
const capture = async (width, height, file) => {
  await page.setViewportSize({ width, height })
  await page.reload()
  await waitForStage()
  const observation = await observe()
  await page.screenshot({ path: `${outDir}/${file}` })
  return observation
}

const evidence = { captures: {}, cleanup: {} }
try {
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')
  originalPreimage = await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys)
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    widgets.search = true
    await chrome.storage.local.set({
      settings: { ...settings, widgets, layoutDensity: 'auto' },
      layout: { version: 2, profiles: {} },
      connectors: {},
    })
  })
  captureErrors = true

  evidence.captures.compact = await capture(800, 600, 'w4-p1-compact-sparse-800x600.png')
  await setDayPopulated(true)
  evidence.captures.standard = await capture(1600, 900, 'w4-p1-standard-populated-1600x900.png')
  evidence.captures.display = await capture(2560, 1440, 'w4-p1-display-populated-2560x1440.png')

  const compact = evidence.captures.compact
  const standard = evidence.captures.standard
  const display = evidence.captures.display
  for (const [name, observation] of Object.entries(evidence.captures)) {
    assert(exact(observation.nowIds, nowIds), `${name}: Now hierarchy changed`)
    assert(observation.nowPhotoForward, `${name}: Now retained framed-card chrome`)
    assert(observation.unique && observation.board.every((item) => item.represented), `${name}: duplicate or missing BoardItem`)
    assert(observation.board.every((item) => item.position === '' && item.left === '' && item.top === ''), `${name}: non-semantic positioning found`)
    assert(observation.controls.every((control) => control.visible && control.width >= 35.5 && control.height >= 35.5), `${name}: core Now control target failed`)
    assert(observation.noHorizontalPageClip, `${name}: horizontal page clipping`)
  }
  assert(compact.profile === 'compact' && compact.dayContext && compact.dayAllocationIds.length === 0, 'Compact sparse Day context failed')
  assert(!compact.clockDateVisible, 'Compact exposed expanded Clock detail')
  assert(standard.dayContext === null && standard.dayAllocationIds.includes('monthCal'), 'Standard populated Day ownership failed')
  assert(display.profile === 'display' && display.clockDateVisible && Boolean(display.clockDate), 'Display did not add Clock date detail')
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
} finally {
  captureErrors = false
  try {
    if (originalPreimage) {
      await page.evaluate(async ({ keys, snapshot }) => {
        const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(snapshot, key))
        if (missing.length > 0) await chrome.storage.local.remove(missing)
        if (Object.keys(snapshot).length > 0) await chrome.storage.local.set(snapshot)
      }, { keys: touchedKeys, snapshot: originalPreimage })
      evidence.cleanup.restored = exact(await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys), originalPreimage)
    }
  } catch (error) {
    evidence.cleanup.error = error instanceof Error ? error.message : String(error)
  }
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
}

console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, runtimeErrors })}`)
if (evidence.error || !evidence.cleanup.restored || !evidence.cleanup.pageClosed) {
  console.error(`FAIL: W4-P1 Day and Now zone semantics${evidence.error ? `: ${evidence.error}` : ''}`)
  process.exitCode = 1
} else {
  console.log('PASS: W4-P1 Day and Now zone semantics')
}
