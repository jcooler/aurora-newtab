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
