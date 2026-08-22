# Aurora Browser-Native Widgets Design

Date: 2026-08-22
Status: Approved for implementation by the continuous-delivery authority in A2-D062
Program: F, browser-native addition wave

## 1. Product law

Aurora may summarize and act on browser-owned information only after the user
turns on that specific widget and grants that specific Chrome permission.
Browser data remains live, ephemeral, and Chrome-owned. Aurora stores only the
user's widget toggle and named-layout placement.

This packet adds four independent built-in widgets:

1. Reading List
2. Recently Closed
3. Downloads
4. Tab Groups

The four widgets do not share a permission grant, do not request network
origins, do not create a second data owner, and do not add the broad `tabs`
permission.

## 2. Official API and permission boundary

The implementation is based on the official Chrome MV3 APIs reviewed on
2026-08-22:

- [Reading List API](https://developer.chrome.com/docs/extensions/reference/api/readingList):
  Chrome 120+, `readingList`, query/add/update/remove operations, and add,
  update, and remove events.
- [Sessions API](https://developer.chrome.com/docs/extensions/reference/api/sessions):
  `sessions`, up to 25 recently closed entries, restore by session ID, and
  `onChanged`.
- [Downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads):
  `downloads`, search and state events, plus pause, resume, cancel, and show in
  folder actions.
- [Tab Groups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups):
  Chrome 89+, `tabGroups`, metadata query/update and group lifecycle events.
- [Optional permissions guidance](https://developer.chrome.com/docs/extensions/reference/api/permissions):
  optional feature permissions are requested from the user's direct gesture.
- [Chrome permission warnings](https://developer.chrome.com/docs/extensions/reference/permissions-list):
  Reading List warns "Read and change entries in the reading list," Downloads
  warns "Manage your downloads," and Tab Groups warns "View and manage your
  tab groups." Sessions has no standalone warning, but pairing it with `tabs`
  would add browsing-history language.

Production declares `readingList`, `sessions`, `downloads`, and `tabGroups` in
`optional_permissions`. The preview build moves them into install-time
`permissions` for deterministic Chromium evidence, exactly as the existing
Bookmarks preview split does. No permission appears in both lists.

`downloads.open`, `history`, and `tabs` are outside this packet. Completed
downloads offer Show in folder, not Open file. Tab Groups uses group metadata
only. Focusing a group uses its `windowId`; reading tab titles, URLs, favicons,
or membership is deliberately unavailable.

## 3. Visual direction

The subject is a calm, photo-first command surface for a person checking the
small set of browser queues that need attention. The job is not to reproduce
Chrome's management pages. It is to answer one glance question per widget and
make the next safe action obvious.

Aurora's existing surfaces, typography, panel color, derived ink, radius,
hairline, focus ring, and soft-at-rest/full-on-hover law remain the token
system. No fixed black-background assumptions or feature-specific palette is
introduced.

The visual signature is a thin native-state rail that encodes real structure:

- Reading List uses unread dots and host labels like a saved-page margin.
- Recently Closed uses a quiet reverse-time line and tab/window type labels.
- Downloads uses the actual progress track as its structural element.
- Tab Groups uses Chrome's real group color as a narrow tab spine, never as a
  large background fill.

Cards remain content-tight. Compact is a glance, Standard is a short working
list, Full earns its area with more rows and actions, and Docked is one clean
line that opens the same detailed view. No tier may grow by padding or repeat
the same facts at a larger size.

## 4. Shared runtime model

Each widget owns one live React resource with this state:

```ts
type BrowserResourceState<T> =
  | { status: 'checking' }
  | { status: 'permission-required' }
  | { status: 'ready'; data: T; refreshedAt: number; refreshing: boolean }
  | { status: 'error'; data: T | null; refreshedAt: number | null; message: string }
```

The resource:

- checks the feature permission before touching its Chrome API;
- starts at most one query per identity at a time;
- ignores stale async completions after unmount or a newer generation;
- refreshes on its Chrome API events and when the document becomes visible;
- preserves the last useful in-memory data while a refresh fails;
- never writes browser content to `chrome.storage`, backup, logs, or QA
  evidence JSON;
- exposes a bounded manual Refresh action in the detailed view;
- handles permission revocation by returning to the truthful permission state
  and ceasing API calls.

Widget stacks do not duplicate the owner: each identity still mounts once,
and docked versus free remains one mutually exclusive renderer path.

## 5. Widget contracts

### 5.1 Reading List

Glance question: What did I save to read next?

- Query all entries, sort newest update first, and derive unread/read sections.
- Compact: unread count plus newest unread title.
- Standard: up to three unread rows with title, host, and saved age.
- Full: up to eight unread rows plus up to four recently read rows.
- Docked: unread count plus newest unread title; click opens the same detailed
  view used by the card.
- Row actions: Open, Mark read/Mark unread, and Remove. Remove requires an
  inline second confirmation.
- Empty: "Reading list clear" in Compact/Docked and a concise explanatory card
  in Standard/Full.
- "Add current page" is rejected for this packet because Aurora itself is the
  current new-tab page. It would be misleading without a separate active-tab
  product decision.

### 5.2 Recently Closed

Glance question: What did I just close?

- Query at most Chrome's documented maximum of 25.
- Compact: latest restorable title and Tab or Window.
- Standard: up to five entries with type and closed age.
- Full: up to 25 entries, grouped as tabs and windows, with a Restore action.
- Docked: count plus latest title; click opens detail.
- A window without a useful title is named by its tab count. Missing optional
  fields never create blank rows.
- Restore is always a direct user action and uses the selected session ID.
- Empty: "Nothing recently closed."

### 5.3 Downloads

Glance question: What is downloading or ready?

- Query up to 25 items ordered by newest start time.
- Compact: active count and newest filename, or the newest completed filename.
- Standard: active progress plus up to four recent rows.
- Full: active, completed, interrupted, and dangerous rows with truthful state,
  byte progress where known, and state-appropriate controls.
- Docked: active count plus newest filename; click opens detail.
- Actions: Pause, Resume, Cancel, and Show in folder. Cancel requires an inline
  second confirmation. Dangerous files are identified but Aurora never calls
  `acceptDanger`, `open`, `removeFile`, or `erase`.
- Unknown totals use an indeterminate textual state rather than fake percent.
- Empty: "No recent downloads."

### 5.4 Tab Groups

Glance question: Which browser workspace is open?

- Query group metadata only: id, title, color, collapsed/shared state, and
  windowId.
- Compact: group count plus the first titled group or its color fallback.
- Standard: up to five groups with title, color spine, window, and open or
  collapsed state.
- Full: every group, organized by stable window order, with Focus window and
  Expand/Collapse actions.
- Docked: group count plus first group; click opens detail.
- Untitled groups use "Untitled <color> group." Window labels are local
  ordinals derived from the current result, never stored identities.
- Focus calls `chrome.windows.update(windowId, { focused: true })`; collapse
  changes only the selected group with `chrome.tabGroups.update`.
- Empty: "No tab groups open."

## 6. Settings and storage

Settings gains a Browser group containing the four toggles. Each toggle:

1. calls `chrome.permissions.request` synchronously from the switch gesture;
2. turns on only after the exact permission resolves true;
3. stays off with a feature-specific inline explanation after denial or
   request failure;
4. turns off immediately without touching named-layout geometry;
5. never requests another browser-native permission as a side effect.

The widget keys are additive nested `WidgetToggles` fields, all default false.
Schema v16 and migration step 15 backfill them for existing settings. The exact
backup validator, defaults, widget-introduction metadata, registry identity,
default placements, and layout recovery contracts include all four keys.

No browser-native result list, URL, filename, title, session ID, group ID, or
download ID is stored. Backup therefore contains only the four booleans and
existing layout placements.

## 7. Privacy and failure truth

All four flows are browser-mediated and send nothing to an Aurora backend or a
third-party network destination. Aurora receives only the local browser data
needed to render the chosen widget and execute its explicit action.

The privacy inventory and manifest tests pin:

- the exact four optional permissions in production;
- the exact preview install-time split;
- no `tabs`, `history`, or `downloads.open` permission;
- no host origin;
- no browser-content storage or backup field;
- the official warning language shown before the user enables a feature.

Errors name the affected feature and offer Refresh or the relevant permission
action. Cached in-memory data may remain visible with a stale marker, but an
error is never relabeled as fresh success.

## 8. Accessibility and interaction

- Every row has one stable accessible name that includes its real state.
- Icon-only actions have visible tooltips and accessible names.
- Progress uses `role="progressbar"` only with truthful min/max/current values.
- Dynamic refresh and action failures use bounded live announcements.
- Docked triggers are real buttons, keyboard operable, and restore focus when
  their detail panel closes.
- Detail panels use Aurora's existing dialog stack, Escape behavior,
  viewport-clamped anchoring, and reduced-motion behavior.
- Editing chrome remains outside widget interiors and normal clicks never
  paint selection rings.

## 9. Verification contract

Implementation follows strict focused RED to GREEN slices:

1. schema, migration, backup, registry, default placement, and manifest;
2. permission transaction and Settings behavior;
3. one pure service adapter and resource owner per Chrome API;
4. one widget at a time, including all declared tiers and actions;
5. privacy and expansion contracts;
6. real preview-build Chromium evidence at 1600x900 and exact 1408x445,
   including free, docked, edit, detail, action, empty, error, permission-loss,
   and reload states.

The browser harness supplies deterministic Chrome API adapters before React
mounts. Production builds constant-fold that adapter path away. Native Chrome
permission prompts remain a truthful manual ceiling; automated preview proof
uses install-time grants and separately exercises the permission wrapper's
grant, denial, and revocation behavior.

## 10. Frozen boundaries and non-goals

This packet does not change connector identities, request contracts,
credentials, origins, Notes ownership, Calendar/ICS contracts, Weather
identity, CSP, dependencies, legacy `layout`, exact V1/V2/V3 recovery, named
layout placement law, Store state, or the protected checkout.

It does not add Top Sites, History Digest, active-tab capture, Reading List URL
entry, tab membership, tab content, file opening, automatic download actions,
smart sorting, notifications, background polling, Flow integration, or widget
stacks behavior changes. Those require later explicit designs.
