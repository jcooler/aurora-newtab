import { useNow } from '../../../lib/hooks/useNow'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { Settings, WorldClock } from '../../../lib/storage/schema'
import { zoneContext, zoneTime } from '../../../lib/worldTime'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { WidgetPresentationMode } from '../../widgetRenderers'
import TierFrame from '../shared/TierFrame'

export default function WorldClocks({
  canvasSize = 'standard',
  presentation = 'free',
  docked = false,
}: {
  canvasSize?: CanvasSize
  presentation?: WidgetPresentationMode
  docked?: boolean
} = {}) {
  // Gate BEFORE the ticking clock exists: disabled tabs (the default —
  // settings.widgets.clocks starts false), or an enabled-but-empty clocks
  // widget (toggled on but no zones added yet), never mount useNow's
  // interval. Both useStoredKey calls happen unconditionally here — every
  // render, regardless of the toggle/empty state — so Rules of Hooks stay
  // satisfied.
  const [settings] = useStoredKey('settings')
  const [worldClocks] = useStoredKey('worldClocks')
  if (!settings?.widgets.clocks || !worldClocks || worldClocks.length === 0) return null
  return <WorldClocksInner settings={settings} worldClocks={worldClocks} canvasSize={canvasSize} presentation={presentation} docked={docked} />
}

function WorldClocksInner({
  settings,
  worldClocks,
  canvasSize,
  presentation,
  docked,
}: {
  settings: Settings
  worldClocks: WorldClock[]
  canvasSize: CanvasSize
  presentation: WidgetPresentationMode
  docked: boolean
}) {
  const now = useNow(30_000)
  if (docked) {
    const clock = worldClocks[0]
    return (
      <div data-dock-line="" className="dock-line">
        <span>{clock.label}</span>
        <strong className="tabular-nums">{zoneTime(clock.zone, settings.use24Hour, now)}</strong>
      </div>
    )
  }
  if (presentation === 'stack') {
    const limit = canvasSize === 'compact' ? 1 : canvasSize === 'standard' ? 3 : 5
    return (
      <TierFrame label="World clocks" tier={canvasSize} state="ready" className={`core-world-clocks-stack core-world-clocks-stack--${canvasSize}`}>
        <h2 className="text-[13px] font-semibold">World clocks</h2>
        <div className="core-world-clocks-stack__rows">
          {worldClocks.slice(0, limit).map((clock) => (
            <div key={`${clock.zone}:${clock.label}`} data-testid="world-clock-row" className="core-world-clock-row">
              <span><strong title={clock.label}>{clock.label}</strong><small title={clock.zone}>{zoneContext(clock.zone, now)}</small></span>
              <b className="tabular-nums" aria-label={`${clock.label}, ${clock.zone}, ${zoneTime(clock.zone, settings.use24Hour, now)}`}>{zoneTime(clock.zone, settings.use24Hour, now)}</b>
            </div>
          ))}
        </div>
      </TierFrame>
    )
  }
  return (
    <p className="text-photo mt-1 mid:mt-0.5 short:mt-0.5 xshort:mt-0.5 text-base mid:text-sm short:text-sm xshort:text-xs font-medium text-canvas-fg-muted">
      {worldClocks
        .map((c) => `${c.label} ${zoneTime(c.zone, settings.use24Hour, now)}`)
        .join(' · ')}
    </p>
  )
}
