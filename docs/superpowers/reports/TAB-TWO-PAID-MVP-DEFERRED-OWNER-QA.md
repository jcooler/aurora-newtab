# Tab Two Paid MVP Deferred Owner QA

**Updated:** 2026-09-03<br>
**State:** Deferred by owner request until implementation reaches its final manual-QA handoff<br>

This is the one cumulative owner checklist. Automated tests and installed-extension harnesses continue during development; the owner should not execute these items packet by packet.

## PM-P4 encrypted sync

- In normal stable Chrome with the final unpacked production build, confirm the correct signed-in account and device name are shown.
- Confirm local tasks, notes, habits, layouts, and settings remain present.
- If sync is on, turn it off, close every Tab Two page, reopen a new tab, and confirm local content remains unchanged and the final switch state is off.
- Turn sync on once, confirm the action enters a visible in-progress state and settles to the named-device protected state without requiring a refresh button.
- Repeat the off, close, reopen, local-content-retained check after that successful enable.

## PM-P5 Metrics

- With a valid Metrics capability, explicitly enable the Metrics widget and place it in a layout. Confirm it is never added or enabled automatically.
- Complete one new task and one Focus session. Confirm the current local day gains exactly one task completion and one Focus session with the correct minutes, without displaying task text or Focus text.
- Switch among 7, 30, 90, and 365 day ranges and confirm the summary and trend update without a provider request or a page reload.
- Open Metrics history from the widget and from Settings > Progress. Confirm both routes reach the same history controls.
- Export history and open the browser's native downloaded JSON file. Confirm it contains numeric aggregates and metadata only, with no titles, names, descriptions, URLs, tokens, credentials, event text, repository names, or raw provider records.
- Start a scoped delete, cancel it, and confirm the history is unchanged.
- Only when ready to remove real history, confirm one scoped deletion and verify only the named scope disappears. Complete deletion can remain untested if preserving real history is preferred.
- In the final modeled expired-capability build, confirm retained history remains readable while new activity no longer adds a bucket.
- With the network unavailable, confirm the last local history remains readable and no destructive fallback occurs.
- With encrypted sync enabled, confirm a second installation receives the same aggregate bucket without receiving raw source data.

## Final device and accessibility ceilings

- Use stable Chrome rather than automation Chromium for one complete Account & Sync and Metrics pass.
- Confirm the browser-native download affordance is understandable and the saved file opens normally.
- Verify keyboard-only operation, visible focus, and spoken labels with the owner's real assistive-technology setup.
- Smoke test the final unpacked build on the owner's MacBook, including touchpad scrolling, Settings containment, layout editing, Metrics range controls, and downloaded export.
- Check mixed-DPI or external-monitor movement if that is part of the owner's normal setup.

## Safety boundaries

- Do not use owner data for destructive hosted tests.
- Do not inspect encrypted ciphertext during hosted verification.
- Do not delete real synced data merely to satisfy QA.
- Merge, package, release, live Stripe, Supabase Pro, production permission or secret changes, and every Chrome Web Store action remain separate explicit gates.
