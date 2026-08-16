// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { GitlabData, Contributions } from '../../../services/connectors/gitlab'
import type { GitlabConfig } from '../../../services/connectors/types'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import GitlabWidget from './GitlabWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives across
// cases; reset it so one test's refresh can't dedupe the next (same discipline
// as GithubWidget.test.tsx).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const DATA: GitlabData = {
  mrs: [
    {
      title: 'Add rate limiting to the ingest API',
      url: 'https://gitlab.com/acme/platform/-/merge_requests/204',
      project: 'acme/platform',
    },
    {
      title: 'Bump vite to 6.x',
      url: 'https://gitlab.com/acme/platform/-/merge_requests/207',
      project: 'acme/platform',
    },
  ],
  // Wave-2 fields (Task 74): OFF by default, so the widget (Task 75 renders
  // them) sees empty/null here — present only to satisfy GitlabData's shape.
  reviewMrs: [],
  todos: 6,
  contributions: null,
}

const CONNECTED: GitlabConfig = {
  enabled: true,
  token: 'glpat_x',
  instanceUrl: 'https://gitlab.com',
  username: 'jcooler',
}

/** Storage seeded with a CONNECTED gitlab connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never calls
 *  the real fetchGitlab — the widget renders straight from cache, no network. */
async function seededStorage(
  config: GitlabConfig,
  data: GitlabData | null = DATA,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { gitlab: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      gitlab: { scope: await connectorSnapshotScope('gitlab', config), fetchedAt: Date.now(), data },
    })
  }
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <GitlabWidget />
    </StorageProvider>,
  )
}

describe('GitlabWidget', () => {
  it('renders MR rows plus the to-dos count from the seeded snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    await screen.findByText('Add rate limiting to the ingest API')
    expect(screen.getByText('Bump vite to 6.x')).toBeTruthy()
    // to-dos header chip.
    expect(screen.getByText('6 to-dos')).toBeTruthy()
    expect(screen.getByLabelText('GitLab: 6 need attention').getAttribute('data-work-pulse-tone')).toBe('attention')
    // Project prefix rides above each title.
    expect(screen.getAllByText('acme/platform').length).toBeGreaterThan(0)
  })

  it('renders "20+" to-dos at the cap', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, todos: 20 })
    mount(storage)
    await screen.findByText('Add rate limiting to the ingest API')
    expect(screen.getByText('20+ to-dos')).toBeTruthy()
  })

  it('hides the to-dos row when the count is zero', async () => {
    const storage = await seededStorage(CONNECTED, { ...DATA, todos: 0 })
    mount(storage)
    await screen.findByText('Add rate limiting to the ingest API')
    expect(screen.queryByText(/to-dos/)).toBeNull()
  })

  it('shows the empty-connected copy when connected but nothing is assigned', async () => {
    const storage = await seededStorage(CONNECTED, { mrs: [], reviewMrs: [], todos: 0, contributions: null })
    mount(storage)
    expect(await screen.findByText('No MRs assigned to you.')).toBeTruthy()
    expect(screen.getByLabelText('GitLab: All clear').getAttribute('data-work-pulse-tone')).toBe('quiet')
  })

  // Cap lowered 5 -> 3 (Task 55 fix round): this is a glance panel sharing
  // the right column's ~630px budget with github's and jira's own cards
  // (see GitlabWidget.tsx's own MAX_MRS comment). Seeds cap+1 so a
  // regression back to a looser cap (or no cap) fails visibly.
  it('caps MR rows at 3', async () => {
    const many: GitlabData = {
      mrs: Array.from({ length: 4 }, (_, i) => ({
        title: `MR ${i}`,
        url: `https://gitlab.com/o/r/-/merge_requests/${i}`,
        project: 'o/r',
      })),
      reviewMrs: [],
      todos: 0,
      contributions: null,
    }
    const storage = await seededStorage(CONNECTED, many)
    mount(storage)
    await screen.findByText('MR 0')
    expect(screen.getByText('MR 2')).toBeTruthy()
    expect(screen.queryByText('MR 3')).toBeNull()
  })

  it('each row is an external link (target=_blank, rel carries noopener + noreferrer, href + title intact)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    const link = (await screen.findByText('Add rate limiting to the ingest API')).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://gitlab.com/acme/platform/-/merge_requests/204')
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(link.getAttribute('title')).toBe('Add rate limiting to the ingest API')
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    // The gate returns before useConnectorSnapshot mounts, so no refresh wrote a
    // snapshot — the "zero hooks in the gate" proof.
    expect((await storage.get('connectorSnapshots')).gitlab).toBeUndefined()
  })

  it('renders nothing when enabled but no token is present (reconnect state)', async () => {
    const storage = await seededStorage({ ...CONNECTED, token: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).gitlab).toBeUndefined()
  })

  it('renders nothing when enabled + token present but instanceUrl is missing/empty', async () => {
    const storage = await seededStorage({ ...CONNECTED, instanceUrl: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).gitlab).toBeUndefined()
  })

  // Gap fix (verification pass, Task 75): connectedGitlab also validates
  // username string-ness (closing Task 74's carried Minor — an undefined
  // username would otherwise reach the review-asks/activity-graph URLs once
  // those views could be enabled), but that check had no falsifying test of
  // its own. This is that test.
  it('renders nothing when enabled + token + instanceUrl present but username is missing/empty', async () => {
    const storage = await seededStorage({ ...CONNECTED, username: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).gitlab).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no token/instanceUrl fields — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { gitlab: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).gitlab).toBeUndefined()
  })
})

// ── Task 75: the composed card (activity graph, review asks) + cross-card rule ──

const CONTRIB: Contributions = {
  // 2026-01-04 is a Sunday (front-pad 0); the run [0,1,2,4] ends positive → streak 3.
  // `total` rides the object, so the stat line shows 87 regardless of the day counts.
  total: 87,
  days: [
    { date: '2026-01-04', count: 0 },
    { date: '2026-01-05', count: 1 },
    { date: '2026-01-06', count: 2 },
    { date: '2026-01-07', count: 4 },
  ],
}

const REVIEW_MRS: GitlabData['reviewMrs'] = [
  { title: 'Review: refactor the auth guard', url: 'https://gitlab.com/acme/platform/-/merge_requests/300', project: 'acme/platform' },
  { title: 'Review: drop the legacy shim', url: 'https://gitlab.com/acme/platform/-/merge_requests/301', project: 'acme/platform' },
]

const FULL_DATA: GitlabData = { ...DATA, reviewMrs: REVIEW_MRS, contributions: CONTRIB }

const ALL_ON: GitlabConfig = {
  ...CONNECTED,
  views: { mergeRequests: true, reviewAsks: true, todos: true, activityGraph: true },
}
const GRAPH_ONLY: GitlabConfig = {
  ...CONNECTED,
  views: { mergeRequests: false, reviewAsks: false, todos: false, activityGraph: true },
}
const REVIEW_ONLY: GitlabConfig = {
  ...CONNECTED,
  views: { mergeRequests: false, reviewAsks: true, todos: false, activityGraph: false },
}
const TODOS_ONLY: GitlabConfig = {
  ...CONNECTED,
  views: { mergeRequests: false, reviewAsks: false, todos: true, activityGraph: false },
}

/** A github sibling with its commit graph ON (no views → all-on default). */
const GITHUB_GRAPH_ON = { enabled: true, token: 'gh', username: 'x' }
/** A github sibling with its commit graph explicitly OFF (present but not the graph hero). */
const GITHUB_GRAPH_OFF = { enabled: true, token: 'gh', username: 'x', views: { commitGraph: false, pulls: true, issues: true, notifications: true } }
const JIRA_SIBLING = { enabled: true, email: 'a@b.co', apiToken: 'jr', site: 's.atlassian.net', displayName: 'X' }

async function seededMulti(
  gitlab: GitlabConfig,
  data: GitlabData | null,
  siblings: Record<string, unknown> = {},
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { gitlab, ...siblings })
  if (data) {
    await storage.set('connectorSnapshots', {
      gitlab: { scope: await connectorSnapshotScope('gitlab', gitlab), fetchedAt: Date.now(), data },
    })
  }
  return storage
}

const section = () => document.querySelector('section[aria-label="GitLab"]') as HTMLElement
/** The section carries a whole-card tier when it is itself `hidden <tier>:block`. */
const sectionHasTier = (tier: string) => {
  const sec = section()
  return sec.classList.contains('hidden') && sec.className.includes(`${tier}:block`)
}

describe('GitlabWidget — composed card (wave 2)', () => {
  it('renders the activity graph, MR rows, and review-asks rows (with the REVIEW ASKS eyebrow) when every view is on', async () => {
    mount(await seededMulti(ALL_ON, FULL_DATA))

    // Graph on top — the shared ContributionGraph's role="img".
    const img = await screen.findByRole('img')
    expect(img.getAttribute('aria-label')).toMatch(/contribution/i)
    // Assigned MR rows.
    expect(screen.getByText('Add rate limiting to the ingest API')).toBeTruthy()
    // Review-asks rows below their eyebrow (natural-case text, CSS uppercases it).
    expect(screen.getByText('Review: refactor the auth guard')).toBeTruthy()
    expect(screen.getByText('Review asks')).toBeTruthy()
    // To-dos header chip stays.
    expect(screen.getByText('6 to-dos')).toBeTruthy()
  })

  it('the stat line reads "N contributions" (not commits) with the derived streak', async () => {
    mount(await seededMulti(ALL_ON, FULL_DATA))
    const stat = await screen.findByText('contributions')
    expect(screen.queryByText('commits')).toBeNull()
    expect(within(stat).getByText('87')).toBeTruthy() // total
    expect(within(stat).getByText('3')).toBeTruthy() // derived streak (run [0,1,2,4])
  })

  it('omits the REVIEW ASKS eyebrow when review-asks is the only rows list (no assigned MRs above it)', async () => {
    mount(await seededMulti(REVIEW_ONLY, { ...DATA, mrs: [], reviewMrs: REVIEW_MRS, todos: 0 }))
    expect(await screen.findByText('Review: refactor the auth guard')).toBeTruthy()
    expect(screen.queryByText('Review asks')).toBeNull()
    // mergeRequests off → assigned MR titles do NOT render.
    expect(screen.queryByText('Add rate limiting to the ingest API')).toBeNull()
  })

  it('caps review-asks rows at 2', async () => {
    const many: GitlabData = {
      ...DATA,
      mrs: [],
      reviewMrs: Array.from({ length: 3 }, (_, i) => ({
        title: `Review ${i}`,
        url: `https://gitlab.com/o/r/-/merge_requests/${i}`,
        project: 'o/r',
      })),
      todos: 0,
    }
    mount(await seededMulti(REVIEW_ONLY, many))
    await screen.findByText('Review 0')
    expect(screen.getByText('Review 1')).toBeTruthy()
    expect(screen.queryByText('Review 2')).toBeNull()
  })

  it('activityGraph on but NO contributions data → renders the rows, no graph, no crash', async () => {
    mount(await seededMulti(ALL_ON, { ...FULL_DATA, contributions: null }))
    await screen.findByText('Add rate limiting to the ingest API')
    expect(screen.queryByRole('img')).toBeNull()
  })

  // ── Graph reveal tier (classes land now; Task 77 measures the boundaries) ──

  it('SOLE forge card → the composed graph reveals on `taller` (inner wrapper hidden taller:block)', async () => {
    mount(await seededMulti(ALL_ON, FULL_DATA)) // no github, no jira
    const img = await screen.findByRole('img')
    const wrapper = section().querySelector('[class*="taller:block"]')
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('hidden')).toBe(true)
    expect(wrapper!.contains(img)).toBe(true)
    expect(section().querySelector('[class*="grand:block"]')).toBeNull()
  })

  it('stacked WITHOUT github\'s graph (a jira sibling only) → the graph yields to `grand`', async () => {
    mount(await seededMulti(ALL_ON, FULL_DATA, { jira: JIRA_SIBLING }))
    await screen.findByRole('img')
    expect(section().querySelector('[class*="grand:block"]')).toBeTruthy()
    expect(section().querySelector('[class*="taller:block"]')).toBeNull()
  })

  it('stacked with github present but its graph OFF → still `grand` (it is github\'s GRAPH state, not mere presence)', async () => {
    mount(await seededMulti(ALL_ON, FULL_DATA, { github: GITHUB_GRAPH_OFF }))
    await screen.findByRole('img')
    expect(section().querySelector('[class*="grand:block"]')).toBeTruthy()
    expect(section().querySelector('[class*="taller:block"]')).toBeNull()
  })

  it('stacked WITH github\'s graph enabled → gitlab\'s graph does NOT render, and the section carries data-yield="github"', async () => {
    mount(await seededMulti(ALL_ON, FULL_DATA, { github: GITHUB_GRAPH_ON }))
    // The card still renders (MR rows carry it)…
    await screen.findByText('Add rate limiting to the ingest API')
    // …but the graph is withheld — the cross-card rule.
    expect(screen.queryByRole('img')).toBeNull()
    expect(section().getAttribute('data-yield')).toBe('github')
  })

  it('strictly graph-only, SOLE card remains represented without a height tier', async () => {
    mount(await seededMulti(GRAPH_ONLY, FULL_DATA))
    const img = await screen.findByRole('img')
    expect(sectionHasTier('taller')).toBe(false)
    expect(section().querySelector('[class*="taller:block"], [class*="grand:block"]')).toBeNull()
    expect(section().contains(img)).toBe(true)
  })

  it('strictly graph-only with NO contributions data → renders null (nothing it could ever show)', async () => {
    const { container } = mount(await seededMulti(GRAPH_ONLY, { ...DATA, contributions: null, todos: 0 }))
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('strictly graph-only, stacked WITH github\'s graph → renders null (the graph never shows, so nothing would)', async () => {
    const { container } = mount(await seededMulti(GRAPH_ONLY, FULL_DATA, { github: GITHUB_GRAPH_ON }))
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  // ── No-husk law ──

  it('to-dos-only with 0 to-dos → renders null (never a bare "GitLab" heading)', async () => {
    const { container } = mount(await seededMulti(TODOS_ONLY, { ...DATA, mrs: [], reviewMrs: [], todos: 0 }))
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('to-dos-only WITH a positive count → the card renders (the chip carries it)', async () => {
    mount(await seededMulti(TODOS_ONLY, { ...DATA, mrs: [], reviewMrs: [], todos: 4 }))
    expect(await screen.findByText('4 to-dos')).toBeTruthy()
    // mergeRequests off → no MR rows, and no empty MR line either.
    expect(screen.queryByText('Add rate limiting to the ingest API')).toBeNull()
    expect(screen.queryByText('No MRs assigned to you.')).toBeNull()
  })
})

// ── Task 77: review-asks section-tier fix (measured overlap closed) ──
// gitlab's reviewAsks pushed jira — the right rail's lowest card — past the
// Tasks pill at heights ABOVE the old "shown" floor (screenshotted at Jon's
// own 1600x900 board) once jira also shares the rail. review-asks now yields
// under height pressure the SAME way the activity graph already does (see
// index.css's `roomy`/`roomier`/`roomiest` derivation for the measurement
// writeup). These pin the CLASS SELECTION only — scripts/preview.mjs pins the
// real pixel fenceposts.

const REVIEW_NO_GRAPH: GitlabConfig = {
  ...CONNECTED,
  views: { mergeRequests: true, reviewAsks: true, todos: true, activityGraph: false },
}
const JIRA_DUE_SOON_ON = { ...JIRA_SIBLING, views: { assigned: true, statusChips: true, dueSoon: true } }

const reviewAsksWrapper = () => screen.getByText('Review: refactor the auth guard').closest('div') as HTMLElement
const hasTier = (el: HTMLElement, tier: string) => el.classList.contains('hidden') && el.className.includes(`${tier}:block`)
const hasNoTier = (el: HTMLElement) =>
  !el.classList.contains('hidden') &&
  !['roomy', 'roomier', 'grand', 'roomiest'].some((t) => el.className.includes(`${t}:block`))

describe('GitlabWidget — review-asks section tier (Task 77)', () => {
  it('no forge siblings at all → review-asks renders unconditionally (no jira to push toward, and no github graph either)', async () => {
    mount(await seededMulti(ALL_ON, FULL_DATA)) // no siblings
    await screen.findByText('Review: refactor the auth guard')
    expect(hasNoTier(reviewAsksWrapper())).toBe(true)
  })

  it('jira sibling, no graph anywhere, jira dueSoon off → `roomy` (the isolated-section floor)', async () => {
    mount(await seededMulti(REVIEW_NO_GRAPH, FULL_DATA, { jira: JIRA_SIBLING }))
    await screen.findByText('Review: refactor the auth guard')
    expect(hasTier(reviewAsksWrapper(), 'roomy')).toBe(true)
  })

  it('jira sibling, no graph, jira dueSoon ALSO on → `roomier` (both new sections at once)', async () => {
    mount(await seededMulti(REVIEW_NO_GRAPH, FULL_DATA, { jira: JIRA_DUE_SOON_ON }))
    await screen.findByText('Review: refactor the auth guard')
    expect(hasTier(reviewAsksWrapper(), 'roomier')).toBe(true)
  })

  it('jira sibling, github\'s graph on, jira dueSoon off → `grand` (reuses the graph\'s own re-derived tier)', async () => {
    mount(await seededMulti(REVIEW_NO_GRAPH, FULL_DATA, { jira: JIRA_SIBLING, github: GITHUB_GRAPH_ON }))
    await screen.findByText('Review: refactor the auth guard')
    expect(hasTier(reviewAsksWrapper(), 'grand')).toBe(true)
  })

  it('jira sibling, gitlab\'s OWN graph on (no github), jira dueSoon off → `grand` too (either graph owner counts the same)', async () => {
    mount(await seededMulti(ALL_ON, FULL_DATA, { jira: JIRA_SIBLING }))
    await screen.findByText('Review: refactor the auth guard')
    expect(hasTier(reviewAsksWrapper(), 'grand')).toBe(true)
  })

  it('jira sibling, a graph on AND jira dueSoon on → `roomiest` (the full three-way worst case)', async () => {
    mount(await seededMulti(ALL_ON, FULL_DATA, { jira: JIRA_DUE_SOON_ON }))
    await screen.findByText('Review: refactor the auth guard')
    expect(hasTier(reviewAsksWrapper(), 'roomiest')).toBe(true)
  })

  // Fix wave, Finding C1: this used to assert `hasNoTier` — the UNMEASURED
  // "safe at every height" claim the whole-plan review falsified. github's
  // graph reveals at `taller`/890 with just gitlab as its one sibling (no
  // jira needed), growing github to 411px; gitlab-with-reviewAsks then sits
  // right below it as the STACK's own lowest card, and github+graph(bottom
  // 591) + 16 + gitlab-with-reviewAsks(303.5) = 910.5 vs pillTop 846 at
  // Jon's canonical 900h is a real, measured 64.5px overlap. Now reuses
  // `roomy` (needed floor 980.5 <= roomy's 995 — see GitlabWidget.tsx's own
  // `reviewAsksTierName` comment).
  it('gitlab+github only (no jira), github\'s graph ON → review-asks reveals on `roomy` (the two-card composition C1 found unsafe)', async () => {
    mount(await seededMulti(REVIEW_NO_GRAPH, FULL_DATA, { github: GITHUB_GRAPH_ON }))
    await screen.findByText('Review: refactor the auth guard')
    expect(hasTier(reviewAsksWrapper(), 'roomy')).toBe(true)
  })

  // The companion SAFE case (finding C1's own second check): the two-card
  // composition WITHOUT github's graph is genuinely safe unconditionally
  // (github rows-only 235 bottom 415 + 16 + 303.5 = 734.5, clears pillTop 846
  // at 900h) — review-asks must stay untiered here, not over-conservatively
  // tiered just because github is present.
  it('gitlab+github only (no jira), github\'s graph OFF → review-asks renders unconditionally (the two-card composition IS safe without the graph)', async () => {
    mount(await seededMulti(REVIEW_NO_GRAPH, FULL_DATA, { github: GITHUB_GRAPH_OFF }))
    await screen.findByText('Review: refactor the auth guard')
    expect(hasNoTier(reviewAsksWrapper())).toBe(true)
  })
})

// ── Fix wave, Finding I3: the tier-hidden-only content husk ──
// mrs empty + review-asks has real rows, but those rows are THEMSELVES
// CSS-tier-gated (reviewAsksTierName truthy) — below the reveal height, the
// old showEmpty (`reviewMrs.length === 0`) was FALSE (real data exists), so
// the empty line never rendered either: a bare "GitLab" header with nothing
// visible beneath it. This is the falsifying case (must FAIL before the
// fix): the empty line must render, carrying the review-asks tier's INVERSE
// so exactly one of {review rows, empty line} is ever visible.
describe('GitlabWidget — the tier-hidden-only content husk (Task 77 fix wave, Finding I3)', () => {
  it('0 MRs + review-asks rows that are tier-hidden (roomy) → the empty line still renders, carrying `roomy:hidden` — never a bare header', async () => {
    const data: GitlabData = { ...DATA, mrs: [], reviewMrs: REVIEW_MRS, todos: 0, contributions: null }
    mount(await seededMulti(REVIEW_NO_GRAPH, data, { jira: JIRA_SIBLING }))
    const line = await screen.findByText('No MRs assigned to you.')
    expect(line.className).toContain('roomy:hidden')
    // the review-asks rows are still in the DOM (real data), just CSS-tier-hidden.
    expect(screen.getByText('Review: refactor the auth guard')).toBeTruthy()
  })

  it('0 MRs + review-asks rows that are tier-hidden (grand, via a graph elsewhere) → the empty line carries `grand:hidden`', async () => {
    const data: GitlabData = { ...DATA, mrs: [], reviewMrs: REVIEW_MRS, todos: 0, contributions: null }
    mount(await seededMulti(REVIEW_NO_GRAPH, data, { jira: JIRA_SIBLING, github: GITHUB_GRAPH_ON }))
    const line = await screen.findByText('No MRs assigned to you.')
    expect(line.className).toContain('grand:hidden')
  })

  it('0 MRs + review-asks rows that render UNCONDITIONALLY (no tier at all) → the empty line does NOT render (no husk risk, rows always show)', async () => {
    const data: GitlabData = { ...DATA, mrs: [], reviewMrs: REVIEW_MRS, todos: 0, contributions: null }
    mount(await seededMulti(REVIEW_NO_GRAPH, data)) // no siblings — reviewAsksTierName is ''
    await screen.findByText('Review: refactor the auth guard')
    expect(screen.queryByText('No MRs assigned to you.')).toBeNull()
  })
})
