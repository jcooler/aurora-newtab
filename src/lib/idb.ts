// src/lib/idb.ts — single-slot store for the user-uploaded background.
const DB_NAME = 'aurora'
const STORE = 'photos'
const SLOT = 'user-photo'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function putUpload(blob: Blob): Promise<IDBValidKey> {
  return withStore('readwrite', (s) => s.put(blob, SLOT))
}

export async function getUpload(): Promise<Blob | null> {
  const value = await withStore<unknown>('readonly', (s) => s.get(SLOT))
  return value instanceof Blob ? value : null
}

export function clearUpload(): Promise<undefined> {
  return withStore('readwrite', (s) => s.delete(SLOT))
}
