// NL-P6 product QA sweep (plan: docs/superpowers/plans/2026-08-19-nl-p6-
// product-qa.md, Task 2): scenario x viewport x state over a production
// preview build of the real extension, per the corrected A2-D060 standard —
// short-height desktop family including exact 1408x445, existing-layout-
// shaped storage, programmatic invariants at every cell, one capture per
// cell for the per-capture judgment pass (Task 4). Accepted evidence is
// immutable: every run requires an explicit repository-local scratch path.
import { rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { SCENARIOS } from './qa-nl-p6-scenarios.mjs'
import { prepareQaOutputDir } from './qa-nl-p6-output.mjs'

const repoRoot = process.cwd()
const dist = resolve('.qa-nl-p6-dist')
const profileDir = resolve('.playwright-profile-qa-nl-p6')
const outDir = prepareQaOutputDir(process.argv.slice(2), repoRoot, { empty: true })
const headed = process.argv.includes('--headed')
const scenarioFilter = process.argv.find((arg) => arg.startsWith('--scenario='))?.slice('--scenario='.length)
const scenarios = scenarioFilter
  ? SCENARIOS.filter((scenario) => scenario.id === scenarioFilter)
  : SCENARIOS
if (scenarioFilter && scenarios.length === 0) throw new Error(`unknown QA scenario: ${scenarioFilter}`)

for (const [path, suffix] of [
  [dist, '.qa-nl-p6-dist'],
  [profileDir, '.playwright-profile-qa-nl-p6'],
]) {
  if (!path.endsWith(suffix)) throw new Error(`unsafe path: ${path}`)
}
rmSync(dist, { recursive: true, force: true })
rmSync(profileDir, { recursive: true, force: true })

const build = spawnSync(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'),
  'build', '--mode', 'preview', '--outDir', dist, '--emptyOutDir',
], { cwd: repoRoot, encoding: 'utf8' })
if (build.status !== 0) {
  process.stdout.write(build.stdout ?? '')
  process.stderr.write(build.stderr ?? '')
  throw new Error(`build failed: ${build.status}`)
}

// The matrix (plan Task 2): the common core plus the corrected standard's
// short-height desktop family, the bookmarks compact boundary, and both
// sides of the 600px narrow floor.
const VIEWPORTS = [
  { width: 1408, height: 445, family: 'short' },
  { width: 1024, height: 600, family: 'short' },
  { width: 1920, height: 550, family: 'short' },
  { width: 1280, height: 500, family: 'short' },
  { width: 1366, height: 768, family: 'common' },
  { width: 1600, height: 900, family: 'common' },
  { width: 1920, height: 1080, family: 'common' },
  { width: 2560, height: 1440, family: 'common' },
  { width: 3440, height: 1440, family: 'wide' },
  { width: 720, height: 900, family: 'boundary' },
  { width: 599, height: 800, family: 'floor' },
  { width: 600, height: 800, family: 'floor' },
]
const HOVER_DOCK_VIEWPORTS = new Set(['1408x445', '1600x900'])

const evidence = { cells: [], failures: [], runtimeErrors: [], failedRequests: [], writes: [], stackInteractions: null }
const fail = (message) => { evidence.failures.push(message) }

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
page.setDefaultTimeout(20_000)
page.on('console', (m) => { if (m.type() === 'error') evidence.runtimeErrors.push(`console: ${m.text()}`) })
page.on('pageerror', (e) => evidence.runtimeErrors.push(`page: ${String(e)}`))
page.on('requestfailed', (r) => {
  evidence.failedRequests.push(`${r.method()} ${r.url()}: ${r.failure()?.errorText ?? 'failed'}`)
})

const waitForProductSurface = async () => {
  await page.waitForSelector('[data-canvas-surface], [data-flow-screen]')
  await page.waitForTimeout(350)
}
const armWriteLog = () => page.evaluate(() => {
  window.__writeLog = []
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') window.__writeLog.push(Object.keys(changes).sort().join(','))
  })
})
const harvestWrites = async (label) => {
  const writes = await page.evaluate(() => window.__writeLog ?? [])
  for (const keys of writes) evidence.writes.push(`${label}:${keys}`)
  return writes
}

async function assertInvariants(cell, scenarioId) {
  const truth = await page.evaluate(async ({ checkStack }) => {
    const doc = document.documentElement
    const surface = document.querySelector('[data-canvas-surface]')
    const wash = surface?.querySelector('.canvas-legibility-layer')
    const washRect = wash?.getBoundingClientRect()
    const flow = document.querySelector('[data-flow-screen]')
    const flowRect = flow?.getBoundingClientRect()
    const flowTargetEscapes = flow ? [
      flow.querySelector('[data-flow-timer]'),
      flow.querySelector('button[aria-label="Pause timer"], button[aria-label="Resume timer"]'),
      flow.querySelector('button[aria-label="End flow"]'),
      flow.querySelector('[data-flow-task]'),
    ].filter(Boolean).flatMap((node) => {
      const rect = node.getBoundingClientRect()
      return rect.left < -1 || rect.top < -1
        || rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1
        ? [node.getAttribute('aria-label') || node.getAttribute('data-flow-task') === '' && 'task' || node.getAttribute('data-flow-timer') === '' && 'timer' || node.tagName]
        : []
    }) : []
    const flowLeaks = flow ? [
      '[data-canvas-surface]',
      'nav[aria-label="Top bar"]',
      'nav[aria-label="Bottom bar"]',
      'button[aria-label="Open settings"]',
      'button[aria-label="Open utility tray"]',
      'button[aria-label="New background photo"]',
      '[role="toolbar"][aria-label="Edit layout"]',
    ].filter((selector) => document.querySelector(selector)) : []
    const items = [...document.querySelectorAll('[data-block-id]')]
    // A widget marked data-canvas-empty rendered nothing BY DESIGN (the
    // no-husk law: unconfigured World clocks, Countdown, Habits). It is
    // inert and unreachable, so it is absent — not a degenerate box. Any
    // OTHER zero-size item is still a defect.
    const zero = items.filter((n) => {
      const r = n.getBoundingClientRect()
      return (r.width < 4 || r.height < 4)
        && !n.hasAttribute('data-canvas-empty')
        && !n.closest('[data-canvas-narrow]')
    }).map((n) => n.getAttribute('data-block-id'))
    const offscreen = items.filter((n) => {
      if (n.hasAttribute('data-canvas-empty')) return false
      const r = n.getBoundingClientRect()
      // The narrow-floor stack scrolls VERTICALLY by design: below-the-fold
      // members are reachable, so only horizontal escape counts there.
      if (n.closest('[data-canvas-narrow]')) {
        return r.right < 0 || r.left > window.innerWidth
      }
      return r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight
    }).map((n) => n.getAttribute('data-block-id'))
    const gear = document.querySelector('button[aria-label="Open settings"]')
    const gearRect = gear?.getBoundingClientRect()
    const gearHit = gearRect
      ? document.elementFromPoint(gearRect.left + gearRect.width / 2, gearRect.top + gearRect.height / 2)?.closest('button') === gear
      : false
    const toolbar = document.querySelector('[role="toolbar"][aria-label="Edit layout"]')
    const toolbarTargetEscapes = toolbar ? [...toolbar.querySelectorAll('button, select')].flatMap((node) => {
      const rect = node.getBoundingClientRect()
      return rect.left < -1 || rect.top < -1
        || rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1
        ? [node.getAttribute('aria-label') || node.textContent?.trim() || node.tagName]
        : []
    }) : []
    const stackCard = checkStack ? document.querySelector('[data-stack-card="qa-stack"]') : null
    const stackMembers = stackCard ? [...stackCard.querySelectorAll('[data-stack-member]')] : []
    const stackRect = stackCard?.getBoundingClientRect()
    const stored = checkStack ? (await chrome.storage.local.get('layouts')).layouts : null
    const storedLayout = stored?.layouts?.find((layout) => layout.id === stored.activeLayoutId)
    const storedStack = storedLayout?.stacks?.find((stack) => stack.id === 'qa-stack')
    const expectedMembers = ['monthCal', 'weather', 'quote']
    const stackTruth = checkStack ? {
      cardCount: document.querySelectorAll('[data-stack-card]').length,
      mountedMembers: stackMembers.map((node) => node.getAttribute('data-stack-member')),
      visibleMemberCount: stackMembers.filter((node) => getComputedStyle(node).visibility !== 'hidden').length,
      storedFacing: storedStack?.facing ?? null,
      duplicateStandalone: expectedMembers.filter((id) => document.querySelector(`[data-canvas-object-id="${id}"]`)),
      zero: !stackRect || stackRect.width < 4 || stackRect.height < 4,
      offscreen: !stackRect || stackRect.right < 0 || stackRect.bottom < 0
        || stackRect.left > window.innerWidth || stackRect.top > window.innerHeight,
      dockedTimer: storedLayout?.widgets?.timer?.kind === 'docked'
        && Boolean(document.querySelector('[data-canvas-object-id="timer"]')),
    } : null
    return {
      hOverflow: doc.scrollWidth > doc.clientWidth,
      vOverflow: doc.scrollHeight > doc.clientHeight,
      surfacePresent: Boolean(surface),
      narrowWashCoversViewport: surface?.hasAttribute('data-canvas-narrow')
        ? Boolean(washRect && washRect.top <= 1 && washRect.bottom >= window.innerHeight - 1)
        : true,
      flowPresent: Boolean(flow),
      flowBounded: Boolean(flowRect
        && flowRect.left >= -1 && flowRect.top >= -1
        && flowRect.right <= window.innerWidth + 1
        && flowRect.bottom <= window.innerHeight + 1),
      flowTimerPresent: Boolean(flow?.querySelector('[data-flow-timer]')),
      flowExitPresent: Boolean(flow?.querySelector('button[aria-label="End flow"]')),
      flowLeaks,
      flowTargetEscapes,
      zero,
      offscreen,
      gearHit,
      toolbarTargetEscapes,
      stackTruth,
    }
  }, { checkStack: scenarioId === 'stacks' })
  if (truth.hOverflow) fail(`${cell}: horizontal page overflow`)
  if (truth.flowPresent) {
    if (truth.vOverflow || !truth.flowBounded || !truth.flowTimerPresent || !truth.flowExitPresent) {
      fail(`${cell}: flow screen missing or unbounded`)
    }
    if (truth.flowTargetEscapes.length) {
      fail(`${cell}: Flow target escaped the viewport (${truth.flowTargetEscapes.join(',')})`)
    }
    if (truth.surfacePresent || truth.flowLeaks.length) {
      fail(`${cell}: dashboard leaked into Flow (${truth.flowLeaks.join(',')})`)
    }
    return
  }
  if (!truth.surfacePresent) fail(`${cell}: canvas surface missing`)
  if (!truth.narrowWashCoversViewport) fail(`${cell}: narrow canvas wash ends before the viewport`)
  if (truth.zero.length) fail(`${cell}: degenerate widgets ${truth.zero.join(',')}`)
  if (truth.offscreen.length) fail(`${cell}: fully offscreen widgets ${truth.offscreen.join(',')}`)
  if (!truth.gearHit) fail(`${cell}: settings gear not hit-testable`)
  if (truth.toolbarTargetEscapes.length) {
    fail(`${cell}: edit toolbar targets escaped the viewport (${truth.toolbarTargetEscapes.join(',')})`)
  }
  if (truth.stackTruth) {
    const stack = truth.stackTruth
    if (stack.cardCount !== 1) fail(`${cell}: expected one stack card, found ${stack.cardCount}`)
    if (stack.mountedMembers.join(',') !== 'monthCal,weather,quote') {
      fail(`${cell}: stack members ${stack.mountedMembers.join(',')}`)
    }
    if (stack.visibleMemberCount !== 1) fail(`${cell}: expected one visible stack face, found ${stack.visibleMemberCount}`)
    if (stack.storedFacing !== 'quote') fail(`${cell}: stored stack facing ${stack.storedFacing}`)
    if (stack.duplicateStandalone.length) fail(`${cell}: duplicate standalone members ${stack.duplicateStandalone.join(',')}`)
    if (stack.zero) fail(`${cell}: stack card has a zero box`)
    if (stack.offscreen) fail(`${cell}: stack card is fully offscreen`)
    if (!stack.dockedTimer) fail(`${cell}: required docked Timer is missing`)
  }
}

async function capture(name) {
  await page.screenshot({ path: resolve(outDir, `${name}.png`) })
  evidence.cells.push(name)
}

async function stackInteractionChecks() {
  const card = page.locator('[data-stack-card="qa-stack"]')
  const waitForFace = async (label) => {
    await page.getByRole('group', { name: label, exact: true }).waitFor()
    await page.waitForTimeout(120)
  }
  const box = async () => {
    const measured = await card.boundingBox()
    if (!measured) throw new Error('stacks: stack card has no box')
    return { width: measured.width, height: measured.height }
  }
  const storedFacing = () => page.evaluate(async () => {
    const { layouts } = await chrome.storage.local.get('layouts')
    const layout = layouts.layouts.find((candidate) => candidate.id === layouts.activeLayoutId)
    return layout.stacks?.find((stack) => stack.id === 'qa-stack')?.facing ?? null
  })
  const waitForStoredFace = async (face) => {
    await page.waitForFunction(async (expected) => {
      const { layouts } = await chrome.storage.local.get('layouts')
      const layout = layouts.layouts.find((candidate) => candidate.id === layouts.activeLayoutId)
      return layout.stacks?.find((stack) => stack.id === 'qa-stack')?.facing === expected
    }, face)
  }
  const takeWrites = async () => page.evaluate(() => {
    const writes = window.__writeLog ?? []
    window.__writeLog = []
    return writes
  })
  const assertHitTarget = async (control, label) => {
    const truth = await control.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return {
        exact: hit === node || Boolean(hit?.closest('button') === node),
        hit: hit?.getAttribute('data-canvas-object-id') || hit?.getAttribute('aria-label') || hit?.className || hit?.tagName || null,
        pointerEvents: getComputedStyle(node).pointerEvents,
        inertChain: [...document.querySelectorAll('[inert]')]
          .filter((candidate) => candidate === node || candidate.contains(node))
          .map((candidate) => candidate.className || candidate.tagName),
      }
    })
    if (!truth.exact) throw new Error(`stacks: ${label} is not hit-testable ${JSON.stringify(truth)}`)
  }

  const dimensions = [{ face: 'quote', ...await box() }]
  await page.mouse.move(1, 1)
  const restingArrow = card.locator('button[aria-label="Next widget"]')
  const restingControls = await restingArrow.evaluate((node) => {
    const arrowStyle = getComputedStyle(node)
    const cardStyle = getComputedStyle(node.closest('[data-stack-card]'))
    return {
      opacity: arrowStyle.opacity,
      visibility: arrowStyle.visibility,
      pointerEvents: arrowStyle.pointerEvents,
      userSelect: cardStyle.userSelect,
    }
  })
  if (restingControls.opacity !== '0' || restingControls.visibility !== 'hidden' || restingControls.pointerEvents !== 'none') {
    throw new Error(`stacks: arrows are not hidden at rest ${JSON.stringify(restingControls)}`)
  }
  if (restingControls.userSelect !== 'none') {
    throw new Error(`stacks: native text selection is not suppressed ${JSON.stringify(restingControls)}`)
  }

  await card.hover()
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-stack-card="qa-stack"] button[aria-label="Next widget"]')
    if (!node) return false
    const style = getComputedStyle(node)
    return Number(style.opacity) >= 0.89 && style.visibility === 'visible' && style.pointerEvents === 'auto'
  })
  const nextButton = card.getByRole('button', { name: 'Next widget' })
  await assertHitTarget(nextButton, 'Next widget')
  await nextButton.click()
  await waitForFace('Month, 1 of 3')
  await waitForStoredFace('monthCal')
  dimensions.push({ face: 'monthCal', ...await box() })
  await card.getByRole('button', { name: 'Next widget' }).click()
  await waitForFace('Weather, 2 of 3')
  await waitForStoredFace('weather')
  dimensions.push({ face: 'weather', ...await box() })
  await card.getByRole('button', { name: 'Next widget' }).click()
  await waitForFace('Quote, 3 of 3')
  await waitForStoredFace('quote')

  const origin = dimensions[0]
  for (const measured of dimensions.slice(1)) {
    if (Math.abs(measured.width - origin.width) > 1 || Math.abs(measured.height - origin.height) > 1) {
      fail(`stacks: card changed size on ${measured.face} ${JSON.stringify(dimensions)}`)
    }
  }

  await card.getByRole('button', { name: 'Show Weather' }).click()
  await waitForFace('Weather, 2 of 3')
  const weatherTrigger = card.locator('[data-stack-member="weather"] button[aria-expanded="false"]')
  await weatherTrigger.click()
  await page.waitForTimeout(250)
  const parityTruth = await page.evaluate(() => {
    const member = document.querySelector('[data-stack-member="weather"]')
    const trigger = member?.querySelector('button[aria-expanded]')
    return {
      active: member?.getAttribute('data-stack-active'),
      inert: member?.hasAttribute('inert'),
      expanded: trigger?.getAttribute('aria-expanded'),
      dialog: Boolean(document.querySelector('[role="dialog"][aria-label="Weather details"]')),
    }
  })
  if (!parityTruth.dialog) throw new Error(`stacks: Weather click parity failed ${JSON.stringify(parityTruth)}`)
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Weather details' }).waitFor({ state: 'detached' })

  const swipeBox = await card.boundingBox()
  if (!swipeBox) throw new Error('stacks: stack card disappeared before swipe')
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
  await page.mouse.move(swipeBox.x + swipeBox.width / 2, swipeBox.y + swipeBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(swipeBox.x + swipeBox.width / 2 - 50, swipeBox.y + swipeBox.height / 2, { steps: 4 })
  await page.mouse.up()
  await waitForFace('Quote, 3 of 3')
  const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? '')
  if (selectedText) fail(`stacks: swipe selected page text ${JSON.stringify(selectedText)}`)
  if (await page.getByRole('dialog', { name: 'Weather details' }).count()) {
    fail('stacks: swipe activated the Weather face click')
  }

  // Hidden stack members stay mounted by design, so their resource caches
  // may write while the interaction sequence runs. Clear that deliberately
  // broad window before proving the next explicit paging action in isolation.
  const setupWrites = await takeWrites()
  if (setupWrites.some((keys) => keys.split(',').includes('layout'))) {
    fail(`stacks: setup interactions touched frozen legacy layout ${setupWrites.join(';')}`)
  }
  evidence.writes.push(...setupWrites.map((keys) => `stack-interactions:${keys}`))

  await page.mouse.move(1, 1)
  await card.focus()
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-stack-card="qa-stack"] button[aria-label="Next widget"]')
    if (!node) return false
    const style = getComputedStyle(node)
    return Number(style.opacity) >= 0.89 && style.visibility === 'visible' && style.pointerEvents === 'auto'
  })
  await page.keyboard.press('ArrowRight')
  await waitForFace('Month, 1 of 3')
  await waitForStoredFace('monthCal')
  const pagingWrites = await takeWrites()
  if (pagingWrites.length !== 1 || pagingWrites[0] !== 'layouts') {
    fail(`stacks: normal paging writes were ${pagingWrites.join(';') || 'empty'}`)
  }
  evidence.writes.push(...pagingWrites.map((keys) => `stack-interactions:${keys}`))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForProductSurface()
  await waitForFace('Month, 1 of 3')
  await armWriteLog()

  const reloadedCard = page.locator('[data-stack-card="qa-stack"]')
  await reloadedCard.getByRole('button', { name: 'Show Quote' }).click()
  await waitForFace('Quote, 3 of 3')
  await waitForStoredFace('quote')
  const dotWrites = await takeWrites()
  if (dotWrites.length === 0 || dotWrites.some((keys) => keys !== 'layouts')) {
    fail(`stacks: dot paging writes were ${dotWrites.join(';') || 'empty'}`)
  }
  evidence.writes.push(...dotWrites.map((keys) => `stack-interactions:${keys}`))

  await page.keyboard.press('Control+Shift+E')
  await page.waitForSelector('[role="toolbar"][aria-label="Edit layout"]')
  await reloadedCard.getByRole('button', { name: 'Show Weather' }).click()
  await waitForFace('Weather, 2 of 3')
  if (await storedFacing() !== 'quote') fail('stacks: edit-mode dot wrote before Save')
  await page.keyboard.press('Escape')
  await waitForFace('Quote, 3 of 3')
  const cancelWrites = await takeWrites()
  if (cancelWrites.length > 0) fail(`stacks: cancelled edit wrote ${cancelWrites.join(';')}`)

  evidence.stackInteractions = {
    dimensions,
    wraparound: true,
    weatherClickParity: true,
    swipeWithoutClick: true,
    swipeWithoutSelection: true,
    keyboardFocusRevealsArrows: true,
    keyboardPaging: true,
    reloadFacing: 'monthCal',
    cancelledDraftFacing: 'weather',
    storedFacingAfterCancel: await storedFacing(),
  }
}

// Per-scenario truth checks, run once at 1600x900 after seeding (plan Task 2).
async function scenarioChecks(id) {
  if (id === 'legacy-v1') {
    const clockY = await page.evaluate(() => {
      const clock = document.querySelector('[data-block-id="clock"]')
      if (!clock) return null
      const r = clock.getBoundingClientRect()
      return ((r.top + r.height / 2) / window.innerHeight) * 100
    })
    if (clockY === null || Math.abs(clockY - 22) > 4) {
      fail(`legacy-v1: clock renders at ${clockY?.toFixed(1)}% — stored V1 y was 22%`)
    }
  }
  if (id === 'named-saved' || id === 'connectors') {
    const truths = await page.evaluate(() => {
      const quote = document.querySelector('[data-block-id="quote"]')
      const weather = document.querySelector('nav[aria-label="Bottom bar"] [data-block-id="weather"]')
      const bar = document.querySelector('.canvas-bottom-bar')
      const weatherRect = weather?.getBoundingClientRect()
      const barRect = bar?.getBoundingClientRect()
      return {
        quotePresent: Boolean(quote),
        weatherXPct: weatherRect && barRect
          ? ((weatherRect.left + weatherRect.width / 2 - barRect.left) / barRect.width) * 100
          : null,
      }
    })
    if (truths.quotePresent) fail(`${id}: hidden quote is rendering`)
    if (truths.weatherXPct === null || Math.abs(truths.weatherXPct - 30) > 3) {
      fail(`${id}: docked weather at ${truths.weatherXPct?.toFixed(1)}% of the strip — stored x was 30`)
    }
  }
  if (id === 'connectors') {
    const github = await page.evaluate(() => (
      document.querySelector('nav[aria-label="Bottom bar"] [data-block-id="github"]')?.textContent ?? ''
    ))
    if (!/PR|issue|clear/i.test(github)) fail(`connectors: github dock line reads "${github}"`)
  }
  if (id === 'flow') {
    const flowTruth = await page.evaluate(async () => {
      const { timerSession, focus, todoLists } = await chrome.storage.local.get(['timerSession', 'focus', 'todoLists'])
      return {
        screen: Boolean(document.querySelector('[data-flow-screen]')),
        running: timerSession?.running,
        flow: timerSession?.flow,
        deadline: timerSession?.endsAt,
        focus: focus?.text,
        unfinished: todoLists?.[0]?.items?.filter((item) => !item.done).length,
      }
    })
    if (!flowTruth.screen || !flowTruth.running || !flowTruth.flow || !flowTruth.deadline) {
      fail(`flow: persisted running screen missing ${JSON.stringify(flowTruth)}`)
    }
    if (!flowTruth.focus || flowTruth.unfinished !== 2) {
      fail(`flow: focus/task fixture missing ${JSON.stringify(flowTruth)}`)
    }
  }
  if (id === 'stacks') await stackInteractionChecks()
}

let caughtError
try {
  for (const scenario of scenarios) {
    // Fresh storage per scenario: clear all, reload to re-init defaults,
    // then seed and reload once more.
    await page.goto('chrome://newtab/', { waitUntil: 'domcontentloaded' })
    await waitForProductSurface()
    await page.evaluate(async () => { await chrome.storage.local.clear() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForProductSurface()
    await scenario.seed(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForProductSurface()
    await armWriteLog()
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.waitForTimeout(250)
    await scenarioChecks(scenario.id)

    for (const viewport of VIEWPORTS) {
      const vpId = `${viewport.width}x${viewport.height}`
      await page.setViewportSize(viewport)
      await page.waitForTimeout(350)
      const cell = `${scenario.id}-${vpId}`

      await page.mouse.move(1, 1)
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      })
      await assertInvariants(`${cell}-normal`, scenario.id)
      await capture(`${cell}-normal`)

      // Edit state: normal dashboards enter and exact-cancel. Flow must
      // ignore the same chord and remain the sole product surface.
      await page.keyboard.press('Control+Shift+E')
      await page.waitForTimeout(300)
      const sessionLive = await page.evaluate(() => Boolean(document.querySelector('[role="toolbar"][aria-label="Edit layout"]')))
      if (scenario.id === 'flow') {
        if (sessionLive) fail(`${cell}: edit chord changed Flow`)
        await assertInvariants(`${cell}-edit-ignored`, scenario.id)
        await capture(`${cell}-edit-ignored`)
      } else {
        if (!sessionLive) fail(`${cell}-edit: session did not open`)
        await assertInvariants(`${cell}-edit`, scenario.id)
        await capture(`${cell}-edit`)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(250)
      }

      if ((scenario.id === 'named-saved' || scenario.id === 'connectors') && HOVER_DOCK_VIEWPORTS.has(vpId)) {
        const member = page.locator('nav[aria-label="Bottom bar"] [data-block-id]').first()
        if (await member.count()) {
          await member.hover()
          await page.waitForTimeout(200)
          const chromeVisible = await page.evaluate(() => {
            const grip = document.querySelector('nav[aria-label="Bottom bar"] .canvas-item-chrome')
            return grip ? getComputedStyle(grip).opacity === '1' : false
          })
          if (!chromeVisible) fail(`${cell}-hover-dock: grip/gear not visible on hover`)
          await capture(`${cell}-hover-dock`)
        }
      }
    }
    const scenarioWrites = await harvestWrites(scenario.id)
    if (scenario.id === 'flow' && scenarioWrites.length > 0) {
      fail(`flow: Flow rendered with storage writes ${scenarioWrites.join(';')}`)
    }
  }

  // Write-log law: after each scenario's own seeding, the running product
  // never writes the frozen legacy `layout` key. (Session cancels write
  // nothing at all; the chord/Escape pairs above must leave no trace.)
  for (const entry of evidence.writes) {
    const [label, keys] = entry.split(':')
    if (keys.split(',').includes('layout')) fail(`write-log ${label}: the frozen legacy layout key was written`)
    if (keys.split(',').includes('layouts') && label !== 'stack-interactions') {
      fail(`write-log ${label}: a cancelled session wrote layouts`)
    }
  }
} catch (error) {
  caughtError = error
} finally {
  try { await context.close() } catch { /* ignore */ }
}

// The report skeleton (plan Task 4 fills verdicts).
const reportLines = [
  '# NL-P6 Product QA Report',
  '',
  'Corrected A2-D060 standard: short-height desktop family including exact',
  '1408x445, existing-layout-shaped storage, real-window witness (see',
  'window-evidence.json), and a PER-CAPTURE usefulness judgment — a capture',
  'passes only if the composition is USEFUL at that size; rendering without',
  'error is not a pass. Verdicts: `useful` or `defect: <description>`.',
  '',
  '| Capture | Scenario | Viewport | State | Verdict |',
  '| --- | --- | --- | --- | --- |',
  ...evidence.cells.map((cell) => {
    const [scenarioId, vp, ...state] = cell.split(/-(?=\d)|-(?=normal|edit|hover)/)
    const parts = cell.split('-')
    const vpIndex = parts.findIndex((part) => /^\d+x\d+$/.test(part))
    const scenario = parts.slice(0, vpIndex).join('-')
    const viewport = parts[vpIndex]
    const stateName = parts.slice(vpIndex + 1).join('-')
    void scenarioId; void vp; void state
    return `| ![x](${cell}.png) | ${scenario} | ${viewport} | ${stateName} | _pending_ |`
  }),
  '',
  '## Findings',
  '',
  '_pending judgment pass_',
  '',
  '## Fixes',
  '',
  '_pending judgment pass_',
  '',
]
writeFileSync(resolve(outDir, 'QA-REPORT.md'), reportLines.join('\n'))
writeFileSync(resolve(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify({
  cells: evidence.cells.length,
  failures: evidence.failures,
  runtimeErrors: evidence.runtimeErrors,
  failedRequests: evidence.failedRequests,
}, null, 2))
if (caughtError) {
  console.error('NL-P6 SWEEP ERROR:', caughtError)
  process.exitCode = 1
} else if (evidence.failures.length > 0 || evidence.runtimeErrors.length > 0 || evidence.failedRequests.length > 0) {
  console.error('FAIL: NL-P6 sweep')
  process.exitCode = 1
} else {
  console.log('PASS: NL-P6 sweep')
}
