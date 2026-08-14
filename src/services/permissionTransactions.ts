import type { AuroraStorage } from '../lib/storage'
import { readOwnedOriginPatterns } from './originOwnership'
import { permissionMirror } from './permissionMirror'
import { canonicalOriginPatterns, ensureOrigins, hasOrigin, hasOrigins, removeOrigin } from './permissions'

export type TransactionBodyResult<T> =
  | { ok: true; value: T; ownerCommitted: true }
  | { ok: false; message: string }

export type OriginTransactionResult<T> =
  | { status: 'permission-unavailable' }
  | { status: 'denied' }
  | { status: 'access-lost'; preExisting: string[]; acquired: string[]; pendingCleanup: string[] }
  | { status: 'aborted'; message: string; preExisting: string[]; acquired: string[]; pendingCleanup: string[] }
  | { status: 'failed'; error: unknown; preExisting: string[]; acquired: string[]; pendingCleanup: string[] }
  | { status: 'committed'; value: T; preExisting: string[]; acquired: string[] }

export interface OriginReleaseResult {
  released: string[]
  pending: string[]
}

export interface OriginPermissionAuthority {
  runExclusive<T>(work: () => Promise<T>): Promise<T>
}

export const ORIGIN_PERMISSION_LOCK_NAME = 'aurora:origin-permission-lifecycle:v1'

export class OriginPermissionAuthorityUnavailableError extends Error {
  constructor() {
    super('Aurora origin permission transactions require the Web Locks API')
    this.name = 'OriginPermissionAuthorityUnavailableError'
  }
}

export function createWebLockOriginPermissionAuthority(
  lockManager: Pick<LockManager, 'request'> | undefined,
): OriginPermissionAuthority {
  return {
    runExclusive<T>(work: () => Promise<T>): Promise<T> {
      if (!lockManager || typeof lockManager.request !== 'function') {
        return Promise.reject(new OriginPermissionAuthorityUnavailableError())
      }
      return lockManager
        .request(ORIGIN_PERMISSION_LOCK_NAME, { mode: 'exclusive' }, work)
        .then((result) => result)
    },
  }
}

export function createInProcessOriginPermissionAuthority(): OriginPermissionAuthority {
  let tail: Promise<void> = Promise.resolve()
  return {
    runExclusive<T>(work: () => Promise<T>): Promise<T> {
      const result = tail.then(work)
      tail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }
}

function productionAuthority(): OriginPermissionAuthority | null {
  const lockManager = typeof navigator === 'undefined' ? undefined : navigator.locks
  return lockManager && typeof lockManager.request === 'function'
    ? createWebLockOriginPermissionAuthority(lockManager)
    : null
}

export interface BegunOriginTransaction<T> {
  result: Promise<T>
  openStartGate(): void
}

/** Queues the cross-context lock immediately while keeping its callback behind
 *  a local gate. The caller opens that gate only after the gesture-consuming
 *  request has been invoked in the initiating turn. */
export function beginOriginTransaction<T>(
  authority: OriginPermissionAuthority,
  work: () => Promise<T>,
): BegunOriginTransaction<T> {
  let open!: () => void
  const startGate = new Promise<void>((resolve) => { open = resolve })
  const result = authority.runExclusive(async () => {
    await startGate
    return work()
  })
  return { result, openStartGate: open }
}

async function releaseUnownedOriginsAlreadyHeld(
  storage: AuroraStorage,
  canonicalCandidates: readonly string[],
): Promise<OriginReleaseResult> {
  let owned: Set<string>
  try {
    owned = new Set(await readOwnedOriginPatterns(storage))
  } catch {
    return { released: [], pending: [...canonicalCandidates] }
  }

  const released: string[] = []
  const pending: string[] = []
  for (const candidate of canonicalCandidates) {
    if (owned.has(candidate)) continue
    try {
      const removed = await removeOrigin(candidate)
      if (removed) {
        released.push(candidate)
        continue
      }
      try {
        if (await hasOrigin(candidate)) pending.push(candidate)
        else released.push(candidate)
      } catch {
        pending.push(candidate)
      }
    } catch {
      pending.push(candidate)
    }
  }
  return { released, pending }
}

export function releaseUnownedOrigins(
  storage: AuroraStorage,
  candidates: readonly string[],
  authority?: OriginPermissionAuthority,
): Promise<OriginReleaseResult> {
  const canonical = canonicalOriginPatterns(candidates)
  const resolvedAuthority = authority ?? productionAuthority()
  if (!resolvedAuthority) return Promise.reject(new OriginPermissionAuthorityUnavailableError())
  return resolvedAuthority.runExclusive(() => releaseUnownedOriginsAlreadyHeld(storage, canonical))
}

export function retryOriginRelease(
  storage: AuroraStorage,
  pending: readonly string[],
  authority?: OriginPermissionAuthority,
): Promise<OriginReleaseResult> {
  return releaseUnownedOrigins(storage, pending, authority)
}

async function rollbackAcquired(
  storage: AuroraStorage,
  acquired: readonly string[],
): Promise<OriginReleaseResult> {
  if (acquired.length === 0) return { released: [], pending: [] }
  return releaseUnownedOriginsAlreadyHeld(storage, acquired)
}

export function runOriginTransaction<T>(
  storage: AuroraStorage,
  urls: readonly string[],
  body: () => Promise<TransactionBodyResult<T>>,
  authority?: OriginPermissionAuthority,
): Promise<OriginTransactionResult<T>> {
  const requested = canonicalOriginPatterns(urls)
  const snapshot = permissionMirror.snapshot(requested)
  if (snapshot.status === 'unavailable') return Promise.resolve({ status: 'permission-unavailable' })

  const resolvedAuthority = authority ?? productionAuthority()
  if (!resolvedAuthority) return Promise.resolve({ status: 'permission-unavailable' })

  let requestPromise: Promise<boolean> | undefined
  const begun = beginOriginTransaction(resolvedAuthority, async (): Promise<OriginTransactionResult<T>> => {
    if (requestPromise) {
      let granted: boolean
      try {
        granted = await requestPromise
      } catch {
        return { status: 'denied' }
      }
      if (!granted) return { status: 'denied' }
    }

    const acquired = requestPromise ? [...snapshot.absent] : []
    try {
      if (!(await hasOrigins(requested))) {
        const cleanup = await rollbackAcquired(storage, acquired)
        return {
          status: 'access-lost',
          preExisting: [...snapshot.preExisting],
          acquired,
          pendingCleanup: cleanup.pending,
        }
      }
    } catch (error) {
      const cleanup = await rollbackAcquired(storage, acquired)
      return {
        status: 'failed',
        error,
        preExisting: [...snapshot.preExisting],
        acquired,
        pendingCleanup: cleanup.pending,
      }
    }

    let bodyResult: TransactionBodyResult<T>
    try {
      bodyResult = await body()
    } catch (error) {
      const cleanup = await rollbackAcquired(storage, acquired)
      return {
        status: 'failed',
        error,
        preExisting: [...snapshot.preExisting],
        acquired,
        pendingCleanup: cleanup.pending,
      }
    }

    if (!bodyResult.ok) {
      const cleanup = await rollbackAcquired(storage, acquired)
      return {
        status: 'aborted',
        message: bodyResult.message,
        preExisting: [...snapshot.preExisting],
        acquired,
        pendingCleanup: cleanup.pending,
      }
    }

    return {
      status: 'committed',
      value: bodyResult.value,
      preExisting: [...snapshot.preExisting],
      acquired,
    }
  })

  if (snapshot.absent.length > 0) {
    try {
      requestPromise = ensureOrigins(snapshot.absent)
    } catch (error) {
      requestPromise = Promise.reject(error)
    }
  }
  begun.openStartGate()

  return begun.result.catch(async (error): Promise<OriginTransactionResult<T>> => {
    let acquired: string[] = []
    if (requestPromise) {
      try {
        if (await requestPromise) acquired = [...snapshot.absent]
        else return { status: 'denied' }
      } catch {
        return { status: 'denied' }
      }
    }
    return {
      status: 'failed',
      error,
      preExisting: [...snapshot.preExisting],
      acquired,
      pendingCleanup: acquired,
    }
  })
}
