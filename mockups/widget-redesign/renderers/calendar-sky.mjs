import { escapeHtml, renderFrame, renderStateSurface } from './shared.mjs'

const safe = (value) => escapeHtml(value ?? '')

const dedupeItems = (items) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.date}|${item.title.trim().toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const monthDays = (fixture) => Array.from({ length: 42 }, (_, index) => {
  if (index < fixture.startOffset) return { day: fixture.previousMonthDays - fixture.startOffset + index + 1, outside: true }
  const current = index - fixture.startOffset + 1
  if (current <= fixture.daysInMonth) return { day: current, outside: false }
  return { day: current - fixture.daysInMonth, outside: true }
})

const viewSwitch = (active) => `<div class="calendar-switch" aria-label="Calendar view">
  <button type="button" aria-pressed="${active === 'agenda'}">Agenda</button>
  <button type="button" aria-pressed="${active === 'month'}">Month</button>
</div>`

const monthGrid = (fixture, { showHoliday = true } = {}) => `
  <div class="month-view" data-month-grid>
    <div class="month-view__weekdays">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => `<span>${day}</span>`).join('')}</div>
    <div class="month-view__days">
      ${monthDays(fixture).map((cell) => {
        const marker = !cell.outside && fixture.markers.find(({ day }) => day === cell.day)
        return `<span data-month-day class="${cell.outside ? 'is-outside' : ''} ${cell.day === fixture.today && !cell.outside ? 'is-today' : ''}"><b data-day-number>${cell.day}</b>${marker ? `<i data-${marker.kind}-marker></i>` : ''}</span>`
      }).join('')}
    </div>
    ${showHoliday ? `<div class="month-view__holiday" data-holiday-marker><b>${safe(fixture.nearestHoliday.date)}</b><span>${safe(fixture.nearestHoliday.title)}</span></div>` : ''}
  </div>
`

const agendaRows = (fixture, { includeHoliday = true, limit = 4 } = {}) => {
  const unique = dedupeItems(fixture.items)
  const holiday = unique.find((item) => item.kind === 'holiday')
  const items = includeHoliday && holiday
    ? [...unique.filter((item) => item.kind !== 'holiday').slice(0, Math.max(0, limit - 1)), holiday]
    : unique.filter((item) => item.kind !== 'holiday').slice(0, limit)
  return `<div class="agenda-list">${items.map((item, index) => `<article class="agenda-row ${item.kind === 'holiday' ? 'is-holiday' : ''}" ${index === 0 ? 'data-calendar-next="timed"' : ''}>
    <time>${safe(item.time)}</time><div><strong>${safe(item.title)}</strong><span data-calendar-source>${safe(item.source)}</span></div>${item.join ? '<button type="button" data-join-action>Join</button>' : ''}
  </article>`).join('')}</div>`
}

const calendarState = (state) => {
  const messages = {
    loading: 'Events are loading · Month remains available',
    setup: 'Choose a holiday country · Month remains available',
    stale: 'Events may be stale · Holidays are current',
    partial: 'Holidays unavailable · Events are current',
    empty: 'No events in this range · Month remains available',
    error: 'Calendar sources unavailable · Month remains available',
  }
  return messages[state] ? `<div class="calendar-state" data-calendar-state="${safe(state)}">${safe(messages[state])}</div>` : ''
}

const calendarBody = (capture, fixture) => {
  const status = calendarState(capture.state)
  const stateClass = status ? 'has-state' : ''
  if (capture.tier === 'docked') return `<div class="calendar-dock" data-calendar-next="timed"><time>${safe(fixture.nextEvent.time)}</time><strong>${safe(fixture.nextEvent.title)}</strong><span>${safe(fixture.nearestHoliday.title)} · ${safe(fixture.nearestHoliday.date)}</span></div>`
  if (capture.tier === 'compact') return `<div class="calendar-compact"><time>${safe(fixture.dateLabel)}</time><strong>${safe(fixture.nextEvent.time)} · ${safe(fixture.nextEvent.title)}</strong><span>${safe(fixture.nearestHoliday.title)} · ${safe(fixture.nearestHoliday.date)}</span></div>`
  if (capture.tier === 'standard' && capture.view === 'month') return `<div class="calendar-standard ${stateClass}" data-calendar-view="month"><header><strong>${safe(fixture.monthLabel)}</strong>${viewSwitch('month')}</header>${status}${monthGrid(fixture)}</div>`
  if (capture.tier === 'standard') return `<div class="calendar-standard ${stateClass}" data-calendar-view="agenda"><header><strong>${safe(fixture.dateLabel)}</strong>${viewSwitch('agenda')}</header>${status}${agendaRows(fixture, { includeHoliday: true, limit: capture.state === 'empty' ? 0 : 3 })}</div>`
  return `<div class="calendar-full ${stateClass}" data-calendar-view="combined">${status}<section><header><strong>${safe(fixture.monthLabel)}</strong></header>${monthGrid(fixture)}</section><section><header><strong>${safe(fixture.dateLabel)}</strong></header>${agendaRows(fixture, { includeHoliday: false, limit: 3 })}</section></div>`
}

const weatherBody = (tier, fixture) => {
  if (tier === 'docked') return `<div class="weather-dock"><strong data-weather-temperature>${safe(fixture.temperature)}<small data-weather-unit>${safe(fixture.unit)}</small></strong><span>${safe(fixture.condition)}</span><i>${safe(fixture.location)}</i></div>`
  const lead = `<div class="weather-lead"><strong data-weather-temperature>${safe(fixture.temperature)}<small data-weather-unit>${safe(fixture.unit)}</small></strong><div><b>${safe(fixture.condition)}</b><span>${safe(fixture.location)}</span><small>H ${safe(fixture.high)} · L ${safe(fixture.low)}</small></div></div>`
  if (tier === 'compact') return lead
  const metrics = `<div class="weather-metrics"><span>${safe(fixture.wind)}</span><span>${safe(fixture.rain)}</span><span>${safe(fixture.aqi)}</span></div>`
  if (tier === 'standard') return `<div class="weather-standard">${lead}${metrics}<div class="weather-daily" data-daily-forecast>${fixture.daily.slice(0, 4).map((day) => `<span><b>${safe(day.day)}</b><i>${safe(day.high)}</i><small>${safe(day.low)}</small></span>`).join('')}</div></div>`
  return `<div class="weather-full">${lead}<div class="weather-hourly" data-hourly-forecast>${fixture.hourly.map((hour) => `<span><b>${safe(hour.time)}</b><i>${safe(hour.temp)}</i><small>${safe(hour.condition)}</small></span>`).join('')}</div><div class="weather-lower"><div class="weather-daily" data-daily-forecast>${fixture.daily.map((day) => `<span><b>${safe(day.day)}</b><i>${safe(day.high)}</i><small>${safe(day.low)}</small></span>`).join('')}</div><div class="weather-detail"><span>${safe(fixture.aqi)}</span><span>${safe(fixture.pollen)}</span><span>${safe(fixture.uv)}</span><span>↑ ${safe(fixture.sunrise)} · ↓ ${safe(fixture.sunset)}</span><span>${safe(fixture.wind)}</span><span>${safe(fixture.rain)}</span></div></div></div>`
}

const sunBody = (tier, fixture) => {
  if (tier === 'docked') return `<div class="sun-dock"><span aria-hidden="true">◒</span><strong>${safe(fixture.nextEvent)}</strong><time>${safe(fixture.nextTime)}</time><small>${safe(fixture.daylight)} daylight</small></div>`
  if (tier === 'compact') return `<div class="sun-compact"><span aria-hidden="true">◒</span><div><small>${safe(fixture.nextEvent)}</small><strong>${safe(fixture.nextTime)}</strong><i>${safe(fixture.daylight)} daylight</i></div></div>`
  return `<div class="sun-standard" data-sun-path><div class="sun-path"><i></i><span>●</span></div><div><span>↑ Sunrise <b>${safe(fixture.sunrise)}</b></span><span>↓ Sunset <b>${safe(fixture.sunset)}</b></span></div><footer>${safe(fixture.daylight)} daylight · Solar noon ${safe(fixture.solarNoon)}</footer></div>`
}

const moonBody = (tier, fixture) => tier === 'docked'
  ? `<div class="moon-dock" data-moon-phase><span>◐</span><strong>${safe(fixture.phase)}</strong><small>${safe(fixture.illumination)}</small><time>${safe(fixture.rise)}</time></div>`
  : `<div class="moon-compact" data-moon-phase><span>◐</span><div><strong>${safe(fixture.phase)}</strong><b>${safe(fixture.illumination)} illuminated</b><small>${safe(fixture.nextPhase)}</small></div></div>`

const historyBody = (tier, fixture) => {
  const limit = tier === 'docked' || tier === 'compact' ? 1 : tier === 'standard' ? 2 : 4
  return `<div class="history-face history-face--${tier}"><header><time>${safe(fixture.date)}</time>${tier === 'full' ? '<button type="button">Read more</button>' : ''}</header><div>${fixture.events.slice(0, limit).map((event) => `<article><b data-history-year>${safe(event.year)}</b><p>${safe(event.text)}</p>${tier === 'full' ? `<small>${safe(event.category)}</small>` : ''}</article>`).join('')}</div></div>`
}

const kpBody = (tier, fixture) => {
  const points = fixture.forecast.slice(0, tier === 'full' ? 12 : tier === 'standard' ? 7 : 1)
  if (tier === 'docked') return `<div class="kp-dock"><strong>Kp ${safe(fixture.current)}</strong><span>${safe(fixture.label)}</span><small>${safe(fixture.peak)}</small></div>`
  return `<div class="kp-face kp-face--${tier}"><div class="kp-lead"><strong>${safe(fixture.current)}</strong><span>Kp now · ${safe(fixture.label)}</span><small>${safe(fixture.peak)}</small></div><div class="kp-plot" aria-label="Kp forecast">${points.map((point, index) => `<i data-kp-point style="height:${Math.round((point / 9) * 100)}%"><span>${index * 3}h</span></i>`).join('')}</div></div>`
}

const LABELS = Object.freeze({ calendar: 'Calendar', weather: 'Weather', sun: 'Sun', moon: 'Moon', onThisDay: 'On This Day', auroraKp: 'Aurora & Kp' })

export function renderCalendarSkyWidget(capture, fixture) {
  let body
  if (capture.state !== 'ready' && capture.id !== 'calendar') body = renderStateSurface({ title: `${LABELS[capture.id]} unavailable`, detail: 'Current data could not be refreshed.', action: 'Try again' })
  else if (capture.id === 'calendar') body = calendarBody(capture, fixture)
  else if (capture.id === 'weather') body = weatherBody(capture.tier, fixture)
  else if (capture.id === 'sun') body = sunBody(capture.tier, fixture)
  else if (capture.id === 'moon') body = moonBody(capture.tier, fixture)
  else if (capture.id === 'onThisDay') body = historyBody(capture.tier, fixture)
  else if (capture.id === 'auroraKp') body = kpBody(capture.tier, fixture)
  else throw new Error(`Unsupported Calendar & sky widget: ${capture.id}`)
  return renderFrame({ tier: capture.tier, theme: capture.theme, state: capture.state, label: LABELS[capture.id], widget: capture.id, className: `calendar-sky-widget calendar-sky-widget--${capture.id}`, body })
}

export function renderCalendarConsolidation(fixture) {
  return `<section class="calendar-consolidation" data-calendar-consolidation data-essential><header><span>Calendar consolidation</span><h3>Choose which placement to keep.</h3><p>Your feeds, holiday country, and view settings move with the placement you choose.</p></header><div class="calendar-consolidation__placements">${fixture.placements.map((placement) => `<button type="button" data-calendar-placement><strong>${safe(placement.name)}</strong><span>${safe(placement.tier)} · ${safe(placement.position)}</span><small>${safe(placement.detail)}</small></button>`).join('')}</div><footer><button type="button">Later</button><button type="button">Save</button></footer></section>`
}
