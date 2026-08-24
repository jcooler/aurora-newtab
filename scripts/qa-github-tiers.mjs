import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import {
  parsePresentationAuthority,
  resolveSfP1BrowserMode,
  resolveSfP1ContextOptions,
} from './qa-shared-frame-p1.mjs'
import { parseBuildCommit } from './qa-widget-redesign-production.mjs'

const TIERS = Object.freeze(['compact', 'standard', 'full'])
const CONNECTORS = Object.freeze(['github', 'gitlab'])
const EXPECTED = Object.freeze({ compact: [216, 132], standard: [320, 200], full: [460, 284] })
const MIN_GRAPH_WIDTH = Object.freeze({ compact: 0.80, standard: 0.85, full: 0.85 })
const MIN_GRAPH_AREA = Object.freeze({ compact: 0.28, standard: 0.30, full: 0.38 })

function contributionLayout(authorityIds, connector, tier) {
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  widgets[connector] = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 1 }
  const layout = { id: `${connector}-${tier}`, name: `${connector} ${tier}`, widgets, stacks: [] }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}

export async function runGithubTierQa() {
  const repoRoot = resolve(process.cwd())
  const dist = resolve(repoRoot, 'dist')
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const provenance = parseBuildCommit(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'))
  assert.equal(provenance, commit, 'dist provenance does not match HEAD')
  const authority = parsePresentationAuthority(
    readFileSync(resolve(repoRoot, 'src/newtab/widgetSizeContracts.ts'), 'utf8'),
  )
  const output = resolve(repoRoot, 'docs/superpowers/qa/ui-recovery/github-tiers')
  mkdirSync(output, { recursive: true })
  const profile = mkdtempSync(resolve(tmpdir(), 'aurora-github-tiers-'))
  const evidence = []
  let context
  try {
    context = await chromium.launchPersistentContext(
      profile,
      resolveSfP1ContextOptions(resolveSfP1BrowserMode([]), dist),
    )
    const page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(20_000)
    await context.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'))
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    await seedInformationFirstFixtures(page, { contributionDayCount: 112 })
    const extensionId = new URL(page.url()).host
    const seedUrl = `chrome-extension://${extensionId}/manifest.json`

    for (const connector of CONNECTORS) {
      for (const tier of TIERS) {
        await page.goto(seedUrl, { waitUntil: 'domcontentloaded' })
        const layouts = contributionLayout(Object.keys(authority), connector, tier)
        await page.evaluate(async ({ layouts }) => {
          const current = await chrome.storage.local.get(null)
          await chrome.storage.local.set({
            layouts,
            settings: { ...current.settings, panelColor: null },
            photoPrefs: { ...current.photoPrefs, mode: 'gradient' },
          })
        }, { layouts })
        await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
        const frame = page.locator(`[data-testid="canvas-item-${connector}"] [data-tier-frame="${tier}"]`)
        await frame.waitFor()
        const graph = frame.locator('[role="img"][aria-label*="Contribution activity"]')
        await graph.waitFor({ state: 'attached' })
        assert.equal(await graph.isVisible(), true, `${connector} ${tier} hides the contribution graph`)
        const measurement = await frame.evaluate((node, { connector, tier }) => {
          const frameRect = node.getBoundingClientRect()
          const graphNode = node.querySelector('[role="img"][aria-label*="Contribution activity"]')
          const graphRect = graphNode?.getBoundingClientRect()
          const visible = [node, ...node.querySelectorAll('*')].filter((entry) => {
            const style = getComputedStyle(entry)
            const rect = entry.getBoundingClientRect()
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && !entry.closest('.sr-only')
              && rect.width > 0
              && rect.height > 0
          })
          const leftInset = graphRect ? graphRect.left - frameRect.left : null
          const rightInset = graphRect ? frameRect.right - graphRect.right : null
          const headerSummary = node.querySelector('[data-contribution-header-summary]')
            ?? node.querySelector(':scope > header p')
          return {
            connector,
            tier,
            width: frameRect.width,
            height: frameRect.height,
            scrollWidth: node.scrollWidth,
            scrollHeight: node.scrollHeight,
            graph: graphRect && leftInset !== null && rightInset !== null ? {
              width: graphRect.width,
              height: graphRect.height,
              widthCoverage: graphRect.width / frameRect.width,
              areaCoverage: graphRect.width * graphRect.height / (frameRect.width * frameRect.height),
              centerDelta: Math.abs(leftInset - rightInset),
            } : null,
            internalScrollOwners: visible.filter((entry) => {
              const style = getComputedStyle(entry)
              return /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)
            }).length,
            unexplainedTextClips: visible.filter((entry) => (
              entry.children.length === 0
              && (entry.textContent ?? '').trim().length > 0
              && entry.scrollWidth > entry.clientWidth + 1
              && !entry.hasAttribute('title')
              && !entry.hasAttribute('aria-label')
            )).map((entry) => (entry.textContent ?? '').trim()),
            rowCount: node.querySelectorAll('[data-work-pulse-rows] li').length,
            hasMonthTicks: node.querySelector('[data-contribution-months]') !== null,
            hasParallelRows: connector === 'github'
              ? node.querySelector('[data-github-row-families="parallel"]') !== null
              : node.querySelector('[aria-label="GitLab merge request queues"].grid-cols-2') !== null,
            contributionSummary: node.querySelector('[data-contribution-summary]')?.textContent?.trim() ?? '',
            headerSummary: headerSummary?.textContent?.trim() ?? '',
          }
        }, { connector, tier })
        const [expectedWidth, expectedHeight] = EXPECTED[tier]
        assert(Math.abs(measurement.width - expectedWidth) <= 1, `${connector} ${tier} width drifted`)
        assert(Math.abs(measurement.height - expectedHeight) <= 1, `${connector} ${tier} height drifted`)
        assert(measurement.scrollWidth <= measurement.width + 1, `${connector} ${tier} clips horizontally`)
        assert(measurement.scrollHeight <= measurement.height + 1, `${connector} ${tier} clips vertically`)
        assert.equal(measurement.internalScrollOwners, 0, `${connector} ${tier} added an internal scrollbar`)
        assert.deepEqual(measurement.unexplainedTextClips, [], `${connector} ${tier} clips text without a full-value fallback`)
        assert(measurement.graph, `${connector} ${tier} contribution graph is missing`)
        assert(
          measurement.graph.widthCoverage >= MIN_GRAPH_WIDTH[tier],
          `${connector} ${tier} graph width is not visually dominant: ${JSON.stringify(measurement.graph)}`,
        )
        assert(
          measurement.graph.areaCoverage >= MIN_GRAPH_AREA[tier],
          `${connector} ${tier} graph area is not visually dominant: ${JSON.stringify(measurement.graph)}`,
        )
        assert(measurement.graph.centerDelta <= 2, `${connector} ${tier} graph is not centered in its frame`)
        const filename = `${connector}-${tier}.png`
        await frame.screenshot({ path: resolve(output, filename) })
        evidence.push({ filename, ...measurement })
      }

      const connectorEvidence = evidence.filter((capture) => capture.connector === connector)
      const compact = connectorEvidence.find(({ tier }) => tier === 'compact')
      const standard = connectorEvidence.find(({ tier }) => tier === 'standard')
      const full = connectorEvidence.find(({ tier }) => tier === 'full')
      assert(compact && standard && full, `${connector} tier evidence is incomplete`)
      assert.equal(compact.rowCount, 0, `${connector} Compact should prioritize the graph instead of list rows`)
      assert.match(compact.contributionSummary, /contributions.*day streak/i, `${connector} Compact lost contribution and streak facts`)
      assert.equal(standard.rowCount, 1, `${connector} Standard should add one actionable row`)
      assert.match(standard.contributionSummary, /contributions.*day streak/i, `${connector} Standard lost contribution and streak facts`)
      assert.equal(full.rowCount, 2, `${connector} Full should show both selected row families`)
      assert.equal(full.hasParallelRows, true, `${connector} Full should distinguish row families in parallel`)
      assert.equal(full.hasMonthTicks, true, `${connector} Full should add month context to the graph`)
      assert.match(full.headerSummary, /contributions.*day streak/i, `${connector} Full lost its header graph facts`)
      assert(compact.graph.width < standard.graph.width, `${connector} Standard graph should grow beyond Compact`)
      assert(standard.graph.width < full.graph.width, `${connector} Full graph should grow beyond Standard`)
      assert(compact.graph.height < standard.graph.height, `${connector} Standard graph should grow taller than Compact`)
      assert(standard.graph.height < full.graph.height, `${connector} Full graph should grow taller than Standard`)
      assert(full.graph.width >= compact.graph.width * 2, `${connector} Full graph width should be at least twice Compact`)
      assert(full.graph.height >= compact.graph.height * 2, `${connector} Full graph height should be at least twice Compact`)
    }
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify({ commit, evidence }, null, 2)}\n`, 'utf8')
    process.stdout.write(`PASS contribution tier QA: ${evidence.length}/${CONNECTORS.length * TIERS.length} close card captures\n`)
  } finally {
    if (context) await context.close().catch(() => {})
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runGithubTierQa()
