import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}
const repoRoot = process.cwd()
const dist = resolve('.preview-information-first-p4-dist')
const profileDir = resolve('.playwright-profile-information-first-p4')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/aurora-v1-canvas-implementation-session-prompt/outputs/information-first-pr-p4'
const failureCapture = resolve(outDir, 'pr-p4-failure.png')
const headed = process.argv.includes('--headed')

for (const [path, suffix] of [
  [dist, '.preview-information-first-p4-dist'],
  [profileDir, '.playwright-profile-information-first-p4'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe temporary path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
rmSync(failureCapture, { force: true })

const build = spawnSync(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'),
  'build',
  '--mode',
  'preview',
  '--outDir',
  dist,
  '--emptyOutDir',
], { cwd: repoRoot, encoding: 'utf8' })
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`focused Vite build failed with status ${build.status}`)
}

const allViewports = [
  { width: 375, height: 812 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]
const viewports = process.argv.includes('--single') ? allViewports.slice(0, 1) : allViewports
const identities = [
  ['rss', 'RSS'],
  ['github', 'GitHub'],
  ['gitlab', 'GitLab'],
  ['jira', 'Jira'],
  ['vercel', 'Vercel'],
  ['crypto', 'Crypto'],
  ['calendar', 'Calendar'],
  ['status', 'Status'],
  ['home assistant', 'Home Assistant'],
]
const evidence = {
  packet: 'PR-P4',
  viewports: [],
  runtimeErrors: [],
  failedRequests: [],
  interceptedExternalRequests: [],
  cleanup: {},
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1024, height: 768 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})

// No production endpoint is allowed to receive a request from this proof.
// If a regression initiates one despite fresh/local fixtures, Chromium records
// it and receives a local empty response instead of reaching the network.
await context.route(/^https?:\/\//, async (route) => {
  evidence.interceptedExternalRequests.push(`${route.request().method()} ${route.request().url()}`)
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
})

const page = await context.newPage()
page.setDefaultTimeout(12_000)
page.on('console', (message) => {
  if (message.type() === 'error') evidence.runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => evidence.runtimeErrors.push(`page: ${String(error)}`))
page.on('requestfailed', (request) => {
  if (!request.url().startsWith('chrome-extension://')) {
    evidence.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
  }
})

const waitForCanvas = async () => {
  await page.waitForSelector('main[data-aurora-canvas]')
  await page.waitForSelector('[data-canvas-surface]')
  await page.waitForTimeout(80)
}

const seed = () => page.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings')
  const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
  widgets.search = true

  const rss = {
    enabled: true,
    feeds: ['https://feed.example.test/aurora.xml'],
    shownCount: 6,
  }
  const canonical = (value) => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`rss\n${canonical(rss)}`))
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const now = Date.now()

  await chrome.storage.local.remove(['location', 'weatherCache'])
  await chrome.storage.local.set({
    settings: { ...settings, briefingEnabled: false, widgets },
    connectors: {
      rss,
      github: { enabled: false, token: 'github_pat_fixture', username: 'octocat' },
      gitlab: { enabled: false, token: '', instanceUrl: 'https://gitlab.example.test', username: 'aurora-fixture' },
      jira: { enabled: false, email: 'fixture@example.test', apiToken: 'jira_fixture_token', site: 'fixture.atlassian.net', displayName: 'Aurora Fixture' },
      crypto: { enabled: false, coins: ['bitcoin', 'ethereum'] },
      ics: { enabled: false, calendars: [{ name: 'Studio', url: 'https://calendar.example.test/studio.ics' }] },
      status: { enabled: false, services: [{ name: 'API', url: 'https://status.example.test/api/v2/status.json' }] },
      homeassistant: { enabled: false, instanceUrl: 'https://home.example.test', token: 'ha_fixture_token', locationName: 'Fixture Home', entities: [], actions: [] },
    },
    connectorSnapshots: {
      rss: {
        fetchedAt: now,
        scope: `rss:v1:${hash}`,
        data: [{ source: 'Aurora', title: 'Connector workspace is ready', url: 'https://news.example.test/aurora', publishedAt: now }],
      },
    },
  })
})

const connectorBytes = (id) => page.evaluate(async (connectorId) => {
  const { connectors } = await chrome.storage.local.get('connectors')
  return connectors?.[connectorId]
}, id)

const readGeometry = (settings) => settings.evaluate((dialog) => {
  const rect = (node) => {
    const value = node.getBoundingClientRect()
    return {
      left: Number(value.left.toFixed(2)),
      top: Number(value.top.toFixed(2)),
      right: Number(value.right.toFixed(2)),
      bottom: Number(value.bottom.toFixed(2)),
      width: Number(value.width.toFixed(2)),
      height: Number(value.height.toFixed(2)),
    }
  }
  const header = dialog.querySelector('.settings-sticky-surface')
  if (!(header instanceof HTMLElement)) throw new Error('Connector sticky surface is missing')
  const alphaOf = (color) => {
    const slash = color.match(/\/\s*([\d.]+)\s*\)/)
    if (slash) return Number(slash[1])
    const comma = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)
    return comma ? Number(comma[1]) : 1
  }
  const headerBackground = getComputedStyle(header).backgroundColor
  const nestedScrollOwners = [...dialog.querySelectorAll('*')].filter((node) => {
    const style = getComputedStyle(node)
    return (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1
  })
  const outOfBounds = [...dialog.querySelectorAll('button, input, select, textarea, [role="switch"]')]
    .filter((node) => {
      const value = node.getBoundingClientRect()
      return value.width > 0 && (value.left < -0.5 || value.right > innerWidth + 0.5)
    })
    .map((node) => ({ name: node.getAttribute('aria-label') ?? node.textContent?.trim(), bounds: rect(node) }))
  return {
    dialog: rect(dialog),
    header: rect(header),
    headerBackground,
    headerAlpha: alphaOf(headerBackground),
    drawerBackground: getComputedStyle(dialog).backgroundColor,
    horizontalDocumentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    horizontalDialogOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
    scrollOwner: dialog.getAttribute('data-settings-scroll-owner'),
    scrollable: dialog.scrollHeight > dialog.clientHeight + 1,
    nestedScrollOwners: nestedScrollOwners.map((node) => ({ tag: node.tagName, className: node.className })),
    outOfBounds,
  }
})

let caughtError
try {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await waitForCanvas()
  await seed()

  for (const viewport of viewports) {
    const label = `${viewport.width}x${viewport.height}`
    await page.setViewportSize(viewport)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCanvas()

    await page.getByRole('button', { name: 'Open settings' }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.waitFor()
    await settings.getByRole('tab', { name: 'Connectors' }).click()
    const connectorRegion = settings.getByRole('region', { name: 'Connectors' })
    await connectorRegion.waitFor()

    assert(await connectorRegion.locator('[data-connector-card]').count() === 9, `${label}: not all nine connectors rendered`)
    assert(await connectorRegion.locator('[data-connector-state="configured-visible"]').count() === 1, `${label}: configured-visible summary is not distinct`)
    assert(await connectorRegion.locator('[data-connector-state="configured-hidden"]').count() === 6, `${label}: configured-hidden summaries are not distinct`)
    assert(await connectorRegion.locator('[data-connector-state="unconfigured"]').count() === 1, `${label}: unconfigured summary is not distinct`)
    assert(await connectorRegion.locator('[data-connector-state="reconnect-required"]').count() === 1, `${label}: reconnect summary is not distinct`)

    const reconnect = connectorRegion.getByRole('region', { name: 'GitLab reconnect' })
    await reconnect.waitFor()
    assert(await reconnect.getByLabel('Personal access token').count() === 1, `${label}: reconnect credential field is not immediately visible`)
    assert(await connectorRegion.getByRole('switch', { name: 'Show GitLab on Canvas' }).count() === 0, `${label}: reconnect card exposes visibility`)
    await connectorRegion.getByRole('button', { name: 'Close GitLab editor' }).click()
    const reconnectAction = connectorRegion.getByRole('button', { name: 'Reconnect GitLab' })
    await reconnectAction.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Reconnect GitLab')

    const search = connectorRegion.getByLabel('Search connectors')
    const reached = []
    for (const [query, identity] of identities) {
      await search.fill(query)
      await connectorRegion.getByRole('heading', { name: identity, exact: true }).waitFor()
      assert(await connectorRegion.locator('[data-connector-card]').count() >= 1, `${label}: ${identity} search has no card`)
      reached.push(identity)
    }
    await search.fill('')
    assert(await connectorRegion.locator('[data-connector-card]').count() === 9, `${label}: clearing search did not restore the registry`)

    await search.fill('vercel')
    const setupVercel = connectorRegion.getByRole('button', { name: 'Set up Vercel' })
    await setupVercel.click()
    const vercelSetup = connectorRegion.getByRole('region', { name: 'Vercel setup' })
    await vercelSetup.waitFor()
    await vercelSetup.getByRole('button', { name: 'Cancel' }).click()
    await setupVercel.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Set up Vercel')

    await search.fill('crypto')
    const editCrypto = connectorRegion.getByRole('button', { name: 'Edit Crypto' })
    await editCrypto.click()
    await connectorRegion.getByRole('region', { name: 'Crypto settings' }).waitFor()
    assert(await connectorRegion.locator('[role="region"][aria-label$=" setup"], [role="region"][aria-label$=" settings"], [role="region"][aria-label$=" reconnect"]').count() === 1, `${label}: more than one connector editor is open`)
    await connectorRegion.getByRole('button', { name: 'Close Crypto editor' }).click()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Edit Crypto')

    await search.fill('rss')
    const before = await connectorBytes('rss')
    await page.evaluate(() => {
      window.__auroraP4ConnectorChanges = []
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.connectors) {
          window.__auroraP4ConnectorChanges.push(changes.connectors.newValue?.rss)
        }
      })
    })
    await connectorRegion.getByRole('switch', { name: 'Show RSS on Canvas' }).click()
    await page.waitForFunction(() => chrome.storage.local.get('connectors').then(({ connectors }) => connectors.rss.enabled === false))
    await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Show RSS on Canvas"]')?.getAttribute('aria-checked') === 'false')
    await page.waitForTimeout(100)
    const hidden = await connectorBytes('rss')
    const connectorChanges = await page.evaluate(() => window.__auroraP4ConnectorChanges)
    assert(
      canonical(hidden) === canonical({ ...before, enabled: false }),
      `${label}: hiding RSS changed its configuration: ${canonical({ before, hidden, connectorChanges })}`,
    )
    await connectorRegion.getByRole('switch', { name: 'Show RSS on Canvas' }).click()
    await page.waitForFunction(() => chrome.storage.local.get('connectors').then(({ connectors }) => connectors.rss.enabled === true))
    await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="Show RSS on Canvas"]')?.getAttribute('aria-checked') === 'true')
    await page.waitForTimeout(100)
    const shown = await connectorBytes('rss')
    assert(
      canonical(shown) === canonical(before),
      `${label}: re-showing RSS did not exactly restore its configuration: ${canonical({ before, shown })}`,
    )

    await search.fill('')
    const disclosure = connectorRegion.getByRole('button', { name: 'How connector data is handled' })
    await disclosure.focus()
    await disclosure.press('Enter')
    const privacy = connectorRegion.getByRole('region', { name: 'How connector data is handled' })
    await privacy.waitFor()
    const privacyText = await privacy.innerText()
    for (const phrase of ['plaintext', 'shared or untrusted profile', 'capability URLs', 'omits them', 'Disconnecting', 'clear Aurora']) {
      assert(privacyText.toLowerCase().includes(phrase.toLowerCase()), `${label}: privacy disclosure omitted ${phrase}`)
    }
    for (const secret of ['github_pat_fixture', 'jira_fixture_token', 'ha_fixture_token', 'calendar.example.test/studio.ics']) {
      assert(!(await connectorRegion.innerText()).includes(secret), `${label}: connector secret/capability value entered visible text`)
    }
    await disclosure.press('Enter')

    const geometry = await readGeometry(settings)
    assert(!geometry.horizontalDocumentOverflow, `${label}: document has horizontal overflow`)
    assert(!geometry.horizontalDialogOverflow, `${label}: Settings has horizontal overflow`)
    assert(geometry.scrollOwner === 'document', `${label}: Settings lost its document scroll owner`)
    assert(geometry.nestedScrollOwners.length === 0, `${label}: connector content introduced nested scrolling ${JSON.stringify(geometry.nestedScrollOwners)}`)
    assert(geometry.outOfBounds.length === 0, `${label}: connector control leaves the viewport ${JSON.stringify(geometry.outOfBounds)}`)
    assert(geometry.headerAlpha === 1, `${label}: sticky header alpha ${geometry.headerAlpha} will double-composite into a dark slab`)
    assert(geometry.headerBackground !== geometry.drawerBackground, `${label}: sticky header repaints the translucent Drawer token and recreates the dark slab`)

    const scrollExercise = geometry.scrollable
      ? await settings.evaluate((dialog) => {
          const header = dialog.querySelector('.settings-sticky-surface')
          const before = header?.getBoundingClientRect().top ?? 0
          dialog.scrollTop = Math.min(420, dialog.scrollHeight - dialog.clientHeight)
          const afterScroll = dialog.scrollTop
          const after = header?.getBoundingClientRect().top ?? 0
          return { before, after, afterScroll, dialogTop: dialog.getBoundingClientRect().top }
        })
      : { before: geometry.header.top, after: geometry.header.top, afterScroll: 0, dialogTop: geometry.dialog.top }
    if (geometry.scrollable) {
      assert(scrollExercise.afterScroll > 0, `${label}: Connector Settings did not scroll`)
      assert(scrollExercise.after <= scrollExercise.before, `${label}: Connector header did not become sticky`)
      assert(scrollExercise.after >= scrollExercise.dialogTop - 25, `${label}: sticky header escaped the Drawer`)
      await settings.evaluate((dialog) => { dialog.scrollTop = 0 })
    }

    const capture = resolve(outDir, `${label}-connectors.png`)
    await page.screenshot({ path: capture })
    evidence.viewports.push({
      viewport,
      reached,
      states: { visible: 1, hidden: 6, unconfigured: 1, reconnect: 1 },
      focus: { reconnectClose: true, setupCancel: true, editClose: true },
      visibilityRoundTrip: true,
      privacyKeyboard: true,
      geometry,
      scrollExercise,
      capture,
    })

    await settings.getByRole('button', { name: 'Close settings' }).click()
  }

  assert(evidence.runtimeErrors.length === 0, `runtime errors: ${JSON.stringify(evidence.runtimeErrors)}`)
  assert(evidence.failedRequests.length === 0, `failed requests: ${JSON.stringify(evidence.failedRequests)}`)
} catch (error) {
  caughtError = error
  evidence.error = String(error?.stack ?? error)
  try {
    await page.screenshot({ path: failureCapture })
  } catch {
    // The page may already be unavailable; the structured error remains.
  }
} finally {
  await context.close()
  try {
    rmSync(dist, { recursive: true, force: true })
    rmSync(profileDir, { recursive: true, force: true })
    evidence.cleanup = { distRemoved: true, profileRemoved: true }
  } catch (error) {
    evidence.cleanup = { error: String(error) }
  }
  writeFileSync(resolve(outDir, 'pr-p4-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
}

if (caughtError) throw caughtError
console.log(`PR-P4 Connector probe PASS (${evidence.viewports.length} viewports, ${identities.length} identities each)`)
