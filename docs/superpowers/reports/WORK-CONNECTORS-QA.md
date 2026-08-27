# Work Connectors QA

**Date:** 2026-08-22  
**Branch:** `feat/aurora-2-observatory`  
**Reviewed implementation range:** `94de6c5c652a500a8be9cd789a40ecf0020674f4..9fc1eec723dc21db5c2d6b5dd49300bbc4c0ff0b`  
**Evidence commit:** `9fc1eec723dc21db5c2d6b5dd49300bbc4c0ff0b`

## Outcome

Ready. Linear, Sentry, and Todoist provide useful Compact, Standard, Full, and Docked presentations plus structured Settings pickers. The direct-provider, account-scope, storage, privacy, and explicit-mutation contracts passed automated and rebuilt-extension QA.

## Verified product contract

- Linear uses its fixed API origin and bearer identity, account-scoped team choices, exact assigned and due-soon filters, and the nearest due issue for Compact context.
- Sentry uses its fixed API origin and token identity, account-scoped organization/project choices, and the top trending issue for Compact context.
- Todoist uses its fixed API origin and token identity, account-scoped project choices, and one explicit named confirmation before task completion.
- Reconnect clears account-bound selections. Picker caches and Settings snapshots are accepted only for the current connector scope.
- Connector ownership is revalidated before request start and again before cache commit. A disconnected or replaced account cannot make one final request or commit a stale result.
- Credentials and capability URLs are not backed up. The legacy `layout` key, permissions, dependencies, connector identities, and unrelated storage remain untouched.

## Automated evidence

- `npm test`: 186 files / 2,968 tests passed.
- `npm run test:expansion-contract`: 35 Node tests plus 5 Vitest files / 103 tests passed.
- `npm run test:information-first-contract`: 8/8 passed.
- `node --test scripts/preview-work-connectors.test.mjs`: 11/11 passed.
- `npx tsc --noEmit`: clean.
- `npm run build`: 237 modules transformed from the exact evidence commit.

## Rebuilt-extension Chromium evidence

Two consecutive clean runs produced 58 captures each:

- `.qa-work-connectors-evidence-final5`: 65 raw requests, zero failures.
- `.qa-work-connectors-evidence-final6`: 64 raw requests, zero failures.

The one-request difference is background refresh timing across isolated cache state, not a user-action contract. Every real user interaction is pinned to exact operations, while every request still must match the provider route, method, authorization header, body, and Linear filter contract. The witness covers 1600x900 and exact 1408x445, all four tiers, loading/ready/empty/error/degraded states, Settings connect/reconnect/disconnect, account-scoped pickers, deep links, and Todoist completion success and failure.

## Visual judgment

All 58 original-resolution captures were inspected through the three connector contact sheets, with affected originals opened separately. Compact states answer the immediate glance question; Standard and Full add useful selected-work detail; short-height Full cards remain bounded with local scrolling; Docked lines remain dense; Settings choices are legible and account-specific; and the Todoist failure confirmation is clear and retryable. No empty decorative card, clipped primary control, or presentation-only whitespace remained in the reviewed states.

## Review disposition

The bounded implementation review and its one rereview identified four Important follow-ups: development/build provenance, account-scoped picker state, correct Compact fact selection, and exact interaction request evidence. Focused failing tests preceded each production correction. The same correction sequence also exposed and closed a stale-owner request-start race. No Critical or Important issue remains open.

## Manual ceilings

Automation does not claim live-provider credential validity, real provider rate-limit or outage behavior, native browser permission UI, real screen-reader speech, or long-session judgment over arbitrary live data. Chrome Web Store upload, editing, submission, publication, distribution, and rollout remain blocked pending a new action-specific W6-P5 approval.
