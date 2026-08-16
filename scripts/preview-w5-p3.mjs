// Focused W5-P3 built-extension replay for the responsive Settings workspace.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w5-p3')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w5-p3'
const headed = process.argv.includes('--headed')

if (!profileDir.endsWith('.playwright-profile-w5-p3')) throw new Error(`unsafe profile path: ${profileDir}`)
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
page.setDefaultTimeout(10_000)
const runtimeErrors = []
page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`) })
page.on('pageerror', (error) => runtimeErrors.push(`page: ${String(error)}`))

const evidence = { roomy: {}, narrow: {}, cleanup: {} }
const waitForStage = async () => {
  await page.waitForSelector('main[data-adaptive-stage]')
  await page.waitForTimeout(100)
}

try {
  await page.goto('chrome://newtab/')
  await waitForStage()
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      connectors: {
        github: { enabled: true, token: 'browser-secret-must-not-render', username: 'octocat' },
        gitlab: { enabled: true, token: '', username: 'restored-user', instanceUrl: 'https://gitlab.com' },
        homeassistant: { enabled: true },
      },
    })
  })
  await page.reload()
  await waitForStage()

  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor()
  await page.waitForTimeout(350)
  runtimeErrors.length = 0
  const roomyRect = await settings.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, right: rect.right }
  })
  const tablist = settings.getByRole('tablist', { name: 'Settings sections' })
  evidence.roomy.geometry = roomyRect
  evidence.roomy.orientation = await tablist.getAttribute('aria-orientation')
  assert(roomyRect.left > 0 && roomyRect.top > 0 && roomyRect.width >= 900 && roomyRect.right < 1600, 'roomy Settings geometry failed')
  assert(evidence.roomy.orientation === 'vertical', 'roomy Settings navigation was not vertical')

  await settings.getByRole('tab', { name: 'General' }).focus()
  await tablist.press('ArrowDown')
  assert(await settings.getByRole('tab', { name: 'Widgets' }).getAttribute('aria-selected') === 'true', 'vertical keyboard navigation failed')
  await tablist.press('ArrowDown')
  assert(await settings.getByRole('tab', { name: 'Connectors' }).getAttribute('aria-selected') === 'true', 'Connectors tab activation failed')

  const githubCard = settings.getByLabel('Enable GitHub').locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
  const gitlabCard = settings.getByLabel('Enable GitLab').locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
  const haCard = settings.getByLabel('Enable Home Assistant').locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]')
  await githubCard.getByText('Connected as octocat').waitFor()
  await gitlabCard.getByText('Reconnect needed').waitFor()
  await haCard.getByText('Setup needed').waitFor()
  assert((await settings.textContent()).includes('browser-secret-must-not-render') === false, 'stored secret rendered in Settings')
  assert(await githubCard.getByLabel('Fine-grained personal access token').count() === 0, 'connected credentials were visible before edit')
  assert(await haCard.getByLabel('Long-lived access token').count() === 0, 'setup credentials were visible before disclosure')

  await githubCard.getByRole('button', { name: 'Edit connection' }).click()
  const editToken = githubCard.getByLabel('Fine-grained personal access token')
  await editToken.waitFor()
  assert(await editToken.inputValue() === '', 'credential edit field was not blank')
  await githubCard.getByRole('button', { name: 'Cancel' }).click()
  assert(await githubCard.getByLabel('Fine-grained personal access token').count() === 0, 'credential edit did not collapse')
  assert(await gitlabCard.getByLabel('Personal access token').count() === 1, 'reconnect credentials were not immediately available')

  await haCard.getByRole('button', { name: 'Set up connection' }).click()
  await haCard.getByLabel('Long-lived access token').waitFor()
  evidence.roomy.states = ['Connected as octocat', 'Reconnect needed', 'Setup needed']
  evidence.roomy.secretAbsent = !(await settings.textContent()).includes('browser-secret-must-not-render')
  await page.screenshot({ path: `${outDir}/w5-p3-roomy-settings-1600x900.png` })
  await settings.getByRole('button', { name: 'Close settings' }).click()

  await page.setViewportSize({ width: 800, height: 600 })
  await page.reload()
  await waitForStage()
  await page.getByRole('button', { name: 'Open settings' }).click()
  await settings.waitFor()
  await page.waitForTimeout(350)
  const narrowRect = await settings.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  })
  evidence.narrow.geometry = narrowRect
  evidence.narrow.orientation = await tablist.getAttribute('aria-orientation')
  assert(Math.abs(narrowRect.left) < 1 && Math.abs(narrowRect.top) < 1 && Math.abs(narrowRect.width - 800) < 1 && Math.abs(narrowRect.height - 600) < 1, 'narrow Settings was not full-screen')
  assert(evidence.narrow.orientation === 'horizontal', 'narrow Settings navigation was not horizontal')
  await settings.getByRole('tab', { name: 'General' }).focus()
  await tablist.press('ArrowRight')
  assert(await settings.getByRole('tab', { name: 'Widgets' }).getAttribute('aria-selected') === 'true', 'horizontal keyboard navigation failed')
  evidence.narrow.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  assert(!evidence.narrow.horizontalOverflow, 'narrow Settings caused horizontal page overflow')
  await page.screenshot({ path: `${outDir}/w5-p3-narrow-settings-800x600.png` })
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: `${outDir}/w5-p3-failure.png` }).catch(() => {})
} finally {
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
  evidence.cleanup.profileRemoved = true
}

console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, runtimeErrors })}`)
if (evidence.error || !evidence.cleanup.pageClosed || !evidence.cleanup.profileRemoved) {
  console.error(`FAIL: W5-P3 Settings workspace: ${evidence.error ?? 'cleanup failure'}`)
  process.exitCode = 1
} else {
  console.log('PASS: W5-P3 Settings workspace')
}
