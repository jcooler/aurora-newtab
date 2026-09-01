# Tab Two Account & Sync Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the production-safe Account & Sync client shell and capability contracts while production remains Local mode and performs zero Tab Two backend traffic.

**Architecture:** A small `src/account` domain owns account snapshots, capability decisions, and injected actions without touching the existing `AuroraData` authority. Production receives a local-only client; preview builds may dynamically load deterministic states for visual and interaction QA, and artifact scans prove those fixtures are absent from production. Settings consumes the domain through context and adds a sixth tab; no current free feature reads a premium capability.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, Playwright Chromium, Chrome MV3, Vite production/preview modes.

**Spec:** `docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md`

## Global Constraints

- Obey every constraint in `docs/superpowers/plans/2026-09-01-tab-two-paid-mvp-program.md`.
- This packet adds no dependency, backend, account request, session persistence, storage schema key, migration, permission, OAuth registration, Stripe behavior, sync engine, Metrics behavior, premium connector, analytics, deployment, merge, release, or Store change.
- The Account & Sync tab is visible in production, but production remains truthful Local mode until PM-P2 supplies a real authenticated adapter.
- No current connector, widget, layout, stack, dock, editing path, drag-and-drop path, or backup path may consult account or capability state.
- The visual packet must stop after mockup capture and receive owner approval before production React/CSS edits.

---

### Task 1: Obtain the owner-visible visual gate

**Files:**

- Create: `docs/superpowers/qa/paid-account-shell/mockup.html`
- Create: `scripts/capture-paid-account-shell-mockup.mjs`
- Create: `docs/superpowers/qa/paid-account-shell/account-local-desktop.png`
- Create: `docs/superpowers/qa/paid-account-shell/account-signed-in-desktop.png`
- Create: `docs/superpowers/qa/paid-account-shell/account-sync-touch.png`
- Create: `docs/superpowers/qa/paid-account-shell/account-device-limit.png`
- Create: `docs/superpowers/qa/paid-account-shell/account-delete-confirmation.png`
- Create: `docs/superpowers/qa/paid-account-shell/README.md`

**Interfaces:**

- Consumes: Approved Tab Two visual system and Account & Sync content from the architecture spec.
- Produces: Five owner-visible original-resolution PNGs and written visual acceptance before production UI implementation.

- [ ] **Step 1: Inspect existing approved Settings geometry**

Open `src/settings/SettingsPanel.tsx`, `src/settings/Tabs.tsx`, `src/settings/Section.tsx`, `src/newtab/index.css`, and `docs/superpowers/qa/tab-two-v2-mockup/04-account-1600x900.png`. Preserve the established Settings rail, reading measure, typography, controls, and touch behavior.

- [ ] **Step 2: Create the five static visual states**

Create one self-contained HTML mockup that reuses the repository's approved
Tab Two colors, type scale, Settings rail measurements, and control geometry.
Select its state from `?state=` and capture it with Playwright using this fixed
matrix:

```js
const captures = [
  ['local', 1600, 900, 'account-local-desktop.png'],
  ['signed-in', 1600, 900, 'account-signed-in-desktop.png'],
  ['sync', 768, 812, 'account-sync-touch.png'],
  ['device-limit', 1600, 900, 'account-device-limit.png'],
  ['delete', 1600, 900, 'account-delete-confirmation.png'],
]
```

Run:

```powershell
node scripts/capture-paid-account-shell-mockup.mjs
```

The script must fail if a screenshot has the wrong dimensions, horizontal
overflow, more than one scroll owner, clipped controls, or a page/console
error. Render Local mode and signed-in sync-off on desktop, sync-on at the
supported touch size, plus desktop device-limit and destructive-confirmation
states. The signed-out design contains exactly these primary actions and
messages:

```text
Local mode
Your Tab Two data stays on this device.
Sign in with Google
View plans
Signing in does not enable sync or upload local data.
```

The signed-in design contains account identity, subscription state, Enable sync, last successful sync, quota usage, Sync now, device list, Manage billing, Delete synced data, Sign out, and Delete account. No account/avatar control appears on the canvas.

- [ ] **Step 3: Inspect every PNG at original resolution**

Record width, height, and PASS/FAIL for text clipping, control overlap, destructive-action hierarchy, visible focus, one scroll owner, and touch target containment in `README.md`.

- [ ] **Step 4: Stop for owner approval**

Attach all five PNGs directly in the Codex response using absolute file paths. Do not send the owner to a temporary website. Do not proceed to Task 2 until the owner explicitly approves the visual treatment.

### Task 2: Define pure account and capability contracts

**Files:**

- Create: `src/account/types.ts`
- Create: `src/account/capabilities.ts`
- Create: `src/account/capabilities.test.ts`

**Interfaces:**

- Consumes: No runtime service.
- Produces: `AccountSnapshot`, `AccountActions`, `PremiumCapability`, and `hasCapability(snapshot, capability)`.

- [ ] **Step 1: Write the failing capability tests**

Create table tests proving Local mode, signed-in/no-subscription, expired, and unverified leases never grant capabilities; only an explicitly verified unexpired lease grants a named capability; current free behavior has no capability name.

```ts
expect(hasCapability(localAccountSnapshot(), 'encrypted_sync', now)).toBe(false)
expect(hasCapability(activeSnapshot, 'encrypted_sync', now)).toBe(true)
expect(hasCapability(activeSnapshot, 'strava', now)).toBe(false)
expect(hasCapability({ ...activeSnapshot, lease: { ...activeSnapshot.lease!, expiresAt: now } }, 'encrypted_sync', now)).toBe(false)
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npx vitest run src/account/capabilities.test.ts
```

Expected: FAIL because `src/account/capabilities.ts` does not exist.

- [ ] **Step 3: Implement the minimal contracts**

Define these exact public shapes:

```ts
export type PremiumCapability =
  | 'encrypted_sync'
  | 'multi_account'
  | 'metrics_history'
  | 'google_calendar'
  | 'microsoft_calendar'
  | 'strava'

export type GrantSource = 'stripe' | 'complimentary_owner' | 'preview_fixture'
export type SubscriptionState = 'none' | 'active' | 'past_due' | 'canceling' | 'expired' | 'complimentary'
export type SyncPhase = 'disabled' | 'syncing' | 'up_to_date' | 'offline' | 'needs_attention'

export interface VerifiedEntitlementLease {
  verification: 'verified'
  accountId: string
  capabilities: readonly PremiumCapability[]
  grantSources: readonly GrantSource[]
  issuedAt: number
  expiresAt: number
  leaseId: string
}

export interface AccountSnapshot {
  mode: 'local' | 'signed_in'
  accountId: string | null
  email: string | null
  displayName: string | null
  subscription: SubscriptionState
  lease: VerifiedEntitlementLease | null
  sync: { enabled: boolean; phase: SyncPhase; lastSuccessAt: number | null; usedBytes: number; quotaBytes: 2_097_152 }
  devices: readonly { id: string; name: string; lastSyncAt: number | null; current: boolean; revoked: boolean }[]
}

export interface AccountActions {
  beginSignIn(): Promise<{ ok: true } | { ok: false; code: 'not_configured' | 'cancelled' | 'failed' }>
  signOut(): Promise<void>
  enableSync(): Promise<void>
  disableSync(): Promise<void>
  syncNow(): Promise<void>
  revokeDevice(deviceId: string): Promise<void>
  openPlans(): Promise<void>
  openBilling(): Promise<void>
  deleteVault(): Promise<void>
  deleteAccount(): Promise<void>
}
```

`hasCapability` returns true only for `verification: 'verified'`, `expiresAt > now`, and exact membership. It contains no owner, email, build-mode, or current-free-feature special case.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx vitest run src/account/capabilities.test.ts
git add src/account/types.ts src/account/capabilities.ts src/account/capabilities.test.ts
git commit -m 'feat: define paid account capability contracts'
```

### Task 3: Add production-local and preview-only account clients

**Files:**

- Create: `src/account/client.ts`
- Create: `src/account/localAccountClient.ts`
- Create: `src/account/previewAccountClient.ts`
- Create: `src/account/createAccountClient.ts`
- Create: `src/account/createAccountClient.test.ts`

**Interfaces:**

- Consumes: `AccountSnapshot` and `AccountActions` from Task 2.
- Produces: `AccountClient`, `createAccountClient()`, production Local mode, and deterministic preview states.

- [ ] **Step 1: Write RED client isolation tests**

Test that production returns a frozen Local-mode snapshot, all production actions are local no-ops except `beginSignIn` returning `not_configured`, and no `fetch`, `chrome.storage`, or navigation call occurs. Test preview states by semantic name without any owner email or real entitlement material.

```ts
vi.stubEnv('MODE', 'production')
const client = await createAccountClient()
expect(await client.getSnapshot()).toEqual(expect.objectContaining({ mode: 'local', accountId: null }))
expect(await client.actions.beginSignIn()).toEqual({ ok: false, code: 'not_configured' })
expect(fetch).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/account/createAccountClient.test.ts
```

Expected: FAIL because the client factory does not exist.

- [ ] **Step 3: Implement the client boundary**

Use this interface:

```ts
export interface AccountClient {
  getSnapshot(): Promise<AccountSnapshot>
  subscribe(listener: (snapshot: AccountSnapshot) => void): () => void
  actions: AccountActions
}
```

`createAccountClient()` checks the compile-time Vite mode. The production branch
returns `localAccountClient`; only the preview branch dynamically imports
`previewAccountClient`. Tests use `vi.stubEnv('MODE', 'production')` or
`vi.stubEnv('MODE', 'preview')` before a reset module import. Preview fixtures
use the source marker `TAB_TWO_PREVIEW_ACCOUNT_FIXTURE`, which later production
scans must not find in `dist`.

- [ ] **Step 4: Run GREEN and production isolation scan**

```powershell
npx vitest run src/account/createAccountClient.test.ts
npm run build
rg -n 'TAB_TWO_PREVIEW_ACCOUNT_FIXTURE|preview_fixture' dist
```

Expected: tests and build pass; `rg` exits 1 with no production match.

- [ ] **Step 5: Commit**

```powershell
git add src/account/client.ts src/account/localAccountClient.ts src/account/previewAccountClient.ts src/account/createAccountClient.ts src/account/createAccountClient.test.ts
git commit -m 'feat: isolate local and preview account clients'
```

### Task 4: Provide account state to React without touching AuroraData

**Files:**

- Create: `src/account/AccountContext.tsx`
- Create: `src/account/AccountContext.test.tsx`
- Modify: `src/newtab/main.tsx`

**Interfaces:**

- Consumes: `AccountClient` from Task 3.
- Produces: `AccountProvider` and `useAccount()` returning `{ snapshot, actions }`.

- [ ] **Step 1: Write RED context tests**

Prove initial Local mode, asynchronous client hydration, subscription updates, unsubscribe on unmount, and a stable `actions` reference. Prove the provider performs no `AuroraStorage` read or write.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/account/AccountContext.test.tsx
```

- [ ] **Step 3: Implement the provider**

`AccountProvider` accepts an optional injected client for tests, creates the build-mode client once, reads its snapshot in an effect, subscribes, and exposes Local mode until hydration completes. Wrap the existing new-tab tree in `src/newtab/main.tsx`; do not modify `src/lib/storage/schema.ts`, migrations, driver, or backup code.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx vitest run src/account/AccountContext.test.tsx src/newtab/main.test.tsx
git add src/account/AccountContext.tsx src/account/AccountContext.test.tsx src/newtab/main.tsx
git commit -m 'feat: provide isolated account state'
```

### Task 5: Add the sixth Account & Sync Settings tab

**Files:**

- Create: `src/settings/sections/AccountSync.tsx`
- Create: `src/settings/sections/AccountSync.test.tsx`
- Modify: `src/settings/SettingsPanel.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/settings/Tabs.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**

- Consumes: `useAccount()` and the owner-approved Task 1 captures.
- Produces: Permanent `account` tab and accessible Local/signed-in/device/destructive states.

- [ ] **Step 1: Write the failing Settings tests**

Require exactly six tabs in order: General, Progress, Widgets, Connectors, Data, Account & Sync. In Local mode require the approved copy, optional Sign in with Google, View plans, sync inventory, and no canvas account control. Verify sign-in failure is an associated status, not a modal. Verify signed-in states, device-limit copy, and fresh-auth destructive confirmation.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/settings/sections/AccountSync.test.tsx src/settings/SettingsPanel.test.tsx src/settings/Tabs.test.tsx
```

- [ ] **Step 3: Implement the approved surface**

Extend `TabId` with `'account'`, append `{ id: 'account', label: 'Account & Sync' }`, and render `AccountSync` only for that active tab. Reuse `Section`, `Switch`, `StateFeedback`, and existing destructive-dialog patterns. Keep Data unchanged. Production sign-in returns the truthful unavailable status until PM-P2 replaces the local client.

- [ ] **Step 4: Prove storage and free behavior isolation**

Add tests that traverse the Account tab and invoke every production-local action while asserting zero storage writes and zero `fetch`. Run the focused free-baseline interaction tests to prove no current feature gained a capability dependency.

```powershell
npx vitest run src/settings/sections/AccountSync.test.tsx src/settings/SettingsPanel.test.tsx src/settings/Tabs.test.tsx src/newtab/App.test.tsx src/newtab/arrange/useLongPress.test.tsx src/newtab/edit/useEditMode.test.tsx
```

- [ ] **Step 5: Commit**

```powershell
git add src/settings/sections/AccountSync.tsx src/settings/sections/AccountSync.test.tsx src/settings/SettingsPanel.tsx src/settings/SettingsPanel.test.tsx src/settings/Tabs.test.tsx src/newtab/index.css
git commit -m 'feat: add Account and Sync settings shell'
```

### Task 6: Add the reusable inline premium prompt

**Files:**

- Create: `src/account/PremiumPrompt.tsx`
- Create: `src/account/PremiumPrompt.test.tsx`

**Interfaces:**

- Consumes: `AccountActions.beginSignIn` and `AccountActions.openPlans`.
- Produces: `PremiumPrompt` for future premium-only surfaces; no current free surface uses it.

- [ ] **Step 1: Write RED prompt tests**

Require an inline region with benefit copy, Sign in for signed-out users, View plans, a caller-supplied free/back action, keyboard operation, focus retention, and no dialog role or automatic invocation.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run src/account/PremiumPrompt.test.tsx
```

- [ ] **Step 3: Implement the minimal component**

Use explicit props:

```ts
export interface PremiumPromptProps {
  title: string
  benefit: string
  signedIn: boolean
  onSignIn: () => void
  onViewPlans: () => void
  onContinueFree: () => void
}
```

Do not import a connector registry, widget registry, layout code, or entitlement decision into this component.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx vitest run src/account/PremiumPrompt.test.tsx
git add src/account/PremiumPrompt.tsx src/account/PremiumPrompt.test.tsx
git commit -m 'feat: add inline premium prompt primitive'
```

### Task 7: Add exact account-shell Chromium proof

**Files:**

- Create: `scripts/qa-account-sync-shell.mjs`
- Create: `scripts/qa-account-sync-shell.test.mjs`
- Modify: `package.json`
- Create: `docs/superpowers/reports/TAB-TWO-ACCOUNT-SYNC-SHELL-QA.md`

**Interfaces:**

- Consumes: Production and preview builds from Tasks 3 through 6.
- Produces: Exact desktop/touch state captures, request/storage ledgers, and production fixture-isolation proof.

- [ ] **Step 1: Write the failing harness contract**

Require `--exact`, commit/build provenance, installed-extension execution, 1600x900 and touch-enabled 768x812 captures, Local and preview account states, six-tab keyboard traversal, device-limit and destructive confirmations, storage/request ledgers, zero runtime failures, and an explicit original-resolution judgment for every screenshot.

- [ ] **Step 2: Run RED**

```powershell
node --test scripts/qa-account-sync-shell.test.mjs
```

- [ ] **Step 3: Implement the harness and command**

Add:

```json
"qa:account-sync-shell": "node scripts/qa-account-sync-shell.mjs"
```

The production run must prove Local mode and zero Tab Two backend requests. The preview run may exercise deterministic signed-in, active, past-due, device-limit, syncing, offline, needs-attention, vault deletion, and account deletion states. The evidence directory is `artifacts/qa-account-sync-shell/<exact-commit>/`.

- [ ] **Step 4: Run contract GREEN and commit**

```powershell
node --test scripts/qa-account-sync-shell.test.mjs
git add scripts/qa-account-sync-shell.mjs scripts/qa-account-sync-shell.test.mjs package.json docs/superpowers/reports/TAB-TWO-ACCOUNT-SYNC-SHELL-QA.md
git commit -m 'test: add Account and Sync shell QA'
```

### Task 8: Review, stabilize, build, document, and push

**Files:** All PM-P1 files only, plus active ledgers and public privacy/readme copy only if the implemented production Local-mode surface makes existing wording inaccurate.

**Interfaces:**

- Consumes: Tasks 1 through 7.
- Produces: One reviewed and pushed PM-P1 checkpoint with no backend or permission authority.

- [ ] **Step 1: Perform one bounded review**

Inspect the complete PM-P1 diff against the spec, threat model, approved captures, preview isolation, free baseline, storage authorities, and network behavior. Only Critical or Important findings block. Apply at most one focused fix and rereview cycle.

- [ ] **Step 2: Run the single stabilized gate**

```powershell
npm test
npx tsc --noEmit
node --test scripts/qa-account-sync-shell.test.mjs
git diff --check
```

Expected: all commands pass; the existing ProgressRail React `act()` warning may remain documented test noise only if unchanged.

- [ ] **Step 3: Commit reviewed source and build exact provenance**

Stage only intended files and commit. With tracked inputs clean:

```powershell
npm run build
rg -n 'TAB_TWO_PREVIEW_ACCOUNT_FIXTURE|preview_fixture' dist
npm run build:preview
npm run qa:account-sync-shell -- --exact
```

Expected: production and preview builds pass; production scan exits 1; exact Chromium evidence passes.

- [ ] **Step 4: Inspect screenshots and reconcile ledgers**

Inspect every PNG at original resolution. Update `STATUS.md`, `ROADMAP.md`, and `DECISIONS.md` with exact commit/build/test/evidence provenance and explicit remaining PM-P2 gates. Do not claim authentication, billing, sync, owner grants, or premium connectors exist.

- [ ] **Step 5: Push and prove boundaries**

```powershell
git push origin feat/aurora-2-observatory
git rev-parse HEAD
git rev-parse '@{upstream}'
git ls-remote origin refs/heads/feat/aurora-2-observatory
git -C 'D:\DEV\Chrome plugin' status --short --branch
```

Expected: local HEAD, upstream, and remote are identical; the protected original is clean; only the two protected untracked paths remain. Do not merge or perform any Store action.
