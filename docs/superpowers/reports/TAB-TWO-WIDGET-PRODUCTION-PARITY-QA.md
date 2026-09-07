# Tab Two Widget Production Parity QA

**Updated:** 2026-09-07<br>
**State:** AUTOMATED_PASS_OWNER_QA_PENDING<br>
**Runtime source:** 65c43b37e576b421c7c86194d7bf8d048f22941f<br>
**Prior implementation:** 27b1701e71d074efbba204c2bead851803bf405b<br>
**Catalog sources:** 8b738bfae3273f1eaee48af571716347e4ff4e62 and the runtime source above

## Owner feedback and scope

The owner rejected the earlier built presentation: the Calendar view switch was cramped, GitHub activity overlapped in Compact and occupied only a small part of Full, the bookmark accent had changed, and default panels were tinted. Those screenshots supersede the earlier visual-pass assessment. This repair continues the existing approved all-widget overhaul and preserves every existing color control, data authority, setting, action and explicit saved layout. No subagents were used.

The corrected review contains actual extension components rendered at their supported sizes, with bounded synthetic data. Its overview and detailed after images use the same captures. Real accounts supply their own counts, events and work; sample work is never inserted into production. Before images retain the previous review, with an additional exact production reproduction of the 112-day/quiet graph defect. Existing galleries and failed diagnostic evidence are preserved.

## Causes and repairs

| Finding | Repair and retained behavior |
|---|---|
| Overview had 365 days; both production forge connectors retained only 112. Full graph width was capped by the smaller dataset while its month axis used the card width. | GitHub's existing GraphQL request now requests 365 days; GitLab uses the available year from its existing calendar response. Standard and Full graphs use their selected frame width. Compact retains its 84-day composition; Standard uses 182 and Full 365. Existing scopes, request count, credentials, cache and failure behavior remain. |
| Old or partial caches cannot truthfully supply a year of activity. | Missing dates reserve their positions as outlined unavailable cells, with explicit accessible labels. Headers disclose available days. Totals and streaks use actual data; missing dates are never counted as zero activity. Captures cover a full year, 112 days and one day. |
| Quiet Compact graph cards added another work paragraph below a full composition. | The graph summary remains; the redundant quiet work paragraph is omitted in Compact when a graph is present. Standard and Full retain a separately spaced empty-work state. All work view settings remain. |
| Legacy direct-child Compact CSS applied to free widgets but missed the stack wrapper. | Legacy rules now exclude TierFrame content so both placements use the component's same composition. Weather has explicit Compact spacing. Intrinsic free World Clocks and Countdown remain transparent while their stacked versions use the panel surface. Clock/Greeting/Quote retain their intrinsic free presentation. |
| A 24px Calendar header contained a 28px Agenda/Month switch. | Reserve a 32px header and 4px weekday separation. Four-, five- and six-week Standard date rows fit the fixed frame, with circular dates and a separate event-marker lane. Saved views, keyboard switching, navigation, date context and source colors remain. |
| The earlier overhaul changed default panels and bookmark icons. | Restore the original neutral near-black panel token, remove the automatic accent tint and restore original bookmark icon coloring. Existing panel, widget-text, photo-text, per-element and independent graph palette controls remain. No saved custom color is reset. |
| Fresh production profiles crashed four browser-native widgets before their optional permission was granted. Preview fixtures masked the error. | Subscribe to feature events only after permission is available. The existing native boundary observes namespaces appearing after a grant without requiring a reset. Reading List, Recently Closed, Downloads and Tab Groups show their normal permission guidance in all 28 tested production placements. No owner permission was granted during testing. |
| Reading List's last rows/footer and Linear's third Standard metadata row clipped. Metrics truncated its Standard comparison. | Fit all existing rows and footer with scoped spacing. Show the complete shorter Metrics comparison, retaining the detailed accessible label. Reading List menus, mark and confirmed removal remain usable. |

Provider references: [GitHub contributions collection](https://docs.github.com/en/graphql/reference/users#user), [GitLab contribution calendar](https://docs.gitlab.com/user/profile/contributions_calendar/). The request-window changes use the existing provider interfaces; they add no request or authorization scope.

## Verification

- The reported short-history/quiet graph problem was reproduced in the exact production build before editing. Failing tests established the old provider window and layout contract. A separate production profile exposed the native-permission crash; two regression tests failed before that repair.
- The full unit suite passed **284 files / 4,464 tests** at 8b738bfae3273f1eaee48af571716347e4ff4e62. The final change touched Reading List, Linear and Metrics spacing/copy only; their **43 affected tests and TypeScript passed** at the final runtime. The unrelated full suite was not repeated after that bounded correction.
- Exact production and preview builds passed at the final runtime. Their compiled CSS is **byte-identical**, SHA-256 `8048AD6B09C0383C0D2B7F8A03AD0593F69AE76E32F70834A59E15BC291AAFFE`.
- The corrected gallery contains **552 captures across all 38 widgets**, with **17 actual connector settings dialogs**: 215 desktop cases (213 supported placements plus two Calendar Month views), 260 setting/palette/history variants and 77 narrow-window cases for the nine affected widgets. The earlier complete narrow catalog remains preserved; unchanged widgets were not recaptured without a new failure.
- All 38 largest/free and smallest/stack compositions were visually reviewed, followed by original-size inspection of the reported defects and changed list metadata. The capture inventory retains source provenance. The final runtime replaces every affected Reading List, Linear and Metrics capture; other valid 8b738bf captures remain.
- **18 interaction checks passed**, including custom panel/text/photo colors, per-element Clock/Greeting/Quote overrides, independent graph palette persistence, zero provider requests on palette changes, four/five/six-week months with Sunday/Monday starts, Calendar keyboard/context/navigation/saved view, Reading List actions and 1408 x 445 short-window containment.
- Fresh **production** profiles verified permission-required presentations for four native widgets across **28 placements**, with no render boundary, page or console errors. These checks are distinct from preview fixtures; they do not claim a real Chrome permission grant or owner browser-data interaction.
- The gallery traversal visited every widget, each placement/variant tab, 17 connector dialogs and all image links: **569 panels, 1,202 loaded image instances, zero missing images or browser errors**. Its 390px layout has no horizontal overflow.
- Composed stabilization passed **all 12 automated specialists** at 65c43b37e576b421c7c86194d7bf8d048f22941f; the production account-authentication witness remains **DEFERRED_OWNER_QA**. The index validates source/build equality, all required specialist entries and redacted evidence. The final production build was restored.

The composed runner pauses where a specialist requires manual screenshot judgments. Each capture was inspected, judgments were recorded, and the specialist's original evidence contract validated the completed evidence. A local copy of the original runner resumes only the remaining specialists and retains the original final evidence-index assertion. This preserves exact-source green work instead of repeating interactions solely to load judgments. No earlier-runtime specialist evidence is substituted into the final composed index.

The previous SF-P2 planner's 12 historical script-test failures remain recorded in the prior report; that unrelated planner was not rerun. A transient Google Calendar focus assertion passed on focused confirmation and the final full suite. It does not remain an unresolved failure. Existing build output includes the unchanged bundle-size advisory.

## Evidence and owner review

Interactive review: `http://127.0.0.1:58649/widget-production-parity/#overview`.

Local deliverable: `C:/Users/SickT/Documents/Codex/2026-09-05/continue-tab-two-paid-mvp-delivery/outputs/widget-production-parity/`.

Durable repair evidence: `artifacts/qa-widget-production-parity/65c43b37e576b421c7c86194d7bf8d048f22941f/`. Composed evidence: `artifacts/qa-paid-mvp-stabilization/65c43b37e576b421c7c86194d7bf8d048f22941f/evidence.json`. The repair archive includes source inventories, diagnostic failures, passing logs, color/interaction proof, production permission checks, CSS parity and the gallery.

The cumulative checklist is `TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md`, copied as `OWNER-QA.md` beside the gallery. The production dist is restored after composed QA. Reload the existing unpacked extension in stable Chrome, then open a fresh Tab Two tab; do not remove/reinstall it or clear its data. Real provider data, native permission prompts, hardware/assistive technology and final visual acceptance remain owner witnesses. Cached activity is truthfully marked until the existing connector refresh supplies a longer history.

## Delivery and boundaries

The protected original remains clean at eb1354b6a5b041fb6d494655c3dae1862572bc51. All 2,124 pre-existing protected files were SHA-256 checked with zero changes. Prior artifacts, takeover document, Google Calendar QA evidence and Microsoft Calendar QA evidence remain intact.

Final local/upstream/remote equality is recorded in the delivery receipt after pushing the feature branch. Documentation-only delivery changes do not alter the verified runtime.

Prior hosted data-portability Task 7 proof and enabled production account export remain valid. No hosted mutation, secret change, dependency, permission grant, paid infrastructure, live payment, merge, package, release, rollout, OAuth publication or Chrome Web Store action occurred. Monitored support, provider verification, Supabase Pro, live Stripe and all publication actions remain separate approval gates. Fitness remains on hold.
