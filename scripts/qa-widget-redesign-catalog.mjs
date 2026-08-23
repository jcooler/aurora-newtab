import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

import { chromium } from 'playwright'

import { MIXED_STACKS, SOURCE_WIDGET_IDS, TARGET_WIDGETS } from '../mockups/widget-redesign/catalog-model.mjs'
import { captureFilename } from '../mockups/widget-redesign/catalog-captures.mjs'
import { expectedCatalogCaptures } from './widget-redesign-catalog-contracts.mjs'
import { startCatalogServer } from './widget-redesign-catalog-server.mjs'

const FRAME_SIZES = Object.freeze({ compact: Object.freeze({ width: 216, height: 132 }), standard: Object.freeze({ width: 320, height: 200 }), full: Object.freeze({ width: 460, height: 284 }) })
const SOURCE_FILES = Object.freeze([
  'mockups/widget-redesign/catalog-model.mjs', 'mockups/widget-redesign/catalog-captures.mjs',
  'mockups/widget-redesign/fixtures.mjs', 'mockups/widget-redesign/styles.css',
  'mockups/widget-redesign/renderers/shared.mjs', 'mockups/widget-redesign/renderers/core.mjs',
  'mockups/widget-redesign/renderers/calendar-sky.mjs', 'mockups/widget-redesign/renderers/work.mjs',
  'mockups/widget-redesign/renderers/resources.mjs',
])

export const expectedFrame = (tier) => {
  if (!FRAME_SIZES[tier]) throw new Error(`No exact frame geometry for ${tier}`)
  return { ...FRAME_SIZES[tier] }
}

export function resolveOutput(outputRoot, child) {
  const root = resolve(outputRoot)
  const target = resolve(root, child)
  const fromRoot = relative(root, target)
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new Error(`Output is outside catalog output: ${child}`)
  return target
}

export const markdownCell = (value) => String(value).replaceAll('|', '\\|').replace(/\r?\n/g, ' ')
export const captureViewport = (capture) => capture.kind === 'comparison' || capture.kind === 'migration' ? { width: 1440, height: 900 } : { width: 1200, height: 760 }

const hashFile = async (path) => createHash('sha256').update(await readFile(path)).digest('hex')
const pngSize = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) })
const git = (repoRoot, args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()

const catalogMarkdown = ({ sourceCommit, captures }) => `# Aurora Widget Redesign Catalog V1

Source commit: \`${sourceCommit}\`

## Inventory

${SOURCE_WIDGET_IDS.length} live source identities map to ${TARGET_WIDGETS.length} target designs. Calendar consolidates ICS, Month, and Public Holidays.

## Captures

| Capture | Kind | Evidence |
| --- | --- | --- |
${captures.map((entry) => `| ${markdownCell(entry.key)} | ${entry.kind} | [PNG](./${entry.filename}) |`).join('\n')}

## Mixed stacks

${MIXED_STACKS.map((stack) => `- ${stack.members.join(' + ')} at ${stack.tier}`).join('\n')}

## Unresolved owner decisions

None
`

const reportMarkdown = ({ sourceCommit, exact, results, failures }) => `# Widget Redesign Mockup QA

Source commit: \`${sourceCommit}\`
Mode: ${exact ? 'exact' : 'scratch'}

## Automated evidence

- Captures: ${results.length}
- Failures: ${failures.length}
- Console, page, request, geometry, overflow, essential-hook, stack, and PNG evidence are recorded in \`evidence.json\`.
- Text-size minima are recorded per capture for owner review and accessibility calibration.

## Manual inspection

Automated evidence does not replace original-resolution visual judgment. The bounded catalog review records hierarchy, whitespace, clipping, contrast, signature scale, tier differentiation, dock weight, stack consistency, and state truthfulness.

## Native and live-service ceilings

Native Chrome permission prompts, real Home Assistant actions, live connector data, actual OS timezone changes, genuine sleep/wake, hardware behavior, and real screen-reader output remain manual ceilings.

## Result

${failures.length === 0 ? 'PASS' : `FAIL: ${failures.join('; ')}`}
`

export async function runWidgetRedesignCatalog({ repoRoot, outputDir, captureKeys, exact = false }) {
  const root = resolve(repoRoot)
  const out = resolve(outputDir)
  await mkdir(out, { recursive: true })
  const allCaptures = expectedCatalogCaptures({ targets: TARGET_WIDGETS, mixedStacks: MIXED_STACKS })
  const requested = captureKeys?.length ? new Set(captureKeys) : null
  const captures = requested ? allCaptures.filter(({ key }) => requested.has(key)) : allCaptures
  if (requested && captures.length !== requested.size) throw new Error(`Unknown capture keys: ${[...requested].filter((key) => !captures.some((capture) => capture.key === key)).join(', ')}`)

  const sourceCommit = git(root, ['log', '-1', '--format=%H', '--', 'mockups/widget-redesign'])
  const dirtyStatus = git(root, ['status', '--porcelain'])
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_FILES.map(async (file) => [file, await hashFile(resolve(root, file))])))
  const server = await startCatalogServer({ repoRoot: root })
  const browser = await chromium.launch({ headless: true })
  const results = []
  const failures = []
  try {
    for (const capture of captures) {
      const viewport = captureViewport(capture)
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
      const page = await context.newPage()
      const runtime = { console: [], page: [], failedRequests: [], nonLocalRequests: [] }
      page.on('console', (message) => { if (message.type() === 'error') runtime.console.push(message.text()) })
      page.on('pageerror', (error) => runtime.page.push(error.message))
      page.on('requestfailed', (request) => runtime.failedRequests.push(request.url()))
      page.on('request', (request) => { if (!request.url().startsWith(server.origin)) runtime.nonLocalRequests.push(request.url()) })
      const response = await page.goto(`${server.origin}/mockups/widget-redesign/capture/${encodeURIComponent(capture.key)}`, { waitUntil: 'domcontentloaded' })
      const locator = page.locator(`[data-capture-key="${capture.key}"]`)
      await locator.waitFor()
      const measures = await locator.evaluate((rootNode) => {
        const visible = (node) => { const style = getComputedStyle(node); const box = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0 }
        const frames = [...rootNode.querySelectorAll('[data-tier-frame]')].filter(visible).map((frame) => { const box = frame.getBoundingClientRect(); return { tier: frame.getAttribute('data-tier-frame'), width: box.width, height: box.height } })
        const overflowOwners = [...rootNode.querySelectorAll('*')].filter((node) => {
          if (!visible(node)) return false
          const style = getComputedStyle(node)
          const scrollableX = ['auto', 'scroll'].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1
          const scrollableY = ['auto', 'scroll'].includes(style.overflowY) && node.scrollHeight > node.clientHeight + 1
          return scrollableX || scrollableY
        }).map((node) => node.className || node.tagName).slice(0, 20)
        const text = [...rootNode.querySelectorAll('*')].filter((node) => visible(node) && node.children.length === 0 && node.textContent.trim()).map((node) => ({ tag: node.tagName, size: Number.parseFloat(getComputedStyle(node).fontSize) }))
        const routine = [...rootNode.querySelectorAll('.agenda-row strong, .history-face article p, .work-rows strong, .deployment-face article strong, .sentry-face article strong, .todoist-face article strong, .resource-face article strong, .home-face article strong, .rss-face article strong, blockquote, .tasks-face li span, .quick-link span, .bookmark span, .notes-face p, .calendar-consolidation p')].filter(visible).map((node) => Number.parseFloat(getComputedStyle(node).fontSize))
        const stack = rootNode.querySelector('[data-stack]')
        return {
          frames,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          overflowOwners,
          essentialVisible: [...rootNode.querySelectorAll('[data-essential]')].filter(visible).length,
          textFloor: text.length ? Math.min(...text.map(({ size }) => size)) : null,
          routineFloor: routine.length ? Math.min(...routine) : null,
          stack: stack ? { active: stack.querySelectorAll('[data-stack-active="true"]').length, memberSizes: [...stack.querySelectorAll('[data-stack-member] [data-tier-frame]')].map((frame) => ({ width: getComputedStyle(frame).width, height: getComputedStyle(frame).height })) } : null,
        }
      })
      const geometryFailures = measures.frames.filter(({ tier, width, height }) => tier !== 'docked' && (Math.abs(width - FRAME_SIZES[tier].width) > 0.5 || Math.abs(height - FRAME_SIZES[tier].height) > 0.5))
      const filename = captureFilename(capture)
      const png = await locator.screenshot({ path: resolveOutput(out, filename) })
      const captureFailures = []
      if (response?.status() !== 200) captureFailures.push(`HTTP ${response?.status()}`)
      if (geometryFailures.length) captureFailures.push('geometry')
      if (measures.pageOverflow) captureFailures.push('page overflow')
      if (measures.overflowOwners.length) captureFailures.push('internal overflow')
      if (measures.essentialVisible < 1) captureFailures.push('missing essential')
      if (measures.textFloor !== null && measures.textFloor < 11) captureFailures.push('metadata text floor')
      if (measures.routineFloor !== null && measures.routineFloor < 14) captureFailures.push('routine text floor')
      if (measures.stack && measures.stack.active !== 1) captureFailures.push('stack active count')
      if (Object.values(runtime).some((items) => items.length)) captureFailures.push('runtime or request')
      if (captureFailures.length) failures.push(`${capture.key}: ${captureFailures.join(', ')}`)
      results.push({ key: capture.key, kind: capture.kind, filename, viewport, geometry: measures.frames, textFloor: measures.textFloor, routineFloor: measures.routineFloor, overflowOwners: measures.overflowOwners, essentialVisible: measures.essentialVisible, stack: measures.stack, runtime, png: pngSize(png), failures: captureFailures })
      await context.close()
    }
  } finally {
    await browser.close()
    await server.close()
  }

  const evidence = { version: 1, sourceCommit, dirtyStatus, exact, generatedAt: new Date().toISOString(), sourceHashes, captures: results, failures }
  await writeFile(resolveOutput(out, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await writeFile(resolveOutput(out, 'CATALOG.md'), catalogMarkdown({ sourceCommit, captures: results }), 'utf8')
  await writeFile(resolveOutput(out, 'WIDGET-REDESIGN-MOCKUP-QA.md'), reportMarkdown({ sourceCommit, exact, results, failures }), 'utf8')
  if (exact && failures.length) throw new Error(`Widget redesign catalog failed: ${failures.length} captures`)
  return evidence
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const repoRoot = resolve(import.meta.dirname, '..')
  const exact = process.argv.includes('--exact')
  const scratch = process.argv.includes('--scratch')
  const captureArg = process.argv.find((arg) => arg.startsWith('--capture='))
  const captureKeys = captureArg ? captureArg.slice('--capture='.length).split(',').filter(Boolean) : undefined
  const outputDir = scratch ? resolve(repoRoot, '.qa-widget-redesign-catalog') : resolve(repoRoot, 'docs/superpowers/catalog/widget-redesign/v1')
  const evidence = await runWidgetRedesignCatalog({ repoRoot, outputDir, captureKeys, exact })
  const verdict = evidence.failures.length === 0 ? 'PASS' : 'FAIL'
  process.stdout.write(`${verdict} ${evidence.captures.length} captures, ${evidence.failures.length} failures\n`)
  if (evidence.failures.length) process.exitCode = 1
}
