# Aurora 2 Observatory Design Specification

**Status:** Approved for implementation<br>
**Date:** 2026-08-13<br>
**Target:** Aurora 2.0.0 release candidate<br>
**Authority:** The approved Aurora 2.0 product and engineering brief, reconciled with repository evidence at `eb1354b`

## 1. Purpose and release posture

Aurora 2.0 turns the existing Manifest V3 new-tab extension into a production-grade second-monitor dashboard. It is a major product release, not a theme or CSS cleanup.

The release candidate must:

- preserve the approved V1 Chrome Web Store item and local V1 packages while 2.0 is developed;
- fix every accepted P0 and P1 correctness, privacy, permission, accessibility, reflow, and release finding or explicitly disposition it with user approval and evidence;
- replace viewport-percentage freeform placement and height-based hiding with the Adaptive Stage;
- remain composed at laptop, 1080p, 1440p, ultrawide, and 4K sizes;
- keep every enabled connector directly visible or meaningfully represented in the Signal Dock;
- align code behavior, permissions, privacy copy, Data Usage answers, listing copy, screenshots, and release notes;
- produce a minimal reviewed 2.0.0 ZIP with recorded byte size and SHA-256; and
- stop for explicit approval before any Chrome Web Store upload, submission, rollout, listing change, or live-asset replacement.

The live Store version is not inferable from the repository. It remains **user/dashboard verification required** until checked in the Chrome Web Store dashboard.

## 2. Verified starting point

Wave 0 established this baseline in the isolated worktree `D:\DEV\Chrome plugin-aurora-2` on branch `feat/aurora-2-observatory`:

- Base and original `main`: `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Source/package and production manifest version: `1.14.0`.
- Unit/component/integration suite: 96 files, 1,515 tests passing.
- Production build: passing.
- Preview build: passing.
- Package guard: passing; 59 files, 60,400,065 bytes, no source maps, all icons and 46 photo tiers present.
- Browser harness, two identical full runs: 408 PASS, 1 FAIL, 3 SKIP. The repeatable failure is `remove revokes live`; the skips are a real Home Assistant instance picker and the headless-unsettled NASA permission allow/deny paths.
- Production dependency audit: zero advisories.
- Full development audit: one indirect high-severity `nanoid <3.3.18` advisory; no broad upgrade is authorized inside an unrelated packet.
- Preserved original V1 artifact: `D:\DEV\Chrome plugin\release\aurora-1.14.0.zip`, 60,400,065 bytes, SHA-256 `4da05f9763dfddd529695dcc5c41f7e8d73b53090740bb5d330166b1aec2f1fa`.
- The isolated baseline rebuild has the same byte size but a different ZIP hash because it was regenerated. It is baseline evidence, not a replacement release artifact.

Repository evidence also confirms accepted findings remain visible: the manifest description says “No accounts,” connector snapshots are keyed only by connector ID and refreshed only on mount, storage update serialization is context-local, and tracked Store materials retain stale V1-era copy.

## 3. Product north star: Aurora Observatory

Aurora is a quiet work observatory for a second monitor. Within roughly three seconds it should answer:

1. Where am I in the day?
2. What needs attention?
3. What can I act on now?

It is not a collage of small black widgets over wallpaper.

Aurora retains:

- curated high-resolution landscape photography and LQIP loading;
- the calm centered clock and background-first identity;
- Space Grotesk for time, dates, and selected numeric instruments;
- Inter for interface and prose;
- the cyan, white, and near-black palette;
- local-first operation, user-granted connections, keyboard access, visible focus, and reduced-motion support;
- search/command capability, existing integrations, and user configurability.

Aurora introduces one signature element: a deterministic, privacy-preserving **Aurora Briefing** (user-facing alternatives may be tested, but “Briefing” is the implementation name). It combines data Aurora already holds into one terse sentence, for example:

> Design review in 48m · 3 work items need attention · Rain near 7 PM

The Briefing has deterministic priority and truncation rules, never calls an LLM, and never introduces a cloud dependency.

## 4. Information architecture

The full-bleed photograph remains the canvas. The Adaptive Stage composes five semantic regions:

### Day

Weather, calendar, next event, sun/moon, and local-day context. Compact variants answer “what is next”; expanded variants reveal an hourly or agenda-shaped view.

### Now

Clock, greeting, Briefing, search, and focus state. This remains the visual anchor and receives protected space in every profile.

### Work Pulse

GitHub, GitLab, Jira, Vercel, Status, important Home Assistant signals, and other attention-oriented connector information. Healthy states are quiet; failures, stale data, pending work, and actionable attention rise in prominence.

### Signal Dock

A compact, operable representation of every enabled item that cannot receive a full board placement. Dock entries must retain identity, freshness/state, one useful primary value, and an entry path to details or the Utility Tray. The Dock is never a silent overflow bin.

### Utility Tray

Tasks, Notes, Timer, Home Assistant details/actions, refresh, and other working tools. Only one detail tool expands at a time. A running timer remains represented after its detail closes.

## 5. Adaptive Stage

### 5.1 Profiles

Aurora selects a profile from CSS viewport width, height, and aspect ratio. Physical monitor size and viewing distance are never inferred.

- **Compact:** width below 900 CSS px or height below 700 CSS px.
- **Ultrawide:** aspect ratio at least 2.1 and width at least 1,600 CSS px.
- **Display:** width at least 2,200 CSS px and height at least 1,100 CSS px, unless Ultrawide applies.
- **Standard:** every remaining supported desktop canvas.

These initial boundaries are versioned product defaults. A dedicated profile-calibration packet may adjust them only with named viewport evidence; stored user layouts remain profile-keyed so a threshold correction does not destroy customization.

### 5.2 Density and scale

Profile selection and user density are separate concerns:

- **Auto Fit:** Aurora selects a bounded density for the active profile.
- **Compact:** favors more signals and smaller allowed variants.
- **Balanced:** the default manual density.
- **Spacious:** favors larger type, targets, and expanded variants.

Density changes grid tokens, gaps, and eligible variants within defined bounds. It never applies a root transform, browser-like zoom, or bitmap scaling.

### 5.3 Semantic layout model

The implementation must provide at least these concepts:

```ts
type LayoutProfile = 'compact' | 'standard' | 'display' | 'ultrawide'
type WidgetVariant = 'compact' | 'standard' | 'expanded'
type Zone = 'day' | 'now' | 'pulse' | 'dock'
type Priority = 'pinned' | 'automatic' | 'dock'

interface Placement {
  zone: Zone
  order: number
  colSpan: number
  rowSpan: number
  variant: WidgetVariant
  priority: Priority
  locked?: boolean
}

interface LayoutV2 {
  version: 2
  profiles: Partial<
    Record<LayoutProfile, Partial<Record<BlockId, Placement>>>
  >
  legacy?: Layout
}
```

Product defaults are versioned in source. Storage contains user overrides, not a frozen full copy of every default. Later releases may improve untouched defaults without erasing explicit user choices.

### 5.4 Placement and capacity rules

- `pinned` placements remain in their requested zone; invalid spans are clamped and collisions resolve deterministically by zone order, configured order, then stable block ID.
- `automatic` placements use their preferred zone and variant while capacity exists, then reduce variant, then enter the Signal Dock.
- `dock` placements always use the Signal Dock.
- `now` has protected capacity for the clock and cannot be consumed by connector overflow.
- A connector enabled in storage must have exactly one board or Dock representation in the active profile.
- Height changes can change profile, variant, or Dock allocation; they cannot make a configured connector disappear.

### 5.5 Registry and BoardItem

A widget registry becomes the source of truth for block identity, eligible zones, allowed variants, default placements, priority, settings label, and renderer. A grid-aware `BoardItem` (or equivalent) owns common anatomy, container-query boundaries, arrange affordances, freshness/state presentation, and error isolation. `App.tsx` must stop accumulating per-widget construction logic.

Widgets respond to the space they receive through container queries. Large canvases reveal more useful information rather than merely increasing empty separation.

### 5.6 Migration

Migration is non-destructive:

- preserve the complete legacy x/y layout under `legacy`;
- map each legacy block to the nearest semantic zone and stable order;
- resolve collisions deterministically;
- keep `legacy` until the user explicitly saves or resets a V2 profile;
- make backup import/export accept both schemas during the supported migration period;
- provide migration, rollback-safety, collision, old/new backup, and legacy-preservation tests.

No migration may overwrite or delete the old layout merely because Aurora 2 first rendered.

## 6. Widget variants and content hierarchy

Every widget implements only variants that deliver useful content:

- Calendar: next event → today → fuller agenda.
- Weather: current conditions → hourly strip → fuller trend.
- Work connectors: attention count → prioritized rows → useful detail.
- Home Assistant: summary states → compact controls → controls plus detail.
- RSS: a few prioritized headlines → a fuller feed.

Component anatomy is standardized: identity/title, freshness or state, primary value, a limited number of supporting rows, and at most one primary direct action. Ordinary glance text is at least about 14 CSS px; 12 px is reserved for metadata. Routine controls are at least 36 px, with 44 px preferred for important actions.

Daily quote is opt-in. Arbitrary panel-color customization moves to Advanced or is superseded as the headline setting by curated tonal presets.

## 7. Visual direction

The visual language is a quiet premium instrument:

- photography remains visually important;
- localized edge scrims or one shared glance surface per region replace card-per-row glass;
- spacing, alignment, and hairlines separate information within a region;
- opaque near-black surfaces are reserved for dialogs, editors, popovers, and active work trays;
- cyan marks interaction and attention rather than decorating every boundary;
- healthy systems stay quiet, while stale, failed, pending, and actionable states become legible;
- motion is coordinated and restrained, with reduced-motion equivalents.

The approved concept renders were inspected in Wave 0. Their useful cues are the calm centered Now anchor, a coherent Day rail, a shared Work Pulse surface, a consolidated launcher shelf, and direct arrange preview/reset controls. Their freeform geometry and repeated independent glass cards are reference imagery only and are not the implementation architecture.

## 8. Arrange and profile editing

Users can:

- reorder widgets within a zone;
- move eligible widgets between zones;
- choose Compact, Standard, or Expanded presentation;
- choose Pinned, Automatic, or Dock priority;
- preview an edited profile without committing it;
- undo the latest edit, cancel the session, reset one profile, and copy another profile as a starting point.

Arrange mode works on semantic grid placements, not viewport percentages. It must preserve keyboard operation, clear focus, visible drop/resize targets, reduced-motion behavior, and deterministic results. Save is the only action that commits the draft; Cancel restores the exact pre-session layout.

## 9. Utility Tray and Settings

On desktop, the Utility Tray is modeless and anchored. It does not trap focus. Escape or outside click closes it and restores focus to the invoking control.

At narrow sizes, the Tray may become a true modal bottom sheet with backdrop, inert background, focus trap, Escape behavior, and focus restoration. The modal/modeless mode is derived from layout, not user-agent sniffing.

Settings becomes a wider responsive workspace with vertical navigation on roomy screens and full-screen/reflowed behavior on narrow screens. Connector cards show connection and health state first and reveal credentials only while editing or reconnecting.

## 10. Trust and correctness foundation

### 10.1 Connector snapshots

- Snapshot identity is connector ID plus a fixed-length, non-logged fingerprint of the complete fetch-relevant configuration/account state.
- A successful token connection stamps a new non-secret lifecycle epoch, so disconnecting and reconnecting identical credentials cannot revive the pre-disconnect cache.
- Raw bearer tokens and capability URLs never appear in snapshot keys, logs, exports, or UI.
- A config/account change makes an old snapshot unusable immediately, even if the widget mount is preserved.
- In-flight work is scoped and generation-safe; stale completions cannot replace the current scope.
- TTL is re-evaluated by expiry timer and on visibility/focus restoration without overlapping polls.
- A rejected hook refresh may retain only the matching stale snapshot, exposes a recoverable state, and does not carry data across scope changes. Connector-specific anti-staleness sentinels such as Status `unknown` and Home Assistant `entities: null` remain authoritative successful results and are not replaced by prior data.

### 10.2 Optional permissions

- Validation, persistence, and permission acquisition form one recoverable transaction.
- The transaction records whether each permission pre-existed and rolls back only grants it acquired.
- Releasable origins are computed across every configured feature, including connectors, RSS, Home Assistant, Status, calendar, APOD, and future registered owners.
- Revoke failure is explicit and retryable.
- No permission request is moved behind an earlier await that breaks Chrome's user-gesture chain.

### 10.3 Cross-context storage

All read/modify/write operations use one cross-context authority. The preferred design is a global Web Lock around storage mutations and multi-key restore operations, with the existing in-context promise chain retained only as an optimization. The storage packet must verify Web Locks in an MV3 extension page; if that platform check fails, the packet must checkpoint and replace the authority with a background service-worker message path rather than shipping an unproven fallback.

Schema validation, storage-change propagation, rejection behavior, and exact no-lost-update tests remain mandatory.

### 10.4 Home Assistant

- Connection health uses a narrow real network check; action-only configurations cannot report health without one.
- Regular polling requests only selected entities individually. The bulk `/api/states` endpoint is limited to the explicit picker flow and is disclosed accurately.
- Actions have per-action pending guards and generation checks.
- Pending, success, and error feedback is persistent enough to understand, programmatically announced, and not color-only.

### 10.5 Backup and restore

- Validate the complete backup before any live write.
- Apply under the storage authority and restore the exact pre-import snapshot after any injected failure.
- Never export recognized bearer tokens or connector snapshot caches.
- Treat ICS/RSS capability URLs as secrets in export, logs, and display. A redacted backup must clearly say re-entry is required.
- Reconcile required optional origins after restore without claiming permissions came from the file.

### 10.6 Weather, local day, and notes

- Weather identity uses normalized coordinates plus relevant units/provider inputs; late requests cannot overwrite a newer location.
- Next local midnight is constructed as the next calendar date, not `+24h`.
- All-day semantics remain explicit.
- Date-driven state reschedules after midnight, visibility/sleep recovery, and timezone change.
- Notes awaits persistence and exposes Saving, Saved, and recoverable Error states without discarding unsaved text.

## 11. Privacy and secret posture

Aurora 2 retains connector credentials in `chrome.storage.local` for convenience. This is local plaintext storage protected by the user's Chrome/OS profile, not encryption and not a secure vault. The product must disclose device-profile risk and advise disconnecting or clearing extension data on shared/untrusted profiles.

Aurora does not ship an embedded encryption key or claim that obfuscation is encryption. Session-only or passphrase modes are not part of the 2.0 release unless a later approved packet supplies a usable threat model, migration, and recovery design.

Privacy and listing copy must distinguish “no Aurora account” from third-party accounts. It must say that credentials and requested data are stored locally where true and transmitted directly to user-selected cloud or self-hosted services to provide requested features. Data categories, host permissions, backup behavior, and current Limited Use language must match current official Chrome/Google policy when Wave 6 is executed.

Quick links reject unsafe URL schemes. Capability-bearing URLs receive secret handling. Tokens, full external payloads, credential URLs, and backup secrets are never logged.

## 12. Accessibility and reflow

Required behavior includes:

- keyboard-only operation and logical focus order;
- visible focus and correct restoration after dialogs, trays, and arrange mode;
- Escape behavior through the established dialog stack;
- programmatic names that include ambiguous calendar sources;
- headings/relationships in the Home Assistant picker;
- live announcements for pending, success, invalid quick-link, and error states;
- status meaning that never relies on color or `title` alone;
- DrawerBoundary recovery after close/reopen;
- reduced-motion equivalents;
- no horizontal clipping at 320 CSS px or relevant 400% zoom;
- reachable labels, controls, and content at narrow sizes.

Automated accessibility checks are a floor. Keyboard and screen-reader-oriented inspection is required before verification.

## 13. Verification matrix

Every packet runs targeted tests, the appropriate wider regression, and a production build. Harness-touching packets also build preview first and run the full foreground browser harness.

Visible packets inspect at least one compact, one standard, and one large/ultrawide viewport. Dedicated milestone and Wave 6 QA covers:

- 1024×600, 1280×720, 1366×768, 1600×900, 1920×1080;
- 2560×1440, 3440×1440, 3840×2160;
- 375×812 and 320 CSS px reflow;
- sparse, typical, dense, loading, stale, offline, error, open-tray, dialog, and arrange states;
- Windows scaling at 100%, 125%, 150%, and 200% where the environment permits;
- Chrome zoom through 200%, plus relevant 400% reflow;
- mixed-DPI window moves and profile transitions;
- keyboard, focus, Escape, names/states, announcements, reduced motion, and target sizes.

At 2560/4K, Aurora must gain legibility, hierarchy, or detail. At constrained sizes, no enabled connector may vanish without a Signal Dock representation.

## 14. Release closeout

Wave 6 prepares Aurora 2.0.0 as an update to the existing Store item. It verifies current official policies and dashboard answers, audits the ZIP, inspects current screenshots, and records version, filename, bytes, SHA-256, commit, tests, harness results, disclosure revisions, and manual dashboard fields.

The approved V1 listing remains live while 2.0 is reviewed. No external Store mutation occurs without explicit approval at that moment.

## 15. Explicit non-goals

- No LLM or new cloud service for the Briefing.
- No root transform, canonical bitmap canvas, or global zoom system.
- No new pile of height breakpoints or whole-widget hide rules.
- No per-monitor freeform percentages as the primary layout model.
- No remote executable code or weakened extension CSP.
- No broad dependency upgrade inside an unrelated correctness packet.
- No fake encryption claim.
- No second Store listing or item-identity change without explicit user choice.
- No Chrome Web Store upload, submission, rollout, or live listing edit during implementation packets.

## 16. Delivery discipline

The roadmap in `docs/superpowers/aurora-2/ROADMAP.md` is authoritative for packet state. Each packet freezes an envelope, follows TDD, runs a bounded independent review and fix round, commits verified implementation, updates the durable ledgers in a dedicated checkpoint commit, pushes, and verifies local/upstream equality plus clean target and protected-original worktrees.

Packet boundaries are internal safety checkpoints, not mandatory session stops. After a packet is Verified, the same continuous run re-reads the current specification and ledgers, revalidates repository state, creates and independently reviews the next just-in-time plan, and proceeds automatically to the next Not started roadmap packet. Do not generate a continuation prompt per packet. Historical packet plans remain evidence; their handoff wording does not override this program-level protocol for future work.

Pause only when explicit user approval or manual evidence is required for acceptance, a material architecture decision needs new authority, repository provenance or cleanliness fails, a genuine blocker prevents safe progress, the user requests a handoff, or the remaining program is complete. Wave 6 dashboard verification may require user input, and W6-P5 remains an explicit hard stop before any upload, submission, rollout, publication, or live Chrome Web Store listing change. Context compaction is not a stop condition: resume from durable repository state. When a new-session handoff is requested, generate one continuation prompt covering the whole remaining roadmap rather than a single packet.

The repository—not chat history—is the program memory.
