// Focused W4-P3 built-extension replay for Work Pulse responsive variants.
// The historical 234-profile matrix remains the packet's one full browser gate.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w4-p3')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w4-p3'
const touchedKeys = ['settings', 'layout', 'connectors', 'connectorSnapshots']
const nowMs = new Date(2026, 7, 16, 12, 0).getTime()
const headed = process.argv.includes('--headed')

if (!profileDir.endsWith('.playwright-profile-w4-p3')) throw new Error(`unsafe profile path: ${profileDir}`)
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

const seed = async (kind) => {
  // Unmount the previously focused connector before replacing its snapshot;
  // otherwise its existing storage listener correctly treats removal as a
  // refresh request during the fixture transition itself.
  await page.evaluate(() => chrome.storage.local.set({ connectors: {} }))
  await page.waitForTimeout(100)
  return page.evaluate(async ({ fixedNow, kind }) => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
  const canonical = (input) => {
    if (input === null) return 'null'
    if (typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number') return JSON.stringify(input)
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`
    return `{${Object.keys(input).filter((key) => input[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(input[key])}`).join(',')}}`
  }
  const scopeOf = async (id, config) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id}\n${canonical(config)}`))
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${id}:v1:${hex}`
  }

  let connectors
  let connectorSnapshots
  if (kind === 'github-attention') {
    widgets.github = true
    const github = {
      enabled: true,
      token: 'focused-browser-fixture-token',
      username: 'aurora-fixture',
      views: { commitGraph: true, pulls: true, issues: true, notifications: true },
    }
    const days = Array.from({ length: 28 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      count: index % 5,
    }))
    connectors = { github }
    connectorSnapshots = {
      github: {
        scope: await scopeOf('github', github),
        fetchedAt: fixedNow,
        data: {
          prs: [{ title: 'Review accessibility geometry', url: 'https://github.com/aurora/newtab/pull/42', repo: 'aurora/newtab' }],
          issues: [{ title: 'Resolve release blocker', url: 'https://github.com/aurora/newtab/issues/91', repo: 'aurora/newtab' }],
          notifications: 3,
          contributions: { days, total: 52 },
          etags: {},
        },
      },
    }
  } else {
    widgets.status = true
    const status = {
      enabled: true,
      services: [
        { name: 'GitHub', url: 'https://www.githubstatus.com/api/v2/status.json' },
        { name: 'Aurora API', url: 'https://status.example.test/api/v2/status.json' },
      ],
    }
    connectors = { status }
    connectorSnapshots = {
      status: {
        scope: await scopeOf('status', status),
        fetchedAt: fixedNow,
        data: {
          services: kind.endsWith('healthy')
            ? [
                { name: 'GitHub', indicator: 'none', description: 'All systems operational' },
                { name: 'Aurora API', indicator: 'none', description: 'All systems operational' },
              ]
            : [
                { name: 'GitHub', indicator: 'none', description: 'All systems operational' },
                { name: 'Aurora API', indicator: 'major', description: 'Elevated errors' },
              ],
        },
      },
    }
  }

  const layout = kind.startsWith('status-standard')
    ? { version: 2, profiles: { standard: { status: {
        zone: 'pulse', order: 0, colSpan: 2, rowSpan: 1, variant: 'standard', priority: 'automatic',
      } } } }
    : { version: 2, profiles: {} }
  await chrome.storage.local.set({
    settings: { ...settings, widgets, layoutDensity: 'auto' },
    layout,
    connectors,
    connectorSnapshots,
  })
  }, { fixedNow: nowMs, kind })
}

const waitForPulse = async (value) => {
  await page.waitForSelector('main[data-adaptive-stage]')
  try {
    await page.waitForFunction((wanted) => {
      const summary = document.querySelector('[data-work-pulse-summary]')
      return summary?.querySelector('[data-work-pulse-value]')?.textContent === wanted
    }, value, { timeout: 8_000 })
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      summaries: [...document.querySelectorAll('[data-work-pulse-summary]')].map((node) => node.textContent),
      pulse: document.querySelector('[data-stage-zone="pulse"]')?.textContent,
      blocks: [...document.querySelectorAll('[data-block-id]')].map((node) => node.getAttribute('data-block-id')),
    }))
    throw new Error(`${error instanceof Error ? error.message : String(error)}; ${JSON.stringify(diagnostic)}`)
  }
  await page.waitForTimeout(100)
}

const observe = () => page.evaluate(() => {
  const item = document.querySelector('[data-stage-zone="pulse"] > [data-block-id]')
  const section = item?.querySelector(':scope > section')
  const summary = item?.querySelector('[data-work-pulse-summary]')
  const rows = [...(item?.querySelectorAll('[data-work-pulse-rows]') ?? [])]
  const details = [...(item?.querySelectorAll('[data-work-pulse-detail]') ?? [])]
  const statusDots = item?.querySelector('[data-work-pulse-status-dots]')
  const links = [...(item?.querySelectorAll('a[href]') ?? [])]
  const visible = (node) => node instanceof HTMLElement && getComputedStyle(node).display !== 'none'
  const contained = (child, parent) => {
    if (!(child instanceof HTMLElement) || !(parent instanceof HTMLElement)) return false
    const c = child.getBoundingClientRect()
    const p = parent.getBoundingClientRect()
    return c.left >= p.left - 1 && c.right <= p.right + 1 && c.top >= p.top - 1 && c.bottom <= p.bottom + 1
  }
  return {
    profile: document.documentElement.dataset.stageProfile,
    blockId: item?.getAttribute('data-block-id'),
    variant: item?.getAttribute('data-stage-variant'),
    summaryValue: summary?.querySelector('[data-work-pulse-value]')?.textContent,
    summaryTone: summary?.getAttribute('data-work-pulse-tone'),
    visibleRows: rows.filter(visible).length,
    visibleDetails: details.filter(visible).length,
    statusDotsDisplay: statusDots ? getComputedStyle(statusDots).display : null,
    sectionContained: contained(section, item),
    pulseSurfaceCount: document.querySelectorAll('.stage-zone--pulse').length,
    safeLinks: links.every((link) => link.getAttribute('target') === '_blank' && link.getAttribute('rel') === 'noopener noreferrer'),
    noHorizontalPageClip: document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1,
  }
})

const capture = async ({ width, height, kind, value, file }) => {
  await page.setViewportSize({ width, height })
  await seed(kind)
  await page.reload()
  await waitForPulse(value)
  const observation = await observe()
  if (file) await page.screenshot({ path: `${outDir}/${file}` })
  return observation
}

const evidence = { captures: {}, cleanup: {} }
try {
  await page.clock.setFixedTime(nowMs)
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')
  originalPreimage = await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys)
  captureErrors = true

  evidence.captures.compact = await capture({
    width: 800, height: 600, kind: 'status-attention', value: '1 service issue', file: 'w4-p3-compact-800x600.png',
  })
  evidence.captures.standard = await capture({
    width: 1600, height: 900, kind: 'github-attention', value: '3 need attention', file: 'w4-p3-standard-1600x900.png',
  })
  evidence.captures.display = await capture({
    width: 2560, height: 1440, kind: 'github-attention', value: '3 need attention', file: 'w4-p3-display-2560x1440.png',
  })
  evidence.healthy = await capture({
    width: 1600, height: 900, kind: 'status-standard-healthy', value: 'All operational',
  })
  evidence.statusAttentionStandard = await capture({
    width: 1600, height: 900, kind: 'status-standard-attention', value: '1 service issue',
  })

  const { compact, standard, display } = evidence.captures
  assert(compact.profile === 'compact' && compact.variant === 'compact', `compact: wrong profile/variant ${compact.profile}/${compact.variant}`)
  assert(compact.blockId === 'status' && compact.summaryTone === 'critical', 'compact: service failure did not rise as critical')
  assert(compact.visibleRows === 0 && compact.visibleDetails === 0, 'compact: supporting rows/details did not yield')
  assert(standard.profile === 'standard' && standard.variant === 'standard', `standard: wrong profile/variant ${standard.profile}/${standard.variant}`)
  assert(standard.blockId === 'github' && standard.visibleRows > 0 && standard.visibleDetails === 0, 'standard: expected summary plus prioritized rows only')
  assert(display.profile === 'display' && display.variant === 'expanded', `display: wrong profile/variant ${display.profile}/${display.variant}`)
  assert(display.blockId === 'github' && display.visibleRows > 0 && display.visibleDetails > 0, 'display: expanded supporting detail missing')
  assert(evidence.healthy.summaryTone === 'quiet' && evidence.healthy.statusDotsDisplay === 'flex', 'healthy status did not stay quiet or retain service identity')
  assert(evidence.statusAttentionStandard.visibleRows > 0 && evidence.statusAttentionStandard.statusDotsDisplay === 'flex', 'standard status did not promote its prioritized trouble row')
  for (const [profile, observation] of Object.entries(evidence.captures)) {
    assert(observation.sectionContained, `${profile}: connector escaped its allocation`)
    assert(observation.pulseSurfaceCount === 1, `${profile}: Pulse surface duplicated`)
    assert(observation.safeLinks, `${profile}: external link safety regressed`)
    assert(observation.noHorizontalPageClip, `${profile}: horizontal page clipping`)
  }
  assert(externalRequests.length === 0, `Work Pulse introduced external request(s): ${externalRequests.join(', ')}`)
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
  console.error(`FAIL: W4-P3 Work Pulse variants${evidence.error ? `: ${evidence.error}` : ''}`)
  process.exitCode = 1
} else {
  console.log('PASS: W4-P3 Work Pulse variants')
}
