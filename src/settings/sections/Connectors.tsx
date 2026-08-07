import { useState, type ComponentType } from 'react'
import type { AuroraStorage } from '../../lib/storage/index'
import type { AuroraData } from '../../lib/storage/schema'
import type { ConnectorConfig, ConnectorDescriptor, ConnectorId, RssConfig } from '../../services/connectors/types'
import { CONNECTORS } from '../../services/connectors/registry'
import { ensureOrigin, removeOrigin, originPattern } from '../../services/permissions'
import { control } from './shared'

const MAX_FEEDS = 5
const SHOWN_COUNT_OPTIONS = [3, 4, 5, 6, 7, 8]
const RSS_DEFAULT: RssConfig = { enabled: true, feeds: [], shownCount: 5 }

/** Props every per-connector body component receives through BODY_COMPONENTS.
 *  `config` is the generic (union) ConnectorConfig — each body is registered
 *  under one specific id and narrows it internally with one documented cast,
 *  the same pattern ConnectorCard itself uses for its own `config` prop. */
interface BodyProps {
  config: ConnectorConfig | undefined
  storage: AuroraStorage
}

/** Card auth-state, exported (beside the default export) purely for direct
 *  unit testing — see SettingsPanel.test.tsx's authState describe block.
 *  Implements the rule types.ts's ConnectorDescriptor.identityField doc
 *  comment states: secret present + identity present -> connected; identity
 *  present + every secretFields entry empty/missing (backup-restored) ->
 *  reconnect; identity absent -> unconfigured; auth 'none' -> none always. */
export function authState(
  descriptor: ConnectorDescriptor,
  config: ConnectorConfig | undefined,
): 'none' | 'unconfigured' | 'connected' | 'reconnect' {
  if (descriptor.auth === 'none') return 'none'
  const field = descriptor.identityField
  const identity = field ? config?.[field] : undefined
  if (!identity) return 'unconfigured'
  const secretMissing = descriptor.secretFields.every((f) => !config?.[f])
  return secretMissing ? 'reconnect' : 'connected'
}

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

// Body slot per connector id. Partial (not a full Record): only rss has a
// body today — github/gitlab/jira/vercel/crypto/ics land in their own later
// sub-project-2 tasks, and this map carries no placeholder entries for them
// (a lookup for an unregistered id is simply undefined -> no body rendered).
const BODY_COMPONENTS: Partial<Record<ConnectorId, ComponentType<BodyProps>>> = {
  rss: RssBody,
}

function ConnectorCard({
  descriptor,
  config,
  storage,
}: {
  descriptor: ConnectorDescriptor
  config: ConnectorConfig | undefined
  storage: AuroraStorage
}) {
  const enabled = !!config?.enabled
  const state = authState(descriptor, config)
  const identity = descriptor.identityField ? config?.[descriptor.identityField] : undefined
  const Body = BODY_COMPONENTS[descriptor.id]

  return (
    <div className="mt-2 rounded border border-panel-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-fg">{descriptor.label}</h4>
          <p className="text-xs text-fg-muted">{descriptor.blurb}</p>
          {/* Status chip: 'token'-auth connectors only (types.ts's
              identityField doc comment states the connected/reconnect rule
              authState implements). Quiet-chip idiom, same as the On/Off
              span below — text-xs, tinted by state, no pill/border. */}
          {descriptor.auth === 'token' && state === 'connected' && (
            <p className="text-xs text-emerald-400">Connected as {String(identity)}</p>
          )}
          {descriptor.auth === 'token' && state === 'reconnect' && (
            <p className="text-xs text-fg-muted">Reconnect needed</p>
          )}
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

      {Body && enabled && <Body config={config} storage={storage} />}
    </div>
  )
}

function RssBody({ config, storage }: BodyProps) {
  // BodyProps.config is the generic ConnectorConfig union (BODY_COMPONENTS is
  // shared across every connector id); this component is registered only
  // under 'rss', so it is always RssConfig at runtime — one documented
  // narrowing cast, same pattern ConnectorCard's own config prop used before
  // the body-map split it out.
  const rss = config as RssConfig | undefined
  const feeds = rss?.feeds ?? []
  const shownCount = rss?.shownCount ?? 5

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
    // Same narrowing as the ConnectorCard call site above: next.rss is
    // ConnectorConfig-typed post-union, but updateRss only ever writes RssConfig.
    const remaining = (next.rss as RssConfig | undefined)?.feeds ?? []
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
