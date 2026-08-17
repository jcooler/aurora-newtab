// Reproducible Chrome Web Store captures for Aurora 2.0.
//
// Usage:
//   npm run build:preview
//   npm run store-shots
//
// The preview build moves bookmarks into install-time permissions only so
// Playwright can exercise the real bookmarks API. The Store ZIP is always
// produced separately from a production build, whose package guard rejects
// that preview-only permission shape.
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { seedStoreShotArrange, seedStoreShotCalendar, seedStoreShotHero, seedStoreShotTools } from './store-shot-fixtures.mjs'

const dist = resolve('dist')
const outDir = resolve('release/store-shots')
const profileDir = resolve('.playwright-profile-store-shots')
const headed = process.argv.includes('--headed')
const WIDTH = 1280
const HEIGHT = 800
const DSF = 2
const shotNames = [
  '1-hero.png',
  '2-arrange-mode.png',
  '3-calendar-connectors.png',
  '4-direct-tools.png',
  '5-bookmarks-popover.png',
]

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

if (!outDir.endsWith('release\\store-shots') || !profileDir.endsWith('.playwright-profile-store-shots')) {
  throw new Error('unsafe Store screenshot output/profile path')
}

const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'))
assert((manifest.permissions ?? []).includes('bookmarks'), 'run `npm run build:preview` before Store screenshots')
assert(!(manifest.optional_permissions ?? []).includes('bookmarks'), 'preview manifest duplicates bookmarks permission')

rmSync(profileDir, { recursive: true, force: true })
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const runtimeErrors = []
const failedRequests = []
let context
let page

async function waitForCanvas() {
  await page.waitForSelector('main[data-aurora-canvas]')
  await page.waitForSelector('[data-canvas-layout="Desktop"]')
  await page.waitForFunction(() => {
    const image = document.querySelector('img[data-photo]')
    return !image || image.classList.contains('opacity-100')
  }, { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(800)
}

async function inspectCanvas(label, expectedText = []) {
  const state = await page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight }
    const blocks = [...document.querySelectorAll('[data-block-id]')]
      .filter((node) => {
        const style = getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      })
      .map((node) => {
        const rect = node.getBoundingClientRect()
        return { id: node.getAttribute('data-block-id'), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
      })
    const intersections = []
    for (let first = 0; first < blocks.length; first += 1) {
      for (let second = first + 1; second < blocks.length; second += 1) {
        const a = blocks[first].rect
        const b = blocks[second].rect
        if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
          intersections.push([blocks[first].id, blocks[second].id])
        }
      }
    }
    return {
      text: document.body.innerText,
      blocks,
      overflow: { document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth },
      intersections,
      clipped: blocks.filter(({ rect }) => rect.x < -0.5 || rect.y < -0.5 || rect.x + rect.width > viewport.width + 0.5 || rect.y + rect.height > viewport.height + 0.5),
      missingImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
    }
  })
  assert(state.overflow.document <= state.overflow.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(state.overflow)}`)
  assert(state.intersections.length === 0, `${label}: Canvas intersections ${JSON.stringify({ intersections: state.intersections, blocks: state.blocks })}`)
  assert(state.clipped.length === 0, `${label}: clipped Canvas blocks ${JSON.stringify(state.clipped)}`)
  assert(state.missingImages.length === 0, `${label}: missing images ${JSON.stringify(state.missingImages)}`)
  for (const witness of expectedText) assert(state.text.includes(witness), `${label}: missing witness ${witness}`)
  return state
}

async function captureShot(name, expectedText = []) {
  await waitForCanvas()
  await inspectCanvas(name, expectedText)
  const raw = await page.screenshot()
  await sharp(raw).resize(WIDTH, HEIGHT, { kernel: sharp.kernel.lanczos3 }).png().toFile(resolve(outDir, name))
  console.log(`captured ${name}`)
}

async function closePanel(name, closeName) {
  const panel = page.getByRole('dialog', { name })
  if (await panel.count()) {
    await panel.getByRole('button', { name: closeName }).click()
    await panel.waitFor({ state: 'detached' })
  }
}

try {
  context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless: !headed,
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: DSF,
    reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  page = await context.newPage()
  page.setDefaultTimeout(12_000)
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${String(error)}`))
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`))

  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main[data-aurora-canvas]')
  const hasBookmarksPermission = await page.evaluate(() => chrome.permissions.contains({ permissions: ['bookmarks'] }))
  assert(hasBookmarksPermission, 'preview bookmarks permission is not held at runtime')

  await seedStoreShotHero(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await captureShot('1-hero.png', ['Ship Aurora 2.0', 'Atlanta', '·', 'AUR-200'])

  await seedStoreShotArrange(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  const layoutBeforeArrange = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))
  const longPressSurface = page.locator('[data-block-id="clock"] time')
  const longPressBox = await longPressSurface.boundingBox()
  assert(longPressBox, 'Clock time has no long-press geometry')
  await page.mouse.move(longPressBox.x + longPressBox.width / 2, longPressBox.y + longPressBox.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(650)
  const toolbar = page.getByRole('toolbar', { name: 'Arrange layout' })
  await toolbar.waitFor()
  await page.mouse.up()

  const clockTarget = page.getByRole('button', { name: 'Edit Clock' })
  await clockTarget.click()
  await page.getByRole('complementary', { name: 'Clock inspector' }).waitFor()
  const targetBox = await clockTarget.boundingBox()
  assert(targetBox, 'Clock Arrange target has no geometry')
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2 + 32, targetBox.y + targetBox.height / 2, { steps: 6 })
  assert(await page.locator('[data-canvas-guide]').count() > 0, 'Arrange drag did not paint a snap guide')
  await captureShot('2-arrange-mode.png', ['Desktop', 'SELECTED WIDGET', 'Clock'])
  await page.mouse.up()
  await toolbar.getByRole('button', { name: 'Cancel' }).click()
  await toolbar.waitFor({ state: 'detached' })
  const layoutAfterCancel = await page.evaluate(async () => JSON.stringify((await chrome.storage.local.get('layout')).layout))
  assert(layoutAfterCancel === layoutBeforeArrange, 'Arrange Cancel changed the stored layout')

  await seedStoreShotCalendar(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await captureShot('3-calendar-connectors.png', ['Studio', 'Family', 'Release planning', 'Canvas release candidate ready'])

  await seedStoreShotTools(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const notesLauncher = page.locator('[data-block-id="notes"]').getByRole('button', { name: 'Notes', exact: true })
  await notesLauncher.click()
  await page.getByRole('dialog', { name: 'Notes' }).waitFor()
  const noteText = await page.getByRole('textbox', { name: 'Scratchpad' }).inputValue()
  assert(noteText.includes('Photo-first Canvas'), 'direct-tools fixture note is missing')
  await captureShot('4-direct-tools.png', ['25:00', 'Tasks', 'Notes'])

  const notesPanel = page.getByRole('dialog', { name: 'Notes' })
  await page.keyboard.press('Escape')
  await notesPanel.waitFor({ state: 'detached' })
  const folder = page.locator('nav[aria-label="Bookmarks bar"] button[title="Aurora"]')
  await folder.click()
  await page.getByRole('dialog', { name: 'Aurora bookmarks' }).waitFor()
  await captureShot('5-bookmarks-popover.png', ['Roadmap', 'Release notes'])

  assert(runtimeErrors.length === 0, `runtime errors: ${JSON.stringify(runtimeErrors)}`)
  assert(failedRequests.length === 0, `failed requests: ${JSON.stringify(failedRequests)}`)
} catch (error) {
  if (page) await page.screenshot({ path: resolve(outDir, 'store-shots-failure.png') }).catch(() => {})
  throw error
} finally {
  await context?.close().catch(() => {})
  rmSync(profileDir, { recursive: true, force: true })
}

let dimensionsPass = true
for (const name of shotNames) {
  const { width, height } = await sharp(resolve(outDir, name)).metadata()
  const pass = width === WIDTH && height === HEIGHT
  if (!pass) dimensionsPass = false
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name} is ${width}x${height}`)
}
const pngs = readdirSync(outDir).filter((name) => name.endsWith('.png')).sort()
assert(JSON.stringify(pngs) === JSON.stringify([...shotNames].sort()), `unexpected Store screenshot set: ${JSON.stringify(pngs)}`)
assert(dimensionsPass, 'one or more Store screenshots has the wrong dimensions')
console.log('PASS: five current Store screenshots; zero console/page/request errors; temporary profile removed')
