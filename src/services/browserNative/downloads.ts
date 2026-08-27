import { browserNativeBoundary } from './boundary'

export const DOWNLOAD_ACTIONS = ['pause', 'resume', 'cancel', 'show'] as const

export interface BrowserDownloadItem {
  id: number
  filename: string
  state: chrome.downloads.State | `${chrome.downloads.State}`
  paused: boolean
  canResume: boolean
  dangerous: boolean
  danger: chrome.downloads.DangerType | `${chrome.downloads.DangerType}`
  bytesReceived: number
  totalBytes: number | null
  progressPercent: number | null
  startedAt: number
  exists: boolean
  error: string | null
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1)?.trim() ?? ''
}

function filenameOf(item: chrome.downloads.DownloadItem): string {
  const localName = basename(item.filename)
  if (localName) return localName
  for (const candidate of [item.finalUrl, item.url]) {
    try {
      const parsed = new URL(candidate)
      const pathName = basename(decodeURIComponent(parsed.pathname))
      if (pathName) return pathName
      if (parsed.hostname) return parsed.hostname
    } catch {
      // Try the next browser-provided candidate.
    }
  }
  return `Download ${item.id}`
}

function timeOf(value: string): number {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

export function normalizeDownloads(items: readonly chrome.downloads.DownloadItem[]): BrowserDownloadItem[] {
  return items
    .map((item) => {
      const totalBytes = item.totalBytes > 0 ? item.totalBytes : null
      const progressPercent = totalBytes === null
        ? null
        : Math.round(Math.min(1, Math.max(0, item.bytesReceived / totalBytes)) * 100)
      return {
        id: item.id,
        filename: filenameOf(item),
        state: item.state,
        paused: item.paused,
        canResume: item.canResume,
        dangerous: item.danger !== 'safe' && item.danger !== 'accepted' && item.danger !== 'allowlistedByPolicy' && item.danger !== 'deepScannedSafe',
        danger: item.danger,
        bytesReceived: Math.max(0, item.bytesReceived),
        totalBytes,
        progressPercent,
        startedAt: timeOf(item.startTime),
        exists: item.exists,
        error: item.error ?? null,
      }
    })
    .sort((a, b) => b.startedAt - a.startedAt || b.id - a.id)
    .slice(0, 25)
}

export async function loadDownloads(): Promise<BrowserDownloadItem[]> {
  return normalizeDownloads(
    await browserNativeBoundary().downloads.search({ limit: 25, orderBy: ['-startTime'] }),
  )
}

export async function pauseDownload(id: number): Promise<void> {
  await browserNativeBoundary().downloads.pause(id)
}

export async function resumeDownload(id: number): Promise<void> {
  await browserNativeBoundary().downloads.resume(id)
}

export async function cancelDownload(id: number): Promise<void> {
  await browserNativeBoundary().downloads.cancel(id)
}

export function showDownload(id: number): void {
  browserNativeBoundary().downloads.show(id)
}

export function subscribeDownloads(listener: () => void): () => void {
  const { onCreated, onChanged, onErased } = browserNativeBoundary().downloads
  onCreated.addListener(listener)
  onChanged.addListener(listener)
  onErased.addListener(listener)
  return () => {
    onCreated.removeListener(listener)
    onChanged.removeListener(listener)
    onErased.removeListener(listener)
  }
}
