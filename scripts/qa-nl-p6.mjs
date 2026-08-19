// NL-P6 product QA sweep (plan: docs/superpowers/plans/2026-08-19-nl-p6-
// product-qa.md, Task 2): scenario x viewport x state over a production
// preview build of the real extension, per the corrected A2-D060 standard —
// short-height desktop family including exact 1408x445, existing-layout-
// shaped storage, programmatic invariants at every cell, one capture per
// cell for the per-capture judgment pass (Task 4). Writes TRACKED evidence
// to docs/superpowers/qa/nl-p6/.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { SCENARIOS } from './qa-nl-p6-scenarios.mjs'

const repoRoot = process.cwd()
const dist = resolve('.qa-nl-p6-dist')
const profileDir = resolve('.playwright-profile-qa-nl-p6')
const outDir = resolve('docs/superpowers/qa/nl-p6')
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.qa-nl-p6-dist'],
  [profileDir, '.playwright-profile-qa-nl-p6'],
  [outDir, 'nl-p6'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const build = spawnSync(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'),
  'build', '--mode', 'preview', '--outDir', dist, '--emptyOutDir',
], { cwd: repoRoot, encoding: 'utf8' })
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`build failed: ${build.status}`)
}

// The matrix (plan Task 2): the common core plus the corrected standard's
// short-height desktop family, the bookmarks compact boundary, and both
// sides of the 600px narrow floor.
const VIEWPORTS = [
  { width: 1408, height: 445, family: 'short' },
  { width: 1024, height: 600, family: 'short' },
  { width: 1920, height: 550, family: 'short' },
  { width: 1280, height: 500, family: 'short' },
  { width: 1366, height: 768, family: 'common' },
  { width: 1600, height: 900, family: 'common' },
  { width: 1920, height: 1080, family: 'common' },
  { width: 2560, height: 1440, family: 'common' },
  { width: 3440, height: 1440, family: 'wide' },
  { width: 720, height: 900, family: 'boundary' },
  { width: 599, height: 800, family: 'floor' },
  { width: 600, height: 800, family: 'floor' },
]
const HOVER_DOCK_VIEWPORTS = new Set(['1408x445', '1600x900'])

const evidence = { cells: [], failures: [], runtimeErrors: [], failedRequests: [], writes: [] }
const fail = (message) => { evidence.failures.push(message) }

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(20_000)
page.on('console', (m) => { if (m.type() === 'error') evidence.runtimeErrors.push(`console: ${m.text()}`) })
page.on('pageerror', (e) => evidence.runtimeErrors.push(`page: ${String(e)}`))
page.on('requestfailed', (r) => {
  if (!r.url().startsWith('chrome-extension://')) {
    evidence.failedRequests.push(`${r.method()} ${r.url()}: ${r.failure()?.errorText ?? 'failed'}`)
  }
})

const waitForCanvas = async () => {
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(350)
}
const armWriteLog = () => page.evaluate(() => {
  window.__writeLog = []
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') window.__writeLog.push(Object.keys(changes).sort().join(','))
  })
})
const harvestWrites = async (label) => {
  const writes = await page.evaluate(() => window.__writeLog ?? [])
  for (const keys of writes) evidence.writes.push(`${label}:${keys}`)
}

async function assertInvariants(cell) {
  const truth = await page.evaluate(() => {
    const doc = document.documentElement
    const surface = document.querySelector('[data-canvas-surface]')
    const items = [...document.querySelectorAll('[data-block-id]')]
    // A widget marked data-canvas-empty rendered nothing BY DESIGN (the
    // no-husk law: unconfigured World clocks, Countdown, Habits). It is
    // inert and unreachable, so it is absent — not a degenerate box. Any
    // OTHER zero-size item is still a defect.
    const zero = items.filter((n) => {
      const r = n.getBoundingClientRect()
      return (r.width < 4 || r.height < 4)
        && !n.hasAttribute('data-canvas-empty')
        && !n.closest('[data-canvas-narrow]')
    }).map((n) => n.getAttribute('data-block-id'))
    const offscreen = items.filter((n) => {
      if (n.hasAttribute('data-canvas-empty')) return false
      const r = n.getBoundingClientRect()
      // The narrow-floor stack scrolls VERTICALLY by design: below-the-fold
      // members are reachable, so only horizontal escape counts there.
      if (n.closest('[data-canvas-narrow]')) {
        return r.right < 0 || r.left > window.innerWidth
      }
      return r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight
    }).map((n) => n.getAttribute('data-block-id'))
    const gear = document.querySelector('button[aria-label="Open settings"]')
    const gearRect = gear?.getBoundingClientRect()
    const gearHit = gearRect
      ? document.elementFromPoint(gearRect.left + gearRect.width / 2, gearRect.top + gearRect.height / 2)?.closest('button') === gear
      : false
    return {
      hOverflow: doc.scrollWidth > doc.clientWidth,
      surfacePresent: Boolean(surface),
      zero,
      offscreen,
      gearHit,
    }
  })
  if (truth.hOverflow) fail(`${cell}: horizontal page overflow`)
  if (!truth.surfacePresent) fail(`${cell}: canvas surface missing`)
  if (truth.zero.length) fail(`${cell}: degenerate widgets ${truth.zero.join(',')}`)
  if (truth.offscreen.length) fail(`${cell}: fully offscreen widgets ${truth.offscreen.join(',')}`)
  if (!truth.gearHit) fail(`${cell}: settings gear not hit-testable`)
}

async function capture(name) {
  await page.screenshot({ path: resolve(outDir, `${name}.png`) })
  evidence.cells.push(name)
}

// Per-scenario truth checks, run once at 1600x900 after seeding (plan Task 2).
async function scenarioChecks(id) {
  if (id === 'legacy-v1') {
    const clockY = await page.evaluate(() => {
      const clock = document.querySelector('[data-block-id="clock"]')
      if (!clock) return null
      const r = clock.getBoundingClientRect()
      return ((r.top + r.height / 2) / window.innerHeight) * 100
    })
    if (clockY === null || Math.abs(clockY - 22) > 4) {
      fail(`legacy-v1: clock renders at ${clockY?.toFixed(1)}% — stored V1 y was 22%`)
    }
  }
  if (id === 'named-saved' || id === 'connectors') {
    const truths = await page.evaluate(() => {
      const quote = document.querySelector('[data-block-id="quote"]')
      const weather = document.querySelector('nav[aria-label="Bottom bar"] [data-block-id="weather"]')
      const bar = document.querySelector('.canvas-bottom-bar')
      const weatherRect = weather?.getBoundingClientRect()
      const barRect = bar?.getBoundingClientRect()
      return {
        quotePresent: Boolean(quote),
        weatherXPct: weatherRect && barRect
          ? ((weatherRect.left + weatherRect.width / 2 - barRect.left) / barRect.width) * 100
          : null,
      }
    })
    if (truths.quotePresent) fail(`${id}: hidden quote is rendering`)
    if (truths.weatherXPct === null || Math.abs(truths.weatherXPct - 30) > 3) {
      fail(`${id}: docked weather at ${truths.weatherXPct?.toFixed(1)}% of the strip — stored x was 30`)
    }
  }
  if (id === 'connectors') {
    const github = await page.evaluate(() => (
      document.querySelector('nav[aria-label="Bottom bar"] [data-block-id="github"]')?.textContent ?? ''
    ))
    if (!/PR|issue|clear/i.test(github)) fail(`connectors: github dock line reads "${github}"`)
  }
}

let caughtError
try {
  for (const scenario of SCENARIOS) {
    // Fresh storage per scenario: clear all, reload to re-init defaults,
    // then seed and reload once more.
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await waitForCanvas()
    await page.evaluate(async () => { await chrome.storage.local.clear() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCanvas()
    await scenario.seed(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCanvas()
    await armWriteLog()
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.waitForTimeout(250)
    await scenarioChecks(scenario.id)

    for (const viewport of VIEWPORTS) {
      const vpId = `${viewport.width}x${viewport.height}`
      await page.setViewportSize(viewport)
      await page.waitForTimeout(350)
      const cell = `${scenario.id}-${vpId}`

      await assertInvariants(`${cell}-normal`)
      await capture(`${cell}-normal`)

      // Edit state: keyboard chord in, capture, exact-cancel out. Below the
      // narrow floor the stack renders and the session is still permitted;
      // the capture shows what the user gets.
      await page.keyboard.press('Control+Shift+E')
      await page.waitForTimeout(300)
      const sessionLive = await page.evaluate(() => Boolean(document.querySelector('[role="toolbar"][aria-label="Edit layout"]')))
      if (!sessionLive) fail(`${cell}-edit: session did not open`)
      await assertInvariants(`${cell}-edit`)
      await capture(`${cell}-edit`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)

      if ((scenario.id === 'named-saved' || scenario.id === 'connectors') && HOVER_DOCK_VIEWPORTS.has(vpId)) {
        const member = page.locator('nav[aria-label="Bottom bar"] [data-block-id]').first()
        if (await member.count()) {
          await member.hover()
          await page.waitForTimeout(200)
          const chromeVisible = await page.evaluate(() => {
            const grip = document.querySelector('nav[aria-label="Bottom bar"] .canvas-item-chrome')
            return grip ? getComputedStyle(grip).opacity === '1' : false
          })
          if (!chromeVisible) fail(`${cell}-hover-dock: grip/gear not visible on hover`)
          await capture(`${cell}-hover-dock`)
        }
      }
    }
    await harvestWrites(scenario.id)
  }

  // Write-log law: after each scenario's own seeding, the running product
  // never writes the frozen legacy `layout` key. (Session cancels write
  // nothing at all; the chord/Escape pairs above must leave no trace.)
  for (const entry of evidence.writes) {
    const [label, keys] = entry.split(':')
    if (keys.split(',').includes('layout')) fail(`write-log ${label}: the frozen legacy layout key was written`)
    if (keys.split(',').includes('layouts')) fail(`write-log ${label}: a cancelled session wrote layouts`)
  }
} catch (error) {
  caughtError = error
} finally {
  try { await context.close() } catch { /* ignore */ }
}

// The report skeleton (plan Task 4 fills verdicts).
const reportLines = [
  '# NL-P6 Product QA Report',
  '',
  'Corrected A2-D060 standard: short-height desktop family including exact',
  '1408x445, existing-layout-shaped storage, real-window witness (see',
  'window-evidence.json), and a PER-CAPTURE usefulness judgment — a capture',
  'passes only if the composition is USEFUL at that size; rendering without',
  'error is not a pass. Verdicts: `useful` or `defect: <description>`.',
  '',
  '| Capture | Scenario | Viewport | State | Verdict |',
  '| --- | --- | --- | --- | --- |',
  ...evidence.cells.map((cell) => {
    const [scenarioId, vp, ...state] = cell.split(/-(?=\d)|-(?=normal|edit|hover)/)
    const parts = cell.split('-')
    const vpIndex = parts.findIndex((part) => /^\d+x\d+$/.test(part))
    const scenario = parts.slice(0, vpIndex).join('-')
    const viewport = parts[vpIndex]
    const stateName = parts.slice(vpIndex + 1).join('-')
    void scenarioId; void vp; void state
    return `| ![x](${cell}.png) | ${scenario} | ${viewport} | ${stateName} | _pending_ |`
  }),
  '',
  '## Findings',
  '',
  '_pending judgment pass_',
  '',
  '## Fixes',
  '',
  '_pending judgment pass_',
  '',
]
writeFileSync(resolve(outDir, 'QA-REPORT.md'), reportLines.join('\n'))
writeFileSync(resolve(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify({
  cells: evidence.cells.length,
  failures: evidence.failures,
  runtimeErrors: evidence.runtimeErrors,
  failedRequests: evidence.failedRequests,
}, null, 2))
if (caughtError) {
  console.error('NL-P6 SWEEP ERROR:', caughtError)
  process.exitCode = 1
} else if (evidence.failures.length > 0 || evidence.runtimeErrors.length > 0 || evidence.failedRequests.length > 0) {
  console.error('FAIL: NL-P6 sweep')
  process.exitCode = 1
} else {
  console.log('PASS: NL-P6 sweep')
}
