import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import {
  parsePresentationAuthority,
  resolveSfP1BrowserMode,
  resolveSfP1ContextOptions,
} from './qa-shared-frame-p1.mjs'
import { parseBuildCommit } from './qa-widget-redesign-production.mjs'

function placement(x, y, tier, layer) {
  return { kind: 'free', anchor: 'center', offsetX: x - 50, offsetY: y - 50, tier, layer }
}

function recoveryLayout(authorityIds) {
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  Object.assign(widgets, {
    clock: placement(50, 13, 'standard', 1),
    greeting: placement(78, 13, 'compact', 2),
    quote: placement(72, 80, 'standard', 3),
    github: placement(17, 57, 'standard', 4),
    ics: placement(48, 57, 'standard', 5),
    monthCal: placement(79, 57, 'standard', 6),
    publicHolidays: { kind: 'hidden' },
  })
  const layout = { id: 'recovery', name: 'Recovery', widgets, stacks: [] }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}

function shortLayout(authorityIds) {
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  Object.assign(widgets, {
    clock: placement(50, 11, 'standard', 1),
    greeting: placement(78, 15, 'compact', 2),
    quote: placement(50, 88, 'standard', 3),
    github: placement(82, 60, 'compact', 4),
    ics: placement(18, 60, 'standard', 5),
  })
  const layout = { id: 'short-recovery', name: 'Short recovery', widgets, stacks: [] }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}

async function assertCanvasFits(page, label) {
  const result = await page.locator('[data-canvas-surface]').evaluate((surface) => {
    const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
    const items = [...surface.querySelectorAll('[data-testid^="canvas-item-"]')]
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => {
        const rect = node.getBoundingClientRect()
        return {
          id: node.getAttribute('data-testid'),
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        }
      })
    const frames = [...surface.querySelectorAll('[data-tier-frame]')].map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        id: node.closest('[data-testid^="canvas-item-"]')?.getAttribute('data-testid'),
        width: rect.width,
        height: rect.height,
        scrollWidth: node.scrollWidth,
        scrollHeight: node.scrollHeight,
        scrollOwners: [node, ...node.querySelectorAll('*')].filter((entry) => {
          const style = getComputedStyle(entry)
          const box = entry.getBoundingClientRect()
          return box.width > 0 && box.height > 0 && /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)
        }).length,
      }
    })
    return { viewport, items, frames, documentWidth: document.documentElement.scrollWidth }
  })
  assert(result.items.length > 0, `${label} rendered no canvas items`)
  assert(result.documentWidth <= result.viewport.width + 1, `${label} introduced page-level horizontal overflow`)
  for (const item of result.items) {
    assert(item.left >= -1 && item.top >= -1, `${label} ${item.id} begins off screen`)
    assert(item.right <= result.viewport.width + 1, `${label} ${item.id} ends off screen horizontally`)
    assert(item.bottom <= result.viewport.height + 1, `${label} ${item.id} ends off screen vertically`)
  }
  for (let leftIndex = 0; leftIndex < result.items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < result.items.length; rightIndex += 1) {
      const left = result.items[leftIndex]
      const right = result.items[rightIndex]
      const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left)
      const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
      assert(
        overlapWidth <= 1 || overlapHeight <= 1,
        `${label} ${left.id} overlaps ${right.id}: ${JSON.stringify({ left, right, overlapWidth, overlapHeight })}`,
      )
    }
  }
  for (const frame of result.frames) {
    assert(frame.scrollWidth <= frame.width + 1, `${label} ${frame.id} clips horizontally`)
    assert(frame.scrollHeight <= frame.height + 1, `${label} ${frame.id} clips vertically`)
    assert.equal(frame.scrollOwners, 0, `${label} ${frame.id} added an internal scrollbar`)
  }
  return result
}

export async function runUiRecoveryQa() {
  const repoRoot = resolve(process.cwd())
  const dist = resolve(repoRoot, 'dist')
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  assert.equal(
    parseBuildCommit(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8')),
    commit,
    'dist provenance does not match HEAD',
  )
  const authorityIds = Object.keys(parsePresentationAuthority(
    readFileSync(resolve(repoRoot, 'src/newtab/widgetSizeContracts.ts'), 'utf8'),
  ))
  const output = resolve(repoRoot, 'docs/superpowers/qa/ui-recovery/acceptance')
  mkdirSync(output, { recursive: true })
  const profile = mkdtempSync(resolve(tmpdir(), 'aurora-ui-recovery-'))
  const consoleErrors = []
  const pageErrors = []
  let context
  try {
    context = await chromium.launchPersistentContext(
      profile,
      resolveSfP1ContextOptions(resolveSfP1BrowserMode([]), dist),
    )
    const page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(20_000)
    page.on('console', (message) => {
      const value = message.text()
      if (message.type() === 'error' && !value.startsWith('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT')) {
        consoleErrors.push(value)
      }
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await context.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'))
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    await seedInformationFirstFixtures(page, { contributionDayCount: 90 })
    const extensionId = new URL(page.url()).host
    const seedUrl = `chrome-extension://${extensionId}/manifest.json`
    await page.goto(seedUrl, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async ({ layouts }) => {
      const current = await chrome.storage.local.get(null)
      await chrome.storage.local.set({
        layouts,
        settings: {
          ...current.settings,
          panelColor: null,
          widgets: { ...current.settings.widgets, monthCal: true, publicHolidays: true },
        },
        photoPrefs: { ...current.photoPrefs, mode: 'gradient' },
      })
    }, { layouts: recoveryLayout(authorityIds) })

    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    assert.equal(await page.getByRole('dialog').count(), 0, 'legacy date cards opened a blocking dialog')
    assert.equal(await page.getByText('Bring your date widgets together').count(), 0, 'removed modal copy returned')
    assert.equal(await page.locator('[data-aurora-canvas] > .contents').getAttribute('inert'), null, 'Canvas is inert')
    for (const id of ['clock', 'focus', 'greeting', 'quote', 'status']) {
      const item = page.locator(`[data-testid="canvas-item-${id}"]`)
      if (await item.count() === 0) continue
      assert.equal(await item.locator('[data-tier-frame]').count(), 0, `${id} was forced into a card`)
    }
    const wide = await assertCanvasFits(page, '1600x900')
    await page.screenshot({ path: resolve(output, 'canvas-1600x900.png') })

    await page.getByRole('button', { name: 'Open settings' }).click()
    await page.getByRole('tab', { name: 'Widgets' }).click()
    const calendarButton = page.getByRole('button', { name: 'Calendar', exact: true })
    await calendarButton.click()
    const calendarRegionId = await calendarButton.getAttribute('aria-controls')
    assert(calendarRegionId, 'Calendar Settings disclosure has no controlled region')
    const calendar = page.locator(`[id="${calendarRegionId}"]`)
    await calendar.getByRole('button', { name: 'Combine into Calendar' }).waitFor()
    const copy = await calendar.textContent()
    assert(!/\blayer\b|stack position|storage id|anchor|offset/i.test(copy ?? ''), 'Settings exposes internal layout terms')
    await page.screenshot({ path: resolve(output, 'calendar-settings.png') })
    await calendar.screenshot({ path: resolve(output, 'calendar-settings-close.png') })
    await page.evaluate(() => {
      window.__calendarRecoveryWrites = []
      chrome.storage.onChanged.addListener((changes) => {
        const keys = Object.keys(changes)
        if (keys.includes('layouts') || keys.includes('calendarPreferences')) {
          window.__calendarRecoveryWrites.push(keys.sort())
        }
      })
    })
    await calendar.getByRole('group', { name: 'Card location to keep' }).getByRole('radio', { name: 'Month' }).click()
    await calendar.getByLabel('Default view').selectOption('month')
    await calendar.getByRole('button', { name: 'Combine into Calendar' }).click()
    await page.waitForFunction(() => window.__calendarRecoveryWrites?.length === 1)
    const saved = await page.evaluate(async () => {
      const value = await chrome.storage.local.get(['layouts', 'calendarPreferences'])
      return { value, writes: window.__calendarRecoveryWrites }
    })
    assert.deepEqual(saved.writes, [['calendarPreferences', 'layouts']], 'Calendar consolidation was not one atomic storage change')
    const active = saved.value.layouts.layouts.find((layout) => layout.id === 'recovery')
    assert.equal(active.widgets.monthCal.kind, 'hidden', 'legacy Month card remained visible')
    assert.equal(active.widgets.publicHolidays.kind, 'hidden', 'legacy Public Holidays card remained visible')
    assert.equal(active.widgets.ics.anchor, 'center', 'Calendar did not retain the chosen card location')
    assert.equal(active.widgets.ics.offsetX, 29, 'Calendar did not retain the Month horizontal location')
    assert.deepEqual(saved.value.calendarPreferences.recovery, {
      defaultView: 'month',
      includePublicHolidays: true,
    })

    await page.goto(seedUrl, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async ({ layouts }) => chrome.storage.local.set({ layouts }), {
      layouts: shortLayout(authorityIds),
    })
    await page.setViewportSize({ width: 1408, height: 445 })
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    const short = await assertCanvasFits(page, '1408x445')
    await page.screenshot({ path: resolve(output, 'canvas-1408x445.png') })
    assert.deepEqual(consoleErrors, [], 'browser console errors were emitted')
    assert.deepEqual(pageErrors, [], 'uncaught page errors were emitted')
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify({
      commit,
      wide,
      short,
      atomicWriteKeys: saved.writes[0],
      calendarPreference: saved.value.calendarPreferences.recovery,
    }, null, 2)}\n`, 'utf8')
    process.stdout.write('PASS UI recovery QA: modal removal, intrinsic typography, Calendar Settings, atomic save, 1600x900 and 1408x445\n')
  } finally {
    if (context) await context.close().catch(() => {})
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

await runUiRecoveryQa()
