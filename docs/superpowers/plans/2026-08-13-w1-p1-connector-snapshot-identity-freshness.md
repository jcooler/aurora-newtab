# Connector Snapshot Identity and Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make connector caches configuration/account-scoped, generation-safe, and time-correct for long-lived new-tab pages without overlapping refreshes or exposing secrets.

**Architecture:** Canonicalize the complete fetch-relevant connector config in memory, hash it with SHA-256, and store only the fixed-length scope digest on each snapshot. The shared hook filters data by the current render config immediately, dedupes by connector plus scope, rejects stale completions, schedules TTL expiry, and rechecks on visibility/focus. Token reconnects stamp a new non-secret epoch so even an identical reconnect cannot revive a pre-disconnect cache.

**Tech Stack:** React 19, TypeScript 5 strict, Vitest 3 + jsdom, Web Crypto available in MV3 Chrome/Node test runtime, existing `AuroraStorage` and connector registry.

**Spec:** [`docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md`](../specs/2026-08-13-aurora-2-observatory-design.md)

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`.
- Packet ID is `W1-P1`; do not enter permission transactionality, cross-tab storage authority, Home Assistant data minimization/actions, or visual redesign.
- Preserve the original checkout and every V1 package.
- Use TDD: show the new regression tests failing for the expected reason before implementation, then show them passing.
- Never put a raw token, API token, bearer value, full RSS/ICS capability URL, or Home Assistant URL into a stored scope, log, assertion failure, screenshot, or export.
- Existing unscoped snapshots are cache only: ignore them and self-heal by fetching; do not bump storage schema version solely for cache eviction.
- No new dependency, remote code, manifest permission, CSP relaxation, or broad upgrade.
- Preserve the current quiet-failure contract for rejected hook refreshes only when the stale snapshot scope matches the active config; a scope change renders `data: null` immediately. Do not change connector-specific anti-staleness contracts: Status `unknown` and Home Assistant `entities: null` are authoritative successful refresh results and must not carry prior data forward.
- Refresh after TTL, `visibilitychange` to visible, and window focus; use one in-flight request per connector+scope and never start overlapping polls.
- A stale completion may neither replace the current UI nor overwrite the current scope in storage.
- Full completion gate: targeted tests, `npx tsc --noEmit`, all 96+ Vitest files, `npm run build`, independent review/fix round, clean status, implementation commit, then dedicated ledger checkpoint.

## Frozen packet envelope

### Acceptance criteria

1. A different-account reconnect cannot display or reuse the prior account's snapshot.
2. A mounted config mutation suppresses the old data in the same render and starts a current-scope refresh.
3. An identical token reconnect receives a new epoch and cannot revive a pre-disconnect snapshot.
4. RSS, GitHub, GitLab, Jira, Vercel, Crypto, ICS, Status, and Home Assistant pass their complete fetch-relevant config to the shared hook.
5. Legacy snapshots without a scope are ignored and replaced after a successful fetch.
6. TTL expiry refreshes an open tab; visibility/focus restoration rechecks staleness; simultaneous triggers share one request.
7. If scope A is pending and scope B becomes current, A cannot write after B, regardless of completion order.
8. A rejected hook refresh keeps only matching-scope stale data, reports `lastError`, and a later successful trigger clears the error. Status/Home Assistant anti-staleness sentinels remain successful current-scope data.

### Expected files/subsystems

- Create `src/services/connectors/snapshotIdentity.ts` and `.test.ts`.
- Modify `src/services/connectors/types.ts` and `src/services/connectors/homeassistant.ts` for the optional non-secret reconnect epoch and scoped snapshot type.
- Modify `src/lib/hooks/useConnectorSnapshot.ts` and `.test.tsx`.
- Modify connector call sites in all nine widget files under `src/newtab/widgets/{rss,github,gitlab,jira,vercel,crypto,calendar,status,homeassistant}/`.
- Modify the corresponding nine widget test files only where scoped cache fixtures or packet regressions require it.
- Modify `src/settings/sections/Connectors.tsx` and `SettingsPanel.test.tsx` only to stamp/test a fresh token-connect epoch.
- Do not modify the storage driver/index, permission helpers, backup restore algorithm, manifest, production copy, layout, or CSS.

### Test scope

- Pure identity tests.
- Shared hook lifecycle/generation/fake-timer tests.
- One preserved-mount config mutation regression (RSS).
- One Home Assistant pending-selection/reconfiguration ordering regression.
- Token reconnect epoch tests at the settings boundary.
- Full TypeScript, Vitest, and production build.

### Visual scope

No visual output is intentionally changed. No screenshot claim is required. If rendered loading/error copy changes unexpectedly, stop and route that visible change to a follow-up rather than absorbing it.

---

### Task 1: Configuration scope and reconnect epoch

**Files:**

- Create: `src/services/connectors/snapshotIdentity.ts`
- Create: `src/services/connectors/snapshotIdentity.test.ts`
- Modify: `src/services/connectors/types.ts`
- Modify: `src/services/connectors/homeassistant.ts`
- Test: `src/services/connectors/snapshotIdentity.test.ts`

**Interfaces:**

- Produces: `canonicalConnectorConfig(config: ConnectorConfig): string`
- Produces: `connectorSnapshotScope(id: ConnectorId, config: ConnectorConfig): Promise<string>`
- Produces: `newSnapshotEpoch(): string`
- Produces: `ConnectorCacheIdentity.snapshotEpoch?: string`
- Produces: `ConnectorSnapshot.scope?: string` where absence means a legacy unusable cache
- Consumes: Existing connector config union and browser/Node Web Crypto.

- [ ] **Step 1: Add failing identity and secret-safety tests**

Create `snapshotIdentity.test.ts` with literal values that are fake but shaped like secrets:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { GithubConfig, RssConfig } from './types'
import {
  canonicalConnectorConfig,
  connectorSnapshotScope,
  newSnapshotEpoch,
} from './snapshotIdentity'

describe('connector snapshot identity', () => {
  it('canonicalizes object key order but preserves array order', () => {
    const a = { enabled: true, shownCount: 5, feeds: ['https://one.example/a', 'https://two.example/b'] } as RssConfig
    const b = { feeds: ['https://one.example/a', 'https://two.example/b'], shownCount: 5, enabled: true } as RssConfig
    expect(canonicalConnectorConfig(a)).toBe(canonicalConnectorConfig(b))
    expect(canonicalConnectorConfig({ ...a, feeds: [...a.feeds].reverse() })).not.toBe(canonicalConnectorConfig(a))
  })

  it('changes scope for isolated account, secret, view, and feed mutations without embedding their values', async () => {
    const token = 'github_pat_FAKE_SCOPE_SECRET'
    const base: GithubConfig = { enabled: true, token, username: 'alice' }
    const baseScope = await connectorSnapshotScope('github', base)
    const accountScope = await connectorSnapshotScope('github', { ...base, username: 'bob' })
    const tokenScope = await connectorSnapshotScope('github', { ...base, token: 'github_pat_OTHER_FAKE' })
    const viewScope = await connectorSnapshotScope('github', {
      ...base,
      views: { commitGraph: false, pulls: true, issues: true, notifications: true },
    })

    expect(baseScope).toMatch(/^github:v1:[0-9a-f]{64}$/)
    expect(accountScope).not.toBe(baseScope)
    expect(tokenScope).not.toBe(baseScope)
    expect(viewScope).not.toBe(baseScope)
    expect(baseScope).not.toContain(token)

    const capabilityUrl = 'https://feeds.example/private?key=FAKE_CAPABILITY'
    const rssBase: RssConfig = {
      enabled: true,
      feeds: [capabilityUrl],
      shownCount: 5,
    }
    const rssScope = await connectorSnapshotScope('rss', rssBase)
    const feedScope = await connectorSnapshotScope('rss', {
      ...rssBase,
      feeds: ['https://feeds.example/other'],
    })
    expect(feedScope).not.toBe(rssScope)
    expect(rssScope).not.toContain(capabilityUrl)
  })

  it('creates a fresh non-secret epoch for an identical reconnect', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    expect(newSnapshotEpoch()).not.toBe(newSnapshotEpoch())
  })
})
```

- [ ] **Step 2: Run the identity test and verify the red state**

Run:

```powershell
npx vitest run src/services/connectors/snapshotIdentity.test.ts
```

Expected: FAIL because `snapshotIdentity.ts`, `snapshotEpoch`, and scoped snapshots do not exist.

- [ ] **Step 3: Add the cache identity and snapshot schema shapes**

In `types.ts`, define and extend the connector config interfaces:

```ts
export interface ConnectorCacheIdentity {
  /** Non-secret lifecycle nonce. New token connections replace it. */
  snapshotEpoch?: string
}

export interface RssConfig extends ConnectorCacheIdentity {
  // existing members unchanged
}
```

Apply the same `extends ConnectorCacheIdentity` shape to GitHub, GitLab, Jira, Vercel, Crypto, ICS, and Status. In `homeassistant.ts`, import `ConnectorCacheIdentity` as a type and extend it on `HomeAssistantConfig`.

Change only the cache type in `types.ts`:

```ts
export interface ConnectorSnapshot {
  /** Missing only on legacy v1 caches; the hook treats those as absent. */
  scope?: string
  fetchedAt: number
  data: unknown
}
```

Do not bump `CURRENT_VERSION`: `connectorSnapshots` is excluded from backup and legacy entries self-heal.

- [ ] **Step 4: Implement canonicalization, SHA-256 scope, and epoch creation**

Create `snapshotIdentity.ts` with these exact boundaries:

```ts
import type { ConnectorConfig, ConnectorId } from './types'

export function canonicalConnectorConfig(value: ConnectorConfig): string {
  function encode(input: unknown): string {
    if (input === null) return 'null'
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input)
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new TypeError('Connector snapshot config contains a non-finite number')
      return JSON.stringify(input)
    }
    if (Array.isArray(input)) return `[${input.map(encode).join(',')}]`
    if (typeof input === 'object') {
      const record = input as Record<string, unknown>
      return `{${Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(record[key])}`)
        .join(',')}}`
    }
    throw new TypeError('Connector snapshot config contains an unsupported value')
  }
  return encode(value)
}

export async function connectorSnapshotScope(
  id: ConnectorId,
  config: ConnectorConfig,
): Promise<string> {
  const canonical = canonicalConnectorConfig(config)
  const bytes = new TextEncoder().encode(`${id}\n${canonical}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `${id}:v1:${hex}`
}

export function newSnapshotEpoch(): string {
  return crypto.randomUUID()
}
```

Keep canonical strings and raw config in process memory only. Never print them.

- [ ] **Step 5: Run identity tests and TypeScript**

Run:

```powershell
npx vitest run src/services/connectors/snapshotIdentity.test.ts
npx tsc --noEmit
```

Expected: identity tests PASS; TypeScript PASS after every connector config implements the optional base interface.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/services/connectors/types.ts src/services/connectors/homeassistant.ts src/services/connectors/snapshotIdentity.ts src/services/connectors/snapshotIdentity.test.ts
git commit -m "feat(connectors): scope snapshot identity"
```

---

### Task 2: Generation-safe TTL and visibility lifecycle

**Files:**

- Modify: `src/lib/hooks/useConnectorSnapshot.ts`
- Modify: `src/lib/hooks/useConnectorSnapshot.test.tsx`
- Consume: `src/services/connectors/snapshotIdentity.ts`

**Interfaces:**

- Replaces: `useConnectorSnapshot(id, refresh, ttlMs?)`
- Produces: `useConnectorSnapshot(id, config, refresh, ttlMs?)`
- Preserves return: `{ data, fetchedAt, refreshing, lastError }`
- Preserves: matching-scope stale-while-revalidate and one request per connector+scope.

- [ ] **Step 1: Rewrite the test probe for explicit config and add failing lifecycle cases**

Change the test `Probe` to accept an `RssConfig` and call:

```tsx
useConnectorSnapshot('rss', config, refresh, ttl)
```

The file uses `@vitest-environment jsdom`; jsdom 29 exposes `crypto.randomUUID()` but not `crypto.subtle`. Add `beforeAll` to the existing Vitest import and install a deterministic test-only digest before the cases. The pure `snapshotIdentity.test.ts` remains in the default Node environment and therefore exercises the real Web Crypto SHA-256 implementation; this jsdom fake exists only so hook lifecycle tests can compute stable opaque scopes without adding Node typings or a production fallback:

```ts
beforeAll(() => {
  const digest = vi.fn(async (_algorithm: AlgorithmIdentifier, source: BufferSource) => {
    const bytes = source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    const output = new Uint8Array(32)
    bytes.forEach((byte, index) => {
      const slot = index % output.length
      output[slot] = ((output[slot] ?? 0) * 33 + byte + index) & 0xff
    })
    return output.buffer
  })
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: { digest },
  })
})
```

Use `connectorSnapshotScope` in the fixture helper so fresh scoped snapshots remain valid. Add these named tests with deferred promises and fake timers:

```ts
it('different-account reconnect never renders the previous fresh cache')
it('mounted config mutation suppresses old data before the new request settles')
it('commit-time invalidation rejects A when it resolves immediately after the B rerender')
it('scope B wins when pending scope A resolves after B')
it('legacy unscoped cache is ignored and replaced')
it('TTL expiry refreshes an open visible tab exactly once')
it('visibility and focus recheck staleness without overlapping the timer request')
it('rejected refresh keeps matching stale data and later success clears lastError')
it('failed TTL refresh schedules one bounded retry and unmount cancels it')
it('post-unmount focus and visibility events cannot read or refresh')
```

For stale ordering, assert both UI and storage:

```ts
expect(screen.queryByText('data:account-a')).toBeNull()
expect(screen.getByText('data:account-b')).toBeTruthy()
const stored = (await storage.get('connectorSnapshots')).rss
expect(stored?.scope).toBe(await connectorSnapshotScope('rss', configB))
expect(stored?.data).toBe('account-b')
```

For non-overlap, hold the first refresh pending, advance to TTL, dispatch visible `visibilitychange`, dispatch `focus`, and assert the refresh mock was called once until the promise settles.

- [ ] **Step 2: Run the hook test and verify the red state**

Run:

```powershell
npx vitest run src/lib/hooks/useConnectorSnapshot.test.tsx
```

Expected: FAIL on the old hook signature and on missing scope/TTL/visibility/generation behavior.

- [ ] **Step 3: Replace connector-ID-only globals with connector+scope state**

At module scope use:

```ts
const inFlight = new Map<string, Promise<unknown>>()
const latestConfigKeys = new Map<ConnectorId, string>()

export function __resetInFlight(): void {
  inFlight.clear()
  latestConfigKeys.clear()
}
```

Inside the hook, calculate the render-time canonical key synchronously and store that key beside local state. Returned data must be filtered synchronously:

```ts
const configKey = canonicalConnectorConfig(config)
const current = state.configKey === configKey ? state : EMPTY_STATE
```

This is load-bearing: a prop/config mutation must return `data: null` on that render, before the effect or SHA-256 promise settles.

Add `useLayoutEffect` to the React import. Use it—not render-time mutation or a passive effect—to invalidate the prior generation at commit time:

```ts
useLayoutEffect(() => {
  latestConfigKeys.set(id, configKey)
}, [id, configKey])
```

Do not clear the map in this layout effect's cleanup: another still-mounted consumer may own the same connector+scope, and a newer committed key must never be rolled back to an older key during cleanup. `__resetInFlight()` remains the deterministic test reset.

- [ ] **Step 4: Implement scoped setup, refresh ownership, and stale-write rejection**

The effect depends on `[id, storage, configKey, ttlMs]`. It must:

1. rely on the layout effect above to have invalidated the prior committed key;
2. await `connectorSnapshotScope(id, config)`;
3. stop if unmounted or `latestConfigKeys.get(id) !== configKey`;
4. subscribe before reading storage;
5. accept a snapshot only when `snapshot.scope === scope`;
6. treat an absent/mismatched/legacy snapshot as `prev: null`;
7. dedupe refresh under `${id}\n${scope}`;
8. let only the request owner write;
9. before the owner writes, require `latestConfigKeys.get(id) === configKey`;
10. write `{ scope, fetchedAt: Date.now(), data: result }`;
11. clear `lastError` after success;
12. ignore a storage subscription payload with another scope and schedule a current-scope refresh instead of rendering it.

The commit-time invalidation and owner write guard—not component liveness alone—decide generation safety. An unmounted owner may populate a still-current scope, but it may never write after a newer config key commits. The regression must rerender B and resolve A immediately, before waiting for B's passive effect or request, then assert storage still contains no A result. Cross-context atomicity is completed in W1-P2; this packet must not pretend the module map is a cross-tab lock.

- [ ] **Step 5: Add a single expiry scheduler and restoration listeners**

Use one `setTimeout`, not `setInterval`. After reading or receiving a matching snapshot:

```ts
const dueIn = Math.max(0, snapshot.fetchedAt + ttlMs - Date.now())
expiryTimer = window.setTimeout(() => void checkFreshness(), dueIn)
```

`checkFreshness()` re-reads the current stored snapshot, validates scope, and calls the deduped refresh only if stale. Add listeners:

```ts
const onVisibility = () => {
  if (document.visibilityState === 'visible') void checkFreshness()
}
const onFocus = () => void checkFreshness()
document.addEventListener('visibilitychange', onVisibility)
window.addEventListener('focus', onFocus)
```

Cleanup removes both listeners and the timeout. After a failed refresh, keep the matching stale snapshot and schedule the next automatic attempt no sooner than `Math.min(Math.max(ttlMs, 1_000), 30_000)` milliseconds; visibility/focus may request earlier but still joins the same in-flight promise. This avoids a zero-delay retry loop.

The fake-timer tests must assert the exact bounded retry delay, one call when timer/visibility/focus coincide, zero retry after unmount, listener removal, and zero storage reads or refresh calls from post-unmount events.

- [ ] **Step 6: Run hook red/green verification**

Run:

```powershell
npx vitest run src/lib/hooks/useConnectorSnapshot.test.tsx
npx tsc --noEmit
```

Expected: every new lifecycle test PASS; existing SWR/dedupe/error tests PASS under scoped fixtures; TypeScript will now identify all widget call sites that need Task 3.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/lib/hooks/useConnectorSnapshot.ts src/lib/hooks/useConnectorSnapshot.test.tsx
git commit -m "fix(connectors): refresh scoped snapshots safely"
```

If TypeScript cannot pass until Task 3 call sites change, keep Task 2 staged with its targeted test green, perform Task 3's mechanical call-site adaptation, and make one combined implementation commit rather than committing a knowingly uncompilable intermediate state. Record that deviation in the review brief.

---

### Task 3: Wire every connector config and prove preserved-mount behavior

**Files:**

- Modify: `src/newtab/widgets/rss/RssWidget.tsx`
- Modify: `src/newtab/widgets/github/GithubWidget.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.tsx`
- Modify: `src/newtab/widgets/jira/JiraWidget.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.tsx`
- Modify: `src/newtab/widgets/crypto/CryptoWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/status/StatusWidget.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx`
- Modify: the matching nine `*.test.tsx` files for scoped fixtures/regressions
- Modify: `src/settings/sections/Connectors.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`

**Interfaces:**

- Consumes: `useConnectorSnapshot(id, completeConfig, refresh, ttl?)`
- Consumes: `connectorSnapshotScope` for cache fixtures.
- Consumes: `newSnapshotEpoch` when a token connection persists.
- Produces: every connector has one complete config identity source.

- [ ] **Step 1: Add failing token reconnect and preserved-mount tests**

In `SettingsPanel.test.tsx`, mock `crypto.randomUUID()` to two known UUIDs. Connect the same fake account twice with a disconnect between and assert each persisted config has a different `snapshotEpoch`.

In `RssWidget.test.tsx`, keep the component mounted while updating `connectors.rss` from feed A to feed B. Seed a scoped A snapshot, defer the B fetch, and assert the A headline disappears before B settles.

In `HomeAssistantWidget.test.tsx`, start a deferred fetch for selection A, update storage to selection B while mounted, resolve B, then resolve A. Assert only B state renders and the stored `homeassistant` snapshot has B's scope/data.

Add a Home Assistant settings regression that connects with a known `snapshotEpoch`, saves a picker selection, and asserts the stored config retains the same epoch. Then reconnect and assert the new successful connection replaces it.

- [ ] **Step 2: Run the three focused files and verify red state**

Run:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx src/newtab/widgets/rss/RssWidget.test.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx
```

Expected: FAIL because connect saves do not stamp epochs, call sites do not pass config, and current stale requests are ID-scoped.

- [ ] **Step 3: Pass complete config objects to the hook**

Update each inner component so the hook receives the exact config the refresh closure reads. The shape is:

```tsx
const { data } = useConnectorSnapshot<Headline[]>(
  'rss',
  rss,
  () => fetchHeadlines(rss.feeds, rss.shownCount),
)
```

Do this for all nine connectors. Do not pass a partial `{ enabled }` identity while the fetch closure reads token, URL, views, coins, calendars, services, entities, or actions. If an inner currently receives destructured fields, pass the normalized complete connector config from its gate to the inner and derive fields there.

For ICS/Status/Home Assistant, the config identity may include presentation fields that cause a conservative extra refresh; correctness wins in this packet. A later performance packet may narrow a fingerprint only with tests proving the omitted field cannot change fetched data.

- [ ] **Step 4: Stamp a fresh epoch on token connection persistence**

Import `newSnapshotEpoch` in `Connectors.tsx`. In the `onConnected` storage object for GitHub, GitLab, Jira, Vercel, and Home Assistant, add:

```ts
snapshotEpoch: newSnapshotEpoch(),
```

Do not preserve the old epoch on reconnect. Do preserve existing connector-specific user choices already preserved today, such as GitHub views and Home Assistant entities/actions.

Every ordinary write that reconstructs a token config must preserve the current epoch. In particular, `handleSaveEntities` must include:

```ts
snapshotEpoch: current?.snapshotEpoch,
```

Audit the five token connector settings bodies for any other field-by-field reconstruction and either preserve `snapshotEpoch` or replace the write with a spread of the current connector-specific config plus the intended changed fields.

No epoch rotation is needed for ordinary config edits because the canonical config changes. No-auth connectors have no identical disconnect/reconnect credential lifecycle.

- [ ] **Step 5: Scope widget cache fixtures**

Where a widget test seeds a cache expected to render, compute the scope from the same config used by the rendered widget:

```ts
await storage.set('connectorSnapshots', {
  rss: {
    scope: await connectorSnapshotScope('rss', config),
    fetchedAt: Date.now(),
    data,
  },
})
```

Leave settings tests that merely prove a snapshot entry is deleted structurally unchanged; `scope` is optional specifically for legacy-cache compatibility.

- [ ] **Step 6: Run targeted connector tests**

Run:

```powershell
npx vitest run src/services/connectors/snapshotIdentity.test.ts src/lib/hooks/useConnectorSnapshot.test.tsx src/settings/SettingsPanel.test.tsx src/newtab/widgets/rss/RssWidget.test.tsx src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx src/newtab/widgets/jira/JiraWidget.test.tsx src/newtab/widgets/vercel/VercelWidget.test.tsx src/newtab/widgets/crypto/CryptoWidget.test.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx src/newtab/widgets/status/StatusWidget.test.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx
```

Expected: all targeted files PASS with the new identity/lifecycle regressions.

- [ ] **Step 7: Run full automated verification**

Run fresh, in order:

```powershell
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: TypeScript exit 0, all prior 96 files plus the new identity test file pass with zero failures, and production build exit 0. The full browser harness is not required because this packet has no harness or visible change; if implementation changes browser-observable timing outside unit coverage, add `npm run build:preview` plus the full foreground harness before review.

- [ ] **Step 8: Commit Task 3**

```powershell
git add src/newtab/widgets/rss/RssWidget.tsx src/newtab/widgets/rss/RssWidget.test.tsx src/newtab/widgets/github/GithubWidget.tsx src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx src/newtab/widgets/jira/JiraWidget.tsx src/newtab/widgets/jira/JiraWidget.test.tsx src/newtab/widgets/vercel/VercelWidget.tsx src/newtab/widgets/vercel/VercelWidget.test.tsx src/newtab/widgets/crypto/CryptoWidget.tsx src/newtab/widgets/crypto/CryptoWidget.test.tsx src/newtab/widgets/calendar/CalendarWidget.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx src/newtab/widgets/status/StatusWidget.tsx src/newtab/widgets/status/StatusWidget.test.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx src/settings/sections/Connectors.tsx src/settings/SettingsPanel.test.tsx
git commit -m "fix(connectors): invalidate preserved widget caches"
```

- [ ] **Step 9: Request bounded independent review and run one fix round**

Review only the W1-P1 base-to-head diff against this plan and master spec. Require exact file/line references and classify Critical/Important/Minor. The reviewer must specifically inspect:

- secret exposure in stored scope/errors/logs;
- same-render stale suppression;
- async digest/config ordering;
- stale owner write guards;
- TTL retry loops and timer/listener cleanup;
- refresh overlap across timer/visibility/focus;
- complete config coverage across all nine connectors;
- reconnect epoch replacement, not preservation;
- no accidental entry into permission/storage-authority/HA-minimization scope.

Fix every confirmed Critical/Important finding, re-run the smallest failing test first, then rerun the complete Step 7 gate. Record Minor findings as roadmap follow-ups only when genuinely outside the envelope.

- [ ] **Step 10: Checkpoint and stop**

After implementation verification:

1. commit any review fixes;
2. update `ROADMAP.md`, `STATUS.md`, and `DECISIONS.md` with the verified implementation SHA and exact results;
3. commit those ledger files as `docs: checkpoint W1-P1`;
4. run `git status --short`, require no output;
5. capture checkpoint HEAD;
6. provide the next fresh-task prompt and stop without starting W1-P2.
