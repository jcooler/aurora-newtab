import { useState } from 'react'
import { addUploads, removeUpload } from '../../lib/idb'
import type { Upload } from '../../lib/hooks/useUploads'
import type { AuroraStorage } from '../../lib/storage/index'
import type { PhotoPrefs } from '../../lib/storage/schema'
import { APOD_ORIGINS } from '../../services/apod'
import {
  runOriginOwnerMutation,
  runOriginTransaction,
  type OriginTransactionResult,
} from '../../services/permissionTransactions'
import Section from '../Section'
import { row, label, select } from './shared'

function reportTransactionCleanup<T>(
  transaction: OriginTransactionResult<T>,
  reportPendingCleanup: (patterns: readonly string[]) => void,
) {
  if ('pendingCleanup' in transaction && transaction.pendingCleanup.length > 0) {
    reportPendingCleanup(transaction.pendingCleanup)
  }
}

function apodTransactionError(transaction: OriginTransactionResult<void>): string | null {
  if (transaction.status === 'committed') return null
  if (transaction.status === 'denied') {
    return 'Permission to reach NASA was denied, so the background is unchanged.'
  }
  if (transaction.status === 'access-lost') return 'Access changed before saving. Please try again.'
  if (transaction.status === 'aborted') return transaction.message
  return "Couldn't save the NASA background. Please try again."
}

export default function Background({
  storage,
  reportPendingCleanup,
  photoPrefs,
  uploads,
  thumbUrls,
  galleryError,
  setGalleryError,
}: {
  storage: AuroraStorage
  reportPendingCleanup(patterns: readonly string[]): void
  photoPrefs: PhotoPrefs | undefined
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

  async function commitPhotoOwnerMutation(
    updatePrefs: (prefs: PhotoPrefs) => PhotoPrefs,
  ) {
    return runOriginOwnerMutation(storage, async () => {
      let leavingApod = false
      await storage.update('photoPrefs', (prefs) => {
        const next = updatePrefs(prefs)
        leavingApod = prefs.mode === 'apod' && next.mode !== 'apod'
        return next
      })

      let cacheClearFailed = false
      if (leavingApod) {
        try {
          await storage.update('apodCache', () => null)
        } catch {
          cacheClearFailed = true
        }
      }

      return {
        value: { cacheClearFailed },
        releaseCandidates: leavingApod ? APOD_ORIGINS : [],
      }
    })
  }

  async function handleSourceChange(newMode: PhotoPrefs['mode']) {
    if (!photoPrefs) return

    if (newMode === 'apod') {
      const transaction = await runOriginTransaction(storage, APOD_ORIGINS, async () => {
        await storage.update('photoPrefs', (prefs) => ({ ...prefs, mode: 'apod' }))
        return { ok: true as const, value: undefined, ownerCommitted: true as const }
      })
      reportTransactionCleanup(transaction, reportPendingCleanup)
      setApodError(apodTransactionError(transaction))
      return
    }

    const mutation = await commitPhotoOwnerMutation((prefs) => ({ ...prefs, mode: newMode }))
    if (mutation.status !== 'committed') {
      setApodError("Couldn't save the background. Please try again.")
      return
    }
    setApodError(null)

    if (mutation.cleanup.pending.length > 0) {
      reportPendingCleanup(mutation.cleanup.pending)
    }
    if (mutation.value.cacheClearFailed) {
      setApodError("The NASA photo cache couldn't be cleared. The new background was saved.")
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
    // The upload itself can take long enough for another context to select
    // APOD. Re-read and change the owner only after entering the shared
    // lifecycle authority, then clean up any APOD ownership in that same lock.
    const mutation = await commitPhotoOwnerMutation((p) => ({
      ...p,
      mode: 'upload',
      uploadedAt: new Date().toISOString(),
    }))
    if (mutation.status !== 'committed') {
      setGalleryError("The photo was saved, but the background couldn't be updated. Please try again.")
      return
    }
    setGalleryError(null)
    if (mutation.cleanup.pending.length > 0) {
      reportPendingCleanup(mutation.cleanup.pending)
    }
    if (mutation.value.cacheClearFailed) {
      setApodError("The NASA photo cache couldn't be cleared. The new background was saved.")
    } else {
      setApodError(null)
    }
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
              className="min-h-9 min-w-0 max-w-48 text-sm text-fg-muted transition-colors file:mr-2 file:rounded-lg file:border file:border-control-border file:bg-transparent file:px-2.5 file:py-1 file:text-fg hover:file:bg-control-bg-hover motion-reduce:transition-none max-[420px]:w-full max-[420px]:max-w-full"
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
                      className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-panel text-[10px] leading-none text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-[420px]:right-0 max-[420px]:top-0 max-[420px]:size-9"
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
