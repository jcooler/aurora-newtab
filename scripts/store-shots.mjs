// Chrome Web Store screenshot capture: sibling of scripts/preview.mjs,
// reusing its launch/seeding plumbing (persistent-context Playwright load of
// dist/, chrome.storage.local seeding, the same bookmarks-permission dance),
// but at the exact 1280x800 CWS screenshot format instead of preview.mjs's
// 1600x900 dev viewport, writing exactly 5 named PNGs to
// release/store-shots/ instead of screenshots/'s full state inventory.
//
// Usage: node scripts/store-shots.mjs [--headed]
// Prereq: npm run build:preview — same reason as preview.mjs: the bookmarks
// bar + folder popover shot (5) needs `bookmarks` held at install time,
// which only the preview build variant of src/manifest.ts provides (see its
// header comment). The preview build is otherwise byte-identical production
// UI/behavior — the ONLY difference is which permission bucket `bookmarks`
// sits in — so nothing in these 5 shots depicts anything a real install
// can't do; shots 1-4 don't touch bookmarks at all and would look identical
// from a `npm run build` dist.
//
// BLUR FIX (2026-08-01, Jon-reported the shipped shots were blurry): two
// independent causes, both fixed here.
//
// (1) Mid-fade capture. Background.tsx fades each photo in via a 700ms
// opacity-0 -> opacity-100 CSS transition, and every navigation/reload/
// theme-swap that (re)mounts or re-sources the <img> restarts it. A fixed
// `waitForTimeout` guess is exactly the bug preview.mjs already hit and
// documented (see its viewport-matrix loop's comment: a flat 250ms wait
// once screenshotted a washed-out, low-contrast mid-fade frame at 2560x1440,
// not the plain gradient fallback but not the real photo either). The fix,
// copied verbatim in spirit here as `waitForPhotoFade` below: wait for the
// actual condition — the img's own opacity-100 CLASS, which Background.tsx
// flips the instant onLoad fires — then an 800ms settle for the CSS
// transition itself to finish, same constant preview.mjs uses everywhere
// for "photo fade-in". Applied before EVERY one of the 5 captures below,
// not just the ones immediately after an explicit reload — cheap insurance
// against any subtler re-source path.
//
// (2) 1x rasterization. CWS screenshots must be exactly 1280x800, but
// capturing AT 1280x800 with deviceScaleFactor 1 rasterizes UI/text edges
// at native (non-supersampled) resolution — soft compared to what a real
// HiDPI display renders. Fix: launch at deviceScaleFactor 2 (viewport stays
// 1280x800 logical, so nothing about the captured CONTENT/layout changes —
// see pickTier's own doc; a 2x DSF here also legitimately raises the served
// photo tier to 3840x2400, the correct call per pickTier's "generous"
// policy), capture the resulting 2560x1600 raw screenshot, then downscale
// to EXACTLY 1280x800 with sharp's lanczos3 kernel (its default for
// resize) — text/UI edges come out supersampled-crisp instead of soft.
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'

const dist = resolve('dist')
const outDir = resolve('release/store-shots')
const profileDir = resolve('.playwright-profile-store-shots') // separate from preview.mjs's own profile
const headed = process.argv.includes('--headed')
const WIDTH = 1280 // final CWS output dimensions — unchanged
const HEIGHT = 800
const DSF = 2 // 2x supersampled capture; downscaled to WIDTHxHEIGHT below

const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'))
if ((manifest.permissions ?? []).includes('bookmarks') === false) {
  console.error(
    'ERROR: dist/manifest.json does not hold `bookmarks` as an install-time permission.\n' +
      '       Run `npm run build:preview` (not `npm run build`) before this script — see\n' +
      '       this file\'s header comment and src/manifest.ts for why.',
  )
  process.exit(1)
}

rmSync(profileDir, { recursive: true, force: true }) // fresh storage every run
mkdirSync(outDir, { recursive: true })

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: WIDTH, height: HEIGHT }, // logical CSS size — layout/composition unchanged
  deviceScaleFactor: DSF, // 2x supersampled raw capture; sharp downscales to exactly WIDTHxHEIGHT below
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})

const page = await context.newPage()
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

// Fade-wait idiom, lifted from preview.mjs's viewport-matrix loop (see its
// own comment for the mid-fade capture it caught): don't guess a fixed
// delay — wait for Background.tsx's own opacity-100 CLASS flip (fires the
// instant the <img> onLoad's), then let the 700ms CSS opacity transition
// actually finish. `div[aria-hidden] > img` absent is also a valid steady
// state (gradient mode) — hence `? … : true` rather than requiring one to
// exist. Best-effort: screenshot honestly either way rather than hanging.
async function waitForPhotoFade(page) {
  await page
    .waitForFunction(
      () => {
        const img = document.querySelector('div[aria-hidden] > img')
        return img ? img.classList.contains('opacity-100') : true
      },
      { timeout: 5000 },
    )
    .catch(() => {})
  await page.waitForTimeout(800) // duration-700 transition + margin, same constant as preview.mjs
}

// Every capture funnels through here: fade-wait first (every one of the 5
// shots sits over the same fading background photo, not just the ones
// immediately after an explicit reload), then a 2x supersampled raw
// screenshot (buffer, no path — see DSF above) downscaled with sharp's
// lanczos3 kernel to EXACTLY WIDTHxHEIGHT before writing the PNG.
async function captureShot(page, outPath, label) {
  await waitForPhotoFade(page)
  const raw = await page.screenshot()
  await sharp(raw).resize(WIDTH, HEIGHT, { kernel: sharp.kernel.lanczos3 }).png().toFile(outPath)
  console.log(`captured ${label}`)
}

await page.goto('chrome://newtab/')
console.log('newtab resolved to:', page.url())
await page.waitForSelector('time', { timeout: 10_000 })

// Deterministic seed, same idiom as preview.mjs: a manual New York location
// (real Open-Meteo call — acceptable here, never in unit tests), two quick
// links, and photoPrefs pinned to bundled index 0 — "01-Ovn1hyBge38", an
// actual aurora-borealis photo (see src/services/photos/photos.json) — so
// the hero shot's "an aurora photo" is exact, not whatever today's
// hash-rotation happens to land on.
const hasBookmarksPermission = await page.evaluate(() =>
  chrome.permissions.contains({ permissions: ['bookmarks'] }),
)
if (!hasBookmarksPermission) {
  console.error('ERROR: bookmarks permission not held at runtime despite being in the manifest — aborting.')
  process.exit(1)
}

await page.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings')
  const y = new Date().getFullYear()
  const m = String(new Date().getMonth() + 1).padStart(2, '0')
  const d = String(new Date().getDate()).padStart(2, '0')
  const today = `${y}-${m}-${d}` // matches src/lib/dates.ts's todayKey format
  await chrome.storage.local.set({
    location: { lat: 40.71, lon: -74.01, label: 'New York', manual: true },
    links: [
      { id: 'l1', title: 'GitHub', url: 'https://github.com' },
      { id: 'l2', title: 'HN', url: 'https://news.ycombinator.com' },
    ],
    photoPrefs: { mode: 'auto', index: 0, lastRotated: today },
    settings: {
      ...settings,
      widgets: { ...settings.widgets, timer: true, bookmarks: true, notes: true, todo: true },
    },
  })
  // Real chrome.bookmarks tree — same shape as preview.mjs's seed — so shot
  // 5 (bookmarks bar + folder popover) shows real chips, not an empty bar.
  const bar = '1'
  const dev = await chrome.bookmarks.create({ parentId: bar, title: 'Dev' })
  await chrome.bookmarks.create({ parentId: dev.id, title: 'GitHub', url: 'https://github.com/' })
  await chrome.bookmarks.create({ parentId: dev.id, title: 'MDN', url: 'https://developer.mozilla.org/' })
  const tools = await chrome.bookmarks.create({ parentId: dev.id, title: 'Tools' })
  await chrome.bookmarks.create({ parentId: tools.id, title: 'Excalidraw', url: 'https://excalidraw.com/' })
  const news = await chrome.bookmarks.create({ parentId: bar, title: 'News' })
  await chrome.bookmarks.create({ parentId: news.id, title: 'HN', url: 'https://news.ycombinator.com/' })
  await chrome.bookmarks.create({ parentId: bar, title: 'Docs', url: 'https://docs.example.com/' })
})
await page.reload()
await page.waitForSelector('time')
await page.waitForTimeout(2500) // weather fetch
await waitForPhotoFade(page)

// ---------------------------------------------------------------------------
// Shot 1 — hero: clean newtab with an aurora photo. Nothing open, default
// widget set (weather pill, quick links, quote, clock/greeting, search) over
// the pinned aurora-borealis background.
// ---------------------------------------------------------------------------
await captureShot(page, `${outDir}/1-hero.png`, '1-hero.png')

// ---------------------------------------------------------------------------
// Shot 2 — arrange mode mid-drag with guides. Same real long-press + drag
// gesture preview.mjs's arrange probe uses (Playwright mouse events against
// the built extension, not a synthetic jsdom event), stopped mid-drag so the
// drop-target outline and snap guides are visible, captured BEFORE mouseup.
// ---------------------------------------------------------------------------
const clockCenter = await page.evaluate(() => {
  const r = document.querySelector('[data-block-id="clock"]').getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
await page.mouse.move(clockCenter.x, clockCenter.y)
await page.mouse.down()
await page.waitForTimeout(650) // long-press threshold
await page.waitForSelector('[data-arrange-overlay] button:has-text("Done")', { timeout: 2000 })

const dropTarget = { x: WIDTH / 2 - 120, y: HEIGHT / 2 } // crosses the horizontal center guide
const dragSteps = 12
for (let i = 1; i <= dragSteps; i++) {
  const x = clockCenter.x + ((dropTarget.x - clockCenter.x) * i) / dragSteps
  const y = clockCenter.y + ((dropTarget.y - clockCenter.y) * i) / dragSteps
  await page.mouse.move(x, y)
  await page.waitForTimeout(35)
}
await captureShot(page, `${outDir}/2-arrange-mode.png`, '2-arrange-mode.png')

await page.mouse.up()
await page.waitForTimeout(300)
await page.click('[data-arrange-overlay] button:has-text("Done")')
await page.waitForTimeout(300)

// Reset the layout so nothing captured below inherits the dragged position —
// same discipline as preview.mjs's own arrange block.
await page.mouse.move(dropTarget.x, dropTarget.y)
await page.mouse.down()
await page.waitForTimeout(650)
await page.waitForSelector('[data-arrange-overlay] button:has-text("Done")', { timeout: 2000 })
await page.mouse.up()
await page.waitForTimeout(150)
await page.click('[data-arrange-overlay] button:has-text("Reset")')
await page.waitForTimeout(150)
await page
  .locator('[aria-label="Reset layout?"]')
  .getByRole('button', { name: 'Reset layout' })
  .click()
await page.waitForTimeout(150)
await page.click('[data-arrange-overlay] button:has-text("Done")')
await page.waitForTimeout(300)
await page.reload()
await page.waitForSelector('time')
await waitForPhotoFade(page)

// ---------------------------------------------------------------------------
// Shot 3 — weather widget's location search, live typeahead suggestions
// visible. Real network call to Open-Meteo's geocoder (see geocode.ts), same
// as preview.mjs's own location-typeahead probe. LocationSetup only renders
// when `location` is null (WeatherWidget.tsx) — mutually exclusive with the
// expanded feels-like/wind/humidity/sun-times detail row, which needs a
// location AND a snapshot — so this shot captures the widget's other real
// "expanded" state: opened up to search, mid-suggestion, rather than
// compositing two states that can never appear on screen at once.
// ---------------------------------------------------------------------------
await page.evaluate(() => chrome.storage.local.set({ location: null }))
await page.waitForSelector('[role="combobox"][aria-label="Search for a city"]')
await page.click('[role="combobox"][aria-label="Search for a city"]')
await page.keyboard.type('Dall', { delay: 60 })
await page.waitForSelector('[role="listbox"]', { timeout: 5000 }).catch(() => {})
await page.waitForTimeout(200)
await captureShot(page, `${outDir}/3-weather-location-search.png`, '3-weather-location-search.png')

// Restore the seeded location for the remaining shots.
await page.keyboard.press('Escape')
await page.evaluate(() =>
  chrome.storage.local.set({ location: { lat: 40.71, lon: -74.01, label: 'New York', manual: true } }),
)
await page.waitForTimeout(2500) // weather re-fetch

// ---------------------------------------------------------------------------
// Shot 4 — Glass theme, with panels open. Tasks/Timer/Notes are independent
// fixed-position floating panels (App.tsx), not modal — they can be open
// simultaneously (preview.mjs's own comment on why it closes Tasks/Timer
// before the Palette shot only, not because they can't coexist). Opening
// all three shows the Glass theme's translucent panel treatment across
// several widgets at once, which is the point of a theme screenshot.
// ---------------------------------------------------------------------------
await page.click('button[aria-label="Open settings"]')
await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
await page.waitForTimeout(400)
await page.click('[role="radio"]:has-text("Glass")')
await page.waitForTimeout(150)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

await page.click('button:has-text("Tasks")')
await page.waitForSelector('[role="dialog"][aria-label="Tasks"]')
await page.fill('#todo-add-item', 'Ship Aurora')
await page.press('#todo-add-item', 'Enter')
await page.click('button[aria-label^="Focus timer"]')
await page.waitForSelector('[role="dialog"][aria-label="Focus timer"]')
await page.click('button:has-text("Notes")')
await page.waitForSelector('[role="dialog"][aria-label="Notes"]')
await page.waitForTimeout(200)
await captureShot(page, `${outDir}/4-glass-theme-panels.png`, '4-glass-theme-panels.png')

await page.click('button:has-text("Tasks")')
await page.click('button[aria-label^="Focus timer"]')
await page.click('button:has-text("Notes")')
await page.waitForTimeout(150)

// Restore the default theme before the last shot, same discipline as
// preview.mjs.
await page.click('button[aria-label="Open settings"]')
await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
await page.waitForTimeout(400)
await page.click('[role="radio"]:has-text("Aurora")')
await page.waitForTimeout(150)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ---------------------------------------------------------------------------
// Shot 5 — bookmarks bar + open folder popover. Requires the preview build
// (see header comment); real click, real hit-testing, same as
// preview.mjs's own bookmarks-popover capture.
// ---------------------------------------------------------------------------
await page.click('nav[aria-label="Bookmarks bar"] button:has-text("Dev")')
await page.waitForSelector('[role="dialog"][aria-label="Dev bookmarks"]')
await page.waitForTimeout(150)
await captureShot(page, `${outDir}/5-bookmarks-popover.png`, '5-bookmarks-popover.png')

console.log('')
if (errors.length) console.log('console errors:', errors)
else console.log('no console errors')

await context.close()

// Dimension gate: CWS requires exactly 1280x800 — verify what actually
// landed on disk (sharp's own metadata read, i.e. the PNG's real IHDR),
// not just trust the resize call above didn't silently do something else.
console.log('')
const shots = [
  '1-hero.png',
  '2-arrange-mode.png',
  '3-weather-location-search.png',
  '4-glass-theme-panels.png',
  '5-bookmarks-popover.png',
]
let allPass = true
for (const name of shots) {
  const { width, height } = await sharp(`${outDir}/${name}`).metadata()
  const pass = width === WIDTH && height === HEIGHT
  if (!pass) allPass = false
  console.log(
    pass
      ? `PASS: ${name} is ${WIDTH}x${HEIGHT}`
      : `FAIL: ${name} is ${width}x${height}, expected ${WIDTH}x${HEIGHT}`,
  )
}
if (!allPass) process.exitCode = 1
