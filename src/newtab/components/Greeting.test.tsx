// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import { defaults } from '../../lib/storage/schema'
import Greeting from './Greeting'

// Task 60 fix round: text that sits directly on the photograph paints with the
// FIXED canvas ink (text-canvas-fg / text-canvas-fg-muted → var(--canvas-fg*)),
// which the panelColor engine never touches — so a LIGHT panel pick (which
// flips the ADAPTIVE --fg to near-black for panel legibility) can't darken the
// clock/greeting/quote into near-invisibility over the image. jsdom has no
// cascade, so this pins the class wiring the same way Clock.test.tsx pins
// text-photo; the computed-color proof runs in scripts/preview.mjs's light
// widget-color block, and the token split itself in src/theme/index.test.ts.
describe('Greeting — canvas ink (fixed over the photo)', () => {
  it('paints with the fixed canvas token, not the panelColor-adaptive --fg', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', { ...defaults().settings, name: 'Jon' })
    const { container } = render(
      <StorageProvider storage={storage}>
        <Greeting />
      </StorageProvider>,
    )
    await act(async () => {})

    const p = container.querySelector('p')
    expect(p).toBeTruthy()
    expect(p?.classList.contains('text-canvas-fg')).toBe(true)
    // NOT the adaptive panel ink: a light panelColor pick must leave it light.
    // (Panel/card text keeps text-fg and DOES adapt — proven at the token level
    // in src/theme/index.test.ts, where applyPanelColor moves --fg but not
    // --canvas-fg.)
    expect(p?.classList.contains('text-fg')).toBe(false)
  })
})

// Greeting-collision fix — the width-cap STACK, pinned per band. jsdom has no
// cascade or layout, so (exactly like the canvas-ink test above, and
// Clock.test.tsx) this asserts the class WIRING; the live pixel proofs — the
// worst-name cap clearing the mid-left column and "Good afternoon." never
// clipping — run in scripts/preview.mjs's habits floor block. Four
// non-overlapping tiers must all be present and the newest one must not
// LOOSEN the pre-existing 40rem defense cap.
describe('Greeting — width-cap stack (composition per band)', () => {
  async function greetingP(name: string) {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', { ...defaults().settings, name })
    const { container } = render(
      <StorageProvider storage={storage}>
        <Greeting />
      </StorageProvider>,
    )
    await act(async () => {})
    return container.querySelector('p')!
  }

  it('carries all four cap tiers plus truncate, in non-overlapping bands', async () => {
    const cls = (await greetingP('Christopher')).className
    // default defense cap (all widths) — 40rem is far wider than any real
    // greeting; pure defense-in-depth.
    expect(cls).toContain('max-w-[40rem]')
    // 721-898px dedicated band (the weather-panel neighbor) — 18rem.
    expect(cls).toContain('min-[721px]:max-[899px]:max-w-[18rem]')
    // >=1593px mid-left-column guard (this fix) — viewport-scaled.
    expect(cls).toContain('min-[1593px]:max-w-[min(40rem,calc(100vw_-_1168px))]')
    // <=720px compact — viewport-relative, under the column's narrow padding.
    expect(cls).toContain('compact:max-w-[calc(100vw-4rem)]')
    // one line, capped, ellipsised — never wrap (would grow the centered column).
    expect(cls).toContain('truncate')
  })

  it('the >=1593px cap can only TIGHTEN, never loosen, the 40rem defense cap', async () => {
    const cls = (await greetingP('Christopher')).className
    // `min(40rem, calc(...))` — 40rem is the CEILING inside the min(), so at
    // every viewport the new term is <= 40rem and can never widen the greeting
    // past the default tier (it reaches exactly 40rem at 100vw=1808px and is
    // tighter below that, down to the 1593 breakpoint).
    expect(cls).toContain('min-[1593px]:max-w-[min(40rem,calc(100vw_-_1168px))]')
    // The 1168px subtrahend is 2*(568+16): the mid-left column's right edge
    // (368+200) plus this file's 16px floor, doubled for centering symmetry —
    // a centered element of width W has left edge (100vw-W)/2, so left >= 584
    // requires W <= 100vw - 1168. Guards the arithmetic against a stray edit.
    expect(cls).toContain('1168px')
  })

  it('does not clip a short DEFAULT greeting: the cap is a max-width, and "Good afternoon." (284.5px) is well under the 1593-tier floor', async () => {
    // No custom name -> a default greeting. The cap tiers are MAX widths only;
    // nothing forces a minimum, and at the 1593 breakpoint the cap resolves to
    // 100vw-1168 = 425px, comfortably above the 284.5px default greeting — so
    // the byte-identical guarantee holds. (The pixel-level no-clip proof is in
    // scripts/preview.mjs; here we only assert no fixed sub-300px cap tier
    // could ever clip it: the sole fixed cap besides 40rem is the 18rem/288px
    // band, which is scoped strictly to 721-898px where the greeting is not.)
    const cls = (await greetingP('')).className
    expect(cls).toContain('max-w-[40rem]')
    // The only sub-40rem FIXED cap is the 721-898 band; it never applies at the
    // widths where the mid-left column exists (>=1593), so it can't clip there.
    expect(cls).toContain('min-[721px]:max-[899px]:max-w-[18rem]')
  })
})
