# Aurora named-layouts implementation handoff prompt

Copy everything below the line into a fresh session.

---

# Aurora named-layouts rebuild kickoff prompt for Claude Code

Take over Aurora at the live repository state below and implement the
owner-approved named-layouts and live-canvas design. Do not restart the
project, rewrite history, or re-litigate settled decisions.

## Live repositories

- Active worktree: `D:\DEV\Chrome plugin-aurora-2`
- Active branch: `feat/aurora-2-observatory`
- At session start, verify the worktree is clean and equal to
  `origin/feat/aurora-2-observatory` (the checkpoint that added
  `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md`).
  If the branch has legitimately advanced, read the ledgers and continue
  from the newer state; never reset.
- Protected original checkout: `D:\DEV\Chrome plugin` on `main` at
  `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Read-only, always.
- Chrome Web Store upload, field edits, saves, submission, publication,
  distribution, and rollout remain blocked until the owner gives a new,
  action-specific W6-P5 approval.

## Current truth

- The owner rejected the PR-P6 acceptance; A2-D060 withdrew it. The
  short-height root causes were fixed in `a325891`
  (see `docs/superpowers/reports/SHORT-HEIGHT-RECOVERY-FORENSICS.md`).
- The owner then approved a redesign of the whole layout and editing
  layer: named user-created layouts, content-tight anchored geometry,
  four display tiers (Docked/Compact/Standard/Full), user-created
  top/bottom docks, and live on-page editing. The governing document is
  `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md`
  (owner approved 2026-08-17). Its one-sentence law: the user owns
  placement; the system owns safety. Nothing auto-swaps, derives,
  guesses, or re-flows.
- A2-D061 records the design approval. The delivery shape is seven
  bounded packets (NL-P1 through NL-P7) listed in the spec.

## Read before acting

1. The named-layouts spec above, completely.
2. `docs/superpowers/reports/SHORT-HEIGHT-RECOVERY-FORENSICS.md`.
3. `docs/superpowers/aurora-2/STATUS.md`, `ROADMAP.md`, and
   `DECISIONS.md` A2-D052 through A2-D061.
4. The still-in-force parts of
   `2026-08-17-aurora-information-first-production-readiness-remediation-design.md`
   (type roles, legibility, Settings/Connector workspaces, frozen
   boundaries) and
   `2026-08-16-aurora-v1-canvas-adaptive-safety-rails-design.md`
   (storage/recovery guarantees, arrangement interactions).
5. The current implementations the spec deletes or replaces:
   `src/newtab/useCanvasViewport.ts`, `src/lib/layout/canvasDefaults.ts`,
   `src/lib/layout/canvasGeometry.ts`, `src/lib/layout/canvasAdapter.ts`,
   `src/newtab/canvas/CanvasSurface.tsx`, `src/newtab/canvas/CanvasItem.tsx`,
   `src/newtab/arrange/*`.

## Process requirements

- First act: write the implementation plan for NL-P1 ONLY (layouts
  foundation: schema v13, layouts document, "My layout" migration
  adapter, switcher plumbing, exact recovery, no presentation change),
  using the superpowers writing-plans skill. Plans for later packets are
  created just in time.
- Strict TDD: focused failing test observed before every production
  change. One bounded review plus at most one fix/rereview cycle per
  packet. Bounded commits, pushed checkpoints, ledger updates, and
  active/protected repository proof at each checkpoint.
- Preserve every frozen boundary: storage authority, migrations, backup
  validation and redaction, exact V1/V2/V3 recovery, connector
  identities and request contracts, credentials, permissions, Notes
  ownership, Calendar/ICS contracts, CSP, dependencies, and the
  protected original checkout.
- Owner gates: the tier catalog (NL-P5+) is reviewed widget-by-widget;
  the product QA gate (NL-P6) follows the corrected standard in
  A2-D060/the spec (short-height desktop families including exact
  1408x445, existing-layout-shaped storage, per-capture usefulness
  judgment, at least one real non-emulated window witness). Do not run
  exhaustive matrices during incremental packets.
- Before any owner-facing check: rebuild `dist` from the exact reviewed
  commit and confirm the loaded extension matches it. The prior session
  lost half a day to the owner testing a stale 9:54 AM build.
- Keep working through packets without asking for routine continuation;
  stop only for owner gates, genuine blockers, or scope changes.

## Design points the owner insisted on (do not water down)

- Plain clicks never paint a selection ring in normal use; selection
  chrome is edit-mode only. Outlines trace real content bounds tightly.
- Expandable widgets (Weather) show a dashed expanded-footprint outline
  in edit mode, may be placed anywhere including every corner, and are
  never placement-restricted to dodge a rendering bug.
- Docks: no visible scrollbar ever; scroll only on true overflow with
  masked edge fades; the strip must read as a clean status band.
- Bookmarks render the full readable bar by default everywhere; the
  one-letter form is opt-in or tiny-viewport only.
- Bulk tier control per layout (set all free-floating widgets to
  Compact/Standard/Full at once) plus per-widget override.
- Every tier obeys the no-whitespace law: fill the space with useful
  information or shrink.
