import { useEffect, useState } from 'react'
import type { PhotoPrefs } from '../../lib/storage/schema'
import { useUploads } from '../../lib/hooks/useUploads'
import { useStorage } from '../../lib/storage/context'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { fetchApod } from '../../services/apod'
import {
  BUNDLED,
  bundledLqip,
  bundledUrl,
  nextPhoto,
  pickTier,
  resolvePhoto,
  type PhotoTier,
} from '../../services/photos/index'
import { readLocalDay, useLocalDay } from '../../lib/hooks/useLocalDay'

// Module-level APOD ownership survives Background remounts. Identity-based
// dedupe collapses requests only for the same local day and timezone; a new
// day may start while yesterday is still pending. The monotonic generation
// prevents an older promise's finally handler from clearing a newer owner.
interface ApodFetchOwner {
  identity: string
  generation: number
  promise: Promise<void>
}

let apodFetchInFlight: ApodFetchOwner | null = null
let apodFetchGeneration = 0

function localDayIdentity(day: { key: string; timeZone: string }): string {
  return `${day.timeZone}\n${day.key}`
}

// Physical display size drives the tier pick (see pickTier's own doc): the
// larger of screen width/height times devicePixelRatio, falling back to the
// viewport and finally a safe default so this never throws in an
// environment without a real `screen` (jsdom under test).
function physicalMaxDimension(): number {
  const screenMax = Math.max(window.screen?.width || 0, window.screen?.height || 0)
  const viewportMax = Math.max(window.innerWidth || 0, window.innerHeight || 0)
  return screenMax || viewportMax || 1024
}

export default function Background({
  prefs,
  onPrefsChange,
}: {
  prefs: PhotoPrefs
  onPrefsChange: (next: PhotoPrefs) => void
}) {
  // null = not loaded yet (or not in upload mode); [] = loaded and confirmed
  // empty — the distinction matters because only a confirmed-empty gallery
  // should trigger the bundled-set cascade below, not a load still in flight.
  // Depend on mode + the uploadedAt nonce (bumped on every add/remove), not
  // the whole prefs object: rotation-only writes (index/lastRotated, now
  // persisted in upload mode too — see the effect below) must not re-fetch
  // an unchanged gallery on every rotation.
  const uploads = useUploads(prefs.mode === 'upload', prefs.uploadedAt, null)
  // ONE piece of state holding the photo, its placeholder, and the gallery
  // key they both came from — not three. That is what makes "the placeholder
  // swaps in the same render as the photo" true by construction rather than
  // by careful sequencing: there is no render in which the object URL of
  // photo B can be on screen over the thumbnail of photo A, because a single
  // setState publishes both.
  const [uploadPhoto, setUploadPhoto] = useState<{
    key: string
    url: string
    lqip: string | null
  } | null>(null)
  const localDay = useLocalDay()
  const today = localDay.key
  const dayIdentity = localDayIdentity(localDay)

  // apodCache (Task 96): read the same way useWeather.ts reads weatherCache —
  // straight off context, since Background (unlike its settings-side
  // namesake) isn't handed a `storage` prop. `undefined` = not loaded yet
  // (useStoredKey's own contract); `null` = loaded, no cache ever written;
  // an ApodCache object = loaded, a fetch was attempted for `.date`.
  const storage = useStorage()
  const [apodCache] = useStoredKey('apodCache')

  // "Usable" mirrors the upload-with-empty-gallery seam exactly: a photo
  // this component can actually show TODAY, not merely a cache entry that
  // exists. `photo: null` (yesterday's fetch failed, or today's did) is
  // exactly as unusable as no cache at all — both cascade to 'auto' below.
  const apodUsable = apodCache != null && apodCache.date === today && apodCache.photo !== null

  // Empty gallery in upload mode cascades to the bundled set, same as 'auto'
  // — a user who picked "My photo" but hasn't uploaded anything yet should
  // still get a photo background, not drop straight to a bare gradient.
  // 'apod' without a usable today-photo cascades the same way — the exact
  // same seam, just gated on apodUsable instead of an empty gallery.
  const galleryEmpty = uploads !== null && uploads.length === 0
  const effectiveMode =
    prefs.mode === 'upload' && galleryEmpty
      ? 'auto'
      : prefs.mode === 'apod' && !apodUsable
        ? 'auto'
        : prefs.mode

  const count =
    effectiveMode === 'upload'
      ? (uploads?.length ?? 0)
      : effectiveMode === 'auto'
        ? BUNDLED.length
        : 0
  const { index, rotated } = resolvePhoto(prefs, today, count)

  useEffect(() => {
    if (effectiveMode !== 'upload') {
      setUploadPhoto(null)
      return
    }
    const upload = uploads?.[index]
    if (!upload) {
      setUploadPhoto(null)
      return
    }
    const url = URL.createObjectURL(upload.blob)
    // Uploads added before placeholders existed have no thumb yet (idb.ts
    // backfills them in the background); those simply get no underlay, i.e.
    // exactly the pre-2026-08-07 behaviour, rather than a wrong one.
    const lqip = upload.thumb ? URL.createObjectURL(upload.thumb) : null
    setUploadPhoto({ key: upload.key, url, lqip })
    return () => {
      URL.revokeObjectURL(url)
      if (lqip) URL.revokeObjectURL(lqip)
    }
  }, [effectiveMode, uploads, index])

  // The once-per-day APOD fetch (Task 96). Deliberately keyed off `prefs.mode`
  // (the RAW pref), not `effectiveMode` — a `photo: null` cache already
  // cascades effectiveMode to 'auto', and gating the fetch on effectiveMode
  // too would mean a failed day can NEVER be retried the next day, because
  // by the time tomorrow's `today` makes the cache stale again,
  // effectiveMode would already have flipped away from 'apod' on THIS read.
  // Gating on the raw mode keeps "is the user asking for apod" and "do we
  // currently have something usable to show for it" as two separate
  // questions, exactly as apodUsable's own derivation above treats them.
  useEffect(() => {
    if (prefs.mode !== 'apod') return
    if (apodCache === undefined) return // not loaded yet — don't fetch on a guess
    if (apodCache !== null && apodCache.date === today) return // already attempted today
    if (apodFetchInFlight?.identity === dayIdentity) return

    const generation = ++apodFetchGeneration
    const promise = (async () => {
      const photo = await fetchApod()
      await storage.update('apodCache', (current) =>
        // Fresh-read update (the section's own stale-spread law, mirrored
        // here): re-check staleness against the value storage.update hands
        // back, not the `today` closed over above, in case another write
        // already landed today's cache while this fetch was in flight.
        localDayIdentity(readLocalDay()) !== dayIdentity || (current && current.date === today)
          ? current
          : { date: today, photo },
      )
    })().finally(() => {
      if (apodFetchInFlight?.generation === generation) apodFetchInFlight = null
    })
    apodFetchInFlight = { identity: dayIdentity, generation, promise }
  }, [prefs.mode, apodCache, today, dayIdentity, storage])

  useEffect(() => {
    // Gradient never owns index/lastRotated. Auto and upload both do now —
    // including upload cascaded to the bundled set, so a later real upload
    // resumes rotation from a sensible index instead of an untouched one.
    if (effectiveMode !== 'gradient' && rotated) onPrefsChange({ ...prefs, index, lastRotated: today })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per rotation
  }, [rotated, index, today, effectiveMode])

  // Reactive tier pick (review fix): pickTier's inputs — physical display
  // size + devicePixelRatio — used to be read once inline during render, so
  // a window dragged from a 1080p panel to a 4K one (or moved to a
  // higher-DPR display) kept the low tier until some UNRELATED re-render
  // happened to re-evaluate it. This listens for resize, debounced ~250ms
  // so an in-progress drag-resize doesn't recompute every frame, and only
  // calls setTier with the freshly-picked value — React's own Object.is
  // bail-out on an unchanged primitive means a resize that doesn't cross
  // the tier boundary causes zero re-render/image-load churn. Self-
  // contained: doesn't touch the rotation/upload effects above or get
  // touched by arrange mode (App.tsx mounts Background as an ordinary
  // sibling inside the arrange `inert` wrapper — this effect has no
  // interaction with that).
  const [tier, setTier] = useState<PhotoTier>(() =>
    pickTier(physicalMaxDimension(), window.devicePixelRatio || 1),
  )
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setTier(pickTier(physicalMaxDimension(), window.devicePixelRatio || 1))
      }, 250)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // bundledUrl must never run with an empty set (or in gradient mode) — an
  // out-of-range access would throw during render and blank the whole page.
  const bundledActive = effectiveMode === 'auto' && BUNDLED[index] !== undefined
  // apodUsable (not just effectiveMode === 'apod', though the two always
  // agree — effectiveMode only ever holds 'apod' when apodUsable is true)
  // reads the same as every other branch here: apodCache.photo is exactly
  // what's usable at this point.
  const apodPhoto = effectiveMode === 'apod' && apodUsable ? apodCache!.photo! : null
  const src =
    effectiveMode === 'upload'
      ? (uploadPhoto?.url ?? null)
      : apodPhoto
        ? apodPhoto.url
        : bundledActive
          ? bundledUrl(index, tier)
          : null
  // The placeholder and the identity it belongs to are derived from the same
  // `index` in the same render pass as `src` above (bundled) or read off the
  // same single state object (uploads) — see the useState comment. APOD
  // carries no `lqip` branch at all: the LQIP underlay comment below (on the
  // `{lqip && (...)}` block a few lines down in the JSX) documents WHY it
  // exists (Chrome purging a background tab's
  // decoded image memory, then re-decoding on redisplay) and WHY it can be a
  // data URI/object URL cheaply (bundled photos ship an inline placeholder,
  // uploads have one backfilled into IndexedDB) — NASA's API returns no
  // low-res placeholder at all, so the only "placeholder" available would be
  // another network fetch, which defeats the entire point of an underlay
  // that must be ready the INSTANT the decode gap opens. A bare re-decode on
  // redisplay (falling through to `--bg-fallback` for that gap, same as the
  // pre-2026-08-07 behaviour every other mode had) is the honest tradeoff
  // for a source with no cheap placeholder to offer.
  const lqip = effectiveMode === 'upload' ? (uploadPhoto?.lqip ?? null) : bundledActive ? bundledLqip(index) : null
  const photoKey =
    effectiveMode === 'upload'
      ? (uploadPhoto?.key ?? null)
      : apodPhoto
        ? apodPhoto.url
        : bundledActive
          ? BUNDLED[index]!.id
          : null
  const showPhoto = src !== null
  const credit = effectiveMode === 'auto' && BUNDLED[index] ? BUNDLED[index] : null
  // Auto keeps its original ">0" threshold (rotating a single bundled photo
  // is harmless); upload only shows the control once there's more than one
  // photo to rotate through. apod never rotates (one photo a day, no index
  // to advance through), so it's absent here by construction, not by an
  // explicit `false` branch — the credit CAPTION below is what apod shows
  // in this same bottom-left spot instead, and the two are mutually
  // exclusive because effectiveMode is never simultaneously 'apod' and
  // 'auto'/'upload'.
  const showRefresh =
    (effectiveMode === 'auto' && BUNDLED.length > 0) || (effectiveMode === 'upload' && count > 1)

  // The button is rendered as a sibling of the aria-hidden layer, not nested inside
  // it: aria-hidden="true" removes ALL descendants from the accessibility tree
  // regardless of tabindex/pointer-events on them (this is the exact anti-pattern
  // axe-core's "aria-hidden-focus" rule and Lighthouse's a11y audit both flag), so a
  // focusable control nested inside would be silently unreachable to screen readers
  // even though sighted keyboard users could still Tab to it and see a focus ring.
  return (
    <>
      <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden" style={{ background: 'var(--bg-fallback)' }}>
        {/* LQIP underlay (2026-08-07). Chrome drops the decoded/rasterized
            image memory of background tabs under memory pressure; when the
            tab is shown again the photo above has to re-decode (36-165ms for
            these files, measured — see scripts/encode-photos.mjs), and for
            that gap whatever sits BEHIND the <img> is what's on screen. That
            used to be the --bg-fallback gradient, i.e. a photo→gradient→photo
            flash on every already-open tab. It is now a blurred copy of the
            same photo, so the gap reads as a soft focus-in rather than a
            different background. Same layer also covers first paint, where
            the decode gap is guaranteed rather than occasional.

            `-z-10` is load-bearing, not decoration. Painting order inside
            this fixed (stacking-context-forming) div is: its own background,
            then NEGATIVE-z-index descendants, then in-flow non-positioned
            content, then positioned descendants. The photo below is in-flow
            and the scrim is positioned; an absolutely positioned underlay at
            the default z-index would therefore paint ON TOP of the photo —
            which is exactly why the scrim, four lines down, works the way it
            does. `-z-10` puts this above the gradient and below the photo.

            The source is an inline data URI for bundled photos and an
            object URL for uploads: no network, no origin, and — the actual
            point — nothing that needs loading at the instant the gap opens.
            The overscale exists so the blur has real pixels to sample at the
            edges instead of transparency, and it has to beat the blur RADIUS
            in px: the margin it buys is a percentage of the layer (which is
            the viewport), the radius is a constant. `scale-110` put only 5%
            of each axis outside the frame — 25px at a 500px-wide window
            against `blur-2xl`'s 40px — so on exactly the narrow windows this
            underlay is most needed, its own edges faded out. `scale-125`
            puts 12.5% outside, which clears 40px on any axis down to 320px.
            Background.test.tsx checks the sum; scripts/preview.mjs measures
            the real rect against the real computed filter at 500x900. */}
        {lqip && (
          <div
            aria-hidden
            data-lqip=""
            data-photo={photoKey ?? undefined}
            className="absolute inset-0 -z-10 scale-125 bg-cover bg-center blur-2xl"
            style={{ backgroundImage: `url("${lqip}")` }}
          />
        )}
        {showPhoto && src && (
          <img
            key={src}
            src={src}
            alt=""
            data-photo={photoKey ?? undefined}
            className="h-full w-full object-cover opacity-0 transition-opacity duration-700 motion-reduce:transition-none"
            onLoad={(e) => e.currentTarget.classList.replace('opacity-0', 'opacity-100')}
          />
        )}
        {/* Per-theme wash over the photo (--scrim in themes.css). Legibility
            for text sitting directly on the photo is now carried primarily
            by the .text-photo shadow utility (src/newtab/index.css) applied
            to that text itself — the clock, greeting, world clocks,
            countdown, focus line, quote, and link labels all hold up against
            a bright photo (see bright-photo-check.png in the preview capture
            set) via that shadow, not this wash. The scrim stays in place as
            a gentle base tint (much lower opacity than before) for overall
            photo-vs-UI cohesion, not as the primary legibility mechanism. */}
        <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} />
      </div>
      {showRefresh && (
        <button
          type="button"
          aria-label="New background photo"
          title={credit ? `${credit.label} — click for a new photo` : 'New photo'}
          onClick={() => onPrefsChange(nextPhoto(prefs, today, count))}
          className="absolute bottom-4 left-4 rounded-full bg-panel-solid p-2 text-fg-muted shadow-lg shadow-black/25 backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      )}
      {/* NASA APOD credit caption (Task 96; repositioned in the final-review
          fix wave, Finding 1). Anchors the same `left-4` corner the refresh
          button occupies in auto/upload mode — those two still never
          co-render (showRefresh derives from effectiveMode === 'auto' |
          'upload', apodPhoto only from 'apod', and effectiveMode is never
          more than one of those at once) — but no longer shares the refresh
          button's `bottom-4` ROW. That row is ALSO the Notes pill's row
          (App.tsx's `fixed bottom-4 left-16`, `widgets.notes` defaulting
          true): the caption used to sit at `bottom-4 left-4` with no width
          cap, so on a real (non-trivial) title+copyright it grew into a
          single line wide enough to run straight under the pill at x64-128,
          which — being an opaque `bg-panel-solid` button — painted over the
          middle of the text. Confirmed live (screenshots/apod-background.png,
          the old capture): "Pillars of..." then a jump straight to
          "NASA, ESA, CSA · NASA APOD".

          Fix: `bottom-16` instead of `bottom-4` moves the caption to the ROW
          ABOVE the pill rather than squeezing it into the ~48px sliver to
          the pill's left (unreadable at any real caption length) or the
          pill itself (arrange-mode territory, not this component's to
          move). Because both the pill and this caption are anchored to
          the viewport's BOTTOM edge (`fixed`/`absolute` with `bottom-*`,
          not `top-*`), the pill's top sits a CONSTANT 54px above the
          viewport bottom (16px pill-bottom-offset + 38px pill height) at
          every window height — so the caption's own bottom edge at 64px
          (bottom-16) clears it by a fixed 10px at every height in the
          harness's range, not just 1600x900. `max-w-80` (320px) caps the
          line length so it wraps instead of running arbitrarily wide: the
          harness's own real fixture ("Pillars of Creation © NASA, ESA, CSA
          · NASA APOD", ~270px) still sits on one line, and even a long
          title+copyright wraps to 2-3 lines that grow UPWARD (an
          absolutely/fixed-positioned box with `bottom` set and no `top`
          sizes to content and extends away from its anchored edge) — so
          more text never closes the 10px pill gap, it only rises further
          from it. The cap also keeps even a stress-length caption's right
          edge (measured ~875px unwrapped) short of the bottom-center quote
          block, which starts at roughly viewport-center minus 288px at the
          narrowest width this got checked against (1300px) — 320px of
          caption plus its 16px left inset lands at 336px, comfortably
          inside that. No change to the caption's text content (harness-
          asserted verbatim) or to the mutual exclusion with the refresh
          button — only the box's own position and width. */}
      {apodPhoto && (
        <p className="absolute bottom-16 left-4 max-w-80 text-photo text-xs text-canvas-fg-muted">
          {apodPhoto.copyright
            ? `${apodPhoto.title} © ${apodPhoto.copyright} · NASA APOD`
            : `${apodPhoto.title} · NASA APOD`}
        </p>
      )}
    </>
  )
}
