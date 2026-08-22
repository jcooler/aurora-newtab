# Aurora Work Connectors Implementation Plan

> **Required execution:** Follow strict RED, GREEN, refactor ordering. Observe a
> focused failing test before each production behavior. Do not batch production
> changes ahead of their tests.

**Goal:** Ship Linear, Sentry, and Todoist as complete, privacy-bounded Aurora
connectors with four useful tiers, clear settings, exact recovery, and rebuilt
Chromium evidence.

**Architecture:** Extend the existing typed connector registry and
configuration-scoped snapshot system. Each provider gets one pure service
boundary, one settings body, and one widget renderer. Schema v17 introduces all
three identities together; the packet then implements each provider in
sequence before one integration and evidence gate.

**Design authority:**
`docs/superpowers/specs/2026-08-22-aurora-work-connectors-design.md`

## Guardrails

- Active worktree only: `D:\DEV\Chrome plugin-aurora-2`.
- Protected checkout stays read-only at exact `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- No Chrome Web Store action.
- No new dependency, OAuth, arbitrary provider host, background worker, or
  existing connector request change.
- No live credentials or provider data in tests, screenshots, logs, or docs.
- Never write legacy `layout`; preserve exact named-layout and backup recovery.
- One bounded review and at most one fix/rereview cycle for this packet.

## Task 1: Establish schema v17 and identity parity

**Tests first:**

- `src/lib/storage/migrations.test.ts`
- `src/lib/storage/index.test.ts`
- `src/services/connectors/expansionConnectorContracts.test.ts`
- `src/services/connectors/registry.test.ts`
- `src/privacy/dataFlows.test.ts`
- `src/lib/backup.test.ts`
- `src/test/connectorContractFixtures.ts`
- `src/newtab/widgetRegistry.test.ts`
- `src/newtab/widgetSizeContracts.test.ts`
- expansion contract families under `scripts/expansion`

**Production after RED:**

- `src/lib/storage/schema.ts`
- `src/lib/storage/migrations.ts`
- `src/lib/storage/index.ts`
- `src/services/connectors/types.ts`
- `src/services/connectors/registry.ts`
- `src/privacy/dataFlows.ts`
- `src/lib/backup.ts`
- `src/lib/layout/types.ts`
- `src/lib/layout/defaultPlacements.ts`
- `src/newtab/widgetRegistry.ts`
- `src/newtab/widgetSizeContracts.ts`
- catalog and expansion authority files required by the parity tests

**RED proof:**

1. Pin `CURRENT_VERSION === 17` and a 16 to 17 migration that adds exactly
   `linear`, `sentry`, and `todoist` false widget keys.
2. Pin exact preservation of every other setting, connector, snapshot, layout,
   legacy `layout`, unknown key, and source object.
3. Pin malformed schema-16 nested widget maps fail without a v17 stamp.
4. Pin exact identity parity across connector, widget, privacy, backup,
   placement, tier, settings-body, fixture, and catalog authorities.
5. Pin tokens and conservative account/resource identifiers never appear in
   prepared backup output and all three require re-entry.
6. Pin exact fixed origins, including Sentry's three official region choices.

**GREEN implementation:**

1. Add normalized Linear, Sentry, and Todoist config types and IDs.
2. Add pure descriptors with TTL, secret fields, origin ownership, backup
   redaction, identity fields, categories, and no side effects.
3. Add false defaults and one migration step; move the metadata-only floor to
   17 because migration 16 is not identity.
4. Add widget identities, default points, tier contracts, and disabled
   availability without adding placeholder presentation.
5. Extend inert contract fixtures using only reserved fake values.

**Focused gate:**

```powershell
npx vitest run src/lib/storage/migrations.test.ts src/lib/storage/index.test.ts src/services/connectors/registry.test.ts src/services/connectors/expansionConnectorContracts.test.ts src/privacy/dataFlows.test.ts src/lib/backup.test.ts src/newtab/widgetRegistry.test.ts src/newtab/widgetSizeContracts.test.ts
npm run test:expansion-contract
npx tsc --noEmit
```

**Commit:** `feat(work): establish connector identities and schema v17`

## Task 2: Add shared work-connector presentation primitives

**Tests first:**

- `src/newtab/widgets/work/WorkWidgetShell.test.tsx`
- `src/newtab/widgets/work/workPresentation.test.ts`

**Production after RED:**

- `src/newtab/widgets/work/WorkWidgetShell.tsx`
- `src/newtab/widgets/work/workPresentation.ts`

**RED proof:**

1. Cards render setup, loading, empty, hard error, retained-data error, stale,
   and ready states without blank shells.
2. Full result regions are locally bounded and scrollable.
3. Dock summaries stay dense; click and keyboard open an accessible detail
   surface with the same state truth and retry affordance.
4. Shared row metadata is soft at rest and becomes fully legible on row hover
   and focus without assuming black widget backgrounds.
5. Empty facts shrink rather than reserve whitespace.

**GREEN implementation:**

1. Reuse existing panel, focus, dialog-stack, text-tone, and safe-navigation
   primitives where applicable.
2. Keep the shell provider-neutral. Provider wording and facts stay with each
   widget.
3. Add no new storage or fetch owner.

**Focused gate:**

```powershell
npx vitest run src/newtab/widgets/work
npx tsc --noEmit
```

**Commit:** `feat(work): add truthful work widget shell`

## Task 3: Implement Linear service and request contracts

**Tests first:**

- `src/services/connectors/linear.test.ts`

**Production after RED:**

- `src/services/connectors/linear.ts`
- shared HTTP helper only if the RED requires GraphQL-specific typed handling

**RED proof:**

1. Identity request uses exactly one POST endpoint, exact authorization form,
   content type, and minimum query.
2. Work request uses bounded pagination and exact fields.
3. HTTP 200 with any GraphQL error fails and commits no partial result.
4. Invalid, null-heavy, oversized, completed, canceled, duplicate, and
   unexpected response shapes normalize safely to at most 25 active issues.
5. Team filtering, due classification, priority mapping, and cycle dates are
   deterministic at calendar and timezone edges.
6. Request failure contains no token or provider response body.

**GREEN implementation:**

1. Add typed wire shapes separate from normalized public data.
2. Export pure normalizers, config readers, `whoamiLinear`, and
   `fetchLinearWork`.
3. Keep personal API key auth distinct from OAuth bearer auth.

**Focused gate:**

```powershell
npx vitest run src/services/connectors/linear.test.ts src/services/connectors/http.test.ts
npx tsc --noEmit
```

## Task 4: Implement Linear settings and widget

**Tests first:**

- `src/settings/SettingsPanel.test.tsx`
- `src/newtab/widgets/linear/LinearWidget.test.tsx`
- `src/newtab/widgetRenderers.test.tsx`

**Production after RED:**

- `src/settings/sections/Connectors.tsx`
- `src/newtab/widgets/linear/LinearWidget.tsx`
- `src/newtab/widgetRenderers.tsx`

**RED proof:**

1. Connect requests only `api.linear.app`, validates before persist, stores the
   resolved display name, rotates epoch, and clears only Linear's snapshot.
2. Denial, invalid token, GraphQL error, reconnect, disconnect, and concurrent
   config changes preserve ownership and unrelated connectors.
3. Team checkbox picker and item-count select update from the authoritative
   map, clear only Linear's snapshot, and have Select all and Clear.
4. Disabled/incomplete config returns before the snapshot hook.
5. Compact, Standard, Full, Docked, empty, stale, loading, and both error
   families render the exact design facts.
6. Full max data scrolls locally; dock click shows top rows; links open only
   the normalized provider URL.

**Focused gate:**

```powershell
npx vitest run src/services/connectors/linear.test.ts src/newtab/widgets/linear/LinearWidget.test.tsx src/settings/SettingsPanel.test.tsx src/newtab/widgetRenderers.test.tsx
npx tsc --noEmit
```

**Commit:** `feat(work): add Linear connector and tiers`

## Task 5: Implement Sentry service and region boundary

**Tests first:**

- `src/services/connectors/sentry.test.ts`

**Production after RED:**

- `src/services/connectors/sentry.ts`

**RED proof:**

1. Region maps only to the exact global, US, or DE host and malformed stored
   values fall back without producing an arbitrary origin.
2. Request path and parameters are encoded, repeated project filters preserve
   selection order, auth is bearer, and limit is exactly 25.
3. Invalid, null-heavy, oversized, duplicate, malformed stats, and unsafe
   permalink shapes normalize safely.
4. Trend, severity, event/user counts, and recency are deterministic.
5. Errors never include token or response body.

**Focused gate:**

```powershell
npx vitest run src/services/connectors/sentry.test.ts src/services/connectors/http.test.ts
npx tsc --noEmit
```

## Task 6: Implement Sentry settings and widget

**Tests first:**

- `src/settings/SettingsPanel.test.tsx`
- `src/newtab/widgets/sentry/SentryWidget.test.tsx`
- `src/newtab/widgetRenderers.test.tsx`

**Production after RED:**

- `src/settings/sections/Connectors.tsx`
- `src/newtab/widgets/sentry/SentryWidget.tsx`
- `src/newtab/widgetRenderers.tsx`

**RED proof:**

1. Region is selected before connect, requests one exact region origin, and
   cannot change while retaining the existing token.
2. Organization validation precedes persistence; project picker uses provider
   project facts, not comma-separated entry.
3. Picker/count changes clear only Sentry; disconnect releases only its
   unshared selected-region origin.
4. Every tier and degraded state is useful, Full max data scrolls locally,
   and Docked detail explains the top issue rather than showing unexplained
   counts.
5. No provider mutation exists in production source.

**Focused gate:**

```powershell
npx vitest run src/services/connectors/sentry.test.ts src/newtab/widgets/sentry/SentryWidget.test.tsx src/settings/SettingsPanel.test.tsx src/newtab/widgetRenderers.test.tsx
npx tsc --noEmit
```

**Commit:** `feat(work): add Sentry connector and tiers`

## Task 7: Implement Todoist service and bounded pagination

**Tests first:**

- `src/services/connectors/todoist.test.ts`

**Production after RED:**

- `src/services/connectors/todoist.ts`
- `src/services/connectors/http.ts` only if a typed empty-body POST helper is
  required by the RED

**RED proof:**

1. Project and task GETs use exact v1 paths and bearer auth.
2. Cursor pagination preserves parameters, stops after two pages, rejects a
   third cursor as incomplete, and never treats a temporary ID as actionable.
3. Invalid, null-heavy, duplicate, oversized, undated, completed, and malformed
   due shapes normalize safely to at most 25 due tasks.
4. Local-day overdue/today/upcoming classification respects date-only values,
   RFC3339 values, timezone offsets, DST, and recurring facts.
5. Close uses one exact encoded task path, POST, no body, and accepts only the
   documented success response.
6. Errors never include token, task title, or provider response body.

**Focused gate:**

```powershell
npx vitest run src/services/connectors/todoist.test.ts src/services/connectors/http.test.ts
npx tsc --noEmit
```

## Task 8: Implement Todoist settings, widget, and confirmation

**Tests first:**

- `src/settings/SettingsPanel.test.tsx`
- `src/newtab/widgets/todoist/TodoistWidget.test.tsx`
- `src/newtab/widgetRenderers.test.tsx`

**Production after RED:**

- `src/settings/sections/Connectors.tsx`
- `src/newtab/widgets/todoist/TodoistWidget.tsx`
- `src/newtab/widgetRenderers.tsx`

**RED proof:**

1. Connect validates through projects before persistence, requests only
   `api.todoist.com`, rotates epoch, and exposes a real project checkbox picker.
2. Picker/count changes and disconnect preserve unrelated connectors and
   snapshots.
3. All tiers and degraded states are useful; Full max data scrolls locally;
   Docked detail shows named tasks and due context.
4. Open task uses the exact app deep link.
5. Complete opens a named confirmation. Cancel sends no request/write.
   Confirm is single-flight, closes exactly once, clears only Todoist's
   snapshot on success, refreshes, preserves data with an inline retryable
   error on failure, and restores focus.

**Focused gate:**

```powershell
npx vitest run src/services/connectors/todoist.test.ts src/newtab/widgets/todoist/TodoistWidget.test.tsx src/settings/SettingsPanel.test.tsx src/newtab/widgetRenderers.test.tsx
npx tsc --noEmit
```

**Commit:** `feat(work): add Todoist connector and confirmed completion`

## Task 9: Close cross-authority contracts and catalog research

**Tests first:**

- addition and catalog contract tests that fail on any omitted identity,
  region origin, tier, backup rule, fixture, renderer, settings body, or
  capture family

**Production/docs after RED:**

- `docs/superpowers/catalog/expansion/candidates.json`
- generated `docs/superpowers/catalog/expansion/CATALOG.md`
- `src/test/connectorContractFixtures.ts`
- catalog capture manifest and fixture files
- privacy and adding-capability docs if the live contract requires an update

**Actions:**

1. Update the three candidate rows from research promises to exact shipped
   request, cache, setup, permission, privacy, and tier contracts.
2. Record Sentry's three fixed region origins.
3. Regenerate the catalog from JSON and prove byte stability.
4. Run deliberate omission tests for every new authority.

**Gate:**

```powershell
npm run test:expansion-contract
npx vitest run src/services/connectors src/privacy src/lib/backup.test.ts src/newtab/widgetRegistry.test.ts src/newtab/widgetSizeContracts.test.ts
npx tsc --noEmit
git diff --check
```

**Commit:** `test(work): close connector expansion contracts`

## Task 10: Build the guarded Chromium witness

**Tests first:**

- `scripts/preview-work-connectors.test.mjs`

**Harness after RED:**

- `scripts/preview-work-connectors.mjs`
- ignored `.qa-work-connectors-*` output families

**Required assertions:**

1. Refuse dirty tracked source, wrong commit, unsafe output, live-looking token,
   unexpected request, console/page/request failure, or external URL.
2. Seed existing-layout-shaped schema-v17 storage and inert scoped snapshots.
3. Capture all four tiers and every degraded family for all three widgets at
   1600x900 and exact 1408x445.
4. Capture maximum 25-item Full cards and assert measured local overflow.
5. Click every Docked line and assert contextual detail plus height at or below
   the Dock contract.
6. Exercise setup denial/success/reconnect/disconnect and exact origins.
7. Exercise checkbox pickers and item counts with exact connector-only writes.
8. Exercise provider deep links without external navigation.
9. Exercise Todoist completion Cancel, confirm, double-confirm protection,
   success refresh, and failure recovery.
10. Compare the complete storage document, allowing only the stage's explicit
    connector config or snapshot write. Fail on legacy `layout` or unrelated
    mutation.
11. Assert exact request methods, URLs, headers by redacted shape, body/query
    families, count, and provider isolation.
12. Produce original PNGs, contact sheets, machine evidence, and a report
    source summary tied to the exact reviewed commit.

**Gate:**

```powershell
node --test scripts/preview-work-connectors.test.mjs
npm run build
node scripts/preview-work-connectors.mjs --expected-commit=(git rev-parse HEAD)
```

Inspect every original-resolution capture. Contact sheets alone do not count.

**Commit:** `test(work): add connector Chromium evidence`

## Task 11: Stabilized packet gate

Run once after the focused families are green:

```powershell
npm test
npx tsc --noEmit
npm run test:expansion-contract
node --test scripts/preview-work-connectors.test.mjs
npm run build
git diff --check
```

Then rebuild `dist` from the exact review commit and run the Chromium witness.
Record module count, test counts, capture counts, request counts, write counts,
local-overflow measurements, runtime failures, and manual-inspection scope.

## Task 12: Bounded review, one fix cycle, and checkpoint

1. Commit the review candidate with no ledger edits mixed into production.
2. Request one bounded review of the full Work wave range. Ask for Critical,
   Important, Minor, plan deviations, and a Ready verdict.
3. If Critical or Important findings exist, observe focused RED tests, apply one
   bounded fix commit, rerun affected gates and Chromium evidence, then request
   one rereview from the same reviewer.
4. Update:
   - `docs/superpowers/reports/WORK-CONNECTORS-QA.md`
   - `docs/superpowers/aurora-2/STATUS.md`
   - `docs/superpowers/aurora-2/ROADMAP.md`
   - `docs/superpowers/aurora-2/DECISIONS.md`
5. Commit the checkpoint and push.
6. Prove active HEAD equals origin, active tree clean, protected checkout exact
   and clean, and no Store action.
7. Continue directly to the At-a-glance wave without asking for routine
   continuation.

