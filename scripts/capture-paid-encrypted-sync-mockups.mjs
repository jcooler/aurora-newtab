import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

const repoRoot = path.resolve(import.meta.dirname, '..')
const outputDir = path.join(repoRoot, 'docs', 'superpowers', 'qa', 'paid-encrypted-sync')
const mockupUrl = pathToFileURL(path.join(outputDir, 'mockup.html'))

const captures = [
  ['sync-off', 1600, 900, 'sync-off-desktop.png'],
  ['first-sync', 1600, 900, 'first-sync-desktop.png'],
  ['up-to-date', 1600, 900, 'up-to-date-desktop.png'],
  ['offline', 390, 844, 'offline-touch.png'],
  ['conflict', 1600, 900, 'conflict-recovery-desktop.png'],
  ['device-limit', 1600, 900, 'device-limit-desktop.png'],
  ['deletion', 1600, 900, 'deletion-desktop.png'],
]

const browser = await chromium.launch({ headless: true })
const results = []

try {
  for (const [state, width, height, filename] of captures) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      hasTouch: state === 'offline',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const runtimeErrors = []
    const failedRequests = []
    const requests = []

    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
    })
    page.on('request', (request) => requests.push(request.url()))
    page.on('requestfailed', (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText ?? 'failed'}`))

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
      const smallControls = [...document.querySelectorAll('button, input')]
        .filter((node) => node.getBoundingClientRect().height < 35.5)
        .map((node) => node.getAttribute('aria-label') || node.textContent?.trim() || node.tagName)
      const overlapTargets = [...document.querySelectorAll('button, input, .current')]
        .map((node) => ({
          label: node.getAttribute('aria-label') || node.textContent?.trim() || node.tagName,
          rect: node.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      const overlaps = []
      for (let left = 0; left < overlapTargets.length; left += 1) {
        for (let right = left + 1; right < overlapTargets.length; right += 1) {
          const a = overlapTargets[left]
          const b = overlapTargets[right]
          const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
          const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
          if (width > 0.5 && height > 0.5) overlaps.push(`${a.label} / ${b.label}`)
        }
      }
      const focused = document.activeElement
      const focusedStyle = focused instanceof HTMLElement ? getComputedStyle(focused) : null
      return {
        viewport,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        scrollOwners,
        clippedControls,
        smallControls,
        overlaps,
        focusVisible: Boolean(focusedStyle && (
          (focusedStyle.outlineStyle !== 'none' && parseFloat(focusedStyle.outlineWidth) >= 2)
          || focusedStyle.boxShadow !== 'none'
        )),
      }
    })

    assert.equal(runtimeErrors.length, 0, `${state}: ${runtimeErrors.join('; ')}`)
    assert.equal(failedRequests.length, 0, `${state}: ${failedRequests.join('; ')}`)
    assert.equal(requests.length, 1, `${state}: unexpected subrequest ${requests.join(', ')}`)
    assert.equal(geometry.viewport.width, width, `${state}: wrong viewport width`)
    assert.equal(geometry.viewport.height, height, `${state}: wrong viewport height`)
    assert.equal(geometry.horizontalOverflow, false, `${state}: horizontal overflow`)
    assert.ok(geometry.scrollOwners.length <= 1, `${state}: more than one vertical scroll owner`)
    assert.deepEqual(geometry.clippedControls, [], `${state}: clipped controls`)
    assert.deepEqual(geometry.smallControls, [], `${state}: controls below 36 px`)
    assert.deepEqual(geometry.overlaps, [], `${state}: overlapping controls or state labels`)
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
