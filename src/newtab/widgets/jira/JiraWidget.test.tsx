// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { JiraData } from '../../../services/connectors/jira'
import type { JiraConfig } from '../../../services/connectors/types'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import JiraWidget from './JiraWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives across
// cases; reset it so one test's refresh can't dedupe the next (same discipline
// as GitlabWidget.test.tsx).
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const DATA: JiraData = {
  issues: [
    {
      key: 'AUR-12',
      summary: 'Fix the flaky auth test on CI',
      status: 'In Progress',
      url: 'https://yoursite.atlassian.net/browse/AUR-12',
    },
    {
      key: 'AUR-13',
      summary: 'Weather chip overlaps the bar at 800px wide',
      status: 'To Do',
      url: 'https://yoursite.atlassian.net/browse/AUR-13',
    },
  ],
  counts: { 'In Progress': 3, 'To Do': 2 },
  // Wave-2 field (Task 74): the due-soon section is OFF by default; present
  // only to satisfy JiraData's shape (Task 75 renders it).
  dueSoon: [],
}

const CONNECTED: JiraConfig = {
  enabled: true,
  email: 'jon@acme.com',
  apiToken: 'tok_x',
  site: 'yoursite.atlassian.net',
  displayName: 'Jon Cooler',
}

/** Storage seeded with a CONNECTED jira connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never calls
 *  the real fetchJira — the widget renders straight from cache, no network. */
async function seededStorage(config: JiraConfig, data: JiraData | null = DATA): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { jira: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      jira: { scope: await connectorSnapshotScope('jira', config), fetchedAt: Date.now(), data },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, canvasSize?: 'compact' | 'standard' | 'full') {
  return render(
    <StorageProvider storage={storage}>
      <JiraWidget canvasSize={canvasSize} />
    </StorageProvider>,
  )
}

describe('JiraWidget', () => {
  it('Docked renders one dense line from the same snapshot and no card (NL-P5 batch 2)', async () => {
    const storage = await seededStorage(CONNECTED)
    render(
      <StorageProvider storage={storage}>
        <JiraWidget docked />
      </StorageProvider>,
    )
    const line = await screen.findByLabelText('Jira: 2 assigned')
    expect(line.getAttribute('data-dock-line')).toBe('')
    expect(line.getAttribute('data-work-pulse-summary')).toBeNull()
    // The dense line replaces the card entirely — no rows, no counts line.
    expect(screen.queryByText('Fix the flaky auth test on CI')).toBeNull()
  })

  it('renders issue rows plus the counts line from the seeded snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    await screen.findByText('AUR-12')
    expect(screen.getByText('Fix the flaky auth test on CI')).toBeTruthy()
    expect(screen.getByText('AUR-13')).toBeTruthy()
    expect(screen.getByText('Weather chip overlaps the bar at 800px wide')).toBeTruthy()
    expect(screen.getByLabelText('Jira: 5 active items').getAttribute('data-work-pulse-tone')).toBe('attention')
    // Counts line: first two statuses by count, descending.
    expect(screen.getByText('3 In Progress · 2 To Do')).toBeTruthy()
  })

  // Review fix (round 1): the happy-path test above ('3 In Progress · 2 To
  // Do') never falsifies count-descending order against insertion order,
  // because 'In Progress' happens to be BOTH the higher count AND the
  // first-inserted key in that fixture. Here the insertion order (Done,
  // In Progress, To Do — via object key order) is the OPPOSITE of the
  // count-descending order the widget must render in, and there's a TIE
  // (Done/To Do both at 1) the widget breaks by insertion order.
  it('the counts line sorts by count descending, not by insertion order (with a tie broken by insertion order)', async () => {
    const storage = await seededStorage(CONNECTED, {
      issues: [{ key: 'AUR-1', summary: 'Solo', status: 'In Progress', url: 'https://yoursite.atlassian.net/browse/AUR-1' }],
      counts: { Done: 1, 'In Progress': 5, 'To Do': 1 },
      dueSoon: [],
    })
    mount(storage)
    await screen.findByText('AUR-1')
    expect(screen.getByText('5 In Progress · 1 Done')).toBeTruthy()
  })

  it('shows only one status in the counts line when only one is present', async () => {
    const storage = await seededStorage(CONNECTED, {
      issues: [{ key: 'AUR-1', summary: 'Solo', status: 'To Do', url: 'https://yoursite.atlassian.net/browse/AUR-1' }],
      counts: { 'To Do': 1 },
      dueSoon: [],
    })
    mount(storage)
    await screen.findByText('AUR-1')
    expect(screen.getByText('1 To Do')).toBeTruthy()
  })

  it('hides the counts line when there are no issues', async () => {
    const storage = await seededStorage(CONNECTED, { issues: [], counts: {}, dueSoon: [] })
    mount(storage)
    expect(await screen.findByText('Nothing assigned to you.')).toBeTruthy()
    expect(screen.queryByText(/·/)).toBeNull()
  })

  it('shows the empty-connected copy when connected but nothing is assigned', async () => {
    const storage = await seededStorage(CONNECTED, { issues: [], counts: {}, dueSoon: [] })
    mount(storage)
    expect(await screen.findByText('Nothing assigned to you.')).toBeTruthy()
    expect(screen.getByLabelText('Jira: All clear').getAttribute('data-work-pulse-tone')).toBe('quiet')
  })

  // Cap lowered 5 -> 3 (Task 55 fix round): this is a glance panel sharing
  // the right column's ~630px budget with github's and gitlab's own cards
  // (see JiraWidget.tsx's own MAX_ISSUES comment) — jira's card sits lowest,
  // so its bottom edge is what has to clear the Tasks pill. Seeds cap+1 so a
  // regression back to a looser cap (or no cap) fails visibly.
  it('caps issue rows at 3', async () => {
    const many: JiraData = {
      issues: Array.from({ length: 4 }, (_, i) => ({
        key: `AUR-${i}`,
        summary: `Issue ${i}`,
        status: 'To Do',
        url: `https://yoursite.atlassian.net/browse/AUR-${i}`,
      })),
      counts: { 'To Do': 4 },
      dueSoon: [],
    }
    const storage = await seededStorage(CONNECTED, many)
    mount(storage)
    await screen.findByText('AUR-0')
    expect(screen.getByText('AUR-2')).toBeTruthy()
    expect(screen.queryByText('AUR-3')).toBeNull()
  })

  it('each row is an external link (target=_blank, rel carries noopener + noreferrer, href + title intact)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    const link = (await screen.findByText('Fix the flaky auth test on CI')).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://yoursite.atlassian.net/browse/AUR-12')
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
    expect(link.getAttribute('title')).toBe('Fix the flaky auth test on CI')
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    // The gate returns before useConnectorSnapshot mounts, so no refresh wrote a
    // snapshot — the "zero hooks in the gate" proof.
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })

  it('renders nothing when enabled but no email is present (reconnect state)', async () => {
    const storage = await seededStorage({ ...CONNECTED, email: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })

  it('renders nothing when enabled but no apiToken is present (reconnect state)', async () => {
    const storage = await seededStorage({ ...CONNECTED, apiToken: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })

  it('renders nothing when enabled + credentials present but site is missing/empty', async () => {
    const storage = await seededStorage({ ...CONNECTED, site: '' }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no site/email/apiToken fields — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { jira: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).jira).toBeUndefined()
  })
})

// ── Task 75: the composed card (due-soon section) + no-husk law ──

const DUE_SOON: JiraData['dueSoon'] = [
  {
    key: 'AUR-20',
    summary: 'Ship the release notes',
    status: 'To Do',
    url: 'https://yoursite.atlassian.net/browse/AUR-20',
    due: '2026-08-15',
  },
  // A due-soon row whose duedate was missing/malformed — kept, shown WITHOUT a
  // date prefix (just its key).
  {
    key: 'AUR-21',
    summary: 'Rotate the API tokens',
    status: 'In Progress',
    url: 'https://yoursite.atlassian.net/browse/AUR-21',
  },
]

const ALL_ON: JiraConfig = { ...CONNECTED, views: { assigned: true, statusChips: true, dueSoon: true } }
const DUE_ONLY: JiraConfig = { ...CONNECTED, views: { assigned: false, statusChips: false, dueSoon: true } }
const CHIPS_ONLY: JiraConfig = { ...CONNECTED, views: { assigned: false, statusChips: true, dueSoon: false } }

describe('JiraWidget — composed card (wave 2)', () => {
  it('uses real due-soon rows in Standard when that is the only selected issue family', async () => {
    const storage = await seededStorage(DUE_ONLY, { ...DATA, issues: [], counts: {}, dueSoon: DUE_SOON })
    mount(storage, 'standard')

    expect(await screen.findByText('Ship the release notes')).toBeTruthy()
    expect(screen.getByTitle('Ship the release notes').getAttribute('href')).toContain('/browse/AUR-20')
    expect(screen.getByText('To Do')).toBeTruthy()
  })

  it('renders assigned issues and the due-soon list (below a DUE SOON eyebrow) when both are on', async () => {
    const storage = await seededStorage(ALL_ON, { ...DATA, dueSoon: DUE_SOON })
    mount(storage)

    await screen.findByText('AUR-12') // assigned
    expect(screen.getByText('Ship the release notes')).toBeTruthy() // due-soon
    expect(screen.getByText('Due soon')).toBeTruthy() // eyebrow (both sections render)
    // Due-soon prefix: `{due} · {key}` when due is present…
    expect(screen.getByText('2026-08-15 · AUR-20')).toBeTruthy()
    // …and just the key when it's absent.
    expect(screen.getByText('AUR-21')).toBeTruthy()
    // The row's title attr carries the full summary.
    const link = screen.getByText('Ship the release notes').closest('a') as HTMLAnchorElement
    expect(link.getAttribute('title')).toBe('Ship the release notes')
  })

  it('omits the DUE SOON eyebrow when due-soon is the only rows list (no assigned issues above it)', async () => {
    const storage = await seededStorage(DUE_ONLY, { issues: [], counts: {}, dueSoon: DUE_SOON })
    mount(storage)
    expect(await screen.findByText('Ship the release notes')).toBeTruthy()
    expect(screen.queryByText('Due soon')).toBeNull()
    // assigned off → the assigned rows do NOT render, nor the empty line.
    expect(screen.queryByText('AUR-12')).toBeNull()
    expect(screen.queryByText('Nothing assigned to you.')).toBeNull()
  })

  it('caps due-soon rows at 2', async () => {
    const many: JiraData = {
      issues: [],
      counts: {},
      dueSoon: Array.from({ length: 3 }, (_, i) => ({
        key: `AUR-${30 + i}`,
        summary: `Due ${i}`,
        status: 'To Do',
        url: `https://yoursite.atlassian.net/browse/AUR-${30 + i}`,
        due: '2026-08-20',
      })),
    }
    const storage = await seededStorage(DUE_ONLY, many)
    mount(storage)
    await screen.findByText('Due 0')
    expect(screen.getByText('Due 1')).toBeTruthy()
    expect(screen.queryByText('Due 2')).toBeNull()
  })

  it('the empty line shows when a rows section is enabled and BOTH lists are empty', async () => {
    const storage = await seededStorage(ALL_ON, { issues: [], counts: {}, dueSoon: [] })
    mount(storage)
    expect(await screen.findByText('Nothing assigned to you.')).toBeTruthy()
  })

  // No-husk law: status-chips-only with empty counts → the whole card is null.
  it('status-chips-only with empty counts → renders null (never a bare "Jira" heading)', async () => {
    const storage = await seededStorage(CHIPS_ONLY, { issues: [], counts: {}, dueSoon: [] })
    const { container } = mount(storage)
    await act(async () => {})
    expect(container.firstChild).toBeNull()
  })

  it('status-chips-only WITH counts present → the card renders (the chip carries it, no rows, no empty line)', async () => {
    // counts ride from a prior assigned fetch; assigned + dueSoon are off, so no
    // rows and no empty line — only the chip.
    const storage = await seededStorage(CHIPS_ONLY, {
      issues: [{ key: 'AUR-1', summary: 'Solo', status: 'In Progress', url: 'https://yoursite.atlassian.net/browse/AUR-1' }],
      counts: { 'In Progress': 3, 'To Do': 2 },
      dueSoon: [],
    })
    mount(storage)
    expect(await screen.findByText('3 In Progress · 2 To Do')).toBeTruthy()
    expect(screen.queryByText('AUR-1')).toBeNull() // assigned off → no rows
    expect(screen.queryByText('Nothing assigned to you.')).toBeNull()
  })
})

// ── Task 77: due-soon section-tier fix (measured overlap closed) ──
// jira's dueSoon pushed jira's OWN bottom — the right rail's lowest card —
// past the Tasks pill at heights ABOVE the old "shown" floor (screenshotted
// at Jon's own 1600x900 board) once gitlab also shares the rail. due-soon now
// yields under height pressure the SAME way github's/gitlab's activity graph
// already does (see index.css's `roomy`/`roomier`/`roomiest` derivation for
// the measurement writeup, and GitlabWidget.test.tsx's symmetric
// `reviewAsksTier` tests). These pin the CLASS SELECTION only —
// scripts/preview.mjs pins the real pixel fenceposts.

/** Storage seeded with a CONNECTED jira connector, a snapshot, and optional
 *  SIBLING connector configs (gitlab/github) — the cross-card reads
 *  `dueSoonTier` needs. Mirrors GitlabWidget.test.tsx's own `seededMulti`. */
async function seededMulti(jira: JiraConfig, data: JiraData | null, siblings: Record<string, unknown> = {}): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { jira, ...siblings })
  if (data) {
    await storage.set('connectorSnapshots', {
      jira: { scope: await connectorSnapshotScope('jira', jira), fetchedAt: Date.now(), data },
    })
  }
  return storage
}

const GITLAB_SIBLING = { enabled: true, token: 'gl', instanceUrl: 'https://gitlab.com', username: 'jcooler' }
const GITLAB_REVIEWASKS_ON = { ...GITLAB_SIBLING, views: { mergeRequests: true, reviewAsks: true, todos: true, activityGraph: false } }
const GITLAB_GRAPH_ON = { ...GITLAB_SIBLING, views: { mergeRequests: true, reviewAsks: false, todos: true, activityGraph: true } }
/** A github sibling with its commit graph ON (no views → all-on default). */
const GITHUB_GRAPH_ON = { enabled: true, token: 'gh', username: 'x' }
/** A github sibling with its commit graph explicitly OFF (present but not the graph hero) — fix wave, Finding C1's own SAFE-case control. */
const GITHUB_GRAPH_OFF = { enabled: true, token: 'gh', username: 'x', views: { commitGraph: false, pulls: true, issues: true, notifications: true } }

const dueSoonWrapper = () => screen.getByText('Ship the release notes').closest('div') as HTMLElement
const hasTier = (el: HTMLElement, tier: string) => el.classList.contains('hidden') && el.className.includes(`${tier}:block`)
const hasNoTier = (el: HTMLElement) =>
  !el.classList.contains('hidden') &&
  !['roomy', 'roomier', 'grand', 'roomiest'].some((t) => el.className.includes(`${t}:block`))

describe('JiraWidget — due-soon section tier (Task 77)', () => {
  it('no forge siblings at all → due-soon renders unconditionally (no gitlab to push toward, and no github graph either)', async () => {
    mount(await seededMulti(ALL_ON, { ...DATA, dueSoon: DUE_SOON })) // no siblings
    await screen.findByText('Ship the release notes')
    expect(hasNoTier(dueSoonWrapper())).toBe(true)
  })

  it('gitlab sibling, no graph anywhere, gitlab reviewAsks off → `roomy` (the isolated-section floor)', async () => {
    mount(await seededMulti(ALL_ON, { ...DATA, dueSoon: DUE_SOON }, { gitlab: GITLAB_SIBLING }))
    await screen.findByText('Ship the release notes')
    expect(hasTier(dueSoonWrapper(), 'roomy')).toBe(true)
  })

  it('gitlab sibling, no graph, gitlab reviewAsks ALSO on → `roomier` (both new sections at once)', async () => {
    mount(await seededMulti(ALL_ON, { ...DATA, dueSoon: DUE_SOON }, { gitlab: GITLAB_REVIEWASKS_ON }))
    await screen.findByText('Ship the release notes')
    expect(hasTier(dueSoonWrapper(), 'roomier')).toBe(true)
  })

  it('gitlab sibling, github\'s graph on, gitlab reviewAsks off → `grand` (reuses the graph\'s own re-derived tier)', async () => {
    mount(await seededMulti(ALL_ON, { ...DATA, dueSoon: DUE_SOON }, { gitlab: GITLAB_SIBLING, github: GITHUB_GRAPH_ON }))
    await screen.findByText('Ship the release notes')
    expect(hasTier(dueSoonWrapper(), 'grand')).toBe(true)
  })

  it('gitlab sibling with its OWN graph on (no github), reviewAsks off → `grand` too (either graph owner counts the same)', async () => {
    mount(await seededMulti(ALL_ON, { ...DATA, dueSoon: DUE_SOON }, { gitlab: GITLAB_GRAPH_ON }))
    await screen.findByText('Ship the release notes')
    expect(hasTier(dueSoonWrapper(), 'grand')).toBe(true)
  })

  it('gitlab sibling, a graph on AND gitlab reviewAsks on → `roomiest` (the full three-way worst case)', async () => {
    const gitlabBoth = { ...GITLAB_SIBLING, views: { mergeRequests: true, reviewAsks: true, todos: true, activityGraph: true } }
    mount(await seededMulti(ALL_ON, { ...DATA, dueSoon: DUE_SOON }, { gitlab: gitlabBoth }))
    await screen.findByText('Ship the release notes')
    expect(hasTier(dueSoonWrapper(), 'roomiest')).toBe(true)
  })

  // Fix wave, Finding C1: this used to assert `hasNoTier` — the UNMEASURED
  // "safe at every height" claim the whole-plan review falsified. github's
  // graph reveals at `taller`/890 with just jira as its one sibling (no
  // gitlab needed — gitlab renders null when disabled, so jira slides up
  // into the SECOND slot right below github+graph). github+graph(bottom 591)
  // + 16 + jira-with-dueSoon(303.5) = 910.5 vs pillTop 846 at Jon's canonical
  // 900h is the identical 64.5px overlap GitlabWidget.tsx's own composition
  // measures. Now reuses `roomy` (see JiraWidget.tsx's own `dueSoonTierName`
  // comment).
  it('jira+github only (no gitlab), github\'s graph ON → due-soon reveals on `roomy` (the two-card composition C1 found unsafe)', async () => {
    mount(await seededMulti(ALL_ON, { ...DATA, dueSoon: DUE_SOON }, { github: GITHUB_GRAPH_ON }))
    await screen.findByText('Ship the release notes')
    expect(hasTier(dueSoonWrapper(), 'roomy')).toBe(true)
  })

  // The companion SAFE case (finding C1's own second check): the two-card
  // composition WITHOUT github's graph is genuinely safe unconditionally
  // (github rows-only 235 bottom 415 + 16 + 303.5 = 734.5, clears pillTop 846
  // at 900h) — due-soon must stay untiered here, not over-conservatively
  // tiered just because github is present.
  it('jira+github only (no gitlab), github\'s graph OFF → due-soon renders unconditionally (the two-card composition IS safe without the graph)', async () => {
    mount(await seededMulti(ALL_ON, { ...DATA, dueSoon: DUE_SOON }, { github: GITHUB_GRAPH_OFF }))
    await screen.findByText('Ship the release notes')
    expect(hasNoTier(dueSoonWrapper())).toBe(true)
  })
})

// ── Fix wave, Finding I3: the tier-hidden-only content husk ──
// issues empty + due-soon has real rows, but those rows are THEMSELVES
// CSS-tier-gated (dueSoonTierName truthy) — below the reveal height, the old
// showEmpty (`dueSoon.length === 0`) was FALSE (real data exists), so the
// empty line never rendered either: a bare "Jira" header with nothing
// visible beneath it. This is the falsifying case (must FAIL before the
// fix): the empty line must render, carrying the due-soon tier's INVERSE so
// exactly one of {due-soon rows, empty line} is ever visible.
describe('JiraWidget — the tier-hidden-only content husk (Task 77 fix wave, Finding I3)', () => {
  it('0 issues + due-soon rows that are tier-hidden (roomy) → the empty line still renders, carrying `roomy:hidden` — never a bare header', async () => {
    mount(await seededMulti(ALL_ON, { issues: [], counts: {}, dueSoon: DUE_SOON }, { gitlab: GITLAB_SIBLING }))
    const line = await screen.findByText('Nothing assigned to you.')
    expect(line.className).toContain('roomy:hidden')
    // the due-soon rows are still in the DOM (real data), just CSS-tier-hidden.
    expect(screen.getByText('Ship the release notes')).toBeTruthy()
  })

  it('0 issues + due-soon rows that are tier-hidden (grand, via a graph elsewhere) → the empty line carries `grand:hidden`', async () => {
    mount(
      await seededMulti(
        ALL_ON,
        { issues: [], counts: {}, dueSoon: DUE_SOON },
        { gitlab: GITLAB_SIBLING, github: GITHUB_GRAPH_ON },
      ),
    )
    const line = await screen.findByText('Nothing assigned to you.')
    expect(line.className).toContain('grand:hidden')
  })

  it('0 issues + due-soon rows that render UNCONDITIONALLY (no tier at all) → the empty line does NOT render (no husk risk, rows always show)', async () => {
    mount(await seededMulti(ALL_ON, { issues: [], counts: {}, dueSoon: DUE_SOON })) // no siblings — dueSoonTierName is ''
    await screen.findByText('Ship the release notes')
    expect(screen.queryByText('Nothing assigned to you.')).toBeNull()
  })
})
