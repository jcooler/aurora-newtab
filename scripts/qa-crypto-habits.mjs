import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

import { assertCleanTrackedStatus } from './build-contracts.mjs'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'
import { parsePresentationAuthority, resolveSfP1BrowserMode, resolveSfP1ContextOptions } from './qa-shared-frame-p1.mjs'

const FIXED_TIME = new Date('2026-08-23T12:00:00-04:00')
const VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'common', width: 1600, height: 900 }),
  Object.freeze({ id: 'exact-short', width: 1408, height: 445 }),
])
const SCENARIOS = Object.freeze([
  Object.freeze({ id: 'crypto-compact', widget: 'crypto', tier: 'compact', width: 216, height: 132, rows: 1 }),
  Object.freeze({ id: 'crypto-standard', widget: 'crypto', tier: 'standard', width: 320, height: 200, rows: 4 }),
  Object.freeze({ id: 'habits-compact', widget: 'habits', tier: 'compact', width: 216, height: 132, rows: 4 }),
])
const MARKET_ROWS = Object.freeze([
  Object.freeze({ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 102400, price_change_percentage_24h: 2.4 }),
  Object.freeze({ id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3900, price_change_percentage_24h: -1.1 }),
  Object.freeze({ id: 'solana', symbol: 'sol', name: 'Solana', current_price: 180, price_change_percentage_24h: 4.2 }),
  Object.freeze({ id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', current_price: 0.1234, price_change_percentage_24h: 0 }),
  Object.freeze({ id: 'cardano', symbol: 'ada', name: 'Cardano', current_price: 0.95, price_change_percentage_24h: -0.7 }),
])

function prepareOutput(repoRoot, commit) {
  const parent = resolve(repoRoot, 'artifacts/qa-crypto-habits')
  const output = resolve(parent, commit.slice(0, 7))
  assert.equal(dirname(output).toLowerCase(), parent.toLowerCase(), 'unsafe QA output parent')
  assert.equal(basename(output), commit.slice(0, 7), 'unsafe QA output name')
  if (existsSync(output)) rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  return output
}

function layoutFor(authorityIds, scenario) {
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  widgets[scenario.widget] = {
    kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: scenario.tier, layer: 1,
  }
  const layout = { id: `qa-${scenario.id}`, name: scenario.id, widgets, stacks: [] }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}

async function measureFrame(frame) {
  return frame.evaluate((root) => {
    const frameRect = root.getBoundingClientRect()
    const visible = [root, ...root.querySelectorAll('*')].filter((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    })
    const clipped = visible.flatMap((node) => {
      const rect = node.getBoundingClientRect()
      const outside = rect.left < frameRect.left - 1 || rect.right > frameRect.right + 1
        || rect.top < frameRect.top - 1 || rect.bottom > frameRect.bottom + 1
      if (!outside) return []
      return [{ tag: node.tagName.toLowerCase(), text: (node.textContent ?? '').trim().slice(0, 50), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }]
    })
    const internalScrollOwners = visible.flatMap((node) => {
      if (node === root) return []
      const style = getComputedStyle(node)
      return /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`) ? [node.tagName.toLowerCase()] : []
    })
    const textRuns = visible.flatMap((node) => {
      const ownText = [...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent ?? '')
        .join(' ')
        .trim()
      if (!ownText) return []
      return [{ text: ownText.slice(0, 50), fontSize: Number.parseFloat(getComputedStyle(node).fontSize) }]
    })
    return {
      frame: { width: frameRect.width, height: frameRect.height },
      scroll: { width: root.scrollWidth, height: root.scrollHeight },
      clipped,
      internalScrollOwners,
      textRuns,
    }
  })
}

async function seedScenario(page, seedUrl, authorityIds, scenario) {
  await page.goto(seedUrl, { waitUntil: 'domcontentloaded' })
  const layouts = layoutFor(authorityIds, scenario)
  await page.evaluate(async ({ layouts, scenario, marketRows }) => {
    const current = await chrome.storage.local.get(null)
    const widgets = Object.fromEntries(Object.keys(current.settings.widgets).map((id) => [id, false]))
    widgets.crypto = scenario.widget === 'crypto'
    widgets.habits = scenario.widget === 'habits'
    const cryptoConfig = { enabled: true, coins: marketRows.map(({ id }) => id) }
    const canonical = (value) => {
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
      return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`crypto\n${canonical(cryptoConfig)}`))
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const today = '2026-08-23'
    await chrome.storage.local.set({
      settings: { ...current.settings, panelColor: null, widgetTextColor: null, widgets },
      connectors: { ...current.connectors, crypto: cryptoConfig },
      connectorSnapshots: {
        ...current.connectorSnapshots,
        crypto: {
          fetchedAt: Date.now(), scope: `crypto:v1:${hash}`,
          data: { coins: marketRows.map((row) => ({ id: row.id, symbol: row.symbol, name: row.name, price: row.current_price, change24h: row.price_change_percentage_24h })) },
        },
      },
      habits: [
        { id: 'water', name: 'Water', createdAt: 1, log: [] },
        { id: 'walk', name: 'Walk', createdAt: 2, log: [today] },
        { id: 'read', name: 'Read', createdAt: 3, log: [today] },
        { id: 'journal', name: 'Journal', createdAt: 4, log: [] },
        { id: 'stretch', name: 'Stretch', createdAt: 5, log: [] },
        { id: 'sleep', name: 'Sleep', createdAt: 6, log: [] },
      ],
      layouts,
      photoPrefs: { ...current.photoPrefs, mode: 'gradient' },
    })
  }, { layouts, scenario, marketRows: MARKET_ROWS })
}

async function run() {
  assert(process.argv.includes('--exact'), 'Crypto/Habits QA requires --exact')
  const repoRoot = resolve(process.cwd())
  const protectedRoot = resolve('D:/DEV/Chrome plugin')
  const topLevel = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repoRoot, encoding: 'utf8' }).trim())
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  assert.equal(topLevel.toLowerCase(), repoRoot.toLowerCase(), 'run QA from the repository root')
  assert.notEqual(repoRoot.toLowerCase(), protectedRoot.toLowerCase(), 'QA refuses the protected checkout')
  assert.equal(branch, 'feat/aurora-2-observatory', 'unexpected QA branch')
  assertCleanTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }))
  const provenance = JSON.parse(readFileSync(resolve(repoRoot, 'dist/build-provenance.json'), 'utf8'))
  assert.equal(provenance.commit, commit, 'dist provenance does not match HEAD')

  const authority = parsePresentationAuthority(readFileSync(resolve(repoRoot, 'src/newtab/widgetSizeContracts.ts'), 'utf8'))
  const output = prepareOutput(repoRoot, commit)
  const profile = mkdtempSync(resolve(tmpdir(), 'aurora-crypto-habits-'))
  const errors = []
  const unexpectedRequests = []
  const evidence = []
  let context
  try {
    context = await chromium.launchPersistentContext(profile, resolveSfP1ContextOptions(resolveSfP1BrowserMode([]), resolve(repoRoot, 'dist')))
    const page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(20_000)
    await page.clock.install({ time: FIXED_TIME })
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', (error) => errors.push(String(error)))
    await context.route(/^https?:\/\//, async (route) => {
      const request = route.request()
      if (request.method() === 'GET' && request.url().startsWith('https://api.coingecko.com/api/v3/coins/markets?')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MARKET_ROWS) })
        return
      }
      if (request.method() === 'GET' && request.url() === 'https://api.weather.gov/alerts/active?point=33.749,-84.388') {
        await route.fulfill({ status: 200, contentType: 'application/geo+json', body: '{"type":"FeatureCollection","features":[]}' })
        return
      }
      unexpectedRequests.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    })

    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-canvas-surface]').waitFor()
    await seedInformationFirstFixtures(page)
    const extensionId = new URL(page.url()).host
    const seedUrl = `chrome-extension://${extensionId}/manifest.json`

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      for (const scenario of SCENARIOS) {
        await seedScenario(page, seedUrl, Object.keys(authority), scenario)
        await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
        await page.locator('[data-canvas-surface]').waitFor()
        const frame = page.locator(`[data-block-id="${scenario.widget}"] [data-tier-frame="${scenario.tier}"]`)
        await frame.waitFor()
        const measurement = await measureFrame(frame)
        assert(Math.abs(measurement.frame.width - scenario.width) <= 0.5, `${scenario.id} ${viewport.id} width drifted`)
        assert(Math.abs(measurement.frame.height - scenario.height) <= 0.5, `${scenario.id} ${viewport.id} height drifted`)
        assert(measurement.scroll.width <= scenario.width + 1, `${scenario.id} ${viewport.id} overflows horizontally`)
        assert(measurement.scroll.height <= scenario.height + 1, `${scenario.id} ${viewport.id} overflows vertically`)
        assert.deepEqual(measurement.clipped, [], `${scenario.id} ${viewport.id} clips descendants`)
        assert.deepEqual(measurement.internalScrollOwners, [], `${scenario.id} ${viewport.id} adds an internal scroll owner`)
        assert(measurement.textRuns.every(({ fontSize }) => fontSize >= 11), `${scenario.id} ${viewport.id} drops below the 11px text floor`)
        const rowSelector = scenario.widget === 'crypto' ? '[data-crypto-row]' : '[data-habits-grid] button'
        assert.equal(await frame.locator(rowSelector).count(), scenario.rows, `${scenario.id} ${viewport.id} row count drifted`)

        let interaction = null
        if (scenario.widget === 'habits' && viewport.id === 'common') {
          const water = frame.getByRole('button', { name: 'Water' })
          assert.equal(await water.getAttribute('aria-pressed'), 'false', 'Water starts pressed')
          await water.click()
          await frame.locator('button[aria-pressed="true"]', { hasText: 'Water' }).waitFor()
          assert.equal(await water.getAttribute('aria-pressed'), 'true', 'Water did not toggle')
          const stored = await page.evaluate(() => chrome.storage.local.get('habits'))
          assert(stored.habits.find((habit) => habit.id === 'water').log.includes('2026-08-23'), 'Water toggle did not persist today')
          assert.equal(await page.locator('[data-editing="true"], .canvas-item--editing, .canvas-item--selected').count(), 0, 'Habit toggle entered canvas edit mode')
          interaction = 'Water toggled and persisted'
          await water.blur()
        }
        const filename = `${scenario.id}-${viewport.id}.png`
        if (viewport.id === 'common') {
          await page.mouse.move(0, 0)
          await frame.screenshot({ path: resolve(output, filename), animations: 'disabled' })
        }
        evidence.push({ scenario: scenario.id, viewport: viewport.id, measurement, interaction })
      }
    }
    assert.deepEqual(unexpectedRequests, [], `unexpected requests: ${JSON.stringify(unexpectedRequests)}`)
    assert.deepEqual(errors, [], `runtime errors: ${JSON.stringify(errors)}`)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify({ commit, chromium: context.browser()?.version(), evidence }, null, 2)}\n`, 'utf8')
    process.stdout.write(`PASS Crypto/Habits exact QA: ${evidence.length} measurements, 3 close captures, persisted habit interaction\n${output}\n`)
  } finally {
    if (context) await context.close().catch(() => {})
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

await run()
