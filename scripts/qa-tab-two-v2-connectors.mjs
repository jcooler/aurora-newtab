import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

import { assertExactBuildTrackedStatus } from './build-contracts.mjs'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two connector QA requires --exact')
}

export function assertBuildCommit(provenance, head) {
  assert.equal(provenance?.commit, head, 'dist provenance does not match HEAD')
  return head
}

export function assertViewportContained(rect, viewport) {
  assert(rect, 'connector surface viewport rectangle is missing')
  assert(rect.left >= -0.5, 'connector surface escaped the viewport on the left')
  assert(rect.top >= -0.5, 'connector surface escaped the viewport at the top')
  assert(rect.right <= viewport.width + 0.5, 'connector surface escaped the viewport on the right')
  assert(rect.bottom <= viewport.height + 0.5, 'connector surface escaped the viewport at the bottom')
  return rect
}

export function assertTwoColumnGrid(rects) {
  assert(rects.length >= 2, 'connector gallery needs two cards to prove two columns')
  assert(Math.abs(rects[0].top - rects[1].top) <= 1, 'connector gallery did not render in two columns')
  assert(rects[1].left > rects[0].left + rects[0].width * 0.5, 'connector gallery columns overlap')
  return rects
}

export function assertSingleColumnGrid(rects) {
  assert(rects.length >= 2, 'connector gallery needs two cards to prove one column')
  assert(Math.abs(rects[0].left - rects[1].left) <= 1, 'connector gallery did not render in one column')
  assert(rects[1].top > rects[0].top + 1, 'connector gallery cards overlap vertically')
  return rects
}

const rectOf = (locator) => locator.evaluate((node) => {
  const rect = node.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
})

async function galleryRects(page) {
  return page.locator('[data-testid="connector-gallery"]').evaluateAll((galleries) => {
    const gallery = galleries.find((candidate) => candidate.querySelectorAll('[data-connector-card]').length >= 2)
    if (!gallery) return []
    return [...gallery.querySelectorAll('[data-connector-card]')].slice(0, 2).map((card) => {
      const rect = card.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    })
  })
}

async function settingsGeometry(page) {
  return page.getByRole('dialog', { name: 'Settings' }).evaluate((drawer) => {
    const rect = drawer.getBoundingClientRect()
    const visible = (node) => {
      const box = node.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    }
    const scrollOwners = [drawer, ...drawer.querySelectorAll('*')].filter((node) => {
      if (!visible(node)) return false
      const style = getComputedStyle(node)
      return /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1
    })
    return {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      documentWidth: document.documentElement.scrollWidth,
      drawerClientWidth: drawer.clientWidth,
      drawerScrollWidth: drawer.scrollWidth,
      scrollOwnerCount: scrollOwners.length,
      drawerIsOnlyScrollOwner: scrollOwners.length === 1 && scrollOwners[0] === drawer,
    }
  })
}

async function assertSettingsGeometry(page, label) {
  const geometry = await settingsGeometry(page)
  assertViewportContained(geometry.rect, geometry.viewport)
  assert(geometry.documentWidth <= geometry.viewport.width + 1, `${label} introduced page-level horizontal overflow`)
  assert(geometry.drawerScrollWidth <= geometry.drawerClientWidth + 1, `${label} introduced Settings horizontal overflow`)
  assert.equal(geometry.scrollOwnerCount, 1, `${label} must have exactly one vertical Settings scroll owner`)
  assert.equal(geometry.drawerIsOnlyScrollOwner, true, `${label} nested a scroll owner inside Settings`)
  return geometry
}

export async function runTabTwoConnectorQa(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  const dist = resolve(repoRoot, 'dist')
  assertExactBuildTrackedStatus(execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    { cwd: repoRoot, encoding: 'utf8' },
  ))
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  assertBuildCommit(JSON.parse(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8')), commit)

  const output = resolve(repoRoot, 'docs/superpowers/qa/tab-two-v2-connectors/acceptance')
  mkdirSync(output, { recursive: true })
  const profile = mkdtempSync(resolve(tmpdir(), 'tab-two-connectors-'))
  const evidence = {
    commit,
    consoleErrors: [],
    pageErrors: [],
    externalRequests: [],
    photo: null,
    desktop: null,
    short: null,
    narrow: null,
    categoryLabels: [],
    searchLabels: [],
    focusRestored: false,
    rssWrite: null,
    visibilityRoundTrip: null,
    result: 'FAIL',
  }
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
    page.setDefaultTimeout(20_000)
    page.on('console', (message) => {
      const value = message.text()
      if (message.type() === 'error' && !value.startsWith('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT')) {
        evidence.consoleErrors.push(value)
      }
    })
    page.on('pageerror', (error) => evidence.pageErrors.push(error.message))
    await context.route(/^https?:\/\//, (route) => {
      evidence.externalRequests.push(route.request().url())
      return route.abort('blockedbyclient')
    })

    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    await seedInformationFirstFixtures(page, { contributionDayCount: 90 })
    await page.evaluate(async () => {
      const { photoPrefs } = await chrome.storage.local.get('photoPrefs')
      await chrome.storage.local.set({ photoPrefs: { ...photoPrefs, mode: 'auto', index: 2 } })
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    const background = page.locator('img[data-photo]')
    await background.waitFor()
    await background.evaluate((image) => image.decode())
    evidence.photo = await background.evaluate((image) => ({
      src: image.getAttribute('src'),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      complete: image.complete,
    }))
    assert.equal(evidence.photo.complete, true, 'background photo did not finish loading')
    assert(evidence.photo.naturalWidth >= 2560, `background photo is not full-resolution: ${JSON.stringify(evidence.photo)}`)
    assert(!/preview|data:image/i.test(evidence.photo.src ?? ''), 'background photo used a preview or placeholder as its main image')

    await page.getByRole('button', { name: 'Open settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()
    await page.getByRole('tab', { name: 'Connectors' }).click()
    await page.getByRole('heading', { name: 'Bring your day together.' }).waitFor()
    await page.waitForTimeout(350)

    assert.match(await page.getByTestId('connector-scroll').locator('p').first().innerText(), /^\d+ connected$/)
    evidence.desktop = await assertSettingsGeometry(page, '1600x900')
    assert(evidence.desktop.rect.width >= 950 && evidence.desktop.rect.width <= 962, `desktop Settings width is not 60rem: ${evidence.desktop.rect.width}`)
    assertTwoColumnGrid(await galleryRects(page))
    await page.screenshot({ path: resolve(output, 'connectors-1600x900.png') })

    await page.getByRole('button', { name: 'Calendar & tasks', exact: true }).click()
    evidence.categoryLabels = await page.locator('[data-connector-card] h4').allInnerTexts()
    assert.deepEqual(evidence.categoryLabels.sort(), ['Calendar', 'Public Holidays', 'Todoist'].sort(), 'Calendar category filter returned the wrong cards')
    await page.getByLabel('Search connectors').fill('github')
    evidence.searchLabels = await page.locator('[data-connector-card] h4').allInnerTexts()
    assert.deepEqual(evidence.searchLabels, ['GitHub'], 'search did not replace the selected category with full-catalog results')
    await page.getByLabel('Search connectors').fill('')
    await page.getByRole('button', { name: 'All', exact: true }).click()

    const secretText = await page.locator('body').innerText()
    for (const secret of ['fixture-github-token', 'fixture-gitlab-token', 'fixture-jira-token', 'fixture-vercel-token', 'fixture-ha-token']) {
      assert(!secretText.includes(secret), `connector secret was rendered: ${secret}`)
    }

    const calendarAction = page.getByRole('button', { name: 'Edit Calendar' })
    const calendarActionId = await calendarAction.getAttribute('id')
    await calendarAction.click()
    const calendarDialog = page.getByRole('dialog', { name: 'Calendar settings' })
    await calendarDialog.waitFor()
    assertViewportContained(await rectOf(calendarDialog), { width: 1600, height: 900 })
    await page.screenshot({ path: resolve(output, 'calendar-detail-1600x900.png') })
    await page.keyboard.press('Escape')
    await calendarDialog.waitFor({ state: 'detached' })
    evidence.focusRestored = await page.evaluate((id) => document.activeElement?.id === id, calendarActionId)
    assert.equal(evidence.focusRestored, true, 'closing connector details did not restore the exact card action focus')
    await page.getByRole('dialog', { name: 'Settings' }).waitFor()

    await page.getByRole('button', { name: 'Edit RSS' }).click()
    await page.getByRole('dialog', { name: 'RSS settings' }).waitFor()
    await page.getByLabel('Headlines shown').selectOption('7')
    await page.waitForFunction(async () => (await chrome.storage.local.get('connectors')).connectors.rss.shownCount === 7)
    evidence.rssWrite = await page.evaluate(async () => (await chrome.storage.local.get('connectors')).connectors.rss)
    assert.equal(evidence.rssWrite.shownCount, 7, 'RSS editor did not persist the selected headline count')
    assert.equal(evidence.rssWrite.feeds.length, 2, 'RSS editor damaged the configured feeds')
    await page.getByRole('button', { name: 'Close RSS settings' }).click()

    const visibility = page.getByRole('switch', { name: 'Show RSS on Canvas' })
    await visibility.click()
    await page.waitForFunction(async () => (await chrome.storage.local.get('connectors')).connectors.rss.enabled === false)
    const hidden = await page.evaluate(async () => (await chrome.storage.local.get('connectors')).connectors.rss)
    await page.getByRole('switch', { name: 'Show RSS on Canvas' }).click()
    await page.waitForFunction(async () => (await chrome.storage.local.get('connectors')).connectors.rss.enabled === true)
    const restored = await page.evaluate(async () => (await chrome.storage.local.get('connectors')).connectors.rss)
    evidence.visibilityRoundTrip = { hidden, restored }
    assert.deepEqual(hidden.feeds, restored.feeds, 'visibility toggle changed RSS ownership data')
    assert.equal(restored.shownCount, 7, 'visibility toggle changed RSS presentation preferences')

    await page.setViewportSize({ width: 1408, height: 600 })
    await page.waitForTimeout(350)
    evidence.short = await assertSettingsGeometry(page, '1408x600')
    assertTwoColumnGrid(await galleryRects(page))
    await page.screenshot({ path: resolve(output, 'connectors-1408x600.png') })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(350)
    evidence.narrow = await assertSettingsGeometry(page, '375x812')
    assertSingleColumnGrid(await galleryRects(page))
    await page.screenshot({ path: resolve(output, 'connectors-375x812.png') })

    assert.deepEqual(evidence.consoleErrors, [], 'browser console errors were emitted')
    assert.deepEqual(evidence.pageErrors, [], 'uncaught page errors were emitted')
    assert.deepEqual(evidence.externalRequests, [], 'connector QA made unexpected external requests')
    evidence.result = 'PASS'
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`PASS: Tab Two connector experience QA (${commit})`)
    return evidence
  } finally {
    await context?.close()
    rmSync(profile, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runTabTwoConnectorQa()
}
