# Aurora Expansion Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Aurora additions repeatable through a truthful candidate
catalog, guarded scratch scaffold, and executable parity/privacy/tier
contracts without shipping a new identity or changing product authority.

**Architecture:** Keep the existing independent typed authorities and compare
them at test time. Store candidate research as validated JSON and generate its
Markdown view. Generate starter code only into guarded scratch directories;
contributors still integrate reviewed code manually under TDD.

**Tech Stack:** TypeScript 5.9, React 19, Vitest 3, Node 22 test runner,
Playwright 1.62, MV3 Chrome APIs, JSON and Markdown documentation.

**Spec:**
`docs/superpowers/specs/2026-08-22-aurora-expansion-platform-design.md`

## Global Constraints

- Program E ships no new user-visible widget, connector, provider request,
  permission, origin, credential, schema key, migration, or dependency.
- No scaffold write may reach production paths or the protected checkout.
- Production behavior changes require an observed focused failing test first.
- Candidate and fixture data contain no real secrets or capability URLs.
- The user owns placement; no code may auto-place, reflow, or switch layouts.
- Existing storage, backup, connector, permission, CSP, accepted evidence,
  Store, and protected-checkout boundaries remain frozen.
- New prose uses literal `&` where required and contains no em or en dash.
- One bounded implementation review and at most one fix/rereview cycle applies.

---

### Task 1: Validated Candidate Catalog

**Files:**

- Create: `scripts/expansion/catalog-schema.mjs`
- Create: `scripts/expansion/catalog-schema.test.mjs`
- Create: `scripts/expansion/render-catalog.mjs`
- Create: `scripts/expansion/render-catalog.test.mjs`
- Create: `docs/superpowers/catalog/expansion/candidates.json`
- Create: `docs/superpowers/catalog/expansion/CATALOG.md`

**Interfaces:**

- Produces:
  `validateExpansionCatalog(value): { ok: true, catalog } | { ok: false, errors }`
  and `renderExpansionCatalog(catalog): string`.
- `errors` is a sorted array of field-specific strings, never a thrown partial
  report.
- The renderer CLI accepts `--check`; check mode exits nonzero when committed
  Markdown differs and never writes.

- [ ] **Step 1: Write catalog validation failures**

Create Node tests that pass a literal valid one-candidate catalog and mutate it
one field at a time. The tests must prove these failures independently:

```js
assert.deepEqual(validateExpansionCatalog({ catalogVersion: 1, verifiedOn: '2026-08-22', candidates: [] }), {
  ok: false,
  errors: ['candidates: expected at least 36 candidates'],
})
assert.match(errorText(duplicateIds), /candidates\[1\]\.id: duplicate "readingList"/)
assert.match(errorText(httpDocs), /source\.docsUrl: expected an HTTPS URL/)
assert.match(errorText(blankTier), /presentation\.compact: expected nonblank text/)
assert.match(errorText(oauthContradiction), /auth\.directClientViable: oauth-secret-required cannot be direct-client viable/)
```

The complete valid fixture must exercise every enum value and both allowed
empty-array and populated-array cases. The test must name the break: accepting
research that cannot support a permission, privacy, or tier decision.

- [ ] **Step 2: Observe catalog RED**

Run:

```powershell
node --test scripts/expansion/catalog-schema.test.mjs
```

Expected: FAIL because `catalog-schema.mjs` does not exist.

- [ ] **Step 3: Implement the schema validator**

Implement small path-aware validators for object, enum, text, HTTPS URL,
string-array, integer range, ISO date, and uniqueness. Return all errors sorted
lexically. Freeze the successful normalized object recursively and preserve
candidate order. Do not silently default or discard a field.

- [ ] **Step 4: Reach schema GREEN**

Run the same Node test command. Expected: all schema tests pass with no warning.

- [ ] **Step 5: Write renderer and atomic-write failures**

Tests run the exported renderer against a two-candidate literal and assert the
complete hand-written Markdown string, including warning/auth/risk/blocker
columns. In a temporary directory, test that:

```js
await runCatalogCli(['--input', input, '--output', output, '--check'])
```

returns nonzero for stale output without changing its bytes; normal mode writes
through a sibling temporary file and leaves no temporary file after success or
validation failure.

- [ ] **Step 6: Observe renderer RED**

Run:

```powershell
node --test scripts/expansion/render-catalog.test.mjs
```

Expected: FAIL because the renderer and CLI do not exist.

- [ ] **Step 7: Implement deterministic rendering**

Render title, source date, status legend, approved-wave summary, then stable
sections in this exact wave order:

```js
['browser-native', 'work', 'at-a-glance', 'broader', 'backlog']
```

Within a section preserve JSON order. Include every candidate field, not a
lossy summary: the table is a scan view and each candidate receives a detail
subsection for auth, access, privacy, cache, settings, four tiers, interaction,
states, maintenance, rationale, and blockers.

- [ ] **Step 8: Populate at least 36 researched candidates**

The JSON must include these roadmap IDs exactly:

```text
readingList, recentlyClosed, downloads, tabGroups,
linear, sentry, todoist,
onThisDay, publicHolidays, severeWeather, auroraKp,
notion, slack, spotify
```

It must also include these 26 ranked backlog IDs, for 40 total:

```text
topSites, historyDigest, githubActions, gitlabPipelines, pagerDuty, datadog,
cloudflareAnalytics, buildkite, jenkins, asana, trello, clickUp,
microsoftTodo, googleCalendar, earthquakes, spaceLaunches, issTracker,
wordOfDay, dailyTrivia, sportsScores, transitCommute, packageUpdates,
uptime, emailInbox, habitInsights, currentEvents
```

Use official HTTPS documentation URLs. Mark overlaps as `absorbed`, broad
history/email warnings as `deferred`, and client-secret-required public OAuth
as `blocked`. Keep the four roadmap waves in their approved order.

- [ ] **Step 9: Generate and check the catalog**

Run:

```powershell
node scripts/expansion/render-catalog.mjs
node scripts/expansion/render-catalog.mjs --check
node --test scripts/expansion/catalog-schema.test.mjs scripts/expansion/render-catalog.test.mjs
```

Expected: 40 valid candidates, byte-stable Markdown, all tests pass.

- [ ] **Step 10: Commit the catalog slice**

```powershell
git add -- scripts/expansion docs/superpowers/catalog/expansion
git commit -m "docs: add Aurora expansion catalog"
```

---

### Task 2: Guarded Scratch Scaffold

**Files:**

- Create: `scripts/expansion/output-safety.mjs`
- Create: `scripts/expansion/output-safety.test.mjs`
- Create: `scripts/expansion/scaffold.mjs`
- Create: `scripts/expansion/scaffold.test.mjs`
- Create: `docs/ADDING-AURORA-CAPABILITY.md`
- Modify: `.gitignore`

**Interfaces:**

- Produces:
  `resolveSafeExpansionOutput({ repoRoot, requested, protectedRoot })` and
  `scaffoldAddition({ id, label, kind, outDir, repoRoot, protectedRoot })`.
- `kind` is exactly `builtin | connector | provider`.
- A successful scaffold returns `{ root, files: [{ path, sha256 }] }` sorted by
  path.

- [ ] **Step 1: Write path-safety failures**

In temporary directories, assert rejection before any write for repository
root, protected root, `src`, `docs`, `scripts`, `dist`, traversal, wrong prefix,
non-empty output, output-file collision, and symlink or junction ancestors.
Assert `.aurora-expansion-readingList` and `.qa-expansion-provider` resolve
successfully only inside the active repository fixture.

- [ ] **Step 2: Observe output-safety RED**

Run:

```powershell
node --test scripts/expansion/output-safety.test.mjs
```

Expected: FAIL because `output-safety.mjs` is missing.

- [ ] **Step 3: Implement preflight-only path safety**

Use `lstat`, `realpath`, `path.relative`, and case-insensitive Windows path
comparison. Validate the complete ancestor chain and all planned children
before `mkdir`. Never call `rm`, never clean an existing target, and never
follow a link.

- [ ] **Step 4: Reach output-safety GREEN**

Run the focused test. Expected: all path cases pass and temporary fixtures are
removed by test-owned cleanup.

- [ ] **Step 5: Write scaffold behavior failures**

For each kind, invoke `scaffoldAddition` in a temporary repository fixture and
assert an exact sorted file list. Assert generated source contains no `fetch(`,
`chrome.storage`, `chrome.permissions`, token-like literal, capability URL, or
an unfinished-work marker. Verify each digest independently with
`createHash('sha256')`.
Assert invalid IDs, blank labels, unknown kinds, and an unavailable candidate
ID fail before output exists.

- [ ] **Step 6: Observe scaffold RED**

Run:

```powershell
node --test scripts/expansion/scaffold.test.mjs
```

Expected: FAIL because `scaffold.mjs` is missing.

- [ ] **Step 7: Implement deterministic starter generation**

Generate these exact relative files:

```text
candidate.json
src/newtab/widgets/<id>/<PascalId>Widget.tsx
src/newtab/widgets/<id>/<PascalId>Widget.test.tsx
INTEGRATION-CHECKLIST.md
manifest.json
```

Connector and provider kinds additionally receive
`src/services/<kind>s/<id>.ts` and `<id>.test.ts`. Connector kind additionally
receives `src/settings/<PascalId>ConnectorSettings.tsx`. The candidate has
`status: "research-required"`, and the checklist says this marker must be
replaced before integration. Generated components return `null`; their starter
tests deliberately fail with `throw new Error('Write the first behavior test')`
so copied code cannot create a false green.

- [ ] **Step 8: Document the complete addition workflow**

Write the eight-step workflow from spec section 8. Include concrete commands,
all current authority files, observed RED requirement, connector credential and
origin rules, visual tier catalog, one-review/fix-cycle rule, local/upstream
proof, protected checkout proof, and W6-P5 Store prohibition.

- [ ] **Step 9: Ignore scratch roots and verify all kinds**

Add:

```gitignore
.aurora-expansion-*/
.qa-expansion-platform-*/
```

Run scaffold CLI three times into fresh ignored roots, compare their manifests
to actual bytes, then remove only those exact verified scratch roots using one
PowerShell process and `Remove-Item -LiteralPath`.

- [ ] **Step 10: Commit the scaffold slice**

```powershell
git add -- .gitignore scripts/expansion docs/ADDING-AURORA-CAPABILITY.md
git commit -m "feat(dev): add guarded Aurora addition scaffold"
```

---

### Task 3: Widget and Tier Authority Contracts

**Files:**

- Create: `scripts/widget-catalog-manifest.mjs`
- Create: `scripts/widget-catalog-manifest.d.mts`
- Create: `scripts/widget-catalog-manifest.test.mjs`
- Create: `src/newtab/expansionWidgetContracts.test.ts`
- Modify: `src/newtab/widgetRenderers.tsx`
- Modify: `scripts/catalog-nl-p5.mjs`

**Interfaces:**

- `WIDGET_RENDERERS` exports the actual renderer implementation map and
  `WIDGET_RENDERER_KEYS` becomes `Object.keys(WIDGET_RENDERERS)`, preserving its
  current readonly `WidgetRendererKey[]` public type.
- `scripts/widget-catalog-manifest.mjs` exports `CATALOG_BATCHES`,
  `CATALOG_CONTRACTS`, `CODED_DOCK_LINES`, and `captureTiersFor(id)`.
- The existing catalog script consumes those exports without changing existing
  batch verdicts or canonical output.

- [ ] **Step 1: Write an independent renderer parity failure**

Add a Vitest test that imports the proposed `WIDGET_RENDERERS` export and
compares a hand-written sorted 26-ID literal against registry IDs,
size-contract keys, default-point keys, `Object.keys(WIDGET_RENDERERS)`, and
`WIDGET_RENDERER_KEYS`.

- [ ] **Step 2: Observe widget parity RED**

Run:

```powershell
npx vitest run src/newtab/expansionWidgetContracts.test.ts
```

Expected: FAIL because `WIDGET_RENDERERS` is not exported and the new contract
file cannot compile.

- [ ] **Step 3: Derive renderer keys from the implementation map**

Rename and export the renderer map, then implement:

```ts
export const WIDGET_RENDERER_KEYS = Object.freeze(
  Object.keys(WIDGET_RENDERERS) as WidgetRendererKey[],
)
```

Add assertions that every declared size has a nonblank matching contract, no
undeclared tier promise exists, Docked support equals a nonblank Docked promise,
and every widget availability key exists in `defaults().settings.widgets`.

- [ ] **Step 4: Reach widget parity GREEN**

Run the focused Vitest test plus existing registry, renderer, size-contract,
and default-placement tests. Expected: all pass.

- [ ] **Step 5: Write visual-catalog parity failures**

Extend the Vitest contract to import the typed `.mjs` tooling manifest and
compare it to this exact current production expectation: all 26 `BLOCK_IDS`
appear once; free capture tiers equal each contract's `sizes`; Docked capture
exists exactly for nonblank `docked`; and batch 1 plus batch 2 have no overlap.
The Node test exercises `captureTiersFor(id)` and rejects duplicate and unknown
manifest identities without parsing TypeScript source text.

- [ ] **Step 6: Observe catalog-manifest RED**

Run:

```powershell
node --test scripts/widget-catalog-manifest.test.mjs
```

Expected: FAIL because the shared manifest is missing.

- [ ] **Step 7: Extract one tooling manifest**

Move the current `BATCH_1`, `BATCH_2`, contract labels, and coded-dock-line set
from `catalog-nl-p5.mjs` without changing values or order. Import them back into
the existing script. Keep all owner verdicts in the existing script as data.

- [ ] **Step 8: Prove catalog output stability**

Run both batch catalog generators in `--check` mode against committed Markdown
and assert zero diff. Then run the Node manifest and focused Vitest families.

- [ ] **Step 9: Commit the widget-contract slice**

```powershell
git add -- src/newtab/widgetRenderers.tsx src/newtab/expansionWidgetContracts.test.ts scripts/widget-catalog-manifest.mjs scripts/widget-catalog-manifest.d.mts scripts/widget-catalog-manifest.test.mjs scripts/catalog-nl-p5.mjs
git commit -m "test: enforce Aurora widget addition contracts"
```

---

### Task 4: Connector Privacy, Origin, and Settings Contracts

**Files:**

- Create: `src/test/connectorContractFixtures.ts`
- Create: `src/services/connectors/expansionConnectorContracts.test.ts`
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/sections/Connectors.test.tsx`

**Interfaces:**

- `CONNECTOR_BODY_IDS: readonly ConnectorId[]` derives from actual
  `BODY_COMPONENTS` keys.
- `COMPLETE_CONNECTOR_CONTRACT_FIXTURES` is test-only and satisfies
  `Record<ConnectorId, ConnectorConfig>` with inert `.invalid` origins and
  credential-shaped placeholders that are never logged.

- [ ] **Step 1: Write connector authority failures**

Add literal expected IDs for the current nine connectors and compare them to
`CONNECTOR_IDS`, descriptor IDs, connector-backed widget availability IDs,
actual settings body IDs, and fixture IDs. Add per-descriptor behavior checks:
nonblank auth/TTL/backup re-entry copy, complete origin ownership, and secret
field declarations present in the corresponding complete fixture.

- [ ] **Step 2: Observe connector parity RED**

Run:

```powershell
npx vitest run src/services/connectors/expansionConnectorContracts.test.ts src/settings/sections/Connectors.test.tsx
```

Expected: FAIL because body IDs and complete fixtures are not exported.

- [ ] **Step 3: Export actual settings body IDs and build complete fixtures**

Derive body IDs from `Object.keys(BODY_COMPONENTS)`. Build exact fixtures for
`rss`, `github`, `gitlab`, `jira`, `vercel`, `crypto`, `ics`, `status`, and
`homeassistant`. Use `example.invalid`, `*.invalid`, and labels such as
`contract-token`; no fixture value may match a real service account.

- [ ] **Step 4: Reach identity GREEN**

Run the focused tests. Expected: exact nine-way parity and no Settings behavior
change.

- [ ] **Step 5: Write backup and origin behavior failures**

Use real `stripSecrets`, connector descriptors, `ownedOriginPatterns`, and the
complete fixtures. Hand-derive expected redacted keys per connector. Assert:

```ts
expect(JSON.stringify(stripSecrets(fixtures))).not.toContain('contract-token')
expect(exported.github).not.toHaveProperty('token')
expect(exported.rss.feeds).toEqual([])
```

For each descriptor origin, mutate only that connector to invalid/disabled and
assert ownership disappears unless another existing descriptor explicitly owns
the same pattern. Test disabled, invalid, configured-hidden, and
configured-visible UI states through `deriveConnectorCardState` using real
configs.

- [ ] **Step 6: Observe privacy/origin RED where coverage is missing**

Run the focused test and record the exact missing assertion or behavior. If all
current production behavior already passes, temporarily remove one test fixture
secret and one origin-owning field to prove the test fails, restore the fixture,
then record that characterization RED in the plan ledger without changing
production code.

- [ ] **Step 7: Complete the generic contract**

Add only the minimal exports or test-fixture corrections required. Do not alter
descriptor request, credential, TTL, redaction, or ownership behavior.

- [ ] **Step 8: Commit the connector-contract slice**

```powershell
git add -- src/test/connectorContractFixtures.ts src/services/connectors/expansionConnectorContracts.test.ts src/settings/sections/Connectors.tsx src/settings/sections/Connectors.test.tsx
git commit -m "test: enforce Aurora connector addition contracts"
```

---

### Task 5: One Expansion Contract Command

**Files:**

- Create: `scripts/expansion/run-contracts.mjs`
- Create: `scripts/expansion/run-contracts.test.mjs`
- Modify: `package.json`

**Interfaces:**

- `runExpansionContracts({ cwd, spawn })` runs catalog validation/check, Node
  tests, and the two focused Vitest files in deterministic order, streams output,
  and stops at the first nonzero child exit.
- `npm run test:expansion-contract` invokes only that runner.

- [ ] **Step 1: Write runner orchestration failures**

Use an injected spawn function returning literal exit codes. Assert exact
command/argument order, inherited stdio, Windows-safe `npx.cmd` selection, and
first-failure propagation. The test asserts orchestration outcomes, not mock
call existence.

- [ ] **Step 2: Observe runner RED**

Run:

```powershell
node --test scripts/expansion/run-contracts.test.mjs
```

Expected: FAIL because the runner is missing.

- [ ] **Step 3: Implement and register the runner**

Add package script:

```json
"test:expansion-contract": "node scripts/expansion/run-contracts.mjs"
```

The runner invokes only checked-in commands and accepts no shell fragments.

- [ ] **Step 4: Reach command GREEN**

Run:

```powershell
node --test scripts/expansion/run-contracts.test.mjs
npm run test:expansion-contract
```

Expected: orchestration tests and the real expansion contract pass.

- [ ] **Step 5: Commit the command slice**

```powershell
git add -- package.json scripts/expansion/run-contracts.mjs scripts/expansion/run-contracts.test.mjs
git commit -m "test: add Aurora expansion contract command"
```

---

### Task 6: Scratch Chromium Catalog Proof

**Files:**

- Create: `scripts/catalog-output-safety.test.mjs`
- Modify: `scripts/catalog-nl-p5.mjs`
- Modify: `.gitignore`
- Create: `docs/superpowers/reports/EXPANSION-PLATFORM-QA.md`

**Interfaces:**

- Catalog CLI accepts `--out-dir=<path>` for scratch evidence.
- Default canonical output remains supported only for intentional catalog
  maintenance; Program E uses explicit scratch output.
- Scratch output safety reuses `resolveSafeExpansionOutput` and writes batch
  subdirectories without following links.

- [ ] **Step 1: Write catalog scratch-safety failures**

Invoke the argument parser and output preflight against temporary roots. Prove
that canonical docs remain byte-identical in scratch mode and that protected,
production, non-empty, wrong-prefix, traversal, symlink, and junction paths fail
before profile or preview directories are created.

- [ ] **Step 2: Observe browser-harness RED**

Run:

```powershell
node --test scripts/catalog-output-safety.test.mjs
```

Expected: FAIL because `--out-dir` is not implemented.

- [ ] **Step 3: Implement guarded scratch output**

Route PNG, Markdown, evidence JSON, preview, and Playwright profile paths under
the preflighted scratch root. Add `.qa-expansion-platform-*/` to `.gitignore`.
Keep per-capture runtime error, failed request, unexpected request, useful
geometry, no-whitespace, and Docked-height assertions active.

- [ ] **Step 4: Reach harness-contract GREEN**

Run the Node safety test and `node --check scripts/catalog-nl-p5.mjs`.

- [ ] **Step 5: Build exact reviewed source and run both batches**

Run:

```powershell
npm run build:preview
node scripts/catalog-nl-p5.mjs --batch=1 --out-dir=.qa-expansion-platform-final
node scripts/catalog-nl-p5.mjs --batch=2 --out-dir=.qa-expansion-platform-final
```

Expected: all 26 identities and every declared free/Docked capture complete,
zero unexpected external requests, runtime errors, and failed requests.

- [ ] **Step 6: Inspect representative originals**

Open and judge at original resolution:

```text
weather-full.png
bookmarks-standard.png
notes-compact.png
github-full.png
status-docked.png
monthCal-standard.png
```

Record per-capture usefulness, no-whitespace, legibility, content-tight bounds,
and Docked-line judgment in the QA report. Record real-screen-reader and live
credential/provider combinations as manual ceilings.

- [ ] **Step 7: Commit the browser-proof slice**

```powershell
git add -- .gitignore scripts/catalog-nl-p5.mjs scripts/catalog-output-safety.test.mjs docs/superpowers/reports/EXPANSION-PLATFORM-QA.md
git commit -m "test: witness Aurora expansion platform"
```

---

### Task 7: Review, Stabilization, and Checkpoint

**Files:**

- Modify: `docs/superpowers/plans/2026-08-22-aurora-expansion-platform-implementation.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `README.md`

**Interfaces:** None. This task records exact evidence and the next Program F
packet boundary.

- [ ] **Step 1: Request one bounded implementation review**

Give the reviewer the exact implementation range and ask for Critical,
Important, and Minor findings against spec acceptance criteria, scaffold path
safety, JSON/Markdown consistency, real authority independence, secret leakage,
origin ownership, visual-catalog completeness, frozen boundaries, and test
claims.

- [ ] **Step 2: Apply at most one confirmed-finding fix cycle**

For every Critical or Important finding, first write and observe a focused RED,
then make the minimum fix and rerun the affected slice. Record Minor deferrals
in STATUS. Ask the same reviewer to rereview only the fix range.

- [ ] **Step 3: Run one stabilized final gate**

Run exactly once after review stabilization:

```powershell
npm test
npx tsc --noEmit
npm run test:information-first-contract
npm run test:expansion-contract
node --test scripts/verify-output-safety.test.mjs scripts/catalog-output-safety.test.mjs
npm run build:preview
git diff --check
```

Run the final scratch Chromium catalog only if review fixes touched the harness,
manifest, renderer keys, tier contracts, or browser-visible code. Otherwise
retain Task 6 evidence from the exact reviewed commit and rebuild `dist` after
the documentation commit.

- [ ] **Step 4: Update durable ledgers**

Record exact commit range, RED/GREEN evidence, reviewer verdict, final counts,
capture counts, representative judgments, manual ceilings, Store prohibition,
active/protected proof, and Program F browser-native as next. Add A2-D066:
Expansion Platform is a developer-facing safety system, not runtime authority.

- [ ] **Step 5: Checkpoint, push, and prove repositories**

```powershell
git add -- README.md docs/superpowers/plans/2026-08-22-aurora-expansion-platform-implementation.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md docs/superpowers/reports/EXPANSION-PLATFORM-QA.md
git commit -m "docs: checkpoint Aurora expansion platform"
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git rev-parse origin/feat/aurora-2-observatory
```

In `D:\DEV\Chrome plugin`, prove branch `main`, exact
`eb1354b6a5b041fb6d494655c3dae1862572bc51`, and clean status. Re-read the
continuous roadmap, STATUS, and A2-D066, then proceed directly to the Program F
browser-native design unless a genuine authority blocker exists.
