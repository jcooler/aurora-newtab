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
import Layout from './sections/Layout'
import About from './sections/About'
import Tabs from './Tabs'

type TabId = 'general' | 'widgets' | 'data'

// Three tabs, in reading order. The Connectors tab is NOT here: it appears
// with its first real card (no placeholder UI), not before.
const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'widgets', label: 'Widgets' },
  { id: 'data', label: 'Data' },
]

export default function SettingsPanel({
  onArrangeLayout,
  // Whether the Drawer wrapping this panel is currently open — threaded down
  // to the Layout section so its armed Reset button can disarm the instant
  // the drawer closes (review fix; see Layout.tsx). Defaults to `true` so
  // every OTHER test/call site that doesn't care about this specific
  // behavior doesn't need to pass it; App always passes the real value.
  open = true,
}: {
  onArrangeLayout: () => void
  open?: boolean
}) {
  const storage = useStorage()
  // Which tab's sections are mounted. Deliberately NOT persisted anywhere: a
  // freshly-loaded new tab always starts on General. It does survive a
  // close/reopen within one page session, because Drawer.tsx keeps its
  // children mounted while closed (it only toggles `inert`/`translate-x-full`
  // — see Layout.tsx's `open` prop, which exists for exactly that reason), so
  // this state is never torn down between opens.
  const [tab, setTab] = useState<TabId>('general')
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

  // Only the ACTIVE tab's sections are rendered — inactive ones are
  // unmounted, not hidden, so their hooks and effects don't run off screen
  // (Data's pending-import state, Layout's confirm dialog, Background's
  // thumbnail grid). The keys SettingsPanel itself reads stay above this
  // split, so switching tabs never re-reads storage.
  return (
    <Tabs tabs={TABS} active={tab} onChange={setTab}>
      {tab === 'general' && (
        <>
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
        </>
      )}

      {tab === 'widgets' && (
        <>
          <Widgets settings={settings} patch={patch} />

          {location && <Weather location={location} storage={storage} />}

          <WorldClocks worldClocks={worldClocks} storage={storage} />

          <Countdowns countdowns={countdowns} storage={storage} />

          <Layout storage={storage} onArrangeLayout={onArrangeLayout} open={open} />
        </>
      )}

      {tab === 'data' && (
        <>
          <Data storage={storage} />

          <About />
        </>
      )}
    </Tabs>
  )
}
