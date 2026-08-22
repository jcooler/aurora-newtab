# Aurora Baseline Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the accepted named-layouts baseline, remove known test-warning noise, document the correct manual test commands, and produce one clean reviewed build plus real-Chromium checkpoint before Flow begins.

**Architecture:** This packet changes no product behavior and no storage shape. Test-only synchronization waits for the existing asynchronous Layout hydration and CanvasItem MutationObserver cycle instead of letting those updates escape the test boundary. Durable docs are corrected from the repository's actual commits and the accepted NL-P6 report.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 3.2, Testing Library, Vite 6, Playwright 1.62, Chrome MV3.

**Spec:** `docs/superpowers/specs/2026-08-21-aurora-continuous-delivery-roadmap-design.md`

## Global Constraints

- Do not change production rendering, storage, migrations, backup behavior, connector contracts, permissions, CSP, or dependencies.
- `layout` remains frozen recovery input and named-layout code never writes it.
- Do not auto-reflow, auto-switch, or otherwise reinterpret authored layouts.
- Do not modify `D:\DEV\Chrome plugin`.
- Do not perform any Chrome Web Store action.
- Preserve the exact red warning evidence before changing tests.
- Run the full suite only after the focused warning families are quiet.
- Never run a regenerating QA script against the accepted
  `docs/superpowers/qa/nl-p6` directory during this packet.

---

### Task 0: Checkpoint the approved roadmap and executable plan

**Files:**
- Create: `docs/superpowers/specs/2026-08-21-aurora-continuous-delivery-roadmap-design.md`
- Create: `docs/superpowers/plans/2026-08-21-aurora-baseline-stabilization.md`

**Interfaces:**
- Consumes: the owner's 2026-08-21 continuous-execution approval.
- Produces: a tracked governing design and bounded Program A plan.

- [x] **Step 1: Verify and commit the planning artifacts**

Run:

```powershell
git diff --check
rg -n "T[B]D|T[O]DO|implement la[t]er|appropriate error handl[i]ng|Write tests for the ab[o]ve|Similar to Ta[s]k" docs/superpowers/specs/2026-08-21-aurora-continuous-delivery-roadmap-design.md docs/superpowers/plans/2026-08-21-aurora-baseline-stabilization.md
git add docs/superpowers/specs/2026-08-21-aurora-continuous-delivery-roadmap-design.md docs/superpowers/plans/2026-08-21-aurora-baseline-stabilization.md
git commit -m "docs: approve the continuous Aurora delivery roadmap"
```

Expected: diff hygiene passes, the placeholder scan has no hits, and both
documents are tracked before implementation begins.

### Task 1: Make the test boundaries and commands honest

**Files:**
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/canvas/CanvasItem.test.tsx`
- Modify: `package.json`
- Create: `docs/superpowers/reports/BASELINE-STABILIZATION-RED.md`

**Interfaces:**
- Consumes: existing `act`, `fireEvent`, `screen`, `SettingsPanel`, `CanvasItem`, and `scripts/preview-information-first.test.mjs`.
- Produces: `npm run test:information-first-contract` and focused test runs with no React state-update warning.

- [ ] **Step 1: Preserve the focused RED warning evidence**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx -t "groups compact Widget toggles" --reporter=verbose
npx vitest run src/newtab/canvas/CanvasItem.test.tsx -t "marks a widget that rendered NOTHING" --reporter=verbose
```

Expected: both tests pass but stderr contains `was not wrapped in act(...)` for `Layout` and `CanvasItem` respectively. This is the packet's observed RED because the acceptance contract requires warning-free output.

Record the command, exact test name, component name, and the warning sentence
in `docs/superpowers/reports/BASELINE-STABILIZATION-RED.md`. Do not paste the
repeated React help paragraph.

- [ ] **Step 2: Make Widget-tab test entry await Layout hydration**

Add a test-only helper beside `openTab` that waits for the exact storage read
Layout started, not an arbitrary number of microtasks. It accepts the storage
instance returned by `renderPanel()`:

```tsx
async function openWidgetsTabAndWaitForLayout(storage: AuroraStorage) {
  const get = vi.spyOn(storage, 'get')
  openTab('Widgets')
  await waitFor(() => {
    expect(get).toHaveBeenCalledWith('layout')
  })
  const read = get.mock.results.find((result, index) =>
    get.mock.calls[index]?.[0] === 'layout' && result.type === 'return'
  )?.value as Promise<unknown> | undefined
  if (!read) throw new Error('Layout storage read was not captured')
  try {
    await act(async () => {
      await read
    })
  } finally {
    get.mockRestore()
  }
}
```

Import `waitFor` in this file. Use
`await openWidgetsTabAndWaitForLayout(storage)` in the currently warning tests:
the compact Widget groups; Weather-location mount; absent Weather location;
default and maxed Habits; Month label; and the three Sun/Moon location cases.
Capture the storage returned by `renderPanel()` or pass the explicitly created
storage. The read promise is the test-controlled completion signal for the
default Canvas V3 fixture, whose correct post-read UI has no Reset button. Do
not add product-only readiness markers.

- [ ] **Step 3: Keep the empty-widget test alive through its observer cycle**

Import `waitFor`, make the focused test asynchronous, and wait for the
observer-driven state to expose its real DOM outcome:

```tsx
it('marks a widget that rendered NOTHING as empty and gives it no chrome', async () => {
  render(/* existing CanvasItem fixture */)
  const item = screen.getByTestId('canvas-item-worldClocks')
  await waitFor(() => {
    expect(item.hasAttribute('data-canvas-empty')).toBe(true)
  })
  expect(screen.queryByRole('button', { name: 'Move World clocks' })).toBeNull()
})
```

Do not change CanvasItem production timing to satisfy the test.

- [ ] **Step 4: Add the Node-only contract command**

Add this script without changing the existing `test` command:

```json
"test:information-first-contract": "node --test scripts/preview-information-first.test.mjs"
```

This file intentionally uses `node:test`; Vitest continues excluding `scripts/**`.

- [ ] **Step 5: Verify focused GREEN**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx -t "groups compact Widget toggles" --reporter=verbose
npx vitest run src/newtab/canvas/CanvasItem.test.tsx -t "marks a widget that rendered NOTHING" --reporter=verbose
npm run test:information-first-contract
```

Expected: all focused tests pass and neither Vitest command emits a React `act(...)` warning.

Use a warning-sensitive PowerShell gate rather than relying on Vitest's exit
code alone:

```powershell
$focused = & npx vitest run src/settings/SettingsPanel.test.tsx src/newtab/canvas/CanvasItem.test.tsx --reporter=dot 2>&1 | Tee-Object .qa-nl-p6-focused.log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($focused -match 'was not wrapped in act') { throw 'React act warning remained in focused gate' }
```

- [ ] **Step 6: Commit the test boundary**

```powershell
git add package.json src/settings/SettingsPanel.test.tsx src/newtab/canvas/CanvasItem.test.tsx docs/superpowers/reports/BASELINE-STABILIZATION-RED.md
git commit -m "test: make baseline checks warning-free and explicit"
```

### Task 2: Reconcile the product documentation and ledgers

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**
- Consumes: `docs/superpowers/qa/nl-p6/QA-REPORT.md`, commits `1ff6650`, `3e9a003`, `ea42b24`, `419b7f0`, `6191804`, `7a83bce`, and `cb6c4db`.
- Produces: one current source of truth for completed NL-P1 through NL-P6, Program A stabilization, approved Flow/stacks, and the continuing roadmap.

- [ ] **Step 1: Correct README behavior and commands**

Replace the obsolete automatic-reflow/Arrange description with the current named-layout behavior:

```markdown
- **Named layouts & live editing** - create and switch layouts, hover a widget for Move and Settings, drag it anywhere on the live page, choose its Compact/Standard/Full presentation, layer or hide it, and create pixel-positioned top or bottom docks. Save commits the draft; Cancel restores the exact stored layout. Aurora never changes layouts or rearranges authored positions on its own.
```

Add the standalone contract command under Development:

```bash
npm run test:information-first-contract # Node-only information-first matrix contract
```

Update Status curated-service copy to include Claude and update Weather facts to mention the current unambiguous rain time and directional wind treatment. Do not claim Flow or stacks are implemented.

- [ ] **Step 2: Correct the STATUS header**

Set the current packet to baseline stabilization, record NL-P6 as accepted with F9 resolved by the owner, record `cb6c4db` as the starting checkpoint, and list Flow/stacks as approved but not implemented.

- [ ] **Step 3: Add the named-layout program to ROADMAP**

Append a concise table for NL-P1 through NL-P7. Mark NL-P1 through NL-P6 verified, NL-P6 owner-accepted after `3e9a003`, and baseline stabilization in progress. Add the future sequence Flow, stacks, Weather enrichment, expansion platform, and addition waves without assigning invented dates.

- [ ] **Step 4: Record the owner decision**

Add `A2-D062` with:

- owner approval date 2026-08-21;
- the continuous back-to-back execution authorization;
- sequence Baseline -> Flow -> Stacks -> Weather -> Expansion;
- no routine continuation prompts;
- unchanged visual evidence, frozen-boundary, protected-checkout, and W6-P5 requirements.

- [ ] **Step 5: Check prose and commit**

Run:

```powershell
rg -n "PR-P6.*Reopened|current packet.*NL-P5|Flow.*implemented|stacks.*implemented" README.md docs/superpowers/aurora-2
git diff --check
```

Inspect every hit and remove only current-state contradictions. Preserve historical rejected-candidate evidence.

```powershell
git add README.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "docs: reconcile the accepted named-layout baseline"
```

### Task 3: Isolate the NL-P6 rerun output

**Files:**
- Create: `scripts/qa-nl-p6-output.test.mjs`
- Create: `scripts/qa-nl-p6-output.mjs`
- Modify: `scripts/qa-nl-p6.mjs`
- Modify: `scripts/qa-nl-p6-window.mjs`

**Interfaces:**
- Consumes: the existing NL-P6 harness and immutable canonical evidence.
- Produces: an enforced scratch-only output boundary for every future NL-P6 script run.

- [ ] **Step 1: Write a failing isolated-output contract for the QA scripts**

Create `scripts/qa-nl-p6-output.test.mjs` with Node's test runner. The test
imports `resolveQaOutputDir(argv, cwd)` and proves:

```js
assert.equal(
  resolveQaOutputDir(['--out-dir=.qa-nl-p6-baseline-out'], repoRoot),
  resolve(repoRoot, '.qa-nl-p6-baseline-out'),
)
assert.throws(
  () => resolveQaOutputDir([], repoRoot),
  /required/,
)
assert.throws(
  () => resolveQaOutputDir(['--out-dir=docs/superpowers/qa/nl-p6'], repoRoot),
  /scratch output/,
)
assert.throws(
  () => resolveQaOutputDir(['--out-dir=..\/outside'], repoRoot),
  /scratch output/,
)
```

Run `node --test scripts/qa-nl-p6-output.test.mjs` and observe failure because
the module does not exist.

- [ ] **Step 2: Implement the isolated-output parser**

Create `scripts/qa-nl-p6-output.mjs` exporting:

```js
export function resolveQaOutputDir(argv, cwd) {
  const raw = argv.find((arg) => arg.startsWith('--out-dir='))?.slice('--out-dir='.length)
  if (!raw) throw new Error('NL-P6 --out-dir scratch output is required')
  const output = resolve(cwd, raw)
  const root = resolve(cwd)
  const name = basename(output)
  if (dirname(output) !== root || !/^\.qa-nl-p6-[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error('NL-P6 --out-dir must be a .qa-nl-p6-* scratch output')
  }
  return output
}
```

Import `basename`, `dirname`, and `resolve` from `node:path` in the new module. Import the resolver in
both QA scripts and replace the fixed `outDir` literal with
`resolveQaOutputDir(process.argv.slice(2), repoRoot)`. Keep the existing path
suffix guards for dist/profile deletion and remove the old canonical-output
guard because the resolver now rejects every path outside `.qa-nl-p6-*`,
including the canonical evidence directory and an absent flag.

Run `node --test scripts/qa-nl-p6-output.test.mjs`; expected PASS.

- [ ] **Step 3: Commit the isolated-output boundary**

```powershell
git add scripts/qa-nl-p6-output.mjs scripts/qa-nl-p6-output.test.mjs scripts/qa-nl-p6.mjs scripts/qa-nl-p6-window.mjs
git commit -m "test(qa): protect accepted NL-P6 evidence from reruns"
```

### Task 4: Review and stabilize the checkpoint

**Files:**
- Modify only confirmed Critical/Important findings from the bounded review.
- Modify: `docs/superpowers/aurora-2/STATUS.md` for final evidence.

**Interfaces:**
- Consumes: Tasks 1-3 commits and the existing NL-P6 harness.
- Produces: reviewed baseline checkpoint, rebuilt `dist`, and pushed local/upstream equality.

- [ ] **Step 1: Request one bounded review**

Review the complete Task 1-3 range for current-state accuracy, warning-free
behavior, QA-output safety, accidental product changes, Store-boundary
preservation, and protected-checkout safety. Only Critical/Important findings
block. Use at most one fix/rereview cycle.

- [ ] **Step 2: Run the stabilized full gate**

Run once after review fixes:

```powershell
$full = & npm test -- --reporter=dot 2>&1 | Tee-Object .qa-nl-p6-full.log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($full -match 'was not wrapped in act') { throw 'React act warning remained in full gate' }
npx tsc --noEmit
npm run test:information-first-contract
node --test scripts/qa-nl-p6-output.test.mjs
npm run build
git diff --check
```

Expected: 155 Vitest files / 2570 tests or a larger count caused only by
intentional later tests; TypeScript and build exit 0; both Node contract
commands pass; no React state-update warning appears.

- [ ] **Step 3: Run the real-Chromium baseline witness into scratch evidence**

Run the NL-P6 sweep and real-window witness without touching accepted evidence:

```powershell
node scripts/qa-nl-p6.mjs --out-dir=.qa-nl-p6-baseline-out
node scripts/qa-nl-p6-window.mjs --out-dir=.qa-nl-p6-baseline-out
```

Confirm the scratch evidence reports zero runtime errors, failed requests,
horizontal page overflow, offscreen controls, or forbidden `layout` writes.
Inspect at least the fresh, named-saved, connectors-default, edit, and exact
1408x445 window captures at original resolution. Verify `git diff --exit-code
-- docs/superpowers/qa/nl-p6` so the accepted canonical report and captures are
byte-unchanged.

- [ ] **Step 4: Rebuild and prove the reviewed source**

Run `npm run build` again only if a review fix changed source after Step 2. Record the exact reviewed commit and verify `dist` was produced after that commit. Do not package or upload.

- [ ] **Step 5: Update evidence and checkpoint**

Update STATUS with exact counts, reviewed range, Chromium result, and remaining manual ceilings. Commit:

```powershell
git add docs/superpowers/aurora-2/STATUS.md
git commit -m "docs: checkpoint the stabilized Aurora baseline"
git push origin feat/aurora-2-observatory
```

- [ ] **Step 6: Prove both repositories and close this packet**

Verify the active worktree is clean and local `HEAD` equals upstream. Verify the protected checkout is still clean on `main` at `eb1354b6a5b041fb6d494655c3dae1862572bc51`. This plan ends at that proof. The separate Flow packet begins by writing its own just-in-time plan under the continuous roadmap authorization.

## Plan self-review

- Spec coverage: Programs A's ledger, warning, command, full-gate, Chromium,
  rebuild, push, and repository-proof requirements are each assigned.
- Placeholders: none. Conditional observer flushing names the exact permitted
  evidence-driven adjustment and does not defer behavior.
- Type consistency: no production interface changes are introduced.
