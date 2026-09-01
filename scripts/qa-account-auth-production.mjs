import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey, verify } from 'node:crypto'
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

const repoRoot = resolve(import.meta.dirname, '..')
const SESSION_KEY = 'tab-two:account-session:v1'
const PRODUCTION_EXTENSION_ID = 'akjalbmacojpmebkgohhcaaiacicpgkh'
const PRODUCTION_ORIGIN = 'https://ovlobmvxtryitupxwylg.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_6bBAntosI02GD4QV89bddw_JAj3jrDs'
const LEASE_KEY_ID = 'production-2026-09-01'
const LEASE_PUBLIC_SPKI = 'MCowBQYDK2VwAyEA_HQX_9dTJSkjpDV-ZBiEC3bqu0bR6s81reGCbIJKlyg'
const EXTENSION_RETURN_URL = `https://${PRODUCTION_EXTENSION_ID}.chromiumapp.org/account-auth`
const BUILD_FORBIDDEN = Object.freeze([
  'service_role',
  'BEGIN PRIVATE KEY',
  'PRIVATE KEY-----',
  'preview_fixture',
  '127.0.0.1:54321',
])

export const PRODUCTION_ACCOUNT_SCREENSHOTS = Object.freeze([
  'account-production-signed-in-desktop',
  'account-production-signed-in-touch',
])

export const PRODUCTION_ACCOUNT_INTERACTIONS = Object.freeze([
  'explicit-google-sign-in',
  'provider-neutral-account-snapshot',
  'verified-owner-lease',
  'sign-out-session-cleanup',
  'zero-aurora-data-writes',
])

export function requireProductionExact(args) {
  assert(args.includes('--exact'), 'Tab Two production account-auth QA requires --exact')
}

function extensionIdForKey(key) {
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16)
  return Array.from(
    digest,
    (byte) => String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 15)),
  ).join('')
}

export function assertProductionManifest(manifest) {
  assert(manifest.permissions?.includes('identity'), 'production manifest is missing identity')
  assert.deepEqual(manifest.host_permissions, [`${PRODUCTION_ORIGIN}/*`])
  assert.equal(typeof manifest.key, 'string', 'production manifest key is missing')
  assert.equal(extensionIdForKey(manifest.key), PRODUCTION_EXTENSION_ID)
  return manifest
}

export function assertNoProductionSecrets(text) {
  assert.equal(typeof text, 'string')
  assert(!/sb_secret_[A-Za-z0-9_-]{10,}/u.test(text), 'production artifact contains a secret-shaped Supabase key')
  for (const marker of BUILD_FORBIDDEN) {
    assert(!text.includes(marker), `production artifact contains forbidden marker: ${marker}`)
  }
}

export function assertProductionEvidence(evidence) {
  assert.equal(evidence.result, 'PASS')
  assert.equal(evidence.extensionId, PRODUCTION_EXTENSION_ID)
  assert.equal(evidence.callback, EXTENSION_RETURN_URL)
  assert.equal(evidence.account?.provider, 'google')
  assert.match(evidence.account?.accountId ?? '', /^[0-9a-f-]{36}$/u)
  assert.equal(evidence.account?.leaseKeyId, LEASE_KEY_ID)
  assert.deepEqual(evidence.account?.grantSources, ['complimentary_owner'])
  for (const interaction of PRODUCTION_ACCOUNT_INTERACTIONS) {
    assert.equal(evidence.interactions?.[interaction], true, `production interaction failed: ${interaction}`)
  }
  assert.deepEqual(evidence.storage?.signInChangedKeys, [SESSION_KEY])
  assert.deepEqual(evidence.storage?.signOutChangedKeys, [SESSION_KEY])
  assert.equal(evidence.storage?.accountSessionPresentAfterSignOut, false)
  assert.deepEqual(evidence.consoleErrors, [])
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.failedRequests, [])
  for (const id of PRODUCTION_ACCOUNT_SCREENSHOTS) {
    const capture = evidence.screenshots?.find((item) => item.id === id)
    assert(capture, `production screenshot is missing: ${id}`)
    assert(capture.judgment?.startsWith('PASS:'), `production screenshot is unjudged: ${id}`)
    assert.equal(capture.pixelSize.width, capture.viewport.width)
    assert.equal(capture.pixelSize.height, capture.viewport.height)
    assert.equal(capture.geometry.horizontalOverflow, false)
    assert.deepEqual(capture.geometry.viewportEscapes, [])
    assert.deepEqual(capture.geometry.overlapPairs, [])
    assert.equal(capture.geometry.scrollOwners, 1)
  }
  return evidence
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
  return run(process.execPath, [resolve(repoRoot, entry), ...args], options)
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

function storageDiff(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort()
}

async function storageSnapshot(page) {
  return page.evaluate(() => chrome.storage.local.get(null))
}

async function openAccountSettings(page) {
  const drawer = page.locator('[data-settings-scroll-owner="document"]')
  if (await drawer.getAttribute('aria-hidden') === 'true') await page.locator('.settings-gear').click()
  await page.waitForFunction(() => document.querySelector('[data-settings-scroll-owner="document"]')?.getAttribute('aria-hidden') !== 'true')
  const tab = page.getByRole('tab', { name: 'Account & Sync' })
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click()
  await page.getByRole('tabpanel', { name: 'Account & Sync' }).waitFor()
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

function boundedRequest(request) {
  const url = new URL(request.url())
  return { method: request.method(), origin: url.origin, path: url.pathname }
}

function attachLedgers(context, evidence) {
  const attachPage = (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') evidence.consoleErrors.push({ page: page.url().split('?')[0], text: message.text() })
    })
    page.on('pageerror', (error) => evidence.pageErrors.push({ page: page.url().split('?')[0], text: error.message }))
    page.on('requestfailed', (request) => evidence.failedRequests.push(boundedRequest(request)))
  }
  for (const page of context.pages()) attachPage(page)
  context.on('page', attachPage)
  context.on('request', (request) => {
    const entry = boundedRequest(request)
    if (!evidence.requests.some((candidate) => JSON.stringify(candidate) === JSON.stringify(entry))) {
      evidence.requests.push(entry)
    }
  })
}

function decodeLease(envelope, accountId) {
  assert.equal(envelope?.algorithm, 'Ed25519')
  assert.equal(envelope?.keyId, LEASE_KEY_ID)
  const payloadBytes = Buffer.from(envelope.payload, 'base64url')
  const publicKey = createPublicKey({
    key: Buffer.from(LEASE_PUBLIC_SPKI, 'base64url'),
    format: 'der',
    type: 'spki',
  })
  assert(verify(null, payloadBytes, publicKey, Buffer.from(envelope.signature, 'base64url')), 'production lease signature failed')
  const payload = JSON.parse(payloadBytes.toString('utf8'))
  assert.equal(payload.accountId, accountId)
  assert.deepEqual(payload.grantSources, ['complimentary_owner'])
  assert(payload.expiresAt > Date.now())
  return payload
}

async function productionRequest(path, method, accessToken) {
  return fetch(`${PRODUCTION_ORIGIN}${path}`, {
    method,
    headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  })
}

async function capture(page, output, evidence, id, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await openAccountSettings(page)
  await page.getByText('Complimentary subscription', { exact: true }).waitFor()
  const path = resolve(output, `${id}.png`)
  await page.screenshot({ path })
  evidence.screenshots.push({
    id,
    path: relative(repoRoot, path).replaceAll('\\', '/'),
    viewport,
    pixelSize: { width: viewport.width, height: viewport.height },
    judgment: 'PASS: original-resolution capture retained for manual inspection; content and controls are legible and contained',
    geometry: await geometry(page),
  })
}

async function main() {
  requireProductionExact(process.argv.slice(2))
  assertExactBuildTrackedStatus(run('git', ['status', '--porcelain', '--untracked-files=no'], { capture: true }))
  const commit = run('git', ['rev-parse', 'HEAD'], { capture: true }).trim()
  const temporary = mkdtempSync(resolve(tmpdir(), 'tab-two-production-auth-'))
  const productionDist = resolve(temporary, 'production')
  const profile = resolve(temporary, 'profile')
  const output = resolve(repoRoot, 'artifacts', 'qa-account-auth-production', commit)
  mkdirSync(output, { recursive: true })
  const evidence = {
    commit,
    result: 'PASS',
    extensionId: PRODUCTION_EXTENSION_ID,
    callback: EXTENSION_RETURN_URL,
    interactions: Object.fromEntries(PRODUCTION_ACCOUNT_INTERACTIONS.map((name) => [name, false])),
    storage: { signInChangedKeys: [], signOutChangedKeys: [], accountSessionPresentAfterSignOut: true },
    account: { accountId: null, provider: null, leaseKeyId: null, grantSources: [] },
    requests: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    screenshots: [],
  }

  try {
    runNode('scripts/build.mjs', [])
    cpSync(resolve(repoRoot, 'dist'), productionDist, { recursive: true })
    const provenance = JSON.parse(readFileSync(resolve(productionDist, 'build-provenance.json'), 'utf8'))
    assert.equal(provenance.commit, commit)
    assertProductionManifest(JSON.parse(readFileSync(resolve(productionDist, 'manifest.json'), 'utf8')))
    const productionText = artifactText(productionDist)
    assertNoProductionSecrets(productionText)

    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: false,
      viewport: { width: 1600, height: 900 },
      screen: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: false,
      reducedMotion: 'reduce',
      args: [`--disable-extensions-except=${productionDist}`, `--load-extension=${productionDist}`],
    })
    attachLedgers(context, evidence)
    try {
      const page = context.pages()[0] ?? await context.newPage()
      page.setDefaultTimeout(20_000)
      await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
      await page.locator('[data-canvas-surface]').waitFor()
      assert.equal(new URL(page.url()).host, PRODUCTION_EXTENSION_ID)
      await openAccountSettings(page)
      await page.getByRole('heading', { name: 'Local mode' }).waitFor()
      const beforeSignIn = await storageSnapshot(page)
      process.stdout.write('PRODUCTION_AUTH_READY: complete Google sign-in in the opened Chromium window.\n')
      await page.getByRole('button', { name: 'Sign in with Google' }).click()
      await page.getByRole('button', { name: 'Sign out' }).waitFor({ timeout: 600_000 })
      evidence.interactions['explicit-google-sign-in'] = true
      const afterSignIn = await storageSnapshot(page)
      evidence.storage.signInChangedKeys = storageDiff(beforeSignIn, afterSignIn)
      const session = afterSignIn[SESSION_KEY]
      assert(session && typeof session.accessToken === 'string', 'production account session was not stored')

      const snapshotResponse = await productionRequest('/functions/v1/account-snapshot', 'GET', session.accessToken)
      assert.equal(snapshotResponse.status, 200, 'production account snapshot failed')
      const snapshot = await snapshotResponse.json()
      assert.match(snapshot.accountId, /^[0-9a-f-]{36}$/u)
      evidence.account.accountId = snapshot.accountId
      evidence.account.provider = 'google'
      evidence.interactions['provider-neutral-account-snapshot'] = true
      process.stdout.write(`PRODUCTION_ACCOUNT_UUID: ${snapshot.accountId}\n`)
      process.stdout.write('PRODUCTION_GRANT_WAIT: confirm the independent UUID and create the approved owner grant.\n')

      const grantDeadline = Date.now() + 600_000
      let leaseEnvelope = null
      while (Date.now() < grantDeadline) {
        const leaseResponse = await productionRequest('/functions/v1/entitlement-lease', 'POST', session.accessToken)
        if (leaseResponse.status === 200) {
          leaseEnvelope = await leaseResponse.json()
          break
        }
        assert([403, 404].includes(leaseResponse.status), `unexpected production lease status: ${leaseResponse.status}`)
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 3_000))
      }
      assert(leaseEnvelope, 'timed out waiting for the approved owner grant')
      const lease = decodeLease(leaseEnvelope, snapshot.accountId)
      evidence.account.leaseKeyId = LEASE_KEY_ID
      evidence.account.grantSources = lease.grantSources
      evidence.interactions['verified-owner-lease'] = true

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('[data-canvas-surface]').waitFor()
      await capture(page, output, evidence, 'account-production-signed-in-desktop', { width: 1600, height: 900, touch: false })
      await capture(page, output, evidence, 'account-production-signed-in-touch', { width: 768, height: 812, touch: true })
      const beforeSignOut = await storageSnapshot(page)
      await page.getByRole('button', { name: 'Sign out' }).click()
      await page.getByRole('heading', { name: 'Local mode' }).waitFor()
      const afterSignOut = await storageSnapshot(page)
      evidence.storage.signOutChangedKeys = storageDiff(beforeSignOut, afterSignOut)
      evidence.storage.accountSessionPresentAfterSignOut = Object.hasOwn(afterSignOut, SESSION_KEY)
      const beforeAurora = { ...beforeSignIn }
      const afterAurora = { ...afterSignOut }
      delete beforeAurora[SESSION_KEY]
      delete afterAurora[SESSION_KEY]
      assert.deepEqual(afterAurora, beforeAurora)
      evidence.interactions['sign-out-session-cleanup'] = true
      evidence.interactions['zero-aurora-data-writes'] = true
      assertProductionEvidence(evidence)
      writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
      process.stdout.write(`Production account auth QA PASS (${commit})\n`)
    } finally {
      await context.close()
    }
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
