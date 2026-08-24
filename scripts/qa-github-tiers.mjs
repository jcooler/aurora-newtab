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
const EXPECTED = Object.freeze({ compact: [216, 132], standard: [320, 200], full: [460, 284] })
const MIN_GRAPH_RATIO = Object.freeze({ compact: 0.15, standard: 0.1, full: 0.15 })

function githubLayout(authorityIds, tier) {
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  widgets.github = {
    kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 1,
  }
  const layout = { id: `github-${tier}`, name: `GitHub ${tier}`, widgets, stacks: [] }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}

export async function runGithubTierQa() {
  const repoRoot = resolve(process.cwd())
  const dist = resolve(repoRoot, 'dist')
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  if (process.argv.includes('--exact')) {
    const provenance = parseBuildCommit(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'))
    assert.equal(provenance, commit, 'dist provenance does not match HEAD')
  }
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
    await seedInformationFirstFixtures(page, { contributionDayCount: 90 })
    const extensionId = new URL(page.url()).host
    const seedUrl = `chrome-extension://${extensionId}/manifest.json`

    for (const tier of TIERS) {
      await page.goto(seedUrl, { waitUntil: 'domcontentloaded' })
      const layouts = githubLayout(Object.keys(authority), tier)
      await page.evaluate(async ({ layouts }) => {
        const current = await chrome.storage.local.get(null)
        await chrome.storage.local.set({
          layouts,
          settings: { ...current.settings, panelColor: null },
          photoPrefs: { ...current.photoPrefs, mode: 'gradient' },
        })
      }, { layouts })
      await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
      const frame = page.locator(`[data-testid="canvas-item-github"] [data-tier-frame="${tier}"]`)
      await frame.waitFor()
      const graph = frame.locator('[role="img"][aria-label*="Contribution activity"]')
      await graph.waitFor({ state: 'attached' })
      assert.equal(await graph.isVisible(), true, `${tier} hides the contribution graph`)
      const measurement = await frame.evaluate((node) => {
        const frameRect = node.getBoundingClientRect()
        const graphNode = node.querySelector('[role="img"]')
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
        return {
          width: frameRect.width,
          height: frameRect.height,
          scrollWidth: node.scrollWidth,
          scrollHeight: node.scrollHeight,
          graph: graphRect ? {
            width: graphRect.width,
            height: graphRect.height,
            ratio: graphRect.width * graphRect.height / (frameRect.width * frameRect.height),
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
        }
      })
      const [expectedWidth, expectedHeight] = EXPECTED[tier]
      assert(Math.abs(measurement.width - expectedWidth) <= 1, `${tier} width drifted`)
      assert(Math.abs(measurement.height - expectedHeight) <= 1, `${tier} height drifted`)
      assert(measurement.scrollWidth <= measurement.width + 1, `${tier} clips horizontally`)
      assert(measurement.scrollHeight <= measurement.height + 1, `${tier} clips vertically`)
      assert.equal(measurement.internalScrollOwners, 0, `${tier} added an internal scrollbar`)
      assert.deepEqual(measurement.unexplainedTextClips, [], `${tier} clips text without a full-value fallback`)
      assert(measurement.graph && measurement.graph.ratio >= MIN_GRAPH_RATIO[tier], `${tier} graph is not visually dominant`)
      const filename = `github-${tier}.png`
      await frame.screenshot({ path: resolve(output, filename) })
      evidence.push({ tier, filename, ...measurement })
    }
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify({ commit, evidence }, null, 2)}\n`, 'utf8')
    process.stdout.write(`PASS GitHub tier QA: ${evidence.length}/${TIERS.length} close card captures\n`)
  } finally {
    if (context) await context.close().catch(() => {})
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runGithubTierQa()
