import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { useStorage } from '../../../lib/storage/context'
import {
  auroraActivity,
  fetchAuroraKp,
  isAuroraKpData,
  type AuroraKpData,
  type KpInterval,
} from '../../../services/connectors/auroraKp'
import type { AuroraKpConfig } from '../../../services/connectors/types'
import type { WorkPulseTone } from '../shared/WorkPulseSummary'
import {
  GlanceDockDetail,
  GlanceWidgetShell,
  glancePresentationState,
  glanceRowClass,
} from './GlanceWidgetShell'

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export default function AuroraKpWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const [connectors] = useStoredKey('connectors')
  const candidate = connectors?.auroraKp as AuroraKpConfig | undefined
  if (!candidate?.enabled) return null
  return <AuroraKpInner config={candidate} canvasSize={canvasSize} docked={docked} />
}

function AuroraKpInner({
  config,
  canvasSize,
  docked,
}: {
  config: AuroraKpConfig
  canvasSize: CanvasSize
  docked: boolean
}) {
  const storage = useStorage()
  const { data, state, lastError } = useConnectorSnapshot<AuroraKpData>(
    'auroraKp',
    config,
    () => fetchAuroraKp(new Date(Date.now())),
    undefined,
    undefined,
    isAuroraKpData,
  )
  const presentation = glancePresentationState(
    true,
    state,
    data !== null && data.current === null && data.forecast.length === 0,
  )
  const retry = () => {
    void storage.update('connectorSnapshots', (previous) => {
      const next = { ...previous }
      delete next.auroraKp
      return next
    })
  }
  const current = data?.current ?? null
  const peak = data?.peak ?? null
  const tone = auroraTone(current, peak)
  const facts = presentation === 'hard-error'
    ? ['Aurora & Kp unavailable']
    : presentation === 'loading'
      ? ['Loading Aurora & Kp']
      : [current ? `Kp ${kp(current.kp)}` : 'No current Kp', peak ? `peak ${kp(peak.kp)} at ${time(peak.time)}` : null]

  if (docked) {
    return (
      <GlanceDockDetail
        label="Aurora & Kp"
        facts={facts}
        tone={tone}
        presentation={presentation}
        emptyLabel="NOAA has no current Kp forecast."
        errorMessage={lastError ?? undefined}
        onRefresh={retry}
      >
        <AuroraContext data={data} />
      </GlanceDockDetail>
    )
  }

  const visible = data
    ? canvasSize === 'full'
      ? dailyForecastSignature(data.forecast)
      : canvasSize === 'standard'
        ? data.forecast.slice(0, 4)
        : []
    : []
  return (
    <GlanceWidgetShell
      title="Aurora & Kp"
      canvasSize={canvasSize}
      presentation={presentation}
      emptyLabel="NOAA has no current Kp forecast."
      errorMessage={lastError ?? undefined}
      onRefresh={retry}
    >
      {data ? (
        <>
          <KpSummary current={current} peak={peak} />
          {canvasSize === 'full'
            ? <ForecastGroups rows={visible} />
            : canvasSize === 'standard'
              ? <ForecastList rows={visible} />
              : null}
          {canvasSize !== 'compact' ? <NoaaDestination /> : null}
        </>
      ) : null}
    </GlanceWidgetShell>
  )
}

function KpSummary({ current, peak }: { current: KpInterval | null; peak: KpInterval | null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <p className="text-xl font-semibold tabular-nums text-fg">{current ? `Kp ${kp(current.kp)}` : 'No current Kp'}</p>
        {current ? <p className="text-xs text-fg-muted">{auroraActivity(current.kp)}</p> : null}
      </div>
      {peak ? (
        <div className="text-right text-xs text-fg-muted">
          <p>Peak {kp(peak.kp)} at {time(peak.time)}</p>
          {peak.scale ? <p className="font-medium text-accent">{peak.scale} storm scale</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function ForecastGroups({ rows }: { rows: readonly KpInterval[] }) {
  const groups = new Map<string, KpInterval[]>()
  for (const row of rows) {
    const day = DAY_FORMAT.format(new Date(row.time))
    const group = groups.get(day) ?? []
    group.push(row)
    groups.set(day, group)
  }
  return (
    <div className="mt-3 grid grid-cols-3 gap-3">
      {[...groups.entries()].map(([day, group]) => (
        <section key={day} role="region" aria-label={`${day} Kp forecast`}>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{day}</h3>
          <ForecastList rows={group} grouped />
        </section>
      ))}
    </div>
  )
}

function ForecastList({ rows, grouped = false }: { rows: readonly KpInterval[]; grouped?: boolean }) {
  if (rows.length === 0) return null
  return (
    <ul className={`${grouped ? '' : 'mt-3'} flex flex-col gap-1.5`}>
      {rows.map((row) => (
        <li key={`${row.time}-${row.kp}`} data-testid="kp-forecast-row" className="group flex items-center justify-between gap-4 text-sm">
          <span className={glanceRowClass}>{time(row.time)}</span>
          <span className="font-medium tabular-nums text-fg">Kp {kp(row.kp)}{row.scale ? ` · ${row.scale}` : ''}</span>
        </li>
      ))}
    </ul>
  )
}

function dailyForecastSignature(rows: readonly KpInterval[]): KpInterval[] {
  const dailyPeak = new Map<string, KpInterval>()
  for (const row of rows) {
    const day = DAY_FORMAT.format(new Date(row.time))
    const best = dailyPeak.get(day)
    if (!best || row.kp > best.kp) dailyPeak.set(day, row)
  }
  return [...dailyPeak.values()].slice(0, 3)
}

function NoaaDestination() {
  return (
    <a
      href="https://www.swpc.noaa.gov/products/planetary-k-index"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex min-h-9 items-center border-t border-hairline pt-2 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
    >
      Open NOAA Space Weather
    </a>
  )
}

function AuroraContext({ data }: { data: AuroraKpData | null }) {
  return (
    <div className="mt-4 space-y-2 border-t border-hairline pt-3 text-xs leading-relaxed text-fg-muted">
      {data?.peak?.scale ? <p>Forecast peak: {data.peak.scale} storm scale.</p> : null}
      <p>Darkness, clear sky, location, and light pollution determine whether aurora is visible. Kp is geomagnetic activity, not a visibility probability.</p>
      <a
        href="https://www.swpc.noaa.gov/products/planetary-k-index"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        NOAA Space Weather Prediction Center
      </a>
    </div>
  )
}

function auroraTone(current: KpInterval | null, peak: KpInterval | null): WorkPulseTone {
  const maximum = Math.max(current?.kp ?? 0, peak?.kp ?? 0)
  if (maximum >= 5) return 'critical'
  if (maximum >= 3) return 'attention'
  return 'quiet'
}

function kp(value: number): string {
  return value.toFixed(1)
}

function time(value: string): string {
  return TIME_FORMAT.format(new Date(value))
}
