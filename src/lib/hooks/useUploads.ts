import { useEffect, useState } from 'react'
import { listUploads } from '../idb'
import type { Upload } from '../idb'

// The shape lives with the store that produces it (src/lib/idb.ts) now that
// a gallery entry carries a thumbnail as well as the photo; re-exported here
// so the existing `import type { Upload } from '.../hooks/useUploads'`
// call sites keep working.
export type { Upload }

/**
 * Loads the uploaded-photo gallery while `active`, re-fetching whenever
 * `nonce` (the uploadedAt stamp bumped on every add/remove) changes so
 * writes from other tabs are picked up. Resets to `emptyValue` when
 * inactive — callers pick the reset that matches their own "not loaded"
 * semantics: Background passes `null` to distinguish a load still in flight
 * from a confirmed-empty gallery (only the latter should cascade to the
 * bundled set); SettingsPanel has no such distinction and passes `[]`.
 */
export function useUploads(active: boolean, nonce: string | undefined, emptyValue: null): Upload[] | null
export function useUploads(active: boolean, nonce: string | undefined, emptyValue: Upload[]): Upload[]
export function useUploads(
  active: boolean,
  nonce: string | undefined,
  emptyValue: Upload[] | null,
): Upload[] | null {
  const [uploads, setUploads] = useState<Upload[] | null>(emptyValue)

  useEffect(() => {
    if (!active) {
      setUploads(emptyValue)
      return
    }
    let cancelled = false
    void listUploads().then((list) => {
      if (cancelled) return // superseded effect run must not set stale state
      setUploads(list)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, nonce])

  return uploads
}
