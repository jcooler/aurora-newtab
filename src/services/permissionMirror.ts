import { canonicalOriginPatterns } from './permissions'

export type PermissionMirrorSnapshot =
  | { status: 'ready'; preExisting: string[]; absent: string[] }
  | { status: 'unavailable'; preExisting: []; absent: [] }

type MirrorState = 'uninitialized' | 'initializing' | 'ready' | 'unavailable'

let state: MirrorState = 'uninitialized'
let initialization: Promise<void> | null = null
const held = new Set<string>()
const initializingEvents = new Map<string, boolean>()

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
  for (const pattern of patternsOf(change)) {
    if (state === 'initializing') initializingEvents.set(pattern, present)
    if (state !== 'ready') continue
    if (present) held.add(pattern)
    else held.delete(pattern)
  }
}

export const permissionMirror = {
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
  const permissions = chrome.permissions
  permissions.onAdded.addListener((change) => applyChange(change, true))
  permissions.onRemoved.addListener((change) => applyChange(change, false))

  initialization = (async () => {
    try {
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
    }
  })()
  return initialization
}
