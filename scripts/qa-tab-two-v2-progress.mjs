import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

import { assertExactBuildTrackedStatus } from './build-contracts.mjs'

export const PROGRESS_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1600, height: 900, touch: false }),
  Object.freeze({ id: 'short', width: 1408, height: 600, touch: false }),
  Object.freeze({ id: 'ultrawide', width: 3440, height: 1440, touch: false }),
  Object.freeze({ id: 'mobile', width: 375, height: 812, touch: true }),
])

export const PROGRESS_INTERACTIONS = Object.freeze([
  'settings-navigation',
  'empty-state',
  'add',
  'edit',
  'validation',
  'increment',
  'complete',
  'reset',
  'reorder',
  'delete',
  'habit-bridge',
  'reload-persistence',
  'cross-tab-freshness',
  'stale-control-safety',
  'stack-face',
  'overflow-route',
  'mobile-overflow-route',
  'retry-recovery',
  'local-midnight-rollover',
  'keyboard-access',
  'reduced-motion',
])

export function requireExact(args) {
  assert(args.includes('--exact'), 'Tab Two Progress QA requires --exact')
}

export function assertBuildCommit(provenance, head) {
  assert(provenance && typeof provenance === 'object', 'dist build provenance is missing')
  assert.equal(provenance.commit, head, 'dist provenance does not match HEAD')
  return head
}

export function assertNoUnexpectedRequests(requests) {
  assert.deepEqual(requests, [], `Progress QA made an unexpected external request: ${JSON.stringify(requests)}`)
  return requests
}

export function isSettingsDrawerOpen(ariaHidden) {
  return ariaHidden !== 'true'
}

export function assertProgressControlMetrics(targets, { minimum = 0, requiredName } = {}) {
  assert(Array.isArray(targets), 'Progress control metrics are missing')
  const required = requiredName ? targets.find((target) => target.name === requiredName) : undefined
  if (requiredName) assert(required, `${requiredName} control metric is missing`)
  for (const target of targets) {
    const label = target.name || 'Progress control'
    assert(target.width > 0 && target.height > 0, `${label} is not laid out`)
    assert(target.width >= minimum && target.height >= minimum, `${label} is below the ${minimum}px control floor`)
    assert(target.opacity > 0, `${label} is transparent`)
    assert.equal(target.painted, true, `${label} is not painted`)
    assert.equal(target.disabled, false, `${label} is disabled`)
    assert.equal(target.operable, true, `${label} is not operable at its center point`)
  }
  return required ?? targets
}

function overlaps(left, right, tolerance = 0.5) {
  return left.right > right.left + tolerance
    && right.right > left.left + tolerance
    && left.bottom > right.top + tolerance
    && right.bottom > left.top + tolerance
}

export function analyzeCanvasGeometry({ viewport, document, frames }) {
  const collisionPairs = []
  for (let left = 0; left < frames.length; left += 1) {
    for (let right = left + 1; right < frames.length; right += 1) {
      if (overlaps(frames[left], frames[right])) collisionPairs.push([frames[left].id, frames[right].id])
    }
  }
  const viewportEscapes = frames
    .filter((frame) => frame.left < -0.5
      || frame.top < -0.5
      || frame.right > viewport.width + 0.5
      || frame.bottom > viewport.height + 0.5)
    .map((frame) => frame.id)
  const horizontalOverflow = document.scrollWidth > document.clientWidth + 1
    || document.bodyScrollWidth > document.clientWidth + 1
  return { collisionPairs, viewportEscapes, horizontalOverflow }
}

export function assertSettingsGeometry(geometry, { closed = false } = {}) {
  assert(geometry.scrollOwners.length <= 1, 'Progress Settings nested a vertical scroll owner')
  if (geometry.scrollOwners.length === 1) {
    assert.equal(geometry.scrollOwners[0], 'settings', 'Progress Settings nested a vertical scroll owner')
  }
  assert(geometry.documentWidth <= geometry.viewport.width + 1, 'Progress Settings introduced page-level horizontal overflow')
  assert(geometry.drawerScrollWidth <= geometry.drawerClientWidth + 1, 'Progress Settings introduced horizontal overflow')
  if (!closed) {
    assert(geometry.rect.left >= -0.5 && geometry.rect.top >= -0.5, 'Progress Settings escaped the viewport')
    assert(geometry.rect.right <= geometry.viewport.width + 0.5, 'Progress Settings escaped the viewport')
    assert(geometry.rect.bottom <= geometry.viewport.height + 0.5, 'Progress Settings escaped the viewport')
  } else {
    assert.equal(geometry.closed.ariaHidden, 'true', 'closed Settings lost aria-hidden')
    assert.equal(geometry.closed.inert, true, 'closed Settings lost inert')
    assert.equal(geometry.closed.pointerEvents, 'none', 'closed Settings can receive pointer events')
    assert.equal(geometry.closed.hitInside, false, 'closed Settings surface received a hit')
  }
  return geometry
}

export function assertEvidenceContract(evidence) {
  assert.equal(typeof evidence.commit, 'string', 'evidence commit is missing')
  assert.equal(evidence.result, 'PASS', 'evidence result is not PASS')
  for (const interaction of PROGRESS_INTERACTIONS) {
    assert.equal(evidence.interactions?.[interaction], true, `Progress interaction ${interaction} is missing or failed`)
  }
  for (const label of ['retry-storage-recovery', 'retry-authority-isolation']) {
    assert.equal(
      evidence.storageAssertions?.some((entry) => entry.label === label && entry.passed === true),
      true,
      `Progress ${label} evidence is missing or failed`,
    )
  }
  assertProgressControlMetrics([evidence.retryControlMetric], { minimum: 36, requiredName: 'Retry' })
  assertProgressControlMetrics([evidence.mobileOpenProgressMetric], { minimum: 36, requiredName: 'Open Progress' })
  assert.equal(evidence.viewports?.length, PROGRESS_VIEWPORTS.length, 'Progress viewport evidence is incomplete')
  for (let index = 0; index < PROGRESS_VIEWPORTS.length; index += 1) {
    const expected = PROGRESS_VIEWPORTS[index]
    const actual = evidence.viewports[index]
    assert.deepEqual(actual?.viewport, expected, `Progress viewport evidence is missing for ${expected.id}`)
    assert(Array.isArray(actual.storageAssertions) && actual.storageAssertions.length > 0, `${expected.id} storage assertions are missing`)
    assert(actual.storageAssertions.every((entry) => entry.passed === true), `${expected.id} has a failed storage assertion`)
    assert(Array.isArray(actual.controlAssertions) && actual.controlAssertions.length > 0, `${expected.id} mobile control assertions are missing`)
    assert(actual.controlAssertions.every((entry) => entry.passed === true), `${expected.id} has a failed control assertion`)
    assert.equal(typeof actual.focusTarget, 'string', `${expected.id} focus target is missing`)
    assert(Array.isArray(actual.bounds) && actual.bounds.length >= 2, `${expected.id} bounds are incomplete`)
    assert(Array.isArray(actual.collisionPairs), `${expected.id} collision pairs are missing`)
    assert(Array.isArray(actual.requestLedger), `${expected.id} request ledger is missing`)
    assert(Array.isArray(actual.consoleLedger), `${expected.id} console ledger is missing`)
    assert(Array.isArray(actual.pageErrors), `${expected.id} page-error ledger is missing`)
    assert.equal(typeof actual.screenshotPath, 'string', `${expected.id} screenshot path is missing`)
  }
  return evidence
}

function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function highestResolutionPhoto(repoRoot) {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'src/services/photos/photos.json'), 'utf8'))
  let selected = null
  manifest.forEach((photo, index) => {
    if (!photo.original) return
    const pixels = photo.width * photo.height
    if (!selected || pixels > selected.pixels) selected = { index, pixels, ...photo }
  })
  assert(selected, 'bundled photo manifest has no original-resolution image')
  return selected
}

async function seedProgressFixture(page, { goals, habits, photoIndex, stack = false }) {
  await page.evaluate(async ({ goals, habits, photoIndex, stack }) => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    widgets.notes = true
    widgets.progress = true
    const now = new Date()
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const base = {
      id: stack ? 'progress-stack-acceptance' : 'progress-free-acceptance',
      name: stack ? 'Progress stack acceptance' : 'Progress free acceptance',
      widgets: stack ? {} : {
        progress: { kind: 'free', anchor: 'top-left', offsetX: 14, offsetY: 20, tier: 'compact', layer: 1 },
        notes: { kind: 'free', anchor: 'bottom-right', offsetX: -14, offsetY: -18, tier: 'compact', layer: 2 },
      },
    }
    if (stack) {
      base.stacks = [{
        id: 'progress-stack', members: ['progress', 'notes'], facing: 'progress',
        anchor: 'center', offsetX: 0, offsetY: 12, tier: 'compact', layer: 1,
      }]
    }
    await chrome.storage.local.set({
      settings: { ...settings, muted: true, widgets },
      photoPrefs: { mode: 'auto', index: photoIndex, lastRotated: day, locked: true },
      progressGoals: goals,
      habits,
      notes: { text: 'Progress acceptance notes', updatedAt: Date.now() },
      layouts: { version: 1, activeLayoutId: base.id, layouts: [base] },
    })
  }, { goals, habits, photoIndex, stack })
}

async function readStorage(page, keys) {
  return page.evaluate(async (requested) => chrome.storage.local.get(requested), keys)
}

async function waitForStorage(page, keys, predicate, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const value = await readStorage(page, keys)
    if (predicate(value)) return value
    await page.waitForTimeout(50)
  }
  assert.fail(`Progress storage did not settle after ${label}`)
}

function attachPageLedgers(page, ledgers, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') ledgers.console.push({ page: label, text: message.text() })
  })
  page.on('pageerror', (error) => ledgers.pageErrors.push({ page: label, text: error.message }))
}

async function waitForCanvas(page) {
  await page.locator('[data-canvas-surface]').waitFor()
  const background = page.locator('img[data-photo]')
  await background.waitFor()
  await background.evaluate((image) => image.decode())
  await page.waitForFunction(() => {
    const image = document.querySelector('img[data-photo]')
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.classList.contains('opacity-100')
  })
  await page.waitForTimeout(250)
}

async function openProgressSettings(page) {
  const drawer = page.locator('[role="dialog"][aria-label="Settings"]')
  if (await drawer.getAttribute('aria-hidden') === 'true') await page.locator('.settings-gear').click()
  await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="Settings"]')?.getAttribute('aria-hidden') !== 'true')
  await page.getByRole('tab', { name: 'Progress' }).click()
  await page.getByRole('heading', { name: 'Keep what matters moving.' }).waitFor()
}

async function closeSettings(page) {
  const drawer = page.locator('[role="dialog"][aria-label="Settings"]')
  if (isSettingsDrawerOpen(await drawer.getAttribute('aria-hidden'))) {
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="Settings"]')?.getAttribute('aria-hidden') === 'true')
  }
}

async function armOneShotProgressWriteFailure(page) {
  await page.evaluate(() => {
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local)
    const writes = []
    let armed = true
    globalThis.__auroraProgressQaWrites = writes
    chrome.storage.local.set = async (items) => {
      const keys = Object.keys(items).sort()
      const rejected = armed && Object.hasOwn(items, 'progressGoals')
      writes.push({ keys, rejected })
      if (rejected) {
        armed = false
        throw new Error('forced Progress QA write failure')
      }
      return originalSet(items)
    }
  })
}

async function exerciseRetryRecovery(page, evidence) {
  const authorityKeys = ['attentionLedger', 'connectorSnapshots', 'focus', 'habits', 'settings']
  const before = await readStorage(page, ['progressGoals', ...authorityKeys])
  const beforeValue = before.progressGoals[0]?.today.value
  assert.equal(typeof beforeValue, 'number', 'Progress retry fixture value is missing')
  await armOneShotProgressWriteFailure(page)

  await page.getByTestId('progress-canvas-row').first().click()
  await page.getByText('Progress was not saved. Try again.').waitFor()
  let stored = await readStorage(page, ['progressGoals'])
  assert.equal(stored.progressGoals[0]?.today.value, beforeValue, 'failed Progress write changed storage')

  const retryTargets = (await progressTargetMetrics(page)).filter((target) => target.name === 'Retry')
  const retry = assertProgressControlMetrics(retryTargets, { minimum: 36, requiredName: 'Retry' })
  await page.getByRole('button', { name: 'Retry' }).click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => (
    progressGoals[0]?.today.value === beforeValue + 1
  ), 'canvas Retry recovery')
  await page.getByText('Progress was not saved. Try again.').waitFor({ state: 'detached' })

  const after = await readStorage(page, authorityKeys)
  for (const key of authorityKeys) assert.deepEqual(after[key], before[key], `Retry changed unrelated ${key} authority`)
  const writes = await page.evaluate(() => globalThis.__auroraProgressQaWrites)
  assert.deepEqual(writes, [
    { keys: ['progressGoals'], rejected: true },
    { keys: ['progressGoals'], rejected: false },
  ], 'Retry did not isolate recovery writes to progressGoals')
  evidence.storageAssertions.push(
    { label: 'retry-storage-recovery', passed: stored.progressGoals[0]?.today.value === beforeValue + 1 },
    { label: 'retry-authority-isolation', passed: true },
  )
  evidence.retryControlMetric = retry
  evidence.interactions['retry-recovery'] = true
}

async function exerciseMobileOverflowRoute(page, evidence) {
  const firstRow = page.getByTestId('progress-canvas-row').first()
  await firstRow.focus()
  const openProgress = assertProgressControlMetrics(
    (await progressTargetMetrics(page)).filter((target) => target.name === 'Open Progress'),
    { minimum: 36, requiredName: 'Open Progress' },
  )
  await page.getByRole('button', { name: 'Open Progress' }).click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-settings-anchor') === 'progress-overview')
  assert.equal(await page.getByRole('tab', { name: 'Progress' }).getAttribute('aria-selected'), 'true')
  evidence.mobileOpenProgressMetric = openProgress
  evidence.interactions['mobile-overflow-route'] = true
  await closeSettings(page)
}

async function settingsGeometry(page) {
  return page.locator('[role="dialog"][aria-label="Settings"]').evaluate((drawer) => {
    const rect = drawer.getBoundingClientRect()
    const visible = (node) => {
      const box = node.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    }
    const scrollOwners = [drawer, ...drawer.querySelectorAll('*')]
      .filter((node) => {
        if (!visible(node)) return false
        const style = getComputedStyle(node)
        return /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1
      })
      .map((node) => node === drawer ? 'settings' : node.getAttribute('data-testid') ?? node.tagName.toLowerCase())
    const pointX = Math.max(0, Math.min(window.innerWidth - 1, rect.left + Math.max(1, rect.width / 2)))
    const pointY = Math.max(0, Math.min(window.innerHeight - 1, rect.top + Math.max(1, rect.height / 2)))
    const hit = document.elementFromPoint(pointX, pointY)
    return {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      documentWidth: document.documentElement.scrollWidth,
      drawerClientWidth: drawer.clientWidth,
      drawerScrollWidth: drawer.scrollWidth,
      scrollOwners,
      closed: {
        ariaHidden: drawer.getAttribute('aria-hidden'),
        inert: drawer.hasAttribute('inert'),
        pointerEvents: getComputedStyle(drawer).pointerEvents,
        hitInside: hit instanceof Node && drawer.contains(hit),
      },
    }
  })
}

async function canvasGeometry(page) {
  return page.evaluate(() => {
    const frames = [...document.querySelectorAll('[data-canvas-surface] .canvas-item')]
      .filter((node) => {
        const rect = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })
      .map((node, index) => {
        const rect = node.getBoundingClientRect()
        return {
          id: node.getAttribute('data-canvas-object-id') ?? node.getAttribute('data-block-id') ?? `frame-${index}`,
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          width: rect.width, height: rect.height,
        }
      })
    return {
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      },
      frames,
    }
  })
}

async function progressTargetMetrics(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-progress-presentation] button, [data-settings-anchor="progress-overview"] button')]
    .filter((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    })
    .map((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      const opacity = Number.parseFloat(style.opacity)
      const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2))
      const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2))
      const hit = document.elementFromPoint(centerX, centerY)
      return {
        name: node.getAttribute('aria-label') ?? node.textContent?.trim() ?? '',
        width: rect.width,
        height: rect.height,
        opacity,
        painted: rect.width > 0 && rect.height > 0
          && style.visibility !== 'hidden' && style.visibility !== 'collapse'
          && style.display !== 'none' && style.contentVisibility !== 'hidden'
          && opacity > 0,
        disabled: node instanceof HTMLButtonElement && node.disabled,
        operable: style.pointerEvents !== 'none' && hit !== null && (hit === node || node.contains(hit)),
      }
    }))
}

async function captureViewport({ page, viewport, evidence, output, highestPhoto, requestLedger, consoleLedger, pageErrors }) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await waitForCanvas(page)
  const geometry = await canvasGeometry(page)
  const analysis = analyzeCanvasGeometry(geometry)
  assert(geometry.frames.length >= 2, `${viewport.id} did not render two widget frames for pairwise collision coverage`)
  assert.deepEqual(analysis.collisionPairs, [], `${viewport.id} rendered colliding widget frames`)
  assert.deepEqual(analysis.viewportEscapes, [], `${viewport.id} rendered a widget outside the viewport`)
  assert.equal(analysis.horizontalOverflow, false, `${viewport.id} introduced horizontal overflow`)

  const photo = await page.locator('img[data-photo]').evaluate((image) => ({
    src: image.getAttribute('src'), naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
  }))
  assert.equal(photo.naturalWidth, highestPhoto.width, `${viewport.id} did not use the highest-resolution bundled background`)
  assert.equal(photo.naturalHeight, highestPhoto.height, `${viewport.id} did not use the highest-resolution bundled background`)
  assert.match(photo.src ?? '', new RegExp(highestPhoto.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const focusTarget = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="progress-canvas-row"]')
    if (!(row instanceof HTMLButtonElement)) throw new Error('Progress canvas keyboard target is missing')
    row.focus()
    return document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName.toLowerCase() ?? ''
  })
  assert.match(focusTarget, /Manual|Habit/, `${viewport.id} did not retain keyboard focus on a Progress action`)

  const targets = await progressTargetMetrics(page)
  assertProgressControlMetrics(targets, {
    minimum: viewport.touch ? 36 : 0,
    requiredName: 'Open Progress',
  })

  const storage = await readStorage(page, ['progressGoals', 'habits'])
  const screenshotPath = resolve(output, `progress-${viewport.width}x${viewport.height}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  const record = {
    viewport,
    storageAssertions: [
      { label: 'manual-goal-fixture-present', passed: storage.progressGoals.some((goal) => goal.name === 'Hydrate') },
      { label: 'habit-fixture-present', passed: storage.habits.length >= 3 },
      { label: 'highest-resolution-photo', passed: photo.naturalWidth === highestPhoto.width && photo.naturalHeight === highestPhoto.height },
    ],
    controlAssertions: [
      { label: 'progress-controls-painted-operable', passed: targets.every((target) => target.painted && target.operable && !target.disabled) },
      { label: 'open-progress-visible-after-row-focus', passed: targets.some((target) => target.name === 'Open Progress' && target.opacity > 0) },
      { label: 'mobile-control-floor', passed: !viewport.touch || targets.every((target) => target.width >= 36 && target.height >= 36) },
    ],
    controlMetrics: targets,
    focusTarget,
    bounds: geometry.frames,
    collisionPairs: analysis.collisionPairs,
    viewportEscapes: analysis.viewportEscapes,
    horizontalOverflow: analysis.horizontalOverflow,
    requestLedger: [...requestLedger],
    consoleLedger: [...consoleLedger],
    pageErrors: [...pageErrors],
    photo,
    progressTargets: targets,
    screenshotPath,
  }
  evidence.viewports.push(record)
  return record
}

async function exerciseSettings(page, context, evidence, highestPhoto, ledgers) {
  const day = localDayKey()
  await seedProgressFixture(page, { goals: [], habits: [], photoIndex: highestPhoto.index })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas(page)
  assertSettingsGeometry(await settingsGeometry(page), { closed: true })
  await openProgressSettings(page)
  evidence.interactions['settings-navigation'] = true
  assertSettingsGeometry(await settingsGeometry(page))
  await page.getByText('Choose one thing to keep moving.').waitFor()
  evidence.interactions['empty-state'] = true

  await page.getByRole('button', { name: 'Add progress' }).click()
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'progress-goal-name', 'Add dialog did not focus Name')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('Enter a goal name.').waitFor()
  await page.getByLabel('Name').fill('Water')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('Enter a unit such as glasses, pages, or minutes.').waitFor()
  await page.getByLabel('Unit').fill('glasses')
  await page.getByLabel('Daily target').fill('0')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('Choose a daily target from 1 to 999999.').waitFor()
  evidence.interactions.validation = true
  await page.getByLabel('Daily target').fill('8')
  await page.getByRole('button', { name: 'Save' }).click()
  let stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => progressGoals.length === 1, 'first goal add')
  const waterId = stored.progressGoals[0].id
  assert.deepEqual(stored.progressGoals[0].today, { date: day, value: 0 })
  evidence.interactions.add = true

  await page.getByRole('button', { name: 'Add progress' }).click()
  await page.getByLabel('Name').fill('Read')
  await page.getByLabel('Daily target').fill('20')
  await page.getByLabel('Unit').fill('pages')
  await page.getByRole('button', { name: 'Save' }).click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => progressGoals.length === 2, 'second goal add')
  const readId = stored.progressGoals.find((goal) => goal.id !== waterId).id

  await page.getByRole('button', { name: 'Edit Water' }).click()
  await page.getByLabel('Name').fill('Hydrate')
  await page.getByLabel('Daily target').fill('10')
  await page.getByLabel('Unit').fill('cups')
  await page.getByRole('button', { name: 'Save' }).click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => progressGoals[0]?.name === 'Hydrate' && progressGoals[0]?.target === 10, 'goal edit')
  assert.equal(stored.progressGoals[0].id, waterId)
  evidence.interactions.edit = true

  await page.getByRole('button', { name: 'Increment Hydrate' }).click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => progressGoals.find((goal) => goal.id === waterId)?.today.value === 1, 'goal increment')
  evidence.interactions.increment = true

  await page.getByRole('button', { name: 'Edit Hydrate' }).click()
  await page.getByRole('button', { name: 'Complete today' }).click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => progressGoals.find((goal) => goal.id === waterId)?.today.value === 10, 'goal completion')
  evidence.interactions.complete = true
  await page.getByRole('button', { name: 'Reset Hydrate' }).click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => progressGoals.find((goal) => goal.id === waterId)?.today.value === 0, 'goal reset')
  evidence.interactions.reset = true

  await page.getByRole('button', { name: 'Edit Hydrate' }).click()
  await page.getByRole('button', { name: 'Move down' }).click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => progressGoals[1]?.id === waterId, 'goal reorder')
  assert.deepEqual(stored.progressGoals.map((goal) => goal.id), [readId, waterId])
  evidence.interactions.reorder = true

  await page.getByRole('button', { name: 'Edit Read' }).click()
  await page.getByRole('button', { name: 'Delete goal' }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => progressGoals.length === 1, 'goal deletion')
  assert.equal(stored.progressGoals[0].id, waterId)
  evidence.interactions.delete = true

  await page.evaluate(async (today) => chrome.storage.local.set({
    habits: [{ id: 'stretch', name: 'Stretch', createdAt: 1, log: [] }],
  }), day)
  await page.getByRole('button', { name: 'Done Stretch' }).waitFor()
  await page.getByRole('button', { name: 'Done Stretch' }).click()
  stored = await waitForStorage(page, ['habits'], ({ habits }) => habits[0]?.log.includes(day), 'Habit completion')
  await page.getByRole('button', { name: 'Reopen Stretch' }).click()
  stored = await waitForStorage(page, ['habits'], ({ habits }) => habits[0]?.log.length === 0, 'Habit reopen')
  await page.getByRole('button', { name: 'Manage habits' }).click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-settings-anchor') === 'habits')
  assert.equal(await page.getByRole('tab', { name: 'Widgets' }).getAttribute('aria-selected'), 'true')
  evidence.interactions['habit-bridge'] = true

  const ownershipState = await readStorage(page, ['progressGoals', 'habits'])
  await page.evaluate(async ({ day }) => {
    await chrome.storage.local.set({
      progressGoals: Array.from({ length: 6 }, (_, index) => ({
        id: `scroll-goal-${index}`,
        name: `Scroll goal ${index + 1}`,
        unit: 'steps',
        target: 10,
        createdAt: index,
        today: { date: day, value: index },
      })),
      habits: Array.from({ length: 6 }, (_, index) => ({
        id: `scroll-habit-${index}`,
        name: `Scroll habit ${index + 1}`,
        createdAt: index,
        log: [],
      })),
    })
  }, { day })
  await page.setViewportSize({ width: 1408, height: 600 })
  await page.getByRole('tab', { name: 'Progress' }).click()
  await page.getByText('Scroll habit 6').waitFor()
  const shortSettings = await settingsGeometry(page)
  assert.deepEqual(shortSettings.scrollOwners, ['settings'], '1408x600 populated Progress Settings lost its single Drawer scroll owner')
  assertSettingsGeometry(shortSettings)
  await page.evaluate(async (state) => chrome.storage.local.set(state), ownershipState)
  await page.getByRole('button', { name: 'Edit Hydrate' }).waitFor()
  await page.setViewportSize({ width: 1600, height: 900 })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas(page)
  await openProgressSettings(page)
  await page.getByRole('button', { name: 'Edit Hydrate' }).waitFor()
  stored = await readStorage(page, ['progressGoals'])
  assert.equal(stored.progressGoals[0].id, waterId)
  evidence.interactions['reload-persistence'] = true

  const staleControl = await page.getByRole('button', { name: 'Increment Hydrate' }).elementHandle()
  assert(staleControl, 'could not retain the stale Progress control')
  const secondPage = await context.newPage()
  secondPage.setDefaultTimeout(20_000)
  attachPageLedgers(secondPage, ledgers, 'cross-tab')
  await secondPage.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await secondPage.locator('[data-canvas-surface]').waitFor()
  await openProgressSettings(secondPage)
  await secondPage.evaluate(async ({ day, waterId }) => {
    const { progressGoals } = await chrome.storage.local.get('progressGoals')
    const hydrate = progressGoals.find((goal) => goal.id === waterId)
    await chrome.storage.local.set({
      progressGoals: [
        { id: 'cross-tab-leading', name: 'Plan', unit: 'steps', target: 4, createdAt: 0, today: { date: day, value: 2 } },
        { ...hydrate, target: 12, today: { date: day, value: 5 } },
      ],
    })
  }, { day, waterId })
  await page.getByText('5 / 12 cups').waitFor()
  evidence.interactions['cross-tab-freshness'] = true
  await staleControl.click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => (
    progressGoals[0]?.id === 'cross-tab-leading'
    && progressGoals[1]?.id === waterId
    && progressGoals[1]?.target === 12
    && progressGoals[1]?.today.value === 6
  ), 'stale control activation')
  evidence.interactions['stale-control-safety'] = true
  await secondPage.getByText('6 / 12 cups').waitFor()
  await secondPage.close()

  await closeSettings(page)
  return { day, waterId }
}

async function exerciseCanvas(page, evidence, highestPhoto, day, waterId) {
  const goals = [{ id: waterId, name: 'Hydrate', unit: 'cups', target: 12, createdAt: 1, today: { date: day, value: 6 } }]
  const habits = [
    { id: 'stretch', name: 'Stretch', createdAt: 2, log: [] },
    { id: 'walk', name: 'Walk', createdAt: 3, log: [day] },
    { id: 'read-habit', name: 'Read', createdAt: 4, log: [] },
  ]
  await seedProgressFixture(page, { goals, habits, photoIndex: highestPhoto.index })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas(page)
  await page.getByText('1 more', { exact: true }).waitFor()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const firstRow = page.getByTestId('progress-canvas-row').first()
  const reducedMotion = await firstRow.evaluate((node) => {
    const ring = node.querySelector('[role="progressbar"]')
    return {
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      rowTransitionProperty: getComputedStyle(node).transitionProperty,
      ringTransitionProperty: ring ? getComputedStyle(ring).transitionProperty : null,
    }
  })
  assert.equal(reducedMotion.matches, true, 'Chromium did not apply the reduced-motion emulation')
  assert.equal(reducedMotion.rowTransitionProperty, 'none', 'Progress row retained an animatable reduced-motion property')
  assert.equal(reducedMotion.ringTransitionProperty, 'none', 'Progress ring retained an animatable reduced-motion property')
  await firstRow.focus()
  await page.keyboard.press('Enter')
  await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => progressGoals[0]?.today.value === 7, 'keyboard Progress activation')
  evidence.interactions['keyboard-access'] = true
  evidence.interactions['reduced-motion'] = true

  await page.getByRole('button', { name: 'Open Progress' }).click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-settings-anchor') === 'progress-overview')
  assert.equal(await page.getByRole('tab', { name: 'Progress' }).getAttribute('aria-selected'), 'true')
  evidence.interactions['overflow-route'] = true
  await closeSettings(page)

  await exerciseRetryRecovery(page, evidence)

  const current = await readStorage(page, ['progressGoals', 'habits'])
  await seedProgressFixture(page, {
    goals: current.progressGoals,
    habits: current.habits,
    photoIndex: highestPhoto.index,
    stack: true,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas(page)
  const stack = page.locator('[data-stack-card="progress-stack"]')
  await stack.waitFor()
  await page.locator('[data-stack-member="progress"][data-stack-active="true"] [data-progress-presentation="stack"]').waitFor()
  const stackContainment = await page.evaluate(() => {
    const outer = document.querySelector('[data-stack-member="progress"][data-stack-active="true"]')
    const inner = outer?.querySelector('[data-progress-presentation="stack"]')
    if (!(outer instanceof HTMLElement) || !(inner instanceof HTMLElement)) return false
    const a = outer.getBoundingClientRect()
    const b = inner.getBoundingClientRect()
    return b.left >= a.left - 0.75 && b.top >= a.top - 0.75 && b.right <= a.right + 0.75 && b.bottom <= a.bottom + 0.75
      && inner.scrollWidth <= inner.clientWidth + 1 && inner.scrollHeight <= inner.clientHeight + 1
  })
  assert.equal(stackContainment, true, 'Progress stack face clipped or escaped its active member')
  evidence.interactions['stack-face'] = true

  const stacked = await readStorage(page, ['progressGoals', 'habits'])
  await seedProgressFixture(page, {
    goals: stacked.progressGoals,
    habits: stacked.habits,
    photoIndex: highestPhoto.index,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas(page)
}

async function exerciseMidnight(page, evidence, highestPhoto) {
  const before = new Date(2026, 7, 29, 23, 59, 58)
  const beforeKey = localDayKey(before)
  const afterKey = localDayKey(new Date(2026, 7, 30, 0, 0, 1))
  await page.clock.install({ time: before })
  await seedProgressFixture(page, {
    goals: [{ id: 'midnight-goal', name: 'Midnight', unit: 'steps', target: 4, createdAt: 1, today: { date: beforeKey, value: 3 } }],
    habits: [],
    photoIndex: highestPhoto.index,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForCanvas(page)
  await page.getByRole('button', { name: /Manual Midnight: 3 of 4 steps/ }).waitFor()
  await page.clock.fastForward(3_000)
  await page.getByRole('button', { name: /Manual Midnight: 0 of 4 steps/ }).waitFor()
  let stored = await readStorage(page, ['progressGoals'])
  assert.deepEqual(stored.progressGoals[0].today, { date: beforeKey, value: 3 }, 'midnight render performed an automatic write')
  await page.getByRole('button', { name: /Manual Midnight: 0 of 4 steps/ }).click()
  stored = await waitForStorage(page, ['progressGoals'], ({ progressGoals }) => (
    progressGoals[0]?.today.date === afterKey && progressGoals[0]?.today.value === 1
  ), 'first post-midnight action')
  evidence.interactions['local-midnight-rollover'] = true
  await page.clock.setSystemTime(new Date())
}

async function launchExtensionContext(profile, dist, viewport, touch, ledgers, label) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: false,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  await context.route(/^https?:\/\//, async (route) => {
    ledgers.requests.push({ method: route.request().method(), url: route.request().url(), action: 'aborted' })
    await route.abort('blockedbyclient')
  })
  const page = context.pages()[0] ?? await context.newPage()
  page.setDefaultTimeout(20_000)
  attachPageLedgers(page, ledgers, label)
  await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-canvas-surface]').waitFor()
  return { context, page }
}

export async function runTabTwoProgressQa(args = process.argv.slice(2)) {
  requireExact(args)
  const repoRoot = resolve(process.cwd())
  const dist = resolve(repoRoot, 'dist')
  assertExactBuildTrackedStatus(execFileSync(
    'git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' },
  ))
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const provenancePath = resolve(dist, 'build-provenance.json')
  let provenance
  try {
    provenance = JSON.parse(readFileSync(provenancePath, 'utf8'))
  } catch {
    provenance = undefined
  }
  assertBuildCommit(provenance, commit)

  const output = resolve(repoRoot, 'artifacts/qa-tab-two-v2-progress', commit)
  mkdirSync(output, { recursive: true })
  const highestPhoto = highestResolutionPhoto(repoRoot)
  const evidence = {
    commit,
    provenance,
    highestResolutionPhoto: highestPhoto,
    interactions: Object.fromEntries(PROGRESS_INTERACTIONS.map((name) => [name, false])),
    viewports: [],
    storageAssertions: [],
    focusTargets: [],
    requestLedger: [],
    consoleLedger: [],
    pageErrors: [],
    result: 'FAIL',
  }
  const desktopProfile = mkdtempSync(resolve(tmpdir(), 'aurora-progress-desktop-'))
  const mobileProfile = mkdtempSync(resolve(tmpdir(), 'aurora-progress-mobile-'))
  const midnightProfile = mkdtempSync(resolve(tmpdir(), 'aurora-progress-midnight-'))
  let desktopContext
  let mobileContext
  let midnightContext

  try {
    const desktopLedgers = { requests: [], console: [], pageErrors: [] }
    const desktop = await launchExtensionContext(desktopProfile, dist, PROGRESS_VIEWPORTS[0], false, desktopLedgers, 'desktop')
    desktopContext = desktop.context
    const { day, waterId } = await exerciseSettings(desktop.page, desktop.context, evidence, highestPhoto, desktopLedgers)
    await exerciseCanvas(desktop.page, evidence, highestPhoto, day, waterId)
    for (const viewport of PROGRESS_VIEWPORTS.filter((entry) => !entry.touch)) {
      await captureViewport({
        page: desktop.page,
        viewport,
        evidence,
        output,
        highestPhoto,
        requestLedger: desktopLedgers.requests,
        consoleLedger: desktopLedgers.console,
        pageErrors: desktopLedgers.pageErrors,
      })
    }

    const mobileLedgers = { requests: [], console: [], pageErrors: [] }
    const mobile = await launchExtensionContext(mobileProfile, dist, PROGRESS_VIEWPORTS[3], true, mobileLedgers, 'mobile')
    mobileContext = mobile.context
    const canvasState = await readStorage(desktop.page, ['progressGoals', 'habits'])
    await seedProgressFixture(mobile.page, {
      goals: canvasState.progressGoals,
      habits: canvasState.habits,
      photoIndex: highestPhoto.index,
    })
    await mobile.page.reload({ waitUntil: 'domcontentloaded' })
    await captureViewport({
      page: mobile.page,
      viewport: PROGRESS_VIEWPORTS[3],
      evidence,
      output,
      highestPhoto,
      requestLedger: mobileLedgers.requests,
      consoleLedger: mobileLedgers.console,
      pageErrors: mobileLedgers.pageErrors,
    })
    await exerciseMobileOverflowRoute(mobile.page, evidence)

    const midnightLedgers = { requests: [], console: [], pageErrors: [] }
    const midnight = await launchExtensionContext(midnightProfile, dist, PROGRESS_VIEWPORTS[0], false, midnightLedgers, 'midnight')
    midnightContext = midnight.context
    await exerciseMidnight(midnight.page, evidence, highestPhoto)

    evidence.requestLedger = [...desktopLedgers.requests, ...mobileLedgers.requests, ...midnightLedgers.requests]
    evidence.consoleLedger = [...desktopLedgers.console, ...mobileLedgers.console, ...midnightLedgers.console]
    evidence.pageErrors = [...desktopLedgers.pageErrors, ...mobileLedgers.pageErrors, ...midnightLedgers.pageErrors]
    assertNoUnexpectedRequests(evidence.requestLedger)
    assert.deepEqual(evidence.consoleLedger, [], 'Progress QA emitted browser console errors')
    assert.deepEqual(evidence.pageErrors, [], 'Progress QA emitted uncaught page errors')
    evidence.result = 'PASS'
    assertEvidenceContract(evidence)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(`PASS: Tab Two Progress QA (${commit})`)
    return evidence
  } catch (error) {
    evidence.failure = String(error?.stack ?? error)
    writeFileSync(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    throw error
  } finally {
    await midnightContext?.close()
    await mobileContext?.close()
    await desktopContext?.close()
    for (const profile of [desktopProfile, mobileProfile, midnightProfile]) {
      assert(profile.startsWith(tmpdir()), `unsafe Progress QA profile path: ${profile}`)
      rmSync(profile, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runTabTwoProgressQa()
}
