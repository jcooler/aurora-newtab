# Aurora Browser-Native Widgets QA

Date: 2026-08-22  
Packet: Program F, Browser-native widgets  
Evidence source: `.qa-browser-native-run-20260822-f`  
Reviewed build: `npm run build:preview`, 229 modules  
Harness result: 44 captures, 0 failures, 0 console errors, 0 page errors, 0 failed requests, 0 external requests

## Decision

The implementation is ready for its bounded code review. Reading List,
Recently Closed, Downloads, and Tab Groups each provide distinct Compact,
Standard, Full, and Docked compositions. Every captured state is bounded,
painted, readable, and useful at 1600x900. Each Standard composition also fits
the exact 1408x445 short-window witness after waiting for the live viewport
geometry to settle.

No browser result was written to Aurora storage. The observed product write log
was empty after each scenario seed and reload. The only native action calls were
the approved API surface:

- `readingList.updateEntry` and `readingList.removeEntry`
- `sessions.restore`
- `downloads.pause`, `downloads.resume`, `downloads.cancel`, and `downloads.show`
- `windows.update` and `tabGroups.update`

No `tabs`, `history`, host, `downloads.open`, credential, connector, Store, or
new dependency boundary was used.

## Per-capture usefulness judgments

Every row below was inspected from its original PNG. The contact sheets used to
scan the set are scratch-only derivatives and are not accepted evidence.

### Reading List

| Capture | Judgment | Why it earns the space |
|---|---|---|
| `readingList-tiers-compact-common` | Useful | One calm line exposes unread count and the newest title. |
| `readingList-tiers-standard-common` | Useful | The unread queue shows three direct actions without crowding. |
| `readingList-tiers-full-common` | Useful | Full separates unread from recently read and adds useful history. |
| `readingList-tiers-docked-common` | Useful | The 38px strip line carries count plus title with no card husk. |
| `readingList-tiers-standard-exact-short-short` | Useful | The complete Standard queue remains centered and inside 1408x445. |
| `readingList-permission-required-standard-common` | Useful | The card states exactly where to enable the feature. |
| `readingList-empty-standard-common` | Useful | The compact empty truth avoids a blank queue. |
| `readingList-error-standard-common` | Useful | The failure is readable and exposes a bounded Refresh action. |
| `readingList-dock-detail-docked-common` | Useful | The dense line opens the same actionable queue in a contained dialog. |
| `readingList-edit-standard-common` | Useful | Edit chrome remains outside the content and does not cover actions. |
| `readingList-actions-standard-common` | Useful | Mark-read removes the item from the unread view and remove stays explicit. |

### Recently Closed

| Capture | Judgment | Why it earns the space |
|---|---|---|
| `recentlyClosed-tiers-compact-common` | Useful | The newest restorable session is readable at a glance. |
| `recentlyClosed-tiers-standard-common` | Useful | Five-session capacity and direct Restore actions fit a calm card. |
| `recentlyClosed-tiers-full-common` | Useful | Full groups tabs and windows, adding structure instead of empty width. |
| `recentlyClosed-tiers-docked-common` | Useful | The 38px strip line exposes count plus newest title. |
| `recentlyClosed-tiers-standard-exact-short-short` | Useful | All three fixture sessions and actions fit within 1408x445. |
| `recentlyClosed-permission-required-standard-common` | Useful | Permission guidance is direct and feature-specific. |
| `recentlyClosed-empty-standard-common` | Useful | The empty state is truthful and content-tight. |
| `recentlyClosed-error-standard-common` | Useful | The failure and Refresh action are visible without a large shell. |
| `recentlyClosed-dock-detail-docked-common` | Useful | Dock click parity restores the full actionable session view. |
| `recentlyClosed-edit-standard-common` | Useful | Edit controls do not obstruct Restore actions or session labels. |
| `recentlyClosed-actions-standard-common` | Useful | Restore produces a visible confirmation and exact native call. |

### Downloads

| Capture | Judgment | Why it earns the space |
|---|---|---|
| `downloads-tiers-compact-common` | Useful | Active count plus newest filename forms a true glance. |
| `downloads-tiers-standard-common` | Useful | Four recent rows expose progress and safe controls. |
| `downloads-tiers-full-common` | Useful | Six mixed states fill Full with more history, not larger whitespace. |
| `downloads-tiers-docked-common` | Useful | The 38px line exposes active count and the lead filename. |
| `downloads-tiers-standard-exact-short-short` | Useful | Four actionable rows remain within the exact short window. |
| `downloads-permission-required-standard-common` | Useful | Permission guidance names Downloads and Settings. |
| `downloads-empty-standard-common` | Useful | The empty state is compact and unambiguous. |
| `downloads-error-standard-common` | Useful | Failure copy and Refresh remain accessible. |
| `downloads-dock-detail-docked-common` | Useful | Dock detail shows progress, safe actions, and multiple states. |
| `downloads-edit-standard-common` | Useful | Edit chrome remains separate from progress and action controls. |
| `downloads-actions-standard-common` | Useful | Pause, resume, two-step cancel, and show-in-folder are visible and logged. |

### Tab Groups

| Capture | Judgment | Why it earns the space |
|---|---|---|
| `tabGroups-tiers-compact-common` | Useful | Group count, first title, and color spine form a distinct glance. |
| `tabGroups-tiers-standard-common` | Useful | Three workspaces expose state, color, focus, and collapse actions. |
| `tabGroups-tiers-full-common` | Useful | Full groups workspaces by stable window ordinal. |
| `tabGroups-tiers-docked-common` | Useful | The 38px line carries group count and first workspace. |
| `tabGroups-tiers-standard-exact-short-short` | Useful | All workspace rows remain centered and inside 1408x445. |
| `tabGroups-permission-required-standard-common` | Useful | The feature-specific Settings instruction is clear. |
| `tabGroups-empty-standard-common` | Useful | The card reports the absence of groups without a blank body. |
| `tabGroups-error-standard-common` | Useful | Failure and Refresh are readable in a content-tight shell. |
| `tabGroups-dock-detail-docked-common` | Useful | Dock click parity exposes every group and safe action. |
| `tabGroups-edit-standard-common` | Useful | The edit affordances do not cover labels or action buttons. |
| `tabGroups-actions-standard-common` | Useful | Focus and collapse produce exact approved native calls and confirmation. |

## Automated evidence

- Output guard requires an explicit empty `.qa-browser-native-*` direct child
  and rejects source, accepted evidence, protected, linked, file, nested, and
  non-empty targets.
- The deterministic adapter is installed with `page.addInitScript` before React
  can resolve the preview-only browser boundary.
- All four resources prove ready, permission-required, empty, and error truth.
- All four tier families prove Compact, Standard, Full, and Docked rendering.
- Every Docked line opens the widget's own actionable detail view.
- Edit mode paints selection controls without moving or obscuring the widget.
- Every action has an accessible name and nonzero hit box.
- Storage is searched for unique browser fixture values after every capture.
- The harness fails on console errors, page errors, failed requests, external
  requests, horizontal overflow, offscreen or degenerate geometry, unpainted
  content, unnamed or zero-size actions, forbidden API calls, or storage leaks.

## Manual ceilings

This evidence uses the real built extension in Chromium but deterministic
preview adapters for browser-owned data. It does not claim to automate Chrome's
native optional-permission prompt, a user's genuine Reading List and recently
closed history, an operating-system Downloads folder reveal, or focus changes
across the user's real windows. Production keeps those permissions optional and
requests each only from its matching Settings switch. Those native surfaces
remain manual release-witness work, not a reason to weaken deterministic
coverage or broaden permissions.
