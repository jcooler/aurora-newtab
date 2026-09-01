# Tab Two Free Baseline QA

**Date:** 2026-09-01
**Status:** Verified

## Scope

This packet removes the obsolete global premium gate from every current feature
that the approved freemium model keeps free. It adds no account, entitlement,
billing, sync, backend, permission, analytics, connector, storage, or network
authority.

## Automated contract

- Five Settings tabs remain reachable: General, Progress, Widgets, Connectors,
  and Data.
- Layout management and connector-widget deep links remain reachable.
- Ctrl+Shift+E and a real 500ms pointer hold enter live editing.
- A cancelled drag writes nothing and restores exact geometry.
- A saved drag survives reload and writes only `layouts`.
- One stack reorder and one dock move persist through the existing layout
  authority.
- The frozen legacy `layout` key, Settings, connector credentials/configuration,
  connector snapshots, refresh preferences, and photo preferences remain exact.
- Desktop 1600x900 and touch-enabled 768x812 installed-extension Chromium record
  screenshots, bounds, overlap, overflow, request, console, page-error, failed-
  request, and storage-write ledgers.
- Every screenshot requires an original-resolution owner-visible judgment. The
  executable gate rejects `_pending_` or missing judgments.

## Verified result

- Stabilized Vitest: 222 files / 3,520 tests passed.
- TypeScript, the 6-test QA contract, and diff hygiene passed; only existing
  line-ending notices and the existing ProgressRail React `act()` warning remain.
- Exact production build: 274 modules transformed.
- All nine interaction contracts passed. The only writes were three explicit
  `layouts` saves; protected authorities remained exact.
- Requests, console errors, page errors, and failed requests: zero.
- Every capture reported zero horizontal overflow, viewport escape, and canvas
  object overlap.

| Capture | Original-resolution judgment |
|---|---|
| `desktop-settings-layout` | PASS: five tabs and Layout controls are legible, contained, and unclipped. |
| `desktop-canvas` | PASS: saved Clock geometry, reordered stack, and moved dock member render cleanly after reload. |
| `touch-settings-tabs` | PASS: supported touch-device Settings tabs and controls are legible and contained. |
| `touch-settings-layout` | PASS: Layout management remains readable, reachable, and free of horizontal overflow. |
| `touch-long-press` | PASS: edit toolbar and Clock inspector are contained; the Layout selector stays closed after release. |

Original-resolution review found and closed one Important issue: Chrome could
activate the Layout selector when a long-press release landed on the toolbar
that appeared beneath the held finger. The toolbar is now inert through that
release task, and both regression coverage and the exact witness prove the
selector remains inactive.

README and PRIVACY were reread and need no content change: this packet changes
no permission, collection, storage authority, external request, analytics, or
backend behavior.

## Evidence location

The exact reviewed commit is recorded by `dist/build-provenance.json` and by the
machine-readable artifact at:

`artifacts/qa-free-baseline/<exact-commit>/evidence.json`

The sibling PNG files and `judgments.json` are intentionally untracked. The
artifact's `result` must be `PASS`; this report does not override failed or
missing machine-readable evidence.

## Manual ceilings

The touch viewport represents a ChromeOS or Windows touch device where Chrome
extensions are supported; it is not mobile Chrome evidence. Headless Chromium
proves installed-extension rendering and touch-event behavior, not a physical
MacBook trackpad, native permission prompt, operating-system display scaling,
sleep/wake behavior, or real assistive technology. Those remain separate manual
checks. No Chrome Web Store action is part of this packet.
