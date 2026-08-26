// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetInFlight } from '../../lib/hooks/useConnectorSnapshot'
import { createStorage, type AuroraStorage } from '../../lib/storage'
import { StorageProvider } from '../../lib/storage/context'
import { memoryDriver } from '../../lib/storage/driver'
import { defaults, type AuroraData, type BriefingSources } from '../../lib/storage/schema'
import type { GithubConfig, LinearConfig, VercelConfig } from '../../services/connectors/types'
import GithubWidget from '../widgets/github/GithubWidget'
import AttentionRefreshOwners from './AttentionRefreshOwners'

const GITHUB: GithubConfig = {
  enabled: true,
  token: 'github_pat_test',
  username: 'jon',
  views: { commitGraph: false, pulls: false, issues: false, notifications: false },
}
const VERCEL: VercelConfig = {
  enabled: true,
  token: 'vercel_test',
  username: 'jon',
  views: { deployments: false, statusSummary: false },
}
const LINEAR: LinearConfig = {
  enabled: true,
  token: 'lin_api_test',
  displayName: 'Jon',
}
const SOURCES: BriefingSources = { calendar: true, assignments: true, deployments: true, rain: true }

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response
}

async function storageWith(
  connectors: AuroraData['connectors'],
  briefingEnabled = true,
  briefingSources: BriefingSources = SOURCES,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.setMany({
    connectors,
    settings: { ...defaults().settings, briefingEnabled, briefingSources },
  })
  return storage
}

function mount(storage: AuroraStorage, child: React.ReactNode = <AttentionRefreshOwners />) {
  return render(<StorageProvider storage={storage}>{child}</StorageProvider>)
}

beforeEach(() => {
  __resetInFlight()
})

afterEach(() => {
  __resetInFlight()
  vi.unstubAllGlobals()
})

describe('AttentionRefreshOwners', () => {
  it('does not fetch when the master preference is off', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    mount(await storageWith({ github: GITHUB, vercel: VERCEL }, false))
    await act(async () => {})
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('honors assignment and deployment source switches independently', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    mount(await storageWith(
      { github: GITHUB, vercel: VERCEL },
      true,
      { ...SOURCES, assignments: false, deployments: false },
    ))
    await act(async () => {})
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches the GitHub assignment sections even when their visible widget sections are off', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({ items: [] }))
    vi.stubGlobal('fetch', fetchSpy)
    mount(await storageWith({ github: GITHUB }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    expect(fetchSpy.mock.calls.every(([url]) => String(url).includes('/search/issues'))).toBe(true)
  })

  it('fetches Vercel failures and Linear assignments from connected hidden sources', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('api.vercel.com')) return jsonResponse({ deployments: [] })
      return jsonResponse({ data: { viewer: { assignedIssues: { nodes: [] } } } })
    })
    vi.stubGlobal('fetch', fetchSpy)
    mount(await storageWith({ vercel: VERCEL, linear: LINEAR }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('api.vercel.com'))).toBe(true)
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('api.linear.app'))).toBe(true)
  })

  it('coalesces a hidden GitHub refresh with the visible widget and requests no permission', async () => {
    const config: GithubConfig = { ...GITHUB, views: { ...GITHUB.views!, pulls: true } }
    const resolvers: Array<(response: Response) => void> = []
    const fetchSpy = vi.fn((_input: RequestInfo | URL) => new Promise<Response>((resolve) => {
      resolvers.push(resolve)
    }))
    const permissionRequest = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('chrome', { permissions: { request: permissionRequest } })
    const storage = await storageWith({ github: config })

    mount(storage, <><AttentionRefreshOwners /><GithubWidget /></>)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    expect(permissionRequest).not.toHaveBeenCalled()
    await act(async () => {
      for (const resolve of resolvers) resolve(jsonResponse({ items: [] }))
    })
  })
})
