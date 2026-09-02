import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

import { assertExactBuildTrackedStatus } from './build-contracts.mjs'

const FIXTURE_MARKERS = Object.freeze(['TAB_TWO_PREVIEW_ACCOUNT_FIXTURE', 'preview_fixture'])

export const ACCOUNT_SYNC_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1600, height: 900, touch: false }),
  Object.freeze({ id: 'touch', width: 390, height: 844, touch: true }),
])

export const ACCOUNT_SYNC_INTERACTIONS = Object.freeze([
  'production-local',
  'six-tab-keyboard',
  'preview-signed-in',
  'preview-active',
  'preview-past-due',
  'preview-device-limit',
  'preview-syncing',
  'preview-offline',
  'preview-needs-attention',
  'device-name-validation',
  'vault-deletion-confirmation',
  'account-deletion-confirmation',
])

export const ACCOUNT_SYNC_SCREENSHOTS = Object.freeze([
  'production-local-desktop',
  'preview-signed-in-desktop',
  'preview-active-desktop',
  'preview-past-due-desktop',
  'preview-device-limit-desktop',
  'preview-syncing-desktop',
  'preview-offline-desktop',
  'preview-needs-attention-desktop',
  'preview-vault-delete-desktop',
  'preview-account-delete-desktop',
  'preview-device-name-touch',
  'preview-active-touch',
])

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two Account & Sync QA requires --exact')
}

export function assertArtifactIsolation(productionText, previewText) {
  for (const marker of FIXTURE_MARKERS) {
    assert(!productionText.includes(marker), `production artifact contains preview fixture marker: ${marker}`)
  }
  assert(previewText.includes('preview_fixture'), 'preview artifact is missing its deterministic grant marker')
}

function assertBuild(build, commit, mode, fixtureMarkerPresent) {
  assert(build && typeof build === 'object', `${mode} build provenance is missing`)
  assert.equal(build.commit, commit, `${mode} build provenance does not match HEAD`)
  assert.equal(build.mode, mode, `${mode} build mode is not recorded`)
  assert.equal(build.fixtureMarkerPresent, fixtureMarkerPresent, `${mode} fixture isolation result is incorrect`)
}

export function assertEvidenceContract(evidence) {
  assert.equal(typeof evidence.commit, 'string', 'Account & Sync evidence commit is missing')
  assert.equal(evidence.result, 'PASS', 'Account & Sync evidence result is not PASS')
  assertBuild(evidence.builds?.production, evidence.commit, 'production', false)
  assertBuild(evidence.builds?.preview, evidence.commit, 'preview', true)
  assert.equal(evidence.execution?.production, 'installed-extension', 'production did not run as an installed extension')
  assert.equal(evidence.execution?.preview, 'installed-extension', 'preview did not run as an installed extension')
  for (const interaction of ACCOUNT_SYNC_INTERACTIONS) {
    assert.equal(evidence.interactions?.[interaction], true, `Account & Sync interaction ${interaction} is missing or failed`)
  }
  assert.deepEqual(evidence.storageWrites, [], `Account & Sync emitted a storage write: ${JSON.stringify(evidence.storageWrites)}`)
  assert.deepEqual(evidence.requests, [], `Account & Sync made an unexpected request: ${JSON.stringify(evidence.requests)}`)
  assert.deepEqual(evidence.consoleErrors, [], 'Account & Sync emitted a browser console error')
  assert.deepEqual(evidence.pageErrors, [], 'Account & Sync emitted an uncaught page error')
  assert.deepEqual(evidence.failedRequests, [], 'Account & Sync emitted a failed request')
  assert(Array.isArray(evidence.screenshots), 'Account & Sync screenshots are missing')
  for (const id of ACCOUNT_SYNC_SCREENSHOTS) {
    const capture = evidence.screenshots.find((item) => item.id === id)
    assert(capture, `Account & Sync screenshot is missing: ${id}`)
    assert.equal(typeof capture.path, 'string', `Account & Sync screenshot path is missing: ${id}`)
    assert(
      typeof capture.judgment === 'string' && capture.judgment.startsWith('PASS:'),
      `unjudged screenshot: ${id}`,
    )
    assert.equal(capture.pixelSize?.width, capture.viewport?.width, `${id} width is not original resolution`)
    assert.equal(capture.pixelSize?.height, capture.viewport?.height, `${id} height is not original resolution`)
    assert.equal(capture.geometry?.horizontalOverflow, false, `${id} has horizontal overflow`)
    assert.deepEqual(capture.geometry?.viewportEscapes, [], `${id} has a viewport escape`)
    assert.deepEqual(capture.geometry?.overlapPairs, [], `${id} has overlapping controls`)
    assert.equal(capture.geometry?.scrollOwners, 1, `${id} does not have exactly one Settings scroll owner`)
  }
  return evidence
}

function artifactText(root) {
  const chunks = []
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        visit(path)
      } else if (/\.(?:js|json|html|css)$/.test(entry.name)) {
        chunks.push(readFileSync(path, 'utf8'))
      }
    }
  }
  visit(root)
  return chunks.join('\n')
}

function readProvenance(dist, commit, mode, fixtureMarkerPresent) {
  const provenance = JSON.parse(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'))
  assert.equal(provenance.commit, commit, `${mode} dist provenance does not match HEAD`)
  return { ...provenance, mode, fixtureMarkerPresent }
}

function attachRuntimeLedgers(page, evidence, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push({ page: label, text: message.text() })
  })
  page.on('pageerror', (error) => evidence.pageErrors.push({ page: label, text: error.message }))
  page.on('requestfailed', (request) => {
    if (/^https?:/.test(request.url())) {
      evidence.failedRequests.push({ page: label, method: request.method(), url: request.url() })
    }
  })
}

async function launchInstalled(profile, dist, viewport, evidence, label) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: viewport.touch,
    isMobile: false,
    reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  await context.route(/^https?:\/\//, async (route) => {
    evidence.requests.push({ page: label, method: route.request().method(), url: route.request().url() })
    await route.abort('blockedbyclient')
  })
  const page = context.pages()[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  attachRuntimeLedgers(page, evidence, label)
  if (viewport.touch) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  }
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  assert(page.url().startsWith('chrome-extension://'), `${label} is not an installed-extension page: ${page.url()}`)
  return { context, page }
}

async function openAccountSettings(page) {
  const drawer = page.locator('[data-settings-scroll-owner="document"]')
  if (await drawer.getAttribute('aria-hidden') === 'true') await page.locator('.settings-gear').click()
  await page.waitForFunction(() => document.querySelector('[data-settings-scroll-owner="document"]')?.getAttribute('aria-hidden') !== 'true')
  const accountTab = page.getByRole('tab', { name: 'Account & Sync' })
  if (await accountTab.getAttribute('aria-selected') !== 'true') await accountTab.click()
  await page.getByRole('tabpanel', { name: 'Account & Sync' }).waitFor()
  return drawer
}

async function loadPreviewState(page, state) {
  const url = new URL(page.url())
  url.searchParams.set('accountState', state)
  await page.goto(url.href, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  await openAccountSettings(page)
}

async function clearAndArmStorageLog(page) {
  await page.evaluate(() => {
    window.__accountSyncWrites = []
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') window.__accountSyncWrites.push(Object.keys(changes).sort())
    })
  })
}

async function harvestStorageWrites(page, evidence) {
  evidence.storageWrites.push(...await page.evaluate(() => window.__accountSyncWrites ?? []))
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < innerWidth
        && rect.top < innerHeight
    }
    const activeDialog = document.querySelector(
      '[role="dialog"][aria-modal="true"]:not([data-settings-scroll-owner="document"])',
    )
    const controlRoot = activeDialog ?? document.querySelector('[data-settings-scroll-owner="document"]')
    const candidates = controlRoot
      ? [...controlRoot.querySelectorAll('button, input')].filter(visible)
      : []
    const controls = candidates.map((element, index) => {
      const rect = element.getBoundingClientRect()
      return {
        id: element.getAttribute('aria-label') || element.textContent?.trim() || element.id || `control-${index}`,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    })
    const overlapPairs = []
    for (let left = 0; left < controls.length; left += 1) {
      for (let right = left + 1; right < controls.length; right += 1) {
        const a = controls[left]
        const b = controls[right]
        if (a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1) {
          overlapPairs.push([a.id, b.id])
        }
      }
    }
    return {
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        || document.body.scrollWidth > document.documentElement.clientWidth + 1,
      viewportEscapes: controls
        .filter((item) => item.left < -0.5
          || item.right > innerWidth + 0.5
          || (activeDialog && (item.top < -0.5 || item.bottom > innerHeight + 0.5)))
        .map((item) => item.id),
      overlapPairs,
      scrollOwners: [...document.querySelectorAll('[data-settings-scroll-owner="document"]')].filter(visible).length,
    }
  })
}

function readJudgments(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

async function capture(page, viewport, id, output, judgments, evidence, repoRoot) {
  const path = resolve(output, `${id}.png`)
  await page.screenshot({ path })
  evidence.screenshots.push({
    id,
    viewport,
    pixelSize: { width: viewport.width, height: viewport.height },
    path: relative(repoRoot, path).replaceAll('\\', '/'),
    judgment: judgments[id] ?? '_pending_',
    geometry: await geometry(page),
  })
}

async function exerciseProduction(page, viewport, output, judgments, evidence, repoRoot) {
  const drawer = page.locator('[data-settings-scroll-owner="document"]')
  await page.locator('.settings-gear').click()
  await page.waitForFunction(() => document.querySelector('[data-settings-scroll-owner="document"]')?.getAttribute('aria-hidden') !== 'true')
  const tabs = page.getByRole('tab')
  assert.deepEqual(await tabs.allTextContents(), ['General', 'Progress', 'Widgets', 'Connectors', 'Data', 'Account & Sync'])

  const visited = ['General']
  await page.getByRole('tab', { name: 'General' }).focus()
  for (const expected of ['Progress', 'Widgets', 'Connectors', 'Data', 'Account & Sync']) {
    await page.keyboard.press('ArrowDown')
    await page.waitForFunction((label) => (
      [...document.querySelectorAll('[role="tab"]')]
        .some((tab) => tab.textContent === label && tab.getAttribute('aria-selected') === 'true' && document.activeElement === tab)
    ), expected)
    visited.push(expected)
  }
  assert.deepEqual(visited, ['General', 'Progress', 'Widgets', 'Connectors', 'Data', 'Account & Sync'])
  evidence.interactions['six-tab-keyboard'] = true

  await page.getByRole('heading', { name: 'Local mode' }).waitFor()
  await clearAndArmStorageLog(page)
  await page.getByRole('region', { name: 'Encrypted when sync is on' }).waitFor()
  await page.getByRole('region', { name: 'Always stays on this device' }).waitFor()
  await page.getByRole('button', { name: 'Choose monthly' }).click()
  await page.getByRole('alert').filter({ hasText: 'Sign in with Google to continue' }).waitFor()
  assert.notEqual(await drawer.getAttribute('aria-hidden'), 'true')
  evidence.interactions['production-local'] = true
  await harvestStorageWrites(page, evidence)
  await capture(page, viewport, 'production-local-desktop', output, judgments, evidence, repoRoot)
}

async function exercisePreviewDesktop(page, viewport, output, judgments, evidence, repoRoot) {
  const states = [
    ['signed-in', 'No subscription'],
    ['active', 'Active subscription'],
    ['past-due', 'Payment needs attention'],
    ['device-limit', 'Five installations are already syncing'],
    ['syncing', 'syncing'],
    ['offline', 'offline'],
    ['needs-attention', 'needs attention'],
  ]

  for (const [state, expected] of states) {
    await loadPreviewState(page, state)
    await page.getByText(expected, { exact: state !== 'device-limit' }).first().waitFor()
    if (state === 'device-limit') {
      assert.equal(await page.getByRole('switch', { name: 'Enable sync' }).getAttribute('aria-disabled'), 'true')
      const devices = page.getByRole('region', { name: 'Devices' })
      assert.equal(await devices.getByRole('button', { name: /^Remove / }).count(), 4)
      const remove = devices.getByRole('button', { name: 'Remove Travel Chromebook' })
      await remove.click()
      const dialog = page.getByRole('dialog', { name: 'Remove Travel Chromebook?' })
      await dialog.getByRole('button', { name: 'Verify with Google' }).click()
      await dialog.getByRole('button', { name: 'Remove device' }).click()
      await dialog.waitFor({ state: 'detached' })
      assert(await remove.evaluate((element) => document.activeElement === element), 'device removal did not restore invoker focus')
    }
    evidence.interactions[`preview-${state}`] = true
    await capture(page, viewport, `preview-${state}-desktop`, output, judgments, evidence, repoRoot)
  }

  await loadPreviewState(page, 'active')
  await clearAndArmStorageLog(page)
  const vaultInvoker = page.getByRole('button', { name: 'Delete synced data' })
  await vaultInvoker.click()
  const vaultDialog = page.getByRole('dialog', { name: 'Delete synced data?' })
  await vaultDialog.getByRole('button', { name: 'Verify with Google' }).click()
  await vaultDialog.getByLabel('Type DELETE to confirm').fill('DELETE')
  await capture(page, viewport, 'preview-vault-delete-desktop', output, judgments, evidence, repoRoot)
  await vaultDialog.getByRole('button', { name: 'Delete synced data' }).click()
  await vaultDialog.waitFor({ state: 'detached' })
  assert(await vaultInvoker.evaluate((element) => document.activeElement === element), 'vault delete did not restore invoker focus')
  evidence.interactions['vault-deletion-confirmation'] = true

  const accountInvoker = page.getByRole('button', { name: 'Delete account' })
  await accountInvoker.click()
  const accountDialog = page.getByRole('dialog', { name: 'Delete your Tab Two account?' })
  await accountDialog.getByRole('button', { name: 'Verify with Google' }).click()
  await accountDialog.getByLabel('Type DELETE to confirm').fill('DELETE')
  await capture(page, viewport, 'preview-account-delete-desktop', output, judgments, evidence, repoRoot)
  await accountDialog.getByRole('button', { name: 'Delete account' }).click()
  await accountDialog.waitFor({ state: 'detached' })
  assert(await accountInvoker.evaluate((element) => document.activeElement === element), 'account delete did not restore invoker focus')
  evidence.interactions['account-deletion-confirmation'] = true
  await harvestStorageWrites(page, evidence)
}

async function exercisePreviewTouch(page, context, viewport, output, judgments, evidence, repoRoot) {
  await loadPreviewState(page, 'active')
  const syncSwitch = page.getByRole('switch', { name: 'Enable sync' })
  await syncSwitch.scrollIntoViewIfNeeded()
  const box = await syncSwitch.boundingBox()
  assert(box, 'touch Account sync control has no bounding box')
  await page.evaluate(() => {
    window.__accountTouchObserved = false
    window.addEventListener('touchstart', () => { window.__accountTouchObserved = true }, { once: true })
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
      radiusX: 1,
      radiusY: 1,
      force: 1,
      id: 1,
    }],
  })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  assert(await page.evaluate(() => window.__accountTouchObserved === true), 'touchstart did not reach the Account sync control')
  await syncSwitch.click()
  const nameDialog = page.getByRole('dialog', { name: 'Name this installation' })
  const nameInput = nameDialog.getByLabel('Device name')
  await nameInput.fill('')
  assert(await nameDialog.getByRole('button', { name: 'Enable encrypted sync' }).isDisabled(), 'blank device name was accepted')
  await nameInput.fill('Travel laptop')
  await capture(page, viewport, 'preview-device-name-touch', output, judgments, evidence, repoRoot)
  await page.keyboard.press('Escape')
  await nameDialog.waitFor({ state: 'detached' })
  assert(await syncSwitch.evaluate((element) => document.activeElement === element), 'device-name dialog did not restore switch focus')
  evidence.interactions['device-name-validation'] = true
  await capture(page, viewport, 'preview-active-touch', output, judgments, evidence, repoRoot)
}

export async function runAccountSyncShellQa(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  assertExactBuildTrackedStatus(execFileSync(
    'git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' },
  ))
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const dist = resolve(repoRoot, 'dist')
  const previewText = artifactText(dist)
  const previewMarkerPresent = previewText.includes('preview_fixture')
  const previewBuild = readProvenance(dist, commit, 'preview', previewMarkerPresent)
  assert(previewMarkerPresent, 'dist is not the required preview build')

  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'tab-two-account-sync-'))
  const previewDist = resolve(temporaryRoot, 'preview-dist')
  cpSync(dist, previewDist, { recursive: true })

  const output = resolve(repoRoot, 'artifacts/qa-account-sync-shell', commit)
  mkdirSync(output, { recursive: true })
  const judgments = readJudgments(resolve(output, 'judgments.json'))
  const evidence = {
    commit,
    result: 'FAIL',
    builds: { production: null, preview: previewBuild },
    execution: { production: 'installed-extension', preview: 'installed-extension' },
    interactions: Object.fromEntries(ACCOUNT_SYNC_INTERACTIONS.map((name) => [name, false])),
    storageWrites: [],
    requests: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    screenshots: [],
  }

  execFileSync(process.execPath, [resolve(repoRoot, 'scripts/build.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  const productionText = artifactText(dist)
  const productionMarkerPresent = FIXTURE_MARKERS.some((marker) => productionText.includes(marker))
  assertArtifactIsolation(productionText, previewText)
  evidence.builds.production = readProvenance(dist, commit, 'production', productionMarkerPresent)

  const profiles = [
    mkdtempSync(resolve(tmpdir(), 'tab-two-account-production-')),
    mkdtempSync(resolve(tmpdir(), 'tab-two-account-preview-')),
    mkdtempSync(resolve(tmpdir(), 'tab-two-account-touch-')),
  ]
  let productionContext
  let previewContext
  let touchContext

  try {
    const production = await launchInstalled(profiles[0], dist, ACCOUNT_SYNC_VIEWPORTS[0], evidence, 'production-desktop')
    productionContext = production.context
    await exerciseProduction(production.page, ACCOUNT_SYNC_VIEWPORTS[0], output, judgments, evidence, repoRoot)

    const preview = await launchInstalled(profiles[1], previewDist, ACCOUNT_SYNC_VIEWPORTS[0], evidence, 'preview-desktop')
    previewContext = preview.context
    await exercisePreviewDesktop(preview.page, ACCOUNT_SYNC_VIEWPORTS[0], output, judgments, evidence, repoRoot)

    const touch = await launchInstalled(profiles[2], previewDist, ACCOUNT_SYNC_VIEWPORTS[1], evidence, 'preview-touch')
    touchContext = touch.context
    await exercisePreviewTouch(touch.page, touch.context, ACCOUNT_SYNC_VIEWPORTS[1], output, judgments, evidence, repoRoot)

    evidence.result = 'PASS'
    assertEvidenceContract(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`PASS: Tab Two Account & Sync shell QA (${commit})`)
    return evidence
  } catch (error) {
    evidence.result = 'FAIL'
    evidence.failure = String(error?.stack ?? error)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    throw error
  } finally {
    await touchContext?.close()
    await previewContext?.close()
    await productionContext?.close()
    for (const profile of profiles) {
      assert(profile.startsWith(tmpdir()), `unsafe Account & Sync QA profile path: ${profile}`)
      rmSync(profile, { recursive: true, force: true })
    }
    assert(temporaryRoot.startsWith(tmpdir()), `unsafe Account & Sync temporary path: ${temporaryRoot}`)
    if (statSync(temporaryRoot).isDirectory()) rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runAccountSyncShellQa()
}
