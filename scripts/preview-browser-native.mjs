import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

import { prepareBrowserNativeOutput } from './browser-native-output-safety.mjs'

const repoRoot = process.cwd()
const protectedRoot = resolve('D:/DEV/Chrome plugin')
const requested = process.argv.find((arg) => arg.startsWith('--out-dir='))?.slice('--out-dir='.length) ?? ''
const outDir = await prepareBrowserNativeOutput({ repoRoot, protectedRoot, requested })
const dist = resolve('dist')
const profileDir = resolve('.qa-browser-native-profile')
const headed = process.argv.includes('--headed')
const evidenceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
const requestedCommit = process.env.GIT_COMMIT?.trim()
if (requestedCommit && requestedCommit !== evidenceCommit) {
  throw new Error(`evidence commit mismatch: requested ${requestedCommit}, checked out ${evidenceCommit}`)
}
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }).trim()) {
  throw new Error('browser-native evidence requires a clean tracked worktree')
}

if (dirname(profileDir) !== resolve(repoRoot) || basename(profileDir) !== '.qa-browser-native-profile') {
  throw new Error(`unsafe browser-native profile path: ${profileDir}`)
}
const profileStat = (() => {
  try { return lstatSync(profileDir) } catch (error) { if (error?.code === 'ENOENT') return null; throw error }
})()
if (profileStat?.isSymbolicLink()) throw new Error('browser-native profile cannot be a symbolic link or junction')
if (profileStat) rmSync(profileDir, { recursive: true, force: true })
mkdirSync(profileDir)

const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'))
const expectedPreviewPermissions = ['readingList', 'sessions', 'downloads', 'tabGroups']
for (const permission of expectedPreviewPermissions) {
  if (!manifest.permissions.includes(permission) || manifest.optional_permissions.includes(permission)) {
    throw new Error(`dist is not the preview build with install-time ${permission}`)
  }
}

const WIDGETS = [
  { id: 'readingList', title: 'Reading List', permission: 'readingList' },
  { id: 'recentlyClosed', title: 'Recently Closed', permission: 'sessions', resource: 'sessions' },
  { id: 'downloads', title: 'Downloads', permission: 'downloads' },
  { id: 'tabGroups', title: 'Tab Groups', permission: 'tabGroups' },
]
const TIERS = ['compact', 'standard', 'full', 'docked']
const STATES = ['permission-required', 'empty', 'error']
const VIEWPORTS = [
  { width: 1600, height: 900, label: 'common' },
  { width: 1408, height: 445, label: 'exact-short' },
]
const EXPECTED_API_NAMES = new Set([
  'readingList.query', 'readingList.updateEntry', 'readingList.removeEntry',
  'sessions.getRecentlyClosed', 'sessions.restore',
  'downloads.search', 'downloads.pause', 'downloads.resume', 'downloads.cancel', 'downloads.show',
  'tabGroups.query', 'tabGroups.update', 'windows.update',
])
const READ_API_NAMES = new Set([
  'readingList.query', 'sessions.getRecentlyClosed', 'downloads.search', 'tabGroups.query',
])
const EXPECTED_ACTION_CALLS = {
  readingList: [
    { api: 'readingList.updateEntry', args: [{ url: 'https://example.test/architecture', hasBeenRead: true }] },
    { api: 'readingList.removeEntry', args: [{ url: 'https://example.test/design' }] },
  ],
  recentlyClosed: [{ api: 'sessions.restore', args: ['session-tab-1'] }],
  downloads: [
    { api: 'downloads.pause', args: [101] },
    { api: 'downloads.resume', args: [101] },
    { api: 'downloads.cancel', args: [101] },
    { api: 'downloads.show', args: [102] },
  ],
  tabGroups: [
    { api: 'windows.update', args: [8, { focused: true }] },
    { api: 'tabGroups.update', args: [201, { collapsed: true }] },
  ],
}
const EXPECTED_TIER_FACTS = {
  readingList: {
    compact: ['unread', 'Aurora native architecture'],
    standard: ['Aurora native architecture', 'Calm browser widget design'],
    full: ['Unread', 'Recently read', 'Read product archive'],
    docked: ['unread', 'Aurora native architecture'],
  },
  recentlyClosed: {
    compact: ['Closed tab', 'Tab'],
    standard: ['Closed tab', 'Closed window'],
    full: ['Tabs', 'Windows', 'Closed window'],
    docked: ['closed', 'Tab'],
  },
  downloads: {
    compact: ['active', 'aurora-build.zip'],
    standard: ['aurora-build.zip', 'catalog-report.pdf'],
    full: ['aurora-build.zip', 'widget-icons.svg'],
    docked: ['active', 'aurora-build.zip'],
  },
  tabGroups: {
    compact: ['groups', 'Aurora Work'],
    standard: ['Aurora Work', 'Research'],
    full: ['Window 1', 'Window 2', 'Personal'],
    docked: ['groups', 'Aurora Work'],
  },
}
const EMPTY_FACTS = {
  readingList: 'Reading list clear',
  recentlyClosed: 'Nothing recently closed.',
  downloads: 'No recent downloads.',
  tabGroups: 'No tab groups open.',
}
const EXPECTED_ACTION_FACTS = {
  readingList: 'Removed Calm browser widget design',
  recentlyClosed: 'Restored Closed tab',
  downloads: 'Showing catalog-report.pdf in folder',
  tabGroups: 'Collapsed Aurora Work',
}

// Source-visible scenario declarations are part of the harness contract.
const SCENARIOS = [
  { kind: 'tiers' },
  { kind: 'permission-required' },
  { kind: 'empty' },
  { kind: 'error' },
  { kind: 'dock-detail' },
  { kind: 'edit' },
  { kind: 'actions' },
]
void SCENARIOS

const evidence = {
  commit: evidenceCommit,
  manifest: {
    permissions: manifest.permissions,
    optional_permissions: manifest.optional_permissions,
  },
  captures: [],
  apiCalls: [],
  storageWrites: [],
  runtimeErrors: [],
  failedRequests: [],
  failures: [],
}
const fail = (message) => evidence.failures.push(message)
const tierText = new Map()
let storageBaseline = null

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: VIEWPORTS[0],
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const pages = context.pages()
const page = pages[0] ?? await context.newPage()
page.setDefaultTimeout(20_000)

await page.addInitScript(() => {
  const createEvent = () => {
    const listeners = new Set()
    return {
      addListener(listener) { listeners.add(listener) },
      removeListener(listener) { listeners.delete(listener) },
      emit(...args) { for (const listener of [...listeners]) listener(...args) },
    }
  }
  const configured = (() => {
    try { return JSON.parse(sessionStorage.getItem('aurora-browser-native-scenario') ?? '{}') } catch { return {} }
  })()
  const now = Date.now()
  const readingEvents = { added: createEvent(), updated: createEvent(), removed: createEvent() }
  const sessionEvent = createEvent()
  const downloadEvents = { created: createEvent(), changed: createEvent(), erased: createEvent() }
  const groupEvents = { created: createEvent(), updated: createEvent(), moved: createEvent(), removed: createEvent() }
  const state = {
    readingList: [
      { url: 'https://example.test/architecture', title: 'Aurora native architecture', hasBeenRead: false, creationTime: now - 80_000, lastUpdateTime: now - 20_000 },
      { url: 'https://example.test/design', title: 'Calm browser widget design', hasBeenRead: false, creationTime: now - 180_000, lastUpdateTime: now - 90_000 },
      { url: 'https://example.test/archive', title: 'Read product archive', hasBeenRead: true, creationTime: now - 400_000, lastUpdateTime: now - 300_000 },
    ],
    sessions: [
      { lastModified: (now - 30_000) / 1_000, tab: { sessionId: 'session-tab-1' } },
      { lastModified: (now - 90_000) / 1_000, window: { sessionId: 'session-window-1', tabs: [{}, {}, {}] } },
      { lastModified: (now - 180_000) / 1_000, tab: { sessionId: 'session-tab-2' } },
    ],
    downloads: [
      { id: 101, filename: 'C:\\Downloads\\aurora-build.zip', finalUrl: 'https://example.test/aurora-build.zip', url: 'https://example.test/aurora-build.zip', state: 'in_progress', paused: false, canResume: true, danger: 'safe', bytesReceived: 48, totalBytes: 100, startTime: new Date(now - 30_000).toISOString(), exists: true },
      { id: 102, filename: 'C:\\Downloads\\catalog-report.pdf', finalUrl: 'https://example.test/catalog-report.pdf', url: 'https://example.test/catalog-report.pdf', state: 'complete', paused: false, canResume: false, danger: 'safe', bytesReceived: 200, totalBytes: 200, startTime: new Date(now - 90_000).toISOString(), exists: true },
      { id: 103, filename: 'C:\\Downloads\\unknown-size.bin', finalUrl: 'https://example.test/unknown-size.bin', url: 'https://example.test/unknown-size.bin', state: 'in_progress', paused: true, canResume: true, danger: 'safe', bytesReceived: 12, totalBytes: 0, startTime: new Date(now - 150_000).toISOString(), exists: true },
      { id: 104, filename: 'C:\\Downloads\\design-notes.txt', finalUrl: 'https://example.test/design-notes.txt', url: 'https://example.test/design-notes.txt', state: 'complete', paused: false, canResume: false, danger: 'safe', bytesReceived: 42, totalBytes: 42, startTime: new Date(now - 210_000).toISOString(), exists: true },
      { id: 105, filename: 'C:\\Downloads\\research-export.csv', finalUrl: 'https://example.test/research-export.csv', url: 'https://example.test/research-export.csv', state: 'interrupted', paused: false, canResume: true, danger: 'safe', bytesReceived: 20, totalBytes: 80, startTime: new Date(now - 270_000).toISOString(), exists: true, error: 'NETWORK_FAILED' },
      { id: 106, filename: 'C:\\Downloads\\widget-icons.svg', finalUrl: 'https://example.test/widget-icons.svg', url: 'https://example.test/widget-icons.svg', state: 'complete', paused: false, canResume: false, danger: 'safe', bytesReceived: 15, totalBytes: 15, startTime: new Date(now - 330_000).toISOString(), exists: false },
    ],
    tabGroups: [
      { id: 201, windowId: 8, title: 'Aurora Work', color: 'blue', collapsed: false, shared: false },
      { id: 202, windowId: 8, title: 'Research', color: 'purple', collapsed: true, shared: true },
      { id: 203, windowId: 12, title: 'Personal', color: 'green', collapsed: false, shared: false },
    ],
  }
  for (let index = 4; index <= 25; index += 1) {
    state.readingList.push({
      url: `https://example.test/saved-${index}`,
      title: `Saved article ${String(index).padStart(2, '0')}`,
      hasBeenRead: index % 3 === 0,
      creationTime: now - index * 300_000,
      lastUpdateTime: now - index * 120_000,
    })
    state.sessions.push(index % 5 === 0
      ? { lastModified: (now - index * 120_000) / 1_000, window: { sessionId: `session-window-${index}`, tabs: Array.from({ length: index % 4 + 1 }, () => ({})) } }
      : { lastModified: (now - index * 120_000) / 1_000, tab: { sessionId: `session-tab-${index}` } })
  }
  while (state.downloads.length < 25) {
    const id = 101 + state.downloads.length
    state.downloads.push({
      id,
      filename: `C:\\Downloads\\browser-item-${id}.dat`,
      finalUrl: `https://example.test/browser-item-${id}.dat`,
      url: `https://example.test/browser-item-${id}.dat`,
      state: 'complete',
      paused: false,
      canResume: false,
      danger: 'safe',
      bytesReceived: id,
      totalBytes: id,
      startTime: new Date(now - id * 1_000).toISOString(),
      exists: true,
    })
  }
  while (state.tabGroups.length < 25) {
    const id = 201 + state.tabGroups.length
    state.tabGroups.push({
      id,
      windowId: 20 + Math.floor(state.tabGroups.length / 5),
      title: `Browser group ${id}`,
      color: ['blue', 'cyan', 'green', 'grey', 'orange', 'pink', 'purple', 'red', 'yellow'][id % 9],
      collapsed: id % 2 === 0,
      shared: false,
    })
  }
  const browserContentTokens = [...new Set([
    ...state.readingList.flatMap((item) => [item.url, item.title]),
    ...state.sessions.flatMap((session) => [session.tab?.sessionId, session.window?.sessionId]),
    ...state.downloads.flatMap((item) => [item.filename, item.finalUrl, item.url]),
    ...state.tabGroups.map((group) => group.title),
  ].filter(Boolean))]
  const apiCalls = []
  const storageWrites = []
  const call = (api, args = []) => apiCalls.push({ api, args })
  const currentMode = () => configured.mode ?? 'ready'
  const result = (key) => {
    if (currentMode() === 'error' && configured.target === key) throw new Error('Native preview failure')
    if (currentMode() === 'empty' && configured.target === key) return []
    return structuredClone(state[key])
  }

  const api = {
    readingList: {
      async query(query) { call('readingList.query', [query]); return result('readingList') },
      async updateEntry(update) {
        call('readingList.updateEntry', [update])
        const item = state.readingList.find((candidate) => candidate.url === update.url)
        if (item) { item.hasBeenRead = update.hasBeenRead; item.lastUpdateTime = Date.now() }
        readingEvents.updated.emit(structuredClone(item))
      },
      async removeEntry(remove) {
        call('readingList.removeEntry', [remove])
        state.readingList = state.readingList.filter((candidate) => candidate.url !== remove.url)
        readingEvents.removed.emit({ url: remove.url })
      },
      onEntryAdded: readingEvents.added,
      onEntryUpdated: readingEvents.updated,
      onEntryRemoved: readingEvents.removed,
    },
    sessions: {
      async getRecentlyClosed(filter) { call('sessions.getRecentlyClosed', [filter]); return result('sessions') },
      async restore(sessionId) { call('sessions.restore', [sessionId]); sessionEvent.emit() },
      onChanged: sessionEvent,
    },
    downloads: {
      async search(query) { call('downloads.search', [query]); return result('downloads') },
      async pause(id) { call('downloads.pause', [id]); const item = state.downloads.find((row) => row.id === id); if (item) item.paused = true; downloadEvents.changed.emit({ id }) },
      async resume(id) { call('downloads.resume', [id]); const item = state.downloads.find((row) => row.id === id); if (item) item.paused = false; downloadEvents.changed.emit({ id }) },
      async cancel(id) { call('downloads.cancel', [id]); const item = state.downloads.find((row) => row.id === id); if (item) item.state = 'interrupted'; downloadEvents.changed.emit({ id }) },
      show(id) { call('downloads.show', [id]) },
      onCreated: downloadEvents.created,
      onChanged: downloadEvents.changed,
      onErased: downloadEvents.erased,
    },
    tabGroups: {
      async query(query) { call('tabGroups.query', [query]); return result('tabGroups') },
      async update(id, update) { call('tabGroups.update', [id, update]); const item = state.tabGroups.find((row) => row.id === id); if (item) Object.assign(item, update); groupEvents.updated.emit(structuredClone(item)); return structuredClone(item) },
      onCreated: groupEvents.created,
      onUpdated: groupEvents.updated,
      onMoved: groupEvents.moved,
      onRemoved: groupEvents.removed,
    },
    windows: {
      async update(id, update) { call('windows.update', [id, update]); return { id, ...update } },
    },
  }
  globalThis.__auroraBrowserNativeHarnessApi = api
  window.__auroraBrowserNativeHarness = { apiCalls, storageWrites, configured, state, browserContentTokens }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') storageWrites.push(Object.keys(changes).sort())
  })
  const nativeContains = chrome.permissions.contains.bind(chrome.permissions)
  chrome.permissions.contains = async (details) => {
    if (currentMode() === 'permission-required' && details.permissions?.includes(configured.permission)) return false
    return nativeContains(details)
  }
})

page.on('console', (message) => {
  if (message.type() === 'error') evidence.runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  if (!request.url().startsWith('chrome-extension://')) {
    evidence.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
  }
})
page.on('request', (request) => {
  if (request.url().startsWith('http')) fail(`external request: ${request.method()} ${request.url()}`)
})

async function waitForSurface() {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(120)
}

async function configure(widget, mode) {
  await page.evaluate(({ target, permission, mode }) => {
    sessionStorage.setItem('aurora-browser-native-scenario', JSON.stringify({ target, permission, mode }))
  }, { target: widget.resource ?? widget.id, permission: widget.permission, mode })
}

async function seed(widget, tier, mode = 'ready') {
  await configure(widget, mode)
  await page.evaluate(async ({ id, tier }) => {
    const stored = await chrome.storage.local.get('settings')
    const settings = stored.settings
    if (!settings) throw new Error('settings were not hydrated before browser-native seed')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    widgets[id] = true
    const placement = tier === 'docked'
      ? { kind: 'docked', dock: 'bottom', order: 0, offsetX: 0, dockTier: 'compact' }
      : { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 0 }
    await chrome.storage.local.set({
      settings: { ...settings, widgets },
      layouts: {
        version: 1,
        activeLayoutId: 'browser-native-qa',
        layouts: [{
          id: 'browser-native-qa',
          name: 'Browser Native QA',
          widgets: {
            clock: { kind: 'hidden' },
            greeting: { kind: 'hidden' },
            focus: { kind: 'hidden' },
            [id]: placement,
          },
        }],
      },
    })
  }, { id: widget.id, tier })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForSurface()
  await page.locator(`[data-block-id="${widget.id}"]`).waitFor()
  if (tier === 'docked') {
    const line = page.locator(`[data-block-id="${widget.id}"] [data-dock-line]`)
    await line.waitFor()
    if (mode === 'permission-required') await line.filter({ hasText: 'Enable in Settings' }).waitFor()
    if (mode === 'error') await line.filter({ hasText: 'unavailable' }).waitFor()
  } else if (mode === 'permission-required') {
    await page.locator(`[data-block-id="${widget.id}"] [data-browser-resource-state="permission-required"]`).waitFor()
  } else if (mode === 'error') {
    await page.getByRole('status').filter({ hasText: 'Native preview failure' }).waitFor()
  } else if (tier === 'docked') {
    await page.locator(`[data-block-id="${widget.id}"] [data-dock-line]`).waitFor()
  } else {
    await page.locator(`[data-block-id="${widget.id}"] [data-browser-resource-state="ready"]`).waitFor()
  }
  storageBaseline = await page.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)))
}

async function assertNoBrowserContentStorage(label) {
  const truth = await page.evaluate(async () => {
    const values = await chrome.storage.local.get(null)
    const serialized = JSON.stringify(values)
    const harness = window.__auroraBrowserNativeHarness
    return {
      serialized,
      leaked: (harness?.browserContentTokens ?? []).filter((token) => serialized.includes(token)),
      writes: harness?.storageWrites ?? [],
      apiCalls: harness?.apiCalls ?? [],
    }
  })
  if (truth.leaked.length > 0) fail(`${label}: browser content leaked into storage: ${truth.leaked.join(', ')}`)
  if (truth.writes.length > 0) fail(`${label}: storage changed after seed: ${JSON.stringify(truth.writes)}`)
  if (storageBaseline === null || truth.serialized !== storageBaseline) fail(`${label}: storage snapshot changed after seed`)
  evidence.storageWrites.push({ label, writes: truth.writes })
  evidence.apiCalls.push({ label, calls: truth.apiCalls })
}

async function capture(widget, kind, tier, viewport, suffix = '') {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  if (tier !== 'docked') {
    await page.waitForFunction(({ id, width, height }) => {
      const rect = document.querySelector(`[data-block-id="${id}"]`)?.getBoundingClientRect()
      return Boolean(rect)
        && Math.abs((rect.left + rect.right) / 2 - width / 2) < 2
        && Math.abs((rect.top + rect.bottom) / 2 - height / 2) < 2
    }, { id: widget.id, width: viewport.width, height: viewport.height })
  } else {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  const label = [widget.id, kind, tier, viewport.label, suffix].filter(Boolean).join('-')
  const truth = await page.evaluate((id) => {
    const doc = document.documentElement
    const item = document.querySelector(`[data-block-id="${id}"]`)
    const painted = item?.querySelector('[data-browser-widget], [data-dock-line], [data-browser-dock-detail]')
    const detail = document.querySelector('[data-browser-dock-detail]')
    const scrollport = item?.querySelector('[data-browser-widget-scroll]')
    const rect = item?.getBoundingClientRect()
    const text = [painted?.textContent, detail?.textContent]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const controls = [...document.querySelectorAll('button, a')]
      .filter((node) => item?.contains(node) || node.closest('[data-browser-dock-detail]'))
      .map((node) => {
        const box = node.getBoundingClientRect()
        return { name: node.getAttribute('aria-label') || node.textContent?.trim() || '', width: box.width, height: box.height }
      })
    return {
      horizontalOverflow: doc.scrollWidth > doc.clientWidth,
      rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      text,
      controls,
      editing: document.querySelector('[data-editing="true"]') !== null,
      dockDetail: detail !== null,
      localScroll: scrollport
        ? { clientHeight: scrollport.clientHeight, scrollHeight: scrollport.scrollHeight }
        : null,
    }
  }, widget.id)
  if (truth.horizontalOverflow) fail(`${label}: horizontal overflow`)
  if (!truth.rect || truth.rect.width < 4 || truth.rect.height < 4) fail(`${label}: degenerate widget geometry`)
  if (!truth.text) fail(`${label}: unpainted content`)
  if (truth.rect && (truth.rect.left < -1 || truth.rect.right > viewport.width + 1 || truth.rect.top < -1 || truth.rect.bottom > viewport.height + 1)) {
    fail(`${label}: widget leaves the viewport`)
  }
  for (const control of truth.controls) {
    if (!control.name) fail(`${label}: inaccessible unnamed action`)
    if (control.width < 1 || control.height < 1) fail(`${label}: inaccessible zero-size action ${control.name}`)
  }
  const expectedFacts = kind === 'permission-required'
    ? [`Enable ${widget.title} in Settings.`]
    : kind === 'empty'
      ? [EMPTY_FACTS[widget.id]]
      : kind === 'error'
        ? ['Native preview failure', 'Refresh']
        : kind === 'actions'
          ? [EXPECTED_ACTION_FACTS[widget.id]]
          : kind === 'dock-detail'
            ? EXPECTED_TIER_FACTS[widget.id].full
            : EXPECTED_TIER_FACTS[widget.id][tier]
  const missingFacts = expectedFacts.filter((fact) => !truth.text.includes(fact))
  if (missingFacts.length > 0) fail(`${label}: missing useful facts: ${missingFacts.join(', ')}`)
  if (kind === 'tiers' && tier === 'docked' && truth.rect && truth.rect.height > 48) {
    fail(`${label}: docked tier exceeds 48px (${Math.round(truth.rect.height)}px)`)
  }
  if (kind === 'tiers' && tier === 'full' && viewport.label === 'common') {
    if (!truth.localScroll || truth.localScroll.scrollHeight <= truth.localScroll.clientHeight) {
      fail(`${label}: maximum dataset does not use the bounded local scrollport`)
    }
  }
  if (kind === 'tiers' && viewport.label === 'common') tierText.set(`${widget.id}:${tier}`, truth.text)
  const path = join(outDir, `${label}.png`)
  await page.screenshot({ path: path, fullPage: true })
  evidence.captures.push({
    label,
    path,
    widget: widget.id,
    kind,
    tier,
    viewport,
    geometry: truth.rect,
    text: truth.text,
    editChrome: truth.editing,
    dockDetail: truth.dockDetail,
    localScroll: truth.localScroll,
    usefulness: {
      judgment: missingFacts.length === 0 && truth.text.length > 0 && truth.rect?.width >= 4 && truth.rect?.height >= 4 ? 'useful' : 'failed',
      reason: `${tier} exposes ${expectedFacts.join(' | ')} in a bounded ${Math.round(truth.rect?.width ?? 0)}x${Math.round(truth.rect?.height ?? 0)} box`,
    },
  })
  await assertNoBrowserContentStorage(label)
}

async function exerciseActions(widget) {
  const before = await page.evaluate(() => window.__auroraBrowserNativeHarness?.apiCalls.length ?? 0)
  if (widget.id === 'readingList') {
    await page.getByRole('button', { name: 'Mark Aurora native architecture read' }).click()
    await page.getByRole('button', { name: 'Remove Aurora native architecture' }).waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Remove Calm browser widget design' }).click()
    await page.getByRole('button', { name: 'Confirm remove Calm browser widget design' }).click()
  } else if (widget.id === 'recentlyClosed') {
    await page.getByRole('button', { name: 'Restore Closed tab' }).first().click()
  } else if (widget.id === 'downloads') {
    await page.getByRole('button', { name: 'Pause aurora-build.zip' }).click()
    await page.getByRole('button', { name: 'Resume aurora-build.zip' }).click()
    await page.getByRole('button', { name: 'Cancel aurora-build.zip' }).click()
    await page.getByRole('button', { name: 'Confirm cancel aurora-build.zip' }).click()
    await page.getByRole('button', { name: 'Show catalog-report.pdf in folder' }).click()
  } else {
    await page.getByRole('button', { name: 'Focus Aurora Work window' }).click()
    await page.getByRole('button', { name: 'Collapse Aurora Work' }).click()
  }
  await page.waitForFunction((count) => (window.__auroraBrowserNativeHarness?.apiCalls.length ?? 0) > count, before)
  await page.getByRole('status').filter({ hasText: EXPECTED_ACTION_FACTS[widget.id] }).waitFor()
  const actionCalls = await page.evaluate(({ before, readApis }) => (
    window.__auroraBrowserNativeHarness?.apiCalls.slice(before)
      .filter((entry) => !readApis.includes(entry.api)) ?? []
  ), { before, readApis: [...READ_API_NAMES] })
  const expected = EXPECTED_ACTION_CALLS[widget.id]
  if (JSON.stringify(actionCalls) !== JSON.stringify(expected)) {
    fail(`${widget.id}: action calls differ: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actionCalls)}`)
  }
}

try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForSurface()

  for (const widget of WIDGETS) {
    for (const tier of TIERS) {
      await seed(widget, tier)
      await capture(widget, 'tiers', tier, VIEWPORTS[0])
    }
    const compactText = tierText.get(`${widget.id}:compact`)
    const standardText = tierText.get(`${widget.id}:standard`)
    const fullText = tierText.get(`${widget.id}:full`)
    if (!compactText || compactText === standardText) fail(`${widget.id}: compact and standard tier text duplicated`)
    if (!standardText || standardText === fullText) fail(`${widget.id}: standard and full tier text duplicated`)

    await seed(widget, 'standard')
    await capture(widget, 'tiers', 'standard', VIEWPORTS[1], 'short')

    for (const state of STATES) {
      await seed(widget, 'standard', state)
      await capture(widget, state, 'standard', VIEWPORTS[0])

      await seed(widget, 'docked', state)
      await page.locator(`[data-block-id="${widget.id}"] [data-dock-line]`).click()
      await page.locator('[data-browser-dock-detail]').waitFor()
      await capture(widget, state, 'docked', VIEWPORTS[0], 'dock-state')
      await page.keyboard.press('Escape')
    }

    await seed(widget, 'docked')
    await page.locator(`[data-block-id="${widget.id}"] [data-dock-line]`).click()
    await page.locator('[data-browser-dock-detail]').waitFor()
    await capture(widget, 'dock-detail', 'docked', VIEWPORTS[0])
    await page.keyboard.press('Escape')

    await seed(widget, 'standard')
    await page.keyboard.press('Control+Shift+E')
    await page.locator('[data-editing="true"]').waitFor()
    await capture(widget, 'edit', 'standard', VIEWPORTS[0])
    await page.keyboard.press('Escape')

    await seed(widget, 'standard')
    await exerciseActions(widget)
    await capture(widget, 'actions', 'standard', VIEWPORTS[0])
  }
} finally {
  await context.close()
}

for (const entry of evidence.apiCalls) {
  for (const call of entry.calls) {
    if (!EXPECTED_API_NAMES.has(call.api)) fail(`${entry.label}: unexpected native API call ${call.api}`)
    if (/^(tabs\.|history\.|downloads\.open)/.test(call.api)) fail(`${entry.label}: forbidden API call ${call.api}`)
  }
}
if (evidence.runtimeErrors.length > 0) fail(`runtime errors: ${evidence.runtimeErrors.join(' | ')}`)
if (evidence.failedRequests.length > 0) fail(`failed requests: ${evidence.failedRequests.join(' | ')}`)

writeFileSync(join(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
process.stdout.write(`Browser-native QA: ${evidence.captures.length} captures, ${evidence.failures.length} failures\n`)
if (evidence.failures.length > 0) {
  for (const failure of evidence.failures) process.stderr.write(`FAIL ${failure}\n`)
  process.exitCode = 1
}
