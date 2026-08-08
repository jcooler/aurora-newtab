import { describe, expect, it } from 'vitest'
// `?raw` (a Vite core feature, declared in vite/client.d.ts — already in
// tsconfig's "types") pulls the file in as a plain string. themes.css is
// never actually loaded/cascaded by vitest (vitest.config.ts has no
// Tailwind/PostCSS plugin wired in, unlike vite.config.ts's real build — see
// the header comment there), so getComputedStyle in jsdom can't see any of
// this: assert directly against the source text instead. This is what
// guards against the "folders widget doesn't re-theme" class of bug — a
// hardcoded hex in a component can't be caught by asserting a --panel-solid
// var exists; that's covered separately by className assertions in
// BookmarksBar.test.tsx / TodoPanel.test.tsx / NotesPanel.test.tsx.
import css from './themes.css?raw'

// Task 60 collapsed the three [data-theme] blocks into a single :root token
// set. This file's flat, single-level rule bodies mean a non-greedy match to
// the first closing brace is enough to isolate the top :root block (the only
// other :root, inside the light-mode @media, comes later in the file).
function rootBlock(): string {
  const match = css.match(/:root\s*\{([^}]*)\}/)
  if (!match) throw new Error('No :root block found in themes.css')
  return match[1]!
}

describe('themes.css — one surface (Task 60)', () => {
  it('has no [data-theme=...] selector blocks left (the three-theme system is gone)', () => {
    // Matches the SELECTOR form only (`[data-theme='aurora']`), not the word
    // in this file's own header comment.
    expect(css).not.toMatch(/\[data-theme=/)
  })

  it("adopts Mono's near-black panel color verbatim as the default --panel-solid (95%)", () => {
    expect(rootBlock()).toMatch(/--panel-solid:\s*rgb\(10 10 10 \/ 0\.92\);/)
  })

  it("adopts Mono's --panel (40%) and transparent --panel-border", () => {
    const root = rootBlock()
    expect(root).toMatch(/--panel:\s*rgb\(0 0 0 \/ 0\.4\);/)
    expect(root).toMatch(/--panel-border:\s*transparent;/)
  })

  it("keeps Aurora's type + accent tokens (the readable-default fg the engine also falls back to)", () => {
    const root = rootBlock()
    expect(root).toMatch(/--fg:\s*#f5f5f4;/)
    expect(root).toMatch(/--fg-muted:\s*rgb\(245 245 244 \/ 0\.68\);/)
    expect(root).toMatch(/--accent:\s*#7dd3fc;/)
  })

  it('still defines the ambient surface tokens every widget consumes', () => {
    const root = rootBlock()
    for (const token of ['--panel-blur', '--radius', '--scrim', '--bg-fallback']) {
      expect(root).toMatch(new RegExp(`${token}:\\s*[^;]+;`))
    }
  })

  it('the prefers-color-scheme: light block only lifts --bg-fallback, never the panel surface tokens', () => {
    // Floating panels sit over the photo, not the OS chrome, so the OS-driven
    // light block must not touch --panel-solid/--panel/--panel-border — a
    // user's own LIGHT panelColor pick flips those via the engine instead.
    const lightBlock = css.slice(css.indexOf('@media (prefers-color-scheme: light)'))
    expect(lightBlock).toMatch(/--bg-fallback:/)
    expect(lightBlock).not.toMatch(/--panel-solid/)
    expect(lightBlock).not.toMatch(/--panel:/)
    expect(lightBlock).not.toMatch(/--panel-border/)
  })
})
