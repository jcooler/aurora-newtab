# Aurora Weather Enrichment Design

**Date:** 2026-08-22

**Status:** Owner direction approved through the continuous-delivery roadmap and
the 2026-08-21 Weather review. This document fixes the implementation contract
for Program D before code changes begin.

## 1. Purpose

Weather should use its expanded surface as a compact environmental briefing,
not leave useful space empty and not split closely related facts into separate
widgets. Air quality, UV, and pollen therefore belong to Weather.

This packet preserves the already-approved forecast presentation:

- concise Compact and Docked forms;
- unambiguous rain times;
- a compass-aligned wind arrow with a matching direction label;
- a plain sun for sunrise and a plain moon for sunset;
- unrestricted corner placement and contained expansion.

The packet does not redesign named layouts, docks, or the Weather summary chip.

## 2. Product contract

### 2.1 Expanded Weather hierarchy

Expanded Weather keeps one readable instrument surface with three groups:

1. **Next 12 hours:** the existing six-slot temperature and precipitation grid.
2. **Conditions now:** feels-like, wind, humidity, rain outlook, US AQI, and UV.
3. **Daylight and pollen:** sunrise, sunset, and the dominant current pollen
   reading when the provider supplies pollen for that location and season.

The groups use alignment, dividers, type roles, and restrained tone rather than
nested cards. Every occupied cell contains a value and a useful label. The
expanded panel shrinks when facts are absent; it does not reserve blank slots.

### 2.2 Air quality

Aurora requests Open-Meteo's current `us_aqi` value and labels the scale as
`US AQI`. The displayed value is rounded to a whole number and paired with the
official EPA category:

- 0 through 50: Good
- 51 through 100: Moderate
- 101 through 150: Unhealthy for sensitive groups
- 151 through 200: Unhealthy
- 201 through 300: Very unhealthy
- 301 and above: Hazardous

The number and text carry the meaning. Color may reinforce the category but can
never be the only signal. Aurora does not present the provider forecast as a
local regulatory monitor reading.

Reference: [AirNow AQI basics](https://www.airnow.gov/aqi/aqi-basics/).

### 2.3 UV

Aurora requests the current cloud-adjusted `uv_index`, rounds it to one decimal
when needed, and pairs it with the international exposure category:

- 0 through 2: Low
- 3 through 5: Moderate
- 6 through 7: High
- 8 through 10: Very high
- 11 and above: Extreme

The expanded readout is informational, not individualized medical advice. It
does not estimate burn time.

References: [WHO UV index guidance](https://www.who.int/news-room/questions-and-answers/item/radiation-the-ultraviolet-%28uv%29-index)
and [EPA UV Index scale](https://www.epa.gov/sunsafety/uv-index-scale-0).

### 2.4 Pollen

Aurora requests alder, birch, grass, mugwort, olive, and ragweed pollen. The
provider supplies these values only in Europe during pollen season. Aurora must
not infer coverage from coordinates, season names, or country lists.

- If at least one pollen field is a finite number, pollen is `available`.
  Aurora shows the highest current species and its exact grains per cubic meter
  value. A zero maximum reads `No pollen detected`.
- If every pollen field is null or missing, pollen is `unavailable` and the
  expanded panel says `Pollen unavailable here`.
- Aurora does not invent severity bands because the provider contract does not
  define one shared threshold across species.

Reference: [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api).

## 3. Provider and permission design

### 3.1 Two exact public request contracts

The existing forecast request remains byte-for-byte authoritative:

- `https://api.open-meteo.com/v1/forecast`
- its existing current, hourly, and daily fields
- Celsius, km/h, ISO time, auto timezone, 12 forecast hours, one forecast day
- `open-meteo:v1:` forecast identity

The environmental leg adds one separate immutable contract:

- `https://air-quality-api.open-meteo.com/v1/air-quality`
- current fields `us_aqi`, `uv_index`, `alder_pollen`, `birch_pollen`,
  `grass_pollen`, `mugwort_pollen`, `olive_pollen`, and `ragweed_pollen`
- auto timezone
- the same normalized four-decimal coordinates as the forecast request
- its own versioned `open-meteo-air:v1:` identity

One exported environmental contract constructs both its URL and identity. No
hand-maintained duplicate query string is allowed.

### 3.2 Permission boundary

No manifest permission changes and no `chrome.permissions` request are needed.
Open-Meteo's environmental endpoint permits cross-origin GET requests, matching
the existing provider-direct Weather model. The current optional host
permission registry and all origin ownership transactions remain untouched.

The fixed data-flow inventory gains `weatherEnvironment` with:

- destination `air-quality-api.open-meteo.com`;
- trigger: enabled Weather with a selected location when the environmental
  cache leg is missing, mismatched, or stale;
- sent data: rounded coordinates;
- received data: current US AQI, UV, and provider-available pollen values;
- method GET;
- provider-direct transmission;
- no Aurora backend;
- no separately requested permission;
- storage inside the included `weatherCache` backup value.

### 3.3 Attribution

Expanded Weather includes the quiet visible line `Air quality and pollen: CAMS
via Open-Meteo`. It links only on an explicit click and does not transmit Aurora
state. This satisfies the provider's attribution requirement without adding a
new control to Compact or Docked Weather.

## 4. Storage and recovery

`WeatherSnapshot` gains one optional `environment` object so every pre-packet
cache remains structurally valid:

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

`PollenReading` contains one fixed species identity and a finite non-negative
grains-per-cubic-meter value. Provider mapping stores all finite species values
in fixed identity order; presentation chooses the maximum without mutating the
cache.

No schema-version migration is required because the field is optional and the
top-level storage shape does not change. Backup validation accepts only the
exact nested shape, known species identities, finite non-negative readings, and
nullable finite AQI/UV values. Export and exact restore continue to include the
whole weather cache. No credential, capability URL, or new sensitive field is
introduced.

## 5. Fetch, cache, and failure ownership

One `useWeather` refresh generation owns both provider legs and one
`AbortController` is forwarded to both requests.

1. Forecast and environmental requests start together for the same normalized
   coordinates.
2. Forecast failure retains the existing Weather error behavior and does not
   write a snapshot.
3. Environmental abort is never swallowed.
4. A non-abort environmental failure produces a valid environmental object
   with the exact request identity, current `fetchedAt`, `status: unavailable`,
   null AQI/UV, and unavailable pollen. Forecast still renders and persists.
5. Before any write, the existing mounted, generation, forecast identity, and
   updater-time stored-location checks remain mandatory. The environmental
   identity is checked against the same stored coordinates in that updater.
6. A pre-packet cache or a cache with a missing/mismatched environmental leg is
   usable for forecast display but causes one deduplicated refresh while the
   document is visible.
7. Both legs use the existing 30-minute Weather freshness cadence. A cached
   unavailable result prevents request loops and is retried at the next normal
   refresh boundary or explicit Refresh action.

Location/cache clearing remains one atomic multi-key mutation. The packet does
not add a second storage key or a second React data owner.

## 6. Tier behavior

- **Docked:** unchanged one-line temperature and condition facts; click parity
  still opens the same expanded details.
- **Compact:** unchanged concise chip; no environmental facts are squeezed into
  the summary.
- **Standard:** unchanged summary; expanded details add AQI, UV, and pollen.
- **Full:** unchanged useful hourly summary; expanded details are identical to
  Standard so one Weather identity has one details contract.

Environmental data never changes widget geometry while the details panel is
closed. The expanded panel remains content-tight and viewport-clamped.

## 7. Accessibility and visual behavior

- AQI, UV, and pollen use semantic `dt`/`dd` pairs.
- Category text is visible and included in accessible names.
- Pollen species are full readable words, not unexplained initials.
- Values use tabular numerals where scanning benefits.
- Soft text remains readable over any supported widget color; high-alert tones
  do not paint an opaque background over the user's photo.
- Attribution meets the metadata floor and is keyboard reachable if linked.
- The details dialog preserves Escape close and invoker focus restoration.

## 8. Tests and evidence

Strict TDD covers:

- canonical environmental URL and identity, coordinate normalization, and
  contract drift;
- provider mapping for available, zero, null, malformed, HTTP-error, and abort
  responses;
- AQI and UV category boundaries;
- pollen maximum, zero, fixed ordering, and explicit unavailable behavior;
- backup accept/reject boundaries and exact restore;
- missing/mismatched environmental cache self-heal;
- environmental failure preserving forecast, no request loop, explicit retry,
  location races, late completion, unmount, and exact updater-time ownership;
- expanded UI with all facts, unavailable environmental data, unavailable
  pollen, old-cache compatibility, attribution, and unchanged Compact/Docked
  contracts.

The built-extension Weather witness must cover:

- every free-canvas corner;
- Docked click parity;
- 1408x445 and a normal desktop height;
- successful environmental data;
- pollen unavailable;
- environmental endpoint failure with forecast still useful;
- stale/reload/cache identity behavior;
- zero unexpected requests, runtime errors, failed requests, overflow, or
  selection chrome in normal use.

Live provider availability is supplementary evidence only. Deterministic route
fixtures prove the production request and rendering paths.

## 9. Frozen boundaries

This packet does not change:

- named-layout storage, edit operations, dock placement, or widget stacks;
- the legacy `layout` key or exact V1/V2/V3 recovery;
- connector identities, credentials, requests, snapshots, or settings;
- origin permission lifecycle, manifest permissions, CSP, or dependencies;
- Notes, Calendar/ICS, search, bookmarks, backgrounds, or Store state;
- the protected original checkout.

No Chrome Web Store upload, field edit, save, submission, publication,
distribution, or rollout is authorized.

## 10. Completion definition

Weather enrichment is complete when the two exact provider contracts coexist
without weakening forecast cache ownership; expanded Weather uses its space for
truthful AQI, UV, and pollen information; unavailable and failure states remain
useful; Compact and Docked behavior stay concise; backup/privacy contracts are
updated; focused and stabilized gates pass; the real Chromium witnesses are
inspected; one bounded review/fix cycle closes all Critical and Important
findings; ledgers and README are current; the checkpoint is pushed; and both
active and protected repositories are proven.
