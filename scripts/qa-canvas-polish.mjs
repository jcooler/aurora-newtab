import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

import { BLOCK_IDS } from '../src/lib/layout/types.ts'
import { assertExactBuildTrackedStatus } from './build-contracts.mjs'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import { parseBuildCommit } from './qa-widget-redesign-production.mjs'

const placement = (x, y, tier, layer) => ({
  kind: 'free', anchor: 'center', offsetX: x - 50, offsetY: y - 50, tier, layer,
})

const rectOf = (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
})

const styleOf = (locator) => locator.evaluate((node) => {
  const style = getComputedStyle(node)
  return {
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
    borderWidth: style.borderWidth,
    borderBottomWidth: style.borderBottomWidth,
    boxShadow: style.boxShadow,
  }
})

const repoRoot = resolve(process.cwd())
const dist = resolve(repoRoot, 'dist')
assertExactBuildTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: repoRoot, encoding: 'utf8',
}))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
assert.equal(parseBuildCommit(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8')), commit, 'dist provenance does not match HEAD')

const output = resolve(repoRoot, 'docs/superpowers/qa/canvas-polish/acceptance')
mkdirSync(output, { recursive: true })
const profile = mkdtempSync(resolve(tmpdir(), 'aurora-canvas-polish-'))
const evidence = { commit, consoleErrors: [], pageErrors: [], firstView: {}, stackView: {}, result: 'FAIL' }
let context

try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  const page = context.pages()[0] ?? await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => evidence.pageErrors.push(String(error)))
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-canvas-surface]')
  await seedInformationFirstFixtures(page)

  await page.evaluate(async ({ blockIds }) => {
    const current = await chrome.storage.local.get(['settings', 'weatherCache'])
    const flags = Object.fromEntries(Object.keys(current.settings.widgets).map((id) => [id, false]))
    Object.assign(flags, { search: true, links: true, focus: true, status: true })
    const widgets = Object.fromEntries(blockIds.map((id) => [id, { kind: 'hidden' }]))
    Object.assign(widgets, {
      search: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -27, tier: 'standard', layer: 1 },
      links: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -4, tier: 'standard', layer: 2 },
      focus: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 20, tier: 'standard', layer: 3 },
      status: { kind: 'free', anchor: 'center', offsetX: 30, offsetY: -4, tier: 'compact', layer: 4 },
    })
    const layout = { id: 'canvas-polish', name: 'Canvas polish', widgets, stacks: [] }
    await chrome.storage.local.set({
      settings: { ...current.settings, widgets: flags },
      links: [
        { id: 'mail', title: 'Mail', url: 'https://mail.google.com/' },
        { id: 'github', title: 'GitHub', url: 'https://github.com/' },
        { id: 'calendar', title: 'Calendar', url: 'https://calendar.google.com/' },
      ],
      focus: null,
      location: { lat: 33.9237, lon: -84.8408, label: 'Dallas, GA', manual: true },
      weatherCache: current.weatherCache ? { ...current.weatherCache, locationLabel: 'Dallas, GA' } : null,
      layouts: { version: 1, activeLayoutId: layout.id, layouts: [layout] },
    })
  }, { blockIds: BLOCK_IDS })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="canvas-item-search"]')

  const search = page.locator('[data-search-presentation="free"]')
  const searchInput = search.getByRole('searchbox', { name: 'Search the web' })
  const quickLink = page.locator('[data-quick-link-presentation="free"]').first()
  const addLink = page.getByRole('button', { name: 'Add quick link' })
  const searchStyle = await styleOf(search)
  const searchInputStyle = await styleOf(searchInput)
  const quickLinkStyle = await styleOf(quickLink)
  const addLinkStyle = await styleOf(addLink)
  assert.equal(searchStyle.backgroundColor, 'rgba(0, 0, 0, 0)')
  assert.equal(searchStyle.boxShadow, 'none')
  assert.equal(searchStyle.borderRadius, '0px')
  assert.notEqual(searchInputStyle.borderBottomWidth, '0px')
  for (const [label, style] of [['quick link', quickLinkStyle], ['add quick link', addLinkStyle]]) {
    assert.equal(style.backgroundColor, 'rgba(0, 0, 0, 0)', `${label} has a filled card`)
    assert.equal(style.boxShadow, 'none', `${label} has a card shadow`)
    assert.equal(style.borderWidth, '0px', `${label} has a card border`)
  }

  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByRole('tab', { name: 'Widgets' }).click()
  await page.getByText('Dallas, GA', { exact: true }).waitFor()
  assert(await page.getByRole('button', { name: 'Clear Dallas, GA weather location' }).isVisible())
  await page.getByRole('button', { name: 'Close settings' }).click()

  const focusInput = page.locator('#focus-input')
  await focusInput.fill('Finish the Mac test')
  await focusInput.press('Enter')
  assert(await page.getByText("What's your main focus today?", { exact: true }).isVisible())
  assert(await page.getByText('Finish the Mac test', { exact: true }).isVisible())
  await page.locator('#focus-done').check()
  await page.locator('[data-focus-celebration]').waitFor()
  assert.equal(await page.getByText('Nice.', { exact: true }).count(), 0)

  const statusOwner = page.locator('[data-status-service]').nth(1)
  await statusOwner.hover()
  const tooltip = page.getByRole('tooltip')
  await tooltip.waitFor()
  assert.match(await tooltip.textContent(), /^Vercel: Partial outage\. Elevated build latency$/)
  assert.equal(await page.locator('[data-testid="canvas-item-status"] h2').count(), 0)
  evidence.firstView = {
    searchStyle,
    searchInputStyle,
    quickLinkStyle,
    addLinkStyle,
    focusState: await page.locator('[data-focus-state]').getAttribute('data-focus-state'),
    statusTooltip: await tooltip.textContent(),
  }
  await page.screenshot({ path: resolve(output, 'canvas-polish-1600x900.png') })

  await page.setViewportSize({ width: 1408, height: 445 })
  await page.evaluate(async ({ blockIds }) => {
    const { settings } = await chrome.storage.local.get('settings')
    const flags = Object.fromEntries(Object.keys(settings.widgets).map((id) => [id, false]))
    Object.assign(flags, { todo: true, notes: true })
    const widgets = Object.fromEntries(blockIds.map((id) => [id, { kind: 'hidden' }]))
    const stack = {
      id: 'stack-polish', members: ['notes', 'tasks'], facing: 'notes',
      anchor: 'center', offsetX: -50, offsetY: 0, tier: 'standard', layer: 1,
    }
    const layout = { id: 'stack-polish-layout', name: 'Stack polish', widgets, stacks: [stack] }
    await chrome.storage.local.set({
      settings: { ...settings, widgets: flags },
      layouts: { version: 1, activeLayoutId: layout.id, layouts: [layout] },
    })
  }, { blockIds: BLOCK_IDS })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const stack = page.locator('[data-canvas-object-id="stack:stack-polish"]')
  await stack.waitFor()
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-canvas-object-id="stack:stack-polish"]')
    return node && Math.abs(node.getBoundingClientRect().left - 8) <= 1
  })
  const before = await rectOf(stack)
  assert(Math.abs(before.left - 8) <= 1, `stack left edge is ${before.left}, expected 8`)

  await page.keyboard.press('Control+Shift+E')
  await stack.click()
  const inspector = page.getByRole('dialog', { name: 'Notes +1 inspector' })
  await inspector.waitFor()
  const from = inspector.getByRole('button', { name: 'Reorder Tasks' })
  const to = inspector.locator('[data-stack-inspector-member="notes"]')
  const fromBox = await from.boundingBox()
  const toBox = await to.boundingBox()
  assert(fromBox && toBox)
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 8 })
  await page.mouse.up()
  const order = await inspector.locator('[data-stack-inspector-member]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-stack-inspector-member')))
  assert.deepEqual(order, ['tasks', 'notes'])
  assert.equal(await page.locator('[data-canvas-object-id="tasks"]').count(), 0)
  assert.equal(await page.locator('[data-canvas-object-id="notes"]').count(), 0)
  evidence.stackView = { viewport: { width: 1408, height: 445 }, before, order }
  await page.screenshot({ path: resolve(output, 'stack-polish-1408x445.png') })

  assert.deepEqual(evidence.consoleErrors, [])
  assert.deepEqual(evidence.pageErrors, [])
  evidence.result = 'PASS'
} finally {
  writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await context?.close()
  rmSync(profile, { recursive: true, force: true })
}

console.log(`PASS canvas polish QA at ${commit}: frameless utilities, Dallas label, focus celebration, status context, stack reorder and edge reach`)
