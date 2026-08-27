// Focused W5-P2 built-extension replay for working-tool integration.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w5-p2')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w5-p2'
const headed = process.argv.includes('--headed')

if (!profileDir.endsWith('.playwright-profile-w5-p2')) throw new Error(`unsafe profile path: ${profileDir}`)
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
page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`) })
page.on('pageerror', (error) => runtimeErrors.push(`page: ${String(error)}`))

const evidence = { standard: {}, compact: {}, cleanup: {} }
try {
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    await chrome.storage.local.set({
      settings: { ...settings, widgets: { ...settings.widgets, timer: true } },
    })
  })
  await page.getByRole('button', { name: /Focus timer:/ }).waitFor()

  const persistentInvoker = page.getByRole('button', { name: 'Open utility tray' })
  await persistentInvoker.click()
  const tray = page.locator('[data-utility-tray]')
  await tray.waitFor()
  evidence.standard.tools = await tray.getByRole('navigation', { name: 'Working tools' }).getByRole('button').allTextContents()
  assert(['Tasks', 'Notes', 'Timer', 'Refresh'].every((label) => evidence.standard.tools.includes(label)), 'expected working tools were not available')
  await tray.getByRole('region', { name: 'Tasks' }).waitFor()
  assert(await tray.getByRole('region', { name: 'Tasks' }).count() === 1, 'Tasks were not the sole initial detail')

  const taskInput = tray.getByRole('textbox', { name: 'Add a task' })
  await taskInput.fill('Ship W5-P2')
  await taskInput.press('Enter')
  await tray.getByText('Ship W5-P2').waitFor()
  assert(await tray.getByText('Ship W5-P2').count() === 1, 'Task operation did not update the current owner')

  await tray.getByRole('button', { name: 'Notes', exact: true }).click()
  const notes = tray.getByRole('textbox', { name: 'Scratchpad' })
  await notes.fill('Tray note survives switching')
  await tray.getByRole('button', { name: 'Timer', exact: true }).click()
  await tray.getByRole('region', { name: 'Focus timer' }).waitFor()
  assert(await tray.getByRole('region', { name: 'Tasks' }).count() === 0 && await tray.getByRole('region', { name: 'Notes' }).count() === 0, 'more than one detail tool was expanded')
  await page.waitForFunction(async (expected) => (await chrome.storage.local.get('notes')).notes?.text === expected, 'Tray note survives switching')
  const storedNote = await page.evaluate(async () => (await chrome.storage.local.get('notes')).notes?.text)
  assert(storedNote === 'Tray note survives switching', 'Notes switch did not flush the current draft')

  await tray.getByRole('button', { name: 'Start' }).click()
  const timerPill = page.getByRole('button', { name: /Focus timer: .* running/ })
  await timerPill.waitFor()
  await tray.getByRole('button', { name: 'Close utility tray' }).click()
  await tray.waitFor({ state: 'detached' })
  evidence.standard.runningRepresented = await timerPill.isVisible()
  evidence.standard.persistentRestored = await persistentInvoker.evaluate((button) => document.activeElement === button)
  assert(evidence.standard.runningRepresented && evidence.standard.persistentRestored, 'running timer or persistent focus restoration failed')

  await timerPill.click()
  await tray.getByRole('region', { name: 'Focus timer' }).waitFor()
  await tray.getByRole('button', { name: 'Refresh', exact: true }).click()
  const beforePhoto = await page.locator('img[data-photo]').getAttribute('data-photo')
  await tray.getByRole('button', { name: 'New background photo' }).click()
  await page.waitForFunction((before) => document.querySelector('img[data-photo]')?.getAttribute('data-photo') !== before, beforePhoto)
  const afterPhoto = await page.locator('img[data-photo]').getAttribute('data-photo')
  assert(afterPhoto !== beforePhoto, 'background refresh did not reuse the current rotation owner')
  await page.screenshot({ path: `${outDir}/w5-p2-standard-working-tools-1600x900.png` })
  await tray.getByRole('button', { name: 'Close utility tray' }).click()
  await tray.waitFor({ state: 'detached' })
  evidence.standard.timerRestored = await timerPill.evaluate((button) => document.activeElement === button)
  assert(evidence.standard.timerRestored, 'tool invoker focus was not restored')

  await page.setViewportSize({ width: 800, height: 600 })
  await page.reload()
  await page.waitForSelector('main[data-adaptive-stage]')
  const compactInvoker = page.getByRole('button', { name: 'Open utility tray' })
  await compactInvoker.click()
  await tray.waitFor()
  await tray.getByRole('region', { name: 'Tasks' }).waitFor()
  evidence.compact.mode = await tray.getAttribute('data-utility-tray-mode')
  evidence.compact.inert = await page.locator('main[data-adaptive-stage] > .contents').evaluate((node) => node.hasAttribute('inert'))
  evidence.compact.oneContent = await tray.locator('[data-utility-tray-content] > [role="region"], [data-utility-tray-content] > section').count()
  assert(evidence.compact.mode === 'modal' && evidence.compact.inert && evidence.compact.oneContent === 1, 'Compact single-tool modal contract failed')
  await page.screenshot({ path: `${outDir}/w5-p2-compact-working-tools-800x600.png` })
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/w5-p2-failure.png` }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
}

console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, runtimeErrors })}`)
if (evidence.error || !evidence.cleanup.pageClosed || !evidence.cleanup.profileRemoved) {
  console.error(`FAIL: W5-P2 working-tool integration: ${evidence.error ?? 'cleanup failure'}`)
  process.exitCode = 1
} else {
  console.log('PASS: W5-P2 working-tool integration')
}
