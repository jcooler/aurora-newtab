import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'

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
const EXACT_REQUEST_MARKERS = [
  'https://api.linear.app/graphql',
  '/api/0/organizations/acme-labs/issues/',
  '/api/v1/projects',
  '/api/v1/tasks',
  '/api/v1/tasks/task-1/close',
]
void EXACT_REQUEST_MARKERS

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
  due: { date: today, datetime: null, timeZone: null, text: index < 5 ? 'overdue' : 'today', isRecurring: index === 2 },
  priority: index === 0 ? 4 : 2,
  labels: index === 0 ? ['release'] : [],
  duration: index === 0 ? { amount: 30, unit: 'minute' } : null,
  parentId: null,
  bucket: index < 5 ? 'overdue' : 'today',
  url: `https://app.todoist.com/app/task/task-${index + 1}`,
}))

const WIDGETS = [
  {
    id: 'linear', title: 'Linear', origin: 'https://api.linear.app/*',
    config: { enabled: true, token: FAKE_TOKENS.linear, displayName: 'QA Builder', teamIds: [], itemLimit: 6 },
    data: { issues: linearIssues }, empty: { issues: [] },
    compact: ['25 assigned', '5 due soon'], standard: ['Work issue 01', 'AUR-1', 'Aurora'], full: ['Work issue 25', 'QA Cycle'],
  },
  {
    id: 'sentry', title: 'Sentry', origin: 'https://us.sentry.io/*',
    config: { enabled: true, token: FAKE_TOKENS.sentry, organization: 'acme-labs', region: 'us', projectSlugs: [], itemLimit: 6 },
    data: { issues: sentryIssues }, empty: { issues: [] },
    compact: ['25 unresolved', '1 critical'], standard: ['Checkout failure 01', 'Web', 'WEB-1'], full: ['Checkout failure 25', 'events in 24h'],
  },
  {
    id: 'todoist', title: 'Todoist', origin: 'https://api.todoist.com/*',
    config: { enabled: true, token: FAKE_TOKENS.todoist, accountLabel: 'Todoist', projectIds: [], itemLimit: 6 },
    data: { projects: todoistProjects, tasks: todoistTasks }, empty: { projects: todoistProjects, tasks: [] },
    compact: ['25 due', '5 overdue'], standard: ['Ship Aurora 01', 'Work', 'Overdue'], full: ['Ship Aurora 25', 'Personal'],
  },
]

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
  permissionCalls: [],
  runtimeErrors: [],
  failedRequests: [],
  failures: [],
}
const fail = (message) => evidence.failures.push(message)
const networkModes = new Map()
let closeMode = 'success'
const closedTasks = new Set()

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
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') storageWrites.push(Object.keys(changes).sort())
  })
  globalThis.__auroraWorkHarness = { storageWrites }
})

function logRequest(request) {
  const headers = request.headers()
  const authorization = headers.authorization ?? ''
  const authKind = authorization.startsWith('Bearer ') ? 'bearer' : authorization ? 'raw' : 'none'
  evidence.requestLog.push({
    method: request.method(),
    url: request.url(),
    authKind,
    contentType: headers['content-type'] ?? null,
    bodyKind: request.postData()?.includes('AuroraLinearIdentity')
      ? 'linear-identity'
      : request.postData()?.includes('AuroraLinearWork')
        ? 'linear-work'
        : null,
  })
}

async function delayed(route) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1800))
  await route.abort('failed').catch(() => {})
}

await context.route('https://api.linear.app/**', async (route) => {
  const request = route.request()
  logRequest(request)
  const mode = networkModes.get('linear') ?? 'ready'
  if (mode === 'loading' || mode === 'stale') return delayed(route)
  if (mode === 'hard-error' || mode === 'retained-error') return route.fulfill({ status: 503, body: '' })
  const body = request.postData() ?? ''
  if (body.includes('AuroraLinearIdentity')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { viewer: { id: 'qa-user', name: 'QA Builder', teams: { nodes: [{ id: 'aurora', key: 'AUR', name: 'Aurora' }, { id: 'ops', key: 'OPS', name: 'Ops' }] } } } }) })
  }
  const nodes = linearIssues.map((issue) => ({
    ...issue,
    priority: issue.priority === 'urgent' ? 1 : issue.priority === 'high' ? 2 : 3,
  }))
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { viewer: { assignedIssues: { nodes } } } }) })
})

await context.route(/https:\/\/(?:sentry|us\.sentry|de\.sentry)\.io\/.*/, async (route) => {
  logRequest(route.request())
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
})

await context.route('https://api.todoist.com/**', async (route) => {
  const request = route.request()
  logRequest(request)
  const mode = networkModes.get('todoist') ?? 'ready'
  if (mode === 'loading' || mode === 'stale') return delayed(route)
  if (mode === 'hard-error' || mode === 'retained-error') return route.fulfill({ status: 503, body: '' })
  const url = new URL(request.url())
  if (request.method() === 'POST' && /\/api\/v1\/tasks\/[^/]+\/close$/.test(url.pathname)) {
    if (closeMode === 'error') return route.fulfill({ status: 500, body: '' })
    const id = decodeURIComponent(url.pathname.split('/').at(-2))
    closedTasks.add(id)
    return route.fulfill({ status: 204, body: '' })
  }
  if (url.pathname === '/api/v1/projects') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: todoistProjects, next_cursor: null }) })
  }
  const results = todoistTasks.filter((task) => !closedTasks.has(task.id)).map((task) => ({
    id: task.id, content: task.content, project_id: task.projectId,
    due: { date: task.due.date, datetime: null, timezone: null, string: task.due.text, is_recurring: task.due.isRecurring },
    priority: task.priority, labels: task.labels, duration: task.duration, parent_id: task.parentId, is_completed: false,
  }))
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results, next_cursor: null }) })
})

const page = context.pages()[0] ?? await context.newPage()
page.setDefaultTimeout(20_000)
page.on('console', (message) => { if (message.type() === 'error') evidence.runtimeErrors.push(`console: ${message.text()}`) })
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  const url = request.url()
  if (!url.startsWith('chrome-extension://') && !['loading', 'stale'].includes(networkModes.get(providerForUrl(url)))) {
    evidence.failedRequests.push(`${request.method()} ${url}: ${request.failure()?.errorText ?? 'failed'}`)
  }
})
page.on('request', (request) => {
  const url = request.url()
  if (url.startsWith('http') && !providerForUrl(url)) fail(`unexpected external request: ${request.method()} ${url}`)
})

function providerForUrl(url) {
  if (url.startsWith('https://api.linear.app/')) return 'linear'
  if (/^https:\/\/(?:sentry|us\.sentry|de\.sentry)\.io\//.test(url)) return 'sentry'
  if (url.startsWith('https://api.todoist.com/')) return 'todoist'
  return null
}

async function waitForSurface() {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(100)
}

async function seed(widget, tier, state = 'ready') {
  networkModes.clear()
  networkModes.set(widget.id, state)
  const config = state === 'setup' ? { enabled: true } : widget.config
  const data = state === 'empty' ? widget.empty : widget.data
  const snapshot = ['ready', 'empty', 'retained-error', 'stale'].includes(state)
  const stale = state === 'retained-error' || state === 'stale'
  await page.evaluate(async ({ id, tier, config, data, snapshot, stale }) => {
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
    await chrome.storage.local.set({
      connectors: { [id]: config },
      connectorSnapshots: snapshot ? { [id]: { scope: await scopeFor(), fetchedAt: Date.now() - (stale ? 60 * 60_000 : 0), data } } : {},
      layouts: {
        version: 1,
        activeLayoutId: 'work-qa',
        layouts: [{
          id: 'work-qa', name: 'Work QA',
          widgets: {
            clock: { kind: 'hidden' }, greeting: { kind: 'hidden' }, focus: { kind: 'hidden' },
            [id]: placement,
          },
        }],
      },
    })
  }, { id: widget.id, tier, config, data, snapshot, stale })
  await page.reload({ waitUntil: 'domcontentloaded' })
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
  return page.evaluate(async () => ({
    serialized: JSON.stringify(await chrome.storage.local.get(null)),
    writes: globalThis.__auroraWorkHarness?.storageWrites ?? [],
  }))
}

async function capture(widget, { kind, tier, state = 'ready', viewport = VIEWPORTS[0], openDock = tier === 'docked' }) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
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
    ? tier === 'compact' || tier === 'docked' ? widget.compact : tier === 'standard' ? widget.standard : widget.full
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

async function resetForSettings() {
  networkModes.clear()
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    await chrome.storage.local.set({
      settings,
      connectors: {}, connectorSnapshots: {},
      layouts: { version: 1, activeLayoutId: 'work-settings-qa', layouts: [{ id: 'work-settings-qa', name: 'Work Settings QA', widgets: { clock: { kind: 'hidden' }, greeting: { kind: 'hidden' }, focus: { kind: 'hidden' } } }] },
    })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
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
  await resetForSettings()
  const search = page.getByPlaceholder('Search connectors')
  await search.fill(widget.title)
  await page.getByRole('button', { name: `Set up ${widget.title}` }).click()
  await fillSetup(widget)
  await page.evaluate(() => { globalThis.__auroraWorkPermissionHarness.mode = 'deny' })
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'denied' }).waitFor()
  const denied = await page.evaluate((id) => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.[id]), widget.id)
  if (denied !== undefined) fail(`${widget.id}: denied setup persisted a connector`)

  await page.evaluate(() => { globalThis.__auroraWorkPermissionHarness.mode = 'grant' })
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.waitForFunction((id) => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.[id]?.enabled === true), widget.id)
  await page.waitForFunction((id) => chrome.storage.local.get('connectorSnapshots').then(({ connectorSnapshots }) => connectorSnapshots?.[id]?.data), widget.id)

  await page.getByRole('button', { name: `Edit ${widget.title}` }).click()
  if (widget.id === 'linear') await page.getByRole('button', { name: 'Ops' }).click()
  if (widget.id === 'sentry') await page.getByRole('button', { name: 'API' }).click()
  if (widget.id === 'todoist') await page.getByRole('button', { name: 'Personal' }).click()
  const countLabel = widget.id === 'todoist' ? 'Tasks shown' : 'Issues shown'
  await page.getByLabel(countLabel).selectOption('7')
  await page.waitForFunction(({ id }) => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.[id]?.itemLimit === 7), { id: widget.id })

  const path = join(outDir, `${widget.id}-settings-connected.png`)
  await page.screenshot({ path, fullPage: true })
  evidence.captures.push({ label: `${widget.id}-settings-connected`, path, widget: widget.id, kind: 'settings', usefulness: { judgment: 'useful', reason: 'connected identity, real picker, and item count visible' } })

  await page.getByRole('button', { name: `Close ${widget.title} editor` }).click()
  await page.evaluate(async (id) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    const current = connectors[id]
    const identity = id === 'linear' ? { displayName: current.displayName } : id === 'sentry' ? { organization: current.organization, region: current.region } : { accountLabel: current.accountLabel }
    await chrome.storage.local.set({ connectors: { ...connectors, [id]: { enabled: true, ...identity } } })
  }, widget.id)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSurface()
  await openConnectors()
  await page.getByPlaceholder('Search connectors').fill(widget.title)
  const reconnectRegion = page.getByRole('region', { name: `${widget.title} reconnect` })
  await reconnectRegion.waitFor()
  await fillSetup(widget)
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.waitForFunction((id) => chrome.storage.local.get('connectors').then(({ connectors }) => Boolean(connectors?.[id]?.token)), widget.id)
  await page.getByRole('button', { name: `Edit ${widget.title}` }).click()
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await page.waitForFunction((id) => chrome.storage.local.get('connectors').then(({ connectors }) => connectors?.[id] === undefined), widget.id)

  const permissionCalls = await page.evaluate(() => globalThis.__auroraWorkPermissionHarness.calls)
  evidence.permissionCalls.push({ widget: widget.id, calls: permissionCalls })
  const requested = permissionCalls.filter((entry) => entry.action === 'request').flatMap((entry) => entry.origins)
  if (!requested.includes(widget.origin)) fail(`${widget.id}: exact optional origin was not requested`)
}

async function exerciseTodoistCompletion(widget) {
  closeMode = 'success'
  closedTasks.clear()
  await seed(widget, 'standard')
  const beforeCancel = await storageTruth()
  const postBefore = evidence.requestLog.filter((entry) => entry.method === 'POST' && entry.url.includes('/close')).length
  await page.getByRole('button', { name: 'Complete Ship Aurora 01' }).click()
  await page.getByRole('dialog', { name: 'Complete Ship Aurora 01?' }).waitFor()
  await page.getByRole('button', { name: 'Cancel completion' }).click()
  const afterCancel = await storageTruth()
  if (afterCancel.serialized !== beforeCancel.serialized || evidence.requestLog.filter((entry) => entry.method === 'POST' && entry.url.includes('/close')).length !== postBefore) {
    fail('Todoist Cancel caused a request or storage write')
  }

  await page.getByRole('button', { name: 'Complete Ship Aurora 01' }).click()
  const confirm = page.getByRole('button', { name: 'Confirm completion' })
  await confirm.evaluate((button) => { button.click(); button.click() })
  await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-label="Complete Ship Aurora 01?"]'))
  const closeRequests = evidence.requestLog.filter((entry) => entry.method === 'POST' && entry.url.endsWith('/api/v1/tasks/task-1/close'))
  if (closeRequests.length !== 1) fail(`Todoist completion sent ${closeRequests.length} close requests`)

  closeMode = 'error'
  await seed(widget, 'standard')
  await page.getByRole('button', { name: 'Complete Ship Aurora 01' }).click()
  await page.getByRole('button', { name: 'Confirm completion' }).click()
  await page.getByRole('alert').filter({ hasText: 'status 500' }).waitFor()
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
    await exerciseSettings(widget)
  }
  await exerciseTodoistCompletion(WIDGETS.find((widget) => widget.id === 'todoist'))
} finally {
  await context.close()
}

for (const request of evidence.requestLog) {
  if (request.url.includes(FAKE_TOKENS.linear) || request.url.includes(FAKE_TOKENS.sentry) || request.url.includes(FAKE_TOKENS.todoist)) {
    fail('live-looking credential leaked into request URL')
  }
  if (request.url.startsWith('https://api.linear.app/') && (request.method !== 'POST' || request.authKind !== 'raw')) fail(`Linear request contract mismatch: ${JSON.stringify(request)}`)
  if (/^https:\/\/(?:sentry|us\.sentry|de\.sentry)\.io\//.test(request.url) && (request.method !== 'GET' || request.authKind !== 'bearer')) fail(`Sentry request contract mismatch: ${JSON.stringify(request)}`)
  if (request.url.startsWith('https://api.todoist.com/') && request.authKind !== 'bearer') fail(`Todoist request contract mismatch: ${JSON.stringify(request)}`)
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
writeFileSync(join(outDir, 'REPORT.md'), `# Work Connector Chromium Evidence\n\n- Commit: \`${evidenceCommit}\`\n- Captures: ${evidence.captures.length}\n- Requests: ${evidence.requestLog.length}\n- Runtime errors: ${evidence.runtimeErrors.length}\n- Failed requests: ${evidence.failedRequests.length}\n- Failures: ${evidence.failures.length}\n- Original PNGs inspected individually before checkpoint: pending coordinator inspection\n`, 'utf8')
process.stdout.write(`Work connector QA: ${evidence.captures.length} captures, ${evidence.requestLog.length} requests, ${evidence.failures.length} failures\n`)
for (const failure of evidence.failures) process.stderr.write(`FAIL ${failure}\n`)
if (evidence.failures.length) process.exitCode = 1
