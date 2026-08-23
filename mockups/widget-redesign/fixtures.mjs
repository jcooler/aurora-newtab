const CORE_FIXTURES = Object.freeze({
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
  const base = CORE_FIXTURES[id]
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
