# Responsive Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default widget placement becomes flowing rails — a left zone, a right zone, and a bounded center column — so the board reflows cleanly at EVERY window size and widget overlap becomes impossible by construction. Kills the pinned-coordinate system, the 1593px hide, and the per-viewport floor-patching era. Wrapped at v1.7.0.

**Jon's brief (2026-08-09, verbatim — the spec):** "I've noticed at different browser sizes the widgets just stay in place so whenever I resize it can look great or terrible. That is a little disappointing." Jon chose the rails rebuild over patching, explicitly.

**Architecture:** The eight data widgets (calendar/ics, RSS, vercel, monthCal, habits, github, gitlab, jira) render at DEFAULT placement as static flow children inside fixed rail containers (`flex flex-col gap-4`), not as individually-pinned `fixed` elements. The left zone holds up to two columns gated by a CONTAINER QUERY on the zone's own width (structural — replaces the magic 1593 media query). The center column (clock/greeting/focus/search/launcher) gets a real max-width bound so its text can never escape into the zones — retiring the greeting cap machinery. Arranged (user-dragged) widgets keep the existing percent-center `fixed` path untouched: your layout, your pixels; Reset returns to flow.

**Tech Stack:** unchanged. Tailwind 4 container queries (`@container`) — native, no plugin, no new deps.

## Global Constraints

- Canvas identity untouched: clock/greeting/search/focus/launcher/quote stay VIEWPORT-centered visually (the center column is centered; its new max-width must not shift its visual center). Crypto strip + quote + all peripherals (timer pill, weather chip+panel, notes/tasks pills, gear, refresh, bookmarks band) keep their current placement this phase — rails cover the eight data widgets only.
- NO scroll regions, NO mid-widget clipping: when a rail cannot fit its stack at short viewport heights, whole widgets hide via the existing height variants (`short:` ≤600h, `xshort:` ≤450h) in a documented priority order (lowest priority hides first, per-widget classes, CSS-only). The plan's implementer measures the height budgets and pins the priority; the harness proves it.
- Arrange-mode interop is load-bearing: long-press drag must still work FROM a rail (static) position (the engine reads getBoundingClientRect — verify); a dragged widget leaves the rail (arranged branch renders it fixed; the rail must NOT double-render it); Reset layout returns it to flow. Probes required for all three.
- All standing bars: solid surfaces, control kit tokens, a11y, TS strict single documented casts, comments state constraints, quantified assertions with forced worst states (the forced-wide clock stays the center column's width driver), `build:preview` before every harness run, no new deps.
- The resize complaint gets its own probe class: ONE page driven through a size sequence (1600×900 → 1536×864 → 1420×900 → 1280×800 → 1024×768 → 800×450 → back up), asserting after each step: zero pairwise overlaps among visible widgets+peripherals, rails within their zones, no console errors. This is the falsifier for Jon's actual complaint and must survive every future phase.
- Schema untouched (arranged layout storage unchanged; no new keys). Store discipline: v1.2.1 verdict still gates; v1.7.0 zip staged.
- Verification per task: tsc + full test + build (+ build:preview + full preview where stated), ALL PASS 0 FAIL, no console errors. Version stays 1.6.0 until Task 66 bumps 1.7.0.

## Interfaces consumed (main at `7e0ba08`)

```
src/newtab/components/PositionedBlock.tsx — default branch renders className'd FIXED div; arranged branch renders className-less fixed at percent centers. The default branch becomes a STATIC flow child (the core refactor); arranged branch untouched.
src/newtab/App.tsx — the eight data widgets' PositionedBlocks with pinned classes (incl. max-[1593px]:hidden on monthCal/habits — DIES); the center column stack; peripherals.
src/newtab/components/Greeting.tsx — the min-[1593px] viewport cap (DIES once the center column is bounded; the [721,899) and compact tiers stay).
src/newtab/arrange/ — ArrangeController/engine (percent-center storage, drag, Reset). Read before touching anything.
scripts/preview.mjs — the placement floor probes for rail widgets (REPLACED by structural sweeps), the forced-wide clock probe (KEPT, now drives the center column width), combined-defaults gate (KEPT, re-based on rails), per-widget isolated blocks (placement assertions replaced; content/interaction assertions KEPT).
Height variants short:/xshort: in src/newtab/index.css; container queries via Tailwind 4 @container.
```

---

### Task 64: The rail system — containers, static default branch, zone queries

**Files:**
- Modify: `src/newtab/components/PositionedBlock.tsx`, `src/newtab/App.tsx`, `src/newtab/components/Greeting.tsx`, `src/newtab/index.css` (zone/container tokens if needed)
- Test: `src/newtab/components/PositionedBlock.test.tsx`, `src/newtab/App.test.tsx` (extend), affected widget tests (mechanical placement-class updates only)

**Interfaces:**
- Zones: `<aside data-zone="left">` and `<aside data-zone="right">` — `fixed` containers spanning from below the top band (`--top-band` token) to above the bottom pills (measure the safe bottom), pinned to their edges with the house 32px margin, `container-type: inline-size`. Zone width: `calc((100vw - var(--center-reserve)) / 2 - 3rem)` where `--center-reserve` = the forced-wide center column's measured worst width + 2×16px breathing (the wide clock 425px governs today — MEASURE, define the token once in index.css with the derivation comment).
- Left zone content: a `flex flex-row gap-4 items-start` of column stacks. Column 1 (priority order): calendar/ics, RSS, vercel. Column 2: monthCal, habits. Column 2 renders only `@container (min-width: <measured>)` — the measured minimum = col1 width + gap + col2 width; BY CONSTRUCTION this reproduces the old 1593 behavior structurally (assert the boundary still lands ≈1593 in the harness, then the magic number lives nowhere in source).
- Right zone: one column — github, gitlab, jira.
- Height discipline: `short:` hides (per-widget classes, priority documented in App.tsx comment): left col1 keeps calendar+RSS, hides vercel on short, RSS shrinks per its existing tiers; col2 hides entirely on short; right keeps github, hides jira on short, gitlab on xshort. (IMPLEMENTER: measure real budgets at 600/450h with worst-case fixtures and ADJUST this starting allocation — the mechanism and documented priority are binding, the exact assignments are measured.)
- PositionedBlock default branch: renders a STATIC div (no fixed, no positioning classes — width/spacing classes only) so the rail flows it; arranged branch byte-identical to today. The `data-block-id` stays on both. Widgets' own `w-*` roots unchanged.
- Center column: the existing centered stack gets `max-w-[var(--center-reserve)] mx-auto` (verify visual center unchanged — it's symmetric); Greeting's `min-[1593px]:max-w-…` term DIES (bounded by the column now); its [721,899) + compact tiers stay untouched.
- monthCal/habits `max-[1593px]:hidden` DIES (container query replaces).
- [ ] **Step 1: Failing PositionedBlock tests** — default branch renders WITHOUT position:fixed (static child); arranged branch still fixed at percent style; className passthrough semantics per branch.
- [ ] **Step 2: Implement PositionedBlock, green.**
- [ ] **Step 3: App restructure** — zones + column stacks + center bound; every existing App/widget test passes with only mechanical placement-class query updates (a test needing MORE = stop and reconsider).
- [ ] **Step 4: Greeting cap retirement** (the min-[1593px] term only) + its test update.
- [ ] **Step 5: Smoke the arrange interop in jsdom where testable** (arranged widget not double-rendered in a rail: App test asserting a block with stored pos appears ONCE, fixed).
- [ ] **Step 6: Full suite + build. Commit + push** — `feat: responsive rails — default layout flows, arranged pixels stay yours`.

---

### Task 65: The harness rebuild — structural sweeps + the resize probe

**Files:**
- Modify: `scripts/preview.mjs`
- (No src changes expected; any layout defect found = fix in the same task with measurement, documented.)

- [ ] **Step 1: Replace rail-widget placement floors** with structural assertions: rails-within-zones (each rail widget's rect inside its zone rect, gap-4 rhythm spot-asserted), zone-vs-center clearance ≥16 at the FORCED-WIDE clock (kept probe), container-query boundary lands where measured (col2 visible/hidden either side of it — the old 1593 probes retarget to the structural boundary).
- [ ] **Step 2: THE RESIZE SWEEP** (Jon's complaint falsifier): one page, all widgets enabled at display maxes (reuse combined-gate fixtures), driven 1600×900 → 1536×864 → 1420×900 → 1280×800 → 1024×768 → 800×450 → 1600×900; after EACH step: pairwise non-overlap among all VISIBLE widgets+peripherals (found-required for expected-visible; hidden ones asserted hidden per the height/width priority), no console errors; capture at 1536×864 and 1280×800 (`rails-1536.png`, `rails-1280.png`).
- [ ] **Step 3: Arrange interop probes** — long-press a rail widget → drag → it renders fixed at the drop point while the rail closes the gap (remaining rail widgets reflow — assert a sibling moved up); reload → persists; Reset layout → back in the rail flow (rect matches the rail slot).
- [ ] **Step 4: Combined gate re-base** — the 190-pair sweep now runs on the rails layout; per-widget isolated blocks keep content/interaction probes, drop dead floor assertions (audit every one — KEEP anything asserting vs peripherals the rails don't govern).
- [ ] **Step 5: Full suite + build + build:preview + FULL preview — ALL PASS 0 FAIL (report exact counts + the measured container boundary). Controller reviews rails captures at every swept size.**
- [ ] **Step 6: Commit + push** — `test: the board proves itself at every size — resize sweep and structural rails probes`.

---

### Task 66: Wrap — docs, v1.7.0, full pass

- [ ] **Step 1: Docs** — README: a line on the reflowing layout (defaults adapt to any window; drag to pin, Reset to reflow); store-listing STAGED v1.7.0 addendum (chronological, minimal shape).
- [ ] **Step 2: Version 1.7.0** both files + lockfile; `npm run package` → aurora-1.7.0.zip guards green (STAGED — v1.2.1 verdict check first, STOP if landed).
- [ ] **Step 3: Full verify** — suite, build, build:preview, FULL preview, controller full visual pass (all swept sizes + drawer tabs + panels).
- [ ] **Step 4: Commit + push** — `feat: v1.7.0 — the board reflows`.

## After Task 66

Fable whole-plan review (base `7e0ba08`, head Task 66; ledger minors triaged; special charge: resize-sweep integrity + arrange interop + anything the rails change breaks that per-task reviews missed), ONE fix wave + ONE scoped re-review if needed, report to Jon with resize captures, Confluence + memory sync (the pinned-coordinate lessons become historical; the rails mechanism is the new law), SDD workspace deleted.

## Out of scope

Arrange-mode redesign (reorder-within-rail semantics — future candidate; free-drag stays); crypto/quote/peripheral railification; per-widget color; SP3 OAuth; the polish-roadmap deferred items (drawer frost etc.).
