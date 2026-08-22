import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { CATALOG_BATCHES } from './widget-catalog-manifest.mjs'
import {
  assertAllowedStorageChange,
  assertBuildProvenance,
  assertOperationCounts,
  assertScenarioOperationCounts,
  authorizeRequestFailure,
  inspectProviderRequest,
  isExpectedRequestFailure,
} from './work-connector-harness-contracts.mjs'

const repoRoot = resolve(process.cwd())
const protectedRoot = resolve('D:/DEV/Chrome plugin')
const dist = resolve('dist')
const profileDir = resolve('.qa-work-connectors-profile')
const requestedOut = process.argv.find((arg) => arg.startsWith('--out-dir='))?.slice('--out-dir='.length)
const outDir = resolve(requestedOut || '.qa-work-connectors-evidence')
const expectedCommit = process.argv.find((arg) => arg.startsWith('--expected-commit='))?.slice('--expected-commit='.length)
const headed = process.argv.includes('--headed')
const evidenceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()

if (!expectedCommit) throw new Error('expected-commit is required')
if (expectedCommit !== evidenceCommit) throw new Error(`expected-commit mismatch: ${expectedCommit} != ${evidenceCommit}`)
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }).trim()) {
  throw new Error('dirty tracked worktree: Work evidence requires an exact committed source tree')
}

function safeScratch(path, prefix) {
  const normalized = resolve(path)
  if (dirname(normalized) !== repoRoot || !basename(normalized).startsWith(prefix)) {
    throw new Error(`unsafe Work evidence path: ${normalized}`)
  }
  if (normalized === repoRoot || normalized.startsWith(`${protectedRoot}\\`)) {
    throw new Error(`protected path refused: ${normalized}`)
  }
  let stat = null
  try { stat = lstatSync(normalized) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  if (stat?.isSymbolicLink()) throw new Error(`linked Work evidence path refused: ${normalized}`)
  if (stat) rmSync(normalized, { recursive: true, force: true })
  mkdirSync(normalized)
}

safeScratch(outDir, '.qa-work-connectors-')
safeScratch(profileDir, '.qa-work-connectors-')

const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'))
if (!manifest.optional_host_permissions?.includes('https://*/*')) {
  throw new Error('dist is missing the requestable optional HTTPS origin boundary')
}
assertBuildProvenance(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'), expectedCommit)
const ALL_WIDGET_IDS = [...new Set(Object.values(CATALOG_BATCHES).flatMap((batch) => batch.map((entry) => entry.id)))]

const TIERS = ['compact', 'standard', 'full', 'docked']
const DEGRADED_STATES = ['setup', 'loading', 'empty', 'hard-error', 'retained-error', 'stale']
const VIEWPORTS = [
  { width: 1600, height: 900, label: 'common' },
  { width: 1408, height: 445, label: 'exact-short' },
]
const FAKE_TOKENS = {
  linear: 'FAKE_LINEAR_TOKEN_DO_NOT_USE',
  sentry: 'FAKE_SENTRY_TOKEN_DO_NOT_USE',
  todoist: 'FAKE_TODOIST_TOKEN_DO_NOT_USE',
}
if (Object.values(FAKE_TOKENS).some((token) => !token.startsWith('FAKE_') || /(?:lin_api_|sntrys_|pat_)[A-Za-z0-9]{12}/.test(token))) {
  throw new Error('live-looking credential refused')
}

const today = new Date().toISOString().slice(0, 10)
const linearIssues = Array.from({ length: 25 }, (_, index) => ({
  id: `linear-${index + 1}`,
  identifier: `AUR-${index + 1}`,
  title: `Work issue ${String(index + 1).padStart(2, '0')}`,
  priority: index === 0 ? 'urgent' : index % 4 === 0 ? 'high' : 'normal',
  dueDate: index < 5 ? today : null,
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
  project: index % 2
    ? { id: 'api', name: 'API', slug: 'api' }
    : { id: 'web', name: 'Web', slug: 'web' },
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
const todoistProjects = [{ id: 'work', name: 'Work' }, { id: 'personal', name: 'Personal' }]
const todoistTasks = Array.from({ length: 25 }, (_, index) => ({
  id: `task-${index + 1}`,
  content: `Ship Aurora ${String(index + 1).padStart(2, '0')}`,
  projectId: index % 2 ? 'personal' : 'work',
  due: { date: today, datetime: null, timeZone: null, text: index < 5 ? 'overdue' : index < 15 ? 'today' : 'upcoming', isRecurring: index === 2 },
  priority: index === 0 ? 4 : 2,
  labels: index === 0 ? ['release'] : [],
  duration: index === 0 ? { amount: 30, unit: 'minute' } : null,
  parentId: null,
  bucket: index < 5 ? 'overdue' : index < 15 ? 'today' : 'upcoming',
  url: `https://app.todoist.com/app/task/task-${index + 1}`,
}))

const WIDGETS = [
  {
    id: 'linear', title: 'Linear', origin: 'https://api.linear.app/*',
    config: { enabled: true, token: FAKE_TOKENS.linear, displayName: 'QA Builder', teamIds: [], itemLimit: 6 },
    data: { issues: linearIssues }, empty: { issues: [] },
    compact: ['25 assigned', '5 due soon', 'AUR-1'], docked: ['25 assigned', '5 due soon'],
    standard: ['Work issue 01', 'AUR-1', 'Aurora', 'Urgent'], full: ['Work issue 25', 'In Progress', 'Todo', 'QA Cycle'],
  },
  {
    id: 'sentry', title: 'Sentry', origin: 'https://us.sentry.io/*',
    config: { enabled: true, token: FAKE_TOKENS.sentry, organization: 'acme-labs', region: 'us', projectSlugs: [], itemLimit: 6 },
    data: { issues: sentryIssues }, empty: { issues: [] },
    compact: ['25 unresolved', '1 critical', 'Fatal', 'WEB-1'], docked: ['25 unresolved', 'WEB-1'],
    standard: ['Checkout failure 01', 'Web', 'WEB-1', 'Fatal', '3 users', 'Last seen'],
    full: ['Checkout failure 25', 'First seen', 'Priority high', 'Regression'],
  },
  {
    id: 'todoist', title: 'Todoist', origin: 'https://api.todoist.com/*',
    config: { enabled: true, token: FAKE_TOKENS.todoist, accountLabel: 'Todoist', projectIds: [], itemLimit: 6 },
    data: { projects: todoistProjects, tasks: todoistTasks }, empty: { projects: todoistProjects, tasks: [] },
    compact: ['25 due', '5 overdue', '10 due today', 'Next: Ship Aurora 01'], docked: ['10 due today', '5 overdue'],
    standard: ['Ship Aurora 01', 'Work', 'Overdue', 'Today', 'Priority 4', '30 min'],
    full: ['Ship Aurora 25', 'Personal', 'Upcoming', 'Recurring'],
  },
]
const EXPECTED_CONTROL_OPERATION_COUNTS = Object.freeze({
  'linear-identity': 2,
  'todoist-close': 2,
})
const EXPECTED_INTERACTION_OPERATION_COUNTS = Object.freeze({
  'settings:linear:connect|linear-identity': 1,
  'settings:linear:connect|linear-work': 1,
  'settings:linear:preferences|linear-work': 2,
  'settings:linear:reconnect|linear-identity': 1,
  'settings:linear:reconnect|linear-work': 1,
  'settings:sentry:connect|sentry-issues': 2,
  'settings:sentry:preferences|sentry-issues': 2,
  'settings:sentry:reconnect|sentry-issues': 2,
  'settings:todoist:connect|todoist-projects': 2,
  'settings:todoist:connect|todoist-tasks': 1,
  'settings:todoist:preferences|todoist-projects': 2,
  'settings:todoist:preferences|todoist-tasks': 2,
  'settings:todoist:reconnect|todoist-projects': 2,
  'settings:todoist:reconnect|todoist-tasks': 1,
  'todoist-completion:success|todoist-close': 1,
  'todoist-completion:success|todoist-projects': 1,
  'todoist-completion:success|todoist-tasks': 1,
  'todoist-completion:error|todoist-close': 1,
})

// Source-visible scenario declarations are part of the witness contract.
const SCENARIOS = [
  { kind: 'tiers' },
  { kind: 'degraded' },
  { kind: 'dock-detail' },
  { kind: 'settings' },
  { kind: 'deep-link' },
  { kind: 'todoist-completion' },
]
void SCENARIOS

const evidence = {
  evidenceCommit,
  captures: [],
  contactSheets: [],
  requestLog: [],
  storageWrites: [],
  settingsStates: [],
  permissionCalls: [],
  expectedFaultSignals: [],
  expectedRequestAborts: [],
  runtimeErrors: [],
  failedRequests: [],
  failures: [],
}
const fail = (message) => evidence.failures.push(message)
const networkModes = new Map()
const expectedFailedRequests = new Set()
const pendingProviderRequests = new Set()
const activeProviderRoutes = new Set()
const delayedProviderRoutes = new Map()
const lastProviderRequestAt = new Map()
let harnessNavigating = false
const permissionCallTimeline = []
const DELAYED_FAULT_MS = 10_000
let closeMode = 'success'
const closedTasks = new Set()
let requestScenarioSequence = 0
let activeRequestScenario = 'bootstrap'

function markRequestScenario(label) {
  requestScenarioSequence += 1
  activeRequestScenario = `${requestScenarioSequence}:${label}`
  return evidence.requestLog.length
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: VIEWPORTS[0],
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})

await context.addInitScript(() => {
  if (!globalThis.chrome?.permissions) return
  const held = new Set()
  const calls = []
  const harness = { mode: 'grant', held, calls }
  globalThis.__auroraWorkPermissionHarness = harness
  chrome.permissions.contains = async (details) => {
    calls.push({ action: 'contains', origins: [...(details.origins ?? [])] })
    return (details.origins ?? []).every((origin) => held.has(origin))
  }
  chrome.permissions.request = async (details) => {
    calls.push({ action: 'request', origins: [...(details.origins ?? [])] })
    if (harness.mode === 'deny') return false
    for (const origin of details.origins ?? []) held.add(origin)
    return true
  }
  chrome.permissions.remove = async (details) => {
    calls.push({ action: 'remove', origins: [...(details.origins ?? [])] })
    for (const origin of details.origins ?? []) held.delete(origin)
    return true
  }
  const storageWrites = []
  const storageTransitions = []
  const workConnectorState = (connectors) => Object.fromEntries(['linear', 'sentry', 'todoist'].map((id) => {
    const connector = connectors?.[id]
    return [id, connector ? {
      present: true,
      enabled: connector.enabled === true,
      hasToken: typeof connector.token === 'string' && connector.token.length > 0,
      snapshotEpoch: connector.snapshotEpoch ?? null,
      teamIds: connector.teamIds ?? null,
      projectSlugs: connector.projectSlugs ?? null,
      projectIds: connector.projectIds ?? null,
      itemLimit: connector.itemLimit ?? null,
    } : { present: false }]
  }))
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const keys = Object.keys(changes).sort()
    storageWrites.push(keys)
    storageTransitions.push({
      at: performance.now(),
      keys,
      ...(changes.connectors ? { connectors: workConnectorState(changes.connectors.newValue) } : {}),
      ...(changes.connectorSnapshots ? { snapshotIds: Object.keys(changes.connectorSnapshots.newValue ?? {}).sort() } : {}),
    })
  })
  globalThis.__auroraWorkHarness = { storageWrites, storageTransitions }
})

async function checkedRouteRequest(route) {
  const request = route.request()
  const headers = request.headers()
  const authorization = headers.authorization ?? ''
  let contract
  try {
    contract = inspectProviderRequest({
      method: request.method(),
      url: request.url(),
      authorization,
      contentType: headers['content-type'] ?? null,
      body: request.postData(),
    }, FAKE_TOKENS)
  } catch (error) {
    fail(`provider request contract mismatch: ${error instanceof Error ? error.message : String(error)}`)
    authorizeRequestFailure(expectedFailedRequests, request)
    await route.abort('failed').catch(() => {})
    return null
  }
  if (
    contract.operation === 'linear-work' &&
    JSON.stringify(contract.linearTeamIds) !== '[]' &&
    JSON.stringify(contract.linearTeamIds) !== '["ops"]'
  ) {
    fail(`Linear work request used an unplanned team filter: ${JSON.stringify(contract.linearTeamIds)}`)
  }
  evidence.requestLog.push({
    scenario: activeRequestScenario,
    method: request.method(),
    url: request.url(),
    authKind: authorization.startsWith('Bearer ') ? 'bearer' : authorization ? 'raw' : 'none',
    contentType: headers['content-type'] ?? null,
    bodyKind: contract.operation,
    ...(contract.linearTeamIds ? { linearTeamIds: contract.linearTeamIds } : {}),
  })
  return { request, operation: contract.operation }
}

async function delayed(route) {
  authorizeRequestFailure(expectedFailedRequests, route.request())
  const provider = providerForUrl(route.request().url())
  let release
  const released = new Promise((resolveDelay) => { release = resolveDelay })
  const timer = setTimeout(release, DELAYED_FAULT_MS)
  const done = (async () => {
    await released
    clearTimeout(timer)
    await route.abort('failed').catch(() => {})
  })()
  delayedProviderRoutes.set(route, { provider, release, done })
  try {
    await done
  } finally {
    delayedProviderRoutes.delete(route)
  }
}

async function trackedProviderRoute(route, handler) {
  activeProviderRoutes.add(route)
  try {
    return await handler()
  } finally {
    activeProviderRoutes.delete(route)
  }
}

await context.route('https://api.linear.app/**', (route) => trackedProviderRoute(route, async () => {
  const checked = await checkedRouteRequest(route)
  if (!checked) return
  const { operation } = checked
  const mode = networkModes.get('linear') ?? 'ready'
  if (mode === 'loading' || mode === 'stale') return delayed(route)
  if (mode === 'hard-error' || mode === 'retained-error') return route.fulfill({ status: 503, body: '' })
  if (operation === 'linear-identity') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { viewer: { id: 'qa-user', name: 'QA Builder', teams: { nodes: [{ id: 'aurora', key: 'AUR', name: 'Aurora' }, { id: 'ops', key: 'OPS', name: 'Ops' }] } } } }) })
  }
  const nodes = linearIssues.map((issue) => ({
    ...issue,
    priority: issue.priority === 'urgent' ? 1 : issue.priority === 'high' ? 2 : 3,
  }))
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { viewer: { assignedIssues: { nodes } } } }) })
}))

await context.route(/https:\/\/(?:sentry|us\.sentry|de\.sentry)\.io\/.*/, (route) => trackedProviderRoute(route, async () => {
  const checked = await checkedRouteRequest(route)
  if (!checked) return
  const mode = networkModes.get('sentry') ?? 'ready'
  if (mode === 'loading' || mode === 'stale') return delayed(route)
  if (mode === 'hard-error' || mode === 'retained-error') return route.fulfill({ status: 503, body: '' })
  const body = sentryIssues.map((issue) => ({
    id: issue.id, title: issue.title, shortId: issue.shortId, project: issue.project,
    level: issue.level, count: String(issue.count), userCount: issue.userCount,
    firstSeen: issue.firstSeen, lastSeen: issue.lastSeen,
    stats: { '24h': issue.stats24h }, permalink: issue.permalink,
    priority: issue.priority, status: 'unresolved',
    statusDetails: issue.isRegression ? { type: 'regression' } : {},
  }))
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}))

await context.route('https://api.todoist.com/**', (route) => trackedProviderRoute(route, async () => {
  const checked = await checkedRouteRequest(route)
  if (!checked) return
  const { request, operation } = checked
  const mode = networkModes.get('todoist') ?? 'ready'
  if (mode === 'loading' || mode === 'stale') return delayed(route)
  if (mode === 'hard-error' || mode === 'retained-error') return route.fulfill({ status: 503, body: '' })
  if (operation === 'todoist-close') {
    if (closeMode === 'error') return route.fulfill({ status: 500, body: '' })
    const url = new URL(request.url())
    const id = decodeURIComponent(url.pathname.split('/').at(-2))
    closedTasks.add(id)
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  }
  if (operation === 'todoist-projects') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: todoistProjects, next_cursor: null }) })
  }
  const results = todoistTasks.filter((task) => !closedTasks.has(task.id)).map((task) => ({
    id: task.id, content: task.content, project_id: task.projectId,
    due: { date: task.due.date, datetime: null, timezone: null, string: task.due.text, is_recurring: task.due.isRecurring },
    priority: task.priority, labels: task.labels, duration: task.duration, parent_id: task.parentId, is_completed: false,
  }))
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results, next_cursor: null }) })
}))

const page = context.pages()[0] ?? await context.newPage()
page.setDefaultTimeout(20_000)
page.on('console', (message) => {
  if (message.type() !== 'error') return
  const text = message.text()
  if (/Failed to load resource: the server responded with a status of (?:500|503) \(/.test(text) ||
      (/Failed to load resource: net::ERR_(?:ABORTED|FAILED)/.test(text) &&
        (harnessNavigating || expectedFailedRequests.size > 0 || /:seed:[^:]+:[^:]+:(?:loading|stale)$/.test(activeRequestScenario)))) {
    evidence.expectedFaultSignals.push(`console: ${text}`)
  } else {
    evidence.runtimeErrors.push(`console: ${text}`)
  }
})
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  const url = request.url()
  const errorText = request.failure()?.errorText ?? 'failed'
  pendingProviderRequests.delete(request)
  if (harnessNavigating || isExpectedRequestFailure(request, errorText, expectedFailedRequests)) {
    evidence.expectedRequestAborts.push(`${request.method()} ${url}: ${errorText}`)
  } else if (!url.startsWith('chrome-extension://')) {
    evidence.failedRequests.push(`${request.method()} ${url}: ${errorText}`)
  }
})
page.on('requestfinished', (request) => pendingProviderRequests.delete(request))
page.on('request', (request) => {
  const url = request.url()
  if (providerForUrl(url)) {
    pendingProviderRequests.add(request)
    lastProviderRequestAt.set(providerForUrl(url), Date.now())
    if (harnessNavigating) authorizeRequestFailure(expectedFailedRequests, request)
  }
  else if (url.startsWith('http')) fail(`unexpected external request: ${request.method()} ${url}`)
})

function providerForUrl(url) {
  if (url.startsWith('https://api.linear.app/')) return 'linear'
  if (/^https:\/\/(?:sentry|us\.sentry|de\.sentry)\.io\//.test(url)) return 'sentry'
  if (url.startsWith('https://api.todoist.com/')) return 'todoist'
  return null
}

function markHarnessNavigation() {
  for (const request of pendingProviderRequests) authorizeRequestFailure(expectedFailedRequests, request)
}

async function waitForLoggedRequest(startIndex, predicate, label) {
  const deadline = Date.now() + 5_000
  while (!evidence.requestLog.slice(startIndex).some(predicate)) {
    if (Date.now() >= deadline) throw new Error(`${label} request was not observed`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
  }
}

async function settleProvider(provider, { cancelDelayed = false } = {}) {
  if (cancelDelayed) {
    const delayed = [...delayedProviderRoutes.values()].filter((entry) => entry.provider === provider)
    for (const entry of delayed) entry.release()
    await Promise.allSettled(delayed.map((entry) => entry.done))
  }

  const startedAt = Date.now()
  const deadline = startedAt + 5_000
  while (true) {
    if (cancelDelayed) {
      for (const entry of delayedProviderRoutes.values()) {
        if (entry.provider === provider) entry.release()
      }
    }
    const pending = [...activeProviderRoutes].some((route) => providerForUrl(route.request().url()) === provider)
    const lastRequestAt = lastProviderRequestAt.get(provider) ?? startedAt
    if (!pending && Date.now() - lastRequestAt >= 200) return
    if (Date.now() >= deadline) throw new Error(`${provider} requests did not settle during ${activeRequestScenario}`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
  }
}

async function harvestPermissionCalls() {
  const calls = await page.evaluate(() => {
    const current = globalThis.__auroraWorkPermissionHarness?.calls ?? []
    return current.splice(0, current.length)
  }).catch(() => [])
  permissionCallTimeline.push(...calls)
}

async function reloadForHarness() {
  harnessNavigating = true
  markHarnessNavigation()
  await harvestPermissionCalls()
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    // Keep the navigation boundary open through the old document's deferred
    // request-abort events. Chromium can deliver those just after the new
    // document reaches DOMContentLoaded.
    await page.waitForTimeout(100)
  } finally {
    harnessNavigating = false
  }
}

async function waitForSurface() {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(100)
}

async function seed(widget, tier, state = 'ready') {
  markRequestScenario(`seed:${widget.id}:${tier}:${state}`)
  networkModes.clear()
  networkModes.set(widget.id, state)
  const config = state === 'setup' ? { enabled: true } : widget.config
  const data = state === 'empty' ? widget.empty : widget.data
  const snapshot = ['ready', 'empty', 'retained-error', 'stale'].includes(state)
  const stale = state === 'retained-error' || state === 'stale'
  await page.evaluate(async ({ id, tier, config, data, snapshot, stale, allWidgetIds }) => {
    const canonical = (value) => {
      if (value === null) return 'null'
      if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
      if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
      if (typeof value === 'object') return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      throw new TypeError('Unsupported QA config')
    }
    const scopeFor = async () => {
      const identity = `${id}\n${canonical(config)}`
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
      const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      return `${id}:v1:${hex}`
    }
    const current = await chrome.storage.local.get(null)
    if (!current.settings) throw new Error('Aurora storage did not hydrate before Work seed')
    const placement = tier === 'docked'
      ? { kind: 'docked', dock: 'bottom', order: 0, offsetX: 0, dockTier: 'compact' }
      : { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 0 }
    const widgets = Object.fromEntries(allWidgetIds.map((widgetId) => [widgetId, { kind: 'hidden' }]))
    widgets[id] = placement
    await chrome.storage.local.set({
      settings: { ...current.settings, widgets: { ...current.settings.widgets, [id]: true } },
      connectors: { [id]: config },
      connectorSnapshots: snapshot ? { [id]: { scope: await scopeFor(), fetchedAt: Date.now() - (stale ? 60 * 60_000 : 0), data } } : {},
      layouts: {
        version: 1,
        activeLayoutId: 'work-qa',
        layouts: [{
          id: 'work-qa', name: 'Work QA',
          widgets,
        }],
      },
    })
  }, { id: widget.id, tier, config, data, snapshot, stale, allWidgetIds: ALL_WIDGET_IDS })
  await reloadForHarness()
  await waitForSurface()
  await page.locator(`[data-block-id="${widget.id}"]`).waitFor()
  if (tier === 'docked') {
    await page.locator(`[data-block-id="${widget.id}"] [data-dock-line]`).waitFor()
  } else {
    const expected = state === 'ready' ? 'ready' : state
    await page.locator(`[data-block-id="${widget.id}"] [data-work-resource-state="${expected}"]`).waitFor()
  }
}

async function storageTruth() {
  return page.evaluate(async () => {
    const data = await chrome.storage.local.get(null)
    return { data, serialized: JSON.stringify(data), writes: globalThis.__auroraWorkHarness?.storageWrites ?? [] }
  })
}

async function storageCheckpoint() {
  return page.evaluate(async () => {
    const writes = globalThis.__auroraWorkHarness?.storageWrites ?? []
    const transitions = globalThis.__auroraWorkHarness?.storageTransitions ?? []
    return {
      data: await chrome.storage.local.get(null),
      writes: writes.splice(0, writes.length),
      transitions: transitions.splice(0, transitions.length),
    }
  })
}

async function recordSettingsState(label, id) {
  const state = await page.evaluate(async (connectorId) => {
    const { connectors, connectorSnapshots } = await chrome.storage.local.get(['connectors', 'connectorSnapshots'])
    const connector = connectors?.[connectorId]
    return {
      connector: connector ? {
        present: true,
        enabled: connector.enabled === true,
        hasToken: typeof connector.token === 'string' && connector.token.length > 0,
        snapshotEpoch: connector.snapshotEpoch ?? null,
        teamIds: connector.teamIds ?? null,
        projectSlugs: connector.projectSlugs ?? null,
        projectIds: connector.projectIds ?? null,
        itemLimit: connector.itemLimit ?? null,
      } : { present: false },
      snapshotPresent: Boolean(connectorSnapshots && Object.prototype.hasOwnProperty.call(connectorSnapshots, connectorId)),
    }
  }, id)
  evidence.settingsStates.push({ label, widget: id, ...state })
  return state
}

async function assertStorageStep(label, before, allowedKeys) {
  const after = await storageCheckpoint()
  try {
    const changedKeys = assertAllowedStorageChange(before.data, after.data, allowedKeys)
    const allowed = new Set(allowedKeys)
    const forbiddenWriteKeys = [...new Set(after.writes.flat())].filter((key) => !allowed.has(key))
    if (forbiddenWriteKeys.length) throw new Error(`Unexpected storage write keys: ${forbiddenWriteKeys.join(', ')}`)
    evidence.storageWrites.push({ label, changedKeys, writes: after.writes, transitions: after.transitions })
  } catch (error) {
    fail(`${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return after
}

async function capture(widget, { kind, tier, state = 'ready', viewport = VIEWPORTS[0], openDock = tier === 'docked' }) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.waitForFunction(({ height }) => {
    const surface = document.querySelector('[data-canvas-surface]')
    return window.innerHeight === height && surface?.style.minHeight === `${height}px`
  }, { height: viewport.height })
  if (openDock) {
    await page.locator(`[data-block-id="${widget.id}"] [data-dock-line]`).click()
    await page.locator('[data-work-dock-detail]').waitFor()
  }
  const label = [widget.id, kind, tier, state, viewport.label].join('-')
  const truth = await page.evaluate((id) => {
    const item = document.querySelector(`[data-block-id="${id}"]`)
    const detail = document.querySelector('[data-work-dock-detail]')
    const painted = detail ?? item?.querySelector('[data-work-widget], [data-dock-line]')
    const scroll = item?.querySelector('[data-work-widget-scroll]')
    const rect = item?.getBoundingClientRect()
    const text = [item?.textContent, detail?.textContent].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    return {
      text,
      state: item?.querySelector('[data-work-widget]')?.getAttribute('data-work-resource-state') ?? null,
      rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      painted: Boolean(painted),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      localScroll: scroll ? { clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight } : null,
    }
  }, widget.id)
  if (!truth.painted || !truth.text || !truth.rect || truth.rect.width < 4 || truth.rect.height < 4) fail(`${label}: degenerate or empty widget`)
  if (truth.horizontalOverflow) fail(`${label}: page horizontal overflow`)
  if (truth.rect && (truth.rect.left < -1 || truth.rect.right > viewport.width + 1 || truth.rect.top < -1 || truth.rect.bottom > viewport.height + 1)) {
    fail(`${label}: widget leaves viewport`)
  }
  if (tier === 'docked' && truth.rect && truth.rect.height > 48) fail(`${label}: Docked height ${truth.rect.height}px exceeds 48px`)
  const expected = state === 'ready'
    ? tier === 'docked' ? widget.docked : tier === 'compact' ? widget.compact : tier === 'standard' ? widget.standard : widget.full
    : state === 'setup' ? [`Connect ${widget.title} in Settings.`]
      : state === 'loading' ? [`Loading ${widget.title}`]
        : state === 'empty' ? [widget.id === 'linear' ? 'No assigned issues.' : widget.id === 'sentry' ? 'No unresolved issues.' : 'No due tasks.']
          : state === 'hard-error' || state === 'retained-error' ? ['failed']
            : ['Showing saved data']
  const missing = expected.filter((fact) => !truth.text.toLowerCase().includes(fact.toLowerCase()))
  if (missing.length) fail(`${label}: missing useful facts ${missing.join(' | ')}`)
  if (kind === 'tiers' && tier === 'full' && viewport.label === 'common' && (!truth.localScroll || truth.localScroll.scrollHeight <= truth.localScroll.clientHeight)) {
    fail(`${label}: maximum Full data does not scroll locally`)
  }
  const path = join(outDir, `${label}.png`)
  await page.screenshot({ path, fullPage: true })
  await settleProvider(widget.id, { cancelDelayed: state === 'loading' || state === 'stale' })
  const stored = await storageTruth()
  if (stored.writes.length) fail(`${label}: storage mutation outside expected keys ${JSON.stringify(stored.writes)}`)
  if (stored.writes.some((keys) => keys.includes('layout'))) fail(`${label}: legacy layout write`)
  evidence.storageWrites.push({ label, writes: stored.writes })
  evidence.captures.push({
    label, path, widget: widget.id, kind, tier, state, viewport,
    geometry: truth.rect, localScroll: truth.localScroll, text: truth.text,
    usefulness: { judgment: missing.length === 0 && truth.painted ? 'useful' : 'failed', reason: expected.join(' | ') },
  })
  if (openDock) await page.keyboard.press('Escape')
}

async function assertDeepLink(widget) {
  await seed(widget, 'standard')
  await settleProvider(widget.id)
  const link = page.locator(`[data-block-id="${widget.id}"] a`).first()
  const details = await link.evaluate((node) => ({ href: node.getAttribute('href'), target: node.getAttribute('target'), rel: node.getAttribute('rel') }))
  const expectedHost = widget.id === 'linear' ? 'linear.app' : widget.id === 'sentry' ? 'us.sentry.io' : 'app.todoist.com'
  if (!details.href?.startsWith(`https://${expectedHost}/`) || details.target !== '_blank' || !details.rel?.includes('noopener')) {
    fail(`${widget.id}: deep-link contract is unsafe ${JSON.stringify(details)}`)
  }
}

async function openConnectors() {
  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByRole('dialog', { name: 'Settings' }).waitFor()
  await page.getByRole('tab', { name: 'Connectors' }).click()
  await page.getByPlaceholder('Search connectors').waitFor()
}

async function resetForSettings(widget) {
  networkModes.clear()
  await page.evaluate(async ({ allWidgetIds, id }) => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(allWidgetIds.map((widgetId) => [widgetId, { kind: 'hidden' }]))
    widgets[id] = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'standard', layer: 0 }
    await chrome.storage.local.set({
      settings: { ...settings, widgets: { ...settings.widgets, [id]: true } },
      connectors: {}, connectorSnapshots: {},
      layouts: { version: 1, activeLayoutId: 'work-settings-qa', layouts: [{ id: 'work-settings-qa', name: 'Work Settings QA', widgets }] },
    })
  }, { allWidgetIds: ALL_WIDGET_IDS, id: widget.id })
  await reloadForHarness()
  await waitForSurface()
  await openConnectors()
}

async function fillSetup(widget) {
  if (widget.id === 'linear') {
    await page.getByLabel('Linear personal API key').fill(FAKE_TOKENS.linear)
  } else if (widget.id === 'sentry') {
    await page.getByLabel('Data region').selectOption('us')
    await page.getByLabel('Organization slug').fill('acme-labs')
    await page.getByLabel('Sentry auth token').fill(FAKE_TOKENS.sentry)
  } else {
    await page.getByLabel('Todoist API token').fill(FAKE_TOKENS.todoist)
  }
}

async function exerciseSettings(widget) {
  markRequestScenario(`settings:${widget.id}:reset`)
  await resetForSettings(widget)
  const permissionCursor = permissionCallTimeline.length
  const search = page.getByPlaceholder('Search connectors')
  await search.fill(widget.title)
  await page.getByRole('button', { name: `Set up ${widget.title}` }).click()
  await fillSetup(widget)
  const beforeDenied = await storageCheckpoint()
  markRequestScenario(`settings:${widget.id}:denied-connect`)
  await page.evaluate(() => { globalThis.__auroraWorkPermissionHarness.mode = 'deny' })
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'denied' }).waitFor()
  await assertStorageStep(`${widget.id}-settings-denied`, beforeDenied, [])
  const denied = await page.evaluate((id) => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.[id]), widget.id)
  if (denied !== undefined) fail(`${widget.id}: denied setup persisted a connector`)

  const beforeConnect = await storageCheckpoint()
  markRequestScenario(`settings:${widget.id}:connect`)
  await page.evaluate(() => { globalThis.__auroraWorkPermissionHarness.mode = 'grant' })
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.waitForFunction((id) => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.[id]?.enabled === true), widget.id)
  await page.waitForFunction((id) => chrome.storage.local.get('connectorSnapshots').then(({ connectorSnapshots }) => connectorSnapshots?.[id]?.data), widget.id)
  await page.getByRole('region', { name: `${widget.title} setup` }).waitFor({ state: 'detached' })
  await settleProvider(widget.id)
  await assertStorageStep(`${widget.id}-settings-connect`, beforeConnect, ['connectors', 'connectorSnapshots'])

  const beforePreferences = await storageCheckpoint()
  markRequestScenario(`settings:${widget.id}:preferences`)
  await page.getByRole('button', { name: `Edit ${widget.title}` }).click()
  if (widget.id === 'linear') {
    const requestStart = evidence.requestLog.length
    await page.getByRole('button', { name: 'Ops' }).click()
    await page.waitForFunction(() => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.linear?.teamIds?.includes('ops')))
    await waitForLoggedRequest(
      requestStart,
      (request) => request.bodyKind === 'linear-work' && JSON.stringify(request.linearTeamIds) === '["ops"]',
      'Linear selected-team filter',
    )
  }
  if (widget.id === 'sentry') {
    await page.getByRole('button', { name: 'API' }).click()
    await page.waitForFunction(() => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.sentry?.projectSlugs?.includes('api')))
  }
  if (widget.id === 'todoist') {
    await page.getByRole('button', { name: 'Personal' }).click()
    await page.waitForFunction(() => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.todoist?.projectIds?.includes('personal')))
  }
  const countLabel = widget.id === 'todoist' ? 'Tasks shown' : 'Issues shown'
  await page.getByLabel(countLabel).selectOption('7')
  await page.waitForFunction(({ id }) => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.[id]?.itemLimit === 7), { id: widget.id })
  await settleProvider(widget.id)
  await assertStorageStep(`${widget.id}-settings-preferences`, beforePreferences, ['connectors', 'connectorSnapshots'])

  const path = join(outDir, `${widget.id}-settings-connected.png`)
  await page.screenshot({ path, fullPage: true })
  evidence.captures.push({ label: `${widget.id}-settings-connected`, path, widget: widget.id, kind: 'settings', usefulness: { judgment: 'useful', reason: 'connected identity, real picker, and item count visible' } })

  await page.getByRole('button', { name: `Close ${widget.title} editor` }).click()
  await page.evaluate(async (id) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    const current = connectors[id]
    const identity = id === 'linear' ? { displayName: current.displayName } : id === 'sentry' ? { organization: current.organization, region: current.region } : { accountLabel: current.accountLabel }
    const staleAccountPicks = id === 'linear'
      ? { teamIds: current.teamIds, itemLimit: current.itemLimit }
      : id === 'sentry'
        ? { projectSlugs: current.projectSlugs, itemLimit: current.itemLimit }
        : { projectIds: current.projectIds, itemLimit: current.itemLimit }
    await chrome.storage.local.set({ connectors: { ...connectors, [id]: { enabled: true, ...identity, ...staleAccountPicks } } })
  }, widget.id)
  await recordSettingsState(`${widget.id}-stripped`, widget.id)
  markRequestScenario(`settings:${widget.id}:stripped-reload`)
  await reloadForHarness()
  await waitForSurface()
  await openConnectors()
  await page.getByPlaceholder('Search connectors').fill(widget.title)
  await page.getByRole('button', { name: `Reconnect ${widget.title}` }).click()
  const reconnectRegion = page.getByRole('region', { name: `${widget.title} reconnect` })
  await reconnectRegion.waitFor()
  await fillSetup(widget)
  const beforeReconnect = await storageCheckpoint()
  await recordSettingsState(`${widget.id}-before-reconnect`, widget.id)
  const reconnectRequestStart = markRequestScenario(`settings:${widget.id}:reconnect`)
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.waitForFunction((id) => chrome.storage.local.get('connectors').then(({ connectors }) => {
    const connector = connectors?.[id]
    if (!connector?.token) return false
    if (id === 'linear') return !connector.teamIds?.includes('ops')
    if (id === 'sentry') return !connector.projectSlugs?.includes('api')
    return true
  }), widget.id)
  await reconnectRegion.waitFor({ state: 'detached' })
  if (widget.id === 'linear') {
    await waitForLoggedRequest(
      reconnectRequestStart,
      (request) => request.bodyKind === 'linear-work' && JSON.stringify(request.linearTeamIds) === '[]',
      'Linear reconnect cleared-team filter',
    )
  }
  await settleProvider(widget.id)
  await assertStorageStep(`${widget.id}-settings-reconnect`, beforeReconnect, ['connectors', 'connectorSnapshots'])
  await recordSettingsState(`${widget.id}-after-reconnect`, widget.id)
  const reconnected = await page.evaluate((id) => chrome.storage.local.get('connectors').then(({ connectors }) => connectors[id]), widget.id)
  if (widget.id === 'linear' && reconnected.teamIds?.includes('ops')) fail('linear: reconnect retained stale account-scoped team ids')
  if (widget.id === 'sentry' && reconnected.projectSlugs?.includes('api')) fail('sentry: reconnect retained stale account-scoped project slugs')
  await page.getByRole('button', { name: `Edit ${widget.title}` }).click()
  const editRegion = page.getByRole('region', { name: `${widget.title} settings` })
  await editRegion.waitFor()
  const beforeDisconnect = await storageCheckpoint()
  markRequestScenario(`settings:${widget.id}:disconnect`)
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await editRegion.waitFor({ state: 'detached' })
  await page.waitForFunction((id) => chrome.storage.local.get(['connectors', 'connectorSnapshots']).then(({ connectors, connectorSnapshots }) => (
    connectors?.[id] === undefined && !(connectorSnapshots && Object.prototype.hasOwnProperty.call(connectorSnapshots, id))
  )), widget.id)
  await settleProvider(widget.id)
  await assertStorageStep(`${widget.id}-settings-disconnect`, beforeDisconnect, ['connectors', 'connectorSnapshots'])
  await recordSettingsState(`${widget.id}-after-disconnect`, widget.id)
  const disconnectedSnapshotPresent = await page.evaluate((id) => chrome.storage.local.get('connectorSnapshots').then(({ connectorSnapshots }) => (
    Boolean(connectorSnapshots && Object.prototype.hasOwnProperty.call(connectorSnapshots, id))
  )), widget.id)
  if (disconnectedSnapshotPresent) fail(`${widget.id}: disconnect retained its provider snapshot`)

  await harvestPermissionCalls()
  const permissionCalls = permissionCallTimeline.slice(permissionCursor)
  evidence.permissionCalls.push({ widget: widget.id, calls: permissionCalls })
  const requested = permissionCalls.filter((entry) => entry.action === 'request').flatMap((entry) => entry.origins)
  if (!requested.includes(widget.origin)) fail(`${widget.id}: exact optional origin was not requested`)
}

async function exerciseTodoistCompletion(widget) {
  closeMode = 'success'
  closedTasks.clear()
  await seed(widget, 'standard')
  await settleProvider(widget.id)
  const beforeCancel = await storageTruth()
  const postBefore = evidence.requestLog.filter((entry) => entry.method === 'POST' && entry.url.includes('/close')).length
  await page.getByRole('button', { name: 'Complete Ship Aurora 01' }).click()
  await page.getByRole('dialog', { name: 'Complete Ship Aurora 01?' }).waitFor()
  await page.getByRole('button', { name: 'Cancel completion' }).click()
  const afterCancel = await storageTruth()
  if (afterCancel.serialized !== beforeCancel.serialized || evidence.requestLog.filter((entry) => entry.method === 'POST' && entry.url.includes('/close')).length !== postBefore) {
    fail('Todoist Cancel caused a request or storage write')
  }

  markRequestScenario('todoist-completion:success')
  await page.getByRole('button', { name: 'Complete Ship Aurora 01' }).click()
  const confirm = page.getByRole('button', { name: 'Confirm completion' })
  await confirm.evaluate((button) => { button.click(); button.click() })
  await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-label="Complete Ship Aurora 01?"]'))
  const closeRequests = evidence.requestLog.filter((entry) => entry.method === 'POST' && entry.url.endsWith('/api/v1/tasks/task-1/close'))
  if (closeRequests.length !== 1) fail(`Todoist completion sent ${closeRequests.length} close requests`)

  closeMode = 'error'
  closedTasks.clear()
  await seed(widget, 'standard')
  await settleProvider(widget.id)
  markRequestScenario('todoist-completion:error')
  await page.getByRole('button', { name: 'Complete Ship Aurora 01' }).click()
  const failedCloseResponse = page.waitForResponse((response) => (
    response.url().endsWith('/api/v1/tasks/task-1/close') && response.status() === 500
  ))
  await page.getByRole('button', { name: 'Confirm completion' }).click()
  await failedCloseResponse
  await page.getByRole('alert').filter({ hasText: 'status 500' }).waitFor()
  await settleProvider(widget.id)
  const path = join(outDir, 'todoist-completion-error.png')
  await page.screenshot({ path, fullPage: true })
  evidence.captures.push({ label: 'todoist-completion-error', path, widget: 'todoist', kind: 'todoist-completion', usefulness: { judgment: 'useful', reason: 'named confirmation retains retryable failure' } })
  closeMode = 'success'
}

try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForSurface()

  for (const widget of WIDGETS) {
    const tierTexts = new Map()
    for (const tier of TIERS) {
      await seed(widget, tier)
      await capture(widget, { kind: 'tiers', tier })
      tierTexts.set(tier, evidence.captures.at(-1)?.text ?? '')
    }
    if (tierTexts.get('compact') === tierTexts.get('standard')) fail(`${widget.id}: Compact and Standard text duplicated`)
    if (tierTexts.get('standard') === tierTexts.get('full')) fail(`${widget.id}: Standard and Full text duplicated`)

    for (const tier of ['standard', 'full']) {
      await seed(widget, tier)
      await capture(widget, { kind: 'tiers', tier, viewport: VIEWPORTS[1] })
    }

    for (const state of DEGRADED_STATES) {
      await seed(widget, 'standard', state)
      await capture(widget, { kind: 'degraded', tier: 'standard', state })
      await seed(widget, 'docked', state)
      await capture(widget, { kind: 'dock-detail', tier: 'docked', state })
    }

    await assertDeepLink(widget)
    if (widget.id === 'todoist') await exerciseTodoistCompletion(widget)
    await exerciseSettings(widget)
  }
} finally {
  // Closing the controlled browser is expected to abort any refresh still in
  // flight. Authorize those exact request fingerprints before teardown so a
  // genuinely unexpected provider failure during the witness still fails.
  harnessNavigating = true
  markHarnessNavigation()
  await context.close()
  harnessNavigating = false
}

for (const request of evidence.requestLog) {
  if (request.url.includes(FAKE_TOKENS.linear) || request.url.includes(FAKE_TOKENS.sentry) || request.url.includes(FAKE_TOKENS.todoist)) {
    fail('live-looking credential leaked into request URL')
  }
  if (request.url.startsWith('https://api.linear.app/') && (request.method !== 'POST' || request.authKind !== 'raw')) fail(`Linear request contract mismatch: ${JSON.stringify(request)}`)
  if (/^https:\/\/(?:sentry|us\.sentry|de\.sentry)\.io\//.test(request.url) && (request.method !== 'GET' || request.authKind !== 'bearer')) fail(`Sentry request contract mismatch: ${JSON.stringify(request)}`)
  if (request.url.startsWith('https://api.todoist.com/') && request.authKind !== 'bearer') fail(`Todoist request contract mismatch: ${JSON.stringify(request)}`)
}
try {
  evidence.controlOperationCounts = assertOperationCounts(
    evidence.requestLog.filter((request) => request.bodyKind === 'linear-identity' || request.bodyKind === 'todoist-close'),
    EXPECTED_CONTROL_OPERATION_COUNTS,
  )
  evidence.interactionOperationCounts = assertScenarioOperationCounts(
    evidence.requestLog,
    EXPECTED_INTERACTION_OPERATION_COUNTS,
  )
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
if (evidence.runtimeErrors.length) fail(`runtime errors: ${evidence.runtimeErrors.join(' | ')}`)
if (evidence.failedRequests.length) fail(`failed requests: ${evidence.failedRequests.join(' | ')}`)

for (const widget of WIDGETS) {
  const images = evidence.captures.filter((capture) => capture.widget === widget.id).slice(0, 24)
  const thumbs = await Promise.all(images.map(async (capture) => ({
    input: await sharp(capture.path).resize({ width: 320, height: 180, fit: 'contain', background: '#111827' }).png().toBuffer(),
  })))
  const columns = 4
  const rows = Math.ceil(thumbs.length / columns)
  const path = join(outDir, `${widget.id}-contact-sheet.png`)
  await sharp({ create: { width: columns * 320, height: rows * 180, channels: 4, background: '#111827' } })
    .composite(thumbs.map((image, index) => ({ input: image.input, left: (index % columns) * 320, top: Math.floor(index / columns) * 180 })))
    .png().toFile(path)
  evidence.contactSheets.push({ widget: widget.id, path, captures: thumbs.length })
}

const evidenceJson = JSON.stringify(evidence, null, 2)
for (const token of Object.values(FAKE_TOKENS)) {
  if (evidenceJson.includes(token)) fail('live-looking credential leaked into evidence')
}
writeFileSync(join(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
writeFileSync(join(outDir, 'REPORT.md'), `# Work Connector Chromium Evidence\n\n- Commit: \`${evidenceCommit}\`\n- Captures: ${evidence.captures.length}\n- Requests: ${evidence.requestLog.length}\n- Expected injected fault signals: ${evidence.expectedFaultSignals.length}\n- Expected harness-navigation request aborts: ${evidence.expectedRequestAborts.length}\n- Runtime errors: ${evidence.runtimeErrors.length}\n- Failed requests: ${evidence.failedRequests.length}\n- Failures: ${evidence.failures.length}\n- Original PNG inspection: external checkpoint requirement recorded in WORK-CONNECTORS-QA.md\n`, 'utf8')
process.stdout.write(`Work connector QA: ${evidence.captures.length} captures, ${evidence.requestLog.length} requests, ${evidence.failures.length} failures\n`)
for (const failure of evidence.failures) process.stderr.write(`FAIL ${failure}\n`)
if (evidence.failures.length) process.exitCode = 1
