import { useState } from 'react'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { useBrowserResource, type BrowserResourceState } from '../../../lib/hooks/useBrowserResource'
import {
  loadReadingList,
  removeReadingListEntry,
  setReadingListReadState,
  subscribeReadingList,
  type ReadingListItem,
} from '../../../services/browserNative/readingList'
import { BrowserDockDetail, BrowserWidgetShell } from '../browser/BrowserWidgetShell'

function ageOf(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : 'a while ago'
}

function dataOf(state: BrowserResourceState<ReadingListItem[]>): ReadingListItem[] | null {
  return state.status === 'ready' || state.status === 'error' ? state.data : null
}

export default function ReadingListWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const resource = useBrowserResource({
    identity: 'readingList',
    permission: 'readingList',
    load: loadReadingList,
    subscribe: subscribeReadingList,
  })
  const data = dataOf(resource.state) ?? []
  const unread = data.filter((item) => !item.hasBeenRead)

  if (docked && dataOf(resource.state) !== null) {
    const newest = unread[0]
    const summary = unread.length === 0
      ? 'Reading list clear'
      : `${unread.length} unread · ${newest?.title ?? 'Saved pages'}`
    return (
      <BrowserDockDetail label="Reading List" summary={summary}>
        <ReadingListDetail items={data} onRefresh={resource.refresh} full />
      </BrowserDockDetail>
    )
  }

  if (canvasSize === 'compact' && dataOf(resource.state) !== null) {
    return (
      <BrowserWidgetShell
        title="Reading List"
        canvasSize={canvasSize}
        state={resource.state}
        empty={unread.length === 0}
        emptyLabel="Reading list clear"
        onRefresh={() => void resource.refresh()}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
          <span className="text-sm font-medium tabular-nums">{unread.length} unread</span>
          {unread[0] ? <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{unread[0].title}</span> : null}
        </div>
      </BrowserWidgetShell>
    )
  }

  return (
    <BrowserWidgetShell
      title="Reading List"
      canvasSize={canvasSize}
      state={resource.state}
      empty={data.length === 0}
      emptyLabel="Reading list clear"
      onRefresh={() => void resource.refresh()}
    >
      <ReadingListDetail items={data} onRefresh={resource.refresh} full={canvasSize === 'full'} />
    </BrowserWidgetShell>
  )
}

function ReadingListDetail({
  items,
  onRefresh,
  full,
}: {
  items: readonly ReadingListItem[]
  onRefresh: () => Promise<void>
  full: boolean
}) {
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [busyUrl, setBusyUrl] = useState<string | null>(null)
  const unread = items.filter((item) => !item.hasBeenRead).slice(0, full ? 8 : 3)
  const read = full ? items.filter((item) => item.hasBeenRead).slice(0, 4) : []

  async function perform(item: ReadingListItem, action: () => Promise<void>, success: string) {
    setBusyUrl(item.url)
    setAnnouncement(null)
    try {
      await action()
      await onRefresh()
      setAnnouncement(success)
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : 'Reading List action failed')
    } finally {
      setBusyUrl(null)
      setConfirmUrl(null)
    }
  }

  return (
    <div className="space-y-3">
      <ReadingSection
        title={full ? 'Unread' : undefined}
        items={unread}
        confirmUrl={confirmUrl}
        busyUrl={busyUrl}
        setConfirmUrl={setConfirmUrl}
        perform={perform}
      />
      {full && read.length > 0 ? (
        <ReadingSection
          title="Recently read"
          items={read}
          confirmUrl={confirmUrl}
          busyUrl={busyUrl}
          setConfirmUrl={setConfirmUrl}
          perform={perform}
        />
      ) : null}
      {announcement ? <p role="status" className="text-xs text-fg-muted">{announcement}</p> : null}
    </div>
  )
}

function ReadingSection({
  title,
  items,
  confirmUrl,
  busyUrl,
  setConfirmUrl,
  perform,
}: {
  title?: string
  items: readonly ReadingListItem[]
  confirmUrl: string | null
  busyUrl: string | null
  setConfirmUrl: (url: string | null) => void
  perform: (item: ReadingListItem, action: () => Promise<void>, success: string) => Promise<void>
}) {
  if (items.length === 0) return null
  return (
    <section className="space-y-2">
      {title ? <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{title}</h3> : null}
      <div className="divide-y divide-hairline">
        {items.map((item) => {
          const busy = busyUrl === item.url
          return (
            <article key={item.url} aria-label={`${item.title}, ${item.hasBeenRead ? 'read' : 'unread'}`} className="relative py-2 pl-3 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent/70">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                <span className="shrink-0 text-[11px] text-fg-muted">{ageOf(item.updatedAt)}</span>
              </div>
              <p className="truncate text-xs text-fg-muted">{item.host}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${item.title}`}
                  className="inline-flex min-h-9 items-center rounded-md px-2 text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Open
                </a>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Mark ${item.title} ${item.hasBeenRead ? 'unread' : 'read'}`}
                  onClick={() => void perform(
                    item,
                    () => setReadingListReadState(item.url, !item.hasBeenRead),
                    `Marked ${item.title} ${item.hasBeenRead ? 'unread' : 'read'}`,
                  )}
                  className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50"
                >
                  Mark {item.hasBeenRead ? 'unread' : 'read'}
                </button>
                {confirmUrl === item.url ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Confirm remove ${item.title}`}
                      onClick={() => void perform(item, () => removeReadingListEntry(item.url), `Removed ${item.title}`)}
                      className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-red-300 hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Confirm remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmUrl(null)}
                      className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label={`Remove ${item.title}`}
                    onClick={() => setConfirmUrl(item.url)}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    Remove
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
