import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

import { assertExactBuildTrackedStatus } from './build-contracts.mjs'

const FIXTURE_MARKERS = Object.freeze(['TAB_TWO_PREVIEW_ACCOUNT_FIXTURE', 'preview_fixture'])
const DISCLOSURES = Object.freeze([
  'Sign-in and billing',
  'Encrypted sync',
  'Google Calendar',
  'Microsoft Calendar',
  'Backup and deletion',
])
const PRIVATE_MARKERS = Object.freeze([
  '@',
  'private-',
  'accessToken',
  'refreshToken',
  'deviceId',
  'accountId',
  'leaseId',
  'friendlyName',
  'Desktop',
  'http://',
  'https://',
])

export const SUPPORT_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1600, height: 900, deviceScaleFactor: 1, touch: false }),
  Object.freeze({ id: 'short', width: 1408, height: 600, deviceScaleFactor: 1, touch: false }),
  Object.freeze({ id: 'ultrawide', width: 3440, height: 1440, deviceScaleFactor: 1, touch: false }),
  Object.freeze({ id: 'high-density', width: 2560, height: 1440, deviceScaleFactor: 2, touch: false }),
  Object.freeze({ id: 'touch-narrow', width: 390, height: 844, deviceScaleFactor: 1, touch: true }),
])

export const SUPPORT_INTERACTIONS = Object.freeze([
  'seven-tab-keyboard',
  'all-disclosures',
  'diagnostic-review',
  'diagnostic-cancel',
  'diagnostic-download',
  'focus-restoration',
  'reduced-motion',
  'tab-overflow-containment',
  'single-scroll-owner',
])

export const SUPPORT_SCREENSHOTS = Object.freeze([
  'desktop-closed',
  'desktop-recovery-open',
  'desktop-report-review',
  'short-contained',
  'ultrawide-contained',
  'high-density-contained',
  'touch-narrow-contained',
])

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two paid MVP support QA requires --exact')
}

export function assertSupportEvidence(evidence) {
  assert.equal(typeof evidence.commit, 'string', 'support evidence commit is missing')
  assert.equal(evidence.result, 'PASS', 'support evidence result is not PASS')
  assert.equal(evidence.build?.commit, evidence.commit, 'support build provenance does not match HEAD')
  assert.equal(evidence.build?.mode, 'production', 'support witness is not a production build')
  assert.equal(evidence.build?.fixtureMarkerPresent, false, 'support production artifact contains preview fixtures')
  assert.equal(evidence.execution, 'installed-extension', 'support witness did not run as an installed extension')

  for (const interaction of SUPPORT_INTERACTIONS) {
    assert.equal(evidence.interactions?.[interaction], true, `support interaction is missing or failed: ${interaction}`)
  }
  for (const { id } of SUPPORT_VIEWPORTS) {
    assert.equal(evidence.viewports?.find((entry) => entry.id === id)?.result, 'PASS', `support viewport failed: ${id}`)
  }

  assert.deepEqual(evidence.requestLedger, [], `support made a request: ${JSON.stringify(evidence.requestLedger)}`)
  assert.deepEqual(evidence.storageWrites, [], `support emitted a storage write: ${JSON.stringify(evidence.storageWrites)}`)
  assert.deepEqual(evidence.consoleErrors, [], 'support emitted a browser console error')
  assert.deepEqual(evidence.pageErrors, [], 'support emitted an uncaught page error')
  assert.deepEqual(evidence.failedRequests, [], 'support emitted a failed request')
  assert.equal(evidence.diagnostic?.exactKeys, true, 'diagnostic report key set is not exact')
  assert.equal(evidence.diagnostic?.excludedFixtureMarkers, true, 'diagnostic report contains a private marker')
  assert.equal(evidence.diagnostic?.reviewedBeforeDownload, true, 'diagnostic report was not reviewed before download')
  assert.equal(evidence.diagnostic?.downloadedLocally, true, 'diagnostic report was not downloaded locally')

  assert(Array.isArray(evidence.screenshots), 'support screenshots are missing')
  for (const id of SUPPORT_SCREENSHOTS) {
    const capture = evidence.screenshots.find((entry) => entry.id === id)
    assert(capture, `support screenshot is missing: ${id}`)
    assert.equal(typeof capture.path, 'string', `support screenshot path is missing: ${id}`)
    assert(
      typeof capture.judgment === 'string' && capture.judgment.startsWith('PASS:'),
      `unjudged support screenshot: ${id}`,
    )
    assert.equal(
      capture.pixelSize?.width,
      capture.viewport.width * capture.viewport.deviceScaleFactor,
      `${id} width is not original resolution`,
    )
    assert.equal(
      capture.pixelSize?.height,
      capture.viewport.height * capture.viewport.deviceScaleFactor,
      `${id} height is not original resolution`,
    )
    assert.equal(capture.geometry?.horizontalOverflow, false, `${id} has horizontal overflow`)
    assert.equal(capture.geometry?.tabOverflowContained, true, `${id} tab overflow escapes its owner`)
    assert.deepEqual(capture.geometry?.viewportEscapes, [], `${id} has a viewport escape`)
    assert.deepEqual(capture.geometry?.overlapPairs, [], `${id} has overlapping controls`)
    assert.equal(capture.geometry?.scrollOwners, 1, `${id} does not have one Settings scroll owner`)
  }
  return evidence
}

function artifactText(root) {
  const chunks = []
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (/\.(?:js|json|html|css)$/u.test(entry.name)) chunks.push(readFileSync(path, 'utf8'))
    }
  }
  visit(root)
  return chunks.join('\n')
}

function readJudgments(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

function attachLedgers(page, evidence, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push({ page: label, text: message.text() })
  })
  page.on('pageerror', (error) => evidence.pageErrors.push({ page: label, text: error.message }))
  page.on('requestfailed', (request) => {
    if (/^https?:/u.test(request.url())) {
      evidence.failedRequests.push({ page: label, method: request.method(), url: request.url() })
    }
  })
}

async function launchInstalled(profile, dist, viewport, evidence) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    hasTouch: viewport.touch,
    isMobile: false,
    reducedMotion: 'reduce',
    acceptDownloads: false,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  await context.route(/^https?:\/\//u, async (route) => {
    evidence.requestLedger.push({
      page: viewport.id,
      method: route.request().method(),
      url: route.request().url(),
    })
    await route.abort('blockedbyclient')
  })
  const page = context.pages()[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  attachLedgers(page, evidence, viewport.id)
  if (viewport.touch) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  }
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  assert(page.url().startsWith('chrome-extension://'), `${viewport.id} did not run as an installed extension`)
  return { context, page }
}

async function openHelp(page) {
  const drawer = page.locator('[data-settings-scroll-owner="document"]')
  if (await drawer.getAttribute('aria-hidden') === 'true') await page.locator('.settings-gear').click()
  await page.waitForFunction(() => document.querySelector('[data-settings-scroll-owner="document"]')?.getAttribute('aria-hidden') !== 'true')
  const help = page.getByRole('tab', { name: 'Help' })
  if (await help.getAttribute('aria-selected') !== 'true') await help.click()
  await page.getByRole('tabpanel', { name: 'Help' }).waitFor()
  await page.getByRole('heading', { name: 'Keep Tab Two working' }).waitFor()
  return drawer
}

async function armStorageLedger(page) {
  await page.evaluate(() => {
    window.__supportStorageWrites = []
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') window.__supportStorageWrites.push(Object.keys(changes).sort())
    })
  })
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
    const root = activeDialog ?? document.querySelector('[data-settings-scroll-owner="document"]')
    const candidates = root ? [...root.querySelectorAll('button, input, a[href], [role="textbox"]')].filter(visible) : []
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
    const tablist = document.querySelector('[role="tablist"][aria-label="Settings sections"]')
    const drawer = document.querySelector('[data-settings-scroll-owner="document"]')
    const tabRect = tablist?.getBoundingClientRect()
    const drawerRect = drawer?.getBoundingClientRect()
    const horizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      || document.body.scrollWidth > document.documentElement.clientWidth + 1
    return {
      horizontalOverflow,
      tabOverflowContained: Boolean(tabRect && drawerRect
        && tabRect.left >= drawerRect.left - 0.5
        && tabRect.right <= drawerRect.right + 0.5
        && !horizontalOverflow),
      viewportEscapes: controls
        .filter((item) => item.left < -0.5
          || item.right > innerWidth + 0.5
          || (activeDialog && (item.top < -0.5 || item.bottom > innerHeight + 0.5)))
        .map((item) => item.id),
      overlapPairs,
      scrollOwners: [...document.querySelectorAll('[data-settings-scroll-owner="document"]')].filter(visible).length,
      tabScrollWidth: tablist?.scrollWidth ?? null,
      tabClientWidth: tablist?.clientWidth ?? null,
      drawerOverflowY: drawer ? getComputedStyle(drawer).overflowY : null,
    }
  })
}

async function capture(page, viewport, id, output, judgments, evidence, repoRoot) {
  const path = resolve(output, `${id}.png`)
  await page.screenshot({ path })
  const metadata = await sharp(path).metadata()
  evidence.screenshots.push({
    id,
    viewport,
    pixelSize: { width: metadata.width, height: metadata.height },
    path: relative(repoRoot, path).replaceAll('\\', '/'),
    judgment: judgments[id] ?? '_pending_',
    geometry: await geometry(page),
  })
}

function assertDiagnosticShape(report) {
  assert.deepEqual(Object.keys(report).sort(), [
    'account', 'appVersion', 'generatedAt', 'product', 'schemaVersion', 'sync',
  ])
  assert.deepEqual(Object.keys(report.account).sort(), [
    'billingState', 'leasePresent', 'mode', 'plan',
  ])
  assert.deepEqual(Object.keys(report.sync).sort(), [
    'activeDeviceCount',
    'attention',
    'enabled',
    'lastSuccessAt',
    'phase',
    'quotaBytes',
    'recoveryCount',
    'revokedDeviceCount',
    'usedBytes',
  ])
  const text = JSON.stringify(report)
  for (const marker of PRIVATE_MARKERS) {
    assert(!text.includes(marker), `diagnostic report contains excluded marker: ${marker}`)
  }
}

async function exerciseDesktop(page, viewport, output, judgments, evidence, repoRoot) {
  const drawer = await openHelp(page)
  await armStorageLedger(page)
  const tabs = page.getByRole('tab')
  assert.deepEqual(await tabs.allTextContents(), [
    'General', 'Progress', 'Widgets', 'Connectors', 'Data', 'Account & Sync', 'Help',
  ])
  await page.getByRole('tab', { name: 'General' }).click()
  await page.getByRole('tab', { name: 'General' }).focus()
  for (const expected of ['Progress', 'Widgets', 'Connectors', 'Data', 'Account & Sync', 'Help']) {
    await page.keyboard.press('ArrowDown')
    await page.waitForFunction((label) => (
      [...document.querySelectorAll('[role="tab"]')]
        .some((tab) => tab.textContent === label
          && tab.getAttribute('aria-selected') === 'true'
          && document.activeElement === tab)
    ), expected)
  }
  evidence.interactions['seven-tab-keyboard'] = true
  await page.getByText('Local mode', { exact: true }).waitFor()
  await page.getByText('No subscription', { exact: true }).waitFor()
  await page.getByText('Sync is off', { exact: true }).waitFor()

  const initialGeometry = await geometry(page)
  assert.equal(initialGeometry.horizontalOverflow, false)
  assert.equal(initialGeometry.tabOverflowContained, true)
  assert.equal(initialGeometry.scrollOwners, 1)
  assert(['auto', 'scroll'].includes(initialGeometry.drawerOverflowY), 'Settings drawer is not the vertical scroll owner')
  evidence.interactions['single-scroll-owner'] = true
  evidence.interactions['tab-overflow-containment'] = true
  assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'reduced motion was not active')
  evidence.interactions['reduced-motion'] = true

  await capture(page, viewport, 'desktop-closed', output, judgments, evidence, repoRoot)

  for (const title of DISCLOSURES) {
    const button = page.getByRole('button', { name: title })
    await button.click()
    assert.equal(await button.getAttribute('aria-expanded'), 'true', `${title} did not open`)
  }
  for (const copy of [
    'Account & Sync updates your subscription automatically',
    'Sync now starts a fresh protected update',
    'Reconnect only the account that needs attention',
    'personal and work or school accounts stay separate',
    'Data creates a local backup',
  ]) {
    await page.getByText(new RegExp(copy, 'i')).waitFor()
  }
  evidence.interactions['all-disclosures'] = true
  await page.getByRole('button', { name: 'Microsoft Calendar' }).scrollIntoViewIfNeeded()
  await capture(page, viewport, 'desktop-recovery-open', output, judgments, evidence, repoRoot)

  await page.evaluate(() => {
    window.__supportDownloads = []
    const nativeCreateObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = nativeCreateObjectURL(blob)
      void blob.text().then((text) => window.__supportDownloads.push({ text }))
      return url
    }
    HTMLAnchorElement.prototype.click = function click() {
      window.__supportDownloads.push({ filename: this.download })
    }
  })

  const create = page.getByRole('button', { name: 'Create diagnostic report' })
  await create.scrollIntoViewIfNeeded()
  await create.focus()
  await create.click()
  const dialog = page.getByRole('dialog', { name: 'Review diagnostic report' })
  const preview = dialog.getByRole('textbox', { name: 'Diagnostic report contents' })
  const report = JSON.parse(await preview.textContent())
  assertDiagnosticShape(report)
  evidence.diagnostic.exactKeys = true
  evidence.diagnostic.excludedFixtureMarkers = true
  evidence.diagnostic.reviewedBeforeDownload = true
  evidence.interactions['diagnostic-review'] = true
  await capture(page, viewport, 'desktop-report-review', output, judgments, evidence, repoRoot)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  assert(await create.evaluate((element) => document.activeElement === element), 'diagnostic cancel did not restore invoker focus')
  evidence.interactions['diagnostic-cancel'] = true
  evidence.interactions['focus-restoration'] = true

  await create.click()
  const downloadButton = page.getByRole('dialog', { name: 'Review diagnostic report' })
    .getByRole('button', { name: 'Download report' })
  await downloadButton.click()
  await page.waitForFunction(() => window.__supportDownloads.some((entry) => typeof entry.text === 'string'))
  const downloads = await page.evaluate(() => window.__supportDownloads)
  const downloadedReport = JSON.parse(downloads.find((entry) => typeof entry.text === 'string').text)
  assertDiagnosticShape(downloadedReport)
  assert(downloads.some((entry) => entry.filename === `tab-two-diagnostic-${downloadedReport.generatedAt.slice(0, 10)}.json`))
  evidence.diagnostic.downloadedLocally = true
  evidence.interactions['diagnostic-download'] = true
  assert.notEqual(await drawer.getAttribute('aria-hidden'), 'true')
  evidence.storageWrites.push(...await page.evaluate(() => window.__supportStorageWrites ?? []))
}

async function exerciseContained(page, viewport, output, judgments, evidence, repoRoot) {
  await openHelp(page)
  await page.getByRole('button', { name: 'Encrypted sync' }).scrollIntoViewIfNeeded()
  if (viewport.touch) {
    await page.getByRole('button', { name: 'Encrypted sync' }).tap()
    assert.equal(await page.getByRole('button', { name: 'Encrypted sync' }).getAttribute('aria-expanded'), 'true')
  }
  const currentGeometry = await geometry(page)
  assert.equal(currentGeometry.horizontalOverflow, false, `${viewport.id} has horizontal overflow`)
  assert.equal(currentGeometry.tabOverflowContained, true, `${viewport.id} tab overflow escapes Settings`)
  assert.equal(currentGeometry.scrollOwners, 1, `${viewport.id} does not have one Settings scroll owner`)
  if (viewport.id === 'touch-narrow') {
    assert(currentGeometry.tabScrollWidth > currentGeometry.tabClientWidth, 'touch-narrow tab row does not own its overflow')
  }
  await capture(page, viewport, `${viewport.id}-contained`, output, judgments, evidence, repoRoot)
}

export async function runPaidMvpSupportQa(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  assertExactBuildTrackedStatus(execFileSync(
    'git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' },
  ))
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const dist = resolve(repoRoot, 'dist')
  const provenance = JSON.parse(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'))
  assert.equal(provenance.commit, commit, 'support dist provenance does not match HEAD')
  const fixtureMarkerPresent = FIXTURE_MARKERS.some((marker) => artifactText(dist).includes(marker))
  assert.equal(fixtureMarkerPresent, false, 'support QA requires a production dist without preview fixtures')

  const output = resolve(repoRoot, 'artifacts/qa-paid-mvp-support', commit)
  mkdirSync(output, { recursive: true })
  const judgments = readJudgments(resolve(output, 'judgments.json'))
  const evidence = {
    commit,
    result: 'FAIL',
    build: { ...provenance, mode: 'production', fixtureMarkerPresent },
    execution: 'installed-extension',
    interactions: Object.fromEntries(SUPPORT_INTERACTIONS.map((name) => [name, false])),
    viewports: SUPPORT_VIEWPORTS.map(({ id }) => ({ id, result: 'FAIL' })),
    requestLedger: [],
    storageWrites: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    diagnostic: {
      exactKeys: false,
      excludedFixtureMarkers: false,
      reviewedBeforeDownload: false,
      downloadedLocally: false,
    },
    screenshots: [],
  }
  const profiles = []
  let context
  try {
    for (const viewport of SUPPORT_VIEWPORTS) {
      const profile = mkdtempSync(resolve(tmpdir(), `tab-two-support-${viewport.id}-`))
      profiles.push(profile)
      const launched = await launchInstalled(profile, dist, viewport, evidence)
      context = launched.context
      if (viewport.id === 'desktop') {
        await exerciseDesktop(launched.page, viewport, output, judgments, evidence, repoRoot)
      } else {
        await exerciseContained(launched.page, viewport, output, judgments, evidence, repoRoot)
      }
      evidence.viewports.find((entry) => entry.id === viewport.id).result = 'PASS'
      await context.close()
      context = null
    }
    evidence.result = 'PASS'
    assertSupportEvidence(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`PASS: Tab Two paid MVP support QA (${commit})`)
    return evidence
  } catch (error) {
    evidence.result = 'FAIL'
    evidence.failure = String(error?.stack ?? error)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    throw error
  } finally {
    await context?.close()
    for (const profile of profiles) {
      assert(profile.startsWith(tmpdir()), `unsafe support QA profile path: ${profile}`)
      rmSync(profile, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runPaidMvpSupportQa()
}
