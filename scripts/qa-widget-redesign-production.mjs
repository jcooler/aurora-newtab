import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

import { MIXED_STACKS, TARGET_WIDGETS } from '../mockups/widget-redesign/catalog-model.mjs'
import { assertCleanTrackedStatus } from './build-contracts.mjs'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import { parsePresentationAuthority, resolveSfP1BrowserMode, resolveSfP1ContextOptions } from './qa-shared-frame-p1.mjs'
import { snapshotScope, workFixtures } from './qa-shared-frame-p2.mjs'

export const APPROVED_TARGET_IDS = Object.freeze(TARGET_WIDGETS.map(({ id }) => id))
export const PRODUCTION_CASES = Object.freeze([
  ...APPROVED_TARGET_IDS.map((target) => Object.freeze({ key: target, kind: 'approved-target', target })),
  ...MIXED_STACKS.map((stack) => Object.freeze({ key: stack.id, kind: 'mixed-stack', members: [...stack.members], tier: stack.tier })),
])

const SOURCE_ID = Object.freeze({ calendar: 'ics' })
const SETTINGS_ID = Object.freeze({ tasks: 'todo' })
const THEMES = Object.freeze([
  Object.freeze({ id: 'dark', panelColor: null }),
  Object.freeze({ id: 'light', panelColor: '#e5e7eb' }),
  Object.freeze({ id: 'saturated', panelColor: '#0057b8' }),
])
const FIXED_TIME = new Date('2026-08-23T12:00:00-04:00')
const EXPECTED_DIMENSIONS = Object.freeze({ compact: [216, 132], standard: [320, 200], full: [460, 284] })

function exactSet(actual, expected, label) {
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), label)
}

export function assertProductionCoverage(cases) {
  exactSet(cases.filter(({ kind }) => kind === 'approved-target').map(({ target }) => target), APPROVED_TARGET_IDS, 'approved target inventory drifted')
  exactSet(cases.filter(({ kind }) => kind === 'mixed-stack').map(({ key }) => key), MIXED_STACKS.map(({ id }) => id), 'required mixed stack inventory drifted')
  return cases
}

export function parseBuildCommit(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { throw new Error('build provenance is not valid JSON') }
  assert.equal(typeof parsed?.commit, 'string', 'build provenance commit is missing')
  assert(parsed.commit.length > 0, 'build provenance commit is empty')
  return parsed.commit
}

function sourceId(id) { return SOURCE_ID[id] ?? id }
function settingsId(id) { return SETTINGS_ID[id] ?? id }

function safeOutputDirectory(repoRoot) {
  const output = resolve(repoRoot, 'docs/superpowers/catalog/widget-redesign/production')
  const expectedParent = resolve(repoRoot, 'docs/superpowers/catalog/widget-redesign')
  assert.equal(dirname(output).toLowerCase(), expectedParent.toLowerCase(), 'unsafe production catalog parent')
  assert.equal(basename(output), 'production', 'unsafe production catalog name')
  if (existsSync(output)) {
    assert(!lstatSync(output).isSymbolicLink(), 'production catalog cannot be a symlink')
    rmSync(output, { recursive: true, force: true })
  }
  mkdirSync(output)
  return output
}

function onThisDayFixture() {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    year: 1901 + index,
    text: `Aurora history witness ${index + 1} with a bounded readable description.`,
    url: `https://en.wikipedia.org/wiki/Aurora_${index + 1}`,
  }))
  return { dateKey: '08-23', events: rows, births: rows.slice(0, 4), deaths: rows.slice(4, 8) }
}

function buildLayouts(authorityIds, stack) {
  const members = stack.members.map(sourceId)
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  for (const member of members) delete widgets[member]
  const layout = {
    id: `production-${stack.id}`,
    name: 'Widget Redesign Production',
    widgets,
    stacks: [{
      id: `stack-production-${stack.id}`,
      members,
      facing: members[0],
      anchor: 'center',
      offsetX: 0,
      offsetY: 0,
      tier: stack.tier,
      layer: 7,
    }],
  }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}

async function inspectFrame(page, stack, activeMember) {
  const stackId = `stack-production-${stack.id}`
  const selector = `[data-stack-card="${stackId}"] [data-stack-member="${sourceId(activeMember)}"][data-stack-active="true"] [data-tier-frame="${stack.tier}"]`
  const frame = page.locator(selector)
  await frame.waitFor()
  const measurement = await frame.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const descendants = [node, ...node.querySelectorAll('*')]
    const visible = descendants.filter((entry) => {
      const style = getComputedStyle(entry)
      const box = entry.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
    })
    const textSizes = visible
      .filter((entry) => (entry.textContent ?? '').trim().length > 0)
      .map((entry) => Number.parseFloat(getComputedStyle(entry).fontSize))
      .filter(Number.isFinite)
    return {
      width: rect.width,
      height: rect.height,
      scrollWidth: node.scrollWidth,
      scrollHeight: node.scrollHeight,
      minTextPx: textSizes.length ? Math.min(...textSizes) : null,
      internalScrollOwners: visible.filter((entry) => /auto|scroll/.test(`${getComputedStyle(entry).overflowX} ${getComputedStyle(entry).overflowY}`)).length,
    }
  })
  const [expectedWidth, expectedHeight] = EXPECTED_DIMENSIONS[stack.tier]
  assert(Math.abs(measurement.width - expectedWidth) <= 1, `${stack.id} ${activeMember} width drifted`)
  assert(Math.abs(measurement.height - expectedHeight) <= 1, `${stack.id} ${activeMember} height drifted`)
  assert(measurement.scrollWidth <= measurement.width + 1, `${stack.id} ${activeMember} clips horizontally`)
  assert(measurement.scrollHeight <= measurement.height + 1, `${stack.id} ${activeMember} clips vertically`)
  assert.equal(measurement.internalScrollOwners, 0, `${stack.id} ${activeMember} added an internal scroll owner`)
  assert(measurement.minTextPx === null || measurement.minTextPx >= 11, `${stack.id} ${activeMember} drops below the 11px text floor`)
  return { selector, measurement }
}

function initEvidenceBoundary() {
  if (location.protocol !== 'chrome-extension:') return
  const writes = []
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') writes.push(Object.keys(changes).sort())
  })
  globalThis.__widgetRedesignProduction = { writes, clear() { writes.splice(0) } }
}

export async function runProductionQa() {
  assertProductionCoverage(PRODUCTION_CASES)
  assert(process.argv.includes('--exact'), 'production QA requires --exact')
  const repoRoot = resolve(process.cwd())
  const protectedRoot = resolve('D:/DEV/Chrome plugin')
  const topLevel = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repoRoot, encoding: 'utf8' }).trim())
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  assert.equal(topLevel.toLowerCase(), repoRoot.toLowerCase(), 'run production QA from the repository root')
  assert.notEqual(repoRoot.toLowerCase(), protectedRoot.toLowerCase(), 'production QA refuses the protected checkout')
  assert.equal(branch, 'feat/aurora-2-observatory', 'unexpected production QA branch')
  assertCleanTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }))
  const dist = resolve(repoRoot, 'dist')
  assert.equal(parseBuildCommit(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8')), commit, 'dist provenance does not match HEAD')

  const authority = parsePresentationAuthority(readFileSync(resolve(repoRoot, 'src/newtab/widgetSizeContracts.ts'), 'utf8'))
  const authorityIds = Object.keys(authority)
  const output = safeOutputDirectory(repoRoot)
  const profile = mkdtempSync(resolve(tmpdir(), 'aurora-widget-production-'))
  const runtimeErrors = []
  const failedRequests = []
  const unexpectedRequests = []
  const captures = []
  let context
  try {
    context = await chromium.launchPersistentContext(profile, resolveSfP1ContextOptions(resolveSfP1BrowserMode([]), dist))
    await context.addInitScript(initEvidenceBoundary)
    const page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(20_000)
    await page.clock.install({ time: FIXED_TIME })
    page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()) })
    page.on('pageerror', (error) => runtimeErrors.push(String(error)))
    page.on('requestfailed', (request) => {
      if (request.url().startsWith('http')) failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`)
    })
    await context.route(/^https?:\/\//, async (route) => {
      unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`)
      await route.abort('blockedbyclient')
    })

    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    await seedInformationFirstFixtures(page, { contributionDayCount: 35 })
    const extensionId = new URL(page.url()).host
    const seedUrl = `chrome-extension://${extensionId}/manifest.json`
    const sentry = workFixtures().sentry
    const onThisDay = { config: { enabled: true }, data: onThisDayFixture() }
    const fixtureScopes = {
      sentry: snapshotScope('sentry', sentry.config),
      onThisDay: snapshotScope('onThisDay', onThisDay.config, '2026-08-23'),
    }

    for (const stack of MIXED_STACKS) {
      for (const theme of THEMES) {
        await page.goto(seedUrl, { waitUntil: 'domcontentloaded' })
        const layouts = buildLayouts(authorityIds, stack)
        await page.evaluate(async ({ stack, theme, layouts, sentry, onThisDay, fixtureScopes }) => {
          const current = await chrome.storage.local.get(null)
          const widgets = Object.fromEntries(Object.keys(current.settings.widgets).map((id) => [id, false]))
          for (const member of stack.members) widgets[member === 'tasks' ? 'todo' : member === 'calendar' ? 'ics' : member] = true
          const connectors = { ...current.connectors, sentry: sentry.config, onThisDay: onThisDay.config }
          const connectorSnapshots = {
            ...current.connectorSnapshots,
            sentry: { scope: fixtureScopes.sentry, fetchedAt: Date.now(), data: sentry.data },
            onThisDay: { scope: fixtureScopes.onThisDay, fetchedAt: Date.now(), data: onThisDay.data },
          }
          await chrome.storage.local.set({
            settings: { ...current.settings, panelColor: theme.panelColor, widgetTextColor: null, widgets },
            connectors,
            connectorSnapshots,
            layouts,
            photoPrefs: { ...current.photoPrefs, mode: 'gradient' },
          })
        }, { stack, theme, layouts, sentry, onThisDay, fixtureScopes })
        await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
        await page.locator('[data-canvas-surface]').waitFor()
        await page.evaluate(() => globalThis.__widgetRedesignProduction?.clear())
        const legacyBefore = await page.evaluate(() => chrome.storage.local.get('layout'))

        for (let index = 0; index < stack.members.length; index += 1) {
          const member = stack.members[index]
          const inspected = await inspectFrame(page, stack, member)
          const filename = `${stack.id}-${theme.id}-${member}.png`
          const path = resolve(output, filename)
          await page.screenshot({ path })
          const metadata = await sharp(path).metadata()
          assert.equal(metadata.width, 1600, `${filename} width drifted`)
          assert.equal(metadata.height, 900, `${filename} height drifted`)
          captures.push({ key: stack.id, theme: theme.id, member, filename, ...inspected.measurement })
          if (index === 0) {
            const card = page.locator(`[data-stack-card="stack-production-${stack.id}"]`)
            await card.hover()
            await card.getByRole('button', { name: 'Next widget' }).click()
          }
        }

        const writes = await page.evaluate(() => globalThis.__widgetRedesignProduction?.writes ?? [])
        assert(writes.length >= 1, `${stack.id} ${theme.id} did not persist its explicit facing change`)
        assert(writes.every((keys) => keys.length === 1 && keys[0] === 'layouts'), `${stack.id} ${theme.id} wrote outside layouts`)
        const legacyAfter = await page.evaluate(() => chrome.storage.local.get('layout'))
        assert.deepEqual(legacyAfter, legacyBefore, `${stack.id} ${theme.id} changed legacy layout storage`)
      }
    }

    assert.equal(
      runtimeErrors.length + failedRequests.length + unexpectedRequests.length,
      0,
      `runtime=${JSON.stringify(runtimeErrors)} failed=${JSON.stringify(failedRequests)} unexpected=${JSON.stringify(unexpectedRequests)}`,
    )
    const evidence = {
      schemaVersion: 1,
      commit,
      buildMode: 'preview evidence; production adapters remain compiled out',
      approvedTargets: APPROVED_TARGET_IDS,
      mixedStacks: MIXED_STACKS,
      captures,
      summary: { captures: captures.length, runtimeErrors: 0, failedRequests: 0, unexpectedRequests: 0 },
    }
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    process.stdout.write(`PASS widget redesign production QA: ${captures.length} mixed-stack captures, ${APPROVED_TARGET_IDS.length} approved targets pinned\n`)
  } finally {
    if (context) await context.close().catch(() => {})
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runProductionQa()
