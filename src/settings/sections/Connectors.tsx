import { useState, type ComponentType } from 'react'
import type { AuroraStorage } from '../../lib/storage/index'
import type { AuroraData } from '../../lib/storage/schema'
import type { ConnectorConfig, ConnectorDescriptor, ConnectorId, GithubConfig, GitlabConfig, JiraConfig, RssConfig } from '../../services/connectors/types'
import { CONNECTORS, releasableOrigins } from '../../services/connectors/registry'
import { whoamiGithub } from '../../services/connectors/github'
import { whoamiGitlab } from '../../services/connectors/gitlab'
import { whoamiJira, normalizeJiraSite } from '../../services/connectors/jira'
import { ensureOrigin, removeOrigin, originPattern } from '../../services/permissions'
import { TokenConnectForm } from './TokenConnectForm'
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

// Body slot per connector id. Partial (not a full Record): jira/vercel/
// crypto/ics land in their own later sub-project-2 tasks, and this map
// carries no placeholder entries for them (a lookup for an unregistered id is
// simply undefined -> no body rendered).
const BODY_COMPONENTS: Partial<Record<ConnectorId, ComponentType<BodyProps>>> = {
  rss: RssBody,
  github: GithubBody,
  gitlab: GitlabBody,
  jira: JiraBody,
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

// The GitHub connector's card body — the first token connector, and the
// template Tasks 49-51 (gitlab/vercel/jira) copy. All the connect/disconnect
// mechanics (the gesture-safe ensureOrigin-first chain, the single inline
// alert, the per-instance field ids) live in the shared TokenConnectForm
// (Task 47); this body only supplies the pure, connector-specific callbacks.
function GithubBody({ config, storage }: BodyProps) {
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

  return (
    <TokenConnectForm
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
        // the token connector's three fields.
        await storage.update('connectors', (prev) => ({
          ...prev,
          github: { enabled: true, token: values.token, username: identity },
        }))
      }}
      connectedAs={connectedAs}
      onDisconnect={async () => {
        // Compute what's safe to revoke BEFORE clearing the config (releasable-
        // Origins needs github's own config present to derive its origins), then
        // drop the entry and revoke each released origin. releasableOrigins runs
        // through the REAL registry, so an origin another enabled connector also
        // claimed would be withheld — api.github.com is github's alone today.
        const current = await storage.get('connectors')
        const releasable = releasableOrigins('github', current)
        await storage.update('connectors', (prev) => {
          const next = { ...prev }
          delete next.github
          return next
        })
        await Promise.all(releasable.map((origin) => removeOrigin(origin)))
      }}
    />
  )
}

// The GitLab connector's card body — github's sibling (Task 49), copying the
// same connect/disconnect mechanics through TokenConnectForm. The one real
// difference: TWO fields (a per-config instance URL alongside the token,
// since GitLab is self-hostable), which flows through into `originsFor`
// deriving the origin from the FIELD VALUE rather than a single constant.
function GitlabBody({ config, storage }: BodyProps) {
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

  return (
    <TokenConnectForm
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
        // connector's four fields.
        await storage.update('connectors', (prev) => ({
          ...prev,
          gitlab: { enabled: true, token: values.token, instanceUrl: values.instanceUrl, username: identity },
        }))
      }}
      connectedAs={connectedAs}
      onDisconnect={async () => {
        // Compute what's safe to revoke BEFORE clearing the config
        // (releasableOrigins needs gitlab's own config present to derive its
        // origin), then drop the entry and revoke each released origin.
        // releasableOrigins runs through the REAL registry, so an origin
        // another enabled connector (or another gitlab-pointed-at-the-same-
        // instance connector, hypothetically) still claimed would be
        // withheld.
        const current = await storage.get('connectors')
        const releasable = releasableOrigins('gitlab', current)
        await storage.update('connectors', (prev) => {
          const next = { ...prev }
          delete next.gitlab
          return next
        })
        await Promise.all(releasable.map((origin) => removeOrigin(origin)))
      }}
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
function JiraBody({ config, storage }: BodyProps) {
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

  return (
    <TokenConnectForm
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
        // connector's five fields. `site` is persisted as the NORMALIZED
        // value (matching what originsFor/validate actually granted/checked)
        // rather than whatever raw casing/slashes the user typed.
        await storage.update('connectors', (prev) => ({
          ...prev,
          jira: {
            enabled: true,
            email: values.email,
            apiToken: values.apiToken,
            site: normalizeJiraSite(values.site),
            displayName: identity,
          },
        }))
      }}
      connectedAs={connectedAs}
      onDisconnect={async () => {
        // Compute what's safe to revoke BEFORE clearing the config
        // (releasableOrigins needs jira's own config present to derive its
        // origin), then drop the entry and revoke each released origin.
        // releasableOrigins runs through the REAL registry, so an origin
        // another enabled connector still claimed would be withheld.
        const current = await storage.get('connectors')
        const releasable = releasableOrigins('jira', current)
        await storage.update('connectors', (prev) => {
          const next = { ...prev }
          delete next.jira
          return next
        })
        await Promise.all(releasable.map((origin) => removeOrigin(origin)))
      }}
    />
  )
}
