type BrowserNativeBoundary = {
  readingList: Pick<
    typeof chrome.readingList,
    'query' | 'updateEntry' | 'removeEntry' | 'onEntryAdded' | 'onEntryUpdated' | 'onEntryRemoved'
  >
  sessions: Pick<typeof chrome.sessions, 'getRecentlyClosed' | 'restore' | 'onChanged'>
  downloads: Pick<
    typeof chrome.downloads,
    'search' | 'pause' | 'resume' | 'cancel' | 'show' | 'onCreated' | 'onChanged' | 'onErased'
  >
  tabGroups: Pick<
    typeof chrome.tabGroups,
    'query' | 'update' | 'onCreated' | 'onUpdated' | 'onMoved' | 'onRemoved'
  >
  windows: Pick<typeof chrome.windows, 'update'>
}

let initializedBoundary: BrowserNativeBoundary | null = null

function chromeBoundary(): BrowserNativeBoundary {
  return {
    readingList: chrome.readingList,
    sessions: chrome.sessions,
    downloads: chrome.downloads,
    tabGroups: chrome.tabGroups,
    windows: chrome.windows,
  }
}

/**
 * Resolves the page-lifetime browser API boundary once. Preview evidence may
 * install a deterministic adapter before React starts; production always
 * constant-folds to the real Chrome namespaces.
 */
export function browserNativeBoundary(): BrowserNativeBoundary {
  if (initializedBoundary) return initializedBoundary
  if (import.meta.env.MODE === 'preview') {
    const preview = (globalThis as typeof globalThis & {
      __auroraBrowserNativeHarnessApi?: BrowserNativeBoundary
    }).__auroraBrowserNativeHarnessApi
    if (preview) {
      initializedBoundary = preview
      return preview
    }
  }
  initializedBoundary = chromeBoundary()
  return initializedBoundary
}

export function __resetBrowserNativeBoundaryForTests(): void {
  initializedBoundary = null
}

export type { BrowserNativeBoundary }
