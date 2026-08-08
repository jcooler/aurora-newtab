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
// Dev-only image measurement for the LQIP-underlay probe below (already a
// devDependency — it is what encodes the photos in the first place).
import sharp from 'sharp'

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
    //
    // SEED SIZE AND TITLE LENGTH ARE BOTH LOAD-BEARING (top-band pass).
    // This used to be three short top-level entries — a bar so narrow it fit
    // at every viewport no matter how wrong the sizing was, which is exactly
    // why the harness never saw it wrap to two rows at 800x450.
    //   COUNT: ten entries put the bar at its structural MAXIMUM.
    //   BookmarksBar's MAX_VISIBLE_CHIPS is 8, so 8 render as chips and the
    //   remaining 2 fold into the "»" overflow chip — 9 flex items, the most
    //   the bar can ever show.
    //   LENGTH: mostly 11-16 characters, which is what pushes the row's
    //   natural width past the bar's cap at 800x450 and makes flex shrink
    //   actually do something there. The viewport matrix asserts that (the
    //   cap must be BINDING at the narrowest size) as well as asserting the
    //   result stays legible — a row that merely fit would prove the bar
    //   doesn't wrap while proving nothing at all about how it shrinks.
    //   "Dev" and "News" stay short on purpose: proportional shrink should
    //   take from the long titles, and two untouched chips in the captures
    //   are what show that it did.
    //
    // ORDER MATTERS: services/bookmarks.ts's mapFolder splits into
    // folders-then-loose, so the four folders occupy chip slots 1-4. "Dev"
    // and "News" must stay the FIRST two — every bookmarks probe in this
    // script clicks them by name, and a chip that fell past slot 8 would be
    // inside the overflow popover instead of on the bar.
    const bar = '1' // Chromium's bookmarks-bar node id
    const dev = await chrome.bookmarks.create({ parentId: bar, title: 'Dev' })
    await chrome.bookmarks.create({ parentId: dev.id, title: 'GitHub', url: 'https://github.com/' })
    await chrome.bookmarks.create({ parentId: dev.id, title: 'MDN', url: 'https://developer.mozilla.org/' })
    const tools = await chrome.bookmarks.create({ parentId: dev.id, title: 'Tools' })
    await chrome.bookmarks.create({ parentId: tools.id, title: 'Excalidraw', url: 'https://excalidraw.com/' })
    const news = await chrome.bookmarks.create({ parentId: bar, title: 'News' })
    await chrome.bookmarks.create({ parentId: news.id, title: 'HN', url: 'https://news.ycombinator.com/' })
    const design = await chrome.bookmarks.create({ parentId: bar, title: 'Design system' })
    await chrome.bookmarks.create({ parentId: design.id, title: 'Figma', url: 'https://figma.com/' })
    const reading = await chrome.bookmarks.create({ parentId: bar, title: 'Reading list' })
    await chrome.bookmarks.create({ parentId: reading.id, title: 'Longform', url: 'https://longform.org/' })
    for (const [title, url] of [
      ['Engineering docs', 'https://docs.example.com/'],
      ['Product roadmap', 'https://roadmap.example.com/'],
      ['Q3 planning', 'https://planning.example.com/'],
      ['Release notes', 'https://releases.example.com/'],
      // The last two overflow past MAX_VISIBLE_CHIPS into the "»" chip.
      ['Maps', 'https://maps.example.com/'],
      ['Analytics', 'https://analytics.example.com/'],
    ]) {
      await chrome.bookmarks.create({ parentId: bar, title, url })
    }
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

// LQIP underlay (2026-08-07). The companion to the cross-tab probe above:
// that one locks down the causes this repo CAN control, this one covers the
// one it can't. Chrome purges the decoded image memory of background tabs
// under pressure, and on re-display the photo re-decodes (36-165ms for these
// files) with whatever is behind the <img> on screen for the gap — which
// used to be the --bg-fallback gradient. Background.tsx now paints a blurred
// copy of the same photo there instead.
//
// Two things have to be true at once and they pull in opposite directions,
// so both are asserted rather than eyeballed: the underlay must be
// COMPLETELY invisible while the photo is up (it is a fallback, not a
// filter), and it must actually be a blurred copy of THAT photo, not the
// gradient, when the photo isn't painting. The second is measured by hiding
// the photo — the only way to see what the decode gap sees — and comparing
// what's left against the same view with the underlay removed, which is
// exactly the pre-fix gradient. A reload at the end puts the page back;
// nothing here writes storage.
{
  const meanRGB = async (buffer) => {
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < data.length; i += info.channels) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
    }
    return [r / n, g / n, b / n]
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

  const pairing = await page.evaluate(() => {
    const layer = document.querySelector('[data-lqip]')
    const img = document.querySelector('div[aria-hidden] > img')
    if (!layer || !img) return { ok: false, why: `layer=${!!layer} img=${!!img}` }
    const bg = layer.style.backgroundImage
    return {
      ok: true,
      inline: bg.includes('data:image/'),
      // The underlay names the photo it belongs to, and the photo names the
      // same one — a stale underlay under a fresh photo fails right here.
      paired: layer.dataset.photo === img.dataset.photo && img.src.includes(img.dataset.photo),
      photo: img.dataset.photo,
      zIndex: getComputedStyle(layer).zIndex,
      blurred: getComputedStyle(layer).filter.includes('blur'),
      hidden: layer.getAttribute('aria-hidden') === 'true',
    }
  })
  const underlayOk =
    pairing.ok && pairing.inline && pairing.paired && pairing.blurred && pairing.hidden && pairing.zIndex === '-10'
  console.log(
    underlayOk
      ? `PASS: the background photo has a blurred, inline, aria-hidden LQIP underlay paired with it (${pairing.photo})`
      : `FAIL: the background photo has a blurred, inline, aria-hidden LQIP underlay paired with it (${JSON.stringify(pairing)})`,
  )

  // (a) invisible in steady state: removing the underlay must change nothing
  // on screen, because the photo covers it completely.
  const withUnderlay = await page.screenshot()
  await page.evaluate(() => {
    document.querySelector('[data-lqip]').style.display = 'none'
  })
  const withoutUnderlay = await page.screenshot()
  const steadyDelta = dist(await meanRGB(withUnderlay), await meanRGB(withoutUnderlay))
  console.log(
    steadyDelta < 0.5
      ? `PASS: the LQIP underlay is invisible while the photo is up (mean-RGB delta ${steadyDelta.toFixed(3)})`
      : `FAIL: the LQIP underlay is invisible while the photo is up (mean-RGB delta ${steadyDelta.toFixed(3)}, expected ~0)`,
  )

  // (b) what the decode gap actually sees. Photo hidden, underlay restored =
  // the new behaviour; photo hidden, underlay gone = the old behaviour (bare
  // gradient). The new one has to look far more like the photo than the old
  // one does, which is the entire point of the change.
  await page.evaluate(() => {
    const img = document.querySelector('div[aria-hidden] > img')
    img.style.transition = 'none'
    img.style.opacity = '0'
    document.querySelector('[data-lqip]').style.display = ''
  })
  const gapWithUnderlay = await page.screenshot()
  await page.screenshot({ path: `${outDir}/background-lqip.png` })
  await page.evaluate(() => {
    document.querySelector('[data-lqip]').style.display = 'none'
  })
  const gapWithGradient = await page.screenshot()
  await page.screenshot({ path: `${outDir}/background-gradient-only.png` })

  const photoMean = await meanRGB(withUnderlay)
  const underlayGapDist = dist(await meanRGB(gapWithUnderlay), photoMean)
  const gradientGapDist = dist(await meanRGB(gapWithGradient), photoMean)
  console.log(
    underlayGapDist < gradientGapDist / 2
      ? `PASS: during a decode gap the underlay reads as the same photo, not the gradient (distance to photo ${underlayGapDist.toFixed(1)} with underlay vs ${gradientGapDist.toFixed(1)} with the old gradient fallback)`
      : `FAIL: during a decode gap the underlay reads as the same photo, not the gradient (distance to photo ${underlayGapDist.toFixed(1)} with underlay vs ${gradientGapDist.toFixed(1)} with the old gradient fallback)`,
  )
  console.log('captured background-lqip.png, background-gradient-only.png')

  // Undo the inline styles above — they are DOM-only, so a reload is enough.
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(2500) // weather fetch
  await page.waitForTimeout(800) // photo fade-in
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

// The Settings drawer is TABBED (Task 40): General / Widgets / Data, and only
// the ACTIVE tab's sections are in the DOM — unmounted, not hidden. So every
// probe below that reaches into the drawer names the tab its control lives on
// first, rather than inheriting whatever tab an earlier block left selected:
// SettingsPanel stays mounted while the drawer is merely closed (Drawer.tsx
// only toggles `inert`/`translate-x-full` on itself), so a close/reopen does
// not reset the selection.
async function openSettingsTab(name) {
  await page.click(`[role="tab"]:has-text("${name}")`)
  await page.waitForSelector(`[role="tab"][aria-selected="true"]:has-text("${name}")`)
  await page.waitForTimeout(100) // let the swapped-in panel lay out
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
// The theme radiogroup lives on General (the tab the drawer opens on) — named
// explicitly anyway, so this loop doesn't depend on being the first block in
// the script to touch the drawer.
await openSettingsTab('General')
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

// One capture per tab, replacing the old scroll-position ones (drawer-data /
// drawer-footer, which had to hunt down a single long column with
// scrollIntoViewIfNeeded to photograph the Data section and the About footer).
// Each tab is now a whole screen of its own at its natural scroll position —
// which is the point of the split, so the gate photographs it that way.
const tabMounts = {}
for (const [tabName, file] of [
  ['General', 'drawer-general'],
  ['Widgets', 'drawer-widgets'],
  // Connectors (Task 44) contributes its mount-exclusivity sample here, but
  // its CAPTURE (drawer-connectors.png) is taken in the dedicated RSS block
  // further down, where the connector's feeds are actually seeded — an
  // unseeded card would photograph an empty feed list. `null` file = sample
  // only, no screenshot.
  ['Connectors', null],
  ['Data', 'drawer-data'],
]) {
  await openSettingsTab(tabName)
  if (file) {
    await page.screenshot({ path: `${outDir}/${file}.png` })
    console.log(`captured ${file}.png`)
  }
  // Sampled while this tab is up: one marker section per tab, plus the
  // number of live tabpanels. Read here rather than in a second pass so
  // what's asserted below is exactly what was photographed above. The RSS
  // card renders regardless of whether the connector is enabled, so the
  // Connectors marker is present here without any seed.
  tabMounts[tabName] = await page.evaluate(() => ({
    profile: !!document.querySelector('#set-name'), // General
    widgetToggle: !!document.querySelector('#w-bookmarks'), // Widgets
    connectors: !!document.querySelector('section[aria-label="Connectors"]'), // Connectors
    data: !!document.querySelector('section[aria-label="Data"]'), // Data
    footer: !!document.querySelector('footer'), // Data (About)
    panels: document.querySelectorAll('[role="tabpanel"]').length,
  }))
}

// …and the tabs really do MOUNT only their own sections rather than hiding
// the rest. That's the design decision behind the shell (a section that
// isn't on screen shouldn't be running its hooks), and it's also what keeps
// the three captures above honest: a drawer that rendered everything at once
// would produce three near-identical PNGs and still pass every other line in
// this script.
{
  const ok =
    tabMounts.General.profile &&
    !tabMounts.General.widgetToggle &&
    !tabMounts.General.connectors &&
    !tabMounts.General.data &&
    !tabMounts.General.footer &&
    tabMounts.Widgets.widgetToggle &&
    !tabMounts.Widgets.profile &&
    !tabMounts.Widgets.connectors &&
    !tabMounts.Widgets.data &&
    !tabMounts.Widgets.footer &&
    tabMounts.Connectors.connectors &&
    !tabMounts.Connectors.profile &&
    !tabMounts.Connectors.widgetToggle &&
    !tabMounts.Connectors.data &&
    !tabMounts.Connectors.footer &&
    tabMounts.Data.data &&
    tabMounts.Data.footer &&
    !tabMounts.Data.profile &&
    !tabMounts.Data.widgetToggle &&
    !tabMounts.Data.connectors &&
    Object.values(tabMounts).every((t) => t.panels === 1)
  console.log(
    ok
      ? 'PASS: each settings tab mounts only its own sections (General: profile+background, Widgets: toggles, Connectors: cards, Data: backup+about), one live tabpanel at a time'
      : `FAIL: each settings tab mounts only its own sections (${JSON.stringify(tabMounts)})`,
  )
}

// ---------------------------------------------------------------------------
// Weather widget (rebuild after Jon rejected the previous expanded panel).
//
// The gate that let that redesign ship was screenshots-only: three PNGs a
// human eyeballed. Every one of the five defects he then hit in real use —
// a hit target that only responded in a narrow band, an always-on Windows
// scrollbar, a text I-beam over non-interactive forecast data, a collision
// with the bookmarks bar, and a scrollbar drag engaging arrange mode — is
// invisible in a screenshot and trivially MEASURABLE in a real browser. The
// probes below are that measurement.
//
// NOTE on selectors: `section[aria-label="Weather"]` is AMBIGUOUS — the
// Settings drawer has its own permanently-mounted Weather section with the
// same label. Everything here scopes through `[data-block-id="weather"]`
// (PositionedBlock's own attribute) so it can only ever match the widget.
const weatherSel = '[data-block-id="weather"] section[aria-label="Weather"]'
const weatherToggle = '[data-block-id="weather"] button[aria-expanded]'

async function weatherExpanded() {
  return page.evaluate(
    (s) => document.querySelector(s)?.getAttribute('aria-expanded') === 'true',
    weatherToggle,
  )
}
async function setWeatherExpanded(want) {
  if ((await weatherExpanded()) !== want) {
    await page.click(weatherToggle)
    await page.waitForTimeout(150)
  }
}

/** Every element in the widget that is a scroll container, or whose content
 *  is wider than its box. `.sr-only` is skipped on purpose: it is a 1px,
 *  clip-path'd, deliberately-clipped box (the accessible "Sunrise"/"Sunset"
 *  prefixes) that can never paint a scrollbar. */
async function weatherOverflow() {
  return page.evaluate((s) => {
    const sec = document.querySelector(s)
    if (!sec) return ['weather widget not found']
    const bad = []
    for (const el of [sec, ...sec.querySelectorAll('*')]) {
      if (el.classList?.contains('sr-only')) continue
      const cs = getComputedStyle(el)
      if (['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)) {
        bad.push(`${el.tagName} is a scroll container (overflow ${cs.overflowX}/${cs.overflowY})`)
        continue
      }
      // Deliberate single-line truncation is not overflow, it's the
      // ellipsis mechanism: `overflow: hidden` + `text-overflow: ellipsis`
      // can never produce a scrollbar (that needs auto/scroll, checked
      // above), and the shortened text is a designed state with the full
      // string on a `title` — see the collapsed chip's condition/location
      // line in WeatherWidget.tsx, which used to WRAP here instead and
      // strand the chevron beside it.
      //
      // All five conditions are load-bearing, because `truncate` is a
      // four-property shorthand that can be applied to things it does not
      // actually truncate:
      //   whiteSpace nowrap    without it the text WRAPS and the box clips
      //                        the overflowing lines vertically — the
      //                        ellipsis never paints and content vanishes.
      //   no element children  `text-overflow` only ever elides an inline
      //                        text overflow. Put `truncate` on a block or
      //                        flex CONTAINER and it silently clips its
      //                        children with no ellipsis at all, which is
      //                        exactly the class of bug this probe exists
      //                        to catch.
      //   a `title`            truncation is only acceptable because the
      //                        full string is one hover away. Without it
      //                        the text is simply gone.
      if (
        cs.textOverflow === 'ellipsis' &&
        cs.overflowX === 'hidden' &&
        cs.whiteSpace === 'nowrap' &&
        el.children.length === 0 &&
        el.title
      ) {
        continue
      }
      // SVG child elements (path/rect/…) have no clientWidth at all — the
      // subtraction is NaN there, and NaN > 1 is false, so they skip
      // themselves without a special case.
      const dx = el.scrollWidth - el.clientWidth
      if (dx > 1) bad.push(`${el.tagName} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`)
    }
    return bad
  }, weatherSel)
}

// Close the drawer first — its z-40 backdrop covers the whole viewport while
// open and would eat every click below.
await page.keyboard.press('Escape')
await page.waitForTimeout(400) // slide-out transition

// C1 — hit target. Jon: "you cannot click in to expand it unless you click on
// a very specific place in that box." Root cause (measured, pre-fix): the
// toggle was a content-sized <button> inside a `p-3` <section>, so only 48.2%
// of the collapsed chip's area (and 4.7% of the expanded panel's) responded —
// clicks in the padding, on the rain callout, or at the corners resolved to
// the <section> and did nothing.
//
// The nine points below are all unambiguously ON the chip: four edge
// midpoints (the padding gutters that used to be dead), four corners inset by
// CORNER_INSET, and the centre. The inset is not a hedge — the panel is
// `rounded-panel` (16px in Aurora, 20px in Glass), so the literal corner of
// its bounding RECT is outside the painted shape in every theme: no pixel of
// the widget is drawn there, and a click there is a click on the photo. 7px
// in from the corner is inside the arc for both radii (√(10²+10²) = 14.1 < 16;
// √(14²+14²) = 19.8 < 20) and outside the old button's box entirely.
{
  await setWeatherExpanded(false)
  const box = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, weatherSel)
  const CORNER_INSET = 7
  const points = [
    ['left edge', box.x + 2, box.y + box.h / 2],
    ['right edge', box.x + box.w - 2, box.y + box.h / 2],
    ['top edge', box.x + box.w / 2, box.y + 2],
    ['bottom edge', box.x + box.w / 2, box.y + box.h - 2],
    ['top-left corner', box.x + CORNER_INSET, box.y + CORNER_INSET],
    ['top-right corner', box.x + box.w - CORNER_INSET, box.y + CORNER_INSET],
    ['bottom-left corner', box.x + CORNER_INSET, box.y + box.h - CORNER_INSET],
    ['bottom-right corner', box.x + box.w - CORNER_INSET, box.y + box.h - CORNER_INSET],
    ['centre', box.x + box.w / 2, box.y + box.h / 2],
  ]
  const dead = []
  for (const [name, x, y] of points) {
    await setWeatherExpanded(false)
    await page.mouse.click(x, y)
    await page.waitForTimeout(120)
    if (!(await weatherExpanded())) dead.push(name)
  }
  console.log(
    dead.length === 0
      ? `PASS: every point on the collapsed weather chip expands it (${points.length} points — 4 edges, 4 corners, centre)`
      : `FAIL: every point on the collapsed weather chip expands it — dead points: ${dead.join(', ')}`,
  )

  // …and the same control closes it again, from an equally obvious affordance
  // (the header row carries a rotating chevron and aria-expanded).
  await setWeatherExpanded(true)
  await page.click(weatherToggle)
  await page.waitForTimeout(150)
  const closed = !(await weatherExpanded())
  console.log(
    closed
      ? 'PASS: the weather panel closes again from its own header control'
      : 'FAIL: the weather panel closes again from its own header control',
  )
}

await setWeatherExpanded(true)
await page.waitForTimeout(150)
await page.screenshot({ path: `${outDir}/weather-expanded.png` })
console.log('captured weather-expanded.png')

// C3 — false affordances. Jon: "the cursor changes when you hover over the
// weather alerts like possible rain." Root cause (measured, pre-fix): the
// chip <button> computed `cursor: default` (Tailwind v4's preflight sets that
// on buttons, unlike v3's `pointer`), while every label, temperature and
// forecast cell computed `cursor: auto` — which resolves to the TEXT I-BEAM
// over text. Exactly inverted: the one real control looked inert, and the
// data looked live. `auto` is therefore a FAILURE here, not just `pointer`.
{
  const cursors = await page.evaluate((s) => {
    const sec = document.querySelector(s)
    const cursorOf = (el) => getComputedStyle(el).cursor
    const chip = sec.querySelector('button[aria-expanded]')
    const link = sec.querySelector('a[href*="weather.com"]')
    const data = [...sec.querySelectorAll('dl, dt, dd, p, span, svg[role="img"]')].filter(
      (el) => !el.closest('button, a') && !el.classList.contains('sr-only'),
    )
    return {
      chip: chip ? cursorOf(chip) : null,
      link: link ? cursorOf(link) : null,
      dataCursors: [...new Set(data.map(cursorOf))],
      dataClickable: data.filter((el) => cursorOf(el) !== 'default').length,
      sampled: data.length,
    }
  }, weatherSel)
  const ok =
    cursors.chip === 'pointer' &&
    cursors.link === 'pointer' &&
    cursors.sampled > 0 &&
    cursors.dataClickable === 0
  console.log(
    ok
      ? `PASS: pointer cursor only on real weather controls (chip=${cursors.chip}, link=${cursors.link}; all ${cursors.sampled} data elements cursor:${cursors.dataCursors.join('/')})`
      : `FAIL: pointer cursor only on real weather controls (chip=${cursors.chip}, link=${cursors.link}, ${cursors.dataClickable}/${cursors.sampled} data elements not cursor:default — saw ${cursors.dataCursors.join('/')})`,
  )
}

// C2 — no scroll region anywhere. Root cause (measured, pre-fix): the hourly
// strip was `overflow-x-auto` holding 12 fixed-width cards — scrollWidth 872
// in a clientWidth 510 box — so Windows painted a permanent horizontal
// scrollbar across the bottom of the panel. Its replacement is an <svg> with
// a fixed viewBox at width:100%, which has no width to run out of.
{
  const bad = await weatherOverflow()
  console.log(
    bad.length === 0
      ? 'PASS: no scrollable region in the expanded weather panel at 1600x900'
      : `FAIL: no scrollable region in the expanded weather panel at 1600x900 (${bad.join('; ')})`,
  )
}

// C5 — arrange mode. Jon: "holding the sidescroll literally activates the
// mechanism to change the layout." Root cause: a press on a native scrollbar
// targets the SCROLL CONTAINER itself (the old <ol>), which is not in
// useLongPress's interactive exclusion list, so the 500ms timer armed; and
// Chrome does not deliver pointermove to the page during a native scrollbar
// drag, so the 8px movement tolerance that would have aborted the hold never
// fired. Deleting the scroll region (C2 above) deletes the trigger.
//
// What remains to verify is the other half: a press-and-hold on a REAL
// control must never enter arrange mode either. (That the harness can detect
// arrange mode at all is proven independently by the "arrange pill appeared
// on long-press" line further down — this probe is the negative case.)
{
  const centre = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, weatherSel)
  const controls = [
    ['chip / close control', weatherToggle],
    ['full-forecast link', '[data-block-id="weather"] a[href*="weather.com"]'],
  ]
  const leaked = []
  for (const [label, sel] of controls) {
    const box = await page.locator(sel).boundingBox()
    if (!box) {
      leaked.push(`${label} (not found)`)
      continue
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(700) // past useLongPress's 500ms hold
    const engaged = (await page.locator('[data-arrange-overlay]').count()) > 0
    if (engaged) {
      // Release in place — useLongPress's own one-shot suppressor eats the
      // click, so this can't follow the link — then leave the mode.
      await page.mouse.up()
      await page.waitForTimeout(150)
      leaked.push(label)
      await page.click('[data-arrange-overlay] button:has-text("Done")')
      await page.waitForTimeout(250)
    } else {
      // Release over the panel's own non-interactive middle so the resulting
      // click resolves to a common ancestor instead of activating the control
      // under the press (which would toggle the panel shut, or open
      // weather.com in a new tab).
      await page.mouse.move(centre.x, centre.y)
      await page.mouse.up()
      await page.waitForTimeout(150)
    }
    await setWeatherExpanded(true)
  }
  console.log(
    leaked.length === 0
      ? 'PASS: press-and-hold on a weather control never enters arrange mode (chip, full-forecast link)'
      : `FAIL: press-and-hold on a weather control never enters arrange mode — leaked: ${leaked.join(', ')}`,
  )
}

// Narrow-viewport expanded captures — the trend graphic, the meta grid, and
// the full-forecast link all need to keep reading cleanly (and, per the
// no-overflow probe repeated at each size below, keep fitting their box) at
// the tightest shapes this app is tuned for, not just the roomy 1600x900
// launch size above. 1420x437 is the owner's own
// short-wide window that originally motivated the xshort/tight/narrow
// variants (xshort height, but width stays over the 1300px `tight`
// threshold — see index.css's custom-variant comment); 800x450 stacks
// xshort height on top of BOTH narrow and tight width, the tightest
// combination the panel's own `tight:w-[30vw]` cap ever sees (30vw of 800 is
// only 240px); 500x900 is the owner's other window and the one below
// `compact`, where the panel stops being a viewport fraction at all — the
// state that has to be checked for overflow precisely because its width is
// now decided by a different rule than the other two. The panel is already
// expanded from the capture just above — a resize alone reflows it, no
// re-click needed.
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
  // The NARROWEST the expanded panel ever gets: `tight`'s second term
  // (`calc(50vw - 10.5rem)`, the centred column's clearance) binds here and
  // only here, at ~197px, so this is where the panel's contents are closest
  // to running out of box.
  { w: 730, h: 900 },
  { w: 500, h: 900 }, // the owner's side window — narrow + compact
]) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(300) // let resize listeners + layout settle
  await waitForPhotoSettle()
  await page.screenshot({ path: `${outDir}/weather-expanded-${w}x${h}.png` })
  console.log(`captured weather-expanded-${w}x${h}.png`)

  // C2 at this size too — the whole point of the constraint is that it holds
  // at EVERY viewport in the matrix, not just the roomy one. 800x450 is the
  // hard case: the panel is only 240px wide there (30vw).
  const bad = await weatherOverflow()
  console.log(
    bad.length === 0
      ? `PASS: no scrollable region in the expanded weather panel at ${w}x${h}`
      : `FAIL: no scrollable region in the expanded weather panel at ${w}x${h} (${bad.join('; ')})`,
  )
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

// C3, second state. The cursor probe further up only ever sees the widget
// with a cached snapshot; LocationSetup mounts inside the SAME <section>, and
// that section's `cursor-default` INHERITS — which is exactly what keeps the
// I-beam off the forecast data, but is wrong for a form. Chrome's UA sheet
// sets no cursor on a text input (it relies on `auto`), so the inherited
// `default` silently turned the city field into an arrow; Tailwind v4's
// preflight does the same to the "Use my location" button. Both now say what
// they are, and this probe — piggybacking on the typeahead state above, where
// input, button and suggestion rows are all on screen at once — is what keeps
// them saying it.
{
  const c = await page.evaluate((s) => {
    const sec = document.querySelector(s)
    if (!sec) return null
    const cursorOf = (el) => getComputedStyle(el).cursor
    const input = sec.querySelector('input[role="combobox"]')
    const button = sec.querySelector('button')
    const options = [...sec.querySelectorAll('[role="option"]')]
    const statics = [...sec.querySelectorAll('p')].filter((el) => !el.closest('button, a'))
    return {
      input: input ? cursorOf(input) : null,
      button: button ? cursorOf(button) : null,
      options: [...new Set(options.map(cursorOf))],
      optionCount: options.length,
      statics: [...new Set(statics.map(cursorOf))],
    }
  }, weatherSel)
  const optionsOk = c && (c.optionCount === 0 || (c.options.length === 1 && c.options[0] === 'pointer'))
  const ok =
    c &&
    c.input === 'text' &&
    c.button === 'pointer' &&
    optionsOk &&
    !c.statics.includes('pointer')
  console.log(
    ok
      ? `PASS: correct cursors in the location-setup state (input=${c.input}, "Use my location"=${c.button}, ${c.optionCount} suggestion row(s)=${c.options.join('/') || 'n/a'}, static text=${c.statics.join('/') || 'none'})`
      : `FAIL: correct cursors in the location-setup state (${JSON.stringify(c)})`,
  )
}

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
await openSettingsTab('General') // Background section — the per-tab captures above left Data selected
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
await openSettingsTab('General') // Background section again
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

// ---------------------------------------------------------------------------
// RSS connector (Task 44) — the first connector UI. NO live network: seed a
// pre-baked snapshot whose fetchedAt is computed inside the page (so the ttl is
// fresh at read time and useConnectorSnapshot renders straight from cache
// rather than firing a real fetch), plus an enabled config with fixture feeds,
// via a merge write. The service layer (parse + fetch orchestration) is
// unit-tested; this harness proves the WIDGET + CARD + config path in a real
// browser. Reload for a clean mount, run the probes and the two captures, then
// DISABLE the connector and reload so every block after this (the viewport
// matrix, default-state, worst-case bookmarks) is undisturbed — same
// snapshot/restore discipline as the arrange and gallery blocks above.
{
  const FIXTURE_FEEDS = [
    'https://news.ycombinator.com/rss',
    'https://www.theverge.com/rss/index.xml',
  ]
  const FIXTURE_HEADLINES = [
    { source: 'Hacker News', title: 'A local-first dashboard people actually keep open', url: 'https://news.ycombinator.com/item?id=100', publishedAt: 5 },
    { source: 'The Verge', title: 'The quiet return of the RSS reader', url: 'https://www.theverge.com/rss-returns', publishedAt: 4 },
    { source: 'Hacker News', title: 'Show HN: I built a new-tab page just for me', url: 'https://news.ycombinator.com/item?id=101', publishedAt: 3 },
    { source: 'The Verge', title: 'Browser extensions and the per-site permission prompt', url: 'https://www.theverge.com/permissions', publishedAt: 2 },
    { source: 'Hacker News', title: 'Ask HN: what lives on your new-tab page?', url: 'https://news.ycombinator.com/item?id=102', publishedAt: 1 },
  ]
  const rssSel = '[data-block-id="rss"] section[aria-label="Headlines"]'

  await page.evaluate(
    async ({ feeds, headlines }) => {
      const { connectors } = await chrome.storage.local.get('connectors')
      await chrome.storage.local.set({
        connectors: { ...connectors, rss: { enabled: true, feeds, shownCount: 5 } },
        // fetchedAt is stamped HERE, in the page, so the snapshot is fresh
        // relative to whenever this run happens — the SWR hook then renders it
        // from cache and never touches the network.
        connectorSnapshots: { rss: { fetchedAt: Date.now(), data: headlines } },
      })
    },
    { feeds: FIXTURE_FEEDS, headlines: FIXTURE_HEADLINES },
  )
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  // Probe 1: the widget renders the seeded rows (count + first title), from
  // cache, no network. Also captures the link attributes for probe 6 in the
  // same read.
  await page.waitForSelector(rssSel, { timeout: 5000 }).catch(() => {})
  const rows = await page.evaluate((s) => {
    const sec = document.querySelector(s)
    if (!sec) return null
    const links = [...sec.querySelectorAll('a')]
    return {
      count: links.length,
      firstTitle: links[0]?.getAttribute('title') ?? null,
      firstTarget: links[0]?.getAttribute('target') ?? null,
      firstRel: links[0]?.getAttribute('rel') ?? null,
      firstHref: links[0]?.getAttribute('href') ?? null,
    }
  }, rssSel)
  const rowsOk =
    rows !== null &&
    rows.count === 5 &&
    rows.firstTitle === 'A local-first dashboard people actually keep open'
  console.log(
    rowsOk
      ? `PASS: the RSS widget renders the seeded headlines from cache (${rows.count} rows, first "${rows.firstTitle}")`
      : `FAIL: the RSS widget renders the seeded headlines from cache (${JSON.stringify(rows)})`,
  )

  // Probe 6: interaction correctness — each headline row is a REAL external
  // link. Asserted in-DOM (attributes), never by navigating away (which would
  // derail the run): a new tab, and rel that severs window.opener and strips
  // the referrer, with the href intact.
  const rel = (rows?.firstRel ?? '').split(/\s+/)
  const linkOk =
    rows !== null &&
    rows.firstTarget === '_blank' &&
    rel.includes('noopener') &&
    rel.includes('noreferrer') &&
    rows.firstHref === 'https://news.ycombinator.com/item?id=100'
  console.log(
    linkOk
      ? 'PASS: each RSS headline is an external link (target=_blank, rel=noopener noreferrer, href intact)'
      : `FAIL: each RSS headline is an external link (target=${rows?.firstTarget}, rel=${rows?.firstRel}, href=${rows?.firstHref})`,
  )

  await page.screenshot({ path: `${outDir}/connectors-rss.png` })
  console.log('captured connectors-rss.png')

  // Probe 2: combined-defaults collision — the RSS widget at its default
  // placement (left-middle) must clear the Notes pill (bottom-left) and the
  // photo refresh button (bottom-left), the two peripherals nearest its corner.
  // Same rect-intersection idiom as the clock/greeting overlap in the viewport
  // matrix below.
  const collision = await page.evaluate((s) => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      return el ? el.getBoundingClientRect() : null
    }
    const hits = (a, b) =>
      !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    const rss = rect(s)
    const notes = rect('[data-block-id="notes"]')
    const refresh = rect('button[aria-label="New background photo"]')
    return {
      found: !!rss,
      notesFound: !!notes,
      refreshFound: !!refresh,
      rssNotes: hits(rss, notes),
      rssRefresh: hits(rss, refresh),
      rss: rss ? { top: +rss.top.toFixed(1), bottom: +rss.bottom.toFixed(1), left: +rss.left.toFixed(1), right: +rss.right.toFixed(1) } : null,
    }
  }, rssSel)
  const collisionOk =
    collision.found &&
    collision.notesFound &&
    collision.refreshFound &&
    !collision.rssNotes &&
    !collision.rssRefresh
  console.log(
    collisionOk
      ? `PASS: the RSS widget clears the Notes pill and the refresh button at defaults (rss ${JSON.stringify(collision.rss)})`
      : `FAIL: the RSS widget clears the Notes pill and the refresh button at defaults (${JSON.stringify(collision)})`,
  )

  // Capture the Connectors settings card with its feeds list populated from the
  // seed (drawer-connectors.png — the tabMounts loop above deliberately left
  // this capture to here, where the feeds exist).
  await page.click('button[aria-label="Open settings"]')
  await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
  await page.waitForTimeout(400) // slide-in
  await openSettingsTab('Connectors')
  await page.screenshot({ path: `${outDir}/drawer-connectors.png` })
  console.log('captured drawer-connectors.png')

  const card = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Connectors"]')
    if (!sec) return null
    const toggle = sec.querySelector('#connector-rss-enabled')
    const count = sec.querySelector('#connector-rss-count')
    return {
      enabled: toggle ? toggle.checked : null,
      removeButtons: sec.querySelectorAll('button[aria-label^="Remove https"]').length,
      shownCount: count ? count.value : null,
    }
  })
  const cardOk = card !== null && card.enabled === true && card.removeButtons === 2
  console.log(
    cardOk
      ? `PASS: the Connectors card lists the seeded feeds (${card.removeButtons} feed rows, enabled=${card.enabled}, shownCount=${card.shownCount})`
      : `FAIL: the Connectors card lists the seeded feeds (${JSON.stringify(card)})`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400) // slide-out

  // Restore: disable the connector and clear its cache, then reload so the
  // widget is gone for every block below (viewport matrix, default-state,
  // worst-case bookmarks) — same restore discipline as the blocks above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: { ...connectors, rss: { ...connectors.rss, enabled: false } },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  const rssGone = (await page.locator(rssSel).count()) === 0
  console.log(
    rssGone
      ? 'RSS connector disabled; page restored to idle'
      : 'WARNING: RSS widget still present after disabling the connector',
  )
}

// ---------------------------------------------------------------------------
// GitHub connector (Task 48) — the FIRST full token connector, and the
// template Tasks 49-51 copy. NO live network: seed an enabled + connected
// config (a token so the widget's gate opens, a username so the card reads
// "Connected as") and a fresh snapshot (fetchedAt stamped in the page so the
// ttl is fresh at read time and useConnectorSnapshot renders straight from
// cache). Runs right after the RSS block (rss left disabled), captures, then
// DISABLES + clears so every block below (viewport matrix, default-state,
// worst-case bookmarks) is undisturbed — same snapshot/restore discipline.
{
  const FIXTURE = {
    prs: [
      { title: 'Fix the flaky auth test on CI', url: 'https://github.com/acme/app/pull/128', repo: 'acme/app' },
      { title: 'Extract the shared connector http helper', url: 'https://github.com/acme/app/pull/131', repo: 'acme/app' },
    ],
    issues: [
      { title: 'Cold-start crash when storage is empty', url: 'https://github.com/acme/web/issues/44', repo: 'acme/web' },
      { title: 'Weather chip overlaps the bar at 800px wide', url: 'https://github.com/acme/web/issues/47', repo: 'acme/web' },
    ],
    notifications: 3,
    etags: {},
  }
  const githubSel = '[data-block-id="github"] section[aria-label="GitHub"]'

  await page.evaluate(async (data) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        github: { enabled: true, token: 'github_pat_preview', username: 'octocat' },
      },
      // fetchedAt stamped HERE, in the page, so the snapshot is fresh relative
      // to whenever this run happens — the SWR hook renders from cache and never
      // touches the network.
      connectorSnapshots: { github: { fetchedAt: Date.now(), data } },
    })
  }, FIXTURE)
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  // Probe 1: the widget renders the seeded rows (2 PRs + 2 issues = 4 links)
  // from cache, first title + the unread chip. Link attributes captured in the
  // same read for probe 2.
  await page.waitForSelector(githubSel, { timeout: 5000 }).catch(() => {})
  const rows = await page.evaluate((s) => {
    const sec = document.querySelector(s)
    if (!sec) return null
    const links = [...sec.querySelectorAll('a')]
    return {
      count: links.length,
      firstTitle: links[0]?.getAttribute('title') ?? null,
      firstTarget: links[0]?.getAttribute('target') ?? null,
      firstRel: links[0]?.getAttribute('rel') ?? null,
      firstHref: links[0]?.getAttribute('href') ?? null,
      unread: sec.textContent.includes('3 unread'),
    }
  }, githubSel)
  const rowsOk =
    rows !== null &&
    rows.count === 4 &&
    rows.firstTitle === 'Fix the flaky auth test on CI' &&
    rows.unread === true
  console.log(
    rowsOk
      ? `PASS: the GitHub widget renders the seeded PRs + issues and unread count from cache (${rows.count} rows, first "${rows.firstTitle}", "3 unread" present)`
      : `FAIL: the GitHub widget renders the seeded PRs + issues and unread count from cache (${JSON.stringify(rows)})`,
  )

  // Probe 2: interaction correctness — each row is a REAL external link.
  // Asserted in-DOM (attributes), never by navigating away: a new tab, and rel
  // that severs window.opener and strips the referrer, href intact.
  const rel = (rows?.firstRel ?? '').split(/\s+/)
  const linkOk =
    rows !== null &&
    rows.firstTarget === '_blank' &&
    rel.includes('noopener') &&
    rel.includes('noreferrer') &&
    rows.firstHref === 'https://github.com/acme/app/pull/128'
  console.log(
    linkOk
      ? 'PASS: each GitHub row is an external link (target=_blank, rel=noopener noreferrer, href intact)'
      : `FAIL: each GitHub row is an external link (target=${rows?.firstTarget}, rel=${rows?.firstRel}, href=${rows?.firstHref})`,
  )

  await page.screenshot({ path: `${outDir}/connectors-github.png` })
  console.log('captured connectors-github.png')

  // Probe 3: combined-defaults collision — the GitHub widget at its default
  // placement (right-middle: fixed right-8 top-[21vh] as of Task 55 fix
  // round 2 — see the combined-defaults gate and the weather chip
  // worst-case probe near the end of this file for the full history: 24vh
  // -> 14vh in fix round 1, 14vh -> 21vh in round 2, once review found the
  // chip's real worst-case height, not its lucky-day observed one) must
  // clear the collapsed
  // weather chip (top-right band) and the timer pill (top-left), plus the
  // bottom-right Tasks pill and settings gear it is nearest to. Same
  // rect-intersection idiom as the RSS collision probe above.
  const collision = await page.evaluate((s) => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      return el ? el.getBoundingClientRect() : null
    }
    const hits = (a, b) =>
      !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    const gh = rect(s)
    const weather = rect('[data-block-id="weather"]')
    const timer = rect('[data-block-id="timer"]')
    const tasks = rect('[data-block-id="tasks"]')
    const gear = rect('button[aria-label="Open settings"]')
    return {
      found: !!gh,
      weatherFound: !!weather,
      timerFound: !!timer,
      ghWeather: hits(gh, weather),
      ghTimer: hits(gh, timer),
      ghTasks: hits(gh, tasks),
      ghGear: hits(gh, gear),
      gh: gh ? { top: +gh.top.toFixed(1), bottom: +gh.bottom.toFixed(1), left: +gh.left.toFixed(1), right: +gh.right.toFixed(1) } : null,
    }
  }, githubSel)
  const collisionOk =
    collision.found &&
    collision.weatherFound &&
    collision.timerFound &&
    !collision.ghWeather &&
    !collision.ghTimer &&
    !collision.ghTasks &&
    !collision.ghGear
  console.log(
    collisionOk
      ? `PASS: the GitHub widget clears the weather chip, timer pill, Tasks pill and gear at defaults (github ${JSON.stringify(collision.gh)})`
      : `FAIL: the GitHub widget clears the weather chip, timer pill, Tasks pill and gear at defaults (${JSON.stringify(collision)})`,
  )

  // Refresh drawer-connectors.png now that a token connector is CONNECTED — the
  // card this task adds. (The RSS block's own capture above photographed the
  // feed-list state; this refresh shows the github card's connected row.)
  await page.click('button[aria-label="Open settings"]')
  await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
  await page.waitForTimeout(400) // slide-in
  await openSettingsTab('Connectors')
  await page.screenshot({ path: `${outDir}/drawer-connectors.png` })
  console.log('captured drawer-connectors.png')

  const card = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Connectors"]')
    if (!sec) return null
    const toggle = sec.querySelector('#connector-github-enabled')
    return {
      enabled: toggle ? toggle.checked : null,
      connectedAs: sec.textContent.includes('Connected as octocat'),
      hasDisconnect: [...sec.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Disconnect'),
    }
  })
  const cardOk = card !== null && card.enabled === true && card.connectedAs && card.hasDisconnect
  console.log(
    cardOk
      ? `PASS: the GitHub card reads connected (enabled=${card.enabled}, "Connected as octocat" + Disconnect present)`
      : `FAIL: the GitHub card reads connected (${JSON.stringify(card)})`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400) // slide-out

  // Restore: disable the connector and clear its cache, then reload so the
  // widget is gone for every block below — same restore discipline as the RSS
  // block above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: { ...connectors, github: { ...connectors.github, enabled: false } },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  const githubGone = (await page.locator(githubSel).count()) === 0
  console.log(
    githubGone
      ? 'GitHub connector disabled; page restored to idle'
      : 'WARNING: GitHub widget still present after disabling the connector',
  )
}

// ---------------------------------------------------------------------------
// GitLab connector (Task 49) — github's sibling, second full token connector.
// NO live network: seed an enabled + connected config (a token so the
// widget's gate opens, an instanceUrl so the fetch URL + gate both resolve,
// a username so the card reads "Connected as") and a fresh snapshot
// (fetchedAt stamped in the page so the ttl is fresh at read time and
// useConnectorSnapshot renders straight from cache). Runs right after the
// GitHub block (github left disabled), captures, probes its own defaults,
// THEN — since github's default slot (top-[21vh] as of Task 55 fix round 2)
// sits directly above gitlab's (top-[50vh], same round — see the
// combined-defaults gate and the weather chip worst-case probe near the end
// of this file for the full history: 46vh -> 54vh in Task 55's own
// combined-defaults gate, 54vh -> 48vh in fix round 1 (lowered every
// right-column connector's display cap and moved github up), then
// 48vh -> 50vh in fix round 2 (the weather chip's real, forced worst-case
// height pushed github up again, from 14vh to 21vh, which pushed gitlab
// down in turn)) — momentarily re-enables github alongside gitlab to prove
// the two stack
// without overlapping when BOTH are connected at once, before restoring
// everything off so every block below (viewport matrix, default-state,
// worst-case bookmarks) is undisturbed. NOTE: this probe's own github
// stand-in is EMPTY (0 prs/issues, seeded below), so it does not by itself
// exercise the real collision Task 55 found and fixed — see that gate's own
// comment for the full writeup.
{
  const FIXTURE = {
    mrs: [
      {
        title: 'Add rate limiting to the ingest API',
        url: 'https://gitlab.com/acme/platform/-/merge_requests/204',
        project: 'acme/platform',
      },
      {
        title: 'Bump vite to 6.x',
        url: 'https://gitlab.com/acme/platform/-/merge_requests/207',
        project: 'acme/platform',
      },
    ],
    todos: 6,
  }
  const gitlabSel = '[data-block-id="gitlab"] section[aria-label="GitLab"]'

  await page.evaluate(async (data) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        gitlab: { enabled: true, token: 'glpat_preview', instanceUrl: 'https://gitlab.com', username: 'jcooler' },
      },
      // fetchedAt stamped HERE, in the page, so the snapshot is fresh relative
      // to whenever this run happens — the SWR hook renders from cache and never
      // touches the network.
      connectorSnapshots: { gitlab: { fetchedAt: Date.now(), data } },
    })
  }, FIXTURE)
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  // Probe 1: the widget renders the seeded rows (2 MRs) from cache, first
  // title + the to-dos chip. Link attributes captured in the same read for
  // probe 2.
  await page.waitForSelector(gitlabSel, { timeout: 5000 }).catch(() => {})
  const rows = await page.evaluate((s) => {
    const sec = document.querySelector(s)
    if (!sec) return null
    const links = [...sec.querySelectorAll('a')]
    return {
      count: links.length,
      firstTitle: links[0]?.getAttribute('title') ?? null,
      firstTarget: links[0]?.getAttribute('target') ?? null,
      firstRel: links[0]?.getAttribute('rel') ?? null,
      firstHref: links[0]?.getAttribute('href') ?? null,
      todos: sec.textContent.includes('6 to-dos'),
    }
  }, gitlabSel)
  const rowsOk =
    rows !== null &&
    rows.count === 2 &&
    rows.firstTitle === 'Add rate limiting to the ingest API' &&
    rows.todos === true
  console.log(
    rowsOk
      ? `PASS: the GitLab widget renders the seeded MRs and to-dos count from cache (${rows.count} rows, first "${rows.firstTitle}", "6 to-dos" present)`
      : `FAIL: the GitLab widget renders the seeded MRs and to-dos count from cache (${JSON.stringify(rows)})`,
  )

  // Probe 2: interaction correctness — each row is a REAL external link.
  // Asserted in-DOM (attributes), never by navigating away: a new tab, and rel
  // that severs window.opener and strips the referrer, href intact.
  const rel = (rows?.firstRel ?? '').split(/\s+/)
  const linkOk =
    rows !== null &&
    rows.firstTarget === '_blank' &&
    rel.includes('noopener') &&
    rel.includes('noreferrer') &&
    rows.firstHref === 'https://gitlab.com/acme/platform/-/merge_requests/204'
  console.log(
    linkOk
      ? 'PASS: each GitLab row is an external link (target=_blank, rel=noopener noreferrer, href intact)'
      : `FAIL: each GitLab row is an external link (target=${rows?.firstTarget}, rel=${rows?.firstRel}, href=${rows?.firstHref})`,
  )

  await page.screenshot({ path: `${outDir}/connectors-gitlab.png` })
  console.log('captured connectors-gitlab.png')

  // Probe 3: combined-defaults collision — the GitLab widget at its default
  // placement (right-middle, below github: fixed right-8 top-[50vh] as of
  // Task 55 fix round 2) must clear the collapsed weather chip (top-right band), the
  // timer pill (top-left), plus the bottom-right Tasks pill and settings
  // gear it is nearest to. Same rect-intersection idiom as the GitHub
  // collision probe above.
  const collision = await page.evaluate((s) => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      return el ? el.getBoundingClientRect() : null
    }
    const hits = (a, b) =>
      !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    const gl = rect(s)
    const weather = rect('[data-block-id="weather"]')
    const timer = rect('[data-block-id="timer"]')
    const tasks = rect('[data-block-id="tasks"]')
    const gear = rect('button[aria-label="Open settings"]')
    return {
      found: !!gl,
      weatherFound: !!weather,
      timerFound: !!timer,
      glWeather: hits(gl, weather),
      glTimer: hits(gl, timer),
      glTasks: hits(gl, tasks),
      glGear: hits(gl, gear),
      gl: gl ? { top: +gl.top.toFixed(1), bottom: +gl.bottom.toFixed(1), left: +gl.left.toFixed(1), right: +gl.right.toFixed(1) } : null,
    }
  }, gitlabSel)
  const collisionOk =
    collision.found &&
    collision.weatherFound &&
    collision.timerFound &&
    !collision.glWeather &&
    !collision.glTimer &&
    !collision.glTasks &&
    !collision.glGear
  console.log(
    collisionOk
      ? `PASS: the GitLab widget clears the weather chip, timer pill, Tasks pill and gear at defaults (gitlab ${JSON.stringify(collision.gl)})`
      : `FAIL: the GitLab widget clears the weather chip, timer pill, Tasks pill and gear at defaults (${JSON.stringify(collision)})`,
  )

  // Refresh drawer-connectors.png now that gitlab is CONNECTED — the card
  // this task adds. (The GitHub block's own refresh above photographed ITS
  // connected row, with github still enabled at the time; this refresh shows
  // gitlab's connected row, with github back to disabled by now.)
  await page.click('button[aria-label="Open settings"]')
  await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
  await page.waitForTimeout(400) // slide-in
  await openSettingsTab('Connectors')
  await page.screenshot({ path: `${outDir}/drawer-connectors.png` })
  console.log('captured drawer-connectors.png')

  const card = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Connectors"]')
    if (!sec) return null
    const toggle = sec.querySelector('#connector-gitlab-enabled')
    return {
      enabled: toggle ? toggle.checked : null,
      connectedAs: sec.textContent.includes('Connected as jcooler'),
      hasDisconnect: [...sec.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Disconnect'),
    }
  })
  const cardOk = card !== null && card.enabled === true && card.connectedAs && card.hasDisconnect
  console.log(
    cardOk
      ? `PASS: the GitLab card reads connected (enabled=${card.enabled}, "Connected as jcooler" + Disconnect present)`
      : `FAIL: the GitLab card reads connected (${JSON.stringify(card)})`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400) // slide-out

  // Probe 4: gitlab-vs-github non-overlap when BOTH connectors are enabled
  // together — the collision probe above only proves gitlab clears its
  // NEIGHBOURS at its own default; it says nothing about github's default
  // slot directly above it, which only exists when github is ALSO connected.
  // Momentarily re-seed github (disabled by its own block, above) alongside
  // gitlab, purely for this one measurement.
  await page.evaluate(async (data) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        github: { enabled: true, token: 'github_pat_preview', username: 'octocat' },
      },
      connectorSnapshots: {
        gitlab: { fetchedAt: Date.now(), data },
        github: { fetchedAt: Date.now(), data: { prs: [], issues: [], notifications: 0, etags: {} } },
      },
    })
  }, FIXTURE)
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  const combined = await page.evaluate(
    ([selGl, selGh]) => {
      const rect = (sel) => {
        const el = document.querySelector(sel)
        return el ? el.getBoundingClientRect() : null
      }
      const hits = (a, b) =>
        !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
      const gl = rect(selGl)
      const gh = rect(selGh)
      return {
        glFound: !!gl,
        ghFound: !!gh,
        overlap: hits(gl, gh),
        gl: gl ? { top: +gl.top.toFixed(1), bottom: +gl.bottom.toFixed(1) } : null,
        gh: gh ? { top: +gh.top.toFixed(1), bottom: +gh.bottom.toFixed(1) } : null,
      }
    },
    [gitlabSel, '[data-block-id="github"] section[aria-label="GitHub"]'],
  )
  const combinedOk = combined.glFound && combined.ghFound && !combined.overlap
  console.log(
    combinedOk
      ? `PASS: with BOTH github and gitlab connected, their default cards stack without overlapping (github ${JSON.stringify(combined.gh)}, gitlab ${JSON.stringify(combined.gl)})`
      : `FAIL: with BOTH github and gitlab connected, their default cards stack without overlapping (${JSON.stringify(combined)})`,
  )

  // Restore: disable BOTH connectors (gitlab, and github re-enabled just above
  // for probe 4) and clear their cache, then reload so neither widget is
  // present for every block below — same restore discipline as the RSS/GitHub
  // blocks above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        gitlab: { ...connectors.gitlab, enabled: false },
        github: { ...connectors.github, enabled: false },
      },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  const gitlabGone = (await page.locator(gitlabSel).count()) === 0
  console.log(
    gitlabGone
      ? 'GitLab connector disabled; page restored to idle'
      : 'WARNING: GitLab widget still present after disabling the connector',
  )
}

// ---------------------------------------------------------------------------
// Jira connector (Task 50) — the third full token connector, and the FIRST
// with a THREE-field card body (site, email, API token — Jira Cloud auth is
// email + token, not a bare token). NO live network: seed an enabled +
// connected config (site/email/apiToken so the widget's gate opens, a
// displayName so the card reads "Connected as") and a fresh snapshot
// (fetchedAt stamped in the page so the ttl is fresh at read time and
// useConnectorSnapshot renders straight from cache). Runs right after the
// GitLab block (github + gitlab both left disabled), captures, probes its
// own defaults (including the bottom-right Tasks pill it sits closest to —
// jira's `top-[72vh]` default, as of Task 55 fix round 2, is the LOWEST of
// the three right-column connectors), THEN — since github's/gitlab's
// default slots (top-[21vh], top-[50vh] as of that same fix round) sit
// directly above jira's own (top-[72vh]) — momentarily re-enables ALL THREE
// alongside jira to prove
// the full right-column stack never overlaps itself, before restoring
// everything off so every block below (viewport matrix, default-state,
// worst-case bookmarks) is undisturbed. NOTE: this probe's own github/
// gitlab stand-ins are EMPTY (seeded below), so — like the gitlab-vs-github
// probe above — it does not by itself exercise the real all-real-content
// collision Task 55's own combined-defaults gate found and fixed.
{
  const FIXTURE = {
    issues: [
      {
        key: 'AUR-101',
        summary: 'Fix the flaky auth test on CI',
        status: 'In Progress',
        url: 'https://yoursite.atlassian.net/browse/AUR-101',
      },
      {
        key: 'AUR-102',
        summary: 'Draft the Q3 planning doc',
        status: 'In Progress',
        url: 'https://yoursite.atlassian.net/browse/AUR-102',
      },
      {
        key: 'AUR-103',
        summary: 'Rotate the staging API keys',
        status: 'To Do',
        url: 'https://yoursite.atlassian.net/browse/AUR-103',
      },
    ],
    counts: { 'In Progress': 2, 'To Do': 1 },
  }
  const jiraSel = '[data-block-id="jira"] section[aria-label="Jira"]'

  await page.evaluate(async (data) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        jira: {
          enabled: true,
          email: 'jon@acme.com',
          apiToken: 'atlassian_preview',
          site: 'yoursite.atlassian.net',
          displayName: 'Jon Cooler',
        },
      },
      // fetchedAt stamped HERE, in the page, so the snapshot is fresh relative
      // to whenever this run happens — the SWR hook renders from cache and never
      // touches the network.
      connectorSnapshots: { jira: { fetchedAt: Date.now(), data } },
    })
  }, FIXTURE)
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  // Probe 1: the widget renders the seeded rows (3 issues) from cache, first
  // summary + the counts line. Link attributes captured in the same read for
  // probe 2.
  await page.waitForSelector(jiraSel, { timeout: 5000 }).catch(() => {})
  const rows = await page.evaluate((s) => {
    const sec = document.querySelector(s)
    if (!sec) return null
    const links = [...sec.querySelectorAll('a')]
    return {
      count: links.length,
      firstTitle: links[0]?.getAttribute('title') ?? null,
      firstTarget: links[0]?.getAttribute('target') ?? null,
      firstRel: links[0]?.getAttribute('rel') ?? null,
      firstHref: links[0]?.getAttribute('href') ?? null,
      counts: sec.textContent.includes('2 In Progress · 1 To Do'),
    }
  }, jiraSel)
  const rowsOk =
    rows !== null &&
    rows.count === 3 &&
    rows.firstTitle === 'Fix the flaky auth test on CI' &&
    rows.counts === true
  console.log(
    rowsOk
      ? `PASS: the Jira widget renders the seeded issues and counts line from cache (${rows.count} rows, first "${rows.firstTitle}", "2 In Progress · 1 To Do" present)`
      : `FAIL: the Jira widget renders the seeded issues and counts line from cache (${JSON.stringify(rows)})`,
  )

  // Probe 2: interaction correctness — each row is a REAL external link.
  // Asserted in-DOM (attributes), never by navigating away: a new tab, and rel
  // that severs window.opener and strips the referrer, href intact.
  const rel = (rows?.firstRel ?? '').split(/\s+/)
  const linkOk =
    rows !== null &&
    rows.firstTarget === '_blank' &&
    rel.includes('noopener') &&
    rel.includes('noreferrer') &&
    rows.firstHref === 'https://yoursite.atlassian.net/browse/AUR-101'
  console.log(
    linkOk
      ? 'PASS: each Jira row is an external link (target=_blank, rel=noopener noreferrer, href intact)'
      : `FAIL: each Jira row is an external link (target=${rows?.firstTarget}, rel=${rows?.firstRel}, href=${rows?.firstHref})`,
  )

  await page.screenshot({ path: `${outDir}/connectors-jira.png` })
  console.log('captured connectors-jira.png')

  // Probe 3: combined-defaults collision — the Jira widget at its default
  // placement (right column, lowest: fixed right-8 top-[72vh] as of Task 55
  // fix round 2)
  // must clear the collapsed weather chip (top-right band), the timer pill
  // (top-left), and — the one this default sits closest to — the
  // bottom-right Tasks pill and settings gear. Same rect-intersection idiom
  // as the GitHub/GitLab collision
  // probes above.
  const collision = await page.evaluate((s) => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      return el ? el.getBoundingClientRect() : null
    }
    const hits = (a, b) =>
      !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    const jr = rect(s)
    const weather = rect('[data-block-id="weather"]')
    const timer = rect('[data-block-id="timer"]')
    const tasks = rect('[data-block-id="tasks"]')
    const gear = rect('button[aria-label="Open settings"]')
    return {
      found: !!jr,
      weatherFound: !!weather,
      timerFound: !!timer,
      tasksFound: !!tasks,
      jrWeather: hits(jr, weather),
      jrTimer: hits(jr, timer),
      jrTasks: hits(jr, tasks),
      jrGear: hits(jr, gear),
      jr: jr ? { top: +jr.top.toFixed(1), bottom: +jr.bottom.toFixed(1), left: +jr.left.toFixed(1), right: +jr.right.toFixed(1) } : null,
      tasks: tasks ? { top: +tasks.top.toFixed(1), bottom: +tasks.bottom.toFixed(1) } : null,
    }
  }, jiraSel)
  const collisionOk =
    collision.found &&
    collision.weatherFound &&
    collision.timerFound &&
    collision.tasksFound &&
    !collision.jrWeather &&
    !collision.jrTimer &&
    !collision.jrTasks &&
    !collision.jrGear
  console.log(
    collisionOk
      ? `PASS: the Jira widget clears the weather chip, timer pill, Tasks pill and gear at defaults (jira ${JSON.stringify(collision.jr)}, tasks ${JSON.stringify(collision.tasks)})`
      : `FAIL: the Jira widget clears the weather chip, timer pill, Tasks pill and gear at defaults (${JSON.stringify(collision)})`,
  )

  // Refresh drawer-connectors.png now that jira is CONNECTED — the card this
  // task adds. (The GitLab block's own refresh above photographed ITS
  // connected row, with github still enabled at the time; this refresh shows
  // jira's connected row, with github/gitlab back to disabled by now.)
  await page.click('button[aria-label="Open settings"]')
  await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
  await page.waitForTimeout(400) // slide-in
  await openSettingsTab('Connectors')
  await page.screenshot({ path: `${outDir}/drawer-connectors.png` })
  console.log('captured drawer-connectors.png')

  const card = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Connectors"]')
    if (!sec) return null
    const toggle = sec.querySelector('#connector-jira-enabled')
    return {
      enabled: toggle ? toggle.checked : null,
      connectedAs: sec.textContent.includes('Connected as Jon Cooler'),
      hasDisconnect: [...sec.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Disconnect'),
    }
  })
  const cardOk = card !== null && card.enabled === true && card.connectedAs && card.hasDisconnect
  console.log(
    cardOk
      ? `PASS: the Jira card reads connected (enabled=${card.enabled}, "Connected as Jon Cooler" + Disconnect present)`
      : `FAIL: the Jira card reads connected (${JSON.stringify(card)})`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400) // slide-out

  // Probe 4: three-stack non-overlap — the collision probe above only proves
  // jira clears its NEIGHBOURS (weather/timer/tasks/gear) at its own default;
  // it says nothing about github's/gitlab's default slots directly above it,
  // which only exist when those connectors are ALSO connected. Momentarily
  // re-seed github + gitlab (each disabled by its own earlier block) alongside
  // jira, purely for this one measurement, then assert every PAIR of the three
  // right-column panels is non-overlapping.
  await page.evaluate(async (data) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        github: { enabled: true, token: 'github_pat_preview', username: 'octocat' },
        gitlab: { enabled: true, token: 'glpat_preview', instanceUrl: 'https://gitlab.com', username: 'jcooler' },
      },
      connectorSnapshots: {
        jira: { fetchedAt: Date.now(), data },
        github: { fetchedAt: Date.now(), data: { prs: [], issues: [], notifications: 0, etags: {} } },
        gitlab: { fetchedAt: Date.now(), data: { mrs: [], todos: 0 } },
      },
    })
  }, FIXTURE)
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  const stack = await page.evaluate(
    ([selGh, selGl, selJr]) => {
      const rect = (sel) => {
        const el = document.querySelector(sel)
        return el ? el.getBoundingClientRect() : null
      }
      const hits = (a, b) =>
        !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
      const gh = rect(selGh)
      const gl = rect(selGl)
      const jr = rect(selJr)
      return {
        ghFound: !!gh,
        glFound: !!gl,
        jrFound: !!jr,
        ghGl: hits(gh, gl),
        ghJr: hits(gh, jr),
        glJr: hits(gl, jr),
        gh: gh ? { top: +gh.top.toFixed(1), bottom: +gh.bottom.toFixed(1) } : null,
        gl: gl ? { top: +gl.top.toFixed(1), bottom: +gl.bottom.toFixed(1) } : null,
        jr: jr ? { top: +jr.top.toFixed(1), bottom: +jr.bottom.toFixed(1) } : null,
      }
    },
    ['[data-block-id="github"] section[aria-label="GitHub"]', '[data-block-id="gitlab"] section[aria-label="GitLab"]', jiraSel],
  )
  const stackOk =
    stack.ghFound && stack.glFound && stack.jrFound && !stack.ghGl && !stack.ghJr && !stack.glJr
  console.log(
    stackOk
      ? `PASS: with github, gitlab AND jira all connected, their default cards stack in one column with no pairwise overlap (github ${JSON.stringify(stack.gh)}, gitlab ${JSON.stringify(stack.gl)}, jira ${JSON.stringify(stack.jr)})`
      : `FAIL: with github, gitlab AND jira all connected, their default cards stack in one column with no pairwise overlap (${JSON.stringify(stack)})`,
  )

  // Restore: disable ALL THREE connectors (jira, plus github/gitlab re-enabled
  // just above for probe 4) and clear their cache, then reload so none of the
  // three widgets is present for every block below — same restore discipline
  // as the RSS/GitHub/GitLab blocks above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        jira: { ...connectors.jira, enabled: false },
        github: { ...connectors.github, enabled: false },
        gitlab: { ...connectors.gitlab, enabled: false },
      },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  const jiraGone = (await page.locator(jiraSel).count()) === 0
  console.log(
    jiraGone
      ? 'Jira connector disabled; page restored to idle'
      : 'WARNING: Jira widget still present after disabling the connector',
  )
}

// ---------------------------------------------------------------------------
// Vercel connector (Task 51) — the fourth full token connector. The brief's
// own starting hypothesis was a SECOND right-hand column beside github
// (`right-[22-23rem] top-[24vh]`) — implemented first, then REJECTED by
// direct measurement, not just class-name reasoning: at this app's 1600x900
// launch viewport, github's own LEFT edge sits at x=1248 (right-8 + w-80),
// but the centered clock/search/focus/quote column reaches out to x=964.5-
// 1088 at various rows, leaving under 300px of horizontal room for what
// would need to be a 320px (w-80) card — there is NO row height at which a
// second w-80 card fits between the centered column and github without
// touching one or the other (screenshotted and measured directly; see the
// git history for that captured overlap). So the real placement is the LEFT
// side instead, one level below RSS's own existing `left-8 top-[22vh]` slot
// — App.tsx's own comment on the vercel PositionedBlock has the full
// measured writeup, including why `top-[64vh]` (not a naive same-rhythm
// 44vh) is what actually clears RSS even at ITS worst case (shownCount=8).
// NO live network: seed an enabled + connected config (just a token +
// username, github's own shape) and a fresh snapshot at FIVE deployments —
// MAX_DEPLOYMENTS, vercel's OWN worst-case row count, so the widget rendered
// throughout this whole block (including the drawer-connectors.png capture
// and the four-stack probe) is genuinely its tallest possible card, not a
// shorter stand-in — fetchedAt stamped in the page so the ttl is fresh at
// read time and useConnectorSnapshot renders straight from cache. Runs right
// after the Jira block (github/gitlab/jira all left disabled), captures its
// own defaults ALONE (per the brief: "seed vercel alone") — then a gap probe
// against RSS at ITS worst case AND the quote block below it (vercel's OWN
// worst-case height is what actually reaches closest to quote), plus the
// full centered-content column and its two bottom-left neighbours (the Notes
// pill, the photo refresh button) — the exact invariants the rejected
// right-side placement violated and a fix-round-1 review caught missing here
// — then the FOUR-stack probe: re-enable github, gitlab AND jira alongside
// vercel and assert every pair among all four panels is non-overlapping and
// every panel clears weather/Tasks/Notes/photo-refresh too, before restoring
// everything off so every block below (viewport matrix, default-state,
// worst-case bookmarks) is undisturbed.
{
  // FIVE deployments — MAX_DEPLOYMENTS (vercel.ts / VercelWidget.tsx), i.e.
  // the widget's actual row cap. A shorter fixture here would make every
  // "clears its neighbour" measurement in this block a measurement of a
  // SHORTER-than-worst-case card — fix-round-1 review caught exactly that
  // gap (the block used to seed only 3). ERROR is the OLDEST of the five, so
  // a naive recency-only sort would put it LAST — proving the render
  // actually exercises the failed-first rule, not just a lucky ordering; the
  // four READY/BUILDING entries are each a different age so the recency-desc
  // half of the sort is exercised too, not just a two-item tiebreak.
  const FIXTURE = {
    deployments: [
      {
        project: 'marketing-site',
        state: 'ERROR',
        url: 'https://vercel.com/acme/marketing-site/dep-err',
        createdAt: Date.now() - 6 * 60 * 60 * 1000, // 6h old — oldest overall, still sorts FIRST
      },
      {
        project: 'app-web',
        state: 'READY',
        url: 'https://vercel.com/acme/app-web/dep-ready',
        createdAt: Date.now() - 3 * 60 * 1000, // 3m old — newest non-error
      },
      {
        project: 'admin',
        state: 'READY',
        url: 'https://vercel.com/acme/admin/dep-ready',
        createdAt: Date.now() - 10 * 60 * 1000, // 10m old
      },
      {
        project: 'landing',
        state: 'READY',
        url: 'https://vercel.com/acme/landing/dep-ready',
        createdAt: Date.now() - 20 * 60 * 1000, // 20m old
      },
      {
        project: 'docs',
        state: 'BUILDING',
        url: 'https://vercel.com/acme/docs/dep-building',
        createdAt: Date.now() - 60 * 60 * 1000, // 1h old — oldest non-error
      },
    ],
  }
  // Expected render order per fetchVercel's failed-first-then-recency sort:
  // the ERROR row first regardless of age, then the four READY/BUILDING rows
  // newest-to-oldest.
  const EXPECTED_ORDER = ['marketing-site', 'app-web', 'admin', 'landing', 'docs']
  const vercelSel = '[data-block-id="vercel"] section[aria-label="Vercel"]'

  await page.evaluate(async (data) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        vercel: { enabled: true, token: 'vercel_preview', username: 'jcooler' },
      },
      // fetchedAt stamped HERE, in the page, so the snapshot is fresh relative
      // to whenever this run happens — the SWR hook renders from cache and never
      // touches the network.
      connectorSnapshots: { vercel: { fetchedAt: Date.now(), data } },
    })
  }, FIXTURE)
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  // Probe 1: the widget renders the seeded rows — all FIVE (MAX_DEPLOYMENTS,
  // vercel's own worst-case row count, not a truncated stand-in) — from
  // cache, in the FULL failed-first-then-recency order, not just "the ERROR
  // row is first": every one of the five positions is checked against
  // EXPECTED_ORDER, so a bug in the recency half of the sort (not just the
  // failed-first half) would fail this too. Link attributes captured in the
  // same read for probe 2.
  await page.waitForSelector(vercelSel, { timeout: 5000 }).catch(() => {})
  const rows = await page.evaluate((s) => {
    const sec = document.querySelector(s)
    if (!sec) return null
    const items = [...sec.querySelectorAll('li')]
    const links = items.map((li) => li.querySelector('a'))
    return {
      count: items.length,
      projects: links.map((a) => a?.getAttribute('title') ?? null),
      firstTarget: links[0]?.getAttribute('target') ?? null,
      firstRel: links[0]?.getAttribute('rel') ?? null,
      firstHref: links[0]?.getAttribute('href') ?? null,
    }
  }, vercelSel)
  const rowsOk =
    rows !== null &&
    rows.count === 5 &&
    JSON.stringify(rows.projects) === JSON.stringify(EXPECTED_ORDER)
  console.log(
    rowsOk
      ? `PASS: the Vercel widget renders all 5 seeded deployments (its own worst-case row count) failed-first-then-recency from cache (order ${JSON.stringify(rows.projects)})`
      : `FAIL: the Vercel widget renders all 5 seeded deployments (its own worst-case row count) failed-first-then-recency from cache (${JSON.stringify(rows)}, expected ${JSON.stringify(EXPECTED_ORDER)})`,
  )

  // Probe 2: interaction correctness — each row is a REAL external link.
  // Asserted in-DOM (attributes), never by navigating away: a new tab, and rel
  // that severs window.opener and strips the referrer, href intact.
  const rel = (rows?.firstRel ?? '').split(/\s+/)
  const linkOk =
    rows !== null &&
    rows.firstTarget === '_blank' &&
    rel.includes('noopener') &&
    rel.includes('noreferrer') &&
    rows.firstHref === 'https://vercel.com/acme/marketing-site/dep-err'
  console.log(
    linkOk
      ? 'PASS: each Vercel row is an external link (target=_blank, rel=noopener noreferrer, href intact)'
      : `FAIL: each Vercel row is an external link (target=${rows?.firstTarget}, rel=${rows?.firstRel}, href=${rows?.firstHref})`,
  )

  await page.screenshot({ path: `${outDir}/connectors-vercel.png` })
  console.log('captured connectors-vercel.png')

  // Probe 3: the measured gap to RSS's own slot directly above vercel's, AND
  // to the quote block below it — the two placement numbers this task
  // actually has to justify (App.tsx's own comment has the full writeup on
  // why the FIRST placement idea, a second column beside github, was
  // measured and rejected). RSS's shownCount is user-configurable 3-8
  // (Connectors.tsx's SHOWN_COUNT_OPTIONS), so this seeds RSS at its OWN
  // worst case (8 headlines, its tallest) rather than its default 5 — the
  // real question isn't "does it clear the default", it's "does it clear the
  // worst case", same discipline as the bookmarks worst-case probes
  // elsewhere in this script. The vercel card itself is ALREADY at its own
  // worst case here (the FIXTURE seeded above the block is all 5
  // MAX_DEPLOYMENTS rows), so the quote-gap measurement below is the real
  // bottom-edge number, not an estimate from a shorter card. Also re-checks
  // the full centered-content column (clock/greeting/search/focus/quote) AND
  // its two bottom-left neighbours — the Notes pill and the photo refresh
  // button (Background.tsx's `absolute bottom-4 left-4`) — alongside the
  // usual weather/timer/tasks/gear peripherals; the centered-column check is
  // the exact invariant the REJECTED right-side placement violated, and the
  // Notes/photo-refresh check is what a fix-round-1 review caught this block
  // never asserting even though vercel's new left-column slot sits directly
  // above both of them.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        rss: { enabled: true, feeds: ['https://example.com/feed'], shownCount: 8 },
      },
      connectorSnapshots: {
        vercel: (await chrome.storage.local.get('connectorSnapshots')).connectorSnapshots?.vercel,
        // rss's own snapshot `data` is a bare Headline[] (not a `{ items }`
        // wrapper like the token connectors use) — see rss.ts/RssWidget.tsx
        // — but it's still wrapped in the usual { fetchedAt, data } envelope
        // every connectorSnapshots entry carries.
        rss: {
          fetchedAt: Date.now(),
          data: Array.from({ length: 8 }, (_, i) => ({
            title: `Worst-case headline number ${i} for the gap measurement`,
            url: `https://example.com/${i}`,
            source: 'Example',
            publishedAt: Date.now() - i * 1000,
          })),
        },
      },
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  const gap = await page.evaluate((selVc) => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      return el ? el.getBoundingClientRect() : null
    }
    const hits = (a, b) =>
      !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    const weather = rect('[data-block-id="weather"]')
    const timer = rect('[data-block-id="timer"]')
    const tasks = rect('[data-block-id="tasks"]')
    const gear = rect('button[aria-label="Open settings"]')
    const clock = rect('[data-block-id="clock"]')
    const greeting = rect('[data-block-id="greeting"]')
    const search = rect('[data-block-id="search"]')
    const focus = rect('[data-block-id="focus"]')
    const quote = rect('[data-block-id="quote"]')
    const rss = rect('[data-block-id="rss"] section[aria-label="Headlines"]')
    // The two bottom-left neighbours vercel's new slot sits directly above —
    // Background.tsx's photo-refresh button (`absolute bottom-4 left-4`) and
    // the Notes pill (`fixed bottom-4 left-16`) — never checked before this
    // fix round even though both are geometrically closer to vercel's slot
    // than anything already asserted here.
    const notes = rect('[data-block-id="notes"]')
    const photoRefresh = rect('button[aria-label="New background photo"]')
    const vc = rect(selVc)
    return {
      vcFound: !!vc,
      rssFound: !!rss,
      quoteFound: !!quote,
      notesFound: !!notes,
      photoRefreshFound: !!photoRefresh,
      // Gap ABOVE vercel (to RSS's bottom edge) and BELOW vercel (to quote's
      // top edge) — vercel's card is seeded at its own worst-case height
      // (5/5 MAX_DEPLOYMENTS rows) for this whole block, so pxGapBelow is
      // the real worst-case bottom-edge clearance, not an estimate.
      pxGapAbove: vc && rss ? vc.top - rss.bottom : null,
      pxGapBelow: vc && quote ? quote.top - vc.bottom : null,
      overlapRss: hits(vc, rss),
      vcWeather: hits(vc, weather),
      vcTimer: hits(vc, timer),
      vcTasks: hits(vc, tasks),
      vcGear: hits(vc, gear),
      vcClock: hits(vc, clock),
      vcGreeting: hits(vc, greeting),
      vcSearch: hits(vc, search),
      vcFocus: hits(vc, focus),
      vcQuote: hits(vc, quote),
      vcNotes: hits(vc, notes),
      vcPhotoRefresh: hits(vc, photoRefresh),
      vc: vc ? { top: +vc.top.toFixed(1), bottom: +vc.bottom.toFixed(1), left: +vc.left.toFixed(1), right: +vc.right.toFixed(1) } : null,
      rss: rss ? { top: +rss.top.toFixed(1), bottom: +rss.bottom.toFixed(1) } : null,
      quote: quote ? { top: +quote.top.toFixed(1), bottom: +quote.bottom.toFixed(1) } : null,
    }
  }, vercelSel)
  const gapAboveOk = gap.vcFound && gap.rssFound && !gap.overlapRss && gap.pxGapAbove !== null && gap.pxGapAbove >= 16
  console.log(
    gapAboveOk
      ? `PASS: the Vercel widget's slot clears RSS's own slot above it — even at RSS's worst-case 8 headlines — by a real, measured gap (${gap.pxGapAbove?.toFixed(1)}px — vercel ${JSON.stringify(gap.vc)}, rss bottom ${gap.rss?.bottom})`
      : `FAIL: the Vercel widget's slot clears RSS's own slot above it — even at RSS's worst-case 8 headlines — by a real, measured gap (${JSON.stringify(gap)})`,
  )
  const gapBelowOk = gap.vcFound && gap.quoteFound && !gap.vcQuote && gap.pxGapBelow !== null && gap.pxGapBelow >= 16
  console.log(
    gapBelowOk
      ? `PASS: the Vercel widget's slot clears the quote block below it — at vercel's OWN worst case (5/5 MAX_DEPLOYMENTS rows) — by a real, measured gap (${gap.pxGapBelow?.toFixed(1)}px — vercel bottom ${gap.vc?.bottom}, quote top ${gap.quote?.top})`
      : `FAIL: the Vercel widget's slot clears the quote block below it — at vercel's OWN worst case (5/5 MAX_DEPLOYMENTS rows) — by a real, measured gap (${JSON.stringify(gap)})`,
  )
  const collisionOk =
    gap.notesFound &&
    gap.photoRefreshFound &&
    !gap.vcWeather &&
    !gap.vcTimer &&
    !gap.vcTasks &&
    !gap.vcGear &&
    !gap.vcClock &&
    !gap.vcGreeting &&
    !gap.vcSearch &&
    !gap.vcFocus &&
    !gap.vcQuote &&
    !gap.vcNotes &&
    !gap.vcPhotoRefresh
  console.log(
    collisionOk
      ? 'PASS: the Vercel widget clears the weather chip, timer pill, Tasks pill, gear, the Notes pill, the photo refresh button, AND the full centered column (clock/greeting/search/focus/quote) at defaults'
      : `FAIL: the Vercel widget clears the weather chip, timer pill, Tasks pill, gear, the Notes pill, the photo refresh button, AND the full centered column (clock/greeting/search/focus/quote) at defaults (${JSON.stringify(gap)})`,
  )

  // Restore RSS back to disabled — its own block already ran and left it that
  // way; this probe borrowed it (at its own worst-case row count) only for
  // the gap measurement above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: { ...connectors, rss: { ...connectors.rss, enabled: false } },
      connectorSnapshots: {},
    })
  })

  // Refresh drawer-connectors.png now that vercel is CONNECTED — the card
  // this task adds. (The Jira block's own refresh above photographed ITS
  // connected row, with github/gitlab back to disabled by now.)
  await page.click('button[aria-label="Open settings"]')
  await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
  await page.waitForTimeout(400) // slide-in
  await openSettingsTab('Connectors')
  await page.screenshot({ path: `${outDir}/drawer-connectors.png` })
  console.log('captured drawer-connectors.png')

  const card = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Connectors"]')
    if (!sec) return null
    const toggle = sec.querySelector('#connector-vercel-enabled')
    return {
      enabled: toggle ? toggle.checked : null,
      connectedAs: sec.textContent.includes('Connected as jcooler'),
      hasDisconnect: [...sec.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Disconnect'),
    }
  })
  const cardOk = card !== null && card.enabled === true && card.connectedAs && card.hasDisconnect
  console.log(
    cardOk
      ? `PASS: the Vercel card reads connected (enabled=${card.enabled}, "Connected as jcooler" + Disconnect present)`
      : `FAIL: the Vercel card reads connected (${JSON.stringify(card)})`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400) // slide-out

  // Probe 4: FOUR-stack non-overlap — github, gitlab, jira AND vercel all
  // enabled together. The collision probe above only proves vercel clears
  // its NEIGHBOURS (weather/timer/tasks/gear/notes/photo-refresh) and
  // github's slot specifically; this is the full right-column-plus-
  // second-column picture, asserting every PAIR among all four panels is
  // non-overlapping, and that each still individually clears the collapsed
  // weather chip, the Tasks pill, the Notes pill AND the photo refresh
  // button (the four peripherals every earlier per-connector/per-widget
  // probe already checked alone — re-checked here because FOUR
  // simultaneously-rendered cards is the actual worst case for the page,
  // not any one of them alone; Notes/photo-refresh added in fix round 1,
  // same reviewer finding as probe 3's).
  await page.evaluate(async (data) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        github: { enabled: true, token: 'github_pat_preview', username: 'octocat' },
        gitlab: { enabled: true, token: 'glpat_preview', instanceUrl: 'https://gitlab.com', username: 'jcooler' },
        jira: {
          enabled: true,
          email: 'jon@acme.com',
          apiToken: 'atlassian_preview',
          site: 'yoursite.atlassian.net',
          displayName: 'Jon Cooler',
        },
      },
      connectorSnapshots: {
        vercel: { fetchedAt: Date.now(), data },
        github: { fetchedAt: Date.now(), data: { prs: [], issues: [], notifications: 0, etags: {} } },
        gitlab: { fetchedAt: Date.now(), data: { mrs: [], todos: 0 } },
        jira: { fetchedAt: Date.now(), data: { issues: [], counts: {} } },
      },
    })
  }, FIXTURE)
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  const stack = await page.evaluate(
    ([selGh, selGl, selJr, selVc]) => {
      const rect = (sel) => {
        const el = document.querySelector(sel)
        return el ? el.getBoundingClientRect() : null
      }
      const hits = (a, b) =>
        !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
      const weather = rect('[data-block-id="weather"]')
      const tasks = rect('[data-block-id="tasks"]')
      // Same two bottom-left neighbours probe 3 measures alone — checked
      // here too, against ALL FOUR panels, since the four-stack is the
      // page's actual worst case, not any single connector's card alone.
      const notes = rect('[data-block-id="notes"]')
      const photoRefresh = rect('button[aria-label="New background photo"]')
      const panels = { gh: rect(selGh), gl: rect(selGl), jr: rect(selJr), vc: rect(selVc) }
      const found = Object.fromEntries(Object.entries(panels).map(([k, v]) => [k, !!v]))
      const peripheralsFound = !!weather && !!tasks && !!notes && !!photoRefresh
      const pairs = [
        ['ghGl', hits(panels.gh, panels.gl)],
        ['ghJr', hits(panels.gh, panels.jr)],
        ['ghVc', hits(panels.gh, panels.vc)],
        ['glJr', hits(panels.gl, panels.jr)],
        ['glVc', hits(panels.gl, panels.vc)],
        ['jrVc', hits(panels.jr, panels.vc)],
      ]
      const clearsWeather = Object.values(panels).every((p) => !hits(p, weather))
      const clearsTasks = Object.values(panels).every((p) => !hits(p, tasks))
      const clearsNotes = Object.values(panels).every((p) => !hits(p, notes))
      const clearsPhotoRefresh = Object.values(panels).every((p) => !hits(p, photoRefresh))
      return {
        found,
        peripheralsFound,
        pairs: Object.fromEntries(pairs),
        anyOverlap: pairs.some(([, hit]) => hit),
        clearsWeather,
        clearsTasks,
        clearsNotes,
        clearsPhotoRefresh,
      }
    },
    [
      '[data-block-id="github"] section[aria-label="GitHub"]',
      '[data-block-id="gitlab"] section[aria-label="GitLab"]',
      '[data-block-id="jira"] section[aria-label="Jira"]',
      vercelSel,
    ],
  )
  const stackOk =
    Object.values(stack.found).every(Boolean) &&
    stack.peripheralsFound &&
    !stack.anyOverlap &&
    stack.clearsWeather &&
    stack.clearsTasks &&
    stack.clearsNotes &&
    stack.clearsPhotoRefresh
  console.log(
    stackOk
      ? `PASS: with github, gitlab, jira AND vercel all connected, all four default cards stack with no pairwise overlap and each still clears the weather chip (collapsed), Tasks pill, Notes pill AND the photo refresh button (${JSON.stringify(stack.pairs)})`
      : `FAIL: with github, gitlab, jira AND vercel all connected, all four default cards stack with no pairwise overlap and each still clears the weather chip (collapsed), Tasks pill, Notes pill AND the photo refresh button (${JSON.stringify(stack)})`,
  )

  // Restore: disable ALL FOUR connectors and clear their cache, then reload so
  // none of the four widgets is present for every block below — same restore
  // discipline as the RSS/GitHub/GitLab/Jira blocks above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        vercel: { ...connectors.vercel, enabled: false },
        github: { ...connectors.github, enabled: false },
        gitlab: { ...connectors.gitlab, enabled: false },
        jira: { ...connectors.jira, enabled: false },
      },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  const vercelGone = (await page.locator(vercelSel).count()) === 0
  console.log(
    vercelGone
      ? 'Vercel connector disabled; page restored to idle'
      : 'WARNING: Vercel widget still present after disabling the connector',
  )
}

// Crypto ticker (Task 52) — the sixth connector, and the first NO-AUTH one
// since RSS itself: `auth: 'none'` means no token, no whoami round-trip, no
// identity/reconnect state — the card body is a bare "coins" text field +
// Save/Clear, not a TokenConnectForm instance (see Connectors.tsx's own
// CryptoBody). The widget itself is also structurally different from every
// other connector card here: not a left/right-column panel, but a single
// CENTERED strip capped at 5 cells — see App.tsx's own comment on the crypto
// PositionedBlock for the full placement writeup (`top-[86vh]` — CENTERED in
// the links→quote band by direct measurement, the second revision this
// placement has needed: the brief's own `top-[76vh]` hypothesis landed
// inside the links row once worldClocks + countdown are on, same as this
// script leaves them for the rest of this run; the first correction,
// `top-[85vh]`, only asserted the gap BELOW quantified and left the gap
// ABOVE a boolean, un-quantified check, which a post-ship review caught
// passing at a real 2.5px of clearance — centered via
// `left-[calc(50%-11rem)]` against its own w-88, 22rem, half of which is
// 11rem). NO live network: seed an enabled config (3 coins) + a fresh
// snapshot whose fetchedAt is computed inside the page (so the ttl is fresh
// at read time and useConnectorSnapshot renders straight from cache) — the
// fixture spans all three tint states (positive, negative, and exactly
// zero), so the tint probe below exercises every branch of CryptoWidget's
// own tintClass, not just a lucky all-green fixture.
{
  const FIXTURE = {
    coins: [
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 67_412, change24h: 2.4 },
      { id: 'ethereum', symbol: 'eth', name: 'Ethereum', price: 3_245, change24h: -1.2 },
      { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', price: 0.1234, change24h: 0 },
    ],
  }
  // The CONFIGURED order (below) — fetchCrypto's own reorder step (crypto.ts)
  // is what the service-layer tests already cover; this harness proves the
  // WIDGET renders that order as-is, from cache, in a real browser.
  const EXPECTED_ORDER = ['btc', 'eth', 'doge']
  const cryptoSel = '[data-block-id="crypto"] section[aria-label="Crypto"]'

  await page.evaluate(async (data) => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        crypto: { enabled: true, coins: ['bitcoin', 'ethereum', 'dogecoin'] },
      },
      // fetchedAt stamped HERE, in the page, so the snapshot is fresh
      // relative to whenever this run happens — the SWR hook renders from
      // cache and never touches the network.
      connectorSnapshots: { crypto: { fetchedAt: Date.now(), data } },
    })
  }, FIXTURE)
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  // Probe 1: the widget renders all 3 seeded coins, in the CONFIGURED order,
  // each cell's change24h formatted+tinted correctly — positive emerald with
  // a leading '+', negative red with a REAL minus sign (U+2212, not an ASCII
  // hyphen), and exactly zero muted with no sign at all.
  await page.waitForSelector(cryptoSel, { timeout: 5000 }).catch(() => {})
  const cells = await page.evaluate((s) => {
    const sec = document.querySelector(s)
    if (!sec) return null
    const rows = [...sec.querySelectorAll(':scope > div > span')]
    return rows.map((row) => {
      const spans = row.querySelectorAll('span')
      return {
        symbol: spans[0]?.textContent ?? null,
        price: spans[1]?.textContent ?? null,
        change: spans[2]?.textContent ?? null,
        changeClass: spans[2]?.className ?? null,
      }
    })
  }, cryptoSel)
  const cellsOk =
    cells !== null && cells.length === 3 && cells.map((c) => c.symbol).join(',') === EXPECTED_ORDER.join(',')
  console.log(
    cellsOk
      ? `PASS: the Crypto widget renders all 3 seeded coins in the configured order from cache (${JSON.stringify(cells.map((c) => c.symbol))})`
      : `FAIL: the Crypto widget renders all 3 seeded coins in the configured order from cache (${JSON.stringify(cells)}, expected ${JSON.stringify(EXPECTED_ORDER)})`,
  )

  const tintsOk =
    cells !== null &&
    cells[0]?.change === '+2.4%' &&
    (cells[0]?.changeClass ?? '').includes('text-emerald-300') &&
    cells[1]?.change === '−1.2%' &&
    (cells[1]?.changeClass ?? '').includes('text-red-400') &&
    !(cells[1]?.change ?? '').includes('-') && // real minus sign, not a hyphen
    cells[2]?.change === '0.0%' &&
    (cells[2]?.changeClass ?? '').includes('text-fg-muted')
  console.log(
    tintsOk
      ? `PASS: the Crypto widget tints each 24h change correctly (emerald positive / red negative with a real minus sign / muted zero) (${JSON.stringify(cells)})`
      : `FAIL: the Crypto widget tints each 24h change correctly (emerald positive / red negative with a real minus sign / muted zero) (${JSON.stringify(cells)})`,
  )

  await page.screenshot({ path: `${outDir}/connectors-crypto.png` })
  console.log('captured connectors-crypto.png')

  // Probe 2: collision — BOTH the measured gap to the links row above and to
  // the quote block below (the real question this placement has to answer,
  // not just the arithmetic App.tsx's own comment works through), PLUS
  // non-overlap against the centered search/focus column and the usual
  // peripherals every other connector probe in this script also checks
  // (weather chip, timer pill, Tasks pill, gear, Notes pill, photo refresh).
  const gap = await page.evaluate((selCr) => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      return el ? el.getBoundingClientRect() : null
    }
    const hits = (a, b) =>
      !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    const weather = rect('[data-block-id="weather"]')
    const timer = rect('[data-block-id="timer"]')
    const tasks = rect('[data-block-id="tasks"]')
    const gear = rect('button[aria-label="Open settings"]')
    const search = rect('[data-block-id="search"]')
    const focus = rect('[data-block-id="focus"]')
    const links = rect('[data-block-id="links"]')
    const quote = rect('[data-block-id="quote"]')
    const notes = rect('[data-block-id="notes"]')
    const photoRefresh = rect('button[aria-label="New background photo"]')
    const cr = rect(selCr)
    return {
      crFound: !!cr,
      quoteFound: !!quote,
      searchFound: !!search,
      focusFound: !!focus,
      linksFound: !!links,
      pxGapAbove: cr && links ? cr.top - links.bottom : null,
      pxGapBelow: cr && quote ? quote.top - cr.bottom : null,
      crWeather: hits(cr, weather),
      crTimer: hits(cr, timer),
      crTasks: hits(cr, tasks),
      crGear: hits(cr, gear),
      crSearch: hits(cr, search),
      crFocus: hits(cr, focus),
      crNotes: hits(cr, notes),
      crPhotoRefresh: hits(cr, photoRefresh),
      cr: cr
        ? { top: +cr.top.toFixed(1), bottom: +cr.bottom.toFixed(1), left: +cr.left.toFixed(1), right: +cr.right.toFixed(1) }
        : null,
      links: links ? { top: +links.top.toFixed(1), bottom: +links.bottom.toFixed(1) } : null,
      quote: quote ? { top: +quote.top.toFixed(1), bottom: +quote.bottom.toFixed(1) } : null,
    }
  }, cryptoSel)
  // Fix round 1 (post-review): this band gets an explicit >=8px floor, HALF
  // this file's usual >=16px convention (RSS/vercel's own gap probes) — a
  // deliberate, reasoned exception, not a fudge. Rationale: (1) this is the
  // TIGHTEST vertical band on the page at 1600x900 — links.bottom to
  // quote.top is only ~40px total against this widget's own ~20px
  // single-line height, nowhere near the ~100px+ of slack RSS/vercel's own
  // >=16px gaps were measured against; (2) both neighbors are FIXED-HEIGHT,
  // SINGLE-LINE static elements (the links row never wraps at this seed's
  // 2-link count, quote's own figure is a fixed two-line block) — neither
  // grows unpredictably the way RSS's user-configurable shownCount does, so
  // there's no "worst case" to defend against beyond what's measured here;
  // (3) CryptoWidget itself is also single-line, fixed-height (MAX_COINS
  // caps cell count, but height is line-height-only regardless of count);
  // (4) arrange mode (Task 36) lets a user who dislikes the tight default
  // fit simply drag it elsewhere — this default only has to be safe, not
  // spacious. The review that mandated this also caught the PRIOR version of
  // this probe: it computed pxGapBelow but only a boolean hits() check
  // above, which reads PASS at literally 0.5px of clearance — replaced here
  // with the same quantified pxGapAbove/gapAboveOk shape as pxGapBelow's.
  const GAP_FLOOR = 8
  const gapAboveOk = gap.crFound && gap.linksFound && gap.pxGapAbove !== null && gap.pxGapAbove >= GAP_FLOOR
  console.log(
    gapAboveOk
      ? `PASS: the Crypto widget's slot clears the links row above it by a real, measured gap (${gap.pxGapAbove?.toFixed(1)}px — crypto top ${gap.cr?.top}, links bottom ${gap.links?.bottom})`
      : `FAIL: the Crypto widget's slot clears the links row above it by a real, measured gap (${JSON.stringify(gap)})`,
  )
  const gapBelowOk = gap.crFound && gap.quoteFound && gap.pxGapBelow !== null && gap.pxGapBelow >= GAP_FLOOR
  console.log(
    gapBelowOk
      ? `PASS: the Crypto widget's slot clears the quote block below it by a real, measured gap (${gap.pxGapBelow?.toFixed(1)}px — crypto bottom ${gap.cr?.bottom}, quote top ${gap.quote?.top})`
      : `FAIL: the Crypto widget's slot clears the quote block below it by a real, measured gap (${JSON.stringify(gap)})`,
  )
  const collisionOk =
    gap.searchFound &&
    gap.focusFound &&
    !gap.crWeather &&
    !gap.crTimer &&
    !gap.crTasks &&
    !gap.crGear &&
    !gap.crSearch &&
    !gap.crFocus &&
    !gap.crNotes &&
    !gap.crPhotoRefresh
  console.log(
    collisionOk
      ? 'PASS: the Crypto widget clears the search/focus column, the weather chip, timer pill, Tasks pill, gear, the Notes pill, and the photo refresh button'
      : `FAIL: the Crypto widget clears the search/focus column, the weather chip, timer pill, Tasks pill, gear, the Notes pill, and the photo refresh button (${JSON.stringify(gap)})`,
  )

  // Refresh drawer-connectors.png now that crypto is CONFIGURED — the card
  // this task adds. (The Vercel block's own refresh above photographed ITS
  // connected row, with vercel back to disabled by now.)
  await page.click('button[aria-label="Open settings"]')
  await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
  await page.waitForTimeout(400) // slide-in
  await openSettingsTab('Connectors')
  await page.screenshot({ path: `${outDir}/drawer-connectors.png` })
  console.log('captured drawer-connectors.png')

  const card = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Connectors"]')
    if (!sec) return null
    const toggle = sec.querySelector('#connector-crypto-enabled')
    const input = sec.querySelector('#connector-crypto-coins')
    return {
      enabled: toggle ? toggle.checked : null,
      coinsValue: input ? input.value : null,
      hasClear: [...sec.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Clear'),
    }
  })
  const cardOk =
    card !== null && card.enabled === true && card.coinsValue === 'bitcoin, ethereum, dogecoin' && card.hasClear
  console.log(
    cardOk
      ? `PASS: the Crypto card reads configured (enabled=${card.enabled}, coins="${card.coinsValue}", Clear present)`
      : `FAIL: the Crypto card reads configured (${JSON.stringify(card)})`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400) // slide-out

  // Restore: disable the connector and clear its cache, then reload so the
  // widget is gone for every block below (viewport matrix, default-state,
  // worst-case bookmarks) — same restore discipline as every other connector
  // block above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: { ...connectors, crypto: { ...connectors.crypto, enabled: false } },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  const cryptoGone = (await page.locator(cryptoSel).count()) === 0
  console.log(
    cryptoGone
      ? 'Crypto connector disabled; page restored to idle'
      : 'WARNING: Crypto widget still present after disabling the connector',
  )
}

// Calendar widget (Task 54, ics connector) — the seventh connector, and the
// second NO-AUTH one (crypto's own sibling, one step further: ics ALSO
// strips a secret on export — the whole url IS the secret, see
// backup.test.ts's own Task 53 case) to reach this page. Photo-floating
// TEXT (no panel surface, like RSS/crypto's own rows), capped by
// CONSTRUCTION at 1 next-line + 2 agenda rows — see CalendarWidget.tsx's and
// App.tsx's own doc comments for the controller ruling that replaced the
// brief's original 4-row / `top-[62vh]` spec (that slot is Vercel's own as
// of Task 51). NO live network: seed an enabled config + a fresh snapshot
// computed INSIDE the page (epoch times relative to Date.now() AT EVALUATE
// TIME, never baked into this script itself) — one event a short step out
// (becomes "Next"), two more later today (the agenda rows), one clearly
// tomorrow (a different calendar day, so it must appear NOWHERE — proving
// both the same-day scoping and the 2-row cap at once, since three "today"
// events exist but only two are today's REMAINING ones after Next).
{
  const icsSel = '[data-block-id="ics"] section[aria-label="Calendar"]'

  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    const now = Date.now()
    const H = 3_600_000
    // Fixed hour offsets (now+2h/4h/6h) broke near midnight on the FIRST
    // run of this probe: at 22:07 local, "now+2h" itself lands tomorrow,
    // so every fixture event ends up on a different calendar day than
    // `now`, and the "today's remaining" agenda comes back empty — a real
    // FAIL this harness caught, not a hypothetical. Fixed instead: space
    // the three same-day events proportionally across whatever time is
    // actually LEFT in today, which keeps them provably before local
    // midnight — and therefore "today" — for any run with at least a few
    // seconds left before midnight (see the review-round-1 fix note below
    // for the residual ~4s window and why it's accepted rather than chased
    // further).
    //
    // Review round 1 fix: the ORIGINAL version of this line floored `step`
    // at 60_000ms (a 1-minute minimum "for readability"), which is what
    // actually reintroduced the same midnight bug in miniature — with
    // todayEnd - now < ~180s, `now + step*3` (step pinned to the 60s floor
    // regardless of how little time was actually left) could itself cross
    // midnight, dropping the fixture events from "today" and spuriously
    // FAILing the `agenda.length === 2` probe. Chronological ORDERING
    // (next < design review < 1:1 with Sam) needs no minimum gap at all —
    // 1 second apart sorts exactly as correctly as 60 — so the floor is
    // now 1000ms, and the divisor reserves a 1000ms buffer before
    // todayEnd so `step*3` always lands strictly before local midnight
    // whenever there's more than ~4 seconds of today left to divide.
    const d = new Date(now)
    const todayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
    const step = Math.max(1000, Math.floor((todayEnd - now - 1000) / 3))
    const events = [
      { summary: 'Standup', start: now + step, end: now + step + 30_000 }, // "next"
      { summary: 'Design review', start: now + step * 2, end: now + step * 2 + 30_000 }, // today, later
      { summary: '1:1 with Sam', start: now + step * 3, end: now + step * 3 + 30_000 }, // today, later still
      // Unambiguously the NEXT calendar day (todayEnd is tomorrow's own
      // local midnight) regardless of the step above.
      { summary: 'Kickoff', start: todayEnd + 9 * H, end: todayEnd + 9 * H + 30 * 60_000 },
    ]
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        ics: { enabled: true, url: 'https://calendar.example.com/private-abc123/basic.ics' },
      },
      // fetchedAt stamped HERE, in the page, so the snapshot is fresh
      // relative to whenever this run happens — the SWR hook renders from
      // cache and never touches the network.
      connectorSnapshots: { ics: { fetchedAt: Date.now(), data: { events } } },
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  // Probe 1: the next-line names the soonest event with SOME non-empty
  // relative-time suffix (relNext's own exact wording is exhaustively
  // boundary-tested in CalendarWidget.test.tsx — this only proves the real
  // rendered DOM wires the two together), and the agenda rows are capped at
  // 2, chronological, and never leak tomorrow's event.
  await page.waitForSelector(icsSel, { timeout: 5000 }).catch(() => {})
  const rows = await page.evaluate((s) => {
    const sec = document.querySelector(s)
    if (!sec) return null
    return {
      next: sec.querySelector('p')?.textContent ?? null,
      agenda: [...sec.querySelectorAll('ul > li')].map((li) => li.textContent),
    }
  }, icsSel)
  const nextPrefix = 'Next: Standup · '
  const nextOk = rows !== null && !!rows.next && rows.next.startsWith(nextPrefix) && rows.next.length > nextPrefix.length
  console.log(
    nextOk
      ? `PASS: the Calendar widget's next-line names the soonest event with a relative-time suffix (${JSON.stringify(rows?.next)})`
      : `FAIL: the Calendar widget's next-line names the soonest event with a relative-time suffix (${JSON.stringify(rows)})`,
  )
  const agendaOk =
    rows !== null &&
    rows.agenda.length === 2 &&
    (rows.agenda[0] ?? '').includes('Design review') &&
    (rows.agenda[1] ?? '').includes('1:1 with Sam') &&
    rows.agenda.every((r) => !r.includes('Kickoff'))
  console.log(
    agendaOk
      ? `PASS: the Calendar widget's agenda rows are capped at 2, chronological, and exclude tomorrow's event (${JSON.stringify(rows?.agenda)})`
      : `FAIL: the Calendar widget's agenda rows are capped at 2, chronological, and exclude tomorrow's event (${JSON.stringify(rows)})`,
  )

  await page.screenshot({ path: `${outDir}/connectors-calendar.png` })
  console.log('captured connectors-calendar.png')

  // Probe 2: collision — the measured gap ABOVE (to the timer pill, its
  // nearest neighbor) and BELOW (to RSS's own default top), PLUS
  // non-overlap against the centered search/focus column and the usual
  // peripherals every other connector probe in this script checks (weather
  // chip, bookmarks bar, Tasks pill, gear, Notes pill, photo refresh).
  const gap = await page.evaluate((selIcs) => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      return el ? el.getBoundingClientRect() : null
    }
    const hits = (a, b) =>
      !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    const weather = rect('[data-block-id="weather"]')
    const timer = rect('[data-block-id="timer"]')
    const bookmarks = rect('nav[aria-label="Bookmarks bar"]')
    const tasks = rect('[data-block-id="tasks"]')
    const gear = rect('button[aria-label="Open settings"]')
    const search = rect('[data-block-id="search"]')
    const focus = rect('[data-block-id="focus"]')
    const rss = rect('[data-block-id="rss"]')
    const notes = rect('[data-block-id="notes"]')
    const photoRefresh = rect('button[aria-label="New background photo"]')
    const ics = rect(selIcs)
    return {
      icsFound: !!ics,
      timerFound: !!timer,
      rssFound: !!rss,
      searchFound: !!search,
      focusFound: !!focus,
      pxGapAbove: ics && timer ? ics.top - timer.bottom : null,
      pxGapBelow: ics && rss ? rss.top - ics.bottom : null,
      icsWeather: hits(ics, weather),
      icsBookmarks: hits(ics, bookmarks),
      icsTasks: hits(ics, tasks),
      icsGear: hits(ics, gear),
      icsSearch: hits(ics, search),
      icsFocus: hits(ics, focus),
      icsNotes: hits(ics, notes),
      icsPhotoRefresh: hits(ics, photoRefresh),
      ics: ics
        ? { top: +ics.top.toFixed(1), bottom: +ics.bottom.toFixed(1), left: +ics.left.toFixed(1), right: +ics.right.toFixed(1) }
        : null,
      timer: timer ? { top: +timer.top.toFixed(1), bottom: +timer.bottom.toFixed(1) } : null,
      rss: rss ? { top: +rss.top.toFixed(1), bottom: +rss.bottom.toFixed(1) } : null,
    }
  }, icsSel)
  // Same reasoned 8px floor as CryptoWidget's own probe above, not this
  // file's usual >=16px convention — same two-part rationale: (1) this is a
  // TIGHT band (the timer pill's bottom to RSS's default top, ~98px total
  // at 1600x900 — nowhere near RSS's/Vercel's own 100px+ of slack); (2)
  // CalendarWidget is capped by CONSTRUCTION at 1 next-line + 2 agenda rows
  // (App.tsx's own placement comment), so there is no unbounded "worst
  // case" growth to defend against beyond what's measured here — arrange
  // mode lets a user who dislikes the tight default fit simply drag it
  // elsewhere.
  const GAP_FLOOR = 8
  const gapAboveOk = gap.icsFound && gap.timerFound && gap.pxGapAbove !== null && gap.pxGapAbove >= GAP_FLOOR
  console.log(
    gapAboveOk
      ? `PASS: the Calendar widget's slot clears the timer pill above it by a real, measured gap (${gap.pxGapAbove?.toFixed(1)}px — ics top ${gap.ics?.top}, timer bottom ${gap.timer?.bottom})`
      : `FAIL: the Calendar widget's slot clears the timer pill above it by a real, measured gap (${JSON.stringify(gap)})`,
  )
  const gapBelowOk = gap.icsFound && gap.rssFound && gap.pxGapBelow !== null && gap.pxGapBelow >= GAP_FLOOR
  console.log(
    gapBelowOk
      ? `PASS: the Calendar widget's slot clears RSS's own default top below it by a real, measured gap (${gap.pxGapBelow?.toFixed(1)}px — ics bottom ${gap.ics?.bottom}, rss top ${gap.rss?.top})`
      : `FAIL: the Calendar widget's slot clears RSS's own default top below it by a real, measured gap (${JSON.stringify(gap)})`,
  )
  const collisionOk =
    gap.searchFound &&
    gap.focusFound &&
    !gap.icsWeather &&
    !gap.icsBookmarks &&
    !gap.icsTasks &&
    !gap.icsGear &&
    !gap.icsSearch &&
    !gap.icsFocus &&
    !gap.icsNotes &&
    !gap.icsPhotoRefresh
  console.log(
    collisionOk
      ? 'PASS: the Calendar widget clears the search/focus column, the weather chip, bookmarks bar, Tasks pill, gear, the Notes pill, and the photo refresh button'
      : `FAIL: the Calendar widget clears the search/focus column, the weather chip, bookmarks bar, Tasks pill, gear, the Notes pill, and the photo refresh button (${JSON.stringify(gap)})`,
  )

  // Refresh drawer-connectors.png now that ics is CONFIGURED — the card
  // this task adds.
  await page.click('button[aria-label="Open settings"]')
  await page.waitForSelector('[role="dialog"][aria-label="Settings"]')
  await page.waitForTimeout(400) // slide-in
  await openSettingsTab('Connectors')
  await page.screenshot({ path: `${outDir}/drawer-connectors.png` })
  console.log('captured drawer-connectors.png')

  const card = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Connectors"]')
    if (!sec) return null
    const toggle = sec.querySelector('#connector-ics-enabled')
    const input = sec.querySelector('#connector-ics-url')
    return {
      enabled: toggle ? toggle.checked : null,
      urlValue: input ? input.value : null,
      inputType: input ? input.type : null,
      hasClear: [...sec.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Clear'),
    }
  })
  const cardOk =
    card !== null &&
    card.enabled === true &&
    card.urlValue === 'https://calendar.example.com/private-abc123/basic.ics' &&
    card.inputType === 'password' &&
    card.hasClear
  console.log(
    cardOk
      ? `PASS: the Calendar card reads configured (enabled=${card.enabled}, type=${card.inputType}, Clear present)`
      : `FAIL: the Calendar card reads configured (${JSON.stringify(card)})`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400) // slide-out

  // Restore: disable the connector and clear its cache, then reload so the
  // widget is gone for every block below (viewport matrix, default-state,
  // worst-case bookmarks) — same restore discipline as every other
  // connector block above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: { ...connectors, ics: { ...connectors.ics, enabled: false } },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  const icsGone = (await page.locator(icsSel).count()) === 0
  console.log(
    icsGone
      ? 'ics connector disabled; page restored to idle'
      : 'WARNING: Calendar widget still present after disabling the connector',
  )
}

// ---------------------------------------------------------------------------
// Weather chip WORST-CASE height probe (Task 55 fix round 2) — a review
// catch on the fix round above: github's `top-[14vh]` (fix round 1's own
// number) was pinned against the collapsed weather chip's OBSERVED bottom
// (~120px at 1600x900) — but that observation came from this file's live
// Open-Meteo fetch, which returns whatever New York's real weather happens
// to be on the day this harness
// runs. The chip is variable-height (WeatherWidget.tsx): a second line (the
// rain callout, `text-sm text-accent`) renders whenever ANY of the next 12
// hours has `precipProb >= NOTABLE_PRECIP` (30% — a routine, far-from-rare
// threshold; see callout.ts/trend.ts), and a THIRD line (`text-xs
// text-fg-muted`, "Updated a while ago" / "Offline — showing cached")
// renders whenever the cached snapshot is stale (`useWeather.ts`'s
// `MAX_AGE_MS`, 30 minutes) or the last fetch failed. The boolean-only
// github-vs-weather collision probe earlier in this file (search "clears
// the weather chip") only ever proves NO overlap against WHATEVER state the
// live fetch happened to land in that run — it would pass on a dry day and
// silently ship an overlap the first time it rains, exactly the class of
// "lucky on some runs" bug the combined-defaults gate above exists to rule
// out for connector content, just not yet for weather.
//
// Fix: force the chip's REAL worst case deterministically by seeding
// `weatherCache` directly (chrome.storage.local, the same fixture-seeding
// idiom every connector snapshot in this file already uses) instead of
// depending on the live fetch — one hourly point at `precipProb: 45` (over
// NOTABLE_PRECIP, under the 50% LIKELY_PRECIP threshold that would produce
// the exact same ONE line anyway — see callout.ts) forces the callout line,
// and a `fetchedAt` stamped `MAX_AGE_MS` well in the past (computed INSIDE
// the page at evaluate time from the live `Date.now()`, the same
// never-bake-a-raw-epoch discipline as the calendar/combined-defaults
// blocks' own midnight-proof step idiom) forces the stale line — both
// deterministic, independent of today's actual weather. Measures the
// chip's real rendered bottom in this 3-line state, then asserts the gap to
// `[data-block-id="github"]`'s own top against the same >=16px floor the
// combined-defaults gate's own right-column probe uses — read directly off
// the live DOM rather than a hardcoded top value, so this probe
// re-validates itself if github's own `top-[Nvh]` is ever tuned again.
// github does not
// need to be CONNECTED for this: `PositionedBlock` always renders the
// `[data-block-id="github"]` wrapper div with its default-placement
// className (App.tsx) regardless of whether `GithubWidget` itself renders
// content or null (PositionedBlock.tsx's own `if (!valid) return <div
// data-block-id={id} className={className}>{children}</div>` branch — the
// div, and therefore its CSS `top`, exists either way), so this probe can
// run standalone, before any connector is ever seeded elsewhere in this
// file. Restores `weatherCache` to `null` afterward — the same "unset"
// state every block before this one already left it in (nothing in this
// file seeds weatherCache — the live fetch is the norm) — and reloads, so
// every block after this one resumes depending on the real Open-Meteo
// fetch exactly as before this probe existed.
//
// MEASURED (this run, real headless Chromium, probe-logged below, never
// assumed): the forced 3-line chip is 102px taller than its normal 1-line
// ~58px height — top 62 (unchanged; `top-[var(--top-band)]`, content-
// independent), bottom **164px** (vs. ~120px normal/lucky). That 164px
// floor, +16px, is what pushed github's own default from `top-[14vh]`
// (fix round 1) to `top-[21vh]` (189px, a real, measured, probe-logged
// 25px gap below 164 — not the bare 16px minimum, since fix round 2 also
// trimmed the three right-column cards' own chrome, see GithubWidget.tsx's
// MAX_PRS comment, to buy back enough room for real margin everywhere
// rather than landing exactly on every floor at once). See App.tsx's
// github/gitlab/jira PositionedBlock comments for the full re-derived
// right-column arithmetic this number feeds into.
{
  const hourlySeed = await page.evaluate(() => {
    const MAX_AGE_MS = 30 * 60 * 1000
    const now = Date.now()
    const hourly = Array.from({ length: 12 }, (_, i) => {
      const t = new Date(now + i * 3_600_000)
      const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:00`
      return {
        time: iso,
        tempC: 18 + i * 0.3,
        // Index 2 sits over NOTABLE_PRECIP (30%) but under LIKELY_PRECIP
        // (50%) — forces callout.ts's "Possible rain" branch, the routine
        // case, not the rarer "likely" one; either renders the same ONE
        // line, so the choice doesn't change the height being measured.
        precipProb: i === 2 ? 45 : 5,
        code: i === 2 ? 61 : 1, // 61 = slight rain (WMO), 1 = mainly clear
      }
    })
    return { hourly, staleFetchedAt: now - (MAX_AGE_MS + 10 * 60_000) } // 10min past the 30min floor
  })
  // Block the live Open-Meteo endpoint FIRST, before seeding or reloading.
  // Without this, seeding a STALE `fetchedAt` backfires: `useWeather.ts`'s
  // own mount effect treats "stale" and "needs a refetch" as the SAME
  // condition (`Date.now() - fetchedAt >= MAX_AGE_MS`), so the instant this
  // page reloads with an old `fetchedAt`, the widget fires a REAL network
  // refresh — found by running this probe once without the block: it
  // measured the chip back at its normal 1-line ~120px bottom
  // (`hasCallout:false, hasStale:false`), because the live fetch resolved
  // inside the post-reload wait and overwrote the seeded snapshot with
  // today's real (rainless) weather before the measurement ran. Aborting
  // the request instead lets that refresh FAIL (sets the widget's own
  // `error` state, which renders the exact same "stale/offline" line as a
  // merely-old `fetchedAt` would — `(stale || error)` in WeatherWidget.tsx
  // — so either condition proves the height) without ever touching
  // `chrome.storage.local`, so the seeded snapshot (forced rain hour AND
  // old `fetchedAt`) survives on screen for the measurement below.
  await page.route('**/api.open-meteo.com/**', (route) => route.abort())

  await page.evaluate(
    async ({ hourly, staleFetchedAt }) => {
      await chrome.storage.local.set({
        weatherCache: {
          current: { tempC: 18, feelsLikeC: 17, code: 1, windKmh: 10, humidity: 60, isDay: true },
          hourly,
          fetchedAt: staleFetchedAt,
          locationLabel: 'New York',
        },
      })
    },
    { hourly: hourlySeed.hourly, staleFetchedAt: hourlySeed.staleFetchedAt },
  )
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  await page.waitForSelector(weatherSel, { timeout: 5000 }).catch(() => {})

  const worst = await page.evaluate(
    ({ wSel, ghSel }) => {
      const w = document.querySelector(wSel)
      const gh = document.querySelector(ghSel)
      if (!w || !gh) return null
      const wr = w.getBoundingClientRect()
      const ghr = gh.getBoundingClientRect()
      return {
        chipFound: true,
        text: w.textContent ?? '',
        hasCallout: /rain/i.test(w.textContent ?? ''),
        hasStale: /Updated a while ago|Offline/.test(w.textContent ?? ''),
        chip: { top: +wr.top.toFixed(1), bottom: +wr.bottom.toFixed(1) },
        github: { top: +ghr.top.toFixed(1) },
      }
    },
    { wSel: weatherSel, ghSel: '[data-block-id="github"]' },
  )
  const WEATHER_GAP_FLOOR = 16
  const forcedOk =
    worst !== null &&
    worst.hasCallout &&
    worst.hasStale &&
    worst.github.top - worst.chip.bottom >= WEATHER_GAP_FLOOR
  const gap = worst ? +(worst.github.top - worst.chip.bottom).toFixed(1) : null
  console.log(
    forcedOk
      ? `PASS: the collapsed weather chip's forced 3-line worst case (rain callout + stale line) clears github's default slot by >=${WEATHER_GAP_FLOOR}px (chip bottom ${worst.chip.bottom}, github top ${worst.github.top}, gap ${gap}px)`
      : `FAIL: the collapsed weather chip's forced 3-line worst case clears github's slot by >=${WEATHER_GAP_FLOOR}px (${JSON.stringify(worst)}, gap ${gap}px)`,
  )
  await page.screenshot({ path: `${outDir}/weather-chip-worst-case.png` })
  console.log('captured weather-chip-worst-case.png')

  // Restore: unblock the Open-Meteo endpoint FIRST — otherwise the reload
  // below would inherit the block and every subsequent live weather fetch
  // in this file would fail too — then weatherCache back to unset (`null`),
  // the state every block before this one already left it in, so the live
  // fetch resumes normally for everything after this block, same restore
  // discipline as every connector block in this file.
  await page.unroute('**/api.open-meteo.com/**')
  await page.evaluate(async () => {
    await chrome.storage.local.set({ weatherCache: null })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
}

// ---------------------------------------------------------------------------
// Combined-defaults gate (Task 55, revised in a later fix round) — THE phase
// gate the whole connector roster (Tasks 44, 48-52, 54) has been building
// toward. Every block above proved its OWN default clears its immediate
// neighbours, and the growing stack probes along the way proved widening
// SUBSETS coexist (github+gitlab in Task 49, +jira in Task 50, +vercel in
// Task 51) — but every one of those stack probes seeded the OTHER
// connectors EMPTY (0 rows) while proving a single connector's own slot, so
// nothing before this block had ever rendered all SEVEN with their REAL
// default content at once. This gate found exactly the gap that left: with
// github's real 2-PR/2-issue card (245px tall, y=216..461 at 1600x900)
// rendered alongside gitlab's original `top-[46vh]` (414px) default,
// github's real card reached 47px INSIDE gitlab's slot — invisible to every
// earlier probe because each one's github/gitlab stand-in was an empty
// shell only ~50px tall. Fixed at the time by moving gitlab to `top-[54vh]`
// and, since it pushed gitlab's own real bottom lower too, jira to
// `top-[72vh]`.
//
// FIX ROUND (post-ship regression, review-verified): that first fix only
// ever seeded jira with 3 of its THEN-current MAX_ISSUES=5 — a leftover
// default-looking fixture, not jira's own true display max — so this gate
// never rendered jira's card tall enough to notice it overlapping the
// bottom-right Tasks pill once a real user actually saw 4-5 issues (jira's
// own real worst case at the time: bottom 876-920 at top-[72vh], the Tasks
// pill's own top sitting at 846 — a real, user-reachable collision this
// gate's own boolean pairwise check couldn't have caught even if it HAD
// seeded jira at max, since that check only proves "no overlap," never "how
// much room is left"). Fixed as a design change, not a point patch: every
// right-column widget's own display cap is now LOWER (GithubWidget
// MAX_PRS 4->3 / MAX_ISSUES 3->2, GitlabWidget MAX_MRS 5->3, JiraWidget
// MAX_ISSUES 5->3 — see each widget's own comment; these are GLANCE panels,
// and each header chip/counts-line already says "there's more"), EVERY
// connector fixture in this gate now seeds its widget's TRUE display max
// (not a shorter "default-looking" shape — see each fixture's own comment
// below), and the right column was re-measured end to end: github moved UP
// from `top-[24vh]` to `top-[14vh]` (the only way to fit all three cards'
// new, still-nonzero max heights plus 16px floors below it — see App.tsx's
// own github/gitlab/jira PositionedBlock comments for the full arithmetic),
// gitlab `top-[54vh]` -> `top-[48vh]`, jira `top-[72vh]` -> `top-[71vh]`.
// The pairwise boolean check below is no longer the only right-column proof
// — see the quantified `right-column gaps` probe right after it, added this
// fix round specifically because a boolean-only check is exactly what let
// the regression ship unnoticed the first time.
//
// FIX ROUND 2 (a SECOND post-ship regression, also review-verified): the
// fix round above re-pinned github's `top-[14vh]` against the collapsed
// weather chip's bottom as OBSERVED from this file's live Open-Meteo fetch
// (~120px, whatever New York's real weather happened to be that run) — but
// the chip is variable-height (WeatherWidget.tsx: a rain-callout line
// whenever any forecast hour has precipProb >= NOTABLE_PRECIP, 30%, a
// routine threshold; a stale/offline line whenever the cache is >=30min old
// or a fetch fails), and its REAL, deterministically-forced worst case is
// 164px (see the "Weather chip WORST-CASE height probe" block right above
// this one, which forces both lines via a seeded `weatherCache` plus a
// blocked network route rather than trusting the day's actual weather) —
// 44px more than the lucky 1-line observation fix round 1 was pinned
// against, and enough to put github's then-current `top-[14vh]` (126px)
// 38px INSIDE the chip's real worst-case span. Fixed the same way as fix
// round 1 — a design change, not a point patch — but with TWO levers this
// time, both explicitly sanctioned by the controller ruling that scoped
// this round: GithubWidget's `MAX_PRS` dropped one more row (3->2, jira
// held at its own floor of >=3 per that same ruling), AND all three
// right-column cards' own CHROME was trimmed modestly (`p-4`->`p-3`,
// header `mb-2`->`mb-1.5` — see each widget's own comment; vercel, on the
// left column, wasn't touched, since it isn't part of this budget). Right
// column re-measured end to end again: github `top-[14vh]` -> `top-[21vh]`,
// gitlab `top-[48vh]` -> `top-[50vh]`, jira `top-[71vh]` -> `top-[72vh]`
// (landing back on fix round 1's ORIGINAL Task-55-ship number, coincidentally
// — the arithmetic that produces it this time is entirely different, not a
// revert).
//
// Reusing the calendar block's own midnight-proof step idiom for ics's
// fixture (baked epoch offsets would flake within seconds of local
// midnight, exactly as that block's history documents; fetchedAt for every
// connector is likewise stamped INSIDE the page, at evaluate time, never
// baked into this script).
//
// At 1600x900, EVERY connector at its own display max (measured, post-fix-
// round-2): right column github top-[21vh]=189 (bottom 424, 2 PRs + 2
// issues, tightened chrome) / gitlab top-[50vh]=450 (bottom 624, 3 MRs,
// tightened chrome) / jira top-[72vh]=648 (bottom 822, 3 issues, tightened
// chrome) — gaps (weather chip's own forced worst-case bottom, 164px, to
// github) 25px / (github to gitlab) 26px / (gitlab to jira) 24px / (jira to
// the Tasks pill, top 846) 24px, all >=16px, all probe-logged verbatim by
// the weather chip worst-case probe above and the quantified `right-column
// gaps` probe below, not estimated; left column ics top-[13vh] /
// rss top-[22vh] (now shownCount:8, its own display max) / vercel
// top-[64vh]; crypto centered top-[86vh] (now 5 coins, MAX_COINS, though
// its fixed-width `flex-nowrap` strip doesn't change height with coin
// count). Runs after the calendar block (every connector left disabled by
// its own block above), captures connectors-all.png, then runs a pairwise
// rect-intersection over EVERY pair drawn from an 18-element set — the 7
// connector widgets plus every peripheral a user's eye actually shares the
// page with (timer pill, the COLLAPSED weather chip, Notes pill, photo
// refresh button, Tasks pill, settings gear, quote, links row, search bar,
// clock, greeting) — C(18,2) = 153 pairs, every one asserted (never
// eyeballed), `found` required for all 18 rects first so a vanished element
// can't report a false PASS by omission. Repeats the CAPTURE ONLY (plus a
// console-error check — no re-assertion of the 153 pairs; `setViewportSize`
// reflows the identical seeded DOM into a different layout of the SAME
// scenario, not a different one) at 1280x800 and 2560x1440. Back at
// 1600x900, expands the weather panel: anchored `right-4` at a measured
// ~352px wide there, it sits squarely over github's (and, since github
// moved up in fix round 1 (and again in fix round 2), now also gitlab's)
// own `right-8`/w-80 slot on the x-axis, and reaches down into both cards'
// y-range — well past github's `top-[21vh]` (y=189) AND gitlab's
// `top-[50vh]` (y=450) slots (the panel reaches gitlab's slot now
// specifically BECAUSE github moved up — it did not before either fix
// round). This gate is also what
// first found the underlying stacking defect: a real, intentional
// geometric overlap, but every connector PositionedBlock mounts later in
// App.tsx than weather's own, so at matched (auto) stacking the connector
// card(s) painted ON TOP of the expanded panel — the inverse of the
// disciplined-occlusion contract the 500x900 case in the viewport matrix
// below already proves for the centered clock/greeting column. Fixed in
// App.tsx + WeatherWidget.tsx: an
// `onExpandedChange` callback mirrors weather's own expanded state up to a
// conditional `z-30` on weather's PositionedBlock wrapper (same value
// TodoPanel/NotesPanel/TimerWidget's own open-state panels already use),
// applied ONLY while expanded. With that fix, whichever connector(s) the
// expanded panel actually covers are asserted OCCLUDED (surface alpha >=
// the bg-panel-solid contract, topmost at every covered point) rather than
// non-overlapping; any connector it doesn't reach is simply not covered,
// which needs no separate claim. Restores every connector off and the panel
// collapsed before returning control to the viewport matrix below — same
// snapshot/restore discipline as every block above it.
{
  const RSS_FEEDS = [
    'https://news.ycombinator.com/rss',
    'https://www.theverge.com/rss/index.xml',
  ]
  // 8 headlines — the RSS shownCount ceiling (SHOWN_COUNT_OPTIONS in
  // Connectors.tsx tops out at 8), so this gate seeds it at ITS display max
  // too, same discipline as every other connector fixture below (Task 55 fix
  // round: the gate must render every card at its true worst case, not
  // whatever shorter shape happened to be convenient).
  const RSS_HEADLINES = [
    { source: 'Hacker News', title: 'A local-first dashboard people actually keep open', url: 'https://news.ycombinator.com/item?id=100', publishedAt: 8 },
    { source: 'The Verge', title: 'The quiet return of the RSS reader', url: 'https://www.theverge.com/rss-returns', publishedAt: 7 },
    { source: 'Hacker News', title: 'Show HN: I built a new-tab page just for me', url: 'https://news.ycombinator.com/item?id=101', publishedAt: 6 },
    { source: 'The Verge', title: 'Browser extensions and the per-site permission prompt', url: 'https://www.theverge.com/permissions', publishedAt: 5 },
    { source: 'Hacker News', title: 'Ask HN: what lives on your new-tab page?', url: 'https://news.ycombinator.com/item?id=102', publishedAt: 4 },
    { source: 'The Verge', title: 'A field guide to the modern extension review queue', url: 'https://www.theverge.com/review-queue', publishedAt: 3 },
    { source: 'Hacker News', title: 'Show HN: a calendar widget with a hard row cap', url: 'https://news.ycombinator.com/item?id=103', publishedAt: 2 },
    { source: 'The Verge', title: 'Why glance panels beat infinite lists', url: 'https://www.theverge.com/glance-panels', publishedAt: 1 },
  ]
  // DISPLAY MAX fixtures (Task 55 fix round) — every token connector below is
  // seeded at its widget's own row cap (MAX_PRS/MAX_ISSUES/MAX_MRS, all
  // lowered this round — see each widget's own comment), not a shorter
  // "default-looking" shape. This gate exists to prove the right column
  // fits every card's TRUE worst case at once; seeding anything less than
  // max is exactly the gap that let jira-vs-Tasks-pill regress past the
  // review that first shipped this gate (jira was seeded at 3 of its old
  // MAX_ISSUES=5, so the gate never rendered the card tall enough to reach
  // the pill).
  // MAX_PRS lowered again 3->2 in fix round 2 (GithubWidget.tsx's own
  // comment) — this fixture is display max, so it drops the third PR here
  // too.
  const GITHUB_FIXTURE = {
    prs: [
      { title: 'Fix the flaky auth test on CI', url: 'https://github.com/acme/app/pull/128', repo: 'acme/app' },
      { title: 'Extract the shared connector http helper', url: 'https://github.com/acme/app/pull/131', repo: 'acme/app' },
    ],
    issues: [
      { title: 'Cold-start crash when storage is empty', url: 'https://github.com/acme/web/issues/44', repo: 'acme/web' },
      { title: 'Weather chip overlaps the bar at 800px wide', url: 'https://github.com/acme/web/issues/47', repo: 'acme/web' },
    ],
    notifications: 3,
    etags: {},
  }
  const GITLAB_FIXTURE = {
    mrs: [
      { title: 'Add rate limiting to the ingest API', url: 'https://gitlab.com/acme/platform/-/merge_requests/204', project: 'acme/platform' },
      { title: 'Bump vite to 6.x', url: 'https://gitlab.com/acme/platform/-/merge_requests/207', project: 'acme/platform' },
      { title: 'Split the connector http helper into its own package', url: 'https://gitlab.com/acme/platform/-/merge_requests/209', project: 'acme/platform' },
    ],
    todos: 6,
  }
  // Already 3 issues — jira's own MAX_ISSUES post-fix-round, so this fixture
  // (unchanged in content from before this fix round) is now genuinely the
  // display max too, not a coincidentally-equal smaller number. This is
  // jira's own worst case: the LOWEST card in the right column, so ITS
  // bottom edge is what has to clear the Tasks pill below — see App.tsx's
  // jira PositionedBlock comment for the measured writeup.
  const JIRA_FIXTURE = {
    issues: [
      { key: 'AUR-101', summary: 'Fix the flaky auth test on CI', status: 'In Progress', url: 'https://yoursite.atlassian.net/browse/AUR-101' },
      { key: 'AUR-102', summary: 'Draft the Q3 planning doc', status: 'In Progress', url: 'https://yoursite.atlassian.net/browse/AUR-102' },
      { key: 'AUR-103', summary: 'Rotate the staging API keys', status: 'To Do', url: 'https://yoursite.atlassian.net/browse/AUR-103' },
    ],
    counts: { 'In Progress': 2, 'To Do': 1 },
  }
  // Five deployments — MAX_DEPLOYMENTS, vercel's own worst-case row count,
  // same fixture its own block above uses. This is vercel's default AND its
  // worst case at once, so this gate never renders a shorter-than-real card.
  const VERCEL_FIXTURE = {
    deployments: [
      { project: 'marketing-site', state: 'ERROR', url: 'https://vercel.com/acme/marketing-site/dep-err', createdAt: Date.now() - 6 * 60 * 60 * 1000 },
      { project: 'app-web', state: 'READY', url: 'https://vercel.com/acme/app-web/dep-ready', createdAt: Date.now() - 3 * 60 * 1000 },
      { project: 'admin', state: 'READY', url: 'https://vercel.com/acme/admin/dep-ready', createdAt: Date.now() - 10 * 60 * 1000 },
      { project: 'landing', state: 'READY', url: 'https://vercel.com/acme/landing/dep-ready', createdAt: Date.now() - 20 * 60 * 1000 },
      { project: 'docs', state: 'BUILDING', url: 'https://vercel.com/acme/docs/dep-building', createdAt: Date.now() - 60 * 60 * 1000 },
    ],
  }
  // FIVE coins — MAX_COINS (crypto's own display cap), this gate's display-
  // max discipline applied here too. CryptoWidget's own strip is a fixed
  // w-88 `flex-nowrap` row regardless of coin count (see its own comment),
  // so this doesn't change the strip's HEIGHT or its already-measured gap to
  // quote/links — it only makes the row-count fixture honest.
  const CRYPTO_FIXTURE = {
    coins: [
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 67_412, change24h: 2.4 },
      { id: 'ethereum', symbol: 'eth', name: 'Ethereum', price: 3_245, change24h: -1.2 },
      { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', price: 0.1234, change24h: 0 },
      { id: 'solana', symbol: 'sol', name: 'Solana', price: 178.5, change24h: 4.1 },
      { id: 'cardano', symbol: 'ada', name: 'Cardano', price: 0.42, change24h: -0.6 },
    ],
  }

  const rssSel = '[data-block-id="rss"] section[aria-label="Headlines"]'
  const githubSel = '[data-block-id="github"] section[aria-label="GitHub"]'
  const gitlabSel = '[data-block-id="gitlab"] section[aria-label="GitLab"]'
  const jiraSel = '[data-block-id="jira"] section[aria-label="Jira"]'
  const vercelSel = '[data-block-id="vercel"] section[aria-label="Vercel"]'
  const cryptoSel = '[data-block-id="crypto"] section[aria-label="Crypto"]'
  const icsSel = '[data-block-id="ics"] section[aria-label="Calendar"]'
  const CONNECTOR_SELS = {
    rss: rssSel,
    github: githubSel,
    gitlab: gitlabSel,
    jira: jiraSel,
    vercel: vercelSel,
    crypto: cryptoSel,
    ics: icsSel,
  }

  await page.evaluate(
    async ({ rssFeeds, rssHeadlines, githubFixture, gitlabFixture, jiraFixture, vercelFixture, cryptoFixture }) => {
      const { connectors } = await chrome.storage.local.get('connectors')
      const now = Date.now()
      const H = 3_600_000
      // Same midnight-proof step idiom as the calendar block above (review-
      // round-1 fixed there, reused verbatim here): space the three same-day
      // fixture events proportionally across whatever time is actually LEFT
      // in today, floored at 1000ms, so they stay provably before local
      // midnight regardless of when this run happens.
      const d = new Date(now)
      const todayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
      const step = Math.max(1000, Math.floor((todayEnd - now - 1000) / 3))
      const icsEvents = [
        { summary: 'Standup', start: now + step, end: now + step + 30_000 },
        { summary: 'Design review', start: now + step * 2, end: now + step * 2 + 30_000 },
        { summary: '1:1 with Sam', start: now + step * 3, end: now + step * 3 + 30_000 },
        { summary: 'Kickoff', start: todayEnd + 9 * H, end: todayEnd + 9 * H + 30 * 60_000 },
      ]
      await chrome.storage.local.set({
        connectors: {
          ...connectors,
          // shownCount:8 — RSS's own display-max option (SHOWN_COUNT_OPTIONS
          // tops out at 8), same display-max discipline as every connector
          // fixture in this gate (Task 55 fix round).
          rss: { enabled: true, feeds: rssFeeds, shownCount: 8 },
          github: { enabled: true, token: 'github_pat_preview', username: 'octocat' },
          gitlab: { enabled: true, token: 'glpat_preview', instanceUrl: 'https://gitlab.com', username: 'jcooler' },
          jira: {
            enabled: true,
            email: 'jon@acme.com',
            apiToken: 'atlassian_preview',
            site: 'yoursite.atlassian.net',
            displayName: 'Jon Cooler',
          },
          vercel: { enabled: true, token: 'vercel_preview', username: 'jcooler' },
          crypto: { enabled: true, coins: ['bitcoin', 'ethereum', 'dogecoin', 'solana', 'cardano'] },
          ics: { enabled: true, url: 'https://calendar.example.com/private-abc123/basic.ics' },
        },
        // fetchedAt stamped HERE, in the page, for every connector at once —
        // the SWR hook renders every one of them from cache and never
        // touches the network.
        connectorSnapshots: {
          rss: { fetchedAt: now, data: rssHeadlines },
          github: { fetchedAt: now, data: githubFixture },
          gitlab: { fetchedAt: now, data: gitlabFixture },
          jira: { fetchedAt: now, data: jiraFixture },
          vercel: { fetchedAt: now, data: vercelFixture },
          crypto: { fetchedAt: now, data: cryptoFixture },
          ics: { fetchedAt: now, data: { events: icsEvents } },
        },
      })
    },
    {
      rssFeeds: RSS_FEEDS,
      rssHeadlines: RSS_HEADLINES,
      githubFixture: GITHUB_FIXTURE,
      gitlabFixture: GITLAB_FIXTURE,
      jiraFixture: JIRA_FIXTURE,
      vercelFixture: VERCEL_FIXTURE,
      cryptoFixture: CRYPTO_FIXTURE,
    },
  )
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in

  // Let every connector's own section mount before measuring anything —
  // best-effort per selector, same as every per-connector block above; the
  // `found` requirement in the pairwise probe below is what actually catches
  // a widget that never showed up.
  for (const sel of Object.values(CONNECTOR_SELS)) {
    await page.waitForSelector(sel, { timeout: 5000 }).catch(() => {})
  }

  let gateErrorsSeen = errors.length

  await page.screenshot({ path: `${outDir}/connectors-all.png` })
  console.log('captured connectors-all.png')

  // The full 18-element set: the 7 connector widgets plus every peripheral a
  // user's eye actually shares the page with at defaults.
  const PAGE_ELEMENTS = {
    ...CONNECTOR_SELS,
    timer: '[data-block-id="timer"]',
    weather: '[data-block-id="weather"]', // COLLAPSED chip — expanded is its own step below
    notes: '[data-block-id="notes"]',
    refresh: 'button[aria-label="New background photo"]',
    tasks: '[data-block-id="tasks"]',
    gear: 'button[aria-label="Open settings"]',
    quote: '[data-block-id="quote"]',
    links: '[data-block-id="links"]',
    search: '[data-block-id="search"]',
    clock: '[data-block-id="clock"]',
    greeting: '[data-block-id="greeting"]',
  }
  const pairwise = await page.evaluate((elements) => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      return el ? el.getBoundingClientRect() : null
    }
    const hits = (a, b) =>
      !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    const rects = Object.fromEntries(Object.entries(elements).map(([name, sel]) => [name, rect(sel)]))
    const names = Object.keys(rects)
    const found = Object.fromEntries(names.map((n) => [n, !!rects[n]]))
    const pairs = []
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        pairs.push({ pair: `${names[i]}/${names[j]}`, hit: hits(rects[names[i]], rects[names[j]]) })
      }
    }
    return {
      found,
      pairCount: pairs.length,
      collisions: pairs.filter((p) => p.hit).map((p) => p.pair),
      rects: Object.fromEntries(
        names.map((n) => [
          n,
          rects[n]
            ? { top: +rects[n].top.toFixed(1), bottom: +rects[n].bottom.toFixed(1), left: +rects[n].left.toFixed(1), right: +rects[n].right.toFixed(1) }
            : null,
        ]),
      ),
    }
  }, PAGE_ELEMENTS)
  const allFound = Object.values(pairwise.found).every(Boolean)
  const noCollisions = pairwise.collisions.length === 0
  console.log(
    allFound && noCollisions
      ? `PASS: combined-defaults pairwise non-overlap over all 18 page elements at 1600x900 (${pairwise.pairCount} pairs checked, 0 collisions)`
      : `FAIL: combined-defaults pairwise non-overlap over all 18 page elements at 1600x900 (found=${JSON.stringify(pairwise.found)}, ${pairwise.pairCount} pairs checked, collisions: ${JSON.stringify(pairwise.collisions)}, rects: ${JSON.stringify(pairwise.rects)})`,
  )

  // Quantified right-column gap floor (Task 55 fix round) — the pairwise
  // check above only proves NO overlap (a 0.1px gap would still pass it);
  // the controller ruling that lowered github/gitlab/jira's display caps
  // requires each of the three right-column gaps to clear a real >=16px
  // floor at every connector's OWN display max simultaneously (github
  // MAX_PRS/MAX_ISSUES, gitlab MAX_MRS, jira MAX_ISSUES — all seeded at cap
  // by this block's own fixtures above), same >=16px convention this file
  // uses everywhere else (vercel-vs-quote's own pxGapBelow probe). Reuses
  // `pairwise.rects`, already captured above from the SAME render — no
  // second DOM read needed. This is what actually caught (pre-fix) jira's
  // max-issue card overlapping the Tasks pill: the boolean pairwise probe
  // above never quantified how close it was, and the gate that first shipped
  // this block seeded jira below its own true display max, so it never
  // rendered the card tall enough to expose the gap collapsing to zero.
  const rc = pairwise.rects
  const rcGaps =
    rc.github && rc.gitlab && rc.jira && rc.tasks
      ? {
          githubToGitlab: +(rc.gitlab.top - rc.github.bottom).toFixed(1),
          gitlabToJira: +(rc.jira.top - rc.gitlab.bottom).toFixed(1),
          jiraToTasks: +(rc.tasks.top - rc.jira.bottom).toFixed(1),
        }
      : null
  const RIGHT_COLUMN_GAP_FLOOR = 16
  const rcGapsOk =
    rcGaps !== null &&
    rcGaps.githubToGitlab >= RIGHT_COLUMN_GAP_FLOOR &&
    rcGaps.gitlabToJira >= RIGHT_COLUMN_GAP_FLOOR &&
    rcGaps.jiraToTasks >= RIGHT_COLUMN_GAP_FLOOR
  console.log(
    rcGapsOk
      ? `PASS: right-column gaps at every connector's own display max clear the >=${RIGHT_COLUMN_GAP_FLOOR}px floor (github->gitlab ${rcGaps.githubToGitlab}px, gitlab->jira ${rcGaps.gitlabToJira}px, jira->Tasks-pill ${rcGaps.jiraToTasks}px)`
      : `FAIL: right-column gaps at every connector's own display max clear the >=${RIGHT_COLUMN_GAP_FLOOR}px floor (${JSON.stringify(rcGaps)}, rects: github=${JSON.stringify(rc.github)}, gitlab=${JSON.stringify(rc.gitlab)}, jira=${JSON.stringify(rc.jira)}, tasks=${JSON.stringify(rc.tasks)})`,
  )

  const newErrorsAtDefault = errors.length - gateErrorsSeen
  console.log(
    newErrorsAtDefault === 0
      ? 'PASS: no console errors with all seven connectors combined at 1600x900'
      : `FAIL: no console errors with all seven connectors combined at 1600x900 (${newErrorsAtDefault} new: ${errors.slice(-newErrorsAtDefault).join('; ')})`,
  )
  gateErrorsSeen = errors.length

  // Repeat the CAPTURE ONLY (plus a console-error check) at the narrowest and
  // widest ordinary viewports — the identical seeded DOM reflowed by a real
  // `setViewportSize`, same idiom as the viewport matrix below, never a
  // relaunch. No re-assertion of the 153 pairs here: a different width is a
  // different LAYOUT of the same combined-defaults scenario already proven
  // above, not a new one to re-derive from scratch.
  //
  // RECORDED, NOT FIXED (out of this task's connector scope): a manual
  // review of connectors-all-1280x800.png found the crypto strip's text
  // visually touching the quote block below it. Measured (not eyeballed,
  // one-off): at 1280x800 with worldClocks+countdown ALSO on (this script's
  // own top-of-file seed, not a Task 55 fixture), links.bottom=707.7 already
  // sits BELOW quote.top=704 — the centered column itself overlaps quote's
  // fixed `bottom-6` anchor by ~4px BEFORE crypto (top-[86vh], unchanged by
  // this task) even enters the picture; crypto only makes the overlap
  // visible by sitting in the gap. Root cause is the centered column's own
  // height (clock/greeting/worldClocks/countdown/search/focus/links) vs.
  // quote's fixed-pixel bottom anchor at a height no probe tested before
  // this gate (the existing viewport matrix jumps 600->900) — an
  // interaction between two non-connector widgets, unrelated to any of the
  // seven connectors this task adds, and outside this task's file scope
  // (App.tsx's centered-column layout, index.css's `short`/`xshort`
  // thresholds). Not reproduced at 2560x1440 (gaps of 205.9px/85.6px,
  // healthy) or at this gate's own primary 1600x900 (gap 10.0px, the
  // existing Task 52 floor). Flagged for a follow-up task rather than fixed
  // here blind — see task-55-report.md.
  for (const { w, h } of [
    { w: 1280, h: 800 },
    { w: 2560, h: 1440 },
  ]) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${outDir}/connectors-all-${w}x${h}.png` })
    console.log(`captured connectors-all-${w}x${h}.png`)

    const newErrors = errors.length - gateErrorsSeen
    console.log(
      newErrors === 0
        ? `PASS: no console errors with all seven connectors combined at ${w}x${h}`
        : `FAIL: no console errors with all seven connectors combined at ${w}x${h} (${newErrors} new: ${errors.slice(-newErrors).join('; ')})`,
    )
    gateErrorsSeen = errors.length
  }

  // Back to 1600x900 for the expanded-weather step.
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.waitForTimeout(300)

  // Expanded weather vs. the right column: a real, intentional overlap when
  // it happens (see the block comment above), so whichever connector(s) it
  // actually covers are held to the disciplined-occlusion rule instead of
  // plain non-overlap — checked against all 7 rather than just github/
  // gitlab/jira, since "whichever it covers" should be discovered by
  // measurement, not assumed from the class names.
  await setWeatherExpanded(true)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${outDir}/connectors-all-weather-expanded.png` })
  console.log('captured connectors-all-weather-expanded.png')

  const SOLID_SURFACE_ALPHA = 0.9 // the bg-panel-solid contract (0.95 in Aurora), same floor as the 500x900 precedent
  const expandedCheck = await page.evaluate(
    ({ weatherSel: wSel, connectorSels }) => {
      const wEl = document.querySelector(wSel)
      if (!wEl) return null
      const w = wEl.getBoundingClientRect()
      const cs = getComputedStyle(wEl)
      const alpha = (() => {
        const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/)
        if (!m) return 0
        const parts = m[1].split(',').map((v) => parseFloat(v))
        return parts.length > 3 ? parts[3] : 1
      })()
      const hits = (a, b) =>
        !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
      const results = {}
      for (const [name, sel] of Object.entries(connectorSels)) {
        const el = document.querySelector(sel)
        if (!el) {
          results[name] = { found: false, overlap: false, onTop: null }
          continue
        }
        const r = el.getBoundingClientRect()
        const overlap = hits(w, r)
        if (!overlap) {
          results[name] = { found: true, overlap: false, onTop: null }
          continue
        }
        // Sample the CENTRE of the overlap region: if the panel really owns
        // those pixels, that is what hit-testing finds there.
        const left = Math.max(w.left, r.left)
        const right = Math.min(w.right, r.right)
        const top = Math.max(w.top, r.top)
        const bottom = Math.min(w.bottom, r.bottom)
        const sample = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
        results[name] = {
          found: true,
          overlap: true,
          onTop: !!sample && !!sample.closest('[data-block-id="weather"]'),
        }
      }
      return {
        alpha: +alpha.toFixed(2),
        weather: { top: +w.top.toFixed(1), bottom: +w.bottom.toFixed(1), left: +w.left.toFixed(1), right: +w.right.toFixed(1) },
        results,
      }
    },
    { weatherSel, connectorSels: CONNECTOR_SELS },
  )
  const allFoundExpanded = expandedCheck !== null && Object.values(expandedCheck.results).every((r) => r.found)
  const covered = expandedCheck ? Object.entries(expandedCheck.results).filter(([, r]) => r.overlap).map(([n]) => n) : []
  const occlusionOk =
    allFoundExpanded &&
    (covered.length === 0 || (expandedCheck.alpha >= SOLID_SURFACE_ALPHA && covered.every((n) => expandedCheck.results[n].onTop)))
  console.log(
    occlusionOk && covered.length > 0
      ? `PASS: the expanded weather panel disciplined-occludes the connector(s) it covers at 1600x900 (covers: ${covered.join(', ')}; surface alpha ${expandedCheck.alpha} >= ${SOLID_SURFACE_ALPHA}, topmost at every covered point)`
      : occlusionOk
        ? `PASS: the expanded weather panel does not reach any connector's default slot at 1600x900 (weather ${JSON.stringify(expandedCheck?.weather)})`
        : `FAIL: the expanded weather panel disciplined-occlusion check at 1600x900 (found=${allFoundExpanded}, ${JSON.stringify(expandedCheck)})`,
  )

  await setWeatherExpanded(false)
  await page.waitForTimeout(150)

  // Restore: disable ALL SEVEN connectors and clear their cache, then reload
  // so nothing here leaks into the viewport matrix / default-state /
  // worst-case bookmarks blocks below — same restore discipline as every
  // connector block above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        rss: { ...connectors.rss, enabled: false },
        github: { ...connectors.github, enabled: false },
        gitlab: { ...connectors.gitlab, enabled: false },
        jira: { ...connectors.jira, enabled: false },
        vercel: { ...connectors.vercel, enabled: false },
        crypto: { ...connectors.crypto, enabled: false },
        ics: { ...connectors.ics, enabled: false },
      },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  const allGone = await page.evaluate(
    (sels) => Object.values(sels).every((s) => document.querySelector(s) === null),
    CONNECTOR_SELS,
  )
  console.log(
    allGone
      ? 'All seven connectors disabled; page restored to idle'
      : 'WARNING: at least one connector widget still present after the combined-defaults gate',
  )
}

// Open-panel-vs-connector disciplined-occlusion gate (final-review fix
// wave, Fix 1) — the SAME structural defect the expanded-weather-vs-
// connectors check just above exists for, for the three ALWAYS-AVAILABLE
// panels (Notes/Tasks/Focus-timer) rather than a toggle-gated connector-
// adjacent one: each panel is rendered inside a `fixed` PositionedBlock
// wrapper (an unconditional new stacking context), and every connector
// PositionedBlock mounts LATER in App.tsx than notes/tasks/timer's own, so
// at matched (auto) stacking a connector card an open panel geometrically
// covers painted ON TOP of it — confirmed by the whole-plan reviewer
// against a real Chromium session (Notes under Vercel's card, Tasks under
// Jira's, Focus-timer under Calendar's; their own probe scripts are what
// this block is adapted from). Fixed in App.tsx + NotesWidget.tsx/
// TodoWidget.tsx/TimerWidget.tsx: an `onOpenChange` callback (the exact
// idiom WeatherWidget's own `onExpandedChange` uses) mirrors each panel's
// own open state up to a conditional `z-30` on that widget's own
// PositionedBlock wrapper, applied ONLY while open.
//
// Seeds ONLY the three overlapping connectors — vercel, jira, ics — the
// smallest fixture that reproduces the exact collision the reviewer found,
// reusing the combined-defaults gate's own fixture shapes just above rather
// than inventing new ones (same 5-deployment vercel worst case, same
// 3-issue jira worst case, same midnight-proof same-day event spacing the
// ics block above uses).
{
  const VERCEL_FIXTURE = {
    deployments: [
      { project: 'marketing-site', state: 'ERROR', url: 'https://vercel.com/acme/marketing-site/dep-err', createdAt: Date.now() - 6 * 60 * 60 * 1000 },
      { project: 'app-web', state: 'READY', url: 'https://vercel.com/acme/app-web/dep-ready', createdAt: Date.now() - 3 * 60 * 1000 },
      { project: 'admin', state: 'READY', url: 'https://vercel.com/acme/admin/dep-ready', createdAt: Date.now() - 10 * 60 * 1000 },
      { project: 'landing', state: 'READY', url: 'https://vercel.com/acme/landing/dep-ready', createdAt: Date.now() - 20 * 60 * 1000 },
      { project: 'docs', state: 'BUILDING', url: 'https://vercel.com/acme/docs/dep-building', createdAt: Date.now() - 60 * 60 * 1000 },
    ],
  }
  const JIRA_FIXTURE = {
    issues: [
      { key: 'AUR-101', summary: 'Fix the flaky auth test on CI', status: 'In Progress', url: 'https://yoursite.atlassian.net/browse/AUR-101' },
      { key: 'AUR-102', summary: 'Draft the Q3 planning doc', status: 'In Progress', url: 'https://yoursite.atlassian.net/browse/AUR-102' },
      { key: 'AUR-103', summary: 'Rotate the staging API keys', status: 'To Do', url: 'https://yoursite.atlassian.net/browse/AUR-103' },
    ],
    counts: { 'In Progress': 2, 'To Do': 1 },
  }

  const vercelSel = '[data-block-id="vercel"] section[aria-label="Vercel"]'
  const jiraSel = '[data-block-id="jira"] section[aria-label="Jira"]'
  const icsSel = '[data-block-id="ics"] section[aria-label="Calendar"]'

  await page.evaluate(
    async ({ vercelFixture, jiraFixture }) => {
      const now = Date.now()
      // Same midnight-proof step idiom as the calendar/combined-defaults
      // blocks above: space the three same-day fixture events
      // proportionally across whatever time is actually LEFT in today,
      // floored at 1000ms, so this stays provably before local midnight
      // regardless of when this run happens.
      const d = new Date(now)
      const todayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
      const step = Math.max(1000, Math.floor((todayEnd - now - 1000) / 3))
      const icsEvents = [
        { summary: 'Standup', start: now + step, end: now + step + 30_000 },
        { summary: 'Design review', start: now + step * 2, end: now + step * 2 + 30_000 },
        { summary: '1:1 with Sam', start: now + step * 3, end: now + step * 3 + 30_000 },
      ]
      const { connectors } = await chrome.storage.local.get('connectors')
      await chrome.storage.local.set({
        connectors: {
          ...connectors,
          vercel: { enabled: true, token: 'vercel_preview', username: 'jcooler' },
          jira: {
            enabled: true,
            email: 'jon@acme.com',
            apiToken: 'atlassian_preview',
            site: 'yoursite.atlassian.net',
            displayName: 'Jon Cooler',
          },
          ics: { enabled: true, url: 'https://calendar.example.com/private-abc123/basic.ics' },
        },
        connectorSnapshots: {
          vercel: { fetchedAt: now, data: vercelFixture },
          jira: { fetchedAt: now, data: jiraFixture },
          ics: { fetchedAt: now, data: { events: icsEvents } },
        },
      })
    },
    { vercelFixture: VERCEL_FIXTURE, jiraFixture: JIRA_FIXTURE },
  )
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  await page.waitForSelector(vercelSel, { timeout: 5000 }).catch(() => {})
  await page.waitForSelector(jiraSel, { timeout: 5000 }).catch(() => {})
  await page.waitForSelector(icsSel, { timeout: 5000 }).catch(() => {})

  let panelGateErrorsSeen = errors.length

  const SOLID_SURFACE_ALPHA = 0.9 // the bg-panel-solid contract (0.95 in Aurora), same floor as the expanded-weather precedent above

  // Opens `pillSel`, waits for the `dialogLabel`-named dialog, checks it
  // against `cardSel` (found + disciplined-occluded if it overlaps, plain
  // non-overlap otherwise — same two-branch shape the expanded-weather
  // check above uses), screenshots, then closes via Escape (dialogStack-
  // aware, same close path every panel in this app already uses) so the
  // NEXT probe starts from a clean idle-panel state.
  const panelOcclusionCheck = async (pillSel, dialogLabel, cardSel, cardName) => {
    await page.click(pillSel)
    const panelSel = `[role="dialog"][aria-label="${dialogLabel}"]`
    await page.waitForSelector(panelSel)
    await page.waitForTimeout(200)
    const res = await page.evaluate(
      ({ panelSel: pSel, cardSel: cSel }) => {
        const panel = document.querySelector(pSel)
        const card = document.querySelector(cSel)
        if (!panel || !card) return { found: false }
        const p = panel.getBoundingClientRect()
        const c = card.getBoundingClientRect()
        const cs = getComputedStyle(panel)
        const alpha = (() => {
          const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/)
          if (!m) return 0
          const parts = m[1].split(',').map((v) => parseFloat(v))
          return parts.length > 3 ? parts[3] : 1
        })()
        const overlap = !(p.right <= c.left || p.left >= c.right || p.bottom <= c.top || p.top >= c.bottom)
        if (!overlap) {
          return {
            found: true,
            overlap: false,
            alpha: +alpha.toFixed(2),
            p: { t: +p.top.toFixed(1), b: +p.bottom.toFixed(1), l: +p.left.toFixed(1), r: +p.right.toFixed(1) },
            c: { t: +c.top.toFixed(1), b: +c.bottom.toFixed(1), l: +c.left.toFixed(1), r: +c.right.toFixed(1) },
          }
        }
        // Sample the CENTRE of the overlap region: if the panel really owns
        // those pixels, that is what hit-testing finds there.
        const left = Math.max(p.left, c.left)
        const right = Math.min(p.right, c.right)
        const top = Math.max(p.top, c.top)
        const bottom = Math.min(p.bottom, c.bottom)
        const sample = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
        return {
          found: true,
          overlap: true,
          onTop: !!sample && panel.contains(sample),
          alpha: +alpha.toFixed(2),
          p: { t: +p.top.toFixed(1), b: +p.bottom.toFixed(1), l: +p.left.toFixed(1), r: +p.right.toFixed(1) },
          c: { t: +c.top.toFixed(1), b: +c.bottom.toFixed(1), l: +c.left.toFixed(1), r: +c.right.toFixed(1) },
        }
      },
      { panelSel, cardSel },
    )
    const ok = res.found && (!res.overlap || (res.alpha >= SOLID_SURFACE_ALPHA && res.onTop))
    console.log(
      ok && res.overlap
        ? `PASS: the open ${dialogLabel} panel disciplined-occludes ${cardName} (surface alpha ${res.alpha} >= ${SOLID_SURFACE_ALPHA}, topmost at the covered point; panel=${JSON.stringify(res.p)}, card=${JSON.stringify(res.c)})`
        : ok
          ? `PASS: the open ${dialogLabel} panel does not overlap ${cardName} (panel=${JSON.stringify(res.p)}, card=${JSON.stringify(res.c)})`
          : `FAIL: the open ${dialogLabel} panel disciplined-occlusion check vs ${cardName} (${JSON.stringify(res)})`,
    )
    await page.screenshot({ path: `${outDir}/panel-${dialogLabel.toLowerCase().replace(/\s+/g, '-')}-vs-${cardName}.png` })
    // Close via Escape (dialogStack-aware) so the page is back to its idle,
    // closed-panel state before the next probe (or the restore below) runs.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    return ok
  }

  await panelOcclusionCheck('[data-block-id="notes"] button[aria-expanded]', 'Notes', vercelSel, 'vercel')
  await panelOcclusionCheck('[data-block-id="tasks"] button[aria-expanded]', 'Tasks', jiraSel, 'jira')
  await panelOcclusionCheck('[data-block-id="timer"] button[aria-expanded]', 'Focus timer', icsSel, 'ics')

  const panelGateNewErrors = errors.length - panelGateErrorsSeen
  console.log(
    panelGateNewErrors === 0
      ? 'PASS: no console errors across the notes/tasks/timer panel-vs-connector occlusion gate'
      : `FAIL: no console errors across the notes/tasks/timer panel-vs-connector occlusion gate (${panelGateNewErrors} new: ${errors.slice(-panelGateNewErrors).join('; ')})`,
  )

  // Restore: disable the three seeded connectors and clear their cache, then
  // reload so nothing here leaks into the viewport matrix / default-state /
  // worst-case blocks below — same restore discipline as every connector
  // block above.
  await page.evaluate(async () => {
    const { connectors } = await chrome.storage.local.get('connectors')
    await chrome.storage.local.set({
      connectors: {
        ...connectors,
        vercel: { ...connectors.vercel, enabled: false },
        jira: { ...connectors.jira, enabled: false },
        ics: { ...connectors.ics, enabled: false },
      },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  const panelGateAllGone = await page.evaluate(
    (sels) => Object.values(sels).every((s) => document.querySelector(s) === null),
    { vercel: vercelSel, jira: jiraSel, ics: icsSel },
  )
  console.log(
    panelGateAllGone
      ? 'Notes/Tasks/Focus-timer panel-vs-connector gate: vercel/jira/ics disabled; page restored to idle'
      : 'WARNING: at least one connector widget still present after the notes/tasks/timer panel-vs-connector gate',
  )
}

// ---------------------------------------------------------------------------
// Habits widget (Task 57) — chips, one-tap today, pure streak math. NO live
// network (there is none for this widget): seed the `habits` key plus
// `settings.widgets.habits` via a merge write, same idiom as every widget
// block above. `localDateKey`/`prevDayKey` are re-derived HERE, inline,
// rather than imported (page.evaluate's function argument runs inside the
// browser page, not this Node process, and can't reach src/lib/habits.ts) —
// byte-for-byte the same algorithm as that module (local Date parts, never
// UTC/ms-subtraction; see its own doc comment for why), so the fixture's
// "today"/"yesterday" always agree with whatever HabitsWidget.tsx itself
// computes from the SAME browser clock.
//
// ONE seed serves both jobs this block needs, same economy as Task 55's own
// vercel block (its 5-deployment MAX_DEPLOYMENTS seed doubles as both the
// interaction fixture and the worst-case gap measurement): six habits is
// simultaneously (a) the specific streak shapes the brief's probes need
// (12-day streak ending today, a streak ending yesterday with today still
// unmarked, and an empty log) and (b) HabitsWidget.tsx's own MAX_HABIT_CHIPS
// cap, so every floor measured below is already the real worst-case column
// height, not a shorter stand-in.
{
  const habitsSel = '[data-block-id="habits"]'
  const rssSel = '[data-block-id="rss"] section[aria-label="Headlines"]'
  const linksSel = '[data-block-id="links"]'
  // Every block-id in App.tsx's centered flex column (clock/greeting/
  // worldClocks/countdown/search/focus/links), plus quote (bottom-anchored
  // but still horizontally centered) for good measure — "the centered
  // column's measured left edge at this band" means whichever of these
  // actually occupies the habits widget's own vertical span, discovered by
  // measurement below, not assumed to be any one of them by name.
  const centeredSels = [
    '[data-block-id="clock"]',
    '[data-block-id="greeting"]',
    '[data-block-id="worldClocks"]',
    '[data-block-id="countdown"]',
    '[data-block-id="search"]',
    '[data-block-id="focus"]',
    '[data-block-id="links"]',
    '[data-block-id="quote"]',
  ]

  // RSS is enabled ONLY here, briefly, so its column's real right edge (not
  // an assumed constant) is what the left-floor assertion below is measured
  // against — the brief's own "measured, not assumed" discipline applies to
  // a neighbor's geometry just as much as to this widget's own. Minimal
  // one-headline fixture, same shape as the dedicated RSS block far above.
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    function localDateKey(d) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    function prevDayKey(key) {
      const [y, m, day] = key.split('-').map(Number)
      return localDateKey(new Date(y, m - 1, day - 1))
    }
    function runEndingAt(endKey, n) {
      const keys = []
      let cursor = endKey
      for (let i = 0; i < n; i++) {
        keys.push(cursor)
        cursor = prevDayKey(cursor)
      }
      return keys
    }
    const todayKey = localDateKey(new Date())
    const yesterdayKey = prevDayKey(todayKey)
    const habits = [
      { id: 'h1', name: 'Read daily', createdAt: Date.now(), log: runEndingAt(todayKey, 12) },
      { id: 'h2', name: 'Stretch', createdAt: Date.now(), log: runEndingAt(yesterdayKey, 5) },
      { id: 'h3', name: 'Meditate', createdAt: Date.now(), log: [] },
      { id: 'h4', name: 'Journal', createdAt: Date.now(), log: [todayKey] },
      { id: 'h5', name: 'Walk', createdAt: Date.now(), log: [] },
      {
        id: 'h6',
        name: 'Practice deep breathing exercises every single morning without fail',
        createdAt: Date.now(),
        log: [],
      },
    ]
    await chrome.storage.local.set({
      habits,
      settings: { ...settings, widgets: { ...settings.widgets, habits: true } },
      connectors: { rss: { enabled: true, feeds: ['https://example.com/rss'], shownCount: 5 } },
      connectorSnapshots: {
        rss: {
          fetchedAt: Date.now(),
          data: [{ source: 'Example', title: 'A measured headline', url: 'https://example.com/1', publishedAt: 1 }],
        },
      },
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  await page.waitForSelector(habitsSel, { timeout: 5000 }).catch(() => {})
  await page.waitForSelector(rssSel, { timeout: 5000 }).catch(() => {})

  // Probe 1: one chip per seeded habit, capped at 6 by construction (this
  // fixture IS the cap, so this also proves the widget renders its true
  // worst-case column rather than a shorter stand-in).
  const chips = await page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return null
    return [...root.querySelectorAll('button')].map((b) => ({
      text: b.textContent.trim(),
      pressed: b.getAttribute('aria-pressed'),
    }))
  }, habitsSel)
  const chipsOk = chips !== null && chips.length === 6
  console.log(
    chipsOk
      ? `PASS: the habits widget renders one chip per seeded habit, 6 total (${chips.map((c) => c.text).join(' | ')})`
      : `FAIL: the habits widget renders one chip per seeded habit, 6 total (found=${JSON.stringify(chips)})`,
  )

  // Probe 2: streak text matches each seeded log's known shape — the
  // 12-day streak ending today (today pressed), the 5-day streak ending
  // YESTERDAY (today NOT pressed — the yesterday-keeps-it-alive rule), and
  // the empty log (no flame, not pressed).
  const byName = (name) => chips?.find((c) => c.text.includes(name))
  const readDaily = byName('Read daily')
  const stretch = byName('Stretch')
  const meditate = byName('Meditate')
  const streaksOk =
    !!readDaily && readDaily.text.includes('🔥 12') && readDaily.pressed === 'true' &&
    !!stretch && stretch.text.includes('🔥 5') && stretch.pressed === 'false' &&
    !!meditate && !meditate.text.includes('🔥') && meditate.pressed === 'false'
  console.log(
    streaksOk
      ? `PASS: seeded streak texts match their known shapes (Read daily "${readDaily.text}", Stretch "${stretch.text}", Meditate "${meditate.text}")`
      : `FAIL: seeded streak texts match their known shapes (Read daily=${JSON.stringify(readDaily)}, Stretch=${JSON.stringify(stretch)}, Meditate=${JSON.stringify(meditate)})`,
  )

  await page.screenshot({ path: `${outDir}/widgets-habits.png` })
  console.log('captured widgets-habits.png')

  // Measured floor assertions for the slot (Global Constraints: the mid-left
  // second column, `left-[21rem] top-[43vh] w-56` — the plan's own starting
  // hypothesis was `47vh`, corrected here after this exact block first
  // measured a real 12.5px overlap with the links row at the 6-chip worst
  // case; see App.tsx's own PositionedBlock comment for the full writeup.
  // Provisional until Task 58 re-derives this jointly with the month grid
  // above it).
  const rectsRaw = await page.evaluate(
    ({ habitsSel: hSel, rssSel: rSel, linksSel: lSel, centeredSels: cSels }) => {
      const r = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return { top: +rect.top.toFixed(1), bottom: +rect.bottom.toFixed(1), left: +rect.left.toFixed(1), right: +rect.right.toFixed(1) }
      }
      return {
        habits: r(hSel),
        rss: r(rSel),
        links: r(lSel),
        centered: cSels.map((sel) => ({ sel, rect: r(sel) })),
      }
    },
    { habitsSel, rssSel, linksSel, centeredSels },
  )

  const FLOOR = 16
  const h = rectsRaw.habits

  // Left floor: RSS's own column right edge. Structurally deterministic
  // (left-8 + w-72 = 320px) but measured here against the REAL rendered
  // card, not assumed — and asserted EXACT per the brief ("16px gap to
  // 336 — assert it"), since both widths are fixed Tailwind classes with no
  // worst-case growth to defend against the way RSS's headline COUNT does
  // elsewhere in this file.
  const leftGap = rectsRaw.rss && h ? +(h.left - rectsRaw.rss.right).toFixed(1) : null
  const leftOk = leftGap === FLOOR
  console.log(
    leftOk
      ? `PASS: habits column left edge clears RSS's own column right edge by exactly ${FLOOR}px (habits.left=${h?.left}, rss.right=${rectsRaw.rss?.right})`
      : `FAIL: habits column left edge clears RSS's own column right edge by exactly ${FLOOR}px (gap=${leftGap}, habits=${JSON.stringify(h)}, rss=${JSON.stringify(rectsRaw.rss)})`,
  )

  // Right floor: whichever centered-column element(s) actually occupy the
  // habits widget's own vertical span at THIS band — discovered by
  // measurement (vertical-overlap test), not assumed to be any one widget by
  // name, per the brief ("measure at YOUR band").
  const overlapping = h
    ? rectsRaw.centered.filter(({ rect }) => rect && !(rect.bottom <= h.top || rect.top >= h.bottom))
    : []
  const centeredLeftAtBand = overlapping.length > 0 ? Math.min(...overlapping.map((o) => o.rect.left)) : null
  const rightGap = h && centeredLeftAtBand !== null ? +(centeredLeftAtBand - h.right).toFixed(1) : null
  const rightOk = rightGap === null || rightGap >= FLOOR // no vertical overlap at all is trivially clear
  console.log(
    rightOk
      ? `PASS: habits column right edge clears the centered column's measured left edge at this band by >=${FLOOR}px (${rightGap === null ? 'no centered element overlaps this band' : `${rightGap}px, overlapping: ${overlapping.map((o) => o.sel).join(', ')}`}; habits.right=${h?.right})`
      : `FAIL: habits column right edge clears the centered column's measured left edge at this band by >=${FLOOR}px (gap=${rightGap}px, overlapping: ${JSON.stringify(overlapping)})`,
  )

  // Bottom floor: the links row, at THIS run's 6-chip worst case (the seeded
  // fixture above IS the cap — see the block's own top comment).
  const bottomGap = rectsRaw.links && h ? +(rectsRaw.links.top - h.bottom).toFixed(1) : null
  const bottomOk = bottomGap !== null && bottomGap >= FLOOR
  console.log(
    bottomOk
      ? `PASS: habits column bottom (6-chip worst case) clears the links row by >=${FLOOR}px (${bottomGap}px; habits.bottom=${h?.bottom}, links.top=${rectsRaw.links?.top})`
      : `FAIL: habits column bottom (6-chip worst case) clears the links row by >=${FLOOR}px (gap=${bottomGap}px, habits=${JSON.stringify(h)}, links=${JSON.stringify(rectsRaw.links)})`,
  )

  // Probe 3: the interaction the quality bar demands — a REAL click (not a
  // storage write) on the whole chip, on the ONE seeded habit that starts
  // with an empty log (Meditate), asserted against storage both ways: today
  // gained, then gone again.
  const meditateSel = `${habitsSel} button:has-text("Meditate")`
  await page.click(meditateSel)
  await page.waitForTimeout(100)
  const afterMark = await page.evaluate(async () => {
    const { habits } = await chrome.storage.local.get('habits')
    return habits.find((x) => x.id === 'h3')?.log ?? null
  })
  const gainedOk = Array.isArray(afterMark) && afterMark.length === 1
  console.log(
    gainedOk
      ? `PASS: clicking the Meditate chip marks today in storage (log=${JSON.stringify(afterMark)})`
      : `FAIL: clicking the Meditate chip marks today in storage (log=${JSON.stringify(afterMark)})`,
  )

  await page.click(meditateSel)
  await page.waitForTimeout(100)
  const afterUnmark = await page.evaluate(async () => {
    const { habits } = await chrome.storage.local.get('habits')
    return habits.find((x) => x.id === 'h3')?.log ?? null
  })
  const goneOk = Array.isArray(afterUnmark) && afterUnmark.length === 0
  console.log(
    goneOk
      ? 'PASS: clicking the Meditate chip again unmarks today in storage (log=[])'
      : `FAIL: clicking the Meditate chip again unmarks today in storage (log=${JSON.stringify(afterUnmark)})`,
  )

  // Restore: widget off, habits cleared, RSS disabled + cache cleared — same
  // restore discipline as every widget/connector block above, so nothing
  // here leaks into the viewport matrix / default-state / worst-case
  // bookmarks blocks below.
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    await chrome.storage.local.set({
      habits: [],
      settings: { ...settings, widgets: { ...settings.widgets, habits: false } },
      connectors: { rss: { enabled: false, feeds: [], shownCount: 5 } },
      connectorSnapshots: {},
    })
  })
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in
  // The PositionedBlock WRAPPER (`[data-block-id="habits"]`) always renders,
  // gated or not (see PositionedBlock.tsx's own early-return branch) — the
  // "gone" signal is its own gate returning null, i.e. zero chip buttons
  // inside it, same distinction RSS's own gone-check makes against its inner
  // `section`, not its wrapper.
  const habitsGone = (await page.locator(`${habitsSel} button`).count()) === 0
  const rssGone = (await page.locator(rssSel).count()) === 0
  console.log(
    habitsGone && rssGone
      ? 'Habits widget disabled and RSS re-disabled; page restored to idle'
      : `WARNING: still present after the habits block's own restore (habitsGone=${habitsGone}, rssGone=${rssGone})`,
  )
}

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
  // 1600x900 is this script's own launch size, so the setViewportSize below
  // is a no-op for it — it's in the matrix because the top-band assertions
  // have to cover it too: it is the roomiest ordinary desktop shape, where
  // the bookmarks bar renders every title in full and the expanded weather
  // panel is at its widest, so it's the size that proves the band is a
  // deliberate layout rather than a squeeze that only looks right when
  // something is being compressed.
  { w: 1600, h: 900 },
  { w: 1420, h: 437 }, // the owner's own window — the original bug report
  { w: 1280, h: 500 },
  { w: 1024, h: 600 },
  { w: 800, h: 450 },
  // The LABELLED side of the compact threshold, 10px above it. Without a
  // viewport here, the threshold's derivation (index.css: labels stop
  // keeping half of themselves at ~703px) was arithmetic in a comment and
  // nothing else — the narrowest labelled viewport was 800px, which clears
  // the rule by a mile. Here the ratio assertion below is actually near its
  // limit (0.577 measured), so a threshold set too LOW fails honestly
  // instead of shipping the crumbs it was supposed to delete. Tall on
  // purpose: it is also the only viewport in the matrix in the 721-900px
  // band at full height, which is where the expanded weather panel turned
  // out to collide with a centred "Good afternoon." (see WeatherWidget.tsx).
  { w: 730, h: 900 },
  // Jon's own ~500px-wide side window (2026-08-07). Below the `compact`
  // threshold on BOTH widgets in the top row: the bookmarks bar renders one
  // mark per chip instead of labels, and the weather chip stops being sized
  // as a fraction of the viewport. Every assertion in the loop below runs
  // here too — the two that can't mean the same thing in compact mode (the
  // label-legibility one, and the expanded panel's clearance of the centre
  // column) branch rather than skip.
  { w: 500, h: 900 },
  { w: 2560, h: 1440 },
]
// index.css's `compact` variant, repeated here because a media query can't
// be read back out of the page. Keep in sync.
const COMPACT_MAX_WIDTH = 720
// THE RULE, stated as a measurement: the air BELOW the band equals the
// air ABOVE it. index.css builds both out of one `--top-band-gap` token
// (`--top-band` is gap + one chip row + gap), so the bar's own distance
// from the top of the viewport — measured, not assumed — is exactly what
// each peripheral's clearance underneath it should be. Comparing the two
// measured sides against each other keeps this honest in a way a
// hardcoded 16 could not: it follows the token when it compresses on
// xshort viewports, AND it fails if a chip ever renders taller than
// `--bookmarks-chip-h` assumes (the band would stop covering the bar,
// eating the clearance) or if either peripheral drifts back up to the
// bar's own `top` (clearance would go sharply negative).
const GAP_TOLERANCE = 1 // sub-pixel layout only

// Absolute floor for the bar's own top clearance, checked next to the
// symmetric comparison below: that comparison only measures the two sides
// of the gap against EACH OTHER, so a --top-band-gap collapsed to 0 would
// make both sides 0px and pass it cleanly, with the bar flush against the
// very top edge of the viewport. BAR_TOP_FLOOR catches that independently
// of what bar.top is being compared to.
const BAR_TOP_FLOOR = 4

// Returns null ONLY when the bar itself is missing — and that is a FAIL,
// not a skip: this whole block is already gated on the bookmarks
// permission, and the seed at the top of the script guarantees a
// populated bar. The peripherals come back as null INDEPENDENTLY, so a
// missing timer can't silently take the single-row and shrink assertions
// (which don't involve it at all) down with it — the earlier version
// returned one null for any of the three and collapsed all four
// assertions into a single SKIP line.
const measureBand = () =>
  page.evaluate((s) => {
    const nav = document.querySelector('nav[aria-label="Bookmarks bar"]')
    if (!nav) return null
    const timerEl = document.querySelector('[data-block-id="timer"]')
    const weatherEl = document.querySelector(s)
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return {
        top: +b.top.toFixed(1),
        bottom: +b.bottom.toFixed(1),
        left: +b.left.toFixed(1),
        right: +b.right.toFixed(1),
        width: +b.width.toFixed(1),
        height: +b.height.toFixed(1),
      }
    }
    const bar = r(nav)
    // The nav's own flex items — one per chip (a folder/overflow chip's
    // item is its `relative` wrapper div, a loose bookmark's is the
    // anchor itself). Their heights are what set the row height.
    const chips = [...nav.children].map(r)
    // The interactive chip inside each of those items, and everything the
    // narrow-window pass needs to know about it. A loose bookmark IS the
    // flex item; a folder/overflow chip's button sits inside its
    // popover-anchoring wrapper.
    const chipDetails = [...nav.children].map((slot) => {
      const el = slot.matches('a') ? slot : slot.querySelector('button')
      const b = el.getBoundingClientRect()
      const label = el.querySelector('[data-chip-label]')
      const labelRect = label ? label.getBoundingClientRect() : null
      // A chip's MARK: the favicon, the folder's compact-mode initial, or
      // the "»" glyph. Filtered to the ones actually taking up space, so
      // the display:none half of the compact swap doesn't count.
      const marks = [...el.querySelectorAll('[data-chip-mark]')].filter((m) => {
        const mr = m.getBoundingClientRect()
        return mr.width > 0 && mr.height > 0
      })
      return {
        w: +b.width.toFixed(1),
        h: +b.height.toFixed(1),
        title: el.getAttribute('title'),
        cursor: getComputedStyle(el).cursor,
        // `sr-only` clamps to a 1px box, so "visible" is a height test, not
        // a class test — this measures the rendered result of the compact
        // swap rather than trusting the class that was supposed to cause it.
        labelVisible: labelRect ? labelRect.height > 1.5 : false,
        markCount: marks.length,
      }
    })
    // Every chip's label. `truncate` means overflow:hidden, so clientWidth
    // is what's actually READABLE and scrollWidth is the full title —
    // their ratio is how much of each title survived the squeeze. (The
    // "»" chip has no label span, which is correct: it has nothing to
    // truncate and is exempt from shrinking.) Selected by `data-chip-label`
    // rather than by tag: a folder chip also carries a monogram span, and a
    // 9px monogram counted as a "label" would read as a catastrophically
    // truncated title.
    const labelEls = [...nav.querySelectorAll('[data-chip-label]')]
    const labels = labelEls.map((el) => ({
      w: el.clientWidth,
      natural: el.scrollWidth,
    }))
    // The `min-w-[4ch]` floor, resolved to px by the browser against the
    // label's OWN font — read rather than assumed, so this tracks a user's
    // Chrome minimum-font-size setting the same way the CSS does.
    const labelFloor = labelEls.length
      ? +parseFloat(getComputedStyle(labelEls[0]).minWidth).toFixed(1)
      : 0
    // Worst case: a profile whose titles are long enough to fill the cap
    // completely. The bar is centred and shrink-to-fit, so its ACTUAL
    // width depends on the seeded titles; the cap is the number the
    // layout is designed against.
    const maxW = parseFloat(getComputedStyle(nav).maxWidth)
    const cx = bar.left + bar.width / 2
    return {
      bar,
      barWorst: { left: cx - maxW / 2, right: cx + maxW / 2, top: bar.top, bottom: bar.bottom },
      barMaxWidth: +maxW.toFixed(1),
      chipCount: chips.length,
      tallestChip: Math.max(...chips.map((c) => c.height)),
      chipDetails,
      // COMPACT MODE, measured. Not "is the viewport under 720px" — that
      // would just restate the media query back at itself. This is the
      // rendered consequence: no chip is showing a label, and every chip is
      // showing exactly one mark instead.
      iconOnly:
        chipDetails.length > 0 &&
        chipDetails.every((c) => !c.labelVisible && c.markCount === 1),
      // …and in that mode each chip is a CIRCLE — width equal to the same
      // `--bookmarks-chip-h` token the band is built from.
      allCircular: chipDetails.every((c) => Math.abs(c.w - c.h) <= 1),
      allTitled: chipDetails.every((c) => typeof c.title === 'string' && c.title.length > 0),
      allPointer: chipDetails.every((c) => c.cursor === 'pointer'),
      labelCount: labels.length,
      labelFloor,
      narrowestLabel: labels.length ? Math.min(...labels.map((l) => l.w)) : 0,
      truncatedLabels: labels.filter((l) => l.natural > l.w + 1).length,
      // Worst survival ratio across the labels that ARE truncated; 1 when
      // none are.
      worstLabelRatio: Math.min(
        1,
        ...labels.filter((l) => l.natural > l.w + 1).map((l) => l.w / l.natural),
      ),
      // True when the row's used width is pinned to the cap — i.e. flex
      // shrink is doing work, rather than the chips happening to fit.
      capBinding: Math.abs(bar.width - maxW) <= 1,
      // A nowrap row that can't shrink far enough would overflow its own
      // box instead of wrapping — same failure, different shape.
      barOverflowX: nav.scrollWidth - nav.clientWidth,
      timer: timerEl ? r(timerEl) : null,
      weather: weatherEl ? r(weatherEl) : null,
      viewport: { w: window.innerWidth, h: window.innerHeight },
    }
  }, weatherSel)

const hits = (a, b) =>
  !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)

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

  // ── The top band (top-band pass) ────────────────────────────────────────
  // Jon: "the top of the page belongs to the bookmarks bar ALONE"; the timer
  // pill and weather chip default BELOW it, and on narrower viewports the
  // pieces shift/shrink to fit instead of wrapping or stacking. Three
  // separable claims, measured here at every matrix viewport rather than
  // eyeballed in the capture above:
  //   1. the bar is ONE row, at its structural maximum chip count;
  //   2. the timer pill clears the bar's band, vertically;
  //   3. the weather chip clears it too — in BOTH states, expanded included,
  //      which is the state that has an actual chance of running out of room.
  // Only meaningful under a preview build, same gating as every other
  // bookmarks probe in this script (see the header comment + the
  // hasBookmarksPermission SKIP line near the top): a production build never
  // renders the bar at all, so there is no band to measure.
  if (hasBookmarksPermission) {
    const band = await measureBand()

    // 1. ONE ROW. The bar used to be `flex-wrap`, and at 800x450 three chips
    // became two rows — a bar that grows downward eats the band the row
    // below now depends on. For a nowrap flex row the height IS the tallest
    // item's; for a wrapping one it's the sum of the lines, so comparing the
    // two separates the cases directly. The chip-count check is what stops
    // this passing vacuously on a thin profile: the seed (way up top) is
    // sized so the bar renders its structural maximum of 9 flex items —
    // MAX_VISIBLE_CHIPS (8) plus the "»" overflow chip.
    if (!band) {
      // Not a SKIP: the permission is held and the seed populated the tree,
      // so a missing bar is a real regression, not an absent precondition.
      console.log(`FAIL: bookmarks bar is a single row at ${w}x${h} (no nav[aria-label="Bookmarks bar"] in the DOM)`)
    } else {
      const singleRow = band.bar.height <= band.tallestChip + 2
      const enoughChips = band.chipCount >= 9
      const fitsBox = band.barOverflowX <= 1
      const onScreen = band.bar.left >= 0 && band.bar.right <= band.viewport.w + 1
      console.log(
        singleRow && enoughChips && fitsBox && onScreen
          ? `PASS: bookmarks bar is a single row at ${w}x${h} (${band.chipCount} chips in ${band.bar.width}px of a ${band.barMaxWidth}px cap; nav ${band.bar.height}px = one ${band.tallestChip}px chip row)`
          : `FAIL: bookmarks bar is a single row at ${w}x${h} (nav ${band.bar.height}px vs tallest chip ${band.tallestChip}px, ${band.chipCount} chips (need >=9), overflowX ${band.barOverflowX}px, rect ${band.bar.left}..${band.bar.right} in ${band.viewport.w}px)`,
      )

      // 1b. …by SHRINKING, and shrinking to something still worth reading.
      // Two halves, because either alone is satisfiable the wrong way: a row
      // that simply fit would pass every check above while proving nothing
      // about the shrink path, and a row that shrank to a line of ellipses
      // would "fit" too. So: the narrowest LABELLED viewport in the matrix
      // must actually put the cap under pressure (`capBinding`), and
      // wherever titles are truncated, at least half of each must survive.
      //
      // Below `compact` that rule stops being satisfiable at all — which is
      // the whole finding behind this threshold. Measured at 500x900 before
      // the change: a 92px title rendered in 31px, 34% of itself, and the
      // two shortest rendered as a bare glyph. So at those widths the claim
      // BECOMES the compact one — no labels at all, one mark per chip —
      // rather than being skipped. Either the labels are readable or they
      // are gone; the middle is what this whole pass exists to delete.
      const compact = w <= COMPACT_MAX_WIDTH
      if (compact) {
        const ok = band.iconOnly && band.allCircular
        console.log(
          ok
            ? `PASS: bookmarks chips are icon-only rather than unreadable at ${w}x${h} (${band.chipCount} chips, no label wider than 1px, one mark each, every chip a ${band.chipDetails[0].w}x${band.chipDetails[0].h}px circle)`
            : `FAIL: bookmarks chips are icon-only rather than unreadable at ${w}x${h} (iconOnly=${band.iconOnly}, circular=${band.allCircular}; ${JSON.stringify(band.chipDetails)})`,
        )
      } else {
        const mustBind = w === 800 || w === 730
        const legible = band.worstLabelRatio >= 0.5
        const exercised = !mustBind || band.capBinding
        const labelled = !band.iconOnly
        console.log(
          legible && exercised && labelled
            ? `PASS: bookmarks chips shrink rather than wrap at ${w}x${h} (cap ${band.capBinding ? 'binding' : 'not binding'}; ${band.truncatedLabels}/${band.labelCount} titles truncated, shortest keeps ${(band.worstLabelRatio * 100).toFixed(0)}% of itself)`
            : `FAIL: bookmarks chips shrink rather than wrap at ${w}x${h} (cap binding=${band.capBinding}${mustBind ? ' — cap-pressure requirement applies at the two narrowest labelled viewports (730 and 800)' : ''}; labels rendered=${labelled}; ${band.truncatedLabels}/${band.labelCount} titles truncated, shortest keeps only ${(band.worstLabelRatio * 100).toFixed(0)}%, need >=50%)`,
        )
      }

      // 1d. Both modes, every viewport. The `title` closes the deferred
      // minor that a truncated label left a SIGHTED user with no way back
      // to the full name (a screen reader always had one — the label span
      // is the chip's accessible name); in compact mode, where there is no
      // label at all, it is that route for everyone. The cursor is the
      // other half of the same idea: Tailwind v4's preflight sets
      // `button { cursor: default }`, so a folder chip advertised itself as
      // inert next to the real anchors beside it — the same inverted
      // affordance already fixed one row down in the weather widget, and it
      // matters more on a 30px circle with no text on it.
      console.log(
        band.allTitled && band.allPointer
          ? `PASS: every bookmarks chip carries its full title and a pointer cursor at ${w}x${h}`
          : `FAIL: every bookmarks chip carries its full title and a pointer cursor at ${w}x${h} (${JSON.stringify(band.chipDetails.map((c) => ({ title: c.title, cursor: c.cursor })))})`,
      )

      // 1e. A mark is still a control. The chip's click handler never
      // changed, but everything AROUND it did — the label that used to be
      // the click target is now an out-of-flow 1px box, the button is a
      // 30px circle, and the thing under the cursor is a <span> or an
      // <img>. A real click on the mark itself is the only way to know
      // that still opens the popover it's supposed to (and that the
      // popover, anchored to a chip a third of its former width, isn't
      // pushed off-screen by FolderPopover's own edge clamp).
      if (compact) {
        const devChip = 'nav[aria-label="Bookmarks bar"] button[title="Dev"] [data-chip-mark]'
        let opened = false
        try {
          await page.click(devChip, { timeout: 3000 })
          opened = await page
            .waitForSelector('[role="dialog"][aria-label="Dev bookmarks"]', { timeout: 2000 })
            .then(() => true, () => false)
        } catch {
          opened = false
        }
        const onScreen = opened
          ? await page.evaluate(() => {
              const r = document
                .querySelector('[role="dialog"][aria-label="Dev bookmarks"]')
                .getBoundingClientRect()
              return r.left >= 0 && r.right <= window.innerWidth + 1
            })
          : false
        console.log(
          opened && onScreen
            ? `PASS: an icon-only chip still opens its folder popover, fully on screen, at ${w}x${h}`
            : `FAIL: an icon-only chip still opens its folder popover, fully on screen, at ${w}x${h} (opened=${opened}, on-screen=${onScreen})`,
        )
        // Escape rather than an outside click: at this width almost every
        // point on the page is over some other widget.
        await page.keyboard.press('Escape')
        await page.waitForTimeout(150)
      }
    }

    // 1c. ABSOLUTE FLOOR — see BAR_TOP_FLOOR above. bar.top doesn't depend
    // on timer/weather, so this is checked once per viewport rather than
    // inside the loop below, right next to the symmetric clearance check it
    // complements.
    if (band) {
      console.log(
        band.bar.top >= BAR_TOP_FLOOR
          ? `PASS: bookmarks bar top clears an absolute floor at ${w}x${h} (${band.bar.top}px >= ${BAR_TOP_FLOOR}px)`
          : `FAIL: bookmarks bar top clears an absolute floor at ${w}x${h} (${band.bar.top}px < ${BAR_TOP_FLOOR}px)`,
      )
    }

    // 2. The timer pill clears the band. 3a. So does the weather chip, in
    // its COLLAPSED state. Both are guaranteed present by the seed (it flips
    // the timer widget on and sets a manual location), so a missing element
    // is a FAIL in its own right rather than a reason to say nothing.
    for (const [label, key] of [
      ['timer', 'timer'],
      ['weather', 'weather'],
    ]) {
      const rect = band && band[key]
      if (!rect) {
        console.log(
          `FAIL: no bookmarks/${label} overlap at ${w}x${h} (${band ? `the ${label} element is not in the DOM` : 'the bookmarks bar is not in the DOM'})`,
        )
        continue
      }
      const clear = +(rect.top - band.bar.bottom).toFixed(1)
      const ok =
        !hits(band.bar, rect) &&
        !hits(band.barWorst, rect) &&
        Math.abs(clear - band.bar.top) <= GAP_TOLERANCE
      console.log(
        ok
          ? `PASS: no bookmarks/${label} overlap at ${w}x${h} (starts ${clear}px below the bar, matching the ${band.bar.top}px above it)`
          : `FAIL: no bookmarks/${label} overlap at ${w}x${h} (clearance ${clear}px below the bar vs ${band.bar.top}px above it; actual-hit=${hits(band.bar, rect)}, worst-case-hit=${hits(band.barWorst, rect)})`,
      )
    }

    // 2b. Timer and weather also must not overlap EACH OTHER — the loop
    // above only checks each one against the bar independently; both
    // default to the same row below the band (left-4/right-4, bookending
    // it — see App.tsx's timer/weather PositionedBlock comments), so a
    // regression that narrows the gap between the two of them specifically
    // would pass both individual checks above and still collide.
    if (band && band.timer && band.weather) {
      const timerWeatherHit = hits(band.timer, band.weather)
      console.log(
        !timerWeatherHit
          ? `PASS: no timer/weather overlap at ${w}x${h}`
          : `FAIL: no timer/weather overlap at ${w}x${h} (timer ${JSON.stringify(band.timer)}, weather ${JSON.stringify(band.weather)})`,
      )
    }

    // 3b. …and EXPANDED — the state that actually collided in real use, and
    // the one the pre-rebuild gate never checked (its unconditional
    // `max-w-[32rem]` put the panel's left edge at 1072px against a
    // worst-case bar right edge of 1216px at 1600x900 — 144px of overlap,
    // 187px at 1420x437). The clearance is vertical now rather than
    // horizontal, but the panel is also by far the tallest thing in the row
    // below the bar, so this is where the band's cost to the vertical budget
    // shows up: it must still fit ON SCREEN once pushed down, at 1420x437
    // and 800x450 especially.
    await setWeatherExpanded(true)
    await page.waitForTimeout(200)
    const expanded = await measureBand()
    if (!expanded || !expanded.weather) {
      console.log(
        `FAIL: no bookmarks/weather overlap at ${w}x${h} with the panel EXPANDED (${expanded ? 'the weather element is not in the DOM' : 'the bookmarks bar is not in the DOM'})`,
      )
    } else {
      const clear = +(expanded.weather.top - expanded.bar.bottom).toFixed(1)
      const bottomRoom = +(expanded.viewport.h - expanded.weather.bottom).toFixed(1)
      // The panel's own box, once it is a panel rather than a chip: it has
      // to stay inside the viewport horizontally and stay off the timer
      // pill. Neither was covered before — 2b above measures timer vs
      // weather in the COLLAPSED state only, and it runs before this block
      // expands anything, so a panel wide enough to reach across the row
      // (or off the left edge) passed every check in this loop. That gap
      // only became reachable once the panel's width stopped being a small
      // viewport fraction, so it is closed here, at every viewport, rather
      // than only where the new widths apply.
      const onScreenX =
        expanded.weather.left >= 0 && expanded.weather.right <= expanded.viewport.w + 1
      const timerClear = !expanded.timer || !hits(expanded.weather, expanded.timer)
      const ok =
        !hits(expanded.bar, expanded.weather) &&
        !hits(expanded.barWorst, expanded.weather) &&
        Math.abs(clear - expanded.bar.top) <= GAP_TOLERANCE &&
        bottomRoom >= 0 &&
        onScreenX &&
        timerClear
      console.log(
        ok
          ? `PASS: no bookmarks/weather overlap at ${w}x${h} with the panel EXPANDED (${expanded.weather.width}x${expanded.weather.height}px, starts ${clear}px below the bar, ${bottomRoom}px of viewport left under it; spans ${expanded.weather.left}..${expanded.weather.right} of ${expanded.viewport.w}px, clear of the timer pill)`
          : `FAIL: no bookmarks/weather overlap at ${w}x${h} with the panel EXPANDED (clearance ${clear}px below the bar vs ${expanded.bar.top}px above it; ${bottomRoom}px left under the panel, need >=0; spans ${expanded.weather.left}..${expanded.weather.right} of ${expanded.viewport.w}px, timer-clear=${timerClear}; actual-hit=${hits(expanded.bar, expanded.weather)}, worst-case-hit=${hits(expanded.barWorst, expanded.weather)})`,
      )

      // 3c. The expanded panel is far taller than the collapsed chip —
      // tall enough to reach up into the clock/greeting column, which the
      // collapsed-state overlap check earlier in this same iteration (the
      // one the owner's original screenshot motivated) never exercises,
      // since it runs before the widget expands.
      const centerColumn = await page.evaluate(() => {
        const r = (el) => (el ? el.getBoundingClientRect() : null)
        return {
          clock: r(document.querySelector('[data-block-id="clock"]')),
          greeting: r(document.querySelector('[data-block-id="greeting"]')),
        }
      })
      // Both blocks are guaranteed present (they are default-placement
      // widgets with no toggle), so a missing rect is a regression, not a
      // reason to say nothing — without this the `? … : false` below would
      // report a clean PASS for a page that had lost its clock.
      const columnMeasured = !!centerColumn.clock && !!centerColumn.greeting
      const clockHit = centerColumn.clock ? hits(expanded.weather, centerColumn.clock) : false
      const greetingHit = centerColumn.greeting ? hits(expanded.weather, centerColumn.greeting) : false
      if (w > COMPACT_MAX_WIDTH) {
        console.log(
          columnMeasured && !clockHit && !greetingHit
            ? `PASS: no expanded-weather/clock-greeting overlap at ${w}x${h}`
            : `FAIL: no expanded-weather/clock-greeting overlap at ${w}x${h} (measured=${columnMeasured}, clock-hit=${clockHit}, greeting-hit=${greetingHit}, weather ${JSON.stringify(expanded.weather)}, clock ${JSON.stringify(centerColumn.clock)}, greeting ${JSON.stringify(centerColumn.greeting)})`,
        )
      } else {
        // Below `compact`, clearing the centre column is ARITHMETICALLY
        // impossible, and saying so is more useful than a check that can
        // only ever fail. The greeting is centred and ~254px wide, so at
        // 500px its right edge is at 377px; the panel is anchored `right-4`,
        // which leaves 107px between them — narrower than this panel's own
        // header row (32px icon + a 2rem temperature + chevron + padding).
        // Any panel a user could read overlaps. So the claim changes shape:
        // it must OCCLUDE rather than collide — a real surface, painted and
        // hit-tested on top wherever it covers the column, the way every
        // other floating panel in this app (Tasks, Notes, the timer) already
        // behaves at every size. The geometry checks that still mean
        // something at this width — clear of the band, clear of the timer
        // pill, fully on screen — are asserted directly above.
        //
        // Written to be FALSIFIABLE, which took three tries:
        //   · the alpha floor is the `bg-panel-solid` CONTRACT (0.95 in
        //     Aurora, the theme this matrix runs in), not "greater than
        //     zero" — a regression to the 50%-opaque `bg-panel` the
        //     COLLAPSED chip uses would sail through a >0 test while
        //     leaving the greeting legible straight through the panel.
        //   · `covered` must be non-empty. `[].every()` is `true`, so a
        //     panel that had stopped overlapping anything — or a page whose
        //     clock and greeting had vanished — would have reported the
        //     strongest possible PASS for having proved nothing.
        //   · there is deliberately no backdrop-filter term: `--panel-blur`
        //     is `0px` in the Mono theme, and `blur(0px)` still contains the
        //     substring "blur", so that clause could only ever be true.
        const SOLID_SURFACE_ALPHA = 0.9
        const overlay = await page.evaluate(
          ({ s, rects }) => {
            const sec = document.querySelector(s)
            if (!sec) return null
            const r = sec.getBoundingClientRect()
            const cs = getComputedStyle(sec)
            const alpha = (() => {
              const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/)
              if (!m) return 0
              const parts = m[1].split(',').map((v) => parseFloat(v))
              return parts.length > 3 ? parts[3] : 1
            })()
            // Sample the CENTRE of each overlap region: if the panel really
            // owns those pixels, that is what hit-testing finds there.
            const covered = []
            for (const [name, box] of Object.entries(rects)) {
              if (!box) continue
              const left = Math.max(r.left, box.left)
              const right = Math.min(r.right, box.right)
              const top = Math.max(r.top, box.top)
              const bottom = Math.min(r.bottom, box.bottom)
              if (right <= left || bottom <= top) continue
              const el = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
              covered.push({ name, onTop: !!el && !!el.closest('[data-block-id="weather"]') })
            }
            return { alpha: +alpha.toFixed(2), covered }
          },
          { s: weatherSel, rects: centerColumn },
        )
        const ok =
          overlay !== null &&
          columnMeasured &&
          overlay.alpha >= SOLID_SURFACE_ALPHA &&
          overlay.covered.length > 0 &&
          overlay.covered.every((c) => c.onTop)
        console.log(
          ok
            ? `PASS: the expanded weather panel occludes the centre column rather than colliding with it at ${w}x${h} (covers ${overlay.covered.map((c) => c.name).join(', ')}; surface alpha ${overlay.alpha} >= ${SOLID_SURFACE_ALPHA}, topmost at every covered point)`
            : `FAIL: the expanded weather panel occludes the centre column rather than colliding with it at ${w}x${h} (column measured=${columnMeasured}, need alpha >= ${SOLID_SURFACE_ALPHA} and a non-empty covered set, all topmost: ${JSON.stringify(overlay)})`,
        )
      }
    }
    await setWeatherExpanded(false) // leave the page as this loop found it
    await page.waitForTimeout(150)
  }

  // LQIP OVERSCALE vs BLUR RADIUS (deferred minor from the LQIP review,
  // closed here because it is a narrow-VIEWPORT bug and this is the narrow
  // viewport). The underlay is a blurred copy of the photo; the blur samples
  // past the layer's own edges, so the layer is scaled up to give it real
  // pixels to sample instead of transparency. The margin that buys is a
  // PERCENTAGE of the viewport, the blur radius is a constant in px — so the
  // cover only holds above some width. `scale-110` covered 5% per side: 25px
  // at 500px against `blur-2xl`'s 40px radius, i.e. the underlay faded off at
  // its own left and right edges on exactly the windows it exists for.
  // Measured, not read off the class list: the computed filter gives the real
  // radius (including any future theme override) and the layer's own rect
  // against the viewport gives the real margin, on both axes.
  if (w === 500) {
    const cover = await page.evaluate(() => {
      const layer = document.querySelector('[data-lqip]')
      if (!layer) return null
      const filter = getComputedStyle(layer).filter
      const m = filter.match(/blur\(([\d.]+)px\)/)
      const r = layer.getBoundingClientRect()
      return {
        blur: m ? parseFloat(m[1]) : null,
        marginX: +Math.min(-r.left, r.right - window.innerWidth).toFixed(1),
        marginY: +Math.min(-r.top, r.bottom - window.innerHeight).toFixed(1),
      }
    })
    const ok = cover !== null && cover.blur !== null && cover.marginX >= cover.blur && cover.marginY >= cover.blur
    console.log(
      ok
        ? `PASS: the LQIP underlay overscales past its own blur radius at ${w}x${h} (${cover.marginX}px/${cover.marginY}px of overscale for a ${cover.blur}px blur)`
        : `FAIL: the LQIP underlay overscales past its own blur radius at ${w}x${h} (${JSON.stringify(cover)})`,
    )
  }
}

// ---------------------------------------------------------------------------
// GREETING WIDTH CAP — worst-case custom name (batch item 1, prior-phase
// review finding). Every capture up to this point ran with the default,
// empty `settings.name` (see the top-of-file seed — it never touches it), so
// the greeting was always short ("Good afternoon.") and nothing in this
// script had ever exercised what a real `Settings -> General -> "Your name"`
// can do to it. Greeting.tsx now caps the line's width and truncates
// (`title` carries the full text) rather than growing unbounded; this seeds
// a worst-case name — 40+ Latin characters AND the same CJK title the
// bookmarks worst-case block below uses — one string that is wide by BOTH
// measures the review called out, so a cap that survives this can't be
// passing by accident on either axis alone.
//
// Two viewports, same reasoning as the weather-expanded matrix above: 730x900
// is the narrowest point of `tight`, where WeatherWidget's own EXPANDED-panel
// width formula is calibrated on the assumption that this greeting never
// exceeds its widest DEFAULT rendering (284.5px, ~3px of clearance measured
// there — see WeatherWidget.tsx's own comment); 800x450 stacks `tight` width
// with `xshort` height, where the greeting drops to 18px type — checked here
// because the cap is a WIDTH media query and doesn't care about the smaller
// face, so the same truncation is expected to hold there too.
//
// Not reloaded: a `chrome.storage.local.set` on `settings` propagates live
// via `chrome.storage.onChanged` (same as the location-typeahead block
// above), so this is a real "user types a long name while the page is open"
// scenario, not a fresh-mount one.
{
  const originalSettings = await page.evaluate(
    async () => (await chrome.storage.local.get('settings')).settings,
  )
  const WORST_CASE_NAME = 'BARTHOLOMEW-MAXIMILIAN-FEATHERSTONEHAUGH 天気予報'
  await page.evaluate(
    ({ settings, name }) => chrome.storage.local.set({ settings: { ...settings, name } }),
    { settings: originalSettings, name: WORST_CASE_NAME },
  )
  await page.waitForFunction(
    () => document.querySelector('[data-block-id="greeting"] p')?.getAttribute('title')?.includes('BARTHOLOMEW'),
    { timeout: 5000 },
  )

  // The `<p>` itself, not the `[data-block-id]` wrapper div the other
  // overlap probes in this script measure: the wrapper shrink-wraps the
  // paragraph (see PositionedBlock.tsx — it carries no width of its own), so
  // its rect is the same box, but only the `<p>` has `overflow:hidden` set,
  // and `scrollWidth`/`clientWidth` are what make truncation FALSIFIABLE
  // (measured against measured, not "renders without a visible complaint") —
  // the same idiom the bookmarks label-truncation check above uses.
  const measureGreeting = () =>
    page.evaluate((s) => {
      const p = document.querySelector('[data-block-id="greeting"] p')
      if (!p) return null
      const r = p.getBoundingClientRect()
      const weatherEl = document.querySelector(s)
      const wr = weatherEl ? weatherEl.getBoundingClientRect() : null
      return {
        rect: { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) },
        clientWidth: p.clientWidth,
        scrollWidth: p.scrollWidth,
        title: p.getAttribute('title'),
        weather: wr ? { top: +wr.top.toFixed(1), bottom: +wr.bottom.toFixed(1), left: +wr.left.toFixed(1), right: +wr.right.toFixed(1) } : null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
      }
    }, weatherSel)

  for (const { w, h } of [
    { w: 730, h: 900 },
    { w: 800, h: 450 },
  ]) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(300) // let resize listeners + layout settle

    const collapsed = await measureGreeting()
    await page.screenshot({ path: `${outDir}/greeting-worst-case-${w}x${h}.png` })
    console.log(`captured greeting-worst-case-${w}x${h}.png`)

    if (!collapsed) {
      console.log(`FAIL: greeting cap binds for a worst-case name at ${w}x${h} (greeting not found)`)
    } else {
      // The falsifiable half of the claim: the cap doesn't just "look fine"
      // today, it is actually BINDING — the natural (untruncated) line is
      // wider than the box truncation clipped it to.
      const capBinds = collapsed.scrollWidth > collapsed.clientWidth + 1
      const titled = typeof collapsed.title === 'string' && collapsed.title.includes('BARTHOLOMEW')
      const onScreen = collapsed.rect.left >= -1 && collapsed.rect.right <= collapsed.viewport.w + 1
      const clearOfCollapsedWeather = !collapsed.weather || !hits(collapsed.rect, collapsed.weather)
      console.log(
        capBinds && titled && onScreen && clearOfCollapsedWeather
          ? `PASS: greeting cap binds and stays clear of the collapsed weather chip for a worst-case name at ${w}x${h} (${collapsed.clientWidth}px shown of ${collapsed.scrollWidth}px natural, full name on \`title\`)`
          : `FAIL: greeting cap binds and stays clear of the collapsed weather chip for a worst-case name at ${w}x${h} (capBinds=${capBinds} [${collapsed.clientWidth}px vs ${collapsed.scrollWidth}px natural], titled=${titled}, onScreen=${onScreen} (${collapsed.rect.left}..${collapsed.rect.right} of ${collapsed.viewport.w}px), weatherClear=${clearOfCollapsedWeather} (greeting ${JSON.stringify(collapsed.rect)}, weather ${JSON.stringify(collapsed.weather)}))`,
      )
    }

    // The EXPANDED panel — the state WeatherWidget.tsx's own `tight:` cap is
    // actually calibrated against (see that file's comment); the collapsed
    // chip above is anchored `right-4` and stays narrow regardless.
    await setWeatherExpanded(true)
    await page.waitForTimeout(200)
    const expanded = await measureGreeting()
    if (!expanded) {
      console.log(`FAIL: greeting cap stays clear of the EXPANDED weather panel for a worst-case name at ${w}x${h} (greeting not found)`)
    } else {
      const clearOfExpandedWeather = !expanded.weather || !hits(expanded.rect, expanded.weather)
      console.log(
        clearOfExpandedWeather
          ? `PASS: greeting cap stays clear of the EXPANDED weather panel for a worst-case name at ${w}x${h} (greeting ${expanded.rect.left}..${expanded.rect.right}, weather ${expanded.weather ? `${expanded.weather.left}..${expanded.weather.right}` : 'not found'} of ${expanded.viewport.w}px)`
          : `FAIL: greeting cap stays clear of the EXPANDED weather panel for a worst-case name at ${w}x${h} (greeting ${JSON.stringify(expanded.rect)}, weather ${JSON.stringify(expanded.weather)})`,
      )
    }
    await setWeatherExpanded(false)
    await page.waitForTimeout(150)
  }

  // Restore: the seeded name (nothing else changed), same discipline as
  // every other seed/restore point in this script.
  await page.evaluate((settings) => chrome.storage.local.set({ settings }), originalSettings)
  await page.waitForFunction(
    () => !document.querySelector('[data-block-id="greeting"] p')?.getAttribute('title')?.includes('BARTHOLOMEW'),
    { timeout: 5000 },
  )
  await page.setViewportSize(launchViewport)
  await page.waitForTimeout(150)
}

// ---------------------------------------------------------------------------
// Fresh-install DEFAULT state (final review finding 2). Storage defaults
// (src/lib/storage/schema.ts's defaults()) ship bookmarks:false, timer:false
// — every capture up to this point in this script ran with BOTH seeded ON
// (see the top-of-file seed comment), so the actual out-of-the-box state a
// brand-new install shows has never been screenshot-gated. The top band is
// reserved UNCONDITIONALLY whether or not bookmarks/timer are on (deliberate
// — see index.css's --top-band comments), so this is also the state that
// proves the band doesn't leave a dead gap when nothing occupies the row
// below it. Own storage write + reload (not a live toggle) so the captures
// reflect a genuine first mount from storage rather than a transition —
// then restored, same snapshot/restore discipline as every other point in
// this script (photoPrefs, Source, location, theme, layout).
{
  const originalSettings = await page.evaluate(
    async () => (await chrome.storage.local.get('settings')).settings,
  )
  await page.evaluate(
    (settings) =>
      chrome.storage.local.set({
        settings: { ...settings, widgets: { ...settings.widgets, bookmarks: false, timer: false } },
      }),
    originalSettings,
  )
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.reload()
  await page.waitForSelector('time')
  const errorsBeforeDefaultState = errors.length
  await waitForPhotoSettle()
  await page.screenshot({ path: `${outDir}/default-state-1600x900.png` })
  console.log('captured default-state-1600x900.png')

  await page.setViewportSize({ width: 1420, height: 437 })
  await page.waitForTimeout(300) // let resize listeners + layout settle
  await waitForPhotoSettle()
  await page.screenshot({ path: `${outDir}/default-state-1420x437.png` })
  console.log('captured default-state-1420x437.png')

  // Jon's own ~500px side window, and the only capture in this block below
  // the `compact` threshold (deferred from the batch-2 final review: the
  // default state had never been gated at the narrow end, where the top band
  // is reserved for a bookmarks bar that a fresh install doesn't render).
  await page.setViewportSize({ width: 500, height: 900 })
  await page.waitForTimeout(300) // let resize listeners + layout settle
  await waitForPhotoSettle()
  await page.screenshot({ path: `${outDir}/default-state-500x900.png` })
  console.log('captured default-state-500x900.png')

  const newDefaultStateErrors = errors.length - errorsBeforeDefaultState
  console.log(
    newDefaultStateErrors === 0
      ? 'PASS: no console errors in the default fresh-install state'
      : `FAIL: no console errors in the default fresh-install state (${newDefaultStateErrors} new: ${errors.slice(-newDefaultStateErrors).join('; ')})`,
  )

  const defaultState = await page.evaluate(
    (s) => ({
      weatherChip: !!document.querySelector(s),
      bookmarksNav: !!document.querySelector('nav[aria-label="Bookmarks bar"]'),
      timerPill: !!document.querySelector('button[aria-label^="Focus timer"]'),
    }),
    weatherSel,
  )
  console.log(
    defaultState.weatherChip
      ? 'PASS: weather chip present in the default fresh-install state'
      : 'FAIL: weather chip present in the default fresh-install state (not found)',
  )
  console.log(
    !defaultState.bookmarksNav
      ? 'PASS: bookmarks nav absent in the default fresh-install state'
      : 'FAIL: bookmarks nav absent in the default fresh-install state (found in the DOM)',
  )
  console.log(
    !defaultState.timerPill
      ? 'PASS: timer pill absent in the default fresh-install state'
      : 'FAIL: timer pill absent in the default fresh-install state (found in the DOM)',
  )

  // Restore: original settings (bookmarks/timer back to whatever this
  // script's own seed had them at), launch viewport, reload — so nothing
  // captured after this section runs against the default-off state.
  await page.evaluate((settings) => chrome.storage.local.set({ settings }), originalSettings)
  await page.setViewportSize(launchViewport)
  await page.reload()
  await page.waitForSelector('time')
  await page.waitForTimeout(800) // photo fade-in, same as every other reload in this script
}

// ---------------------------------------------------------------------------
// WORST-CASE FIT: eight chips whose titles are SHORT but WIDE.
//
// Review finding. An earlier version of the shrink pass exempted chips whose
// TITLE was short from shrinking at all, on the reasoning that truncating
// "Dev" to "D…" costs the chip its meaning. A character count is not a width:
// six uppercase Latin characters ("GITHUB") or four full-width CJK glyphs
// render around 90px, so eight "short" titles came to roughly 800px against a
// 768px cap — and with every chip exempt from shrinking, a centred row that
// never clips or scrolls spills off BOTH viewport edges. The main matrix
// can't catch it: its seed keeps only two short titles, so nothing there ever
// exercises the exempt path at scale.
//
// The fix moved the floor onto the LABEL (`min-w-[4ch]`, font-relative) and
// put `shrink` back on every chip, which makes the fit an invariant of the
// layout rather than a property of the seeded titles. This probe is what
// proves that: it replaces the whole bookmarks bar with the adversarial case
// — uppercase Latin, CJK, and the widest Latin glyphs there are, every title
// at or under the old six-character exemption — and measures it at both ends
// of the responsive range (see the loop's own comment below).
//
// Placed last on purpose. It DESTROYS the seeded bookmarks tree, which no
// capture above would survive; nothing after it reads the bar, and the
// profile directory is wiped at the top of every run (see the rmSync at the
// top of this file), so there is no state to hand back.
if (hasBookmarksPermission) {
  await page.evaluate(async () => {
    const bar = '1'
    for (const node of await chrome.bookmarks.getChildren(bar)) {
      await chrome.bookmarks.removeTree(node.id)
    }
    // Eight visible chips (MAX_VISIBLE_CHIPS) plus two more to force the "»"
    // overflow chip — the row at its structural maximum, same as the main
    // seed, but every title is <= 6 characters/glyphs AND wide.
    for (const title of [
      'GITHUB', // the reviewer's own example: uppercase Latin, 6 chars
      'REDDIT',
      'GITLAB',
      'DOCKER',
      '天気予報', //  4 full-width CJK glyphs — the other named case
      'ニュース',
      'WWWWWW', // the widest six Latin characters available
      'MMMMMM',
      'ZZZZZZ', // overflow
      'QQQQQQ', // overflow
    ]) {
      await chrome.bookmarks.create({ parentId: bar, title, url: `https://example.com/${title}` })
    }
  })
  // Run at BOTH ends of the responsive range, because the adversarial case
  // is answered differently at each and only the pair proves there is no gap
  // between the two answers. At 800x450 the row is still LABELLED, so the
  // answer is the `min-w-[4ch]` floor plus proportional shrink. At 500x900
  // it is below `compact`, where the answer is structural instead: with no
  // labels to shrink, nine chips are nine circles and the row's width stops
  // depending on the titles at all — which is what makes the fit an
  // invariant rather than a measurement that happened to come out right.
  for (const { w, h } of [
    { w: 800, h: 450 },
    { w: 500, h: 900 },
  ]) {
    await page.setViewportSize({ width: w, height: h })
    // The bar model is loaded once, in a mount-time effect — a tree edit needs
    // a reload to be seen at all. (Also re-run per viewport here so each leg
    // starts from a clean mount rather than a resized one.)
    await page.reload()
    await page.waitForSelector('nav[aria-label="Bookmarks bar"]', { timeout: 10_000 })
    await page.waitForTimeout(800) // photo fade-in, same as every other reload here
    await page.screenshot({ path: `${outDir}/bookmarks-worst-case-${w}x${h}.png` })
    console.log(`captured bookmarks-worst-case-${w}x${h}.png`)

    const worst = await measureBand()
    if (!worst) {
      console.log(`FAIL: a bar of short-but-wide titles still fits at ${w}x${h} (no bookmarks bar in the DOM)`)
      continue
    }
    const singleRow = worst.bar.height <= worst.tallestChip + 2
    const enoughChips = worst.chipCount >= 9
    const withinCap = worst.bar.width <= worst.barMaxWidth + 1
    const onScreen = worst.bar.left >= 0 && worst.bar.right <= worst.viewport.w + 1
    const fitsBox = worst.barOverflowX <= 1
    console.log(
      singleRow && enoughChips && withinCap && onScreen && fitsBox
        ? `PASS: a bar of short-but-wide titles still fits at ${w}x${h} (${worst.chipCount} chips — uppercase Latin, CJK, WWWWWW — in ${worst.bar.width}px of a ${worst.barMaxWidth}px cap, spanning ${worst.bar.left}..${worst.bar.right} of ${worst.viewport.w}px; one ${worst.bar.height}px row)`
        : `FAIL: a bar of short-but-wide titles still fits at ${w}x${h} (${worst.chipCount} chips (need >=9), ${worst.bar.width}px vs ${worst.barMaxWidth}px cap, spanning ${worst.bar.left}..${worst.bar.right} of ${worst.viewport.w}px, overflowX ${worst.barOverflowX}px, nav ${worst.bar.height}px vs tallest chip ${worst.tallestChip}px)`,
    )

    if (w > COMPACT_MAX_WIDTH) {
      // …and the floor did its job: nothing collapsed to an ellipsis. 4ch is
      // roughly two Latin characters plus the ellipsis, so requiring every
      // label to still render at least that much is the difference between a
      // squeezed chip and a meaningless one.
      console.log(
        worst.narrowestLabel >= worst.labelFloor - 1
          ? `PASS: no chip is squeezed below its label floor at ${w}x${h} (narrowest label ${worst.narrowestLabel}px vs a ${worst.labelFloor}px 4ch floor)`
          : `FAIL: no chip is squeezed below its label floor at ${w}x${h} (narrowest label ${worst.narrowestLabel}px, floor ${worst.labelFloor}px)`,
      )
    } else {
      // Below `compact` there is no floor to test, because there is no
      // label. The claim instead is the one that makes this whole seed
      // moot: the adversarial titles — the ones that used to be able to
      // push a "short titles" row past its cap — cannot influence the
      // row's width at all once every chip is a fixed-size circle, and the
      // names they stand for are still reachable via `title`.
      const ok = worst.iconOnly && worst.allCircular && worst.allTitled
      console.log(
        ok
          ? `PASS: short-but-wide titles collapse to marks rather than crumbs at ${w}x${h} (${worst.chipCount} circles, one mark each, every full title on a title attribute — ${worst.chipDetails.map((c) => c.title).join(', ')})`
          : `FAIL: short-but-wide titles collapse to marks rather than crumbs at ${w}x${h} (iconOnly=${worst.iconOnly}, circular=${worst.allCircular}, titled=${worst.allTitled}; ${JSON.stringify(worst.chipDetails)})`,
      )
    }
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
