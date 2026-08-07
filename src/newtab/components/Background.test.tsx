// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import Background from './Background'
import { listUploads } from '../../lib/idb'
import type { PhotoPrefs } from '../../lib/storage/schema'

// Only 'upload' mode touches IndexedDB; mock the whole module so the two
// upload-mode cases below don't need real IndexedDB (unavailable in jsdom).
vi.mock('../../lib/idb', () => ({ listUploads: vi.fn() }))

/** The LQIP underlay Background paints beneath the photo. */
function lqipLayer(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-lqip]')
}
/** The url(...) inside the underlay's background-image, or null. */
function lqipSource(container: HTMLElement): string | null {
  const raw = lqipLayer(container)?.style.backgroundImage
  return raw ? (raw.match(/url\(["']?(.*?)["']?\)/)?.[1] ?? null) : null
}

describe('Background', () => {
  let originalCreate: typeof URL.createObjectURL
  let originalRevoke: typeof URL.revokeObjectURL
  // blob -> the object URL handed out for it, so the upload tests can say
  // WHICH photo a rendered blob: URL actually points at.
  let objectUrls: Map<Blob, string>

  beforeEach(() => {
    // Pin "today" so lastRotated comparisons are deterministic regardless of
    // the wall-clock date the suite happens to run on.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-26T12:00:00'))
    vi.mocked(listUploads).mockReset()
    vi.mocked(listUploads).mockResolvedValue([])
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all
    // (spyOn requires the method to already exist), so they're stubbed
    // directly rather than spied-on.
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    // A DISTINCT url per blob (v1 handed the same string to everything):
    // the LQIP tests have to be able to tell "the thumb of photo B" from
    // "the thumb of photo A", which a constant stub makes impossible.
    objectUrls = new Map()
    let n = 0
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:mock-${n++}`
      objectUrls.set(blob, url)
      return url
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
  })

  afterEach(() => {
    vi.useRealTimers()
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('gradient mode renders no photo and never calls onPrefsChange', () => {
    const onPrefsChange = vi.fn()
    // lastRotated is deliberately STALE: without the mode gate, rotation logic
    // would fire onPrefsChange here. This proves gradient mode suppresses it.
    const prefs: PhotoPrefs = { mode: 'gradient', index: 0, lastRotated: '2020-01-01' }
    const { container } = render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)

    expect(container.querySelector('img')).toBeNull()
    expect(onPrefsChange).not.toHaveBeenCalled()
  })

  it('auto mode with a stale lastRotated calls onPrefsChange exactly once', () => {
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2020-01-01' }
    render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)

    expect(onPrefsChange).toHaveBeenCalledTimes(1)
  })

  it('upload mode with a populated gallery shows the current photo and the refresh control', async () => {
    vi.mocked(listUploads).mockResolvedValue([
      { key: 'photo:a', blob: new Blob(['a'], { type: 'image/png' }) },
      { key: 'photo:b', blob: new Blob(['b'], { type: 'image/png' }) },
    ])
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
    const { container, unmount } = render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)
    // Flush the listUploads() promise + the resulting state update; fake
    // timers only affect timer-based APIs, but testing-library's own
    // waitFor() polls via setTimeout, so it never wakes up under them —
    // act(async) drains microtasks directly instead.
    await act(async () => {})

    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/^blob:mock-/)
    expect(screen.getByRole('button', { name: 'New background photo' })).toBeTruthy()

    // Unmount now, while URL.revokeObjectURL is still the stub installed
    // above: this component held a live object URL, so the unmount effect
    // calls revokeObjectURL, and this file's afterEach restores the
    // (jsdom-absent) original before the suite's automatic post-test cleanup
    // would otherwise unmount it.
    unmount()
  })

  it('upload mode with an empty gallery falls back to the bundled photo set', async () => {
    vi.mocked(listUploads).mockResolvedValue([])
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
    const { container } = render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)
    await act(async () => {})

    expect(container.querySelector('img')?.getAttribute('src')).toContain('/photos/')
  })

  it('re-picks the tier on a debounced resize instead of staying static for the session', () => {
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
    const { container } = render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)
    const initialSrc = container.querySelector('img')?.getAttribute('src')
    expect(initialSrc).toBeTruthy()

    // Bump devicePixelRatio well past what it would take to cross the tier
    // boundary at any plausible jsdom default screen size, then fire resize.
    const originalDpr = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    // Still debounced — no re-render/src change yet.
    expect(container.querySelector('img')?.getAttribute('src')).toBe(initialSrc)

    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(container.querySelector('img')?.getAttribute('src')).not.toBe(initialSrc)

    Object.defineProperty(window, 'devicePixelRatio', { value: originalDpr, configurable: true })
  })

  it('does not re-render when a resize settles back on the same tier', () => {
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
    const { container } = render(<Background prefs={prefs} onPrefsChange={onPrefsChange} />)
    const initialSrc = container.querySelector('img')?.getAttribute('src')

    act(() => {
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(250)
    })

    // Same devicePixelRatio/screen size as mount, so the recomputed tier is
    // identical — React's setState bail-out means the <img> (keyed on src)
    // never remounts.
    expect(container.querySelector('img')?.getAttribute('src')).toBe(initialSrc)
  })

  // --- LQIP underlay (2026-08-07 flicker mitigation) ------------------------
  // Chrome purges the decoded image memory of background tabs under pressure;
  // on re-display the 4K AVIF re-decodes and whatever sits behind the <img>
  // is what's on screen for that gap. These lock in "a blurred copy of the
  // SAME photo" rather than the gradient.

  describe('LQIP underlay', () => {
    it('paints the bundled photo’s inline placeholder beneath the img', () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container } = render(<Background prefs={prefs} onPrefsChange={vi.fn()} />)

      // Inline data URI, not a path: needing a load is the one thing a
      // placeholder for a decode gap cannot afford.
      expect(lqipSource(container)).toMatch(/^data:image\//)
    })

    it('pairs the placeholder with the photo actually being shown', () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container } = render(<Background prefs={prefs} onPrefsChange={vi.fn()} />)

      const photoId = lqipLayer(container)?.dataset.photo
      expect(photoId).toBeTruthy()
      expect(container.querySelector('img')?.getAttribute('src')).toContain(photoId)
    })

    it('swaps the placeholder in the same render as the photo it sits under', () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container, rerender } = render(
        <Background prefs={prefs} onPrefsChange={vi.fn()} />,
      )
      const firstLqip = lqipSource(container)
      const firstPhoto = lqipLayer(container)?.dataset.photo

      rerender(<Background prefs={{ ...prefs, index: 1 }} onPrefsChange={vi.fn()} />)

      // One DOM read, no awaits: a placeholder resolved through any extra
      // async hop would still be showing the previous photo right here.
      expect(lqipSource(container)).not.toBe(firstLqip)
      expect(lqipLayer(container)?.dataset.photo).not.toBe(firstPhoto)
      expect(container.querySelector('img')?.getAttribute('src')).toContain(
        lqipLayer(container)?.dataset.photo,
      )
    })

    it('hides the placeholder from assistive tech and blurs it', () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container } = render(<Background prefs={prefs} onPrefsChange={vi.fn()} />)

      const layer = lqipLayer(container)!
      expect(layer.getAttribute('aria-hidden')).toBe('true')
      // Blur plus overscale: the scale hides the transparent edge the blur
      // would otherwise sample from.
      expect(layer.className).toMatch(/blur/)
      expect(layer.className).toMatch(/scale-1\d\d/)
    })

    // Deferred minor from the LQIP review, closed by the narrow-window pass.
    // The overscale has to be big enough to cover the blur RADIUS, and the
    // margin it buys is a PERCENTAGE of the layer (which is the viewport)
    // while the radius is a fixed px: `scale-110` puts (1.10 - 1) / 2 = 5%
    // of each axis outside the frame, i.e. 25px at a 500px-wide window
    // against `blur-2xl`'s 40px radius — so the blur sampled transparency
    // and the underlay faded off at the edges on exactly the narrow windows
    // this pass exists for. `scale-125` puts 12.5% outside, clearing 40px
    // on any axis down to 320px. Asserted as the arithmetic rather than as
    // a magic class so a future blur change has to re-do the sum;
    // scripts/preview.mjs measures the real rect against the real computed
    // filter at 500x900.
    it('overscales far enough that the blur never samples past its own edge', () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container } = render(<Background prefs={prefs} onPrefsChange={vi.fn()} />)

      const className = lqipLayer(container)!.className
      const blurPx = { 'blur-lg': 16, 'blur-xl': 24, 'blur-2xl': 40, 'blur-3xl': 64 }
      const scalePct = { 'scale-110': 10, 'scale-125': 25, 'scale-150': 50 }
      const blur = Object.entries(blurPx).find(([c]) => className.includes(c))
      const scale = Object.entries(scalePct).find(([c]) => className.includes(c))
      expect(blur).toBeTruthy()
      expect(scale).toBeTruthy()
      const NARROWEST_SUPPORTED_AXIS = 320
      expect((scale![1] / 2 / 100) * NARROWEST_SUPPORTED_AXIS).toBeGreaterThanOrEqual(blur![1])
    })

    it('renders no placeholder in gradient mode — the gradient is the no-photo fallback', () => {
      const prefs: PhotoPrefs = { mode: 'gradient', index: 0, lastRotated: '2026-07-26' }
      const { container } = render(<Background prefs={prefs} onPrefsChange={vi.fn()} />)

      expect(lqipLayer(container)).toBeNull()
    })

    it('paints an upload’s stored thumbnail beneath it', async () => {
      const blob = new Blob(['a'], { type: 'image/png' })
      const thumb = new Blob(['a-thumb'], { type: 'image/webp' })
      vi.mocked(listUploads).mockResolvedValue([{ key: 'photo:a', blob, thumb }])
      const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
      const { container, unmount } = render(
        <Background prefs={prefs} onPrefsChange={vi.fn()} />,
      )
      await act(async () => {})

      expect(lqipSource(container)).toBe(objectUrls.get(thumb))
      expect(container.querySelector('img')?.getAttribute('src')).toBe(objectUrls.get(blob))
      unmount()
    })

    it('swaps an upload’s thumbnail in the same render as the upload’s photo', async () => {
      const blobA = new Blob(['a'], { type: 'image/png' })
      const thumbA = new Blob(['a-thumb'], { type: 'image/webp' })
      const blobB = new Blob(['b'], { type: 'image/png' })
      const thumbB = new Blob(['b-thumb'], { type: 'image/webp' })
      vi.mocked(listUploads).mockResolvedValue([
        { key: 'photo:a', blob: blobA, thumb: thumbA },
        { key: 'photo:b', blob: blobB, thumb: thumbB },
      ])
      const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
      const { container, rerender, unmount } = render(
        <Background prefs={prefs} onPrefsChange={vi.fn()} />,
      )
      await act(async () => {})
      expect(lqipSource(container)).toBe(objectUrls.get(thumbA))

      act(() => {
        rerender(<Background prefs={{ ...prefs, index: 1 }} onPrefsChange={vi.fn()} />)
      })

      // Both must be photo B's, read in the same tick — this is the
      // stale-placeholder-under-a-new-photo case.
      expect(container.querySelector('img')?.getAttribute('src')).toBe(objectUrls.get(blobB))
      expect(lqipSource(container)).toBe(objectUrls.get(thumbB))
      unmount()
    })

    it('renders no placeholder for an upload stored before thumbnails existed', async () => {
      const blob = new Blob(['a'], { type: 'image/png' })
      vi.mocked(listUploads).mockResolvedValue([{ key: 'photo:a', blob }])
      const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
      const { container, unmount } = render(
        <Background prefs={prefs} onPrefsChange={vi.fn()} />,
      )
      await act(async () => {})

      expect(container.querySelector('img')?.getAttribute('src')).toBe(objectUrls.get(blob))
      expect(lqipLayer(container)).toBeNull()
      unmount()
    })

    it('releases the thumbnail object URL along with the photo’s on unmount', async () => {
      const blob = new Blob(['a'], { type: 'image/png' })
      const thumb = new Blob(['a-thumb'], { type: 'image/webp' })
      vi.mocked(listUploads).mockResolvedValue([{ key: 'photo:a', blob, thumb }])
      const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
      const { unmount } = render(<Background prefs={prefs} onPrefsChange={vi.fn()} />)
      await act(async () => {})

      unmount()

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrls.get(blob))
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrls.get(thumb))
    })
  })
})
