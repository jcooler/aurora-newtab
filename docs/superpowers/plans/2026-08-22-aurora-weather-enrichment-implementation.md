# Aurora Weather Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to execute this plan task by task. The owner has
> authorized back-to-back execution, so do not pause for routine continuation.

**Goal:** Add truthful US AQI, UV, and geographically honest pollen context to
expanded Weather while preserving the accepted concise tiers, exact forecast
cache ownership, race safety, and failure usefulness.

**Architecture:** Keep the existing forecast request and identity unchanged.
Add one immutable Open-Meteo Air Quality request contract and a separately
identified optional `environment` leg inside `WeatherSnapshot`. The existing
provider and `useWeather` generation own both requests. Forecast failure keeps
the existing error path; a non-abort environmental failure becomes a cached,
truthful unavailable result so Weather remains useful and does not request-loop.
The expanded dialog renders one information-dense definition grid with no
nested cards; Compact and Docked remain byte-compatible in behavior.

**Tech Stack:** TypeScript 5.9 strict, React 19, Chrome Manifest V3, Open-Meteo
Forecast and Air Quality APIs, authority-backed `chrome.storage.local`, Vitest,
Testing Library, Node's test runner, and Playwright against the built extension.

**Specs:**

- `docs/superpowers/specs/2026-08-22-aurora-weather-enrichment-design.md`
- `docs/superpowers/specs/2026-08-21-aurora-continuous-delivery-roadmap-design.md`
- `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md`

## Global constraints

- Preserve the forecast URL, field lists, `open-meteo:v1:` identity, 30-minute
  TTL, generation ownership, atomic `location`/`weatherCache` writes, and exact
  updater-time location check.
- Add no storage key, schema version, migration, dependency, CSP change,
  manifest permission, permission transaction, credential, or backend.
- A pre-packet Weather cache stays valid for forecast rendering and triggers
  one deduplicated environmental self-heal while visible.
- Environment-only self-heal/retry uses a distinct `enrichmentPending` state
  under the same fetch owner. It must not show closed-widget `Refreshing`
  feedback, alter Compact/Docked DOM, or change closed geometry.
- Environmental failure must never suppress a successful forecast, but an
  abort must cancel the whole current generation and must never be cached.
- Pollen availability comes only from finite provider values. Do not infer it
  from coordinates, countries, seasons, or dates.
- Compact and Docked Weather remain concise and click the same details dialog.
  No environmental value changes closed-widget geometry.
- Preserve the approved rain hour, wind arrow/label, sunrise sun, and sunset
  moon behavior with explicit regression tests.
- AQI, UV, and pollen meaning is visible text, never color-only. Do not paint a
  panel background that fights user-selected black, pink, translucent, or
  other widget colors.
- Keep one Weather hook/provider/data owner. Do not create separate widgets or
  a second React fetch owner.
- New browser evidence writes only to ignored `.qa-weather-enrichment-*`
  scratch paths. Accepted `docs/superpowers/qa/nl-p6` evidence is immutable.
- Do not modify `D:\DEV\Chrome plugin`; it stays read-only at `eb1354b6`.
- Do not mutate Chrome Web Store state without new action-specific W6-P5
  approval.
- Observe a focused failing test before each production change. Request one
  bounded review and use at most one confirmed-finding fix/rereview cycle.
- Rebuild `dist` from the exact reviewed production commit before owner-facing
  screenshot inspection.

## Fixed implementation decisions

1. `WeatherSnapshot.environment` is optional and has this exact conceptual
   shape:

```ts
interface WeatherEnvironmentSnapshot {
  requestIdentity: string
  fetchedAt: number
  status: 'available' | 'unavailable'
  usAqi: number | null
  uvIndex: number | null
  pollen:
    | { status: 'available'; readings: PollenReading[] }
    | { status: 'unavailable' }
}
```

2. `PollenReading.species` is one fixed union in provider order: alder, birch,
   grass, mugwort, olive, ragweed. Values are finite and non-negative.

3. `environmentIdentity.ts` owns the exact request contract, URL, identity,
   provider-payload mapper, and pure AQI/UV/pollen presentation derivations.
   The forecast identity file remains untouched except for reusing its exported
   coordinate normalizer.

4. The Air Quality request uses current fields only:
   `us_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`
   plus `timezone=auto` and normalized latitude/longitude.

5. The provider starts both fetches with the same `AbortSignal`. A non-abort
   environmental exception maps to `status: unavailable`; an AbortError is
   rethrown by identity. Forecast mapping and failure semantics stay unchanged.

6. `useWeather` computes both expected identities. A matching forecast cache
   is immediately renderable. Its environment is exposed only when the nested
   identity matches; otherwise the exposed snapshot omits that leg and one
   refresh starts. A recent matching unavailable leg counts as current and
   exposes explicit retry. `enrichmentPending` is separate from forecast
   `loading`, so background self-heal cannot add closed-widget feedback.

7. The expanded grid adds AQI, UV, and Pollen after the existing conditions
   facts. It uses content-driven rows. Partial success renders only finite
   AQI/UV cells and the truthful pollen state. Success with no fact family uses
   one full-width `Environmental readings unavailable for this location` line;
   endpoint failure uses `Environmental data unavailable`; pending self-heal
   uses `Loading environmental data`. No state reserves blank placeholders.

8. AQI uses official six-band US AQI text after whole-number rounding. UV uses
   Low, Moderate, High, Very high, and Extreme after whole-number rounding.
   Category and display always consume the same rounded integer. Pollen shows
   the highest current species and exact `grains/m³`, or `No pollen detected`
   when every available value is zero.

9. The exact quiet visible `Air quality and pollen: CAMS ENSEMBLE via
   Open-Meteo` attribution appears only in the expanded dialog and links to the
   Open-Meteo Air Quality documentation with safe external-link attributes.

## Task 0: Approve and checkpoint this just-in-time plan

**Files:**

- Create: `docs/superpowers/plans/2026-08-22-aurora-weather-enrichment-implementation.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`

**Steps:**

- [x] Confirm design commit `b5d71d4` equals upstream before committing the
  intentionally dirty plan/ledger files; confirm the protected checkout is
  clean at `eb1354b6`.
- [x] Independently review the plan against both Weather specs, existing
  identity/race guarantees, backup/privacy boundaries, and the owner feedback.
- [x] Resolve only confirmed Critical/Important plan findings.
- [x] Update STATUS and ROADMAP to name this file as the active executable plan.
- [x] Run placeholder, typography, protected-path, and `git diff --check`
  scans.
- [x] Commit and push the plan checkpoint before production changes.

## Task 1: Add the environmental contract, model, and pure meaning

**Files:**

- Create: `src/services/weather/environmentIdentity.ts`
- Create: `src/services/weather/environmentIdentity.test.ts`
- Modify: `src/lib/storage/schema.ts`

**RED:**

- [x] Add tests importing the missing environmental contract, URL, identity,
  mapper, AQI category, UV category, and dominant-pollen functions. Assert the
  exact host/path/current-field order, `timezone=auto`, four-decimal coordinate
  normalization, `-0` canonicalization, invalid coordinate rejection, public
  identity contents, and identity drift when the contract changes.
- [x] Assert all AQI/UV category boundaries, fractional values immediately on
  both sides of rounding boundaries, one shared rounded display/category value,
  fixed pollen ordering, highest-value selection, zero result, null/missing
  unavailable result, malformed finite/negative rejection, and stable species
  labels.
- [x] Run:

```powershell
npx vitest run src/services/weather/environmentIdentity.test.ts
```

Record the missing-module/export failure.

**GREEN:**

- [x] Add the optional schema types without changing `CURRENT_VERSION` or
  defaults.
- [x] Implement one immutable contract and one serializer for both URL and
  identity. Reuse `normalizeWeatherCoordinates` rather than copying its rules.
- [x] Implement the pure categories and provider-value mapper with no DOM,
  storage, network, locale, or color dependency.
- [x] Rerun the focused file and `npx tsc --noEmit`.
- [x] Commit `feat(weather): define environmental readings`.

## Task 2: Fetch both provider legs without sacrificing forecast usefulness

**Files:**

- Modify: `src/services/weather/openMeteo.ts`
- Modify: `src/services/weather/openMeteo.test.ts`
- Modify: `src/services/weather/types.ts` only if a type comment is needed

**RED:**

- [x] Extend provider tests so one call produces exactly one forecast GET and
  one environmental GET with the same signal and normalized coordinates.
- [x] Cover fully available data, pollen-null success, environmental HTTP
  failure, environmental JSON/mapping failure, forecast HTTP failure, forecast
  rejection, and environmental AbortError. Include forecast-fails-first while
  the environmental promise later rejects; it must create no unhandled
  rejection, cache result, or late mutation.
- [x] Assert forecast success plus environmental failure returns a normal
  Weather snapshot with exact unavailable environment identity/fetchedAt;
  forecast failure still rejects; abort is never converted to unavailable.
- [x] Run `npx vitest run src/services/weather/openMeteo.test.ts` and record the
  focused failures.

**GREEN:**

- [x] Start both requests together, pass the exact signal to each, and keep
  forecast mapping byte-compatible.
- [x] Map environmental success with the pure mapper. Catch only non-abort
  environmental failures and construct the exact unavailable snapshot.
- [x] Use one captured completion timestamp for the aggregate snapshot and its
  environment leg so TTL comparisons are deterministic.
- [x] Rerun the provider and identity tests plus TypeScript.
- [x] Commit `feat(weather): fetch optional environmental context`.

## Task 3: Preserve backup and privacy truth

**Files:**

- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/privacy/dataFlows.test.ts`
- Modify: `PRIVACY.md`

**RED:**

- [x] Add backup tests accepting pre-packet caches, available environment data,
  unavailable environment data, and canonical partial pollen subsequences.
  Reject unknown nested keys, unknown species, duplicate/reordered species,
  empty available pollen, negative/non-finite values, malformed identity/status,
  contradictory unavailable discriminants, extra-shape arrays, and invalid
  nullable AQI/UV values.
- [x] Add privacy tests expecting a fifth fixed flow named
  `weatherEnvironment` with the exact provider-direct destination, trigger,
  sent/received data, permission, cache, method, and backend contract.
- [x] Add a source-contract assertion over `PRIVACY.md`, then update its fixed
  endpoint count, Weather endpoint list, trigger, sent/received fields, and
  included environmental cache description. Store listing/dashboard state
  remains untouched.
- [x] Prove export/import keeps the valid environment object byte-exact and
  adds no redaction entry.
- [x] Run the two focused test files and record the failures.

**GREEN:**

- [x] Implement strict optional nested validation while leaving legacy cache
  acceptance unchanged.
- [x] Add the environmental data flow without changing manifest generation or
  permission ownership.
- [x] Rerun focused tests and TypeScript.
- [x] Commit `feat(weather): validate and disclose environmental cache data`.

## Task 4: Self-heal old caches under the existing race authority

**Files:**

- Modify: `src/newtab/widgets/weather/useWeather.ts`
- Modify: `src/newtab/widgets/weather/useWeather.test.tsx`

**RED:**

- [x] Update the shared post-packet fixture helper to include a matching recent
  environment leg, then add explicit tests for a pre-packet cache and a
  mismatched environmental identity. Both must render forecast immediately,
  omit environmental data, and start exactly one refresh.
- [x] Add tests proving a matching recent unavailable leg does not loop, the
  exact TTL refreshes both legs once, explicit retry replaces unavailable data,
  and a label-only location change does not fetch.
- [x] Prove old-cache self-heal sets `enrichmentPending` without setting
  forecast `loading` or changing resource state from success; an expanded
  consumer sees pending truth while closed consumers remain byte-compatible.
- [x] Extend the existing newer-location, silent second-context, clear,
  unmount, late rejection, StrictMode, and dedupe tests to assert both expected
  identities before persistence.
- [x] Run `npx vitest run src/newtab/widgets/weather/useWeather.test.tsx` and
  record focused failures.

**GREEN:**

- [x] Compute expected forecast and environmental identities during render,
  with one recoverable coordinate error boundary.
- [x] Keep matching forecast data renderable while stripping an absent or
  mismatched environment leg from the exposed snapshot.
- [x] Treat incomplete environmental identity/freshness as one refresh reason
  without changing resource freshness for an otherwise usable forecast.
- [x] Keep environment-only self-heal/retry out of the shared `loading` flag;
  clear `enrichmentPending` on success, unavailable settlement, abort, identity
  change, clear, unmount, and late rejection.
- [x] Revalidate both identities against the authority-held stored location
  before writing.
- [x] Rerun the focused hook/provider/identity tests and TypeScript.
- [x] Commit `fix(weather): self-heal enrichment under request ownership`.

## Task 5: Fill expanded Weather with readable environmental facts

**Files:**

- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.test.tsx`
- Modify: `src/newtab/index.css` only if a semantic tone selector cannot be
  expressed with existing token utilities

**RED:**

- [x] Add expanded-dialog tests for AQI value/category, UV value/category,
  dominant pollen and units, zero pollen, pollen unavailable here, and complete
  environmental failure.
- [x] Cover AQI-only, UV-only, pollen-only, and successful none-present payloads
  with content-driven omission and no empty definition cells. Pin fractional
  AQI/UV display/category agreement.
- [x] Add accessible-name tests showing meaning is not color-only and the CAMS
  via Open-Meteo attribution is visible, safely linked, and keyboard reachable.
- [x] Add regression assertions that Compact and Docked content, dock click
  parity, full hourly summary, rain hour, compass arrow/label, sunrise sun,
  sunset moon, Escape, and focus restoration are unchanged.
- [x] Add an old-cache UI case that opens useful forecast details while the
  enrichment refresh is pending. Assert exact Compact and Docked closed DOM and
  geometry remain unchanged during that pending state.
- [x] Add the user-facing retry path: unavailable details show Refresh; clicking
  it keeps forecast visible, shows environmental pending only inside the open
  dialog, and replaces unavailable facts on success.
- [x] Run `npx vitest run src/newtab/widgets/weather/WeatherWidget.test.tsx`
  and record the failures.

**GREEN:**

- [x] Refactor the existing details `dl` into content-driven condition and
  environmental groups without nested cards or fixed empty rows.
- [x] Use existing semantic type/color tokens and visible category text. Any
  category tint must preserve readable text over arbitrary panel colors.
- [x] Render exactly one full-width unavailable line on environmental failure,
  and a distinct pollen-unavailable fact on successful non-pollen responses.
- [x] Keep summary branches and details-dialog geometry ownership unchanged.
- [x] Rerun Weather widget/hook/provider tests and TypeScript.
- [x] Commit `feat(weather): add environmental glance details`.

## Task 6: Add the focused built-extension Weather witness

**Files:**

- Create: `scripts/qa-weather-enrichment.mjs`
- Create: `scripts/qa-weather-enrichment.test.mjs`
- Modify: `.gitignore`
- Modify: `package.json` only if adding the stable command
  `qa:weather-enrichment`

**RED:**

- [x] Add a Node contract test requiring safe scratch-only output handling,
  production `dist` loading, exact forecast/environment route fixtures,
  successful/pollen-unavailable/environment-failure states, four corners,
  Docked click parity, exact 1408x445, normal desktop, reload, request/storage
  accounting, and original-resolution captures.
- [x] Run `node --test scripts/qa-weather-enrichment.test.mjs` and record the
  missing-harness failures.

**GREEN:**

- [x] Implement the harness with destructive-path guards matching the NL-P6
  output helper and ignored `.qa-weather-enrichment-*` roots only.
- [x] Seed real named-layout-shaped storage. Route the two production provider
  URLs without monkey-patching application code.
- [x] For every state assert useful visible text, exact category/availability,
  clamped dialog, no horizontal page overflow, no degenerate/offscreen box,
  no plain-click selection chrome, no unexpected request, no failed request,
  no runtime error, and no forbidden `layout` write.
- [x] Snapshot production and preview manifest permissions, record
  `chrome.permissions.getAll()` and origin-lifecycle storage before/after, and
  assert the environmental request causes no permission request/grant or owner
  mutation. Add a static source assertion that Weather imports no permission
  transaction.
- [x] Exercise one continuous recovery path in the built extension: begin with
  the environmental endpoint failing, open details and verify the forecast is
  still useful, change only the environmental route to success, click the
  visible Refresh control, and verify the new AQI/UV/pollen facts plus the exact
  persisted environmental identity. Forecast content must never disappear and
  the transition must add no permission, origin-owner, legacy `layout`, or
  unrelated storage write.
- [x] Capture and inspect all corner, Docked, 1408x445, normal-height,
  unavailable, and reload images at original resolution.
- [x] Run the contract test, syntax check, this exact focused unit gate,
  TypeScript, and `git diff --check`:

```powershell
node --test scripts/qa-weather-enrichment.test.mjs
node --check scripts/qa-weather-enrichment.mjs
npx vitest run src/services/weather/environmentIdentity.test.ts src/services/weather/identity.test.ts src/services/weather/openMeteo.test.ts src/newtab/widgets/weather/useWeather.test.tsx src/newtab/widgets/weather/WeatherWidget.test.tsx src/lib/backup.test.ts src/privacy/dataFlows.test.ts
npx tsc --noEmit
git diff --check
```
- [x] Commit `test(weather): witness environmental enrichment in Chromium`.

## Task 7: Review, stabilize, document, and checkpoint

**Files:**

- Modify only confirmed review-finding files in the one allowed fix cycle
- Create: `docs/superpowers/reports/WEATHER-ENRICHMENT-QA.md`
- Modify: `README.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: this plan checklist

**Steps:**

- [x] Commit the complete pre-review packet and request one independent bounded
  review from plan checkpoint through that commit. Ask explicitly for identity,
  abort/failure, cache, backup/privacy, no-whitespace, accessibility, and
  harness-honesty findings classified Critical/Important/Minor.
- [x] If Critical/Important findings exist, observe focused RED tests, apply one
  bounded fix commit, rerun focused checks, and request one rereview. Ledger
  Minor findings instead of opening more cycles.
- [x] From the exact reviewed production commit run once:

```powershell
npm test
npx tsc --noEmit
npm run test:information-first-contract
node --test scripts/qa-nl-p6-output.test.mjs
npm run build
node --test scripts/qa-weather-enrichment.test.mjs
node scripts/qa-weather-enrichment.mjs --out-dir=.qa-weather-enrichment-final
git diff --check
```

- [x] Rebuild `dist` with `npm run build` immediately before the browser run and
  record the reviewed commit inside the report.
- [x] Inspect every original-resolution Weather capture individually and record
  per-capture usefulness, not only aggregate invariants.
- [x] Update README provider/privacy/Weather copy, A2-D065, STATUS, ROADMAP, the
  QA report, and every completed checklist item. Do not alter Store artifacts.
- [x] Commit `docs: checkpoint Aurora Weather enrichment` and push the active
  branch.
- [x] Prove local/upstream HEAD equality and clean active/protected checkouts.
- [x] Reread the continuous roadmap and begin Program E's just-in-time
  expansion-platform design and plan without asking for routine continuation.

## Definition of done

This packet is done only when every checkbox is complete; forecast behavior and
identity remain exact; environmental data is separately identified, validated,
and race-safe; forecast remains useful during environmental failure; pollen is
truthful about availability; expanded Weather is dense and readable; Compact
and Docked are unchanged; fixed data flows and backup recovery are current; one
bounded review/fix cycle has no Critical/Important finding open; the stabilized
unit/type/build/Chromium gate and image inspection are recorded; ledgers are
current; the checkpoint is pushed cleanly; and the protected original and Store
state remain untouched.
