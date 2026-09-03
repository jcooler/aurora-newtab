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

const PREVIEW_MARKERS = Object.freeze([
  'preview_fixture',
  'preview-microsoft-calendar-authority',
])
const ACCOUNT_ID = '43000000-0000-4000-8000-000000000001'
const PERSONAL_CONNECTION = '64000000-0000-4000-8000-000000000001'
const WORK_CONNECTION = '64000000-0000-4000-8000-000000000002'

export const MICROSOFT_CALENDAR_STATES = Object.freeze([
  'production-locked',
  'read-only-consent',
  'connecting',
  'calendar-selection',
  'personal-and-work',
  'organization-approval',
  'partial-account',
  'reconnect-retained',
  'disconnect-history',
  'composed-calendar-full',
  'composed-calendar-stacked',
  'composed-calendar-docked',
  'touch-selection',
])

export const MICROSOFT_CALENDAR_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1600, height: 900, touch: false }),
  Object.freeze({ id: 'short', width: 1408, height: 600, touch: false }),
  Object.freeze({ id: 'ultrawide', width: 3440, height: 1440, touch: false }),
  Object.freeze({ id: 'touch', width: 390, height: 844, touch: true }),
])

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two Microsoft Calendar QA requires --exact')
}

function artifactText(root) {
  const chunks = []
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name)
      if (statSync(path).isDirectory()) visit(path)
      else if (/\.(?:css|html|js|json)$/iu.test(name)) chunks.push(readFileSync(path, 'utf8'))
    }
  }
  visit(root)
  return chunks.join('\n')
}

export function assertArtifactIsolation(productionText, accountLocalText, previewText) {
  for (const marker of PREVIEW_MARKERS) {
    assert(!productionText.includes(marker), `production artifact contains preview fixture marker: ${marker}`)
    assert(!accountLocalText.includes(marker), `account-local artifact contains preview fixture marker: ${marker}`)
    assert(previewText.includes(marker), `preview artifact is missing fixture marker: ${marker}`)
  }
}

export function inspectGeometry({ viewportWidth, documentWidth, bodyWidth, rects }) {
  return {
    horizontalOverflow: documentWidth > viewportWidth + 1 || bodyWidth > viewportWidth + 1,
    escaped: rects
      .filter((rect) => rect.left < -0.5 || rect.right > viewportWidth + 0.5)
      .map((rect) => rect.id),
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
  assert.equal(evidence.result, 'PASS', 'Microsoft Calendar evidence result is not PASS')
  assert.equal(evidence.exact, true, 'Microsoft Calendar evidence is not exact')
  assert.match(evidence.sourceSha ?? '', /^[0-9a-f]{6,40}$/u, 'Microsoft Calendar source SHA is missing')
  assert.equal(evidence.dataClassification, 'synthetic-only')
  assert.equal(evidence.ownerDataPresent, false, 'Microsoft Calendar evidence contains owner data')
  assertBuild(evidence.builds?.production, evidence.sourceSha, 'production', false)
  assertBuild(evidence.builds?.accountLocal, evidence.sourceSha, 'account-local', false)
  assertBuild(evidence.builds?.preview, evidence.sourceSha, 'preview', true)

  for (const mode of ['production', 'accountLocal', 'preview']) {
    assert.match(evidence.extensionIds?.[mode] ?? '', /^[a-p]{32}$/u, `${mode} extension ID is missing`)
  }
  for (const state of MICROSOFT_CALENDAR_STATES) {
    const actual = evidence.states?.[state]
    assert(actual, `Microsoft Calendar state ${state} is missing`)
    assert.equal(actual.passed, true, `Microsoft Calendar state ${state} failed`)
    assert(MICROSOFT_CALENDAR_VIEWPORTS.some((viewport) => viewport.id === actual.viewportId))
    assert.equal(typeof actual.screenshotPath, 'string')
  }
  assert.equal(evidence.viewports?.length, MICROSOFT_CALENDAR_VIEWPORTS.length, 'viewport evidence is incomplete')
  for (const expected of MICROSOFT_CALENDAR_VIEWPORTS) {
    const actual = evidence.viewports.find((entry) => entry.viewport?.id === expected.id)
    assert(actual, `Microsoft Calendar viewport ${expected.id} is missing`)
    assert.deepEqual(actual.viewport, expected)
    assert.equal(actual.horizontalOverflow, false, `${expected.id} has horizontal overflow`)
    assert.deepEqual(actual.escaped, [], `${expected.id} has escaped geometry`)
    assert.equal(typeof actual.screenshotPath, 'string')
  }
  assert.equal(evidence.interactions?.keyboardFocus, true)
  assert.equal(evidence.interactions?.focusRestored, true)
  assert.equal(evidence.interactions?.permissionDisclosureVisible, true)
  assert(Array.isArray(evidence.storage?.keys) && evidence.storage.keys.length > 0)
  assert.deepEqual(evidence.storage?.unexpectedKeys, [], 'Microsoft Calendar QA stored unexpected keys')
  assert.deepEqual(evidence.storage?.secretValues, [], 'Microsoft Calendar QA stored secret-looking values')
  assert(Array.isArray(evidence.requests))
  assert(evidence.requests.every((entry) => entry.host === 'graph.microsoft.com'
    && entry.path.startsWith('/v1.0/me/calendars')
    && entry.disposition === 'fixture-fulfilled'), 'Microsoft Calendar QA used a non-fixture provider route')
  assert.deepEqual(evidence.wireRequests, [], 'Microsoft Calendar QA made a wire request')
  assert.deepEqual(evidence.unexpectedOrigins, [], 'Microsoft Calendar QA used an unexpected origin')
  assert.deepEqual(evidence.consoleErrors, [], 'Microsoft Calendar QA emitted console errors')
  assert.deepEqual(evidence.pageErrors, [], 'Microsoft Calendar QA emitted page errors')
  assert.deepEqual(evidence.failedRequests, [], 'Microsoft Calendar QA emitted failed requests')
  assert(Array.isArray(evidence.touchTargets) && evidence.touchTargets.length >= 2)
  for (const target of evidence.touchTargets) {
    assert(target.width >= 44 && target.height >= 44, `${target.name} is below 44px`)
  }
  assert.deepEqual(evidence.reducedMotion, { passed: true, animationName: 'none' })
  assert.equal(evidence.screenshots?.length >= MICROSOFT_CALENDAR_STATES.length, true)

  const leaves = stringLeaves(evidence)
  assert(!leaves.some((value) => /@[a-z0-9.-]*(?:gmail|hotmail|outlook|live|icloud)\.com\b/iu.test(value)
    || /\bJon(?:athan)? Cooler\b/iu.test(value)), 'Microsoft Calendar evidence contains owner data')
  assert(!leaves.some((value) => /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|sb_secret_|Bearer\s+[A-Za-z0-9._~-]|eyJ[A-Za-z0-9_-]+\.)/u.test(value)), 'Microsoft Calendar evidence contains a secret-looking value')
  return evidence
}

function readBuild(root, sourceSha, mode, previewFixture) {
  const provenance = JSON.parse(readFileSync(resolve(root, 'build-provenance.json'), 'utf8'))
  assert.equal(provenance.commit, sourceSha, `${mode} build provenance does not match source SHA`)
  return { sourceSha, mode, exact: true, previewFixture }
}

function fixtureJson(route, value) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(value),
  })
}

function calendarListFixture() {
  return {
    value: [
      { id: 'default', name: 'Calendar', color: 'lightBlue', hexColor: '#3a96dd', isDefaultCalendar: true, canViewPrivateItems: true },
      { id: 'family', name: 'Family', color: 'lightGreen', hexColor: '#00a300', isDefaultCalendar: false, canViewPrivateItems: true },
      { id: 'project', name: 'Project team', color: 'lightOrange', hexColor: '#da532c', isDefaultCalendar: false, canViewPrivateItems: true },
    ],
  }
}

function deltaFixture(url) {
  const pathParts = url.pathname.split('/')
  const calendarId = decodeURIComponent(pathParts.at(-3) ?? 'default')
  const start = new Date(Date.now() + 60 * 60_000)
  const end = new Date(start.getTime() + 45 * 60_000)
  return {
    value: [{
      id: `fixture-${calendarId}`,
      subject: calendarId === 'default' ? 'Microsoft planning' : `${calendarId} calendar`,
      isCancelled: false,
      showAs: 'busy',
      sensitivity: 'normal',
      type: 'singleInstance',
      seriesMasterId: null,
      lastModifiedDateTime: new Date().toISOString(),
      isAllDay: false,
      start: { dateTime: start.toISOString().replace(/Z$/u, ''), timeZone: 'UTC' },
      end: { dateTime: end.toISOString().replace(/Z$/u, ''), timeZone: 'UTC' },
    }],
    '@odata.deltaLink': `https://graph.microsoft.com${url.pathname}?$deltatoken=fixture`,
  }
}

function attachLedgers(page, evidence, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push({ label, text: message.text() })
  })
  page.on('pageerror', (error) => evidence.pageErrors.push({ label, text: error.message }))
  page.on('requestfailed', (request) => {
    evidence.failedRequests.push({
      label,
      method: request.method(),
      host: new URL(request.url()).hostname,
      path: new URL(request.url()).pathname,
      failure: request.failure()?.errorText,
    })
  })
}

async function launchInstalled(profile, dist, viewport, evidence, label, mode) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: viewport.touch,
    isMobile: false,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  await context.route(/^https?:\/\//u, async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'graph.microsoft.com'
      && (url.pathname === '/v1.0/me/calendars'
        || /^\/v1\.0\/me\/calendars\/[^/]+\/calendarView\/delta$/u.test(url.pathname))) {
      evidence.requests.push({
        state: label,
        method: route.request().method(),
        host: url.hostname,
        path: url.pathname,
        disposition: 'fixture-fulfilled',
      })
      return fixtureJson(route, url.pathname === '/v1.0/me/calendars'
        ? calendarListFixture()
        : deltaFixture(url))
    }
    evidence.unexpectedOrigins.push(url.origin)
    return route.abort('blockedbyclient')
  })
  const page = context.pages()[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  attachLedgers(page, evidence, label)
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  const extensionId = await page.evaluate(() => chrome.runtime.id)
  const existing = evidence.extensionIds[mode]
  if (existing) assert.equal(existing, extensionId, `${mode} extension ID changed across profiles`)
  else evidence.extensionIds[mode] = extensionId
  return { context, page }
}

async function loadPreviewState(page, microsoftState = null) {
  const url = new URL(page.url())
  url.search = ''
  url.searchParams.set('accountState', 'active')
  if (microsoftState) url.searchParams.set('microsoftState', microsoftState)
  await page.goto(url.href, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
}

async function openMicrosoftCard(page) {
  await page.locator('.settings-gear').click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor()
  await settings.getByRole('tab', { name: 'Connectors' }).click()
  const card = page.locator('[data-connector-card="microsoftCalendar"]')
  await card.scrollIntoViewIfNeeded()
  return { settings, card }
}

async function geometry(page) {
  return page.evaluate(() => {
    const candidates = [
      ...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-connector-card="microsoftCalendar"], [data-testid="canvas-item-ics"], [data-stack-card]'),
    ].filter((node) => node instanceof HTMLElement
      && getComputedStyle(node).display !== 'none'
      && node.getAttribute('aria-hidden') !== 'true')
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      rects: candidates.map((node, index) => {
        const rect = node.getBoundingClientRect()
        return {
          id: node.getAttribute('aria-label') ?? node.getAttribute('data-testid') ?? `surface-${index}`,
          left: rect.left,
          right: rect.right,
        }
      }),
    }
  })
}

async function capture(page, viewport, id, output, evidence, repoRoot, { state = null, recordViewport = false } = {}) {
  const path = resolve(output, `${id}.png`)
  await page.screenshot({ path })
  const measured = inspectGeometry(await geometry(page))
  assert.equal(measured.horizontalOverflow, false, `${id} has horizontal overflow`)
  assert.deepEqual(measured.escaped, [], `${id} has escaped horizontal geometry`)
  const screenshotPath = relative(repoRoot, path).replaceAll('\\', '/')
  evidence.screenshots.push(screenshotPath)
  if (state) evidence.states[state] = {
    passed: true,
    viewportId: viewport.id,
    screenshotPath,
    ...measured,
  }
  if (recordViewport) evidence.viewports.push({ viewport, screenshotPath, ...measured })
}

async function clearMicrosoftState(page) {
  await page.evaluate(async () => {
    const current = await chrome.storage.local.get(['connectors', 'connectorSnapshots', 'refreshPreferences', 'metricsHistory'])
    const connectors = { ...(current.connectors ?? {}) }
    const snapshots = { ...(current.connectorSnapshots ?? {}) }
    const preferences = { ...(current.refreshPreferences ?? {}) }
    delete connectors.microsoftCalendar
    delete snapshots.microsoftCalendar
    preferences.microsoftCalendar = 'manual'
    await chrome.storage.local.set({
      connectors,
      connectorSnapshots: snapshots,
      refreshPreferences: preferences,
      metricsHistory: null,
    })
  })
}

async function seedMicrosoftState(page, {
  issue = null,
  includeIcs = false,
  placement = 'free',
  tier = 'full',
  metrics = false,
} = {}) {
  await page.evaluate(async ({ accountId, personalConnection, workConnection, issue, includeIcs, placement, tier, metrics }) => {
    const canonical = (value) => {
      if (value === null) return 'null'
      if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
      return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    }
    const scope = async (id, config, runtime) => {
      let eventConfig = config
      if (id === 'ics' && Array.isArray(config.calendars)) {
        eventConfig = { ...config, calendars: config.calendars.map(({ color: _color, ...calendar }) => calendar) }
      }
      const identity = `${id}\n${canonical(eventConfig)}${runtime === undefined ? '' : `\n${canonical(runtime)}`}`
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
      const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      return `${id}:${id === 'ics' ? 'v2' : 'v1'}:${hex}`
    }
    const accounts = [{
      connectionId: personalConnection,
      displayEmail: 'alex@outlook.test',
      accountKind: 'personal',
      calendars: [
        { calendarId: 'default', name: 'Personal', color: '#3a96dd', isDefault: true },
        { calendarId: 'family', name: 'Family', color: '#00a300', isDefault: false },
      ],
    }, {
      connectionId: workConnection,
      displayEmail: 'alex@contoso.test',
      accountKind: 'work_or_school',
      calendars: [{ calendarId: 'project', name: 'Project team', color: '#da532c', isDefault: true }],
    }]
    const microsoftCalendar = { enabled: true, accountId, accounts }
    const now = Date.now()
    const start = now + 60 * 60_000
    const end = start + 45 * 60_000
    const source = (connectionId, calendarId, color, title) => ({
      connectionId,
      calendarId,
      color,
      windowStart: now - 31 * 86_400_000,
      windowEnd: now + 62 * 86_400_000,
      deltaLink: `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta?$deltatoken=fixture`,
      events: [{
        eventId: `event-${connectionId}-${calendarId}`,
        title,
        start,
        end,
        allDay: false,
        startDate: null,
        endDate: null,
        cancelled: false,
        showAs: 'busy',
        sensitivity: 'normal',
        eventType: 'singleInstance',
        seriesMasterId: null,
        updatedAt: now,
      }],
    })
    const snapshot = {
      version: 1,
      fetchedAt: now,
      calendars: [
        source(personalConnection, 'default', '#3a96dd', 'Personal planning'),
        source(personalConnection, 'family', '#00a300', 'Family dinner'),
        source(workConnection, 'project', '#da532c', 'Project review'),
      ],
      ...(issue ? { connectionIssues: [{ connectionId: workConnection, code: issue }] } : {}),
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const connectors = { microsoftCalendar }
    const connectorSnapshots = {
      microsoftCalendar: {
        fetchedAt: now,
        scope: await scope('microsoftCalendar', microsoftCalendar, { accountId, timeZone }),
        data: snapshot,
      },
    }
    if (includeIcs) {
      const ics = { enabled: true, calendars: [{ name: 'Local schedule', url: 'https://feeds.invalid/local.ics', color: '#f59e0b' }] }
      connectors.ics = ics
      connectorSnapshots.ics = {
        fetchedAt: now,
        scope: await scope('ics', ics, { timeZone }),
        data: { events: [{ summary: 'Local appointment', start: start + 30 * 60_000, end: end + 30 * 60_000, allDay: false, cal: 0 }] },
      }
    }
    const current = await chrome.storage.local.get(['settings', 'layouts', 'notes'])
    const widgets = Object.fromEntries(Object.keys(current.settings.widgets).map((key) => [key, false]))
    widgets.ics = true
    widgets.notes = placement === 'stack'
    const layout = {
      id: `microsoft-calendar-${placement}-${tier}`,
      name: 'Microsoft Calendar acceptance',
      widgets: {
        clock: { kind: 'free', anchor: 'top-right', offsetX: -8, offsetY: 8, tier: 'compact', layer: 2 },
        greeting: { kind: 'hidden' },
        focus: { kind: 'hidden' },
      },
    }
    if (placement === 'free') layout.widgets.ics = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 1 }
    else if (placement === 'dock') layout.widgets.ics = { kind: 'docked', dock: 'bottom', order: 0, x: 50, y: 50, tier: 'compact', returnTier: tier }
    else layout.stacks = [{ id: 'microsoft-calendar-stack', members: ['ics', 'notes'], facing: 'ics', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'compact', layer: 1 }]
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    await chrome.storage.local.set({
      settings: { ...current.settings, muted: true, widgets },
      connectors,
      connectorSnapshots,
      refreshPreferences: { microsoftCalendar: 'manual', ...(includeIcs ? { ics: 'manual' } : {}) },
      layouts: { version: 1, activeLayoutId: layout.id, layouts: [layout] },
      calendarPreferences: { [layout.id]: { defaultView: 'agenda', includePublicHolidays: false } },
      notes: { text: 'Calendar stack peer', updatedAt: now },
      metricsHistory: metrics ? {
        version: 1,
        installationId: '11111111-1111-4111-8111-111111111111',
        buckets: [personalConnection, workConnection].map((connectionId, index) => ({
          schemaVersion: 1,
          id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          date,
          source: 'calendar',
          sourceInstanceId: connectionId,
          installationId: '11111111-1111-4111-8111-111111111111',
          sequence: index + 1,
          values: { kind: 'calendar', events: index + 1, busyMinutes: (index + 1) * 45 },
        })),
      } : null,
    })
  }, {
    accountId: ACCOUNT_ID,
    personalConnection: PERSONAL_CONNECTION,
    workConnection: WORK_CONNECTION,
    issue,
    includeIcs,
    placement,
    tier,
    metrics,
  })
}

async function exerciseLocked(page, viewport, output, evidence, repoRoot) {
  const requestCount = evidence.requests.length
  const { card } = await openMicrosoftCard(page)
  await card.getByText('Premium').waitFor()
  await card.getByRole('button', { name: 'Set up Microsoft Calendar' }).click()
  await page.getByRole('heading', { name: 'Bring your Microsoft calendars together.' }).waitFor()
  assert.equal(evidence.requests.length, requestCount, 'production locked state made a Microsoft request')
  await capture(page, viewport, 'production-locked', output, evidence, repoRoot, {
    state: 'production-locked', recordViewport: true,
  })
}

async function exerciseDesktop(page, viewport, output, evidence, repoRoot) {
  await loadPreviewState(page, 'connecting')
  await clearMicrosoftState(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const { card } = await openMicrosoftCard(page)
  await card.getByRole('button', { name: 'Set up Microsoft Calendar' }).click()
  await page.getByRole('heading', { name: 'Bring your Microsoft calendars together.' }).waitFor()
  assert(await page.getByText('READ-ONLY', { exact: true }).isVisible())
  assert(await page.getByText(/Chrome will ask to let Tab Two communicate with graph\.microsoft\.com/u).isVisible())
  evidence.interactions.permissionDisclosureVisible = true
  await capture(page, viewport, 'read-only-consent', output, evidence, repoRoot, { state: 'read-only-consent' })

  const continueButton = page.getByRole('button', { name: 'Continue with Microsoft' })
  await continueButton.focus()
  evidence.interactions.keyboardFocus = await continueButton.evaluate((node) => document.activeElement === node)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await continueButton.click()
  await page.getByText('Opening Microsoft...').waitFor()
  const animationName = await page.getByTestId('microsoft-calendar-spinner')
    .evaluate((node) => getComputedStyle(node).animationName)
  evidence.reducedMotion = { passed: animationName === 'none', animationName }
  await capture(page, viewport, 'connecting', output, evidence, repoRoot, { state: 'connecting' })

  const firstPicker = page.getByRole('group', { name: /Calendars for /u })
  await firstPicker.waitFor()
  assert.equal(await firstPicker.getByRole('checkbox', { name: 'Calendar' }).isChecked(), true)
  assert.equal(await firstPicker.getByRole('checkbox', { name: 'Family' }).isChecked(), false)
  await capture(page, viewport, 'calendar-selection', output, evidence, repoRoot, { state: 'calendar-selection' })
  await firstPicker.getByRole('checkbox', { name: 'Family' }).check()
  await page.getByRole('button', { name: 'Add to Tab Two' }).click()
  await page.getByRole('heading', { name: 'Personal and work, clearly separated.' }).waitFor()
  await page.getByRole('button', { name: 'Add another Microsoft account' }).click()
  const secondPicker = page.getByRole('group', { name: /Calendars for /u })
  await secondPicker.waitFor()
  await page.getByRole('button', { name: 'Add to Tab Two' }).click()
  await page.getByText('PERSONAL', { exact: true }).waitFor()
  await page.getByText('WORK OR SCHOOL', { exact: true }).waitFor()
  await capture(page, viewport, 'personal-and-work', output, evidence, repoRoot, { state: 'personal-and-work' })

  const remove = page.getByRole('button', { name: 'Remove alex@contoso.test' })
  await remove.click()
  const dialog = page.getByRole('alertdialog', { name: 'Remove alex@contoso.test?' })
  await dialog.waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  evidence.interactions.focusRestored = await remove.evaluate((node) => document.activeElement === node)

  await page.evaluate(async ({ personalConnection, workConnection }) => {
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    await chrome.storage.local.set({
      metricsHistory: {
        version: 1,
        installationId: '11111111-1111-4111-8111-111111111111',
        buckets: [personalConnection, workConnection].map((connectionId, index) => ({
          schemaVersion: 1,
          id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          date,
          source: 'calendar', sourceInstanceId: connectionId,
          installationId: '11111111-1111-4111-8111-111111111111',
          sequence: index + 1,
          values: { kind: 'calendar', events: index + 1, busyMinutes: (index + 1) * 45 },
        })),
      },
    })
  }, { personalConnection: PERSONAL_CONNECTION, workConnection: WORK_CONNECTION })
  await remove.click()
  const confirmed = page.getByRole('alertdialog', { name: 'Remove alex@contoso.test?' })
  await confirmed.getByRole('checkbox', { name: /Also delete this account's calendar-load history/iu }).check()
  await capture(page, viewport, 'disconnect-history', output, evidence, repoRoot, { state: 'disconnect-history' })
  await confirmed.getByRole('button', { name: 'Disconnect account' }).click()
  await page.waitForFunction(async (remainingConnection) => {
    const stored = await chrome.storage.local.get(['connectors', 'metricsHistory'])
    return stored.connectors?.microsoftCalendar?.accounts?.length === 1
      && stored.connectors.microsoftCalendar.accounts[0]?.connectionId === remainingConnection
      && stored.metricsHistory?.buckets?.length === 1
      && stored.metricsHistory.buckets[0]?.sourceInstanceId === remainingConnection
  }, PERSONAL_CONNECTION)

  await page.getByRole('button', { name: /Close Microsoft Calendar/u }).click()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await seedMicrosoftState(page, { includeIcs: true, placement: 'free', tier: 'full' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const calendar = page.getByRole('region', { name: 'Calendar' })
  await calendar.waitFor()
  for (const value of ['Personal planning', 'Family dinner', 'Project review', 'Local appointment']) {
    await calendar.getByText(value, { exact: false }).first().waitFor()
  }
  await capture(page, viewport, 'composed-calendar-full', output, evidence, repoRoot, { state: 'composed-calendar-full' })

  await seedMicrosoftState(page, { includeIcs: true, placement: 'stack', tier: 'compact' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-stack-card="microsoft-calendar-stack"]').waitFor()
  await page.getByRole('region', { name: 'Calendar' }).waitFor()
  await capture(page, viewport, 'composed-calendar-stacked', output, evidence, repoRoot, { state: 'composed-calendar-stacked' })

  await seedMicrosoftState(page, { includeIcs: true, placement: 'dock', tier: 'full' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByLabel(/^Calendar:/u).waitFor()
  await capture(page, viewport, 'composed-calendar-docked', output, evidence, repoRoot, { state: 'composed-calendar-docked' })
}

async function exerciseOrganization(page, viewport, output, evidence, repoRoot) {
  await loadPreviewState(page, 'organization-approval')
  await clearMicrosoftState(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const { card } = await openMicrosoftCard(page)
  await card.getByRole('button', { name: 'Set up Microsoft Calendar' }).click()
  await page.getByRole('button', { name: 'Continue with Microsoft' }).click()
  await page.getByRole('heading', {
    name: 'Your organization needs to approve Tab Two before this account can connect.',
  }).waitFor()
  await capture(page, viewport, 'organization-approval', output, evidence, repoRoot, { state: 'organization-approval' })
}

async function exerciseShort(page, viewport, output, evidence, repoRoot) {
  await loadPreviewState(page)
  await seedMicrosoftState(page, { issue: 'forbidden' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  let opened = await openMicrosoftCard(page)
  await opened.card.getByRole('button', { name: 'Edit Microsoft Calendar' }).click()
  await page.getByText('Needs attention', { exact: true }).first().waitFor()
  assert(await page.getByText('Up to date', { exact: true }).first().isVisible())
  await capture(page, viewport, 'partial-account', output, evidence, repoRoot, {
    state: 'partial-account', recordViewport: true,
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await seedMicrosoftState(page, { issue: 'reconnect_required' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  opened = await openMicrosoftCard(page)
  await opened.card.getByRole('button', { name: 'Edit Microsoft Calendar' }).click()
  await page.getByRole('button', { name: 'Reconnect alex@contoso.test' }).waitFor()
  const retained = await page.evaluate(async () => {
    const stored = await chrome.storage.local.get('connectorSnapshots')
    return stored.connectorSnapshots?.microsoftCalendar?.data?.calendars?.some((calendar) => calendar.events?.length > 0)
  })
  assert.equal(retained, true, 'reconnect state did not retain the last complete snapshot')
  await capture(page, viewport, 'reconnect-retained', output, evidence, repoRoot, { state: 'reconnect-retained' })
}

async function exerciseUltrawide(page, viewport, output, evidence, repoRoot) {
  await loadPreviewState(page)
  await seedMicrosoftState(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const { card } = await openMicrosoftCard(page)
  await card.getByRole('button', { name: 'Edit Microsoft Calendar' }).click()
  await page.getByText('PERSONAL', { exact: true }).waitFor()
  await page.getByText('WORK OR SCHOOL', { exact: true }).waitFor()
  await capture(page, viewport, 'personal-and-work-ultrawide', output, evidence, repoRoot, { recordViewport: true })
}

async function exerciseTouch(page, viewport, output, evidence, repoRoot) {
  await loadPreviewState(page)
  await clearMicrosoftState(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const { card } = await openMicrosoftCard(page)
  await card.getByRole('button', { name: 'Set up Microsoft Calendar' }).tap()
  const continueButton = page.getByRole('button', { name: 'Continue with Microsoft' })
  const continueBox = await continueButton.boundingBox()
  assert(continueBox)
  evidence.touchTargets.push({ name: 'Continue with Microsoft', width: continueBox.width, height: continueBox.height })
  await continueButton.tap()
  const picker = page.getByRole('group', { name: /Calendars for /u })
  await picker.waitFor()
  const rowBox = await picker.getByRole('checkbox', { name: 'Calendar' }).locator('..').boundingBox()
  assert(rowBox)
  evidence.touchTargets.push({ name: 'Calendar selection row', width: rowBox.width, height: rowBox.height })
  await capture(page, viewport, 'touch-selection', output, evidence, repoRoot, {
    state: 'touch-selection', recordViewport: true,
  })
}

async function inspectStorage(page) {
  return page.evaluate(async () => {
    const stored = await chrome.storage.local.get(null)
    const secretValues = []
    const inspect = (value, path) => {
      if (typeof value === 'string'
        && /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|sb_secret_|Bearer\s+[A-Za-z0-9._~-]|preview-microsoft-calendar-authority|eyJ[A-Za-z0-9_-]+\.)/u.test(value)) {
        secretValues.push(path)
      } else if (Array.isArray(value)) {
        value.forEach((child, index) => inspect(child, `${path}[${index}]`))
      } else if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, child]) => inspect(child, `${path}.${key}`))
      }
    }
    inspect(stored, 'storage')
    return { keys: Object.keys(stored).sort(), unexpectedKeys: [], secretValues }
  })
}

export async function runMicrosoftCalendarQa(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  assertExactBuildTrackedStatus(execFileSync(
    'git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' },
  ))
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const dist = resolve(repoRoot, 'dist')
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'tab-two-microsoft-calendar-'))
  const previewDist = resolve(temporaryRoot, 'preview-dist')
  const accountLocalDist = resolve(temporaryRoot, 'account-local-dist')
  const previewText = artifactText(dist)
  assert(PREVIEW_MARKERS.every((marker) => previewText.includes(marker)), 'dist is not the exact preview Microsoft Calendar build')
  const previewBuild = readBuild(dist, sourceSha, 'preview', true)
  cpSync(dist, previewDist, { recursive: true })

  execFileSync(process.execPath, [resolve(repoRoot, 'scripts/build.mjs'), '--mode=account-local'], { cwd: repoRoot, stdio: 'inherit' })
  const accountLocalText = artifactText(dist)
  const accountLocalBuild = readBuild(dist, sourceSha, 'account-local', false)
  cpSync(dist, accountLocalDist, { recursive: true })
  execFileSync(process.execPath, [resolve(repoRoot, 'scripts/build.mjs')], { cwd: repoRoot, stdio: 'inherit' })
  const productionText = artifactText(dist)
  const productionBuild = readBuild(dist, sourceSha, 'production', false)
  assertArtifactIsolation(productionText, accountLocalText, previewText)

  const output = resolve(repoRoot, 'docs/superpowers/qa/microsoft-calendar', sourceSha)
  mkdirSync(output, { recursive: true })
  const evidence = {
    result: 'FAIL',
    sourceSha,
    exact: true,
    dataClassification: 'synthetic-only',
    ownerDataPresent: false,
    builds: { production: productionBuild, accountLocal: accountLocalBuild, preview: previewBuild },
    extensionIds: {},
    states: {},
    viewports: [],
    interactions: { keyboardFocus: false, focusRestored: false, permissionDisclosureVisible: false },
    storage: { keys: [], unexpectedKeys: [], secretValues: [] },
    requests: [],
    wireRequests: [],
    unexpectedOrigins: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    touchTargets: [],
    reducedMotion: { passed: false, animationName: '' },
    screenshots: [],
  }
  const profiles = Array.from({ length: 7 }, (_, index) => mkdtempSync(resolve(tmpdir(), `tab-two-microsoft-calendar-${index}-`)))
  const contexts = []
  try {
    const production = await launchInstalled(profiles[0], dist, MICROSOFT_CALENDAR_VIEWPORTS[0], evidence, 'production-locked', 'production')
    contexts.push(production.context)
    await exerciseLocked(production.page, MICROSOFT_CALENDAR_VIEWPORTS[0], output, evidence, repoRoot)
    await production.context.close()
    contexts.pop()

    const accountLocal = await launchInstalled(profiles[1], accountLocalDist, MICROSOFT_CALENDAR_VIEWPORTS[0], evidence, 'account-local', 'accountLocal')
    contexts.push(accountLocal.context)
    const accountLocalRequestCount = evidence.requests.length
    await accountLocal.page.waitForTimeout(100)
    assert.equal(evidence.requests.length, accountLocalRequestCount)
    await accountLocal.context.close()
    contexts.pop()

    const desktop = await launchInstalled(profiles[2], previewDist, MICROSOFT_CALENDAR_VIEWPORTS[0], evidence, 'preview-desktop', 'preview')
    contexts.push(desktop.context)
    await exerciseDesktop(desktop.page, MICROSOFT_CALENDAR_VIEWPORTS[0], output, evidence, repoRoot)
    evidence.storage = await inspectStorage(desktop.page)
    await desktop.context.close()
    contexts.pop()

    const organization = await launchInstalled(profiles[3], previewDist, MICROSOFT_CALENDAR_VIEWPORTS[0], evidence, 'organization-approval', 'preview')
    contexts.push(organization.context)
    await exerciseOrganization(organization.page, MICROSOFT_CALENDAR_VIEWPORTS[0], output, evidence, repoRoot)
    await organization.context.close()
    contexts.pop()

    const short = await launchInstalled(profiles[4], previewDist, MICROSOFT_CALENDAR_VIEWPORTS[1], evidence, 'preview-short', 'preview')
    contexts.push(short.context)
    await exerciseShort(short.page, MICROSOFT_CALENDAR_VIEWPORTS[1], output, evidence, repoRoot)
    await short.context.close()
    contexts.pop()

    const ultrawide = await launchInstalled(profiles[5], previewDist, MICROSOFT_CALENDAR_VIEWPORTS[2], evidence, 'preview-ultrawide', 'preview')
    contexts.push(ultrawide.context)
    await exerciseUltrawide(ultrawide.page, MICROSOFT_CALENDAR_VIEWPORTS[2], output, evidence, repoRoot)
    await ultrawide.context.close()
    contexts.pop()

    const touch = await launchInstalled(profiles[6], previewDist, MICROSOFT_CALENDAR_VIEWPORTS[3], evidence, 'preview-touch', 'preview')
    contexts.push(touch.context)
    await exerciseTouch(touch.page, MICROSOFT_CALENDAR_VIEWPORTS[3], output, evidence, repoRoot)
    await touch.context.close()
    contexts.pop()

    evidence.result = 'PASS'
    assertEvidenceContract(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`PASS: Tab Two Microsoft Calendar QA (${sourceSha})`)
    return evidence
  } catch (error) {
    evidence.failure = String(error?.stack ?? error)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    throw error
  } finally {
    for (const context of contexts.reverse()) await context.close().catch(() => undefined)
    for (const profile of profiles) {
      assert(profile.startsWith(tmpdir()), `unsafe Microsoft Calendar QA profile path: ${profile}`)
      rmSync(profile, { recursive: true, force: true })
    }
    assert(temporaryRoot.startsWith(tmpdir()), `unsafe Microsoft Calendar QA temporary path: ${temporaryRoot}`)
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runMicrosoftCalendarQa()
}
