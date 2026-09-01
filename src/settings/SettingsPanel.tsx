import { useCallback, useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { useStorage } from '../lib/storage/context'
import { useUploads } from '../lib/hooks/useUploads'
import type { Settings } from '../lib/storage/schema'
import type { LayoutsDocument, NamedLayout } from '../lib/layout/namedLayouts'
import General from './sections/General'
import Background from './sections/Background'
import Widgets from './sections/Widgets'
import Data from './sections/Data'
import Layout from './sections/Layout'
import About from './sections/About'
import Connectors from './sections/Connectors'
import Progress from './sections/Progress'
import Tabs from './Tabs'
import PermissionCleanupAlert from './PermissionCleanupAlert'
import { usePermissionCleanup } from './usePermissionCleanup'
import { calendarPreferenceFor } from '../lib/layout/calendarConsolidation'

type TabId = 'general' | 'progress' | 'widgets' | 'connectors' | 'data'

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'progress', label: 'Progress' },
  { id: 'widgets', label: 'Widgets' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'data', label: 'Data' },
]

export default function SettingsPanel({
  // Whether the Drawer wrapping this panel is currently open — threaded down
  // to the Layout section so its armed Reset button can disarm the instant
  // the drawer closes (review fix; see Layout.tsx). Defaults to `true` so
  // every OTHER test/call site that doesn't care about this specific
  // behavior doesn't need to pass it; App always passes the real value.
  open = true,
  focusAnchor = null,
  layoutsDocument = null,
  calendarConsolidationLayout = null,
}: {
  open?: boolean
  /** Deep link from a widget's gear (named-layouts spec 2.5): on nonce
   *  change, activate the tab and move focus to the matching
   *  [data-settings-anchor] element. */
  focusAnchor?: { tab: 'progress' | 'widgets' | 'connectors'; anchor: string; nonce: number } | null
  /** The resolved named-layouts document (App owns resolution); the Layout
   *  section's management list operates on it (spec 2.1). */
  layoutsDocument?: LayoutsDocument | null
  /** The persisted active layout, supplied only when storage owns a named
   *  layouts document that the Calendar consolidation may safely rewrite. */
  calendarConsolidationLayout?: NamedLayout | null
}) {
  const storage = useStorage()
  // Which tab's sections are mounted. Deliberately NOT persisted anywhere: a
  // freshly-loaded new tab always starts on General. It does survive a
  // close/reopen within one page session, because Drawer.tsx keeps its
  // children mounted while closed (it only toggles `inert`/`translate-x-full`
  // — see Layout.tsx's `open` prop, which exists for exactly that reason), so
  // this state is never torn down between opens.
  const [tab, setTab] = useState<TabId>('general')
  const openRef = useRef(open)
  openRef.current = open

  const focusSettingsTarget = useCallback((targetTab: TabId, anchor: string) => {
    setTab(targetTab)
    let cancelled = false
    const attempt = (remaining: number) => {
      if (cancelled || !openRef.current) return
      const target = document.querySelector<HTMLElement>(`[data-settings-anchor="${anchor}"]`)
      if (target) {
        target.scrollIntoView?.({ block: 'center' })
        target.focus()
        if (document.activeElement === target || remaining <= 0) return
      }
      if (remaining > 0) setTimeout(() => attempt(remaining - 1), 80)
    }
    const frame = requestAnimationFrame(() => attempt(5))
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (!focusAnchor) return
    return focusSettingsTarget(focusAnchor.tab, focusAnchor.anchor)
  }, [focusAnchor, focusSettingsTarget])
  const [settings, save] = useStoredKey('settings')
  const [photoPrefs] = useStoredKey('photoPrefs')
  const [location] = useStoredKey('location')
  const [worldClocks] = useStoredKey('worldClocks')
  const [countdowns] = useStoredKey('countdowns')
  const [habits] = useStoredKey('habits')
  const [progressGoals] = useStoredKey('progressGoals')
  const [connectors] = useStoredKey('connectors')
  const [refreshPreferences] = useStoredKey('refreshPreferences')
  const [calendarWeekStart, saveCalendarWeekStart] = useStoredKey('calendarWeekStart')
  const [calendarPreferences] = useStoredKey('calendarPreferences')
  const cleanup = usePermissionCleanup(storage)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  // Reload the gallery whenever mode enters 'upload' or the uploadedAt nonce
  // bumps (every add/remove) — same "fresh read on nonce change" pattern the
  // file input below already relies on for cross-tab re-reads.
  const uploads = useUploads(photoPrefs?.mode === 'upload', photoPrefs?.uploadedAt, [])
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})

  // Object URLs derived from each upload's THUMB — the ~32px placeholder
  // src/lib/thumbs.ts encodes alongside the full photo (src/lib/idb.ts) —
  // falling back to the full `blob` only when a thumb doesn't exist yet.
  // That fallback is not defensive padding: a gallery filled before
  // placeholders existed (or mid-heal — idb.ts's backfillThumbs runs
  // unattended in the background) genuinely has uploads with no `thumb`,
  // and this grid must still render something for them rather than an
  // empty tile. Getting this backwards is the bug this fixes — the prop
  // was already named `thumbUrls` and Background.tsx already keyed off it
  // correctly, but this effect was building it from the FULL-resolution
  // blob unconditionally, so every ~56px gallery tile forced a multi-MB
  // decode it never needed (the LQIP underlay in
  // src/newtab/components/Background.tsx is the only other `.thumb`
  // consumer, and is untouched by this — display-only change, same
  // create-together/revoke-together lifecycle as before).
  useEffect(() => {
    const urls = Object.fromEntries(
      uploads.map((u) => [u.key, URL.createObjectURL(u.thumb ?? u.blob)]),
    )
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
    <>
      <PermissionCleanupAlert
        pendingPatterns={cleanup.pendingPatterns}
        onRetry={() => void cleanup.retryPermissionCleanup()}
        retrying={cleanup.retrying}
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} wide={tab === 'connectors'}>
      {tab === 'general' && (
        <>
          <General settings={settings} patch={patch} />

          <Background
            storage={storage}
            reportPendingCleanup={cleanup.reportPendingCleanup}
            photoPrefs={photoPrefs}
            uploads={uploads}
            thumbUrls={thumbUrls}
            galleryError={galleryError}
            setGalleryError={setGalleryError}
          />
        </>
      )}

      {tab === 'widgets' && (
        <>
          <Widgets
            settings={settings}
            patch={patch}
            worldClocks={worldClocks}
            countdowns={countdowns}
            storage={storage}
            location={location}
            calendarWeekStart={calendarWeekStart ?? 'locale'}
            saveCalendarWeekStart={saveCalendarWeekStart}
            calendarConsolidationLayout={calendarConsolidationLayout}
            calendarConsolidationPreference={calendarPreferenceFor(
              calendarPreferences,
              calendarConsolidationLayout?.id,
            )}
            refreshPreferences={refreshPreferences}
          />

          <Layout storage={storage} open={open} layoutsDocument={layoutsDocument} />
        </>
      )}

      {tab === 'progress' && (
        <Progress
          goals={progressGoals}
          habits={habits}
          storage={storage}
        />
      )}

      {tab === 'connectors' && (
        <Connectors
          connectors={connectors}
          refreshPreferences={refreshPreferences}
          storage={storage}
          reportPendingCleanup={cleanup.reportPendingCleanup}
        />
      )}

      {tab === 'data' && (
        <>
          <Data
            storage={storage}
            reportPendingCleanup={cleanup.reportPendingCleanup}
          />

          <About />
        </>
      )}
      </Tabs>
    </>
  )
}
