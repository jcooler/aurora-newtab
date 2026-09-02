// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createInProcessStorageAuthority } from './authority'
import { memoryDriver } from './driver'
import type { AuroraStorage } from './index'
import { StorageProvider, useSyncStorageRuntime } from './context'

describe('StorageProvider sync runtime boundary', () => {
  it('exposes only the explicitly supplied driver and authority to the sync lifecycle', () => {
    const driver = memoryDriver()
    const authority = createInProcessStorageAuthority()
    const { result } = renderHook(() => useSyncStorageRuntime(), {
      wrapper: ({ children }) => (
        <StorageProvider storage={{} as AuroraStorage} syncRuntime={{ driver, authority }}>
          {children}
        </StorageProvider>
      ),
    })
    expect(result.current).toEqual({ driver, authority })
  })

  it('returns null when no sync authority was supplied', () => {
    const { result } = renderHook(() => useSyncStorageRuntime(), {
      wrapper: ({ children }) => <StorageProvider storage={{} as AuroraStorage}>{children}</StorageProvider>,
    })
    expect(result.current).toBeNull()
  })
})
