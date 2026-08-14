import { useState } from 'react'
import { addUploads, removeUpload } from '../../lib/idb'
import type { Upload } from '../../lib/hooks/useUploads'
import type { AuroraStorage } from '../../lib/storage/index'
import type { PhotoPrefs } from '../../lib/storage/schema'
import { APOD_ORIGINS } from '../../services/apod'
import { ensureOrigins, originPattern, removeOrigin } from '../../services/permissions'
import { heldOrigins } from '../../services/connectors/registry'
import Section from '../Section'
import { row, label, select } from './shared'

/** Background photo source (daily/upload/gradient/apod) + the upload
 *  gallery. `photoPrefs`/`savePhotoPrefs` and the loaded `uploads`/`thumbUrls`
 *  stay owned by SettingsPanel (their async resolution timing —
 *  useStoredKey, useUploads, and the object-URL effect derived from it — must
 *  not shift relative to today) and flow down as props; `galleryError`, the
 *  APOD permission-denied alert, and every handler below are section-local
 *  and live entirely here. */
export default function Background({
  storage,
  reportPendingCleanup: _reportPendingCleanup,
  photoPrefs,
  savePhotoPrefs,
  uploads,
  thumbUrls,
  galleryError,
  setGalleryError,
}: {
  storage: AuroraStorage
  /** SettingsPanel owns this durable recovery state; APOD wires into it in Task 4. */
  reportPendingCleanup(patterns: readonly string[]): void
  photoPrefs: PhotoPrefs | undefined
  savePhotoPrefs: (next: PhotoPrefs) => void
  uploads: Upload[]
  thumbUrls: Record<string, string>
  galleryError: string | null
  setGalleryError: (error: string | null) => void
}) {
  // 'apod' permission-denied alert (Task 96) — section-local, same pattern as
  // Widgets.tsx's bookmarksPermissionDenied: nothing outside this select
  // cares about it, and it's cleared on the NEXT successful source change
  // (any of the four), not just a later apod attempt.
  const [apodError, setApodError] = useState<string | null>(null)

  // Selecting 'apod': ensureOrigins(APOD_ORIGINS) must be the FIRST await in
  // this whole chain, with ZERO awaits ahead of it — same gesture-chain
  // discipline as every other permission-gated control in Settings
  // (Switch.tsx's own doc comment, Widgets.tsx's bookmarks toggle, every
  // TokenConnectForm/RssBody/IcsBody/CryptoBody handler in Connectors.tsx).
  // The <select>'s onChange itself runs synchronously up to here; nothing
  // above this call awaits anything.
  async function handleSourceChange(newMode: PhotoPrefs['mode']) {
    if (!photoPrefs) return
    const prevMode = photoPrefs.mode

    if (newMode === 'apod') {
      // ensureOrigins can REJECT, not just resolve false (e.g. the gesture
      // context was somehow already lost) — without a catch here, that's an
      // unhandled rejection with no alert shown at all, same reasoning as
      // Widgets.tsx's ensureBookmarksPermission catch.
      let granted: boolean
      try {
        granted = await ensureOrigins(APOD_ORIGINS)
      } catch {
        granted = false
      }
      if (!granted) {
        // Denied/rejected: prefs stay UNWRITTEN — the select falls back to
        // rendering the prior mode (its `value` prop is still `photoPrefs.mode`,
        // untouched) — and the alert explains why.
        setApodError('Permission to reach NASA was denied, so the background is unchanged.')
        return
      }
      setApodError(null)
      savePhotoPrefs({ ...photoPrefs, mode: 'apod' })
      return
    }

    // Every other source change clears any stale apod alert, per the pinned
    // "cleared on the next successful source change" rule — including a
    // switch between two non-apod modes, not just a switch AWAY from apod.
    setApodError(null)
    savePhotoPrefs({ ...photoPrefs, mode: newMode })

    if (prevMode === 'apod') {
      // Switching AWAY from apod: clear the cache (a fresh 'apod' pick later
      // starts clean, never shows yesterday's photo for a beat) and release
      // whatever APOD origins no still-enabled connector independently holds
      // — read fresh from storage (non-gesture context now, so awaiting here
      // is fine; this is well after the click that started the chain).
      await storage.update('apodCache', () => null)
      const connectors = await storage.get('connectors')
      const held = new Set(heldOrigins(connectors))
      for (const url of APOD_ORIGINS) {
        if (!held.has(originPattern(url))) await removeOrigin(url)
      }
    }
  }

  async function handleRemoveUpload(key: string) {
    // Fire-and-forget here was the bug: an IndexedDB failure (quota is
    // realistic for photos) went silent, and the nonce-stamp write below
    // never ran anyway — so removal just silently failed. Catch it and
    // surface it, same idiom as the world-clocks zone-add error.
    try {
      await removeUpload(key)
    } catch {
      setGalleryError("Couldn't remove that photo. Try again.")
      return
    }
    setGalleryError(null)
    // fresh read + changed value: a stale spread could revert concurrent
    // writes, and a deep-equal write emits no chrome.storage event at all
    await storage.update('photoPrefs', (p) => ({ ...p, uploadedAt: new Date().toISOString() }))
  }

  async function handleAddUploads(files: File[]) {
    // Same fire-and-forget bug as handleRemoveUpload, mirrored here: catch
    // the IDB failure instead of letting it vanish, and don't stamp the
    // nonce for an add that didn't actually happen.
    try {
      await addUploads(files)
    } catch {
      setGalleryError("Couldn't save that photo. Your device may be low on storage.")
      return
    }
    setGalleryError(null)
    // fresh read + changed value: a stale spread could revert concurrent
    // writes, and a deep-equal write emits no chrome.storage event at all
    await storage.update('photoPrefs', (p) => ({
      ...p,
      mode: 'upload',
      uploadedAt: new Date().toISOString(),
    }))
  }

  return (
    <Section title="Background">
      <div className={row}>
        <label htmlFor="set-bg-mode" className={label}>
          Source
        </label>
        <select
          id="set-bg-mode"
          value={photoPrefs?.mode ?? 'auto'}
          aria-describedby={apodError ? 'bg-apod-error' : undefined}
          onChange={(e) => {
            // Capture the value synchronously, before handleSourceChange's
            // own (possibly awaited) work runs — React 19 no longer pools
            // SyntheticEvents, but reading it here keeps the gesture-chain
            // discipline explicit rather than relying on that.
            const newMode = e.currentTarget.value as PhotoPrefs['mode']
            void handleSourceChange(newMode)
          }}
          className={select}
        >
          <option value="auto">Daily photo</option>
          <option value="upload">My photo</option>
          <option value="gradient">Gradient</option>
          <option value="apod">NASA photo of the day</option>
        </select>
      </div>
      {apodError && (
        <p id="bg-apod-error" role="alert" className="text-xs text-fg-muted">
          {apodError}
        </p>
      )}
      {photoPrefs?.mode === 'upload' && (
        <>
          <div className={row}>
            <label htmlFor="set-bg-file" className={label}>
              Image files
            </label>
            <input
              id="set-bg-file"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.currentTarget.files ?? [])
                e.currentTarget.value = '' // allow re-selecting the same file(s) later
                if (files.length === 0) return
                void handleAddUploads(files)
              }}
              aria-describedby={galleryError ? 'bg-gallery-error' : undefined}
              className="max-w-48 text-sm text-fg-muted transition-colors file:mr-2 file:rounded-lg file:border file:border-control-border file:bg-transparent file:px-2.5 file:py-1 file:text-fg hover:file:bg-control-bg-hover"
            />
          </div>
          {uploads.length > 0 && (
            <div className={row}>
              <span className={label} id="bg-gallery-label">
                Gallery
              </span>
              <div
                role="list"
                aria-labelledby="bg-gallery-label"
                className="flex flex-wrap justify-end gap-2"
              >
                {uploads.map((u, i) => (
                  <div key={u.key} role="listitem" className="relative">
                    {thumbUrls[u.key] && (
                      <img
                        src={thumbUrls[u.key]}
                        alt=""
                        className="size-14 rounded object-cover"
                      />
                    )}
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => void handleRemoveUpload(u.key)}
                      className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-panel text-[10px] leading-none text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {galleryError && (
            <p id="bg-gallery-error" role="alert" className="text-xs text-fg-muted">
              {galleryError}
            </p>
          )}
        </>
      )}
    </Section>
  )
}
