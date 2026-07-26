import type { Changes, StorageDriver } from './driver'

export function chromeDriver(): StorageDriver {
  return {
    read: (keys) => chrome.storage.local.get(keys),
    write: (patch) => chrome.storage.local.set(patch),
    onChanged(cb) {
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area !== 'local') return
        const flat: Changes = {}
        for (const [key, change] of Object.entries(changes)) flat[key] = change.newValue
        cb(flat)
      }
      chrome.storage.onChanged.addListener(listener)
      return () => chrome.storage.onChanged.removeListener(listener)
    },
  }
}
