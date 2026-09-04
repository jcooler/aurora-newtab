# Tab Two Paid MVP Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the complete free and paid Tab Two product, add polished self-service Help and user-reviewed redacted diagnostics, remove deferred fitness from launch-facing surfaces, and bind the final automated evidence and owner checklist to one production artifact.

**Architecture:** Preserve the existing local-first extension, account, billing, sync, Metrics, and two calendar-provider boundaries. Add one pure allowlist-based diagnostic formatter and one dedicated Help Settings surface; diagnostics are assembled locally from already-rendered status summaries and are never transmitted. A single PM-P9 matrix and runner compose the existing exact Chromium gates rather than replacing their specialist coverage, while a final release dossier distinguishes automated proof, inherited hosted evidence, external launch prerequisites, and honest manual ceilings.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4, Vitest and Testing Library, Node test runner, Playwright Chromium with an unpacked MV3 build, Vite/CRXJS, local Supabase CLI/pgTAP/Deno tests, Markdown evidence ledgers.

**Spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; preserve `D:\DEV\Chrome plugin` and every protected untracked path.
- Keep every current local capability and all 15 existing free connectors free; premium remains additive.
- Fitness is not a paid-MVP launch dependency. Do not add or register Strava, MyFitnessPal, Fitbit, WHOOP, Polar, or any other fitness provider in this packet.
- Keep the legacy `strava` capability and `fitness` Metrics schema readable for compatibility with already-issued leases and any historical local aggregate bucket, but do not advertise, issue through new preview fixtures, collect, or render them in the paid-MVP product.
- Free local use must make zero Tab Two backend requests. Sign-in alone must not enable sync or upload local product data.
- Diagnostics are local, allowlist-only, reviewed before download, and never transmitted by Tab Two. They exclude account ids, email, display name, device ids/names, tokens, capability URLs, task/event/habit/focus text, raw Metrics values, provider payloads, browsing information, logs, and local storage contents.
- Use the approved Tab Two dark surfaces, restrained cyan accent, Space Grotesk display hierarchy, Inter body copy, calm hairlines, visible keyboard focus, 44 CSS px coarse-pointer targets, and reduced-motion behavior. Add no new dependency.
- Keep layouts explicit and manually switchable. Do not auto-switch layouts, silently migrate placements, or make ordinary clicks select widgets.
- Run local tests and installed-extension automation during implementation. Reserve the cumulative stable-Chrome, real-provider, assistive-technology, physical-device, and MacBook checks for the final owner handoff.
- Do not provision or upgrade paid infrastructure, create or reveal secrets, change production permissions, deploy functions or migrations, merge, package for release, mutate Chrome Web Store state, publish, or roll out without a separately recorded owner gate.
- Every Critical or Important defect blocks the dossier. Use one bounded review/fix/rereview cycle, then one stabilized full gate.

## File Structure

- `src/support/diagnostics.ts`: pure diagnostic schema, strict formatter, serialization, and filename generation.
- `src/support/diagnostics.test.ts`: allowlist, deterministic ordering, hostile-fixture exclusion, and validation coverage.
- `src/settings/sections/HelpSupport.tsx`: dedicated Help tab, product-health spine, recovery guidance, diagnostic review dialog, and local download action.
- `src/settings/sections/HelpSupport.test.tsx`: Help copy, status derivation, keyboard/dialog lifecycle, local-only generation, and download coverage.
- `src/settings/SettingsPanel.tsx`: add the permanent Help tab without moving or removing existing sections.
- `src/settings/SettingsPanel.test.tsx`: Settings navigation, narrow-tab reachability, focus, and no-background-work contracts.
- `src/newtab/widgets/metrics/MetricsWidget.tsx`, `src/settings/sections/MetricsHistory.tsx`, `src/newtab/widgetSizeContracts.ts`: stop presenting the deferred Fitness category.
- `src/account/previewAccountClient.ts`: stop issuing the deferred capability in new preview fixtures while leaving signed-lease parsing backward compatible.
- `src/privacy/dataFlows.ts`: describe only the five launch Metrics categories.
- Matching focused tests and Metrics QA fixtures: preserve historical parsing while proving no launch-facing Fitness copy.
- `scripts/paid-mvp-qa-matrix.mjs`: exact widget/state, feature-flow, viewport, interaction, storage, request, accessibility, and manual-ceiling inventory.
- `scripts/qa-paid-mvp-stabilization.test.mjs`: contract tests for complete registry/matrix/evidence coverage.
- `scripts/qa-paid-mvp-support.mjs`: installed-extension Help/diagnostic QA and original-resolution captures.
- `scripts/qa-paid-mvp-stabilization.mjs`: fail-fast orchestration and final evidence index for existing specialist gates plus PM-P9 support QA.
- `package.json`: pin the PM-P9 contract, support QA, and full stabilization commands.
- `README.md`, `PRIVACY.md`, `TERMS.md`: reconcile current account, billing, sync, Metrics, provider, diagnostic, support, and deletion behavior.
- `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`: remove Strava from the active provider trust boundary and incident runbook while documenting compatibility-only schema acceptance.
- `docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`: retain one cumulative end-of-development owner checklist.
- `docs/superpowers/reports/TAB-TWO-PAID-MVP-RELEASE-DOSSIER.md`: exact source/build/evidence binding, results, launch blockers, rollback, and manual ceilings.
- `docs/superpowers/aurora-2/{STATUS,ROADMAP,DECISIONS}.md`: final packet state and explicit non-authorization of release actions.

---

### Task 1: Remove Deferred Fitness From Launch-Facing Product Surfaces

**Files:**
- Modify: `src/account/previewAccountClient.ts`
- Modify: `src/newtab/widgets/metrics/MetricsWidget.tsx`
- Modify: `src/newtab/widgets/metrics/MetricsWidget.test.tsx`
- Modify: `src/settings/sections/MetricsHistory.tsx`
- Modify: `src/settings/sections/MetricsHistory.test.tsx`
- Modify: `src/newtab/widgetSizeContracts.ts`
- Modify: `src/newtab/widgetSizeContracts.test.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/privacy/dataFlows.test.ts`
- Modify: `scripts/qa-tab-two-metrics.mjs`
- Modify: `scripts/qa-tab-two-metrics.test.mjs`
- Modify: `scripts/qa-metrics-mockups.mjs`

**Interfaces:**
- Consumes: the existing `PremiumCapability`, `MetricSource`, `MetricsHistoryV1`, and signed-lease parsers.
- Produces: a five-category launch presentation (`Habits`, `Focus`, `Tasks`, `Calendar`, `Development`) while legacy `strava` capabilities and `fitness` buckets remain parseable but inert.

- [ ] **Step 1: Write the failing public-surface tests**

Add assertions that an active preview lease is issued without `strava`, Metrics renders the five launch categories without `Fitness`, Metrics history omits the Fitness filter/label, and privacy copy names no fitness collection. Keep one history-domain test that proves an old fitness bucket still parses.

```ts
expect(activeSnapshot.lease?.capabilities).toEqual([
  'encrypted_sync',
  'multi_account',
  'metrics_history',
  'google_calendar',
  'microsoft_calendar',
])
expect(screen.queryByText('Fitness')).toBeNull()
expect(STORED_DATA_FLOWS.metricsHistory.description).not.toMatch(/fitness|strava/i)
expect(() => assertMetricBucket(legacyFitnessBucket)).not.toThrow()
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npx vitest run src/newtab/widgets/metrics/MetricsWidget.test.tsx src/settings/sections/MetricsHistory.test.tsx src/newtab/widgetSizeContracts.test.ts src/privacy/dataFlows.test.ts src/metrics/history.test.ts src/account/createAccountClient.test.ts
node --test scripts/qa-tab-two-metrics.test.mjs
```

Expected: failures show the preview grant and launch presentation still contain `strava` or `Fitness`; the legacy bucket assertion passes.

- [ ] **Step 3: Implement the compatibility boundary**

Remove `strava` only from the preview capability array and remove Fitness rows, labels, selected-content requirements, screenshots, and public privacy wording. Do not remove it from `PremiumCapability`, `entitlementLease.ts`, `supabase/functions/_shared/lease.ts`, installed migrations, or the Metrics wire schema. Do not add a replacement provider.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the commands from Step 2.

Expected: all selected Vitest and Node tests pass; the old fitness bucket remains readable and no launch-facing source contains a Fitness row.

- [ ] **Step 5: Commit the bounded deferral correction**

```powershell
git add src/account/previewAccountClient.ts src/newtab/widgets/metrics/MetricsWidget.tsx src/newtab/widgets/metrics/MetricsWidget.test.tsx src/settings/sections/MetricsHistory.tsx src/settings/sections/MetricsHistory.test.tsx src/newtab/widgetSizeContracts.ts src/newtab/widgetSizeContracts.test.ts src/privacy/dataFlows.ts src/privacy/dataFlows.test.ts scripts/qa-tab-two-metrics.mjs scripts/qa-tab-two-metrics.test.mjs scripts/qa-metrics-mockups.mjs
git commit -m "fix: remove deferred fitness from paid MVP surfaces"
```

### Task 2: Build the Allowlist-Only Diagnostic Domain

**Files:**
- Create: `src/support/diagnostics.ts`
- Create: `src/support/diagnostics.test.ts`

**Interfaces:**
- Consumes: `AccountSnapshot`, `SyncViewState`, `__APP_VERSION__`, and an injected timestamp.
- Produces: `createDiagnosticReport(input: DiagnosticInput): DiagnosticReportV1`, `serializeDiagnosticReport(report): string`, and `diagnosticFilename(report): string`.

- [ ] **Step 1: Write the failing diagnostic-contract tests**

Use hostile fixtures containing realistic emails, UUIDs, device names, tokens, provider URLs, event text, task text, raw Metrics values, and nested unknown properties. Assert exact deep equality with the allowed result and scan serialized output for every forbidden sentinel.

```ts
expect(createDiagnosticReport(input)).toEqual({
  product: 'Tab Two',
  schemaVersion: 1,
  generatedAt: '2026-09-03T18:00:00.000Z',
  appVersion: '2.0.0',
  account: { mode: 'signed_in', billingState: 'active', plan: 'annual', leasePresent: true },
  sync: {
    enabled: true,
    phase: 'needs_attention',
    attention: 'offline',
    usedBytes: 128,
    quotaBytes: 2_097_152,
    activeDeviceCount: 2,
    revokedDeviceCount: 1,
    recoveryCount: 1,
    lastSuccessAt: '2026-09-03T17:55:00.000Z',
  },
})
for (const forbidden of forbiddenSentinels) {
  expect(serializeDiagnosticReport(report)).not.toContain(forbidden)
}
```

- [ ] **Step 2: Run the diagnostic tests and verify RED**

Run:

```powershell
npx vitest run src/support/diagnostics.test.ts
```

Expected: FAIL because the diagnostic module does not exist.

- [ ] **Step 3: Implement the minimal pure formatter**

Define a closed `DiagnosticReportV1` object with exact keys. Select only enum values, booleans, bounded counts/byte totals, and ISO timestamps from known typed fields. Never spread an input object, enumerate arbitrary keys, call storage, inspect `navigator`, or accept logs and free text.

```ts
export function createDiagnosticReport(input: DiagnosticInput): DiagnosticReportV1 {
  return Object.freeze({
    product: 'Tab Two',
    schemaVersion: 1,
    generatedAt: iso(input.now),
    appVersion: input.appVersion,
    account: Object.freeze({
      mode: input.account.mode,
      billingState: input.account.billing.state,
      plan: input.account.billing.plan,
      leasePresent: input.account.lease !== null,
    }),
    sync: Object.freeze({
      enabled: input.sync.enabled,
      phase: input.sync.phase,
      attention: input.sync.attention,
      usedBytes: input.sync.usedBytes,
      quotaBytes: input.sync.quotaBytes,
      activeDeviceCount: input.sync.devices.filter((device) => !device.revoked).length,
      revokedDeviceCount: input.sync.devices.filter((device) => device.revoked).length,
      recoveryCount: input.sync.recoveries.length,
      lastSuccessAt: input.sync.lastSuccessAt === null ? null : iso(input.sync.lastSuccessAt),
    }),
  })
}
```

- [ ] **Step 4: Run the diagnostic tests and verify GREEN**

Run:

```powershell
npx vitest run src/support/diagnostics.test.ts
```

Expected: all tests pass, exact serialization is deterministic, and hostile sentinels are absent.

- [ ] **Step 5: Commit the diagnostic domain**

```powershell
git add src/support/diagnostics.ts src/support/diagnostics.test.ts
git commit -m "feat: add local redacted diagnostics"
```

### Task 3: Add the Help and Troubleshooting Experience

**Files:**
- Create: `src/settings/sections/HelpSupport.tsx`
- Create: `src/settings/sections/HelpSupport.test.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/settings/Tabs.tsx`
- Modify: `src/settings/Tabs.test.tsx`

**Interfaces:**
- Consumes: `useAccount()`, `useSync()`, `createDiagnosticReport`, `serializeDiagnosticReport`, `diagnosticFilename`, `btnPrimary`, `btnQuiet`, and existing dialog focus helpers.
- Produces: a permanent `help` Settings tab, local status summary, self-service recovery instructions, and a review-before-download diagnostic dialog.

- [ ] **Step 1: Write the failing Help behavior tests**

Cover local, active, canceling, past-due, sync-disabled, protected, offline, and needs-attention summaries; exact recovery copy for billing, sync, Google Calendar, Microsoft Calendar, backup, and deletion; report preview before download; cancel without side effects; keyboard Escape; invoker focus restoration; and no fetch/storage writes.

```tsx
fireEvent.click(screen.getByRole('tab', { name: 'Help' }))
expect(screen.getByRole('heading', { name: 'Keep Tab Two working' })).toBeTruthy()
expect(screen.getByText('Your diagnostic stays on this device until you download it.')).toBeTruthy()
fireEvent.click(screen.getByRole('button', { name: 'Create diagnostic report' }))
expect(screen.getByRole('dialog', { name: 'Review diagnostic report' })).toBeTruthy()
expect(download).not.toHaveBeenCalled()
fireEvent.click(screen.getByRole('button', { name: 'Download report' }))
expect(download).toHaveBeenCalledTimes(1)
expect(fetch).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run the Help tests and verify RED**

Run:

```powershell
npx vitest run src/settings/sections/HelpSupport.test.tsx src/settings/SettingsPanel.test.tsx src/settings/Tabs.test.tsx
```

Expected: FAIL because the Help tab and component do not exist.

- [ ] **Step 3: Implement the intentional Tab Two design**

Use a quiet status spine instead of a generic card dashboard: one restrained cyan vertical signal line connects Account, Billing, and Sync rows; rectangular word labels carry status without decorative circles. Keep recovery topics as native disclosure sections below one clear headline. Use the existing Space Grotesk/Inter hierarchy and existing theme tokens only.

```text
HELP
Keep Tab Two working
Quick checks for your account, sync, billing, and calendars.

| Account       Signed in
| Billing       Active
| Sync          Desktop is protected

Troubleshooting
  Sign-in and billing      >
  Encrypted sync           >
  Google Calendar          >
  Microsoft Calendar       >
  Backup and deletion      >

Diagnostic report
Review a small technical summary before downloading it.
[ Create diagnostic report ]
```

On narrow Settings, make the tab list horizontally scrollable with `overflow-x-auto` and each tab `shrink-0`; do not cause page-level horizontal overflow or add a vertical scroll owner. All motion is short opacity/color feedback and is disabled by `motion-reduce`.

- [ ] **Step 4: Implement review-before-download**

The Create action formats a report in memory and opens a modal containing a plain-language exclusion summary plus a read-only `<pre>` preview. Only `Download report` creates a Blob and clicks a temporary local anchor. The component has no upload/send action. `Cancel` and Escape discard the in-memory report and restore focus.

- [ ] **Step 5: Run the Help tests and verify GREEN**

Run the commands from Step 2.

Expected: all tests pass with no network call, no storage mutation, correct focus lifecycle, and all seven tabs reachable at narrow width.

- [ ] **Step 6: Commit the Help surface**

```powershell
git add src/settings/sections/HelpSupport.tsx src/settings/sections/HelpSupport.test.tsx src/settings/SettingsPanel.tsx src/settings/SettingsPanel.test.tsx src/settings/Tabs.tsx src/settings/Tabs.test.tsx
git commit -m "feat: add help and diagnostic review"
```

### Task 4: Add Installed-Extension Help and Diagnostic QA

**Files:**
- Create: `scripts/qa-paid-mvp-support.mjs`
- Create: `scripts/qa-paid-mvp-support.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: an exact production `dist`, build provenance, Playwright, the unpacked-extension launch pattern, and the Help tab controls from Task 3.
- Produces: `artifacts/qa-paid-mvp-support/<commit>/evidence.json`, original-resolution PNGs, and a zero-request/zero-write diagnostic interaction ledger.

- [ ] **Step 1: Write the failing harness contract**

Require desktop `1600x900`, short `1408x600`, ultrawide `3440x1440`, high-density `2560x1440` at device scale factor 2, and touch-narrow `390x844`. Require navigation, every disclosure, preview, cancel, download, focus restoration, keyboard traversal, reduced motion, tab overflow containment, one vertical Settings scroll owner, and original-resolution screenshot paths.

```js
for (const id of ['desktop', 'short', 'ultrawide', 'high-density', 'touch-narrow']) {
  assert.equal(evidence.viewports.find((entry) => entry.id === id)?.result, 'PASS')
}
assert.deepEqual(evidence.requestLedger, [])
assert.deepEqual(evidence.storageWrites, [])
assert.deepEqual(evidence.consoleErrors, [])
assert.deepEqual(evidence.pageErrors, [])
assert.deepEqual(evidence.failedRequests, [])
```

- [ ] **Step 2: Run the harness contract and verify RED**

Run:

```powershell
node --test scripts/qa-paid-mvp-support.test.mjs
```

Expected: FAIL because the harness module and package command do not exist.

- [ ] **Step 3: Implement the installed-extension harness**

Follow the existing `qa-account-sync-shell.mjs` launch, ledger, geometry, and exact-build conventions. Seed deterministic preview account/sync states without owner data. Intercept Blob downloads in the page, parse the JSON, assert its exact key set, and scan it for fixture secrets. Save one closed-topic desktop capture, one open-troubleshooting capture, one report-review capture, and one contained capture for every remaining viewport.

- [ ] **Step 4: Run the contract and exact browser witness**

Run:

```powershell
npm run build
node --test scripts/qa-paid-mvp-support.test.mjs
npm run qa:paid-mvp-support -- --exact
```

Expected: contract and browser witness pass; every ledger is empty; all controls remain contained and operable.

- [ ] **Step 5: Inspect every retained PNG at original resolution**

Use the local image viewer at original detail. Record a specific PASS/FAIL judgment for hierarchy, copy, focus, disclosure layout, diagnostic preview, narrow tab access, contrast, clipping, overlap, viewport escape, and scroll ownership in the generated evidence judgment file.

- [ ] **Step 6: Commit the support QA harness**

```powershell
git add scripts/qa-paid-mvp-support.mjs scripts/qa-paid-mvp-support.test.mjs package.json package-lock.json
git commit -m "test: add paid MVP support QA"
```

### Task 5: Define the Complete Paid-MVP Regression Matrix

**Files:**
- Create: `scripts/paid-mvp-qa-matrix.mjs`
- Create: `scripts/qa-paid-mvp-stabilization.test.mjs`
- Create: `scripts/qa-paid-mvp-stabilization.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: current widget registry source, connector registry source, existing exact QA commands, and their machine-readable evidence contracts.
- Produces: `PAID_MVP_WIDGET_MATRIX`, `PAID_MVP_FLOW_MATRIX`, `PAID_MVP_MANUAL_CEILINGS`, `assertPaidMvpEvidenceIndex(index)`, and `artifacts/qa-paid-mvp-stabilization/<commit>/evidence.json`.

- [ ] **Step 1: Write the failing completeness tests**

Parse the committed registry sources to compare exact widget and connector ids against the matrix. Require each widget's supported Compact/Standard/Full/Docked/Stacked presentations and applicable empty/loading/ready/stale/error/permission/reconnect/Manual/locked/entitled states. Require flows for drag/drop, keyboard, touch, named layouts, stacks, docks, persistence, account, billing, sync, Metrics, both paid calendars, quota, conflicts, deletion, backup, Help, and diagnostics.

```js
assert.deepEqual(matrixWidgetIds, registryWidgetIds)
assert.deepEqual(matrixConnectorIds, registryConnectorIds)
for (const row of PAID_MVP_WIDGET_MATRIX) {
  assert(row.presentations.length > 0, `${row.id} has no presentation coverage`)
  assert(row.states.includes('ready'), `${row.id} lacks ready-state coverage`)
  assert(row.evidence.length > 0, `${row.id} has no executable evidence owner`)
}
```

- [ ] **Step 2: Run the matrix tests and verify RED**

Run:

```powershell
node --test scripts/qa-paid-mvp-stabilization.test.mjs
```

Expected: FAIL because the matrix and orchestrator do not exist.

- [ ] **Step 3: Implement the declarative matrix**

Every state is either `automated`, `manual-ceiling`, or `not-applicable`, with an evidence owner and reason. Do not mark native permission prompts, real provider consent/revocation, real assistive-technology speech, physical touch/trackpad, mixed-DPI hardware, or MacBook behavior automated.

- [ ] **Step 4: Implement the fail-fast evidence orchestrator**

The runner checks exact tracked status and build provenance, invokes the selected existing specialist gates, reads their evidence JSON, and writes only an index containing the command, result, source commit, build commit, evidence path, screenshot count, and ledger totals. It must not copy secrets, fixture payloads, local storage values, provider data, or screenshots into the index.

The composed exact gates are:

```text
qa:free-baseline
qa:widget-redesign-production
qa:canvas-polish
qa:tab-two-v2-connectors
qa:tab-two-v2-progress
qa:account-auth-production
qa:stripe-billing
qa:account-sync-shell
qa:tab-two-metrics
qa:google-calendar
qa:microsoft-calendar
qa:paid-mvp-support
```

- [ ] **Step 5: Run the matrix contract and verify GREEN**

Run:

```powershell
node --test scripts/qa-paid-mvp-stabilization.test.mjs
```

Expected: all matrix, registry, evidence-index, manual-ceiling, and command-list tests pass.

- [ ] **Step 6: Commit the matrix and runner**

```powershell
git add scripts/paid-mvp-qa-matrix.mjs scripts/qa-paid-mvp-stabilization.test.mjs scripts/qa-paid-mvp-stabilization.mjs package.json package-lock.json
git commit -m "test: compose paid MVP stabilization gate"
```

### Task 6: Run the Source, Database, Edge, Security, and Build Gates

**Files:**
- Modify only when a failing Critical or Important regression has an identified owning source/test pair.

**Interfaces:**
- Consumes: the complete source tree at the current checkpoint.
- Produces: a green source-level gate before expensive browser replay.

- [ ] **Step 1: Run focused PM-P9 tests**

```powershell
npx vitest run src/support/diagnostics.test.ts src/settings/sections/HelpSupport.test.tsx src/settings/SettingsPanel.test.tsx src/settings/Tabs.test.tsx src/newtab/widgets/metrics/MetricsWidget.test.tsx src/settings/sections/MetricsHistory.test.tsx src/privacy/dataFlows.test.ts src/metrics/history.test.ts
node --test scripts/qa-paid-mvp-support.test.mjs scripts/qa-paid-mvp-stabilization.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the complete extension and Node contract suites**

```powershell
npm test
npm run test:expansion-contract
npm run test:information-first-contract
npm run test:widget-redesign-catalog
npm run test:billing-return-site
npm run test:billing-return-production-contract
npx tsc --noEmit
```

Expected: PASS with no new warning treated as success.

- [ ] **Step 3: Run local database and Edge Function tests**

```powershell
npm run test:supabase-local
supabase db lint --local --level error
deno test --allow-env --allow-net supabase/functions/tests
```

Expected: pgTAP, database lint, and Edge tests pass. This local test reset is not permission to touch the hosted project.

- [ ] **Step 4: Run dependency and source-secret gates**

```powershell
npm audit --audit-level=high
rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' --glob '!artifacts/**' "sk_(live|test)_|whsec_|sb_secret_|service_role|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|client_secret" .
git diff --check
```

Expected: no high/critical audit finding, no committed secret value, and no whitespace error. Public test marker names may appear only in assertions or documentation and must be inspected, not blindly treated as credentials.

- [ ] **Step 5: Build and scan exact production/preview/restored-production outputs**

```powershell
npm run build
npm run build:preview
npm run build
```

For each build, verify `dist/build-provenance.json`, manifest permissions/hosts, absence of preview fixtures in production, absence of secret patterns, and no fitness-provider origin or runtime module.

- [ ] **Step 6: Correct only confirmed blockers with TDD**

For each Critical or Important failure, identify the owning module, add one focused failing regression at that boundary, make the smallest production change, rerun that focused test, and record the finding and proof in the dossier. Recommendations and cosmetic preferences do not block this task.

- [ ] **Step 7: Commit any focused stabilization correction**

Stage only the exact owning source/test files and use a scoped `fix:` commit. If no source correction was needed, do not create an empty commit.

### Task 7: Execute the Exact Installed-Extension Matrix

**Files:**
- Generate only: `artifacts/qa-*/<exact-commit>/...`
- Modify only if a confirmed Critical or Important browser defect requires a focused RED/GREEN correction.

**Interfaces:**
- Consumes: one clean exact production commit and the composed runner from Task 5.
- Produces: one machine-readable PM-P9 evidence index bound to that commit and its production artifact.

- [ ] **Step 1: Establish exact-build preconditions**

```powershell
git status --short --branch
git rev-parse HEAD
npm run build
Get-Content -LiteralPath dist/build-provenance.json
```

Expected: no tracked change, provenance commit equals `HEAD`, and only protected/untracked QA paths remain.

- [ ] **Step 2: Run the full installed-extension stabilization gate**

```powershell
npm run qa:paid-mvp-stabilization -- --exact
```

Expected: every specialist gate passes or the orchestrator stops at the first real failure without writing a PASS index.

- [ ] **Step 3: Inspect original-resolution evidence**

Review every final retained PNG at original resolution, using contact sheets only for triage. Confirm widget text/data fit, Settings/Help containment, Account & Sync state accuracy, Metrics legibility, Google/Microsoft picker states, focus rings, dialogs, menus, stacks, docks, short-height behavior, ultrawide geometry, high-density rendering, and touch-narrow controls.

- [ ] **Step 4: Perform the single bounded review/fix/rereview cycle**

Review the complete PM-P9 diff and evidence once. Only Critical or Important findings receive a focused regression and minimal fix. Rerun the affected specialist gate, then rerun the one full composed gate. Do not restart already-green packets or add recommendation-driven churn.

- [ ] **Step 5: Preserve the exact evidence**

Keep generated artifacts untracked unless an existing packet explicitly tracks its evidence location. Record exact paths, counts, and hashes in the dossier; never stage the protected `artifacts/` tree.

### Task 8: Reconcile Public Documentation and the Threat Model

**Files:**
- Modify: `README.md`
- Modify: `PRIVACY.md`
- Modify: `TERMS.md`
- Modify: `docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md`
- Modify: `docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`

**Interfaces:**
- Consumes: final verified runtime behavior and exact evidence from Tasks 1-7.
- Produces: public descriptions that match the artifact, a current threat boundary, and one cumulative owner checklist.

- [ ] **Step 1: Write documentation contract assertions**

Extend existing source/privacy contracts so public docs name Google and Microsoft Calendar, encrypted sync limits, Metrics retention/categories, automatic billing convergence, local diagnostic review/download, deletion consequences, best-effort support, and no fitness connector. Assert that diagnostics are never automatically sent and that users must not post a diagnostic publicly.

- [ ] **Step 2: Run the documentation contracts and verify RED**

Run the affected Vitest/Node privacy, manifest, account, and support contracts.

Expected: failures identify stale Fitness, Strava, "planned services," or missing Help/diagnostic language.

- [ ] **Step 3: Reconcile the four authorities**

Update README, Privacy, Terms, and the threat model to the verified implementation. In the threat model, change the provider trust-boundary node and secret-revocation runbook to Google and Microsoft only; add a short compatibility note that old `strava`/`fitness` enum values remain parseable but grant no connector and trigger no request. Do not claim zero knowledge, end-to-end encryption, instant remote deletion, a support SLA, provider production approval, or MacBook proof.

- [ ] **Step 4: Finalize the cumulative owner checklist**

Keep the existing PM-P4 through PM-P7 items. Add Help/diagnostic review, every required free-product interaction family, mixed-DPI, stable Chrome, real assistive technology, physical MacBook/touchpad, real provider consent/revocation, downloaded diagnostic review, and a warning never to post the report to the public issue tracker. Do not ask the owner to repeat automated-only checks.

- [ ] **Step 5: Run documentation tests and diff hygiene**

```powershell
npm test
npx tsc --noEmit
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit documentation reconciliation**

```powershell
git add README.md PRIVACY.md TERMS.md docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md docs/superpowers/reports/TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md
git commit -m "docs: reconcile paid MVP support and release scope"
```

### Task 9: Write the Exact Paid Release Dossier and Handoff

**Files:**
- Create: `docs/superpowers/reports/TAB-TWO-PAID-MVP-RELEASE-DOSSIER.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**
- Consumes: exact source/build/evidence index, specialist reports, current hosted evidence, public docs, and the cumulative owner checklist.
- Produces: a release-readiness verdict that cannot be mistaken for merge, publication, or rollout authority.

- [ ] **Step 1: Draft the dossier from machine-readable evidence**

Record exact local/upstream/remote SHA, production build provenance and hash, test counts, screenshot paths/counts, storage/request/error ledger totals, matrix coverage, original-resolution judgments, dependency audit result, secret scan result, rollback boundary, and every manual ceiling. Refer to earlier Google/Microsoft/Stripe/Supabase hosted reports by exact source SHA; do not imply their hosted code was redeployed at the PM-P9 SHA.

- [ ] **Step 2: Record unresolved external launch prerequisites honestly**

Until separately completed, list these as launch blockers rather than silently resolving them:

- monitored non-public support alias and protected escalation path;
- customer export of account metadata and the encrypted vault, plus export of a local conflict backup, if these controls are still absent at the stabilized commit; treat this as an Important product gap requiring its own approved design rather than weakening the architecture promise in documentation;
- Google/Microsoft production verification decisions where sandbox/unverified-publisher ceilings remain;
- owner stable-Chrome, real-provider, assistive-technology, physical MacBook, and mixed-DPI checklist;
- any paid Supabase/Stripe/live-mode decision;
- merge, packaging, Chrome Web Store, publication, and rollout approval.

- [ ] **Step 3: Reconcile the ledgers**

Add a decision that PM-P9 removed deferred fitness from launch presentation while preserving wire compatibility. Set ROADMAP/STATUS to `Owner QA pending` if the automated matrix is green but manual or external gates remain. Use `Verified` only for evidence actually observed.

- [ ] **Step 4: Run final documentation and repository checks**

```powershell
git diff --check
git status --short --branch
git -C 'D:\DEV\Chrome plugin' status --short --branch
```

Expected: only intended PM-P9 docs are tracked changes; the protected original and protected untracked paths are unchanged.

- [ ] **Step 5: Commit and push the dossier checkpoint**

```powershell
git add docs/superpowers/reports/TAB-TWO-PAID-MVP-RELEASE-DOSSIER.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "docs: record paid MVP stabilization dossier"
git push origin feat/aurora-2-observatory
```

- [ ] **Step 6: Prove the checkpoint and hand the owner one test list**

```powershell
git rev-parse HEAD
git rev-parse '@{upstream}'
git rev-parse origin/feat/aurora-2-observatory
git status --short --branch
git -C 'D:\DEV\Chrome plugin' status --short --branch
```

Expected: local, upstream, and remote match; only protected untracked paths remain; the protected original is clean. Present the cumulative owner checklist once, at the end. Do not merge, package, deploy, publish, or perform any Chrome Web Store action.
