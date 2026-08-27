import { localDateKey } from '../../lib/habits'
import { formatDayContext } from '../../lib/clock'
import { useNow } from '../../lib/hooks/useNow'

export default function DayContext() {
  const now = useNow(60_000)
  const compact = formatDayContext(now, 'compact')
  const long = formatDayContext(now, 'long')

  return (
    <div data-day-context="" className="day-context text-photo text-canvas-fg">
      <span className="day-context__eyebrow">Today</span>
      <time dateTime={localDateKey(now)} aria-label={`Today, ${long}`}>
        <span data-day-context-compact="">{compact}</span>
        <span data-day-context-long="">{long}</span>
      </time>
    </div>
  )
}
