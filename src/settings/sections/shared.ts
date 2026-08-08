// Shared Tailwind class strings for the Settings control kit (Task 61) — kept
// here (rather than duplicated per file, or re-exported from SettingsPanel.tsx
// into its own children) so every section's rhythm and control styling stays
// byte-identical BY CONSTRUCTION, with no dependency on the composition root.
// Editing one string here restyles that control across every section at once.
//
// Everything is fg-DERIVED (bg-control-bg / border-control-border /
// bg-control-bg-hover, defined off --fg in themes.css), never a fixed
// white-alpha, so the whole kit adapts to a light OR dark panelColor pick — see
// the token rationale in themes.css.

// One settings row: label on the left, control on the right, at a comfortable
// h-9 hit area so a switch row and an input row share the same vertical rhythm.
export const row = 'flex min-h-9 items-center justify-between gap-4 py-1.5'

// The readable control label on a row's left.
export const label = 'text-sm text-fg-muted'

// Section header — a quiet uppercase eyebrow, the signature of the rhythm pass.
export const eyebrow = 'mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted'

// Text / date / url inputs: an h-8 rounded field on a fg-derived fill + border,
// with an accent focus ring. Append width utilities (`${control} w-28`) as
// needed — the sections already do.
export const control =
  'h-8 rounded-lg border border-control-border bg-control-bg px-2.5 text-sm text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent motion-reduce:transition-none'

// Selects: the same field, with the native arrow removed (`appearance-none`)
// and replaced by the shared `select-chevron` glyph (see newtab/index.css).
export const select = `${control} cursor-pointer appearance-none pr-8 select-chevron`

// Quiet button — transparent until hover, then a fg-derived wash. The default
// action-button across the drawer (Export, Arrange layout, clear location, …).
// cursor-pointer is explicit on every button class here because Tailwind v4
// preflight sets `button { cursor: default }`.
export const btnQuiet =
  'inline-flex h-8 cursor-pointer items-center rounded-lg border border-control-border bg-transparent px-3 text-sm text-fg-muted transition-colors hover:bg-control-bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none'

// Primary button — an accent fill (accent is a light sky blue, so near-black
// text on it stays legible in both schemes). For the one committing action in a
// pair (Confirm).
export const btnPrimary =
  'inline-flex h-8 cursor-pointer items-center rounded-lg bg-accent px-3 text-sm font-medium text-[#0a0a0a] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none'

// Danger button — the restrained red, unchanged in intent (Reset layout), now
// on the shared quiet-button chassis so its shape matches its neighbours.
export const btnDanger =
  'inline-flex h-8 cursor-pointer items-center rounded-lg border border-control-border bg-transparent px-3 text-sm text-red-400 transition-colors hover:bg-control-bg-hover hover:text-red-300 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none'

// Inline form-submit affordance (Add / Save / Connect) — a compact accent text
// button that sits beside its input without competing with it for weight.
export const submitBtn =
  'shrink-0 cursor-pointer text-sm font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none disabled:opacity-50'
