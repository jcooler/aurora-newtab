// Shared Tailwind class strings used across every SettingsPanel section —
// kept here (rather than duplicated per file, or re-exported from
// SettingsPanel.tsx into its own children) so every section's row/label/
// control styling stays byte-identical without a dependency on the
// composition root.
export const row = 'flex items-center justify-between gap-4 py-2'
export const label = 'text-sm text-fg-muted'
export const control =
  'rounded border border-panel-border bg-transparent px-2 py-1 text-sm text-fg outline-none focus-visible:border-accent'
