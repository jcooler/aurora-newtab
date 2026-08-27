# Aurora Background Library and Lock Design

**Status:** Approved for implementation

**Date:** 2026-08-27
**Authority:** Owner approval in the active Aurora task

## Goal

Let people keep the current bundled background or choose a specific bundled photo, while expanding the catalog with the six owner-approved high-resolution landscapes and removing the two rejected images.

## Scope

- Remove catalog entries `23tpftFIAD0` and `commons-denali-aurora` and their packaged files.
- Add the six approved Unsplash landscapes as untouched highest-resolution originals, with source credit and an inline LQIP for each.
- Keep the current 21 legacy images in their existing packages during this bounded pass.
- Add an optional `locked` preference to `PhotoPrefs`. Missing means unlocked for backward compatibility.
- In Daily photo settings, show a labelled bundled-photo gallery and a `Keep this background` switch.
- Selecting a gallery photo writes its index, stamps the current local day, and locks it.
- Unlocking does not immediately replace the photo. Normal daily rotation resumes on the next local day.
- Manual refresh advances to another photo while preserving the current lock state.
- Upload, gradient, and NASA background behavior remains unchanged.

## Asset contract

New original entries use a single `original` file in the runtime manifest. Legacy entries may retain their existing `tiers` during this pass. Runtime URL resolution prefers `original` and falls back to the existing tier selector. No new photo receives a baked crop or lower-resolution derivative.

## Accessibility and interaction

- The lock is a named switch with its current checked state.
- Each gallery tile is a named button with `aria-pressed` identifying the current selection.
- Photographer attribution stays visible in the picker.
- Selection and lock writes use the existing serialized storage updater.

## Verification

- Focused rotation, manifest, Settings, background component, backup, and TypeScript tests.
- Production build and photo-manifest verification.
- Real Chromium interaction at desktop and narrow Settings widths, including selection, lock, unlock, refresh, overflow, keyboard focus, console errors, and failed requests.
- No change to the protected original checkout or Chrome Web Store state.
