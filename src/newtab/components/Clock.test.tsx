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

// Lean regression guard for the responsive pass (BINDING: media-query fix for
// the owner's ~1420x437 short-wide window). All four custom variants are
// declared once here, in index.css, and consumed throughout the center
// column / bookmarks / weather widgets — a typo or dropped declaration here
// would silently no-op every `short:`/`xshort:`/`narrow:`/`tight:` utility
// app-wide with no build error (Tailwind just never generates the class),
// so this is worth pinning directly rather than only inferring it from
// components that happen to use the variant.
describe('index.css — responsive custom variants', () => {
  it('declares short (height 451-600px) and xshort (height <=450px) as a non-overlapping pair', () => {
    expect(indexCss).toMatch(
      /@custom-variant short \(@media \(max-height: 600px\) and \(min-height: 451px\)\);/,
    )
    expect(indexCss).toMatch(/@custom-variant xshort \(@media \(max-height: 450px\)\);/)
  })

  // `tight` and `compact` both set `width` on the weather panel, so they are
  // a non-overlapping pair for the same reason `short`/`xshort` are: disjoint
  // ranges settle the conflict outright instead of leaning on generated-CSS
  // source order. `narrow` overlaps both and is allowed to — it sets neither
  // of their properties on that element.
  it('declares tight (width 721-1300px) and compact (width <=720px) as a non-overlapping pair', () => {
    expect(indexCss).toMatch(
      /@custom-variant tight \(@media \(max-width: 1300px\) and \(min-width: 721px\)\);/,
    )
    expect(indexCss).toMatch(/@custom-variant compact \(@media \(max-width: 720px\)\);/)
  })

  it('declares narrow (width <=1024px)', () => {
    expect(indexCss).toMatch(/@custom-variant narrow \(@media \(max-width: 1024px\)\);/)
  })

  // The bar's horizontal metrics are custom properties stepped by width
  // media queries, NOT variant-prefixed utilities — see index.css. The
  // step order is load-bearing (narrowest last wins), and the compact step
  // is what collapses the chip to a circle, so both the tokens and their
  // narrowest-last ordering are asserted here rather than trusted.
  it('steps the bookmarks bar\'s horizontal tokens narrowest-last, ending at zero chip padding', () => {
    expect(indexCss).toMatch(/--bookmarks-chip-px: 0\.625rem;/)
    expect(indexCss).toMatch(/--bookmarks-gap: 0\.375rem;/)
    const narrowStep = indexCss.indexOf('@media (max-width: 1024px)')
    const compactStep = indexCss.indexOf('@media (max-width: 720px)')
    expect(narrowStep).toBeGreaterThan(-1)
    expect(compactStep).toBeGreaterThan(narrowStep)
    expect(indexCss.slice(compactStep)).toMatch(/--bookmarks-chip-px: 0;/)
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

// Regression guard for the clock's fluid type scale (BINDING: media-query
// fix — the owner's ~1420x437 short-wide window rendered a ~160px-tall
// clock, via a WIDTH-only clamp(), that collided with the greeting below
// it). The scale must include a height term so it degrades continuously as
// the window gets shorter — jsdom can't compute clamp()/min() against a real
// viewport, so this asserts the className carries the formula itself rather
// than a resolved pixel value; the real cross-size proof is the preview
// harness's viewport matrix + overlap assertion (scripts/preview.mjs).
describe('Clock — height-aware fluid scale', () => {
  it('carries a min(vw,vh) term in its clamp(), not width alone', async () => {
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
    expect(time?.className).toContain('clamp(3rem,min(12vw,20vh),10rem)')
  })
})
