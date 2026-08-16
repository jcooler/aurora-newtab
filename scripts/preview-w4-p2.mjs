// Focused W4-P2 built-extension replay for deterministic, local-only Aurora
// Briefing synthesis. The historical matrix remains the packet's one full gate.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const profileDir = resolve('.playwright-profile-w4-p2')
const outDir = 'C:/Users/SickT/Documents/Codex/2026-08-16/change-aurora-execution-to-pragmatic-delivery/outputs/w4-p2'
const touchedKeys = ['settings', 'layout', 'connectors', 'connectorSnapshots', 'todoLists', 'location', 'weatherCache']
const expected = {
  compact: 'Design review in 48m',
  standard: 'Design review in 48m · 3 tasks need attention',
  display: 'Design review in 48m · 3 tasks need attention · Rain 7 PM',
}
const nowMs = new Date(2026, 7, 16, 12, 0).getTime()
const headed = process.argv.includes('--headed')

if (!profileDir.endsWith('.playwright-profile-w4-p2')) throw new Error(`unsafe profile path: ${profileDir}`)
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}
const exact = (actual, wanted) => JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(wanted))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 800, height: 600 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const page = await context.newPage()
let originalPreimage
let captureErrors = false
const runtimeErrors = []
const externalRequests = []
page.on('console', (message) => {
  if (captureErrors && message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => {
  if (captureErrors) runtimeErrors.push(`page: ${String(error)}`)
})
page.on('request', (request) => {
  if (captureErrors && /^https?:/.test(request.url())) externalRequests.push(request.url())
})

const waitForBriefing = async (text) => {
  await page.waitForSelector('main[data-adaptive-stage]')
  await page.waitForFunction((wanted) => {
    const nodes = [...document.querySelectorAll('[data-aurora-briefing] p')]
    const visible = nodes.filter((node) => getComputedStyle(node).display !== 'none')
    return visible.length === 1 && visible[0].textContent === wanted
  }, text)
  await page.waitForTimeout(100)
}

const observe = () => page.evaluate(() => {
  const briefing = document.querySelector('[data-aurora-briefing]')
  const greetingItem = briefing?.closest('[data-block-id="greeting"]')
  const greetingText = greetingItem?.querySelector('.aurora-greeting > p')
  const now = document.querySelector('[data-stage-zone="now"]')
  const paragraphs = [...(briefing?.querySelectorAll('p') ?? [])]
  const visible = paragraphs.filter((node) => getComputedStyle(node).display !== 'none')
  const rectOf = (node) => {
    if (!(node instanceof HTMLElement)) return null
    const rect = node.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
  }
  const briefingRect = rectOf(briefing)
  const greetingRect = rectOf(greetingItem)
  const contained = Boolean(briefingRect && greetingRect &&
    briefingRect.left >= greetingRect.left - 1 && briefingRect.right <= greetingRect.right + 1 &&
    briefingRect.top >= greetingRect.top - 1 && briefingRect.bottom <= greetingRect.bottom + 1)
  return {
    profile: document.documentElement.dataset.stageProfile,
    count: document.querySelectorAll('[data-aurora-briefing]').length,
    texts: paragraphs.map((node) => node.textContent),
    visibleTexts: visible.map((node) => node.textContent),
    visibleTextFits: visible.every((node) => node.scrollWidth <= node.clientWidth + 1),
    greetingOwner: greetingItem?.getAttribute('data-block-id'),
    greetingTextFits: greetingText instanceof HTMLElement && greetingText.scrollWidth <= greetingText.clientWidth + 1,
    nowIds: [...(now?.querySelectorAll(':scope > [data-block-id]') ?? [])].map((node) => node.getAttribute('data-block-id')),
    contained,
    noHorizontalPageClip: document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1,
  }
})

const capture = async (width, height, file, wanted) => {
  await page.setViewportSize({ width, height })
  await page.reload()
  await waitForBriefing(wanted)
  const observation = await observe()
  await page.screenshot({ path: `${outDir}/${file}` })
  return observation
}

const evidence = { captures: {}, cleanup: {} }
try {
  await page.clock.setFixedTime(nowMs)
  await page.goto('chrome://newtab/')
  await page.waitForSelector('main[data-adaptive-stage]')
  originalPreimage = await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys)
  await page.evaluate(async ({ fixedNow }) => {
    const { settings } = await chrome.storage.local.get('settings')
    const widgets = Object.fromEntries(Object.keys(settings.widgets).map((key) => [key, false]))
    widgets.search = true
    const ics = {
      enabled: true,
      calendars: [{ name: 'Work', url: 'https://calendar.example/private-token/basic.ics' }],
    }
    const canonical = (input) => {
      if (input === null) return 'null'
      if (typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number') return JSON.stringify(input)
      if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`
      return `{${Object.keys(input).filter((key) => input[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(input[key])}`).join(',')}}`
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const identity = `ics\n${canonical(ics)}\n${canonical({ timeZone })}`
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
    const scope = `ics:v2:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
    const location = { label: 'New York', lat: 40.71, lon: -74.01, manual: true }
    const weatherParams = new URLSearchParams()
    weatherParams.set('temperature_unit', 'celsius')
    weatherParams.set('wind_speed_unit', 'kmh')
    weatherParams.set('forecast_hours', '12')
    weatherParams.set('forecast_days', '1')
    weatherParams.set('timezone', 'auto')
    weatherParams.set('timeformat', 'iso8601')
    weatherParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day')
    weatherParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code,is_day')
    weatherParams.set('daily', 'sunrise,sunset')
    weatherParams.set('latitude', String(location.lat))
    weatherParams.set('longitude', String(location.lon))
    const requestIdentity = `open-meteo:v1:https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`
    await chrome.storage.local.set({
      settings: { ...settings, use24Hour: false, widgets, layoutDensity: 'auto' },
      layout: { version: 2, profiles: {} },
      connectors: { ics },
      connectorSnapshots: { ics: { scope, fetchedAt: fixedNow, data: { events: [{
        summary: 'Design review', start: fixedNow + 48 * 60_000, end: fixedNow + 78 * 60_000,
        allDay: false, cal: 0, meetUrl: 'https://zoom.us/j/private-capability',
      }] } } },
      todoLists: [{ id: 'today', name: 'Today', items: [
        { id: '1', text: 'One', done: false }, { id: '2', text: 'Two', done: false },
        { id: '3', text: 'Three', done: false }, { id: '4', text: 'Done', done: true },
      ] }],
      location,
      weatherCache: {
        current: { tempC: 20, feelsLikeC: 20, code: 1, windKmh: 5, humidity: 40 },
        hourly: [{ time: '2026-08-16T19:00', tempC: 18, precipProb: 70, code: 61 }],
        fetchedAt: fixedNow,
        locationLabel: location.label,
        requestIdentity,
      },
    })
  }, { fixedNow: nowMs })
  captureErrors = true

  evidence.captures.compact = await capture(800, 600, 'w4-p2-compact-800x600.png', expected.compact)
  evidence.captures.standard = await capture(1600, 900, 'w4-p2-standard-1600x900.png', expected.standard)
  evidence.captures.display = await capture(2560, 1440, 'w4-p2-display-2560x1440.png', expected.display)
  evidence.compactWide = await capture(600, 800, 'w4-p2-compact-wide-600x800.png', expected.compact)
  evidence.narrow = await capture(320, 800, 'w4-p2-compact-narrow-320x800.png', expected.compact)

  for (const [profile, observation] of Object.entries(evidence.captures)) {
    assert(observation.profile === profile, `${profile}: wrong profile ${observation.profile}`)
    assert(observation.count === 1 && exact(observation.visibleTexts, [expected[profile]]), `${profile}: visible Briefing mismatch`)
    assert(observation.visibleTextFits, `${profile}: Briefing received a second geometry-dependent truncation`)
    assert(observation.greetingOwner === 'greeting' && observation.contained, `${profile}: Briefing escaped Greeting ownership`)
    assert(observation.noHorizontalPageClip, `${profile}: horizontal page clipping`)
    assert(!observation.texts.join(' ').includes('private-token') && !observation.texts.join(' ').includes('zoom.us'), `${profile}: secret/capability text surfaced`)
  }
  assert(evidence.compactWide.profile === 'compact', `compact-wide: wrong profile ${evidence.compactWide.profile}`)
  assert(evidence.compactWide.greetingTextFits && evidence.compactWide.contained, 'compact-wide: Greeting or Briefing escaped its compact allocation')
  assert(evidence.narrow.profile === 'compact', `narrow: wrong profile ${evidence.narrow.profile}`)
  assert(evidence.narrow.greetingTextFits && evidence.narrow.contained, 'narrow: Greeting or Briefing escaped its compact allocation')
  assert(externalRequests.length === 0, `Briefing introduced external request(s): ${externalRequests.join(', ')}`)
  assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`)
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error)
} finally {
  captureErrors = false
  try {
    if (originalPreimage) {
      await page.evaluate(async ({ keys, snapshot }) => {
        const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(snapshot, key))
        if (missing.length > 0) await chrome.storage.local.remove(missing)
        if (Object.keys(snapshot).length > 0) await chrome.storage.local.set(snapshot)
      }, { keys: touchedKeys, snapshot: originalPreimage })
      evidence.cleanup.restored = exact(await page.evaluate((keys) => chrome.storage.local.get(keys), touchedKeys), originalPreimage)
    }
  } catch (error) {
    evidence.cleanup.error = error instanceof Error ? error.message : String(error)
  }
  await page.close().then(() => { evidence.cleanup.pageClosed = true })
  await context.close()
  rmSync(profileDir, { recursive: true, force: true })
}

console.log(`EVIDENCE: ${JSON.stringify({ ...evidence, externalRequests, runtimeErrors })}`)
if (evidence.error || !evidence.cleanup.restored || !evidence.cleanup.pageClosed) {
  console.error(`FAIL: W4-P2 Aurora Briefing semantics${evidence.error ? `: ${evidence.error}` : ''}`)
  process.exitCode = 1
} else {
  console.log('PASS: W4-P2 Aurora Briefing semantics')
}
