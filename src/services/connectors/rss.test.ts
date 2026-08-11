// @vitest-environment jsdom
// parseFeed uses DOMParser, so this file needs a DOM (see Clock.test.tsx for
// the same per-file pragma convention — the project's vitest.config.ts
// defaults to `environment: 'node'`).
import { describe, expect, it, vi } from 'vitest'
import { fetchHeadlines, parseFeed, rssDescriptor } from './rss'

const RSS_MINIMAL = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Channel</title>
    <item>
      <title>First Post</title>
      <link>https://example.com/first</link>
      <pubDate>Mon, 06 Sep 2021 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/second</link>
      <pubDate>Tue, 07 Sep 2021 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

const ATOM_MINIMAL = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <entry>
    <title>Atom Post</title>
    <link href="https://example.com/atom-post"/>
    <updated>2021-09-06T12:00:00Z</updated>
  </entry>
</feed>`

const ATOM_PUBLISHED_ONLY = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <entry>
    <title>Atom Post</title>
    <link href="https://example.com/atom-post"/>
    <published>2021-09-06T12:00:00Z</published>
  </entry>
</feed>`

const RSS_ENTITIES = `<rss version="2.0">
<channel>
<title>Entities &amp; Stuff</title>
<item>
<title>Cats &amp; Dogs</title>
<link>https://example.com/cats-dogs</link>
</item>
<item>
<title><![CDATA[Raw <b>HTML</b> & text]]></title>
<link>https://example.com/cdata-post</link>
</item>
</channel>
</rss>`

const RSS_MISSING_DATE = `<rss version="2.0">
<channel>
<title>No Dates</title>
<item>
<title>Undated Post</title>
<link>https://example.com/undated</link>
</item>
<item>
<title>Bad Date Post</title>
<link>https://example.com/bad-date</link>
<pubDate>not-a-date</pubDate>
</item>
</channel>
</rss>`

const MALFORMED_XML = `<rss version="2.0"><channel><title>Broken</title></rss>`

const HTML_DOCUMENT = `<html><head><title>Not a feed</title></head><body>Hi</body></html>`

const RSS_NO_TITLE = `<rss version="2.0">
<channel>
<item>
<title>Untitled Channel Post</title>
<link>https://example.com/untitled-channel-post</link>
</item>
</channel>
</rss>`

const ATOM_NO_TITLE = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title>Untitled Feed Post</title>
<link href="https://example.com/untitled-feed-post"/>
<updated>2021-09-06T12:00:00Z</updated>
</entry>
</feed>`

const RSS_MISSING_FIELDS = `<rss version="2.0">
<channel>
<title>Partial Feed</title>
<item>
<link>https://example.com/no-title</link>
</item>
<item>
<title>No Link Post</title>
</item>
<item>
<title>Valid Post</title>
<link>https://example.com/valid</link>
</item>
</channel>
</rss>`

const ATOM_SELF_AND_ALTERNATE = `<feed xmlns="http://www.w3.org/2005/Atom">
<title>Multi Link Feed</title>
<entry>
<title>Multi Link Entry</title>
<link rel="self" href="https://example.com/feed.xml"/>
<link rel="alternate" href="https://example.com/article"/>
<updated>2021-09-06T12:00:00Z</updated>
</entry>
</feed>`

const ATOM_ALTERNATE_FIRST = `<feed xmlns="http://www.w3.org/2005/Atom">
<title>Multi Link Feed</title>
<entry>
<title>Multi Link Entry</title>
<link rel="alternate" href="https://example.com/article-2"/>
<link rel="self" href="https://example.com/feed.xml"/>
<updated>2021-09-06T12:00:00Z</updated>
</entry>
</feed>`

const ATOM_SELF_ONLY = `<feed xmlns="http://www.w3.org/2005/Atom">
<title>Self Only Feed</title>
<entry>
<title>Self Only Entry</title>
<link rel="self" href="https://example.com/feed.xml"/>
<updated>2021-09-06T12:00:00Z</updated>
</entry>
</feed>`

const RSS_RELATIVE_LINK = `<rss version="2.0">
<channel>
<title>Relative Links</title>
<item>
<title>Relative Post</title>
<link>/posts/relative-post</link>
</item>
</channel>
</rss>`

const ATOM_RELATIVE_LINK = `<feed xmlns="http://www.w3.org/2005/Atom">
<title>Relative Links</title>
<entry>
<title>Relative Atom Post</title>
<link href="/posts/atom-relative"/>
<updated>2021-09-06T12:00:00Z</updated>
</entry>
</feed>`

describe('parseFeed', () => {
  it('parses a minimal RSS 2.0 feed into Headlines with epoch-ms publishedAt', () => {
    const headlines = parseFeed(RSS_MINIMAL, 'https://example.com/feed.xml')
    expect(headlines).toEqual([
      {
        source: 'Example Channel',
        title: 'First Post',
        url: 'https://example.com/first',
        publishedAt: Date.parse('Mon, 06 Sep 2021 12:00:00 GMT'),
      },
      {
        source: 'Example Channel',
        title: 'Second Post',
        url: 'https://example.com/second',
        publishedAt: Date.parse('Tue, 07 Sep 2021 12:00:00 GMT'),
      },
    ])
  })

  it('parses a minimal Atom feed, reading href off a linkless <link> and updated/published dates', () => {
    const headlines = parseFeed(ATOM_MINIMAL, 'https://example.com/feed.xml')
    expect(headlines).toEqual([
      {
        source: 'Example Feed',
        title: 'Atom Post',
        url: 'https://example.com/atom-post',
        publishedAt: Date.parse('2021-09-06T12:00:00Z'),
      },
    ])
  })

  it('falls back to <published> when an Atom entry has no <updated>', () => {
    const headlines = parseFeed(ATOM_PUBLISHED_ONLY, 'https://example.com/feed.xml')
    expect(headlines).toHaveLength(1)
    expect(headlines[0].publishedAt).toBe(Date.parse('2021-09-06T12:00:00Z'))
  })

  it('decodes entities and passes CDATA content through verbatim', () => {
    const headlines = parseFeed(RSS_ENTITIES, 'https://example.com/feed.xml')
    expect(headlines[0].source).toBe('Entities & Stuff')
    expect(headlines[0].title).toBe('Cats & Dogs')
    expect(headlines[1].title).toBe('Raw <b>HTML</b> & text')
  })

  it('maps a missing or unparseable pubDate to publishedAt 0, never NaN', () => {
    const headlines = parseFeed(RSS_MISSING_DATE, 'https://example.com/feed.xml')
    expect(headlines).toHaveLength(2)
    expect(headlines[0].publishedAt).toBe(0)
    expect(headlines[1].publishedAt).toBe(0)
    expect(Number.isNaN(headlines[0].publishedAt)).toBe(false)
    expect(Number.isNaN(headlines[1].publishedAt)).toBe(false)
  })

  it('returns [] for malformed XML (DOMParser parsererror)', () => {
    expect(parseFeed(MALFORMED_XML, 'https://example.com/feed.xml')).toEqual([])
  })

  it('returns [] for a well-formed but unrecognized document (e.g. plain HTML)', () => {
    expect(parseFeed(HTML_DOCUMENT, 'https://example.com/feed.xml')).toEqual([])
  })

  it('falls back to the feed URL hostname when the channel/feed has no title', () => {
    expect(parseFeed(RSS_NO_TITLE, 'https://foo.example.com/rss.xml')[0].source).toBe('foo.example.com')
    expect(parseFeed(ATOM_NO_TITLE, 'https://bar.example.com/atom.xml')[0].source).toBe('bar.example.com')
  })

  it('skips items missing a title or a link (unclickable otherwise)', () => {
    const headlines = parseFeed(RSS_MISSING_FIELDS, 'https://example.com/feed.xml')
    expect(headlines).toEqual([
      { source: 'Partial Feed', title: 'Valid Post', url: 'https://example.com/valid', publishedAt: 0 },
    ])
  })

  it('prefers rel="alternate" over rel="self" among multiple Atom <link> entries, regardless of order', () => {
    expect(parseFeed(ATOM_SELF_AND_ALTERNATE, 'https://example.com/feed.xml')[0].url).toBe(
      'https://example.com/article',
    )
    expect(parseFeed(ATOM_ALTERNATE_FIRST, 'https://example.com/feed.xml')[0].url).toBe(
      'https://example.com/article-2',
    )
  })

  it('skips an Atom entry whose only <link> is rel="self" (no clickable alternate)', () => {
    expect(parseFeed(ATOM_SELF_ONLY, 'https://example.com/feed.xml')).toEqual([])
  })

  it('resolves relative item/entry links against the feed URL', () => {
    expect(parseFeed(RSS_RELATIVE_LINK, 'https://example.com/feeds/main.xml')[0].url).toBe(
      'https://example.com/posts/relative-post',
    )
    expect(parseFeed(ATOM_RELATIVE_LINK, 'https://example.com/feeds/main.xml')[0].url).toBe(
      'https://example.com/posts/atom-relative',
    )
  })
})

describe('fetchHeadlines', () => {
  const textResponse = (body: string) => ({ ok: true, status: 200, text: async () => body })
  const notFound = () => ({ ok: false, status: 404, text: async () => '' })

  it('merges all feeds newest-first (stable for ties) and truncates to count', async () => {
    const feedA = `<rss version="2.0"><channel><title>A</title>
      <item><title>A-old</title><link>https://a.example.com/old</link><pubDate>Mon, 06 Sep 2021 12:00:00 GMT</pubDate></item>
      <item><title>A-new</title><link>https://a.example.com/new</link><pubDate>Wed, 08 Sep 2021 12:00:00 GMT</pubDate></item>
    </channel></rss>`
    const feedB = `<rss version="2.0"><channel><title>B</title>
      <item><title>B-mid</title><link>https://b.example.com/mid</link><pubDate>Tue, 07 Sep 2021 12:00:00 GMT</pubDate></item>
      <item><title>B-tie</title><link>https://b.example.com/tie</link><pubDate>Wed, 08 Sep 2021 12:00:00 GMT</pubDate></item>
    </channel></rss>`
    const fetchFn = vi.fn(async (url: string) => {
      if (url === 'https://a.example.com/feed.xml') return textResponse(feedA)
      if (url === 'https://b.example.com/feed.xml') return textResponse(feedB)
      throw new Error(`unexpected url ${url}`)
    })

    const headlines = await fetchHeadlines(
      ['https://a.example.com/feed.xml', 'https://b.example.com/feed.xml'],
      3,
      fetchFn as unknown as typeof fetch,
    )

    expect(headlines).toHaveLength(3)
    // A-new and B-tie share the same publishedAt; A-new came from feed A
    // (processed first) so it must sort ahead of B-tie — stable tie-break.
    expect(headlines.map((h) => h.title)).toEqual(['A-new', 'B-tie', 'B-mid'])
  })

  it('isolates a rejecting feed (network error) — the rest still come through', async () => {
    const feedB = `<rss version="2.0"><channel><title>B</title>
      <item><title>B-post</title><link>https://b.example.com/post</link><pubDate>Wed, 08 Sep 2021 12:00:00 GMT</pubDate></item>
    </channel></rss>`
    const fetchFn = vi.fn(async (url: string) => {
      if (url === 'https://a.example.com/feed.xml') throw new Error('network down')
      return textResponse(feedB)
    })

    const headlines = await fetchHeadlines(
      ['https://a.example.com/feed.xml', 'https://b.example.com/feed.xml'],
      5,
      fetchFn as unknown as typeof fetch,
    )
    expect(headlines).toEqual([
      { source: 'B', title: 'B-post', url: 'https://b.example.com/post', publishedAt: Date.parse('Wed, 08 Sep 2021 12:00:00 GMT') },
    ])
  })

  it('treats a non-OK HTTP status (404) as an empty feed, quietly', async () => {
    const feedB = `<rss version="2.0"><channel><title>B</title>
      <item><title>B-post</title><link>https://b.example.com/post</link><pubDate>Wed, 08 Sep 2021 12:00:00 GMT</pubDate></item>
    </channel></rss>`
    const fetchFn = vi.fn(async (url: string) => {
      if (url === 'https://a.example.com/feed.xml') return notFound()
      return textResponse(feedB)
    })

    const headlines = await fetchHeadlines(
      ['https://a.example.com/feed.xml', 'https://b.example.com/feed.xml'],
      5,
      fetchFn as unknown as typeof fetch,
    )
    expect(headlines.map((h) => h.title)).toEqual(['B-post'])
  })

  it('aborts a feed fetch after 8s and treats it as empty, without hanging the others', async () => {
    vi.useFakeTimers()
    try {
      const feedB = `<rss version="2.0"><channel><title>B</title>
        <item><title>B-post</title><link>https://b.example.com/post</link><pubDate>Wed, 08 Sep 2021 12:00:00 GMT</pubDate></item>
      </channel></rss>`
      const fetchFn = vi.fn((url: string, init?: RequestInit) => {
        if (url === 'https://slow.example.com/feed.xml') {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted')
              err.name = 'AbortError'
              reject(err)
            })
          })
        }
        return Promise.resolve(textResponse(feedB))
      })

      const promise = fetchHeadlines(
        ['https://slow.example.com/feed.xml', 'https://b.example.com/feed.xml'],
        5,
        fetchFn as unknown as typeof fetch,
      )
      await vi.advanceTimersByTimeAsync(8_000)
      const headlines = await promise

      expect(headlines.map((h) => h.title)).toEqual(['B-post'])
      // The slow feed's fetch was called with an abortable signal.
      expect(fetchFn).toHaveBeenCalledWith(
        'https://slow.example.com/feed.xml',
        expect.objectContaining({ signal: expect.anything() }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns [] without calling fetchFn when feeds is empty', async () => {
    const fetchFn = vi.fn()
    expect(await fetchHeadlines([], 5, fetchFn as unknown as typeof fetch)).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('dedupes a syndicated article appearing in two feeds, keeping its newest-sorted row', async () => {
    // Same article url from both feeds (different surrounding metadata).
    // One row survives — which is also what keeps the widget's url-keyed
    // React rows unique.
    const feedA = `<rss version="2.0"><channel><title>A</title>
      <item><title>Shared story</title><link>https://shared.example.com/story</link><pubDate>Wed, 08 Sep 2021 12:00:00 GMT</pubDate></item>
    </channel></rss>`
    const feedB = `<rss version="2.0"><channel><title>B</title>
      <item><title>Shared story</title><link>https://shared.example.com/story</link><pubDate>Tue, 07 Sep 2021 12:00:00 GMT</pubDate></item>
      <item><title>B exclusive</title><link>https://b.example.com/only</link><pubDate>Mon, 06 Sep 2021 12:00:00 GMT</pubDate></item>
    </channel></rss>`
    const bodies: Record<string, string> = { 'https://a.example.com/f': feedA, 'https://b.example.com/f': feedB }
    const fetchFn = vi.fn(async (url: string) => ({ ok: true, status: 200, text: async () => bodies[url] }))

    const out = await fetchHeadlines(
      ['https://a.example.com/f', 'https://b.example.com/f'],
      5,
      fetchFn as unknown as typeof fetch,
    )
    expect(out.map((h) => h.url)).toEqual(['https://shared.example.com/story', 'https://b.example.com/only'])
    // The surviving row is the newest-sorted appearance (feed A's Wednesday
    // copy, source "A"), not feed B's older duplicate.
    expect(out[0]!.source).toBe('A')
  })

  it('yields [] for a zero or negative count — never "all but the last N"', async () => {
    // slice(0, negative) would silently mean "drop the tail"; a corrupted
    // stored shownCount must produce nothing rather than almost-everything.
    const xml = `<rss version="2.0"><channel><title>C</title>
      <item><title>One</title><link>https://c.example.com/1</link><pubDate>Wed, 08 Sep 2021 12:00:00 GMT</pubDate></item>
      <item><title>Two</title><link>https://c.example.com/2</link><pubDate>Tue, 07 Sep 2021 12:00:00 GMT</pubDate></item>
    </channel></rss>`
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, text: async () => xml }))

    expect(await fetchHeadlines(['https://c.example.com/f'], 0, fetchFn as unknown as typeof fetch)).toEqual([])
    expect(await fetchHeadlines(['https://c.example.com/f'], -1, fetchFn as unknown as typeof fetch)).toEqual([])
  })

  it('reads responses via .text() then hands the body to parseFeed', async () => {
    const textFn = vi.fn(async () => `<rss version="2.0"><channel><title>C</title>
      <item><title>C-post</title><link>https://c.example.com/post</link><pubDate>Wed, 08 Sep 2021 12:00:00 GMT</pubDate></item>
    </channel></rss>`)
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, text: textFn }))

    await fetchHeadlines(['https://c.example.com/feed.xml'], 5, fetchFn as unknown as typeof fetch)
    expect(textFn).toHaveBeenCalledTimes(1)
  })
})

describe('rssDescriptor', () => {
  it('declares the RSS connector identity and policy', () => {
    expect(rssDescriptor.id).toBe('rss')
    expect(rssDescriptor.auth).toBe('none')
    expect(rssDescriptor.ttlMs).toBe(30 * 60_000)
    expect(rssDescriptor.secretFields).toEqual([])
    expect(rssDescriptor.category).toBe('news-markets')
  })

  it('origins() maps every configured feed to its https origin pattern', () => {
    const origins = rssDescriptor.origins({
      enabled: true,
      feeds: ['https://a.example.com/feed.xml', 'https://b.example.com/rss?x=1'],
      shownCount: 5,
    })
    expect(origins).toEqual(['https://a.example.com/*', 'https://b.example.com/*'])
  })

  it('origins() drops non-https or unparseable persisted feeds instead of throwing', () => {
    // Backup import validates connector configs only structurally (enabled
    // alone), deferring feed validation to this service boundary — so a
    // restored feeds array CAN carry http:// or garbage entries, and the
    // framework sweeps origins() across every connector for permission
    // bookkeeping. One connector's bad data must degrade to fewer origins,
    // not throw out of the sweep.
    const origins = rssDescriptor.origins({
      enabled: true,
      feeds: ['http://insecure.example.com/feed', 'not a url', 'https://ok.example.com/feed'],
      shownCount: 5,
    })
    expect(origins).toEqual(['https://ok.example.com/*'])
  })
})
