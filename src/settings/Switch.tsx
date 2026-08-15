// The Switch — Aurora's signature on/off control (the control kit, Task 61).
//
// It's a NATIVE <button role="switch">, not a styled div: Space/Enter
// activation, focus, disabled semantics and <label htmlFor> association all
// come from the platform for free, so we own only the track, the sliding
// thumb, and the aria-checked wiring.
//
// LOCATION / shared intent: this lives under src/settings/ only because
// settings is its sole consumer today. It has zero settings-specific
// dependencies and is written to move to a src/components/ control kit
// unchanged the moment a second surface needs it — hence the generic prop
// shape rather than anything Settings-flavoured.
//
// BOTH SCHEMES (Task 60): the OFF track is fg-derived (bg-switch-off, a
// color-mix off --fg — see themes.css / newtab/index.css), never a fixed
// white-alpha, so it reads correctly on a LIGHT panelColor pick (a dark track
// on a light panel) as well as on the dark default (a light track). The ON
// track is the fixed --accent, which the panelColor engine never touches.

export default function Switch({
  id,
  checked,
  onChange,
  label,
  disabled = false,
  describedBy,
}: {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  // Accessible name for the STANDALONE case (no external row label). Every
  // Settings row already renders its own <label htmlFor={id}> on the left, so
  // those pass a matching `id` and omit this — the button is labelable, so
  // both getByLabelText(...) and a label click resolve straight to it.
  label?: string
  disabled?: boolean
  // id of an inline error/description, mirrored onto aria-describedby — the
  // Widgets bookmarks-permission-denied alert wires itself here.
  describedBy?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => {
        // SYNCHRONOUS, with ZERO awaits before onChange: a converted toggle
        // whose handler must run inside the click gesture — the bookmarks
        // permission request (Widgets.tsx) — keeps chrome.permissions.request
        // as the first await in the whole chain, exactly as the checkbox's
        // onChange did. Do not make this handler async.
        if (!disabled) onChange(!checked)
      }}
      // 36×20 track (h-5 w-9) with a 2px inset (p-0.5) framing the 16px thumb.
      // cursor-pointer is explicit because Tailwind v4 preflight sets
      // `button { cursor: default }` (same fix as Tabs.tsx / the chips).
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50 max-[420px]:h-9"
    >
      {/* The signature micro-interaction: the 16px thumb slides 16px across the
          32px inner track with a slight overshoot (the cubic-bezier overshoots
          past 1 before settling), and snaps instantly under
          prefers-reduced-motion. */}
      <span
        data-switch-track
        aria-hidden
        className={`absolute left-0 top-1/2 inline-flex h-5 w-9 -translate-y-1/2 items-center rounded-full p-0.5 transition-colors duration-150 motion-reduce:transition-none ${
          checked ? 'bg-accent' : 'bg-switch-off'
        }`}
      >
        <span
          data-switch-thumb
          className={`size-4 rounded-full bg-white shadow-sm shadow-black/30 transition-transform duration-150 ease-[cubic-bezier(.34,1.3,.64,1)] motion-reduce:transition-none ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}
