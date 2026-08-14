// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import Background from './Background'
import { listUploads } from '../../lib/idb'
import { createStorage, type AuroraStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import { fetchApod } from '../../services/apod'
import type { ApodPhoto, PhotoPrefs } from '../../lib/storage/schema'

const localDay = vi.hoisted(() => ({
  sample: { key: '2026-07-26', timeZone: 'America/New_York', now: new Date('2026-07-26T12:00:00Z') },
}))

vi.mock('../../lib/hooks/useLocalDay', () => ({
  useLocalDay: () => localDay.sample,
  readLocalDay: () => localDay.sample,
}))

// Only 'upload' mode touches IndexedDB; mock the whole module so the two
// upload-mode cases below don't need real IndexedDB (unavailable in jsdom).
vi.mock('../../lib/idb', () => ({ listUploads: vi.fn() }))

// Task 96: Background now reads apodCache (useStoredKey) and fetches through
// fetchApod, so every render below needs a StorageProvider ancestor (bare
// useStorage() throws without one) — this mocks ONLY the network call, same
// "mock the fetch, keep storage real (memoryDriver)" split useWeather's own
// tests use for openMeteoProvider.
vi.mock('../../services/apod', () => ({ fetchApod: vi.fn() }))

/** The LQIP underlay Background paints beneath the photo. */
function lqipLayer(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-lqip]')
}
/** The url(...) inside the underlay's background-image, or null. */
function lqipSource(container: HTMLElement): string | null {
  const raw = lqipLayer(container)?.style.backgroundImage
  return raw ? (raw.match(/url\(["']?(.*?)["']?\)/)?.[1] ?? null) : null
}

/** Renders Background wrapped in a StorageProvider (required now that it
 *  reads apodCache off context) backed by a fresh in-memory driver, seeded
 *  with whatever `seed` supplies (e.g. `{ apodCache: {...} }`) — memoryDriver
 *  itself needs no `.init()` call; storage.get() falls back to defaults()
 *  for any key absent from the seed, same as production's first-ever run.
 *  Always flushes once after mount (`await act(async () => {})`) so
 *  useStoredKey's own async `storage.get('apodCache')` round trip — and any
 *  fetch effect it unblocks — has settled before the caller asserts
 *  anything, the same convention WeatherWidget.test.tsx's renderWidget uses
 *  for its own storage-backed hooks. */
async function renderBg(
  prefs: PhotoPrefs,
  onPrefsChange: (next: PhotoPrefs) => void = vi.fn(),
  seed: Record<string, unknown> = {},
) {
  const storage: AuroraStorage = createStorage(memoryDriver(seed))
  const view = render(
    <StorageProvider storage={storage}>
      <Background prefs={prefs} onPrefsChange={onPrefsChange} />
    </StorageProvider>,
  )
  await act(async () => {})
  return {
    storage,
    container: view.container,
    unmount: view.unmount,
    // Re-wraps with the SAME storage instance — RTL's rerender replaces the
    // whole tree from the root passed to render(), so the wrapper has to be
    // present again, not just the inner Background.
    rerender: async (
      nextPrefs: PhotoPrefs,
      nextOnPrefsChange: (next: PhotoPrefs) => void = onPrefsChange,
    ) => {
      view.rerender(
        <StorageProvider storage={storage}>
          <Background prefs={nextPrefs} onPrefsChange={nextOnPrefsChange} />
        </StorageProvider>,
      )
      await act(async () => {})
    },
  }
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
    localDay.sample = {
      key: '2026-07-26',
      timeZone: 'America/New_York',
      now: new Date('2026-07-26T12:00:00Z'),
    }
    vi.mocked(listUploads).mockReset()
    vi.mocked(listUploads).mockResolvedValue([])
    vi.mocked(fetchApod).mockReset()
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

  it('gradient mode renders no photo and never calls onPrefsChange', async () => {
    const onPrefsChange = vi.fn()
    // lastRotated is deliberately STALE: without the mode gate, rotation logic
    // would fire onPrefsChange here. This proves gradient mode suppresses it.
    const prefs: PhotoPrefs = { mode: 'gradient', index: 0, lastRotated: '2020-01-01' }
    const { container } = await renderBg(prefs, onPrefsChange)

    expect(container.querySelector('img')).toBeNull()
    expect(onPrefsChange).not.toHaveBeenCalled()
  })

  it('auto mode with a stale lastRotated calls onPrefsChange exactly once', async () => {
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2020-01-01' }
    await renderBg(prefs, onPrefsChange)

    expect(onPrefsChange).toHaveBeenCalledTimes(1)
  })

  it('upload mode with a populated gallery shows the current photo and the refresh control', async () => {
    vi.mocked(listUploads).mockResolvedValue([
      { key: 'photo:a', blob: new Blob(['a'], { type: 'image/png' }) },
      { key: 'photo:b', blob: new Blob(['b'], { type: 'image/png' }) },
    ])
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
    const { container, unmount } = await renderBg(prefs, onPrefsChange)

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
    const { container } = await renderBg(prefs, onPrefsChange)

    expect(container.querySelector('img')?.getAttribute('src')).toContain('/photos/')
  })

  it('re-picks the tier on a debounced resize instead of staying static for the session', async () => {
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
    const { container } = await renderBg(prefs, onPrefsChange)
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

  it('does not re-render when a resize settles back on the same tier', async () => {
    const onPrefsChange = vi.fn()
    const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
    const { container } = await renderBg(prefs, onPrefsChange)
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
    it('paints the bundled photo’s inline placeholder beneath the img', async () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container } = await renderBg(prefs)

      // Inline data URI, not a path: needing a load is the one thing a
      // placeholder for a decode gap cannot afford.
      expect(lqipSource(container)).toMatch(/^data:image\//)
    })

    it('pairs the placeholder with the photo actually being shown', async () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container } = await renderBg(prefs)

      const photoId = lqipLayer(container)?.dataset.photo
      expect(photoId).toBeTruthy()
      expect(container.querySelector('img')?.getAttribute('src')).toContain(photoId)
    })

    it('swaps the placeholder in the same render as the photo it sits under', async () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container, rerender } = await renderBg(prefs)
      const firstLqip = lqipSource(container)
      const firstPhoto = lqipLayer(container)?.dataset.photo

      await rerender({ ...prefs, index: 1 })

      // One DOM read, no awaits: a placeholder resolved through any extra
      // async hop would still be showing the previous photo right here.
      expect(lqipSource(container)).not.toBe(firstLqip)
      expect(lqipLayer(container)?.dataset.photo).not.toBe(firstPhoto)
      expect(container.querySelector('img')?.getAttribute('src')).toContain(
        lqipLayer(container)?.dataset.photo,
      )
    })

    it('hides the placeholder from assistive tech and blurs it', async () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container } = await renderBg(prefs)

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
    it('overscales far enough that the blur never samples past its own edge', async () => {
      const prefs: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      const { container } = await renderBg(prefs)

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

    it('renders no placeholder in gradient mode — the gradient is the no-photo fallback', async () => {
      const prefs: PhotoPrefs = { mode: 'gradient', index: 0, lastRotated: '2026-07-26' }
      const { container } = await renderBg(prefs)

      expect(lqipLayer(container)).toBeNull()
    })

    it('paints an upload’s stored thumbnail beneath it', async () => {
      const blob = new Blob(['a'], { type: 'image/png' })
      const thumb = new Blob(['a-thumb'], { type: 'image/webp' })
      vi.mocked(listUploads).mockResolvedValue([{ key: 'photo:a', blob, thumb }])
      const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
      const { container, unmount } = await renderBg(prefs)

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
      const { container, rerender, unmount } = await renderBg(prefs)
      expect(lqipSource(container)).toBe(objectUrls.get(thumbA))

      await rerender({ ...prefs, index: 1 })

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
      const { container, unmount } = await renderBg(prefs)

      expect(container.querySelector('img')?.getAttribute('src')).toBe(objectUrls.get(blob))
      expect(lqipLayer(container)).toBeNull()
      unmount()
    })

    it('releases the thumbnail object URL along with the photo’s on unmount', async () => {
      const blob = new Blob(['a'], { type: 'image/png' })
      const thumb = new Blob(['a-thumb'], { type: 'image/webp' })
      vi.mocked(listUploads).mockResolvedValue([{ key: 'photo:a', blob, thumb }])
      const prefs: PhotoPrefs = { mode: 'upload', index: 0, lastRotated: '2026-07-26' }
      const { unmount } = await renderBg(prefs)

      unmount()

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrls.get(blob))
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrls.get(thumb))
    })
  })

  // --- APOD (Task 96) ---------------------------------------------------
  // NASA's Astronomy Picture of the Day — the fourth source. apod.ts
  // (Task 95) owns the fetch/validation contract; this component owns the
  // cache read, the once-a-day fetch trigger, and the render (same photo
  // fade path everything else uses, no LQIP underlay, a credit caption
  // where the refresh button sits for auto/upload).

  describe('APOD mode', () => {
    const APOD_PHOTO: ApodPhoto = {
      url: 'https://apod.nasa.gov/apod/image/2607/nebula.jpg',
      title: 'A Distant Nebula',
      copyright: 'Jane Astro',
    }

    it('a fresh today cache renders the photo through the same fade path, with no LQIP underlay, no refresh control, and a credit caption', async () => {
      const prefs: PhotoPrefs = { mode: 'apod', index: 0, lastRotated: '' }
      const { container } = await renderBg(prefs, vi.fn(), {
        apodCache: { date: '2026-07-26', photo: APOD_PHOTO },
      })

      const img = container.querySelector('img')
      expect(img?.getAttribute('src')).toBe(APOD_PHOTO.url)
      // Same fade path as every other mode: opacity-0 -> opacity-100 on load,
      // keyed on src (Background.tsx's <img key={src}>).
      expect(img?.className).toContain('opacity-0')
      expect(img?.className).toContain('transition-opacity')

      // Gradient-gap underlay is absent for apod — cited in Background.tsx's
      // own comment on the `lqip` derivation: NASA's API returns no low-res
      // placeholder to paint cheaply, unlike bundled/upload photos.
      expect(lqipLayer(container)).toBeNull()

      // Refresh and the caption never co-render — this is apod, so no button.
      expect(screen.queryByRole('button', { name: 'New background photo' })).toBeNull()

      const caption = screen.getByText('A Distant Nebula © Jane Astro · NASA APOD')
      expect(caption.tagName).toBe('P')
      expect(caption.className).toContain('text-photo')
      expect(caption.className).toContain('text-xs')
      expect(caption.className).toContain('text-canvas-fg-muted')
      // Same bottom-left CORNER the refresh button occupies in auto/upload
      // mode (left-4), but its own row above the Notes pill's bottom-4 row
      // (final-review fix wave, Finding 1) — bottom-16, not bottom-4, is
      // what keeps the caption clear of the Notes pill's default position;
      // see Background.tsx's own comment on this element for the full
      // geometry reasoning.
      expect(caption.className).toContain('bottom-16')
      expect(caption.className).toContain('left-4')

      expect(fetchApod).not.toHaveBeenCalled() // today's cache is already fresh
    })

    it('omits the © segment when the cached photo carries no copyright', async () => {
      const photo: ApodPhoto = {
        url: 'https://apod.nasa.gov/apod/image/2607/galaxy.jpg',
        title: 'A Galaxy',
      }
      const prefs: PhotoPrefs = { mode: 'apod', index: 0, lastRotated: '' }
      await renderBg(prefs, vi.fn(), { apodCache: { date: '2026-07-26', photo } })

      expect(screen.getByText('A Galaxy · NASA APOD')).toBeTruthy()
      expect(screen.queryByText(/©/)).toBeNull()
    })

    it('a null-photo cache already attempted today cascades to the curated bundled set — no broken background, no refetch', async () => {
      const prefs: PhotoPrefs = { mode: 'apod', index: 0, lastRotated: '' }
      const { container } = await renderBg(prefs, vi.fn(), {
        apodCache: { date: '2026-07-26', photo: null },
      })

      expect(container.querySelector('img')?.getAttribute('src')).toContain('/photos/')
      expect(screen.queryByText(/NASA APOD/)).toBeNull()
      expect(fetchApod).not.toHaveBeenCalled() // same-day failure is NOT retried
    })

    it('a stale cache fires exactly one fetch, writes the success shape, and does not refetch on a rerender', async () => {
      vi.mocked(fetchApod).mockResolvedValue(APOD_PHOTO)
      const prefs: PhotoPrefs = { mode: 'apod', index: 0, lastRotated: '' }
      const { storage, rerender, container } = await renderBg(prefs, vi.fn(), {
        apodCache: { date: '2020-01-01', photo: APOD_PHOTO },
      })

      expect(fetchApod).toHaveBeenCalledTimes(1)
      expect(await storage.get('apodCache')).toEqual({ date: '2026-07-26', photo: APOD_PHOTO })
      expect(container.querySelector('img')?.getAttribute('src')).toBe(APOD_PHOTO.url)

      await rerender(prefs)
      expect(fetchApod).toHaveBeenCalledTimes(1)
    })

    it('an absent cache (never fetched before) fires exactly one fetch', async () => {
      vi.mocked(fetchApod).mockResolvedValue(APOD_PHOTO)
      const prefs: PhotoPrefs = { mode: 'apod', index: 0, lastRotated: '' }
      const { storage } = await renderBg(prefs, vi.fn(), {})

      expect(fetchApod).toHaveBeenCalledTimes(1)
      expect(await storage.get('apodCache')).toEqual({ date: '2026-07-26', photo: APOD_PHOTO })
    })

    it('a failed fetch writes photo: null for today and the render cascades to the curated set', async () => {
      vi.mocked(fetchApod).mockResolvedValue(null)
      const prefs: PhotoPrefs = { mode: 'apod', index: 0, lastRotated: '' }
      const { storage, container } = await renderBg(prefs, vi.fn(), {})

      expect(fetchApod).toHaveBeenCalledTimes(1)
      expect(await storage.get('apodCache')).toEqual({ date: '2026-07-26', photo: null })
      expect(container.querySelector('img')?.getAttribute('src')).toContain('/photos/')
    })

    it('rolls APOD to the next local day without reloading the tab', async () => {
      vi.mocked(fetchApod).mockResolvedValue(APOD_PHOTO)
      const prefs: PhotoPrefs = { mode: 'apod', index: 0, lastRotated: '' }
      const { storage, rerender } = await renderBg(prefs, vi.fn(), {
        apodCache: { date: '2026-07-26', photo: APOD_PHOTO },
      })

      localDay.sample = {
        key: '2026-07-27',
        timeZone: 'America/New_York',
        now: new Date('2026-07-27T04:00:01Z'),
      }
      await rerender(prefs)

      expect(fetchApod).toHaveBeenCalledTimes(1)
      expect(await storage.get('apodCache')).toEqual({ date: '2026-07-27', photo: APOD_PHOTO })
    })

    it('starts the new local-day APOD request while the prior day is pending and rejects the stale completion', async () => {
      let resolveFirst!: (photo: ApodPhoto | null) => void
      let resolveSecond!: (photo: ApodPhoto | null) => void
      vi.mocked(fetchApod)
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
      const prefs: PhotoPrefs = { mode: 'apod', index: 0, lastRotated: '' }
      const { storage, rerender } = await renderBg(prefs, vi.fn(), {})
      expect(fetchApod).toHaveBeenCalledTimes(1)

      localDay.sample = {
        key: '2026-07-27',
        timeZone: 'America/New_York',
        now: new Date('2026-07-27T04:00:01Z'),
      }
      await rerender(prefs)
      expect(fetchApod).toHaveBeenCalledTimes(2)

      const nextPhoto: ApodPhoto = {
        url: 'https://apod.nasa.gov/apod/image/2607/tomorrow.jpg',
        title: 'Tomorrow',
      }
      await act(async () => { resolveSecond(nextPhoto) })
      expect(await storage.get('apodCache')).toEqual({ date: '2026-07-27', photo: nextPhoto })

      await act(async () => { resolveFirst(APOD_PHOTO) })
      expect(await storage.get('apodCache')).toEqual({ date: '2026-07-27', photo: nextPhoto })
    })

    it('non-apod modes never call fetchApod, even with a stale or absent cache', async () => {
      const auto: PhotoPrefs = { mode: 'auto', index: 0, lastRotated: '2026-07-26' }
      await renderBg(auto, vi.fn(), { apodCache: { date: '2020-01-01', photo: APOD_PHOTO } })
      expect(fetchApod).not.toHaveBeenCalled()

      const gradient: PhotoPrefs = { mode: 'gradient', index: 0, lastRotated: '2026-07-26' }
      await renderBg(gradient, vi.fn(), {})
      expect(fetchApod).not.toHaveBeenCalled()
    })
  })
})
