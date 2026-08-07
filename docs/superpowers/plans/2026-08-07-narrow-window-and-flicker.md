# Narrow-Window Polish + Flicker Mitigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address Jon's 2026-08-07 real-device reports: (1) old new-tab pages' background photo visibly flickers (photo-only, not full reload) when a new tab launches with many tabs open; (2) at ~500px-wide windows the bookmarks chips truncate to unreadable crumbs ("Lei…", "A…") and the collapsed weather chip wraps awkwardly.

**Architecture:** Task 1 mitigates the (externally-caused) decoded-image purge by replacing the gradient fallback under the background `<img>` with a per-photo blurred low-quality placeholder (LQIP) so re-decode gaps show a blurred photo instead of a gradient flash; reproduction attempt via CDP memory-pressure simulation. Task 2 adds an icon-forward collapse mode for the bookmarks bar below a narrow threshold plus collapsed-weather-chip label discipline, and extends the viewport matrix to ~500px.

**Tech Stack:** React 19 + TS strict, Tailwind 4, sharp (build-time encode pipeline), Playwright harness, CDP `Memory.simulatePressureNotification`.

## Global Constraints

- Baseline: 478/478 tests, harness 88 PASS / 0 FAIL at `c4c96a8`. Every task: full suite green, harness zero FAIL, commit with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer; controller pushes after review.
- Widget quality bar (Jon, standing): interaction probes at every visual gate; NO scroll regions; pointer cursor only on real controls; no unreadable truncation; "absolute best" design bar.
- Network frozen (Open-Meteo ×2 + BigDataCloud ×1). LQIP assets are BUNDLED (build-time) or IndexedDB (uploads) — zero new fetches, zero new origins.
- `npm run package` guards must stay green; LQIP additions must be size-trivial (<200KB total for 23 photos).
- Daily rotation, upload galleries, cross-tab settings sync, and the cross-tab no-flicker harness probes must stay intact.
- Stored arrange layouts untouched. Panel-surface + `.text-photo` conventions. Storage via `src/lib/storage` only.
- Chrome's own tab strip is browser chrome — out of extension control; not in scope.

---

### Task 1: Background LQIP underlay (flicker mitigation)

**Files:**
- Modify: `scripts/encode-photos.mjs` (emit tiny blurred-placeholder variant per bundled photo, ~24-32px wide, quality-floor AVIF/WebP; record in the photo manifest), `src/services/photos/photos.json` (or the manifest module it generates)
- Modify: `src/newtab/components/Background.tsx` (render LQIP layer under the `<img>` where the gradient fallback lives today; CSS blur + slight scale to mask artifacts)
- Modify (uploads path): the gallery pipeline — reuse existing IndexedDB thumbnail infrastructure if the settings gallery already stores thumbs; otherwise generate a tiny thumb at upload time
- Modify: `scripts/verify-photo-manifest.mjs` if it pins manifest shape
- Test: `src/newtab/components/Background.test.tsx` + harness probe

**Context (evidence so far):** Jon reports (2026-08-07, second report): "the image is flickering when a new tab is launched. The old tabs are flickering to be specific" — photo-only, many tabs open. The 2026-08-06 investigation FALSIFIED every in-repo cause with instrumented two-page probes (no remount, no fade re-run, no storage echo; probes now permanent). Leading external candidate: Chrome purges decoded/rasterized image memory of background tabs under pressure; on re-display the 4K AVIF re-decodes (recorded 136-165ms worst case) and the gap shows the layer behind the img — currently a gradient, hence a visible photo→gradient→photo flash. The mitigation makes that gap show a blurred copy of the SAME photo instead.

**Steps:**
- [ ] Reproduce first (best effort): in a throwaway harness script, open page A, let it settle, then via CDP `Memory.simulatePressureNotification({level: 'critical'})` (and/or opening several heavy pages) attempt to force a decoded-image purge and capture the flash (screencast frames or paint-timing instrumentation). If reproducible, keep a before/after probe; if not reproducible in the sandbox, say so honestly and proceed (the mechanism is documented Chrome behavior; the mitigation is safe regardless).
- [ ] Extend `encode-photos.mjs`: per photo emit `<name>-lqip.avif` (or webp if decode-cost-wiser at this size) ~24-32px wide; wire into the manifest with the existing credit/tier structure; re-run the pipeline; verify total added bytes < 200KB.
- [ ] `Background.tsx`: LQIP `<img>` (or CSS background layer) permanently under the main img, `aria-hidden`, blurred (e.g. `blur-2xl scale-110` to hide edges), sourced from the manifest for bundled photos / IndexedDB thumb for uploads; gradient stays only as the no-photo-at-all fallback. First-paint improves as a side effect (LQIP shows during initial decode+fade).
- [ ] Rotation/gallery/sync regression: existing tests + the permanent two-page probes stay green; LQIP layer must swap in the SAME render as the main img's src change (no stale-LQIP-under-new-photo state).
- [ ] Tests: manifest shape (every bundled photo has an LQIP entry — extend verify-photo-manifest), Background renders LQIP under img with matching photo identity, upload path produces/uses thumb.
- [ ] Harness: assert LQIP layer present + correct pairing on the default photo; keep all 88 existing assertions green; capture `newtab.png` refresh.
- [ ] `npm run package` — size guard green; note the zip delta in the report.
- [ ] Commit (`feat: blurred LQIP underlay beneath background photos (flicker mitigation + faster first paint)`), do not push.

**Acceptance:** controller reads the captures (LQIP invisible in steady state — the photo covers it) and the probe/repro evidence; suite + harness green; package guards green; honest report on whether the purge-flash was reproducible.

### Task 2: Narrow-window bar collapse + weather chip label discipline

**Files:**
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.tsx` (icon-forward collapse below a narrow threshold), `src/newtab/index.css` (new width variant if needed)
- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx` (collapsed chip: single-line label with graceful truncation + title attr — no multi-line wrap like "Clear ·"/"Dallas")
- Modify: `scripts/preview.mjs` (extend matrix with 500×900; extend worst-case probe; captures)
- Test: `BookmarksBar.test.tsx`, `WeatherWidget.test.tsx`

**Context:** Jon's ~500px-wide window (screenshot 2026-08-07) shows chips as "Lei…", "Refe…", "Ga…", "Entert…", "Sc…", "De…", "A…" — technically single-row but unreadable; the collapsed weather chip wraps its condition/location text across lines with the chevron orphaned. Our matrix floor was 800px. The min-w-[4ch] floor prevents overflow but 4ch crumbs fail the quality bar.

**Requirements:**
- Below a threshold (implementer's design pass picks it, ~640px is the suggested start): bookmarks chips render icon-only (folder icon / favicon) with `title` attr (this also resolves the deferred truncated-label tooltip minor — add title attrs at ALL widths while here), single row, `»` overflow intact, centered. NO intermediate unreadable state: at any width, a chip shows either a readable label (≥ the 4ch floor rendering ≥4 actual characters before ellipsis) or icon-only.
- Collapsed weather chip: one line always; condition · location truncates with ellipsis + title attr when space demands; chevron never orphaned; chip never exceeds available width next to the timer pill.
- Matrix += 500×900 with ALL band/adjacency/single-row/no-overlap assertions running there; worst-case wide-title probe also runs at 500×900 (icon-only mode makes it pass by construction — assert icon-only actually engaged); captures `viewport-500x900.png`, `bookmarks-worst-case-500x900.png`.
- Interaction probes: icon-only chips still open popovers (click probe); title attrs present; cursor discipline holds.

**Steps:**
- [ ] frontend-design pass (invoke the skill) for the icon-only mode + chip transitions.
- [ ] Failing tests first (icon-only rendering below threshold, title attrs, weather single-line), then implement.
- [ ] Full suite + harness (with new viewport) zero FAIL.
- [ ] Commit (`feat: icon-only bookmarks below narrow threshold; weather chip label discipline`), do not push.

**Acceptance:** controller reads 500×900 captures (both seeds) + re-checks 800×450 and 1420×437 for regressions; probes green; no unreadable truncation anywhere in the matrix.
