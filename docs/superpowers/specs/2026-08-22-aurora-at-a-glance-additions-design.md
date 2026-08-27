# Aurora At-a-glance Additions Design

**Status:** Approved for implementation by the owner's accepted candidate list and continuous-delivery authorization in A2-D062.

**Research:** `docs/superpowers/reports/AT-A-GLANCE-PROVIDER-RESEARCH.md`

**Extends:**

- `2026-08-22-aurora-expansion-platform-design.md`
- `2026-08-21-aurora-continuous-delivery-roadmap-design.md`
- `2026-08-17-aurora-named-layouts-live-canvas-design.md`

**Packet boundary:** The At-a-glance wave only. It adds On This Day, Public Holidays, and Aurora & Kp as three user-enabled public-data widgets and adds official severe-weather context inside Weather. It does not add stocks, a fourth severe-weather widget, OAuth, a backend, background workers, remote images, or Chrome Web Store work.

## 1. Product law

Each identity answers one repeatable glance question:

- On This Day: What happened on this date?
- Public Holidays: What national holiday is coming up?
- Aurora & Kp: How active is Earth's geomagnetic field now and over the next three days?
- Weather alerts: Is an official NWS watch, warning, or advisory active for this Weather location?

Every answer names its context. No unexplained dot, count, severity, or probability is allowed. Kp describes geomagnetic activity, not guaranteed local aurora visibility. NWS coverage is not presented as global.

## 2. Goals

1. Add three keyless public-data identities with useful Compact, Standard, Full, and Docked tiers.
2. Keep one mounted request owner per identity, bounded stale-while-revalidate caches, and no provider data in backup for the three new widgets.
3. Add official severe-weather alerts to Weather without changing the existing Open-Meteo forecast or environmental request identities.
4. Make Public Holidays country selection explicit and structured, never inferred or comma-separated.
5. Prove source contracts, local-day boundaries, degraded states, short-height usefulness, and no-whitespace behavior in rebuilt Chromium.

## 3. Non-goals

- No language picker in On This Day v1. English Wikipedia is the explicit source.
- No holiday subdivision picker or non-public observance calendar in v1. Only national entries with `global: true` and `Public` type render.
- No location-specific aurora probability, light-pollution model, cloud integration, map, or OVATION grid.
- No severe-weather data outside official NWS coverage and no duplicate alert widget.
- No notification, alarm, badge, sound, service-worker polling, or request while the owning widget is unmounted.
- No new dependency, broad permission, existing connector request change, legacy `layout` write, recovery change, or Store action.

## 4. Shared public-data architecture

On This Day, Public Holidays, and Aurora & Kp use Aurora's existing connector config and `connectorSnapshots` authorities internally. They are user-facing widgets in an `At a glance` Settings category, not credential connectors.

Each config is additive inside the existing partial connector map:

```ts
interface OnThisDayConfig {
  enabled: boolean
}

interface PublicHolidaysConfig {
  enabled: boolean
  countryCode: string
}

interface AuroraKpConfig {
  enabled: boolean
}
```

There is no token, identity field, host-permission transaction, migration, schema-version bump, or default config write. Absent means disabled and unconfigured. Public Holidays is not considered configured until it has a validated two-letter country code. The no-auth descriptors own no optional Chrome host permission because all selected endpoints expose browser CORS; their exact network destinations remain pinned in services, privacy inventory, tests, and the catalog.

Snapshots remain excluded from backup. Public Holidays country preference may enter backup. On restore, enabled keyless widgets can refresh without re-entry, while malformed config degrades to disabled/setup instead of issuing a request.

The shared public-data presentation shell owns only state framing, bounded local scroll, Docked detail, retry, and stale copy. Provider facts, source links, and empty copy remain identity-specific.

## 5. On This Day

### 5.1 Request and normalization

- Exact request: `GET https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/{MM}/{DD}`.
- Month and day are the user's local calendar day, each zero-padded to two digits.
- Cache scope includes `on-this-day:v1`, language `en`, month, and day. TTL ends at the next local midnight rather than a rolling 24 hours.
- Normalize selected events first, then events, preserving provider order and deduplicating by year plus text. Retain at most 12 events, 4 births, and 4 deaths.
- Keep only finite integer years, trimmed text, and an optional safe `https://en.wikipedia.org/` article URL derived from the first valid page.
- Any malformed category row is dropped. An invalid top-level response fails the request and never replaces useful retained data.

### 5.2 Presentation

- Compact: one event with year and a two-line maximum headline.
- Standard: three event rows with year, text, and article action where available.
- Full: up to six events plus bounded births and deaths sections. The row region scrolls locally.
- Docked: `YEAR · event headline`; click opens the same bounded detail.
- Empty: `No event returned for today.`
- Attribution is visible in Standard, Full, and Docked detail: `From Wikipedia`.

## 6. Public Holidays

### 6.1 Setup, request, and normalization

- The Settings body fetches `GET https://date.nager.at/api/v3/AvailableCountries` only while its editor is open and displays a searchable native country select.
- Saving one validated country code creates or updates the config and clears only the Public Holidays snapshot.
- Exact data requests: `GET /api/v3/PublicHolidays/{currentYear}/{countryCode}` and the same path for `currentYear + 1`, in parallel.
- Cache scope includes `public-holidays:v1`, country code, and current local year. TTL ends at the next local midnight.
- Normalize only rows with a valid local `YYYY-MM-DD` date, matching country code, `global: true`, and `types` containing `Public`. Deduplicate by date plus English name and sort by date.
- Keep at most 40 national entries across the two years. A malformed response fails rather than presenting a partial calendar as complete.

### 6.2 Presentation

- Compact: next holiday, local date, and days away.
- Standard: next three national holidays with English name, differing local name where supplied, weekday, and date.
- Full: current and next-year national holidays grouped by month, bounded to local scroll.
- Docked: `Next holiday · date`; click opens context and the country setting action.
- Setup: `Choose a country in Settings.` No card reserves unused body space.
- Empty: `No upcoming national holidays returned for <country>.`

## 7. Aurora & Kp

### 7.1 Request and normalization

- Exact request: `GET https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json`.
- Refresh every 15 minutes while mounted, on visible restoration, and on explicit retry.
- Normalize timestamp, finite Kp from 0 through 9, source state `observed | estimated | predicted`, and optional `G1` through `G5` scale.
- Retain the latest observed/estimated interval and predicted intervals through 72 hours, capped at 25 rows.
- Current means the latest observed or estimated row not later than now. Peak means the highest future predicted Kp, with the earliest timestamp breaking ties.
- Activity labels are explicit and conservative: Quiet below 3, Unsettled from 3 to below 5, Storm level at 5 or above. Copy always says that darkness, clear sky, and location still determine visibility.

### 7.2 Presentation

- Compact: current Kp, activity label, and next forecast peak.
- Standard: current Kp, next peak/time, NOAA storm scale when present, and the next four forecast intervals.
- Full: three-day forecast grouped by local day with all bounded intervals and viewing guidance. The interval region scrolls locally.
- Docked: `Kp X · peak Y at TIME`; click opens the same context.
- Empty: `NOAA has no current Kp forecast.`
- Attribution is visible: `NOAA Space Weather Prediction Center`.

## 8. Severe weather inside Weather

### 8.1 Storage and request authority

Add one missing top-level cache key, `weatherAlertCache`, defaulting to `null`. As a cache-only key it is excluded from every backup alongside `connectorSnapshots` and `apodCache`; default merging backfills it without a migration or version stamp write.

The cache identity is `nws-alerts:v1:<normalized point URL>` over Weather's rounded coordinates. The owner is a dedicated `useWeatherAlerts` hook mounted once inside Weather. It refreshes every five minutes while visible, deduplicates same-identity work, aborts on location change/unmount, and revalidates location ownership inside the serialized cache write.

- Exact request: `GET https://api.weather.gov/alerts/active?point={lat},{lon}`.
- Request header: `Accept: application/geo+json`.
- A successful FeatureCollection normalizes at most 12 active alerts.
- Keep event, severity, urgency, headline, area description, effective/onset/expiry, bounded description/instruction, and canonical `https://api.weather.gov/alerts/...` ID.
- Severity order is Extreme, Severe, Moderate, Minor, Unknown. Then sort by earliest expiry.
- HTTP 400/404 outside NWS point coverage becomes `unsupported`, not a Weather error and not `No active alerts`.
- Network/server failure retains a matching last snapshot as stale. It never suppresses Open-Meteo forecast, AQI, UV, or pollen.

### 8.2 Presentation

- Compact Weather: an active Severe or Extreme alert adds a named alert badge without replacing temperature and condition.
- Standard Weather: any active alert adds a named highest-severity line.
- Docked Weather: an active Severe or Extreme alert adds `ALERT · event` to the existing dense line; click behavior stays Weather details.
- Expanded Weather: an Alerts section appears only when supported. No alerts reads `No active NWS alerts`. Active alerts show event, severity, headline, area, expiry, and a disclosure for bounded details/instructions.
- Unsupported locations show no NWS section. Failed alert enrichment shows a small truthful unavailable state only when the user opens Weather details; forecast remains useful.

## 9. Privacy, permissions, and attribution

- No new Chrome API permission or install-time host permission is added.
- On This Day sends month/day to English Wikipedia and receives public historical content.
- Public Holidays sends country/year to Nager.Date and receives public holiday facts.
- Aurora & Kp sends no user data and receives NOAA public forecast facts.
- Weather alerts sends the selected rounded Weather coordinates to NWS and receives public alerts for that point.
- Only Public Holidays country preference may enter backup. The three public-data snapshots and `weatherAlertCache` do not.
- Provider response bodies, user location, article/event text, and alert content never enter logs, reports, screenshots outside inert fixtures, or error messages.
- Each source is visibly attributed in its contextual surface.

## 10. Layout and tier contracts

The three new identities join `BLOCK_IDS`, the widget registry, renderer registry, size contracts, default placements, stack membership, named-layout cleaning, and catalog parity together. They default to Compact in a static At-a-glance column. Enabling one never moves another widget; any crowding created by enabling many widgets remains user-owned under A2-D061 and the accepted F9 ruling.

All three support Docked. Docked remains one dense clickable line with no scrollbar, while its detail panel carries context. Every Full tier must prove useful local overflow at maximum fixture data. No tier stretches a smaller composition into whitespace.

## 11. Error and race handling

- Every provider has an eight-second request timeout and errors that contain neither response bodies nor fetched content.
- Public-data snapshot writes revalidate the current config and runtime scope through the existing connector authority.
- Weather alert writes revalidate the current stored location inside the same queued update.
- Local-day changes invalidate On This Day and Public Holidays scopes immediately.
- A late response after disable, country change, location change, unmount, or restore cannot write.
- Retained matching data remains visible with Saved/Updated context and one bounded retry.

## 12. Delivery shape

The At-a-glance wave is one bounded packet:

1. provider research, exact design, additive identities, privacy, backup, catalog, and shared public-data shell;
2. On This Day service, widget, all tiers, and tests;
3. Public Holidays service, explicit country Settings, widget, all tiers, and tests;
4. Aurora & Kp service, widget, all tiers, and tests;
5. Weather alert cache/service/hook, integrated Weather states, privacy, and tests;
6. guarded rebuilt-extension Chromium evidence, bounded review, one fix/rereview cycle, ledgers, checkpoint, push, and repository proof.

Every production behavior receives a focused observed RED before its change. The packet does not rerun the exhaustive accepted NL-P6 matrix.

## 13. Acceptance criteria

- [ ] Current schema version remains 16. Existing initialization writes no config, cache, migration, or version merely because this wave exists.
- [ ] The three public-data identities have exact registry, renderer, tier, placement, settings-body, privacy, backup, fixture, and catalog parity.
- [ ] On This Day uses the zero-padded per-wiki route and rolls at local midnight.
- [ ] Public Holidays requires an explicit valid country, fetches current and next year, and never presents subdivision-only entries as national.
- [ ] Aurora & Kp distinguishes observed, estimated, and predicted data and never promises local visibility.
- [ ] Severe weather remains inside Weather, uses a separate five-minute NWS cache, and cannot suppress or alter existing forecast/environment usefulness.
- [ ] Compact, Standard, Full, Docked, setup, loading, empty, stale, retained-error, hard-error, unsupported, and maximum-data states are truthful and content-tight where applicable.
- [ ] Full result regions prove local overflow; Docked lines prove bounded height and contextual click parity.
- [ ] Provider data caches stay outside backup; Public Holidays country survives backup; no token or new credential exists.
- [ ] Focused tests, full tests, TypeScript, information-first and expansion contracts, production build, guarded Chromium evidence, diff hygiene, bounded review, one fix cycle, ledgers, push, and active/protected proofs pass from the reviewed commit.
- [ ] No existing provider identity, connector request, permission, credential, layout recovery, dependency, protected checkout, or Chrome Web Store state changes.

## 14. Owner-visible QA

The exact reviewed commit is rebuilt before inspection. Chromium covers all four tiers for all three widgets; local-midnight and year-boundary data; Public Holidays setup/change; maximum-data Full cards; Docked detail; Weather with no alerts, multiple severities, unsupported coverage, alert failure with useful forecast, and Severe/Extreme Compact/Docked emphasis; exact 1408x445 usefulness; request allowlists; expected cache-only writes; and reload continuity. Every original-resolution capture receives an individual usefulness judgment.
