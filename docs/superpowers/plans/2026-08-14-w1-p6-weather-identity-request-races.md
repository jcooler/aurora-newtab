# Weather Identity and Request Races Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Weather cache use depend on the exact normalized Open-Meteo request identity, ensure a newer location can start immediately and can never be overwritten by an older forecast or reverse-geocode completion, and make expiry/visibility refresh deterministic without overlapping work.

**Architecture:** Add one versioned, non-secret Weather request identity built from the normalized coordinates and every provider input that affects the stored canonical payload. `useWeather` exposes only a snapshot whose persisted identity matches the current location, owns one abortable forecast generation per identity, and commits through a storage-authority transaction that re-reads the current stored location before writing. Location selection atomically changes the location and clears the cache; the existing abort-safe city typeahead remains intact while the device reverse-geocode path gains a shared selection generation so it cannot replace a later manual choice. A preview-only real-extension race uses network interception and established storage fixture seeding, not a production bridge.

**Tech Stack:** TypeScript 5.9 strict, React 19, Chrome Manifest V3, Open-Meteo forecast/geocoding APIs, W1-P2 `AuroraStorage`/Web Lock authority, Vitest 3 with Testing Library, and the Playwright real-extension preview harness.

**Spec:** `docs/superpowers/specs/2026-08-13-aurora-2-observatory-design.md` sections 10.3, 10.6, 11, 13, and 16; `docs/superpowers/aurora-2/ROADMAP.md` W1-P6; A2-D009 and A2-D014 in `docs/superpowers/aurora-2/DECISIONS.md`; verified W1-P2/W1-P5 plans and checkpoint evidence.

## Global Constraints

- Execute only W1-P6. Do not implement local-day/DST/midnight/timezone rollover (W1-P7), Notes integrity, privacy/Store copy, Adaptive Stage/layout, CSS redesign, manifests, dependencies, packaging, release staging, or Store actions.
- Preserve `D:\DEV\Chrome plugin` and every V1 artifact. Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory` from checkpoint `7515040b61c0aba64da6e2c0168481c9c40f6edf`; verified W1-P5 implementation is `74d4e27a6fa1262416ac8aa0149020a0ef02918e`.
- Preserve W1-P2 as the sole cross-context mutation authority. Any conditional Weather cache commit must re-read and validate ownership inside the already queued Web Lock callback; a pre-queue React ref check alone is insufficient. Do not add a context-local correctness fallback, service worker, manifest permission, or raw-driver escape hatch.
- Weather request identity is non-secret and versioned. It contains normalized latitude/longitude plus the exact provider origin/path and contract version, canonical request temperature/wind units, forecast-hour/day counts, timezone and time-format modes, and daily/current/hourly field arrays. It excludes the human label, timestamps, display-only unit preference, raw payloads, and unrelated Settings values.
- Normalize finite coordinates once and use the same normalized values for both the Open-Meteo URL and identity. Canonicalize `-0` to `0`; reject non-finite or out-of-range latitude/longitude before fetch. Do not let two distinct request URLs share one identity. A corrupt stored location never throws through React render: it produces no usable snapshot/request/write, exposes a recoverable coordinate error, and leaves Settings clear available.
- Open-Meteo continues to return and persist canonical Celsius and km/h data. `settings.units` remains display-only and must not trigger a network fetch; the request explicitly names `temperature_unit=celsius` and `wind_speed_unit=kmh` so the persisted contract is not dependent on provider defaults.
- A legacy Weather cache without the new identity, or any cache whose identity differs from the current normalized request, is unusable immediately and is never rendered as matching stale data. It may remain schema-valid for backup/backward compatibility and self-heals through refresh; no schema-version migration or destructive global cache rewrite is required.
- Location label is presentation metadata, not cache identity. The widget renders the current stored location label, so a label-only change does not refetch or display a stale label. Same-label locations with different normalized coordinates must never share cached weather.
- One forecast generation owns one `AbortController`, identity, and generation number. A new identity aborts and supersedes old work immediately; an old resolve/reject/finally cannot write cache, set the current error/loading state, release newer work, or block the newer fetch. Abort is quiet.
- Forecast persistence revalidates the current stored location from inside the W1-P2 authority before writing. Cross-tab location changes, location clearing, and a newer selection therefore reject an older completion even if React has not yet rendered the storage event.
- The 30-minute boundary is exact: age `< 30 minutes` is fresh; age `>= 30 minutes` is stale. A visible matching cache schedules one expiry refresh; returning to visibility re-evaluates missing/mismatched/stale cache; repeated visibility events and timer/visibility convergence do not overlap the same identity. W1-P7 calendar/timezone rollover remains excluded; W1-P6 adds no focus listener.
- City typeahead keeps its 300 ms debounce, two-character floor, stale-response abort checks, keyboard behavior, and quiet error contract. Add no new copy or redesign. Its `AbortSignal` becomes an explicit service input rather than an injected fetch wrapper so request cancellation is observable at the fetch boundary.
- Device geolocation and reverse geocode share a location-selection generation and reverse-geocode `AbortController` with manual city selection. A manual choice aborts/invalidates a pending device reverse lookup, synchronously clears obsolete device busy state, and prevents the stale device result from writing location or clearing the newer cache. Unmount aborts/invalidates outstanding callbacks. The conditional device commit rechecks the generation inside `updateMany` after Web Lock entry; device denial/error copy and install-time geolocation permission behavior remain unchanged.
- Every successful manual location set/clear atomically writes `location` and `weatherCache: null` in one `setMany` call. A device success uses one conditional authority-held `updateMany` two-key patch so queued stale ownership is revalidated. Failed persistence leaves the prior pair intact at the driver boundary; W1-P4 backup/restore semantics remain unchanged.
- Tests exercise real identity construction, real provider URL generation/parsing, the production hook, authority-held storage mutation behavior, location UI state, and backup validation. Mocks stop at fetch, time, visibility, and the storage driver. Every production behavior begins with a failing test observed failing for the expected reason.
- The preview harness adds no production global or network stub. Playwright route interception supplies deterministic Open-Meteo responses to the real production fetch path, proves same-name cache suppression/newer-location precedence/late-old non-persistence and visibility refresh, then removes routes and restores every seeded key.
- Final closeout runs the exact targeted suite, `npx tsc --noEmit`, full Vitest, production and preview builds, production preview-symbol searches, the full real-extension harness, bounded whole-packet review/fix/rereview, a dedicated `docs: checkpoint W1-P6` commit, push, clean-state proof, and then stops before W1-P7.

---

### Task 0: Commit the independently reviewed execution base

**Files:**

- Review/fix: `docs/superpowers/plans/2026-08-14-w1-p6-weather-identity-request-races.md`

**Interfaces:**

- Produces: one immutable plan-base SHA for every W1-P6 implementation/review range.
- Records: protected original starting status and HEAD `eb1354b6a5b041fb6d494655c3dae1862572bc51` for final equality proof.

- [ ] **Step 1: Run the independent plan review**

Dispatch a read-only reviewer against this plan, the complete master specification, ROADMAP W1-P6, A2-D009/A2-D014, the verified W1-P2/W1-P5 plans and checkpoint evidence, and current Weather schema/backup/provider/geocode/hook/widget/Settings/harness code. Require Critical/Important/Minor findings with exact plan/code references and explicit coverage of:

- normalized request identity and same-name/different-coordinate separation;
- provider/units/forecast/timezone inputs and display-only unit exclusion;
- legacy/mismatched cache suppression and label-only behavior;
- abort, generation, stale resolve/reject/finally, unmount, retry, and same-identity dedupe;
- W1-P2 updater-time ownership revalidation across contexts;
- exact 30-minute boundary, timer/visibility convergence, and no overlap;
- typeahead AbortSignal propagation and device-geocode/manual-selection ordering;
- atomic location/cache selection and clear behavior;
- backup compatibility, non-secret identity, deterministic harness restoration, and W1-P7 exclusion.

Verify every finding against repository/source evidence. Fix confirmed Critical/Important findings and packet-local Minor correctness gaps in this plan. Reject unsupported or out-of-scope suggestions with exact evidence.

- [ ] **Step 2: Self-review and commit the plan**

Run:

```powershell
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
git add --intent-to-add -- docs/superpowers/plans/2026-08-14-w1-p6-weather-identity-request-races.md
rg -n "TB[D]|TO[D]O|implement late[r]|fill in detail[s]|similar t[o]|appropriate error handlin[g]|write tests fo[r]" docs/superpowers/plans/2026-08-14-w1-p6-weather-identity-request-races.md
git diff --check -- docs/superpowers/plans/2026-08-14-w1-p6-weather-identity-request-races.md
git diff -- docs/superpowers/plans/2026-08-14-w1-p6-weather-identity-request-races.md
```

Require the original checkout to be clean at the literal expected HEAD, the plan diff to be non-empty, no placeholder hits, no whitespace errors, complete spec coverage, and consistent interfaces. Commit only the reviewed plan:

```powershell
git add docs/superpowers/plans/2026-08-14-w1-p6-weather-identity-request-races.md
git commit -m "docs: plan W1-P6 Weather races"
git rev-parse HEAD
```

Record the literal SHA as `W1_P6_PLAN_BASE`.

---

### Task 1: Versioned provider identity and authority-safe cache contract

**Files:**

- Create: `src/services/weather/identity.ts`
- Create: `src/services/weather/identity.test.ts`
- Modify: `src/services/weather/types.ts`
- Modify: `src/services/weather/openMeteo.ts`
- Modify: `src/services/weather/openMeteo.test.ts`
- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/storage/index.test.ts`

**Interfaces:**

- `normalizeWeatherCoordinates(lat, lon): { lat: number; lon: number }` returns finite in-range coordinates rounded to four decimal places, canonicalizes negative zero, and throws `Invalid weather coordinates` otherwise.
- `serializeWeatherRequestContract(contract): string` is a pure deterministic seam used by tests and identity construction. The immutable production contract contains provider origin/path, `temperature_unit=celsius`, `wind_speed_unit=kmh`, `forecast_hours=12`, `forecast_days=1`, `timezone=auto`, `timeformat=iso8601`, and the exact current/hourly/daily field arrays.
- `weatherRequestIdentity(lat, lon): string` returns one stable `open-meteo:v1:` identity over normalized coordinates and the serialized production request contract.
- `WeatherSnapshot.requestIdentity?: string` is optional only so legacy storage/backup values remain parseable. New provider results always include it; `useWeather` never treats absence as usable.
- `WeatherProvider.fetchSnapshot(lat, lon, label, options?)` accepts `{ signal?: AbortSignal }`; Open-Meteo passes it to `fetch` and uses the same normalized coordinates/contract that produced `requestIdentity`.
- Add `AuroraStorage.updateMany(keys, fn)` (exact generic typing selected during implementation) as one authority-held read/modify/write transaction. It reads only named keys, invokes one synchronous updater inside the lock, writes one returned patch, and skips the driver write for an empty patch. It has no implicit authority fallback and calls no public mutation while locked.

- [ ] **Step 1: Write failing identity/provider/schema tests**

Add literal tests proving:

1. `40.712776/-74.005974` normalize to `40.7128/-74.006`; `-0` becomes `0`; non-finite and latitude/longitude outside `[-90,90]`/`[-180,180]` throw before fetch.
2. Same labels are irrelevant: Dallas, Texas and Dallas, Georgia coordinates produce different identities, while coordinate values that normalize to the same request values produce the same identity.
3. Identity changes if any pure contract-fixture field changes and visibly contains only provider/version/normalized public request inputs, never a label, timestamp, payload, or Settings object.
4. Open-Meteo uses normalized coordinates and the same serialized contract: exact origin/path, Celsius, km/h, 12 forecast hours, one forecast day, auto timezone, ISO-8601 time format, and exact current/hourly/daily fields. It forwards the exact `AbortSignal` and returns the matching identity.
5. Provider HTTP failure and abort rejection preserve their existing thrown behavior without persisting/logging the request payload.
6. `isWeatherCache` accepts both a valid legacy cache with no identity and a current cache with string identity, but rejects a non-string identity. `isLocation` accepts valid legacy coordinates and rejects non-finite/out-of-range values. This is backup compatibility only; hook usability is tested separately.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run src/services/weather/identity.test.ts src/services/weather/openMeteo.test.ts src/lib/backup.test.ts
```

Expected: FAIL because the identity module, snapshot identity, explicit request units, AbortSignal option, and backup validation do not exist.

- [ ] **Step 3: Implement the minimal identity/provider/schema contract**

Keep the provider output in canonical Celsius/km/h so existing display helpers remain the only metric/imperial conversion layer. Use one exported request-contract constant in `identity.ts` to construct both the identity and Open-Meteo query parameters; do not maintain separate strings that can drift. Do not include `settings.units`: it changes rendering only and must reuse the cache.

- [ ] **Step 4: Write failing multi-key authority tests**

In `src/lib/storage/index.test.ts`, add:

1. `updateMany(['location', 'weatherCache'], fn)` acquires the same global authority once, reads both current values after lock entry, calls the updater once, and writes its two-key patch once.
2. Two independent storage contexts queue a newer location change before an older Weather conditional commit; the older updater sees the newer stored location inside the lock and returns `{}`, so the old cache never writes.
3. Authority rejection performs no read/updater/write and a later call succeeds.
4. An empty returned patch performs no driver write; an updater throw preserves prior values and does not poison later calls.
5. Existing `init`, `set`, `setMany`, `update`, snapshot, migration, subscription, and rollback behavior remains unchanged.

- [ ] **Step 5: Run storage tests and verify RED**

```powershell
npx vitest run src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/storage/migrations.test.ts
```

Expected: FAIL because `AuroraStorage.updateMany` does not exist.

- [ ] **Step 6: Implement minimal `updateMany`, verify GREEN, and commit Task 1**

Implement `updateMany` on the existing injected authority and raw driver helpers. The updater is synchronous, receives a typed snapshot of only the named keys, and returns a partial patch limited to those keys. Do not expose the driver/authority, add retries, or change `replaceAllWithRollback`.

Run:

```powershell
npx vitest run src/services/weather/identity.test.ts src/services/weather/openMeteo.test.ts src/lib/backup.test.ts src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/storage/migrations.test.ts
npx tsc --noEmit
git diff --check
```

Commit only Task 1 files:

```powershell
git add src/services/weather/identity.ts src/services/weather/identity.test.ts src/services/weather/types.ts src/services/weather/openMeteo.ts src/services/weather/openMeteo.test.ts src/lib/storage/schema.ts src/lib/backup.ts src/lib/backup.test.ts src/lib/storage/index.ts src/lib/storage/index.test.ts
git commit -m "fix(weather): scope cache to provider request"
```

---

### Task 2: Generation-safe forecast refresh and location selection

**Files:**

- Modify: `src/newtab/widgets/weather/useWeather.ts`
- Create: `src/newtab/widgets/weather/useWeather.test.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.test.tsx`
- Modify: `src/newtab/widgets/weather/LocationSetup.tsx`
- Modify: `src/newtab/widgets/weather/LocationSetup.test.tsx`
- Modify: `src/services/weather/geocode.ts`
- Modify: `src/services/weather/geocode.test.ts`
- Modify: `src/services/weather/reverseGeocode.ts`
- Modify: `src/services/weather/reverseGeocode.test.ts`
- Modify: `src/settings/sections/Weather.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/App.test.tsx`

**Interfaces:**

- `useWeather` computes the current request identity during render and returns `snapshot: null` unless `weatherCache.requestIdentity` exactly matches. The widget uses `location.label` for current presentation/forecast-link naming rather than treating the cached label as identity.
- The hook's in-flight record is `{ identity, generation, controller }`, not a global boolean. `refresh()` dedupes only the same current identity; an identity change aborts old work, advances the generation, clears obsolete current error/loading, and starts the new request without waiting for the old promise.
- A resolved forecast calls `storage.updateMany(['location', 'weatherCache'], ...)`; inside the authority-held updater it recomputes identity from stored `location` and returns `{ weatherCache: snapshot }` only if the stored identity, captured identity, current generation, and response identity all match. Otherwise it returns `{}`.
- Only the owning generation may update hook `loading`/`error` or clear the in-flight record. `AbortError` and superseded generations are quiet. Unmount aborts and invalidates the active generation.
- A matching cache with age `< MAX_AGE_MS` is fresh. At `>= MAX_AGE_MS`, the visible hook schedules/starts one refresh. Visibility restoration rechecks the current matching snapshot and starts one refresh if missing or stale; event/timer/manual convergence reuses the same-identity in-flight work.
- `searchCity(query, fetchFn?, signal?)` passes `{ signal }` to fetch. `LocationSetup` continues to check the captured controller after resolve/reject.
- `reverseGeocode(lat, lon, fetchFn?, signal?)` passes `{ signal }` to fetch. It preserves soft failure for current non-abort HTTP/network errors, while `LocationSetup` uses the captured signal/generation to distinguish cancellation from a current lookup.
- `LocationSetup` holds a mounted flag, `selectionGenerationRef`, and device reverse-geocode controller. Starting a device lookup captures a generation; manual selection and unmount abort/invalidate it and manual selection clears obsolete busy state. Device callbacks/reverse-geocode completions update state only when mounted/current. Manual success uses one unconditional `storage.setMany({ location, weatherCache: null })`; device success uses `storage.updateMany(['location', 'weatherCache'], ...)` and returns its two-key patch only when the captured generation is still current inside the authority-held updater.
- Settings clear awaits one `storage.setMany({ location: null, weatherCache: null })`; its button exposes failure as an inline alert and remains retryable if the atomic write rejects. No W1-P8 generalized persistence UI enters this packet.

- [ ] **Step 1: Write failing hook identity/race/refresh tests**

Create a jsdom hook harness under a real `StorageProvider`, mock only `openMeteoProvider` at the network-provider boundary, use deferred promises and fake time, and prove:

1. A fresh legacy cache and a fresh same-label/different-coordinate cache both render as `snapshot: null` and start the current location request; matching identity renders immediately without fetch.
2. A label-only change at identical normalized coordinates keeps the matching cache, performs no fetch, and the widget displays the new stored label. While mounted with that same matching cache, changing `settings.units` from metric to imperial updates the rendered units without a fetch, cache/identity write, loading state, or error transition.
3. Location A starts; location B with the same label is stored while A is pending; B starts immediately. B resolves and persists/displays; A resolves/rejects/finally later and cannot alter B cache, display, error, loading, or in-flight ownership.
4. Hold A at its deferred provider result before it requests `updateMany`; commit B's atomic location/cache patch first; then release A and prove its updater reads B inside the authority and returns `{}`. Separately prove the converse ordering: if A commits before B, B's later atomic clear still leaves the final cache null.
5. Clearing location aborts work, exposes no old snapshot, and an old completion cannot recreate `weatherCache`.
6. Manual refresh calls during one current request dedupe. A failed current request exposes one recoverable error and a later refresh succeeds; an aborted/superseded request exposes no error.
7. Age `MAX_AGE_MS - 1` is fresh and schedules the remaining delay; crossing exactly `MAX_AGE_MS` starts one request. Returning hidden then visible with stale/mismatched cache starts one request; repeated visible events and the expiry timer do not overlap it.
8. Unmount aborts the signal and a late settlement performs no storage or state work. Strict Mode setup/cleanup/setup leaves the live generation operable.
9. A stored location with non-finite or out-of-range coordinates renders no snapshot, starts no fetch/write, exposes `Invalid weather coordinates`, and can still be cleared through Settings.

- [ ] **Step 2: Run hook/widget tests and verify RED**

```powershell
npx vitest run src/newtab/widgets/weather/useWeather.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx
```

Expected: FAIL because cache matching still uses only `locationLabel`, old work globally blocks new work, writes are unconditional, and there is no expiry-timer/generation ownership.

- [ ] **Step 3: Implement the minimal generation-safe hook and current-label rendering**

Do not copy the generic connector snapshot hook or add a second cache key. Weather keeps its existing `location`/`weatherCache` keys and 30-minute stale-while-revalidate presentation only for a matching identity. Keep errors free of coordinates/provider payloads.

- [ ] **Step 4: Write failing geocode/location persistence tests**

Add literal tests proving:

1. `searchCity` and `reverseGeocode` supply the caller's exact AbortSignal to fetch while preserving query/count/mapping/HTTP and soft reverse-lookup behavior.
2. Existing typeahead out-of-order and selection-mid-debounce tests stay green after removing the injected wrapper.
3. Start device geolocation, let its coordinates resolve, hold reverse geocode, then manually select Dallas, Georgia. Manual selection aborts the reverse request and clears device busy state; when the ignored device response resolves late, stored location remains the manual Dallas/Georgia coordinates and cache remains null.
4. Hold the device conditional persistence before Web Lock entry, then invalidate it with a manual selection whose persistence rejects. Release the device commit and prove its updater performs no write; prior location/cache survive and manual retry remains possible.
5. Unmount while device geolocation or reverse geocode is pending; the reverse signal aborts, late callbacks write nothing, and no state-update warning is emitted.
6. Manual and device success each perform one authority-held atomic `{ location, weatherCache: null }` driver patch. A rejected patch preserves both prior values and exposes/reuses the existing inline error path.
7. Settings clear performs one atomic patch; a rejected write preserves both values, renders an associated alert, and a later retry clears both.

- [ ] **Step 5: Run location tests and verify RED**

```powershell
npx vitest run src/services/weather/geocode.test.ts src/services/weather/reverseGeocode.test.ts src/newtab/widgets/weather/LocationSetup.test.tsx src/settings/SettingsPanel.test.tsx -t "Weather|LocationSetup|searchCity|reverseGeocode|clear-location"
```

Expected: FAIL because `searchCity`/`reverseGeocode` do not receive explicit signals, device completion can overwrite a later manual selection, successful selection does not atomically clear cache, and Settings clear is two fire-and-forget writes without failure state.

- [ ] **Step 6: Implement minimal selection generation/atomic persistence and verify GREEN**

Preserve existing Weather UI structure, typeahead copy, keyboard semantics, dropdown clamping, install-time geolocation behavior, and existing settings layout. No optimistic cache mutation beyond clearing it with a committed location change.

Run:

```powershell
npx vitest run src/services/weather/identity.test.ts src/services/weather/geocode.test.ts src/services/weather/reverseGeocode.test.ts src/services/weather/openMeteo.test.ts src/newtab/widgets/weather/useWeather.test.tsx src/newtab/widgets/weather/LocationSetup.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx
npx tsc --noEmit
git diff --check
```

Commit only Task 2 files:

```powershell
git add src/newtab/widgets/weather/useWeather.ts src/newtab/widgets/weather/useWeather.test.tsx src/newtab/widgets/weather/WeatherWidget.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/widgets/weather/LocationSetup.tsx src/newtab/widgets/weather/LocationSetup.test.tsx src/services/weather/geocode.ts src/services/weather/geocode.test.ts src/services/weather/reverseGeocode.ts src/services/weather/reverseGeocode.test.ts src/settings/sections/Weather.tsx src/settings/SettingsPanel.test.tsx src/newtab/App.test.tsx
git commit -m "fix(weather): reject stale request generations"
```

---

### Task 3: Real-extension race proof and complete packet verification

**Files:**

- Modify: `scripts/preview.mjs`
- Modify production/test files only if a new failing unit/component regression first proves a packet-local defect.

**Interfaces:**

- Add one preview-script `weatherRequestIdentity` fixture helper that exactly mirrors the public normalized request contract without importing source into the built extension. Update all seeded Weather caches in the harness with the correct identity for their paired seeded location so unrelated visual/connector probes remain deterministic.
- The W1-P6 block uses Playwright `page.route('**/api.open-meteo.com/**', ...)` to hold/fulfill real production forecast requests. It seeds through the established preview storage helper, never through a new production global.
- The race uses two locations sharing the literal label `Springfield` but with distinct normalized coordinates. For visibility, an inert `about:blank` cover page and `bringToFront()` drive a real extension-page `visible -> hidden -> visible` transition that is asserted in page state. Teardown releases/aborts every deferred route, awaits request settlement, atomically clears location/cache to abort the hook, destroys or reloads the tested document, removes routes, atomically restores the original location/cache pair, closes the cover page, restores viewport/focus, and waits for exact stable storage before downstream probes.

- [ ] **Step 1: Add the deterministic W1-P6 real-extension block and update fixtures**

Add six countable assertions:

1. A cached Springfield-A snapshot is not rendered after Springfield-B becomes current, even though the label and freshness match; B's real production forecast request starts.
2. While A's forecast request is held, B starts immediately with its distinct normalized coordinates and explicit Celsius/km/h/12-hour/auto-timezone query.
3. B's fulfilled response renders the B temperature/current label and persists B's exact request identity.
4. Releasing A after B cannot change visible temperature, stored identity/data, or current error state.
5. A matching cache at exactly the 30-minute boundary refreshes after an asserted hidden-to-visible restoration; a comfortably fresh `MAX_AGE_MS - 60_000` cache does not. The exact `MAX_AGE_MS - 1` fencepost remains fake-time unit evidence, not a real-time browser claim.
6. Repeated visibility restoration while that refresh is held produces one request, and teardown leaves no forecast request or Weather cache/location mutation for downstream probes.

Use hand-written valid Open-Meteo payloads with distinctive current temperatures and exact hourly/daily arrays. Do not claim that route interception proves live provider availability; it proves the built extension's request identity, abort/generation, storage ownership, and visibility behavior. Existing live Weather rendering remains separate incidental evidence.

- [ ] **Step 2: Build preview and run the full harness once**

```powershell
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p6-harness-first.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w1-p6-harness-first.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p6-harness-first.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p6-harness-first.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($fail -ne 0) { throw "Preview harness logged $fail FAIL lines" }
if ($pass -ne 443 -or $skip -ne 3) { throw "Expected W1-P6 harness totals PASS=443 SKIP=3, got PASS=$pass SKIP=$skip" }
```

Expected after Tasks 1-2: 443 PASS / 0 FAIL / 3 SKIP from the W1-P5 checkpoint's 437 / 0 / 3 plus the six W1-P6 lines above. If a W1-P6 line fails, preserve exact evidence, reproduce a production defect with the smallest failing test before editing production, and follow red-green TDD. Remove the untracked first-run log after recording results.

- [ ] **Step 3: Run the complete W1-P6 verification gate**

Run the exact targeted suite:

```powershell
npx vitest run src/services/weather/identity.test.ts src/services/weather/geocode.test.ts src/services/weather/reverseGeocode.test.ts src/services/weather/openMeteo.test.ts src/services/weather/forecast.test.ts src/services/weather/callout.test.ts src/services/weather/codes.test.ts src/services/weather/units.test.ts src/lib/storage/authority.test.ts src/lib/storage/index.test.ts src/lib/storage/migrations.test.ts src/lib/backup.test.ts src/newtab/widgets/weather/useWeather.test.tsx src/newtab/widgets/weather/LocationSetup.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/App.test.tsx src/settings/SettingsPanel.test.tsx
```

Then run fresh:

```powershell
npx tsc --noEmit
npm test
npm run build
rg -n "__auroraStorageHarness|__auroraPermissionsHarnessApi|__auroraBackupHarness|__auroraRestoreHarness" dist
if ($LASTEXITCODE -ne 1) { throw 'Preview-only Aurora bridge leaked into production dist' }
npm run build:preview
node scripts/preview.mjs 2>&1 | Tee-Object -FilePath w1-p6-harness.log
$harnessExit = $LASTEXITCODE
if ($harnessExit -ne 0) { throw "Preview harness process exited $harnessExit" }
$pass = (Select-String -Path w1-p6-harness.log -Pattern '^PASS:').Count
$fail = (Select-String -Path w1-p6-harness.log -Pattern '^FAIL:').Count
$skip = (Select-String -Path w1-p6-harness.log -Pattern '^SKIP:').Count
Write-Output "PASS=$pass FAIL=$fail SKIP=$skip"
if ($fail -ne 0) { throw "Preview harness logged $fail FAIL lines" }
if ($pass -ne 443 -or $skip -ne 3) { throw "Expected W1-P6 harness totals PASS=443 SKIP=3, got PASS=$pass SKIP=$skip" }
git diff --check
git status --short
```

Requirements:

- targeted/full Vitest, TypeScript, production build, and preview build have zero failures;
- the production bridge search exits 1 with no match;
- the full harness process exits 0 and proves exactly 443 PASS / 0 FAIL / 3 SKIP;
- W1-P6 evidence covers normalized provider identity, same-name separation, legacy/mismatch suppression, abort/generation/finally ordering, updater-time stored ownership, exact TTL boundary, visibility dedupe, typeahead signal, device/manual ordering, and atomic location/cache writes;
- preserved W1-P2 storage, W1-P3 permission, W1-P4 restore, and W1-P5 Home Assistant evidence does not regress;
- the three existing SKIPs remain honest Home Assistant/native-permission ceilings; no new SKIP substitutes for Weather race evidence;
- no W1-P7 or later behavior enters the diff.

Delete untracked harness logs after recording counts.

- [ ] **Step 4: Commit the verified harness integration**

```powershell
git add scripts/preview.mjs
git commit -m "test(weather): prove request races in extension"
```

If Task 3 exposed a production/test defect, commit only its exact packet-local files separately before the harness commit. Record the resulting HEAD as the implementation head before whole-packet review.

---

### Task 4: Bounded whole-packet review, fix round, checkpoint, push, and stop

**Files:**

- Review: `W1_P6_PLAN_BASE..HEAD`
- Modify after final verification: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after final verification: `docs/superpowers/aurora-2/STATUS.md`
- Modify after final verification: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**

- Produces: reviewed W1-P6 implementation commits.
- Produces: dedicated `docs: checkpoint W1-P6` handoff commit.
- Produces: pushed `origin/feat/aurora-2-observatory`, clean target/original worktrees, and a W1-P7 continuation prompt without a W1-P7 plan.

- [ ] **Step 1: Request the bounded independent implementation review**

Dispatch a read-only reviewer with plan-base SHA, implementation HEAD, this plan, master spec sections 10.3/10.6/11/13/16, ROADMAP W1-P6, A2-D009/A2-D014, the complete diff, and final verification evidence. Require exact file/line references and Critical/Important/Minor severity. Inspect specifically:

- request identity covers exactly normalized request inputs and no private/unrelated values;
- normalized URL inputs cannot diverge from identity, and provider parsing remains correct;
- legacy/mismatched/same-name caches never render for a different location;
- label-only and display-unit changes behave without unnecessary fetches;
- new location, clear, retry, abort, reject, resolve, finally, Strict Mode, and unmount ordering cannot leak stale state or block current work;
- the cache commit revalidates the current persisted location inside W1-P2 authority;
- `updateMany` preserves authority, failure recovery, typing, and all prior storage/restore behavior;
- exact 30-minute timer/visibility boundaries are deterministic and non-overlapping;
- typeahead/device/manual races and atomic cache clears are complete;
- backup compatibility and preview evidence are deterministic/truthful, production contains no new bridge, teardown is complete, and W1-P7 is absent.

- [ ] **Step 2: Verify and fix confirmed findings with TDD**

For each finding, inspect cited evidence. Reproduce every confirmed defect with the smallest failing unit/component/harness assertion before production edits. Fix confirmed Critical/Important and packet-local Minor correctness findings in one bounded fix wave. Reject unsupported or out-of-scope suggestions with code/spec evidence. Stage only literal confirmed-fix files, inspect the staged set/diff, and commit fixes separately:

```powershell
git status --short
git add -- src/services/weather src/newtab/widgets/weather src/lib/storage/index.ts src/lib/storage/index.test.ts src/lib/storage/schema.ts src/lib/backup.ts src/lib/backup.test.ts src/settings/sections/Weather.tsx src/settings/SettingsPanel.test.tsx src/newtab/App.test.tsx scripts/preview.mjs
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m "fix(weather): address W1-P6 review"
```

Request one scoped rereview over the fix range. No Critical/Important or packet-local correctness finding may remain. After any fix, rerun Task 3 Step 3 completely.

- [ ] **Step 3: Update durable ledgers after fresh final verification**

Update:

- `ROADMAP.md`: mark W1-P6 `Verified`, link this plan, record exact acceptance evidence, implementation SHA, review disposition, and checkpoint subject; leave W1-P7 `Not started` with no plan.
- `STATUS.md`: record the W1-P6 envelope, plan/implementation/review commits, exact targeted/full/type/build/harness counts, request identity/normalization/cache rules, race/visibility/storage evidence, clean state, and W1-P7 as the single next packet.
- `DECISIONS.md`: append A2-D015 recording the normalized Open-Meteo identity contract, legacy cache invalidation, authority-held ownership check, abortable generations, exact TTL/visibility behavior, atomic location/cache writes, and deterministic extension evidence.

Commit only the ledger handoff:

```powershell
git add docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/DECISIONS.md
git commit -m "docs: checkpoint W1-P6"
```

- [ ] **Step 4: Push, prove clean state, prepare the next prompt, and stop**

```powershell
git push origin feat/aurora-2-observatory
git status --short --branch
git rev-parse HEAD
git rev-parse '@{upstream}'
git log -12 --oneline
git -C 'D:\DEV\Chrome plugin' status --short --branch
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
```

Require local/upstream equality, no target-worktree entries, and the protected original still clean at recorded starting HEAD `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Provide a ready-to-paste next-session prompt naming the literal worktree, branch, checkpoint HEAD, verified W1-P6 implementation SHA, Packet `W1-P7`, required documents, and instruction to create/review its plan just in time. Stop before creating a W1-P7 plan or changing local-day behavior.
