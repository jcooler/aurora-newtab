// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { JiraData } from '../../../services/connectors/jira'
import type { JiraConfig } from '../../../services/connectors/types'
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
  if (data) await storage.set('connectorSnapshots', { jira: { fetchedAt: Date.now(), data } })
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <JiraWidget />
    </StorageProvider>,
  )
}

describe('JiraWidget', () => {
  it('renders issue rows plus the counts line from the seeded snapshot', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    await screen.findByText('AUR-12')
    expect(screen.getByText('Fix the flaky auth test on CI')).toBeTruthy()
    expect(screen.getByText('AUR-13')).toBeTruthy()
    expect(screen.getByText('Weather chip overlaps the bar at 800px wide')).toBeTruthy()
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
