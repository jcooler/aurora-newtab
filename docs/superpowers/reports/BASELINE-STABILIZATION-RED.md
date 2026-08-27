# Baseline Stabilization RED Evidence

**Observed:** 2026-08-21 at planning checkpoint `dc9c1f4`.

The two focused tests below passed their assertions but failed the packet's
warning-free acceptance contract. Vitest exits zero for these React warnings,
so the warning text itself is the RED signal.

## Settings Layout hydration

Command:

```powershell
npx vitest run src/settings/SettingsPanel.test.tsx -t "groups compact Widget toggles" --reporter=verbose
```

Test: `SettingsPanel tabs (General / Widgets / Data) > groups compact Widget toggles and keeps editor bodies closed until requested`

Component: `Layout`

Warning: `An update to Layout inside a test was not wrapped in act(...).`

## CanvasItem empty-content observation

Command:

```powershell
npx vitest run src/newtab/canvas/CanvasItem.test.tsx -t "marks a widget that rendered NOTHING" --reporter=verbose
```

Test: `CanvasItem > marks a widget that rendered NOTHING as empty and gives it no chrome`

Component: `CanvasItem`

Warning: `An update to CanvasItem inside a test was not wrapped in act(...).`
