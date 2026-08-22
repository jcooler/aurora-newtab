import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

import { prepareBrowserNativeOutput } from './browser-native-output-safety.mjs'

const repoRoot = process.cwd()
const protectedRoot = resolve('D:/DEV/Chrome plugin')
const requested = process.argv.find((arg) => arg.startsWith('--out-dir='))?.slice('--out-dir='.length) ?? ''
const outDir = await prepareBrowserNativeOutput({ repoRoot, protectedRoot, requested })
const dist = resolve('dist')
const profileDir = resolve('.qa-browser-native-profile')
const headed = process.argv.includes('--headed')

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
  commit: process.env.GIT_COMMIT ?? null,
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
      { lastModified: (now - 30_000) / 1_000, tab: { sessionId: 'session-tab-1', title: 'Aurora release notes', url: 'https://example.test/release' } },
      { lastModified: (now - 90_000) / 1_000, window: { sessionId: 'session-window-1', tabs: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }] } },
      { lastModified: (now - 180_000) / 1_000, tab: { sessionId: 'session-tab-2', title: 'Connector research', url: 'https://example.test/research' } },
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
  window.__auroraBrowserNativeHarness = { apiCalls, storageWrites, configured, state }
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
  if (mode === 'permission-required') {
    await page.locator(`[data-block-id="${widget.id}"] [data-browser-resource-state="permission-required"]`).waitFor()
  } else if (mode === 'error') {
    await page.getByRole('status').filter({ hasText: 'Native preview failure' }).waitFor()
  } else if (tier === 'docked') {
    await page.locator(`[data-block-id="${widget.id}"] [data-dock-line]`).waitFor()
  } else {
    await page.locator(`[data-block-id="${widget.id}"] [data-browser-resource-state="ready"]`).waitFor()
  }
}

async function assertNoBrowserContentStorage(label) {
  const truth = await page.evaluate(async () => {
    const values = await chrome.storage.local.get(null)
    const serialized = JSON.stringify(values)
    return {
      leaked: [
        'Aurora native architecture', 'Aurora release notes', 'aurora-build.zip', 'Aurora Work',
      ].filter((token) => serialized.includes(token)),
      writes: window.__auroraBrowserNativeHarness?.storageWrites ?? [],
      apiCalls: window.__auroraBrowserNativeHarness?.apiCalls ?? [],
    }
  })
  if (truth.leaked.length > 0) fail(`${label}: browser content leaked into storage: ${truth.leaked.join(', ')}`)
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
    const rect = item?.getBoundingClientRect()
    const text = painted?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
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
      dockDetail: document.querySelector('[data-browser-dock-detail]') !== null,
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
    usefulness: {
      judgment: truth.text.length > 0 && truth.rect?.width >= 4 && truth.rect?.height >= 4 ? 'useful' : 'failed',
      reason: `${tier} paints ${truth.text.split(' ').length} readable words in a bounded ${Math.round(truth.rect?.width ?? 0)}x${Math.round(truth.rect?.height ?? 0)} box`,
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
    await page.getByRole('button', { name: 'Restore Aurora release notes' }).click()
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
}

try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForSurface()

  for (const widget of WIDGETS) {
    for (const tier of TIERS) {
      await seed(widget, tier)
      await capture(widget, 'tiers', tier, VIEWPORTS[0])
    }

    await seed(widget, 'standard')
    await capture(widget, 'tiers', 'standard', VIEWPORTS[1], 'short')

    for (const state of STATES) {
      await seed(widget, 'standard', state)
      await capture(widget, state, 'standard', VIEWPORTS[0])
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
