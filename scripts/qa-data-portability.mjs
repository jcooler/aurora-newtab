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
import sharp from 'sharp'

import { assertExactBuildTrackedStatus } from './build-contracts.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const PREVIEW_MARKERS = Object.freeze(['TAB_TWO_PREVIEW_ACCOUNT_FIXTURE', 'preview_fixture'])
const PREVIEW_ACCOUNT_ID = '43000000-0000-4000-8000-000000000001'
const DEVICE_ID = 'AAECAwQFBgcICQoLDA0ODw'
const RECOVERY_ID = 'AQEBAQEBAQEBAQEBAQEBAQ'

export const DATA_PORTABILITY_STATES = Object.freeze([
  'desktop-idle',
  'desktop-verification',
  'desktop-preparing',
  'desktop-safe-failure',
  'touch-recovery',
])

export const DATA_PORTABILITY_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1600, height: 900, touch: false }),
  Object.freeze({ id: 'touch', width: 390, height: 844, touch: true }),
])

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two data portability QA requires --exact')
}

function artifactText(root) {
  const chunks = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (/\.(?:css|html|js|json)$/u.test(entry.name)) chunks.push(readFileSync(path, 'utf8'))
    }
  }
  visit(root)
  return chunks.join('\n')
}

export function assertArtifactIsolation(productionText, previewText) {
  for (const marker of PREVIEW_MARKERS) {
    assert(!productionText.includes(marker), `production artifact contains preview fixture marker: ${marker}`)
  }
  assert(previewText.includes('preview_fixture'), 'preview artifact is missing its runtime fixture marker')
}

export function inspectGeometry({ viewportWidth, documentWidth, bodyWidth, rects }) {
  return {
    horizontalOverflow: documentWidth > viewportWidth + 1 || bodyWidth > viewportWidth + 1,
    escaped: rects.filter((rect) => rect.left < -0.5 || rect.right > viewportWidth + 0.5).map((rect) => rect.id),
  }
}

function stringLeaves(value, result = []) {
  if (typeof value === 'string') result.push(value)
  else if (Array.isArray(value)) value.forEach((child) => stringLeaves(child, result))
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => stringLeaves(child, result))
  return result
}

function assertBuild(build, sourceSha, mode, previewFixture) {
  assert.equal(build?.sourceSha, sourceSha, `${mode} build provenance does not match source SHA`)
  assert.equal(build?.mode, mode, `${mode} build mode is incorrect`)
  assert.equal(build?.exact, true, `${mode} build is not exact`)
  assert.equal(build?.previewFixture, previewFixture, `${mode} fixture isolation is incorrect`)
}

export function assertEvidenceContract(evidence) {
  assert.equal(evidence.result, 'PASS', 'data portability evidence result is not PASS')
  assert.equal(evidence.exact, true, 'data portability evidence is not exact')
  assert.match(evidence.sourceSha ?? '', /^[0-9a-f]{6,40}$/u, 'data portability source SHA is missing')
  assert.equal(evidence.dataClassification, 'synthetic-only')
  assert.equal(evidence.ownerDataPresent, false, 'data portability evidence contains owner data')
  assertBuild(evidence.builds?.production, evidence.sourceSha, 'production', false)
  assertBuild(evidence.builds?.preview, evidence.sourceSha, 'preview', true)
  assert.equal(evidence.execution?.production, 'installed-extension')
  assert.equal(evidence.execution?.preview, 'installed-extension')

  for (const state of DATA_PORTABILITY_STATES) {
    const actual = evidence.states?.[state]
    assert(actual, `data portability state ${state} is missing`)
    assert.equal(actual.passed, true, `${state} failed`)
    const viewport = DATA_PORTABILITY_VIEWPORTS.find((entry) => entry.id === actual.viewportId)
    assert(viewport, `${state} has an unknown viewport`)
    assert.deepEqual(actual.pixelSize, { width: viewport.width, height: viewport.height }, `${state} is not original resolution`)
    assert.equal(actual.geometry?.horizontalOverflow, false, `${state} has horizontal overflow`)
    assert.deepEqual(actual.geometry?.escaped, [], `${state} has escaped controls`)
    assert.equal(typeof actual.screenshotPath, 'string')
  }
  for (const [name, passed] of Object.entries(evidence.interactions ?? {})) {
    assert.equal(passed, true, `data portability interaction failed: ${name}`)
  }
  for (const required of ['confirmationBeforeRequest', 'cancelFocusRestored', 'accountDownload', 'recoveryDownload', 'recoveryActionOrder']) {
    assert.equal(evidence.interactions?.[required], true, `data portability interaction is missing: ${required}`)
  }
  assert.deepEqual(evidence.idle, { requests: 0, storageWrites: 0, consoleErrors: 0, pageErrors: 0 })
  assert.equal(evidence.requests?.length, 1, 'data portability QA requires exactly one fixture-fulfilled account export request')
  assert.deepEqual(evidence.requests[0], { intent: 'account-export', disposition: 'fixture-fulfilled' })
  assert.deepEqual(evidence.wireRequests, [], 'data portability QA made a wire request')
  assert.deepEqual(evidence.storageWrites, [], `data portability QA emitted a storage write: ${JSON.stringify(evidence.storageWrites)}`)
  assert.match(evidence.downloads?.account?.filename ?? '', /^tab-two-account-data-\d{4}-\d{2}-\d{2}\.json$/u)
  assert.deepEqual(
    { app: evidence.downloads?.account?.app, kind: evidence.downloads?.account?.kind, version: evidence.downloads?.account?.version },
    { app: 'tab-two', kind: 'account-data', version: 1 },
  )
  assert.match(evidence.downloads?.recovery?.filename ?? '', /^tab-two-recovery-[a-z0-9_-]+-\d{4}-\d{2}-\d{2}T\d{6}Z\.json$/u)
  assert.deepEqual(
    { app: evidence.downloads?.recovery?.app, kind: evidence.downloads?.recovery?.kind, version: evidence.downloads?.recovery?.version },
    { app: 'tab-two', kind: 'sync-conflict-recovery', version: 1 },
  )
  assert.deepEqual(evidence.reducedMotion, { passed: true, animationName: 'none' })
  assert.deepEqual(evidence.consoleErrors, [], 'data portability QA emitted console errors')
  assert.deepEqual(evidence.pageErrors, [], 'data portability QA emitted page errors')
  assert.deepEqual(evidence.failedRequests, [], 'data portability QA emitted failed requests')

  const leaves = stringLeaves(evidence)
  assert(!leaves.some((value) => /jonathan\.r\.cooler@|\bJon(?:athan)? Cooler\b/iu.test(value)), 'data portability evidence contains owner data')
  assert(!leaves.some((value) => /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|sb_secret_|Bearer\s+[A-Za-z0-9._~-])/u.test(value)), 'data portability evidence contains a secret-looking value')
  return evidence
}

function readBuild(root, sourceSha, mode, previewFixture) {
  const provenance = JSON.parse(readFileSync(resolve(root, 'build-provenance.json'), 'utf8'))
  assert.equal(provenance.commit, sourceSha, `${mode} build provenance does not match source SHA`)
  return { sourceSha, mode, exact: true, previewFixture }
}

function buildAndCopy(mode, destination) {
  execFileSync(process.execPath, ['scripts/build.mjs', ...(mode === 'production' ? [] : [`--mode=${mode}`])], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  cpSync(resolve(repoRoot, 'dist'), destination, { recursive: true })
}

function attachLedgers(page, evidence, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push({ label, text: message.text() })
  })
  page.on('pageerror', (error) => evidence.pageErrors.push({ label, text: error.message }))
  page.on('requestfailed', (request) => {
    if (/^https?:/u.test(request.url())) evidence.failedRequests.push({ label, url: request.url(), failure: request.failure()?.errorText })
  })
}

async function launchInstalled(profile, dist, viewport, evidence, label) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: viewport.touch,
    isMobile: false,
    reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  await context.route(/^https?:\/\//u, async (route) => {
    evidence.wireRequests.push({ label, method: route.request().method(), url: route.request().url() })
    await route.abort('blockedbyclient')
  })
  const page = context.pages()[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  attachLedgers(page, evidence, label)
  if (viewport.touch) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  }
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  assert(page.url().startsWith('chrome-extension://'), `${label} is not an installed-extension page`)
  return { context, page }
}

async function navigateFixture(page, parameters) {
  const url = new URL(page.url())
  url.search = ''
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  await page.goto(url.href, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
}

async function openAccountSettings(page) {
  const drawer = page.locator('[data-settings-scroll-owner="document"]')
  if (await drawer.getAttribute('aria-hidden') === 'true') await page.locator('.settings-gear').click()
  await page.waitForFunction(() => document.querySelector('[data-settings-scroll-owner="document"]')?.getAttribute('aria-hidden') !== 'true')
  const tab = page.getByRole('tab', { name: 'Account & Sync' })
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click()
  await page.getByRole('tabpanel', { name: 'Account & Sync' }).waitFor()
}

async function armStorageWrites(page) {
  await page.evaluate(() => {
    window.__dataPortabilityWrites = []
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') window.__dataPortabilityWrites.push(Object.keys(changes).sort())
    })
  })
}

async function currentGeometry(page) {
  const raw = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const root = document.querySelector('[role="dialog"][aria-modal="true"]')
      ?? document.querySelector('[role="tabpanel"][aria-label="Account & Sync"]')
    const rects = root ? [root, ...root.querySelectorAll('button')].filter(visible).map((element, index) => {
      const rect = element.getBoundingClientRect()
      return {
        id: element.getAttribute('aria-label') || element.textContent?.trim() || `element-${index}`,
        left: rect.left,
        right: rect.right,
      }
    }) : []
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      rects,
    }
  })
  return inspectGeometry(raw)
}

async function capture(page, state, viewport, output, evidence) {
  const path = resolve(output, `${state}.png`)
  await page.screenshot({ path })
  const metadata = await sharp(path).metadata()
  evidence.states[state] = {
    passed: true,
    screenshotPath: relative(repoRoot, path).replaceAll('\\', '/'),
    viewportId: viewport.id,
    pixelSize: { width: metadata.width, height: metadata.height },
    geometry: await currentGeometry(page),
  }
}

async function readDownload(download) {
  const path = await download.path()
  assert(path, 'browser download path is unavailable')
  return JSON.parse(readFileSync(path, 'utf8'))
}

async function exercisePreviewDesktop(page, viewport, output, evidence) {
  await navigateFixture(page, { accountState: 'active', accountExportState: 'preparing' })
  await openAccountSettings(page)
  await page.getByRole('region', { name: 'Your data' }).waitFor()
  await armStorageWrites(page)

  const idleCounts = {
    requests: evidence.wireRequests.length,
    storageWrites: (await page.evaluate(() => window.__dataPortabilityWrites?.length ?? 0)),
    consoleErrors: evidence.consoleErrors.length,
    pageErrors: evidence.pageErrors.length,
  }
  evidence.idle = idleCounts
  await capture(page, 'desktop-idle', viewport, output, evidence)

  const invoker = page.getByRole('button', { name: 'Download account data' })
  await invoker.click()
  await page.getByRole('dialog', { name: 'Download your account data?' }).waitFor()
  assert.equal(evidence.requests.length, 0, 'opening confirmation requested account data')
  evidence.interactions.confirmationBeforeRequest = true
  await capture(page, 'desktop-verification', viewport, output, evidence)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Download account data')
  evidence.interactions.cancelFocusRestored = true

  await invoker.click()
  const accountDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Verify with Google & download' }).click()
  const preparing = page.getByRole('button', { name: 'Preparing download...' })
  await preparing.waitFor()
  const animationName = await preparing.locator('.account-sync-status__spinner').evaluate((element) => getComputedStyle(element).animationName)
  evidence.reducedMotion = { passed: animationName === 'none', animationName }
  await capture(page, 'desktop-preparing', viewport, output, evidence)
  const downloadedAccount = await accountDownload
  const accountJson = await readDownload(downloadedAccount)
  evidence.requests.push({ intent: 'account-export', disposition: 'fixture-fulfilled' })
  evidence.downloads.account = {
    filename: downloadedAccount.suggestedFilename(),
    app: accountJson.app,
    kind: accountJson.kind,
    version: accountJson.version,
  }
  evidence.interactions.accountDownload = accountJson.account?.accountId === PREVIEW_ACCOUNT_ID

  await navigateFixture(page, { accountState: 'active', accountExportState: 'failure' })
  await openAccountSettings(page)
  await page.getByRole('button', { name: 'Download account data' }).click()
  await page.getByRole('button', { name: 'Verify with Google & download' }).click()
  await page.getByRole('button', { name: 'Try again' }).waitFor()
  await page.getByRole('alert').filter({ hasText: 'Nothing was changed' }).waitFor()
  await capture(page, 'desktop-safe-failure', viewport, output, evidence)
}

async function exercisePreviewTouch(page, viewport, output, evidence) {
  await navigateFixture(page, { accountState: 'recovery' })
  await page.evaluate(({ accountId, deviceId, recoveryId }) => chrome.storage.local.set({
    'tab-two:sync-device:v1': {
      version: 1, accountId, deviceId, friendlyName: 'Desktop', enabled: true, registration: 'active',
    },
    'tab-two:sync-conflict-backups:v1': {
      version: 1,
      accountId,
      items: [{
        id: recoveryId,
        entity: {
          schemaVersion: 1,
          entityType: 'notes',
          entityId: 'singleton',
          value: { text: 'Synthetic recovery note', updatedAt: 1_778_000_000_000 },
        },
        observedRemoteRevision: 2,
        createdAt: 1_778_000_001_000,
        reason: 'stale_remote_winner',
      }],
    },
  }), { accountId: PREVIEW_ACCOUNT_ID, deviceId: DEVICE_ID, recoveryId: RECOVERY_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  await openAccountSettings(page)
  const recoveries = page.getByRole('region', { name: 'Recovery copies' })
  await recoveries.waitFor()
  const labels = await recoveries.getByRole('button').allTextContents()
  evidence.interactions.recoveryActionOrder = JSON.stringify(labels) === JSON.stringify(['Restore', 'Download copy', 'Discard'])
  await capture(page, 'touch-recovery', viewport, output, evidence)
  await armStorageWrites(page)
  const recoveryDownload = page.waitForEvent('download')
  await recoveries.getByRole('button', { name: 'Download copy' }).click()
  const downloadedRecovery = await recoveryDownload
  const recoveryJson = await readDownload(downloadedRecovery)
  evidence.downloads.recovery = {
    filename: downloadedRecovery.suggestedFilename(),
    app: recoveryJson.app,
    kind: recoveryJson.kind,
    version: recoveryJson.version,
  }
  const remaining = await page.evaluate(() => chrome.storage.local.get('tab-two:sync-conflict-backups:v1'))
  evidence.interactions.recoveryDownload = recoveryJson.recovery?.id === RECOVERY_ID
    && remaining['tab-two:sync-conflict-backups:v1']?.items?.length === 1
  evidence.storageWrites.push(...await page.evaluate(() => window.__dataPortabilityWrites ?? []))
}

async function run() {
  requireExact(process.argv.slice(2))
  assertExactBuildTrackedStatus(execFileSync('git', ['status', '--short', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }))
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const temporary = mkdtempSync(resolve(tmpdir(), 'tab-two-data-portability-'))
  const productionDist = resolve(temporary, 'production')
  const previewDist = resolve(temporary, 'preview')
  const output = resolve(repoRoot, 'artifacts', 'qa-data-portability', sourceSha)
  mkdirSync(output, { recursive: true })

  const evidence = {
    result: 'PENDING', sourceSha, exact: true, dataClassification: 'synthetic-only', ownerDataPresent: false,
    builds: {}, execution: {}, states: {}, interactions: {}, idle: null,
    requests: [], wireRequests: [], storageWrites: [], downloads: {}, reducedMotion: null,
    consoleErrors: [], pageErrors: [], failedRequests: [],
  }
  const contexts = []
  try {
    buildAndCopy('production', productionDist)
    buildAndCopy('preview', previewDist)
    assertArtifactIsolation(artifactText(productionDist), artifactText(previewDist))
    evidence.builds.production = readBuild(productionDist, sourceSha, 'production', false)
    evidence.builds.preview = readBuild(previewDist, sourceSha, 'preview', true)

    const desktop = DATA_PORTABILITY_VIEWPORTS[0]
    const production = await launchInstalled(resolve(temporary, 'profile-production'), productionDist, desktop, evidence, 'production')
    contexts.push(production.context)
    await openAccountSettings(production.page)
    assert.equal(await production.page.getByRole('region', { name: 'Your data' }).count(), 0, 'production account export activated before hosted gate')
    evidence.execution.production = 'installed-extension'
    await production.context.close()
    contexts.pop()

    const preview = await launchInstalled(resolve(temporary, 'profile-preview-desktop'), previewDist, desktop, evidence, 'preview-desktop')
    contexts.push(preview.context)
    evidence.execution.preview = 'installed-extension'
    await exercisePreviewDesktop(preview.page, desktop, output, evidence)
    await preview.context.close()
    contexts.pop()

    const touch = DATA_PORTABILITY_VIEWPORTS[1]
    const recovery = await launchInstalled(resolve(temporary, 'profile-preview-touch'), previewDist, touch, evidence, 'preview-touch')
    contexts.push(recovery.context)
    await exercisePreviewTouch(recovery.page, touch, output, evidence)
    await recovery.context.close()
    contexts.pop()

    evidence.result = 'PASS'
    assertEvidenceContract(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({ result: evidence.result, sourceSha, output: relative(repoRoot, output).replaceAll('\\', '/') }, null, 2)}\n`)
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()))
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await run()
}
