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
