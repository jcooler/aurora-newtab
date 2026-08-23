import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { useLocalDay } from '../../../lib/hooks/useLocalDay'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import { useStorage } from '../../../lib/storage/context'
import {
  daysUntilHoliday,
  fetchPublicHolidays,
  isPublicHolidaysData,
  normalizeHolidayCountryCode,
  type PublicHoliday,
  type PublicHolidaysData,
} from '../../../services/connectors/publicHolidays'
import type { PublicHolidaysConfig } from '../../../services/connectors/types'
import {
  GlanceDockDetail,
  GlanceWidgetShell,
  glancePresentationState,
  glanceRowClass,
} from './GlanceWidgetShell'

export default function PublicHolidaysWidget({
  canvasSize = 'standard',
  docked = false,
}: {
  canvasSize?: CanvasSize
  docked?: boolean
} = {}) {
  const [connectors] = useStoredKey('connectors')
  const candidate = connectors?.publicHolidays as PublicHolidaysConfig | undefined
  if (!candidate?.enabled) return null
  const countryCode = normalizeHolidayCountryCode(candidate.countryCode)
  if (!countryCode) {
    if (docked) {
      return (
        <GlanceDockDetail
          label="Public Holidays"
          facts={['Choose a country']}
          presentation="setup"
          setupLabel="Choose a country in Settings."
          emptyLabel=""
        >
          {null}
        </GlanceDockDetail>
      )
    }
    return (
      <GlanceWidgetShell
        title="Public Holidays"
        canvasSize={canvasSize}
        presentation="setup"
        setupLabel="Choose a country in Settings."
        emptyLabel=""
      >
        {null}
      </GlanceWidgetShell>
    )
  }
  return <PublicHolidaysInner config={{ ...candidate, countryCode }} canvasSize={canvasSize} docked={docked} />
}

function PublicHolidaysInner({
  config,
  canvasSize,
  docked,
}: {
  config: PublicHolidaysConfig
  canvasSize: CanvasSize
  docked: boolean
}) {
  const storage = useStorage()
  const localDay = useLocalDay()
  const { data, state, lastError } = useConnectorSnapshot<PublicHolidaysData>(
    'publicHolidays',
    config,
    () => fetchPublicHolidays(config.countryCode, localDay.now),
    undefined,
    localDay.key,
    isPublicHolidaysData,
  )
  const upcoming = (data?.holidays ?? []).filter((holiday) => holiday.date >= localDay.key)
  const presentation = glancePresentationState(true, state, data !== null && upcoming.length === 0)
  const retry = () => {
    void storage.update('connectorSnapshots', (previous) => {
      const next = { ...previous }
      delete next.publicHolidays
      return next
    })
  }
  const first = upcoming[0]

  if (docked) {
    return (
      <GlanceDockDetail
        label="Public Holidays"
        facts={presentation === 'hard-error'
          ? ['Public Holidays unavailable']
          : presentation === 'loading'
            ? ['Loading Public Holidays']
            : first
              ? [first.name, shortDate(first.date)]
              : ['No upcoming holidays']}
        presentation={presentation}
        emptyLabel={`No upcoming national holidays returned for ${config.countryCode}.`}
        errorMessage={lastError ?? undefined}
        onRefresh={retry}
      >
        <HolidayList holidays={upcoming.slice(0, 3)} now={localDay.now} />
        <Context countryCode={config.countryCode} />
      </GlanceDockDetail>
    )
  }

  const visible = canvasSize === 'full'
    ? fullHolidaySignature(upcoming, data?.year ?? localDay.now.getFullYear())
    : canvasSize === 'standard'
      ? upcoming.slice(0, 3)
      : upcoming.slice(0, 1)
  const denseStandard = canvasSize === 'standard'
    && (presentation === 'stale' || presentation === 'retained-error')
  return (
    <GlanceWidgetShell
      title="Public Holidays"
      canvasSize={canvasSize}
      presentation={presentation}
      emptyLabel={`No upcoming national holidays returned for ${config.countryCode}.`}
      errorMessage={lastError ?? undefined}
      onRefresh={retry}
    >
      {canvasSize === 'full'
        ? <HolidayGroups holidays={visible} now={localDay.now} />
        : <HolidayList holidays={visible} now={localDay.now} dense={denseStandard} />}
      {data ? <Context countryCode={config.countryCode} dense={denseStandard} /> : null}
    </GlanceWidgetShell>
  )
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(parseLocalDate(value))
}

function fullHolidaySignature(holidays: readonly PublicHoliday[], currentYear: number): PublicHoliday[] {
  const selected = [
    ...holidays.filter((holiday) => holiday.date.startsWith(`${currentYear}-`)).slice(0, 2),
    ...holidays.filter((holiday) => holiday.date.startsWith(`${currentYear + 1}-`)).slice(0, 2),
  ]
  const selectedKeys = new Set(selected.map((holiday) => `${holiday.date}\n${holiday.name}`))
  for (const holiday of holidays) {
    if (selected.length >= 4) break
    const key = `${holiday.date}\n${holiday.name}`
    if (!selectedKeys.has(key)) {
      selected.push(holiday)
      selectedKeys.add(key)
    }
  }
  return selected.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

function HolidayGroups({ holidays, now }: { holidays: readonly PublicHoliday[]; now: Date }) {
  const groups = new Map<string, PublicHoliday[]>()
  for (const holiday of holidays) {
    const month = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(parseLocalDate(holiday.date))
    const rows = groups.get(month) ?? []
    rows.push(holiday)
    groups.set(month, rows)
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {[...groups.entries()].map(([month, rows]) => (
        <section key={month} aria-label={`${month} holidays`}>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{month}</h3>
          <HolidayList holidays={rows} now={now} />
        </section>
      ))}
    </div>
  )
}

function HolidayList({
  holidays,
  now,
  dense = false,
}: {
  holidays: readonly PublicHoliday[]
  now: Date
  dense?: boolean
}) {
  if (holidays.length === 0) return null
  return (
    <ul className={`flex flex-col ${dense ? 'gap-1' : 'gap-2'}`}>
      {holidays.map((holiday) => {
        const days = daysUntilHoliday(holiday.date, now)
        const relative = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days away`
        const hasLocalName = holiday.localName && holiday.localName !== holiday.name
        return (
          <li
            key={`${holiday.date}-${holiday.name}`}
            data-holiday-row-layout={dense ? 'dense' : undefined}
            className={`group flex min-w-0 justify-between gap-3 ${dense ? 'items-center' : 'items-start'}`}
          >
            <span
              title={hasLocalName ? `${holiday.name} · ${holiday.localName}` : holiday.name}
              className={dense ? 'flex min-w-0 items-baseline gap-1 overflow-hidden' : 'min-w-0'}
            >
              <span className={`${dense ? 'truncate' : 'block'} text-sm font-medium text-fg`}>{holiday.name}</span>
              {hasLocalName ? (
                <span className={`${dense ? 'truncate' : 'block'} text-xs ${glanceRowClass}`}>{holiday.localName}</span>
              ) : null}
            </span>
            <span className={`shrink-0 text-right text-xs ${glanceRowClass}`}>
              {dense ? (
                <>{shortDate(holiday.date)} · {relative}</>
              ) : (
                <>
                  <span className="block">{shortDate(holiday.date)}</span>
                  <span className="block">{relative}</span>
                </>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Context({ countryCode, dense = false }: { countryCode: string; dense?: boolean }) {
  return (
    <div
      data-holiday-context-layout={dense ? 'dense' : undefined}
      className={`${dense ? 'mt-2' : 'mt-3'} flex items-center justify-between gap-3 text-xs text-fg-muted`}
    >
      <span>Country: {countryCode}</span>
      <a href="https://date.nager.at" target="_blank" rel="noopener noreferrer" className="hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">
        Open Nager.Date
      </a>
    </div>
  )
}
