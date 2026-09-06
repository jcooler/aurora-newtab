// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorage, type AuroraStorage } from '../../../lib/storage'
import { StorageProvider } from '../../../lib/storage/context'
import { memoryDriver } from '../../../lib/storage/driver'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import type { SentryData, SentryIssue } from '../../../services/connectors/sentry'
import type { SentryConfig } from '../../../services/connectors/types'
import SentryWidget from './SentryWidget'

const NOW = 1_700_000_000_000
const CONNECTED: SentryConfig = {
  enabled: true,
  token: 'sentry_test_token',
  organization: 'aurora-test',
  region: 'us',
  itemLimit: 6,
}

function issue(index: number, overrides: Partial<SentryIssue> = {}): SentryIssue {
  return {
    id: `issue-${index}`,
    title: `Checkout failure ${index}`,
    shortId: `WEB-${index}`,
    project: { id: 'web', name: 'Web', slug: 'web' },
    level: index === 0 ? 'fatal' : 'error',
    severity: index === 0 ? 'critical' : 'high',
    count: 20 + index,
    userCount: 3 + index,
    firstSeen: '2026-08-20T10:00:00.000Z',
    lastSeen: '2026-08-22T10:00:00.000Z',
    stats24h: [[1_700_000_000, 4]],
    events24h: 4 + index,
    trend: index === 0 ? 'rising' : 'steady',
    isRegression: index === 0,
    permalink: `https://us.sentry.io/issues/${index}/`,
    priority: index === 0 ? 'high' : null,
    ...overrides,
  }
}

async function seededStorage(
  config: SentryConfig,
  data: SentryData | null = { issues: [issue(0), issue(1)] },
  fetchedAt = NOW,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { sentry: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      sentry: { scope: await connectorSnapshotScope('sentry', config), fetchedAt, data },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard' | 'full'; docked?: boolean } = {}) {
  return render(
    <StorageProvider storage={storage}>
      <SentryWidget {...props} />
    </StorageProvider>,
  )
}

beforeEach(() => {
  __resetInFlight()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  __resetInFlight()
  vi.unstubAllGlobals()
  vi.mocked(Date.now).mockRestore()
})

describe('SentryWidget', () => {
  it('returns for disabled and renders setup without fetching for enabled incomplete connections', async () => {
    const disabled = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const first = mount(disabled)
    await act(async () => {})
    expect(first.container.firstChild).toBeNull()
    expect((await disabled.get('connectorSnapshots')).sentry).toBeUndefined()
    first.unmount()

    const incomplete = await seededStorage({ ...CONNECTED, token: '' }, null)
    mount(incomplete)
    await act(async () => {})
    expect(screen.getByText('Connect Sentry in Settings.')).toBeTruthy()
    expect((await incomplete.get('connectorSnapshots')).sentry).toBeUndefined()
  })

  it.each(['compact', 'standard', 'full'] as const)('uses the exact %s frame for ready data', async (canvasSize) => {
    mount(await seededStorage(CONNECTED), { canvasSize })
    await screen.findByText('2 unresolved')
    const frame = screen.getByRole('region', { name: 'Sentry' })
    expect(frame.getAttribute('data-tier-frame')).toBe(canvasSize)
    expect(frame.getAttribute('data-tier-frame-state')).toBe('ready')
    expect(frame.className).not.toMatch(/overflow-(?:y-)?(?:auto|scroll)/)
    expect(frame.querySelector('[data-work-widget-scroll]')).toBeNull()
  })

  it('renders a useful Compact glance with the top trending issue title', async () => {
    mount(await seededStorage(CONNECTED), { canvasSize: 'compact' })
    expect(await screen.findByText('2 unresolved')).toBeTruthy()
    expect(screen.getByText('1 critical')).toBeTruthy()
    expect(screen.getByText('Fatal')).toBeTruthy()
    expect(screen.getByText('WEB-0')).toBeTruthy()
    expect(screen.getByText('Checkout failure 0')).toBeTruthy()
  })

  it('shows strongest level and top trending short ID as independent Compact facts', async () => {
    const data = {
      issues: [
        issue(0, { level: 'fatal', severity: 'critical', trend: 'falling', events24h: 30 }),
        issue(1, { level: 'error', severity: 'high', trend: 'rising', events24h: 12 }),
      ],
    }
    mount(await seededStorage(CONNECTED, data), { canvasSize: 'compact' })
    expect(await screen.findByText('Fatal')).toBeTruthy()
    expect(screen.getByText('WEB-1')).toBeTruthy()
    expect(screen.queryByText('WEB-0')).toBeNull()
  })

  it('renders named Standard issue context and safe provider links', async () => {
    mount(await seededStorage(CONNECTED), { canvasSize: 'standard' })
    const title = await screen.findByText('Checkout failure 0')
    expect(title.closest('li')?.textContent).toContain('Web · WEB-0')
    expect(title.closest('a')?.getAttribute('aria-label')).toContain('4 events in 24h · rising')
    expect(title.closest('li')?.textContent).toContain('Fatal')
    expect(title.closest('li')?.textContent).toContain('3 users')
    expect(title.closest('a')?.getAttribute('aria-label')).toContain('Last seen')
    const link = title.closest('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://us.sentry.io/issues/0/')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('fits both three-line Standard issue rows with bounded list spacing', async () => {
    mount(await seededStorage(CONNECTED), { canvasSize: 'standard' })

    const secondTitle = await screen.findByText('Checkout failure 1')
    expect(secondTitle.closest('li')?.textContent).toContain('Error')
    expect(secondTitle.closest('li')?.textContent).toContain('4 users')
    expect(secondTitle.closest('a')?.getAttribute('aria-label')).toContain('Last seen')
    const list = secondTitle.closest('ul')
    expect(list?.className).toContain('mt-2')
    expect(list?.className).toContain('gap-1')
  })

  it('bounds Full to three readable issues with complete accessible diagnostic context', async () => {
    const data = { issues: Array.from({ length: 25 }, (_, index) => issue(index)) }
    mount(await seededStorage({ ...CONNECTED, itemLimit: 10 }, data), { canvasSize: 'full' })
    expect(await screen.findByText('Checkout failure 1')).toBeTruthy()
    expect(screen.getByText('Checkout failure 2')).toBeTruthy()
    expect(screen.queryByText('Checkout failure 24')).toBeNull()
    const lead = screen.getByText('Checkout failure 0').closest('a')
    expect(lead?.getAttribute('aria-label')).toContain('First seen')
    expect(lead?.getAttribute('aria-label')).toContain('Priority high')
    expect(lead?.getAttribute('aria-label')).toContain('Regression')
    const frame = screen.getByRole('region', { name: 'Sentry' })
    expect(frame.getAttribute('data-tier-frame')).toBe('full')
    expect(frame.querySelector('[data-work-widget-scroll]')).toBeNull()
  })

  it('opens a Docked detail with named issue context', async () => {
    mount(await seededStorage(CONNECTED), { docked: true })
    const trigger = await screen.findByRole('button', { name: 'Sentry: 2 unresolved, WEB-0' })
    await act(async () => { trigger.click() })
    expect(screen.getByRole('dialog', { name: 'Sentry details' })).toBeTruthy()
    expect(screen.getByText('Checkout failure 0')).toBeTruthy()
    expect(screen.getByText('Web · WEB-0')).toBeTruthy()
  })

  it('renders the empty state without a blank card', async () => {
    mount(await seededStorage(CONNECTED, { issues: [] }), { canvasSize: 'standard' })
    expect(await screen.findByText('No unresolved issues.')).toBeTruthy()
  })

  it('renders a hard error with retry when no snapshot exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    mount(await seededStorage(CONNECTED, null), { canvasSize: 'standard' })
    expect(await screen.findByText('Sentry request failed (network error).')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh Sentry' })).toBeTruthy()
  })

  it.each([['standard', 2], ['full', 3]] as const)('retains the approved work rows with long issue titles at %s', async (canvasSize, count) => {
    const issues = Array.from({ length: 5 }, (_, index) => ({ ...issue(index), title: `TypeError: Unable to complete checkout while refreshing the subscription summary ${index}` }))
    mount(await seededStorage(CONNECTED, { issues }), { canvasSize })
    await screen.findByText(issues[0].title)
    expect(screen.getAllByRole('listitem')).toHaveLength(count)
  })

  it('retains stale rows while a failed refresh reports the saved-data state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    mount(await seededStorage(CONNECTED, { issues: [issue(0)] }, NOW - 10 * 60_000), { canvasSize: 'standard' })
    expect(await screen.findByText('Checkout failure 0')).toBeTruthy()
    expect(await screen.findByText('Sentry request failed (network error).')).toBeTruthy()
    expect(screen.getByText('Checkout failure 0')).toBeTruthy()
  })
})
