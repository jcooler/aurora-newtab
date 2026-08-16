// Focused W5-P4 built-extension replay for visual roles, targets, and reduced motion.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w5-p4')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w5-p4'
const headed = process.argv.includes('--headed')

if (!profileDir.endsWith('.playwright-profile-w5-p4')) throw new Error(`unsafe profile path: ${profileDir}`)
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(10_000)
await page.emulateMedia({ reducedMotion: 'reduce' })
const runtimeErrors = []
page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`) })
page.on('pageerror', (error) => runtimeErrors.push(`page: ${String(error)}`))

const evidence = { photos: [], surfaces: {}, targets: {}, motion: {}, cleanup: {} }
const representativePhotos = [
  { index: 18, name: 'bright' },
  { index: 22, name: 'dark' },
  { index: 10, name: 'detailed' },
]

function channel(value) {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function parseRgb(value) {
  const numbers = value.match(/[\d.]+/g)?.map(Number) ?? []
  if (numbers.length < 3) throw new Error(`unparseable color: ${value}`)
  return { rgb: numbers.slice(0, 3), alpha: numbers[3] ?? 1 }
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

async function waitForStage() {
  await page.waitForSelector('main[data-adaptive-stage]')
  await page.waitForSelector('img[data-photo].opacity-100')
  await page.getByLabel(/main focus today/i).waitFor()
}

async function showPhoto({ index, name }) {
  await page.evaluate(async ({ index }) => {
    await chrome.storage.local.set({
      focus: null,
      photoPrefs: { mode: 'auto', index, lastRotated: '2026-08-16' },
    })
  }, { index })
  await page.reload()
  await waitForStage()
  const prompt = page.locator('[data-focus-prompt]')
  const styles = await prompt.evaluate((node) => {
    const computed = getComputedStyle(node)
    return { color: computed.color, backgroundColor: computed.backgroundColor }
  })
  const foreground = parseRgb(styles.color)
  const background = parseRgb(styles.backgroundColor)
  const ratio = contrast(foreground.rgb, background.rgb)
  assert(background.alpha === 1, `${name} prompt surface is not photo-independent: ${styles.backgroundColor}`)
  assert(ratio >= 7, `${name} prompt contrast ${ratio.toFixed(2)} is below 7:1`)
  const path = `${outDir}/w5-p4-focus-${name}-1600x900.png`
  await page.screenshot({ path })
  evidence.photos.push({ name, index, ratio: Number(ratio.toFixed(2)), ...styles, path })
}

try {
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')
  for (const photo of representativePhotos) await showPhoto(photo)

  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor()
  const settingsBackground = parseRgb(await settings.evaluate((node) => getComputedStyle(node).backgroundColor))
  assert(settingsBackground.alpha >= 0.9, `Settings is not an active-work surface: alpha ${settingsBackground.alpha}`)
  evidence.surfaces.settingsAlpha = settingsBackground.alpha

  const tab = settings.getByRole('tab', { name: 'General' })
  const toggle = settings.getByRole('switch', { name: '24-hour clock' })
  const swatch = settings.locator('label[for="set-panel-color"] > span')
  const tabBox = await tab.boundingBox()
  const toggleBox = await toggle.boundingBox()
  assert(tabBox && tabBox.height >= 36, `Settings tab target is ${tabBox?.height ?? 0}px`)
  assert(toggleBox && toggleBox.height >= 36 && toggleBox.width >= 36, `Switch target is ${toggleBox?.width ?? 0}x${toggleBox?.height ?? 0}`)
  evidence.targets.generalTab = tabBox
  evidence.targets.switch = toggleBox
  evidence.motion.colorSwatch = await swatch.evaluate((node) => {
    const computed = getComputedStyle(node)
    return { property: computed.transitionProperty, duration: computed.transitionDuration }
  })
  assert(evidence.motion.colorSwatch.property === 'none', `color swatch still animates under reduced motion: ${JSON.stringify(evidence.motion.colorSwatch)}`)

  await settings.getByRole('button', { name: 'Close settings' }).click()

  await page.getByRole('button', { name: 'Open utility tray' }).click()
  const tray = page.getByRole('dialog', { name: 'Utility Tray' })
  const trayBackground = parseRgb(await tray.evaluate((node) => getComputedStyle(node).backgroundColor))
  assert(trayBackground.alpha >= 0.9, `Utility Tray is not an active-work surface: alpha ${trayBackground.alpha}`)
  evidence.surfaces.trayAlpha = trayBackground.alpha
  evidence.motion.tray = await tray.evaluate((node) => getComputedStyle(node).transitionDuration)

  const typeEvidence = await page.evaluate(() => {
    const metadata = Array.from(document.querySelectorAll('[data-stage-text-tier="metadata"]'))
      .find((node) => node instanceof HTMLElement && node.offsetParent !== null)
    const ordinary = Array.from(document.querySelectorAll('.board-item p, .board-item a, .board-item button'))
      .find((node) => node instanceof HTMLElement && node.offsetParent !== null && !node.closest('[data-stage-text-tier="metadata"]'))
    return {
      metadata: metadata ? getComputedStyle(metadata).fontSize : null,
      ordinary: ordinary ? getComputedStyle(ordinary).fontSize : null,
      stageGap: getComputedStyle(document.querySelector('.adaptive-stage__grid')).gap,
      tokenGap: getComputedStyle(document.documentElement).getPropertyValue('--stage-gap').trim(),
    }
  })
  assert(typeEvidence.metadata === null || Number.parseFloat(typeEvidence.metadata) >= 12, `metadata type floor failed: ${typeEvidence.metadata}`)
  assert(typeEvidence.ordinary === null || Number.parseFloat(typeEvidence.ordinary) >= 14, `ordinary type floor failed: ${typeEvidence.ordinary}`)
  assert(typeEvidence.stageGap === typeEvidence.tokenGap, `Stage spacing drifted: ${typeEvidence.stageGap} vs ${typeEvidence.tokenGap}`)
  evidence.typography = typeEvidence
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/w5-p4-failure.png` }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
}

console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, runtimeErrors })}`)
if (evidence.error || !evidence.cleanup.pageClosed || !evidence.cleanup.profileRemoved) {
  console.error(`FAIL: W5-P4 visual and motion convergence: ${evidence.error ?? 'cleanup failure'}`)
  process.exitCode = 1
} else {
  console.log('PASS: W5-P4 visual and motion convergence')
}
