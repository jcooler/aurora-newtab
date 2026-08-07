// src/lib/idb.ts — multi-photo store for user-uploaded backgrounds.
//
// RECORD SHAPE. Each `photo:<uuid>` key holds a `StoredUpload`:
// `{ blob, thumb }`, where `thumb` is the tiny WebP placeholder
// Background.tsx paints under the full photo (src/lib/thumbs.ts explains
// why). Galleries filled before placeholders existed hold the File itself
// as the value instead, with no wrapper — `toUpload` reads both shapes, so
// no store version bump and no destructive migration was needed, and
// `backfillThumbs` heals the old ones in the background on first read.
import { makeThumb } from './thumbs'

const DB_NAME = 'aurora'
const STORE = 'photos'
const LEGACY_KEY = 'user-photo' // v1's single-slot key; migrated lazily by listUploads()

/** One gallery photo as the UI consumes it. */
export type Upload = { key: string; blob: Blob; thumb?: Blob }
/** One gallery photo as it sits in the object store. */
export type StoredUpload = { blob: Blob; thumb?: Blob }

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

/** Normalises either stored shape — bare Blob (pre-placeholder) or record. */
export function toUpload(key: string, value: unknown): Upload {
  if (value instanceof Blob) return { key, blob: value, thumb: undefined }
  const record = value as StoredUpload
  return { key, blob: record.blob, thumb: record.thumb }
}

/** Builds the record for a newly added file, placeholder included. */
export async function toStoredUpload(file: File): Promise<StoredUpload> {
  // `?? undefined` rather than the raw null: the stored shape uses an absent
  // thumb, and `toUpload` round-trips that — a stored `null` would read back
  // as a truthy-checked-elsewhere value that isn't a Blob.
  return { blob: file, thumb: (await makeThumb(file)) ?? undefined }
}

/**
 * The record to write when healing `key`, given whatever the store holds for
 * it RIGHT NOW, or null to write nothing.
 *
 * The backfill works off a snapshot, and a snapshot goes stale: a legacy
 * gallery keeps it running for seconds, another tab can be deleting the
 * whole time, and `backfillStarted` is per-page so it doesn't serialise
 * anything across tabs. Blind-writing the snapshot's record would therefore
 * RESURRECT a photo the user just deleted. Two rules keep that impossible:
 * a key that has since vanished is left vanished, and the blob written is
 * the one currently in the store, never the snapshot's copy.
 */
export function healedRecord(existing: unknown, thumb: Blob): StoredUpload | null {
  if (existing === undefined || existing === null) return null // deleted meanwhile
  const current = toUpload('', existing)
  if (current.thumb) return null // already healed (another tab), or replaced
  if (!(current.blob instanceof Blob)) return null // unrecognisable — leave it alone
  return { blob: current.blob, thumb }
}

/**
 * Generates the missing placeholder for every thumbless upload and hands it
 * to `heal`, which is responsible for the store-side existence re-check (see
 * healedRecord). Only the thumbnail crosses that boundary — the snapshot's
 * blob deliberately does not. Best-effort by construction: a photo whose
 * thumbnail can't be produced or stored is left exactly as it was and the
 * rest still get healed, because this runs unattended, off the render path,
 * and must never be able to take the gallery down with it.
 */
export async function backfillThumbs(
  uploads: Upload[],
  heal: (key: string, thumb: Blob) => Promise<void>,
): Promise<void> {
  for (const upload of uploads) {
    if (upload.thumb) continue
    try {
      const thumb = await makeThumb(upload.blob)
      if (!thumb) continue
      await heal(upload.key, thumb)
    } catch {
      // keep going — see the doc comment
    }
  }
}

/**
 * Re-reads `key` and writes the healed record in ONE readwrite transaction.
 * The `put` is issued from inside the `get`'s success handler, which keeps
 * both in the same transaction — nothing can delete the key in the gap,
 * because there is no gap.
 */
async function healInStore(key: string, thumb: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.get(key)
    req.onsuccess = () => {
      const record = healedRecord(req.result, thumb)
      if (record) store.put(record, key)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

let backfillStarted = false
function startBackfillOnce(uploads: Upload[]): void {
  if (backfillStarted) return
  if (uploads.every((u) => u.thumb)) return
  backfillStarted = true
  // Fire-and-forget: the caller already has its list, and the healed thumbs
  // are picked up by the next read (a new tab). Blocking the first paint of
  // the gallery on re-encoding every old photo would be a far worse trade
  // than one more tab-open before the placeholders appear.
  void backfillThumbs(uploads, healInStore)
}

/**
 * Records for a whole multi-file pick, decoded ONE AT A TIME. Doing these
 * concurrently is the obvious shape and the wrong one: a pick of eight phone
 * photos would hold eight full-resolution bitmaps decoded simultaneously
 * (~750MB at 24MP), which is a renderer OOM during upload and defeats the
 * prompt bitmap release makeThumb goes out of its way to do. The photos are
 * already on disk; taking a beat longer to add them is free.
 */
export async function toStoredUploads(files: File[]): Promise<StoredUpload[]> {
  const records: StoredUpload[] = []
  for (const file of files) records.push(await toStoredUpload(file))
  return records
}

/** Store each file under its own `photo:<uuid>` key, in a single transaction. */
export async function addUploads(files: File[]): Promise<void> {
  if (files.length === 0) return
  // Thumbnails are generated BEFORE the transaction opens, deliberately: an
  // IndexedDB transaction commits as soon as control returns to the event
  // loop with no pending requests, so awaiting anything inside one is a
  // guaranteed TransactionInactiveError.
  const records = await toStoredUploads(files)
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const record of records) store.put(record, `photo:${crypto.randomUUID()}`)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * All uploaded photos, sorted by key. Lazily migrates a pre-gallery v1
 * single-slot upload (stored under the legacy key) into the `photo:`
 * keyspace on first read, so it isn't silently dropped by the v2 rework.
 */
export async function listUploads(): Promise<Upload[]> {
  const db = await openDb()
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const [keys, values] = await Promise.all([
    requestToPromise(store.getAllKeys()),
    requestToPromise(store.getAll()),
  ])
  const entries = keys.map((key, i) => toUpload(String(key), values[i]))
  const uploads = entries.filter((e) => e.key.startsWith('photo:'))

  const legacy = entries.find((e) => e.key === LEGACY_KEY)
  if (legacy) {
    const migratedKey = `photo:${crypto.randomUUID()}`
    const record: StoredUpload = { blob: legacy.blob, thumb: legacy.thumb }
    await withStore('readwrite', (s) => s.put(record, migratedKey))
    await withStore('readwrite', (s) => s.delete(LEGACY_KEY))
    uploads.push({ key: migratedKey, ...record })
  }

  const sorted = uploads.sort((a, b) => a.key.localeCompare(b.key))
  startBackfillOnce(sorted)
  return sorted
}

export async function removeUpload(key: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(key))
}
