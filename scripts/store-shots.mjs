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
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const outDir = resolve('release/store-shots')
const profileDir = resolve('.playwright-profile-store-shots') // separate from preview.mjs's own profile
const headed = process.argv.includes('--headed')
const WIDTH = 1280
const HEIGHT = 800

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
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1, // CWS wants exactly 1280x800 pixels — no HiDPI upscale
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})

const page = await context.newPage()
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

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
await page.waitForTimeout(800) // photo fade-in

// ---------------------------------------------------------------------------
// Shot 1 — hero: clean newtab with an aurora photo. Nothing open, default
// widget set (weather pill, quick links, quote, clock/greeting, search) over
// the pinned aurora-borealis background.
// ---------------------------------------------------------------------------
await page.screenshot({ path: `${outDir}/1-hero.png` })
console.log('captured 1-hero.png')

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
await page.screenshot({ path: `${outDir}/2-arrange-mode.png` })
console.log('captured 2-arrange-mode.png')

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
await page.waitForTimeout(800)

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
await page.screenshot({ path: `${outDir}/3-weather-location-search.png` })
console.log('captured 3-weather-location-search.png')

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
await page.screenshot({ path: `${outDir}/4-glass-theme-panels.png` })
console.log('captured 4-glass-theme-panels.png')

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
await page.screenshot({ path: `${outDir}/5-bookmarks-popover.png` })
console.log('captured 5-bookmarks-popover.png')

console.log('')
if (errors.length) console.log('console errors:', errors)
else console.log('no console errors')

await context.close()
