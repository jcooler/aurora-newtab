import { canonicalOriginPatterns, initializePermissionBoundary } from './permissions'

export type PermissionMirrorSnapshot =
  | { status: 'ready'; preExisting: string[]; absent: string[] }
  | { status: 'unavailable'; preExisting: []; absent: [] }

type MirrorState = 'uninitialized' | 'initializing' | 'ready' | 'unavailable'

let state: MirrorState = 'uninitialized'
let initialization: Promise<void> | null = null
const held = new Set<string>()
const initializingEvents = new Map<string, boolean>()
const subscribers = new Set<() => void>()
let revision = 0

function notify(): void {
  revision += 1
  for (const subscriber of subscribers) subscriber()
}

function patternsOf(change: chrome.permissions.Permissions): string[] {
  if (!Array.isArray(change.origins)) return []
  return change.origins.flatMap((origin) => {
    try {
      return [canonicalOriginPatterns([origin])[0]!]
    } catch {
      return []
    }
  })
}

function applyChange(change: chrome.permissions.Permissions, present: boolean): void {
  let changed = false
  for (const pattern of patternsOf(change)) {
    if (state === 'initializing') initializingEvents.set(pattern, present)
    if (state !== 'ready') continue
    if (present && !held.has(pattern)) { held.add(pattern); changed = true }
    else if (!present && held.delete(pattern)) changed = true
  }
  if (changed) notify()
}

export const permissionMirror = {
  subscribe(listener: () => void): () => void {
    subscribers.add(listener)
    return () => subscribers.delete(listener)
  },
  getRevision(): number {
    return revision
  },
  snapshot(patterns: readonly string[]): PermissionMirrorSnapshot {
    if (state !== 'ready') return { status: 'unavailable', preExisting: [], absent: [] }
    const canonical = canonicalOriginPatterns(patterns)
    const preExisting = canonical.filter((pattern) => held.has(pattern))
    const absent = canonical.filter((pattern) => !held.has(pattern))
    return { status: 'ready', preExisting, absent }
  },
}

/** Initializes the page-lifetime mirror once. Event listeners are attached
 *  before the seed read, and the last event seen per pattern during that read
 *  is replayed over the seed so an older getAll result cannot win the race. */
export function initializePermissionMirror(): Promise<void> {
  if (initialization) return initialization
  state = 'initializing'
  initialization = (async () => {
    try {
      const permissions = initializePermissionBoundary()
      permissions.onAdded.addListener((change) => applyChange(change, true))
      permissions.onRemoved.addListener((change) => applyChange(change, false))
      const seed = await permissions.getAll()
      held.clear()
      for (const pattern of patternsOf(seed)) held.add(pattern)
      for (const [pattern, present] of initializingEvents) {
        if (present) held.add(pattern)
        else held.delete(pattern)
      }
      state = 'ready'
    } catch {
      held.clear()
      state = 'unavailable'
    } finally {
      initializingEvents.clear()
      notify()
    }
  })()
  return initialization
}
