# Tab Two V2 Connector Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current connector configuration list with the approved V2 discovery, card, and focused detail experience while preserving every existing connector, storage owner, permission transaction, editor, and entitlement.

**Architecture:** Add a pure UI presentation catalog beside the existing connector registry, then render compact discovery cards from it. Existing connector bodies remain the sole setup/edit implementations, but move into a shared portaled detail dialog. The Settings drawer and tab shell gain the approved roomy geometry without changing their single-scroll-owner or inactive-tab-unmount contracts.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind 4, Vitest, Testing Library, Playwright Chromium

**Spec:** `docs/superpowers/specs/2026-08-29-tab-two-v2-product-and-visual-design.md`

## Global Constraints

- Existing Aurora V1 connector capabilities remain free and available exactly as before.
- Do not add providers, accounts, payments, sync, analytics, or Store changes.
- Do not alter connector credentials, scopes, origins, snapshots, storage ownership, permission transactions, backup redaction, or widget rendering.
- Keep one Settings scroll owner and unmount inactive Settings content.
- Keep `section[aria-label="Connectors"]`, `data-connector-card`, `data-connector-state`, `data-settings-anchor`, and existing accessible action names stable where external QA depends on them.
- Use focused RED/GREEN tests before each production change.
- Final acceptance requires exact built-extension Chromium screenshots and owner visual approval.

---

### Task 1: Connector presentation catalog

**Files:**
- Create: `src/settings/connectors/connectorExperience.ts`
- Create: `src/settings/connectors/connectorExperience.test.ts`

**Interfaces:**
- Consumes: `ConnectorId`, `ConnectorDescriptor`, `ConnectorCategory`, `CATEGORY_LABELS`.
- Produces: `ConnectorExperience`, `connectorExperience(descriptor)`, and `connectorMark(id)`.

- [ ] **Step 1: Write the failing catalog test**

Assert that every `CONNECTORS` entry resolves to a non-empty mark, outcome, three benefits, privacy summary, and the existing category label. Assert that no entry is marked premium.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/settings/connectors/connectorExperience.test.ts`

Expected: FAIL because `connectorExperience.ts` does not exist.

- [ ] **Step 3: Implement the pure presentation catalog**

Use a total `Record<ConnectorId, Omit<ConnectorExperience, 'categoryLabel'>>` so a future registry ID fails TypeScript until its customer-facing content exists. Keep marks as short text or symbols with no remote assets.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/settings/connectors/connectorExperience.test.ts`

Expected: PASS.

### Task 2: Shared connector detail dialog

**Files:**
- Create: `src/settings/connectors/ConnectorDetailDialog.tsx`
- Create: `src/settings/connectors/ConnectorDetailDialog.test.tsx`
- Modify: `src/settings/connectors/ConnectorCardShell.tsx`
- Modify: `src/settings/connectors/ConnectorCardShell.test.tsx`

**Interfaces:**
- Consumes: `ConnectorExperience`, `ConnectorCardMode`, existing editor children, `useDialogEscape`, and `useFocusTrap`.
- Produces: an accessible `role="dialog"` portaled to `document.body`, with outcome, benefits, privacy, existing editor content, close action, Escape handling, focus trap, and focus restoration through the existing card action.

- [ ] **Step 1: Write failing dialog behavior tests**

Test that opening a configured Calendar card renders `Calendar settings` in a dialog, exposes the outcome, benefits, and privacy summary, moves the existing editor body into that dialog, closes on its named close button and Escape, and restores focus to the invoking card action.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/settings/connectors/ConnectorDetailDialog.test.tsx src/settings/connectors/ConnectorCardShell.test.tsx`

Expected: FAIL because the shared dialog and new presentation props are absent.

- [ ] **Step 3: Implement the dialog and wire the existing card shell**

Render the overlay and dialog through `createPortal`. Keep the card in place while active. Do not duplicate or relocate connector storage logic: the existing body component remains the only editor.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/settings/connectors/ConnectorDetailDialog.test.tsx src/settings/connectors/ConnectorCardShell.test.tsx`

Expected: PASS with no console warnings.

### Task 3: V2 connector discovery gallery

**Files:**
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/sections/Connectors.test.tsx`
- Modify: `src/settings/sections/Connectors.glance.test.tsx`
- Modify: `src/settings/sections/Connectors.work.test.tsx` only if an existing structural assertion requires the new dialog boundary.

**Interfaces:**
- Consumes: connector registry, existing `deriveConnectorCardState`, `CATEGORY_ORDER`, `connectorExperience`, and existing body map.
- Produces: outcome-led section introduction, sticky search, category filter chips, connected count, responsive two-column gallery, search results, and existing editor flows inside the detail dialog.

- [ ] **Step 1: Write failing discovery tests**

Test the introduction copy, category filter controls, connected count, responsive gallery marker, category selection, fuzzy search overriding the selected category, no-match state, and preservation of `On canvas` visibility semantics.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/settings/sections/Connectors.test.tsx src/settings/sections/Connectors.glance.test.tsx src/settings/sections/Connectors.work.test.tsx`

Expected: FAIL on missing introduction, filters, summary, and gallery composition.

- [ ] **Step 3: Implement the gallery without changing connector behavior**

Keep the direct sticky child and one drawer scrollport. Filters are session-only. Search examines label, blurb, outcome, and category label. Existing configured/visible grouping and visibility switches remain truthful.

- [ ] **Step 4: Verify GREEN**

Run the same three-test-file command.

Expected: PASS.

### Task 4: Roomy V2 Settings shell

**Files:**
- Modify: `src/settings/Drawer.tsx`
- Modify: `src/settings/Drawer.test.tsx`
- Modify: `src/settings/Tabs.tsx`
- Modify: `src/settings/Tabs.test.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`

**Interfaces:**
- `Tabs` gains `wide?: boolean`; Connectors passes `wide=true`, other sections retain the readable bounded measure.
- Drawer retains its existing props and dialog name.

- [ ] **Step 1: Write failing shell tests**

Assert 60rem roomy drawer width, 24px radius, 11rem navigation rail, a wide connector panel, unchanged narrow orientation, one scroll owner, and unchanged inactive-panel unmounting.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/settings/Drawer.test.tsx src/settings/Tabs.test.tsx src/settings/SettingsPanel.test.tsx`

Expected: FAIL on the new geometry and wide panel contract.

- [ ] **Step 3: Implement the approved geometry**

Change only shell composition classes and the `wide` prop. Do not rename current sections in this packet because Account, Progress, and the final IA require their own functional owners.

- [ ] **Step 4: Verify GREEN**

Run the same three-test-file command.

Expected: PASS.

### Task 5: Stabilized verification and visual gate

**Files:**
- Create: `scripts/qa-tab-two-v2-connectors.mjs`
- Create: `scripts/qa-tab-two-v2-connectors.test.mjs`
- Modify: `package.json`
- Create: `docs/superpowers/reports/TAB-TWO-V2-CONNECTOR-EXPERIENCE-QA.md`
- Modify after verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**
- QA script consumes an exact production build and deterministic seeded connector fixtures.
- It produces desktop, short-height, and touch-narrow screenshots plus geometry, interaction, request, console, focus, and storage-write evidence.

- [ ] **Step 1: Write failing harness contracts**

Require exact build provenance, full-resolution background load, one Settings scroll owner, two-column roomy gallery, narrow reflow, category filter, search, open/close/Escape/focus-return, editor save behavior, visibility toggle ownership, no connector secret text, no horizontal overflow, and zero unexpected errors or requests.

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/qa-tab-two-v2-connectors.test.mjs`

Expected: FAIL because the harness script and package command are absent.

- [ ] **Step 3: Implement the bounded harness**

Use the repository's exact-build provenance pattern. Seed fixtures through the approved preview harness boundary, not production adapters or post-mount monkey patches.

- [ ] **Step 4: Run focused and full verification**

Run:

```text
npm test -- src/settings/connectors src/settings/sections/Connectors.test.tsx src/settings/sections/Connectors.glance.test.tsx src/settings/sections/Connectors.work.test.tsx src/settings/Drawer.test.tsx src/settings/Tabs.test.tsx src/settings/SettingsPanel.test.tsx
npm test
npx tsc -p tsconfig.app.json --noEmit
npm run build
node --test scripts/qa-tab-two-v2-connectors.test.mjs
npm run qa:tab-two-v2-connectors -- --exact
git diff --check
```

- [ ] **Step 5: Inspect original-resolution screenshots**

Inspect every generated desktop, short-height, and touch-narrow capture. Reject clipping, internal scrollbars, weak hierarchy, dead controls, generic cards, focus loss, or photo degradation.

- [ ] **Step 6: Update ledgers and stop at owner visual approval**

Record exact evidence and remaining boundaries. Do not commit, push, merge, publish, or start the next V2 packet without the owner's explicit instruction.
