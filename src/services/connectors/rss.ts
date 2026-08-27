// src/services/connectors/rss.ts — RSS/Atom parsing + fetch orchestration
// for the RSS connector. parseFeed is pure (DOMParser only — no chrome.*, no
// network); fetchHeadlines is the only piece that touches the network, via
// an injectable fetchFn so tests never hit a real network.
import type { ConnectorDescriptor } from './types'
import type { RssConfig } from './types'
import { originPattern } from '../permissions'

export interface Headline {
  source: string
  title: string
  url: string
  publishedAt: number // epoch ms; 0 when the feed has no usable date
}

const FETCH_TIMEOUT_MS = 8_000

/** Text content of `el`, trimmed; '' for a missing element or one that's
 *  empty/whitespace-only. DOMParser already resolves XML entities (&amp; ->
 *  &) and hands CDATA sections through as their literal text, so no extra
 *  decoding step is needed here. */
function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? ''
}

/** Epoch ms for an RFC 822 (RSS) or ISO 8601 (Atom) date string. Missing or
 *  unparseable -> 0, never NaN — a bad/absent date must not poison sorting
 *  in fetchHeadlines (NaN comparisons are neither < nor >, which would leave
 *  merge order undefined). */
function parseDate(text: string): number {
  if (!text) return 0
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Resolves a possibly-relative item/entry link against the feed's own URL.
 *  '' (rather than throwing) on a link DOMParser handed us that still isn't
 *  a valid URL/relative-reference — treated the same as a missing link by
 *  the caller. */
function resolveUrl(link: string, feedUrl: string): string {
  if (!link) return ''
  try {
    return new URL(link, feedUrl).toString()
  } catch {
    return ''
  }
}

function hostnameOf(feedUrl: string): string {
  try {
    return new URL(feedUrl).hostname
  } catch {
    return feedUrl
  }
}

/** True if `doc` is DOMParser's own parsererror document — its universal,
 *  cross-implementation signal for "this XML did not parse": a
 *  `<parsererror>` element appears SOMEWHERE in the tree. Where differs by
 *  engine, which is why this must search the whole document and not just
 *  the root: jsdom (and Firefox) replace the root with <parsererror>, but
 *  real Chrome/Blink KEEPS the original root, preserves the well-formed
 *  prefix of the broken document (including any complete <item>s before
 *  the error), and nests <parsererror> inside it — verified empirically in
 *  live Chrome during the Task 43 review, since jsdom tests structurally
 *  cannot exercise that branch. A root-only check would silently accept
 *  truncated feeds in production. */
function isParserError(doc: Document): boolean {
  return doc.getElementsByTagName('parsererror').length > 0
}

function parseRssItems(doc: Document, feedUrl: string, source: string): Headline[] {
  const headlines: Headline[] = []
  for (const item of Array.from(doc.querySelectorAll('item'))) {
    const title = textOf(item.querySelector('title'))
    const url = resolveUrl(textOf(item.querySelector('link')), feedUrl)
    // A headline with no title or no clickable url isn't useful in a
    // headlines widget, so items missing either are skipped rather than
    // rendered with a blank/dead link.
    if (!title || !url) continue
    headlines.push({ source, title, url, publishedAt: parseDate(textOf(item.querySelector('pubDate'))) })
  }
  return headlines
}

/** Picks the entry's clickable href: the first `<link>` that is either
 *  rel-less (Atom defaults a linkless `<link>` to rel="alternate") or
 *  explicitly rel="alternate", never rel="self" (the feed's own URL, not an
 *  article). An entry whose only link(s) are rel="self" yields '' here,
 *  which parseAtomEntries then treats as a missing link (skipped) — same
 *  as an RSS item with no `<link>` at all. */
function pickAtomLink(entry: Element): string {
  const links = Array.from(entry.querySelectorAll('link'))
  const chosen = links.find((link) => {
    const rel = link.getAttribute('rel')
    return !rel || rel === 'alternate'
  })
  return chosen?.getAttribute('href')?.trim() ?? ''
}

function parseAtomEntries(doc: Document, feedUrl: string, source: string): Headline[] {
  const headlines: Headline[] = []
  for (const entry of Array.from(doc.querySelectorAll('entry'))) {
    const title = textOf(entry.querySelector('title'))
    const url = resolveUrl(pickAtomLink(entry), feedUrl)
    if (!title || !url) continue
    // Atom entries carry <published> (creation) and/or <updated>
    // (mandatory-by-spec, but revision time). <published> is the closer
    // match to "publishedAt" when both are present.
    const dateText = textOf(entry.querySelector('published')) || textOf(entry.querySelector('updated'))
    headlines.push({ source, title, url, publishedAt: parseDate(dateText) })
  }
  return headlines
}

/** Pure: parses one RSS 2.0 or Atom document. Malformed XML or an
 *  unrecognized root document element -> []. `source` is the channel/feed
 *  title, falling back to the feed URL's hostname when that title is
 *  missing or blank. */
export function parseFeed(xml: string, feedUrl: string): Headline[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (isParserError(doc)) return []

  const root = doc.documentElement
  const rootName = root?.tagName.toLowerCase()

  if (rootName === 'rss') {
    const source = textOf(doc.querySelector('channel > title')) || hostnameOf(feedUrl)
    return parseRssItems(doc, feedUrl, source)
  }
  if (rootName === 'feed') {
    const source = textOf(doc.querySelector('feed > title')) || hostnameOf(feedUrl)
    return parseAtomEntries(doc, feedUrl, source)
  }
  return []
}

/** Fetches one feed and parses it, isolating every failure mode (network
 *  error, non-OK status, timeout, malformed body) to an empty result — see
 *  fetchHeadlines's doc comment for why quiet-failure is the convention
 *  here rather than propagating a per-feed error. */
async function fetchOneFeed(feedUrl: string, fetchFn: typeof fetch): Promise<Headline[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchFn(feedUrl, { signal: controller.signal })
    if (!res.ok) return []
    const text = await res.text()
    return parseFeed(text, feedUrl)
  } catch {
    // Network error, abort (timeout), or a rejecting .text() — a widget
    // shows whatever feeds it DID get rather than an all-or-nothing error;
    // one bad/slow feed must never blank out the rest.
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** Fetches every feed in parallel (8s per-feed timeout, failures isolated
 *  per feed — see fetchOneFeed), merges all results newest-first, and
 *  truncates to `count`. Ties keep their feeds' relative order: merge
 *  concatenates results in `feeds` order before sorting, and
 *  Array.prototype.sort is a stable sort. Empty `feeds` -> [] without
 *  invoking fetchFn at all (nothing to fetch, no reason to call it). */
export async function fetchHeadlines(
  feeds: string[],
  count: number,
  fetchFn: typeof fetch = fetch,
): Promise<Headline[]> {
  if (feeds.length === 0) return []
  const results = await Promise.all(feeds.map((feedUrl) => fetchOneFeed(feedUrl, fetchFn)))
  const merged = results.flat()
  merged.sort((a, b) => b.publishedAt - a.publishedAt)
  // Dedupe by url AFTER the sort so a syndicated article appearing in two
  // configured feeds keeps one row (its newest-sorted appearance) instead of
  // two — which is also what keeps the widget's url-keyed React rows unique.
  const seen = new Set<string>()
  const unique = merged.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true)))
  // Math.max guards the function's own contract: slice(0, negative) means
  // "all but the last N" — a corrupted stored shownCount must yield nothing,
  // not almost-everything. (The settings UI enforces 3-8; this doesn't rely
  // on it.)
  return unique.slice(0, Math.max(0, count))
}

export const rssDescriptor: ConnectorDescriptor<RssConfig> = {
  id: 'rss',
  label: 'RSS',
  blurb: 'Headlines from your favorite feeds',
  category: 'news-markets', // headlines connector — see types.ts's CATEGORY_LABELS
  auth: 'none',
  ttlMs: 30 * 60_000,
  secretFields: [],
  redactForBackup: (config) => ({ ...config, feeds: [] }),
  backupReentryRequired: (config) => config.enabled === true && Array.isArray(config.feeds) && config.feeds.length === 0,
  // Filter, don't throw: backup import validates connector configs only
  // structurally (isConnectorConfig checks `enabled` alone — per-connector
  // field validation is deferred to this service boundary), so a restored
  // feeds array can hold non-https or unparseable entries. origins() is the
  // registry's CONTRACT for grant/revoke bookkeeping — any caller sweeping
  // descriptors must be able to trust that one connector's bad persisted
  // data degrades to fewer origins rather than throwing out of the sweep.
  // Same clean-don't-crash idiom as backup's cleanLayout/cleanConnectors.
  // (Today's only production bookkeeping — the card's remove handler —
  // reaches originPattern through its own originOf wrapper; this contract
  // is what makes routing it through the registry safe whenever that
  // consolidation happens.)
  origins: (config) =>
    config.feeds.flatMap((feed) => {
      try {
        return [originPattern(feed)]
      } catch {
        return []
      }
    }),
  ownsOrigins: (config) => {
    if (!Array.isArray(config.feeds)) return false
    return config.feeds.some((feed) => {
      try {
        originPattern(feed)
        return true
      } catch {
        return false
      }
    })
  },
}
