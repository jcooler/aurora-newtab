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

const FIXTURE_MARKERS = Object.freeze([
  'TAB_TWO_PREVIEW_ACCOUNT_FIXTURE',
  'TAB_TWO_PREVIEW_METRICS_FIXTURE',
  'preview_fixture',
])
const SENSITIVE_KEYS = /^(?:password|passphrase|secret|token|accessToken|refreshToken|session|email|url|uri|title|name|eventName|taskName|repository|project|location)$/i

export const METRICS_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1600, height: 900, touch: false }),
  Object.freeze({ id: 'short', width: 1408, height: 600, touch: false }),
  Object.freeze({ id: 'ultrawide', width: 3440, height: 1440, touch: false }),
  Object.freeze({ id: 'touch', width: 390, height: 844, touch: true }),
])

export const METRICS_INTERACTIONS = Object.freeze([
  'production-locked',
  'loading',
  'error-retry',
  'empty',
  'populated',
  'expired-retained',
  'offline-retained',
  'range-controls',
  'settings-route',
  'export',
  'delete-cancel',
  'delete-scoped',
  'focus-order-visible',
  'reduced-motion',
  'layout-edit',
  'dock',
  'stack',
  'reload-persistence',
  'no-overflow',
  'touch-control',
])

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two Metrics QA requires --exact')
}

function artifactText(root) {
  const chunks = []
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name)
      if (statSync(path).isDirectory()) visit(path)
      else if (/\.(?:js|html|json|css)$/i.test(name)) chunks.push(readFileSync(path, 'utf8'))
    }
  }
  visit(root)
  return chunks.join('\n')
}

export function assertArtifactIsolation(productionText, previewText) {
  for (const marker of FIXTURE_MARKERS) {
    assert(!productionText.includes(marker), `production artifact contains preview fixture marker: ${marker}`)
  }
  assert(previewText.includes('TAB_TWO_PREVIEW_METRICS_FIXTURE'), 'preview artifact is missing the Metrics state fixture marker')
  assert(previewText.includes('preview_fixture'), 'preview artifact is missing the deterministic account grant marker')
}

export function assertNoSensitiveMetricKeys(value, path = 'export') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveMetricKeys(entry, `${path}[${index}]`))
    return value
  }
  if (!value || typeof value !== 'object') return value
  for (const [key, entry] of Object.entries(value)) {
    assert(!SENSITIVE_KEYS.test(key), `sensitive metric key found at ${path}.${key}`)
    assertNoSensitiveMetricKeys(entry, `${path}.${key}`)
  }
  return value
}

export function inspectGeometry({ viewportWidth, documentWidth, bodyWidth, rects }) {
  return {
    horizontalOverflow: documentWidth > viewportWidth + 1 || bodyWidth > viewportWidth + 1,
    escaped: rects.filter((rect) => rect.left < -0.5 || rect.right > viewportWidth + 0.5).map((rect) => rect.id),
  }
}

function assertBuild(build, commit, mode, fixtureMarkerPresent) {
  assert(build && typeof build === 'object', `${mode} build provenance is missing`)
  assert.equal(build.commit, commit, `${mode} build provenance does not match HEAD`)
  assert.equal(build.mode, mode, `${mode} build mode is not recorded`)
  assert.equal(build.fixtureMarkerPresent, fixtureMarkerPresent, `${mode} fixture isolation result is incorrect`)
}

export function assertEvidenceContract(evidence) {
  assert.equal(evidence.result, 'PASS', 'Metrics evidence result is not PASS')
  assert.equal(typeof evidence.commit, 'string', 'Metrics evidence commit is missing')
  assertBuild(evidence.builds?.production, evidence.commit, 'production', false)
  assertBuild(evidence.builds?.preview, evidence.commit, 'preview', true)
  assert.equal(evidence.execution?.production, 'installed-extension', 'production did not run as an installed extension')
  assert.equal(evidence.execution?.preview, 'installed-extension', 'preview did not run as an installed extension')
  for (const interaction of METRICS_INTERACTIONS) {
    assert.equal(evidence.interactions?.[interaction], true, `Metrics interaction ${interaction} is missing or failed`)
  }
  assert.equal(evidence.viewports?.length, METRICS_VIEWPORTS.length, 'Metrics viewport evidence is incomplete')
  for (const expected of METRICS_VIEWPORTS) {
    const actual = evidence.viewports.find((entry) => entry.viewport?.id === expected.id)
    assert(actual, `Metrics viewport evidence is missing for ${expected.id}`)
    assert.deepEqual(actual.viewport, expected, `Metrics viewport evidence drifted for ${expected.id}`)
    assert.equal(actual.horizontalOverflow, false, `${expected.id} has horizontal overflow`)
    assert.deepEqual(actual.escaped, [], `${expected.id} has escaped Metrics geometry`)
    assert.equal(typeof actual.screenshotPath, 'string', `${expected.id} screenshot is missing`)
  }
  assert.deepEqual(evidence.requests, [], `Metrics QA made an unexpected request: ${JSON.stringify(evidence.requests)}`)
  assert.deepEqual(evidence.consoleErrors, [], 'Metrics QA emitted browser console errors')
  assert.deepEqual(evidence.pageErrors, [], 'Metrics QA emitted uncaught page errors')
  assert.deepEqual(evidence.failedRequests, [], 'Metrics QA emitted failed requests')
  return evidence
}

function readProvenance(root, commit, mode, fixtureMarkerPresent) {
  const value = JSON.parse(readFileSync(resolve(root, 'build-provenance.json'), 'utf8'))
  assert.equal(value.commit, commit, `${mode} build provenance does not match HEAD`)
  return { commit: value.commit, mode, fixtureMarkerPresent }
}

function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDay(key, amount) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + amount))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function createMetricsHistoryFixture(today) {
  const installationId = '11111111-1111-4111-8111-111111111111'
  const rows = [
    [0, 'tasks', '22222222-2222-4222-8222-222222222222', { kind: 'tasks', completed: 5, carriedForward: 1 }],
    [0, 'focus', installationId, { kind: 'focus', sessions: 2, minutes: 50 }],
    [-1, 'habits', '33333333-3333-4333-8333-333333333333', { kind: 'habits', completed: 3, tracked: 4, streak: 2 }],
    [-1, 'calendar', 'ics', { kind: 'calendar', events: 2, busyMinutes: 120 }],
    [-5, 'development', 'github', { kind: 'development', commits: 4, reviews: 1, issues: 0, deployments: 1, failures: 0 }],
    [-5, 'fitness', 'strava', { kind: 'fitness', activities: 1, durationMinutes: 35, distanceMeters: 5000, elevationMeters: 40, types: { run: 1, ride: 0, walk: 0, hike: 0, swim: 0, other: 0 } }],
    [-35, 'tasks', '22222222-2222-4222-8222-222222222222', { kind: 'tasks', completed: 2, carriedForward: 2 }],
  ]
  return {
    version: 1,
    installationId,
    buckets: rows.map(([offset, source, sourceInstanceId, values], index) => ({
      schemaVersion: 1,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      date: shiftDay(today, offset),
      source,
      sourceInstanceId,
      installationId,
      sequence: index + 1,
      values,
    })),
  }
}

async function seed(page, { history, tier = 'standard', placement = 'free' }) {
  await page.evaluate(async ({ history, tier, placement }) => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    widgets.metrics = true
    widgets.notes = placement === 'stack'
    const layout = {
      id: `metrics-${placement}-${tier}`,
      name: 'Metrics acceptance',
      widgets: {
        clock: { kind: 'free', anchor: 'top-right', offsetX: -8, offsetY: 8, tier: 'compact', layer: 2 },
        greeting: { kind: 'hidden' },
        focus: { kind: 'hidden' },
      },
    }
    if (placement === 'free') {
      layout.widgets.metrics = { kind: 'free', anchor: 'bottom-left', offsetX: 8, offsetY: -8, tier, layer: 1 }
    } else if (placement === 'dock') {
      layout.widgets.metrics = { kind: 'docked', dock: 'bottom', order: 0, x: 50, y: 50, tier: 'compact', returnTier: tier }
    } else {
      layout.stacks = [{ id: 'metrics-stack', members: ['metrics', 'notes'], facing: 'metrics', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'compact', layer: 1 }]
    }
    await chrome.storage.local.set({
      settings: { ...settings, muted: true, widgets },
      metricsHistory: history,
      notes: { text: 'Metrics QA stack peer', updatedAt: Date.now() },
      layouts: { version: 1, activeLayoutId: layout.id, layouts: [layout] },
    })
  }, { history, tier, placement })
}

function attachLedgers(page, evidence, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push({ label, text: message.text() })
  })
  page.on('pageerror', (error) => evidence.pageErrors.push({ label, text: error.message }))
  page.on('requestfailed', (request) => evidence.failedRequests.push({ label, method: request.method(), url: request.url(), failure: request.failure()?.errorText }))
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
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  await context.route(/^https?:\/\//, async (route) => {
    evidence.requests.push({ label, method: route.request().method(), url: route.request().url() })
    await route.abort('blockedbyclient')
  })
  const page = context.pages()[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  attachLedgers(page, evidence, label)
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  return { context, page }
}

async function loadState(page, accountState, metricsState = 'normal') {
  const url = new URL(page.url())
  url.search = ''
  if (accountState) url.searchParams.set('accountState', accountState)
  if (metricsState !== 'normal') url.searchParams.set('metricsState', metricsState)
  await page.goto(url.href, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
}

async function waitForMetrics(page) {
  await page.getByRole('region', { name: 'Metrics' }).waitFor()
  return page.getByRole('region', { name: 'Metrics' })
}

async function geometry(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-testid="canvas-item-metrics"], [data-stack-card="metrics-stack"], [data-dock-line], [data-settings-scroll-owner="document"]')]
      .filter((node) => node instanceof HTMLElement && getComputedStyle(node).display !== 'none')
      .filter((node) => node.getAttribute('data-settings-scroll-owner') !== 'document' || node.getAttribute('aria-hidden') !== 'true')
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      rects: nodes.map((node, index) => {
        const rect = node.getBoundingClientRect()
        return { id: node.getAttribute('data-testid') ?? node.getAttribute('data-stack-card') ?? `dock-${index}`, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      }),
    }
  })
}

async function capture(page, viewport, id, output, evidence, repoRoot, recordViewport = false) {
  const path = resolve(output, `${id}.png`)
  await page.screenshot({ path })
  const measured = inspectGeometry(await geometry(page))
  assert.equal(measured.horizontalOverflow, false, `${id} has horizontal overflow`)
  assert.deepEqual(measured.escaped, [], `${id} has escaped Metrics geometry`)
  const screenshotPath = relative(repoRoot, path).replaceAll('\\', '/')
  evidence.screenshots.push({ id, viewport, screenshotPath, ...measured })
  if (recordViewport) evidence.viewports.push({ viewport, screenshotPath, ...measured })
}

async function openMetricsSettings(page) {
  await page.getByRole('button', { name: 'View history' }).click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-settings-anchor') === 'metrics-history')
  assert.equal(await page.getByRole('tab', { name: 'Progress' }).getAttribute('aria-selected'), 'true')
  await waitForSettingsSettled(page)
}

async function waitForSettingsSettled(page) {
  await page.waitForFunction(() => {
    const drawer = document.querySelector('[data-settings-scroll-owner="document"]')
    if (!(drawer instanceof HTMLElement) || drawer.getAttribute('aria-hidden') === 'true') return false
    const rect = drawer.getBoundingClientRect()
    return rect.left >= -0.5 && rect.right <= innerWidth + 0.5
  })
}

async function waitForHistory(page, predicate, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const value = await page.evaluate(() => chrome.storage.local.get('metricsHistory'))
    if (predicate(value.metricsHistory)) return value.metricsHistory
    await page.waitForTimeout(50)
  }
  assert.fail(`Metrics history did not settle after ${label}`)
}

async function exerciseProduction(page, viewport, output, evidence, repoRoot) {
  await seed(page, { history: null, tier: 'standard', placement: 'free' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const frame = await waitForMetrics(page)
  await frame.getByRole('heading', { name: 'See the rhythm behind your days.' }).waitFor()
  evidence.interactions['production-locked'] = true
  await capture(page, viewport, 'production-locked-desktop', output, evidence, repoRoot)
}

async function exercisePreviewDesktop(page, viewport, output, evidence, repoRoot) {
  const today = localDayKey()
  const history = createMetricsHistoryFixture(today)

  await seed(page, { history: null, tier: 'standard', placement: 'free' })
  await loadState(page, 'active', 'loading')
  await page.getByRole('status').filter({ hasText: 'Loading metrics' }).waitFor()
  evidence.interactions.loading = true
  await capture(page, viewport, 'preview-loading-desktop', output, evidence, repoRoot)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const animation = await page.locator('.metrics-loading-rhythm').evaluate((node) => getComputedStyle(node).animationName)
  assert.equal(animation, 'none', 'Metrics loading rhythm ignored reduced motion')
  evidence.interactions['reduced-motion'] = true

  await loadState(page, 'active', 'error')
  await page.getByRole('alert').filter({ hasText: 'Metrics is unavailable' }).waitFor()
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByRole('alert').filter({ hasText: 'Metrics is unavailable' }).waitFor()
  evidence.interactions['error-retry'] = true
  await capture(page, viewport, 'preview-error-desktop', output, evidence, repoRoot)

  await loadState(page, 'active')
  await page.getByRole('heading', { name: 'Your first week starts here.' }).waitFor()
  evidence.interactions.empty = true
  await capture(page, viewport, 'preview-empty-desktop', output, evidence, repoRoot)

  await seed(page, { history, tier: 'full', placement: 'free' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('group', { name: 'History range' }).waitFor()
  for (const range of ['7d', '30d', '90d', '365d']) {
    await page.getByRole('button', { name: range }).click()
    assert.equal(await page.getByRole('button', { name: range }).getAttribute('aria-pressed'), 'true')
  }
  evidence.interactions['range-controls'] = true
  evidence.interactions.populated = true

  await page.getByRole('button', { name: '7d' }).focus()
  await page.keyboard.press('Tab')
  const thirty = page.getByRole('button', { name: '30d' })
  assert(await thirty.evaluate((node) => document.activeElement === node), 'Metrics range focus order skipped 30d')
  const focusStyle = await thirty.evaluate((node) => ({ style: getComputedStyle(node).outlineStyle, width: getComputedStyle(node).outlineWidth }))
  assert.notEqual(focusStyle.style, 'none', 'Metrics range keyboard focus is not visible')
  assert.notEqual(focusStyle.width, '0px', 'Metrics range keyboard focus has no width')
  evidence.interactions['focus-order-visible'] = true
  await capture(page, viewport, 'preview-populated-full-desktop', output, evidence, repoRoot, true)

  const storedBeforeReload = await page.evaluate(() => chrome.storage.local.get('metricsHistory'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('5 done').waitFor()
  const storedAfterReload = await page.evaluate(() => chrome.storage.local.get('metricsHistory'))
  assert.deepEqual(storedAfterReload.metricsHistory, storedBeforeReload.metricsHistory, 'Metrics history changed across reload')
  evidence.interactions['reload-persistence'] = true

  await loadState(page, 'signed-in')
  await page.getByText('History paused').waitFor()
  await page.getByText('5 done').waitFor()
  evidence.interactions['expired-retained'] = true
  await capture(page, viewport, 'preview-expired-retained-desktop', output, evidence, repoRoot)

  await loadState(page, 'offline')
  await page.getByText('Sync offline').waitFor()
  await page.getByText('5 done').waitFor()
  evidence.interactions['offline-retained'] = true
  await capture(page, viewport, 'preview-offline-retained-desktop', output, evidence, repoRoot)

  await seed(page, { history, tier: 'standard', placement: 'free' })
  await loadState(page, 'active')
  await page.getByRole('button', { name: 'View history' }).waitFor()
  await openMetricsSettings(page)
  evidence.interactions['settings-route'] = true
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export history' }).click()
  const download = await downloadPromise
  assert.match(download.suggestedFilename(), /^tab-two-metrics-\d{4}-\d{2}-\d{2}\.json$/)
  const exportPath = resolve(output, download.suggestedFilename())
  await download.saveAs(exportPath)
  const exported = JSON.parse(readFileSync(exportPath, 'utf8'))
  assertNoSensitiveMetricKeys(exported)
  assert.equal(exported.kind, 'metrics-history')
  evidence.export = { path: relative(repoRoot, exportPath).replaceAll('\\', '/'), bucketCount: exported.history.buckets.length }
  evidence.interactions.export = true

  const beforeDelete = await page.evaluate(() => chrome.storage.local.get('metricsHistory'))
  await page.getByRole('button', { name: 'Delete selected history' }).click()
  await page.getByRole('button', { name: 'Confirm delete Tasks history' }).waitFor()
  await page.getByLabel('History to delete').selectOption('focus')
  await page.getByRole('button', { name: 'Delete selected history' }).waitFor()
  const afterCancel = await page.evaluate(() => chrome.storage.local.get('metricsHistory'))
  assert.deepEqual(afterCancel.metricsHistory, beforeDelete.metricsHistory, 'changing the deletion scope deleted history')
  evidence.interactions['delete-cancel'] = true
  await page.getByRole('button', { name: 'Delete selected history' }).click()
  await page.getByRole('button', { name: 'Confirm delete Focus history' }).click()
  const afterDelete = await waitForHistory(page, (value) => value.buckets.every((bucket) => bucket.source !== 'focus'), 'scoped Focus deletion')
  assert(afterDelete.buckets.some((bucket) => bucket.source === 'tasks'), 'scoped deletion removed unrelated Tasks history')
  evidence.interactions['delete-scoped'] = true
  await capture(page, viewport, 'preview-metrics-settings-desktop', output, evidence, repoRoot)

  await page.keyboard.press('Escape')
  await seed(page, { history, tier: 'standard', placement: 'free' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /^Layout:/ }).click()
  await page.getByRole('menuitem', { name: 'Edit layout' }).click()
  await page.getByTestId('canvas-item-metrics').click()
  const inspector = page.getByRole('dialog', { name: 'Metrics inspector' })
  await inspector.waitFor()
  assert.equal(await inspector.getByRole('radio', { name: 'Standard' }).getAttribute('aria-checked'), 'true')
  await page.getByRole('toolbar', { name: 'Edit layout' }).getByRole('button', { name: 'Cancel' }).click()
  evidence.interactions['layout-edit'] = true

  await seed(page, { history, tier: 'standard', placement: 'dock' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByLabel(/Metrics: 3 active days, Focus 50m, Tasks 5/).waitFor()
  assert.equal(await page.locator('[data-dock-line]').count(), 1)
  evidence.interactions.dock = true
  await capture(page, viewport, 'preview-docked-desktop', output, evidence, repoRoot)

  await seed(page, { history, tier: 'compact', placement: 'stack' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const stack = page.locator('[data-stack-card="metrics-stack"]')
  await stack.waitFor()
  await page.locator('[data-stack-member="metrics"][data-stack-active="true"] .metrics-frame').waitFor()
  const contained = await page.evaluate(() => {
    const outer = document.querySelector('[data-stack-member="metrics"][data-stack-active="true"]')
    const inner = outer?.querySelector('.metrics-frame')
    if (!(outer instanceof HTMLElement) || !(inner instanceof HTMLElement)) return false
    const a = outer.getBoundingClientRect()
    const b = inner.getBoundingClientRect()
    return b.left >= a.left - 0.75 && b.top >= a.top - 0.75 && b.right <= a.right + 0.75 && b.bottom <= a.bottom + 0.75
  })
  assert.equal(contained, true, 'Metrics escaped its active stack face')
  evidence.interactions.stack = true
  await capture(page, viewport, 'preview-stacked-desktop', output, evidence, repoRoot)
}

async function exerciseViewport(page, viewport, output, evidence, repoRoot) {
  const history = createMetricsHistoryFixture(localDayKey())
  await seed(page, { history, tier: viewport.touch ? 'standard' : 'full', placement: 'free' })
  await loadState(page, 'active')
  const frame = await waitForMetrics(page)
  await frame.getByText(viewport.touch ? 'View history' : 'Fitness').waitFor()
  if (viewport.touch) {
    const button = frame.getByRole('button', { name: 'View history' })
    const box = await button.boundingBox()
    assert(box && box.width >= 44 && box.height >= 44, 'touch Metrics history control is below 44px')
    await button.tap()
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-settings-anchor') === 'metrics-history')
    await waitForSettingsSettled(page)
    evidence.interactions['touch-control'] = true
  }
  await capture(page, viewport, `preview-populated-${viewport.id}`, output, evidence, repoRoot, true)
}

export async function runTabTwoMetricsQa(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  assertExactBuildTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }))
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const dist = resolve(repoRoot, 'dist')
  const previewText = artifactText(dist)
  const previewFixture = previewText.includes('TAB_TWO_PREVIEW_METRICS_FIXTURE')
  assert(previewFixture, 'dist is not the required preview Metrics build')
  const previewBuild = readProvenance(dist, commit, 'preview', previewFixture)

  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'tab-two-metrics-'))
  const previewDist = resolve(temporaryRoot, 'preview-dist')
  cpSync(dist, previewDist, { recursive: true })
  execFileSync(process.execPath, [resolve(repoRoot, 'scripts/build.mjs')], { cwd: repoRoot, stdio: 'inherit' })
  const productionText = artifactText(dist)
  assertArtifactIsolation(productionText, previewText)
  const productionFixture = FIXTURE_MARKERS.some((marker) => productionText.includes(marker))
  const productionBuild = readProvenance(dist, commit, 'production', productionFixture)

  const output = resolve(repoRoot, 'artifacts/qa-tab-two-metrics', commit)
  mkdirSync(output, { recursive: true })
  const evidence = {
    commit,
    result: 'FAIL',
    builds: { production: productionBuild, preview: previewBuild },
    execution: { production: 'installed-extension', preview: 'installed-extension' },
    interactions: Object.fromEntries(METRICS_INTERACTIONS.map((name) => [name, false])),
    viewports: [], screenshots: [], export: null,
    requests: [], consoleErrors: [], pageErrors: [], failedRequests: [],
  }
  const profiles = METRICS_VIEWPORTS.map((viewport) => mkdtempSync(resolve(tmpdir(), `tab-two-metrics-${viewport.id}-`)))
  let productionContext
  const previewContexts = []
  try {
    const production = await launchInstalled(profiles[0], dist, METRICS_VIEWPORTS[0], evidence, 'production-desktop')
    productionContext = production.context
    await exerciseProduction(production.page, METRICS_VIEWPORTS[0], output, evidence, repoRoot)
    await productionContext.close()
    productionContext = undefined

    const desktop = await launchInstalled(profiles[0], previewDist, METRICS_VIEWPORTS[0], evidence, 'preview-desktop')
    previewContexts.push(desktop.context)
    await exercisePreviewDesktop(desktop.page, METRICS_VIEWPORTS[0], output, evidence, repoRoot)
    for (let index = 1; index < METRICS_VIEWPORTS.length; index += 1) {
      const viewport = METRICS_VIEWPORTS[index]
      const launched = await launchInstalled(profiles[index], previewDist, viewport, evidence, `preview-${viewport.id}`)
      previewContexts.push(launched.context)
      await exerciseViewport(launched.page, viewport, output, evidence, repoRoot)
    }
    evidence.interactions['no-overflow'] = evidence.viewports.every((entry) => !entry.horizontalOverflow && entry.escaped.length === 0)
    evidence.result = 'PASS'
    assertEvidenceContract(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`PASS: Tab Two Metrics QA (${commit})`)
    return evidence
  } catch (error) {
    evidence.failure = String(error?.stack ?? error)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    throw error
  } finally {
    for (const context of previewContexts.reverse()) await context.close().catch(() => undefined)
    await productionContext?.close().catch(() => undefined)
    for (const profile of profiles) {
      assert(profile.startsWith(tmpdir()), `unsafe Metrics QA profile path: ${profile}`)
      rmSync(profile, { recursive: true, force: true })
    }
    assert(temporaryRoot.startsWith(tmpdir()), `unsafe Metrics QA temporary path: ${temporaryRoot}`)
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runTabTwoMetricsQa()
}
