# NL-P6 Product QA Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the complete named-layouts product (NL-P1..P5 plus every owner-driven refinement: free-x docks, docked sizes, appearance inks, chip law, dock lines, chrome fixes) across real viewports, real storage shapes, and a real OS window, with every capture individually judged — the corrected A2-D060 standard.

**Architecture:** One scenario module defines four storage shapes as pure builders; one harness script sweeps scenario × viewport × state in a production preview build of the real extension, asserting programmatic invariants and capturing PNGs; a separate headed stage uses a REAL OS window at exact 1408x445 for interaction smoke; the executor then judges every capture individually into a QA report the owner reviews. Defects found are fixed under this packet's single fix cycle, TDD, and the affected sweep re-runs.

**Tech Stack:** Playwright (chromium channel, persistent context, `--load-extension`), Vite preview build, Node ESM scripts, the existing information-first connector fixtures.

**Spec:** `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md` (§2.1–2.6, §"Acceptance criteria" 1–7) under the corrected A2-D060 QA standard recorded in `docs/superpowers/aurora-2/STATUS.md` ("short-height desktop family including exact 1408x445, existing-layout-shaped storage scenarios, real non-emulated window witness, per-capture usefulness judgment").

## Global Constraints

- The protected checkout `D:\DEV\Chrome plugin` on `main` at `eb1354b` is read-only, always.
- No Chrome Web Store action of any kind (blocked pending W6-P5).
- The frozen legacy `layout` key is a recovery input: the QA flows must never write it (write-log harvested and asserted, same as every NL witness).
- QA artifacts are TRACKED under `docs/superpowers/qa/nl-p6/` (captures + report); scratch dirs (`.qa-nl-p6-*`) stay ignored.
- The harness builds the preview dist itself (`vite build --mode preview --outDir .qa-nl-p6-dist --emptyOutDir`) — never reuses a stale build.
- Every capture gets an individual verdict in the report; unjudged captures are a gate failure (the A2-D059 lesson).
- `npm test` (154 files), `npx tsc --noEmit`, and both existing witnesses (`preview-nl-p4.mjs`, `preview-nl-p5-hotfix.mjs`) must be green at the checkpoint.

---

### Task 1: Scenario module — the four storage shapes

**Files:**
- Create: `scripts/qa-nl-p6-scenarios.mjs`

**Interfaces:**
- Consumes: `seedInformationFirstFixtures` from `./information-first-fixtures.mjs` (existing; seeds the nine-connector configs/snapshots in-page) — Task 2 calls it for the `connectors` scenario only.
- Produces: `export const SCENARIOS: Array<{ id: string, note: string, seed: (page) => Promise<void> }>` where `seed` receives a Playwright page whose extension storage is already initialized (canvas selector present) and writes `chrome.storage.local` via `page.evaluate`.

The four shapes (spec §4 storage model + corrected-standard "existing-layout-shaped storage"):

1. `fresh` — post-init defaults only: no `layouts` document, no legacy layout content. Exercises the static default composition and the derived My layout.
2. `legacy-v1` — a V1-shaped `layout` key with user positions and NO `layouts` document: the migration-derivation path (`migrationSourceProfile` + `deriveMyLayout`). Seed (verbatim; the V1 shape is a flat `{ blockId: { x, y } }` percent map, the same shape `layoutV2FromLegacy` reads):

```js
await page.evaluate(async () => {
  await chrome.storage.local.set({
    layout: {
      clock: { x: 50, y: 22 },
      focus: { x: 50, y: 52 },
      quote: { x: 50, y: 84 },
      bookmarks: { x: 50, y: 4 },
    },
  })
})
```

3. `named-saved` — a saved v1 `layouts` document exercising EVERY placement kind and refinement at once: free (anchor+offset+tier+layer), docked with exact `x` and a stored docked `tier` (compact bookmarks marks), a legacy docked member with `align` only (compat read), a `hidden` widget, plus custom appearance inks:

```js
await page.evaluate(async () => {
  const { settings } = await chrome.storage.local.get('settings')
  await chrome.storage.local.set({
    settings: {
      ...settings,
      widgets: { ...settings.widgets, weather: true, monthCal: true, sun: true, moon: true, timer: true },
      panelColor: '#123a5e',
      widgetTextColor: '#e8f4ff',
      photoTextColor: null,
      photoClockColor: '#ffd9a0',
    },
    layouts: {
      version: 1,
      activeLayoutId: 'qa-main',
      layouts: [
        {
          id: 'qa-main',
          name: 'QA main',
          widgets: {
            clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -24, tier: 'full', layer: 0 },
            focus: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 8, tier: 'standard', layer: 1 },
            monthCal: { kind: 'free', anchor: 'left', offsetX: 9, offsetY: -2, tier: 'standard', layer: 2 },
            quote: { kind: 'hidden' },
            weather: { kind: 'docked', dock: 'bottom', order: 0, x: 30 },
            timer: { kind: 'docked', dock: 'bottom', order: 1, x: 70, align: 'end' },
            sun: { kind: 'docked', dock: 'top', order: 0, x: 12 },
            bookmarks: { kind: 'docked', dock: 'top', order: 1, x: 55, tier: 'compact' },
          },
        },
        { id: 'qa-alt', name: 'QA alt', widgets: {} },
      ],
    },
  })
})
```

4. `connectors` — the `named-saved` document PLUS `seedInformationFirstFixtures(page)` so all nine connector widgets carry real snapshot data (GitHub graph, Jira rows, dock lines with facts); connector widgets placed free at standard tier across the canvas and github docked at x 85.

- [ ] **Step 1: Write the module** with the four builders exactly as above (the `connectors` scenario composes shape 3's document with fixture seeding and adds `github: { kind: 'docked', dock: 'bottom', order: 2, x: 85 }` plus free `gitlab`/`jira`/`vercel` at `anchor: 'right', offsetX: -8`, offsets Y -20/0/20, tier 'standard', layers 3/4/5).
- [ ] **Step 2: Self-check by import** — `node -e "import('./scripts/qa-nl-p6-scenarios.mjs').then(m => console.log(m.SCENARIOS.map(s => s.id)))"` prints `[ 'fresh', 'legacy-v1', 'named-saved', 'connectors' ]`.
- [ ] **Step 3: Commit** — `git add scripts/qa-nl-p6-scenarios.mjs && git commit -m "test(qa): NL-P6 storage scenario module"`.

### Task 2: The sweep harness

**Files:**
- Create: `scripts/qa-nl-p6.mjs`
- Modify: `.gitignore` (add `.qa-nl-p6-*`)

**Interfaces:**
- Consumes: `SCENARIOS` from Task 1; the build/launch/write-log scaffolding pattern of `scripts/preview-nl-p5-hotfix.mjs` (copy its build block, context launch, `armWriteLog`/`harvestWrites`, evidence object, and PASS/FAIL tail verbatim, renaming paths to `.qa-nl-p6-dist` / `.playwright-profile-qa-nl-p6` / tracked outDir `docs/superpowers/qa/nl-p6`).
- Produces: `docs/superpowers/qa/nl-p6/<scenario>-<width>x<height>-<state>.png` captures, `evidence.json`, and a generated `QA-REPORT.md` skeleton with one row per capture and verdict `_pending_`.

**The matrix.** Viewports (12 — the common core plus the corrected standard's short-height desktop family, marked `short`):

```js
const VIEWPORTS = [
  { width: 1408, height: 445, family: 'short' },  // the owner's exact rejection window
  { width: 1024, height: 600, family: 'short' },
  { width: 1920, height: 550, family: 'short' },
  { width: 1280, height: 500, family: 'short' },
  { width: 1366, height: 768, family: 'common' },
  { width: 1600, height: 900, family: 'common' },
  { width: 1920, height: 1080, family: 'common' },
  { width: 2560, height: 1440, family: 'common' },
  { width: 3440, height: 1440, family: 'wide' },
  { width: 720, height: 900, family: 'boundary' }, // bookmarks compact-media boundary
  { width: 599, height: 800, family: 'floor' },    // below the 600 narrow floor: mechanical stack
  { width: 600, height: 800, family: 'floor' },    // exactly at the floor: anchored
]
```

States per scenario × viewport: `normal` (plain view) and `edit` (session opened via keyboard chord `Control+Shift+E`, capture, then Escape). The `connectors` and `named-saved` scenarios ADD state `hover-dock` at 1408x445 and 1600x900 only: hover the first bottom-dock member, capture (grip/gear visible proof).

**Programmatic invariants asserted at EVERY cell (each failure recorded with its cell id):**

```js
async function assertInvariants(page, cell, fail) {
  const truth = await page.evaluate(() => {
    const doc = document.documentElement
    const surface = document.querySelector('[data-canvas-surface]')
    const items = [...document.querySelectorAll('[data-block-id]')]
    const zero = items.filter((n) => {
      const r = n.getBoundingClientRect()
      return (r.width < 4 || r.height < 4) && !n.closest('[data-canvas-narrow]')
    }).map((n) => n.getAttribute('data-block-id'))
    const offscreen = items.filter((n) => {
      const r = n.getBoundingClientRect()
      return r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight
    }).map((n) => n.getAttribute('data-block-id'))
    const gear = document.querySelector('button[aria-label="Open settings"]')
    const gearRect = gear?.getBoundingClientRect()
    const gearHit = gearRect
      ? document.elementFromPoint(gearRect.left + gearRect.width / 2, gearRect.top + gearRect.height / 2)?.closest('button') === gear
      : false
    return {
      hOverflow: doc.scrollWidth > doc.clientWidth,
      surfacePresent: Boolean(surface),
      zero,
      offscreen,
      gearHit,
    }
  })
  if (truth.hOverflow) fail(`${cell}: horizontal page overflow`)
  if (!truth.surfacePresent) fail(`${cell}: canvas surface missing`)
  if (truth.zero.length) fail(`${cell}: degenerate widgets ${truth.zero.join(',')}`)
  if (truth.offscreen.length) fail(`${cell}: fully offscreen widgets ${truth.offscreen.join(',')}`)
  if (!truth.gearHit) fail(`${cell}: settings gear not hit-testable`)
}
```

Plus per-scenario checks after seeding (once, at 1600x900): `named-saved` — hidden quote absent, docked weather center-x within 3% of 30% of the strip, bookmarks strip bar rendering monograms (`[data-bookmark-mark="monogram"]` visible) — bookmarks permission is unavailable in the harness profile, so this sub-check runs only when `chrome.bookmarks` exists and three bar bookmarks were created (same guard as witness stage 9); `legacy-v1` — clock renders within 4% of the stored V1 y; `connectors` — github dock line text matches `/PR|issue|clear/i`. Write-log: every write across the run ∈ {seed keys}; NEVER `layout` after seeding (the legacy seed writes it ONCE by design; the assertion is: no write containing `layout` after the scenario's own seed completes).

- [ ] **Step 1: Write the harness** (scaffolding from `preview-nl-p5-hotfix.mjs`, matrix loop, invariants, per-scenario checks, capture naming, evidence + report skeleton emit; report rows: `| capture | scenario | viewport | state | verdict |`).
- [ ] **Step 2: Add `.qa-nl-p6-*` to `.gitignore`.**
- [ ] **Step 3: Run** — `node scripts/qa-nl-p6.mjs`. Expected: `PASS`-tail with `failures: []` OR a real defect list; ~104 captures in `docs/superpowers/qa/nl-p6/`. A failure here IS the packet working — record, do not paper over.
- [ ] **Step 4: Commit** — `git add scripts/qa-nl-p6.mjs .gitignore docs/superpowers/qa/nl-p6 && git commit -m "test(qa): NL-P6 sweep harness and first evidence"`.

### Task 3: Real-window witness at exact 1408x445

**Files:**
- Create: `scripts/qa-nl-p6-window.mjs`

**Interfaces:**
- Consumes: Task 1's `SCENARIOS` (uses `named-saved` only); the same build block (may reuse `.qa-nl-p6-dist` if present, else builds).
- Produces: `docs/superpowers/qa/nl-p6/window-1408x445-*.png` (3 captures) + its own `window-evidence.json`.

The corrected standard demands a REAL window, not viewport emulation: launch headed with `args: ['--window-size=1424,532']` and `viewport: null` (Playwright then uses the OS window's real inner size; 1424x532 outer ≈ 1408x445 inner on Windows 11 chrome — the script MEASURES `window.innerWidth/innerHeight` and asserts 1380 ≤ width ≤ 1430, 420 ≤ height ≤ 470, recording the exact values in evidence rather than trusting the request). Interaction smoke in that window, all on the `named-saved` scenario: (1) drag the free `focus` widget by grip 200px right, assert it moved and the overlap note is absent when nothing overlaps; (2) drag `weather` out of the bottom dock onto the canvas and back to x≈50%, assert re-docked near center; (3) Save, reload, assert the document round-tripped (weather x within 2 of 50); (4) Escape/cancel path on a second edit leaves storage untouched (write-log).

- [ ] **Step 1: Write the script** (headed launch, measurement assertion, the four interactions with the same mouse mechanics as `preview-nl-p5-hotfix.mjs` stages 6–7, three captures: settled, mid-drag, after-reload).
- [ ] **Step 2: Run** — `node scripts/qa-nl-p6-window.mjs`. Expected: PASS, measured inner size recorded.
- [ ] **Step 3: Commit** — `git add scripts/qa-nl-p6-window.mjs docs/superpowers/qa/nl-p6 && git commit -m "test(qa): NL-P6 real-window witness"`.

### Task 4: Per-capture judgment and the QA report

**Files:**
- Modify: `docs/superpowers/qa/nl-p6/QA-REPORT.md` (fill every `_pending_` verdict)
- Create: none

**Interfaces:**
- Consumes: every PNG from Tasks 2–3.
- Produces: the completed report the owner reviews: per-capture verdict (`useful` / `defect: <description>`), a Findings section listing every defect with severity (Critical = broken/unusable, Important = wrong but usable, Minor = cosmetic), and a Fixes section mapping findings to commits.

Judgment standard (the A2-D060 lesson, verbatim intent): a capture passes only if the composition is USEFUL at that size — information-first, no phone-document-on-desktop, no clipped/overlapping unusable widgets, docks legible, text tiers honest. "Renders without error" is NOT a pass.

- [ ] **Step 1: Read every capture individually** (batches of ~9 via the Read tool), recording a verdict per capture in the report as each batch is judged. No capture may remain `_pending_`.
- [ ] **Step 2: For each Critical or Important finding — the packet's fix cycle:** write the failing test first (unit where the defect is model/CSS; harness assertion where it is geometric), fix, rerun the affected sweep cells, update the capture + verdict, commit each fix separately (`fix(qa): <finding>`).
- [ ] **Step 3: Re-run the full sweep once after all fixes** — `node scripts/qa-nl-p6.mjs` green, plus `npm test` and `npx tsc --noEmit` green.
- [ ] **Step 4: Commit the completed report** — `git commit -m "docs: NL-P6 QA report with per-capture verdicts"`.

### Task 5: Review, ledger, checkpoint, owner gate

**Files:**
- Modify: `docs/superpowers/aurora-2/STATUS.md`

- [ ] **Step 1: Bounded packet review** (one review + at most one fix/rereview cycle, the standing packet discipline): verify the harness asserts what the report claims, the write-log rule held, no capture is unjudged, and the fix commits carry observed-RED tests.
- [ ] **Step 2: Ledger** — add the NL-P6 evidence paragraph to STATUS.md (matrix size, findings count by severity, fixes, real-window measurement, remaining debt).
- [ ] **Step 3: Checkpoint** — `git add -A && git commit -m "docs: checkpoint NL-P6 product QA" && git push origin feat/aurora-2-observatory`; repository proof (worktree clean, protected checkout untouched at `eb1354b`).
- [ ] **Step 4: STOP — owner gate.** Present the report, the findings, and the key captures (1408x445 family first) for the owner's accept/reject. NL-P7 does not begin before acceptance.

## Self-Review

- Spec coverage: §2.1 badge/switcher (edit state captures + window witness save/cancel), §2.2 anchors/narrow floor (599/600 cells), §2.3 tiers/docked sizes (named-saved bookmarks compact marks, clock full), §2.4 docks/free-x (dock cells + window witness re-dock), §2.5 edit mode (edit state + interactions), §2.6 expandable placement (weather docked + free across cells); corrected standard: short family ✓ (4 viewports incl. exact 1408x445), existing-layout storage ✓ (legacy-v1 + named-saved), real window ✓ (Task 3), per-capture judgment ✓ (Task 4, no `_pending_` rule). Appearance inks ✓ (named-saved custom inks render across every cell).
- Placeholders: none — seeds, matrix, and invariant code are given verbatim; the two scripts reuse the named existing scaffolding by explicit reference.
- Type consistency: scenario `seed(page)` signature consistent across Tasks 1–3; capture naming `<scenario>-<w>x<h>-<state>.png` consistent between Tasks 2 and 4.
