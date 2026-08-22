# At-a-glance Additions QA

**Date:** 2026-08-22  
**Branch:** `feat/aurora-2-observatory`  
**Reviewed implementation range:** `f6ef36dd07190578e586e9bbee8a3a0a24a85f0b..75500790b1f5fca5a3fa7120184d7bb27f8705e7`  
**Evidence commit:** `75500790b1f5fca5a3fa7120184d7bb27f8705e7`

## Outcome

Ready. On This Day, Public Holidays, Aurora & Kp, and official NWS alert context inside Weather are useful, bounded, keyless additions. Cache ownership, restore behavior, Settings writes, request contracts, presentation tiers, and exact-build Chromium evidence passed.

## Verified product contract

- On This Day requests one exact zero-padded English Wikipedia date route, keeps safe text and article links only, and caps normalized events, births, and deaths at 12/4/4.
- Public Holidays uses a native country picker, requests the current and next local year from the exact Nager.Date route, caps 40 normalized public holidays, and rejects a stale editor rather than overwriting newer config or disable state.
- Aurora & Kp reads NOAA SWPC's exact planetary K-index forecast and presents current activity plus the next 72-hour peak without claiming a visibility probability.
- Weather alone owns NWS active alerts. It uses the exact normalized point route, a separate five-minute cache, truthful unsupported/empty/stale/error states, and a visible-only 30-second failure retry.
- Full-store replacement rotates derived-cache ownership before finalization and after a verified rollback. Requests born before restore cannot repopulate an identical-config connector snapshot or identical-location Weather alert cache.
- Schema remains v16. No migration, dependency, credential, broad permission, legacy `layout` write, or Store state changed. Derived alert data is excluded from backup and reset on restore.

## Automated evidence

- `npm test`: 195 files / 3,032 tests passed.
- `npm run test:expansion-contract`: 35 Node tests plus 5 Vitest files / 103 tests passed.
- `npm run test:information-first-contract`: 8/8 passed.
- `node --test scripts/preview-at-a-glance.test.mjs`: 5/5 passed.
- Focused post-review ownership and Weather checks passed.
- `npx tsc --noEmit`: clean.
- `npm run build:preview`: 247 modules transformed from the exact browser-evidence commit.

## Rebuilt-extension Chromium evidence

The exact `7550079` preview build produced 38 captures, 30 audited provider requests, and 38 per-scenario storage records with zero assertion, runtime, failed-request, or storage-boundary failures.

The executable catalog covers all four tiers, 1600x900, exact 1408x445, maximum data, setup, empty, stale retained data, hard error, NWS unsupported coverage, year boundary, Docked details, and local midnight. Provider operations are exact under the shipped React StrictMode behavior: 5 Wikipedia, 1 country catalog, 12 holiday-year, 6 SWPC, and 6 NWS requests.

Every new Full tier proved useful local overflow rather than page overflow:

- On This Day: 672px client / 714px content.
- Public Holidays: 672px client / 1,836px content.
- Aurora & Kp: 672px client / 969px content.

The midnight scenario starts with a valid pre-midnight On This Day snapshot, moves system time across local midnight without firing unrelated timers, dispatches Aurora's real focus-reschedule path, and requires a new `connectorSnapshots` write containing the post-midnight result. Daily photo rotation is disabled only in that isolated fixture so its storage audit remains connector-specific.

## Visual judgment

All four contact sheets and all affected original captures were inspected. Compact cards answer one immediate question; Standard adds readable context; Full uses the available height and scrolls locally; Docked lines remain concise and open bounded detail. Empty, stale, setup, error, and unsupported states remain legible without blank husks. Exact-short cards remain inside the 1408x445 viewport.

## Review disposition

The initial bounded review found five Important issues: stale Public Holidays editor ownership, missing Weather retry, identical-owner restore races in connector and Weather caches, an unclamped Compact history event, and an overstated browser harness. Focused failing tests preceded the corrections.

The one allowed rereview confirmed the editor, restore epoch, and Compact clamp fixes, and retained two findings from the original harness/retry scope. Observed RED tests then closed those final gaps: retry callbacks recheck visibility at firing time; On This Day Full overflow is enforced; Public Holidays gains empty and stale evidence; Aurora & Kp gains stale evidence; and local midnight is a real cross-boundary focus reschedule. No second rereview was run because the packet process permits one fix/rereview cycle. The stabilized automated and exact-build browser gates are the final disposition.

## Manual ceilings

Automation does not claim live-provider availability, provider rate-limit behavior, native screen-reader speech, operating-system timezone changes, genuine sleep/wake, or long-session judgment over arbitrary live data. Chrome Web Store upload, editing, submission, publication, distribution, and rollout remain blocked pending a new action-specific W6-P5 approval.
