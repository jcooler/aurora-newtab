// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { Contributions, GithubData } from '../../../services/connectors/github'
import type { GithubConfig } from '../../../services/connectors/types'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import GithubWidget from './GithubWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives across
// cases; reset it so one test's refresh can't dedupe the next (same discipline
// as RssWidget.test.tsx).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const DATA: GithubData = {
  prs: [
    { title: 'Fix the flaky login test', url: 'https://github.com/acme/app/pull/12', repo: 'acme/app' },
    { title: 'Wire the new settings tab', url: 'https://github.com/acme/app/pull/13', repo: 'acme/app' },
  ],
  issues: [{ title: 'Crash on cold start', url: 'https://github.com/acme/web/issues/9', repo: 'acme/web' }],
  notifications: 3,
  contributions: null,
  etags: {},
}

// A small contribution slice: 2026-01-04 is a Sunday (front-pad 0) and the run
// [0,1,2,3] ends positive, so the derived streak is 3. `total` is carried on the
// Contributions object itself (not summed from the days), so the stat line shows
// 128 regardless of the day counts.
const CONTRIB: Contributions = {
  total: 128,
  days: [
    { date: '2026-01-04', count: 0 },
    { date: '2026-01-05', count: 1 },
    { date: '2026-01-06', count: 2 },
    { date: '2026-01-07', count: 3 },
  ],
}
const DATA_WITH_GRAPH: GithubData = { ...DATA, contributions: CONTRIB }
// A quiet day: both lists empty. WITH contributions (the graph is tier-gated, so
// the empty line takes its inverse tier) and WITHOUT (the line shows always).
const EMPTY_WITH_GRAPH: GithubData = { prs: [], issues: [], notifications: 0, contributions: CONTRIB, etags: {} }
const EMPTY_NO_GRAPH: GithubData = { prs: [], issues: [], notifications: 0, contributions: null, etags: {} }

const CONNECTED: GithubConfig = { enabled: true, token: 'github_pat_x', username: 'jon' }

/** Storage seeded with a CONNECTED github connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never calls
 *  the real fetchGithub — the widget renders straight from cache, no network. */
async function seededStorage(
  config: GithubConfig,
  data: GithubData | null = DATA,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { github: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      github: { scope: await connectorSnapshotScope('github', config), fetchedAt: Date.now(), data },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, canvasSize?: 'compact' | 'standard' | 'full') {
  return render(
    <StorageProvider storage={storage}>
      <GithubWidget canvasSize={canvasSize} />
    </StorageProvider>,
  )
}

describe('GithubWidget', () => {
  it('Compact keeps the real selected-work count as its primary value without rendering rows', async () => {
    mount(await seededStorage(CONNECTED, DATA), 'compact')
    expect(await screen.findByLabelText('GitHub: 3 need attention')).toBeTruthy()
    expect(screen.queryByText('Fix the flaky login test')).toBeNull()
  })

  it('Full keeps a selected graph visible without a legacy height-tier class', async () => {
    mount(await seededStorage({ ...CONNECTED, views: { commitGraph: true, pulls: false, issues: false, notifications: false } }, DATA_WITH_GRAPH), 'full')
    const graph = await screen.findByRole('img', { name: /contribution activity/i })
    expect(graph.parentElement?.className).not.toContain('hidden')
  })
  it('renders PR and issue rows plus the unread count from the seeded snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    await screen.findByText('Fix the flaky login test')
    expect(screen.getByText('Wire the new settings tab')).toBeTruthy()
    expect(screen.getByText('Crash on cold start')).toBeTruthy()
    // Unread header chip.
    expect(screen.getByText('3 unread')).toBeTruthy()
    expect(screen.getByLabelText('GitHub: 3 need attention').getAttribute('data-work-pulse-tone')).toBe('attention')
    // Repo prefix rides above each title.
    expect(screen.getAllByText('acme/app').length).toBeGreaterThan(0)
    expect(screen.getByText('acme/web')).toBeTruthy()
  })

  it('renders "50+" unread at the cap', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, notifications: 50 })
    mount(storage)
    await screen.findByText('Fix the flaky login test')
    expect(screen.getByText('50+ unread')).toBeTruthy()
  })

  it('hides the unread row when notifications is null (endpoint unavailable)', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, notifications: null })
    mount(storage)
    await screen.findByText('Fix the flaky login test')
    expect(screen.queryByText(/unread/)).toBeNull()
    expect(screen.getByLabelText('GitHub: 3 open items')).toBeTruthy()
  })

  it('hides the unread row when the count is zero (all caught up)', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, notifications: 0 })
    mount(storage)
    await screen.findByText('Fix the flaky login test')
    expect(screen.queryByText(/unread/)).toBeNull()
  })

  // Caps added/lowered (Task 55 fix round 1, MAX_PRS lowered again in fix
  // round 2): this is a glance panel sharing the right column's budget with
  // gitlab's and jira's own cards, AND with the collapsed weather chip's own
  // worst-case height above it (see GithubWidget.tsx's own MAX_PRS/
  // MAX_ISSUES comment). Seeds cap+1 of each so a regression back to a
  // looser cap (or no cap) fails visibly.
  it('caps PR rows at 2', async () => {
    const many: GithubData = {
      prs: Array.from({ length: 3 }, (_, i) => ({
        title: `PR ${i}`,
        url: `https://github.com/o/r/pull/${i}`,
        repo: 'o/r',
      })),
      issues: [],
      notifications: 0,
      contributions: null,
      etags: {},
    }
    const storage = await seededStorage(CONNECTED, many)
    mount(storage)
    await screen.findByText('PR 0')
    expect(screen.getByText('PR 1')).toBeTruthy()
    expect(screen.queryByText('PR 2')).toBeNull()
  })

  it('caps issue rows at 2', async () => {
    const many: GithubData = {
      prs: [],
      issues: Array.from({ length: 3 }, (_, i) => ({
        title: `Issue ${i}`,
        url: `https://github.com/o/r/issues/${i}`,
        repo: 'o/r',
      })),
      notifications: 0,
      contributions: null,
      etags: {},
    }
    const storage = await seededStorage(CONNECTED, many)
    mount(storage)
    await screen.findByText('Issue 0')
    expect(screen.getByText('Issue 1')).toBeTruthy()
    expect(screen.queryByText('Issue 2')).toBeNull()
  })

  it('shows the celebratory empty line when connected but nothing is waiting', async () => {
    const storage = await seededStorage(CONNECTED, { prs: [], issues: [], notifications: 0, contributions: null, etags: {} })
    mount(storage)
    expect(await screen.findByText('No PRs waiting on you 🎉')).toBeTruthy()
  })

  it('each row is an external link (target=_blank, rel carries noopener + noreferrer, href + title intact)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    const link = (await screen.findByText('Fix the flaky login test')).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://github.com/acme/app/pull/12')
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(link.getAttribute('title')).toBe('Fix the flaky login test')
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    // The gate returns before useConnectorSnapshot mounts, so no refresh wrote a
    // snapshot — the "zero hooks in the gate" proof.
    expect((await storage.get('connectorSnapshots')).github).toBeUndefined()
  })

  it('renders nothing when enabled but no token is present (reconnect state)', async () => {
    const storage = await seededStorage({ enabled: true, token: '', username: 'jon' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).github).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no token field — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { github: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).github).toBeUndefined()
  })

  // ── Task 68: the commit graph + composed card ───────────────────────────

  it('default views render the graph, the rows, and the unread chip together', async () => {
    const storage = await seededStorage(CONNECTED, DATA_WITH_GRAPH)
    mount(storage)

    // Graph: the heatmap grid is a role="img" with a contribution-worded label.
    const img = await screen.findByRole('img')
    expect(img.getAttribute('aria-label')).toMatch(/contribution/i)
    // Rows and chip still render alongside it.
    expect(screen.getByText('Fix the flaky login test')).toBeTruthy()
    expect(screen.getByText('Crash on cold start')).toBeTruthy()
    expect(screen.getByText('3 unread')).toBeTruthy()
  })

  it('the stat line reads "N contributions" (not commits) and the derived streak', async () => {
    const storage = await seededStorage(CONNECTED, DATA_WITH_GRAPH)
    mount(storage)

    // getByText matches the <p>'s loose "contributions" text node — proving the
    // content-accuracy word, and that the board's "commits" is gone.
    const stat = await screen.findByText('contributions')
    expect(screen.queryByText('commits')).toBeNull()
    expect(within(stat).getByText('128')).toBeTruthy() // total, from Contributions.total
    expect(within(stat).getByText('3')).toBeTruthy() // derived streak (run [0,1,2,3])
    expect(within(stat).getByText('day streak')).toBeTruthy()
  })

  // Task 70 fix — the graph's reveal TIER depends on BOTH the enabled forge
  // sibling count (gitlab, jira) AND github's OWN composition, because a
  // rows-bearing card is far taller than a graph-only one: sole card / one
  // sibling → `hidden taller:block` (>=890h) for any composition; two siblings
  // WITH rows (pulls or issues) → `hidden grand:block` (>=1171h, re-derived
  // Task 77 — was 1041h; see index.css's own `grand` comment); two siblings
  // GRAPH-ONLY → back to `taller` (the 201px card fits at 890). Class-pinned here
  // (jsdom, the RSS tier-test idiom) so a regression — the graph riding too LOW
  // (lapping the pill when three tall cards stack) or too HIGH (a graph-only husk
  // at 890-1040) — fails a unit before it ever reaches the harness.
  async function seededWithSiblings(gitlab: boolean, jira: boolean, github: GithubConfig = CONNECTED, data: GithubData = DATA_WITH_GRAPH): Promise<AuroraStorage> {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      github,
      ...(gitlab ? { gitlab: { enabled: true, token: 'gl', instanceUrl: 'https://gitlab.com', username: 'x' } } : {}),
      ...(jira ? { jira: { enabled: true, email: 'a@b.co', apiToken: 'jr', site: 's.atlassian.net', displayName: 'X' } } : {}),
    })
    await storage.set('connectorSnapshots', {
      github: { scope: await connectorSnapshotScope('github', github), fetchedAt: Date.now(), data },
    })
    return storage
  }
  const graphWrapper = () => screen.getByRole('img').closest('section')!
  // A section is "tier-hidden as a whole" when the SECTION element itself carries
  // `hidden <tier>:block` (round 3: a strictly graph-only card lives and dies with
  // its graph — no header husk). Otherwise the section is always shown and only an
  // INNER descendant wrapper carries the tier.
  const sectionHasTier = (tier: string) => {
    const sec = graphWrapper()
    return sec.classList.contains('hidden') && sec.className.includes(`${tier}:block`)
  }
  const GRAPH_ONLY: GithubConfig = { ...CONNECTED, views: { commitGraph: true, pulls: false, issues: false, notifications: false } }
  const GRAPH_PLUS_PULLS: GithubConfig = { ...CONNECTED, views: { commitGraph: true, pulls: true, issues: false, notifications: false } }
  const GRAPH_PLUS_NOTIF: GithubConfig = { ...CONNECTED, views: { commitGraph: true, pulls: false, issues: false, notifications: true } }

  it('reveals the graph on `taller` (>=890h) when github is the rail\'s SOLE forge card', async () => {
    mount(await seededWithSiblings(false, false))
    const img = await screen.findByRole('img')
    const wrapper = graphWrapper().querySelector('[class*="taller:block"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('hidden')).toBe(true)
    expect(wrapper!.contains(img)).toBe(true)
    expect(graphWrapper().querySelector('[class*="grand:block"]')).toBeNull()
  })

  it('still reveals the graph on `taller` with ONE forge sibling (the stack still clears the pill at 890)', async () => {
    mount(await seededWithSiblings(true, false))
    await screen.findByRole('img')
    expect(graphWrapper().querySelector('[class*="taller:block"]')).toBeTruthy()
    expect(graphWrapper().querySelector('[class*="grand:block"]')).toBeNull()
  })

  it('yields the graph to `grand` (>=1171h, re-derived Task 77 — was 1041h) with TWO forge siblings and a full (rows-bearing) card', async () => {
    mount(await seededWithSiblings(true, true))
    const img = await screen.findByRole('img')
    const wrapper = graphWrapper().querySelector('[class*="grand:block"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('hidden')).toBe(true)
    expect(wrapper!.contains(img)).toBe(true)
    expect(graphWrapper().querySelector('[class*="taller:block"]')).toBeNull()
  })

  it('with TWO siblings and a single rows section (pulls on), github reveals on `grand` (>=1171h, re-derived Task 77 — was 1041h) — conservatively, not the ~936h a precise tier would allow', async () => {
    mount(await seededWithSiblings(true, true, GRAPH_PLUS_PULLS))
    await screen.findByRole('img')
    expect(graphWrapper().querySelector('[class*="grand:block"]')).toBeTruthy()
    expect(graphWrapper().querySelector('[class*="taller:block"]')).toBeNull()
  })

  it('strictly graph-only, SOLE card remains represented without a height tier', async () => {
    mount(await seededWithSiblings(false, false, GRAPH_ONLY))
    const img = await screen.findByRole('img')
    expect(sectionHasTier('taller')).toBe(false)
    expect(graphWrapper().querySelector('[class*="taller:block"], [class*="grand:block"]')).toBeNull()
    expect(graphWrapper().contains(img)).toBe(true)
  })

  it('strictly graph-only, TWO siblings also remains represented without a height tier', async () => {
    mount(await seededWithSiblings(true, true, GRAPH_ONLY))
    await screen.findByRole('img')
    expect(sectionHasTier('taller')).toBe(false)
    expect(sectionHasTier('grand')).toBe(false)
    expect(graphWrapper().querySelector('[class*="taller:block"], [class*="grand:block"]')).toBeNull()
  })

  it('graph + notifications (not strictly graph-only) → the card is NOT tier-hidden; the INNER graph wrapper still is (the unread chip carries the card)', async () => {
    mount(await seededWithSiblings(false, false, GRAPH_PLUS_NOTIF))
    const img = await screen.findByRole('img')
    // the section is always shown (no `hidden` on it)…
    expect(graphWrapper().classList.contains('hidden')).toBe(false)
    // …and only the inner wrapper carries the tier.
    const inner = graphWrapper().querySelector('[class*="taller:block"]')
    expect(inner).toBeTruthy()
    expect(inner!.contains(img)).toBe(true)
  })

  it('strictly graph-only with NO contributions data (old snapshot / empty days) renders null — nothing it could ever show', async () => {
    const storage = await seededStorage(GRAPH_ONLY, { prs: [], issues: [], notifications: 3, contributions: null, etags: {} })
    const { container } = mount(storage)
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  // Fix wave — the quiet-day empty line must follow the GRAPH'S tier, not a data
  // check: with lists enabled + empty AND contributions present, the graph is
  // CSS tier-gated, so the "No PRs waiting" line takes the INVERSE tier — exactly
  // one of graph/line shows at any height, never a header husk below the reveal.
  it('quiet day, contributions present, SOLE card: the empty line carries `taller:hidden` (inverse of the graph wrapper\'s `taller:block`)', async () => {
    mount(await seededWithSiblings(false, false, CONNECTED, EMPTY_WITH_GRAPH))
    const line = await screen.findByText('No PRs waiting on you 🎉')
    expect(line.className).toContain('taller:hidden')
    // falsifiable both ways: it is the INVERSE, never the wrapper's own class,
    // and never the two-sibling tier.
    expect(line.className).not.toContain('taller:block')
    expect(line.className).not.toContain('grand:hidden')
    // and the graph wrapper still carries the forward tier — the two are opposites.
    expect(screen.getByRole('img').closest('section')!.querySelector('[class*="taller:block"]')).toBeTruthy()
  })

  it('quiet day, contributions present, TWO siblings + rows: the empty line carries `grand:hidden` (inverse of the `grand:block` wrapper)', async () => {
    mount(await seededWithSiblings(true, true, CONNECTED, EMPTY_WITH_GRAPH))
    const line = await screen.findByText('No PRs waiting on you 🎉')
    expect(line.className).toContain('grand:hidden')
    expect(line.className).not.toContain('grand:block')
    expect(line.className).not.toContain('taller:hidden')
  })

  it('quiet day, NO contributions data: the empty line is UNCLASSED (always visible, exactly the pre-graph behavior)', async () => {
    const storage = await seededStorage(CONNECTED, EMPTY_NO_GRAPH)
    mount(storage)
    const line = await screen.findByText('No PRs waiting on you 🎉')
    expect(line.className).not.toContain('taller:hidden')
    expect(line.className).not.toContain('grand:hidden')
    expect(screen.queryByRole('img')).toBeNull() // no graph at all
  })

  it('a graph-only card (commitGraph on, everything else off) renders the graph and NO rows and no chip', async () => {
    const graphOnly: GithubConfig = {
      ...CONNECTED,
      views: { commitGraph: true, pulls: false, issues: false, notifications: false },
    }
    const storage = await seededStorage(graphOnly, DATA_WITH_GRAPH)
    mount(storage)

    await screen.findByRole('img')
    // pulls/issues off → no rows, and NOT the celebratory empty line either.
    expect(screen.queryByText('Fix the flaky login test')).toBeNull()
    expect(screen.queryByText('Crash on cold start')).toBeNull()
    expect(screen.queryByText('No PRs waiting on you 🎉')).toBeNull()
    // notifications off → the unread chip is hidden even though the count is 3.
    expect(screen.queryByText(/unread/)).toBeNull()
  })

  it('all four views off renders nothing (the user asked for nothing)', async () => {
    const allOff: GithubConfig = {
      ...CONNECTED,
      views: { commitGraph: false, pulls: false, issues: false, notifications: false },
    }
    const storage = await seededStorage(allOff, DATA_WITH_GRAPH)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
  })

  it('an old snapshot without contributions renders the rows exactly as today — no graph, no crash', async () => {
    // DATA carries contributions: null (the pre-feature snapshot shape).
    const storage = await seededStorage(CONNECTED, DATA)
    mount(storage)

    await screen.findByText('Fix the flaky login test')
    expect(screen.getByText('Crash on cold start')).toBeTruthy()
    expect(screen.getByText('3 unread')).toBeTruthy()
    // No graph section when the field is absent.
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('commitGraph on but the days are empty renders no graph (days.length === 0 is treated as absent)', async () => {
    const emptyDays: GithubData = { ...DATA, contributions: { total: 0, days: [] } }
    const storage = await seededStorage(CONNECTED, emptyDays)
    mount(storage)

    await screen.findByText('Fix the flaky login test')
    expect(screen.queryByRole('img')).toBeNull()
  })

  // ── Task 75 Step 4: the no-husk law, generalized (github's retrofit) ──
  // Closes the wave-1 deferred minor: a notifications-only card (every OTHER
  // section off) used to fall through the graphOnly-specific guard (which
  // only ever covered the STRICTLY-graph-only shape) straight to a bare
  // "GitHub" heading whenever the count was 0 or null — no chip, no rows, no
  // graph, no empty line. The general no-husk rule below covers this shape
  // too.
  const NOTIF_ONLY: GithubConfig = {
    ...CONNECTED,
    views: { commitGraph: false, pulls: false, issues: false, notifications: true },
  }

  it('notifications-only with count 0 → renders null (never a bare "GitHub" heading)', async () => {
    const storage = await seededStorage(NOTIF_ONLY, {
      prs: [],
      issues: [],
      notifications: 0,
      contributions: null,
      etags: {},
    })
    const { container } = mount(storage)
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('notifications-only with count null (endpoint unavailable) → also renders null', async () => {
    const storage = await seededStorage(NOTIF_ONLY, {
      prs: [],
      issues: [],
      notifications: null,
      contributions: null,
      etags: {},
    })
    const { container } = mount(storage)
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('notifications-only WITH a positive count → the card renders (the chip carries it, no rows, no graph)', async () => {
    const storage = await seededStorage(NOTIF_ONLY, {
      prs: [],
      issues: [],
      notifications: 7,
      contributions: null,
      etags: {},
    })
    mount(storage)
    expect(await screen.findByText('7 unread')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText('Fix the flaky login test')).toBeNull()
    expect(screen.queryByText('No PRs waiting on you 🎉')).toBeNull()
  })
})
