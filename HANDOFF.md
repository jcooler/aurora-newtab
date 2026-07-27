# Session Handoff — Aurora v1.1 build (written 2026-07-27)

Read this whole file, then continue the build. Jon (the user) approved everything
described here; do not re-litigate settled decisions.

## What this project is

Aurora: a local-first MV3 new-tab Chrome extension (React 19 + TS strict + Vite 6
+ @crxjs + Tailwind 4 + Vitest 3), built to replace Momentum. v1.0.0 is done and
live (Jon uses it). We are mid-flight on **v1.1**.

- Spec: `docs/superpowers/specs/2026-07-26-aurora-v1.1-design.md`
- Plan (tasks 21–29, full detail): `docs/superpowers/plans/2026-07-26-aurora-v1.1.md`
- Ledger (source of truth for loop state): `.superpowers/sdd/2026-07-26-aurora-v1.1/progress.md`
- Remote: github.com/jcooler/aurora-newtab (private, `gh` authed as jcooler). Push after every task commit.
- Verified at handoff: HEAD = `40a329d`, working tree clean, everything pushed, `npm test` 143/143, `npm run build` green.

## Where the loop stands

| Task | State |
|---|---|
| 21 schema v2 | complete (79d98b8) |
| 22 polish batch (dialog stack etc.) | complete (18a7efb) |
| 23 export/import backup | complete (e321772) |
| 24 weather details row | complete (5a8b4a5) |
| **25 multi-photo gallery** | **implemented (40a329d) but NOT reviewed — resume HERE** |
| 26 bookmark folders bar | not started |
| 27 notes scratchpad | not started |
| 28 world clocks + countdown | not started |
| 29 v1.1 wrap (README, 1.1.0, final visual pass) | not started |
| Final whole-phase review | after 29; base = plan commit `9a67613` |

## The process (superpowers subagent-driven development)

You are the controller; you do NOT write feature code yourself. Per task:

1. Brief: `<skill>/scripts/task-brief docs/superpowers/plans/2026-07-26-aurora-v1.1.md <N>`
   writes `.superpowers/sdd/2026-07-26-aurora-v1.1/task-<N>-brief.md`. Briefs are COMPACT —
   restate the plan's full binding spec for that task in the dispatch prompt (read the plan
   section yourself first).
   `<skill>` = `C:\Users\SickT\.claude\plugins\cache\claude-plugins-official\superpowers\6.2.0\skills\subagent-driven-development`
2. Dispatch ONE implementer subagent (general-purpose). Model tiering that has worked:
   haiku for verbatim-transcription tasks, sonnet for tasks needing judgment (26–28: sonnet).
   Standard prompt sections: task description → context → your job → in-over-your-head →
   self-review → report format (report file + ≤15-line reply contract). Commits end with
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and are pushed.
3. Review package: `<skill>/scripts/review-package docs/superpowers/plans/2026-07-26-aurora-v1.1.md <BASE> HEAD`
   (BASE = HEAD before the task). Dispatch ONE reviewer subagent (sonnet for real surface,
   haiku for small prescribed diffs): spec compliance first, then quality; do-not-trust-the-report;
   read-only; output Critical/Important/Minor + verdict.
4. Findings: Critical/Important → resume the SAME implementer via SendMessage with the findings
   (fix round, max 5); then a SCOPED re-review of just the fix diff (haiku/sonnet). Minors →
   append to the ledger as `Task N: minor (deferred)`. Zero findings → close out.
5. Close-out per task: verify trailer (`git log -1 --format=%B <sha> | grep -c "Co-Authored-By"`),
   verify pushed, append `Task N: complete (...)` to the ledger, extract next brief.
6. Visual gate: any task with UI runs `node scripts/preview.mjs` (rebuild dist first if stale:
   `npm run build`) and YOU personally Read the new/changed screenshots in `screenshots/`
   before approving. The preview script seeds deterministic state and asserts no console errors.

## Immediate next action: finish Task 25

Task 25 (multi-photo gallery) landed as `40a329d` but the session broke before review; the
implementer's report file is missing. So:

1. `<skill>/scripts/review-package docs/superpowers/plans/2026-07-26-aurora-v1.1.md 5a8b4a5a998b912b65222d171da0941dda3fda85 HEAD`
2. Dispatch a sonnet reviewer on the diff ALONE (no implementer report exists — tell the reviewer
   to verify everything from the diff + running the suite; there are no claims to trust).
   The binding spec is the plan's Task 25 section: idb.ts v2 (addUploads/listUploads/removeUpload,
   lazy legacy-slot migration, getUpload deleted), Background rotation over the gallery with
   upload-empty→bundled→gradient cascade fix, SettingsPanel multi-file input + thumbnail grid
   with per-photo ✕ (object URLs revoked), uploadedAt nonce stamped on add/remove,
   Background.test.tsx extensions with mocked idb, preview extended with a setInputFiles probe
   (`settings-gallery.png`). Also verify the preview probe actually exists in scripts/preview.mjs.
3. Findings → fresh fixer subagent (the original implementer cannot be resumed across sessions);
   scoped re-review; ledger; then Tasks 26–29 per the plan.

## After Task 29

Final whole-phase review (fable-tier reviewer, base `9a67613`..HEAD, ledger minors triaged
MERGE-BLOCKING vs CAN-DEFER), one fix wave + one scoped re-review if needed, full visual pass
(all screenshots), then report to Jon: what shipped, screenshots, load steps, what's deferred.

## Jon's standing directives (violating these gets tasks rejected)

1. **No placeholder/"coming soon" UI, ever.** Toggles/labels appear only when the widget works.
2. **See it with your own eyes.** Screenshot-verify every visual change via the preview harness;
   don't trust test-pass alone. Jon caught us once; don't repeat it.
3. **Background photos: landscapes only, NO people.** Curate visually (contact-sheet method).
4. **Quotes must be accurately attributed** (no famous misattributions; reviewer verified 61).
5. **Build continuously, no pauses between tasks.** Report when done or blocked.
6. Local-first is non-negotiable: network = Open-Meteo + one-time BigDataCloud reverse geocode,
   nothing else, all disclosed in README Privacy.
7. `legacy/` (old Tide extension) is READ-ONLY reference, gitignored, never modified.

## Conventions cheat-sheet

- Panel surfaces: `bg-[#17171c]/95 border border-panel-border backdrop-blur-[var(--panel-blur)] rounded-panel`.
- Escape: `useDialogEscape(onClose, active?)` from `src/lib/dialogStack.ts` (newest-first). Never
  a raw document listener in a dialog.
- Storage: everything through `src/lib/storage` wrapper + `useStoredKey`/`useStorage`; deep-equal
  writes emit NO events (chrome-faithful memoryDriver mirrors this) — stamp a nonce when a
  re-read must trigger. Serialized read-modify-write via `storage.update`.
- Favicons: `faviconUrl()` (`_favicon/` API), never external favicon services.
- Widgets: gate/inner split so disabled widgets mount zero hooks; `<WidgetBoundary name=...>`
  around every mount; WIDGET_LABELS is `Partial<Record<...>>` — add labels only when real.
- New-widget checklist is in README "Adding a widget".
