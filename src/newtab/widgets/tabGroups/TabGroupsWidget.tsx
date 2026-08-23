import { useState } from 'react'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { useBrowserResource, type BrowserResourceState } from '../../../lib/hooks/useBrowserResource'
import {
  focusTabGroupWindow,
  loadTabGroups,
  setTabGroupCollapsed,
  subscribeTabGroups,
  type BrowserTabGroup,
} from '../../../services/browserNative/tabGroups'
import { BrowserDockDetail, BrowserWidgetShell, browserDockSummary } from '../browser/BrowserWidgetShell'

const COLOR_CLASS: Record<BrowserTabGroup['color'], string> = {
  blue: 'bg-blue-400',
  cyan: 'bg-cyan-400',
  green: 'bg-green-400',
  grey: 'bg-stone-400',
  orange: 'bg-orange-400',
  pink: 'bg-pink-400',
  purple: 'bg-purple-400',
  red: 'bg-red-400',
  yellow: 'bg-yellow-400',
}

function dataOf(state: BrowserResourceState<BrowserTabGroup[]>): BrowserTabGroup[] | null {
  return state.status === 'ready' || state.status === 'error' ? state.data : null
}

export default function TabGroupsWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const resource = useBrowserResource({
    identity: 'tabGroups',
    permission: 'tabGroups',
    load: loadTabGroups,
    subscribe: subscribeTabGroups,
  })
  const data = dataOf(resource.state) ?? []

  if (docked) {
    const readySummary = data.length === 0
      ? 'No tab groups open'
      : `${data.length} ${data.length === 1 ? 'group' : 'groups'} · ${data[0]?.title ?? 'Browser workspace'}`
    const summary = browserDockSummary('Tab Groups', resource.state, readySummary)
    return (
      <BrowserDockDetail
        label="Tab Groups"
        summary={summary}
        state={resource.state}
        empty={data.length === 0}
        emptyLabel="No tab groups open."
        onRefresh={() => void resource.refresh()}
      >
        <TabGroupDetail groups={data} onRefresh={resource.refresh} mode="detail" />
      </BrowserDockDetail>
    )
  }

  if (canvasSize === 'compact' && dataOf(resource.state) !== null) {
    const first = data[0]
    return (
      <BrowserWidgetShell
        title="Tab Groups"
        canvasSize={canvasSize}
        state={resource.state}
        empty={data.length === 0}
        emptyLabel="No tab groups open."
        onRefresh={() => void resource.refresh()}
      >
        {first ? (
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={`h-7 w-1 shrink-0 rounded-full ${COLOR_CLASS[first.color]}`} />
            <span className="shrink-0 text-sm font-medium tabular-nums">{data.length} {data.length === 1 ? 'group' : 'groups'}</span>
            <span aria-hidden className="text-fg-muted">·</span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{first.title}</span>
          </div>
        ) : null}
      </BrowserWidgetShell>
    )
  }

  return (
    <BrowserWidgetShell
      title="Tab Groups"
      canvasSize={canvasSize}
      state={resource.state}
      empty={data.length === 0}
      emptyLabel="No tab groups open."
      onRefresh={() => void resource.refresh()}
    >
      <TabGroupDetail
        groups={data}
        onRefresh={resource.refresh}
        mode={canvasSize === 'full' ? 'full' : 'standard'}
      />
    </BrowserWidgetShell>
  )
}

function TabGroupDetail({
  groups,
  onRefresh,
  mode,
}: {
  groups: readonly BrowserTabGroup[]
  onRefresh: () => Promise<void>
  mode: 'standard' | 'full' | 'detail'
}) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const fullWindowOrdinals = [...new Set(groups.map((group) => group.windowOrdinal))].slice(0, 2)
  const visible = mode === 'detail'
    ? groups
    : mode === 'full'
      ? fullWindowOrdinals.flatMap((windowOrdinal) => (
        groups.filter((group) => group.windowOrdinal === windowOrdinal).slice(0, 2)
      ))
      : groups.slice(0, 2)
  const sections = mode !== 'standard'
    ? [...new Set(visible.map((group) => group.windowOrdinal))].map((windowOrdinal) => ({
      title: `Window ${windowOrdinal}`,
      groups: visible.filter((group) => group.windowOrdinal === windowOrdinal),
    }))
    : [{ title: undefined, groups: visible }]
  const hiddenCount = Math.max(0, groups.length - visible.length)
  const dense = mode !== 'detail'

  async function perform(group: BrowserTabGroup, action: () => Promise<void>, success: string) {
    setBusyId(group.id)
    setAnnouncement(null)
    try {
      await action()
      await onRefresh()
      setAnnouncement(success)
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : 'Tab Groups action failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <section key={section.title ?? 'groups'} className="space-y-1">
          {section.title ? <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{section.title}</h3> : null}
          <div className="divide-y divide-hairline">
            {section.groups.map((group, index) => {
              const detail = `Window ${group.windowOrdinal}, ${group.collapsed ? 'collapsed' : 'open'}, item ${index + 1} of ${section.groups.length}`
              const context = `${group.title}, ${detail}`
              return (
              <article key={group.id} aria-label={context} className={`flex items-center gap-3 ${dense ? 'min-h-10 py-1' : 'min-h-14 py-2'}`}>
                <span
                  aria-hidden
                  data-testid={`tab-group-color-${group.id}`}
                  data-tab-group-color={group.color}
                  className={`${dense ? 'h-7' : 'h-9'} w-1 shrink-0 rounded-full ${COLOR_CLASS[group.color]}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{group.title}</span>
                  <span className="block text-xs text-fg-muted">
                    Window {group.windowOrdinal} · {group.collapsed ? 'Collapsed' : 'Open'}{group.shared ? ' · Shared' : ''}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1 text-sm">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    aria-label={`Focus ${group.title} window, ${detail}`}
                    onClick={() => void perform(group, () => focusTabGroupWindow(group.windowId), `Focused ${group.title}`)}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50"
                  >Focus</button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${context}`}
                    onClick={() => void perform(
                      group,
                      () => setTabGroupCollapsed(group.id, !group.collapsed),
                      `${group.collapsed ? 'Expanded' : 'Collapsed'} ${group.title}`,
                    )}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50"
                  >{group.collapsed ? 'Expand' : 'Collapse'}</button>
                </span>
              </article>
              )
            })}
          </div>
        </section>
      ))}
      {mode !== 'detail' && hiddenCount > 0 ? (
        <p className="text-[11px] text-fg-muted">{hiddenCount} more Chrome tab groups</p>
      ) : null}
      {announcement ? <p role="status" className="text-xs text-fg-muted">{announcement}</p> : null}
    </div>
  )
}
