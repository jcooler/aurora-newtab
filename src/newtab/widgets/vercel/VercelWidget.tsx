import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchVercel, relAge, type VercelData, type VercelDeployment } from '../../../services/connectors/vercel'
import type { ConnectorConfig, VercelConfig } from '../../../services/connectors/types'

const MAX_DEPLOYMENTS = 5

/** Narrow `connectors.vercel` (a ConnectorConfig union member, or undefined)
 *  to a CONNECTED VercelConfig, defensively — same rationale and shape as
 *  GithubWidget's connectedGithub: schema.ts ties every connector id to the
 *  whole union rather than its specific member, and a hand-edited backup can
 *  legally restore { enabled: true } with no token at all. Gate defends
 *  token string-ness (the one field the fetch below needs). */
function connectedVercel(config: ConnectorConfig | undefined): VercelConfig | null {
  if (!config || !('token' in config)) return null
  const vercel = config as VercelConfig
  if (!vercel.enabled || typeof vercel.token !== 'string' || vercel.token.length === 0) return null
  return vercel
}

export default function VercelWidget() {
  // Zero-hooks-in-the-gate split, same as GithubWidget/GitlabWidget/JiraWidget:
  // the one useStoredKey read runs every render (Rules of Hooks stay
  // satisfied), but a disabled/unconnected connector never mounts VercelInner
  // and therefore never runs useConnectorSnapshot's subscribe/refresh.
  const [connectors] = useStoredKey('connectors')
  const vercel = connectedVercel(connectors?.vercel)
  if (!vercel) return null
  return <VercelInner token={vercel.token} />
}

function VercelInner({ token }: { token: string }) {
  // Stale-while-refreshing: the hook returns the cached snapshot immediately
  // and refreshes once per mount, carrying `prev` so fetchVercel's
  // quiet-failure path keeps it (no ETag round-trip here — see vercel.ts's
  // own doc comment). No cached data yet (first-ever load in flight, or a
  // total failure) renders nothing rather than an empty shell — same as
  // every other connector widget.
  const { data } = useConnectorSnapshot<VercelData>('vercel', (prev) => fetchVercel(token, prev))
  if (!data) return null

  // fetchVercel already returns deployments failed-first-then-recency
  // sorted (vercel.ts's sortDeployments) — this widget renders that order
  // as-is rather than re-sorting, same division of labor as every other
  // connector widget (the service owns ordering, the widget owns display).
  const deployments = (data.deployments ?? []).slice(0, MAX_DEPLOYMENTS)
  const empty = deployments.length === 0
  // Sole impure boundary in this component: `now` for relAge's age math,
  // read once per render (not per row) so every row in one paint measures
  // against the same instant. relAge itself stays pure and unit-tested at
  // exact second boundaries (vercel.test.ts).
  const now = Date.now()

  return (
    // Floating panel surface — identical shape/elevation to every other
    // connector card (the house rule for floating surfaces): the solid panel
    // token, rounded-2xl/shadow-lg/p-4, w-80 fixed card width.
    <section aria-label="Vercel" className="w-80 rounded-2xl bg-panel-solid p-4 text-fg shadow-lg">
      <h2 className="mb-2 text-sm font-semibold text-fg">Vercel</h2>

      {empty ? (
        <p className="text-sm text-fg-muted">No deployments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {deployments.map((item) => (
            <DeploymentRow key={item.url} item={item} now={now} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** State -> chip color. READY/ERROR are the two states the brief calls out
 *  by name (the parked danger ruling covers ERROR's red specifically);
 *  everything else (BUILDING/QUEUED/CANCELED, or an unrecognized future
 *  state) reads as the neutral muted tone rather than guessing a color for
 *  states this widget was never told to distinguish. */
function stateClass(state: string): string {
  if (state === 'READY') return 'text-emerald-300'
  if (state === 'ERROR') return 'text-red-400'
  return 'text-fg-muted'
}

/** One deployment row: the whole row is a single external link (a new tab,
 *  and rel that severs window.opener and strips the referrer) to the
 *  deployment's inspector page, with the project name truncating first (the
 *  element most likely to overflow the fixed card width) and the state chip
 *  + relative age staying fixed-width beside it. */
function DeploymentRow({ item, now }: { item: VercelDeployment; now: number }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={item.project}
        className="group flex cursor-pointer items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg transition-colors group-hover:text-accent motion-reduce:transition-none">
          {item.project}
        </span>
        <span className={`shrink-0 text-xs ${stateClass(item.state)}`}>{item.state}</span>
        <span className="shrink-0 text-xs text-fg-muted">{relAge(now, item.createdAt)}</span>
      </a>
    </li>
  )
}
