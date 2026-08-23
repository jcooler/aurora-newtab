import { escapeHtml, renderFrame, renderStateSurface } from './shared.mjs'

const pct = (value, total) => total > 0 ? Math.round((value / total) * 100) : 0
const safe = (value) => escapeHtml(value ?? '')

const action = (label, className = '') => `<button class="widget-action ${className}" type="button">${safe(label)}</button>`

const clockBody = (tier, fixture) => `
  <div class="clock-face clock-face--${tier}">
    <div class="clock-face__time" data-clock-time>${safe(fixture.time)}${tier === 'full' ? `<small>${safe(fixture.seconds)}</small>` : ''}</div>
    ${tier === 'compact' ? '' : `<div class="clock-face__date">${safe(fixture.date)}</div>`}
    ${tier === 'full' ? `<div class="clock-face__zone" data-clock-timezone>${safe(fixture.timezone)}</div>` : ''}
  </div>
`

const greetingBody = (tier, fixture) => `
  <div class="greeting-face" data-greeting-copy>
    <strong>${safe(fixture.greeting)}</strong>
    ${tier === 'standard' ? `<p>${safe(fixture.briefing)}</p>` : ''}
  </div>
`

const worldClocksBody = (tier, fixture) => {
  const clocks = tier === 'docked' || tier === 'compact'
    ? fixture.clocks.slice(0, 1)
    : fixture.clocks.slice(0, tier === 'standard' ? 3 : fixture.clocks.length)
  return `<div class="world-clocks world-clocks--${tier}">
    ${clocks.map((clock) => `<div class="world-clock" data-world-clock>
      <span><strong>${safe(clock.city)}</strong><small>${safe(clock.zone)} · ${safe(clock.day)}</small></span>
      <b>${safe(clock.time)}</b><i>${safe(clock.offset)}</i>
    </div>`).join('')}
    ${tier === 'full' ? `<div class="world-clocks__band" aria-label="Shared working hours"><span style="--start: 18%; --span: 42%"></span></div>` : ''}
  </div>`
}

const countdownBody = (tier, fixture, state) => {
  if (state === 'empty' || !fixture.label) return renderStateSurface({ title: 'Choose a date', detail: 'Add the next moment worth counting toward.', action: 'Set date' })
  return `<div class="countdown-face">
    <strong data-countdown-value>${safe(fixture.value)}</strong>
    <span>${safe(fixture.label)}</span>
    ${tier === 'standard' ? `<small>${safe(fixture.date)}</small><div class="meter"><i style="width:${fixture.progress}%"></i></div>` : ''}
  </div>`
}

const searchBody = (tier, fixture) => `
  <div class="search-face" data-search-prompt>
    <span aria-hidden="true">⌕</span>
    <strong>${safe(fixture.prompt)}</strong>
    ${tier === 'standard' ? `<kbd>${safe(fixture.hint)}</kbd>` : ''}
  </div>
`

const focusBody = (tier, fixture, state) => {
  if (state === 'empty' || !fixture.text) return `<div data-focus-action>${renderStateSurface({ title: 'Name the one thing', detail: 'A specific focus is easier to finish.', action: 'Add focus' })}</div>`
  const progress = pct(fixture.completed, fixture.total)
  return `<div class="focus-face" data-focus-action>
    <button class="focus-face__check" type="button" aria-label="Complete focus"></button>
    <strong>${safe(fixture.text)}</strong>
    ${tier === 'standard' ? `<div class="focus-face__status"><span>${fixture.completed} of ${fixture.total}</span><span>${progress}%</span></div><div class="meter"><i style="width:${progress}%"></i></div>${action(fixture.flowLabel, 'widget-action--quiet')}` : ''}
  </div>`
}

const linksBody = (tier, fixture, state) => {
  if (state === 'empty' || fixture.links.length === 0) return renderStateSurface({ title: 'No quick links yet', detail: 'Pin the places you open every day.', action: 'Add link' })
  return `<div class="quick-links quick-links--${tier}">${fixture.links.map((link) => `<button type="button" class="quick-link" data-quick-link title="${safe(link.name)}">
    <b>${safe(link.mark)}</b><span>${safe(link.name)}</span>${tier === 'standard' ? `<small>${safe(link.domain)}</small>` : ''}
  </button>`).join('')}</div>`
}

const quoteBody = (fixture) => `
  <figure class="quote-face ${fixture.longText ? 'quote-face--long' : ''}" ${fixture.longText ? 'data-long-text' : ''}>
    <blockquote data-quote-copy>${safe(fixture.copy)}</blockquote>
    <figcaption>${safe(fixture.author)}</figcaption>
  </figure>
`

const timerBody = (fixture) => `
  <div class="timer-face ${fixture.running ? 'timer-face--running' : ''}" ${fixture.running ? 'data-timer-running' : ''}>
    <strong data-timer-value>${safe(fixture.value)}</strong>
    <span>${safe(fixture.session)}</span>
    ${action(fixture.action)}
  </div>
`

const tasksBody = (tier, fixture, state) => {
  const progress = pct(fixture.completed, fixture.total)
  if (state === 'empty' || fixture.tasks.length === 0) return `<div data-task-progress data-empty-state>${renderStateSurface({ title: 'Nothing queued', detail: 'Your next task can stay small and specific.', action: 'Add task' })}</div>`
  if (tier === 'docked') return `<div class="task-dock" data-task-progress><strong>${fixture.total - fixture.completed} open</strong><div class="meter"><i style="width:${progress}%"></i></div>${action('+')}</div>`
  return `<div class="tasks-face" data-task-progress>
    <div class="tasks-face__summary"><strong>${fixture.total - fixture.completed} left</strong><span>${progress}% today</span></div>
    <ul>${fixture.tasks.slice(0, 2).map((task) => `<li class="${task.done ? 'is-done' : ''}"><button type="button" aria-label="Toggle task"></button><span>${safe(task.text)}</span></li>`).join('')}</ul>
  </div>`
}

const notesBody = (fixture, state) => {
  if (state === 'empty' || !fixture.copy) return `<div data-note-copy data-empty-state>${renderStateSurface({ title: 'A clean page', detail: 'Capture the thought before it disappears.', action: 'Write note' })}</div>`
  return `<div class="notes-face" data-note-copy><p>${safe(fixture.copy)}</p><span>${safe(fixture.updated)}</span></div>`
}

const bookmarksBody = (tier, fixture, state) => {
  if (state === 'empty' || fixture.bookmarks.length === 0) return `<div data-bookmark-mark data-empty-state>${renderStateSurface({ title: 'No bookmarks shown', detail: 'Choose a folder or add the first destination.', action: 'Choose folder' })}</div>`
  const visible = tier === 'docked' ? fixture.bookmarks.slice(0, 2) : fixture.bookmarks
  const remaining = fixture.bookmarks.length - visible.length
  return `<div class="bookmarks-face bookmarks-face--${tier}">${visible.map((bookmark) => `<button type="button" class="bookmark" title="${safe(bookmark.name)}">
    <b data-bookmark-mark="${safe(bookmark.mark)}">${safe(bookmark.mark)}</b><span>${safe(bookmark.name)}</span>${bookmark.kind === 'folder' ? '<i>folder</i>' : ''}
  </button>`).join('')}${remaining > 0 ? `<span class="bookmark-more">+${remaining}</span>` : ''}</div>`
}

const habitsBody = (tier, fixture, state) => {
  const progress = pct(fixture.completed, fixture.total)
  const habits = fixture.habits ?? []
  if (state === 'empty') return `<div data-habit-progress data-empty-state>${renderStateSurface({ title: 'Shape today', detail: 'Add a habit that is easy to repeat.', action: 'Add habit' })}</div>`
  return `<div class="habits-face ${progress === 100 ? 'habits-face--complete' : ''}" data-habit-progress ${progress === 100 ? 'data-habit-complete' : ''}>
    <div class="habit-ring" style="--progress:${progress * 3.6}deg"><strong>${fixture.completed}/${fixture.total}</strong><span>today</span></div>
    <div class="habit-list">${habits.slice(0, tier === 'docked' ? 0 : 4).map((habit) => `<span class="${habit.done ? 'is-done' : ''}"><i></i>${safe(habit.name)}</span>`).join('')}<small>${fixture.streak} day streak</small></div>
  </div>`
}

const BODY_RENDERERS = Object.freeze({
  bookmarks: (tier, fixture, state) => bookmarksBody(tier, fixture, state),
  clock: (tier, fixture) => clockBody(tier, fixture),
  countdown: (tier, fixture, state) => countdownBody(tier, fixture, state),
  focus: (tier, fixture, state) => focusBody(tier, fixture, state),
  greeting: (tier, fixture) => greetingBody(tier, fixture),
  habits: (tier, fixture, state) => habitsBody(tier, fixture, state),
  links: (tier, fixture, state) => linksBody(tier, fixture, state),
  notes: (_tier, fixture, state) => notesBody(fixture, state),
  quote: (_tier, fixture) => quoteBody(fixture),
  search: (tier, fixture) => searchBody(tier, fixture),
  tasks: (tier, fixture, state) => tasksBody(tier, fixture, state),
  timer: (_tier, fixture) => timerBody(fixture),
  worldClocks: (tier, fixture) => worldClocksBody(tier, fixture),
})

const LABELS = Object.freeze({
  bookmarks: 'Bookmarks', clock: 'Clock', countdown: 'Countdown', focus: 'Focus',
  greeting: 'Greeting', habits: 'Habits', links: 'Quick Links', notes: 'Notes',
  quote: 'Quote', search: 'Search', tasks: 'Tasks', timer: 'Timer', worldClocks: 'World Clocks',
})

export function renderCoreWidget(capture, fixture) {
  const renderer = BODY_RENDERERS[capture.id]
  if (!renderer) throw new Error(`Unsupported core widget: ${capture.id}`)
  let body = renderer(capture.tier, fixture, capture.state)
  if (capture.id === 'quote' && capture.state === 'loading') {
    body = `<div data-quote-copy>${renderStateSurface({ title: 'Finding a thought', detail: 'The next quotation is being prepared.' })}</div>`
  }
  if (capture.id === 'quote' && capture.state === 'error') {
    body = `<div data-quote-copy>${renderStateSurface({ title: 'Quote unavailable', detail: 'The last refresh did not complete.', action: 'Try again' })}</div>`
  }
  if (capture.id === 'timer' && capture.state === 'empty') {
    body = `<div data-timer-value>${renderStateSurface({ title: 'Timer ready', detail: 'Choose a duration to begin.', action: 'Set timer' })}</div>`
  }
  return renderFrame({
    tier: capture.tier,
    theme: capture.theme,
    state: capture.state,
    label: LABELS[capture.id],
    widget: capture.id,
    className: `core-widget core-widget--${capture.id}`,
    surface: capture.id === 'greeting' && capture.presentation !== 'stack' ? 'none' : 'card',
    body,
  })
}
