import { useState } from 'react'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { useBrowserResource, type BrowserResourceState } from '../../../lib/hooks/useBrowserResource'
import {
  cancelDownload,
  loadDownloads,
  pauseDownload,
  resumeDownload,
  showDownload,
  subscribeDownloads,
  type BrowserDownloadItem,
} from '../../../services/browserNative/downloads'
import { BrowserDockDetail, BrowserWidgetShell, browserDockSummary } from '../browser/BrowserWidgetShell'

function dataOf(state: BrowserResourceState<BrowserDownloadItem[]>): BrowserDownloadItem[] | null {
  return state.status === 'ready' || state.status === 'error' ? state.data : null
}

function stateLabel(item: BrowserDownloadItem): string {
  if (item.dangerous) return 'Potentially unsafe'
  if (item.state === 'complete') return item.exists ? 'Complete' : 'File removed'
  if (item.state === 'interrupted') return `Interrupted${item.error ? ` · ${item.error}` : ''}`
  if (item.paused) return item.totalBytes === null ? 'Paused · size unknown' : 'Paused'
  if (item.totalBytes === null) return 'Size unknown'
  return `${item.progressPercent ?? 0}%`
}

export default function DownloadsWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const resource = useBrowserResource({
    identity: 'downloads',
    permission: 'downloads',
    load: loadDownloads,
    subscribe: subscribeDownloads,
  })
  const data = dataOf(resource.state) ?? []
  const active = data.filter((item) => item.state === 'in_progress')
  const lead = active[0] ?? data[0]

  if (docked) {
    const readySummary = data.length === 0
      ? 'No recent downloads'
      : `${active.length} active · ${lead?.filename ?? 'Recent downloads'}`
    const summary = browserDockSummary('Downloads', resource.state, readySummary)
    return (
      <BrowserDockDetail
        label="Downloads"
        summary={summary}
        state={resource.state}
        empty={data.length === 0}
        emptyLabel="No recent downloads."
        onRefresh={() => void resource.refresh()}
      >
        <DownloadDetail items={data} onRefresh={resource.refresh} mode="detail" />
      </BrowserDockDetail>
    )
  }

  if (canvasSize === 'compact' && dataOf(resource.state) !== null) {
    return (
      <BrowserWidgetShell
        title="Downloads"
        canvasSize={canvasSize}
        state={resource.state}
        empty={data.length === 0}
        emptyLabel="No recent downloads."
        onRefresh={() => void resource.refresh()}
      >
        {lead ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-sm font-medium tabular-nums">{active.length} active</span>
            <span aria-hidden className="text-fg-muted">·</span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{lead.filename}</span>
          </div>
        ) : null}
      </BrowserWidgetShell>
    )
  }

  return (
    <BrowserWidgetShell
      title="Downloads"
      canvasSize={canvasSize}
      state={resource.state}
      empty={data.length === 0}
      emptyLabel="No recent downloads."
      onRefresh={() => void resource.refresh()}
    >
      <DownloadDetail
        items={data}
        onRefresh={resource.refresh}
        mode={canvasSize === 'full' ? 'full' : 'standard'}
      />
    </BrowserWidgetShell>
  )
}

function DownloadDetail({
  items,
  onRefresh,
  mode,
}: {
  items: readonly BrowserDownloadItem[]
  onRefresh: () => Promise<void>
  mode: 'standard' | 'full' | 'detail'
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const rows = mode === 'detail'
    ? items.slice(0, 25)
    : items.slice(0, mode === 'full' ? 5 : 3)
  const hiddenCount = Math.max(0, items.length - rows.length)
  const dense = mode !== 'detail'

  async function perform(
    item: BrowserDownloadItem,
    action: () => Promise<void> | void,
    success: string,
  ) {
    setBusyId(item.id)
    setAnnouncement(null)
    try {
      await action()
      await onRefresh()
      setAnnouncement(success)
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : 'Download action failed')
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  return (
    <div className={mode === 'detail' ? 'space-y-2' : 'space-y-0'}>
      <div className="divide-y divide-hairline">
        {rows.map((item, index) => {
          const busy = busyId !== null
          const active = item.state === 'in_progress'
          const context = `${item.filename}, ${stateLabel(item)}, item ${index + 1} of ${rows.length}`
          return (
            <article key={item.id} aria-label={context} className={dense ? 'grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 py-1' : 'py-2'}>
              <div className={dense ? 'min-w-0' : 'flex min-w-0 items-center gap-2'}>
                <span className={dense ? 'block truncate text-sm font-medium' : 'min-w-0 flex-1 truncate text-sm font-medium'}>{item.filename}</span>
                <span className={`${item.dangerous ? 'text-amber-300' : 'text-fg-muted'} ${dense ? 'block truncate text-[11px]' : 'shrink-0 text-[11px]'}`}>
                  {stateLabel(item)}
                </span>
              </div>
              {active && item.progressPercent !== null ? (
                <div
                  role="progressbar"
                  aria-label={`${context} download progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progressPercent}
                  className={`${dense ? 'col-start-1 mt-1' : 'mt-2'} h-1 overflow-hidden rounded-full bg-fg/10`}
                >
                  <span className="block h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${item.progressPercent}%` }} />
                </div>
              ) : active ? (
                <div data-download-progress="indeterminate" className={`${dense ? 'col-start-1 mt-1' : 'mt-2'} h-1 overflow-hidden rounded-full bg-fg/10`}>
                  <span className="block h-full w-1/3 rounded-full bg-accent/70" />
                </div>
              ) : null}
              <div className={dense ? 'col-start-2 row-span-2 row-start-1 flex max-w-40 flex-wrap items-center justify-end gap-1 text-sm' : 'mt-1 flex flex-wrap items-center gap-1 text-sm'}>
                {active && !item.paused ? (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Pause ${context}`}
                    onClick={() => void perform(item, () => pauseDownload(item.id), `Paused ${item.filename}`)}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50"
                  >Pause</button>
                ) : null}
                {item.canResume && (item.paused || item.state === 'interrupted') ? (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Resume ${context}`}
                    onClick={() => void perform(item, () => resumeDownload(item.id), `Resumed ${item.filename}`)}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50"
                  >Resume</button>
                ) : null}
                {active ? confirmId === item.id ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Confirm cancel ${context}`}
                      onClick={() => void perform(item, () => cancelDownload(item.id), `Cancelled ${item.filename}`)}
                      className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm text-red-300 hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-accent"
                    >Confirm cancel</button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    >Keep</button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label={`Cancel ${context}`}
                    onClick={() => setConfirmId(item.id)}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  >Cancel</button>
                ) : null}
                {item.state === 'complete' && item.exists ? (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Show ${context} in folder`}
                    onClick={() => void perform(item, () => showDownload(item.id), `Showing ${item.filename} in folder`)}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50"
                  >Show in folder</button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
      {mode !== 'detail' && hiddenCount > 0 ? (
        <p className="text-[11px] text-fg-muted">{hiddenCount} more in Chrome Downloads</p>
      ) : null}
      {announcement ? <p role="status" className="text-xs text-fg-muted">{announcement}</p> : null}
    </div>
  )
}
