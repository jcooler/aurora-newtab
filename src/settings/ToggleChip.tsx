// ToggleChip — the house "on/off pill" control (Task 69), lifted from the
// GithubCards board (variant C, the settings closeup Jon picked) into a
// shared control. A rounded chip, not a Switch: it names WHAT it toggles
// (the label sits inside the chip) rather than needing an external row
// label, which is the right shape for a wrapped ROW of independent toggles
// (the "Show on your board" section) rather than one setting per row.
//
// aria-pressed is the accessible state (screen readers announce on/off from
// it); the ✓/+ glyph is purely decorative reinforcement for sighted users,
// hence aria-hidden on its span — without that, some screen readers would
// announce the glyph character as if it were content, duplicating what
// aria-pressed already said.
export default function ToggleChip({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none ${
        on
          ? 'border-accent/40 bg-[rgba(125,211,252,0.14)] text-fg'
          : 'border-control-border bg-control-bg text-fg-muted hover:bg-control-bg-hover hover:text-fg'
      }`}
    >
      <span aria-hidden className={`text-[11px] leading-none ${on ? 'text-accent' : 'text-fg-muted/50'}`}>
        {on ? '✓' : '+'}
      </span>
      {label}
    </button>
  )
}
