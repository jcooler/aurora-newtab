// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import { defaults } from '../../lib/storage/schema'
import Clock from './Clock'
// `?raw` (see themes.test.ts for the same idiom) — index.css is never
// actually loaded/cascaded by vitest, so this asserts the utility is really
// DEFINED, not just referenced as a className that happens to match nothing.
import indexCss from '../index.css?raw'

describe('index.css — .text-photo utility', () => {
  it('is defined via @utility, with both the tight contact shadow and the soft ambient one', () => {
    expect(indexCss).toMatch(/@utility text-photo\s*\{/)
    expect(indexCss).toMatch(/text-shadow:/)
  })
})

// Lean regression guard for the text-shadow legibility system (visual-quality
// overhaul): the clock sits directly on the photo (no panel/pill surface of
// its own), so it MUST carry the .text-photo utility or it silently loses
// legibility the moment a future edit reshuffles its className string. Not a
// pixel/contrast test (jsdom has no layout engine to verify the shadow
// actually renders) — that's what the preview capture + self-critique loop
// is for; this only guards the utility class staying wired to the element.
describe('Clock — text-photo legibility utility', () => {
  it('applies text-photo (the shared photo-legibility shadow) to the clock element', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', defaults().settings)
    const { container } = render(
      <StorageProvider storage={storage}>
        <Clock />
      </StorageProvider>,
    )
    await act(async () => {})

    const time = container.querySelector('time')
    expect(time).toBeTruthy()
    expect(time?.classList.contains('text-photo')).toBe(true)
  })
})
