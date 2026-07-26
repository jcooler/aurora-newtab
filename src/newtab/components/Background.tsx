import { useEffect, useState } from 'react'
import type { PhotoPrefs } from '../../lib/storage/schema'
import { getUpload } from '../../lib/idb'
import { BUNDLED, bundledUrl, nextPhoto, resolvePhoto } from '../../services/photos/index'
import { todayKey } from '../../lib/dates'

export default function Background({
  prefs,
  onPrefsChange,
}: {
  prefs: PhotoPrefs
  onPrefsChange: (next: PhotoPrefs) => void
}) {
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const today = todayKey()

  useEffect(() => {
    if (prefs.mode !== 'upload') {
      setUploadUrl(null)
      return
    }
    let cancelled = false
    let url: string | null = null
    void getUpload().then((blob) => {
      if (cancelled) return // superseded effect run must not set state or create URLs
      if (blob) {
        url = URL.createObjectURL(blob)
        setUploadUrl(url)
      } else {
        setUploadUrl(null)
      }
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // depend on the prefs object, not just mode: saving prefs after a new upload
    // must re-read the IDB slot even though mode is still 'upload'
  }, [prefs])

  const { index, rotated } = resolvePhoto(prefs, today, BUNDLED.length)
  useEffect(() => {
    // Only 'auto' mode owns index/lastRotated; gradient/upload modes must never
    // have their prefs mutated by the rotation effect.
    if (prefs.mode === 'auto' && rotated) onPrefsChange({ ...prefs, index, lastRotated: today })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per rotation
  }, [rotated, index, today, prefs.mode])

  // bundledUrl must never run with an empty set (or in gradient mode) — an
  // out-of-range access would throw during render and blank the whole page.
  const src =
    prefs.mode === 'upload'
      ? uploadUrl
      : prefs.mode === 'auto' && BUNDLED.length > 0
        ? bundledUrl(index)
        : null
  const showPhoto = src !== null
  const credit = prefs.mode === 'auto' && BUNDLED[index] ? BUNDLED[index] : null

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
      {prefs.mode === 'auto' && BUNDLED.length > 0 && (
        <button
          type="button"
          aria-label="New background photo"
          title={credit ? `${credit.label} — click for a new photo` : 'New photo'}
          onClick={() => onPrefsChange(nextPhoto(prefs, today, BUNDLED.length))}
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
