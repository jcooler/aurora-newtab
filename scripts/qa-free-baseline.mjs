import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

import { assertExactBuildTrackedStatus } from './build-contracts.mjs'
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'

export const FREE_BASELINE_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1600, height: 900, touch: false }),
  Object.freeze({ id: 'touch', width: 768, height: 812, touch: true }),
])

export const FREE_BASELINE_INTERACTIONS = Object.freeze([
  'settings-seven-tabs',
  'settings-layout',
  'connector-gear-route',
  'keyboard-edit-entry',
  'long-press-edit-entry',
  'drag-cancel-no-write',
  'drag-save-reload',
  'stack-reorder',
  'dock-move',
])

const PROTECTED_KEYS = Object.freeze([
  'layout',
  'settings',
  'connectors',
  'connectorSnapshots',
  'refreshPreferences',
  'photoPrefs',
])

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two free-baseline QA requires --exact')
}

export function assertBuildCommit(provenance, head) {
  assert(provenance && typeof provenance === 'object', 'dist build provenance is missing')
  assert.equal(provenance.commit, head, 'dist provenance does not match HEAD')
  return head
}

export function assertStorageWrites(writes) {
  assert(Array.isArray(writes), 'free-baseline storage-write ledger is missing')
  for (const keys of writes) {
    assert(Array.isArray(keys), 'free-baseline storage-write entry is malformed')
    assert.deepEqual(keys, ['layouts'], `unexpected storage write: ${keys.join(',')}`)
  }
  return writes
}

export function assertEvidenceContract(evidence) {
  assert.equal(typeof evidence.commit, 'string', 'free-baseline evidence commit is missing')
  assertBuildCommit(evidence.provenance, evidence.commit)
  assert.equal(evidence.result, 'PASS', 'free-baseline evidence result is not PASS')
  for (const interaction of FREE_BASELINE_INTERACTIONS) {
    assert.equal(evidence.interactions?.[interaction], true, `free-baseline interaction ${interaction} is missing or failed`)
  }
  assertStorageWrites(evidence.storageWrites)
  assert.deepEqual(evidence.requests, [], `free-baseline made an unexpected request: ${JSON.stringify(evidence.requests)}`)
  assert.deepEqual(evidence.consoleErrors, [], 'free-baseline emitted a browser console error')
  assert.deepEqual(evidence.pageErrors, [], 'free-baseline emitted an uncaught page error')
  assert.deepEqual(evidence.failedRequests, [], 'free-baseline emitted a failed external request')
  assert(Array.isArray(evidence.screenshots), 'free-baseline screenshot evidence is missing')
  for (const viewport of FREE_BASELINE_VIEWPORTS) {
    assert(
      evidence.screenshots.some((capture) => capture.viewport?.id === viewport.id),
      `free-baseline screenshot evidence is missing for ${viewport.id}`,
    )
  }
  for (const capture of evidence.screenshots) {
    assert.equal(typeof capture.path, 'string', `free-baseline screenshot path is missing for ${capture.id}`)
    assert(
      typeof capture.judgment === 'string' && capture.judgment.startsWith('PASS:'),
      `unjudged screenshot: ${capture.id}`,
    )
    assert.equal(capture.geometry?.horizontalOverflow, false, `${capture.id} has horizontal overflow`)
    assert.deepEqual(capture.geometry?.viewportEscapes, [], `${capture.id} has a viewport escape`)
    assert.deepEqual(capture.geometry?.overlapPairs ?? [], [], `${capture.id} has overlapping layout objects`)
  }
  return evidence
}

function attachLedgers(page, ledgers, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') ledgers.consoleErrors.push({ page: label, text: message.text() })
  })
  page.on('pageerror', (error) => ledgers.pageErrors.push({ page: label, text: error.message }))
  page.on('requestfailed', (request) => {
    if (/^https?:/.test(request.url())) {
      ledgers.failedRequests.push({
        page: label,
        method: request.method(),
        url: request.url(),
        error: request.failure()?.errorText ?? 'failed',
      })
    }
  })
}

async function launchContext(profile, dist, viewport, ledgers) {
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
  await context.route(/^https?:\/\//, async (route) => {
    ledgers.requests.push({
      page: viewport.id,
      method: route.request().method(),
      url: route.request().url(),
    })
    await route.abort('blockedbyclient')
  })
  const page = context.pages()[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  attachLedgers(page, ledgers, viewport.id)
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  return { context, page }
}

async function waitForCanvas(page) {
  await page.locator('[data-canvas-surface]').waitFor()
  const background = page.locator('img[data-photo]')
  await background.waitFor()
  await background.evaluate((image) => image.decode())
  await page.waitForFunction(() => {
    const image = document.querySelector('img[data-photo]')
    return image instanceof HTMLImageElement
      && image.complete
      && image.naturalWidth > 0
      && image.classList.contains('opacity-100')
  })
  await page.waitForTimeout(350)
}

async function seedFixture(page) {
  await seedInformationFirstFixtures(page, { contributionDayCount: 35 })
  await page.evaluate(async () => {
    const current = await chrome.storage.local.get([
      'settings', 'connectors', 'connectorSnapshots', 'photoPrefs',
    ])
    const widgets = Object.fromEntries(Object.keys(current.settings.widgets).map((key) => [key, false]))
    widgets.todo = true
    widgets.notes = true
    widgets.timer = true
    const connectors = Object.fromEntries(Object.entries(current.connectors).map(([id, config]) => [
      id,
      { ...config, enabled: id === 'github' },
    ]))
    const day = new Date()
    const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    await chrome.storage.local.set({
      settings: { ...current.settings, name: 'Tab Two QA', muted: true, widgets },
      connectors,
      connectorSnapshots: { github: current.connectorSnapshots.github },
      refreshPreferences: {
        ics: 'manual', status: 'manual', github: 'manual', gitlab: 'manual',
        jira: 'manual', vercel: 'manual', homeassistant: 'manual', rss: 'manual',
        crypto: 'manual', linear: 'manual', sentry: 'manual', todoist: 'manual',
        weather: 'manual',
      },
      photoPrefs: { ...current.photoPrefs, lastRotated: dayKey, locked: true },
      layouts: {
        version: 1,
        activeLayoutId: 'free-baseline',
        layouts: [{
          id: 'free-baseline',
          name: 'Free baseline',
          widgets: {
            clock: { kind: 'free', anchor: 'top-left', offsetX: 2, offsetY: 2, tier: 'compact', layer: 1 },
            github: { kind: 'free', anchor: 'top-right', offsetX: -2, offsetY: 2, tier: 'compact', layer: 2 },
            timer: { kind: 'docked', dock: 'bottom', order: 0, x: 75, tier: 'compact', returnTier: 'compact' },
            greeting: { kind: 'hidden' },
            focus: { kind: 'hidden' },
          },
          stacks: [{
            id: 'qa-stack',
            members: ['tasks', 'notes'],
            facing: 'tasks',
            anchor: 'bottom-left',
            offsetX: 2,
            offsetY: -3,
            tier: 'compact',
            layer: 3,
          }],
        }],
      },
    })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas(page)
}

async function readStorage(page, keys) {
  return page.evaluate((requested) => chrome.storage.local.get(requested), keys)
}

async function armWriteLog(page) {
  await page.evaluate(() => {
    window.__freeBaselineWrites = []
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') window.__freeBaselineWrites.push(Object.keys(changes).sort())
    })
  })
}

async function currentWrites(page) {
  return page.evaluate(() => window.__freeBaselineWrites ?? [])
}

async function harvestWrites(page, evidence) {
  evidence.storageWrites.push(...await currentWrites(page))
}

async function reloadArmed(page, evidence) {
  await harvestWrites(page, evidence)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas(page)
  await armWriteLog(page)
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const objects = [...document.querySelectorAll('[data-canvas-object-id]')]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          id: element.getAttribute('data-canvas-object-id'),
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        }
      })
    const overlapPairs = []
    for (let left = 0; left < objects.length; left += 1) {
      for (let right = left + 1; right < objects.length; right += 1) {
        const a = objects[left]
        const b = objects[right]
        if (a.right > b.left + 0.5 && b.right > a.left + 0.5
          && a.bottom > b.top + 0.5 && b.bottom > a.top + 0.5) {
          overlapPairs.push([a.id, b.id])
        }
      }
    }
    return {
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        || document.body.scrollWidth > document.documentElement.clientWidth + 1,
      viewportEscapes: objects
        .filter((item) => item.left < -0.5 || item.top < -0.5
          || item.right > innerWidth + 0.5 || item.bottom > innerHeight + 0.5)
        .map((item) => item.id),
      overlapPairs,
      objects,
    }
  })
}

async function capture(page, viewport, id, output, judgments, evidence, repoRoot) {
  const path = resolve(output, `${id}.png`)
  await page.screenshot({ path })
  evidence.screenshots.push({
    id,
    viewport,
    path: relative(repoRoot, path).replaceAll('\\', '/'),
    judgment: judgments[id] ?? '_pending_',
    geometry: await geometry(page),
  })
}

async function openSettings(page) {
  const drawer = page.locator('[data-settings-scroll-owner="document"]')
  if (await drawer.getAttribute('aria-hidden') === 'true') await page.locator('.settings-gear').click()
  await page.waitForFunction(() => document.querySelector('[data-settings-scroll-owner="document"]')?.getAttribute('aria-hidden') !== 'true')
  return drawer
}

async function closeSettings(page) {
  const drawer = page.locator('[data-settings-scroll-owner="document"]')
  if (await drawer.getAttribute('aria-hidden') !== 'true') {
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.querySelector('[data-settings-scroll-owner="document"]')?.getAttribute('aria-hidden') === 'true')
  }
}

async function enterEditWithKeyboard(page) {
  await page.keyboard.press('Control+Shift+E')
  await page.getByRole('toolbar', { name: 'Edit layout' }).waitFor()
}

async function saveEdit(page) {
  const toolbar = page.getByRole('toolbar', { name: 'Edit layout' })
  await toolbar.getByRole('button', { name: 'Save' }).click()
  await toolbar.waitFor({ state: 'detached' })
}

async function dragBy(page, locator, dx, dy) {
  const box = await locator.boundingBox()
  assert(box, 'drag target has no bounding box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(180)
}

async function exerciseDesktop(page, viewport, output, judgments, evidence, repoRoot) {
  const protectedBefore = await readStorage(page, PROTECTED_KEYS)
  await armWriteLog(page)

  await openSettings(page)
  const tabs = await page.getByRole('tab').allTextContents()
  assert.deepEqual(tabs, ['General', 'Progress', 'Widgets', 'Connectors', 'Data', 'Account & Sync', 'Help'])
  evidence.interactions['settings-seven-tabs'] = true
  await page.getByRole('tab', { name: 'Widgets' }).click()
  await page.getByRole('region', { name: 'Layout' }).waitFor()
  evidence.interactions['settings-layout'] = true
  await capture(page, viewport, 'desktop-settings-layout', output, judgments, evidence, repoRoot)
  await closeSettings(page)

  const github = page.locator('[data-canvas-object-id="github"]')
  await github.hover()
  await page.getByRole('button', { name: 'GitHub settings' }).click()
  await page.waitForFunction(() => (
    [...document.querySelectorAll('[role="tab"]')]
      .some((tab) => tab.textContent === 'Connectors' && tab.getAttribute('aria-selected') === 'true')
  ))
  await page.waitForFunction(() => Boolean(document.activeElement?.closest('[data-settings-anchor="github"]')))
  evidence.interactions['connector-gear-route'] = true
  await closeSettings(page)

  await enterEditWithKeyboard(page)
  evidence.interactions['keyboard-edit-entry'] = true
  await page.getByRole('button', { name: 'Cancel' }).click()

  const clock = page.locator('[data-canvas-object-id="clock"]')
  const cancelStoredBefore = await readStorage(page, ['layouts'])
  const cancelBoxBefore = await clock.boundingBox()
  const cancelWritesBefore = await currentWrites(page)
  await enterEditWithKeyboard(page)
  await dragBy(page, clock, 140, 70)
  const cancelBoxMoved = await clock.boundingBox()
  assert(cancelBoxBefore && cancelBoxMoved && (cancelBoxBefore.x !== cancelBoxMoved.x || cancelBoxBefore.y !== cancelBoxMoved.y), 'cancel drag did not move Clock')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(180)
  assert.deepEqual(await readStorage(page, ['layouts']), cancelStoredBefore, 'cancel drag wrote layouts')
  assert.deepEqual(await currentWrites(page), cancelWritesBefore, 'cancel drag emitted a storage write')
  const cancelBoxAfter = await clock.boundingBox()
  assert(cancelBoxBefore && cancelBoxAfter && Math.abs(cancelBoxBefore.x - cancelBoxAfter.x) < 1 && Math.abs(cancelBoxBefore.y - cancelBoxAfter.y) < 1, 'cancel drag did not restore Clock')
  evidence.interactions['drag-cancel-no-write'] = true

  await enterEditWithKeyboard(page)
  await dragBy(page, clock, 120, 60)
  const savedBoxBeforeReload = await clock.boundingBox()
  await saveEdit(page)
  const savedPlacement = (await readStorage(page, ['layouts'])).layouts.layouts[0].widgets.clock
  await reloadArmed(page, evidence)
  assert.deepEqual((await readStorage(page, ['layouts'])).layouts.layouts[0].widgets.clock, savedPlacement)
  const savedBoxAfterReload = await clock.boundingBox()
  assert(
    savedBoxBeforeReload && savedBoxAfterReload
      && Math.abs(savedBoxBeforeReload.x - savedBoxAfterReload.x) < 1
      && Math.abs(savedBoxBeforeReload.y - savedBoxAfterReload.y) < 1,
    `saved Clock geometry did not survive reload: placement=${JSON.stringify(savedPlacement)} before=${JSON.stringify(savedBoxBeforeReload)} after=${JSON.stringify(savedBoxAfterReload)}`,
  )
  evidence.interactions['drag-save-reload'] = true

  await enterEditWithKeyboard(page)
  await page.locator('[data-canvas-object-id="stack:qa-stack"]').click({ force: true })
  const stackInspector = page.getByRole('dialog', { name: /inspector$/ })
  await stackInspector.waitFor()
  await stackInspector.getByRole('button', { name: 'Move Notes earlier' }).click()
  await saveEdit(page)
  const reorderedMembers = (await readStorage(page, ['layouts'])).layouts.layouts[0].stacks[0].members
  assert.deepEqual(reorderedMembers, ['notes', 'tasks'])
  evidence.interactions['stack-reorder'] = true

  const dockBefore = (await readStorage(page, ['layouts'])).layouts.layouts[0].widgets.timer.x
  await enterEditWithKeyboard(page)
  const timer = page.locator('nav[aria-label="Bottom bar"] [data-canvas-object-id="timer"]')
  await dragBy(page, timer, -150, 0)
  await saveEdit(page)
  const dockAfter = (await readStorage(page, ['layouts'])).layouts.layouts[0].widgets.timer.x
  assert.notEqual(dockAfter, dockBefore, 'dock move did not update Timer x')
  evidence.interactions['dock-move'] = true

  await reloadArmed(page, evidence)
  const reloadedLayout = (await readStorage(page, ['layouts'])).layouts.layouts[0]
  assert.deepEqual(reloadedLayout.stacks[0].members, reorderedMembers, 'stack reorder did not survive reload')
  assert.equal(reloadedLayout.widgets.timer.x, dockAfter, 'dock move did not survive reload')
  assert.equal(
    await page.locator('nav[aria-label="Bottom bar"] [data-canvas-object-id="timer"]').count(),
    1,
    'moved dock member did not render after reload',
  )

  await harvestWrites(page, evidence)
  assertStorageWrites(evidence.storageWrites)
  assert.deepEqual(await readStorage(page, PROTECTED_KEYS), protectedBefore, 'free-baseline interactions changed a protected authority')
  await capture(page, viewport, 'desktop-canvas', output, judgments, evidence, repoRoot)
}

async function exerciseTouch(page, context, viewport, output, judgments, evidence, repoRoot) {
  await armWriteLog(page)
  await openSettings(page)
  assert.deepEqual(
    await page.getByRole('tab').allTextContents(),
    ['General', 'Progress', 'Widgets', 'Connectors', 'Data', 'Account & Sync', 'Help'],
  )
  await capture(page, viewport, 'touch-settings-tabs', output, judgments, evidence, repoRoot)
  await page.getByRole('tab', { name: 'Widgets' }).click()
  const layout = page.getByRole('region', { name: 'Layout' })
  await layout.waitFor()
  await layout.scrollIntoViewIfNeeded()
  await capture(page, viewport, 'touch-settings-layout', output, judgments, evidence, repoRoot)
  await closeSettings(page)

  const clock = page.locator('[data-canvas-object-id="clock"]')
  const box = await clock.boundingBox()
  assert(box, 'touch-device Clock has no bounding box')
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
  })
  await page.waitForTimeout(550)
  await page.getByRole('toolbar', { name: 'Edit layout' }).waitFor()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(50)
  assert.equal(
    await page.getByRole('combobox', { name: 'Edited layout' }).evaluate((select) => document.activeElement === select),
    false,
    'touch release activated the newly rendered Layout selector',
  )
  evidence.interactions['long-press-edit-entry'] = true
  await capture(page, viewport, 'touch-long-press', output, judgments, evidence, repoRoot)
  await page.getByRole('button', { name: 'Cancel' }).click()
  assert.deepEqual(await currentWrites(page), [], 'touch-device Settings or long press wrote storage')
}

function readJudgments(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

export async function runFreeBaselineQa(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  const dist = resolve(repoRoot, 'dist')
  assertExactBuildTrackedStatus(execFileSync(
    'git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' },
  ))
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  let provenance
  try {
    provenance = JSON.parse(readFileSync(resolve(dist, 'build-provenance.json'), 'utf8'))
  } catch {
    provenance = undefined
  }
  assertBuildCommit(provenance, commit)

  const output = resolve(repoRoot, 'artifacts/qa-free-baseline', commit)
  mkdirSync(output, { recursive: true })
  const judgments = readJudgments(resolve(output, 'judgments.json'))
  const evidence = {
    commit,
    provenance,
    result: 'FAIL',
    interactions: Object.fromEntries(FREE_BASELINE_INTERACTIONS.map((name) => [name, false])),
    storageWrites: [],
    requests: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    screenshots: [],
  }
  const ledgers = {
    requests: evidence.requests,
    consoleErrors: evidence.consoleErrors,
    pageErrors: evidence.pageErrors,
    failedRequests: evidence.failedRequests,
  }
  const desktopProfile = mkdtempSync(resolve(tmpdir(), 'tab-two-free-desktop-'))
  const touchProfile = mkdtempSync(resolve(tmpdir(), 'tab-two-free-touch-'))
  let desktopContext
  let touchContext

  try {
    const desktop = await launchContext(desktopProfile, dist, FREE_BASELINE_VIEWPORTS[0], ledgers)
    desktopContext = desktop.context
    await seedFixture(desktop.page)
    await exerciseDesktop(desktop.page, FREE_BASELINE_VIEWPORTS[0], output, judgments, evidence, repoRoot)

    const touch = await launchContext(touchProfile, dist, FREE_BASELINE_VIEWPORTS[1], ledgers)
    touchContext = touch.context
    await seedFixture(touch.page)
    await exerciseTouch(touch.page, touch.context, FREE_BASELINE_VIEWPORTS[1], output, judgments, evidence, repoRoot)

    evidence.result = 'PASS'
    assertEvidenceContract(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`PASS: Tab Two free-baseline QA (${commit})`)
    return evidence
  } catch (error) {
    evidence.result = 'FAIL'
    evidence.failure = String(error?.stack ?? error)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    throw error
  } finally {
    await touchContext?.close()
    await desktopContext?.close()
    for (const profile of [desktopProfile, touchProfile]) {
      assert(profile.startsWith(tmpdir()), `unsafe free-baseline QA profile path: ${profile}`)
      rmSync(profile, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runFreeBaselineQa()
}
