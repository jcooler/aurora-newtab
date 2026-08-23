import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'

import { chromium } from 'playwright'

import { MIXED_STACKS, TARGET_WIDGETS } from '../mockups/widget-redesign/catalog-model.mjs'
import { startCatalogServer } from './widget-redesign-catalog-server.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('serves the standalone 36-to-34 catalog with exact calibration frames', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(`${server.origin}/mockups/widget-redesign/?view=gallery`)

    assert.equal(await page.locator('[data-catalog-app]').count(), 1)
    assert.equal(await page.locator('[data-catalog-inventory="36-to-34"]').count(), 1)
    assert.equal(await page.locator('[data-tier-frame="compact"]').first().evaluate((node) => getComputedStyle(node).width), '216px')
    assert.equal(await page.locator('[data-tier-frame="compact"]').first().evaluate((node) => getComputedStyle(node).height), '132px')
    assert.equal(await page.locator('[data-tier-frame="standard"]').first().evaluate((node) => getComputedStyle(node).width), '320px')
    assert.equal(await page.locator('[data-tier-frame="full"]').first().evaluate((node) => getComputedStyle(node).height), '284px')
    assert.deepEqual(pageErrors, [])
  } finally {
    await browser.close()
    await server.close()
  }
})

test('rejects traversal outside the design-only mockup directory', async () => {
  const server = await startCatalogServer({ repoRoot })
  try {
    const response = await fetch(`${server.origin}/mockups/widget-redesign/%2e%2e%2f%2e%2e%2fpackage.json`)
    assert.equal(response.status, 404)
    assert.notEqual((await response.text()).trimStart()[0], '{')
  } finally {
    await server.close()
  }
})

test('keeps the measured runway inside a touch-sized mobile viewport', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
    })
    const page = await context.newPage()
    await page.goto(`${server.origin}/mockups/widget-redesign/?view=gallery`)

    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      fullFrameRight: document.querySelector('[data-tier-frame="full"]').getBoundingClientRect().right,
    }))

    assert.equal(geometry.documentWidth, geometry.viewportWidth)
    assert.ok(geometry.fullFrameRight <= geometry.viewportWidth)
  } finally {
    await browser.close()
    await server.close()
  }
})

test('exposes every core identity and declared tier on the owner gallery', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(`${server.origin}/mockups/widget-redesign/?view=gallery`)

    const coreTargets = TARGET_WIDGETS.filter(({ family }) => family === 'core')
    assert.equal(await page.locator('[data-core-showcase]').count(), coreTargets.length)
    for (const target of coreTargets) {
      const board = page.locator(`[data-core-showcase="${target.id}"]`)
      assert.equal(await board.count(), 1)
      for (const tier of target.tiers) {
        assert.equal(await board.locator(`[data-widget-id="${target.id}"][data-tier-frame="${tier}"]`).count(), 1)
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }
})

test('exposes the Calendar view comparison, consolidation choice, and all sky identities', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(`${server.origin}/mockups/widget-redesign/?view=gallery`)

    assert.equal(await page.locator('[data-calendar-sky-showcase]').count(), 6)
    const calendarBoard = page.locator('[data-calendar-sky-showcase="calendar"]')
    assert.equal(await calendarBoard.locator('[data-calendar-view="agenda"]').count(), 1)
    assert.equal(await calendarBoard.locator('[data-calendar-view="month"]').count(), 1)
    assert.equal(await calendarBoard.locator('[data-calendar-view="combined"]').count(), 1)
    assert.equal(await page.locator('[data-calendar-consolidation] [data-calendar-placement]').count(), 3)
    assert.equal(await page.locator('[data-widget-id="weather"][data-tier-frame="full"] [data-hourly-forecast]').count(), 1)
  } finally {
    await browser.close()
    await server.close()
  }
})

test('exposes every work identity and declared tier on the owner gallery', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(`${server.origin}/mockups/widget-redesign/?view=gallery`)
    const targets = TARGET_WIDGETS.filter(({ family }) => family === 'work')
    assert.equal(await page.locator('[data-work-showcase]').count(), targets.length)
    for (const target of targets) {
      const board = page.locator(`[data-work-showcase="${target.id}"]`)
      for (const tier of target.tiers) assert.equal(await board.locator(`[data-widget-id="${target.id}"][data-tier-frame="${tier}"]`).count(), 1)
    }
  } finally {
    await browser.close()
    await server.close()
  }
})

test('exposes every resource identity and declared tier on the owner gallery', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(`${server.origin}/mockups/widget-redesign/?view=gallery`)
    const targets = TARGET_WIDGETS.filter(({ family }) => family === 'resources')
    assert.equal(await page.locator('[data-resource-showcase]').count(), targets.length)
    for (const target of targets) {
      const board = page.locator(`[data-resource-showcase="${target.id}"]`)
      for (const tier of target.tiers) assert.equal(await board.locator(`[data-widget-id="${target.id}"][data-tier-frame="${tier}"]`).count(), 1)
    }
  } finally {
    await browser.close()
    await server.close()
  }
})

test('shows theme, state, mixed-stack, and interaction evidence without click selection', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(`${server.origin}/mockups/widget-redesign/?view=gallery`)
    assert.equal(await page.locator('[data-evidence-board="themes"] [data-theme]').count(), 3)
    assert.equal(await page.locator('[data-evidence-board="mixed-stacks"] [data-stack]').count(), MIXED_STACKS.length)
    for (const stack of await page.locator('[data-evidence-board="mixed-stacks"] [data-stack]').all()) {
      assert.equal(await stack.locator('[data-stack-active="true"]').count(), 1)
    }
    const plain = page.locator('[data-interaction="plain-click"]')
    assert.equal(await plain.locator('[data-selected], [data-edit-selection]').count(), 0)
    assert.notEqual(await plain.evaluate((node) => getComputedStyle(node).userSelect), 'none')
    assert.equal(await page.locator('[data-interaction="swipe"]').evaluate((node) => getComputedStyle(node).userSelect), 'none')
  } finally {
    await browser.close()
    await server.close()
  }
})
