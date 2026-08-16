// Focused W3-P4 browser proof. It exercises the retired percentage provenance
// boundary without rerunning the historical preview matrix.
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w3-p4')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w3-p4'
const headed = process.argv.includes('--headed')
const touchedKeys = ['settings', 'layout', 'connectors', 'connectorSnapshots']
const targetIds = ['github', 'gitlab', 'vercel']

rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}
const exact = (actual, expected) => JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(expected))
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const scope = (id, config) => {
  const canonical = JSON.stringify(canonicalize(config))
  return `${id}:v1:${createHash('sha256').update(`${id}\n${canonical}`).digest('hex')}`
}

const configs = {
  github: {
    enabled: true,
    token: 'github_pat_w3_p4_fixture',
    username: 'aurora',
    views: { commitGraph: true, pulls: false, issues: false, notifications: false },
  },
  gitlab: {
    enabled: true,
    token: 'glpat_w3_p4_fixture',
    instanceUrl: 'https://gitlab.com',
    username: 'aurora',
    views: { activityGraph: true, mergeRequests: true, reviewAsks: false, todos: false },
  },
  vercel: { enabled: true, token: 'vc_w3_p4_fixture', username: 'aurora' },
}
const contributionDays = [
  { date: '2026-08-09', count: 0 },
  { date: '2026-08-10', count: 1 },
  { date: '2026-08-11', count: 2 },
  { date: '2026-08-12', count: 4 },
]
const fetchedAt = Date.now()
const snapshots = {
  github: {
    scope: scope('github', configs.github),
    fetchedAt,
    data: { prs: [], issues: [], notifications: 0, contributions: { total: 128, days: contributionDays }, etags: {} },
  },
  gitlab: {
    scope: scope('gitlab', configs.gitlab),
    fetchedAt,
    data: {
      mrs: [{ title: 'Retire legacy placement', url: 'https://gitlab.com/aurora/app/-/merge_requests/24', project: 'aurora/app' }],
      reviewMrs: [],
      todos: 0,
      contributions: { total: 87, days: contributionDays },
    },
  },
  vercel: {
    scope: scope('vercel', configs.vercel),
    fetchedAt,
    data: {
      deployments: [
        { project: 'aurora-web', state: 'READY', url: 'https://vercel.com/aurora/web', createdAt: fetchedAt - 180_000 },
        { project: 'aurora-api', state: 'ERROR', url: 'https://vercel.com/aurora/api', createdAt: fetchedAt - 3_600_000 },
      ],
    },
  },
}
const fixtureLayout = {
  version: 2,
  profiles: {
    compact: {
      github: { zone: 'pulse', order: 0, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' },
      gitlab: { zone: 'pulse', order: 1, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' },
      vercel: { zone: 'pulse', order: 2, colSpan: 1, rowSpan: 1, variant: 'compact', priority: 'pinned' },
    },
    standard: {
      github: { zone: 'pulse', order: 0, colSpan: 2, rowSpan: 2, variant: 'standard', priority: 'pinned' },
      gitlab: { zone: 'pulse', order: 1, colSpan: 2, rowSpan: 2, variant: 'standard', priority: 'pinned' },
      vercel: { zone: 'pulse', order: 2, colSpan: 2, rowSpan: 2, variant: 'standard', priority: 'pinned' },
    },
    display: {
      github: { zone: 'pulse', order: 0, colSpan: 3, rowSpan: 2, variant: 'expanded', priority: 'pinned' },
      gitlab: { zone: 'pulse', order: 1, colSpan: 3, rowSpan: 2, variant: 'expanded', priority: 'pinned' },
      vercel: { zone: 'pulse', order: 2, colSpan: 3, rowSpan: 2, variant: 'expanded', priority: 'pinned' },
    },
  },
  legacy: { github: { x: 99, y: 1 }, gitlab: { x: 1, y: 99 }, vercel: { x: 50, y: 50 } },
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
let originalPreimage
let captureErrors = false
const runtimeErrors = []
page.on('console', (message) => {
  if (captureErrors && message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => {
  if (captureErrors) runtimeErrors.push(`page: ${String(error)}`)
})

const waitForTargets = async () => {
  await page.waitForSelector('main[data-adaptive-stage]')
  await page.waitForFunction((ids) => ids.every((id) => document.querySelectorAll(`[data-block-id="${id}"]`).length === 1), targetIds)
  await page.waitForTimeout(100)
}
const observe = () => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
  const node = document.querySelector(`[data-block-id="${id}"]`)
  const section = node?.querySelector('section')
  const rect = node?.getBoundingClientRect()
  const sectionRect = section?.getBoundingClientRect()
  const style = node instanceof HTMLElement ? node.style : null
  const sectionStyle = section instanceof HTMLElement ? getComputedStyle(section) : null
  return [id, {
    count: document.querySelectorAll(`[data-block-id="${id}"]`).length,
    zone: node?.getAttribute('data-stage-zone'),
    variant: node?.getAttribute('data-stage-variant'),
    priority: node?.getAttribute('data-stage-priority'),
    colSpan: style?.getPropertyValue('--board-col-span') ?? '',
    rowSpan: style?.getPropertyValue('--board-row-span') ?? '',
    percentPositionAbsent: style?.position === '' && style?.left === '' && style?.top === '',
    represented: Boolean(rect && rect.width > 0 && rect.height > 0),
    wholeSectionVisible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0 && sectionStyle?.display !== 'none' && sectionStyle?.visibility !== 'hidden'),
  }]
})), targetIds)
const semanticSignature = (observations) => Object.fromEntries(Object.entries(observations).map(([id, value]) => [id, {
  zone: value.zone,
  variant: value.variant,
  priority: value.priority,
  colSpan: value.colSpan,
  rowSpan: value.rowSpan,
}]))
const capture = async (width, height, file) => {
  await page.setViewportSize({ width, height })
  await page.reload()
  await waitForTargets()
  const observations = await observe()
  await page.screenshot({ path: `${outDir}/${file}` })
  return observations
}

const evidence = { captures: {}, cleanup: {} }
try {
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')
  originalPreimage = await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys)
  await page.evaluate(async ({ configs, snapshots, fixtureLayout }) => {
    const current = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(current.settings.widgets).map((key) => [key, false]))
    await chrome.storage.local.set({
      settings: { ...current.settings, widgets, layoutDensity: 'balanced' },
      layout: fixtureLayout,
      connectors: configs,
      connectorSnapshots: snapshots,
    })
  }, { configs, snapshots, fixtureLayout })
  captureErrors = true

  evidence.captures.standard = await capture(1600, 900, 'w3-p4-standard-1600x900.png')
  const withLegacy = semanticSignature(evidence.captures.standard)
  await page.evaluate(async () => {
    const { layout } = await chrome.storage.local.get('layout')
    const { legacy: _legacy, ...withoutLegacy } = layout
    await chrome.storage.local.set({ layout: withoutLegacy })
  })
  await page.waitForTimeout(200)
  const withoutLegacy = semanticSignature(await observe())
  evidence.semanticParity = exact(withLegacy, withoutLegacy)
  await page.evaluate((layout) => chrome.storage.local.set({ layout }), fixtureLayout)
  await page.waitForTimeout(200)

  evidence.captures.compact = await capture(800, 600, 'w3-p4-compact-800x600.png')
  evidence.captures.display = await capture(2560, 1440, 'w3-p4-display-2560x1440.png')
  const stored = await page.evaluate(() => chrome.storage.local.get('layout'))
  evidence.legacyPreserved = exact(stored.layout.legacy, fixtureLayout.legacy)

  for (const [profile, observations] of Object.entries(evidence.captures)) {
    assert(Object.values(observations).every((value) => value.count === 1), `${profile}: target duplication`)
    assert(Object.values(observations).every((value) => value.percentPositionAbsent), `${profile}: live percentage positioning found`)
    assert(Object.values(observations).every((value) => value.represented && value.wholeSectionVisible), `${profile}: whole widget disappeared`)
  }
  assert(evidence.semanticParity, 'legacy provenance changed semantic allocation')
  assert(evidence.legacyPreserved, 'legacy provenance was not preserved exactly')
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

console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, runtimeErrors })}`)
if (evidence.error || !evidence.cleanup.restored || !evidence.cleanup.pageClosed) {
  console.error(`FAIL: W3-P4 legacy retirement and rollback semantics${evidence.error ? `: ${evidence.error}` : ''}`)
  process.exitCode = 1
} else {
  console.log('PASS: W3-P4 legacy retirement and rollback semantics')
}
