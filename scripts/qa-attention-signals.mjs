import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

import { assertExactBuildTrackedStatus } from './build-contracts.mjs'
import {
  assertBuildCommit,
  assertNoIntersection,
  assertViewportContained,
  requireExact,
} from './qa-attention-signals-contracts.mjs'
import {
  parsePresentationAuthority,
  resolveSfP1BrowserMode,
  resolveSfP1ContextOptions,
} from './qa-shared-frame-p1.mjs'
import { snapshotScope } from './qa-shared-frame-p2.mjs'

const DESKTOP = Object.freeze({ width: 1600, height: 900 })
const COMPACT = Object.freeze({ width: 375, height: 812 })
const EXPECTED_SUMMARY = '2 items need attention · QA review in 2h'
const SOURCE_SWITCHES = Object.freeze([
  'Upcoming calendar',
  'Assigned work',
  'Deployment failures',
  'Rain',
])

function placement(x, y, tier, layer) {
  return { kind: 'free', anchor: 'center', offsetX: x - 50, offsetY: y - 50, tier, layer }
}

function attentionLayout(authorityIds) {
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  Object.assign(widgets, {
    clock: placement(50, 14, 'standard', 1),
    greeting: placement(25, 42, 'compact', 2),
    ics: placement(18, 72, 'standard', 3),
    github: placement(50, 72, 'standard', 4),
    vercel: placement(82, 72, 'standard', 5),
  })
  const layout = { id: 'attention-qa', name: 'Attention QA', widgets, stacks: [] }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}

function rectFromBox(box) {
  assert(box, 'required browser rectangle is missing')
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
    width: box.width,
    height: box.height,
  }
}

function attachRuntimeAudit(page, evidence) {
  page.on('console', (message) => {
    const value = message.text()
    if (message.type() === 'error' && !value.startsWith('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT')) {
      evidence.consoleErrors.push({ page: page.url(), message: value })
    }
  })
  page.on('pageerror', (error) => evidence.pageErrors.push({ page: page.url(), message: error.message }))
}

async function assertPageHealth(page, label) {
  const health = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    openPanels: document.querySelectorAll('[aria-label="Attention details"]').length,
  }))
  assert(health.scrollWidth <= health.clientWidth + 1, `${label} has horizontal page overflow`)
  return health
}

async function waitForSummary(page) {
  const trigger = page.locator('.aurora-briefing__trigger')
  await trigger.waitFor({ state: 'visible' })
  await page.waitForFunction((summary) => {
    const node = document.querySelector('.aurora-briefing__trigger')
    return node?.textContent?.trim() === summary
  }, EXPECTED_SUMMARY)
  assert.equal((await trigger.textContent())?.trim(), EXPECTED_SUMMARY)
  return trigger
}

async function openWithHover(page, trigger) {
  await page.mouse.move(1, 1)
  await trigger.hover()
  const panel = page.getByRole('region', { name: 'Attention details' })
  await panel.waitFor({ state: 'visible' })
  return panel
}

async function seedFixtures(page, layouts) {
  const now = Date.now() - 1_000
  const eventStart = now + 2 * 60 * 60_000 + 5 * 60_000
  const runtimeScope = { assignments: true, deployments: true }
  const github = {
    enabled: true,
    token: 'QA_GITHUB_TOKEN_DO_NOT_USE',
    username: 'aurora-qa',
    views: { commitGraph: false, pulls: true, issues: true, notifications: false },
  }
  const vercel = {
    enabled: true,
    token: 'QA_VERCEL_TOKEN_DO_NOT_USE',
    username: 'aurora-qa',
    views: { deployments: true, statusSummary: false },
  }
  const ics = {
    enabled: true,
    calendars: [{ name: 'QA Calendar', url: 'https://calendar.example.test/qa.ics' }],
    view: 'upcoming',
    upcomingCount: 3,
    meetLinks: true,
  }
  const githubScope = snapshotScope('github', github, runtimeScope)
  const vercelScope = snapshotScope('vercel', vercel, runtimeScope)
  const icsScope = snapshotScope('ics', ics, { timeZone: 'America/New_York' }, 'v2')

  await page.evaluate(async (fixture) => {
    const current = await chrome.storage.local.get(null)
    await chrome.storage.local.set({
      ...current,
      layouts: fixture.layouts,
      settings: {
        ...current.settings,
        name: 'Jon',
        briefingEnabled: true,
        briefingSources: { calendar: true, assignments: true, deployments: true, rain: true },
        panelColor: null,
        widgets: { ...current.settings.widgets, clocks: true },
      },
      photoPrefs: { ...current.photoPrefs, mode: 'gradient' },
      location: null,
      weatherCache: null,
      connectors: { ...current.connectors, github: fixture.github, vercel: fixture.vercel, ics: fixture.ics },
      connectorSnapshots: {
        ...current.connectorSnapshots,
        github: {
          scope: fixture.githubScope,
          fetchedAt: fixture.now,
          data: {
            prs: [],
            issues: [{ id: 'existing', title: 'Existing assignment', url: 'https://github.com/aurora/qa/issues/1', repo: 'aurora/qa' }],
            notifications: null,
            contributions: null,
            etags: {},
          },
        },
        vercel: {
          scope: fixture.vercelScope,
          fetchedAt: fixture.now,
          data: { deployments: [{ project: 'Aurora preview', state: 'ERROR', url: 'https://vercel.com/aurora/qa/deployments/failed', createdAt: fixture.now - 18 * 60_000 }] },
        },
        ics: {
          scope: fixture.icsScope,
          fetchedAt: fixture.now,
          data: { events: [{ summary: 'QA review', start: fixture.eventStart, end: fixture.eventStart + 30 * 60_000, allDay: false, cal: 0 }] },
        },
      },
      attentionLedger: { version: 1, sources: {} },
    })
  }, { layouts, github, vercel, ics, githubScope, vercelScope, icsScope, now, eventStart })

  return { githubScope, now }
}

async function introduceNewAssignment(page, githubScope) {
  await page.evaluate(async (scope) => {
    const { connectorSnapshots } = await chrome.storage.local.get('connectorSnapshots')
    // Keep the second observation monotonic while remaining behind the
    // minute-level UI clock captured at render time. A provider refresh can
    // legitimately land between clock ticks; this witness is about the
    // resulting observation transition, not wall-clock scheduling.
    const fetchedAt = connectorSnapshots.github.fetchedAt + 1
    await chrome.storage.local.set({
      connectorSnapshots: {
        ...connectorSnapshots,
        github: {
          ...connectorSnapshots.github,
          scope,
          fetchedAt,
          data: {
            ...connectorSnapshots.github.data,
            issues: [
              ...connectorSnapshots.github.data.issues,
              { id: 'new-review', title: 'Review attention evidence', url: 'https://github.com/aurora/qa/issues/2', repo: 'aurora/qa' },
            ],
          },
        },
      },
    })
  }, githubScope)
  await page.waitForFunction(() => Boolean(
    globalThis.chrome && document.querySelector('.aurora-briefing__trigger')?.textContent?.includes('2 items need attention'),
  ))
}

async function exercisePanel(page, output, evidence) {
  const trigger = await waitForSummary(page)
  await trigger.click()
  await page.getByRole('region', { name: 'Attention details' }).waitFor({ state: 'visible' })
  await trigger.click()
  await page.getByRole('region', { name: 'Attention details' }).waitFor({ state: 'detached' })

  let panel = await openWithHover(page, trigger)
  const panelRect = rectFromBox(await panel.boundingBox())
  const clockRect = rectFromBox(await page.getByTestId('canvas-item-clock').boundingBox())
  assertViewportContained(panelRect, DESKTOP)
  assertNoIntersection(panelRect, clockRect, 'Clock')
  await page.screenshot({ path: resolve(output, 'attention-1600x900.png'), animations: 'disabled' })

  const text = (await panel.textContent()) ?? ''
  for (const expected of ['Vercel', 'Aurora preview', 'Failed 18m ago', 'GitHub', 'Review attention evidence', 'aurora/qa', 'Calendar', 'QA review in 2h']) {
    assert(text.includes(expected), `attention context is missing ${expected}`)
  }
  assert.equal(await panel.locator('a[href^="https://github.com/"]').count(), 1, 'GitHub context link is missing')
  assert.equal(await panel.locator('a[href^="https://vercel.com/"]').count(), 1, 'Vercel context link is missing')

  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'detached' })
  assert.equal(await trigger.evaluate((node) => document.activeElement === node), true, 'Escape did not return focus to the attention summary')

  await page.getByRole('button', { name: 'Open settings' }).focus()
  await trigger.focus()
  panel = page.getByRole('region', { name: 'Attention details' })
  await panel.waitFor({ state: 'visible' })
  await page.keyboard.press('Tab')
  assert.equal(await panel.locator('a[href]').first().evaluate((node) => document.activeElement === node), true, 'Tab did not enter attention links')
  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'detached' })

  await openWithHover(page, trigger)
  await page.mouse.click(40, 40)
  await page.getByRole('region', { name: 'Attention details' }).waitFor({ state: 'detached' })

  await trigger.tap()
  panel = page.getByRole('region', { name: 'Attention details' })
  await panel.waitFor({ state: 'visible' })
  await trigger.tap()
  await panel.waitFor({ state: 'detached' })

  evidence.desktop = { summary: EXPECTED_SUMMARY, panelRect, clockRect }
}

async function exerciseSecondTab(context, firstPage, evidence) {
  const secondPage = await context.newPage()
  secondPage.setDefaultTimeout(20_000)
  await secondPage.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await secondPage.locator('[data-canvas-surface]').waitFor()
  const secondTrigger = await waitForSummary(secondPage)
  const firstTrigger = await waitForSummary(firstPage)
  await firstTrigger.tap()
  await firstPage.getByRole('region', { name: 'Attention details' }).waitFor({ state: 'visible' })
  assert.equal(await secondPage.getByRole('region', { name: 'Attention details' }).count(), 0, 'attention panel open state leaked across tabs')
  assert.equal((await secondTrigger.textContent())?.trim(), EXPECTED_SUMMARY)
  await firstTrigger.tap()
  evidence.multiTab = { sameSummary: true, localPanelState: true }
  return secondPage
}

async function exerciseSettings(page, evidence) {
  await page.getByRole('button', { name: 'Open settings' }).click()
  const drawer = page.getByRole('dialog', { name: 'Settings' })
  await drawer.waitFor({ state: 'visible' })
  const observed = {}
  for (const name of SOURCE_SWITCHES) {
    const control = drawer.getByRole('switch', { name })
    assert.equal(await control.getAttribute('aria-checked'), 'true', `${name} was not initially enabled`)
    await control.click()
    await page.waitForFunction((label) => document.querySelector(`[role="switch"][aria-label="${label}"]`)?.getAttribute('aria-checked') === 'false', name)
    observed[name] = ['false']
    await control.click()
    await page.waitForFunction((label) => document.querySelector(`[role="switch"][aria-label="${label}"]`)?.getAttribute('aria-checked') === 'true', name)
    observed[name].push('true')
  }

  const master = drawer.getByRole('switch', { name: 'Greeting helper' })
  await master.click()
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Greeting helper"]')?.getAttribute('aria-checked') === 'false')
  for (const name of SOURCE_SWITCHES) assert.equal(await drawer.getByRole('switch', { name }).count(), 0, `${name} remained visible while the helper was disabled`)
  await master.click()
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Greeting helper"]')?.getAttribute('aria-checked') === 'true')
  for (const name of SOURCE_SWITCHES) await drawer.getByRole('switch', { name }).waitFor({ state: 'visible' })

  await page.evaluate(() => document.querySelector('.aurora-briefing__trigger')?.click())
  const panel = page.getByRole('region', { name: 'Attention details' })
  await panel.waitFor({ state: 'visible' })
  const panelRect = rectFromBox(await panel.boundingBox())
  const drawerRect = rectFromBox(await drawer.boundingBox())
  assertViewportContained(panelRect, DESKTOP)
  assertNoIntersection(panelRect, drawerRect, 'Settings controls')
  await page.evaluate(() => document.querySelector('.aurora-briefing__trigger')?.click())
  await panel.waitFor({ state: 'detached' })
  await drawer.getByRole('button', { name: 'Close settings' }).click()
  await drawer.waitFor({ state: 'hidden' })

  const stored = await page.evaluate(async () => (await chrome.storage.local.get('settings')).settings)
  assert.deepEqual(stored.briefingSources, { calendar: true, assignments: true, deployments: true, rain: true })
  assert.equal(stored.briefingEnabled, true)
  evidence.settings = { sourceTransitions: observed, masterDisable: true, panelRect, drawerRect }
}

async function exerciseCompact(page, output, evidence) {
  await page.setViewportSize(COMPACT)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  const trigger = await waitForSummary(page)
  await page.screenshot({ path: resolve(output, 'attention-compact-width.png'), animations: 'disabled' })
  await trigger.tap()
  const panel = page.getByRole('region', { name: 'Attention details' })
  await panel.waitFor({ state: 'visible' })
  const panelRect = rectFromBox(await panel.boundingBox())
  assertViewportContained(panelRect, COMPACT)
  assert(Math.abs(panelRect.left - 8) <= 1, 'compact attention panel did not use the edge clamp')
  await page.screenshot({ path: resolve(output, 'attention-edge-clamped.png'), animations: 'disabled' })
  await page.screenshot({ path: resolve(output, 'attention-touch-context.png'), animations: 'disabled' })
  evidence.compact = { viewport: COMPACT, panelRect, health: await assertPageHealth(page, 'compact attention view') }
  await trigger.tap()
}

export async function runAttentionSignalsQa(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  const protectedRoot = resolve('D:/DEV/Chrome plugin')
  const topLevel = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repoRoot, encoding: 'utf8' }).trim())
  assert.equal(topLevel.toLowerCase(), repoRoot.toLowerCase(), 'run attention signals QA from the repository root')
  assert.notEqual(repoRoot.toLowerCase(), protectedRoot.toLowerCase(), 'attention signals QA refuses the protected original checkout')
  assertExactBuildTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }))

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const dist = resolve(repoRoot, 'dist')
  const provenance = JSON.parse(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'))
  assertBuildCommit(provenance, commit)
  const authorityIds = Object.keys(parsePresentationAuthority(readFileSync(resolve(repoRoot, 'src/newtab/widgetSizeContracts.ts'), 'utf8')))
  const output = resolve(repoRoot, 'artifacts/qa-attention-signals', commit)
  mkdirSync(output, { recursive: true })
  const profile = mkdtempSync(resolve(tmpdir(), 'aurora-attention-signals-'))
  const evidence = {
    commit,
    provenance,
    startedAt: new Date().toISOString(),
    consoleErrors: [],
    pageErrors: [],
  }
  let context
  let caught
  try {
    const browserMode = resolveSfP1BrowserMode(args.includes('--headed') ? ['--headed'] : [])
    context = await chromium.launchPersistentContext(profile, {
      ...resolveSfP1ContextOptions(browserMode, dist),
      hasTouch: true,
    })
    context.on('page', (candidate) => attachRuntimeAudit(candidate, evidence))
    await context.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'))
    const page = context.pages()[0] ?? await context.newPage()
    attachRuntimeAudit(page, evidence)
    page.setDefaultTimeout(20_000)
    await page.setViewportSize(DESKTOP)
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    const extensionId = new URL(page.url()).host
    const seedUrl = `chrome-extension://${extensionId}/manifest.json`
    await page.goto(seedUrl, { waitUntil: 'domcontentloaded' })
    const fixture = await seedFixtures(page, attentionLayout(authorityIds))
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()

    await page.waitForFunction((observedAt) => new Promise((resolvePromise) => {
      chrome.storage.local.get('attentionLedger').then(({ attentionLedger }) => {
        resolvePromise(attentionLedger?.sources?.github?.observedAt === observedAt)
      })
    }), fixture.now)
    const baseline = await page.evaluate(async () => (await chrome.storage.local.get('attentionLedger')).attentionLedger)
    assert.equal(baseline.sources.github.items.existing.firstSeenAt, null, 'existing assignment was not treated as the baseline')
    await introduceNewAssignment(page, fixture.githubScope)
    await page.waitForFunction(() => new Promise((resolvePromise) => {
      chrome.storage.local.get('attentionLedger').then(({ attentionLedger }) => {
        resolvePromise(Number.isFinite(attentionLedger?.sources?.github?.items?.['new-review']?.firstSeenAt))
      })
    }))
    evidence.baseline = { existingFirstSeenAt: null, newAssignmentObserved: true }

    await exercisePanel(page, output, evidence)
    const secondPage = await exerciseSecondTab(context, page, evidence)
    await exerciseSettings(page, evidence)
    evidence.desktop.health = await assertPageHealth(page, 'desktop attention view')
    await exerciseCompact(page, output, evidence)
    await secondPage.close()

    assert.deepEqual(evidence.consoleErrors, [], 'browser console errors were emitted')
    assert.deepEqual(evidence.pageErrors, [], 'uncaught browser page errors were emitted')
  } catch (error) {
    caught = error
    if (context) {
      const page = context.pages()[0]
      if (page) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: false }).catch(() => {})
    }
  } finally {
    evidence.finishedAt = new Date().toISOString()
    evidence.result = caught ? 'FAIL' : 'PASS'
    evidence.failure = caught instanceof Error ? caught.message : caught ? String(caught) : null
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    if (context) await context.close().catch(() => {})
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    evidence.profileRemoved = !existsSync(profile)
  }
  if (caught) throw caught
  process.stdout.write(`PASS attention signals QA at ${commit}: hover, keyboard, touch, Settings, multi-tab, desktop and compact\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runAttentionSignalsQa()
}
