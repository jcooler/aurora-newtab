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

  const visible = canvasSize === 'full' ? upcoming : canvasSize === 'standard' ? upcoming.slice(0, 3) : upcoming.slice(0, 1)
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
        : <HolidayList holidays={visible} now={localDay.now} />}
      {data ? <Context countryCode={config.countryCode} /> : null}
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

function HolidayGroups({ holidays, now }: { holidays: readonly PublicHoliday[]; now: Date }) {
  const groups = new Map<string, PublicHoliday[]>()
  for (const holiday of holidays) {
    const month = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(parseLocalDate(holiday.date))
    const rows = groups.get(month) ?? []
    rows.push(holiday)
    groups.set(month, rows)
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([month, rows]) => (
        <section key={month} aria-label={`${month} holidays`}>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{month}</h3>
          <HolidayList holidays={rows} now={now} />
        </section>
      ))}
    </div>
  )
}

function HolidayList({ holidays, now }: { holidays: readonly PublicHoliday[]; now: Date }) {
  if (holidays.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {holidays.map((holiday) => {
        const days = daysUntilHoliday(holiday.date, now)
        return (
          <li key={`${holiday.date}-${holiday.name}`} className="group flex min-w-0 items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fg">{holiday.name}</span>
              {holiday.localName && holiday.localName !== holiday.name ? (
                <span className={`block text-xs ${glanceRowClass}`}>{holiday.localName}</span>
              ) : null}
            </span>
            <span className={`shrink-0 text-right text-xs ${glanceRowClass}`}>
              <span className="block">{shortDate(holiday.date)}</span>
              <span className="block">{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days away`}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Context({ countryCode }: { countryCode: string }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-fg-muted">
      <span>Country: {countryCode}</span>
      <a href="https://date.nager.at" target="_blank" rel="noopener noreferrer" className="hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">
        From Nager.Date
      </a>
    </div>
  )
}
