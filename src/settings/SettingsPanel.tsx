import { useEffect, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { useStorage } from '../lib/storage/context'
import { useUploads } from '../lib/hooks/useUploads'
import type { Settings } from '../lib/storage/schema'
import General from './sections/General'
import Background from './sections/Background'
import Weather from './sections/Weather'
import Widgets from './sections/Widgets'
import WorldClocks from './sections/WorldClocks'
import Countdowns from './sections/Countdowns'
import Data from './sections/Data'

export default function SettingsPanel() {
  const storage = useStorage()
  const [settings, save] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  const [location] = useStoredKey('location')
  const [worldClocks] = useStoredKey('worldClocks')
  const [countdowns] = useStoredKey('countdowns')
  const [galleryError, setGalleryError] = useState<string | null>(null)
  // Reload the gallery whenever mode enters 'upload' or the uploadedAt nonce
  // bumps (every add/remove) — same "fresh read on nonce change" pattern the
  // file input below already relies on for cross-tab re-reads.
  const uploads = useUploads(photoPrefs?.mode === 'upload', photoPrefs?.uploadedAt, [])
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})

  // Object URLs derived from the blob list: created together whenever the
  // list changes, and revoked together in cleanup (on the next refresh, or
  // on unmount) so nothing leaks.
  useEffect(() => {
    const urls = Object.fromEntries(uploads.map((u) => [u.key, URL.createObjectURL(u.blob)]))
    setThumbUrls(urls)
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [uploads])

  if (!settings) return null
  const patch = (p: Partial<Settings>) => save({ ...settings, ...p })

  return (
    <div className="flex flex-col gap-6">
      <General settings={settings} patch={patch} />

      <Background
        storage={storage}
        photoPrefs={photoPrefs}
        savePhotoPrefs={savePhotoPrefs}
        uploads={uploads}
        thumbUrls={thumbUrls}
        galleryError={galleryError}
        setGalleryError={setGalleryError}
      />

      {location && <Weather location={location} storage={storage} />}

      <Widgets settings={settings} patch={patch} />

      <WorldClocks worldClocks={worldClocks} storage={storage} />

      <Countdowns countdowns={countdowns} storage={storage} />

      <Data storage={storage} />
    </div>
  )
}
