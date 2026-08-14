import { useState, type ComponentType } from 'react'
import type { AuroraStorage } from '../../lib/storage/index'
import type { AuroraData } from '../../lib/storage/schema'
import type { ConnectorConfig, ConnectorDescriptor, ConnectorId, CryptoConfig, GithubConfig, GithubViews, GitlabConfig, GitlabViews, IcsCalendar, IcsConfig, JiraConfig, JiraViews, RssConfig, StatusConfig, StatusService, VercelConfig, VercelViews } from '../../services/connectors/types'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../services/connectors/types'
import { CONNECTORS, getConnector } from '../../services/connectors/registry'
import { whoamiGithub, resolveGithubViews } from '../../services/connectors/github'
import { whoamiGitlab, DEFAULT_GITLAB_VIEWS } from '../../services/connectors/gitlab'
import { whoamiJira, normalizeJiraSite, DEFAULT_JIRA_VIEWS } from '../../services/connectors/jira'
import { whoamiVercel, DEFAULT_VERCEL_VIEWS } from '../../services/connectors/vercel'
import { newSnapshotEpoch } from '../../services/connectors/snapshotIdentity'
import { resolveViews } from '../../services/connectors/views'
import { icsCalendarsOf, icsViewOf, CALENDAR_DOT_CLASSES, MAX_CALENDARS } from '../../services/connectors/ics'
import { CURATED_STATUS, MAX_SERVICES, statusServicesOf } from '../../services/connectors/status'
import {
  whoamiHomeAssistant,
  fetchAllStates,
  haEntitiesOf,
  haActionsOf,
  type HaAction,
  type HaEntityRef,
  type HaState,
  type HomeAssistantConfig,
} from '../../services/connectors/homeassistant'
import { canonicalOriginPatterns, originPattern } from '../../services/permissions'
import {
  releaseUnownedOrigins,
  runOriginTransaction,
  type OriginTransactionResult,
} from '../../services/permissionTransactions'
import { fuzzyScore } from '../../lib/fuzzy'
import { TokenConnectForm, type TokenDisconnectResult } from './TokenConnectForm'
import EntityPickerDialog from './EntityPickerDialog'
import Switch from '../Switch'
import ToggleChip from '../ToggleChip'
import { btnQuiet, control, eyebrow, label, row, select, submitBtn } from './shared'

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
  reportPendingCleanup(patterns: readonly string[]): void
}

type DisconnectableConnectorId = 'github' | 'gitlab' | 'jira' | 'vercel' | 'homeassistant' | 'crypto'

function canonicalCandidates(candidates: readonly string[]): string[] {
  const canonical = new Set<string>()
  for (const candidate of candidates) {
    try {
      for (const pattern of canonicalOriginPatterns([candidate])) canonical.add(pattern)
    } catch {
      // Descriptor origins are expected to be canonical. Ignore one malformed
      // entry rather than preventing the valid removed origins from recovery.
    }
  }
  return [...canonical]
}

function descriptorCandidates(id: ConnectorId, config: ConnectorConfig): string[] {
  const descriptor = getConnector(id)
  if (!descriptor) return []
  try {
    return canonicalCandidates(descriptor.origins(config))
  } catch {
    return []
  }
}

function reportTransactionCleanup<T>(
  transaction: OriginTransactionResult<T>,
  reportPendingCleanup: (patterns: readonly string[]) => void,
) {
  if ('pendingCleanup' in transaction && transaction.pendingCleanup.length > 0) {
    reportPendingCleanup(transaction.pendingCleanup)
  }
}

function transactionError<T>(
  transaction: OriginTransactionResult<T>,
  deniedMessage: string,
): string | null {
  if (transaction.status === 'committed') return null
  if (transaction.status === 'aborted') return transaction.message
  if (transaction.status === 'denied') return deniedMessage
  if (transaction.status === 'access-lost') return 'Access changed before saving. Please try again.'
  return "Couldn't save that connection. Please try again."
}

/** Captures origin candidates from the exact config value removed by the
 * authoritative update, never from render-time props or a separate read.
 * The empty-origin transaction is deliberately permission-free: it only puts
 * the owner mutation into the same lifecycle authority used by its subsequent
 * release in TokenConnectForm. */
async function disconnectTokenConnector(
  storage: AuroraStorage,
  id: DisconnectableConnectorId,
): Promise<TokenDisconnectResult> {
  let candidates: string[] = []
  const transaction = await runOriginTransaction(storage, [], async () => {
    await storage.update('connectors', (prev) => {
      const removed = prev[id]
      const next = { ...prev }
      delete next[id]
      if (removed) candidates = descriptorCandidates(id, removed)
      return next
    })
    return { ok: true as const, value: undefined, ownerCommitted: true as const }
  })
  return { candidates: transaction.status === 'committed' ? candidates : [], transaction }
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

/** The Connectors tab body: one card per registered connector, under a search
 *  box that narrows the catalog and (query empty) groups it — Task 80
 *  (W3-SP1). The card SHELL itself is untouched (label/blurb/auth-state +
 *  enable toggle, a per-connector body slotted in below); this component only
 *  decides WHICH cards render and under what heading. `connectors` is owned by
 *  SettingsPanel (its useStoredKey read) and flows down; each card writes
 *  through `storage.update('connectors', …)`.
 *
 *  Query empty: every ENABLED connector surfaces first under "On your board"
 *  (registry order), then the rest bucketed by ConnectorDescriptor.category in
 *  CATEGORY_ORDER — an empty category (no members, or every member pinned
 *  away) renders NO eyebrow at all, not an empty one (Home/Fun have no
 *  occupants yet). Query non-empty: a single flat list ranked by fuzzyScore
 *  (ties broken by registry order), no eyebrows, no pinning — search REPLACES
 *  grouping rather than filtering within it.
 *
 *  Layout — STICKY, not a nested scroll region: the search block below is
 *  `position: sticky` with `top: -1.5rem`, canceling the Drawer's own `p-6` so
 *  it locks flush against the scrollport's top edge once scrolled past,
 *  inside the Drawer's EXISTING single `overflow-y-auto` (Drawer.tsx) — zero
 *  Drawer/SettingsPanel changes, one scroll context. This is
 *  STRUCTURALLY safe here: nothing sits BETWEEN this sticky block and its
 *  scrolling ancestor with a `transform`/`filter`/`contain` that would give it
 *  a different containing block (the usual way sticky breaks) — the Drawer
 *  panel's own slide-in `transform` and `backdrop-blur` live on the
 *  scroll container ITSELF, not on an intermediate wrapper, so they don't
 *  interpose. jsdom never lays out `position: sticky` (no scrolling), so the
 *  tests below assert the BEHAVIORAL contract only (markers, filtering,
 *  grouping) — the real pinned-while-scrolled proof is Task 81's
 *  browser probe. `data-testid="connector-scroll"` names the list wrapper for
 *  that probe, even though (in this variant) it never scrolls itself.
 *  See Drawer.tsx's own structural warning (the panel element doc comment). */
export default function Connectors({
  connectors,
  storage,
  reportPendingCleanup,
}: {
  connectors: AuroraData['connectors'] | undefined
  storage: AuroraStorage
  reportPendingCleanup(patterns: readonly string[]): void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim()

  // Grouping is DERIVED per render from the registry + live config — no
  // memo: seven descriptors is nothing, and staleness bugs cost more than
  // the map does.
  const enabled = (d: ConnectorDescriptor) => !!connectors?.[d.id]?.enabled
  const results = q
    ? CONNECTORS.map((d, i) => ({ d, i, score: fuzzyScore(q, `${d.label} ${d.blurb}`) }))
        .filter((r): r is { d: ConnectorDescriptor; i: number; score: number } => r.score !== null)
        .sort((a, b) => b.score - a.score || a.i - b.i)
        .map((r) => r.d)
    : null
  const pinned = q ? [] : CONNECTORS.filter(enabled)
  const grouped = q
    ? []
    : CATEGORY_ORDER.map((cat) => ({
        cat,
        cards: CONNECTORS.filter((d) => d.category === cat && !enabled(d)),
      })).filter((g) => g.cards.length > 0)

  const card = (d: ConnectorDescriptor) => (
    <ConnectorCard
      key={d.id}
      descriptor={d}
      config={connectors?.[d.id]}
      storage={storage}
      reportPendingCleanup={reportPendingCleanup}
    />
  )

  return (
    <section aria-label="Connectors" className="py-6 first:pt-0 last:pb-0">
      <div className="sticky -top-6 z-10 bg-panel pb-3">
        <h3 className={eyebrow}>Connectors</h3>
        <label htmlFor="connector-search" className="sr-only">
          Search connectors
        </label>
        <input
          id="connector-search"
          type="search"
          placeholder="Search connectors"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          className={`${control} w-full`}
        />
      </div>

      <div data-testid="connector-scroll">
        {results !== null ? (
          results.length > 0 ? (
            results.map(card)
          ) : (
            <p className="text-sm text-fg-muted">No connector matches.</p>
          )
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="mt-6 first:mt-0">
                <h4 className={eyebrow}>On your board</h4>
                {pinned.map(card)}
              </div>
            )}
            {grouped.map(({ cat, cards }) => (
              <div key={cat} className="mt-6 first:mt-0">
                <h4 className={eyebrow}>{CATEGORY_LABELS[cat]}</h4>
                {cards.map(card)}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}

// Body slot per connector id. Partial (not a full Record): every registered
// connector has an entry below (ics included, added alongside icsDescriptor
// in the registry), but Partial keeps a lookup for any FUTURE unregistered id
// safe — simply undefined -> no body rendered — rather than a total Record
// that would force a placeholder entry into existence for one.
const BODY_COMPONENTS: Partial<Record<ConnectorId, ComponentType<BodyProps>>> = {
  rss: RssBody,
  github: GithubBody,
  gitlab: GitlabBody,
  jira: JiraBody,
  vercel: VercelBody,
  crypto: CryptoBody,
  ics: IcsBody,
  status: StatusBody,
  homeassistant: HomeAssistantBody,
}

function ConnectorCard({
  descriptor,
  config,
  storage,
  reportPendingCleanup,
}: {
  descriptor: ConnectorDescriptor
  config: ConnectorConfig | undefined
  storage: AuroraStorage
  reportPendingCleanup(patterns: readonly string[]): void
}) {
  const enabled = !!config?.enabled
  const state = authState(descriptor, config)
  const identity = descriptor.identityField ? config?.[descriptor.identityField] : undefined
  const Body = BODY_COMPONENTS[descriptor.id]

  return (
    <div className="mt-3 rounded-xl border border-control-border p-3 first:mt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-fg">{descriptor.label}</h4>
          <p className="text-xs text-fg-muted">{descriptor.blurb}</p>
          {/* Status chip: 'token'-auth connectors only (types.ts's
              identityField doc comment states the connected/reconnect rule
              authState implements). Quiet-chip idiom, same as the On/Off
              span below — text-xs, tinted by state, no pill/border. */}
          {descriptor.auth === 'token' && state === 'connected' && (
            <p className="text-xs text-emerald-400">
              Connected {descriptor.identityPhrase ?? 'as'} {String(identity)}
            </p>
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
          {/* A plain storage write — NO permission gesture rides on this enable
              toggle (each connector body requests chrome.permissions at
              connect/add-feed time, not here), so the checkbox→Switch swap
              carries no gesture-ordering concern. */}
          <Switch
            id={`connector-${descriptor.id}-enabled`}
            checked={enabled}
            onChange={(checked) => {
              // Only rss seeds default FIELDS here (its feeds/shownCount, which
              // RssBody needs present the moment it renders). Every other
              // connector supplies its real fields through its OWN body — token
              // connectors (github + Tasks 49-51) at connect time via
              // onConnected — so seeding them with RSS_DEFAULT would persist,
              // and EXPORT, an RSS-shaped {feeds, shownCount} object under an id
              // it doesn't belong to. Keyed to 'rss' specifically (not
              // auth-gated) so no non-rss id ever gets an RSS-shaped seed; a
              // first enable of any other connector writes just { enabled }.
              const seed = descriptor.id === 'rss' ? RSS_DEFAULT : {}
              void storage.update('connectors', (prev) => ({
                ...prev,
                [descriptor.id]: { ...seed, ...prev[descriptor.id], enabled: checked },
              }))
            }}
          />
        </div>
      </div>

      {Body && enabled && <Body config={config} storage={storage} reportPendingCleanup={reportPendingCleanup} />}
    </div>
  )
}

function RssBody({ config, storage, reportPendingCleanup }: BodyProps) {
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
    storage.update('connectors', (prev) => {
      const current = { ...RSS_DEFAULT, ...prev.rss } as RssConfig
      const next = fn(current)
      return next === current ? prev : { ...prev, rss: next }
    })

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

    // `runOriginTransaction` starts chrome.permissions.request before its
    // first await and keeps the owner write plus any rollback under the shared
    // origin lifecycle authority.
    const transaction = await runOriginTransaction(storage, [url], async () => {
      let ownerCommitted = false
      await updateRss((current) => {
        if (current.feeds.includes(url) || current.feeds.length >= MAX_FEEDS) return current
        ownerCommitted = true
        return { ...current, feeds: [...current.feeds, url] }
      })
      if (!ownerCommitted) {
        return {
          ok: false as const,
          message: 'That feed is already in the list.',
        }
      }
      return { ok: true as const, value: undefined, ownerCommitted: true as const }
    })
    reportTransactionCleanup(transaction, reportPendingCleanup)
    const transactionMessage = transactionError(
      transaction,
      'Permission to read that site was denied, so the feed was not added.',
    )
    if (transactionMessage) {
      setError(transactionMessage)
      return
    }

    setNewFeed('')
    setError(null)
  }

  async function handleRemoveFeed(url: string) {
    let candidates: string[] = []
    const transaction = await runOriginTransaction(storage, [], async () => {
      let ownerCommitted = false
      await storage.update('connectors', (prev) => {
        const current = { ...RSS_DEFAULT, ...prev.rss } as RssConfig
        if (!current.feeds.includes(url)) return prev
        ownerCommitted = true
        candidates = descriptorCandidates('rss', { ...current, feeds: [url] })
        return {
          ...prev,
          rss: { ...current, feeds: current.feeds.filter((feed) => feed !== url) },
        }
      })
      return ownerCommitted
        ? { ok: true as const, value: undefined, ownerCommitted: true as const }
        : { ok: false as const, message: 'That feed is no longer in the list.' }
    })
    reportTransactionCleanup(transaction, reportPendingCleanup)
    if (transaction.status !== 'committed') {
      setError(transactionError(transaction, 'Permission to read that site was denied, so the feed was not removed.')!)
      return
    }

    try {
      const cleanup = await releaseUnownedOrigins(storage, candidates)
      if (cleanup.pending.length > 0) reportPendingCleanup(cleanup.pending)
    } catch {
      if (candidates.length > 0) reportPendingCleanup(candidates)
    }
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
        <button type="submit" disabled={atCap} className={submitBtn}>
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
          className={select}
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

// The four sections GithubBody's "Show on your board" row toggles — key
// order here is the display order, LEFT to RIGHT then wrapped, matching the
// picked closeup (github-C-settings-closeup.png).
const VIEW_CHIPS: Array<{ key: keyof GithubViews; label: string }> = [
  { key: 'commitGraph', label: 'Commit graph' },
  { key: 'pulls', label: 'Pull requests' },
  { key: 'issues', label: 'Issues' },
  { key: 'notifications', label: 'Notifications' },
]

// The GitHub connector's card body — the first token connector, and the
// template Tasks 49-51 (gitlab/vercel/jira) copy. All the connect/disconnect
// mechanics (the gesture-safe ensureOrigin-first chain, the single inline
// alert, the per-instance field ids) live in the shared TokenConnectForm
// (Task 47); this body only supplies the pure, connector-specific callbacks.
function GithubBody({ config, storage, reportPendingCleanup }: BodyProps) {
  // Same narrowing rationale as RssBody above: BodyProps.config is the generic
  // union (the body map is shared across ids), and this component is registered
  // only under 'github', so it is always GithubConfig at runtime — one
  // documented cast. Defensive reads (a backup can restore { enabled: true }
  // with neither field) keep the connected/reconnect decision honest.
  const github = config as GithubConfig | undefined
  const username = typeof github?.username === 'string' ? github.username : ''
  const token = typeof github?.token === 'string' ? github.token : ''
  // Show the Disconnect row only when BOTH identity and secret are present.
  // Identity present + secret empty (a backup restores username but never the
  // stripped token) -> connectedAs null, so the FORM renders and the user can
  // re-enter the token; the card shell's own "Reconnect needed" chip
  // (authState) already flags that state above.
  const connectedAs = username && token ? username : null
  // Absent/partial views resolve against the all-on default (same function
  // GithubWidget.tsx reads to decide which sections to fetch/render), so the
  // chips reflect exactly what the card is about to show.
  const views = resolveGithubViews(github)

  return (
    <TokenConnectForm
      storage={storage}
      reportPendingCleanup={reportPendingCleanup}
      fields={[
        {
          id: 'token',
          label: 'Fine-grained personal access token',
          type: 'password',
          placeholder: 'github_pat_…',
        },
      ]}
      // Synchronous by contract (TokenConnectForm awaits ensureOrigin FIRST, in
      // the gesture): a single constant origin, never derived from the token.
      originsFor={() => ['https://api.github.com/*']}
      // Runs AFTER the grant. GET /user resolves the login the config is
      // persisted under; a bad token funnels its status-bearing message to the
      // form's inline alert with nothing stored.
      validate={(values) => whoamiGithub(values.token)}
      onConnected={async (values, identity) => {
        // Replace the whole github config (dropping any feeds/shownCount cruft
        // the generic enable-toggle's RSS default may have seeded) with exactly
        // the token connector's fields — but a RECONNECT (prev.github already
        // held a composed `views`) must carry that choice through: without
        // this, reconnecting after a token was stripped (backup restore, or a
        // deliberate disconnect/reconnect) would silently reset a composed
        // card back to all-on, discarding what the chips below recorded.
        await storage.update('connectors', (prev) => {
          const prevViews = (prev.github as GithubConfig | undefined)?.views
          return {
            ...prev,
            github: {
              enabled: true,
              token: values.token,
              username: identity,
              snapshotEpoch: newSnapshotEpoch(),
              ...(prevViews ? { views: prevViews } : {}),
            },
          }
        })
      }}
      connectedAs={connectedAs}
      connectedExtras={
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Show on your board
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VIEW_CHIPS.map(({ key, label }) => (
              <ToggleChip
                key={key}
                label={label}
                on={views[key]}
                onClick={() =>
                  void storage.update('connectors', (prev) => {
                    if (!prev.github) return prev
                    // Narrowed ONCE (Controller ruling 6's single documented
                    // cast, same as `github` above) so both the resolve call
                    // AND the spread below see GithubConfig, not the wider
                    // ConnectorConfig union — spreading the union's `current`
                    // would type `views` against whichever sibling connector
                    // (gitlab/jira/vercel) TS happened to widen to, which no
                    // longer matches now that each has its OWN views shape.
                    const current = prev.github as GithubConfig
                    const resolved = resolveGithubViews(current)
                    return {
                      ...prev,
                      github: { ...current, views: { ...resolved, [key]: !resolved[key] } },
                    }
                  })
                }
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Your card shows only the sections you turn on.</p>
        </div>
      }
      onDisconnect={() => disconnectTokenConnector(storage, 'github')}
    />
  )
}

// The four sections GitlabBody's "Show on your board" row toggles (Task 76,
// wave 2) — key order is the display order, matching DEFAULT_GITLAB_VIEWS's
// own field order (gitlab.ts) so the resolved defaults and the chip row read
// left-to-right the same way.
const GITLAB_VIEW_CHIPS: Array<{ key: keyof GitlabViews; label: string }> = [
  { key: 'mergeRequests', label: 'Merge requests' },
  { key: 'reviewAsks', label: 'Review asks' },
  { key: 'todos', label: 'To-dos' },
  { key: 'activityGraph', label: 'Activity graph' },
]

// The GitLab connector's card body — github's sibling (Task 49), copying the
// same connect/disconnect mechanics through TokenConnectForm. The one real
// difference: TWO fields (a per-config instance URL alongside the token,
// since GitLab is self-hostable), which flows through into `originsFor`
// deriving the origin from the FIELD VALUE rather than a single constant.
function GitlabBody({ config, storage, reportPendingCleanup }: BodyProps) {
  // Same narrowing rationale as GithubBody above: BodyProps.config is the
  // generic union (the body map is shared across ids), and this component is
  // registered only under 'gitlab', so it is always GitlabConfig at runtime —
  // one documented cast. Defensive reads (a backup can restore { enabled:
  // true } with none of the three fields) keep the connected/reconnect
  // decision honest.
  const gitlab = config as GitlabConfig | undefined
  const username = typeof gitlab?.username === 'string' ? gitlab.username : ''
  const token = typeof gitlab?.token === 'string' ? gitlab.token : ''
  // Same rule as GithubBody: Disconnect only once BOTH identity and secret
  // are present; identity-present + secret-empty (backup restored username
  // but not the stripped token) falls through to the form so the user can
  // re-enter a token — the card shell's "Reconnect needed" chip already flags
  // that state.
  const connectedAs = username && token ? username : null
  // Absent/partial views resolve against DEFAULT_GITLAB_VIEWS (the same
  // resolveViews call GitlabWidget.tsx makes to decide which sections to
  // fetch/render), so the chips reflect exactly what the card is about to
  // show.
  const views = resolveViews(DEFAULT_GITLAB_VIEWS, gitlab?.views)

  return (
    <TokenConnectForm
      storage={storage}
      reportPendingCleanup={reportPendingCleanup}
      fields={[
        {
          id: 'instanceUrl',
          label: 'Instance URL',
          type: 'text',
          placeholder: 'https://gitlab.com',
          defaultValue: 'https://gitlab.com',
        },
        {
          id: 'token',
          label: 'Personal access token',
          type: 'password',
          placeholder: 'glpat-…',
        },
      ]}
      // Synchronous by contract (TokenConnectForm awaits ensureOrigin FIRST,
      // in the gesture): derived from the instance-url FIELD VALUE, unlike
      // github's single constant. originPattern itself validates https (and
      // that the value parses as a URL at all) and throws a clear message on
      // anything else — the form's own catch turns that into its generic
      // inline alert, so no separate validation step is needed here.
      originsFor={(values) => [originPattern(values.instanceUrl)]}
      // Runs AFTER the grant. GET {base}/api/v4/user resolves the username the
      // config is persisted under; a bad token/instance funnels its
      // status-bearing message to the form's inline alert with nothing stored.
      validate={(values) => whoamiGitlab(values.instanceUrl, values.token)}
      onConnected={async (values, identity) => {
        // Replace the whole gitlab config (dropping any stray cruft the
        // generic enable-toggle's `{}` seed left) with exactly the token
        // connector's four fields — but a RECONNECT (prev.gitlab already held
        // a composed `views`) must carry that choice through, same rule
        // GithubBody's own onConnected documents above. This must hold even
        // when `identity` names a DIFFERENT account than the one `views` was
        // composed under (a reconnect on the same instance, different user) —
        // `views` lives on the CARD, not the account, so it is preserved
        // unconditionally rather than gated on identity matching the prior
        // username. The fetch itself always uses the fresh `identity`
        // (passed straight to whoamiGitlab above), never the prior username.
        await storage.update('connectors', (prev) => {
          const prevViews = (prev.gitlab as GitlabConfig | undefined)?.views
          return {
            ...prev,
            gitlab: {
              enabled: true,
              token: values.token,
              instanceUrl: values.instanceUrl,
              username: identity,
              snapshotEpoch: newSnapshotEpoch(),
              ...(prevViews ? { views: prevViews } : {}),
            },
          }
        })
      }}
      connectedAs={connectedAs}
      connectedExtras={
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Show on your board
          </p>
          <div className="flex flex-wrap gap-1.5">
            {GITLAB_VIEW_CHIPS.map(({ key, label }) => (
              <ToggleChip
                key={key}
                label={label}
                on={views[key]}
                onClick={() =>
                  void storage.update('connectors', (prev) => {
                    if (!prev.gitlab) return prev
                    // Narrowed ONCE (same single-documented-cast rule
                    // GithubBody's own click handler documents) so both the
                    // resolve call AND the spread below see GitlabConfig, not
                    // the wider ConnectorConfig union.
                    const current = prev.gitlab as GitlabConfig
                    const resolved = resolveViews(DEFAULT_GITLAB_VIEWS, current.views)
                    return {
                      ...prev,
                      gitlab: { ...current, views: { ...resolved, [key]: !resolved[key] } },
                    }
                  })
                }
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Your card shows only the sections you turn on.</p>
        </div>
      }
      onDisconnect={() => disconnectTokenConnector(storage, 'gitlab')}
    />
  )
}

// The Jira connector's card body — the third token connector (Task 50),
// copying the same connect/disconnect mechanics through TokenConnectForm.
// THREE fields (site, email, API token — Jira Cloud auth is email + token,
// not a bare token like github/gitlab), and `originsFor` derives the origin
// from the site FIELD VALUE via jira.ts's normalizeJiraSite — the SAME
// helper the service (whoamiJira/fetchJira) and the descriptor's origins()
// both call, so the site-shape rule lives in exactly one place. Letting a
// bad shape THROW here (rather than catching it) mirrors GitlabBody's own
// originsFor above: TokenConnectForm's own catch turns it into its generic
// inline alert, no permission requested, nothing stored — the exact
// site-format copy (JIRA_SITE_ERROR) is the SERVICE layer's own contract,
// asserted directly against whoamiJira/fetchJira in jira.test.ts.

// The three sections JiraBody's "Show on your board" row toggles (Task 76,
// wave 2) — key order matches DEFAULT_JIRA_VIEWS's own field order (jira.ts)
// so the resolved defaults and the chip row read left-to-right the same way.
const JIRA_VIEW_CHIPS: Array<{ key: keyof JiraViews; label: string }> = [
  { key: 'assigned', label: 'Assigned issues' },
  { key: 'statusChips', label: 'Status chips' },
  { key: 'dueSoon', label: 'Due soon' },
]

function JiraBody({ config, storage, reportPendingCleanup }: BodyProps) {
  // Same narrowing rationale as GitlabBody above: BodyProps.config is the
  // generic union (the body map is shared across ids), and this component is
  // registered only under 'jira', so it is always JiraConfig at runtime —
  // one documented cast. Defensive reads (a backup can restore { enabled:
  // true } with none of the four fields) keep the connected/reconnect
  // decision honest.
  const jira = config as JiraConfig | undefined
  const displayName = typeof jira?.displayName === 'string' ? jira.displayName : ''
  const apiToken = typeof jira?.apiToken === 'string' ? jira.apiToken : ''
  // Same rule as GithubBody/GitlabBody: Disconnect only once BOTH identity
  // and secret are present; identity-present + secret-empty (backup restored
  // displayName but not the stripped apiToken) falls through to the form so
  // the user can re-enter a token — the card shell's "Reconnect needed" chip
  // already flags that state.
  const connectedAs = displayName && apiToken ? displayName : null
  // Absent/partial views resolve against DEFAULT_JIRA_VIEWS (the same
  // resolveViews call JiraWidget.tsx makes to decide which sections to
  // fetch/render), so the chips reflect exactly what the card is about to
  // show.
  const views = resolveViews(DEFAULT_JIRA_VIEWS, jira?.views)

  return (
    <TokenConnectForm
      storage={storage}
      reportPendingCleanup={reportPendingCleanup}
      fields={[
        {
          id: 'site',
          label: 'Site',
          type: 'text',
          placeholder: 'yoursite.atlassian.net',
        },
        {
          id: 'email',
          label: 'Email',
          type: 'text',
          placeholder: 'you@company.com',
        },
        {
          id: 'apiToken',
          label: 'API token',
          type: 'password',
          placeholder: 'API token',
        },
      ]}
      // Synchronous by contract (TokenConnectForm awaits ensureOrigin FIRST,
      // in the gesture): derived from the site FIELD VALUE via the shared
      // normalizeJiraSite helper. A malformed site throws (caught generically
      // by TokenConnectForm, same as GitlabBody's originPattern call above),
      // so no permission is ever requested for a site that can't be a real
      // Jira Cloud tenant.
      originsFor={(values) => [`https://${normalizeJiraSite(values.site)}/*`]}
      // Runs AFTER the grant. GET {site}/rest/api/3/myself resolves the
      // displayName the config is persisted under; a bad site/email/token
      // funnels its message to the form's inline alert with nothing stored.
      // normalizeJiraSite here is redundant with originsFor's own call above
      // (a site that reached this point already passed that check) but keeps
      // this callback self-contained and guarantees whoamiJira is always
      // called with the CANONICAL site, matching what onConnected persists
      // below.
      validate={(values) => whoamiJira(normalizeJiraSite(values.site), values.email, values.apiToken)}
      onConnected={async (values, identity) => {
        // Replace the whole jira config (dropping any stray cruft the
        // generic enable-toggle's `{}` seed left) with exactly the token
        // connector's five fields — but a RECONNECT (prev.jira already held a
        // composed `views`) must carry that choice through, same rule
        // GithubBody's/GitlabBody's own onConnected document above. `site` is
        // persisted as the NORMALIZED value (matching what originsFor/
        // validate actually granted/checked) rather than whatever raw
        // casing/slashes the user typed.
        await storage.update('connectors', (prev) => {
          const prevViews = (prev.jira as JiraConfig | undefined)?.views
          return {
            ...prev,
            jira: {
              enabled: true,
              email: values.email,
              apiToken: values.apiToken,
              site: normalizeJiraSite(values.site),
              displayName: identity,
              snapshotEpoch: newSnapshotEpoch(),
              ...(prevViews ? { views: prevViews } : {}),
            },
          }
        })
      }}
      connectedAs={connectedAs}
      connectedExtras={
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Show on your board
          </p>
          <div className="flex flex-wrap gap-1.5">
            {JIRA_VIEW_CHIPS.map(({ key, label }) => (
              <ToggleChip
                key={key}
                label={label}
                on={views[key]}
                onClick={() =>
                  void storage.update('connectors', (prev) => {
                    if (!prev.jira) return prev
                    // Narrowed ONCE (same single-documented-cast rule
                    // GithubBody's own click handler documents) so both the
                    // resolve call AND the spread below see JiraConfig, not
                    // the wider ConnectorConfig union.
                    const current = prev.jira as JiraConfig
                    const resolved = resolveViews(DEFAULT_JIRA_VIEWS, current.views)
                    return {
                      ...prev,
                      jira: { ...current, views: { ...resolved, [key]: !resolved[key] } },
                    }
                  })
                }
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Your card shows only the sections you turn on.</p>
        </div>
      }
      onDisconnect={() => disconnectTokenConnector(storage, 'jira')}
    />
  )
}

// The two sections VercelBody's "Show on your board" row toggles (Task 76,
// wave 2) — key order matches DEFAULT_VERCEL_VIEWS's own field order
// (vercel.ts) so the resolved defaults and the chip row read left-to-right
// the same way.
const VERCEL_VIEW_CHIPS: Array<{ key: keyof VercelViews; label: string }> = [
  { key: 'deployments', label: 'Deployments' },
  { key: 'statusSummary', label: 'Status summary' },
]

// The Vercel connector's card body — the fourth token connector (Task 51),
// copying GithubBody's mechanics most closely: ONE field, a single constant
// origin (unlike GitlabBody's/JiraBody's per-config derived one).
function VercelBody({ config, storage, reportPendingCleanup }: BodyProps) {
  // Same narrowing rationale as GithubBody above: BodyProps.config is the
  // generic union (the body map is shared across ids), and this component is
  // registered only under 'vercel', so it is always VercelConfig at runtime —
  // one documented cast. Defensive reads (a backup can restore { enabled:
  // true } with neither field) keep the connected/reconnect decision honest.
  const vercel = config as VercelConfig | undefined
  const username = typeof vercel?.username === 'string' ? vercel.username : ''
  const token = typeof vercel?.token === 'string' ? vercel.token : ''
  // Show the Disconnect row only when BOTH identity and secret are present.
  // Identity present + secret empty (a backup restores username but never the
  // stripped token) -> connectedAs null, so the FORM renders and the user can
  // re-enter the token; the card shell's own "Reconnect needed" chip
  // (authState) already flags that state above.
  const connectedAs = username && token ? username : null
  // Absent/partial views resolve against DEFAULT_VERCEL_VIEWS (the same
  // resolveViews call VercelWidget.tsx makes to decide which sections to
  // fetch/render), so the chips reflect exactly what the card is about to
  // show.
  const views = resolveViews(DEFAULT_VERCEL_VIEWS, vercel?.views)

  return (
    <TokenConnectForm
      storage={storage}
      reportPendingCleanup={reportPendingCleanup}
      fields={[
        {
          id: 'token',
          label: 'Personal access token',
          type: 'password',
          placeholder: 'Personal access token',
        },
      ]}
      // Synchronous by contract (TokenConnectForm awaits ensureOrigin FIRST, in
      // the gesture): a single constant origin, never derived from the token.
      originsFor={() => ['https://api.vercel.com/*']}
      // Runs AFTER the grant. GET /v2/user resolves the username (or email
      // fallback) the config is persisted under; a bad token funnels its
      // status-bearing message to the form's inline alert with nothing stored.
      validate={(values) => whoamiVercel(values.token)}
      onConnected={async (values, identity) => {
        // Replace the whole vercel config (dropping any stray cruft the
        // generic enable-toggle's `{}` seed left) with exactly the token
        // connector's three fields — but a RECONNECT (prev.vercel already
        // held a composed `views`) must carry that choice through, same rule
        // GithubBody's/GitlabBody's/JiraBody's own onConnected document above.
        await storage.update('connectors', (prev) => {
          const prevViews = (prev.vercel as VercelConfig | undefined)?.views
          return {
            ...prev,
            vercel: {
              enabled: true,
              token: values.token,
              username: identity,
              snapshotEpoch: newSnapshotEpoch(),
              ...(prevViews ? { views: prevViews } : {}),
            },
          }
        })
      }}
      connectedAs={connectedAs}
      connectedExtras={
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Show on your board
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VERCEL_VIEW_CHIPS.map(({ key, label }) => (
              <ToggleChip
                key={key}
                label={label}
                on={views[key]}
                onClick={() =>
                  void storage.update('connectors', (prev) => {
                    if (!prev.vercel) return prev
                    // Narrowed ONCE (same single-documented-cast rule
                    // GithubBody's own click handler documents) so both the
                    // resolve call AND the spread below see VercelConfig, not
                    // the wider ConnectorConfig union.
                    const current = prev.vercel as VercelConfig
                    const resolved = resolveViews(DEFAULT_VERCEL_VIEWS, current.views)
                    return {
                      ...prev,
                      vercel: { ...current, views: { ...resolved, [key]: !resolved[key] } },
                    }
                  })
                }
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Your card shows only the sections you turn on.</p>
        </div>
      }
      onDisconnect={() => disconnectTokenConnector(storage, 'vercel')}
    />
  )
}

// The one URL passed to ensureOrigin/originPattern for crypto's connect
// gesture below — resolves to the same 'https://api.coingecko.com/*' pattern
// cryptoDescriptor.origins() derives, so what's granted here always matches
// what the service's own fetchCrypto call targets.
const CRYPTO_ORIGIN_URL = 'https://api.coingecko.com/api/v3/'
// CoinGecko's own id format: lowercase letters, digits, and hyphens (e.g.
// 'bitcoin', 'usd-coin') — the SAME shape whoamiGithub/whoamiVercel would
// validate server-side for a token, except crypto has no server round-trip
// to validate against (auth 'none'), so this is the one and only check a
// bad id ever gets before it's persisted and handed to fetchCrypto.
const CRYPTO_ID_RE = /^[a-z0-9-]+$/
const CRYPTO_MIN_COINS = 2
const CRYPTO_MAX_COINS = 5

/** 'bitcoin, ETH , ,dogecoin' -> ['bitcoin', 'eth', 'dogecoin'] — split on
 *  commas, trim, lowercase, drop empties. Pure (no validation here; the
 *  count/shape checks happen at the call site so their error messages can
 *  name the exact rule that failed). */
function parseCoinIds(raw: string): string[] {
  return raw
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id.length > 0)
}

// The Crypto connector's card body — the first NO-AUTH connector body since
// RSS's own (Task 44): no TokenConnectForm here at all (that component's
// whole shape is built around a token + a whoami validate() round-trip,
// neither of which a no-auth connector has), just one labelled text input
// (CoinGecko ids, comma-separated) and a Save button, closest in spirit to
// RssBody's own handleAddFeed above.
function CryptoBody({ config, storage, reportPendingCleanup }: BodyProps) {
  // Same narrowing rationale as every other body above: BodyProps.config is
  // the generic union (the body map is shared across ids), and this
  // component is registered only under 'crypto', so it is always
  // CryptoConfig at runtime — one documented cast. Array.isArray guards a
  // hand-edited backup restoring { enabled: true } with no coins field.
  const crypto = config as CryptoConfig | undefined
  const coins = Array.isArray(crypto?.coins) ? crypto.coins : []

  const [value, setValue] = useState(() => coins.join(', '))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    // SYNCHRONOUS validation FIRST — this boundary is load-bearing, same
    // discipline as RssBody's handleAddFeed and TokenConnectForm's
    // handleConnect: ensureOrigin (chrome.permissions.request) below must be
    // the FIRST await in this handler, with ZERO awaits ahead of it, or the
    // gesture window chrome.permissions.request needs can close before the
    // call lands.
    const ids = parseCoinIds(value)
    if (ids.length < CRYPTO_MIN_COINS || ids.length > CRYPTO_MAX_COINS) {
      setError(`Enter ${CRYPTO_MIN_COINS} to ${CRYPTO_MAX_COINS} CoinGecko ids, separated by commas.`)
      return
    }
    const bad = ids.find((id) => !CRYPTO_ID_RE.test(id))
    if (bad) {
      setError(`"${bad}" isn't a valid CoinGecko id — use only lowercase letters, numbers, and hyphens.`)
      return
    }

    setSaving(true)
    try {
      const transaction = await runOriginTransaction(storage, [CRYPTO_ORIGIN_URL], async () => {
        // Replace the whole crypto config (dropping any stray cruft the
        // generic enable-toggle's `{}` seed left) with exactly the connector's
        // two fields.
        await storage.update('connectors', (prev) => ({
          ...prev,
          crypto: { enabled: true, coins: ids },
        }))
        return { ok: true as const, value: undefined, ownerCommitted: true as const }
      })
      reportTransactionCleanup(transaction, reportPendingCleanup)
      const transactionMessage = transactionError(
        transaction,
        'Permission to read CoinGecko was denied, so nothing was saved.',
      )
      if (transactionMessage) {
        setError(transactionMessage)
        return
      }

      setValue(ids.join(', '))
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    // Crypto has no token, but its teardown is the same descriptor-derived
    // owner mutation as a token connector's Disconnect path.
    const result = await disconnectTokenConnector(storage, 'crypto')
    if (result.transaction.status !== 'committed') {
      setError("Couldn't clear Crypto because its saved configuration could not be updated. Please try again.")
      return
    }
    setValue('')
    setError(null)
    try {
      const cleanup = await releaseUnownedOrigins(storage, result.candidates)
      if (cleanup.pending.length > 0) reportPendingCleanup(cleanup.pending)
    } catch {
      if (result.candidates.length > 0) reportPendingCleanup(result.candidates)
    }
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2 border-t border-panel-border pt-3"
      onSubmit={(e) => void handleSave(e)}
    >
      <div>
        <label htmlFor="connector-crypto-coins" className="mb-1 block text-xs text-fg-muted">
          Coins (CoinGecko ids, comma-separated)
        </label>
        <input
          id="connector-crypto-coins"
          type="text"
          placeholder="bitcoin, ethereum"
          value={value}
          onChange={(e) => {
            setValue(e.currentTarget.value)
            setError(null)
          }}
          aria-describedby={error ? 'connector-crypto-error' : undefined}
          className={`${control} w-full`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className={submitBtn}>
          Save
        </button>
        {coins.length > 0 && (
          <button
            type="button"
            onClick={() => void handleClear()}
            className="shrink-0 text-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p id="connector-crypto-error" role="alert" className="text-xs text-fg-muted">
          {error}
        </p>
      )}
    </form>
  )
}

// The Calendar (ics) connector's card body — Task 4 of the ics-multi-
// calendar wave grew a single URL into a NAMED LIST of up to MAX_CALENDARS
// calendars. Structurally this now mirrors RssBody above (a `<ul>` of rows
// with a per-row Remove button, an add `<form>`, a shared cap) rather than
// CryptoBody's single Save/Clear form — but keeps the origin semantics that
// made ics distinct from rss to begin with: each entry's origin is DERIVED
// from its own url (like GitlabBody's instanceUrl / JiraBody's site) via the
// same originPattern() the descriptor's own origins() and transaction
// acquisition both call, and removal is share-aware exactly like RssBody's
// handleRemoveFeed — now doubly so, since two calendars in THIS card can
// share a host (two paths under the same iCloud account, say) the same way
// two rss feeds can share one. The url field stays `type="password"` (the
// URL itself IS the secret — ics.ts's own doc comment), and a pasted
// `webcal://` link — Apple's own scheme for a private calendar subscription
// — is silently rewritten to `https://` before anything is validated, so a
// link copied straight out of Apple Calendar's "Public Calendar" toggle
// works untouched. MAX_CALENDARS itself now lives in ics.ts (imported
// above) — icsCalendarsOf enforces the same cap at READ time (hand-edited
// storage over the cap must not render past it), so the write-time guard
// here and that read-time clamp share one source of truth.

/** `new URL(url).host`, or '' for anything unparseable — DISPLAY only (it
 *  never gates validation; originPattern is what decides grantable-or-not,
 *  at add time, below). */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

function IcsBody({ config, storage, reportPendingCleanup }: BodyProps) {
  // Same narrowing rationale as every other body above: BodyProps.config is
  // the generic union (the body map is shared across ids), and this
  // component is registered only under 'ics', so it is always IcsConfig at
  // runtime — one documented cast. icsCalendarsOf/icsViewOf carry the
  // read-time tolerance (legacy `url`, missing/invalid view fields) — see
  // ics.ts — so this component never has to know either fallback shape.
  const ics = config as IcsConfig | undefined
  const calendars = icsCalendarsOf(ics)
  const { view, upcomingCount, meetLinks } = icsViewOf(ics)

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const atCap = calendars.length >= MAX_CALENDARS

  // Every write rebuilds the whole ics entry from normalized parts — the
  // first save is the migration moment: a lingering legacy `url` key is
  // dropped here (icsCalendarsOf/icsViewOf read `prev`, but the write below
  // only ever emits the new shape). `patch` lets the view controls further
  // down write view/upcomingCount/meetLinks immediately, with no Save button,
  // without disturbing the calendar list — and vice versa for add/remove
  // below. meetLinks (Task 89) rides the same v.* pull-forward as
  // view/upcomingCount: a write that doesn't touch it (add/remove, or a view
  // change) still carries the CURRENT effective value forward rather than
  // dropping it.
  const icsConfig = (
    previous: IcsConfig | undefined,
    nextCalendars: IcsCalendar[],
    patch?: Partial<Pick<IcsConfig, 'view' | 'upcomingCount' | 'meetLinks'>>,
  ): IcsConfig => {
    const v = icsViewOf(previous)
    return {
      enabled: true,
      calendars: nextCalendars,
      view: v.view,
      upcomingCount: v.upcomingCount,
      meetLinks: v.meetLinks,
      ...patch,
    }
  }

  const updateIcs = (
    fn: (cals: IcsCalendar[]) => IcsCalendar[],
    patch?: Partial<Pick<IcsConfig, 'view' | 'upcomingCount' | 'meetLinks'>>,
  ) =>
    storage.update('connectors', (prev) => {
      const previous = prev.ics as IcsConfig | undefined
      const current = icsCalendarsOf(previous)
      const next = fn(current)
      return next === current && !patch ? prev : { ...prev, ics: icsConfig(previous, next, patch) }
    })

  // WHY: CalendarWidget.tsx's own gate remounts CalendarInner on every
  // calendars/view/upcomingCount change (its key includes both), but a
  // remount ALONE does not force a refetch — useConnectorSnapshot's mount
  // effect only fetches when the cached snapshot is stale or absent (its
  // TTL-gated contract, 15 minutes for ics). Without this, adding a
  // calendar would show no events for that calendar for up to 15 minutes
  // (the fresh cached snapshot short-circuits the fetch), and removing one
  // would leave stale events whose `cal` indices now point at the WRONG
  // calendars (wrong dots, wrong per-calendar grouping) until the next
  // natural refresh. Deleting the snapshot here is what makes the
  // remounted widget find none and fetch immediately. Deliberately NOT
  // called from the view/upcomingCount-only writes below (those don't
  // invalidate any calendar's cached events, so the cache stays useful).
  const clearIcsSnapshot = () =>
    storage.update('connectorSnapshots', (prev) => {
      const next = { ...prev }
      delete next.ics
      return next
    })

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    // webcal:// is an https ICS feed behind a different scheme — normalize
    // BEFORE validation, case-insensitively, so a link pasted straight from
    // Apple Calendar just works. Synchronous, same load-bearing boundary as
    // every other body's own handler above: the transaction below must be the
    // FIRST await, with ZERO awaits ahead of it.
    const normalized = url.trim().replace(/^webcal:\/\//i, 'https://')
    try {
      originPattern(normalized)
    } catch {
      setError('Enter a calendar address that starts with https:// or webcal://')
      return
    }
    // Duplicate check runs against the NORMALIZED url — a webcal:// respelling
    // of an already-configured https:// entry IS the same calendar.
    if (calendars.some((c) => c.url === normalized)) {
      setError('That calendar is already in the list.')
      return
    }
    if (atCap) return // guarded by the disabled inputs/button too; belt and braces

    // The transaction invokes chrome.permissions.request before this handler's
    // first await, per the comment above.
    const trimmedName = name.trim()
    const transaction = await runOriginTransaction(storage, [normalized], async () => {
      let ownerCommitted = false
      let abortMessage = 'That calendar is already in the list.'
      await updateIcs((cals) => {
        // Re-checked HERE (not just the disabled inputs/button, and not just
        // the `atCap` closed over from render): two rapid submits before a
        // re-render both read the same stale `atCap`, so without re-deriving
        // the cap against THIS write's own `cals` a double-submit could push
        // past MAX_CALENDARS. Belt and braces with icsCalendarsOf's own
        // .slice(0, MAX_CALENDARS) (ics.ts) — that one guards hand-edited
        // storage, this one guards the write path itself.
        if (cals.some((c) => c.url === normalized)) return cals
        if (cals.length >= MAX_CALENDARS) {
          abortMessage = `Up to ${MAX_CALENDARS} calendars. Remove one to add another.`
          return cals
        }
        ownerCommitted = true
        return [...cals, { name: trimmedName || `Calendar ${cals.length + 1}`, url: normalized }]
      })
      return ownerCommitted
        ? { ok: true as const, value: undefined, ownerCommitted: true as const }
        : { ok: false as const, message: abortMessage }
    })
    reportTransactionCleanup(transaction, reportPendingCleanup)
    const transactionMessage = transactionError(
      transaction,
      'Permission to read that calendar was denied, so nothing was saved.',
    )
    if (transactionMessage) {
      setError(transactionMessage)
      return
    }
    setName('')
    setUrl('')
    try {
      await clearIcsSnapshot()
    } catch {
      setError('The calendar was saved, but its cached events could not be cleared.')
    }
  }

  async function handleRemove(target: string) {
    // The removed row's descriptor-derived candidate is captured inside the
    // authoritative owner write. The global release runs only afterwards.
    let candidates: string[] = []
    const transaction = await runOriginTransaction(storage, [], async () => {
      let ownerCommitted = false
      await storage.update('connectors', (prev) => {
        const previous = prev.ics as IcsConfig | undefined
        const current = icsCalendarsOf(previous)
        const removed = current.find((calendar) => calendar.url === target)
        if (!removed) return prev
        ownerCommitted = true
        candidates = descriptorCandidates('ics', icsConfig(previous, [removed]))
        return { ...prev, ics: icsConfig(previous, current.filter((calendar) => calendar.url !== target)) }
      })
      return ownerCommitted
        ? { ok: true as const, value: undefined, ownerCommitted: true as const }
        : { ok: false as const, message: 'That calendar is no longer in the list.' }
    })
    reportTransactionCleanup(transaction, reportPendingCleanup)
    if (transaction.status !== 'committed') {
      setError(transactionError(transaction, 'Permission to read that calendar was not removed.')!)
      return
    }
    // Cache invalidation and permission release are intentionally independent:
    // either failure must not suppress the other completed operation.
    const [snapshot, release] = await Promise.allSettled([
      clearIcsSnapshot(),
      releaseUnownedOrigins(storage, candidates),
    ])
    if (snapshot.status === 'rejected') {
      setError('The calendar was removed, but its cached events could not be cleared.')
    }
    if (release.status === 'fulfilled') {
      if (release.value.pending.length > 0) reportPendingCleanup(release.value.pending)
    } else if (candidates.length > 0) {
      reportPendingCleanup(candidates)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-panel-border pt-3">
      <ul className="flex flex-col gap-1">
        {calendars.map((cal, i) => (
          <li key={cal.url} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              {/* Dot keyed by LIST POSITION, same rule CALENDAR_DOT_CLASSES'
                  own doc comment states (ics.ts) — the widget's rows key their
                  dots the identical way, so a calendar's color never drifts
                  between settings and the card. */}
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${CALENDAR_DOT_CLASSES[i % CALENDAR_DOT_CLASSES.length]}`}
              />
              <span className="min-w-0 truncate text-xs text-fg">{cal.name}</span>
              <span className="shrink-0 truncate text-xs text-fg-muted">{hostOf(cal.url)}</span>
            </span>
            <button
              type="button"
              aria-label={`Remove ${cal.name}`}
              onClick={() => void handleRemove(cal.url)}
              // cursor-pointer explicit (Task 5's own interaction probe
              // caught its absence): Tailwind v4 preflight sets `button {
              // cursor: default }` — the same fix shared.ts's own comment
              // documents for every OTHER button class in this control kit.
              // RssBody's identical Remove button (above) carries the same
              // gap; out of scope for this ics-only wave, left as found.
              className="shrink-0 cursor-pointer rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <form className="flex flex-col gap-2" onSubmit={(e) => void handleAdd(e)}>
        <div>
          <label htmlFor="connector-ics-name" className="mb-1 block text-xs text-fg-muted">
            Name
          </label>
          <input
            id="connector-ics-name"
            type="text"
            placeholder="Personal"
            value={name}
            disabled={atCap}
            onChange={(e) => setName(e.currentTarget.value)}
            className={`${control} w-full disabled:opacity-50`}
          />
        </div>
        <div>
          <label htmlFor="connector-ics-url" className="mb-1 block text-xs text-fg-muted">
            Secret calendar address (ICS URL)
          </label>
          <input
            id="connector-ics-url"
            type="password"
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            value={url}
            disabled={atCap}
            onChange={(e) => {
              setUrl(e.currentTarget.value)
              setError(null)
            }}
            aria-describedby={error ? 'connector-ics-error' : undefined}
            className={`${control} w-full disabled:opacity-50`}
          />
          {/* Helper text VERBATIM per the brief — do not paraphrase. */}
          <p className="mt-1 text-xs text-fg-muted">
            In Apple Calendar: turn on &quot;Public Calendar&quot; (only the calendar&apos;s owner sees
            the option) and paste the webcal link here. Google/Outlook: Settings → your calendar →
            &quot;Secret address in iCal format&quot;. It stays on this device.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={atCap} className={submitBtn}>
            Add
          </button>
          {atCap && (
            <p className="text-xs text-fg-muted">Up to {MAX_CALENDARS} calendars. Remove one to add another.</p>
          )}
        </div>

        {error && (
          <p id="connector-ics-error" role="alert" className="text-xs text-fg-muted">
            {error}
          </p>
        )}
      </form>

      <div className="flex items-center justify-between gap-2 pt-1">
        <label htmlFor="connector-ics-view" className="text-sm text-fg-muted">
          Show
        </label>
        <div className="flex items-center gap-2">
          <select
            id="connector-ics-view"
            value={view}
            onChange={(e) => {
              const next = e.currentTarget.value as IcsConfig['view']
              void updateIcs((cals) => cals, { view: next })
            }}
            className={select}
          >
            <option value="today">Today</option>
            <option value="upcoming">Upcoming</option>
            <option value="per-calendar">One per calendar</option>
          </select>
          {/* The count select only means anything for 'upcoming' — icsViewOf
              still defaults/clamps upcomingCount regardless, so a value
              chosen here and never revisited (e.g. after switching away and
              back) stays exactly what was picked. */}
          {view === 'upcoming' && (
            <select
              aria-label="How many upcoming events"
              value={upcomingCount}
              onChange={(e) => {
                const n = Number(e.currentTarget.value)
                void updateIcs((cals) => cals, { upcomingCount: n })
              }}
              className={select}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* No clearIcsSnapshot() call here (contrast handleAdd/handleRemove
          above): meetUrl already lives inside the cached snapshot untouched
          (Task 88 stores it on the event; this toggle only gates whether the
          widget is ALLOWED to render it) — there is nothing stale to
          invalidate, so this is render-only, same shape as the view/count
          selects just above (which also write with no Save button and no
          snapshot clear). */}
      <div className={row}>
        <label htmlFor="connector-ics-meetlinks" className={label}>
          Meeting links
        </label>
        <Switch
          id="connector-ics-meetlinks"
          checked={meetLinks}
          onChange={(checked) => void updateIcs((cals) => cals, { meetLinks: checked })}
        />
      </div>
    </div>
  )
}

// The Status connector's card body — Task 85 (W3-SP2), the eighth connector
// and third no-auth one (crypto.ts/ics.ts's own company). Structurally this
// is IcsBody's `<ul>`-of-rows-plus-add-affordance shape again (list, then an
// add control, a shared cap), but with TWO ways to add instead of one: a
// curated `<select>` (CURATED_STATUS, status.ts's verified six) for the
// common case, and a custom name+url form underneath for anything else. Both
// converge on the single addService() below — same "one function, many call
// sites" discipline RssBody/IcsBody's own updateXxx helpers use for their
// writes, just applied to the whole gesture chain this time, not only the
// persist step.
//
// THE PACT, settings side, restated for status (StatusWidget.tsx's own doc
// comment names it too): a services-LIST-changing save clears
// connectorSnapshots.status so the widget's remount (keyed on the service
// urls) finds no cached snapshot and fetches immediately, rather than
// serving up to ttlMs-stale (5 min) data for a service that was just added,
// or stale index-aligned data for one that was just removed.
//
// GESTURE QUESTION (Task 85 brief, VERIFY in Task 86's real-browser probe):
// chrome.permissions.request must run inside an unbroken user-gesture call
// chain, and every OTHER add-flow in this file rides a click (a button's
// onClick, or a <form>'s onSubmit triggered by one) — never previously
// tested is whether a <select>'s onChange fires with the SAME gesture
// privilege a click does. If Chrome accepts it (curated pick = ONE
// interaction, no separate Add click), great; if the grant prompt silently
// fails to appear from onChange, the fix is cheap by construction: addService
// already takes (name, url) as plain arguments rather than reading component
// state, so the fallback is just moving its call from handleCuratedPick
// (fired on change) to a small dedicated "Add" button beside the select
// (fired on click, reading a held `curatedPick` selection) — TWO call sites
// today (handleCuratedPick below, handleCustomAdd further down), and the
// flip touches only which of them the select's own choice feeds through, not
// addService itself.
function StatusBody({ config, storage, reportPendingCleanup }: BodyProps) {
  // Same narrowing rationale as every other body above: BodyProps.config is
  // the generic union (the body map is shared across ids), and this
  // component is registered only under 'status', so it is always
  // StatusConfig at runtime — one documented cast. statusServicesOf carries
  // the read-time tolerance (malformed entries, the MAX_SERVICES cap) — see
  // status.ts — so this component never has to know either fallback shape.
  const status = config as StatusConfig | undefined
  const services = statusServicesOf(status)
  const atCap = services.length >= MAX_SERVICES

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Every write rebuilds the whole status entry from prev's OWN current
  // list (never the render-time `services` above) — same double-submit
  // discipline RssBody's updateRss/IcsBody's updateIcs document: storage.update
  // serializes per key and hands each call the prior call's own result, so a
  // second write queued before a re-render still sees the first's effect.
  const updateStatus = (fn: (services: StatusService[]) => StatusService[]) =>
    storage.update('connectors', (prev) => {
      const current = statusServicesOf(prev.status as StatusConfig | undefined)
      const next = fn(current)
      return next === current ? prev : { ...prev, status: { enabled: true, services: next } }
    })

  // THE PACT's settings-side helper, named identically to IcsBody's own
  // clearIcsSnapshot for the identical reason (see that function's doc
  // comment for the full rationale) — deliberately NOT called from anywhere
  // that doesn't change the services list.
  const clearStatusSnapshot = () =>
    storage.update('connectorSnapshots', (prev) => {
      const next = { ...prev }
      delete next.status
      return next
    })

  // THE gesture chain, shared by both add paths (see the GESTURE QUESTION
  // doc comment above): sync validate (originPattern, https-only) ->
  // duplicate check on the RESOLVED url (a curated pick and a custom entry
  // collide exactly like two custom entries would, since both are checked
  // against the same `services` list by url) -> cap check -> transaction
  // acquisition -> persist -> clear the snapshot. Returns whether the add
  // actually landed, so each call site can decide its OWN post-success
  // behavior (the custom form clears its two inputs; the curated select has
  // already reset itself before calling this, gesture or no).
  async function addService(rawName: string, rawUrl: string): Promise<boolean> {
    setError(null)
    try {
      originPattern(rawUrl)
    } catch {
      setError('Enter a status page URL that starts with https://')
      return false
    }
    if (services.some((s) => s.url === rawUrl)) {
      setError('That service is already in the list.')
      return false
    }
    if (atCap) return false // guarded by the disabled select/inputs/button too; belt and braces

    // The transaction invokes chrome.permissions.request before this handler's
    // first await, per the comment above.
    const trimmedName = rawName.trim()
    const transaction = await runOriginTransaction(storage, [rawUrl], async () => {
      let ownerCommitted = false
      let abortMessage = 'That service is already in the list.'
      await updateStatus((svcs) => {
        // Re-checked HERE (not just the disabled controls, and not just the
        // `atCap`/`services` closed over from render) — same belt-and-braces
        // re-derivation IcsBody's handleAdd documents for its own write.
        if (svcs.some((s) => s.url === rawUrl)) return svcs
        if (svcs.length >= MAX_SERVICES) {
          abortMessage = `Up to ${MAX_SERVICES} services.`
          return svcs
        }
        // Empty name -> the url's host, NOT "Service N": unlike a calendar
        // (IcsBody's own "Calendar N" default), a status page's host IS
        // meaningful information (which service this actually is), so
        // falling back to it loses nothing a numbered placeholder would have
        // hidden anyway.
        ownerCommitted = true
        return [...svcs, { name: trimmedName || hostOf(rawUrl), url: rawUrl }]
      })
      return ownerCommitted
        ? { ok: true as const, value: undefined, ownerCommitted: true as const }
        : { ok: false as const, message: abortMessage }
    })
    reportTransactionCleanup(transaction, reportPendingCleanup)
    const transactionMessage = transactionError(
      transaction,
      'Permission to read that status page was denied, so nothing was saved.',
    )
    if (transactionMessage) {
      setError(transactionMessage)
      return false
    }
    try {
      await clearStatusSnapshot()
    } catch {
      setError('The service was saved, but its cached service statuses could not be cleared.')
    }
    return true
  }

  // Call site 1 of 2 (see the GESTURE QUESTION doc comment above): the
  // curated select's own onChange. Resets the select back to its placeholder
  // BEFORE the async chain starts (not after) — synchronously, so a retry of
  // the SAME entry (e.g. re-picking GitHub after a denial) still fires a
  // change event; deferring the reset to addService's return would leave the
  // select stuck on the picked value between click and settle, silently
  // eating that retry.
  function handleCuratedPick(e: React.ChangeEvent<HTMLSelectElement>) {
    const pickedUrl = e.currentTarget.value
    e.currentTarget.value = ''
    const picked = CURATED_STATUS.find((c) => c.url === pickedUrl)
    if (!picked) return // the disabled placeholder option, or a stray event
    void addService(picked.name, picked.url)
  }

  // Call site 2 of 2: the custom name+url form below.
  async function handleCustomAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (await addService(name, url.trim())) {
      setName('')
      setUrl('')
    }
  }

  async function handleRemove(target: string) {
    // The removed row's descriptor-derived candidate is captured inside the
    // authoritative owner write; cache invalidation and release follow
    // independently so neither failure suppresses the other.
    let candidates: string[] = []
    const transaction = await runOriginTransaction(storage, [], async () => {
      let ownerCommitted = false
      await storage.update('connectors', (prev) => {
        const previous = prev.status as StatusConfig | undefined
        const current = statusServicesOf(previous)
        const removed = current.find((service) => service.url === target)
        if (!removed) return prev
        ownerCommitted = true
        candidates = descriptorCandidates('status', { ...previous, enabled: true, services: [removed] })
        return {
          ...prev,
          status: { enabled: true, services: current.filter((service) => service.url !== target) },
        }
      })
      return ownerCommitted
        ? { ok: true as const, value: undefined, ownerCommitted: true as const }
        : { ok: false as const, message: 'That service is no longer in the list.' }
    })
    reportTransactionCleanup(transaction, reportPendingCleanup)
    if (transaction.status !== 'committed') {
      setError(transactionError(transaction, 'Permission to read that status page was not removed.')!)
      return
    }
    const [snapshot, release] = await Promise.allSettled([
      clearStatusSnapshot(),
      releaseUnownedOrigins(storage, candidates),
    ])
    if (snapshot.status === 'rejected') {
      setError('The service was removed, but its cached service statuses could not be cleared.')
    }
    if (release.status === 'fulfilled') {
      if (release.value.pending.length > 0) reportPendingCleanup(release.value.pending)
    } else if (candidates.length > 0) {
      reportPendingCleanup(candidates)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-panel-border pt-3">
      <ul className="flex flex-col gap-1">
        {services.map((s) => (
          <li key={s.url} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-xs text-fg">{s.name}</span>
              <span className="shrink-0 truncate text-xs text-fg-muted">{hostOf(s.url)}</span>
            </span>
            <button
              type="button"
              aria-label={`Remove ${s.name}`}
              onClick={() => void handleRemove(s.url)}
              className="shrink-0 cursor-pointer rounded p-1 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div>
        <label htmlFor="connector-status-curated" className="mb-1 block text-xs text-fg-muted">
          Add a service
        </label>
        <select
          id="connector-status-curated"
          defaultValue=""
          disabled={atCap}
          onChange={handleCuratedPick}
          className={`${select} w-full disabled:opacity-50`}
        >
          <option value="" disabled>
            Choose a service…
          </option>
          {/* Every curated entry always renders (stable list, no reordering)
              — one already in `services` is a DISABLED option rather than an
              omitted one, so the picker's shape doesn't shift under the user
              as they add things. addService's own duplicate check above is
              the real belt-and-braces guard either way. */}
          {CURATED_STATUS.map((c) => (
            <option key={c.url} value={c.url} disabled={services.some((s) => s.url === c.url)}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <form className="flex flex-col gap-2" onSubmit={(e) => void handleCustomAdd(e)}>
        <div>
          <label htmlFor="connector-status-name" className="mb-1 block text-xs text-fg-muted">
            Name
          </label>
          <input
            id="connector-status-name"
            type="text"
            placeholder="My API"
            value={name}
            disabled={atCap}
            onChange={(e) => setName(e.currentTarget.value)}
            className={`${control} w-full disabled:opacity-50`}
          />
        </div>
        <div>
          <label htmlFor="connector-status-url" className="mb-1 block text-xs text-fg-muted">
            Status page URL
          </label>
          <input
            id="connector-status-url"
            type="url"
            inputMode="url"
            placeholder="https://status.example.com/api/v2/status.json"
            value={url}
            disabled={atCap}
            onChange={(e) => {
              setUrl(e.currentTarget.value)
              setError(null)
            }}
            aria-describedby={error ? 'connector-status-error' : undefined}
            className={`${control} w-full disabled:opacity-50`}
          />
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={atCap} className={submitBtn}>
            Add
          </button>
          {atCap && <p className="text-xs text-fg-muted">Up to {MAX_SERVICES} services.</p>}
        </div>

        {error && (
          <p id="connector-status-error" role="alert" className="text-xs text-fg-muted">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}

// The Home Assistant connector's card body — Task 101 (W3-SP5), the ninth
// connector and the first with an entity-picker dialog mounted inside a
// card. TokenConnectForm wiring follows GitlabBody's skeleton (:566-691)
// verbatim: narrowing cast + defensive reads, originsFor deriving the
// instance's https origin from the FIELD VALUE (its throw — a non-https URL
// — IS the https-only enforcement surface, same as GitlabBody's own), and
// onConnected persisting the four token-connector fields while PRESERVING
// any already-picked entities/actions across a reconnect (the same
// views-preservation idiom GitlabBody's own onConnected documents at
// :629/:637 — a reconnect, even as a different HA user, must never reset a
// composed card).
//
// connectedExtras adds a second surface beyond TokenConnectForm's own
// Disconnect row: a picked-summary line, a "Choose entities" button, and the
// EntityPickerDialog (Task 100) itself — mounted here, not inside the
// dialog's own module, since the dialog is pure-presentational and this
// card owns fetching states and persisting the pick.
//
// Choose-entities gesture (plan-pinned ruling): the button FETCHES FIRST and
// opens only on arrival — no placeholder "Loading entities…" dialog state,
// just a real disabled + "Loading…" state on the button itself while the
// fetch is in flight. A null result (fetchAllStates' own never-throw
// failure signal) flips an inline role="alert" and leaves the dialog
// closed; a real result seeds the dialog's states and opens it.
//
// THE PACT: saving a pick persists entities+actions AND clears
// connectorSnapshots.homeassistant — two adjacent storage.update calls,
// mirroring StatusBody's clearStatusSnapshot (:1526-1531) exactly, so the
// widget's next mount finds no stale cached snapshot and fetches the newly
// picked entities immediately rather than serving up to ttlMs-stale data.
function HomeAssistantBody({ config, storage, reportPendingCleanup }: BodyProps) {
  // Same narrowing rationale as every other body above: BodyProps.config is
  // the generic union (the body map is shared across ids), and this
  // component is registered only under 'homeassistant' — one documented
  // cast. Defensive reads (a backup can restore { enabled: true } with none
  // of the token fields) keep the connected/reconnect decision honest.
  const ha = config as HomeAssistantConfig | undefined
  const instanceUrl = typeof ha?.instanceUrl === 'string' ? ha.instanceUrl : ''
  const token = typeof ha?.token === 'string' ? ha.token : ''
  const locationName = typeof ha?.locationName === 'string' ? ha.locationName : ''
  // Same rule as every other token connector: Disconnect only once BOTH
  // identity and secret are present; identity-present + secret-empty
  // (backup restored locationName but not the stripped token) falls through
  // to the form so the user can re-enter a token — the card shell's
  // "Reconnect needed" chip already flags that state.
  const connectedAs = locationName && token ? locationName : null
  // Read-time normalization boundary (homeassistant.ts) — every caller,
  // including this card, goes through it rather than reading config.entities
  // / config.actions directly.
  const entities = haEntitiesOf(ha)
  const actions = haActionsOf(ha)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerStates, setPickerStates] = useState<HaState[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)

  // THE PACT's settings-side write (this function's doc comment has the full
  // rationale): rebuilds the config from prev's OWN current entry — never
  // the render-time `ha` above — same double-submit discipline StatusBody's
  // updateStatus documents (:1516), then clears the cached snapshot as a
  // second, adjacent write.
  async function handleSaveEntities(nextEntities: HaEntityRef[], nextActions: HaAction[]) {
    await storage.update('connectors', (prev) => {
      const current = prev.homeassistant as HomeAssistantConfig | undefined
      return {
        ...prev,
        homeassistant: {
          enabled: true,
          instanceUrl: current?.instanceUrl,
          token: current?.token,
          locationName: current?.locationName,
          snapshotEpoch: current?.snapshotEpoch,
          entities: nextEntities,
          actions: nextActions,
        },
      }
    })
    await storage.update('connectorSnapshots', (prev) => {
      const next = { ...prev }
      delete next.homeassistant
      return next
    })
  }

  // Fetch-first, open-on-arrival (see this function's doc comment for the
  // pinned ruling this implements). setPickerError(null) up front so a retry
  // after a failure clears the prior alert even before the new fetch settles.
  async function handleChooseEntities() {
    setPickerError(null)
    setPickerLoading(true)
    try {
      const result = await fetchAllStates(instanceUrl, token)
      if (result === null) {
        setPickerError("Couldn't reach your instance. Check the URL and token, then try again.")
        return
      }
      setPickerStates(result)
      setPickerOpen(true)
    } finally {
      setPickerLoading(false)
    }
  }

  return (
    <>
      {/* Above the form only — once connected, the Disconnect row replaces
          the form and the https requirement is no longer actionable
          information. */}
      {connectedAs === null && (
        <p className={`${label} mt-3`}>
          Requires https. Nabu Casa cloud URLs and reverse-proxied instances work; plain
          http://homeassistant.local:8123 cannot be granted.
        </p>
      )}
      <TokenConnectForm
        storage={storage}
        reportPendingCleanup={reportPendingCleanup}
        fields={[
          {
            id: 'instanceUrl',
            label: 'Instance URL',
            type: 'text',
            placeholder: 'https://your-home.ui.nabu.casa',
          },
          {
            id: 'token',
            label: 'Long-lived access token',
            type: 'password',
            placeholder: 'eyJ…',
          },
        ]}
        // Synchronous by contract (TokenConnectForm awaits ensureOrigin
        // FIRST, in the gesture): derived from the instance-url FIELD
        // VALUE. originPattern itself validates https (and that the value
        // parses as a URL at all) and throws a clear message on anything
        // else — the form's own catch turns that into its generic inline
        // alert, which IS the https-only enforcement surface (no separate
        // validation step needed here).
        originsFor={(values) => [originPattern(values.instanceUrl)]}
        // Runs AFTER the grant. GET {base}/api/config resolves the location
        // name the config is persisted under; a bad token/instance funnels
        // its status-bearing message to the form's inline alert with
        // nothing stored.
        validate={(values) => whoamiHomeAssistant(values.instanceUrl, values.token)}
        onConnected={async (values, identity) => {
          await storage.update('connectors', (prev) => {
            const prevHa = prev.homeassistant as HomeAssistantConfig | undefined
            return {
              ...prev,
              homeassistant: {
                enabled: true,
                instanceUrl: values.instanceUrl,
                token: values.token,
                locationName: identity,
                snapshotEpoch: newSnapshotEpoch(),
                ...(prevHa?.entities ? { entities: prevHa.entities } : {}),
                ...(prevHa?.actions ? { actions: prevHa.actions } : {}),
              },
            }
          })
        }}
        connectedAs={connectedAs}
        connectedExtras={
          <div>
            <p className="text-xs text-fg-muted">
              {entities.length === 0 && actions.length === 0
                ? 'No entities picked yet'
                : `${entities.length} chips · ${actions.length} actions`}
            </p>
            <button
              type="button"
              onClick={() => void handleChooseEntities()}
              disabled={pickerLoading}
              className={`${btnQuiet} mt-2`}
            >
              {pickerLoading ? 'Loading…' : 'Choose entities'}
            </button>
            <p className="mt-2 text-xs text-fg-muted">
              Choosing entities loads the full entity list from your Home Assistant instance for this picker only. Regular dashboard updates request only your selected entities.
            </p>
            {pickerError && (
              <p role="alert" className="mt-2 text-xs text-fg-muted">
                {pickerError}
              </p>
            )}
            <EntityPickerDialog
              open={pickerOpen}
              states={pickerStates}
              entities={entities}
              actions={actions}
              onCancel={() => setPickerOpen(false)}
              onSave={(nextEntities, nextActions) => {
                setPickerOpen(false)
                void handleSaveEntities(nextEntities, nextActions)
              }}
            />
          </div>
        }
        onDisconnect={() => disconnectTokenConnector(storage, 'homeassistant')}
      />
    </>
  )
}
