# Calm Canvas UI Inventory

**Date:** 2026-08-16  
**Branch:** `feat/aurora-2-observatory`  
**Result:** Historical evidence only. The owner rejected the candidate after visual and interaction review because it failed the product vision and arrangement requirements.

## Frozen registry inventory

The dense packaged-extension fixture rendered every frozen registry identity exactly once. The 17 composition witnesses repeated the inventory across Compact, Standard, Display, and Ultrawide profiles without a duplicate identity, collision, paint escape, missing image, or document-level horizontal overflow.

| Zone | Registry identities | Result |
|---|---|---|
| Day | `weather`, `ics`, `monthCal`, `sun`, `moon`, `quote` | Browser-proven |
| Now | `clock`, `greeting`, `worldClocks`, `countdown`, `search`, `focus`, `links`, `habits` | Browser-proven |
| Work Pulse | `status`, `github`, `gitlab`, `jira`, `vercel`, `homeassistant` | Browser-proven |
| Signal Dock | `bookmarks`, `rss`, `crypto`, `timer`, `tasks`, `notes` | Browser-proven |

The registry remains 26 identities. No identity, zone, order authority, schema, migration, permission, connector, or storage contract changed.

## Surface and state inventory

| Surface or state | Direct witness | Disposition |
|---|---|---|
| Search and restrained focus entry | `interaction-01-focus-complete.png` | Commit, Space activation, completion feedback, and accessible checkbox name proven |
| Quick Links add, validation surface, keyboard reorder, remove | `interaction-02-quick-link-editor.png`, `interaction-03-quick-link-added-reordered.png` | Browser-proven; destination anchors now have explicit accessible names |
| Quick Links edit | N/A | The shipped product has add, reorder, and remove; it has no existing-link edit command, so no hidden or invented control was added |
| Bookmark folder open, nested drill, Back, Escape, restoration | `interaction-22-bookmark-folder.png`, `interaction-23-bookmark-drill.png` | Browser-proven; body portal is viewport-clamped and the Dock alone owns horizontal reveal |
| Command Palette open, filter, close | `interaction-04-command-palette.png` | Browser-proven with Ctrl+K and Escape |
| Weather summary, expanded forecast, location search | `interaction-05-weather-expanded.png`, `interaction-24-weather-location-search.png` | Browser-proven, including two disambiguated Dallas results, active descendant, and Escape |
| Calendar source and calendar controls | `interaction-15-settings-calendar.png` | Browser-proven |
| Connector identities and Signal Dock disclosure | `matrix-09-standard-1600x900-dense.png`, `interaction-06-signal-dock-details.png` | All enabled identities and one real detail disclosure proven |
| Tasks | `interaction-07-utility-tasks.png` | Tool navigation and task creation proven |
| Notes | `interaction-08-utility-notes.png` | Dirty-to-saved browser path proven; retained-error, Retry save, and close guards remain owned by the unchanged Notes persistence tests and the canonical final harness |
| Timer | `interaction-09-utility-timer.png` | Running state and survival while switching tools proven; reducer persistence and reopen ownership remain covered by unchanged Timer tests and the canonical final harness |
| Home Assistant | `interaction-10-utility-home-assistant.png`, `interaction-16-settings-home-assistant.png`, `interaction-17-home-assistant-picker-failure.png` | Action isolation, settled failure, picker recovery, and retryable Settings state proven; live success remains a manual ceiling |
| Background refresh | `interaction-11-utility-refresh.png` | Existing refresh owner and actionable control proven |
| Settings General, Widgets, Connectors, Data | `interaction-12-settings-general.png` through `interaction-18-settings-data.png` | All four tabs and their shipped controls browser-proven |
| Narrow Settings | `interaction-19-settings-narrow.png` | 375x812 full-height drawer proven |
| Confirmation and error surfaces | `interaction-14-reset-layout-confirm.png`, `interaction-17-home-assistant-picker-failure.png` | Safe initial focus and recoverable error presentation proven; invalid backup and restore failure remain owned by unchanged Data tests and the canonical final harness |
| Arrange preview, lock, resize, copy, reset, Undo, Cancel, Save | `interaction-20-arrange-controls.png` | Browser-proven with persisted Save assertion and storage cleanup |
| Touch long-press Arrange | `interaction-21-touch-long-press.png` | Real Chromium touch events opened Compact Arrange |

## Composition witnesses

The inspected witness set is:

1. Compact: 320x180 sparse, 375x812 touch, 600x800, 800x600 sparse, 800x600 dense.
2. Standard: 900x700, 1280x800, 1600x900 sparse, 1600x900 dense, 1920x1080, 2012x1397 dense.
3. Display: 2200x1100, 2560x1440 sparse, 2560x1440 dense, 3840x2160 dense.
4. Ultrawide: 1600x700, 3440x1440 dense.

At 320x180, Stage-owned vertical scrolling is the explicit semantic reflow behavior. Dense Signal Dock content intentionally scrolls inside the Dock; it does not shift the document or Stage.

## Manual ceilings

- Native Chrome zoom controls and Windows mixed-DPI movement.
- Real screen-reader speech and platform focus announcements.
- Physical touch/pen hardware beyond Playwright touch input.
- Native permission prompts and a live Home Assistant instance/action.
- Genuine sleep/wake, OS timezone changes, and unload-time persistence.
- Chrome Web Store upload, submission, and rollout, which remain blocked through W6-P5.
