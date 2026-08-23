import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'

import { chromium } from 'playwright'

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
