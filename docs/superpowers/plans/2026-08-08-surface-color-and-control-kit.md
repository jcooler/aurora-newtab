# Surface Color + Control Kit (UI Polish Phase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the three-theme system in favor of one refined default (Aurora's type/accent + Mono's neutral panel surface) with a live widget-color customizer, and elevate every control and panel to premium fit-and-finish — sliding switches, a coherent control kit, polished Settings/Tasks/Notes/Timer. Jon's bar, verbatim: "It needs to look like a $10,000 chrome extension."

**Architecture:** One token set at `:root` (themes.css collapses); `settings.panelColor` (hex | null) re-tints `--panel-solid`/`--panel` at runtime with luminance-derived `--fg`/`--fg-muted` so any pick stays readable. A shared control kit (`Switch`, styled select/input/button classes) replaces every checkbox and ad-hoc control. Schema v8 strips `theme`, adds `panelColor`.

**Tech Stack:** unchanged (React 19 + TS strict + Tailwind 4 + Vitest 3 + Playwright harness). NO new deps — the color picker is the native `<input type="color">` behind a styled swatch.

**Jon's brief (2026-08-08, verbatim excerpts — the spec):** "apply the mono widget color to the aurora theme and get rid of the themes altogether … ability to just change the background color of the widgets via color selector or something and a reset to default … Toggles should be like selectors that slide off and on … way more styling with tasks and settings and all of that … $10,000 chrome extension."

## Global Constraints

- All standing bars bind: solid-surface ruling (bg-panel-solid everywhere on-page; drawer frosted), placement floors (probe-logged; surface work must not move geometry — assert key rects unchanged where touched), interaction probes at every visual gate (cursor discipline, hit targets, real clicks), a11y non-negotiable (`role="switch"` + aria-checked + Space/Enter + label association + focus-visible; motion-reduce on every animation), TS strict single documented casts, comments state constraints, no placeholder UI, empty ≠ placeholder with in-voice copy.
- `color-scheme: dark` must SURVIVE the themes.css collapse (memory-baked gotcha: native select popups go white-on-white without it). EXCEPTION: if the user picks a LIGHT panel color, native selects inside panels… selects live in the drawer (frosted, derived from panelColor) — set `color-scheme` dynamically light/dark with the luminance flip, tested in the harness via computed styles.
- Contrast: derived `--fg` flips at relative luminance ≈ 0.45 (pure function, TDD: black→white text, white→near-black text, mid-grays both sides, the WCAG relative-luminance formula implemented exactly); `--fg-muted` = fg at reduced alpha. Accent (`--accent`) and danger red unchanged by panelColor.
- The customizer writes through `storage.update('settings', …)` debounced ~150ms during drag (the `input` event), final on `change`; deep-equal discipline (same color re-picked = no event storm).
- Migration: schema v8 — `migrations[7]` strips `settings.theme` (searchEngine-strip precedent, migrations[3]) and backfills `settings.panelColor: null`; nested-key rule honored (this IS a nested settings change → explicit step; the WidgetToggles doc-comment rule pattern applies — document on the Settings type). Backup: theme dropped on import of old backups (cleaning), panelColor validated as `null | /^#[0-9a-f]{6}$/i`.
- Harness/store-shots: the THEME LOOP DIES in both scripts — replaced per Task 60's steps. Every capture regenerates; controller reviews personally. `npm run build:preview` before every harness run.
- Verification per task: tsc + full test + build (+ build:preview + full preview where stated), zero FAIL, no console errors. Version stays 1.5.0 until Task 63 bumps 1.6.0. Store discipline: v1.2.1 verdict still gates submissions; zip staged.

## Interfaces consumed (main at `79355d6`)

```
src/theme/themes.css — :root + [data-theme] blocks (aurora/glass/mono tokens: --panel, --panel-solid, --fg, --fg-muted, --accent, --panel-border, --panel-blur, --danger?) — READ FIRST; the collapse must carry EVERY token some component consumes (grep var(-- usage).
src/lib/storage/schema.ts — Settings.theme: 'aurora'|'glass'|'mono'; CURRENT_VERSION = 7; the WidgetToggles bump-rule comment (the pattern to follow).
src/settings/sections/General.tsx — the theme radiogroup (dies; the color row replaces it).
scripts/preview.mjs — theme loop (~L506 openSettingsTab('General') + Aurora/Glass/Mono radio clicks + drawer-{aurora,glass,mono}.png) and scripts/store-shots.mjs theme section.
Checkbox inventory: grep `type="checkbox"` in src/ — General (24-hour, mute), Widgets toggles, Connectors enable toggles, anything else found.
Todo/Notes/Timer panels: src/newtab/widgets/todo/TodoPanel.tsx, notes/NotesPanel.tsx, timer/TimerWidget.tsx panel.
```

---

### Task 60: One surface — theme collapse, panelColor engine, schema v8

**Files:**
- Modify: `src/theme/themes.css`, `src/lib/storage/schema.ts`, `src/lib/storage/migrations.ts`, `src/lib/backup.ts`, `src/settings/sections/General.tsx`, `src/newtab/App.tsx` (or wherever data-theme is stamped — find it), `scripts/preview.mjs`, `scripts/store-shots.mjs`
- Create: `src/lib/color.ts`, `src/lib/color.test.ts` (pure: `relativeLuminance(hex)`, `derivedFg(hex): { fg: string; fgMuted: string; scheme: 'light' | 'dark' }`, `isPanelColor(v): v is string` for `#rrggbb`)
- Test: `src/lib/storage/migrations.test.ts`, `src/lib/backup.test.ts`, `src/settings/SettingsPanel.test.tsx` (theme radiogroup tests die; color-row tests replace them)

**Interfaces:**
- themes.css → one `:root` block: Aurora's `--accent`/type-related tokens + **Mono's** `--panel-solid`/`--panel`/`--panel-border` values verbatim (read Mono's block; those exact values are the new default). `[data-theme]` blocks deleted; the data-theme stamping code deleted. `color-scheme: dark` stays at root; a `[data-scheme="light"]` override flips it (stamped by the engine when derivedFg says light).
- Engine (small module or in App): on settings load/change, if `panelColor` non-null → set inline CSS vars on `document.documentElement`: `--panel-solid` (panelColor at the default's alpha — decide: panelColor IS the full rgba? Ruling: store hex; apply as `--panel-solid: {hex}F2` (95%) and `--panel: {hex}` + existing frost alpha, matching the default token STRUCTURE), `--fg`/`--fg-muted`/scheme from `derivedFg`. Null → remove overrides (defaults win). Pure helper `applyPanelColor(el, hex | null)` exported + unit-tested (jsdom asserts style props).
- General.tsx: theme radiogroup replaced by a "Widget color" row: circular swatch (28px, shows current effective color, ring on focus) wrapping a visually-hidden native `<input type="color">` (label-associated, keyboard reachable); a quiet "Reset" button rendered only when panelColor ≠ null. Drag = live re-tint (debounced write); the row carries a one-line hint `Tints every widget. Text adapts automatically.`
- Schema v8: `Settings.panelColor: string | null`; `theme` REMOVED from the type; `migrations[7]` strips theme + backfills panelColor null; CURRENT_VERSION = 8; doc-comment on Settings mirroring the WidgetToggles rule. Backup: old-backup theme key dropped in cleaning; panelColor validated (`null` or #rrggbb, else reject that key per structural convention).

- [ ] **Step 1: Failing color.ts tests** — WCAG relative luminance exact (linearized channels; test #000000→0, #ffffff→1, #808080≈0.216); derivedFg flips at the 0.45 threshold (dark hex → light fg + scheme dark; #f5f5f5 → near-black fg + scheme light; both sides of threshold); isPanelColor (#AbC123 ok case-insensitive, #fff rejected, garbage rejected, null NOT a panelColor string).
- [ ] **Step 2: Implement color.ts, green.**
- [ ] **Step 3: Failing migration/backup tests** — v7→v8 strips theme (a stored 'glass' vanishes) + backfills panelColor null; v1→v8 chain; registry order [0..7]; backup import of a v7 payload with theme imports cleanly (theme gone after); panelColor '#12ab34' round-trips; 'red' rejects the settings key.
- [ ] **Step 4: Implement schema v8 + engine + themes.css collapse + General row, green.** Every `var(--…)` consumer still resolves (grep + tsc + a render smoke test); data-theme stamping removed.
- [ ] **Step 5: Harness + store-shots surgery.** preview.mjs: theme loop → widget-color block: capture `drawer-general.png` (new row visible); set a custom color via the hidden input (`page.fill`/dispatch input), assert a bookmarks chip's computed background matches, capture `widget-color-custom.png`; pick a LIGHT color, assert derived fg flips (computed color on chip text) + `[data-scheme="light"]` stamped, capture `widget-color-light.png`; click Reset, assert default restored + panelColor null in storage. store-shots.mjs: theme section → single default pass (its three theme shots die; keep shot count/policy sane — read its header comment for listing needs). Full preview run: ALL PASS, 0 FAIL, no console errors (expect assertion-count DELTA from dead theme probes — report exact).
- [ ] **Step 6: Full suite + build + build:preview + preview. Commit + push** — `feat: one surface — themes collapse into a live widget-color customizer`.

---

### Task 61: The control kit — Switch everywhere, inputs, selects, buttons, Settings rhythm

**Files:**
- Create: `src/components/Switch.tsx`, `src/components/Switch.test.tsx` (shared location — check if src/components exists; else src/settings/Switch.tsx with a comment on shared intent)
- Modify: every checkbox site (grep `type="checkbox"`): `src/settings/sections/General.tsx`, `Widgets.tsx`, `Connectors.tsx` (enable toggles), + any others found; `src/settings/sections/*.tsx` control styling (selects, text inputs, buttons); `src/settings/Drawer.tsx`/section wrappers for rhythm; `scripts/preview.mjs`
- Test: `src/settings/SettingsPanel.test.tsx` (checkbox queries → switch queries — mechanical role swap, NO assertion deleted)

**Interfaces:**
- `Switch({ id, checked, onChange, label?, disabled? })`: `<button role="switch" aria-checked>` — track 36×20 rounded-full (`bg-white/15` off → `bg-accent` on), thumb 16px `translate-x` slide, `transition-transform duration-150 cubic-bezier(.34,1.3,.64,1)` (slight overshoot — the signature micro-interaction), `motion-reduce:transition-none`; focus-visible ring; label click toggles (label htmlFor or wrapping); Space/Enter native button semantics; cursor-pointer; disabled state dimmed + aria-disabled.
- Every checkbox becomes a Switch — SEMANTICS PRESERVED: same storage writes, same gating (e.g. bookmarks toggle's permission gesture: `ensureBookmarksPermission` must remain the FIRST await in the switch's activation — re-trace after conversion, jsdom can't catch it).
- Control styling pass (Settings-wide, one language): text inputs/selects h-8 rounded-lg bg-white/5 border-white/10 focus ring-accent, consistent px; selects `appearance-none` + inline chevron (SVG mask or background-image data-URI — no new deps); buttons: primary (accent fill), quiet (transparent, hover bg-white/5), danger (existing red, unchanged); section headers become eyebrows (text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted) with consistent 24px section gap and hairline dividers; row grid label-left control-right at h-8 rhythm.
- [ ] **Step 1: Failing Switch tests** — role/aria-checked both states; click + Space + Enter toggle via onChange; label association (click label → onChange); disabled inert; focus-visible class present; motion-reduce class present.
- [ ] **Step 2: Implement Switch, green.**
- [ ] **Step 3: Convert every checkbox site** (test file updated mechanically: `getByLabelText(...)` still works via label association — verify each pre-existing behavior test passes with at most a role-query change; bookmarks-permission gesture re-traced and stated in the report).
- [ ] **Step 4: Settings styling pass** (inputs/selects/buttons/eyebrows/rhythm). Screenshot-judge every drawer tab yourself before finishing (harness captures), against "would a designer ship this".
- [ ] **Step 5: Harness** — probes: a real click on a Switch flips aria-checked AND the stored value (pick the 24-hour toggle: assert clock format changes — end-to-end); cursor-pointer on switch; drawer captures regenerate (all four tabs); the settings interaction probes that clicked checkboxes retarget to switches (audit every drawer-touching selector — Task-40 precedent). Full preview: ALL PASS, 0 FAIL.
- [ ] **Step 6: Full suite + build + build:preview + preview. Commit + push** — `feat: the control kit — switches, unified inputs, settings rhythm`.

---

### Task 62: Panels at the bar — Tasks, Notes, Timer polish

**Files:**
- Modify: `src/newtab/widgets/todo/TodoPanel.tsx` (+test), `src/newtab/widgets/notes/NotesPanel.tsx` (+test), `src/newtab/widgets/timer/TimerWidget.tsx` (+test), `scripts/preview.mjs`

**Interfaces (the concept-image language, Jon-approved imagery):**
- TodoPanel: round check controls (20px circle, hairline border, accent fill + white check glyph when done — button role, aria-pressed or checkbox role, consistent with Switch a11y), row hover bg-white/5, done rows text-fg-muted line-through, the add row = quiet inline input + accent "Add" text-button, footer quiet actions ("Clear done" · "Delete list") separated by hairline, panel header (title + count chip). Empty state: `Nothing yet — add your first task.`
- NotesPanel: header consistency, textarea styling (transparent, comfortable leading, placeholder in-voice), autosave hint (`Saved` quiet flash on debounce commit — no new machinery beyond a state).
- Timer panel: digits in the display face (Space Grotesk per Clock), control buttons on the kit language (primary start/pause, quiet reset), progress treatment refined.
- NO behavior changes: focus traps, Escape ordering, reducers, storage writes all untouched (tests must pass with only styling-related query updates; a test needing MORE = stop and reconsider).
- [ ] **Step 1-3: Per-panel styling passes** (todo → notes → timer), each: restyle, run its suite, screenshot-judge.
- [ ] **Step 4: Harness** — panel captures regenerate (todo-panel/notes-panel/timer-panel.png); the round-check interaction probe: click a task's check → storage reflects done; the panel-occlusion probes still pass (surface classes unchanged where asserted). Full preview: ALL PASS, 0 FAIL.
- [ ] **Step 5: Full suite + build + build:preview + preview. Commit + push** — `feat: tasks, notes and timer at the new bar`.

---

### Task 63: Wrap — docs, v1.6.0, full pass

- [ ] **Step 1: Docs** — README: themes section → widget-color section (honest: one default, any color, adaptive text); PRIVACY: check whether it mentions themes anywhere (grep; update the storage list line if `theme` named); store-listing STAGED delta notes the change.
- [ ] **Step 2: Version 1.6.0** both files + lockfile; `npm run package` → aurora-1.6.0.zip guards green (STAGED).
- [ ] **Step 3: Full verify** — suite, build, build:preview, FULL preview (every capture regenerated, all PASS), controller full visual pass (all four drawer tabs, all panels, widget-color custom/light/reset, combined all-on board).
- [ ] **Step 4: Commit + push** — `feat: v1.6.0 — one surface, your color, a real control kit`.

## After Task 63

Fable whole-plan review (base `79355d6`, head Task 63; ledger minors triaged), ONE fix wave + ONE scoped re-review if needed, report to Jon with captures, AUR board note + Confluence, memory update (themes-dead invalidates old theme-specific memory lines — sweep them), SDD workspace deleted.

## Out of scope

Crypto strip backgrounding (open Jon question); arrange-mode UI changes; new widgets; per-widget individual colors (ONE global color this phase — note as future if Jon asks); light-photo legibility work beyond the derived-fg flip and the fixed canvas-fg split (landed in Task 60's fix round — photo-floating text keeps fixed light ink via `--canvas-fg`/`--canvas-fg-muted` while panels adapt; deeper work like per-region scrims remains out).
