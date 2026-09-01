import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

const repoRoot = path.resolve(import.meta.dirname, '..')
const outputDir = path.join(repoRoot, 'docs', 'superpowers', 'qa', 'paid-account-shell')
const mockupUrl = pathToFileURL(path.join(outputDir, 'mockup.html'))

const captures = [
  ['local', 1600, 900, 'account-local-desktop.png'],
  ['signed-in', 1600, 900, 'account-signed-in-desktop.png'],
  ['sync', 768, 812, 'account-sync-touch.png'],
  ['device-limit', 1600, 900, 'account-device-limit.png'],
  ['delete', 1600, 900, 'account-delete-confirmation.png'],
]

const browser = await chromium.launch({ headless: true })
const results = []

try {
  for (const [state, width, height, filename] of captures) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      hasTouch: state === 'sync',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const runtimeErrors = []
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
    })

    const url = new URL(mockupUrl)
    url.searchParams.set('state', state)
    await page.goto(url.href, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.locator('[data-autofocus]').focus()

    const geometry = await page.evaluate(() => {
      const root = document.documentElement
      const viewport = { width: root.clientWidth, height: root.clientHeight }
      const scrollOwners = [...document.querySelectorAll('[data-scroll-owner]')]
        .filter((node) => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)
        .map((node) => node.getAttribute('data-scroll-owner'))
      const clippedControls = [...document.querySelectorAll('button, input')]
        .filter((node) => {
          const rect = node.getBoundingClientRect()
          return rect.left < -0.5 || rect.top < -0.5 || rect.right > viewport.width + 0.5 || rect.bottom > viewport.height + 0.5
        })
        .map((node) => node.getAttribute('aria-label') || node.textContent?.trim() || node.tagName)
      const focused = document.activeElement
      const focusedStyle = focused instanceof HTMLElement ? getComputedStyle(focused) : null
      return {
        viewport,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        scrollOwners,
        clippedControls,
        focusVisible: Boolean(focusedStyle && focusedStyle.outlineStyle !== 'none' && parseFloat(focusedStyle.outlineWidth) >= 2),
      }
    })

    assert.equal(runtimeErrors.length, 0, `${state}: ${runtimeErrors.join('; ')}`)
    assert.equal(geometry.viewport.width, width, `${state}: wrong viewport width`)
    assert.equal(geometry.viewport.height, height, `${state}: wrong viewport height`)
    assert.equal(geometry.horizontalOverflow, false, `${state}: horizontal overflow`)
    assert.ok(geometry.scrollOwners.length <= 1, `${state}: more than one scroll owner`)
    assert.deepEqual(geometry.clippedControls, [], `${state}: clipped controls`)
    assert.equal(geometry.focusVisible, true, `${state}: focused control has no visible focus ring`)

    const outputPath = path.join(outputDir, filename)
    await page.screenshot({ path: outputPath, fullPage: false })
    const metadata = await sharp(outputPath).metadata()
    assert.equal(metadata.width, width, `${filename}: wrong PNG width`)
    assert.equal(metadata.height, height, `${filename}: wrong PNG height`)

    results.push({ state, filename, width, height, scrollOwners: geometry.scrollOwners.length })
    await context.close()
  }
} finally {
  await browser.close()
}

for (const result of results) {
  console.log(`PASS ${result.filename} ${result.width}x${result.height} scrollOwners=${result.scrollOwners}`)
}
