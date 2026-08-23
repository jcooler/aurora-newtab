// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import { defaults } from '../../lib/storage/schema'
import Greeting from './Greeting'

describe('Greeting restoration sampling', () => {
  it('changes daypart immediately when a sleeping tab regains focus', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 26, 11, 59, 0))
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', defaults().settings)
    const { container } = render(<StorageProvider storage={storage}><Greeting /></StorageProvider>)
    await act(async () => {})
    expect(container.querySelector('p')!.textContent).toContain('morning')

    vi.setSystemTime(new Date(2026, 6, 26, 12, 1, 0))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(container.querySelector('p')!.textContent).toContain('afternoon')
    vi.useRealTimers()
  })
})

describe('Greeting presentation surface', () => {
  it('keeps the free Greeting frameless and the stack Greeting framed', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const view = render(
      <StorageProvider storage={storage}>
        <Greeting canvasSize="standard" presentation="free" />
      </StorageProvider>,
    )
    await act(async () => {})
    expect(screen.getByTestId('greeting-face').dataset.tierSurface).toBe('none')

    view.rerender(
      <StorageProvider storage={storage}>
        <Greeting canvasSize="standard" presentation="stack" />
      </StorageProvider>,
    )
    expect(screen.getByRole('region', { name: 'Greeting' }).dataset.tierSurface).toBe('card')
  })
})

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
    expect(p?.getAttribute('data-canvas-type-role')).toBe('greeting')
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
// clipping — run in scripts/preview.mjs's habits floor block. THREE
// non-overlapping tiers must all be present (Task 64 retired a fourth, the
// >=1593px mid-left-column cap — the centred column now bounds the greeting
// directly, see Greeting.tsx), and the default cap is the column bound itself
// (`max-w-full`), not the old 40rem, so the line can never reach the rails.
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

  it('carries all three cap tiers plus truncate, in non-overlapping bands', async () => {
    const cls = (await greetingP('Christopher')).className
    // default cap (all widths) — `max-w-full` bounds the line to the centred
    // column (App.tsx `--center-reserve`), so it can never reach the rails.
    expect(cls).toContain('max-w-full')
    expect(cls).not.toContain('max-w-[40rem]') // the old unbounded 640px cap is gone
    // `min-w-0` is required for the bound to bind: a flex child's default
    // min-width:auto (min-content of the nowrap text) otherwise overrides
    // max-width and the line renders at full natural width.
    expect(cls).toContain('min-w-0')
    // 721-898px dedicated band (the weather-panel neighbor) — 18rem.
    expect(cls).toContain('min-[721px]:max-[899px]:max-w-[18rem]')
    // <=720px compact — viewport-relative, under the column's narrow padding.
    expect(cls).toContain('compact:max-w-[calc(100vw-4rem)]')
    // one line, capped, ellipsised — never wrap (would grow the centered column).
    expect(cls).toContain('truncate')
    // Task 64 retired the >=1593px cap — the centred column bounds the greeting
    // now (App.tsx `max-w-[var(--center-reserve)]`), so no width-specific term.
    expect(cls).not.toContain('min-[1593px]')
    expect(cls).not.toContain('1168px')
  })

  it('the retired >=1593px mid-left-column cap leaves no trace (the centred column bound does its job now)', async () => {
    const cls = (await greetingP('Christopher')).className
    // Task 64 replaced the hand-tuned viewport cap with a structural one: the
    // centred column that holds the greeting is bounded to `--center-reserve`
    // (App.tsx), so the greeting can't reach the flowing rails at any width and
    // needs no width-specific term of its own. Neither the breakpoint nor its
    // 1168px subtrahend may reappear here.
    expect(cls).not.toContain('min-[1593px]')
    expect(cls).not.toContain('1168')
  })

  it('does not clip a short DEFAULT greeting: the cap is a max-width, and "Good afternoon." (284.5px) is well under the centred-column bound', async () => {
    // No custom name -> a default greeting. The cap tiers are MAX widths only;
    // nothing forces a minimum, and the centred column that bounds the greeting
    // (App.tsx, `--center-reserve` = 457px) is comfortably above the 284.5px
    // default greeting — so the byte-identical guarantee holds. (The pixel-level
    // no-clip proof is in scripts/preview.mjs; here we only assert no fixed
    // sub-300px cap tier could ever clip it: the sole fixed cap is the 18rem/
    // 288px band, scoped strictly to 721-898px where the greeting is not.)
    const cls = (await greetingP('')).className
    expect(cls).toContain('max-w-full')
    // The only sub-column FIXED cap is the 721-898 band; it never applies at the
    // widths where the mid-left column exists (>=1593), so it can't clip there.
    expect(cls).toContain('min-[721px]:max-[899px]:max-w-[18rem]')
  })
})
