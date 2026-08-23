import { useState } from 'react'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { useBrowserResource, type BrowserResourceState } from '../../../lib/hooks/useBrowserResource'
import {
  loadRecentlyClosed,
  restoreRecentlyClosed,
  subscribeRecentlyClosed,
  type RecentlyClosedItem,
} from '../../../services/browserNative/recentlyClosed'
import { BrowserDockDetail, BrowserWidgetShell, browserDockSummary } from '../browser/BrowserWidgetShell'

function dataOf(state: BrowserResourceState<RecentlyClosedItem[]>): RecentlyClosedItem[] | null {
  return state.status === 'ready' || state.status === 'error' ? state.data : null
}

function closedAge(timestamp: number): string {
  const seconds = Math.floor(Math.max(0, Date.now() - timestamp) / 1_000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

function sessionState(item: RecentlyClosedItem): string {
  return item.type === 'tab'
    ? 'Tab'
    : `Window, ${item.tabCount} ${item.tabCount === 1 ? 'tab' : 'tabs'}`
}

export default function RecentlyClosedWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const resource = useBrowserResource({
    identity: 'recentlyClosed',
    permission: 'sessions',
    load: loadRecentlyClosed,
    subscribe: subscribeRecentlyClosed,
  })
  const data = dataOf(resource.state) ?? []

  if (docked) {
    const latest = data[0]
    const latestFact = latest?.type === 'window'
      ? `Window · ${latest.tabCount} ${latest.tabCount === 1 ? 'tab' : 'tabs'} · ${closedAge(latest.closedAt)}`
      : latest ? `Tab ${closedAge(latest.closedAt)}` : 'Recent sessions'
    const readySummary = data.length === 0
      ? 'Nothing recently closed'
      : `${data.length} closed · ${latestFact}`
    const summary = browserDockSummary('Recently Closed', resource.state, readySummary)
    return (
      <BrowserDockDetail
        label="Recently Closed"
        summary={summary}
        state={resource.state}
        empty={data.length === 0}
        emptyLabel="Nothing recently closed."
        onRefresh={() => void resource.refresh()}
      >
        <RecentlyClosedDetail items={data} onRefresh={resource.refresh} mode="detail" />
      </BrowserDockDetail>
    )
  }

  if (canvasSize === 'compact' && dataOf(resource.state) !== null) {
    const latest = data[0]
    return (
      <BrowserWidgetShell
        title="Recently Closed"
        canvasSize={canvasSize}
        state={resource.state}
        empty={data.length === 0}
        emptyLabel="Nothing recently closed."
        onRefresh={() => void resource.refresh()}
      >
        {latest ? (
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="h-px w-5 shrink-0 bg-fg-muted/50" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{latest.title}</span>
            <span className="shrink-0 text-xs text-fg-muted">
              {latest.type === 'tab' ? 'Tab' : 'Window'} · {closedAge(latest.closedAt)}
            </span>
          </div>
        ) : null}
      </BrowserWidgetShell>
    )
  }

  return (
    <BrowserWidgetShell
      title="Recently Closed"
      canvasSize={canvasSize}
      state={resource.state}
      empty={data.length === 0}
      emptyLabel="Nothing recently closed."
      onRefresh={() => void resource.refresh()}
    >
      <RecentlyClosedDetail
        items={data}
        onRefresh={resource.refresh}
        mode={canvasSize === 'full' ? 'full' : 'standard'}
      />
    </BrowserWidgetShell>
  )
}

function RecentlyClosedDetail({
  items,
  onRefresh,
  mode,
}: {
  items: readonly RecentlyClosedItem[]
  onRefresh: () => Promise<void>
  mode: 'standard' | 'full' | 'detail'
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)

  async function restore(item: RecentlyClosedItem) {
    setBusyId(item.sessionId)
    setAnnouncement(null)
    try {
      await restoreRecentlyClosed(item.sessionId)
      await onRefresh()
      setAnnouncement(`Restored ${item.title}`)
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : 'Recently Closed restore failed')
    } finally {
      setBusyId(null)
    }
  }

  const visible = mode === 'detail'
    ? items
    : mode === 'full'
      ? [
        ...items.filter((item) => item.type === 'tab').slice(0, 2),
        ...items.filter((item) => item.type === 'window').slice(0, 2),
      ]
      : items.slice(0, 2)
  const groups = mode === 'standard'
    ? [{ title: undefined, rows: visible }]
    : [
      { title: 'Tabs', rows: visible.filter((item) => item.type === 'tab') },
      { title: 'Windows', rows: visible.filter((item) => item.type === 'window') },
    ]
  const hiddenCount = Math.max(0, items.length - visible.length)
  const dense = mode !== 'detail'

  return (
    <div className={mode === 'full' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
      {groups.map((group) => group.rows.length > 0 ? (
        <section key={group.title ?? 'recent'} className="space-y-1">
          {group.title ? <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{group.title}</h3> : null}
          <div className="divide-y divide-hairline">
            {group.rows.map((item, index) => {
              const context = `${item.title}, ${sessionState(item)}, ${closedAge(item.closedAt)}, item ${index + 1} of ${group.rows.length}`
              return (
              <article key={item.sessionId} aria-label={context} className={`flex items-center gap-3 ${dense ? 'min-h-10 py-1' : 'min-h-12 py-2'}`}>
                <span aria-hidden className="h-px w-5 shrink-0 bg-fg-muted/50" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block text-xs text-fg-muted">
                    {item.type === 'tab'
                      ? 'Tab'
                      : `Window · ${item.tabCount} ${item.tabCount === 1 ? 'tab' : 'tabs'}`} · {closedAge(item.closedAt)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busyId !== null}
                  aria-label={`Restore ${context}`}
                  onClick={() => void restore(item)}
                  className="inline-flex min-h-9 shrink-0 cursor-pointer items-center rounded-md px-2 text-sm font-medium text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50"
                >
                  Restore
                </button>
              </article>
              )
            })}
          </div>
        </section>
      ) : null)}
      {mode !== 'detail' && hiddenCount > 0 ? (
        <p className={mode === 'full' ? 'col-span-2 text-[11px] text-fg-muted' : 'text-[11px] text-fg-muted'}>{hiddenCount} more in Chrome Recently Closed</p>
      ) : null}
      {announcement ? <p role="status" className={mode === 'full' ? 'col-span-2 text-xs text-fg-muted' : 'text-xs text-fg-muted'}>{announcement}</p> : null}
    </div>
  )
}
