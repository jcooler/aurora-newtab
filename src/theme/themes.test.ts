import { describe, expect, it } from 'vitest'
// `?raw` (a Vite core feature, declared in vite/client.d.ts — already in
// tsconfig's "types") pulls the file in as a plain string. themes.css is
// never actually loaded/cascaded by vitest (vitest.config.ts has no
// Tailwind/PostCSS plugin wired in, unlike vite.config.ts's real build — see
// the header comment there), so getComputedStyle in jsdom can't see any of
// this: assert directly against the source text instead. This is what
// guards against the "folders widget doesn't re-theme" class of bug — a
// hardcoded hex in a component can't be caught by asserting a --panel-solid
// var exists per theme; that's covered separately by className assertions
// in BookmarksBar.test.tsx / TodoPanel.test.tsx / NotesPanel.test.tsx.
import css from './themes.css?raw'

function themeBlock(selector: string): string {
  // Matches `[data-theme='x'] {...}` (or `:root,\n[data-theme='aurora'] {...}`)
  // up to its closing brace — good enough for this file's flat, single-level
  // rule bodies.
  const re = new RegExp(`\\[data-theme=['"]${selector}['"]\\][^{]*\\{([^}]*)\\}`)
  const match = css.match(re)
  if (!match) throw new Error(`No [data-theme='${selector}'] block found in themes.css`)
  return match[1]
}

describe('themes.css — --panel-solid', () => {
  it.each(['aurora', 'glass', 'mono'])('defines --panel-solid for the %s theme', (theme) => {
    expect(themeBlock(theme)).toMatch(/--panel-solid:\s*[^;]+;/)
  })

  it('Aurora is pixel-identical to the hardcoded hex every floating panel used to ship (#17171c at 95% opacity) — the default theme must not visibly change', () => {
    expect(themeBlock('aurora')).toMatch(/--panel-solid:\s*rgb\(23 23 28 \/ 0\.95\);/)
  })

  it('Mono is a flat, high-opacity near-black (no blur/border to lean on there)', () => {
    expect(themeBlock('mono')).toMatch(/--panel-solid:\s*rgb\(10 10 10 \/ 0\.92\);/)
  })

  it('Glass stays in its own white-tinted glass language, more opaque than the ambient --panel so small text stays readable', () => {
    const block = themeBlock('glass')
    expect(block).toMatch(/--panel-solid:\s*rgb\(255 255 255 \/ 0\.\d+\);/)
    const panelOpacity = Number(block.match(/--panel:\s*rgb\(255 255 255 \/ ([\d.]+)\)/)?.[1])
    const panelSolidOpacity = Number(block.match(/--panel-solid:\s*rgb\(255 255 255 \/ ([\d.]+)\)/)?.[1])
    expect(panelSolidOpacity).toBeGreaterThan(panelOpacity)
  })

  it('the prefers-color-scheme: light override block does not touch --panel-solid (floating panels sit over the photo, not OS chrome, in every theme)', () => {
    const lightBlock = css.slice(css.indexOf('@media (prefers-color-scheme: light)'))
    expect(lightBlock).not.toMatch(/--panel-solid/)
  })
})
