const FIXTURES = Object.freeze({
  clock: Object.freeze({
    time: '09:41', seconds: '26', date: 'Sunday, August 23', timezone: 'New York · EDT',
  }),
  greeting: Object.freeze({
    greeting: 'Good morning, Jon.', briefing: 'A clear start. Three priorities are ready when you are.',
  }),
  worldClocks: Object.freeze({
    clocks: Object.freeze([
      Object.freeze({ city: 'London', time: '14:41', offset: '+5h', day: 'Today', zone: 'BST' }),
      Object.freeze({ city: 'Tokyo', time: '22:41', offset: '+13h', day: 'Today', zone: 'JST' }),
      Object.freeze({ city: 'Sydney', time: '23:41', offset: '+14h', day: 'Today', zone: 'AEST' }),
      Object.freeze({ city: 'Singapore', time: '21:41', offset: '+12h', day: 'Today', zone: 'SGT' }),
      Object.freeze({ city: 'San Francisco', time: '06:41', offset: '-3h', day: 'Today', zone: 'PDT' }),
    ]),
  }),
  countdown: Object.freeze({
    label: 'Autumn trip', value: '18 days', date: 'September 10, 2026', progress: 68,
  }),
  search: Object.freeze({
    prompt: 'Search the web', hint: 'Press / to focus',
  }),
  focus: Object.freeze({
    text: 'Finish the widget review', completed: 2, total: 4, flowLabel: 'Open Flow',
  }),
  links: Object.freeze({
    links: Object.freeze([
      Object.freeze({ mark: 'M', name: 'Mail', domain: 'inbox' }),
      Object.freeze({ mark: 'C', name: 'Calendar', domain: 'today' }),
      Object.freeze({ mark: 'D', name: 'Drive', domain: 'files' }),
      Object.freeze({ mark: 'A', name: 'Aurora', domain: 'workspace' }),
      Object.freeze({ mark: 'G', name: 'GitHub', domain: 'code' }),
      Object.freeze({ mark: 'H', name: 'Home', domain: 'control' }),
    ]),
  }),
  quote: Object.freeze({
    copy: 'The details are not the details. They make the design.', author: 'Charles Eames', longText: false,
  }),
  timer: Object.freeze({
    value: '25:00', session: 'Focus sprint', running: false, action: 'Start',
  }),
  tasks: Object.freeze({
    completed: 3,
    total: 6,
    tasks: Object.freeze([
      Object.freeze({ text: 'Review Calendar hierarchy', done: false }),
      Object.freeze({ text: 'Check compact density', done: false }),
      Object.freeze({ text: 'Approve core direction', done: true }),
    ]),
  }),
  notes: Object.freeze({
    copy: 'Keep the month view complete. Holidays belong in context, not in a separate card.', updated: 'Edited 12 min ago',
  }),
  bookmarks: Object.freeze({
    bookmarks: Object.freeze([
      Object.freeze({ mark: 'N', name: 'News', kind: 'link' }),
      Object.freeze({ mark: 'D', name: 'Design', kind: 'folder' }),
      Object.freeze({ mark: 'G', name: 'GitHub', kind: 'link' }),
      Object.freeze({ mark: 'R', name: 'Research', kind: 'folder' }),
      Object.freeze({ mark: 'M', name: 'Mail', kind: 'link' }),
      Object.freeze({ mark: 'A', name: 'Aurora docs', kind: 'link' }),
      Object.freeze({ mark: 'F', name: 'Finance', kind: 'folder' }),
      Object.freeze({ mark: 'T', name: 'Travel', kind: 'folder' }),
    ]),
  }),
  habits: Object.freeze({
    completed: 2,
    total: 4,
    streak: 9,
    habits: Object.freeze([
      Object.freeze({ name: 'Walk', done: true }),
      Object.freeze({ name: 'Read', done: true }),
      Object.freeze({ name: 'Stretch', done: false }),
      Object.freeze({ name: 'Journal', done: false }),
    ]),
  }),
  calendar: Object.freeze({
    dateLabel: 'Sunday, August 23',
    monthLabel: 'August 2026',
    today: 23,
    startOffset: 6,
    daysInMonth: 31,
    previousMonthDays: 31,
    nextEvent: Object.freeze({ title: 'Widget review', time: '10:00', source: 'Work calendar', join: true }),
    items: Object.freeze([
      Object.freeze({ date: '2026-08-23', time: '10:00', title: 'Widget review', source: 'Work calendar', kind: 'timed', join: true }),
      Object.freeze({ date: '2026-08-23', time: '13:30', title: 'Design sync', source: 'Aurora redesign', kind: 'timed', join: true }),
      Object.freeze({ date: '2026-08-24', time: 'All day', title: 'Owner QA window', source: 'Personal', kind: 'all-day', join: false }),
      Object.freeze({ date: '2026-09-07', time: 'All day', title: 'Labor Day', source: 'US Holidays ICS', kind: 'holiday', join: false }),
      Object.freeze({ date: '2026-09-07', time: 'All day', title: 'Labor Day', source: 'United States public holidays', kind: 'holiday', join: false }),
    ]),
    markers: Object.freeze([
      Object.freeze({ day: 4, kind: 'event' }), Object.freeze({ day: 11, kind: 'event' }),
      Object.freeze({ day: 18, kind: 'event' }), Object.freeze({ day: 23, kind: 'event' }),
      Object.freeze({ day: 31, kind: 'holiday' }),
    ]),
    nearestHoliday: Object.freeze({ title: 'Labor Day', date: 'Sep 7' }),
    placements: Object.freeze([
      Object.freeze({ name: 'Main canvas', tier: 'Standard', position: 'Center left', detail: 'Calendar agenda' }),
      Object.freeze({ name: 'Planning stack', tier: 'Full', position: 'Stack member', detail: 'Month view' }),
      Object.freeze({ name: 'Bottom dock', tier: 'Docked', position: 'Dock position 4', detail: 'Public holidays' }),
    ]),
  }),
  weather: Object.freeze({
    location: 'Brooklyn, NY', condition: 'Partly cloudy', temperature: '72', unit: '°F', high: '78°', low: '64°',
    wind: '3 mph NW', rain: 'Rain possible after 6 PM', aqi: 'AQI 31 · Good', pollen: 'Pollen low', uv: 'UV 4 moderate',
    sunrise: '6:16 AM', sunset: '7:42 PM',
    hourly: Object.freeze([
      Object.freeze({ time: 'Now', temp: '72°', condition: 'Partly cloudy' }),
      Object.freeze({ time: '11 AM', temp: '74°', condition: 'Cloudy' }),
      Object.freeze({ time: '1 PM', temp: '77°', condition: 'Sunny' }),
      Object.freeze({ time: '3 PM', temp: '78°', condition: 'Sunny' }),
      Object.freeze({ time: '5 PM', temp: '75°', condition: 'Cloudy' }),
      Object.freeze({ time: '7 PM', temp: '70°', condition: 'Rain' }),
    ]),
    daily: Object.freeze([
      Object.freeze({ day: 'Mon', high: '78°', low: '64°', condition: 'Clouds' }),
      Object.freeze({ day: 'Tue', high: '80°', low: '65°', condition: 'Sun' }),
      Object.freeze({ day: 'Wed', high: '74°', low: '61°', condition: 'Rain' }),
      Object.freeze({ day: 'Thu', high: '76°', low: '62°', condition: 'Sun' }),
    ]),
  }),
  sun: Object.freeze({ nextEvent: 'Sunset', nextTime: '7:42 PM', sunrise: '6:16 AM', sunset: '7:42 PM', daylight: '13h 26m', solarNoon: '12:59 PM' }),
  moon: Object.freeze({ phase: 'Waxing gibbous', illumination: '72%', nextPhase: 'Full moon in 4 days', rise: '4:28 PM' }),
  onThisDay: Object.freeze({
    date: 'August 23',
    events: Object.freeze([
      Object.freeze({ year: '1966', text: 'Lunar Orbiter 1 sends the first photograph of Earth from the Moon.', category: 'Event' }),
      Object.freeze({ year: '1991', text: 'The World Wide Web opens to new users beyond CERN.', category: 'Event' }),
      Object.freeze({ year: '1978', text: 'Kobe Bryant is born in Philadelphia.', category: 'Birth' }),
      Object.freeze({ year: '2014', text: 'Dancer and actor Marcel Marceau is honored with a centenary retrospective.', category: 'Culture' }),
    ]),
  }),
  auroraKp: Object.freeze({
    current: '3.7', label: 'Unsettled', peak: 'Kp 5.0 at 11 PM',
    forecast: Object.freeze([2.1, 2.8, 3.7, 4.2, 5.0, 4.4, 3.6, 3.0, 2.4, 2.1, 1.8, 2.2]),
  }),
})

const SCENARIOS = Object.freeze({
  sparse: Object.freeze({
    tasks: Object.freeze({ completed: 0, total: 0, tasks: Object.freeze([]) }),
    notes: Object.freeze({ copy: '', updated: '' }),
    countdown: Object.freeze({ label: '', value: '', date: '', progress: 0 }),
    focus: Object.freeze({ text: '', completed: 0, total: 0 }),
    links: Object.freeze({ links: Object.freeze([]) }),
    bookmarks: Object.freeze({ bookmarks: Object.freeze([]) }),
    habits: Object.freeze({ completed: 0, total: 4, streak: 0 }),
  }),
  longText: Object.freeze({
    quote: Object.freeze({
      copy: 'Good design is a language, and the most useful sentences are composed with restraint, rhythm, and enough room for meaning to arrive before decoration.',
      author: 'Catalog fixture',
      longText: true,
    }),
    notes: Object.freeze({
      copy: 'The compact note must preserve a useful thought without turning the final line into an accidental control collision. Clamp deliberately and keep the update cue visible.',
    }),
  }),
  running: Object.freeze({
    timer: Object.freeze({ value: '17:42', session: 'Widget review', running: true, action: 'Pause' }),
  }),
  complete: Object.freeze({
    habits: Object.freeze({ completed: 4, total: 4, streak: 10 }),
  }),
  zero: Object.freeze({
    habits: Object.freeze({ completed: 0, total: 4, streak: 0 }),
  }),
  partial: Object.freeze({}),
  dense: Object.freeze({}),
})

const clone = (value) => globalThis.structuredClone(value)

export function fixtureFor(id, scenario = 'dense', overrides = {}) {
  const base = FIXTURES[id]
  if (!base) throw new Error(`No fixture registered for widget: ${id}`)
  const scenarioData = SCENARIOS[scenario]
  if (!scenarioData) throw new Error(`Unsupported fixture scenario: ${scenario}`)

  const ignored = new Set(['fixture', 'state', 'theme', 'tier', 'view', 'stack'])
  const fixtureOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([key]) => !ignored.has(key)),
  )
  return {
    ...clone(base),
    ...clone(scenarioData[id] ?? {}),
    ...fixtureOverrides,
  }
}
