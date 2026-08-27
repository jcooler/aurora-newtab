import { useCallback, useState } from 'react'
import type { AuroraStorage } from '../lib/storage'
import { canonicalOriginPatterns } from '../services/permissions'
import { retryOriginRelease } from '../services/permissionTransactions'

function canonicalPatterns(patterns: readonly string[]): string[] {
  const canonical = new Set<string>()
  for (const pattern of patterns) {
    try {
      for (const value of canonicalOriginPatterns([pattern])) canonical.add(value)
    } catch {
      // A producer only reports canonical host patterns. Ignore a malformed
      // report instead of letting one bad value erase or block prior recovery.
    }
  }
  return [...canonical]
}

export interface PermissionCleanupController {
  pendingPatterns: string[]
  retrying: boolean
  reportPendingCleanup(patterns: readonly string[]): void
  retryPermissionCleanup(): Promise<void>
}

/** SettingsPanel owns this state so a card/body or inactive tab can unmount
 * without losing recovery for a permission Chrome still holds. */
export function usePermissionCleanup(storage: AuroraStorage): PermissionCleanupController {
  const [pendingPatterns, setPendingPatterns] = useState<string[]>([])
  const [retrying, setRetrying] = useState(false)

  const reportPendingCleanup = useCallback((patterns: readonly string[]) => {
    const next = canonicalPatterns(patterns)
    if (next.length === 0) return
    setPendingPatterns((current) => [...new Set([...current, ...next])])
  }, [])

  const retryPermissionCleanup = useCallback(async () => {
    if (pendingPatterns.length === 0 || retrying) return
    const retried = [...pendingPatterns]
    setRetrying(true)
    try {
      const result = await retryOriginRelease(storage, retried)
      const stillPending = new Set(canonicalPatterns(result.pending))
      setPendingPatterns((current) => {
        const remaining = current.filter((pattern) => !retried.includes(pattern) || stillPending.has(pattern))
        for (const pattern of stillPending) if (!remaining.includes(pattern)) remaining.push(pattern)
        return remaining
      })
    } catch {
      // Keep the current set. A later user-triggered retry can recover once
      // the lifecycle authority or Chrome boundary is available again.
    } finally {
      setRetrying(false)
    }
  }, [pendingPatterns, retrying, storage])

  return { pendingPatterns, retrying, reportPendingCleanup, retryPermissionCleanup }
}
