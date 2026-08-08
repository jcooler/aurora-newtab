// Pure color helpers for the widget-color customizer (Task 60). No DOM here:
// applyPanelColor (src/theme/index.ts) is the DOM seam that consumes these,
// and settings.panelColor (a `#rrggbb` string | null) is the stored input.

function toRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/** WCAG 2.x relative luminance of a `#rrggbb` hex (0 for black, 1 for white).
 *  Each channel is linearized (the sRGB gamma curve — the ≤0.03928 low-slope
 *  segment, then the 2.4-power segment) before the 0.2126/0.7152/0.0722 mix,
 *  exactly as the contrast spec defines it. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = toRgb(hex)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// Above this relative luminance the panel reads as "light" and needs dark text
// (and a light native color-scheme so OS-drawn controls match). Chosen to sit
// comfortably above mid-gray so only genuinely bright picks flip.
const FG_FLIP_THRESHOLD = 0.45

// Dark-panel foreground = the app's default off-white (matches themes.css's
// :root --fg/--fg-muted exactly, so a dark pick is seamless with the default).
const DARK_FG = '#f5f5f4'
const DARK_FG_MUTED = 'rgb(245 245 244 / 0.68)'
// Light-panel foreground = near-black, muted at the SAME 0.68 alpha (--fg-muted
// is "fg at reduced alpha", per the surface-color plan).
const LIGHT_FG = '#1a1a1a'
const LIGHT_FG_MUTED = 'rgb(26 26 26 / 0.68)'

export interface DerivedFg {
  fg: string
  fgMuted: string
  scheme: 'light' | 'dark'
}

/** Foreground tokens (and the native color-scheme) that stay readable on a
 *  panel of the given color. A luminous panel gets near-black text + a light
 *  scheme; a dark panel keeps the default off-white + a dark scheme. */
export function derivedFg(hex: string): DerivedFg {
  const light = relativeLuminance(hex) > FG_FLIP_THRESHOLD
  return light
    ? { fg: LIGHT_FG, fgMuted: LIGHT_FG_MUTED, scheme: 'light' }
    : { fg: DARK_FG, fgMuted: DARK_FG_MUTED, scheme: 'dark' }
}

const PANEL_COLOR_RE = /^#[0-9a-f]{6}$/i

/** True only for a full `#rrggbb` hex — the exact shape stored in
 *  settings.panelColor and produced by `<input type="color">`. The 3-digit
 *  short form, an 8-digit `#rrggbbaa`, named colors, `null`, and non-strings
 *  are all rejected. Narrows `unknown` to `string` so callers (the engine,
 *  backup validation) can branch on a validated color. */
export function isPanelColor(v: unknown): v is string {
  return typeof v === 'string' && PANEL_COLOR_RE.test(v)
}
