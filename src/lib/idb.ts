// src/lib/idb.ts — multi-photo store for user-uploaded backgrounds.
const DB_NAME = 'aurora'
const STORE = 'photos'
const LEGACY_KEY = 'user-photo' // v1's single-slot key; migrated lazily by listUploads()

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    // v1 already created the store (upgrading from 1); only create it when
    // missing, which covers a fresh install going straight to v2 (0→2).
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return requestToPromise(fn(db.transaction(STORE, mode).objectStore(STORE)))
}

/** Store each file under its own `photo:<uuid>` key, in a single transaction. */
export async function addUploads(files: File[]): Promise<void> {
  if (files.length === 0) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const file of files) store.put(file, `photo:${crypto.randomUUID()}`)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * All uploaded photos, sorted by key. Lazily migrates a pre-gallery v1
 * single-slot upload (stored under the legacy key) into the `photo:`
 * keyspace on first read, so it isn't silently dropped by the v2 rework.
 */
export async function listUploads(): Promise<{ key: string; blob: Blob }[]> {
  const db = await openDb()
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const [keys, values] = await Promise.all([
    requestToPromise(store.getAllKeys()),
    requestToPromise(store.getAll()),
  ])
  const entries = keys.map((key, i) => ({ key: String(key), blob: values[i] as Blob }))
  const uploads = entries.filter((e) => e.key.startsWith('photo:'))

  const legacy = entries.find((e) => e.key === LEGACY_KEY)
  if (legacy) {
    const migratedKey = `photo:${crypto.randomUUID()}`
    await withStore('readwrite', (s) => s.put(legacy.blob, migratedKey))
    await withStore('readwrite', (s) => s.delete(LEGACY_KEY))
    uploads.push({ key: migratedKey, blob: legacy.blob })
  }

  return uploads.sort((a, b) => a.key.localeCompare(b.key))
}

export async function removeUpload(key: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(key))
}
