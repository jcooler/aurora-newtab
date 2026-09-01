# Fresh-session prompt: Tab Two paid MVP implementation

```text
Continue Tab Two paid MVP development from the existing workspace. Do not restart, recreate, discard, overwrite, or silently migrate current work.

Repository:
- Worktree: D:\DEV\Chrome plugin-aurora-2
- Branch: feat/aurora-2-observatory
- Verified runtime source checkpoint: e9d135a0adc2dff39005426ff21ed342a2f78651
- Protected original: D:\DEV\Chrome plugin
- Preserve untracked artifacts/ and docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md exactly.
- Resolve the current documentation HEAD dynamically and prove local HEAD equals upstream and remote before implementation. Do not assume the runtime checkpoint is the current documentation HEAD.

Before acting:
1. Verify branch, HEAD, upstream, remote, active worktree status, and protected-original cleanliness.
2. Read completely:
   - docs/superpowers/specs/2026-08-31-tab-two-freemium-product-architecture-design.md
   - docs/superpowers/specs/2026-08-31-tab-two-paid-mvp-threat-model.md
   - docs/superpowers/plans/2026-09-01-tab-two-paid-mvp-program.md
   - docs/superpowers/plans/2026-09-01-tab-two-account-sync-client.md
   - docs/superpowers/aurora-2/STATUS.md
   - docs/superpowers/aurora-2/ROADMAP.md
   - docs/superpowers/aurora-2/DECISIONS.md
3. Inspect the current source and complete diff. Treat ledgers as guidance, not proof.
4. Use superpowers:executing-plans and superpowers:test-driven-development. Do not use subagents unless I explicitly request them.

Objective:
Implement the approved paid MVP as bounded packets PM-P1 through PM-P9. Execute only one packet at a time, review and push it, then create the next just-in-time executable plan from the approved program. Do not combine packets. Preserve the complete local-first free product throughout.

Start with PM-P1 only:
- Follow docs/superpowers/plans/2026-09-01-tab-two-account-sync-client.md exactly.
- First create the five Account & Sync visual states as original-resolution PNG files.
- Attach the PNGs directly in the Codex response using absolute file paths. Do not use or link me to a temporary preview website.
- Stop for my explicit visual approval before editing production React or CSS.
- After approval, implement the pure account/capability contracts, production Local-mode client, preview-only fixtures, React provider, permanent sixth Account & Sync tab, inline premium prompt primitive, tests, and exact installed-extension Chromium proof.
- Production must make zero Tab Two backend requests and add no storage schema key, migration, dependency, permission, OAuth registration, billing, sync, Metrics, provider, analytics, deployment, release, merge, or Store behavior in PM-P1.
- No current connector, widget, layout, stack, dock, edit path, drag-and-drop path, or backup path may consult capability state.

Program boundaries:
- All current local capabilities and all 15 current connectors remain free.
- Free local use creates no account or Tab Two backend traffic.
- Google-only sign-in is explicit; sign-in alone never enables sync or uploads local product data.
- Sync excludes credentials, tokens, sessions, signed leases, capability URLs, provider caches/raw responses, custom images, device-local image references, and browser-local operational state.
- Owner production premium comes only from a privileged server-issued signed complimentary_owner grant bound to the internal account UUID. Never add an email check, local override, production build flag, or Stripe dependency for owner access.
- Preview/test premium must be deterministic and proven absent from production artifacts.
- Supabase is the approved initial backend and Stripe Managed Payments is preferred, but do not provision paid services, create production secrets, register production OAuth apps, add Chrome identity permission, or enable live prices without explicit approval at the named packet gate.
- Google Calendar, Microsoft Calendar, and Strava each retain provider/scope/privacy/visual approval gates. Strava is approval-contingent. Spotify is not a launch dependency.
- Onboarding remains deferred.
- Google Chrome on mobile is not a supported extension target. Touch evidence represents supported ChromeOS or Windows extension environments.

Delivery protocol for every packet:
1. Freeze the packet files, interfaces, test scope, visual scope, rollback, and external gates.
2. Use observed RED, minimal GREEN, and focused tests.
3. Perform one bounded review of the complete packet. Only Critical or Important findings block. Apply at most one focused fix and rereview cycle.
4. Run focused affected tests, one stabilized full gate, TypeScript, diff hygiene, exact production/preview builds where applicable, production fixture/secret scans, and targeted real-extension Chromium.
5. Inspect every final screenshot at original resolution. Aggregate tests are not visual acceptance.
6. Audit storage writes, requests, console errors, page errors, failed requests, clipping, overflow, focus, keyboard, and supported touch behavior.
7. Reconcile STATUS.md, ROADMAP.md, DECISIONS.md, PRIVACY.md, README.md, and the packet QA report with verified behavior.
8. Stage only intended files, commit, push, prove local HEAD equals upstream and remote, and confirm the protected original remains clean.
9. Continue to the next program packet only after the current packet is verified and its external approval gates are satisfied.

Hard stops:
- Never upload, edit, save, submit, publish, distribute, or roll out anything in the Chrome Web Store without new explicit approval.
- Never mutate the live Store listing.
- Never merge unless explicitly authorized.
- Never invent, expose, log, commit, or place secrets in client code, fixtures, screenshots, diagnostics, backups, or prompts.
- Never claim native permission prompts, provider production approval, real assistive technology, physical MacBook behavior, billing compliance, or production deployment from automated tests.
- When owner action is required for Supabase, Stripe, Google, Microsoft, or Strava, provide a concise exact checklist and stop before creating cost or production authority.

Keep updates concise and evidence-based. Do not repeat already-approved product questions. Ask only when a genuinely new material decision or explicit authority is required.
```
