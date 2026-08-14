// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AuroraStorage } from '../lib/storage'

vi.mock('../services/permissionTransactions', () => ({ retryOriginRelease: vi.fn() }))
import { retryOriginRelease } from '../services/permissionTransactions'
import { usePermissionCleanup } from './usePermissionCleanup'

function Harness({ storage, onReady }: { storage: AuroraStorage; onReady: (value: ReturnType<typeof usePermissionCleanup>) => void }) {
  onReady(usePermissionCleanup(storage))
  return null
}

describe('usePermissionCleanup', () => {
  it('merges and canonicalizes reports, then retains only the patterns that remain pending after retry', async () => {
    const storage = {} as AuroraStorage
    let cleanup!: ReturnType<typeof usePermissionCleanup>
    vi.mocked(retryOriginRelease).mockResolvedValue({
      released: ['https://first.example.com/*'],
      pending: ['https://second.example.com/*'],
    })

    render(<Harness storage={storage} onReady={(value) => { cleanup = value }} />)

    act(() => {
      cleanup.reportPendingCleanup(['https://first.example.com/path', 'https://second.example.com/*'])
      cleanup.reportPendingCleanup(['https://first.example.com/*'])
    })
    expect(cleanup.pendingPatterns).toEqual(['https://first.example.com/*', 'https://second.example.com/*'])

    await act(async () => {
      await cleanup.retryPermissionCleanup()
    })

    expect(retryOriginRelease).toHaveBeenCalledWith(storage, [
      'https://first.example.com/*',
      'https://second.example.com/*',
    ])
    expect(cleanup.pendingPatterns).toEqual(['https://second.example.com/*'])
  })

  it('retains its current durable set when the retry boundary rejects', async () => {
    const storage = {} as AuroraStorage
    let cleanup!: ReturnType<typeof usePermissionCleanup>
    vi.mocked(retryOriginRelease).mockRejectedValue(new Error('authority unavailable'))

    render(<Harness storage={storage} onReady={(value) => { cleanup = value }} />)
    act(() => {
      cleanup.reportPendingCleanup(['https://stuck.example.com/*'])
    })

    await act(async () => {
      await cleanup.retryPermissionCleanup()
    })

    expect(cleanup.pendingPatterns).toEqual(['https://stuck.example.com/*'])
  })
})
