import { useEffect, useState } from 'react'
import type { PhotoPrefs } from '../../lib/storage/schema'
import { useUploads } from '../../lib/hooks/useUploads'
import {
  BUNDLED,
  bundledUrl,
  nextPhoto,
  pickTier,
  resolvePhoto,
  type PhotoTier,
} from '../../services/photos/index'
import { todayKey } from '../../lib/dates'

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
  const [uploadPhotoUrl, setUploadPhotoUrl] = useState<string | null>(null)
  const today = todayKey()

  // Empty gallery in upload mode cascades to the bundled set, same as 'auto'
  // — a user who picked "My photo" but hasn't uploaded anything yet should
  // still get a photo background, not drop straight to a bare gradient.
  const galleryEmpty = uploads !== null && uploads.length === 0
  const effectiveMode = prefs.mode === 'upload' && galleryEmpty ? 'auto' : prefs.mode

  const count =
    effectiveMode === 'upload'
      ? (uploads?.length ?? 0)
      : effectiveMode === 'auto'
        ? BUNDLED.length
        : 0
  const { index, rotated } = resolvePhoto(prefs, today, count)

  useEffect(() => {
    if (effectiveMode !== 'upload') {
      setUploadPhotoUrl(null)
      return
    }
    const blob = uploads?.[index]?.blob
    if (!blob) {
      setUploadPhotoUrl(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setUploadPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [effectiveMode, uploads, index])

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
  const src =
    effectiveMode === 'upload'
      ? uploadPhotoUrl
      : effectiveMode === 'auto' && BUNDLED.length > 0
        ? bundledUrl(index, tier)
        : null
  const showPhoto = src !== null
  const credit = effectiveMode === 'auto' && BUNDLED[index] ? BUNDLED[index] : null
  // Auto keeps its original ">0" threshold (rotating a single bundled photo
  // is harmless); upload only shows the control once there's more than one
  // photo to rotate through.
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
      <div aria-hidden className="fixed inset-0 -z-10" style={{ background: 'var(--bg-fallback)' }}>
        {showPhoto && src && (
          <img
            key={src}
            src={src}
            alt=""
            className="h-full w-full object-cover opacity-0 transition-opacity duration-700 motion-reduce:transition-none"
            onLoad={(e) => e.currentTarget.classList.replace('opacity-0', 'opacity-100')}
          />
        )}
        <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} />
      </div>
      {showRefresh && (
        <button
          type="button"
          aria-label="New background photo"
          title={credit ? `${credit.label} — click for a new photo` : 'New photo'}
          onClick={() => onPrefsChange(nextPhoto(prefs, today, count))}
          className="absolute bottom-4 left-4 rounded-full bg-panel p-2 text-fg-muted backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      )}
    </>
  )
}
