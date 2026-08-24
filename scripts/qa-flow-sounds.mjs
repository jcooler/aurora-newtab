import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

import { assertCleanTrackedStatus } from './build-contracts.mjs'
import {
  parsePresentationAuthority,
  resolveSfP1BrowserMode,
  resolveSfP1ContextOptions,
} from './qa-shared-frame-p1.mjs'

const SOUNDS = Object.freeze([
  Object.freeze({ id: 'creek', file: 'creek.ogg' }),
  Object.freeze({ id: 'rain', file: 'rain.ogg' }),
  Object.freeze({ id: 'ocean', file: 'ocean.ogg' }),
  Object.freeze({ id: 'forest', file: 'forest.wav' }),
])

function prepareOutput(repoRoot, commit) {
  const parent = resolve(repoRoot, 'artifacts/qa-flow-sounds')
  const output = resolve(parent, commit.slice(0, 7))
  assert.equal(dirname(output).toLowerCase(), parent.toLowerCase(), 'unsafe Flow QA output parent')
  assert.equal(basename(output), commit.slice(0, 7), 'unsafe Flow QA output name')
  if (existsSync(output)) rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  return output
}

function statusLayout(authorityIds) {
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  widgets.status = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier: 'standard', layer: 1 }
  const layout = { id: 'flow-qa', name: 'Flow QA', widgets, stacks: [] }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}

async function initialize(page, authorityIds) {
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  const extensionId = new URL(page.url()).host
  const seedUrl = `chrome-extension://${extensionId}/manifest.json`
  await page.goto(seedUrl, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async ({ layouts }) => {
    const current = await chrome.storage.local.get(null)
    const status = {
      enabled: true,
      services: [{ name: 'Aurora', url: 'https://status.example.test/api/v2/status.json' }],
    }
    const canonical = (input) => {
      if (input === null) return 'null'
      if (typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number') return JSON.stringify(input)
      if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`
      return `{${Object.keys(input).filter((key) => input[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(input[key])}`).join(',')}}`
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`status\n${canonical(status)}`))
    const scope = `status:v1:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
    await chrome.storage.local.set({
      settings: {
        ...current.settings,
        flowAmbience: 'creek',
        flowVolume: 15,
        widgets: { ...current.settings.widgets, status: true },
      },
      timerSession: {
        mode: 'work',
        running: false,
        endsAt: null,
        remainingMs: 25 * 60_000,
        cycles: 0,
        flow: true,
      },
      connectors: { ...current.connectors, status },
      connectorSnapshots: {
        ...current.connectorSnapshots,
        status: {
          scope,
          fetchedAt: Date.now(),
          data: { services: [{ name: 'Aurora', indicator: 'none', description: 'All systems operational' }] },
        },
      },
      photoPrefs: { ...current.photoPrefs, mode: 'gradient' },
      layouts,
    })
  }, { layouts: statusLayout(authorityIds) })
  return { extensionId, seedUrl }
}

async function assertFlowFits(page, label) {
  const result = await page.locator('[data-flow-screen]').evaluate((screen) => {
    const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
    const rect = screen.getBoundingClientRect()
    const controls = screen.querySelector('[data-flow-sound-controls]')?.getBoundingClientRect()
    const visibleControls = [...screen.querySelectorAll('button, select, input')]
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => {
        const box = node.getBoundingClientRect()
        return { name: node.getAttribute('aria-label') ?? node.textContent?.trim(), left: box.left, top: box.top, right: box.right, bottom: box.bottom }
      })
    return {
      viewport,
      screen: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      controls: controls ? { left: controls.left, top: controls.top, right: controls.right, bottom: controls.bottom } : null,
      visibleControls,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
    }
  })
  assert(result.controls, `${label}: Flow sound controls are missing`)
  assert(result.documentWidth <= result.viewport.width + 1, `${label}: horizontal page overflow`)
  assert(result.documentHeight <= result.viewport.height + 1, `${label}: vertical page overflow`)
  for (const control of result.visibleControls) {
    assert(control.left >= -1 && control.right <= result.viewport.width + 1, `${label}: ${control.name} clips horizontally`)
    assert(control.top >= -1 && control.bottom <= result.viewport.height + 1, `${label}: ${control.name} clips vertically`)
  }
  return result
}

async function waitForAudio(page, expectedFile) {
  await page.waitForFunction((file) => {
    const audio = document.querySelector('audio')
    return audio instanceof HTMLAudioElement
      && audio.currentSrc.endsWith(`/sounds/${file}`)
      && audio.readyState >= HTMLMediaElement.HAVE_METADATA
      && Number.isFinite(audio.duration)
      && audio.duration > 0
  }, expectedFile)
  return page.locator('audio').evaluate((audio) => ({
    src: audio.currentSrc,
    duration: audio.duration,
    readyState: audio.readyState,
    paused: audio.paused,
    volume: audio.volume,
  }))
}

async function run() {
  assert(process.argv.includes('--exact'), 'Flow sounds QA requires --exact')
  const repoRoot = resolve(process.cwd())
  const protectedRoot = resolve('D:/DEV/Chrome plugin')
  const dist = resolve(repoRoot, 'dist')
  const topLevel = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repoRoot, encoding: 'utf8' }).trim())
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  assert.equal(topLevel.toLowerCase(), repoRoot.toLowerCase(), 'run Flow QA from the repository root')
  assert.notEqual(repoRoot.toLowerCase(), protectedRoot.toLowerCase(), 'Flow QA refuses the protected checkout')
  assert.equal(branch, 'feat/aurora-2-observatory', 'unexpected Flow QA branch')
  assertCleanTrackedStatus(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }))
  const provenance = JSON.parse(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'))
  assert.equal(provenance.commit, commit, 'dist provenance does not match HEAD')

  const authorityIds = Object.keys(parsePresentationAuthority(
    readFileSync(resolve(repoRoot, 'src/newtab/widgetSizeContracts.ts'), 'utf8'),
  ))
  const output = prepareOutput(repoRoot, commit)
  const profiles = []
  const evidence = { commit, sounds: [], desktop: null, touch: null, status: null, chromeTab: null }
  const errors = []
  const unexpectedRequests = []

  const launch = async (touch = false) => {
    const profile = mkdtempSync(resolve(tmpdir(), touch ? 'aurora-flow-touch-' : 'aurora-flow-desktop-'))
    profiles.push(profile)
    const options = resolveSfP1ContextOptions(resolveSfP1BrowserMode([]), dist)
    return chromium.launchPersistentContext(profile, {
      ...options,
      viewport: touch ? { width: 375, height: 812 } : { width: 1280, height: 800 },
      args: [...options.args, '--autoplay-policy=no-user-gesture-required'],
      ...(touch ? { hasTouch: true } : {}),
    })
  }

  let desktop
  let touch
  try {
    desktop = await launch(false)
    const page = desktop.pages()[0] ?? await desktop.newPage()
    page.setDefaultTimeout(20_000)
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`desktop console: ${message.text()}`) })
    page.on('pageerror', (error) => errors.push(`desktop page: ${error.message}`))
    await desktop.route(/^https?:\/\//, async (route) => {
      unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`)
      await route.abort('blockedbyclient')
    })
    const { seedUrl } = await initialize(page, authorityIds)
    unexpectedRequests.splice(0)
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-flow-screen]').waitFor()
    await page.getByRole('button', { name: 'Resume timer' }).click()

    for (const sound of SOUNDS) {
      await page.getByRole('combobox', { name: 'Flow sound' }).selectOption(sound.id)
      const audio = await waitForAudio(page, sound.file)
      assert.equal(audio.volume, 0.15, `${sound.id}: persisted quiet volume did not reach the audio element`)
      assert.equal(audio.paused, false, `${sound.id}: playback did not start while Flow was running`)
      evidence.sounds.push({ ...sound, ...audio })
    }

    await page.getByRole('slider', { name: 'Flow volume' }).fill('5')
    await page.waitForFunction(() => document.querySelector('audio')?.volume === 0.05)
    evidence.desktop = await assertFlowFits(page, '1280x800')
    await page.screenshot({ path: resolve(output, 'flow-desktop-1280x800.png'), animations: 'disabled' })
    await page.getByRole('button', { name: 'Pause timer' }).click()
    await page.waitForFunction(() => document.querySelector('audio')?.paused === true)
    await page.getByRole('button', { name: 'Resume timer' }).click()
    await page.waitForFunction(() => document.querySelector('audio')?.paused === false)
    await page.getByRole('button', { name: 'End flow' }).click()
    await page.locator('[data-canvas-surface]').waitFor()
    assert.equal(await page.locator('audio').count(), 0, 'Flow audio survived End flow')

    const status = page.locator('[data-block-id="status"]')
    await status.waitFor()
    evidence.status = {
      roleStatus: await status.getByRole('status').count(),
      detailsButtons: await status.getByRole('button', { name: /Service status details/i }).count(),
      dialogs: await page.locator('[data-status-panel]').count(),
    }
    assert.equal(evidence.status.roleStatus, 0, 'free Service status unexpectedly used the Dock role')
    assert.equal(evidence.status.detailsButtons, 0, 'Service status still exposes a Details button')
    assert.equal(evidence.status.dialogs, 0, 'Service status still exposes a details popup')

    const stored = await page.evaluate(() => chrome.storage.local.get(['settings', 'timerSession']))
    assert.equal(stored.settings.flowAmbience, 'forest', 'Flow sound selection did not persist')
    assert.equal(stored.settings.flowVolume, 5, 'Flow volume did not persist')
    assert.equal(stored.timerSession.flow, false, 'End flow did not leave Flow mode')
    assert.deepEqual(unexpectedRequests, [], `Aurora made external request(s): ${JSON.stringify(unexpectedRequests)}`)

    await page.getByRole('button', { name: 'Open Chrome tab' }).click()
    await page.waitForURL('chrome://new-tab-page/')
    evidence.chromeTab = { url: page.url(), auroraCanvas: await page.locator('[data-canvas-surface]').count() }
    assert.equal(evidence.chromeTab.auroraCanvas, 0, 'Chrome-tab shortcut reopened Aurora instead of the native page')
    unexpectedRequests.splice(0)

    touch = await launch(true)
    const touchPage = touch.pages()[0] ?? await touch.newPage()
    touchPage.setDefaultTimeout(20_000)
    touchPage.on('console', (message) => { if (message.type() === 'error') errors.push(`touch console: ${message.text()}`) })
    touchPage.on('pageerror', (error) => errors.push(`touch page: ${error.message}`))
    await touch.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'))
    await initialize(touchPage, authorityIds)
    await touchPage.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await touchPage.locator('[data-flow-screen]').waitFor()
    evidence.touch = await assertFlowFits(touchPage, '375x812 touch')
    await touchPage.getByRole('slider', { name: 'Flow volume' }).tap()
    await touchPage.screenshot({ path: resolve(output, 'flow-touch-375x812.png'), animations: 'disabled' })

    assert.deepEqual(unexpectedRequests, [], `Aurora made external request(s): ${JSON.stringify(unexpectedRequests)}`)
    assert.deepEqual(errors, [], `runtime errors: ${JSON.stringify(errors)}`)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    process.stdout.write(`PASS Flow sounds exact QA: 4 decoded local sounds, pause/resume/end, 1280x800, 375x812 touch, static Status, native Chrome tab\n${output}\n`)
  } finally {
    if (touch) await touch.close().catch(() => {})
    if (desktop) await desktop.close().catch(() => {})
    for (const profile of profiles) rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

await run()
