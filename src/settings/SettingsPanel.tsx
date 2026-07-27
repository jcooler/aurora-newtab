import { useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { useStorage } from '../lib/storage/context'
import { THEMES } from '../theme/index'
import { ENGINES } from '../lib/search'
import { addUploads, removeUpload } from '../lib/idb'
import { useUploads } from '../lib/hooks/useUploads'
import { serializeBackup, parseBackup } from '../lib/backup'
import { migrate } from '../lib/storage/migrations'
import { todayKey } from '../lib/dates'
import { defaults, type AuroraData, type DataKey, type PhotoPrefs, type Settings, type WidgetToggles } from '../lib/storage/schema'

const DATA_KEYS = Object.keys(defaults()) as DataKey[]

// Partial: WidgetToggles still has keys (clocks/countdown) ahead of the
// widget that backs them (see Task 28) — this stays non-exhaustive on
// purpose so we don't render a toggle for a widget that doesn't exist yet
// (a "coming soon" control with nothing behind it).
const WIDGET_LABELS: Partial<Record<keyof WidgetToggles, string>> = {
  search: 'Search bar',
  weather: 'Weather',
  links: 'Quick links',
  todo: 'To-do lists',
  timer: 'Focus timer',
  quote: 'Daily quote',
  bookmarks: 'Bookmarks bar',
  notes: 'Notes',
}

const row = 'flex items-center justify-between gap-4 py-2'
const label = 'text-sm text-fg-muted'
const control =
  'rounded border border-panel-border bg-transparent px-2 py-1 text-sm text-fg outline-none focus-visible:border-accent'

export default function SettingsPanel() {
  const storage = useStorage()
  const [settings, save] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  const [location] = useStoredKey('location')
  const themeGroupRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<{
    migrated: AuroraData
    summary: string
  } | null>(null)
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

  async function handleRemoveUpload(key: string) {
    await removeUpload(key)
    // fresh read + changed value: a stale spread could revert concurrent
    // writes, and a deep-equal write emits no chrome.storage event at all
    await storage.update('photoPrefs', (p) => ({ ...p, uploadedAt: new Date().toISOString() }))
  }

  async function handleExport() {
    const entries = await Promise.all(
      DATA_KEYS.map(async (key) => [key, await storage.get(key)] as const),
    )
    const data = Object.fromEntries(entries) as unknown as AuroraData
    const json = serializeBackup(data)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aurora-backup-${todayKey()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = '' // allow re-selecting the same file later
    if (!file) return
    setImportError(null)
    setPendingImport(null)
    const text = await file.text()
    const result = parseBackup(text)
    if (!result.ok) {
      setImportError(result.reason)
      return
    }
    const migrated = migrate(result.data, result.version)
    // parseBackup already confirmed valid JSON; re-parsing here just recovers
    // exportedAt, which parseBackup's contract deliberately omits.
    let exportedAt: string | undefined
    try {
      const raw = JSON.parse(text) as { exportedAt?: unknown }
      if (typeof raw.exportedAt === 'string') exportedAt = raw.exportedAt
    } catch {
      // unreachable: parseBackup already validated this text is JSON
    }
    const dateStr = exportedAt ? exportedAt.slice(0, 10) : 'an unknown date'
    const summary =
      `Replace current data? Backup from ${dateStr} — ${migrated.todoLists.length} lists, ` +
      `${migrated.links.length} links, ${migrated.countdowns.length} countdowns.`
    setPendingImport({ migrated, summary })
  }

  async function handleConfirmImport() {
    if (!pendingImport) return
    const { migrated } = pendingImport
    await Promise.all(DATA_KEYS.map((key) => storage.set(key, migrated[key])))
    setPendingImport(null)
  }

  function handleCancelImport() {
    setPendingImport(null)
  }

  // APG radiogroup keyboard pattern: arrow keys move AND apply the selection
  // (this isn't a form that needs a separate "submit", so there's no reason
  // to make Left/Right merely preview a theme the user then has to commit).
  // Home/End jump to the first/last theme. Focus is moved imperatively via
  // .focus() on the target button — that works even though its tabIndex is
  // still -1 at the moment of the call, since script-driven focus ignores
  // tabIndex; the roving tabIndex only governs Tab-key navigation.
  function onThemeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!settings) return
    const currentIndex = THEMES.findIndex((t) => t.id === settings.theme)
    let nextIndex: number
    switch (e.key) {
      // ArrowDown/ArrowUp alias Right/Left: this radiogroup lays its options
      // out horizontally, but APG allows either axis's arrows to work, and
      // some users reflexively reach for Up/Down on any roving-tabindex
      // group regardless of visual orientation.
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1 + THEMES.length) % THEMES.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + THEMES.length) % THEMES.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = THEMES.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    const next = THEMES[nextIndex]!
    patch({ theme: next.id })
    const radios = themeGroupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios?.[nextIndex]?.focus()
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Profile">
        <div className={row}>
          <label htmlFor="set-name" className={label}>
            Your name
          </label>
          <input
            id="set-name"
            key={settings.name} // remount on external change: a stale uncontrolled
            // value would otherwise be re-saved on blur, reverting another tab's rename
            defaultValue={settings.name}
            onBlur={(e) => patch({ name: e.currentTarget.value.trim() })}
            className={control}
          />
        </div>
      </section>

      <section aria-label="Appearance">
        <div className={row}>
          <span className={label} id="theme-label">
            Theme
          </span>
          <div
            role="radiogroup"
            aria-labelledby="theme-label"
            ref={themeGroupRef}
            onKeyDown={onThemeKeyDown}
            className="flex gap-2"
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={settings.theme === t.id}
                tabIndex={settings.theme === t.id ? 0 : -1}
                onClick={() => patch({ theme: t.id })}
                className={`rounded-full border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent ${
                  settings.theme === t.id
                    ? 'border-accent text-fg'
                    : 'border-panel-border text-fg-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Clock and units">
        <div className={row}>
          <label htmlFor="set-24h" className={label}>
            24-hour clock
          </label>
          <input
            id="set-24h"
            type="checkbox"
            checked={settings.use24Hour}
            onChange={(e) => patch({ use24Hour: e.currentTarget.checked })}
            className="size-4 accent-(--accent)"
          />
        </div>
        <div className={row}>
          <label htmlFor="set-units" className={label}>
            Units
          </label>
          <select
            id="set-units"
            value={settings.units}
            onChange={(e) => patch({ units: e.currentTarget.value as Settings['units'] })}
            className={control}
          >
            <option value="metric">Celsius</option>
            <option value="imperial">Fahrenheit</option>
          </select>
        </div>
        <div className={row}>
          <label htmlFor="set-engine" className={label}>
            Search engine
          </label>
          <select
            id="set-engine"
            value={settings.searchEngine}
            onChange={(e) =>
              patch({ searchEngine: e.currentTarget.value as Settings['searchEngine'] })
            }
            className={control}
          >
            {Object.entries(ENGINES).map(([id, engine]) => (
              <option key={id} value={id}>
                {engine.label}
              </option>
            ))}
          </select>
        </div>
        <div className={row}>
          <label htmlFor="set-muted" className={label}>
            Mute sounds
          </label>
          <input
            id="set-muted"
            type="checkbox"
            checked={settings.muted}
            onChange={(e) => patch({ muted: e.currentTarget.checked })}
            className="size-4 accent-(--accent)"
          />
        </div>
      </section>

      <section aria-label="Background">
        <h3 className="mb-1 text-sm font-medium text-fg">Background</h3>
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
            className={control}
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
                onChange={async (e) => {
                  const files = Array.from(e.currentTarget.files ?? [])
                  e.currentTarget.value = '' // allow re-selecting the same file(s) later
                  if (files.length === 0) return
                  await addUploads(files)
                  // fresh read + changed value: a stale spread could revert concurrent
                  // writes, and a deep-equal write emits no chrome.storage event at all
                  await storage.update('photoPrefs', (p) => ({
                    ...p,
                    mode: 'upload',
                    uploadedAt: new Date().toISOString(),
                  }))
                }}
                className="max-w-48 text-sm text-fg-muted file:mr-2 file:rounded file:border file:border-panel-border file:bg-transparent file:px-2 file:py-1 file:text-fg"
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
          </>
        )}
      </section>

      {location && (
        <section aria-label="Weather">
          <h3 className="mb-1 text-sm font-medium text-fg">Weather</h3>
          <div className={row}>
            <span className={label}>Location</span>
            <button
              type="button"
              onClick={() => {
                void storage.set('location', null)
                void storage.set('weatherCache', null)
              }}
              className="rounded border border-panel-border px-2 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {`${location.label} — clear`}
            </button>
          </div>
        </section>
      )}

      <section aria-label="Widgets">
        <h3 className="mb-1 text-sm font-medium text-fg">Widgets</h3>
        {(Object.entries(WIDGET_LABELS) as [keyof WidgetToggles, string][]).map(
          ([key, widgetLabel]) => (
            <div key={key} className={row}>
              <label htmlFor={`w-${key}`} className={label}>
                {widgetLabel}
              </label>
              <input
                id={`w-${key}`}
                type="checkbox"
                checked={settings.widgets[key]}
                onChange={(e) =>
                  patch({ widgets: { ...settings.widgets, [key]: e.currentTarget.checked } })
                }
                className="size-4 accent-(--accent)"
              />
            </div>
          ),
        )}
      </section>

      <section aria-label="Data">
        <h3 className="mb-1 text-sm font-medium text-fg">Data</h3>
        <div className={row}>
          <span className={label}>Export backup</span>
          <button
            type="button"
            onClick={() => void handleExport()}
            className="rounded border border-panel-border px-2 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            Export
          </button>
        </div>
        <div className={row}>
          <label htmlFor="set-import" className={label}>
            Import backup
          </label>
          <input
            id="set-import"
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleImportChange(e)}
            className="max-w-48 text-sm text-fg-muted file:mr-2 file:rounded file:border file:border-panel-border file:bg-transparent file:px-2 file:py-1 file:text-fg"
          />
        </div>
        {importError && <p className="text-fg-muted text-xs">{importError}</p>}
        {pendingImport && (
          <div className="mt-2 flex flex-col gap-2 rounded border border-panel-border p-2">
            <p className="text-sm text-fg-muted">{pendingImport.summary}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleConfirmImport()}
                className="rounded border border-panel-border px-2 py-1 text-sm text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={handleCancelImport}
                className="rounded border border-panel-border px-2 py-1 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-fg-muted">Background photo uploads are not included.</p>
      </section>
    </div>
  )
}
