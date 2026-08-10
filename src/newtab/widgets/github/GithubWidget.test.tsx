// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { Contributions, GithubData } from '../../../services/connectors/github'
import type { GithubConfig } from '../../../services/connectors/types'
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
  if (data) await storage.set('connectorSnapshots', { github: { fetchedAt: Date.now(), data } })
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <GithubWidget />
    </StorageProvider>,
  )
}

describe('GithubWidget', () => {
  it('renders PR and issue rows plus the unread count from the seeded snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    await screen.findByText('Fix the flaky login test')
    expect(screen.getByText('Wire the new settings tab')).toBeTruthy()
    expect(screen.getByText('Crash on cold start')).toBeTruthy()
    // Unread header chip.
    expect(screen.getByText('3 unread')).toBeTruthy()
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
  // WITH rows (pulls or issues) → `hidden grand:block` (>=1041h); two siblings
  // GRAPH-ONLY → back to `taller` (the 201px card fits at 890). Class-pinned here
  // (jsdom, the RSS tier-test idiom) so a regression — the graph riding too LOW
  // (lapping the pill when three tall cards stack) or too HIGH (a graph-only husk
  // at 890-1040) — fails a unit before it ever reaches the harness.
  async function seededWithSiblings(gitlab: boolean, jira: boolean, github: GithubConfig = CONNECTED): Promise<AuroraStorage> {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', {
      github,
      ...(gitlab ? { gitlab: { enabled: true, token: 'gl', instanceUrl: 'https://gitlab.com', username: 'x' } } : {}),
      ...(jira ? { jira: { enabled: true, email: 'a@b.co', apiToken: 'jr', site: 's.atlassian.net', displayName: 'X' } } : {}),
    })
    await storage.set('connectorSnapshots', { github: { fetchedAt: Date.now(), data: DATA_WITH_GRAPH } })
    return storage
  }
  const graphWrapper = () => screen.getByRole('img').closest('section')!
  const GRAPH_ONLY: GithubConfig = { ...CONNECTED, views: { commitGraph: true, pulls: false, issues: false, notifications: false } }
  const GRAPH_PLUS_PULLS: GithubConfig = { ...CONNECTED, views: { commitGraph: true, pulls: true, issues: false, notifications: false } }

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

  it('yields the graph to `grand` (>=1041h) with TWO forge siblings and a full (rows-bearing) card', async () => {
    mount(await seededWithSiblings(true, true))
    const img = await screen.findByRole('img')
    const wrapper = graphWrapper().querySelector('[class*="grand:block"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('hidden')).toBe(true)
    expect(wrapper!.contains(img)).toBe(true)
    expect(graphWrapper().querySelector('[class*="taller:block"]')).toBeNull()
  })

  it('with TWO siblings but a GRAPH-ONLY card (no rows), the short card reveals on `taller` (>=890h), NOT grand — no header-only husk at 890-1040', async () => {
    mount(await seededWithSiblings(true, true, GRAPH_ONLY))
    const img = await screen.findByRole('img')
    const wrapper = graphWrapper().querySelector('[class*="taller:block"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.contains(img)).toBe(true)
    expect(graphWrapper().querySelector('[class*="grand:block"]')).toBeNull()
  })

  it('with TWO siblings and a single rows section (pulls on), github reveals on `grand` (>=1041h) — conservatively, not the ~936h a precise tier would allow', async () => {
    mount(await seededWithSiblings(true, true, GRAPH_PLUS_PULLS))
    await screen.findByRole('img')
    expect(graphWrapper().querySelector('[class*="grand:block"]')).toBeTruthy()
    expect(graphWrapper().querySelector('[class*="taller:block"]')).toBeNull()
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
})
