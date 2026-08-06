// Dev-time preview harness: loads the built extension (dist/) in Chromium via
// Playwright, opens the new-tab override, and captures screenshots to
// screenshots/. Never ships in the extension.
//
// Usage: node scripts/preview.mjs [--headed]
// Prereq: npm run build:preview (loads dist/, not src/) — the PREVIEW build
// (src/manifest.ts, gated on Vite mode 'preview') holds the `bookmarks`
// permission at install time instead of optional-only, which is what lets
// the bookmarks probes below actually run instead of printing the SKIP line
// (see the hasBookmarksPermission check further down). A plain `npm run
// build` still loads and runs everything else fine — bookmarks capture just
// SKIPs honestly, same as it always has for a production dist.
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dist = resolve('dist')
const outDir = resolve('screenshots')
const profileDir = resolve('.playwright-profile')
const headed = process.argv.includes('--headed')

rmSync(profileDir, { recursive: true, force: true }) // fresh storage every run
mkdirSync(outDir, { recursive: true })

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chromium', // full build in new-headless mode: extensions supported
  headless: !headed,
  viewport: { width: 1600, height: 900 },
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

// Seed a manual location so weather renders deterministically-ish (live
// Open-Meteo call; acceptable for preview, never for unit tests). Also flip
// on the timer, clocks, and countdown widgets, which default to off — merge
// into the existing settings so other keys (theme, etc.) aren't clobbered.
//
// bookmarks is now an OPTIONAL permission (src/manifest.ts), requested at
// runtime from Settings' click handler rather than held at install. Chrome
// never auto-grants an optional permission just because it's listed in the
// manifest, and chrome.permissions.request() only shows its prompt when
// called from a user gesture — which Playwright's page.evaluate() is not,
// and there's no way to click through a native Chrome permission dialog
// under automation either. So: check whether the permission is already
// held (it won't be, on the fresh profile this script always starts from —
// see the rmSync above) and only seed the bookmarks tree / flip the widget
// on / run the popover capture below if it somehow is. Otherwise, skip that
// slice of the capture with an honest line rather than crashing on
// chrome.bookmarks being undefined.
const hasBookmarksPermission = await page.evaluate(() =>
  chrome.permissions.contains({ permissions: ['bookmarks'] }),
)
if (!hasBookmarksPermission) {
  console.log('SKIP: bookmarks capture (optional permission not grantable headlessly)')
}

// The countdown date is computed as today+14 right here inside the page
// context, so the preview stays deterministic relative to whenever it runs
// rather than hardcoding a date that eventually lands in the past.
await page.evaluate(
  async (grantBookmarks) => {
    const { settings } = await chrome.storage.local.get('settings')
    const in14Days = new Date()
    in14Days.setDate(in14Days.getDate() + 14)
    const launchDate = in14Days.toISOString().slice(0, 10)
    await chrome.storage.local.set({
      location: { lat: 40.71, lon: -74.01, label: 'New York', manual: true },
      links: [
        { id: 'l1', title: 'GitHub', url: 'https://github.com' },
        { id: 'l2', title: 'HN', url: 'https://news.ycombinator.com' },
      ],
      worldClocks: [
        { zone: 'Asia/Tokyo', label: 'Tokyo' },
        { zone: 'Europe/London', label: 'London' },
      ],
      countdowns: [{ id: 'c1', name: 'Launch', date: launchDate }],
      settings: {
        ...settings,
        widgets: {
          ...settings.widgets,
          timer: true,
          bookmarks: grantBookmarks,
          clocks: true,
          countdown: true,
        },
      },
    })
    if (!grantBookmarks) return
    // Headless Chromium starts with an EMPTY bookmarks tree, but the
    // extension holds the `bookmarks` permission here, so this populates
    // the real tree via chrome.bookmarks.create — the bar renders real
    // chips and the popover capture further down exercises real
    // hit-testing (the transformed-nav backdrop bug shipped precisely
    // because this used to be assumed impossible). The profile dir is
    // wiped at the top of every run, so the seed never duplicates.
    const bar = '1' // Chromium's bookmarks-bar node id
    const dev = await chrome.bookmarks.create({ parentId: bar, title: 'Dev' })
    await chrome.bookmarks.create({ parentId: dev.id, title: 'GitHub', url: 'https://github.com/' })
    await chrome.bookmarks.create({ parentId: dev.id, title: 'MDN', url: 'https://developer.mozilla.org/' })
    const tools = await chrome.bookmarks.create({ parentId: dev.id, title: 'Tools' })
    await chrome.bookmarks.create({ parentId: tools.id, title: 'Excalidraw', url: 'https://excalidraw.com/' })
    const news = await chrome.bookmarks.create({ parentId: bar, title: 'News' })
    await chrome.bookmarks.create({ parentId: news.id, title: 'HN', url: 'https://news.ycombinator.com/' })
    await chrome.bookmarks.create({ parentId: bar, title: 'Docs', url: 'https://docs.example.com/' })
  },
  hasBookmarksPermission,
)
await page.reload()
await page.waitForSelector('time')
await page.waitForTimeout(2500) // weather fetch

await page.waitForTimeout(800) // photo fade-in
await page.screenshot({ path: `${outDir}/newtab.png` })
console.log('captured newtab.png')

// Cross-tab no-flicker invariant (2026-08-06 flicker investigation, Task 2 of
// the 2026-08-06-cleanup-queue). Jon reported that opening a new tab makes an
// already-open new-tab page's background photo reload/flicker ("seems like
// each browser is connected"). Investigated via superpowers:systematic-
// debugging: the suspected mechanism — tab B's mount triggering a photoPrefs
// rotation (or DPR-tier) write whose chrome.storage.onChanged echo reaches
// tab A and remounts Background's `key={src}` <img> — was FALSIFIED by
// direct measurement (throwaway two-page probes: sequential-already-stable,
// concurrent-mount race on a fresh profile, upload-gallery mode, a direct
// check that chrome.storage.onChanged skips deep-equal writes, and a check
// that opening a tab fires no `resize` on siblings — none produced a remount
// or reload). The design is race-safe by construction: the rotation index is
// a pure function of the day (hashDay(today) % count in
// src/services/photos/rotation.ts), so independent tabs converge on the same
// value even when racing to be the day's first rotation; DPR tier
// (src/services/photos/tier.ts) is never persisted to storage at all, so
// there is no possible echo path for it. This probe locks that invariant
// permanently so a future on-mount storage write (e.g. a v2 connector
// polling/refreshing its own state on open) can't silently reintroduce the
// echo-remount bug without breaking this harness run.
{
  const bgImg = await page.evaluateHandle(
    () => document.querySelector('div[aria-hidden] > img'),
  )
  const before = await page.evaluate(
    (img) => (img ? { src: img.src, className: img.className } : null),
    bgImg,
  )
  // Snapshot photoPrefs before part (b)'s own refresh click below advances
  // it, so it can be restored afterward — otherwise every downstream
  // capture (weather-expanded*, the viewport-* matrix, arrange-mode,
  // panels, palette) would render one photo ahead of a clean run. Same
  // restoration discipline this file already uses for Source/theme/layout/
  // location/viewport (see the "Restore the …" comments further down).
  const originalPhotoPrefs = await page.evaluate(
    async () => (await chrome.storage.local.get('photoPrefs')).photoPrefs,
  )

  // (a) Opening a second page in the SAME context must not remount or
  // re-fade page A's already-settled background photo — the exact
  // "already-open tab" scenario Jon described.
  const flickerPageB = await context.newPage()
  await flickerPageB.goto('chrome://newtab/')
  await flickerPageB.waitForSelector('time', { timeout: 10_000 })
  await flickerPageB
    .waitForFunction(
      () => {
        const img = document.querySelector('div[aria-hidden] > img')
        return img ? img.classList.contains('opacity-100') : true
      },
      { timeout: 10_000 },
    )
    .catch(() => {})
  await page.waitForTimeout(500) // let any onChanged echo + re-render settle

  const after = await page.evaluate(
    (img) => (img ? { sameNode: document.querySelector('div[aria-hidden] > img') === img, className: img.className } : null),
    bgImg,
  )
  const noFlicker =
    before !== null &&
    after !== null &&
    after.sameNode === true &&
    after.className === before.className
  console.log(
    noFlicker
      ? "PASS: opening a second page does not remount/re-fade an already-open page's background photo"
      : `FAIL: opening a second page does not remount/re-fade an already-open page's background photo (before=${JSON.stringify(before)}, after=${JSON.stringify(after)})`,
  )

  // (b) Deliberate cross-tab sync must still work: a real settings change
  // (the refresh button) in page B must still reach page A and swap its
  // photo. This is the ONE mechanism that's SUPPOSED to remount cross-tab —
  // proving it still does guards against an over-broad fix in either
  // direction.
  await flickerPageB.click('button[aria-label="New background photo"]')
  await page.waitForTimeout(500)
  const afterRefresh = await page.evaluate(
    (img) => {
      const current = document.querySelector('div[aria-hidden] > img')
      return { sameNode: current === img, src: current ? current.src : null }
    },
    bgImg,
  )
  const syncWorked =
    before !== null && afterRefresh.sameNode === false && afterRefresh.src !== before.src
  console.log(
    syncWorked
      ? "PASS: a deliberate background-photo change in page B still remounts page A's photo (cross-tab sync intact)"
      : `FAIL: a deliberate background-photo change in page B still remounts page A's photo (before=${JSON.stringify(before)}, afterRefresh=${JSON.stringify(afterRefresh)})`,
  )

  // Restore photoPrefs to its pre-probe value (see the snapshot above) so
  // this probe leaves no trace in any capture below — the resulting remount
  // back to the original src is expected and harmless here, since it
  // happens before any downstream screenshot reads the photo.
  if (before !== null) {
    await page.evaluate(
      (prefs) => chrome.storage.local.set({ photoPrefs: prefs }),
      originalPhotoPrefs,
    )
    await page.waitForFunction(
      (expectedSrc) => {
        const img = document.querySelector('div[aria-hidden] > img')
        return img ? img.src === expectedSrc && img.classList.contains('opacity-100') : false
      },
      before.src,
      { timeout: 10_000 },
    )
    await page.waitForTimeout(800) // photo fade-in, same wait this file uses everywhere else
  }

  await flickerPageB.close()
}

// Bookmarks-bar popover: REAL click on a folder chip (real hit-testing — the
// one thing jsdom can't do), assert the popover opened anchored to it, then
// (below) exercise real clickability of what's INSIDE it, real chip-to-chip
// switching, and a real outside click closing it. Only reachable if the
// bookmarks permission was actually held above — the bar itself doesn't
// render without it (see BookmarksBar.tsx's permission check), so the SKIP
// line was already printed at seed time. Under a production build this is
// always the SKIP path (bookmarks stays optional-only there); a preview
// build (`npm run build:preview`) is what makes hasBookmarksPermission true
// so this whole block actually runs — see the header comment above.
if (hasBookmarksPermission) {
  await page.click('nav[aria-label="Bookmarks bar"] button:has-text("Dev")')
  await page.waitForSelector('[role="dialog"][aria-label="Dev bookmarks"]')
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${outDir}/bookmarks-popover.png` })
  console.log('captured bookmarks-popover.png')

  // (a) Real clickability inside the open popover — this IS the bug
  // (bookmarks-stacking fix): FolderPopover's body-portaled click-outside
  // catcher used to paint ABOVE the entire bar and open panel (a wrapper
  // `-translate-x-1/2` made the wrapper both a new containing block and a
  // new stacking context — see App.tsx's comment on the bookmarks
  // PositionedBlock for the full root-cause writeup), so
  // `document.elementFromPoint` at a link's center resolved to the catcher,
  // not the link — every click inside an open popover landed on the
  // catcher (closing it) instead of following the link. A REAL
  // page.click() + navigation assertion is the strongest available proof
  // the click actually reaches the anchor: Playwright's own actionability
  // check ("receives events", i.e. not obscured by another element at that
  // point) will itself throw if the catcher is still on top, and even if
  // it somehow didn't, a click that lands on the catcher instead of the
  // link never navigates — either way this fails honestly rather than
  // silently passing. "Dev" is a folder chip (opened above); its
  // top-level popover lists "Tools" (a subfolder) then its two loose
  // bookmarks, "GitHub" first — see the seed further up and
  // services/bookmarks.ts's mapFolder for the folders-then-items order.
  let reachedGitHub = false
  try {
    await page.click('[role="dialog"][aria-label="Dev bookmarks"] a:has-text("GitHub")', {
      timeout: 5000,
    })
    reachedGitHub = await page.waitForURL(/github\.com/, { timeout: 5000 }).then(
      () => true,
      () => false,
    )
  } catch {
    reachedGitHub = false
  }
  console.log(
    reachedGitHub
      ? 'PASS: clicking a bookmark link inside an open popover navigates (real hit-testing reaches the link, not the click-outside catcher)'
      : 'FAIL: clicking a bookmark link inside an open popover navigates (real hit-testing reaches the link, not the click-outside catcher)',
  )
  if (reachedGitHub) {
    await page.goBack()
    await page.waitForSelector('time')
    await page.waitForTimeout(800) // photo fade-in, same as every other reload in this script
  }

  // (b) Chip-to-chip switching — the OTHER casualty of the same stacking
  // bug: with the catcher painting above the bar, clicking a DIFFERENT chip
  // while a popover was open landed on the catcher too (just closing the
  // open popover) instead of reaching the other chip's own button, which
  // should switch popovers directly. Re-open Dev (navigating away above, if
  // it succeeded, closed it — a fresh click either way keeps this
  // independent of whether (a) passed or failed), then click News — a
  // different folder chip — while Dev is still open.
  await page.click('nav[aria-label="Bookmarks bar"] button:has-text("Dev")')
  await page.waitForSelector('[role="dialog"][aria-label="Dev bookmarks"]')
  await page.click('nav[aria-label="Bookmarks bar"] button:has-text("News")')
  const switchedToNews = await page
    .waitForSelector('[role="dialog"][aria-label="News bookmarks"]', { timeout: 2000 })
    .then(() => true, () => false)
  const devPopoverGone = (await page.locator('[role="dialog"][aria-label="Dev bookmarks"]').count()) === 0
  console.log(
    switchedToNews && devPopoverGone
      ? 'PASS: clicking a different chip while a popover is open switches to it'
      : 'FAIL: clicking a different chip while a popover is open switches to it',
  )

  // Outside click must dismiss whichever popover is currently open — News,
  // per the switch above (or Dev, if (b) itself somehow failed to switch).
  // Scoped to that ONE aria-label rather than a bare `[role="dialog"]`:
  // Drawer.tsx keeps the Settings drawer's own `role="dialog"` element
  // permanently mounted (just visually/inertly closed, not unmounted), so
  // an unscoped selector would never see ANY matching element fully
  // detach and this would hang/timeout regardless of whether the bookmarks
  // popover itself actually closed.
  const openLabel = switchedToNews ? 'News bookmarks' : 'Dev bookmarks'
  await page.waitForTimeout(150)
  await page.mouse.click(800, 500) // outside click must dismiss
  const popoverGone = await page
    .waitForSelector(`[role="dialog"][aria-label="${openLabel}"]`, { state: 'detached', timeout: 2000 })
    .then(() => true, () => false)
  console.log(popoverGone ? 'PASS: outside click closed the bookmarks popover' : 'FAIL: bookmarks popover did not close on outside click')
}

// Open the settings drawer and capture it per theme, plus a floating panel
// (Tasks) per theme — the drawer's own bg-panel was already themed before
// this fix; the bug Jon reported (folders widget not re-theming) lived in
// the OTHER kind of surface, floating popovers/panels, which used to
// hardcode bg-[#17171c]/95 regardless of theme. Gating only the drawer per
// theme, as this loop used to, would never have caught that.
await page.click('button[aria-label="Open settings"]')
await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
await page.waitForTimeout(400) // slide-in transition
for (const theme of ['Aurora', 'Glass', 'Mono']) {
  await page.click(`[role="radio"]:has-text("${theme}")`)
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${outDir}/drawer-${theme.toLowerCase()}.png` })
  console.log(`captured drawer-${theme.toLowerCase()}.png`)

  // A floating panel, same theme. The drawer's own z-40 backdrop covers the
  // whole viewport while open and would eat a real click on the Tasks pill
  // underneath it, so close the drawer first.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400) // slide-out transition
  await page.click('button:has-text("Tasks")')
  await page.waitForSelector('[role="dialog"][aria-label="Tasks"]')
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${outDir}/theme-${theme.toLowerCase()}-panel.png` })
  console.log(`captured theme-${theme.toLowerCase()}-panel.png`)
  await page.click('button:has-text("Tasks")') // close it again
  await page.waitForTimeout(150)

  // Jon's actual reported widget — the bookmarks folder popover — re-themes
  // too. Gated on Mono specifically (the theme with no border/blur to lean
  // on, so a wrong fill is most visible there) and on hasBookmarksPermission
  // the same way the main bookmarks probes above are (only real under a
  // preview build; see that block's header comment).
  if (hasBookmarksPermission && theme === 'Mono') {
    await page.click('nav[aria-label="Bookmarks bar"] button:has-text("Dev")')
    await page.waitForSelector('[role="dialog"][aria-label="Dev bookmarks"]')
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${outDir}/theme-mono-popover.png` })
    console.log('captured theme-mono-popover.png')
    await page.mouse.click(800, 500) // outside click closes it
    await page.waitForTimeout(150)
  }

  // Reopen the drawer — either for the next theme iteration, or (on the
  // last one) for the Data-section capture that immediately follows this
  // loop, which expects the drawer already open.
  await page.click('button[aria-label="Open settings"]')
  await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
  await page.waitForTimeout(400)
}

// Restore the default theme: every capture from here on (todo/timer/notes/
// palette/arrange/gallery) must show Aurora, matching what's already
// committed — not whatever theme the loop above happened to end on.
await page.click('[role="radio"]:has-text("Aurora")')
await page.waitForTimeout(150)

// The drawer scrolls internally; the new Data section (export/import backup)
// sits below the fold at this viewport height, so scroll it into view for a
// dedicated screenshot rather than relying on the per-theme captures above.
await page.locator('section[aria-label="Data"]').scrollIntoViewIfNeeded()
await page.waitForTimeout(150)
await page.screenshot({ path: `${outDir}/drawer-data.png` })
console.log('captured drawer-data.png')

// The quiet support-link footer (src/settings/sections/About.tsx) sits below
// Layout, past the bottom of the drawer at this viewport height — a
// dedicated capture proves it renders (version text + the Buy Me a Coffee
// link) for the controller's visual gate, without disturbing the
// drawer-data.png capture above.
await page.locator('footer').scrollIntoViewIfNeeded()
await page.waitForTimeout(150)
await page.screenshot({ path: `${outDir}/drawer-footer.png` })
console.log('captured drawer-footer.png')

// Close the drawer, then expand the weather widget's hourly forecast
await page.keyboard.press('Escape')
await page.waitForTimeout(400) // slide-out transition
await page.click('section[aria-label="Weather"] button')
await page.waitForTimeout(150)
await page.screenshot({ path: `${outDir}/weather-expanded.png` })
console.log('captured weather-expanded.png')

// Narrow-viewport expanded captures (Task 1 redesign — bigger hourly cards,
// a structured meta row, and the full-forecast link all need to keep
// reading cleanly at the two tightest shapes this app is tuned for, not
// just the roomy 1600x900 launch size above). 1420x437 is the owner's own
// short-wide window that originally motivated the xshort/tight/narrow
// variants (xshort height, but width stays over the 1300px `tight`
// threshold — see index.css's custom-variant comment); 800x450 stacks
// xshort height on top of BOTH narrow and tight width, the tightest
// combination the panel's own `tight:max-w-[30vw]` cap ever sees (30vw of
// 800 is only 240px). The panel is already expanded from the capture just
// above — a resize alone reflows it, no re-click needed.
async function waitForPhotoSettle() {
  // Same condition-wait as the viewport matrix further down: the photo
  // layer's own opacity-100 class (Background.tsx's resize-triggered tier
  // swap can fetch+decode a new AVIF on a large enough jump) plus an 800ms
  // settle for the CSS opacity transition to actually finish, not just
  // start. Neither narrow capture below crosses the 2.5K/4K tier boundary
  // (both are smaller than the 1600x900 launch size), so this is normally a
  // fast no-op — kept for the same reason the matrix below keeps it: honest
  // under a slower run rather than assuming today's tier math forever.
  await page
    .waitForFunction(
      () => {
        const img = document.querySelector('div[aria-hidden] > img')
        return img ? img.classList.contains('opacity-100') : true
      },
      { timeout: 5000 },
    )
    .catch(() => {})
  await page.waitForTimeout(800)
}
for (const { w, h } of [
  { w: 1420, h: 437 }, // the owner's own window — xshort height only
  { w: 800, h: 450 }, // narrow + tight + xshort, all at once
]) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(300) // let resize listeners + layout settle
  await waitForPhotoSettle()
  await page.screenshot({ path: `${outDir}/weather-expanded-${w}x${h}.png` })
  console.log(`captured weather-expanded-${w}x${h}.png`)
}
// Restore this script's own launch viewport before continuing — same
// restoration discipline as every other resize in this script (Source,
// theme, layout, location, arrange overlay, and the viewport matrix below).
await page.setViewportSize({ width: 1600, height: 900 })
await page.waitForTimeout(150)

// Location search typeahead: clear the seeded location so LocationSetup
// (src/newtab/widgets/weather/LocationSetup.tsx) mounts inside the Weather
// widget in place of the snapshot above, then type into its combobox and
// confirm Open-Meteo's geocoder returns live suggestions as-you-type
// (debounced ~300ms), not only after pressing Enter. A REAL network call —
// acceptable for preview, never for unit tests (those mock fetch at the
// service boundary; see LocationSetup.test.tsx).
await page.evaluate(() => chrome.storage.local.set({ location: null }))
await page.waitForSelector('[role="combobox"][aria-label="Search for a city"]')
await page.click('[role="combobox"][aria-label="Search for a city"]')
await page.keyboard.type('Dall', { delay: 60 })
await page
  .waitForSelector('[role="listbox"]', { timeout: 5000 })
  .catch(() => {}) // real network call — the PASS/FAIL line below reports honestly either way
await page.waitForTimeout(200)
await page.screenshot({ path: `${outDir}/location-typeahead.png` })
console.log('captured location-typeahead.png')

const suggestionCount = await page.locator('[role="option"]').count()
console.log(
  suggestionCount >= 1
    ? `PASS: location typeahead shows live suggestions while typing (${suggestionCount} row(s))`
    : 'FAIL: location typeahead shows live suggestions while typing (0 rows after debounce)',
)

// Escape must close the suggestion list without clearing what was typed, and
// without doing anything else (no drawer/dialog to close here — the widget
// sits directly on the page). The listbox stays in the DOM hidden (not
// unmounted) once closed — see LocationSetup.tsx's `hidden={!open}` — so
// "closed" means invisible, not absent; `.count() === 0` would always be
// false and falsely FAIL here.
await page.keyboard.press('Escape')
await page.waitForTimeout(150)
const listClosedAfterEscape = await page.locator('[role="listbox"]').isHidden()
const inputAfterEscape = await page
  .locator('[role="combobox"][aria-label="Search for a city"]')
  .inputValue()
console.log(
  listClosedAfterEscape && inputAfterEscape === 'Dall'
    ? 'PASS: Escape closes the suggestion list without clearing the input'
    : `FAIL: Escape closes the suggestion list without clearing the input (list closed: ${listClosedAfterEscape}, input: "${inputAfterEscape}")`,
)

// Restore the seeded New York location so nothing captured further down
// (to-do panel, palette, notes, gallery, arrange mode) is destabilized by
// the weather widget having no location again.
await page.evaluate(() =>
  chrome.storage.local.set({ location: { lat: 40.71, lon: -74.01, label: 'New York', manual: true } }),
)
await page.waitForTimeout(300)

// Open the to-do panel, add a task, and capture it
await page.click('button:has-text("Tasks")')
await page.waitForSelector('[role="dialog"][aria-label="Tasks"]')
await page.waitForTimeout(150)
await page.fill('#todo-add-item', 'Ship Aurora')
await page.press('#todo-add-item', 'Enter')
await page.waitForTimeout(150)
await page.screenshot({ path: `${outDir}/todo-panel.png` })
console.log('captured todo-panel.png')

// Open the focus timer pill and capture its panel
await page.click('button[aria-label^="Focus timer"]')
await page.waitForSelector('[role="dialog"][aria-label="Focus timer"]')
await page.waitForTimeout(150)
await page.screenshot({ path: `${outDir}/timer-panel.png` })
console.log('captured timer-panel.png')

// Close the still-open to-do and timer panels so the palette screenshot isn't
// cluttered by dimmed panels behind its backdrop
await page.click('button:has-text("Tasks")')
await page.click('button[aria-label^="Focus timer"]')
await page.waitForTimeout(150)

// Open the command palette with Ctrl+K, filter it, and capture it
await page.keyboard.press('Control+k')
await page.waitForSelector('[role="combobox"]')
await page.waitForTimeout(150)
await page.keyboard.type('git')
await page.waitForTimeout(150)
await page.screenshot({ path: `${outDir}/palette.png` })
console.log('captured palette.png')
await page.keyboard.press('Escape')

// Open the notes scratchpad, type into it, and let the 500ms autosave
// debounce fire, then reload the page from scratch and reopen the panel to
// prove the text actually round-tripped through chrome.storage rather than
// just sitting in React state.
await page.click('button:has-text("Notes")')
await page.waitForSelector('[role="dialog"][aria-label="Notes"]')
await page.fill('textarea', 'Remember the milk')
await page.waitForTimeout(700) // past the 500ms autosave debounce
await page.screenshot({ path: `${outDir}/notes-panel.png` })
console.log('captured notes-panel.png')

await page.reload()
await page.waitForSelector('time')
await page.waitForTimeout(800) // photo fade-in
await page.click('button:has-text("Notes")')
await page.waitForSelector('[role="dialog"][aria-label="Notes"]')
const notesPersisted = await page.locator('textarea').inputValue()
console.log(
  notesPersisted === 'Remember the milk'
    ? 'PASS: notes persisted across reload'
    : `FAIL: notes did not persist across reload (got "${notesPersisted}")`,
)
await page.keyboard.press('Escape')
await page.waitForTimeout(150)

// Multi-photo background gallery: switching to "My photo" and populating it
// can't be driven through a real OS file-chooser dialog under automation, so
// seed it directly via setInputFiles on the (now-visible) file input. Placed
// last, and the source is restored to "Daily photo" afterward, so this
// leftover upload-mode state can't destabilize any capture above.
await page.click('button[aria-label="Open settings"]')
await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
await page.waitForTimeout(400) // slide-in transition
await page.selectOption('#set-bg-mode', 'upload')
await page.waitForSelector('#set-bg-file')
await page.setInputFiles('#set-bg-file', [
  'public/photos/01-Ovn1hyBge38-2560x1600.avif',
  'public/photos/02-vUePu7hAYAQ-2560x1600.avif',
])
await page.waitForSelector('button[aria-label="Remove photo 1"]')
await page.waitForTimeout(300) // thumbnail object-URL decode
await page.screenshot({ path: `${outDir}/settings-gallery.png` })
console.log('captured settings-gallery.png')

await page.keyboard.press('Escape')
await page.waitForTimeout(400) // slide-out transition
await page.waitForTimeout(800) // uploaded photo fade-in
await page.screenshot({ path: `${outDir}/newtab-upload.png` })
console.log('captured newtab-upload.png')

// Restore the source so a re-run (or any capture appended after this block
// later) starts from the stable "Daily photo" default.
await page.click('button[aria-label="Open settings"]')
await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
await page.waitForTimeout(400)
await page.selectOption('#set-bg-mode', 'auto')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// Arrange mode: real-mouse long-press + drag probe (Task 38), appended
// last. ArrangeController.test.tsx (jsdom) exhaustively covers the state
// machine via synthetic fireEvent pointer events, but jsdom can't drive a
// real long-press TIMER against real elapsed time under real hit-testing,
// real Pointer Capture routing a drag back to the overlay regardless of
// what's literally under the cursor, or real `inert`-driven focus blocking
// — it only ever asserts the `inert` ATTRIBUTE is present, never that Tab
// actually can't reach the subtree it's on. This probe drives the actual
// gesture via Playwright's page.mouse/page.keyboard against the built
// extension, same "trust nothing jsdom can't verify" discipline as the
// notes-persistence and bookmarks-popover probes above. Placed last so its
// own state (an arranged, then reset, layout) never destabilizes any
// capture before it; the Reset step at the end restores the default layout
// so a re-run starts clean, same as the gallery block above restoring its
// own "Daily photo" default.

// Center of the clock block, in viewport px — used both for the initial
// long-press target and (re-measured) for post-move/post-reset assertions.
async function clockCenter() {
  return page.evaluate(() => {
    const r = document.querySelector('[data-block-id="clock"]').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
}

// Default (pre-arrange) clock center, measured before touching anything —
// the baseline the post-Reset assertion compares against, rather than a
// hardcoded literal that could drift with layout CSS changes.
const defaultClockCenter = await clockCenter()

// Long-press the clock: move to its center, press down, and hold >500ms
// with NO movement (useLongPress's own 8px tolerance would otherwise abort
// it as a drag rather than a hold).
await page.mouse.move(defaultClockCenter.x, defaultClockCenter.y)
await page.mouse.down()
await page.waitForTimeout(650)
await page.waitForSelector('[data-arrange-overlay] button:has-text("Done")', { timeout: 2000 })
console.log('arrange pill appeared on long-press')

// BINDING CARRY (Task 36 review): while still mid-drag (mouse still down,
// before dropping), press Tab repeatedly and confirm focus never lands on
// an INTERACTIVE element outside the arrange overlay — proof the rest of
// the page really is unreachable by keyboard in a real browser, not just
// marked `inert` on paper. `[data-arrange-overlay]` is a tiny selector-only
// data attribute added to ArrangeController's own root div for exactly this
// probe (see src/newtab/arrange/ArrangeController.tsx).
//
// `document.activeElement === document.body` (nothing focused in the
// document) does NOT count as an escape: once Tab exhausts the overlay's
// own focusable set (one Move button per visible block, plus Reset
// layout/Done), a real browser moves focus OUT of the page entirely — into
// its own chrome (address bar, extensions) rather than wrapping back
// in-document — which is exactly what correctly-applied `inert` on
// everything else should produce, since there's nothing else in the
// document left for it to land on. The actual failure mode this guards
// against is focus landing on a live, in-document control that should have
// been unreachable (e.g. the search box or settings gear under the
// should-be-inert wrapper) — so only that counts as FAIL. 20 presses is
// comfortably more than the overlay's total focusable count, so this both
// exercises the wrap boundary and confirms overlay focus is reachable at
// all (checked below), not just absent throughout.
let tabStaysInOverlay = true
let escapedTo = ''
let sawOverlayFocus = false
for (let i = 0; i < 20; i++) {
  await page.keyboard.press('Tab')
  const info = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return { kind: 'none' }
    const inOverlay = el.closest('[data-arrange-overlay]') != null
    return { kind: inOverlay ? 'overlay' : 'outside', tag: el.tagName, label: el.getAttribute('aria-label') }
  })
  if (info.kind === 'overlay') sawOverlayFocus = true
  if (info.kind === 'outside') {
    tabStaysInOverlay = false
    escapedTo = `${info.tag}${info.label ? ` [aria-label="${info.label}"]` : ''}`
    break
  }
}
if (tabStaysInOverlay && !sawOverlayFocus) {
  // Tab never once landed inside the overlay either — not a leak, but not
  // proof of anything either; report honestly rather than a false PASS.
  tabStaysInOverlay = false
  escapedTo = 'focus never entered the overlay at all'
}
console.log(
  tabStaysInOverlay
    ? 'PASS: page inert during arrange (Tab stays in overlay)'
    : `FAIL: page inert during arrange (Tab stays in overlay) — focus escaped to ${escapedTo}`,
)

// Drag toward mid-left, slowly, crossing the viewport's horizontal center
// line (y = 450 on this 900px-tall viewport) on the way — real intermediate
// page.mouse.move calls (not one jump), since the drag handler updates the
// live position/guides off real pointermoves.
const dropTarget = { x: 400, y: 450 }
const dragSteps = 12
for (let i = 1; i <= dragSteps; i++) {
  const x = defaultClockCenter.x + ((dropTarget.x - defaultClockCenter.x) * i) / dragSteps
  const y = defaultClockCenter.y + ((dropTarget.y - defaultClockCenter.y) * i) / dragSteps
  await page.mouse.move(x, y)
  await page.waitForTimeout(35)
}
// The drop target sits exactly on the horizontal center line, well within
// the 6px snap threshold (src/lib/layout/snap.ts) — every block's outline
// and the horizontal guide line should be visible for this mid-drag
// capture, taken BEFORE the mouse comes up.
await page.screenshot({ path: `${outDir}/arrange-mode.png` })
console.log('captured arrange-mode.png')

// Review fix I3: the quote block's own outline must be sized to its actual
// (shrink-to-fit) content box, not the full viewport — it used to measure
// the full 1600px width because its wrapper was `inset-x-0` (patched over
// with `pointer-events-none`, which also silently broke long-press on the
// quote itself; see App.tsx's comment on the quote PositionedBlock for the
// full history). A generous < 50% threshold comfortably separates
// "content-sized" from "full viewport" without being sensitive to exact
// quote text length.
const quoteOutlineWidth = await page.evaluate(() => {
  const el = document.querySelector('[aria-label="Move Quote"]')
  return el ? el.getBoundingClientRect().width : null
})
console.log(
  quoteOutlineWidth !== null && quoteOutlineWidth < 800
    ? `PASS: quote block outline is content-sized (${quoteOutlineWidth.toFixed(1)}px, < 50% of the 1600px viewport)`
    : `FAIL: quote block outline is content-sized (got ${quoteOutlineWidth}px, expected < 800px)`,
)

await page.mouse.up()
await page.waitForTimeout(300) // let the drop's storage.update land before Done/reload
await page.click('[data-arrange-overlay] button:has-text("Done")')
await page.waitForTimeout(300)

await page.reload()
await page.waitForSelector('time')
await page.waitForTimeout(800) // photo fade-in

const droppedClockCenter = await clockCenter()
const dropDx = Math.abs(droppedClockCenter.x - dropTarget.x)
const dropDy = Math.abs(droppedClockCenter.y - dropTarget.y)
console.log(
  dropDx <= 16 && dropDy <= 16
    ? 'PASS: arrange position persisted'
    : `FAIL: arrange position persisted (expected ~(${dropTarget.x}, ${dropTarget.y}), got (${droppedClockCenter.x.toFixed(1)}, ${droppedClockCenter.y.toFixed(1)}))`,
)

// Re-enter arrange (long-press the clock at its NEW position) and reset the
// layout via the pill's Reset button, which now opens a real confirm dialog
// (src/lib/ResetLayoutDialog.tsx) instead of the old two-click armed-confirm
// idiom. The dialog portals to document.body — a SIBLING of
// `[data-arrange-overlay]`, not a descendant — so its own buttons are
// selected via the dialog's `aria-label`, not scoped under the overlay the
// way the pill's own "Reset"/"Done" buttons are.
await page.mouse.move(droppedClockCenter.x, droppedClockCenter.y)
await page.mouse.down()
await page.waitForTimeout(650)
await page.waitForSelector('[data-arrange-overlay] button:has-text("Done")', { timeout: 2000 })
await page.mouse.up() // ends this re-engage drag with no movement; commits nothing new
await page.waitForTimeout(150)

await page.click('[data-arrange-overlay] button:has-text("Reset")')
await page.waitForTimeout(150)
const dialog = page.locator('[aria-label="Reset layout?"]')
const dialogAppeared = (await dialog.count()) === 1
console.log(
  dialogAppeared
    ? 'PASS: Reset opens a confirm dialog'
    : 'FAIL: Reset opens a confirm dialog — dialog never appeared',
)

// Cancel path first: must close the dialog and leave the just-dropped
// layout untouched — proof Cancel really is a no-op, not just "some button
// that happens to close the dialog."
await dialog.getByRole('button', { name: 'Cancel' }).click()
await page.waitForTimeout(150)
const dialogGoneAfterCancel = (await dialog.count()) === 0
const clockAfterCancel = await clockCenter()
const cancelDx = Math.abs(clockAfterCancel.x - droppedClockCenter.x)
const cancelDy = Math.abs(clockAfterCancel.y - droppedClockCenter.y)
console.log(
  dialogGoneAfterCancel && cancelDx <= 16 && cancelDy <= 16
    ? 'PASS: Cancel closes the dialog and leaves the layout intact'
    : `FAIL: Cancel closes the dialog and leaves the layout intact (dialog gone: ${dialogGoneAfterCancel}, clock at (${clockAfterCancel.x.toFixed(1)}, ${clockAfterCancel.y.toFixed(1)}), expected ~(${droppedClockCenter.x.toFixed(1)}, ${droppedClockCenter.y.toFixed(1)}))`,
)

// Now the real confirm: Reset -> dialog -> its own "Reset layout" danger
// button (distinct text from the pill's own short "Reset" label).
await page.click('[data-arrange-overlay] button:has-text("Reset")')
await page.waitForTimeout(150)
await dialog.getByRole('button', { name: 'Reset layout' }).click()
await page.waitForTimeout(150)
await page.click('[data-arrange-overlay] button:has-text("Done")')
await page.waitForTimeout(300)

await page.reload()
await page.waitForSelector('time')
await page.waitForTimeout(800) // photo fade-in

const resetClockCenter = await clockCenter()
const resetDx = Math.abs(resetClockCenter.x - defaultClockCenter.x)
const resetDy = Math.abs(resetClockCenter.y - defaultClockCenter.y)
console.log(
  resetDx <= 16 && resetDy <= 16
    ? 'PASS: layout reset'
    : `FAIL: layout reset (expected default ~(${defaultClockCenter.x.toFixed(1)}, ${defaultClockCenter.y.toFixed(1)}), got (${resetClockCenter.x.toFixed(1)}, ${resetClockCenter.y.toFixed(1)}))`,
)

// State restoration check: the arrange overlay must be gone (mode 'off')
// after this block, same discipline as the gallery block above restoring
// Source to "Daily photo" — anything appended after this later starts from
// an idle page.
const arrangeOverlayGone = (await page.locator('[data-arrange-overlay]').count()) === 0
console.log(
  arrangeOverlayGone
    ? 'arrange overlay closed; page restored to idle'
    : 'WARNING: arrange overlay still present after final reload',
)

// Viewport matrix (BINDING: media-query responsive pass) — the owner's own
// ~1420x437 short-wide browser window is what surfaced this whole task: the
// clock's old width-only clamp() rendered ~160px tall there and collided
// with the greeting below it (see Clock.tsx's own comment on the fix). Reuses
// this already-loaded, already-seeded page (idle at this point — default
// Aurora theme, default layout, "Daily photo" source, timer/clocks/countdown
// on, bookmarks on if the permission was grantable — see the seed block way
// up top) rather than relaunching: a plain `page.setViewportSize` reflows the
// existing DOM exactly like a real window resize would, which is the actual
// thing under test here.
const viewportMatrix = [
  { w: 1420, h: 437 }, // the owner's own window — the original bug report
  { w: 1280, h: 500 },
  { w: 1024, h: 600 },
  { w: 800, h: 450 },
  { w: 2560, h: 1440 },
]
const launchViewport = { width: 1600, height: 900 } // this script's own launch size (top of file) — restored after
let errorsSeenSoFar = errors.length
for (const { w, h } of viewportMatrix) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(300) // let resize listeners + layout settle
  // Background.tsx's own tier-pick resize listener is separately debounced
  // ~250ms and, if the physical size crosses the 2.5K/4K tier boundary (only
  // 2560x1440 in this matrix does, going up from the launch viewport's
  // 1600x900), swaps in a brand-new <img> that has to fetch+decode a much
  // larger AVIF before its own 700ms opacity fade-in TRANSITION completes. A
  // fixed short wait isn't reliable across that range of possible decode
  // times (found via a real run: 2560x1440 screenshotted the bare gradient
  // fallback, not the photo, on a flat 250ms wait) — wait for the actual
  // condition instead: the photo img's own opacity-100 CLASS, the same
  // fade-in signal Background.tsx uses. `div[aria-hidden] > img` is that
  // layer's own img specifically (not a link/bookmark favicon, which also
  // carry alt="" but sit elsewhere in the DOM) — absent entirely is also a
  // valid steady state (gradient mode, or upload mode with nothing
  // uploaded), hence the `? … : true` rather than requiring one to exist.
  await page
    .waitForFunction(
      () => {
        const img = document.querySelector('div[aria-hidden] > img')
        return img ? img.classList.contains('opacity-100') : true
      },
      { timeout: 5000 },
    )
    .catch(() => {}) // best-effort — screenshot honestly either way rather than hanging the run
  // The class flip above fires the INSTANT onLoad does — CSS then animates
  // the actual opacity from 0 to 1 over the next 700ms (duration-700 on the
  // same element), so classList.contains('opacity-100') is true well before
  // the transition visually finishes. Found the hard way: a run with only
  // the waitForFunction above screenshotted 2560x1440 mid-fade — a washed-out,
  // low-contrast frame, not the plain gradient fallback but not the real
  // photo either. Same 800ms constant every reload elsewhere in this script
  // already uses for "photo fade-in" (see e.g. the very first capture, or
  // any of the reload blocks below) — reused here for the identical reason.
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${outDir}/viewport-${w}x${h}.png` })
  console.log(`captured viewport-${w}x${h}.png`)

  const newErrorCount = errors.length - errorsSeenSoFar
  console.log(
    newErrorCount === 0
      ? `PASS: no console errors at ${w}x${h}`
      : `FAIL: no console errors at ${w}x${h} (${newErrorCount} new: ${errors.slice(-newErrorCount).join('; ')})`,
  )
  errorsSeenSoFar = errors.length

  // Overlap assertion for the center column's two biggest elements — the
  // exact pair the owner's screenshot showed colliding. `[data-block-id]` is
  // the same attribute PositionedBlock stamps on every default-placement
  // block (see clockCenter() above for the identical selector idiom). Two
  // axis-aligned rects DON'T intersect iff one is fully to a side of the
  // other, or fully above/below it, on at least one axis.
  const overlap = await page.evaluate(() => {
    const clock = document.querySelector('[data-block-id="clock"]')?.getBoundingClientRect()
    const greeting = document.querySelector('[data-block-id="greeting"]')?.getBoundingClientRect()
    if (!clock || !greeting) return null
    const intersects = !(
      clock.right <= greeting.left ||
      clock.left >= greeting.right ||
      clock.bottom <= greeting.top ||
      clock.top >= greeting.bottom
    )
    return {
      intersects,
      clock: { top: clock.top, bottom: clock.bottom, left: clock.left, right: clock.right },
      greeting: { top: greeting.top, bottom: greeting.bottom, left: greeting.left, right: greeting.right },
    }
  })
  console.log(
    overlap && !overlap.intersects
      ? `PASS: no clock/greeting overlap at ${w}x${h}`
      : overlap
        ? `FAIL: no clock/greeting overlap at ${w}x${h} (clock ${JSON.stringify(overlap.clock)}, greeting ${JSON.stringify(overlap.greeting)})`
        : `FAIL: no clock/greeting overlap at ${w}x${h} (clock or greeting element not found)`,
  )

  // Bonus verification for goal 3 (bookmarks bar / weather panel collision,
  // the OTHER known peripheral collision this pass fixes) — cheap to check
  // alongside the assertion above since the page is already at this size.
  // Only meaningful under a preview build, same gating as every other
  // bookmarks probe in this script (see the header comment + the
  // hasBookmarksPermission SKIP line near the top): a production build never
  // renders the bar at all, so there's nothing to collide.
  if (hasBookmarksPermission) {
    const peripheralOverlap = await page.evaluate(() => {
      const bar = document.querySelector('nav[aria-label="Bookmarks bar"]')?.getBoundingClientRect()
      const weather = document.querySelector('section[aria-label="Weather"]')?.getBoundingClientRect()
      if (!bar || !weather) return null
      const intersects = !(
        bar.right <= weather.left ||
        bar.left >= weather.right ||
        bar.bottom <= weather.top ||
        bar.top >= weather.bottom
      )
      return { intersects }
    })
    console.log(
      peripheralOverlap && !peripheralOverlap.intersects
        ? `PASS: no bookmarks/weather overlap at ${w}x${h}`
        : peripheralOverlap
          ? `FAIL: no bookmarks/weather overlap at ${w}x${h}`
          : `SKIP: bookmarks/weather overlap check at ${w}x${h} (element(s) not found)`,
    )
  }
}

// State restoration: back to this script's own launch viewport, so nothing
// appended after this later starts from a resized page — same discipline as
// every other restoration point in this script (Source, theme, layout,
// location, arrange overlay above).
await page.setViewportSize(launchViewport)
await page.waitForTimeout(150)

await page.waitForTimeout(300)
if (errors.length) console.log('console errors:', errors)
else console.log('no console errors')

await context.close()
