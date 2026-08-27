# Cross-Context Storage Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent lost Aurora storage mutations across independent MV3 extension pages by routing every mutation through one proven Web Lock authority while preserving schema migration, change propagation, and explicit rejection behavior.

**Architecture:** `AuroraStorage` keeps its typed read/write surface but delegates `init`, `set`, `setMany`, and the complete `update` read-modify-write critical section to a required `StorageAuthority`. Production passes a named global Web Lock authority explicitly, with no last-write-wins fallback; the in-memory test driver carries an explicit in-process authority so existing single-context tests stay concise without creating a production default. The preview-only harness bridge exposes only `update()` so two real extension pages can prove that the production path preserves every concurrent mutation.

**Tech Stack:** Manifest V3 Chrome extension pages, TypeScript 5 strict, Web Locks API, `chrome.storage.local`, React 19, Vitest 3, Playwright Chromium harness.

**Spec:** [`docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`](../specs/2026-08-13-aurora-2-observatory-design.md)

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory` from checkpoint `6c3c359a8baccd2067c520d77f5b22537a0211b5`.
- Packet ID is `W1-P2`; stop before optional-permission transactionality (`W1-P3`) and atomic rollback/permission reconciliation (`W1-P4`).
- Preserve the original checkout and every V1 package.
- Use TDD: each production behavior starts with a test observed failing for the expected reason, then passes with the minimal implementation.
- Use one stable, non-secret Web Lock name for all Aurora storage mutations across extension pages. Do not put data keys, user data, connector IDs, URLs, or credentials in the lock name.
- Production must not silently fall back to an in-context queue, retry loop, or last-write-wins path when Web Locks are unavailable or reject. Fail before invoking the mutation callback or storage write.
- Keep the existing in-context per-key promise chain only as an ordering optimization; the Web Lock is the correctness authority.
- Preserve typed defaults, schema migration/version stamping, `chrome.storage.onChanged` propagation, deep-equal no-op behavior, destructured method calls, and rejection recovery.
- `setMany` coordinates one already-validated multi-key patch under the same authority and one driver write. It does not add backup rollback, permission reconciliation, new validation rules, or user-facing error treatment; those remain W1-P4.
- No new dependency, manifest permission, service worker, background message path, schema version bump, visible UI change, Store copy change, or broad refactor.
- If the real extension-page harness cannot acquire and share Web Locks, stop after recording the failed platform proof; do not implement a background authority without a new decision checkpoint.
- Full completion gate: targeted tests, `npx tsc --noEmit`, full Vitest, production build, preview build, full real-extension harness, independent implementation review/fix round, clean status, verified implementation commit, dedicated `docs: checkpoint W1-P2` commit, push, then stop.

## Frozen packet envelope

### Acceptance criteria

1. Two independent storage instances sharing one authority cannot lose concurrent updates to the same key.
2. Production `init`, `set`, `setMany`, and `update` all acquire the same exclusive global Web Lock; `update` holds it across both the read and write.
3. Missing or rejecting Web Lock authority rejects explicitly before the mutation callback or storage write runs, and a later call may retry successfully.
4. A rejected storage write leaves the prior value intact and does not poison the per-key update chain.
5. Initialization still seeds first-run defaults, migrates old data, preserves current data, and warns without rewriting data from a future schema.
6. `setMany` performs one authority-held driver write; the existing backup import validation still completes before this method is called.
7. Subscriptions still receive changed values across contexts, ignore other keys/areas, suppress deep-equal writes, and unsubscribe correctly.
8. Two real MV3 extension pages report `navigator.locks` availability and race production `AuroraStorage.update()` calls; every unique mutation is stored exactly once with no lost update.

### Expected files/subsystems

- Create `src/lib/storage/authority.ts` and `src/lib/storage/authority.test.ts`.
- Modify `src/lib/storage/driver.ts`, `src/lib/storage/index.ts`, and `src/lib/storage/index.test.ts`.
- Modify `src/newtab/widgets/notes/NotesPanel.test.tsx` only to pass the wrapped memory driver's explicit test authority after its raw `StorageDriver` annotation intentionally erases the authorized-driver overload.
- Modify `src/newtab/main.tsx` only for explicit production authority construction and a preview-only narrow harness bridge.
- Modify `src/settings/sections/Data.tsx` and the Data slice of `src/settings/SettingsPanel.test.tsx` only to use/test one validated `setMany` restore write.
- Modify `scripts/preview.mjs` only to add the two-extension-page Web Lock/no-lost-update proof and restore its test data.
- Do not modify storage schema/migrations, permission services, connector behavior, layout, CSS, manifest permissions, production copy, or release assets.

### Test scope

- Pure authority tests with a controllable `LockManager` double.
- Storage tests covering two independent instances, same-key contention, `set`/`setMany`/`init` locking, rejection recovery, subscription propagation, and no write after authority failure.
- Existing migration tests unchanged and included in targeted verification.
- Settings Data-section happy path plus validation-before-write regression.
- Full TypeScript/Vitest/build and full foreground preview harness.

### Visual scope

No rendered output is intentionally changed. No new screenshot claim is required; the real-extension evidence is behavioral console output from the existing full harness.

---

### Task 0: Commit the independently reviewed execution base

**Files:**

- Add: `docs/superpowers/plans/2026-08-13-w1-p2-cross-context-storage-authority.md`

**Interfaces:**

- Produces: immutable `PLAN_BASE` SHA for implementation review.

- [ ] **Step 1: Apply and self-check every confirmed plan-review finding**

Re-read the complete plan against master spec section 10.3, ROADMAP W1-P2, STATUS, and A2-D009. Run:

```powershell
rg -n "T[B]D|T[O]DO|implement lat[e]r|fill in detail[s]|appropriate error handlin[g]|similar to Tas[k]" docs/superpowers/plans/2026-08-13-w1-p2-cross-context-storage-authority.md
git diff --check
git status --short
```

Expected: placeholder scan exits 1 with no output; `git diff --check` exits 0; the plan is the only working-tree entry.

- [ ] **Step 2: Commit and record the plan base**

```powershell
git add docs/superpowers/plans/2026-08-13-w1-p2-cross-context-storage-authority.md
git commit -m "docs: plan W1-P2 cross-context storage authority"
$PLAN_BASE = git rev-parse HEAD
git status --short
```

Expected: commit succeeds; status is empty; all implementation review uses the recorded `PLAN_BASE`.

---

### Task 1: Named Web Lock authority

**Files:**

- Create: `src/lib/storage/authority.ts`
- Create: `src/lib/storage/authority.test.ts`

**Interfaces:**

- Produces: `StorageAuthority.runExclusive<T>(work: () => Promise<T>): Promise<T>`
- Produces: `createInProcessStorageAuthority(): StorageAuthority`
- Produces: `createWebLockStorageAuthority(lockManager: Pick<LockManager, 'request'> | undefined): StorageAuthority`
- Produces: stable internal lock name `aurora:storage:mutation:v1`
- Throws: `StorageAuthorityUnavailableError` when no usable Web Lock manager exists.

- [ ] **Step 1: Add failing authority contract tests**

Create `authority.test.ts` with a fake `LockManager.request` that records the name/options and invokes the callback. Cover these literal behaviors:

```ts
it('requests the stable global lock in exclusive mode', async () => {
  const request = vi.fn(async (_name, _options, work) => work({ name: 'aurora:storage:mutation:v1', mode: 'exclusive' }))
  const authority = createWebLockStorageAuthority({ request } as Pick<LockManager, 'request'>)
  await authority.runExclusive(async () => 'done')
  expect(request).toHaveBeenCalledWith(
    'aurora:storage:mutation:v1',
    { mode: 'exclusive' },
    expect.any(Function),
  )
})

it('fails explicitly and never invokes work when Web Locks are unavailable', async () => {
  const work = vi.fn(async () => undefined)
  await expect(createWebLockStorageAuthority(undefined).runExclusive(work))
    .rejects.toThrow('Aurora storage requires the Web Locks API')
  expect(work).not.toHaveBeenCalled()
})

it('propagates request rejection and allows a later retry', async () => {
  const request = vi.fn()
    .mockRejectedValueOnce(new Error('lock request failed'))
    .mockImplementationOnce(async (_name, _options, work) => work({ name: 'aurora:storage:mutation:v1', mode: 'exclusive' }))
  const authority = createWebLockStorageAuthority({ request } as Pick<LockManager, 'request'>)
  await expect(authority.runExclusive(async () => 'first')).rejects.toThrow('lock request failed')
  await expect(authority.runExclusive(async () => 'second')).resolves.toBe('second')
})
```

Add an in-process authority test that starts two deferred callbacks and asserts the second cannot enter until the first settles, then asserts a rejected first callback does not poison the queue.

- [ ] **Step 2: Run the authority test and verify RED**

Run:

```powershell
npx vitest run src/lib/storage/authority.test.ts
```

Expected: FAIL because `authority.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal authorities**

Implement `authority.ts` around these boundaries:

```ts
export interface StorageAuthority {
  runExclusive<T>(work: () => Promise<T>): Promise<T>
}

const STORAGE_LOCK_NAME = 'aurora:storage:mutation:v1'

export class StorageAuthorityUnavailableError extends Error {
  constructor() {
    super('Aurora storage requires the Web Locks API')
    this.name = 'StorageAuthorityUnavailableError'
  }
}

export function createWebLockStorageAuthority(
  lockManager: Pick<LockManager, 'request'> | undefined,
): StorageAuthority {
  return {
    runExclusive<T>(work: () => Promise<T>): Promise<T> {
      if (!lockManager || typeof lockManager.request !== 'function') {
        return Promise.reject(new StorageAuthorityUnavailableError())
      }
      return lockManager.request(STORAGE_LOCK_NAME, { mode: 'exclusive' }, work)
    },
  }
}
```

The in-process authority maintains one private recovered promise tail and executes callbacks sequentially. It is an explicit test/non-extension authority, never an automatic production fallback. The Web Lock factory never reads ambient `navigator`; production passes `navigator.locks` explicitly and tests pass either a controlled manager or literal `undefined`.

- [ ] **Step 4: Run the authority test and TypeScript**

Run:

```powershell
npx vitest run src/lib/storage/authority.test.ts
npx tsc --noEmit
```

Expected: authority tests PASS; TypeScript PASS.

---

### Task 2: Authority-held storage mutations and multi-key writes

**Files:**

- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/storage/index.test.ts`
- Modify: `src/lib/storage/driver.ts`
- Modify: `src/newtab/widgets/notes/NotesPanel.test.tsx`
- Consume: `src/lib/storage/authority.ts`

**Interfaces:**

- Changes: production/raw-driver overload requires `createStorage(driver, authority)`.
- Preserves: `createStorage(memoryDriver())` only because the returned `MemoryStorageDriver` carries its own explicit in-process authority.
- Adds: `AuroraStorage.setMany(patch: Partial<AuroraData>): Promise<void>`
- Preserves: existing `init`, `get`, `set`, `update`, and `subscribe` signatures.

- [ ] **Step 1: Add failing storage-integrity tests**

In `index.test.ts`, import both authority constructors. Add a shared controllable storage driver whose first pair of same-key reads can overlap when no external lock exists. Add these named regressions:

```ts
it('preserves both same-key updates from independent storage contexts')
it('holds one authority acquisition across update read and write')
it('routes init, set, and setMany through the same authority')
it('setMany sends one driver patch and subscribers receive each changed key')
it('authority failure performs no read, updater callback, or write')
it('a rejected write preserves the old value and the next queued update succeeds')
it('first-run init acquires once, reads all data, and writes defaults plus the version')
it('old-version init migrates under one acquisition, preserves user data, and stamps once')
it('future-version init warns under one acquisition and performs no write')
```

For the independent-context case, create two `createStorage(sharedDriver, sharedAuthority)` instances, seed `todoLists` with `l1`, start one append of `l2` and one append of `l3`, then assert the final literal IDs are `['l1', 'l2', 'l3']`. The controlled driver must make the pre-fix read/read/write/write interleaving deterministic; do not rely on timing.

For `setMany`, assert one write call receives both literal keys and subscription callbacks observe their changed values:

```ts
await storage.setMany({
  focus: { text: 'Ship W1-P2', date: '2026-08-13', done: false },
  links: [{ id: 'authority', title: 'Authority', url: 'https://example.com' }],
})
expect(write).toHaveBeenCalledTimes(1)
```

For every `init()` branch, use a recording authority and driver event list. Assert `lock:enter` precedes `read:null`; first-run and old-version paths contain one write before `lock:exit`; the future-version path calls `console.warn`, performs zero writes, and still exits the authority cleanly.

- [ ] **Step 2: Run the storage test and verify RED**

Run:

```powershell
npx vitest run src/lib/storage/index.test.ts
```

Expected: FAIL on missing authority injection/`setMany` and on the deterministic independent-context lost update.

- [ ] **Step 3: Put every mutation behind the authority**

Add a test-only authorized driver shape without weakening the production overload:

```ts
export interface MemoryStorageDriver extends StorageDriver {
  readonly authority: StorageAuthority
  dump(): Record<string, unknown>
}
```

`memoryDriver()` constructs a fresh `createInProcessStorageAuthority()` and returns it on that shape. Define overloads so a raw `StorageDriver` requires the second argument, while a `MemoryStorageDriver` may supply its carried authority. The implementation must throw if neither exists; there is no implicit authority creation:

```ts
export function createStorage(driver: MemoryStorageDriver): AuroraStorage
export function createStorage(driver: StorageDriver, authority: StorageAuthority): AuroraStorage
```

Refactor `createStorage` so raw driver operations remain private:

```ts
async function readValue<K extends DataKey>(key: K): Promise<AuroraData[K]> { /* current get body */ }
async function writePatch(patch: Partial<AuroraData>): Promise<void> { await driver.write(patch) }

async function setMany(patch: Partial<AuroraData>): Promise<void> {
  await authority.runExclusive(() => writePatch(patch))
}

async function set<K extends DataKey>(key: K, value: AuroraData[K]): Promise<void> {
  await setMany({ [key]: value } as Pick<AuroraData, K>)
}
```

`init()` acquires once around its current read/version/migrate/write logic. `update()` retains the current per-key recovered chain but each queued callback calls `authority.runExclusive`, reads with `readValue`, runs the updater synchronously, and writes the result before releasing the authority. `get()` remains a non-mutating direct read.

Any test that wraps `memoryDriver()` in a separately typed raw `StorageDriver` must pass the base driver's `authority` explicitly. In `NotesPanel.test.tsx`, change the affected call to `createStorage(driver, base.authority)`. Do not broaden the production overload to make that wrapper compile.

Never implement `update()` as separately locked `get()` plus `set()` calls; the lock must cover the complete read-modify-write operation. Never call public `set()` while already holding the Web Lock, because Web Locks are not a reentrant storage transaction API.

- [ ] **Step 4: Verify migration, propagation, and rejection behavior**

Run:

```powershell
npx vitest run src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/storage/migrations.test.ts
npx tsc --noEmit
```

Expected: all targeted storage/migration tests PASS; TypeScript PASS.

---

### Task 3: Production wiring, validated restore coordination, and real extension proof

**Files:**

- Modify: `src/newtab/main.tsx`
- Modify: `src/settings/sections/Data.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `scripts/preview.mjs`

**Interfaces:**

- Production consumes: `createWebLockStorageAuthority(navigator.locks)` explicitly.
- Backup import consumes: `storage.setMany(migrated)` only after existing parse, migrate, and shape validation succeeds.
- Preview-only bridge exposes: `globalThis.__auroraStorageHarness.update` and no `get`, `set`, raw driver, secrets, or production-build surface.

- [ ] **Step 1: Add the failing restore test and two-page production probe before wiring**

Add a source-level unit seam only where behavior can be exercised. In the Data-section tests, inject or spy an `AuroraStorage` whose `setMany` is observable and assert:

```ts
expect(setMany).toHaveBeenCalledTimes(1)
expect(setMany).toHaveBeenCalledWith(expect.objectContaining({
  links: [{ id: 'a', title: 'Example', url: 'https://example.com' }],
  connectorSnapshots: {},
  apodCache: null,
}))
```

Keep the existing invalid-shape test and additionally assert `setMany` was never called. This proves validation remains before mutation rather than merely checking final storage.

Before changing `main.tsx`, add the harness block described in Step 4. It must check the resolved extension URLs and preview bridge and print a W1-P2-specific `FAIL:` line when the bridge is absent. This establishes a real production-wiring red state rather than adding the probe after its implementation.

- [ ] **Step 2: Run the Data-section test and verify RED**

Run the Data test, then build preview and run the full harness to capture both independent red states:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx -t "SettingsPanel Data section"
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p2-red-harness.log
```

Expected: the Data test FAILS because restore still calls per-key `set()` with `Promise.all`; the harness completes with a line beginning `FAIL: cross-context storage authority probe is ready in both MV3 extension pages` because the preview bridge is absent. Record that exact red evidence, then delete the untracked red log before implementation.

- [ ] **Step 3: Wire the production authority and one restore write**

In `main.tsx`, construct storage exactly once:

```ts
const storage = createStorage(chromeDriver(), createWebLockStorageAuthority(navigator.locks))
await storage.init()
```

Replace Data's `Promise.all(DATA_KEYS.map(...storage.set...))` with `await storage.setMany(migrated)`. Keep every existing validation and confirmation step before this call. Do not add rollback or permission work.

After successful `init()`, expose this narrow bridge only when `import.meta.env.MODE === 'preview'`:

```ts
if (import.meta.env.MODE === 'preview') {
  ;(globalThis as typeof globalThis & {
    __auroraStorageHarness?: Pick<AuroraStorage, 'update'>
  }).__auroraStorageHarness = { update: storage.update }
}
```

Production build inspection must confirm the property name is absent from `dist` after `npm run build`.

- [ ] **Step 4: Add the two-page real-extension harness probe**

Near the existing cross-tab probe in `scripts/preview.mjs`, open a second `chrome://newtab/` page and wait for the exact existing `time` sentinel. Require both resolved URLs to use the `chrome-extension:` scheme, have the same origin, and end in the built new-tab page. In both real extension pages:

1. assert `typeof navigator.locks?.request === 'function'`;
2. snapshot `worldClocks`;
3. require `typeof globalThis.__auroraStorageHarness?.update === 'function'` before releasing any work;
4. snapshot `worldClocks` and set it to `[]` before the race;
5. start one pending `page.evaluate` batch per page; each sets `globalThis.__auroraAuthorityRaceReady` to its prefix, waits for a page-local `aurora-authority-race-start` event, then runs 25 production bridge `update('worldClocks', ...)` calls appending unique literal labels `Authority A-00` through `Authority A-24` and `Authority B-00` through `Authority B-24`;
6. wait until both pages expose their distinct ready prefix, dispatch the start event into both pages back-to-back, and await both pending batches. Record that both batches entered and completed after the shared release barrier;
7. assert the stored array has exactly 50 entries, 50 unique labels, and every expected label;
8. restore the prior `worldClocks` in a `finally` path, delete the page-local readiness marker, and close the second page.

Print exactly one platform line and one correctness line:

```text
PASS: cross-context storage authority probe is ready in both MV3 extension pages
PASS: Web Locks are available in both MV3 extension pages
PASS: cross-context storage authority preserves all 50 concurrent mutations
```

Print matching `FAIL:` lines with measured counts when either assertion fails. Never use direct `chrome.storage.local` for the raced updates; only the preview bridge may invoke production `AuroraStorage.update()`.

- [ ] **Step 5: Run targeted green verification**

Run:

```powershell
npx vitest run src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/storage/migrations.test.ts src/settings/SettingsPanel.test.tsx
npx tsc --noEmit
```

Expected: all targeted files PASS; TypeScript PASS.

- [ ] **Step 6: Run full production and real-extension verification**

Run fresh, in order:

```powershell
npx vitest run
npm run build
rg -n "__auroraStorageHarness" dist
if ($LASTEXITCODE -ne 1) { throw 'Preview storage bridge leaked into production dist' }
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p2-harness.log
```

Expected:

- full Vitest exits 0 with all prior 97 files plus new authority coverage and zero failures;
- production build exits 0;
- `rg` exits 1 with no output and the immediate guard passes, proving the preview bridge is absent from production `dist`;
- preview build exits 0;
- harness process exits 0 and its log contains both new W1-P2 PASS lines;
- the known W1-P3-owned `remove revokes live` failure may remain exactly one existing FAIL; any other new FAIL or console error is a W1-P2 regression and blocks completion;
- the three established headed/user-instance skips may remain SKIP.

Count the complete log with:

```powershell
$pass = (Select-String -Path w1-p2-harness.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p2-harness.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p2-harness.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
```

Delete the untracked log after recording counts. Do not delete or replace tracked screenshots or release artifacts.

---

### Task 4: Independent review, fix round, checkpoint, and stop

**Files:**

- Review: all W1-P2 plan-base-to-head changes.
- Modify after verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Produces: verified W1-P2 implementation commit(s).
- Produces: dedicated `docs: checkpoint W1-P2` handoff commit.
- Produces: pushed `origin/feat/aurora-2-observatory` and a clean worktree.

- [ ] **Step 1: Commit the verified implementation before review**

After Task 3's complete gate is green, inspect `git diff --check`, review the exact diff, and commit only W1-P2 implementation/test/harness files:

```powershell
git add src/lib/storage/authority.ts src/lib/storage/authority.test.ts src/lib/storage/driver.ts src/lib/storage/index.ts src/lib/storage/index.test.ts src/newtab/widgets/notes/NotesPanel.test.tsx src/newtab/main.tsx src/settings/sections/Data.tsx src/settings/SettingsPanel.test.tsx scripts/preview.mjs
git commit -m "fix(storage): serialize cross-context mutations"
```

- [ ] **Step 2: Request bounded independent implementation review**

Dispatch a read-only reviewer with:

- base: the reviewed W1-P2 plan commit;
- head: the verified implementation commit;
- requirements: this plan, master spec section 10.3, ROADMAP W1-P2, and A2-D009.

Require exact file/line references and Critical/Important/Minor severity. The reviewer must specifically inspect:

- the Web Lock name and exclusive scope across init/set/setMany/update;
- lock release and promise-chain recovery after callback, driver, or lock rejection;
- no read or write before authority acquisition for mutations;
- deterministic no-lost-update tests across independent storage instances;
- schema/default/migration and subscription behavior preservation;
- validation-before-`setMany` ordering;
- preview bridge absence from production output and narrowness in preview;
- real two-page production-path evidence and reliable state restoration;
- no service-worker fallback, permission work, backup rollback, or W1-P3/W1-P4 scope creep.

- [ ] **Step 3: Verify and fix confirmed review findings with TDD**

For each reported item, inspect the cited code and reproduce confirmed defects with the smallest failing test or harness probe before changing production code. Fix every confirmed Critical/Important finding and any packet-local Minor correctness issue. Reject unsupported or out-of-scope suggestions with code/test evidence. Commit confirmed fixes separately:

```powershell
git add <only-confirmed-fix-files>
git commit -m "fix(storage): address W1-P2 review"
```

After any fix, rerun Task 3 Steps 5 and 6 completely. No review finding may remain open unless it is demonstrably outside W1-P2 and recorded in the roadmap.

- [ ] **Step 4: Update durable ledgers in the dedicated checkpoint**

Update only after final fresh verification:

- `ROADMAP.md`: W1-P2 state `Verified`, plan link, exact acceptance evidence, final implementation SHA, and finishing checkpoint subject; leave W1-P3 `Not started`.
- `STATUS.md`: packet envelope, implementation/review commits, exact targeted/full/build/harness counts, known W1-P3 failure/skips, no dirty files, and W1-P3 as the single next packet with plan not yet created.
- `DECISIONS.md`: append A2-D009 verification evidence, including successful MV3 extension-page Web Lock proof, final SHA, and exact test/harness results. Do not add a service-worker decision because the fallback was not taken.

Commit only the plan/ledger handoff material as:

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "docs: checkpoint W1-P2"
```

- [ ] **Step 5: Push, verify clean state, and stop**

Run:

```powershell
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git log -2 --oneline
```

Require the branch to match its upstream with no working-tree entries. Report the verified implementation SHA, checkpoint SHA, exact test/build/harness evidence, review disposition, and push result. Stop before creating a W1-P3 plan or modifying W1-P3 files.
