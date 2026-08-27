import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const repoRoot = process.cwd()
const dist = resolve('.preview-information-first-p3-dist')
const profileDir = resolve('.playwright-profile-information-first-p3')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/aurora-v1-canvas-implementation-session-prompt/outputs/information-first-pr-p3'
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-information-first-p3-dist'],
  [profileDir, '.playwright-profile-information-first-p3'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe temporary path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const build = spawnSync(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'),
  'build',
  '--mode',
  'preview',
  '--outDir',
  dist,
  '--emptyOutDir',
], { cwd: repoRoot, encoding: 'utf8' })
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`focused Vite build failed with status ${build.status}`)
}

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]
const evidence = {
  packet: 'PR-P3',
  viewports: [],
  runtimeErrors: [],
  failedRequests: [],
  cleanup: {},
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1024, height: 768 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(12_000)
page.on('console', (message) => {
  if (message.type() === 'error') evidence.runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  if (!request.url().startsWith('chrome-extension://')) {
    evidence.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
  }
})

const waitForCanvas = async () => {
  await page.waitForSelector('main[data-aurora-canvas]')
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(80)
}

const seed = () => page.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings')
  await chrome.storage.local.set({
    settings: {
      ...settings,
      name: 'Jon',
      widgets: {
        ...settings.widgets,
        habits: true,
        clocks: true,
        countdown: true,
        weather: true,
      },
    },
    location: { lat: 33.749, lon: -84.388, label: 'Atlanta', manual: true },
    worldClocks: [
      { zone: 'America/New_York', label: 'New York' },
      { zone: 'Europe/London', label: 'London' },
    ],
    countdowns: [{ id: 'launch', name: 'Launch', date: '2026-09-01' }],
    habits: [{ id: 'read', name: 'Read', createdAt: Date.now(), log: [] }],
    photoPrefs: { mode: 'auto', index: 7, lastRotated: '2026-08-17' },
  })
})

const readWorkspace = (settings) => settings.evaluate((dialog) => {
  const rectOf = (node) => {
    const rect = node.getBoundingClientRect()
    return {
      left: Number(rect.left.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
    }
  }
  const tablist = dialog.querySelector('[role="tablist"]')
  const panel = dialog.querySelector('[role="tabpanel"]')
  if (!(tablist instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
    throw new Error('Settings navigation workspace is incomplete')
  }
  const nestedScrollOwners = [...dialog.querySelectorAll('*')]
    .filter((node) => {
      const style = getComputedStyle(node)
      return (style.overflowY === 'auto' || style.overflowY === 'scroll')
        && node.scrollHeight > node.clientHeight + 1
    })
    .map((node) => ({ tag: node.tagName, className: node.className, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }))
  const horizontallyOutOfBounds = [...dialog.querySelectorAll('button, input, select, textarea, [role="tab"]')]
    .filter((node) => {
      const rect = node.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -0.5 || rect.right > window.innerWidth + 0.5)
    })
    .map((node) => ({ name: node.getAttribute('aria-label') ?? node.textContent?.trim(), rect: rectOf(node) }))
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    dialog: rectOf(dialog),
    tablist: rectOf(tablist),
    panel: rectOf(panel),
    orientation: tablist.getAttribute('aria-orientation'),
    documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    dialogHorizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
    scrollOwner: dialog.getAttribute('data-settings-scroll-owner'),
    drawerScrollable: dialog.scrollHeight > dialog.clientHeight + 1,
    nestedScrollOwners,
    horizontallyOutOfBounds,
  }
})

const readClosed = () => page.locator('[role="dialog"][aria-label="Settings"]').evaluate((dialog) => {
  const rect = dialog.getBoundingClientRect()
  const style = getComputedStyle(dialog)
  const hit = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))
  return {
    visibility: style.visibility,
    pointerEvents: style.pointerEvents,
    inert: dialog.hasAttribute('inert'),
    ariaHidden: dialog.getAttribute('aria-hidden'),
    left: Number(rect.left.toFixed(2)),
    rightEdgeHitsDrawer: !!hit && dialog.contains(hit),
  }
})

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await seed()

  for (const viewport of viewports) {
    const label = `${viewport.width}x${viewport.height}`
    await page.setViewportSize(viewport)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCanvas()

    const opener = page.getByRole('button', { name: 'Open settings' })
    await opener.click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.waitFor()

    const generalTab = settings.getByRole('tab', { name: 'General' })
    await generalTab.focus()
    await generalTab.press(viewport.width >= 900 ? 'ArrowDown' : 'ArrowRight')
    await settings.getByRole('tab', { name: 'Widgets' }).waitFor()
    assert(await settings.getByRole('tab', { name: 'Widgets' }).getAttribute('aria-selected') === 'true', `${label}: keyboard navigation did not activate Widgets`)

    for (const tab of ['Connectors', 'Data', 'General', 'Widgets']) {
      await settings.getByRole('tab', { name: tab }).click()
      assert(await settings.getByRole('tab', { name: tab }).getAttribute('aria-selected') === 'true', `${label}: ${tab} tab did not activate`)
      const overflow = await settings.evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth + 1)
      assert(!overflow, `${label}: ${tab} introduced horizontal Settings overflow`)
    }

    const disclosureEvidence = []
    for (const name of ['Weather location', 'World clocks', 'Countdowns', 'Habits']) {
      const button = settings.getByRole('button', { name, exact: true })
      assert(await button.getAttribute('aria-expanded') === 'false', `${label}: ${name} did not start closed`)
      await button.focus()
      await button.press('Enter')
      const region = settings.getByRole('region', { name, exact: true })
      await region.waitFor()
      disclosureEvidence.push({
        name,
        controls: await region.locator('button, input, select, textarea').count(),
        regionId: await region.getAttribute('id'),
        controlsId: await button.getAttribute('aria-controls'),
        keyboardActivated: true,
      })
      assert(disclosureEvidence.at(-1).controlsId === disclosureEvidence.at(-1).regionId, `${label}: ${name} controls the wrong region`)
      await button.click()
      assert(await button.getAttribute('aria-expanded') === 'false', `${label}: ${name} did not close`)
    }

    await settings.evaluate((dialog) => { dialog.scrollTop = 0 })
    const workspace = await readWorkspace(settings)
    assert(!workspace.documentHorizontalOverflow, `${label}: document horizontal overflow`)
    assert(!workspace.dialogHorizontalOverflow, `${label}: dialog horizontal overflow`)
    assert(workspace.scrollOwner === 'document', `${label}: Settings lacks its one document scroll owner`)
    assert(workspace.nestedScrollOwners.length === 0, `${label}: nested scroll owner ${JSON.stringify(workspace.nestedScrollOwners)}`)
    assert(workspace.horizontallyOutOfBounds.length === 0, `${label}: controls leave viewport ${JSON.stringify(workspace.horizontallyOutOfBounds)}`)
    assert(workspace.panel.width <= 608.5, `${label}: content measure exceeds 38rem: ${workspace.panel.width}`)
    if (viewport.width >= 900) {
      assert(workspace.dialog.width <= 864.5, `${label}: roomy width exceeds 54rem: ${workspace.dialog.width}`)
      assert(Math.abs(workspace.dialog.right - (viewport.width - 16)) <= 1, `${label}: roomy right inset is not 1rem`)
      assert(Math.abs(workspace.dialog.top - 16) <= 1 && Math.abs(workspace.dialog.bottom - (viewport.height - 16)) <= 1, `${label}: roomy vertical inset is not 1rem`)
      assert(Math.abs(workspace.tablist.width - 144) <= 1, `${label}: roomy rail is not 9rem: ${workspace.tablist.width}`)
      assert(workspace.orientation === 'vertical', `${label}: roomy tabs are not vertical`)
    } else {
      assert(Math.abs(workspace.dialog.width - viewport.width) <= 1 && Math.abs(workspace.dialog.height - viewport.height) <= 1, `${label}: narrow Settings is not full viewport`)
      assert(workspace.orientation === 'horizontal', `${label}: narrow tabs are not horizontal`)
    }

    const scrollExercise = workspace.drawerScrollable
      ? await settings.evaluate((dialog) => {
          const before = dialog.scrollTop
          dialog.scrollTop = Math.min(240, dialog.scrollHeight - dialog.clientHeight)
          const after = dialog.scrollTop
          dialog.scrollTop = 0
          return { before, after }
        })
      : { before: 0, after: 0 }
    if (workspace.drawerScrollable) {
      assert(scrollExercise.after > scrollExercise.before, `${label}: overflowing Settings did not scroll locally`)
    }
    const capture = resolve(outDir, `${label}-widgets.png`)
    await page.screenshot({ path: capture })

    await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="Settings"]')?.getAttribute('aria-hidden') === 'true')
    const closed = await readClosed()
    assert(closed.visibility === 'hidden' && closed.pointerEvents === 'none' && closed.inert && closed.ariaHidden === 'true', `${label}: closed Settings is exposed ${JSON.stringify(closed)}`)
    assert(!closed.rightEdgeHitsDrawer && closed.left >= viewport.width - 0.5, `${label}: closed Settings remains visible ${JSON.stringify(closed)}`)
    assert(await opener.evaluate((node) => document.activeElement === node), `${label}: Settings did not restore focus to its opener`)

    evidence.viewports.push({ ...workspace, scrollExercise, disclosures: disclosureEvidence, closed, capture })
  }

  assert(evidence.runtimeErrors.length === 0, `runtime errors: ${JSON.stringify(evidence.runtimeErrors)}`)
  assert(evidence.failedRequests.length === 0, `failed requests: ${JSON.stringify(evidence.failedRequests)}`)
} catch (error) {
  caughtError = error
  evidence.error = String(error?.stack ?? error)
} finally {
  await context.close()
  try {
    rmSync(dist, { recursive: true, force: true })
    rmSync(profileDir, { recursive: true, force: true })
    evidence.cleanup = { distRemoved: true, profileRemoved: true }
  } catch (error) {
    evidence.cleanup = { error: String(error) }
  }
  writeFileSync(resolve(outDir, 'pr-p3-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
}

if (caughtError) throw caughtError
console.log(`PR-P3 Settings probe PASS (${evidence.viewports.length} viewports)`)
