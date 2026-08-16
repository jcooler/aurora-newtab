# W6-P3 Official Policy and Dashboard Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify current official Chrome/Google extension policy, reconcile Aurora's tracked privacy/Data Usage/listing source with final behavior, and record the exact live-dashboard evidence the user must supply without mutating Chrome Web Store state.

**Architecture:** Treat official Chrome/Google pages as the current policy authority and `src/privacy/dataFlows.ts` as the executable behavior inventory. Derive repository disclosure copy and an exact dashboard comparison worksheet from those two sources. Keep all Store/dashboard access read-only; pause only at evidence that requires the user's signed-in dashboard.

**Tech Stack:** Markdown, TypeScript/Vitest, Chrome Extensions documentation, Chrome Web Store Program Policies.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 14 and 16; `docs/superpowers/aurora-2/ROADMAP.md` W6-P3.

## Global Constraints

- Use only current official Chrome/Google primary sources for policy conclusions.
- Do not infer the live Store version or dashboard answers from repository files.
- Do not upload, submit, publish, roll out, replace live assets, or edit the live listing.
- Preserve the frozen registry/schema, stored-data, migration, privacy behavior, permission, connector, and protected-original contracts.
- Apply one implementation review and at most one fix/rereview cycle; only Critical/Important written-acceptance failures block.
- Do not rerun product unit/build/browser gates for policy/report-only edits. Run only focused source-contract tests if executable disclosure constants change.

---

### Task 1: Current official policy baseline

**Files:**
- Create: `docs/superpowers/aurora-2/W6-P3-POLICY-DASHBOARD-RECONCILIATION.md`

**Interfaces:**
- Consumes: current official Chrome Web Store Program Policies, User Data Policy/FAQ, permission guidance, listing requirements, and `src/privacy/dataFlows.ts`.
- Produces: dated policy requirements with direct official URLs, Aurora applicability, and a dashboard evidence checklist.

- [ ] **Step 1: Read current primary policy sources**

Verify the current Chrome Web Store Program Policies, user-data disclosure/Limited Use requirements, single-purpose rule, permission minimum-use rule, privacy-policy requirement, and listing metadata rules. Record the access date and direct official URLs.

- [ ] **Step 2: Map each rule to Aurora behavior**

For every applicable rule, record `Compliant`, `Source change required`, or `Dashboard evidence required`. Do not invent stricter criteria than the official text or packet acceptance.

- [ ] **Step 3: Define exact dashboard evidence**

Request only the current live item version and the visible dashboard values needed to compare listing, privacy URL, single-purpose explanation, permission justifications, data-use selections, and Limited Use certifications. Mark every field read-only.

### Task 2: Reconcile tracked disclosure sources

**Files:**
- Modify if policy requires: `PRIVACY.md`
- Modify if policy requires: `release/store-listing.md`
- Modify if executable copy changes: `src/privacy/dataFlows.ts`
- Test if executable copy changes: `src/privacy/dataFlows.test.ts`
- Modify if public summary changes: `README.md`
- Modify: `docs/superpowers/aurora-2/W6-P3-POLICY-DASHBOARD-RECONCILIATION.md`

**Interfaces:**
- Consumes: Task 1 policy map and the executable flow inventory.
- Produces: mutually consistent repository privacy, listing, Data Usage recommendations, and dashboard-ready exact copy.

- [ ] **Step 1: Compare source claims mechanically**

Run focused searches for account, tracking, backend, credential, capability URL, third-party transfer, backup, permission, personal/sensitive data, and Limited Use claims across the listed files. Record contradictions before editing.

- [ ] **Step 2: Add a failing contract only for executable-copy drift**

If `src/privacy/dataFlows.ts` must change, first add exact expectations to `src/privacy/dataFlows.test.ts` and run:

```powershell
npx vitest run src/privacy/dataFlows.test.ts
```

Expected: the new exact policy/listing contract fails before implementation.

- [ ] **Step 3: Apply the smallest source reconciliation**

Edit only claims demonstrated stale or incomplete by Task 1. Preserve `No Aurora account`, local plaintext/shared-profile warnings, direct provider transmission, capability-URL redaction, no Aurora backend/tracking, and exact Home Assistant write behavior unless current policy requires clearer phrasing.

- [ ] **Step 4: Run focused verification once**

If executable copy changed, run `npx vitest run src/privacy/dataFlows.test.ts` once after stabilization. For prose-only changes, use `rg` comparison and `git diff --check`; do not run product gates.

### Task 3: Live dashboard reconciliation gate

**Files:**
- Modify: `docs/superpowers/aurora-2/W6-P3-POLICY-DASHBOARD-RECONCILIATION.md`

**Interfaces:**
- Consumes: the user's read-only live-dashboard values and Task 2's exact recommended values.
- Produces: a field-by-field `Match`, `Change at W6-P5`, or `Not applicable` reconciliation without performing any change.

- [ ] **Step 1: Obtain manual dashboard evidence**

Collect the current live version and screenshots/transcriptions of the listing, privacy, permissions/single-purpose, and Data Usage sections. Stop here if only the user can access them.

- [ ] **Step 2: Record exact differences**

For each dashboard field, record current value, required/recommended value, basis, and deferred W6-P5 action. Do not edit the dashboard.

- [ ] **Step 3: Confirm mutual consistency**

Confirm `PRIVACY.md`, `release/store-listing.md`, executable inventory, and dashboard-ready answers describe the same data categories, transfers, credentials/capability URLs, permissions, backup exclusions, Home Assistant action, and no-Aurora-account/backend/tracking posture.

### Task 4: Review and checkpoint

**Files:**
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `docs/superpowers/plans/2026-08-16-w6-p3-policy-dashboard-reconciliation.md`

**Interfaces:**
- Consumes: completed policy report and dashboard reconciliation.
- Produces: verified W6-P3 checkpoint and W6-P4 start state.

- [ ] **Step 1: Perform one acceptance review**

Review only current-policy coverage, exact live-dashboard evidence, mutual source consistency, Store non-mutation, and protected-contract preservation. Record Minor wording/cosmetic items without reopening.

- [ ] **Step 2: Update ledgers and checkpoint**

Mark W6-P3 Verified only after the manual dashboard evidence is present. Commit the packet, push, prove clean/upstream equality and protected-original integrity, then begin W6-P4 automatically.
