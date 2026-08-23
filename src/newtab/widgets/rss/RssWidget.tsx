import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchHeadlines, type Headline } from '../../../services/connectors/rss'
import type { RssConfig } from '../../../services/connectors/types'
import type { WidgetVariant } from '../../../lib/layout/types'
import DockLine from '../shared/DockLine'
import TierFrame, { ResourceFrameStatus, resourceFrameState, type TierFrameTier } from '../shared/TierFrame'

const RSS_FRAME_ROWS: Readonly<Record<WidgetVariant, number>> = {
  compact: 1,
  standard: 4,
  expanded: 6,
}

const RSS_FRAME_TIER: Readonly<Record<WidgetVariant, TierFrameTier>> = {
  compact: 'compact',
  standard: 'standard',
  expanded: 'full',
}

export default function RssWidget({
  stageVariant = 'standard',
  docked,
}: { stageVariant?: WidgetVariant; docked?: boolean } = {}) {
  // Gate BEFORE the snapshot hook exists — same shape as WorldClocks/Notes.
  // The one useStoredKey read runs unconditionally every render (Rules of
  // Hooks stay satisfied), but a disabled connector, or an enabled one with no
  // feeds yet, never mounts RssInner and therefore never runs
  // useConnectorSnapshot's subscribe/refresh. This is the "zero hooks in the
  // gate" split: the read that decides IF we render lives here; the read that
  // COSTS (the SWR fetch orchestration) lives past the gate.
  const [connectors] = useStoredKey('connectors')
  // ConnectorConfig is a union across all connector ids as of Task 46;
  // schema.ts ties every id to the same union rather than its specific
  // member, so this key is narrowed with one documented cast — it is always
  // RssConfig at runtime, since only the rss connector ever writes here.
  const rss = connectors?.rss as RssConfig | undefined
  // Array.isArray is load-bearing, not paranoia: backup import validates
  // connector configs only structurally (`enabled` alone — per-connector
  // fields are this service boundary's job), so a hand-edited backup can
  // legally restore { rss: { enabled: true } } with no feeds array at all.
  // The type says feeds: string[]; storage doesn't promise it.
  if (!rss?.enabled || !Array.isArray(rss.feeds) || rss.feeds.length === 0) return null
  return <RssInner rss={rss} stageVariant={stageVariant} docked={docked} />
}

function RssInner({ rss, stageVariant, docked }: { rss: RssConfig; stageVariant: WidgetVariant; docked?: boolean }) {
  const { feeds, shownCount } = rss
  // Stale-while-refreshing by construction: the hook returns the cached
  // snapshot immediately and refreshes in the background once per mount. A
  // failed refresh keeps the cached rows (lastError is intentionally ignored
  // here — the dashboard stays quiet; the connector card in Settings is where
  // refresh state would surface). No cached data at all (first ever load still
  // in flight, or a total failure) renders nothing rather than an empty shell.
  const { data, state } = useConnectorSnapshot<Headline[]>('rss', rss, () =>
    fetchHeadlines(feeds, shownCount),
  )
  const tier = RSS_FRAME_TIER[stageVariant]
  if (!data) {
    if (docked) return null
    const frameState = resourceFrameState(state)
    return <ResourceFrameStatus label="Headlines" tier={tier} state={frameState === 'hard-error' ? 'hard-error' : 'loading'} />
  }
  // Cap at shownCount here too, not just in the service: a snapshot written
  // under a larger shownCount that the user later lowered must honor the
  // current setting without waiting for the next refresh.
  const availableHeadlines = (data ?? []).slice(0, shownCount)
  const headlines = availableHeadlines.slice(0, RSS_FRAME_ROWS[stageVariant])
  if (headlines.length === 0) {
    if (docked) return null
    return <ResourceFrameStatus label="Headlines" tier={tier} state={state.operation === 'error' ? 'hard-error' : 'empty'} message="No headlines right now." />
  }

  // Docked tier (NL-P5 batch 2): the first headline as one dense line — the
  // SAME first-item derivation the card renders, no second fetch.
  if (docked) return <DockLine label="Headlines" facts={[headlines[0].title]} />

  return (
    <TierFrame
      label="Headlines"
      tier={tier}
      state={resourceFrameState(state)}
      data-rss-content-variant={stageVariant}
      className="flex min-h-0 flex-col"
    >
      <header className="flex min-h-8 items-center justify-between gap-3 border-b border-hairline px-3 py-1">
        <h2 className="text-sm font-semibold">Headlines</h2>
        <span className="text-[11px] text-fg-muted">{headlines.length} of {availableHeadlines.length}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <ul className="flex flex-col gap-0.5">
        {headlines.map((h) => {
          return (
            <li key={h.url}>
            {/* External site, so target/rel differ from the in-page launcher
                links: a new tab, and rel that severs window.opener and strips
                the referrer. The whole row is one link — title is the click
                target, the source label rides above it as quiet context. */}
            {/* No text-photo here anymore: this row now sits inside the solid
                card above, whose own surface carries legibility — text-photo
                is only for text floating DIRECTLY on the photo (the plain
                text-fg/text-fg-muted rows GithubWidget uses inside its own
                card are the precedent). */}
            <a
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              title={h.title}
              className="group block cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span data-stage-text-tier="metadata" className="block truncate text-[11px] leading-4 text-fg-muted">{h.source}</span>
              {/* truncate is a single-line ellipsis — never a wrap, never a
                  scroll region — with the full string one hover away via the
                  title attribute on the link above. The list is capped at
                  shownCount rows in RssInner, so height is bounded by
                  construction rather than by a scroll container. */}
              <span className="block truncate text-sm font-medium leading-5 text-fg transition-colors group-hover:text-accent motion-reduce:transition-none">
                {h.title}
              </span>
            </a>
          </li>
          )
        })}
        </ul>
      </div>
    </TierFrame>
  )
}
