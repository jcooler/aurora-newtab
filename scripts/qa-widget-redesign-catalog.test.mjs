import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'

import { chromium } from 'playwright'

import { MIXED_STACKS, TARGET_WIDGETS } from '../mockups/widget-redesign/catalog-model.mjs'
import { startCatalogServer } from './widget-redesign-catalog-server.mjs'
import {
  captureViewport,
  createCaptureSession,
  expectedFrame,
  exactSourceDirtyLines,
  markdownCell,
  resolveOutput,
  trimGitOutput,
} from './qa-widget-redesign-catalog.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

test('enforces pure harness geometry, output, viewport, and Markdown contracts', () => {
  assert.deepEqual(expectedFrame('compact'), { width: 216, height: 132 })
  assert.deepEqual(expectedFrame('standard'), { width: 320, height: 200 })
  assert.deepEqual(expectedFrame('full'), { width: 460, height: 284 })
  assert.throws(() => resolveOutput(resolve(repoRoot, 'catalog-output'), '../escape.png'), /outside catalog output/i)
  assert.equal(markdownCell('A | B\nC'), 'A \\| B C')
  assert.equal(trimGitOutput(' M generated.md\r\n'), ' M generated.md')
  assert.deepEqual(captureViewport({ kind: 'comparison' }), { width: 1440, height: 900 })
  assert.deepEqual(captureViewport({ kind: 'free' }), { width: 1200, height: 760 })
})

test('exact-mode cleanliness ignores only generated catalog evidence', () => {
  const status = [
    ' M docs/superpowers/catalog/widget-redesign/v1/CATALOG.md',
    '?? docs/superpowers/catalog/widget-redesign/v1/clock-standard-ready-dark.png',
    ' M docs/superpowers/reports/WIDGET-REDESIGN-MOCKUP-QA.md',
    ' M mockups/widget-redesign/styles.css',
    '?? docs/superpowers/catalog/widget-redesign/v2/unreviewed.png',
  ].join('\n')

  assert.deepEqual(exactSourceDirtyLines(status), [
    ' M mockups/widget-redesign/styles.css',
    '?? docs/superpowers/catalog/widget-redesign/v2/unreviewed.png',
  ])
})

test('creates one reusable browser session for the stateless capture catalog', async () => {
  const calls = []
  const page = { id: 'catalog-page' }
  const context = {
    newPage: async () => {
      calls.push('page')
      return page
    },
  }
  const browser = {
    newContext: async (options) => {
      calls.push({ context: options })
      return context
    },
  }

  assert.deepEqual(await createCaptureSession(browser), { context, page })
  assert.deepEqual(calls, [
    { context: { viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 } },
    'page',
  ])
})

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

test('keeps Standard Quick Link marks separate from readable link copy', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 } })
    await page.goto(`${server.origin}/mockups/widget-redesign/capture/links-standard-ready-dark`)
    const links = await page.locator('.quick-links--standard .quick-link').evaluateAll((nodes) => nodes.map((node) => {
      const mark = node.querySelector('b').getBoundingClientRect()
      const name = node.querySelector('span').getBoundingClientRect()
      const detail = node.querySelector('small').getBoundingClientRect()
      return {
        markRight: mark.right,
        nameLeft: name.left,
        detailLeft: detail.left,
        nameBottom: name.bottom,
        detailTop: detail.top,
        nameClipped: node.querySelector('span').scrollWidth > node.querySelector('span').clientWidth,
      }
    }))

    assert.equal(links.length, 6)
    for (const link of links) {
      assert.ok(link.nameLeft - link.markRight >= 6, `mark crowds name: ${JSON.stringify(link)}`)
      assert.equal(link.nameLeft, link.detailLeft)
      assert.ok(link.detailTop >= link.nameBottom, `name crowds detail: ${JSON.stringify(link)}`)
      assert.equal(link.nameClipped, false, `name is clipped: ${JSON.stringify(link)}`)
    }
  } finally {
    await browser.close()
    await server.close()
  }
})

test('presents Greeting as ambient frameless content by default', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 } })
    await page.goto(`${server.origin}/mockups/widget-redesign/capture/greeting-standard-ready-dark`)
    const surface = await page.locator('[data-widget-id="greeting"]').evaluate((node) => {
      const style = getComputedStyle(node)
      const header = node.querySelector('.widget-frame__header')
      return {
        surface: node.getAttribute('data-surface'),
        background: style.backgroundColor,
        borderWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        headerDisplay: getComputedStyle(header).display,
      }
    })

    assert.deepEqual(surface, {
      surface: 'none',
      background: 'rgba(0, 0, 0, 0)',
      borderWidth: '0px',
      boxShadow: 'none',
      headerDisplay: 'none',
    })

    await page.goto(`${server.origin}/mockups/widget-redesign/capture/greeting-standard-stack-ready-dark`)
    const stackSurface = await page.locator('[data-widget-id="greeting"]').evaluate((node) => ({
      surface: node.getAttribute('data-surface'),
      background: getComputedStyle(node).backgroundColor,
      headerDisplay: getComputedStyle(node.querySelector('.widget-frame__header')).display,
    }))
    assert.deepEqual(stackSurface, {
      surface: 'card',
      background: 'rgb(37, 44, 57)',
      headerDisplay: 'flex',
    })
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

test('gives month markers a visible gap beneath every marked date number', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 } })
    await page.goto(`${server.origin}/mockups/widget-redesign/capture/comparison-calendar-standard-agenda-month`)

    const markedDays = await page.locator('[data-calendar-view="month"] [data-month-day]:has(i)').evaluateAll((cells) => cells.map((cell) => {
      const number = cell.querySelector('[data-day-number]')
      const marker = cell.querySelector('i')
      if (!number || !marker) return null
      const cellBox = cell.getBoundingClientRect()
      const numberBox = number.getBoundingClientRect()
      const markerBox = marker.getBoundingClientRect()
      return {
        topSpace: numberBox.top - cellBox.top,
        markerGap: markerBox.top - numberBox.bottom,
        bottomSpace: cellBox.bottom - markerBox.bottom,
      }
    }))

    assert.ok(markedDays.length > 0)
    assert.ok(markedDays.every(Boolean))
    for (const day of markedDays) {
      assert.ok(day.topSpace >= 0, `date number escaped its cell: ${JSON.stringify(day)}`)
      assert.ok(day.markerGap >= 1, `date marker gap is crowded: ${JSON.stringify(day)}`)
      assert.ok(day.bottomSpace >= 0, `date marker escaped its cell: ${JSON.stringify(day)}`)
    }
  } finally {
    await browser.close()
    await server.close()
  }
})

test('expands the Standard Calendar month between its raised controls and lowered holiday line', async () => {
  const server = await startCatalogServer({ repoRoot })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 } })
    await page.goto(`${server.origin}/mockups/widget-redesign/capture/comparison-calendar-standard-agenda-month`)
    const geometry = await page.locator('[data-calendar-view="month"]').evaluate((month) => {
      const frame = month.closest('[data-tier-frame="standard"]')
      const body = frame.querySelector('.widget-frame__body')
      const day = month.querySelector('[data-month-day]')
      const holiday = month.querySelector('.month-view__holiday')
      const bodyStyle = getComputedStyle(body)
      const frameBox = frame.getBoundingClientRect()
      const holidayBox = holiday.getBoundingClientRect()
      return {
        bodyPaddingTop: Number.parseFloat(bodyStyle.paddingTop),
        bodyPaddingBottom: Number.parseFloat(bodyStyle.paddingBottom),
        dayHeight: day.getBoundingClientRect().height,
        holidayBottomSpace: frameBox.bottom - holidayBox.bottom,
      }
    })

    assert.ok(geometry.bodyPaddingTop <= 4, JSON.stringify(geometry))
    assert.ok(geometry.bodyPaddingBottom <= 10, JSON.stringify(geometry))
    assert.ok(geometry.dayHeight >= 16, JSON.stringify(geometry))
    assert.ok(geometry.holidayBottomSpace <= 10, JSON.stringify(geometry))
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
