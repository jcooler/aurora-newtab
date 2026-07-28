# Arrange Mode — free widget placement (premium)

**Approved by Jon 2026-07-28** (brainstormed in-session; "everything moves" + light snap + long-press entry + prominent reset; Approach A: custom pointer hook, no runtime dependency).

## Goal

Long-press any widget to enter arrange mode, drag every block anywhere on the page with light snapping and alignment guides, keyboard-accessible, persisted per the storage conventions, with one-click reset to the stock layout. First caller of the premium seam.

## Non-goals (v1)

Per-block resizing; multiple saved layouts; per-monitor/per-viewport layouts; dnd-kit (reserve for future list reordering); touch support beyond what pointer events give for free.

## Data model

- New `DataKey` `layout`: `Record<BlockId, { x: number; y: number }>` — sparse; a block absent from the map renders at its default position. `x`/`y` are the block's **center**, as percentages (0–100) of viewport width/height, stored as finite numbers.
- Schema bumps to **v3**: `CURRENT_VERSION = 3`, `migrations[2]` backfills `layout: {}` (follow the `migrations[1]` pattern including plain-object guards). Backup validators gain the `layout` key (TS `Record<DataKey, …>` forces it): entries must be objects of finite-number pairs; unknown block ids are dropped on import.
- Positions clamp on render so a block's box always stays fully on-screen (min 8px margin) regardless of stored values or window size.

## Blocks

`BlockId` = `clock | greeting | worldClocks | countdown | search | focus | links | quote | weather | timer | tasks | notes | bookmarks`. The center stack dissolves: each former stack child becomes its own block whose **default position reproduces today's rendered layout exactly** (zero visual change until first arrangement). Gear and refresh buttons are not blocks (never draggable — the recovery path must stay findable). A block that is toggled off in Settings simply doesn't render; its stored position is kept.

## Arrange mode

- **Entry:** press-and-hold ~500ms on any block without moving >8px. On engage: the held block "lifts" (slight scale + shadow), the mode activates, and the release/click that follows is suppressed (no widget action fires). Holds that end early or move too far act as normal clicks/drags-nothing.
- **While active:** every block gets a visible outline and grab cursor; widget interiors are inert (pointer events captured by the arrange layer — a drag can never open a panel). Escape and a floating bottom-center pill (`Reset layout` · `Done`) exit; Escape integrates with the shared dialog stack (registered like a dialog so it wins newest-first, since panels are inert/closed in this mode).
- **Dragging:** pointer capture on the block; position follows the pointer with **8px grid snap** plus **magnetic alignment guides** (screen vertical/horizontal center lines and other blocks' edges/centers; snap threshold ~6px; active guides render as 1px accent lines). Drop writes the new position via `storage.update('layout', …)`.
- **Keyboard:** while in arrange mode, Tab/Shift-Tab cycles blocks (visible focus ring), arrows nudge 8px, Shift+arrows 1px, Enter/Escape exits. Entry without a pointer: an "Arrange layout" button in Settings (same mode, same pill) — the long-press is the primary path, the button is the accessible/discoverable one.
- **Reset:** the pill's `Reset layout` clears the `layout` key (`{}`) after an inline two-step confirm (same idiom as import's confirm; no window.confirm). Also exposed as a Settings button next to "Arrange layout".

## Premium seam

`src/lib/premium.ts` exports `isPremium(): boolean` — hardcoded `true` today, documented as the future licensing hook. Arrange-mode entry (long-press handler and both Settings buttons) is gated on it. No other premium UI.

## Architecture

- `src/lib/layout/` (pure, TDD): `snap.ts` (grid snap, guide detection given dragged rect + other rects + viewport, returns snapped position + active guides), `clamp.ts` (viewport clamping), types + block-id registry.
- `src/newtab/arrange/` (interaction): `useLongPress` (engage detection + click suppression), `useArrangeMode` (mode state, keyboard handling, Escape/dialog-stack registration), `ArrangeOverlay` (outlines, guides, pill — rendered above all widgets, below nothing; z above panels while active).
- `PositionedBlock` wrapper in `src/newtab/App.tsx`: renders each block at its default CSS position when no stored entry exists, else absolute at clamped percent coords. Defaults for former stack children are extracted so the unarranged page is pixel-identical to today (verified by screenshot comparison in preview).
- Storage via existing wrapper/`useStoredKey('layout')`; writes only on drop/nudge-end (not per-mousemove frame — drag position is local state while dragging).

## Error handling

Corrupt/non-finite stored positions are ignored per-block (default position used). Layout writes never throw user-visible errors (same fire-and-forget convention as the rest of the app); a failed write self-corrects on next arrange.

## Compliance

No new permissions, no network, no remote code. Nothing in this feature touches Google extension policy surface.

## Testing

- TDD the pure layer: snap math (grid, guide magnetism, threshold edges), clamping (all four edges, degenerate viewports), migration v2→v3, backup validator for `layout`.
- RTL: long-press timing (engages at threshold, cancels on early release/move, suppresses the click), keyboard nudging updates storage, reset clears.
- Preview harness (real hit-testing, the layer jsdom can't do): long-press the clock with real mouse events, drag it to a new position, screenshot mid-drag (guides visible) and post-drop; reload and assert the position persisted; `Reset layout` restores; capture `arrange-mode.png` + verify unarranged `newtab.png` is visually unchanged from before the feature.
