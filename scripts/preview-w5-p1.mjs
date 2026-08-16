// Focused W5-P1 built-extension replay for the responsive Utility Tray shell.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w5-p1')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w5-p1'
const headed = process.argv.includes('--headed')

if (!profileDir.endsWith('.playwright-profile-w5-p1')) throw new Error(`unsafe profile path: ${profileDir}`)
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
const runtimeErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => runtimeErrors.push(`page: ${String(error)}`))

const traySnapshot = () => page.locator('[data-utility-tray]').evaluate((tray) => {
  const rect = tray.getBoundingClientRect()
  const dashboard = document.querySelector('main[data-adaptive-stage] > .contents')
  return {
    mode: tray.getAttribute('data-utility-tray-mode'),
    ariaModal: tray.getAttribute('aria-modal'),
    dashboardInert: dashboard?.hasAttribute('inert') ?? false,
    backdrop: document.querySelectorAll('[data-utility-tray-backdrop]').length,
    activeName: document.activeElement?.getAttribute('aria-label'),
    contained: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
    noPageClip: document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1,
  }
})

const evidence = { standard: {}, compact: {}, cleanup: {} }
try {
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')

  const open = page.getByRole('button', { name: 'Open utility tray' })
  await open.click()
  await page.locator('[data-utility-tray]').waitFor()
  evidence.standard.open = await traySnapshot()
  assert(evidence.standard.open.mode === 'modeless', 'Standard Tray was not modeless')
  assert(evidence.standard.open.ariaModal === null, 'Standard Tray exposed aria-modal')
  assert(!evidence.standard.open.dashboardInert && evidence.standard.open.backdrop === 0, 'Standard Tray blocked the dashboard')
  assert(evidence.standard.open.activeName === 'Close utility tray', 'Standard Tray did not receive initial focus')
  assert(evidence.standard.open.contained && evidence.standard.open.noPageClip, 'Standard Tray escaped the viewport')
  await page.screenshot({ path: `${outDir}/w5-p1-standard-modeless-1600x900.png` })

  await page.keyboard.press('Tab')
  evidence.standard.focusLeftTray = await page.evaluate(() => !document.querySelector('[data-utility-tray]')?.contains(document.activeElement))
  assert(evidence.standard.focusLeftTray, 'Standard Tray trapped focus')
  await page.getByRole('region', { name: 'Work Pulse' }).click({ position: { x: 4, y: 4 } })
  await page.locator('[data-utility-tray]').waitFor({ state: 'detached' })
  evidence.standard.outsideCloseRestored = await open.evaluate((button) => document.activeElement === button)
  assert(evidence.standard.outsideCloseRestored, 'Standard outside close did not restore the invoker')

  await page.setViewportSize({ width: 800, height: 600 })
  await page.reload()
  await page.waitForSelector('main[data-adaptive-stage]')
  const compactOpen = page.getByRole('button', { name: 'Open utility tray' })
  await compactOpen.click()
  await page.locator('[data-utility-tray]').waitFor()
  evidence.compact.open = await traySnapshot()
  assert(evidence.compact.open.mode === 'modal' && evidence.compact.open.ariaModal === 'true', 'Compact Tray was not modal')
  assert(evidence.compact.open.dashboardInert && evidence.compact.open.backdrop === 1, 'Compact Tray did not isolate the dashboard')
  assert(evidence.compact.open.activeName === 'Close utility tray', 'Compact Tray did not receive initial focus')
  assert(evidence.compact.open.contained && evidence.compact.open.noPageClip, 'Compact Tray escaped the viewport')
  await page.screenshot({ path: `${outDir}/w5-p1-compact-modal-800x600.png` })

  await page.keyboard.press('Tab')
  evidence.compact.focusTrapped = await page.locator('[data-utility-tray]').evaluate((tray) => tray.contains(document.activeElement))
  assert(evidence.compact.focusTrapped, 'Compact Tray did not trap focus')
  await page.keyboard.press('Escape')
  await page.locator('[data-utility-tray]').waitFor({ state: 'detached' })
  evidence.compact.escapeRestored = await compactOpen.evaluate((button) => document.activeElement === button)
  evidence.compact.dashboardReleased = await page.locator('main[data-adaptive-stage] > .contents').evaluate((node) => !node.hasAttribute('inert'))
  assert(evidence.compact.escapeRestored && evidence.compact.dashboardReleased, 'Compact Escape did not restore focus and dashboard access')

  await compactOpen.click()
  await page.locator('[data-utility-tray-backdrop]').click({ position: { x: 2, y: 2 } })
  await page.locator('[data-utility-tray]').waitFor({ state: 'detached' })
  evidence.compact.backdropRestored = await compactOpen.evaluate((button) => document.activeElement === button)
  assert(evidence.compact.backdropRestored, 'Compact backdrop close did not restore the invoker')
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/w5-p1-failure.png` }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
}

console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, runtimeErrors })}`)
if (evidence.error || !evidence.cleanup.pageClosed || !evidence.cleanup.profileRemoved) {
  console.error(`FAIL: W5-P1 responsive Utility Tray shell: ${evidence.error ?? 'cleanup failure'}`)
  process.exitCode = 1
} else {
  console.log('PASS: W5-P1 responsive Utility Tray shell')
}
