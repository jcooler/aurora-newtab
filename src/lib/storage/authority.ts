export interface StorageAuthority {
  runExclusive<T>(work: () => Promise<T>): Promise<T>
}

const STORAGE_LOCK_NAME = 'aurora:storage:mutation:v1'

export class StorageAuthorityUnavailableError extends Error {
  constructor() {
    super('Aurora storage requires the Web Locks API')
    this.name = 'StorageAuthorityUnavailableError'
  }
}

export function createWebLockStorageAuthority(
  lockManager: Pick<LockManager, 'request'> | undefined,
): StorageAuthority {
  return {
    runExclusive<T>(work: () => Promise<T>): Promise<T> {
      if (!lockManager || typeof lockManager.request !== 'function') {
        return Promise.reject(new StorageAuthorityUnavailableError())
      }
      return lockManager
        .request(STORAGE_LOCK_NAME, { mode: 'exclusive' }, work)
        .then((result) => result)
    },
  }
}

export function createInProcessStorageAuthority(): StorageAuthority {
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
