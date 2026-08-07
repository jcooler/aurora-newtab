import { useState } from 'react'
import type { AuroraStorage } from '../../lib/storage/index'
import type { AuroraData } from '../../lib/storage/schema'
import type { ConnectorDescriptor, RssConfig } from '../../services/connectors/types'
import { CONNECTORS } from '../../services/connectors/registry'
import { ensureOrigin, removeOrigin, originPattern } from '../../services/permissions'
import { control } from './shared'

const MAX_FEEDS = 5
const SHOWN_COUNT_OPTIONS = [3, 4, 5, 6, 7, 8]
const RSS_DEFAULT: RssConfig = { enabled: true, feeds: [], shownCount: 5 }

/** The origin match pattern for a feed URL, or null if it can't be derived
 *  (non-https / unparseable). Used only to decide whether a REMAINING feed
 *  still claims the origin of a feed being removed, so a bad entry simply
 *  doesn't count as sharing — it never throws out of the remove handler. */
function originOf(url: string): string | null {
  try {
    return originPattern(url)
  } catch {
    return null
  }
}

/** The Connectors tab body: one card per registered connector. The card SHELL
 *  is generic (it renders the descriptor's label/blurb/auth-state and an enable
 *  toggle), with a per-connector config body slotted in below — RSS is the only
 *  one today. `connectors` is owned by SettingsPanel (its useStoredKey read) and
 *  flows down; each card writes through `storage.update('connectors', …)`. */
export default function Connectors({
  connectors,
  storage,
}: {
  connectors: AuroraData['connectors'] | undefined
  storage: AuroraStorage
}) {
  return (
    <section aria-label="Connectors">
      <h3 className="mb-1 text-sm font-semibold text-fg">Connectors</h3>
      {CONNECTORS.map((descriptor) => (
        <ConnectorCard
          key={descriptor.id}
          descriptor={descriptor}
          config={connectors?.[descriptor.id]}
          storage={storage}
        />
      ))}
    </section>
  )
}

function ConnectorCard({
  descriptor,
  config,
  storage,
}: {
  descriptor: ConnectorDescriptor
  config: RssConfig | undefined
  storage: AuroraStorage
}) {
  const enabled = !!config?.enabled

  return (
    <div className="mt-2 rounded border border-panel-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-fg">{descriptor.label}</h4>
          <p className="text-xs text-fg-muted">{descriptor.blurb}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs ${enabled ? 'text-accent' : 'text-fg-muted'}`}>
            {enabled ? 'On' : 'Off'}
          </span>
          <label htmlFor={`connector-${descriptor.id}-enabled`} className="sr-only">
            Enable {descriptor.label}
          </label>
          <input
            id={`connector-${descriptor.id}-enabled`}
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const checked = e.currentTarget.checked
              // First enable seeds the full default; a later toggle just flips
              // `enabled` while preserving the feeds/shownCount already set.
              void storage.update('connectors', (prev) => ({
                ...prev,
                [descriptor.id]: { ...RSS_DEFAULT, ...prev[descriptor.id], enabled: checked },
              }))
            }}
            className="size-4 accent-(--accent)"
          />
        </div>
      </div>

      {/* Per-connector config body — RSS is the only one today. */}
      {descriptor.id === 'rss' && enabled && (
        <RssBody feeds={config?.feeds ?? []} shownCount={config?.shownCount ?? 5} storage={storage} />
      )}
    </div>
  )
}

function RssBody({
  feeds,
  shownCount,
  storage,
}: {
  feeds: string[]
  shownCount: number
  storage: AuroraStorage
}) {
  const [newFeed, setNewFeed] = useState('')
  const [error, setError] = useState<string | null>(null)

  const atCap = feeds.length >= MAX_FEEDS

  const updateRss = (fn: (rss: RssConfig) => RssConfig) =>
    storage.update('connectors', (prev) => ({
      ...prev,
      rss: fn({ ...RSS_DEFAULT, ...prev.rss }),
    }))

  async function handleAddFeed(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const url = newFeed.trim()

    // SYNCHRONOUS https validation FIRST — this boundary is load-bearing: the
    // permissions design and backup import both defer per-feed URL validation
    // to exactly here (a restored config can hold anything). new URL() and the
    // protocol check cost the gesture nothing (no await), so
    // chrome.permissions.request stays the first await below.
    let valid = false
    try {
      valid = new URL(url).protocol === 'https:'
    } catch {
      valid = false
    }
    if (!valid) {
      setError('Enter a feed URL that starts with https://')
      return
    }
    if (feeds.includes(url)) {
      setError('That feed is already in the list.')
      return
    }
    if (atCap) return // guarded by the disabled input/button too; belt and braces

    // The gesture chain: ensureOrigin (→ chrome.permissions.request) is the
    // FIRST await in this handler, with ZERO awaits ahead of it. Denied (or a
    // rejected request) → the feed is not added and an alert explains why.
    let granted: boolean
    try {
      granted = await ensureOrigin(url)
    } catch {
      granted = false
    }
    if (!granted) {
      setError('Permission to read that site was denied, so the feed was not added.')
      return
    }

    await updateRss((rss) => (rss.feeds.includes(url) ? rss : { ...rss, feeds: [...rss.feeds, url] }))
    setNewFeed('')
    setError(null)
  }

  async function handleRemoveFeed(url: string) {
    // Survivors come from the WRITE's result, never the render-time `feeds`
    // prop: two same-origin removals landing before a re-render would each
    // see the other still present in the stale prop and NEITHER would
    // revoke — a permanent grant leak PRIVACY.md's "released automatically"
    // promise doesn't allow. storage.update serializes per-key and returns
    // the post-write value, so the second removal always sees the first's.
    const next = await updateRss((rss) => ({ ...rss, feeds: rss.feeds.filter((f) => f !== url) }))
    const remaining = next.rss?.feeds ?? []
    // Revoke the origin only when this was its last user — another feed on the
    // same site still needs the grant. originOf swallows bad entries so they
    // don't count as sharing (and don't crash the sweep).
    const origin = originOf(url)
    const stillUsed = origin !== null && remaining.some((f) => originOf(f) === origin)
    if (!stillUsed) await removeOrigin(url)
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-panel-border pt-3">
      <ul className="flex flex-col gap-1">
        {feeds.map((url) => (
          <li key={url} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-fg-muted" title={url}>
              {url}
            </span>
            <button
              type="button"
              aria-label={`Remove ${url}`}
              onClick={() => void handleRemoveFeed(url)}
              className="shrink-0 rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <form className="flex items-center gap-2" onSubmit={handleAddFeed}>
        <label htmlFor="connector-rss-add" className="sr-only">
          Add feed URL
        </label>
        <input
          id="connector-rss-add"
          type="url"
          inputMode="url"
          placeholder="https://example.com/feed"
          value={newFeed}
          disabled={atCap}
          onChange={(e) => {
            setNewFeed(e.currentTarget.value)
            setError(null)
          }}
          aria-describedby={error ? 'connector-rss-error' : undefined}
          className={`${control} min-w-0 flex-1 disabled:opacity-50`}
        />
        <button
          type="submit"
          disabled={atCap}
          className="shrink-0 text-sm text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {atCap && (
        <p className="text-xs text-fg-muted">Up to {MAX_FEEDS} feeds. Remove one to add another.</p>
      )}

      {error && (
        <p id="connector-rss-error" role="alert" className="text-xs text-fg-muted">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <label htmlFor="connector-rss-count" className="text-sm text-fg-muted">
          Headlines shown
        </label>
        <select
          id="connector-rss-count"
          value={shownCount}
          onChange={(e) => {
            const count = Number(e.currentTarget.value)
            void updateRss((rss) => ({ ...rss, shownCount: count }))
          }}
          className={control}
        >
          {SHOWN_COUNT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
