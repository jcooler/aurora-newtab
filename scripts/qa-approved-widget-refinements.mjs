import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import { workFixtures, snapshotScope } from './qa-shared-frame-p2.mjs'
import { parsePresentationAuthority } from './qa-shared-frame-p1.mjs'
import { createMetricsHistoryFixture } from './qa-tab-two-metrics.mjs'
import { assertCleanTrackedStatus } from './build-contracts.mjs'

// Local installed-extension evidence only. All remote requests are intercepted.
assert(process.argv.includes('--exact'), 'requires --exact')
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
assertCleanTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }))
assert.equal(JSON.parse(readFileSync('dist/build-provenance.json', 'utf8')).commit, commit)
const output = resolve('artifacts/qa-approved-widget-refinements', commit, new Date().toISOString().replaceAll(':', '-'))
mkdirSync(output, { recursive: true })
const ids = Object.keys(parsePresentationAuthority(readFileSync('src/newtab/widgetSizeContracts.ts', 'utf8')))
const tiers = Object.fromEntries(['ics', 'weather', 'metrics', 'github', 'jira', 'sentry', 'onThisDay', 'worldClocks', 'links', 'countdown'].map((id) => [id, ['links', 'countdown'].includes(id) ? ['compact', 'standard'] : ['compact', 'standard', 'full']]))
const evidence = { commit, result: 'RUNNING', output, captures: [], failures: [], requests: [], consoleErrors: [], pageErrors: [], interactions: [] }
const only = process.argv.find((arg) => arg.startsWith('--widgets='))?.slice(10).split(',')
const context = await chromium.launchPersistentContext(mkdtempSync(resolve(tmpdir(), 'tab-two-refinements-')), {
  channel: 'chromium', headless: true, viewport: { width: 1408, height: 445 }, deviceScaleFactor: 1,
  timezoneId: 'America/New_York', args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`],
})
await context.route(/^https?:\/\//, async (route) => {
  if (route.request().url() === 'https://api.weather.gov/alerts/active?point=33.749,-84.388') return route.fulfill({ status: 200, contentType: 'application/geo+json', body: '{"type":"FeatureCollection","features":[]}' })
  evidence.requests.push({ method: route.request().method(), url: route.request().url() })
  await route.abort('blockedbyclient')
})
const page = context.pages()[0] ?? await context.newPage()
page.setDefaultTimeout(15000)
page.on('console', (message) => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()) })
page.on('pageerror', (error) => evidence.pageErrors.push(error.message))
await page.clock.install({ time: new Date('2026-08-23T12:00:00-04:00') })

async function capture(key, frame) {
  const measurement = await frame.evaluate((node) => {
    const r = node.getBoundingClientRect()
    const escapes = []
    for (const child of node.querySelectorAll('*')) {
      const s = getComputedStyle(child), b = child.getBoundingClientRect()
      if (!b.width || !b.height || s.visibility === 'hidden' || s.display === 'none' || child.closest('[aria-hidden="true"]') || child.classList.contains('sr-only')) continue
      // Intentional ellipsis is measured by its visible box; hidden content is not counted.
      if (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1) escapes.push({ tag: child.tagName, cls: child.className?.baseVal ?? child.className, text: child.textContent?.slice(0, 60), x: b.x, y: b.y, width: b.width, height: b.height })
    }
    return { width: r.width, height: r.height, scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight, escapes, documentOverflow: document.documentElement.scrollWidth > innerWidth + 1 }
  })
  await frame.screenshot({ path: resolve(output, `${key}.png`) })
  evidence.captures.push({ key, ...measurement })
  if (measurement.scrollWidth > measurement.width + 1 || measurement.scrollHeight > measurement.height + 1 || measurement.escapes.length || measurement.documentOverflow) evidence.failures.push(key)
}

try {
  await page.goto('chrome://newtab/')
  await page.locator('[data-canvas-surface]').waitFor()
  await seedInformationFirstFixtures(page, { contributionDayCount: 365 })
  const base = page.url().split('?')[0], manifest = new URL('/manifest.json', base).href
  const sentry = workFixtures().sentry
  const history = createMetricsHistoryFixture('2026-08-23')
  const initial = await page.evaluate(() => chrome.storage.local.get(null))
  const otd = { dateKey: '08-23', events: Array.from({ length: 8 }, (_, i) => ({ year: 1901 + i, text: `Synthetic history example ${i + 1}: a new public library opens its doors to the community.`, url: 'https://en.wikipedia.org/wiki/Library' })), births: [], deaths: [] }
  for (const [id, supported] of Object.entries(tiers)) {
    if (only && !only.includes(id)) continue
    for (const tier of supported) for (const state of ['normal', 'long', 'empty', 'light', 'blue']) {
      await page.goto(manifest)
      await page.evaluate(async ({ initial, id, tier, state, ids, sentry, sentryScope, otd, otdScope, history }) => {
        const data = structuredClone(initial), snapshots = data.connectorSnapshots
        snapshots.sentry = { fetchedAt: Date.now(), scope: sentryScope, data: sentry.data }
        snapshots.onThisDay = { fetchedAt: Date.now(), scope: otdScope, data: otd }
        data.connectors.sentry = sentry.config
        data.connectors.onThisDay = { enabled: true }
        data.worldClocks = ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Adelaide'].map((zone, i) => ({ zone, label: ['New York', 'London', 'Tokyo', 'Adelaide'][i] }))
        data.countdowns = [{ id: 'launch', name: 'Tab Two launch', date: '2026-09-07' }]
        data.links = ['Mail', 'Calendar', 'Drive', 'Design', 'GitHub', 'Home'].map((title) => ({ id: title, title, url: `https://example.invalid/${title}` }))
        data.metricsHistory = history
        if (state === 'long') {
          snapshots.ics.data.events.forEach((row) => { row.summary = 'Cross-functional planning and accessibility review for the international product launch' })
          snapshots.github.data.prs.forEach((row) => { row.title = 'Review accessibility and error recovery for the international customer experience'; row.repo = 'international-product-team/customer-experience' })
          snapshots.jira.data.issues.forEach((row) => { row.summary = 'Review accessibility and error recovery for the international customer experience' })
          snapshots.sentry.data.issues.forEach((row) => { row.title = 'TypeError: Unable to complete checkout while refreshing the subscription summary' })
          data.worldClocks[0].label = 'San Luis Obispo headquarters'
          data.countdowns[0].name = 'International customer experience and accessibility launch'
          data.links[0].title = 'Product documentation'
          data.weatherCache.locationLabel = 'San Francisco International Airport'
          data.location.label = 'San Francisco International Airport'
        }
        if (state === 'empty') {
          snapshots.ics.data.events = []; snapshots.github.data.prs = []; snapshots.github.data.issues = []; snapshots.github.data.notifications = 0
          snapshots.github.data.contributions = { total: 0, days: [] }
          snapshots.jira.data = { issues: [], counts: {}, dueSoon: [] }; snapshots.sentry.data.issues = []
          snapshots.onThisDay.data.events = []; data.links = []; data.worldClocks = []; data.countdowns = []; data.metricsHistory.buckets = []
          data.weatherCache.hourly = []
        }
        const widgets = Object.fromEntries(ids.map((key) => [key, { kind: 'hidden' }]))
        delete widgets[id]; delete widgets.notes
        data.layouts = { version: 1, activeLayoutId: 'refinements', layouts: [{ id: 'refinements', name: 'Refinements QA', widgets, stacks: [{ id: 'refinements-stack', members: [id, 'notes'], facing: id, anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 1 }] }] }
        data.settings.widgets = Object.fromEntries(Object.keys(data.settings.widgets).map((key) => [key, true]))
        data.settings.panelColor = state === 'light' ? '#e5e7eb' : state === 'blue' ? '#0057b8' : null
        data.settings.muted = true
        data.calendarPreferences = { refinements: { defaultView: tier === 'full' ? 'month' : 'agenda', includePublicHolidays: false } }
        data.photoPrefs = { ...data.photoPrefs, mode: 'gradient' }
        await chrome.storage.local.set(data)
      }, { initial, id, tier, state, ids, sentry, sentryScope: snapshotScope('sentry', sentry.config), otd, otdScope: snapshotScope('onThisDay', { enabled: true }, '2026-08-23'), history })
      await page.goto(`${base}?accountState=active`)
      const frame = page.locator(`[data-stack-active="true"] [data-tier-frame="${tier}"]`).first()
      await frame.waitFor()
      await page.evaluate(() => document.fonts.ready)
      await capture(`${id}-${tier}-${state}`, frame)
      if (state === 'normal' && id === 'ics' && tier === 'standard') {
        await frame.getByRole('tab', { name: 'Month' }).click()
        await frame.locator('[role="tab"][aria-selected="true"]').filter({ hasText: 'Month' }).waitFor()
        await capture('ics-standard-month', frame)
        await frame.getByRole('tab', { name: 'Month' }).press('ArrowLeft')
        await frame.locator('[role="tab"][aria-selected="true"]').filter({ hasText: 'Agenda' }).waitFor()
        evidence.interactions.push('Calendar native pointer and keyboard view selection')
      }
      if (state === 'normal' && id === 'metrics' && tier === 'full') {
        for (const name of ['7d', '30d', '90d', '365d']) {
          await frame.getByRole('button', { name, exact: true }).click()
          await frame.locator('.metrics-interval-bars button').first().focus()
          await frame.getByRole('status').waitFor()
          await capture(`metrics-full-${name}-detail`, frame)
        }
        evidence.interactions.push('Metrics all ranges and keyboard interval details')
      }
    }
    console.log(`Captured ${id}`)
  }
  if (!only) {
    const stack = page.locator('[data-stack-card="refinements-stack"]')
    await stack.focus(); await stack.press('ArrowRight')
    await page.locator('[data-stack-member="notes"][data-stack-active="true"]').waitFor()
    await stack.getByRole('button', { name: 'Previous widget' }).click()
    evidence.interactions.push('Stack keyboard and pointer preserve facing navigation')
    await page.locator('.settings-gear').click()
    await page.getByRole('tab', { name: 'Account & Sync' }).click()
    const account = page.getByRole('tabpanel', { name: 'Account & Sync' })
    await account.getByRole('button', { name: 'Manage billing' }).waitFor()
    const disclosure = account.getByRole('button', { name: /Compare available plans/ })
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'false')
    await page.screenshot({ path: resolve(output, 'account-subscriber.png') })
    await disclosure.focus(); await disclosure.press('Enter')
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'true')
    await page.screenshot({ path: resolve(output, 'account-plan-comparison.png') })
    evidence.interactions.push('Subscriber membership first and keyboard plan disclosure')
  }
  evidence.result = evidence.failures.length || evidence.pageErrors.length || evidence.requests.length ? 'FAIL' : 'PASS'
} catch (error) {
  evidence.result = 'FAIL'; evidence.failures.push(error.stack)
} finally {
  writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  await context.close()
}
console.log(JSON.stringify({ result: evidence.result, output, captures: evidence.captures.length, failures: evidence.failures, requests: evidence.requests.length, pageErrors: evidence.pageErrors.length }))
if (evidence.result !== 'PASS') process.exitCode = 1
