import { useEffect, useState } from 'react'
import type { PhotoPrefs } from '../../lib/storage/schema'
import { listUploads } from '../../lib/idb'
import { BUNDLED, bundledUrl, nextPhoto, resolvePhoto } from '../../services/photos/index'
import { todayKey } from '../../lib/dates'

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
  const [uploads, setUploads] = useState<{ key: string; blob: Blob }[] | null>(null)
  const [uploadPhotoUrl, setUploadPhotoUrl] = useState<string | null>(null)
  const today = todayKey()

  useEffect(() => {
    if (prefs.mode !== 'upload') {
      setUploads(null)
      return
    }
    let cancelled = false
    void listUploads().then((list) => {
      if (cancelled) return // superseded effect run must not set stale state
      setUploads(list)
    })
    return () => {
      cancelled = true
    }
    // Depend on mode + the uploadedAt nonce (bumped on every add/remove), not
    // the whole prefs object: rotation-only writes (index/lastRotated, now
    // persisted in upload mode too — see the effect below) must not re-fetch
    // an unchanged gallery on every rotation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.mode, prefs.uploadedAt])

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

  // bundledUrl must never run with an empty set (or in gradient mode) — an
  // out-of-range access would throw during render and blank the whole page.
  const src =
    effectiveMode === 'upload'
      ? uploadPhotoUrl
      : effectiveMode === 'auto' && BUNDLED.length > 0
        ? bundledUrl(index)
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
