import { derivedFg, isPanelColor } from '../lib/color'

// The three-theme system (aurora/glass/mono, keyed by [data-theme]) collapsed
// into one surface in Task 60 — there is no THEMES array or applyTheme() any
// more. What remains here is the runtime panel-color engine: it re-tints the
// single :root token set (src/theme/themes.css) from settings.panelColor.

// --panel-solid at 95% (the floating-surface opacity, matching the ruling) and
// --panel at 40% (the default token's own frost alpha). Appended as an 8-digit
// hex so `#rrggbb` + alpha stays one CSS color value.
const PANEL_SOLID_ALPHA = 'f2' // 0.95
const PANEL_FROST_ALPHA = '66' // 0.40

/** Re-tint every widget surface from settings.panelColor.
 *
 *  `null` (or any non-`#rrggbb` value) removes the inline overrides so
 *  themes.css's :root defaults win. A valid hex sets --panel-solid/--panel at
 *  the default token alphas, plus luminance-derived --fg/--fg-muted, and stamps
 *  `data-scheme="light"` for a bright pick so the [data-scheme="light"]
 *  color-scheme flip (src/newtab/index.css) makes native controls match.
 *
 *  Deliberately touches only the PANEL tokens (--panel-solid/--panel) and the
 *  PANEL ink (--fg/--fg-muted). It NEVER touches --canvas-fg/--canvas-fg-muted:
 *  text on the photograph (clock/greeting/quote/etc.) keeps its fixed light ink
 *  regardless of the pick, because the photo behind it doesn't change (Task 60
 *  fix round; see themes.css).
 *
 *  Deterministic w.r.t. `el`: the same input always leaves `el` in the same
 *  style/attribute state (every branch either sets or removes each property),
 *  so it is safe to call on every settings change. */
export function applyPanelColor(el: HTMLElement, hex: string | null): void {
  if (!isPanelColor(hex)) {
    el.style.removeProperty('--panel-solid')
    el.style.removeProperty('--panel')
    el.style.removeProperty('--fg')
    el.style.removeProperty('--fg-muted')
    el.removeAttribute('data-scheme')
    return
  }
  el.style.setProperty('--panel-solid', `${hex}${PANEL_SOLID_ALPHA}`)
  el.style.setProperty('--panel', `${hex}${PANEL_FROST_ALPHA}`)
  const { fg, fgMuted, scheme } = derivedFg(hex)
  el.style.setProperty('--fg', fg)
  el.style.setProperty('--fg-muted', fgMuted)
  if (scheme === 'light') el.setAttribute('data-scheme', 'light')
  else el.removeAttribute('data-scheme')
}
