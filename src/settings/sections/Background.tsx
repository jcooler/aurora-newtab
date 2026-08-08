import { addUploads, removeUpload } from '../../lib/idb'
import type { Upload } from '../../lib/hooks/useUploads'
import type { AuroraStorage } from '../../lib/storage/index'
import type { PhotoPrefs } from '../../lib/storage/schema'
import Section from '../Section'
import { row, label, select } from './shared'

/** Background photo source (daily/upload/gradient) + the upload gallery.
 *  `photoPrefs`/`savePhotoPrefs` and the loaded `uploads`/`thumbUrls` stay
 *  owned by SettingsPanel (their async resolution timing — useStoredKey,
 *  useUploads, and the object-URL effect derived from it — must not shift
 *  relative to today) and flow down as props; `galleryError` and the two
 *  upload/remove handlers are section-local and live entirely here. */
export default function Background({
  storage,
  photoPrefs,
  savePhotoPrefs,
  uploads,
  thumbUrls,
  galleryError,
  setGalleryError,
}: {
  storage: AuroraStorage
  photoPrefs: PhotoPrefs | undefined
  savePhotoPrefs: (next: PhotoPrefs) => void
  uploads: Upload[]
  thumbUrls: Record<string, string>
  galleryError: string | null
  setGalleryError: (error: string | null) => void
}) {
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
          onChange={(e) =>
            photoPrefs &&
            savePhotoPrefs({ ...photoPrefs, mode: e.currentTarget.value as PhotoPrefs['mode'] })
          }
          className={select}
        >
          <option value="auto">Daily photo</option>
          <option value="upload">My photo</option>
          <option value="gradient">Gradient</option>
        </select>
      </div>
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
