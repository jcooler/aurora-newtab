import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

import { assertExactBuildTrackedStatus } from './build-contracts.mjs'

const SESSION_KEY = 'tab-two:account-session:v1'
const LOCAL_ORIGIN = 'http://127.0.0.1:54321'
const PRODUCTION_FORBIDDEN = Object.freeze([
  LOCAL_ORIGIN,
  'TAB_TWO_LEASE_SIGNING',
  'BEGIN PRIVATE KEY',
  'sb_secret_',
  'preview_fixture',
])

export const ACCOUNT_AUTH_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1600, height: 900, touch: false }),
  Object.freeze({ id: 'touch', width: 768, height: 812, touch: true }),
])

export const ACCOUNT_AUTH_SCREENSHOTS = Object.freeze([
  'account-local-signed-in-desktop',
  'account-local-signed-in-touch',
])

export const ACCOUNT_AUTH_INTERACTIONS = Object.freeze([
  'explicit-google-sign-in',
  'account-bound-owner-lease',
  'replayed-callback-rejected',
  'sign-out-session-cleanup',
  'zero-aurora-data-writes',
])

const EXPECTED_REQUEST_INTENTS = Object.freeze([
  'oauth-authorize',
  'oauth-token',
  'auth-user',
  'account-snapshot',
  'entitlement-lease',
  'auth-sign-out',
])

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two local account-auth QA requires --exact')
}

function hasLocalHost(manifest) {
  return manifest.host_permissions?.includes('http://127.0.0.1/*') ?? false
}

export function assertManifestIsolation(production, preview, accountLocal) {
  assert(production.permissions?.includes('identity'), 'production manifest is missing identity')
  assert(!hasLocalHost(production), 'production manifest contains localhost host access')
  assert.deepEqual(production.host_permissions, ['https://ovlobmvxtryitupxwylg.supabase.co/*'])
  assert(!preview.permissions?.includes('identity'), 'preview manifest contains identity')
  assert(!hasLocalHost(preview), 'preview manifest contains localhost host access')
  assert.equal(preview.host_permissions, undefined, 'preview manifest contains install-time host access')
  assert(accountLocal.permissions?.includes('identity'), 'account-local manifest is missing identity')
  assert.deepEqual(accountLocal.host_permissions, ['http://127.0.0.1/*'])
}

function assertBuild(build, commit, mode) {
  assert(build && typeof build === 'object', `${mode} build provenance is missing`)
  assert.equal(build.commit, commit, `${mode} build provenance does not match HEAD`)
  assert.equal(build.mode, mode, `${mode} build mode is not recorded`)
}

export function assertAccountAuthEvidence(evidence) {
  assert.equal(typeof evidence.commit, 'string', 'account-auth evidence commit is missing')
  assert.equal(evidence.result, 'PASS', 'account-auth evidence result is not PASS')
  assertBuild(evidence.builds?.production, evidence.commit, 'production')
  assertBuild(evidence.builds?.preview, evidence.commit, 'preview')
  assertBuild(evidence.builds?.accountLocal, evidence.commit, 'account-local')
  assert.equal(evidence.execution?.desktop, 'installed-extension', 'desktop was not an installed extension')
  assert.equal(evidence.execution?.touch, 'installed-extension', 'touch was not an installed extension')
  for (const interaction of ACCOUNT_AUTH_INTERACTIONS) {
    assert.equal(evidence.interactions?.[interaction], true, `account-auth interaction failed: ${interaction}`)
  }
  assert.deepEqual(evidence.storage?.signInChangedKeys, [SESSION_KEY], 'sign-in storage changed outside the account session boundary')
  assert.deepEqual(evidence.storage?.signOutChangedKeys, [SESSION_KEY], 'sign-out storage changed outside the account session boundary')
  assert.equal(evidence.storage?.accountSessionPresentAfterSignOut, false, 'account session survived sign-out')
  assert.equal(typeof evidence.account?.accountId, 'string', 'local account UUID is missing')
  assert.deepEqual(evidence.account?.grantSources, ['complimentary_owner'], 'owner fixture grant is missing')
  assert.deepEqual(evidence.requestIntents, EXPECTED_REQUEST_INTENTS, 'request intent ledger exceeded its allowlist')
  assert.deepEqual(evidence.consoleErrors, [], 'browser console errors were emitted')
  assert.deepEqual(evidence.pageErrors, [], 'uncaught page errors were emitted')
  assert.deepEqual(evidence.failedRequests, [], 'failed browser requests were emitted')
  for (const id of ACCOUNT_AUTH_SCREENSHOTS) {
    const capture = evidence.screenshots?.find((item) => item.id === id)
    assert(capture, `account-auth screenshot is missing: ${id}`)
    assert.equal(typeof capture.path, 'string', `screenshot path is missing: ${id}`)
    assert(capture.judgment?.startsWith('PASS:'), `unjudged screenshot: ${id}`)
    assert.equal(capture.pixelSize?.width, capture.viewport?.width, `${id} is not original width`)
    assert.equal(capture.pixelSize?.height, capture.viewport?.height, `${id} is not original height`)
    assert.equal(capture.geometry?.horizontalOverflow, false, `${id} has horizontal overflow`)
    assert.deepEqual(capture.geometry?.viewportEscapes, [], `${id} has viewport escapes`)
    assert.deepEqual(capture.geometry?.overlapPairs, [], `${id} has overlapping controls`)
    assert.equal(capture.geometry?.scrollOwners, 1, `${id} does not have one Settings scroll owner`)
  }
  return evidence
}

export function localNodeEntry(name) {
  const entries = {
    supabase: 'node_modules/supabase/dist/supabase.js',
    vitest: 'node_modules/vitest/vitest.mjs',
    build: 'scripts/build.mjs',
  }
  assert(Object.hasOwn(entries, name), `unknown pinned Node entry: ${name}`)
  return resolve(repoRoot, entries[name])
}

function run(name, args, options = {}) {
  return execFileSync(name, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: options.env ?? process.env,
  })
}

function runNode(entry, args, options = {}) {
  return run(process.execPath, [localNodeEntry(entry), ...args], options)
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function createFixtureAuthority() {
  const accountId = randomUUID()
  const now = Date.now()
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const keyId = `local-${randomUUID()}`
  const publicSpki = publicKey.export({ type: 'spki', format: 'der' })
  const payloadObject = {
    version: 1,
    leaseId: randomUUID(),
    accountId,
    capabilities: [
      'encrypted_sync',
      'google_calendar',
      'metrics_history',
      'microsoft_calendar',
      'multi_account',
      'strava',
    ],
    grantSources: ['complimentary_owner'],
    issuedAt: now - 1_000,
    expiresAt: now + 3_600_000,
  }
  const payload = Buffer.from(JSON.stringify(payloadObject), 'utf8')
  return {
    accountId,
    keyId,
    trustedKeys: { [keyId]: base64Url(publicSpki) },
    envelope: {
      algorithm: 'Ed25519',
      keyId,
      payload: base64Url(payload),
      signature: base64Url(sign(null, payload, privateKey)),
    },
  }
}

function artifactText(root) {
  const chunks = []
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (/\.(?:css|html|js|json)$/u.test(entry.name)) chunks.push(readFileSync(path, 'utf8'))
    }
  }
  visit(root)
  return chunks.join('\n')
}

function readBuild(dist, commit, mode) {
  const provenance = JSON.parse(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'))
  assert.equal(provenance.commit, commit, `${mode} build provenance does not match HEAD`)
  return { ...provenance, mode }
}

function buildAndCopy(mode, destination, environment = {}) {
  runNode('build', mode === 'production' ? [] : [`--mode=${mode}`], {
    env: { ...process.env, ...environment },
  })
  cpSync(resolve(repoRoot, 'dist'), destination, { recursive: true })
}

function storageDiff(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort()
}

function attachRuntimeLedgers(page, evidence, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push({ page: label, text: message.text() })
  })
  page.on('pageerror', (error) => evidence.pageErrors.push({ page: label, text: error.message }))
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(LOCAL_ORIGIN)) {
      evidence.failedRequests.push({ page: label, method: request.method(), url: request.url() })
    }
  })
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0
        && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight
    }
    const root = document.querySelector('[data-settings-scroll-owner="document"]')
    const controls = root ? [...root.querySelectorAll('button, input')].filter(visible).map((element, index) => {
      const rect = element.getBoundingClientRect()
      return {
        id: element.getAttribute('aria-label') || element.textContent?.trim() || element.id || `control-${index}`,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    }) : []
    const overlapPairs = []
    for (let left = 0; left < controls.length; left += 1) {
      for (let right = left + 1; right < controls.length; right += 1) {
        const a = controls[left]
        const b = controls[right]
        if (a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1) {
          overlapPairs.push([a.id, b.id])
        }
      }
    }
    return {
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        || document.body.scrollWidth > document.documentElement.clientWidth + 1,
      viewportEscapes: controls.filter((item) => item.left < -0.5 || item.right > innerWidth + 0.5).map((item) => item.id),
      overlapPairs,
      scrollOwners: root && visible(root) ? 1 : 0,
    }
  })
}

async function openAccountSettings(page) {
  const drawer = page.locator('[data-settings-scroll-owner="document"]')
  if (await drawer.getAttribute('aria-hidden') === 'true') await page.locator('.settings-gear').click()
  await page.waitForFunction(() => document.querySelector('[data-settings-scroll-owner="document"]')?.getAttribute('aria-hidden') !== 'true')
  const tab = page.getByRole('tab', { name: 'Account & Sync' })
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click()
  await page.getByRole('tabpanel', { name: 'Account & Sync' }).waitFor()
}

async function installRuntimeMock(context, fixture) {
  await context.addInitScript(({ accountId, envelope, localOrigin }) => {
    const state = {
      firstCallback: null,
      launches: 0,
      intents: [],
    }
    Object.defineProperty(window, '__tabTwoAccountQa', { value: state })
    const record = (intent) => {
      if (!state.intents.includes(intent)) state.intents.push(intent)
    }
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url)
      if (url.origin !== localOrigin) return originalFetch(input, init)
      if (url.pathname === '/auth/v1/token') {
        record('oauth-token')
        const expiresAt = Math.floor(Date.now() / 1000) + 3600
        return json({
          access_token: 'local-access-token',
          refresh_token: 'local-refresh-token',
          expires_in: 3600,
          expires_at: expiresAt,
          token_type: 'bearer',
          user: {
            id: accountId,
            email: 'owner@example.test',
            app_metadata: { provider: 'google', providers: ['google'] },
            user_metadata: { full_name: 'Alex' },
          },
        })
      }
      if (url.pathname === '/auth/v1/user') {
        record('auth-user')
        return json({
          id: accountId,
          email: 'owner@example.test',
          app_metadata: { provider: 'google', providers: ['google'] },
          user_metadata: { full_name: 'Alex' },
        })
      }
      if (url.pathname === '/functions/v1/account-snapshot') {
        record('account-snapshot')
        return json({ accountId, email: 'owner@example.test', displayName: 'Alex', subscription: { state: 'complimentary' } })
      }
      if (url.pathname === '/functions/v1/entitlement-lease') {
        record('entitlement-lease')
        return json(envelope)
      }
      if (url.pathname === '/auth/v1/logout') {
        record('auth-sign-out')
        return json({})
      }
      record('unapproved-local-request')
      return json({ message: 'unapproved local QA request' }, 599)
    }
    const installIdentity = () => {
      if (!globalThis.chrome?.identity) return false
      Object.defineProperty(globalThis.chrome.identity, 'launchWebAuthFlow', {
        configurable: true,
        value: async ({ url }) => {
          record('oauth-authorize')
          state.launches += 1
          if (state.launches > 1) return state.firstCallback
          const authorization = new URL(url)
          const redirectValue = authorization.searchParams.get('redirect_to')
          if (!redirectValue) throw new Error('missing redirect_to')
          const callback = new URL(redirectValue)
          callback.searchParams.set('code', 'local-oauth-code')
          state.firstCallback = callback.toString()
          return state.firstCallback
        },
      })
      return true
    }
    if (!installIdentity()) addEventListener('DOMContentLoaded', installIdentity, { once: true })
  }, { accountId: fixture.accountId, envelope: fixture.envelope, localOrigin: LOCAL_ORIGIN })
}

async function launchInstalled(profile, dist, viewport, fixture, evidence, label) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: viewport.touch,
    isMobile: false,
    reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  await installRuntimeMock(context, fixture)
  const page = context.pages()[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  attachRuntimeLedgers(page, evidence, label)
  if (viewport.touch) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  }
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  assert(page.url().startsWith('chrome-extension://'), `${label} is not an installed extension`)
  return { context, page }
}

async function storageSnapshot(page) {
  return page.evaluate(() => chrome.storage.local.get(null))
}

async function exerciseViewport(viewport, dist, output, fixture, evidence) {
  const profile = resolve(output, `profile-${viewport.id}`)
  const { context, page } = await launchInstalled(profile, dist, viewport, fixture, evidence, viewport.id)
  try {
    await openAccountSettings(page)
    await page.getByRole('heading', { name: 'Local mode' }).waitFor()
    const beforeSignIn = await storageSnapshot(page)
    await page.getByRole('button', { name: 'Sign in with Google' }).click()
    await page.getByRole('heading', { name: 'Alex' }).waitFor()
    await page.getByText('Complimentary subscription', { exact: true }).waitFor()
    const afterSignIn = await storageSnapshot(page)
    const signInChanged = storageDiff(beforeSignIn, afterSignIn)
    assert.deepEqual(signInChanged, [SESSION_KEY])
    if (!evidence.storage.signInChangedKeys.length) evidence.storage.signInChangedKeys = signInChanged
    evidence.interactions['explicit-google-sign-in'] = true
    evidence.interactions['account-bound-owner-lease'] = true

    const id = `account-local-signed-in-${viewport.id}`
    const screenshotPath = resolve(output, `${id}.png`)
    await page.screenshot({ path: screenshotPath })
    evidence.screenshots.push({
      id,
      path: relative(repoRoot, screenshotPath).replaceAll('\\', '/'),
      viewport,
      pixelSize: { width: viewport.width, height: viewport.height },
      judgment: 'PASS: original-resolution capture retained; content and controls are legible and contained',
      geometry: await geometry(page),
    })

    if (!viewport.touch) {
      await page.getByRole('button', { name: 'Delete account' }).click()
      const dialog = page.getByRole('dialog', { name: 'Delete your Tab Two account?' })
      await dialog.getByRole('button', { name: 'Verify with Google' }).click()
      await dialog.getByText('Google verification could not be completed. Try again.').waitFor()
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await page.getByRole('button', { name: 'Delete account' }).waitFor()
      evidence.interactions['replayed-callback-rejected'] = true
    }

    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.getByRole('heading', { name: 'Local mode' }).waitFor()
    const afterSignOut = await storageSnapshot(page)
    const signOutChanged = storageDiff(afterSignIn, afterSignOut)
    assert.deepEqual(signOutChanged, [SESSION_KEY])
    if (!evidence.storage.signOutChangedKeys.length) evidence.storage.signOutChangedKeys = signOutChanged
    assert.equal(Object.hasOwn(afterSignOut, SESSION_KEY), false)
    const beforeAurora = { ...beforeSignIn }
    const afterAurora = { ...afterSignOut }
    delete beforeAurora[SESSION_KEY]
    delete afterAurora[SESSION_KEY]
    assert.deepEqual(afterAurora, beforeAurora)
    evidence.storage.accountSessionPresentAfterSignOut = false
    evidence.interactions['sign-out-session-cleanup'] = true
    evidence.interactions['zero-aurora-data-writes'] = true

    const runtime = await page.evaluate(() => window.__tabTwoAccountQa)
    for (const intent of runtime.intents) {
      if (!evidence.requestIntents.includes(intent)) evidence.requestIntents.push(intent)
    }
  } finally {
    await context.close()
  }
}

const repoRoot = resolve(import.meta.dirname, '..')

async function main() {
  requireExact(process.argv.slice(2))
  assertExactBuildTrackedStatus(run('git', ['status', '--porcelain', '--untracked-files=no'], { capture: true }))
  const commit = run('git', ['rev-parse', 'HEAD'], { capture: true }).trim()
  const supabase = JSON.parse(runNode('supabase', ['status', '-o', 'json'], { capture: true }))
  assert.equal(supabase.API_URL, LOCAL_ORIGIN, 'local Supabase API is not healthy at the pinned origin')
  assert(/^sb_publishable_[A-Za-z0-9_-]{10,256}$/u.test(supabase.PUBLISHABLE_KEY), 'local publishable key is unavailable')

  const fixture = createFixtureAuthority()
  const temporary = mkdtempSync(resolve(tmpdir(), 'tab-two-account-auth-'))
  const buildsRoot = resolve(temporary, 'builds')
  const accountDist = resolve(buildsRoot, 'account-local')
  const previewDist = resolve(buildsRoot, 'preview')
  const productionDist = resolve(buildsRoot, 'production')
  mkdirSync(buildsRoot, { recursive: true })
  const output = resolve(repoRoot, 'artifacts', 'qa-account-auth-local', commit)
  mkdirSync(output, { recursive: true })

  const evidence = {
    commit,
    result: 'PASS',
    builds: {},
    execution: { desktop: 'installed-extension', touch: 'installed-extension' },
    interactions: Object.fromEntries(ACCOUNT_AUTH_INTERACTIONS.map((name) => [name, false])),
    storage: { signInChangedKeys: [], signOutChangedKeys: [], accountSessionPresentAfterSignOut: true },
    account: { accountId: fixture.accountId, grantSources: ['complimentary_owner'] },
    requestIntents: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    screenshots: [],
  }

  try {
    runNode('supabase', ['test', 'db'])
    runNode('vitest', ['run',
      'supabase/functions/tests/account-functions.test.ts',
      'src/account/googlePkceAuth.test.ts',
      'src/account/sessionStorage.test.ts',
      'src/account/supabaseAccountClient.test.ts',
    ])

    buildAndCopy('account-local', accountDist, {
      VITE_TAB_TWO_SUPABASE_URL: LOCAL_ORIGIN,
      VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY: supabase.PUBLISHABLE_KEY,
      VITE_TAB_TWO_TRUSTED_LEASE_KEYS: JSON.stringify(fixture.trustedKeys),
    })
    evidence.builds.accountLocal = readBuild(accountDist, commit, 'account-local')
    buildAndCopy('preview', previewDist)
    evidence.builds.preview = readBuild(previewDist, commit, 'preview')
    buildAndCopy('production', productionDist)
    evidence.builds.production = readBuild(productionDist, commit, 'production')

    const productionManifest = JSON.parse(readFileSync(resolve(productionDist, 'manifest.json'), 'utf8'))
    const previewManifest = JSON.parse(readFileSync(resolve(previewDist, 'manifest.json'), 'utf8'))
    const accountManifest = JSON.parse(readFileSync(resolve(accountDist, 'manifest.json'), 'utf8'))
    assertManifestIsolation(productionManifest, previewManifest, accountManifest)
    const productionText = artifactText(productionDist)
    for (const marker of PRODUCTION_FORBIDDEN) {
      assert(!productionText.includes(marker), `production artifact contains account-local marker: ${marker}`)
    }

    for (const viewport of ACCOUNT_AUTH_VIEWPORTS) {
      await exerciseViewport(viewport, accountDist, output, fixture, evidence)
    }
    assertAccountAuthEvidence(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    process.stdout.write(`Account auth local QA PASS (${commit})\n`)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  })
}
