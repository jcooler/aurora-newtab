# Tab Two Widget Overhaul V2 QA

**Updated:** 2026-09-07<br>
**State:** Historical automated evidence; visual assessment superseded by owner-reported production defects<br>
**Runtime source:** 796a306883443563943b17bd34c62b2cc44bbdad<br>
**Catalog source:** 236db8223b6e7e61e0723a85ea33f2d273c00879; corrected Clock captures at the runtime source above<br>
**Before source:** 6d66a4c480f3a6651c3559c97f8c1c24ac32fbdd

The owner subsequently reported real production differences that these fixtures did not expose. The repaired current candidate and complete new review are documented in [Widget Production Parity QA](TAB-TWO-WIDGET-PRODUCTION-PARITY-QA.md). This report and its evidence are retained as history, not current owner visual acceptance.

## Approved scope and preservation

The owner approved the complete 38-widget v2 review on September 7, conditional on preserving widget color customization and avoiding regressions. Work continued in the existing feat/aurora-2-observatory worktree. No subagent, new worktree, hosted mutation, provider permission, dependency, merge, package, release or Store operation was used.

The 38 widget identities and all 17 connector settings remain. Existing panel color, widget text, photo text and per-element Clock/Greeting/Quote overrides persist. GitHub adds independent Blue/Green/Purple/Amber contribution colors; GitLab adds Orange/Blue/Green activity colors. Local schema v24→v25 adds only the appearance defaults while retaining settings, placements, connector configuration and snapshots. Backup and sync boundaries validate the new preferences.

Calendar, standalone Month, Public Holidays, Google and Microsoft retain separate authorities. Named layouts and placements remain explicit. Notes contents stay private until opened. Metrics retains the real active-day chart and all 7/30/90/365-day ranges. Recently Closed continues to expose only metadata available under the existing sessions permission. Home Assistant and browser-native action handlers remain active. Simplified concept examples did not replace real source-owned functionality.

## Evidence

- Full unit suite: **284 files, 4,461 tests passed**. TypeScript passed. New graph color/storage/backup/theme tests and retained connector/action tests passed. After the final two-selector Clock correction, all **18 Clock tests passed**; its focused RED/GREEN log is retained. The final CSS-only correction did not warrant repeating unrelated unit suites.
- Exact production and preview builds at 796a306883443563943b17bd34c62b2cc44bbdad; composed stabilization contains **12 PASS specialists and one DEFERRED_OWNER_QA authentication witness**. All entries are bound to the same source. Build warnings are the existing bundle-size advisory.
- **548 actual widget captures:** 215 desktop views (213 supported placements plus two Calendar Month views), 218 existing-setting/palette variants, and 115 narrow-window views. The latter include 18 keyboard-scrolled endpoints and six narrow stacked Clock format cases. All 38 identities and 17 actual connector dialogs are represented; none are missing. The original 384 before images remain unchanged.
- **72 graph captures** have square measured cells. Four-, five- and six-week Calendar months have equal circular date badges with Sunday and Monday starts. Actual Calendar view keyboard navigation, saved view after reload, previous/next month and date-context Escape/outside dismissal passed.
- Actual color controls, persistence/reload, independent GitHub/GitLab palettes, custom ink, and three selected panel colors passed. Palette changes made **zero provider requests** and preserved connector configuration and snapshots. All three per-element photo overrides were verified against computed styles.
- Reading List portal focus/return, mark action and two-step removal passed against the native API harness. Existing specialist gates additionally cover stack/canvas controls, connector flows, progress, billing source contracts, Account & Sync, data portability, Metrics, Google/Microsoft Calendar and Help.
- Full Calendar, GitHub, Weather, Reading List, Downloads and Metrics stayed within a **1408×445** viewport. At **375×820**, all 18 overflowing Full cards offered focusable keyboard scrolling and reached the final content; the hint disappeared after scrolling. No saved layout or tier changed. Corrected stacked Clock faces fit both formats at wide and narrow widths.
- Final gallery traversal checked all 38 widgets, every placement/variant panel, 17 dialogs and all linked images; no browser error or missing image. Current desktop frame measurements show no horizontal overflow. Headless Chromium fixtures isolate provider traffic; physical touch, native stable Chrome/provider popups and assistive technology remain owner witnesses.

The composed command stops when a specialist's required visual judgments are absent. Original-resolution captures were personally reviewed, judgments were recorded, and each specialist's evidence contract was validated against the completed evidence. A local copy of the existing runner resumed only the remaining specialists, preserving same-SHA PASS entries and the original final assertPaidMvpEvidenceIndex contract. This avoids recapturing or repeating already-green checks solely to load judgments. No evidence from an earlier runtime was substituted into the final composed index.

## Bounded review findings closed

The implementation review corrected narrow Full content clipping, browser list spacing, Calendar marker/date geometry, and a stacked Clock font cascade. The Clock defect was visible in Compact and Full: free-clock sizing also matched stack time elements. Scoping the rules to .clock-face restores the authored stack sizes; new actual captures replace affected gallery entries. Original failed captures remain retained in their source evidence directory.

Presentation assertions that pinned obsolete layouts or glyphs were updated to the approved behavior while retaining actual action, permission, storage and recovery assertions. The historical SF-P2 planner's **12 preexisting script-test failures** from the earlier packet remain recorded; that unrelated planner was not rerun or repaired. Current exact widget and Metrics specialists pass. Automated proof does not claim owner visual acceptance or universal freedom from defects.

## Widget disposition

| Widget | Implemented / preserved behavior |
|---|---|
| Weather | Warm condition color, clearer temperature and full forecast hierarchy. Environmental details and the existing detail surface remain available. |
| Calendar | Uniform day geometry with circular date badges and a separate marker lane. Agenda / Month, source colors, holiday context and all calendar authorities remain independent. |
| Month | Filled circular today marker and aligned date table. The standalone calendar and countdown authority remain separate from connected Calendar. |
| Sun times | A daylight arc anchors sunrise and sunset. Both supported sizes retain daylight and golden-hour values; the arc is illustrative, not a live position claim. |
| Moon phase | A phase-aware moon illustration uses the existing phase, illumination and hemisphere calculation. |
| Quote | Open wallpaper typography and attribution. Existing private photo-text overrides remain available; no card in free mode. |
| Clock | Refined numeral weight and spacing. Free-clock sizing is now scoped outside stacked faces so Compact and Full times fit. Existing time format, date, seconds and per-element photo color remain. |
| Greeting | Open greeting presentation, preserving optional daily context and per-element photo color. |
| World clocks | Aligned city, local time and day offset. Compact shows two cities; Standard three; Full five. Free presentation stays transparent. |
| Countdown | Days remaining leads the typography, followed by event and exact date. Existing countdown data and controls remain. |
| Search | Preserved open search field and stacked composition; existing search behavior and permissions remain. |
| Focus | Visible edit affordance for the daily intention. Completion and the separate Timer remain independent. |
| Links | Preserved recognizable shortcut rail and add/edit controls, with shared spacing and stack surfaces. |
| Habits | Green completion ring, legible named habits and square checks. Four visible habits use a two-column arrangement. |
| Bookmarks | Preserved browser bookmark rail, folder behavior and native links with consistent surface treatment. |
| Service status | Retained operational/degraded source colors and service-specific messages. No color-only status encoding. |
| GitHub | Blue by default, with square contribution cells and 84 / 182 / 365-day ranges. New per-widget Blue, Green, Purple and Amber selector preserves all work views. |
| GitLab | Warm activity graph with square cells and independent Orange, Blue or Green color. Full totals now reflect the displayed date range; work views remain. |
| Jira | Blue identity and clearer issue hierarchy, preserving status chips, assigned work, due context and view toggles. |
| Deploys | Semantic deployment colors and clearer project / state hierarchy, preserving both content views and actual deployment facts. |
| Home Assistant | Larger state values with names and units; horizontal action controls in Full. Existing service actions and permission boundaries remain. |
| Headlines | Full-width editorial rows with source attribution. The selected story count remains reachable through internal scrolling. |
| Crypto | Stronger price hierarchy, aligned symbols and readable gain/loss colors. Only the existing source data is displayed. |
| Reading List | Full-width unread/read sections. A visible action button opens the existing open, mark and confirmed-remove operations outside the card clipping boundary. |
| Recently Closed | Three Standard rows and full-width groups in Full. Restore actions remain; sessions-only permissions still limit available title metadata. |
| Downloads | Tighter Full row spacing keeps all five existing rows reachable, with native pause/resume/cancel/show operations preserved. |
| Tab Groups | Three Standard groups and full-width Full sections. Actual group colors and focus/expand/collapse actions remain. |
| Timer | Colored remaining time and existing session controls. Its supported Compact canvas and larger timer surface are preserved. |
| Tasks | Clearer task rows and check affordances. Existing editing and completed/empty states remain. |
| Notes | Warm header and edge treatment. The existing privacy boundary is preserved: note contents appear only after opening the editor. |
| Linear | One actionable Compact issue and three Standard issues, with real team, state and priority metadata. |
| Sentry | Warm error identity and readable message/project/count hierarchy. Existing filters, recovery and detail controls remain. |
| Todoist | Three Full tasks with separate title and metadata lines. Due-state labels and existing completion confirmation remain. |
| On This Day | Warm year and historical text hierarchy. Existing historical content and source links remain. |
| Public Holidays | Pink identity and clearer next-date hierarchy, retaining country selection and its separate calendar authority. |
| Aurora & Kp | Aurora color and readable observed/forecast facts. No new personal-location forecast is implied. |
| Progress | Preserved lightweight free progress rail and structured stack presentation with existing goals. |
| Metrics | Teal identity with the real active-day chart and source-owned totals. All 7 / 30 / 90 / 365-day ranges, export and deletion controls remain. |

## Delivery and remaining boundaries

The interactive gallery is in C:/Users/SickT/Documents/Codex/2026-09-05/continue-tab-two-paid-mvp-delivery/outputs/widget-overhaul-v2-implementation/, served locally at http://127.0.0.1:58649/widget-overhaul-v2-implementation/. Each capture records its own source. The final Clock-only source delta preserves the unchanged catalog evidence from 236db8223b6e7e61e0723a85ea33f2d273c00879 rather than rerunning it. The documentation checkpoint adds no runtime changes.

Durable local evidence: artifacts/qa-widget-overhaul-v2/796a306883443563943b17bd34c62b2cc44bbdad/; composed index: artifacts/qa-paid-mvp-stabilization/796a306883443563943b17bd34c62b2cc44bbdad/evidence.json. Unit/build/Clock logs are the widget-overhaul-v2-* files in artifacts/. Owner checks are consolidated in TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md and copied beside the gallery.

The protected original remains clean at eb1354b6a5b041fb6d494655c3dae1862572bc51. The pre-turn manifest of 2,124 protected files was hash-checked with zero changes; artifacts, takeover and Google/Microsoft QA evidence remain intact. Final local/upstream/remote equality is recorded in the delivery receipt after push.

Prior hosted data-portability Task 7 proof and enabled production account export remain valid. No hosted state was changed in this packet. Monitored support, provider verification, Supabase Pro, live Stripe, merge, packaging, release, rollout, OAuth publication and every Chrome Web Store action remain separate approval gates. Fitness remains on hold.
