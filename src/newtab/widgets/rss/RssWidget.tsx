import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchHeadlines, type Headline } from '../../../services/connectors/rss'
import type { RssConfig } from '../../../services/connectors/types'

export default function RssWidget() {
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
  return <RssInner feeds={rss.feeds} shownCount={rss.shownCount} />
}

// Short-tier row cap (resize-continuity task — RE-DERIVED for the compact/dense
// skin). On the `short` tier (451-600px tall) the bottom-anchored Notes pill
// rises as the window shrinks: its top is (viewport - bottom-4(16px) -
// pill-height(38px)) = viewport - 54, so at the tier's OWN worst case — its 451px
// MINIMUM — the pill top sits at 397px. This card's top is fixed by the flow
// above it: rail-top-left(120) + the COMPACT calendar(~70) + the 16px flow gap
// => rss top ~206. MEASURED (scripts/preview.mjs rail probe, 1600x451): with the
// dense skin (p-2 + text-xs rows) each row is ~36px and the card chrome ~12px, so
// N rows = 12 + 36N px. N=4 (card ~156, bottom ~362) clears the 397 pill top by
// 35px; N=5 (bottom ~398) would overrun it — 4 is the most rows that still hold
// the >=16px floor. `xshort` (<=450) hides the whole card via the wrapper's own
// xshort:hidden, so this only governs `short`.
const RSS_SHORT_ROWS = 4

// Mid-tier row cap (resize-continuity task — RE-DERIVED for the compact/dense
// skin: RAISED to the display max, i.e. NO trim on mid). On `mid` (601-864) the
// bottom-anchored Notes pill sits at 547 at the tier's 601px worst (height-54),
// and deploys (vercel) yields across the whole dense band (see App.tsx), leaving
// THIS card as the left column's lowest — its bottom is what must clear the pill.
// MEASURED (scripts/preview.mjs's short|mid fencepost, 1600x601): with the dense
// skin (row ~36px, p-2 chrome ~12px => N rows = 12 + 36N) and the compact
// calendar above it (rss top ~206), the FULL 8-row card bottoms at ~506 —
// clearing the 547 pill by 41px. So the compact card fits every headline on mid
// with room to spare and needs no trim: the cap is the display max (8), and the
// row-hide below never engages on mid (shownCount is itself <=8). `short`
// (RSS_SHORT_ROWS=4) trims because its 451px floor puts the pill ~150px higher;
// `xshort` hides the whole card. The three tiers are disjoint (index.css), so
// only one row cap ever applies at a time.
const RSS_MID_ROWS = 8

function RssInner({ feeds, shownCount }: { feeds: RssConfig['feeds']; shownCount: RssConfig['shownCount'] }) {
  // Stale-while-refreshing by construction: the hook returns the cached
  // snapshot immediately and refreshes in the background once per mount. A
  // failed refresh keeps the cached rows (lastError is intentionally ignored
  // here — the dashboard stays quiet; the connector card in Settings is where
  // refresh state would surface). No cached data at all (first ever load still
  // in flight, or a total failure) renders nothing rather than an empty shell.
  const { data } = useConnectorSnapshot<Headline[]>('rss', () => fetchHeadlines(feeds, shownCount))
  // Cap at shownCount here too, not just in the service: a snapshot written
  // under a larger shownCount that the user later lowered must honor the
  // current setting without waiting for the next refresh.
  const headlines = (data ?? []).slice(0, shownCount)
  if (headlines.length === 0) return null

  return (
    // Solid card (Jon's darker-color ruling — "put a background on the news
    // rss stuff"): the same bg-panel-solid + rounded-2xl + shadow-lg card
    // language GithubWidget uses, so the news column reads as a finished
    // surface rather than bare photo-floating text. `p-2.5` + `gap-1`
    // (tighter than GitHub's own p-3/gap-2) is deliberate and LOAD-BEARING,
    // not cosmetic: carding adds padding+radius height, and the left column's
    // measured floors are pinned against this card's WORST case — shownCount
    // 8, its tallest — clearing the calendar card above and vercel's slot
    // below by >=16px each (scripts/preview.mjs's ics + vercel gap probes,
    // and the combined-defaults gate's 190-pair check, all re-measured for
    // this batch). w-72 is unchanged (the horizontal extent, and the ~380px
    // of clearance to the centered column, are the same as the bare version).
    <section aria-label="Headlines" className="w-72 short:w-60 xshort:w-52 rounded-2xl bg-panel-solid p-2.5 dense:p-2 text-fg shadow-lg">
      <ul className="flex flex-col gap-1">
        {headlines.map((h, i) => {
          // Rows past RSS_SHORT_ROWS drop on `short`, and rows past RSS_MID_ROWS
          // drop on `mid` too, so the card can't grow over the Notes pill at
          // either tier's own worst-case floor (see the constants). The tiers
          // are disjoint, so a row carrying both classes only ever hides under
          // whichever one actually matches — never both at once.
          const hide = [
            i >= RSS_SHORT_ROWS ? 'short:hidden' : '',
            i >= RSS_MID_ROWS ? 'mid:hidden' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <li key={h.url} className={hide || undefined}>
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
              <span className="block truncate text-xs text-fg-muted">{h.source}</span>
              {/* truncate is a single-line ellipsis — never a wrap, never a
                  scroll region — with the full string one hover away via the
                  title attribute on the link above. The list is capped at
                  shownCount rows in RssInner, so height is bounded by
                  construction rather than by a scroll container. */}
              <span className="block truncate text-sm dense:text-xs font-medium text-fg transition-colors group-hover:text-accent motion-reduce:transition-none">
                {h.title}
              </span>
            </a>
          </li>
          )
        })}
      </ul>
    </section>
  )
}
