// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
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

describe('Clock restoration sampling', () => {
  it('refreshes immediately on window focus instead of waiting for its interval', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 26, 9, 5, 0))
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', defaults().settings)
    const { container } = render(<StorageProvider storage={storage}><Clock /></StorageProvider>)
    await act(async () => {})
    const before = container.querySelector('time')!.textContent

    vi.setSystemTime(new Date(2026, 6, 26, 10, 6, 0))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(container.querySelector('time')!.textContent).not.toBe(before)
    vi.useRealTimers()
  })
})

describe('Clock large-display detail', () => {
  it('publishes a secondary long-date detail from the same clock sample', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 16, 11, 33))
    const storage = createStorage(memoryDriver())
    await storage.init()
    const { container } = render(<StorageProvider storage={storage}><Clock /></StorageProvider>)
    await act(async () => {})

    const detail = container.querySelector('[data-clock-date]')
    expect(detail?.textContent).toBe('Sunday, August 16')
    expect(detail?.hasAttribute('aria-hidden')).toBe(false)
    expect(container.querySelector('time')?.getAttribute('data-canvas-type-role')).toBe('clock')
    expect(detail?.getAttribute('data-canvas-type-role')).toBe('date')
    vi.useRealTimers()
  })
})

describe('index.css - Canvas type roles', () => {
  it('defines ordinary desktop floors and bounded Large/4K targets', () => {
    expect(indexCss).toMatch(/--canvas-type-date: clamp\(16px,[^;]+18px\);/)
    expect(indexCss).toMatch(/--canvas-type-greeting: clamp\(32px,[^;]+40px\);/)
    expect(indexCss).toMatch(/--canvas-type-support: clamp\(16px,[^;]+18px\);/)
    expect(indexCss).toMatch(/--canvas-type-quote: clamp\(15px,[^;]+18px\);/)
    expect(indexCss).toMatch(/--canvas-type-attribution: 13px;/)
    expect(indexCss).toMatch(/--canvas-type-body: clamp\(14px,[^;]+16px\);/)
    expect(indexCss).toMatch(/--canvas-type-metadata: 12px;/)
    expect(indexCss).toMatch(/\[data-canvas-text-scale="large"\][^{]*\{[\s\S]*?--clock-font: clamp\(72px,[^;]+216px\);/)
    expect(indexCss).toMatch(/\[data-canvas-text-scale="large"\][^{]*\{[\s\S]*?--canvas-type-date: clamp\(20px,[^;]+22px\);/)
    expect(indexCss).toMatch(/\[data-canvas-text-scale="large"\][^{]*\{[\s\S]*?--canvas-type-greeting: clamp\(48px,[^;]+56px\);/)
    expect(indexCss).toMatch(/\[data-canvas-text-scale="large"\][^{]*\{[\s\S]*?--canvas-type-support: clamp\(18px,[^;]+20px\);/)
    expect(indexCss).toMatch(/\[data-canvas-text-scale="large"\][^{]*\{[\s\S]*?--canvas-type-attribution: 16px;/)
    expect(indexCss).toMatch(/\[data-canvas-type-role="clock"\][^{]*\{[\s\S]*?font-size: var\(--canvas-type-clock\);/)
    expect(indexCss).toMatch(/\[data-canvas-type-role="date"\][^{]*\{[^}]*color: var\(--canvas-fg\);/)
    expect(indexCss).toMatch(/\[data-canvas-type-role="support"\][^{]*\{[^}]*color: var\(--canvas-fg\);/)
  })

  it('shows the useful date for Standard and Full Canvas clock sizes', () => {
    expect(indexCss).toMatch(/\.canvas-item\[data-block-id="clock"\]:not\(\[data-canvas-size="compact"\]\)[^{]*\[data-clock-date\][^{]*\{[\s\S]*?display: block;/)
  })

  it('keeps only the viewport-height compact cap — the container-relative glyph cap died with the imposed boxes', () => {
    // A content-tight wrapper sizes to the clock, so a container-relative
    // (cqi) cap would be circular; the retirement scan in
    // adaptiveStageLegibility.test.ts pins that no cqi term survives. Full
    // and standard render at --clock-font; compact keeps the real safety
    // cap, which is vertical.
    expect(indexCss).not.toContain('cqi')
    expect(indexCss).toMatch(/\.canvas-item\[data-canvas-size="compact"\]:not\(\[data-canvas-mode="docked"\]\)\[data-block-id="clock"\] time\s*\{[^}]*font-size:\s*min\(var\(--clock-font\),\s*17vh\);/)
  })
})

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
    const compactStep = indexCss.indexOf('@media (max-width: 720px)', narrowStep)
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
    // Task 60 fix round: the clock paints with the FIXED canvas ink, not the
    // panelColor-adaptive --fg, so a light panel pick can't darken it over the
    // photo. (Panels keep text-fg and adapt — src/theme/index.test.ts.)
    expect(time?.classList.contains('text-canvas-fg')).toBe(true)
    expect(time?.classList.contains('text-fg')).toBe(false)
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
//
// The formula itself moved to index.css's `--clock-font` custom property
// (the short-wide clock-vs-weather-chip fix): the collapsed weather chip
// needs the SAME expression, to compute the clock's own rendered half-width
// and stay clear of it at xshort sizes (`--clock-half-w`, WeatherWidget.tsx),
// and a second hand-copied clamp() there would be a silent-drift hazard this
// codebase avoids elsewhere too (see index.css's --top-band-gap "keep the
// two in sync" comment for the same tradeoff made explicit). So this is now
// TWO assertions instead of one — the element wires up the property (via the
// `length:` type hint, load-bearing: a bare `text-[var(--clock-font)]`
// reads as an ambiguous arbitrary value and Tailwind sniffs it as `color`,
// not `font-size` — found by this fix's own real-Chromium probe, a ~12px
// clock with a silently-dropped invalid `color` declaration) AND index.css
// really defines it with the height term intact, the same "assert the
// utility is actually DEFINED, not just referenced" discipline the
// `.text-photo` describe block above this one already uses.
describe('Clock — height-aware fluid scale', () => {
  it('wires the clock to --clock-font via an explicit length type hint', async () => {
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
    expect(time?.className).toContain('text-[length:var(--clock-font)]')
  })

  it('defines --clock-font with a min(vw,vh) term in its clamp(), not width alone', () => {
    expect(indexCss).toMatch(/--clock-font: clamp\(3rem, min\(12vw, 20vh\), 10rem\);/)
  })
})

// Regression guard for the short-wide fix itself: --clock-half-w is what
// WeatherWidget.tsx's collapsed chip subtracts to find the room actually
// left beside the clock's own right edge (see that file's own comment for
// the full derivation). Pinned here, next to --clock-font, so the two can
// never drift apart silently — a changed ratio or a re-based --clock-font
// would only ever show up as a real-Chromium collision otherwise.
describe('index.css — --clock-half-w (the short-wide fix)', () => {
  it('derives from --clock-font at the SAME ratio --center-reserve already trusts (425/160 = 2.65625, halved)', () => {
    expect(indexCss).toMatch(/--clock-half-w: calc\(1\.328125 \* var\(--clock-font\)\);/)
  })
})
