// Focused W4-P4 built-extension replay for Signal Dock connector survival.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w4-p4')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w4-p4'
const touchedKeys = ['settings', 'layout', 'connectors', 'connectorSnapshots']
const connectorIds = ['ics', 'status', 'github', 'gitlab', 'jira', 'vercel', 'homeassistant', 'rss', 'crypto']
const nowMs = new Date(2026, 7, 16, 12, 0).getTime()
const headed = process.argv.includes('--headed')

if (!profileDir.endsWith('.playwright-profile-w4-p4')) throw new Error(`unsafe profile path: ${profileDir}`)
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}
const exact = (actual, wanted) => JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(wanted))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 800, height: 600 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
let originalPreimage
let captureErrors = false
const runtimeErrors = []
const externalRequests = []
page.on('console', (message) => {
  if (captureErrors && message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => {
  if (captureErrors) runtimeErrors.push(`page: ${String(error)}`)
})
page.on('request', (request) => {
  if (captureErrors && /^https?:/.test(request.url())) externalRequests.push(request.url())
})

const seedAllConnectors = async () => page.evaluate(async ({ fixedNow, ids }) => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
  const canonical = (input) => {
    if (input === null) return 'null'
    if (typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number') return JSON.stringify(input)
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`
    return `{${Object.keys(input).filter((key) => input[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(input[key])}`).join(',')}}`
  }
  const scopeOf = async (id, config, runtimeScope) => {
    const identity = runtimeScope === undefined
      ? `${id}\n${canonical(config)}`
      : `${id}\n${canonical(config)}\n${canonical(runtimeScope)}`
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${id}:${id === 'ics' || id === 'homeassistant' ? 'v2' : 'v1'}:${hex}`
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const connectors = {
    ics: {
      enabled: true,
      calendars: [{ name: 'Work', url: 'https://calendar.example.test/private.ics' }],
      view: 'today', upcomingCount: 3, meetLinks: true,
    },
    status: {
      enabled: true,
      services: [{ name: 'Aurora API', url: 'https://status.example.test/api/v2/status.json' }],
    },
    github: {
      enabled: true, token: 'fixture-github-token', username: 'aurora-fixture',
      views: { commitGraph: false, pulls: true, issues: true, notifications: true },
    },
    gitlab: {
      enabled: true, token: 'fixture-gitlab-token', instanceUrl: 'https://gitlab.example.test', username: 'aurora-fixture',
      views: { mergeRequests: true, reviewAsks: false, todos: true, activityGraph: false },
    },
    jira: {
      enabled: true, email: 'fixture@example.test', apiToken: 'fixture-jira-token',
      site: 'aurora.atlassian.net', displayName: 'Aurora Fixture',
      views: { assigned: true, statusChips: true, dueSoon: false },
    },
    vercel: {
      enabled: true, token: 'fixture-vercel-token', username: 'aurora-fixture',
      views: { deployments: true, statusSummary: true },
    },
    homeassistant: {
      enabled: true, instanceUrl: 'https://ha.example.test', token: 'fixture-ha-token',
      entities: [{ id: 'sensor.office', name: 'Office' }], actions: [],
    },
    rss: { enabled: true, feeds: ['https://news.example.test/feed.xml'], shownCount: 3 },
    crypto: { enabled: true, coins: ['bitcoin', 'ethereum'] },
  }
  const snapshots = {
    ics: {
      scope: await scopeOf('ics', connectors.ics, { timeZone }), fetchedAt: fixedNow,
      data: { events: [{ summary: 'Dock review', start: fixedNow + 3_600_000, end: fixedNow + 5_400_000, cal: 0, allDay: false }] },
    },
    status: {
      scope: await scopeOf('status', connectors.status), fetchedAt: fixedNow,
      data: { services: [{ name: 'Aurora API', indicator: 'major', description: 'Elevated errors' }] },
    },
    github: {
      scope: await scopeOf('github', connectors.github), fetchedAt: fixedNow,
      data: {
        prs: [{ title: 'Review Signal Dock', url: 'https://github.com/aurora/newtab/pull/44', repo: 'aurora/newtab' }],
        issues: [], notifications: 2, contributions: null, etags: {},
      },
    },
    gitlab: {
      scope: await scopeOf('gitlab', connectors.gitlab), fetchedAt: fixedNow,
      data: {
        mrs: [{ title: 'Ship connector survival', url: 'https://gitlab.example.test/aurora/newtab/-/merge_requests/8', project: 'aurora/newtab' }],
        reviewMrs: [], todos: 1, contributions: null,
      },
    },
    jira: {
      scope: await scopeOf('jira', connectors.jira), fetchedAt: fixedNow,
      data: {
        issues: [{ key: 'AUR-44', summary: 'Verify Dock operation', status: 'In Progress', url: 'https://aurora.atlassian.net/browse/AUR-44' }],
        counts: { 'In Progress': 1 }, dueSoon: [],
      },
    },
    vercel: {
      scope: await scopeOf('vercel', connectors.vercel), fetchedAt: fixedNow,
      data: { deployments: [{ project: 'aurora-newtab', state: 'ERROR', url: 'https://vercel.com/aurora/deployment-44', createdAt: fixedNow - 60_000 }] },
    },
    homeassistant: {
      scope: await scopeOf('homeassistant', connectors.homeassistant), fetchedAt: fixedNow,
      data: { entities: [{ id: 'sensor.office', state: '72', unit: '°F', friendlyName: 'Office', domain: 'sensor' }] },
    },
    rss: {
      scope: await scopeOf('rss', connectors.rss), fetchedAt: fixedNow,
      data: [{ source: 'Aurora News', title: 'Connector survival is ready', url: 'https://news.example.test/story', publishedAt: fixedNow }],
    },
    crypto: {
      scope: await scopeOf('crypto', connectors.crypto), fetchedAt: fixedNow,
      data: { coins: [
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 67_412, change24h: 2.4 },
        { id: 'ethereum', symbol: 'eth', name: 'Ethereum', price: 3_245, change24h: -1.2 },
      ] },
    },
  }
  const dockProfile = Object.fromEntries(ids.map((id, order) => [id, {
    zone: 'dock', order, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'dock',
  }]))
  await chrome.storage.local.set({
    settings: { ...settings, widgets, layoutDensity: 'compact' },
    layout: { version: 2, profiles: { compact: dockProfile, standard: dockProfile, display: dockProfile, ultrawide: dockProfile } },
    connectors,
    connectorSnapshots: snapshots,
  })
}, { fixedNow: nowMs, ids: connectorIds })

const observe = () => page.evaluate((ids) => {
  const visible = (node) => node instanceof HTMLElement && getComputedStyle(node).display !== 'none' &&
    getComputedStyle(node).visibility !== 'hidden' && node.getBoundingClientRect().height > 0
  const primarySelector = [
    '[data-work-pulse-summary]',
    'section[aria-label="Calendar"] > p:first-child',
    'section[aria-label="Home Assistant"] > ul > li:first-child',
    'section[aria-label="Crypto"] > div > span:first-child',
    'section[aria-label="Headlines"] > ul > li:first-child > a',
  ].join(', ')
  const rows = ids.map((id) => {
    const matches = [...document.querySelectorAll(`[data-block-id="${id}"]`)]
    const block = matches[0]
    const entry = block?.querySelector('[data-signal-dock-entry]')
    const button = entry?.querySelector('button[aria-expanded]')
    const fallback = entry?.querySelector('[data-signal-dock-fallback]')
    const primary = entry?.querySelector(primarySelector)
    const itemRect = block?.getBoundingClientRect()
    const entryRect = entry?.getBoundingClientRect()
    const buttonRect = button?.getBoundingClientRect()
    return {
      id,
      count: matches.length,
      zone: block?.getAttribute('data-stage-zone'),
      wrapperCount: block?.querySelectorAll('[data-signal-dock-entry]').length ?? 0,
      identity: entry?.querySelector('[data-signal-dock-identity]')?.textContent?.trim() ?? '',
      fallbackVisible: visible(fallback),
      primaryVisible: visible(primary),
      primaryText: primary?.textContent?.trim() ?? '',
      inert: entry?.querySelector('[data-signal-dock-content]')?.hasAttribute('inert') ?? false,
      buttonTarget: buttonRect ? { width: buttonRect.width, height: buttonRect.height } : null,
      contained: !!itemRect && !!entryRect && entryRect.left >= itemRect.left - 1 && entryRect.right <= itemRect.right + 1 &&
        entryRect.top >= itemRect.top - 1 && entryRect.bottom <= itemRect.bottom + 1,
    }
  })
  const links = [...document.querySelectorAll('[data-signal-dock-content] a[href]')]
  return {
    profile: document.documentElement.dataset.stageProfile,
    density: document.documentElement.dataset.stageDensity,
    rows,
    dockCount: document.querySelectorAll('[data-stage-zone="dock"] > [data-block-id]').length,
    safeLinks: links.every((link) => link.getAttribute('target') === '_blank' && link.getAttribute('rel') === 'noopener noreferrer'),
    noPageClip: document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1,
  }
}, connectorIds)

const capture = async ({ width, height, file }) => {
  await page.setViewportSize({ width, height })
  await page.reload()
  await page.waitForSelector('[data-signal-dock-entry]')
  await page.waitForFunction((ids) => ids.every((id) => document.querySelectorAll(`[data-block-id="${id}"]`).length === 1), connectorIds)
  await page.waitForTimeout(150)
  const result = await observe()
  await page.screenshot({ path: `${outDir}/${file}` })
  return result
}

const evidence = { captures: {}, operation: {}, cleanup: {} }
try {
  await page.clock.setFixedTime(nowMs)
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')
  originalPreimage = await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys)
  captureErrors = true
  await seedAllConnectors()

  evidence.captures.compact = await capture({ width: 800, height: 600, file: 'w4-p4-compact-800x600.png' })
  evidence.captures.standard = await capture({ width: 1600, height: 900, file: 'w4-p4-standard-1600x900.png' })
  evidence.captures.display = await capture({ width: 2560, height: 1440, file: 'w4-p4-display-2560x1440.png' })

  for (const [name, captureResult] of Object.entries(evidence.captures)) {
    assert(captureResult.rows.every((row) => row.count === 1 && row.zone === 'dock' && row.wrapperCount === 1), `${name}: connector representation failed`)
    assert(captureResult.rows.every((row) => row.identity && (row.primaryVisible || row.fallbackVisible)), `${name}: identity/state/value missing`)
    assert(captureResult.rows.every((row) => row.inert && row.buttonTarget?.width >= 36 && row.buttonTarget?.height >= 36), `${name}: closed operation contract failed`)
    assert(captureResult.rows.every((row) => row.contained), `${name}: condensed entry escaped its allocation`)
    assert(captureResult.safeLinks && captureResult.noPageClip, `${name}: link safety or page clipping failed`)
  }

  await page.setViewportSize({ width: 800, height: 600 })
  evidence.operation.statusStatic = await page.evaluate(() => {
    const content = document.querySelector('[data-block-id="status"] [role="status"]')
    return {
      present: content instanceof HTMLElement,
      label: content?.getAttribute('aria-label') ?? '',
      buttons: document.querySelectorAll('[data-block-id="status"] button').length,
      dialogs: document.querySelectorAll('[data-status-panel]').length,
    }
  })
  evidence.operation.keyboardReveal = await page.evaluate(() => {
    const dock = document.querySelector('[data-stage-zone-container="dock"]')
    const buttons = [...document.querySelectorAll('[data-stage-zone="dock"] button[aria-expanded]')]
    const last = buttons.at(-1)
    if (!(dock instanceof HTMLElement) || !(last instanceof HTMLElement)) return false
    dock.scrollLeft = 0
    last.focus()
    const d = dock.getBoundingClientRect()
    const b = last.getBoundingClientRect()
    return b.left >= d.left - 1 && b.right <= d.right + 1
  })
  assert(evidence.operation.statusStatic.present && /service status/i.test(evidence.operation.statusStatic.label), 'Status static readout is missing from the Dock')
  assert(evidence.operation.statusStatic.buttons === 0 && evidence.operation.statusStatic.dialogs === 0, 'Status exposed the removed details interaction')
  assert(evidence.operation.keyboardReveal, 'keyboard focus did not reveal the far Dock entry')
  assert(externalRequests.length === 0, `Signal Dock caused external request(s): ${externalRequests.join(', ')}`)
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
} finally {
  captureErrors = false
  try {
    if (originalPreimage) {
      await page.evaluate(async ({ keys, snapshot }) => {
        const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(snapshot, key))
        if (missing.length > 0) await chrome.storage.local.remove(missing)
        if (Object.keys(snapshot).length > 0) await chrome.storage.local.set(snapshot)
      }, { keys: touchedKeys, snapshot: originalPreimage })
      evidence.cleanup.restored = exact(await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys), originalPreimage)
    }
  } catch (error) {
    evidence.cleanup.error = error instanceof Error ? error.message : String(error)
  }
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
}

console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, externalRequests, runtimeErrors })}`)
if (evidence.error || !evidence.cleanup.restored || !evidence.cleanup.pageClosed) {
  console.error(`FAIL: W4-P4 Signal Dock connector survival: ${evidence.error ?? 'cleanup failure'}`)
  process.exitCode = 1
} else {
  console.log('PASS: W4-P4 Signal Dock connector survival')
}
