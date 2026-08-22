# Aurora Weather Enrichment QA

Date: 2026-08-22

Reviewed product source commit: `32fed81` (`fix(weather): preserve forecast
through optional failures`)

This is focused Weather evidence. It does not replace or rewrite the
owner-accepted NL-P6 evidence. All browser output was written to the ignored
scratch directory `.qa-weather-enrichment-final`.

## Product contract

- The accepted forecast URL and public `open-meteo:v1:` identity are unchanged.
- AQI, UV, and provider-available pollen use a separate
  `open-meteo-air:v1:` request identity and remain optional enrichment.
- Forecast and environment requests start together. A failed or hung optional
  environmental request cannot suppress useful current conditions; successful
  forecast waits at most eight seconds for that optional leg.
- One `weatherCache` object remains the only storage authority. Old caches and
  mismatched environmental legs remain forecast-usable and self-heal under the
  existing request owner.
- Compact and Docked Weather remain concise. Environmental facts appear only
  in the shared expanded details dialog.
- Successful partial data renders only real facts. Pollen absence, complete
  no-readings success, and endpoint failure each use distinct truthful copy.
- Air quality and pollen attribution is the exact safe, keyboard-reachable
  Open-Meteo CAMS link approved in the design.
- No manifest, permission, dependency, connector, migration, legacy `layout`,
  Store, or protected-checkout boundary changed.

## Review and bounded fix cycle

The independent implementation review found three Important issues and no
Critical issue:

1. a never-settling optional environment request could indefinitely block a
   successful forecast;
2. a successful response with no environmental readings rendered the wrong
   pollen-only message;
3. the privacy policy incorrectly described every saved location as having
   two-decimal precision.

Focused failures were observed before production changes. `32fed81` adds the
bounded optional wait, the approved full-width no-readings message, and an
accurate distinction between two-decimal device location and selected-city
coordinates normalized to at most four decimals. The same reviewer rereviewed
only `be06e79..32fed81` and returned Ready with no Critical or Important issue
open. The fix gate passed 7 files and 299 tests, TypeScript, the 3-test browser
harness contract, script syntax, and diff hygiene.

Three harness observations remain Minor and are ledgered rather than opening a
second review cycle:

- the pollen scenario permits more than one application `weatherCache` write;
- expected 503 console classification is tied to scenario state and text, not
  a unique routed-response token;
- one Node contract fixture is token-based and the harness does not
  cryptographically bind `dist` to HEAD.

The final gate mitigates the last point operationally by rebuilding `dist`
from `32fed81` immediately before launching Chromium.

## Stabilized automated gate

- full Vitest: 162 files, 2,737 tests
- TypeScript: clean
- information-first contract: 8 of 8
- scratch-output safety contract: 7 of 7
- Weather harness contract: 3 of 3
- production build: 218 modules
- Weather browser witness: 9 captures, 6 exact provider requests
- browser failures: 0
- unexpected runtime errors: 0
- failed requests: 0
- expected routed environmental 503 console event: 1, recorded separately
- diff hygiene: clean

The browser witness preserved the production manifest permissions, preview
permissions, held origins, connector/photo origin owners, and origin-lifecycle
state. App-originated persistence touched `weatherCache` only. No legacy
`layout` or unrelated key was written.

## Original-resolution visual judgment

Every final capture was inspected individually at original resolution. The
standard is usefulness, truthfulness, containment, and reachable controls.

| Capture | Verdict | Judgment |
| --- | --- | --- |
| `environment-failure-1408x445.png` | useful | The exact short-height window keeps the complete forecast readable, states environmental failure plainly, and exposes Refresh without clipping the sheet or utility controls. |
| `environment-recovered-1408x445.png` | useful | The same open sheet replaces failure with AQI, UV, and pollen facts without hiding forecast rows or escaping the viewport. |
| `available-top-left-1600x900.png` | useful | The panel anchors below and inward from the authored top-left card; every forecast and environmental fact is visible with no blank cells. |
| `available-top-right-1600x900.png` | useful | The panel remains contained at the top-right edge and preserves clear fact grouping and attribution. |
| `available-bottom-left-1600x900.png` | useful | The panel opens above the bottom-left card, stays on-screen, and leaves the invoking card and fixed utilities reachable. |
| `available-bottom-right-1600x900.png` | useful | The panel opens above and inward from the bottom-right card with no clipping or opaque photo-spanning alert treatment. |
| `pollen-unavailable-1600x900.png` | useful | AQI and UV remain useful while pollen is explicitly unavailable; no empty pollen value or false zero is shown. |
| `available-docked-1600x900.png` | useful | Docked Weather remains one concise line, and click parity opens the same complete details surface above it. |
| `available-docked-reload-1600x900.png` | useful | Reload preserves the docked line, open-details usefulness, cache identity, and visual geometry exactly. |

## Manual ceilings

Automation does not claim live Open-Meteo seasonal pollen coverage for every
geography, real network behavior during an eight-second provider stall, real
screen-reader speech, or long-session judgment across every custom photograph
and ink color. Those remain honest environment and judgment ceilings.
