# Aurora At-a-glance Additions Implementation Plan

> **Required execution:** Follow strict RED, GREEN, refactor ordering. Observe a
> focused failing test before each production behavior. Do not batch production
> changes ahead of their tests.

**Goal:** Add On This Day, Public Holidays, and Aurora & Kp as useful keyless
widgets, then enrich Weather with independently fresh official NWS alerts.

**Architecture:** Reuse the additive connector config and snapshot authority for
the three public-data identities in a new `At a glance` Settings category. Add a
separate cache-only Weather alert authority because NWS freshness and coverage
differ from Open-Meteo. Preserve schema v16, exact recovery, existing provider
identities, and one mounted request owner per widget.

**Design:** `docs/superpowers/specs/2026-08-22-aurora-at-a-glance-additions-design.md`

**Research:** `docs/superpowers/reports/AT-A-GLANCE-PROVIDER-RESEARCH.md`

## Guardrails

- Work only in `D:\DEV\Chrome plugin-aurora-2`; keep the protected checkout
  read-only at exact `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- No Store action, schema bump, migration, dependency, OAuth, background worker,
  remote image, broad permission, widget-toggle key, or legacy `layout` write.
- Never log provider responses, selected coordinates, or fetched content.
- One bounded review and at most one fix/rereview cycle for this packet.

## Task 1: Add identities and the shared public-data shell

**RED:** Extend registry, privacy, backup, layout, tier, fixture, settings-body,
renderer, and catalog parity tests for `onThisDay`, `publicHolidays`, and
`auroraKp`. Pin schema v16, no initialization write, normalized no-auth configs,
`at-a-glance` category order, static Compact placements, four tiers, and a shell
covering setup/loading/empty/stale/retained-error/hard-error/ready/Full overflow/
Docked detail without a blank husk.

**GREEN:** Change connector types/registry, privacy inventory, backup contracts,
layout identities/defaults, widget registry/tiers, inert fixtures, and add
`src/newtab/widgets/glance/GlanceWidgetShell.tsx`. Descriptors own no optional
permission origins. The shell owns no request or storage authority.

**Gate:** registry, privacy, backup, widget registry/tier, shell tests, then tsc.

## Task 2: Implement the On This Day service

**RED:** In `src/services/onThisDay.test.ts`, pin the exact zero-padded per-wiki
URL, eight-second abort, `on-this-day:v1:en:MM-DD` scope, next-local-midnight
expiry across DST, selected-events-first ordering, year+text dedupe, 12/4/4
caps, malformed-row dropping, invalid-top-level failure, safe English Wikipedia
links, and content-free errors.

**GREEN:** Add `src/services/onThisDay.ts` with pure request, normalization,
scope, local-midnight, and safe-link helpers. Exclude remote images.

**Gate:** On This Day service and connector identity tests, then tsc.

## Task 3: Deliver On This Day in Settings and all tiers

**RED:** Settings tests pin explicit keyless enable/disable and this-snapshot-only
clearing. Widget tests pin one `useConnectorSnapshot` owner with `useLocalDay`;
Compact one event, Standard three, Full six plus bounded births/deaths, Docked
one dense clickable event; setup/loading/empty/stale/errors/max/local-day-rollover;
visible Wikipedia attribution and safe article navigation.

**GREEN:** Add the no-auth Settings body, `OnThisDayWidget.tsx`, and renderer
wiring using existing dialog, retry, safe navigation, and local-scroll primitives.

**Gate:** focused Settings, widget, renderer tests, then tsc.

## Task 4: Implement Public Holidays setup and service

**RED:** Pin AvailableCountries loading only while the editor is open, searchable
native country selection, validation, this-config/this-snapshot-only writes, and
stale country/disable rejection. In `publicHolidays.test.ts`, pin parallel current
and next-year URLs, eight-second abort, local-field `YYYY-MM-DD` parsing, matching
country plus `global:true` plus `Public` filtering, dedupe/sort/cap 40, invalid
response failure, country/year scope, and next-local-midnight expiry.

**GREEN:** Add pure country/holiday normalization and the explicit country
Settings body. Country preference may enter backup; snapshots remain excluded.

**Gate:** Public Holidays service, Settings, backup tests, then tsc.

## Task 5: Deliver Public Holidays in all tiers

**RED:** Pin compact setup navigation; Compact next holiday/date/days-away;
Standard next three; Full current+next-year groups with local scroll; Docked
next holiday/date with the same detail; year-end continuity, differing local
names, empty/stale/errors/max data, and local calendar math.

**GREEN:** Add `PublicHolidaysWidget.tsx` and renderer wiring with one snapshot
owner and contextual country-change navigation.

**Gate:** Public Holidays widget and renderer tests, then tsc.

## Task 6: Implement the Aurora & Kp service

**RED:** In `auroraKp.test.ts`, pin the NOAA SWPC URL, eight-second abort,
`aurora-kp:v1` scope, timestamped Kp 0..9, observed/estimated/predicted states,
optional G1..G5, latest current interval, 72-hour/cap-25 forecast, highest peak
with earliest tie, Quiet/Unsettled/Storm thresholds, and no visibility claim.

**GREEN:** Add pure request, parser, current/peak, and local-grouping helpers with
the descriptor's 15-minute TTL. Exclude the OVATION grid.

**Gate:** Aurora Kp service and connector identity tests, then tsc.

## Task 7: Deliver Aurora & Kp in Settings and all tiers

**RED:** Pin keyless enable/disable; Compact current/activity/peak; Standard storm
scale and four intervals; Full bounded three-day groups; Docked current+peak and
same detail; empty/stale/errors/max; NOAA attribution; and truthful guidance that
darkness, cloud, location, and light pollution still govern visibility.

**GREEN:** Add the no-auth Settings body, `AuroraKpWidget.tsx`, and renderer
wiring with one snapshot owner, local Full overflow, and adaptive text tones.

**Gate:** focused Settings, Aurora Kp widget, renderer tests, then tsc.

## Task 8: Add the NWS cache and provider boundary

**RED:** Pin additive `weatherAlertCache:null` default with schema v16 and
identity migrations; cache omission/rejection/null-on-restore across backup;
rounded-coordinate identity; exact NWS point URL and GeoJSON Accept header;
eight-second abort; maximum 12 bounded alerts; severity then expiry sorting;
400/404 unsupported; other failures/error privacy.

**GREEN:** Change storage defaults/types and all backup paths atomically without
a migration/version write. Add `src/services/weatherAlerts.ts` pure request and
normalization plus the rounded-coordinate privacy flow. Add no permission.

**Gate:** schema, storage, backup, weather-alert service, privacy tests, then tsc.

## Task 9: Integrate alerts into the single Weather identity

**RED:** In `useWeatherAlerts.test.tsx`, pin five-minute visible refresh,
same-identity dedupe, abort, and stored-location revalidation inside queued writes;
late location/disable/restore/unmount responses cannot commit; retained matching
data survives error. Weather tests pin Severe/Extreme naming in Compact/Docked,
highest active alert in Standard, supported no-alert/active/unavailable expanded
states, unsupported omission, and forecast/AQI/UV/pollen usefulness on alert error.

**GREEN:** Add one `useWeatherAlerts` owner beside existing Weather owners and
the smallest accepted tier enrichments. Do not alter `weatherRequestIdentity`,
`environmentRequestIdentity`, `openMeteoProvider`, or `useWeather`.

**Gate:** alert hook, Weather widget, and alert service tests, then tsc.

## Task 10: Close fixtures, catalog, privacy, and layout parity

**RED:** Extend exact identity-count and cross-authority tests. Pin inert setup,
maximum, empty, malformed, stale/error, year-boundary, unsupported NWS, and mixed
severity fixtures; static placements; no hidden Compact fallback; useful Full
local overflow; Docked height/context; and accurate public-source/privacy copy.

**GREEN:** Extend only the governing fixture/catalog/evidence authorities with
reserved deterministic data. Do not introduce placeholder UI or profile-driven
layout behavior.

**Gate:** `src/test`, newtab, connector, privacy, layout, and backup suites, tsc.

## Task 11: Add guarded rebuilt-Chromium evidence

**RED:** Add syntax/static harness tests and first observe a failed request
allowlist assertion. Pin reviewed-commit guard, exact fixture routes, no unknown
requests/runtime or console errors/legacy-layout writes/provider leaks, expected
cache-only writes, and existing-layout-shaped storage.

**GREEN:** Add `scripts/preview-at-a-glance.mjs` and bounded gitignored scratch
paths. Rebuild exact commit, intercept only inert data, and capture all four tiers,
setup/max/stale/error, local-midnight/year-boundary, NWS unsupported/active states,
1408x445 and normal desktop usefulness, local scroll, click parity, overlap,
viewport, and no-whitespace judgments.

**Gate:** node syntax, production build, then guarded harness from exact commit.

## Task 12: Stabilize, review once, and checkpoint

Run focused provider/widget/settings/storage/privacy gates, `npm test`, expansion
contracts, information-first contracts, tsc, production build, Chromium evidence,
and `git diff --check`. Request one bounded review. Fix only Critical/Important
findings in one focused RED/GREEN cycle, then one rereview. Record Minor debt.

Update STATUS, ROADMAP, and DECISIONS with sources, cache/backup boundaries,
verification totals, evidence, review verdict, and Store block. Commit, push, and
prove active HEAD equals upstream, active tree clean, and protected original clean
at exact `eb1354b6a5b041fb6d494655c3dae1862572bc51`.

## Packet exit criteria

- The three new identities are complete across Settings, services, four tiers,
  layout, privacy, backup, fixtures, catalog, and evidence.
- Severe weather exists only inside Weather with independent freshness and cannot
  degrade accepted forecast/environment behavior.
- Schema remains v16; no migration, dependency, credential, permission, legacy
  layout write, protected-checkout change, or Store action occurs.
- The exact reviewed commit passes focused/full/expansion/information-first/tsc/
  build/hygiene/Chromium gates and the branch is checkpointed and pushed.
