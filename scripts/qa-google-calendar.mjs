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
  'preview-google-calendar-access-token',
])
const ACCOUNT_ID = '43000000-0000-4000-8000-000000000001'
const HOME_CONNECTION = '63000000-0000-4000-8000-000000000001'
const WORK_CONNECTION = '63000000-0000-4000-8000-000000000002'

export const GOOGLE_CALENDAR_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1600, height: 900, touch: false }),
  Object.freeze({ id: 'short', width: 1408, height: 600, touch: false }),
  Object.freeze({ id: 'ultrawide', width: 3440, height: 1440, touch: false }),
  Object.freeze({ id: 'touch', width: 390, height: 844, touch: true }),
])

export const GOOGLE_CALENDAR_INTERACTIONS = Object.freeze([
  'production-locked',
  'account-local-locked',
  'preconsent',
  'discovery-loading',
  'reduced-motion',
  'calendar-picker',
  'default-selection',
  'save-announcement',
  'add-account',
  'reload-persistence',
  'partial-account',
  'offline-retained',
  'expired-retained',
  'disconnect-cancel',
  'disconnect-confirm',
  'history-delete-scoped',
  'calendar-composed',
  'calendar-full',
  'calendar-docked',
  'calendar-stacked',
  'metrics-aggregate-only',
  'keyboard-focus',
  'touch-controls',
  'no-overflow',
])

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two Google Calendar QA requires --exact')
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
  }
  for (const marker of PREVIEW_MARKERS) {
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

function assertBuild(build, commit, mode, previewFixture) {
  assert.equal(build?.commit, commit, `${mode} build provenance does not match HEAD`)
  assert.equal(build?.mode, mode, `${mode} build mode is incorrect`)
  assert.equal(build?.previewFixture, previewFixture, `${mode} fixture-isolation result is incorrect`)
}

export function assertEvidenceContract(evidence) {
  assert.equal(evidence.result, 'PASS', 'Google Calendar evidence result is not PASS')
  assert.equal(typeof evidence.commit, 'string', 'Google Calendar evidence commit is missing')
  assertBuild(evidence.builds?.production, evidence.commit, 'production', false)
  assertBuild(evidence.builds?.accountLocal, evidence.commit, 'account-local', false)
  assertBuild(evidence.builds?.preview, evidence.commit, 'preview', true)
  assert.equal(evidence.execution?.production, 'installed-extension')
  assert.equal(evidence.execution?.accountLocal, 'installed-extension')
  assert.equal(evidence.execution?.preview, 'installed-extension')
  for (const interaction of GOOGLE_CALENDAR_INTERACTIONS) {
    assert.equal(evidence.interactions?.[interaction], true, `Google Calendar interaction ${interaction} is missing or failed`)
  }
  assert.equal(evidence.viewports?.length, GOOGLE_CALENDAR_VIEWPORTS.length, 'Google Calendar viewport evidence is incomplete')
  for (const expected of GOOGLE_CALENDAR_VIEWPORTS) {
    const actual = evidence.viewports.find((entry) => entry.viewport?.id === expected.id)
    assert(actual, `Google Calendar viewport ${expected.id} is missing`)
    assert.deepEqual(actual.viewport, expected)
    assert.equal(actual.horizontalOverflow, false, `${expected.id} has horizontal overflow`)
    assert.deepEqual(actual.escaped, [], `${expected.id} has escaped horizontal geometry`)
    assert.equal(typeof actual.screenshotPath, 'string')
  }
  assert.deepEqual(evidence.unexpectedRequests, [], 'Google Calendar QA made an unexpected request')
  assert.deepEqual(evidence.consoleErrors, [], 'Google Calendar QA emitted console errors')
  assert.deepEqual(evidence.pageErrors, [], 'Google Calendar QA emitted page errors')
  assert.deepEqual(evidence.failedRequests, [], 'Google Calendar QA emitted failed requests')
  return evidence
}

function readBuild(root, commit, mode, previewFixture) {
  const provenance = JSON.parse(readFileSync(resolve(root, 'build-provenance.json'), 'utf8'))
  assert.equal(provenance.commit, commit, `${mode} build provenance does not match HEAD`)
  return { commit, mode, previewFixture }
}

function json(route, value) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(value),
  })
}

function calendarListFixture() {
  return {
    items: [
      { id: 'primary', summary: 'Personal', primary: true, selected: true, accessRole: 'owner', backgroundColor: '#4285f4', foregroundColor: '#ffffff' },
      { id: 'family@example.test', summary: 'Family', selected: true, accessRole: 'reader', backgroundColor: '#0b8043', foregroundColor: '#ffffff' },
    ],
  }
}

function eventFixture(url) {
  const calendarId = decodeURIComponent(url.pathname.split('/').at(-2) ?? 'calendar')
  const start = new Date(Date.now() + 60 * 60_000)
  const end = new Date(start.getTime() + 45 * 60_000)
  return {
    items: [{
      id: `fixture-${calendarId.replace(/[^a-z0-9]/giu, '-')}`,
      status: 'confirmed',
      summary: calendarId === 'primary' ? 'Product review' : 'Family dinner',
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      updated: new Date().toISOString(),
      htmlLink: 'https://calendar.google.com/calendar/event?eid=fixture',
    }],
    nextSyncToken: `sync-${calendarId}`,
  }
}

function attachLedgers(page, evidence, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push({ label, text: message.text() })
  })
  page.on('pageerror', (error) => evidence.pageErrors.push({ label, text: error.message }))
  page.on('requestfailed', (request) => evidence.failedRequests.push({
    label, method: request.method(), url: request.url(), failure: request.failure()?.errorText,
  }))
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
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  let delayDiscovery = false
  await context.route(/^https?:\/\//u, async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/calendar/v3/users/me/calendarList') {
      evidence.allowedRequests.push({ label, method: route.request().method(), kind: 'calendar-list' })
      if (delayDiscovery) await new Promise((done) => setTimeout(done, 450))
      return json(route, calendarListFixture())
    }
    if (url.hostname === 'www.googleapis.com' && /\/calendar\/v3\/calendars\/[^/]+\/events$/u.test(url.pathname)) {
      evidence.allowedRequests.push({ label, method: route.request().method(), kind: 'calendar-events' })
      return json(route, eventFixture(url))
    }
    evidence.unexpectedRequests.push({ label, method: route.request().method(), url: route.request().url() })
    return route.abort('blockedbyclient')
  })
  const page = context.pages()[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  attachLedgers(page, evidence, label)
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  return {
    context,
    page,
    setDiscoveryDelay(value) { delayDiscovery = value },
  }
}

async function loadAccountState(page, state) {
  const url = new URL(page.url())
  url.search = ''
  if (state) url.searchParams.set('accountState', state)
  await page.goto(url.href, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
}

async function openGoogleCard(page) {
  await page.locator('.settings-gear').click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor()
  await settings.getByRole('tab', { name: 'Connectors' }).click()
  const card = page.locator('[data-connector-card="googleCalendar"]')
  await card.scrollIntoViewIfNeeded()
  return { settings, card }
}

async function geometry(page) {
  return page.evaluate(() => {
    const candidates = [
      ...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-connector-card="googleCalendar"], [data-testid="canvas-item-ics"], [data-stack-card]'),
    ].filter((node) => node instanceof HTMLElement && getComputedStyle(node).display !== 'none' && node.getAttribute('aria-hidden') !== 'true')
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      rects: candidates.map((node, index) => {
        const rect = node.getBoundingClientRect()
        return { id: node.getAttribute('aria-label') ?? node.getAttribute('data-testid') ?? `surface-${index}`, left: rect.left, right: rect.right }
      }),
    }
  })
}

async function capture(page, viewport, id, output, evidence, repoRoot, recordViewport = false) {
  const path = resolve(output, `${id}.png`)
  await page.screenshot({ path })
  const measured = inspectGeometry(await geometry(page))
  assert.equal(measured.horizontalOverflow, false, `${id} has horizontal overflow`)
  assert.deepEqual(measured.escaped, [], `${id} has escaped horizontal geometry`)
  const screenshotPath = relative(repoRoot, path).replaceAll('\\', '/')
  evidence.screenshots.push({ id, viewport, screenshotPath, ...measured })
  if (recordViewport) evidence.viewports.push({ viewport, screenshotPath, ...measured })
}

async function seedGoogleState(page, { issue = null, includeIcs = false, placement = 'free', tier = 'full' } = {}) {
  await page.evaluate(async ({ accountId, homeConnection, workConnection, issue, includeIcs, placement, tier }) => {
    const canonical = (value) => {
      if (value === null) return 'null'
      if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
      if (typeof value === 'number') return JSON.stringify(value)
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
    const googleCalendar = {
      enabled: true,
      accountId,
      accounts: [{
        connectionId: homeConnection,
        displayEmail: 'alex@example.test',
        calendars: [
          { calendarId: 'primary', name: 'Personal', color: '#4285f4', primary: true },
          { calendarId: 'family@example.test', name: 'Family', color: '#0b8043', primary: false },
        ],
      }, {
        connectionId: workConnection,
        displayEmail: 'work@example.test',
        calendars: [{ calendarId: 'primary', name: 'Work', color: '#7986cb', primary: true }],
      }],
    }
    const now = Date.now()
    const start = now + 60 * 60_000
    const end = start + 45 * 60_000
    const source = (connectionId, calendarId, color, label) => ({
      connectionId, calendarId, color,
      windowStart: now - 31 * 86_400_000,
      windowEnd: now + 62 * 86_400_000,
      syncToken: `sync-${connectionId}-${calendarId}`,
      events: [{
        eventId: `event-${connectionId}-${calendarId}`,
        title: label,
        status: 'confirmed',
        start, end, allDay: false, startDate: null, endDate: null,
        updatedAt: now,
        calendarUrl: 'https://calendar.google.com/calendar/event?eid=fixture',
      }],
    })
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const googleData = {
      version: 1,
      fetchedAt: now,
      calendars: [
        source(homeConnection, 'primary', '#4285f4', 'Product review'),
        source(homeConnection, 'family@example.test', '#0b8043', 'Family dinner'),
        source(workConnection, 'primary', '#7986cb', 'Work planning'),
      ],
      ...(issue ? { connectionIssues: [{ connectionId: workConnection, code: issue }] } : {}),
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const connectorSnapshots = {
      googleCalendar: {
        fetchedAt: now,
        scope: await scope('googleCalendar', googleCalendar, { accountId, timeZone }),
        data: googleData,
      },
    }
    const connectors = { googleCalendar }
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
    widgets.notes = placement === 'stack'
    const layout = {
      id: `google-calendar-${placement}-${tier}`,
      name: 'Google Calendar acceptance',
      widgets: {
        clock: { kind: 'free', anchor: 'top-right', offsetX: -8, offsetY: 8, tier: 'compact', layer: 2 },
        greeting: { kind: 'hidden' },
        focus: { kind: 'hidden' },
      },
    }
    if (placement === 'free') layout.widgets.ics = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 1 }
    else if (placement === 'dock') layout.widgets.ics = { kind: 'docked', dock: 'bottom', order: 0, x: 50, y: 50, tier: 'compact', returnTier: tier }
    else layout.stacks = [{ id: 'google-calendar-stack', members: ['ics', 'notes'], facing: 'ics', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'compact', layer: 1 }]
    await chrome.storage.local.set({
      settings: { ...current.settings, muted: true, widgets },
      connectors,
      connectorSnapshots,
      refreshPreferences: { googleCalendar: 'manual', ...(includeIcs ? { ics: 'manual' } : {}) },
      layouts: { version: 1, activeLayoutId: layout.id, layouts: [layout] },
      calendarPreferences: { [layout.id]: { defaultView: 'agenda', includePublicHolidays: false } },
      notes: { text: 'Calendar stack peer', updatedAt: now },
      metricsHistory: {
        version: 1,
        installationId: '11111111-1111-4111-8111-111111111111',
        buckets: [homeConnection, workConnection].map((connectionId, index) => ({
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
  }, { accountId: ACCOUNT_ID, homeConnection: HOME_CONNECTION, workConnection: WORK_CONNECTION, issue, includeIcs, placement, tier })
}

async function clearGoogleState(page) {
  await page.evaluate(async () => {
    const current = await chrome.storage.local.get(['connectors', 'connectorSnapshots', 'refreshPreferences', 'metricsHistory'])
    const connectors = { ...(current.connectors ?? {}) }
    const snapshots = { ...(current.connectorSnapshots ?? {}) }
    const preferences = { ...(current.refreshPreferences ?? {}) }
    delete connectors.googleCalendar
    delete snapshots.googleCalendar
    delete preferences.googleCalendar
    await chrome.storage.local.set({ connectors, connectorSnapshots: snapshots, refreshPreferences: preferences, metricsHistory: null })
  })
}

async function exerciseLocked(page, viewport, output, evidence, repoRoot, key) {
  const { card } = await openGoogleCard(page)
  await card.getByText('Premium').waitFor()
  await card.getByRole('button', { name: 'Set up Google Calendar' }).click()
  await page.getByRole('heading', { name: 'One calendar, across every Google account.' }).waitFor()
  evidence.interactions[key] = true
  await capture(page, viewport, key, output, evidence, repoRoot)
}

async function exerciseDesktop(page, viewport, output, evidence, repoRoot, setDiscoveryDelay) {
  await loadAccountState(page, 'active')
  await clearGoogleState(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const { card } = await openGoogleCard(page)
  await card.getByRole('button', { name: 'Set up Google Calendar' }).click()
  await page.getByRole('heading', { name: 'Choose what appears in Tab Two.' }).waitFor()
  assert(await page.getByText('Your calendar stays yours.').isVisible())
  evidence.interactions.preconsent = true
  await capture(page, viewport, 'preconsent-desktop', output, evidence, repoRoot)

  const continueButton = page.getByRole('button', { name: 'Continue with Google' })
  await continueButton.focus()
  assert(await continueButton.evaluate((node) => document.activeElement === node), 'Google connect control did not accept keyboard focus')
  evidence.interactions['keyboard-focus'] = true
  setDiscoveryDelay(true)
  await continueButton.click()
  await page.getByText('Loading your calendars…').waitFor()
  evidence.interactions['discovery-loading'] = true
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.getByTestId('google-calendar-spinner').evaluate((node) => getComputedStyle(node).animationName), 'none')
  evidence.interactions['reduced-motion'] = true
  await capture(page, viewport, 'discovery-loading-desktop', output, evidence, repoRoot)

  const picker = page.getByRole('group', { name: 'Calendars for alex@example.test' })
  await picker.waitFor()
  evidence.interactions['calendar-picker'] = true
  assert.equal(await picker.getByRole('checkbox', { name: 'Personal' }).isChecked(), true)
  assert.equal(await picker.getByRole('checkbox', { name: 'Family' }).isChecked(), false)
  evidence.interactions['default-selection'] = true
  await picker.getByRole('checkbox', { name: 'Family' }).check()
  await page.getByRole('button', { name: 'Add to Tab Two' }).click()
  const summary = page.getByRole('heading', { name: 'Your connected account' })
  try {
    await summary.waitFor({ timeout: 5_000 })
  } catch (error) {
    const diagnosticPath = resolve(output, 'save-failure-desktop.png')
    await page.screenshot({ path: diagnosticPath })
    evidence.diagnostics = {
      save: {
        screenshotPath: relative(repoRoot, diagnosticPath).replaceAll('\\', '/'),
        text: await page.locator('body').innerText(),
        storage: await page.evaluate(() => chrome.storage.local.get(['connectors', 'connectorSnapshots'])),
      },
    }
    throw error
  }
  assert(await summary.evaluate((node) => document.activeElement === node), 'save did not focus the connected-account summary')
  assert(await page.getByRole('status').filter({ hasText: 'Google Calendar is connected.' }).isVisible())
  evidence.interactions['save-announcement'] = true

  setDiscoveryDelay(false)
  await page.getByRole('button', { name: 'Add another account' }).click()
  await page.getByRole('group', { name: 'Calendars for work@example.test' }).waitFor()
  await page.getByRole('button', { name: 'Add to Tab Two' }).click()
  await page.getByRole('heading', { name: 'Your connected accounts' }).waitFor()
  assert.equal(await page.getByText('Up to date').count(), 2)
  evidence.interactions['add-account'] = true
  await capture(page, viewport, 'two-accounts-desktop', output, evidence, repoRoot, true)

  await page.getByRole('button', { name: /Close Google Calendar/ }).click()
  assert(await card.getByText('2 accounts · 3 calendars').isVisible())
  await page.reload({ waitUntil: 'domcontentloaded' })
  const reopened = await openGoogleCard(page)
  assert(await reopened.card.getByText('2 accounts · 3 calendars').isVisible())
  await reopened.card.getByRole('button', { name: 'Edit Google Calendar' }).click()
  await page.getByRole('heading', { name: 'Your connected accounts' }).waitFor()
  evidence.interactions['reload-persistence'] = true

  await page.evaluate(async ({ homeConnection, workConnection }) => {
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    await chrome.storage.local.set({
      metricsHistory: {
        version: 1,
        installationId: '11111111-1111-4111-8111-111111111111',
        buckets: [homeConnection, workConnection].map((connectionId, index) => ({
          schemaVersion: 1,
          id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          date,
          source: 'calendar',
          sourceInstanceId: connectionId,
          installationId: '11111111-1111-4111-8111-111111111111',
          sequence: index + 1,
          values: { kind: 'calendar', events: index + 1, busyMinutes: (index + 1) * 45 },
        })),
      },
    })
  }, { homeConnection: HOME_CONNECTION, workConnection: WORK_CONNECTION })
  await page.evaluate(() => {
    globalThis.__googleCalendarConnectorChanges = []
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.connectors) {
        globalThis.__googleCalendarConnectorChanges.push({
          at: performance.now(),
          accounts: changes.connectors.newValue?.googleCalendar?.accounts?.map((account) => account.connectionId) ?? [],
        })
      }
    })
  })

  const remove = page.getByRole('button', { name: 'Remove alex@example.test' })
  await remove.click()
  const confirmation = page.getByRole('alertdialog', { name: 'Remove alex@example.test?' })
  await confirmation.waitFor()
  await page.keyboard.press('Escape')
  await confirmation.waitFor({ state: 'detached' })
  assert(await remove.evaluate((node) => document.activeElement === node), 'disconnect cancel did not restore exact focus')
  evidence.interactions['disconnect-cancel'] = true

  await remove.click()
  const confirmed = page.getByRole('alertdialog', { name: 'Remove alex@example.test?' })
  await confirmed.getByRole('checkbox', { name: /Also delete this account’s Metrics history/i }).check()
  await confirmed.getByRole('button', { name: 'Disconnect account' }).click()
  await page.getByRole('heading', { name: 'Your connected account' }).waitFor()
  await page.waitForFunction(async (remainingConnection) => {
    const stored = await chrome.storage.local.get('connectors')
    return stored.connectors?.googleCalendar?.accounts?.length === 1
      && stored.connectors.googleCalendar.accounts[0]?.connectionId === remainingConnection
  }, WORK_CONNECTION)
  await page.waitForTimeout(500)
  const postDisconnect = await page.evaluate(() => chrome.storage.local.get(['connectors', 'metricsHistory']))
  if (postDisconnect.connectors.googleCalendar.accounts.length !== 1) {
    evidence.diagnostics = {
      ...(evidence.diagnostics ?? {}),
      disconnect: {
        changes: await page.evaluate(() => globalThis.__googleCalendarConnectorChanges),
        storage: postDisconnect,
      },
    }
  }
  assert.equal(postDisconnect.connectors.googleCalendar.accounts.length, 1)
  assert.equal(postDisconnect.connectors.googleCalendar.accounts[0].connectionId, WORK_CONNECTION)
  assert(postDisconnect.metricsHistory.buckets.every((bucket) => bucket.sourceInstanceId !== HOME_CONNECTION))
  assert(postDisconnect.metricsHistory.buckets.some((bucket) => bucket.sourceInstanceId === WORK_CONNECTION))
  evidence.interactions['disconnect-confirm'] = true
  evidence.interactions['history-delete-scoped'] = true

  await page.getByRole('button', { name: /Close Google Calendar/ }).click()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await seedGoogleState(page, { includeIcs: true, placement: 'free', tier: 'full' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const calendar = page.getByRole('region', { name: 'Calendar' })
  await calendar.waitFor()
  for (const value of ['Product review', 'Family dinner', 'Work planning', 'Local appointment']) {
    assert(await calendar.getByText(value, { exact: false }).first().isVisible(), `composed Calendar is missing ${value}`)
  }
  evidence.interactions['calendar-composed'] = true
  evidence.interactions['calendar-full'] = true
  const metrics = await page.evaluate(() => chrome.storage.local.get('metricsHistory'))
  const googleSeries = metrics.metricsHistory.buckets.filter((bucket) => bucket.source === 'calendar' && [HOME_CONNECTION, WORK_CONNECTION].includes(bucket.sourceInstanceId))
  assert.equal(googleSeries.length, 2)
  assert(!JSON.stringify(googleSeries).match(/title|email|calendarId|eventId|sync/i), 'Metrics leaked Google metadata')
  evidence.interactions['metrics-aggregate-only'] = true
  await capture(page, viewport, 'composed-calendar-full-desktop', output, evidence, repoRoot)

  await seedGoogleState(page, { includeIcs: true, placement: 'dock', tier: 'full' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-dock-line]').filter({ hasText: 'Calendar' }).waitFor()
  evidence.interactions['calendar-docked'] = true
  await capture(page, viewport, 'composed-calendar-docked-desktop', output, evidence, repoRoot)

  await seedGoogleState(page, { includeIcs: true, placement: 'stack', tier: 'compact' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-stack-card="google-calendar-stack"]').waitFor()
  await page.getByRole('region', { name: 'Calendar' }).waitFor()
  evidence.interactions['calendar-stacked'] = true
  await capture(page, viewport, 'composed-calendar-stacked-desktop', output, evidence, repoRoot)

  await seedGoogleState(page, { issue: 'reconnect_required' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openGoogleCard(page)
  await page.locator('[data-connector-card="googleCalendar"]').getByRole('button', { name: 'Edit Google Calendar' }).click()
  await page.getByText('Reconnect needed').waitFor()
  assert(await page.getByText('Up to date').isVisible())
  evidence.interactions['partial-account'] = true
  await capture(page, viewport, 'partial-account-desktop', output, evidence, repoRoot)

  await page.getByRole('button', { name: /Close Google Calendar/ }).click()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await seedGoogleState(page, { issue: 'offline' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const offline = await openGoogleCard(page)
  await offline.card.getByRole('button', { name: 'Edit Google Calendar' }).click()
  await page.getByText('Offline. Saved events remain available.').waitFor()
  evidence.interactions['offline-retained'] = true

  await page.getByRole('button', { name: /Close Google Calendar/ }).click()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await loadAccountState(page, 'signed-in')
  const expired = await openGoogleCard(page)
  await expired.card.getByRole('button', { name: 'Edit Google Calendar' }).click()
  await page.getByRole('heading', { name: 'Your Google calendars are saved.' }).waitFor()
  assert(await page.getByText('Premium access paused · 2 saved accounts').isVisible())
  evidence.interactions['expired-retained'] = true
  await capture(page, viewport, 'expired-retained-desktop', output, evidence, repoRoot)
}

async function exerciseResponsive(page, viewport, output, evidence, repoRoot) {
  await loadAccountState(page, 'active')
  if (viewport.touch) {
    await clearGoogleState(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    const { card } = await openGoogleCard(page)
    await card.getByRole('button', { name: 'Set up Google Calendar' }).tap()
    const continueButton = page.getByRole('button', { name: 'Continue with Google' })
    const continueBox = await continueButton.boundingBox()
    assert(continueBox && continueBox.height >= 44, 'touch connect control is below 44px')
    await continueButton.tap()
    const picker = page.getByRole('group', { name: 'Calendars for alex@example.test' })
    await picker.waitFor()
    const rowBox = await picker.getByRole('checkbox', { name: 'Personal' }).locator('..').boundingBox()
    assert(rowBox && rowBox.height >= 44, 'touch calendar row is below 44px')
    evidence.interactions['touch-controls'] = true
    await capture(page, viewport, 'calendar-picker-touch', output, evidence, repoRoot, true)
    return
  }
  await seedGoogleState(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const { card } = await openGoogleCard(page)
  await card.getByRole('button', { name: 'Edit Google Calendar' }).click()
  await page.getByRole('heading', { name: 'Your connected accounts' }).waitFor()
  await capture(page, viewport, `two-accounts-${viewport.id}`, output, evidence, repoRoot, true)
}

export async function runGoogleCalendarQa(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  assertExactBuildTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }))
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const dist = resolve(repoRoot, 'dist')
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'tab-two-google-calendar-'))
  const previewDist = resolve(temporaryRoot, 'preview-dist')
  const accountLocalDist = resolve(temporaryRoot, 'account-local-dist')
  const previewText = artifactText(dist)
  const previewFixture = PREVIEW_MARKERS.every((marker) => previewText.includes(marker))
  assert(previewFixture, 'dist is not the required exact preview Google Calendar build')
  const previewBuild = readBuild(dist, commit, 'preview', true)
  cpSync(dist, previewDist, { recursive: true })

  execFileSync(process.execPath, [resolve(repoRoot, 'scripts/build.mjs'), '--mode=account-local'], { cwd: repoRoot, stdio: 'inherit' })
  const accountLocalText = artifactText(dist)
  const accountLocalBuild = readBuild(dist, commit, 'account-local', false)
  cpSync(dist, accountLocalDist, { recursive: true })
  execFileSync(process.execPath, [resolve(repoRoot, 'scripts/build.mjs')], { cwd: repoRoot, stdio: 'inherit' })
  const productionText = artifactText(dist)
  const productionBuild = readBuild(dist, commit, 'production', false)
  assertArtifactIsolation(productionText, accountLocalText, previewText)

  const output = resolve(repoRoot, 'docs/superpowers/qa/google-calendar', commit)
  mkdirSync(output, { recursive: true })
  const evidence = {
    commit,
    result: 'FAIL',
    builds: { production: productionBuild, accountLocal: accountLocalBuild, preview: previewBuild },
    execution: { production: 'installed-extension', accountLocal: 'installed-extension', preview: 'installed-extension' },
    interactions: Object.fromEntries(GOOGLE_CALENDAR_INTERACTIONS.map((name) => [name, false])),
    viewports: [], screenshots: [], allowedRequests: [],
    unexpectedRequests: [], consoleErrors: [], pageErrors: [], failedRequests: [],
  }
  const profiles = Array.from({ length: 6 }, (_, index) => mkdtempSync(resolve(tmpdir(), `tab-two-google-calendar-${index}-`)))
  const contexts = []
  try {
    const production = await launchInstalled(profiles[0], dist, GOOGLE_CALENDAR_VIEWPORTS[0], evidence, 'production')
    contexts.push(production.context)
    await exerciseLocked(production.page, GOOGLE_CALENDAR_VIEWPORTS[0], output, evidence, repoRoot, 'production-locked')
    await production.context.close()
    contexts.pop()

    const accountLocal = await launchInstalled(profiles[1], accountLocalDist, GOOGLE_CALENDAR_VIEWPORTS[0], evidence, 'account-local')
    contexts.push(accountLocal.context)
    await exerciseLocked(accountLocal.page, GOOGLE_CALENDAR_VIEWPORTS[0], output, evidence, repoRoot, 'account-local-locked')
    await accountLocal.context.close()
    contexts.pop()

    const desktop = await launchInstalled(profiles[2], previewDist, GOOGLE_CALENDAR_VIEWPORTS[0], evidence, 'preview-desktop')
    contexts.push(desktop.context)
    await exerciseDesktop(desktop.page, GOOGLE_CALENDAR_VIEWPORTS[0], output, evidence, repoRoot, desktop.setDiscoveryDelay)
    for (let index = 1; index < GOOGLE_CALENDAR_VIEWPORTS.length; index += 1) {
      const viewport = GOOGLE_CALENDAR_VIEWPORTS[index]
      const launched = await launchInstalled(profiles[index + 2], previewDist, viewport, evidence, `preview-${viewport.id}`)
      contexts.push(launched.context)
      await exerciseResponsive(launched.page, viewport, output, evidence, repoRoot)
    }
    evidence.interactions['no-overflow'] = evidence.viewports.every((entry) => !entry.horizontalOverflow && entry.escaped.length === 0)
    evidence.result = 'PASS'
    assertEvidenceContract(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`PASS: Tab Two Google Calendar QA (${commit})`)
    return evidence
  } catch (error) {
    evidence.failure = String(error?.stack ?? error)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    throw error
  } finally {
    for (const context of contexts.reverse()) await context.close().catch(() => undefined)
    for (const profile of profiles) {
      assert(profile.startsWith(tmpdir()), `unsafe Google Calendar QA profile path: ${profile}`)
      rmSync(profile, { recursive: true, force: true })
    }
    assert(temporaryRoot.startsWith(tmpdir()), `unsafe Google Calendar QA temporary path: ${temporaryRoot}`)
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runGoogleCalendarQa()
}
