import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

import { inspectAtAGlanceRequest } from './at-a-glance-harness-contracts.mjs'
import { assertCleanTrackedStatus } from './build-contracts.mjs'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import {
  parsePresentationAuthority,
  resolveSfP1BrowserMode,
  resolveSfP1ContextOptions,
  setSfP1ScenarioViewport,
} from './qa-shared-frame-p1.mjs'
import { SF_P2_REVIEWED_VERDICTS } from './qa-shared-frame-p2-reviewed-verdicts.mjs'
import { assertBuildProvenance, inspectProviderRequest } from './work-connector-harness-contracts.mjs'

const REFERENCE_IDS = new Set(['weather', 'onThisDay'])
const EXPECTED_DIMENSIONS = Object.freeze({
  compact: Object.freeze({ width: 216, height: 132 }),
  standard: Object.freeze({ width: 320, height: 200 }),
  full: Object.freeze({ width: 460, height: 284 }),
})
const REQUIRED_THEMES = Object.freeze([
  Object.freeze({ id: 'dark', label: 'Default dark', panelColor: null }),
  Object.freeze({ id: 'light', label: 'Light panel', panelColor: '#e5e7eb' }),
  Object.freeze({ id: 'saturated', label: 'Saturated blue panel', panelColor: '#0057b8' }),
])
const REQUIRED_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'laptop', width: 1366, height: 768 }),
  Object.freeze({ id: 'exact-short', width: 1408, height: 445 }),
  Object.freeze({ id: 'common', width: 1600, height: 900 }),
  Object.freeze({ id: 'narrow-floor', width: 599, height: 800 }),
  Object.freeze({ id: 'planner-boundary', width: 600, height: 800 }),
])
const VALID_VERDICTS = new Set(['Useful', 'Needs refinement', 'Rejected'])
const REQUIRED_ASSERTIONS = Object.freeze([
  'frame-dimensions',
  'no-clipping',
  'no-internal-scroll',
  'text-floors',
  'signature-content',
  'one-data-owner',
  'storage-audit',
])
const STACK_INTERACTIONS = Object.freeze([
  'stack-initial',
  'stack-next',
  'stack-previous',
  'stack-dot',
  'stack-swipe',
  'stack-plain-click',
])

const FAMILY_IDS = Object.freeze({
  'developer-service': Object.freeze(['status', 'github', 'gitlab', 'jira', 'vercel']),
  connected: Object.freeze(['linear', 'sentry', 'todoist', 'homeassistant', 'rss', 'crypto']),
  'browser-native': Object.freeze(['readingList', 'recentlyClosed', 'downloads', 'tabGroups']),
  'calendar-local': Object.freeze(['ics', 'monthCal', 'sun', 'moon', 'habits', 'timer', 'tasks', 'notes']),
  public: Object.freeze(['publicHolidays', 'auroraKp']),
})

const STATE_REFERENCES = Object.freeze({
  'developer-service': 'status',
  connected: 'linear',
  'browser-native': 'readingList',
  'calendar-local': 'ics',
  public: 'publicHolidays',
})

const READY_SIGNATURE_SELECTORS = Object.freeze({
  ics: '[data-calendar-source]',
  monthCal: '[data-cell-key]',
  sun: '[data-sun-golden]',
  moon: 'svg',
  habits: 'button',
  status: '[data-work-pulse-status-dots]',
  github: '[role="img"][aria-label*="contribution" i]',
  gitlab: '[role="img"][aria-label*="contribution" i]',
  jira: '[data-work-pulse-rows]',
  vercel: '[data-work-pulse-rows]',
  homeassistant: '[data-ha-content-variant]',
  rss: '[data-rss-content-variant]',
  crypto: '[data-crypto-cell]',
  readingList: 'article',
  recentlyClosed: 'article',
  downloads: 'article',
  tabGroups: '[data-tab-group-color]',
  timer: 'button[aria-label*="timer" i]',
  tasks: 'button[aria-label="Tasks"]',
  notes: 'button[aria-label="Notes"]',
  linear: 'a[href^="https://linear.app/"]',
  sentry: 'li',
  todoist: 'section[aria-label$="Todoist tasks"]',
  publicHolidays: 'section[aria-label$="holidays"]',
  auroraKp: '[data-testid="kp-forecast-row"]',
})

const FIXED_TIME = new Date('2026-08-23T12:00:00-04:00')
const LOCAL_DAY_KEY = '2026-08-23'
const WORK_TOKENS = Object.freeze({
  linear: 'FAKE_LINEAR_TOKEN_DO_NOT_USE',
  sentry: 'FAKE_SENTRY_TOKEN_DO_NOT_USE',
  todoist: 'FAKE_TODOIST_TOKEN_DO_NOT_USE',
})

function workFixtures() {
  const issues = Array.from({ length: 25 }, (_, index) => ({
    id: `linear-${index + 1}`,
    identifier: `AUR-${index + 1}`,
    title: `Work issue ${String(index + 1).padStart(2, '0')}`,
    priority: index === 0 ? 'urgent' : index % 4 === 0 ? 'high' : 'normal',
    dueDate: index < 5 ? LOCAL_DAY_KEY : null,
    dueStatus: index < 5 ? 'today' : 'none',
    dueSoon: index < 5,
    url: `https://linear.app/aurora/issue/AUR-${index + 1}`,
    state: { name: index % 2 ? 'Todo' : 'In Progress', type: index % 2 ? 'unstarted' : 'started' },
    team: { id: index % 2 ? 'ops' : 'aurora', key: index % 2 ? 'OPS' : 'AUR', name: index % 2 ? 'Ops' : 'Aurora' },
    cycle: { id: 'cycle-qa', name: 'QA Cycle', startsAt: null, endsAt: null },
  }))
  const sentryIssues = Array.from({ length: 25 }, (_, index) => ({
    id: `sentry-${index + 1}`,
    title: `Checkout failure ${String(index + 1).padStart(2, '0')}`,
    shortId: `WEB-${index + 1}`,
    project: index % 2 ? { id: 'api', name: 'API', slug: 'api' } : { id: 'web', name: 'Web', slug: 'web' },
    level: index === 0 ? 'fatal' : 'error',
    severity: index === 0 ? 'critical' : 'high',
    count: 20 + index,
    userCount: 3 + index,
    firstSeen: '2026-08-20T10:00:00.000Z',
    lastSeen: '2026-08-22T10:00:00.000Z',
    stats24h: [[1_700_000_000, 4 + index]],
    events24h: 4 + index,
    trend: index === 0 ? 'rising' : 'steady',
    isRegression: index === 0,
    permalink: `https://us.sentry.io/issues/${index + 1}/`,
    priority: index === 0 ? 'high' : null,
  }))
  const projects = [{ id: 'work', name: 'Work' }, { id: 'personal', name: 'Personal' }]
  const tasks = Array.from({ length: 25 }, (_, index) => ({
    id: `task-${index + 1}`,
    content: `Ship Aurora ${String(index + 1).padStart(2, '0')}`,
    projectId: index % 2 ? 'personal' : 'work',
    due: { date: LOCAL_DAY_KEY, datetime: null, timeZone: null, text: index < 5 ? 'overdue' : index < 15 ? 'today' : 'upcoming', isRecurring: index === 2 },
    priority: index === 0 ? 4 : 2,
    labels: index === 0 ? ['release'] : [],
    duration: index === 0 ? { amount: 30, unit: 'minute' } : null,
    parentId: null,
    bucket: index < 5 ? 'overdue' : index < 15 ? 'today' : 'upcoming',
    url: `https://app.todoist.com/app/task/task-${index + 1}`,
  }))
  return {
    linear: {
      config: { enabled: true, token: WORK_TOKENS.linear, displayName: 'QA Builder', teamIds: [], itemLimit: 6 },
      data: { issues },
      empty: { issues: [] },
    },
    sentry: {
      config: { enabled: true, token: WORK_TOKENS.sentry, organization: 'acme-labs', region: 'us', projectSlugs: [], itemLimit: 6 },
      data: { issues: sentryIssues },
      empty: { issues: [] },
    },
    todoist: {
      config: { enabled: true, token: WORK_TOKENS.todoist, accountLabel: 'Todoist', projectIds: [], itemLimit: 6 },
      data: { projects, tasks },
      empty: { projects, tasks: [] },
    },
  }
}

function publicFixtures() {
  const holidayRows = Array.from({ length: 25 }, (_, index) => {
    const date = new Date(FIXED_TIME)
    date.setDate(date.getDate() + index + 1)
    const key = date.toISOString().slice(0, 10)
    return { date: key, name: `QA Holiday ${index + 1}`, localName: `QA Holiday ${index + 1}` }
  })
  const forecast = Array.from({ length: 24 }, (_, index) => {
    const kp = index === 6 ? 6 : 2 + (index % 4)
    return {
      time: new Date(FIXED_TIME.getTime() + (index + 1) * 3 * 60 * 60_000).toISOString(),
      kp,
      source: 'predicted',
      scale: kp >= 6 ? 'G2' : kp >= 5 ? 'G1' : null,
    }
  })
  return {
    publicHolidays: {
      config: { enabled: true, countryCode: 'US' },
      data: { countryCode: 'US', year: 2026, holidays: holidayRows },
      empty: { countryCode: 'US', year: 2026, holidays: [] },
      runtimeScope: LOCAL_DAY_KEY,
    },
    auroraKp: {
      config: { enabled: true },
      data: {
        current: { time: new Date(FIXED_TIME.getTime() - 3 * 60 * 60_000).toISOString(), kp: 3.67, source: 'observed', scale: null },
        forecast,
        peak: forecast[6],
      },
      empty: { current: null, forecast: [], peak: null },
    },
  }
}

function installSfP2Init() {
  if (location.protocol !== 'chrome-extension:') return
  const writeCalls = []
  const apiCalls = []
  const nativeSet = chrome.storage.local.set.bind(chrome.storage.local)
  chrome.storage.local.set = (items, callback) => {
    writeCalls.push(Object.keys(items).sort())
    return callback ? nativeSet(items, callback) : nativeSet(items)
  }
  const createEvent = () => {
    const listeners = new Set()
    return {
      addListener(listener) { listeners.add(listener) },
      removeListener(listener) { listeners.delete(listener) },
      emit(...args) { for (const listener of [...listeners]) listener(...args) },
    }
  }
  const configured = (() => {
    try { return JSON.parse(sessionStorage.getItem('aurora-sf-p2-native') ?? '{}') } catch { return {} }
  })()
  const readingEvents = { added: createEvent(), updated: createEvent(), removed: createEvent() }
  const sessionEvent = createEvent()
  const downloadEvents = { created: createEvent(), changed: createEvent(), erased: createEvent() }
  const groupEvents = { created: createEvent(), updated: createEvent(), moved: createEvent(), removed: createEvent() }
  const now = Date.now()
  const state = {
    readingList: Array.from({ length: 25 }, (_, index) => ({
      url: `https://example.test/saved-${index + 1}`,
      title: index === 0 ? 'Aurora native architecture' : `Saved article ${String(index + 1).padStart(2, '0')}`,
      hasBeenRead: index % 3 === 0,
      creationTime: now - (index + 1) * 300_000,
      lastUpdateTime: now - (index + 1) * 120_000,
    })),
    sessions: Array.from({ length: 25 }, (_, index) => index % 5 === 0
      ? { lastModified: (now - index * 120_000) / 1_000, window: { sessionId: `session-window-${index + 1}`, tabs: Array.from({ length: index % 4 + 1 }, () => ({})) } }
      : { lastModified: (now - index * 120_000) / 1_000, tab: { sessionId: `session-tab-${index + 1}` } }),
    downloads: Array.from({ length: 25 }, (_, index) => ({
      id: 101 + index,
      filename: `C:\\Downloads\\${index === 0 ? 'aurora-build.zip' : `browser-item-${101 + index}.dat`}`,
      finalUrl: `https://example.test/browser-item-${101 + index}.dat`,
      url: `https://example.test/browser-item-${101 + index}.dat`,
      state: index === 0 ? 'in_progress' : 'complete',
      paused: false,
      canResume: index === 0,
      danger: 'safe',
      bytesReceived: index === 0 ? 48 : 101 + index,
      totalBytes: index === 0 ? 100 : 101 + index,
      startTime: new Date(now - (index + 1) * 30_000).toISOString(),
      exists: true,
    })),
    tabGroups: Array.from({ length: 25 }, (_, index) => ({
      id: 201 + index,
      windowId: 8 + Math.floor(index / 5),
      title: index === 0 ? 'Aurora Work' : `Browser group ${201 + index}`,
      color: ['blue', 'cyan', 'green', 'grey', 'orange', 'pink', 'purple', 'red', 'yellow'][index % 9],
      collapsed: index % 2 === 0,
      shared: false,
    })),
  }
  const events = { readingList: readingEvents.updated, recentlyClosed: sessionEvent, downloads: downloadEvents.changed, tabGroups: groupEvents.updated }
  const modeFor = (key) => configured.target === key ? configured.mode ?? 'ready' : 'ready'
  const result = async (key) => {
    const mode = modeFor(key)
    if (mode === 'hold') return new Promise(() => {})
    if (mode === 'error') throw new Error('Native SF-P2 fixture failure')
    if (mode === 'empty') return []
    return structuredClone(state[key])
  }
  const api = {
    readingList: {
      async query(query) { apiCalls.push({ api: 'readingList.query', args: [query] }); return result('readingList') },
      async updateEntry(update) { apiCalls.push({ api: 'readingList.updateEntry', args: [update] }) },
      async removeEntry(remove) { apiCalls.push({ api: 'readingList.removeEntry', args: [remove] }) },
      onEntryAdded: readingEvents.added,
      onEntryUpdated: readingEvents.updated,
      onEntryRemoved: readingEvents.removed,
    },
    sessions: {
      async getRecentlyClosed(filter) { apiCalls.push({ api: 'sessions.getRecentlyClosed', args: [filter] }); return result('sessions') },
      async restore(sessionId) { apiCalls.push({ api: 'sessions.restore', args: [sessionId] }) },
      onChanged: sessionEvent,
    },
    downloads: {
      async search(query) { apiCalls.push({ api: 'downloads.search', args: [query] }); return result('downloads') },
      async pause(id) { apiCalls.push({ api: 'downloads.pause', args: [id] }) },
      async resume(id) { apiCalls.push({ api: 'downloads.resume', args: [id] }) },
      async cancel(id) { apiCalls.push({ api: 'downloads.cancel', args: [id] }) },
      show(id) { apiCalls.push({ api: 'downloads.show', args: [id] }) },
      onCreated: downloadEvents.created,
      onChanged: downloadEvents.changed,
      onErased: downloadEvents.erased,
    },
    tabGroups: {
      async query(query) { apiCalls.push({ api: 'tabGroups.query', args: [query] }); return result('tabGroups') },
      async update(id, update) { apiCalls.push({ api: 'tabGroups.update', args: [id, update] }); return { id, ...update } },
      onCreated: groupEvents.created,
      onUpdated: groupEvents.updated,
      onMoved: groupEvents.moved,
      onRemoved: groupEvents.removed,
    },
    windows: { async update(id, update) { apiCalls.push({ api: 'windows.update', args: [id, update] }); return { id, ...update } } },
  }
  globalThis.__auroraBrowserNativeHarnessApi = api
  globalThis.__sfP2Harness = {
    writeCalls,
    apiCalls,
    configured,
    clearWrites() { writeCalls.splice(0, writeCalls.length) },
    setNativeMode(mode) { configured.mode = mode },
    refreshNative(target) { events[target]?.emit({ id: 'sf-p2-refresh' }) },
  }
  const nativeContains = chrome.permissions.contains.bind(chrome.permissions)
  chrome.permissions.contains = async (details) => {
    if (modeFor(configured.target) === 'permission-required' && details.permissions?.includes(configured.permission)) return false
    return nativeContains(details)
  }
}

export function resolveSfP2RuntimeMode(args = process.argv.slice(2)) {
  const preliminaryWorkingTree = args.includes('--preliminary-working-tree')
  const catalogFromCapture = args.includes('--catalog-from-capture')
  const explicitCaptureOnly = args.includes('--capture-only')
  assert(!(explicitCaptureOnly && catalogFromCapture), '--capture-only cannot be combined with --catalog-from-capture')
  return {
    headed: args.includes('--headed'),
    preliminaryWorkingTree,
    captureOnly: preliminaryWorkingTree || explicitCaptureOnly,
    catalogFromCapture,
  }
}

export function shouldIgnoreSfP2BootstrapRequest({ navigating, activeCapture }) {
  return navigating === true && activeCapture === null
}

export function buildSfP2CaptureFailure(capture, error) {
  return {
    key: capture.key,
    family: capture.family,
    widget: capture.widget,
    message: error instanceof Error ? error.message : String(error),
  }
}

export function buildSfP2DomProbe(capture) {
  if (capture.kind === 'compatibility') {
    return { essentialSelectors: [':scope'], signatureSelectors: ['.stack-compatibility-face'] }
  }
  const signature = capture.state === 'ready'
    ? (capture.widget === 'github' || capture.widget === 'gitlab') && capture.tier === 'compact'
      ? '[data-contribution-summary]'
      : capture.widget === 'publicHolidays' && capture.tier !== 'full'
      ? 'li'
      : READY_SIGNATURE_SELECTORS[capture.widget]
    : '[role="status"], [role="alert"], button, p'
  assert(signature, `${capture.key}: no DOM signature selector for ${capture.widget}`)
  return { essentialSelectors: [':scope'], signatureSelectors: [signature] }
}

export function resolveSfP2FixtureState(capture) {
  if (capture.family === 'browser-native') {
    if (capture.state === 'loading') return { snapshot: 'native', network: 'hold', renderedState: 'loading', transition: null }
    if (capture.state === 'empty') return { snapshot: 'native', network: 'empty', renderedState: 'empty', transition: null }
    if (capture.state === 'hard-error') return { snapshot: 'native', network: 'error', renderedState: 'hard-error', transition: null }
    if (capture.state === 'stale') return { snapshot: 'native', network: 'ready', renderedState: 'stale', transition: 'hold' }
    if (capture.state === 'partial') return { snapshot: 'native', network: 'ready', renderedState: 'partial', transition: 'error' }
    return { snapshot: 'native', network: 'ready', renderedState: capture.state, transition: null }
  }
  if (capture.state === 'loading') return { snapshot: 'none', network: 'hold', renderedState: 'loading', transition: null }
  if (capture.state === 'empty') return { snapshot: 'empty', network: 'ready', renderedState: 'empty', transition: null }
  if (capture.state === 'stale') return { snapshot: 'stale', network: 'hold', renderedState: 'stale', transition: null }
  if (capture.state === 'partial') return { snapshot: 'stale', network: 'invalid', renderedState: 'partial', transition: null }
  if (capture.state === 'hard-error') return { snapshot: 'none', network: 'invalid', renderedState: 'hard-error', transition: null }
  return { snapshot: 'fresh', network: 'ready', renderedState: capture.state, transition: null }
}

export function assertSfP2BuildContract({
  commit,
  expectedCommit,
  provenanceText,
  trackedStatus,
  preliminaryWorkingTree,
}) {
  assert.equal(commit, expectedCommit, `SF-P2 expected commit ${expectedCommit} but found ${commit}`)
  if (!preliminaryWorkingTree) assertCleanTrackedStatus(trackedStatus)
  return {
    provenance: assertBuildProvenance(provenanceText, expectedCommit),
    preliminaryWorkingTree,
    trackedStatus: preliminaryWorkingTree ? trackedStatus : '',
  }
}

function withinTolerance(actual, expected, tolerance = 0.5) {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance
}

export function assertSfP2CaptureMeasurement(capture, measurement, dimensions) {
  const expected = dimensions?.[capture.tier]
  assert(expected, `${capture.key}: unknown frame tier ${capture.tier}`)
  const geometrySuffix = measurement.geometryDiagnostics
    ? `; geometryDiagnostics=${JSON.stringify(measurement.geometryDiagnostics)}`
    : ''
  assert(withinTolerance(measurement.frame?.width, expected.width), `${capture.key}: frame width ${measurement.frame?.width} is not ${expected.width}px within 0.5px${geometrySuffix}`)
  assert(withinTolerance(measurement.frame?.height, expected.height), `${capture.key}: frame height ${measurement.frame?.height} is not ${expected.height}px within 0.5px${geometrySuffix}`)
  assert.deepEqual(measurement.clippedElements, [], `${capture.key}: clipped content ${JSON.stringify(measurement.clippedElements)}`)
  assert.deepEqual(measurement.internalScrollOwners, [], `${capture.key}: internal scroll owners ${JSON.stringify(measurement.internalScrollOwners)}`)
  for (const run of measurement.textRuns ?? []) {
    if (run.role === 'routine') assert(run.fontSize >= 14, `${capture.key}: routine text ${JSON.stringify(run.text)} is below 14px`)
    if (run.role === 'metadata') assert(run.fontSize >= 11, `${capture.key}: metadata text ${JSON.stringify(run.text)} is below 11px`)
  }
  assert.deepEqual(measurement.missingEssentialSelectors, [], `${capture.key}: essential selectors are missing ${JSON.stringify(measurement.missingEssentialSelectors)}`)
  assert.deepEqual(measurement.missingSignatureSelectors, [], `${capture.key}: signature selectors are missing ${JSON.stringify(measurement.missingSignatureSelectors)}`)
  assert.equal(measurement.mountedOwners, 1, `${capture.key}: expected one mounted owner, found ${measurement.mountedOwners}`)
  assert.equal(measurement.selectedText, '', `${capture.key}: selected text remains after interaction`)
  if (capture.kind === 'compatibility') {
    assert.equal(typeof measurement.compatibilityCopy, 'string', `${capture.key}: compatibility copy is missing`)
    assert(measurement.compatibilityCopy.trim().length > 0, `${capture.key}: compatibility copy is missing`)
  }
  return measurement
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

function topLevelChanges(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => canonical(before[key]) !== canonical(after[key]))
    .sort()
}

function withoutStackFacing(layouts) {
  const copy = structuredClone(layouts)
  for (const layout of copy?.layouts ?? []) {
    for (const stack of layout.stacks ?? []) delete stack.facing
  }
  return copy
}

export function assertSfP2StorageAudit({ capture, before, after, writeCalls }) {
  assert.equal(canonical(after.layout), canonical(before.layout), `${capture.key}: legacy layout changed`)
  for (const keys of writeCalls) {
    assert(!keys.includes('layout'), `${capture.key}: legacy layout write detected`)
  }
  const changedKeys = topLevelChanges(before, after)
  const facingChanged = ['stack-next', 'stack-previous', 'stack-dot', 'stack-swipe'].includes(capture.interaction)
  if (!facingChanged) {
    assert.deepEqual(changedKeys, [], `${capture.key}: unexpected storage changes ${JSON.stringify(changedKeys)}`)
    assert.deepEqual(writeCalls, [], `${capture.key}: unexpected storage writes ${JSON.stringify(writeCalls)}`)
    return { changedKeys, writeCalls, facingChanged }
  }
  assert.deepEqual(changedKeys, ['layouts'], `${capture.key}: only layouts may change while paging`)
  assert.deepEqual(writeCalls, [['layouts']], `${capture.key}: facing change must write layouts exactly once`)
  assert.equal(
    canonical(withoutStackFacing(after.layouts)),
    canonical(withoutStackFacing(before.layouts)),
    `${capture.key}: stack paging changed more than facing`,
  )
  return { changedKeys, writeCalls, facingChanged }
}

export function assertSfP2RequestAudit({ requests, failedRequests, unexpectedRequests, approvedRequests }) {
  assert.equal(failedRequests.length, 0, `SF-P2 failed requests: ${JSON.stringify(failedRequests)}`)
  assert.equal(unexpectedRequests.length, 0, `SF-P2 unexpected requests: ${JSON.stringify(unexpectedRequests)}`)
  for (const request of requests) {
    const key = `${String(request.method).toUpperCase()} ${request.url}`
    assert(approvedRequests.has(key), `SF-P2 unapproved request: ${key}`)
    const heldApproved = request.status === null && request.outcome === 'held-approved'
    assert(heldApproved || (request.status >= 200 && request.status < 400), `SF-P2 failed request response: ${key} ${request.status}`)
  }
  return { approved: requests.length, failed: failedRequests.length, unexpected: unexpectedRequests.length }
}

function familyFor(id) {
  for (const [family, ids] of Object.entries(FAMILY_IDS)) {
    if (ids.includes(id)) return family
  }
  throw new Error(`SF-P2 has no family for framed widget ${id}`)
}

function preferredTier(widget, preferred = 'standard') {
  if (widget.tiers.includes(preferred)) return preferred
  return widget.tiers[0]
}

function capture({ key, kind, widget, tier, state = 'ready', family, theme = 'dark', viewport = 'common', fixture, reference = null, interaction = null }) {
  return {
    key,
    filename: `${key}.png`,
    kind,
    widget,
    tier,
    state,
    family,
    theme,
    viewport,
    fixture,
    reference,
    interaction,
    assertions: [...REQUIRED_ASSERTIONS],
  }
}

function readyCaptures(widgets) {
  return widgets.flatMap((widget) => widget.tiers.map((tier) => capture({
    key: `${widget.id}-ready-${tier}-dark-common`,
    kind: 'free-tier',
    widget: widget.id,
    tier,
    family: widget.family,
    fixture: `${widget.id}:ready:max-data`,
  })))
}

function stackPairCaptures(widgets) {
  return widgets.flatMap((widget) => widget.stackTiers.map((tier) => capture({
    key: `${widget.id}-stack-${tier}-weather-dark-exact-short`,
    kind: 'stack-pair',
    widget: widget.id,
    tier,
    family: widget.family,
    viewport: 'exact-short',
    fixture: `${widget.id}:ready:max-data`,
    reference: 'weather',
  })))
}

function stateCaptures(widgets, stateFamilies) {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]))
  return stateFamilies.flatMap((family) => {
    const widget = byId.get(family.widget)
    return family.states.map((state) => capture({
      key: `${widget.id}-${state}-${preferredTier(widget)}-dark-laptop`,
      kind: 'family-state',
      widget: widget.id,
      tier: preferredTier(widget),
      state,
      family: family.id,
      viewport: 'laptop',
      fixture: `${widget.id}:${state}`,
    }))
  })
}

function interactionCaptures(widgets, interactionFamilies) {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]))
  return interactionFamilies.flatMap((family) => {
    const widget = byId.get(family.widget)
    const tier = widget.stackTiers.includes('standard') ? 'standard' : widget.stackTiers[0]
    return STACK_INTERACTIONS.map((interaction) => capture({
      key: `${widget.id}-${interaction}-${tier}-weather-dark-exact-short`,
      kind: 'family-interaction',
      widget: widget.id,
      tier,
      family: family.id,
      viewport: 'exact-short',
      fixture: `${widget.id}:ready:max-data`,
      reference: 'weather',
      interaction,
    }))
  })
}

function themeCaptures(widgets, interactionFamilies) {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]))
  return interactionFamilies.flatMap((family) => {
    const widget = byId.get(family.widget)
    const tier = preferredTier(widget)
    return ['light', 'saturated'].map((theme) => capture({
      key: `${widget.id}-ready-${tier}-${theme}-common`,
      kind: 'family-theme',
      widget: widget.id,
      tier,
      family: family.id,
      theme,
      fixture: `${widget.id}:ready:max-data`,
    }))
  })
}

function viewportCaptures(widgets) {
  const widget = widgets.find(({ id }) => id === 'github') ?? widgets[0]
  const tier = widget.tiers.includes('full') ? 'full' : widget.tiers[0]
  return ['narrow-floor', 'planner-boundary'].map((viewport) => capture({
    key: `${widget.id}-ready-${tier}-dark-${viewport}`,
    kind: 'viewport-boundary',
    widget: widget.id,
    tier,
    family: widget.family,
    viewport,
    fixture: `${widget.id}:ready:max-data`,
  }))
}

function compatibilityCaptures() {
  return [capture({
    key: 'moon-compatibility-full-weather-dark-exact-short',
    kind: 'compatibility',
    widget: 'moon',
    tier: 'full',
    family: 'calendar-local',
    viewport: 'exact-short',
    fixture: 'moon:ready:max-data',
    reference: 'weather',
  })]
}

export function buildSfP2CapturePlan(source) {
  const authority = parsePresentationAuthority(source)
  const widgets = Object.entries(authority)
    .filter(([id, contract]) => contract.presentationClass === 'framed' && !REFERENCE_IDS.has(id))
    .map(([id, contract]) => {
      assert(Array.isArray(contract.sizes) && contract.sizes.length > 0, `${id} has no ready tiers`)
      assert(Array.isArray(contract.stackSizes) && contract.stackSizes.length > 0, `${id} has no stack tiers`)
      assert(Array.isArray(contract.states) && contract.states.length > 0, `${id} has no states`)
      for (const tier of contract.sizes) {
        const composition = contract.tiers?.[tier]
        assert(composition, `${id} is missing ${tier} composition`)
        assert(Array.isArray(composition.essential) && composition.essential.length > 0, `${id} ${tier} has no essential content`)
        assert(Array.isArray(composition.signature) && composition.signature.length > 0, `${id} ${tier} has no signature content`)
      }
      for (const tier of contract.stackSizes) assert(contract.sizes.includes(tier), `${id} stack tier ${tier} lacks a free presentation`)
      return {
        id,
        family: familyFor(id),
        tiers: [...contract.sizes],
        stackTiers: [...contract.stackSizes],
        states: [...contract.states],
        compositions: structuredClone(contract.tiers),
      }
    })

  const stateFamilies = Object.entries(STATE_REFERENCES).map(([id, widget]) => {
    const contract = widgets.find((entry) => entry.id === widget)
    assert(contract, `${id} state reference ${widget} is missing`)
    return { id, widget, states: [...contract.states] }
  })
  const interactionFamilies = Object.entries(STATE_REFERENCES).map(([id, widget]) => ({ id, widget }))
  const captures = [
    ...readyCaptures(widgets),
    ...stackPairCaptures(widgets),
    ...stateCaptures(widgets, stateFamilies),
    ...interactionCaptures(widgets, interactionFamilies),
    ...themeCaptures(widgets, interactionFamilies),
    ...viewportCaptures(widgets),
    ...compatibilityCaptures(),
  ]

  return {
    authorityIds: Object.keys(authority),
    widgets,
    stateFamilies,
    interactionFamilies,
    dimensions: structuredClone(EXPECTED_DIMENSIONS),
    themes: structuredClone(REQUIRED_THEMES),
    viewports: structuredClone(REQUIRED_VIEWPORTS),
    audits: { storage: { allowedKeys: ['layouts'], legacyLayoutWrites: 0 } },
    captures,
  }
}

export function buildSfP2RuntimeStages(plan) {
  const stages = Object.keys(FAMILY_IDS).map((id) => ({
    id,
    adapter: id,
    captures: plan.captures.filter((capture) => capture.family === id),
  }))
  const assigned = stages.flatMap((stage) => stage.captures)
  assert.equal(assigned.length, plan.captures.length, 'every SF-P2 capture must belong to one runtime family')
  assert.equal(new Set(assigned.map(({ key }) => key)).size, assigned.length, 'SF-P2 capture assigned to more than one runtime family')
  for (const stage of stages) assert(stage.captures.length > 0, `SF-P2 runtime family ${stage.id} has no captures`)
  return stages
}

export function buildSfP2Layouts(authorityIds, capture) {
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  const layout = { id: 'sf-p2-witness', name: 'SF-P2 Witness', widgets }
  const stacked = capture.kind === 'stack-pair'
    || capture.kind === 'family-interaction'
    || capture.kind === 'compatibility'
  if (!stacked) {
    widgets[capture.widget] = {
      kind: 'free',
      anchor: 'center',
      offsetX: 0,
      offsetY: 0,
      tier: capture.tier,
      layer: 7,
    }
  } else {
    delete widgets.weather
    delete widgets[capture.widget]
    const startsOnWeather = ['stack-next', 'stack-previous', 'stack-dot', 'stack-swipe'].includes(capture.interaction)
    layout.stacks = [{
      id: `stack-sf-p2-${capture.widget}`,
      members: ['weather', capture.widget],
      facing: startsOnWeather ? 'weather' : capture.widget,
      anchor: 'center',
      offsetX: 0,
      offsetY: 0,
      tier: capture.tier,
      layer: 7,
    }]
  }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}

export function applySfP2ReviewedVerdicts(plan, reviewedVerdicts) {
  assert(reviewedVerdicts && typeof reviewedVerdicts === 'object' && !Array.isArray(reviewedVerdicts), 'reviewed verdict map is required')
  const keys = new Set(plan.captures.map(({ key }) => key))
  for (const key of Object.keys(reviewedVerdicts)) assert(keys.has(key), `reviewed verdict ${key} has no capture`)
  return {
    ...structuredClone(plan),
    captures: plan.captures.map((entry) => {
      const reviewed = reviewedVerdicts[entry.key]
      assert(reviewed, `${entry.key} is missing a reviewed verdict`)
      assert(VALID_VERDICTS.has(reviewed.verdict), `${entry.key} has invalid reviewed verdict ${reviewed.verdict}`)
      assert.equal(typeof reviewed.reason, 'string', `${entry.key} is missing a reviewed verdict reason`)
      assert(reviewed.reason.trim().length > 0, `${entry.key} is missing a reviewed verdict reason`)
      return { ...entry, verdict: reviewed.verdict, verdictReason: reviewed.reason }
    }),
  }
}

export function buildSfP2EvidenceManifest(source, reviewedVerdicts = SF_P2_REVIEWED_VERDICTS) {
  return applySfP2ReviewedVerdicts(buildSfP2CapturePlan(source), reviewedVerdicts)
}

function requireExactRows(actual, expected, label) {
  assert.deepEqual(actual.map(({ id }) => id), expected.map(({ id }) => id), `${label} declarations must be exact`)
}

function validate(manifest, requireVerdicts) {
  assert.equal(manifest.widgets.length, 25, 'SF-P2 must contain exactly 25 remaining framed widgets')
  assert.equal(new Set(manifest.widgets.map(({ id }) => id)).size, manifest.widgets.length, 'widget declarations must be unique')
  assert.equal(manifest.widgets.some(({ id }) => REFERENCE_IDS.has(id)), false, 'SF-P1 references must not re-enter SF-P2')
  for (const [tier, expected] of Object.entries(EXPECTED_DIMENSIONS)) {
    assert.equal(manifest.dimensions?.[tier]?.width, expected.width, `${tier} width must be ${expected.width}`)
    assert.equal(manifest.dimensions?.[tier]?.height, expected.height, `${tier} height must be ${expected.height}`)
  }
  requireExactRows(manifest.themes, REQUIRED_THEMES, 'theme')
  requireExactRows(manifest.viewports, REQUIRED_VIEWPORTS, 'viewport')
  assert.deepEqual(manifest.audits?.storage, { allowedKeys: ['layouts'], legacyLayoutWrites: 0 }, 'storage audit contract drifted')

  const keys = new Set()
  const files = new Set()
  for (const entry of manifest.captures) {
    assert.equal(typeof entry.key, 'string', 'capture key is required')
    assert(!keys.has(entry.key), `duplicate capture key ${entry.key}`)
    keys.add(entry.key)
    assert(!files.has(entry.filename), `duplicate capture filename ${entry.filename}`)
    files.add(entry.filename)
    assert.equal(typeof entry.fixture, 'string', `${entry.key} fixture is required`)
    assert(entry.fixture.length > 0, `${entry.key} fixture is required`)
    assert.deepEqual(entry.assertions, REQUIRED_ASSERTIONS, `${entry.key} assertions drifted`)
    if (requireVerdicts) {
      assert(VALID_VERDICTS.has(entry.verdict), `${entry.key} is missing an explicit usefulness verdict`)
      assert.equal(typeof entry.verdictReason, 'string', `${entry.key} is missing its usefulness verdict reason`)
      assert(entry.verdictReason.trim().length > 0, `${entry.key} is missing its usefulness verdict reason`)
    } else {
      assert(!('verdict' in entry), `${entry.key} planning must not manufacture verdicts`)
      assert(!('verdictReason' in entry), `${entry.key} planning must not manufacture verdict reasons`)
    }
  }

  for (const widget of manifest.widgets) {
    for (const tier of widget.tiers) {
      assert(manifest.captures.some((entry) => entry.kind === 'free-tier' && entry.widget === widget.id && entry.tier === tier && entry.state === 'ready'), `${widget.id} ${tier} ready capture is missing`)
    }
    for (const tier of widget.stackTiers) {
      assert(manifest.captures.some((entry) => entry.kind === 'stack-pair' && entry.widget === widget.id && entry.tier === tier && entry.reference === 'weather'), `${widget.id} ${tier} stack pair is missing`)
    }
  }
  for (const family of manifest.stateFamilies) {
    for (const state of family.states) assert(manifest.captures.some((entry) => entry.family === family.id && entry.state === state), `${family.id} ${state} state is missing`)
  }
  for (const family of manifest.interactionFamilies) {
    for (const interaction of STACK_INTERACTIONS) assert(manifest.captures.some((entry) => entry.family === family.id && entry.interaction === interaction), `${family.id} ${interaction} is missing`)
  }
  for (const theme of REQUIRED_THEMES) assert(manifest.captures.some((entry) => entry.theme === theme.id), `theme ${theme.id} has no capture`)
  for (const viewport of REQUIRED_VIEWPORTS) assert(manifest.captures.some((entry) => entry.viewport === viewport.id), `viewport ${viewport.id} has no capture`)
  assert(manifest.captures.some((entry) => entry.kind === 'compatibility' && entry.widget === 'moon' && entry.tier === 'full'), 'legacy compatibility capture is missing')
  return manifest
}

export function validateSfP2CapturePlan(manifest) {
  return validate(manifest, false)
}

export function validateSfP2EvidenceManifest(manifest) {
  return validate(manifest, true)
}

export function validateSfP2RuntimeEvidence(evidence, { requireVerdicts = false } = {}) {
  assert(evidence && typeof evidence === 'object', 'SF-P2 runtime evidence is required')
  const manifest = requireVerdicts
    ? validateSfP2EvidenceManifest(evidence.manifest)
    : ('verdict' in (evidence.manifest?.captures?.[0] ?? {})
        ? validateSfP2EvidenceManifest(evidence.manifest)
        : validateSfP2CapturePlan(evidence.manifest))
  assert.deepEqual(evidence.runtimeErrors, [], `SF-P2 runtime errors: ${JSON.stringify(evidence.runtimeErrors)}`)
  assert.deepEqual(evidence.failedRequests, [], `SF-P2 failed requests: ${JSON.stringify(evidence.failedRequests)}`)
  assert.deepEqual(evidence.unexpectedRequests, [], `SF-P2 unexpected requests: ${JSON.stringify(evidence.unexpectedRequests)}`)
  const rows = new Map()
  for (const row of evidence.captures ?? []) {
    assert(!rows.has(row.key), `duplicate runtime capture ${row.key}`)
    rows.set(row.key, row)
  }
  for (const planned of manifest.captures) {
    const row = rows.get(planned.key)
    assert(row, `${planned.key} is missing runtime capture evidence`)
    assert.equal(row.widget, planned.widget, `${planned.key}: runtime widget drifted`)
    assert.equal(row.tier, planned.tier, `${planned.key}: runtime tier drifted`)
    assert.equal(typeof row.image?.relativePath, 'string', `${planned.key}: original image path is missing`)
    assert(row.image.relativePath.length > 0, `${planned.key}: original image path is missing`)
    assertSfP2CaptureMeasurement(planned, row.measurement, manifest.dimensions)
    assert(row.storage && Array.isArray(row.storage.changedKeys) && Array.isArray(row.storage.writeCalls), `${planned.key}: storage audit is missing`)
    assert(row.requestAudit && row.requestAudit.failed === 0 && row.requestAudit.unexpected === 0, `${planned.key}: request audit is missing or failed`)
    if (requireVerdicts) {
      assert(VALID_VERDICTS.has(row.verdict), `${planned.key} is missing an explicit usefulness verdict`)
      assert.equal(typeof row.verdictReason, 'string', `${planned.key} is missing its usefulness verdict reason`)
      assert(row.verdictReason.trim().length > 0, `${planned.key} is missing its usefulness verdict reason`)
    }
  }
  assert.equal(rows.size, manifest.captures.length, 'SF-P2 runtime evidence has unexpected capture rows')
  return evidence
}

function tableCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
}

export function formatSfP2Catalog(evidence) {
  validateSfP2RuntimeEvidence(evidence, { requireVerdicts: true })
  const preliminary = evidence.build?.preliminaryWorkingTree === true
  const label = preliminary ? 'Preliminary working-tree witness' : 'Exact reviewed build witness'
  const warning = preliminary
    ? '\n\nThis is not final exact-reviewed proof. It records the dirty working-tree source and must be rerun from the reviewed commit.'
    : ''
  const rows = evidence.captures.map((capture) => {
    const frame = capture.measurement.frame
    return `| ${tableCell(capture.key)} | ${tableCell(capture.widget)} | ${tableCell(capture.tier)} | ${tableCell(capture.state)} | ${tableCell(capture.kind)} | [original](${tableCell(capture.image.relativePath.split('/').pop())}) | ${frame.width.toFixed(1)} x ${frame.height.toFixed(1)} | ${tableCell(capture.verdict)} | ${tableCell(capture.verdictReason)} |`
  })
  return [
    '# Aurora SF-P2 Framed Catalog',
    '',
    `**Evidence:** ${label}.${warning}`,
    '',
    `**Build:** ${tableCell(evidence.build?.commit)} | **Chromium:** ${tableCell(evidence.browser?.version)} | **Captures:** ${evidence.captures.length}`,
    '',
    '| Capture | Widget | Tier | State | Kind | Original | Frame | Verdict | Reason |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex')
}

function prepareCatalogDirectory(repoRoot) {
  const catalogDir = resolve(repoRoot, 'docs/superpowers/catalog/shared-frames/sf-p2')
  const expectedParent = resolve(repoRoot, 'docs/superpowers/catalog/shared-frames')
  assert.equal(dirname(catalogDir).toLowerCase(), expectedParent.toLowerCase(), 'unsafe SF-P2 catalog parent')
  assert.equal(basename(catalogDir), 'sf-p2', 'unsafe SF-P2 catalog name')
  mkdirSync(catalogDir, { recursive: true })
  const entry = lstatSync(catalogDir)
  assert(entry.isDirectory() && !entry.isSymbolicLink(), 'SF-P2 catalog must be a real directory')
  return catalogDir
}

function writeReviewedCatalogFromCapture(repoRoot, sourcePath) {
  const catalogDir = prepareCatalogDirectory(repoRoot)
  const evidencePath = resolve(catalogDir, 'evidence.json')
  assert(existsSync(evidencePath), 'SF-P2 evidence.json is missing')
  const captured = JSON.parse(readFileSync(evidencePath, 'utf8'))
  const reviewedManifest = buildSfP2EvidenceManifest(readFileSync(sourcePath, 'utf8'))
  const verdicts = new Map(reviewedManifest.captures.map((capture) => [capture.key, capture]))
  const evidence = {
    ...captured,
    manifest: reviewedManifest,
    captures: captured.captures.map((capture) => {
      const reviewed = verdicts.get(capture.key)
      assert(reviewed, `${capture.key} has no reviewed manifest row`)
      return { ...capture, verdict: reviewed.verdict, verdictReason: reviewed.verdictReason }
    }),
  }
  validateSfP2RuntimeEvidence(evidence, { requireVerdicts: true })
  writeFileSync(resolve(catalogDir, 'CATALOG.md'), formatSfP2Catalog(evidence), 'utf8')
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  process.stdout.write(`PASS SF-P2 reviewed catalog: ${evidence.captures.length} captures\n`)
}

function scopeCanonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(scopeCanonical).join(',')}]`
  return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${scopeCanonical(value[key])}`).join(',')}}`
}

function snapshotScope(id, config, runtimeScope, version = 'v1') {
  const runtime = runtimeScope === undefined ? '' : `\n${scopeCanonical(runtimeScope)}`
  return `${id}:${version}:${createHash('sha256').update(`${id}\n${scopeCanonical(config)}${runtime}`).digest('hex')}`
}

async function run() {
  const repoRoot = resolve(process.cwd())
  const protectedRoot = resolve('D:/DEV/Chrome plugin')
  const topLevel = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repoRoot, encoding: 'utf8' }).trim())
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const expectedCommit = process.argv.find((argument) => argument.startsWith('--expected-commit='))?.slice('--expected-commit='.length) ?? commit
  const mode = resolveSfP2RuntimeMode(process.argv.slice(2))
  const browserMode = resolveSfP1BrowserMode(mode.headed ? ['--headed'] : [])
  assert.equal(topLevel.toLowerCase(), repoRoot.toLowerCase(), 'run SF-P2 from the active repository root')
  assert.notEqual(repoRoot.toLowerCase(), protectedRoot.toLowerCase(), 'SF-P2 refuses the protected original checkout')
  assert.equal(branch, 'feat/aurora-2-observatory', 'SF-P2 must run on feat/aurora-2-observatory')
  const sourcePath = resolve(repoRoot, 'src/newtab/widgetSizeContracts.ts')
  if (mode.catalogFromCapture) {
    writeReviewedCatalogFromCapture(repoRoot, sourcePath)
    return
  }

  const source = readFileSync(sourcePath, 'utf8')
  const manifest = mode.captureOnly
    ? validateSfP2CapturePlan(buildSfP2CapturePlan(source))
    : validateSfP2EvidenceManifest(buildSfP2EvidenceManifest(source))
  const dist = resolve(repoRoot, 'dist')
  const trackedStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' })
  const build = assertSfP2BuildContract({
    commit,
    expectedCommit,
    provenanceText: readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'),
    trackedStatus,
    preliminaryWorkingTree: mode.preliminaryWorkingTree,
  })
  const catalogDir = prepareCatalogDirectory(repoRoot)
  const profileDir = mkdtempSync(resolve(tmpdir(), 'aurora-sf-p2-profile-'))
  const requestedKeys = process.argv
    .filter((argument) => argument.startsWith('--capture-key='))
    .map((argument) => argument.slice('--capture-key='.length))
  const requestedFamily = process.argv.find((argument) => argument.startsWith('--family='))?.slice('--family='.length) ?? null
  const allStages = buildSfP2RuntimeStages(manifest)
  const selectedStages = allStages
    .filter((stage) => requestedFamily === null || stage.id === requestedFamily)
    .map((stage) => ({
      ...stage,
      captures: stage.captures.filter((capture) => requestedKeys.length === 0 || requestedKeys.includes(capture.key)),
    }))
    .filter((stage) => stage.captures.length > 0)
  const runCaptures = selectedStages.flatMap((stage) => stage.captures)
  assert(runCaptures.length > 0, 'SF-P2 capture selection is empty')
  if (requestedKeys.length > 0) {
    const selected = new Set(runCaptures.map(({ key }) => key))
    for (const key of requestedKeys) assert(selected.has(key), `unknown or excluded SF-P2 capture key ${key}`)
  }

  const evidence = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    build: { commit, ...build },
    browser: { name: 'chromium', version: null, headed: mode.headed, deviceScaleFactor: 1, reducedMotion: 'reduce' },
    selection: { families: selectedStages.map(({ id }) => id), requestedKeys, complete: runCaptures.length === manifest.captures.length },
    manifest,
    stages: selectedStages.map(({ id, adapter, captures }) => ({ id, adapter, planned: captures.length, completed: 0, failed: 0 })),
    captures: [],
    captureFailures: [],
    requests: [],
    runtimeErrors: [],
    failedRequests: [],
    unexpectedRequests: [],
    cleanup: { browserClosed: false, profileRemoved: false },
  }
  const approvedRequests = new Set()
  const pendingRoutes = []
  let context = null
  let page = null
  let activeCapture = null
  let activeNetworkMode = 'ready'
  let navigating = true
  let caughtError = null

  const disposePendingRoutes = async () => {
    const pending = pendingRoutes.splice(0)
    for (const entry of pending) entry.release()
    await Promise.allSettled(pending.map((entry) => entry.done))
  }

  const holdRoute = async (route, row) => {
    let release
    let done
    const action = new Promise((resolveAction) => { release = resolveAction })
    const completed = new Promise((resolveDone) => { done = resolveDone })
    pendingRoutes.push({ release, done: completed })
    row.outcome = 'held-approved'
    try {
      await action
      row.outcome = 'harness-navigation-abort'
      await route.abort('aborted').catch(() => {})
    } finally {
      done()
    }
  }

  const inspectScenarioRequest = (request) => {
    assert(activeCapture, 'external request arrived without an active SF-P2 capture')
    const method = request.method().toUpperCase()
    const url = request.url()
    if (activeCapture.widget === 'linear') {
      return inspectProviderRequest({
        method,
        url,
        authorization: request.headers().authorization ?? '',
        contentType: request.headers()['content-type'] ?? '',
        body: request.postData(),
      }, WORK_TOKENS)
    }
    if (activeCapture.widget === 'publicHolidays') {
      return inspectAtAGlanceRequest({ method, url, accept: request.headers().accept ?? null })
    }
    if (activeCapture.widget === 'status') {
      assert.equal(method, 'GET', 'Status fixture only permits GET')
      assert(['https://status.invalid/github.json', 'https://status.invalid/vercel.json'].includes(url), `unexpected Status URL ${url}`)
      return { provider: 'status', operation: 'service-status' }
    }
    if (activeCapture.widget === 'ics') {
      assert.equal(method, 'GET', 'Calendar fixture only permits GET')
      assert(['https://calendar.invalid/studio.ics', 'https://calendar.invalid/family.ics'].includes(url), `unexpected Calendar URL ${url}`)
      return { provider: 'ics', operation: 'calendar-feed' }
    }
    throw new Error(`${activeCapture.key}: no approved request adapter for ${method} ${url}`)
  }

  try {
    context = await chromium.launchPersistentContext(profileDir, resolveSfP1ContextOptions(browserMode, dist))
    evidence.browser.version = context.browser()?.version() ?? 'unknown'
    await context.addInitScript(installSfP2Init)
    await context.route(/^https?:\/\//, async (route) => {
      const request = route.request()
      if (shouldIgnoreSfP2BootstrapRequest({ navigating, activeCapture })) {
        await route.abort('aborted').catch(() => {})
        return
      }
      const row = {
        scenario: activeCapture?.key ?? 'bootstrap',
        method: request.method().toUpperCase(),
        url: request.url(),
        operation: null,
        mode: activeNetworkMode,
        status: null,
        outcome: null,
      }
      try {
        const contract = inspectScenarioRequest(request)
        row.operation = contract.operation
        evidence.requests.push(row)
        approvedRequests.add(`${row.method} ${row.url}`)
        if (activeNetworkMode === 'hold') return holdRoute(route, row)
        assert.equal(activeNetworkMode, 'invalid', `${activeCapture.key}: fresh snapshot unexpectedly requested ${row.method} ${row.url}`)
        row.status = 200
        row.outcome = 'fulfilled-invalid-200'
        const body = activeCapture.widget === 'ics' ? 'not an ics calendar' : '{}'
        return route.fulfill({ status: 200, contentType: activeCapture.widget === 'ics' ? 'text/calendar' : 'application/json', body })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        row.outcome = `blocked: ${message}`
        if (!evidence.requests.includes(row)) evidence.requests.push(row)
        evidence.unexpectedRequests.push({ scenario: row.scenario, method: row.method, url: row.url, message })
        await route.abort('blockedbyclient').catch(() => {})
      }
    })

    page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(20_000)
    await page.clock.install({ time: FIXED_TIME })
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const row = { scenario: activeCapture?.key ?? 'bootstrap', navigating, text: message.text() }
      if (!navigating) evidence.runtimeErrors.push(row)
    })
    page.on('pageerror', (error) => {
      evidence.runtimeErrors.push({ scenario: activeCapture?.key ?? 'bootstrap', navigating, text: String(error) })
    })
    page.on('requestfailed', (request) => {
      if (!request.url().startsWith('http') || navigating) return
      evidence.failedRequests.push({
        scenario: activeCapture?.key ?? 'bootstrap',
        method: request.method(),
        url: request.url(),
        error: request.failure()?.errorText ?? 'failed',
      })
    })

    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    await seedInformationFirstFixtures(page, { contributionDayCount: 35 })
    const extensionId = new URL(page.url()).host
    const seedPageUrl = `chrome-extension://${extensionId}/manifest.json`
    const work = workFixtures()
    const publicData = publicFixtures()
    const themeById = new Map(manifest.themes.map((theme) => [theme.id, theme]))

    const seedCapture = async (capture) => {
      activeCapture = capture
      const state = resolveSfP2FixtureState(capture)
      activeNetworkMode = state.network
      navigating = true
      await disposePendingRoutes()
      await page.goto(seedPageUrl, { waitUntil: 'domcontentloaded' })
      const nativeTarget = capture.family === 'browser-native' ? capture.widget : null
      const nativePermission = { readingList: 'readingList', recentlyClosed: 'sessions', downloads: 'downloads', tabGroups: 'tabGroups' }[capture.widget] ?? null
      await page.evaluate(({ target, permission, mode }) => {
        sessionStorage.setItem('aurora-sf-p2-native', JSON.stringify({ target, permission, mode }))
      }, { target: nativeTarget, permission: nativePermission, mode: state.transition ? 'ready' : state.network })
      const layouts = buildSfP2Layouts(manifest.authorityIds, capture)
      const theme = themeById.get(capture.theme)
      assert(theme, `${capture.key}: unknown theme ${capture.theme}`)
      await page.evaluate(async ({ capture, state, layouts, authorityIds, work, publicData, panelColor, localDayKey }) => {
        const current = await chrome.storage.local.get(null)
        const info = current.informationFirstFixture
        if (!info?.configs || !info?.snapshots) throw new Error('information-first fixture authority is missing')
        const canonical = (value) => {
          if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
          if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
          return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
        }
        const scope = async (id, config, runtimeScope, version = 'v1') => {
          const runtime = runtimeScope === undefined ? '' : `\n${canonical(runtimeScope)}`
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id}\n${canonical(config)}${runtime}`))
          const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
          return `${id}:${version}:${hash}`
        }
        const configs = { ...info.configs }
        const snapshots = structuredClone(info.snapshots)
        for (const [id, fixture] of Object.entries(work)) {
          configs[id] = fixture.config
          snapshots[id] = { scope: await scope(id, fixture.config), fetchedAt: Date.now(), data: fixture.data }
        }
        for (const [id, fixture] of Object.entries(publicData)) {
          configs[id] = fixture.config
          snapshots[id] = { scope: await scope(id, fixture.config, fixture.runtimeScope), fetchedAt: Date.now(), data: fixture.data }
        }
        const fixtureById = {
          status: { data: info.snapshots.status.data, empty: { services: [] } },
          ics: { data: info.snapshots.ics.data, empty: { events: [] } },
          linear: work.linear,
          publicHolidays: publicData.publicHolidays,
        }
        const fixture = fixtureById[capture.widget]
        if (capture.kind === 'family-state' && capture.family !== 'browser-native') {
          if (!fixture) throw new Error(`${capture.key}: no family-state fixture for ${capture.widget}`)
          if (state.snapshot === 'none') {
            delete snapshots[capture.widget]
          } else {
            const existingScope = snapshots[capture.widget]?.scope
            if (!existingScope) throw new Error(`${capture.key}: fixture scope is missing`)
            snapshots[capture.widget] = {
              scope: existingScope,
              fetchedAt: Date.now() - (state.snapshot === 'stale' ? 48 * 60 * 60_000 : 0),
              data: state.snapshot === 'empty' ? fixture.empty : fixture.data,
            }
          }
        }
        const enabled = new Set([capture.widget])
        if (capture.kind === 'stack-pair' || capture.kind === 'family-interaction' || capture.kind === 'compatibility') enabled.add('weather')
        const widgetFlags = {
          ...Object.fromEntries(Object.keys(current.settings.widgets).map((id) => [id, false])),
          ...Object.fromEntries(authorityIds.map((id) => [id, false])),
        }
        for (const id of enabled) widgetFlags[id] = true
        await chrome.storage.local.set({
          settings: {
            ...current.settings,
            units: 'metric',
            use24Hour: false,
            panelColor,
            widgetTextColor: null,
            widgets: widgetFlags,
          },
          photoPrefs: { ...current.photoPrefs, mode: 'gradient' },
          connectors: configs,
          connectorSnapshots: snapshots,
          habits: Array.from({ length: 6 }, (_, index) => ({ id: `habit-${index + 1}`, name: `Habit ${index + 1}`, createdAt: Date.now() - index, log: index < 3 ? [localDayKey] : [] })),
          weatherAlertCache: {
            requestIdentity: 'nws-alerts:v1:https://api.weather.gov/alerts/active?point=33.749,-84.388',
            fetchedAt: Date.now(),
            status: 'supported',
            alerts: [],
          },
          layouts,
        })
        globalThis.__sfP2Harness?.clearWrites()
      }, { capture, state, layouts, authorityIds: manifest.authorityIds, work, publicData, panelColor: theme.panelColor, localDayKey: LOCAL_DAY_KEY })
      const before = await page.evaluate(() => chrome.storage.local.get(null))
      const viewport = manifest.viewports.find((entry) => entry.id === capture.viewport)
      assert(viewport, `${capture.key}: unknown viewport ${capture.viewport}`)
      await setSfP1ScenarioViewport(page, { width: viewport.width, height: viewport.height }, browserMode)
      await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
      await page.locator('[data-canvas-surface]').waitFor()
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))))
      navigating = false
      return { before, state, viewport }
    }

    const stackSelector = (capture) => `[data-stack-card="stack-sf-p2-${capture.widget}"]`
    const frameFor = (capture, renderedState) => {
      if (capture.kind === 'stack-pair' || capture.kind === 'family-interaction' || capture.kind === 'compatibility') {
        return page.locator(`${stackSelector(capture)} [data-stack-member="${capture.widget}"][data-stack-active="true"] [data-tier-frame="${capture.tier}"]`)
      }
      return page.locator(`[data-block-id="${capture.widget}"] [data-tier-frame="${capture.tier}"][data-tier-frame-state="${renderedState}"]`)
    }

    const measureStack = async (capture) => page.locator(stackSelector(capture)).evaluate((card) => {
      const cardRect = card.getBoundingClientRect()
      return {
        card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom, width: cardRect.width, height: cardRect.height },
        members: [...card.querySelectorAll('[data-stack-member]')].map((member) => {
          const frame = member.querySelector('[data-tier-frame]')
          const rect = frame?.getBoundingClientRect()
          return {
            id: member.getAttribute('data-stack-member'),
            active: member.getAttribute('data-stack-active') === 'true',
            frame: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
          }
        }),
      }
    })

    const measureFrame = async (capture, frame) => {
      const probe = buildSfP2DomProbe(capture)
      const measurement = await frame.evaluate((root, input) => {
        const visible = (element) => {
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
            && rect.width > 1 && rect.height > 1 && !element.classList.contains('sr-only')
        }
        const frameRect = root.getBoundingClientRect()
        const internalScrollOwners = [root, ...root.querySelectorAll('*')].flatMap((element) => {
          const style = getComputedStyle(element)
          const scrolls = /(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)
            && (element.scrollHeight > element.clientHeight + 0.5 || element.scrollWidth > element.clientWidth + 0.5)
          return scrolls ? [`${element.tagName.toLowerCase()}.${typeof element.className === 'string' ? element.className : ''}`] : []
        })
        const textRuns = []
        const clippedElements = []
        for (const element of [root, ...root.querySelectorAll('*')]) {
          if (!visible(element)) continue
          const ownsText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim())
          if (!ownsText) continue
          const rect = element.getBoundingClientRect()
          const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)
          const fontSize = Number.parseFloat(getComputedStyle(element).fontSize)
          const metadata = element.closest('[data-stage-text-tier="metadata"]') !== null || fontSize <= 12.5
          if (Number.isFinite(fontSize)) textRuns.push({ text, role: metadata ? 'metadata' : 'routine', fontSize })
          if (rect.left < frameRect.left - 0.5 || rect.top < frameRect.top - 0.5 || rect.right > frameRect.right + 0.5 || rect.bottom > frameRect.bottom + 0.5) {
            clippedElements.push(text || element.tagName.toLowerCase())
          }
        }
        if (root.scrollWidth > root.clientWidth + 0.5 || root.scrollHeight > root.clientHeight + 0.5) {
          clippedElements.push(`frame-scroll:${root.clientWidth}x${root.clientHeight}/${root.scrollWidth}x${root.scrollHeight}`)
        }
        const countSelector = (selector) => selector === ':scope'
          ? (visible(root) ? 1 : 0)
          : [...root.querySelectorAll(selector)].filter(visible).length
        const mountedOwners = input.stacked
          ? document.querySelectorAll(`[data-stack-member="${input.widget}"]`).length
          : document.querySelectorAll(`[data-block-id="${input.widget}"]`).length
        const rootStyle = getComputedStyle(root)
        const ancestors = []
        for (let element = root.parentElement; element && ancestors.length < 8; element = element.parentElement) {
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          ancestors.push({
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === 'string' ? element.className : '',
            rect: { width: rect.width, height: rect.height },
            width: style.width,
            maxWidth: style.maxWidth,
            display: style.display,
            position: style.position,
            transform: style.transform,
            zoom: style.zoom,
          })
        }
        return {
          frame: { left: frameRect.left, top: frameRect.top, right: frameRect.right, bottom: frameRect.bottom, width: frameRect.width, height: frameRect.height },
          geometryDiagnostics: {
            computedWidth: rootStyle.width,
            computedHeight: rootStyle.height,
            computedMinWidth: rootStyle.minWidth,
            computedMaxWidth: rootStyle.maxWidth,
            tierFrameWidth: rootStyle.getPropertyValue('--tier-frame-width').trim(),
            tierFrameRatio: rootStyle.getPropertyValue('--tier-frame-ratio').trim(),
            flexBasis: rootStyle.flexBasis,
            flexGrow: rootStyle.flexGrow,
            flexShrink: rootStyle.flexShrink,
            transform: rootStyle.transform,
            zoom: rootStyle.zoom,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
            visualViewport: window.visualViewport ? {
              width: window.visualViewport.width,
              height: window.visualViewport.height,
              scale: window.visualViewport.scale,
            } : null,
            ancestors,
          },
          clippedElements,
          internalScrollOwners,
          textRuns,
          missingEssentialSelectors: input.probe.essentialSelectors.filter((selector) => countSelector(selector) === 0),
          missingSignatureSelectors: input.probe.signatureSelectors.filter((selector) => countSelector(selector) === 0),
          mountedOwners,
          selectedText: getSelection()?.toString() ?? '',
          compatibilityCopy: input.compatibility ? (root.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
          page: {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          },
        }
      }, {
        probe,
        widget: capture.widget,
        stacked: capture.kind === 'stack-pair' || capture.kind === 'family-interaction' || capture.kind === 'compatibility',
        compatibility: capture.kind === 'compatibility',
      })
      assert(measurement.page.scrollWidth <= measurement.page.clientWidth, `${capture.key}: page has horizontal overflow`)
      delete measurement.page
      return assertSfP2CaptureMeasurement(capture, measurement, manifest.dimensions)
    }

    const runInteraction = async (capture) => {
      if (capture.kind !== 'family-interaction') return
      const stack = page.locator(stackSelector(capture))
      if (capture.interaction === 'stack-next') {
        await stack.hover()
        await stack.getByRole('button', { name: 'Next widget' }).click()
      } else if (capture.interaction === 'stack-previous') {
        await stack.hover()
        await stack.getByRole('button', { name: 'Previous widget' }).click()
      } else if (capture.interaction === 'stack-dot') {
        await stack.hover()
        await stack.locator('[data-stack-dots] button').nth(1).click()
      } else if (capture.interaction === 'stack-swipe') {
        const box = await stack.boundingBox()
        assert(box, `${capture.key}: stack swipe box is missing`)
        await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5, { steps: 8 })
        await page.mouse.up()
      } else if (capture.interaction === 'stack-plain-click') {
        const target = frameFor(capture, 'ready')
        await target.click({ position: { x: 6, y: 6 } })
        assert.equal(await page.locator('[data-editing="true"], .canvas-item--editing, .canvas-item--selected').count(), 0, `${capture.key}: plain click painted edit chrome`)
      }
      if (['stack-next', 'stack-previous', 'stack-dot', 'stack-swipe'].includes(capture.interaction)) {
        await page.locator(`${stackSelector(capture)} [data-stack-member="${capture.widget}"][data-stack-active="true"]`).waitFor()
      }
    }

    const screenshotCapture = async (capture, viewport) => {
      const path = resolve(catalogDir, capture.filename)
      assert.equal(dirname(path).toLowerCase(), catalogDir.toLowerCase(), `${capture.key}: unsafe screenshot path`)
      await page.screenshot({ path, fullPage: false, animations: 'disabled' })
      const metadata = await sharp(path).metadata()
      assert.equal(metadata.width, viewport.width, `${capture.key}: screenshot width is not ${viewport.width}`)
      assert.equal(metadata.height, viewport.height, `${capture.key}: screenshot height is not ${viewport.height}`)
      return {
        relativePath: relative(repoRoot, path).replace(/\\/g, '/'),
        pixelWidth: metadata.width,
        pixelHeight: metadata.height,
      }
    }

    for (const stage of selectedStages) {
      for (const capture of stage.captures) {
        const requestStart = evidence.requests.length
        const failedStart = evidence.failedRequests.length
        const unexpectedStart = evidence.unexpectedRequests.length
        try {
        const { before, state, viewport } = await seedCapture(capture)
        let renderedState = capture.kind === 'compatibility' ? 'empty' : state.renderedState
        if (capture.family === 'browser-native' && state.transition) {
          await page.locator(`[data-block-id="${capture.widget}"] [data-tier-frame-state="ready"]`).waitFor()
          await page.evaluate(({ mode, target }) => {
            globalThis.__sfP2Harness?.setNativeMode(mode)
            globalThis.__sfP2Harness?.refreshNative(target)
          }, { mode: state.transition, target: capture.widget })
        }
        await runInteraction(capture)
        const frame = frameFor(capture, renderedState)
        await frame.waitFor({ state: 'visible' })
        await page.evaluate(() => getSelection()?.removeAllRanges())
        const measurement = await measureFrame(capture, frame)
        let stack = null
        if (capture.kind === 'stack-pair' || capture.kind === 'family-interaction' || capture.kind === 'compatibility') {
          stack = await measureStack(capture)
          assert.equal(stack.members.length, 2, `${capture.key}: stack pair member count drifted`)
          assert.equal(stack.members.filter((member) => member.active).length, 1, `${capture.key}: stack must expose one face`)
          for (const member of stack.members) {
            assert(member.frame, `${capture.key}: ${member.id} stack frame is missing`)
            const expected = manifest.dimensions[capture.tier]
            assert(withinTolerance(member.frame.width, expected.width), `${capture.key}: ${member.id} stack width drifted`)
            assert(withinTolerance(member.frame.height, expected.height), `${capture.key}: ${member.id} stack height drifted`)
          }
          assert(withinTolerance(stack.members[0].frame.width, stack.members[1].frame.width), `${capture.key}: stack member widths differ`)
          assert(withinTolerance(stack.members[0].frame.height, stack.members[1].frame.height), `${capture.key}: stack member heights differ`)
        }
        const image = await screenshotCapture(capture, viewport)
        const after = await page.evaluate(() => chrome.storage.local.get(null))
        const writeCalls = await page.evaluate(() => globalThis.__sfP2Harness?.writeCalls ?? [])
        const storage = assertSfP2StorageAudit({ capture, before, after, writeCalls })
        const requests = evidence.requests.slice(requestStart)
        const failedRequests = evidence.failedRequests.slice(failedStart)
        const unexpectedRequests = evidence.unexpectedRequests.slice(unexpectedStart)
        const requestAudit = assertSfP2RequestAudit({ requests, failedRequests, unexpectedRequests, approvedRequests })
        const layoutBefore = JSON.stringify(before.layouts)
        const layoutAfter = JSON.stringify(after.layouts)
        const legacyBefore = JSON.stringify(before.layout ?? null)
        const legacyAfter = JSON.stringify(after.layout ?? null)

        navigating = true
        // Begin navigation before aborting the old page's deliberately held
        // requests. Releasing them while the widget is still mounted lets
        // Status normalize the harness abort into "unknown" rows and persist
        // that synthetic result. Detach this generation first so requests
        // started by the reloaded page remain held for the reload witness.
        const priorPendingRoutes = pendingRoutes.splice(0)
        await page.evaluate(() => globalThis.__sfP2Harness?.clearWrites())
        const navigated = page.waitForEvent('framenavigated')
        const reload = page.reload({ waitUntil: 'domcontentloaded' })
        await navigated
        for (const entry of priorPendingRoutes) entry.release()
        await Promise.allSettled(priorPendingRoutes.map((entry) => entry.done))
        await reload
        await page.locator('[data-canvas-surface]').waitFor()
        const reloaded = await page.evaluate(() => chrome.storage.local.get(null))
        const reloadWrites = await page.evaluate(() => globalThis.__sfP2Harness?.writeCalls ?? [])
        assert.deepEqual(
          topLevelChanges(after.connectorSnapshots ?? {}, reloaded.connectorSnapshots ?? {}),
          [],
          `${capture.key}: connector snapshots changed across reload`,
        )
        assert.deepEqual(topLevelChanges(after, reloaded), [], `${capture.key}: top-level storage keys changed across reload`)
        assert.equal(canonical(reloaded), canonical(after), `${capture.key}: storage changed across reload`)
        assert.deepEqual(reloadWrites, [], `${capture.key}: reload wrote storage ${JSON.stringify(reloadWrites)}`)
        navigating = false

        evidence.captures.push({
          ...capture,
          measurement,
          stack,
          image,
          storage: {
            ...storage,
            reloadWrites,
            layoutBefore: { bytes: Buffer.byteLength(layoutBefore), sha256: hashBytes(layoutBefore) },
            layoutAfter: { bytes: Buffer.byteLength(layoutAfter), sha256: hashBytes(layoutAfter) },
            legacyBefore: { bytes: Buffer.byteLength(legacyBefore), sha256: hashBytes(legacyBefore) },
            legacyAfter: { bytes: Buffer.byteLength(legacyAfter), sha256: hashBytes(legacyAfter) },
          },
          requestAudit,
          requests,
        })
        const stageRow = evidence.stages.find(({ id }) => id === stage.id)
        stageRow.completed += 1
        process.stdout.write(`CAPTURE ${evidence.captures.length}/${runCaptures.length} ${capture.key}\n`)
        } catch (error) {
          navigating = true
          await disposePendingRoutes().catch(() => {})
          const failure = buildSfP2CaptureFailure(capture, error)
          evidence.captureFailures.push(failure)
          const stageRow = evidence.stages.find(({ id }) => id === stage.id)
          stageRow.failed += 1
          process.stderr.write(`CAPTURE-FAIL ${capture.key}: ${failure.message}\n`)
        }
      }
    }

    assert.equal(evidence.captureFailures.length, 0, `capture failures: ${JSON.stringify(evidence.captureFailures)}`)
    assert.equal(evidence.runtimeErrors.length, 0, `runtime errors: ${JSON.stringify(evidence.runtimeErrors)}`)
    assert.equal(evidence.failedRequests.length, 0, `failed requests: ${JSON.stringify(evidence.failedRequests)}`)
    assert.equal(evidence.unexpectedRequests.length, 0, `unexpected requests: ${JSON.stringify(evidence.unexpectedRequests)}`)
    if (evidence.selection.complete) validateSfP2RuntimeEvidence(evidence, { requireVerdicts: !mode.captureOnly })
  } catch (error) {
    caughtError = error
  } finally {
    navigating = true
    try { await disposePendingRoutes() } catch { /* context close remains authoritative */ }
    if (context) {
      try {
        await context.close()
        evidence.cleanup.browserClosed = true
      } catch (error) {
        caughtError ??= error
      }
    }
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      evidence.cleanup.profileRemoved = !existsSync(profileDir)
    } catch (error) {
      caughtError ??= error
    }
    evidence.finishedAt = new Date().toISOString()
    evidence.summary = {
      planned: runCaptures.length,
      captures: evidence.captures.length,
      captureFailures: evidence.captureFailures.length,
      requests: evidence.requests.length,
      runtimeErrors: evidence.runtimeErrors.length,
      failedRequests: evidence.failedRequests.length,
      unexpectedRequests: evidence.unexpectedRequests.length,
    }
    const evidenceName = evidence.selection.complete ? 'evidence.json' : 'evidence.partial.json'
    writeFileSync(resolve(catalogDir, evidenceName), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  }

  if (caughtError) throw caughtError
  process.stdout.write(`PASS SF-P2 ${mode.preliminaryWorkingTree ? 'preliminary working-tree' : 'exact'} witness: ${evidence.captures.length} captures, 0 runtime/failed/unapproved requests\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run()
}
