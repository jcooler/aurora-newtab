# Aurora 2.0.0 Release Notes

> **WITHDRAWN DRAFT.** This copy describes the owner-rejected presentation candidate. Do not use it for Store submission. PR-P7 will replace it after the information-first visual and release gates.

Aurora 2.0 restores the photo-first new-tab Canvas and lets each workspace feel deliberately yours.

## What is new

- Arrange every visible widget directly with pointer dragging, snap guides, keyboard movement, collision feedback, layering, a slim toolbar, and an inspector that stays out of the way.
- Keep Bookmarks at the top, Clock and Focus centered, useful widgets at the edges, and Timer, Tasks, and Notes available as movable direct launchers.
- Save independent Small, Desktop, Large, and Wide layouts, each with meaningful size and composition differences.
- Choose Compact, Standard, or Large connector presentations where supported. Rich sizes now show the user-selected content they promise.
- Use complete calendar views: Compact Month shows a full seven-day week, Standard Month shows a complete month, and ICS calendars can use individual colors while Auto preserves deterministic defaults.
- Open Notes, Tasks, Timer, Settings, and connector controls through accessible keyboard and pointer interactions with reliable focus restoration.
- Recover exact saved layouts through additive V3/schema-v12 storage, validation, atomic persistence, explicit saves, and backward-compatible in-memory adapters.
- Keep data local by default. Aurora has no account, backend, analytics, or tracking; optional provider requests go directly from the browser to the chosen service.

## Reviewer note

Updating the existing Aurora item to 2.0.0. Aurora has one purpose: a local-first new-tab dashboard. Search uses `chrome.search.query()` and offers no provider picker. Optional connectors request only the exact HTTPS origin configured by the user; no host is granted at install. Settings, caches, credentials, and RSS/Calendar capability URLs remain local; secrets and capability URLs are stripped from JSON backups. Requests go directly to the selected provider, never through an Aurora server. Eight connectors are read-only. Home Assistant sends a scene/script/switch action only after the user clicks its action button. Aurora has no account, backend, analytics, or tracking.

## Reviewer test path

1. Open a new tab and confirm the photo-first Canvas, centered Clock/Focus, top Bookmarks, Weather, calendar, and movable Timer/Tasks/Notes launchers.
2. Long-press a widget or open Arrange, drag it until a guide appears, move it by keyboard, inspect size/layer controls, then Cancel and confirm the saved layout is unchanged.
3. Switch among Small, Desktop, Large, and Wide; confirm each preview has an independent layout and Focus stays centered.
4. Open Timer, Tasks, and Notes directly. Close each and confirm focus returns to its launcher.
5. In Settings, inspect connector size choices and Calendar source colors. No live credential is required to review the visible configuration UI.
6. Enable Bookmarks if desired, accept Chrome's optional permission prompt, open a named folder, then disable the widget to remove its final permission owner.

Live connector success, native permission-prompt appearance, real screen-reader speech, mixed-DPI movement, and physical touch/pen behavior remain manual environment-dependent checks.
