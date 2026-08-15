# W2-P3 Settings and Tool Reflow Implementation Plan

> Execute this packet only. Use subagent-driven development, TDD, independent review, and verification-before-completion. Preserve Aurora V1 and every Wave 1/W2-P1/W2-P2 authority.

**Goal:** Make the current Settings drawer, anchored working tools, and current dialogs/popovers reflow without horizontal clipping at 320 CSS px and remain reachable in a short 320 CSS px-wide viewport representative of 400% reflow.

**Architecture:** Keep the present modal Settings drawer and current tool surfaces. Add bounded responsive layout rules, a pure viewport-fit calculation plus one shared open-panel resize owner, and scrollports only on the surface that owns overflowing content. Do not introduce Adaptive Stage, a Utility Tray shell, a new Settings information architecture, root zoom/transforms, or browser/user-agent detection.

**Starting checkpoint:** `5c01b21442a2c4712e5ef8f7577120b2d3f9755f`

**Expected browser baseline:** 453 PASS / 0 FAIL / 3 SKIP.

**Expected final browser result:** 454 PASS / 0 FAIL / 3 SKIP, exactly one `PASS: W2-P3 settings and tool reflow semantics`, and zero named W2-P3 FAIL.

## Frozen packet contract

### Acceptance

- The page/body and every active Settings/tool/dialog/popover surface have no horizontal overflow at 320 CSS px.
- All labels, inputs, actions, error/status text, and first/last controls remain reachable by keyboard and scrolling where vertical scroll is required.
- Settings preserves its four-tab APG contract and active-panel semantics while reflowing current content. It does not become the W5-P3 workspace or gain vertical navigation.
- Notes, Tasks, and Timer fit within an 8 CSS px viewport gutter, preserve focus/Escape/restoration semantics, and recompute from the current invoker and current rendered panel box when viewport or content size changes.
- Home Assistant picker, Palette, Weather location suggestions, FolderPopover, and Reset dialog fit the viewport and expose one owned vertical scrollport when content cannot fit.
- At the narrow/short acceptance viewports, the exact Settings/tool/dialog/popover controls enumerated below own at least a 36 by 36 CSS px target. Ordinary-size legacy targets not touched by this packet remain for W5-P4 broad convergence.
- Standard and large layouts remain visually and behaviorally unchanged except for inert responsive classes and the resize-safe panel owner.

### Truth boundary for zoom

- A 320 CSS px viewport is authoritative automated reflow evidence, including a 320x180 short viewport representing the CSS space available from a 1280x720 display at 400%.
- Do not call that a native Chrome zoom interaction. Native Chrome 400% zoom controls, Windows scaling, mixed-DPI moves, and real screen-reader speech/timing remain W6-P2/manual environment evidence.
- Do not add a root `zoom`, transform, or device-scale workaround.

### Preserved authorities and exclusions

- Preserve W1 storage, permissions, backup, connector, Weather, Notes, and Home Assistant async/generation ownership.
- Preserve W2-P1 feedback semantics and W2-P2 invoker-owned focus restoration, source names, boundary recovery, and 36px Focus geometry.
- No Layout V2 schema/migration, profile engine, BoardItem, registry, zones, Dock, or connector-survival work from W3.
- No modeless desktop/modal narrow Utility Tray behavior from W5-P1.
- No responsive Settings workspace, vertical navigation, or state-first credential-card redesign from W5-P3.
- No broad typography, target, motion, or visual-token convergence from W5-P4.
- No Store, V1, release package, manifest version, listing, or dashboard action.

## Verified preflight

- Target `feat/aurora-2-observatory` at `5c01b21442a2c4712e5ef8f7577120b2d3f9755f`, equal upstream, divergence 0/0, clean.
- Protected original on clean/equal `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Targeted read-only baseline: 12 files / 356 tests passing.
- Full accepted baseline: 117 files / 1,962 tests; TypeScript; 178-module production/preview builds; bridge scan exit 1; both audits zero; foreground browser 453/0/3.
- Discovery confirmed: Settings tabs/rows overflow about 272px content width; `anchorPanel` permits negative extrema for overlarge panels; open Notes/Tasks/Timer do not converge after resize; picker/Palette/location/folder surfaces lack complete short-viewport bounds; existing browser evidence bottoms out at 500px width.

## Task 0: Independent plan review and plan commit

**Files:**
- Create: `docs/superpowers/plans/2026-08-15-w2-p3-settings-tool-reflow.md`
- Track progress only under ignored `.superpowers/sdd/2026-08-15-w2-p3-settings-tool-reflow/`

1. Dispatch a read-only independent reviewer against the master spec, ledgers, source/tests/harness, and this plan.
2. Require severity-ranked findings. Review zoom truth, complete surface coverage without W3/W5 drift, fit/CSS use of the same gutter, current rendered-size ownership, Strict Mode/unmount-safe resize ownership, single-scroll ownership, composite-widget keyboard reachability, target inventory, and immutable causal browser RED.
3. Fix every confirmed plan finding and obtain Ready before implementation.
4. Commit only the reviewed plan:

```powershell
git add docs/superpowers/plans/2026-08-15-w2-p3-settings-tool-reflow.md
git diff --cached --check
git commit -m "docs: plan W2-P3 narrow reflow"
```

## Task 1: Author the immutable aggregate, then reflow current Settings

**Files:**
- Modify: `scripts/preview.mjs`
- Modify: `src/settings/Drawer.tsx`
- Create or modify: `src/settings/Drawer.test.tsx`
- Modify: `src/settings/Tabs.tsx`
- Modify: `src/settings/Tabs.test.tsx`
- Modify: `src/settings/Switch.tsx`
- Modify: `src/settings/Switch.test.tsx`
- Modify: `src/settings/ToggleChip.tsx`
- Modify: `src/settings/ToggleChip.test.tsx`
- Modify: `src/settings/PermissionCleanupAlert.tsx`
- Modify: `src/settings/PermissionCleanupAlert.test.tsx`
- Modify: `src/settings/sections/shared.ts`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/General.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/Background.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/Weather.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/Widgets.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/WorldClocks.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/Countdowns.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/Layout.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/Data.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/Connectors.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/TokenConnectForm.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/TokenConnectForm.test.tsx`
- Modify only as a failing narrow witness requires: `src/settings/sections/About.tsx`

### Step 1: Pre-author the complete packet browser RED before production edits

Add exactly one aggregate named `W2-P3 settings and tool reflow semantics`. Its inputs are authored once and frozen before W2-P3 production changes. It covers Tasks 1-3, not merely Settings.

On the clean plan base, preview-build and run the full foreground harness through this hard gate (create the ignored SDD directory first):

```powershell
$log = 'D:\DEV\Chrome plugin-aurora-2\.superpowers\sdd\2026-08-15-w2-p3-settings-tool-reflow\browser-red.log'
try {
  node scripts/preview.mjs 2>&1 | Tee-Object -FilePath $log
  $nodeExit = $LASTEXITCODE
  $lines = Get-Content -LiteralPath $log
  $pass = @($lines | Where-Object { $_ -match '^PASS:' }).Count
  $fail = @($lines | Where-Object { $_ -match '^FAIL:' }).Count
  $skip = @($lines | Where-Object { $_ -match '^SKIP:' }).Count
  $namedPass = @($lines | Where-Object { $_ -eq 'PASS: W2-P3 settings and tool reflow semantics' }).Count
  $namedFail = @($lines | Where-Object { $_ -eq 'FAIL: W2-P3 settings and tool reflow semantics' }).Count
  if ($nodeExit -ne 0 -or $pass -ne 453 -or $fail -ne 1 -or $skip -ne 3 -or $namedPass -ne 0 -or $namedFail -ne 1) {
    throw "Unexpected W2-P3 RED: exit=$nodeExit pass=$pass fail=$fail skip=$skip namedPass=$namedPass namedFail=$namedFail"
  }
} finally {
  if (Test-Path -LiteralPath $log) { Remove-Item -LiteralPath $log -Force }
}
```

Reject documented unrelated timing noise and rerun unchanged. Never weaken W2-P3 after seeing production. The aggregate uses one disposable page plus disposable storage/network fixtures and `finally` cleanup, so a clipping/locator failure becomes the one named FAIL without contaminating downstream harness state. Freeze predicates, inputs, exact copy, viewports, and captures after the accepted RED.

The aggregate must enforce:

- document/body `scrollWidth <= innerWidth + 1`;
- the page/body never overflows horizontally; the full-height/right-edge narrow Drawer and all full-viewport backdrops are explicitly exempt from the inset gutter while their content remains horizontally contained; Notes, Tasks, Timer, picker, Palette, Reset, Location, Folder, and Todo overflow panels lie at least 7px inside each applicable viewport edge (8px contract with one-pixel render tolerance);
- every active surface has `scrollWidth <= clientWidth + 1` and creates no page-level horizontal overflow;
- ordinary modal/tool/tab stops use real Tab/Shift+Tab and scroll fully into the owning scrollport; Palette and Location keep focus on their combobox input while ArrowDown/ArrowUp reach and visibly scroll the first/last active-descendant option; Folder and Todo overflow use their real buttons/links;
- modal traps, newest-first Escape, outside-click, and invoker restoration remain true;
- desktop-to-narrow resize while Notes/Tasks/Timer or a popover stays open converges without reopen;
- exact narrow target inventory measures at least 36 by 36 CSS px: Drawer close; every visible Settings tab, switch, toggle chip, button, text/date/url/number/file input, select, and checkbox/radio label target across General, Background, Widgets, Weather, World Clocks, Countdowns, Layout, Connectors (including TokenConnectForm), Data, About, and conditional PermissionCleanupAlert. Hidden/sr-only inputs are measured through their visible associated labels.

### Step 2: Write Settings RED tests

Add exact witnesses for:

- Drawer narrow padding and one vertical scroll owner;
- four tabs reflowing without nowrap overflow while APG arrows/Home/End and roving tabindex stay unchanged;
- shared rows stacking/stretching only at narrow width;
- text/date/select/file controls gaining `min-w-0`, `max-w-full`, and narrow full-width behavior where necessary;
- General, Background, Widgets, Weather, World Clocks, Countdowns, Layout, Connectors and every TokenConnectForm, Data, About, and conditional PermissionCleanupAlert, including existing/add forms, file controls, action pairs, and long text;
- Connectors sticky-search offset matching Drawer padding at ordinary and narrow widths;
- the exact Settings target inventory above owning the narrow 36px floor, with ordinary-size shared-control geometry either deliberately preserved through narrow-only classes or every shared consumer reviewed explicitly.

Run focused tests and record expected failures before production changes.

### Step 3: Implement only current Settings reflow

- Keep Drawer modal, fixed, and focus-trapped. Freeze ordinary `p-6`, narrow `max-[420px]:p-3`, and the Connectors sticky inverse `-top-6 max-[420px]:-top-3` in tests and browser computed styles.
- Reflow tabs as `max-[420px]` bounded grid/wrap behavior for both premium four-tab and free three-tab sets; add no horizontal scroll area or new navigation.
- Make shared rows stack/stretch at narrow width. Apply `min-w-0`, `max-w-full`, and narrow widths only to confirmed overflowing groups.
- Keep Connectors sticky negative top offset the exact inverse of Drawer padding.
- Do not change setting meaning, persistence, card order/grouping/search, permissions, connector validation, or Data authority.

### Step 4: Verify, review, fix, rereview, commit Task 1

Run the Settings-focused suite, TypeScript, preview syntax, and diff check. Dispatch a fresh reviewer. Confirmed findings require a separate RED-first fixer and clean rereview.

```powershell
git commit -m "fix(a11y): reflow W2-P3 settings"
```

The aggregate remains intentionally RED until Tasks 2-3.

## Task 2: Fit and resize-converge Notes, Tasks, and Timer

**Files:**
- Modify: `src/lib/layout/anchor.ts`
- Modify: `src/lib/layout/anchor.test.ts`
- Create: `src/lib/hooks/useViewportPanelAnchor.ts`
- Create: `src/lib/hooks/useViewportPanelAnchor.test.tsx`
- Modify: `src/newtab/widgets/notes/NotesWidget.tsx`
- Modify: `src/newtab/widgets/notes/NotesWidget.test.tsx`
- Modify: `src/newtab/widgets/notes/NotesPanel.tsx`
- Modify: `src/newtab/widgets/notes/NotesPanel.test.tsx`
- Modify: `src/newtab/widgets/todo/TodoWidget.tsx`
- Modify: `src/newtab/widgets/todo/TodoWidget.test.tsx`
- Modify: `src/newtab/widgets/todo/TodoPanel.tsx`
- Modify: `src/newtab/widgets/todo/TodoPanel.test.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.test.tsx`

### Step 1: Write pure/rendered RED tests

Freeze an 8px edge gutter. Prove:

- 384px Tasks and 320px Notes fit to 304px at viewport width 320;
- 218px Timer fits to 164px at viewport height 180;
- no left/top/bottom is negative when viewport is smaller than preferred panel;
- ordinary 1600x900 anchors stay numerically unchanged;
- panels listen/observe only while open, coalesce viewport and ResizeObserver work to one current owner, remeasure both current invoker and current rendered panel border box, and remove listener/observer/frame work on close/unmount/Strict Mode remount;
- stale resize completion cannot apply after a newer close/open owner;
- top-half and bottom-half placement remains inset after Tasks content grows/shrinks and after Timer cycle content appears/disappears, without remounting the focused panel;
- responsive CSS dimensions use the same 8px gutter as pure math;
- Notes keeps textarea/status/Retry reachable; Tasks keeps header/footer reachable with only body scrolling; Timer scrolls vertically only when required;
- at narrow/short viewports, exact tool targets keep the 36px floor: Notes textarea, Retry, and close path; Tasks list tabs, new-list input/trigger, overflow trigger/menu actions, item checkbox labels/delete controls, add-task input/submit, and close; Timer close, Start/Pause, Reset, and work/break inputs.

### Step 2: Implement the shared viewport-fit/resize owner

- Clamp the preferred first box to `viewport - 2 * 8px`, then observe the mounted current rendered panel box and recompute placement/max-height after layout and every actual content-size change.
- Preserve existing toward-center/up/down anchoring and ordinary geometry.
- One shared hook accepts invoker and panel refs, owns `resize` plus ResizeObserver/rAF geometry only, and fences callbacks by open generation. It never owns Notes persistence, Todo storage, or Timer state.
- Use CSS `min()`/`calc(100vw - 1rem)` and `calc(100dvh - 1rem)` dimensions matching pure fit.
- Never use root transform, `zoom`, UA sniffing, or a new breakpoint pile. Preserve the same panel DOM identity and focused descendant while recomputing.

### Step 3: Verify, review, fix, rereview, commit Task 2

Run anchor/hook/Notes/Tasks/Timer tests, TypeScript, preview syntax, and diff check. Review resize causality, cleanup, focus/Escape/restoration, scroll ownership, and ordinary geometry. Use a separate fixer for findings.

```powershell
git commit -m "fix(a11y): fit W2-P3 tool panels"
```

## Task 3: Bound current dialogs and popovers

**Files:**
- Modify: `src/settings/sections/EntityPickerDialog.tsx`
- Modify: `src/settings/sections/EntityPickerDialog.test.tsx`
- Modify: `src/newtab/widgets/palette/Palette.tsx`
- Modify: `src/newtab/widgets/palette/Palette.test.tsx`
- Modify: `src/newtab/widgets/weather/LocationSetup.tsx`
- Modify: `src/newtab/widgets/weather/LocationSetup.test.tsx`
- Modify: `src/newtab/widgets/bookmarks/FolderPopover.tsx`
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.test.tsx`
- Modify only if RED fails: `src/lib/ResetLayoutDialog.tsx` and existing tests

### Step 1: Write RED tests

Prove:

- picker owns a viewport-bounded flex column with entity list as one flexible scrollport; heading/search/actions remain reachable at 320x180;
- Palette removes fixed 18vh cost when short, bounds its whole panel, and makes only results flexible/scrollable;
- Location suggestions and FolderPopover use viewport-derived max height and recompute horizontal/vertical fit on resize while open;
- Reset already fits, or gets the smallest scroll correction only if RED proves it does not;
- Todo OverflowMenu remains inside the bounded Tasks surface at 320x180; its first/last actions are reachable, newest-first Escape and outside click close only the menu, focus restores to More actions, and it causes no page/surface overflow;
- roles, focus trap, Escape, outside-click, drill-in, search/listbox wiring, and W2-P2 picker restoration remain unchanged;
- Palette/Location Arrow navigation keeps focus on the input while first/last active-descendant options become fully visible; Folder and Todo menu navigation uses actual focusable controls;
- Folder and Location shrink -> grow -> shrink plus drill/result-content changes converge to baseline offsets without cumulative shift, preserve the focused node, and clean every listener/frame;
- long option text truncates without horizontal scroll. Exact narrow target inventory is picker search/checkbox labels/Cancel/Save; Palette input/options; Location device/search/options; Folder Back/folder/bookmark controls; Todo overflow trigger/actions; Reset Cancel/Reset.

### Step 2: Implement only surface bounds

- Use one owned scrollport per surface. Never make body/page horizontally scrollable or create competing vertical scroll regions.
- Recompute edge adjustment from an unshifted baseline on content changes and viewport resize with complete cleanup; compensate prior applied shift before measuring so repeated cycles cannot drift.
- Preserve ordinary widths/placement at 1280x720 and 2560x1440.
- Do not change bookmark, geocoding, palette command, picker fetch/save, or reset behavior.

### Step 3: Verify, review, fix, rereview, commit Task 3

Run focused suites, TypeScript, preview syntax, and diff check. Dispatch independent review and a separate fixer if needed.

```powershell
git commit -m "fix(a11y): bound W2-P3 dialogs"
```

## Task 4: Evidence, whole review, full gate, checkpoint, push, continue

**Files:**
- Verify: every W2-P3 production/test/harness file
- Update after verified acceptance only: `ROADMAP.md`, `STATUS.md`, `DECISIONS.md`

### Step 1: Run browser acceptance and inspect evidence

```powershell
npm run build:preview
node scripts/preview.mjs
```

Require exactly 454 PASS / 0 FAIL / 3 SKIP, one named W2-P3 PASS, zero named FAIL, process exit 0. Reject unrelated timing noise and rerun unchanged.

Capture and inspect at original resolution:

- `w2-p3-settings-general-320x812.png`
- `w2-p3-settings-connectors-320x568.png`
- `w2-p3-settings-data-320x568.png`
- `w2-p3-settings-short-320x180.png`
- `w2-p3-notes-320x180.png`
- `w2-p3-tasks-320x568.png`
- `w2-p3-tasks-short-320x180.png`
- `w2-p3-timer-320x180.png`
- `w2-p3-picker-320x180.png`
- `w2-p3-palette-320x180.png`
- `w2-p3-location-320x180.png`
- `w2-p3-bookmarks-320x568.png`
- `w2-p3-bookmarks-short-320x180.png`
- `w2-p3-standard-settings-1280x720.png` (Connectors open with long representative content)
- `w2-p3-large-tools-2560x1440.png` (one active anchored tool at its frozen ordinary anchor)

Run numeric overflow/gutter/scroll/keyboard/target predicates for every enumerated Settings section, tool, dialog, popover, and Todo OverflowMenu at 320x180 even when a taller companion capture also exists. Inspect all fifteen captures for horizontal clipping, legible labels/content, visible focus, non-color-only feedback, first/last reachability, single-scroll ownership, no overlap, and ordinary/large regression. Record the frozen pre-packet 1280x720/2560x1440 anchor and surface measurements and require post-change parity within one rendering pixel where no responsive rule applies. Chromium AX is supporting evidence only. Explicitly state native 400% browser zoom, Windows scale/mixed DPI, and real screen-reader behavior are not proved by CSS-viewport automation.

### Step 2: Independent bounded whole-packet review and fix

Review plan-base-to-HEAD, task reports, RED/GREEN, screenshots, numeric geometry/scroll evidence, AX, and contracts. Require severity-ranked findings over 320px overflow, 320x180 reachability, fit math/CSS parity, resize generations/cleanup, focus/Escape/restoration, Settings without W5 drift, target floors/reduced motion, W3/W5 exclusions, V1, harness causality, totals, and capture truth.

Confirmed findings require one separate RED-first fixer and fix commit. The same reviewer marks every finding Addressed/Not addressed and reports new Critical/Important issues. The controller does not patch findings.

### Step 3: Complete fresh verification gate

```powershell
npx vitest run src/newtab/App.test.tsx src/settings/Drawer.test.tsx src/settings/Tabs.test.tsx src/settings/Switch.test.tsx src/settings/ToggleChip.test.tsx src/settings/PermissionCleanupAlert.test.tsx src/settings/SettingsPanel.test.tsx src/settings/sections/TokenConnectForm.test.tsx src/lib/layout/anchor.test.ts src/lib/hooks/useViewportPanelAnchor.test.tsx src/newtab/widgets/notes/NotesWidget.test.tsx src/newtab/widgets/notes/NotesPanel.test.tsx src/newtab/widgets/todo/TodoWidget.test.tsx src/newtab/widgets/todo/TodoPanel.test.tsx src/newtab/widgets/timer/TimerWidget.test.tsx src/settings/sections/EntityPickerDialog.test.tsx src/newtab/widgets/palette/Palette.test.tsx src/newtab/widgets/weather/LocationSetup.test.tsx src/newtab/widgets/bookmarks/BookmarksBar.test.tsx src/lib/ResetLayoutDialog.test.tsx src/lib/dialogStack.test.ts
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw "Production preview-bridge scan expected rg exit 1, got $LASTEXITCODE" }
npm audit --omit=dev
npm audit --include=dev
npm run build:preview
$log = 'D:\DEV\Chrome plugin-aurora-2\.superpowers\sdd\2026-08-15-w2-p3-settings-tool-reflow\browser-green.log'
try {
  node scripts/preview.mjs 2>&1 | Tee-Object -FilePath $log
  $nodeExit = $LASTEXITCODE
  $lines = Get-Content -LiteralPath $log
  $pass = @($lines | Where-Object { $_ -match '^PASS:' }).Count
  $fail = @($lines | Where-Object { $_ -match '^FAIL:' }).Count
  $skip = @($lines | Where-Object { $_ -match '^SKIP:' }).Count
  $namedPass = @($lines | Where-Object { $_ -eq 'PASS: W2-P3 settings and tool reflow semantics' }).Count
  $namedFail = @($lines | Where-Object { $_ -eq 'FAIL: W2-P3 settings and tool reflow semantics' }).Count
  if ($nodeExit -ne 0 -or $pass -ne 454 -or $fail -ne 0 -or $skip -ne 3 -or $namedPass -ne 1 -or $namedFail -ne 0) {
    throw "Unexpected W2-P3 GREEN: exit=$nodeExit pass=$pass fail=$fail skip=$skip namedPass=$namedPass namedFail=$namedFail"
  }
} finally {
  if (Test-Path -LiteralPath $log) { Remove-Item -LiteralPath $log -Force }
}
git diff --check
git status --short
```

All tests/builds/audits pass; bridge scan exits 1; browser is machine-gated exact 454/0/3; fifteen captures and numeric/keyboard/scroll/AX evidence are inspected; no W3/W5 or native-zoom overclaim enters the packet.

### Step 4: Checkpoint and push

Mark W2-P3 Verified with exact evidence. Leave W3-P1 Not started with no plan. Append A2-D022 for viewport-fit geometry, resize ownership, narrow Settings reflow, single-scroll surfaces, and native-zoom truth.

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git diff --cached --check
git commit -m "docs: checkpoint W2-P3"
git push origin feat/aurora-2-observatory
git fetch origin
git rev-parse HEAD
git rev-parse '@{upstream}'
git rev-list --left-right --count 'HEAD...@{upstream}'
git status --short
git -C 'D:\DEV\Chrome plugin' branch --show-current
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
git -C 'D:\DEV\Chrome plugin' rev-parse '@{upstream}'
git -C 'D:\DEV\Chrome plugin' rev-list --left-right --count 'HEAD...@{upstream}'
git -C 'D:\DEV\Chrome plugin' status --short
$targetHead = git rev-parse HEAD
$targetUpstream = git rev-parse '@{upstream}'
$targetDivergence = ((git rev-list --left-right --count 'HEAD...@{upstream}') -replace '\s+', ' ').Trim()
$targetStatus = git status --short
if ($targetHead -ne $targetUpstream -or $targetDivergence -ne '0 0' -or $targetStatus) { throw 'Target is not clean/equal after push' }
$original = 'D:\DEV\Chrome plugin'
$originalBranch = git -C $original branch --show-current
$originalHead = git -C $original rev-parse HEAD
$originalUpstream = git -C $original rev-parse '@{upstream}'
$originalDivergence = ((git -C $original rev-list --left-right --count 'HEAD...@{upstream}') -replace '\s+', ' ').Trim()
$originalStatus = git -C $original status --short
if ($originalBranch -ne 'main' -or $originalHead -ne 'eb1354b6a5b041fb6d494655c3dae1862572bc51' -or $originalUpstream -ne $originalHead -or $originalDivergence -ne '0 0' -or $originalStatus) { throw 'Protected original changed' }
```

Hard-assert target local/upstream literal equality, divergence 0/0, and clean status. Hard-assert protected original branch `main`, local/upstream both literal `eb1354b6a5b041fb6d494655c3dae1862572bc51`, divergence 0/0, and clean status; do not accept prose inspection alone.

Then re-read spec/ledgers, reverify both worktrees, create and independently review only W3-P1, and continue automatically under A2-D019. Do not combine W3-P1 work into W2-P3.
