# Tab Two Paid MVP Deferred Owner QA

**Updated:** 2026-09-03<br>
**State:** Deferred by owner request until implementation reaches its final manual-QA handoff<br>

This is the one cumulative owner checklist. Automated tests and installed-extension harnesses continue during development; the owner should not execute these items packet by packet.

## PM-P2 account and PM-P3 billing

- In normal stable Chrome with the final unpacked production build, sign out and complete one Google sign-in. Confirm the native account flow returns to Tab Two, the correct identity appears, and no sync or upload begins merely because you signed in.
- Close and reopen Settings, then confirm the signed-in account and complimentary or sandbox subscription state return without another login.
- In Stripe test mode, start one monthly Checkout and one introductory annual Checkout without completing both purchases. Confirm the hosted pages show the server-selected price and that the annual offer says it renews at $19.99 per year.
- Complete only the intended Stripe test purchase. Confirm subscription status converges automatically after returning to Tab Two, without a Refresh billing button or a page reload.
- Open Manage billing, cancel the sandbox subscription, and confirm the cancelling state and access-through date converge automatically. Do not activate live mode or use a real payment method.
- Close a Checkout tab before completion, then start the same plan again. Confirm Tab Two safely resumes or creates the allowed sandbox Checkout instead of leaving billing unavailable.

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

## PM-P6 Google Calendar

- In normal stable Chrome, start the Google Calendar connection from its explicit premium connector action. Confirm Chrome's native optional-host prompt is understandable and appears before Google's account flow.
- In Google's real consent flow, confirm the intended test account is clearly selected and the requested access is limited to identity plus read-only Calendar discovery and events.
- Confirm the calendar picker shows the real calendar names and colors for that account, defaults the primary calendar, and displays only the calendars explicitly selected.
- Add a second approved Google test account. Confirm both identities stay distinct, selected events keep their source colors, and existing free ICS events remain present in the same Calendar.
- Close and reopen Tab Two, then confirm the selected calendars persist locally without another consent flow and without exposing a provider token.
- Reconnect one approved test account and confirm its saved row is replaced rather than duplicated. Remove one account and confirm the other Google account and every ICS calendar remain unchanged.
- From a second signed-in Tab Two installation, confirm the server-held Google connection can be reused only by the same Tab Two account while each installation keeps its own displayed-calendar selections.
- Revoke the approved test grant from Google's account controls. Confirm Tab Two moves only that account to a clear reconnect state, retains its last local events, and recovers after explicit reconnection.
- After a normal token lifetime or explicit reconnect, confirm the same account resumes without duplicating its connection row; this is the real-Google complement to the automated hosted rotation-metadata test.
- If a real Google incremental cursor expires during the final test window, confirm Tab Two performs one bounded full refresh for only that calendar and leaves the other connected calendars intact. Do not force or corrupt owner Calendar data merely to produce a 410 response.
- Repeat the connect, account-add, reconnect, and remove paths in stable Chrome to confirm the native Google popup opens, closes, and restores focus reliably.
- Verify keyboard-only operation, visible focus, and spoken labels for consent, picker, account rows, reconnect, and disconnect with the owner's real assistive-technology setup.
- Smoke test the final unpacked build on the owner's MacBook, including Google popup behavior, picker scrolling, source colors, and Calendar full, docked, and stacked presentations.

## PM-P7 Microsoft Calendar

- Use the current personal Microsoft account for the first real-flow witness. Treat a Microsoft 365 work or school account as a later coverage case, not a prerequisite for the personal-account check. The sandbox publisher remains unverified, so an organization's policy may still require administrator approval.
- In normal stable Chrome, start Microsoft Calendar from its explicit premium connector action. Confirm Chrome's native optional Graph-origin prompt is understandable and appears before Microsoft's account flow.
- In Microsoft's real consent flow, confirm the intended personal or work account is clearly selected and the requested delegated access is exactly identity, offline access, basic profile, and read-only basic Calendar access.
- Confirm the calendar picker shows real names and colors, defaults the account's default calendar, and displays only calendars explicitly selected.
- Add one personal Microsoft account and one Microsoft 365 work or school account. Confirm the identities remain distinct, source colors remain visible, and existing Google and free ICS events remain composed in the same Calendar.
- If organization policy blocks consent or requires an administrator, confirm Tab Two presents a truthful organization-approval state. Do not grant unnecessary tenant-wide consent merely to satisfy QA.
- Close and reopen Tab Two, then confirm selected calendars persist locally without another consent flow and without exposing a provider token.
- Reconnect one Microsoft account and confirm its saved row is replaced rather than duplicated. Remove one account and confirm the other Microsoft account, Google accounts, and ICS calendars remain unchanged. If offered, verify that deleting only the removed account's aggregate history does not affect other accounts.
- From a second signed-in Tab Two installation, confirm a server-held Microsoft connection can be reused only by the same Tab Two account while each installation keeps its own displayed-calendar selections.
- Revoke the test grant from Microsoft's account controls. Confirm only that account moves to Reconnect, its last complete local schedule remains available, and recovery begins only after explicit reconnection.
- After a normal token lifetime or explicit reconnect, confirm the same account resumes without duplicating its connection row.
- Repeat connect, account-add, reconnect, and remove paths in stable Chrome to confirm the native Microsoft popup opens, closes, and restores focus reliably.
- Verify keyboard-only operation, visible focus, and spoken labels for consent, picker, account rows, reconnect, and disconnect with the owner's real assistive-technology setup.
- Smoke test the final unpacked build on the owner's MacBook, including popup behavior, picker scrolling, source colors, and Calendar full, docked, and stacked presentations.

## Final device and accessibility ceilings

- Use stable Chrome rather than automation Chromium for one complete Account & Sync and Metrics pass.
- Confirm the browser-native download affordance is understandable and the saved file opens normally.
- Verify keyboard-only operation, visible focus, and spoken labels with the owner's real assistive-technology setup.
- Smoke test the final unpacked build on the owner's MacBook, including touchpad scrolling, Settings containment, layout editing, Metrics range controls, and downloaded export.
- Check mixed-DPI or external-monitor movement if that is part of the owner's normal setup.

## Help and diagnostics

- Open Settings > Help and confirm Account, Billing, and Encrypted sync match the corresponding product surfaces without a manual refresh control.
- Expand every recovery topic by keyboard and pointer, confirm the copy matches the state it describes, and verify focus remains visible.
- Create a diagnostic report and review every field before download. Confirm it contains only product/version and aggregate account, billing, and sync-health states, with no names, email addresses, identifiers, tokens, URLs, content, provider payloads, storage values, requests, or logs.
- Cancel once and confirm focus returns to Create diagnostic report. Then download once and confirm Tab Two never sends the report automatically.
- Confirm the prelaunch support notice has no dead or public submission action. After a monitored private support channel is approved and configured, confirm its final customer route separately. Never post a diagnostic report or personal information publicly.

## Data portability

- In the final production build after separately approved hosted activation, open Settings > Account & Sync and choose Download account data. Confirm fresh Google verification is required before the server-held snapshot is requested.
- Cancel the verification flow once and confirm focus returns to Download account data with no request or file. Then complete verification and confirm exactly one readable JSON file downloads.
- Confirm the account-data file contains the expected account, connected-account, subscription, entitlement, device, and decrypted synced-record fields. Confirm it contains no passwords, sign-in sessions, payment identifiers, provider tokens, encryption keys, raw provider caches, uploaded images, logs, or audit records, and that there is no server plaintext version of encrypted sync records.
- With a conflict recovery copy present, download it before restore or discard. Confirm the local JSON contains only that account-bound recovery copy, makes no server request, and does not restore, discard, or otherwise change the copy.
- Confirm Settings > Data remains the only installation backup that Tab Two can import. Account-data and recovery-copy version 1 files must be rejected rather than presented as restorable backups.

## Safety boundaries

- Do not use owner data for destructive hosted tests.
- Do not inspect encrypted ciphertext during hosted verification.
- Do not delete real synced data merely to satisfy QA.
- Merge, package, release, live Stripe, Supabase Pro, production permission or secret changes, and every Chrome Web Store action remain separate explicit gates.
