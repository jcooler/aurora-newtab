const KNOWN_WIDGET_IDS = new Set([
  'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links',
  'quote', 'weather', 'timer', 'tasks', 'notes', 'bookmarks', 'rss', 'github',
  'gitlab', 'jira', 'vercel', 'crypto', 'ics', 'habits', 'monthCal', 'sun',
  'moon', 'status', 'homeassistant', 'readingList', 'recentlyClosed',
  'downloads', 'tabGroups',
  'linear', 'sentry', 'todoist',
])

const batch = (entries) => Object.freeze(entries.map((entry) => Object.freeze({
  ...entry,
  tiers: Object.freeze([...entry.tiers]),
})))

export const CATALOG_BATCHES = Object.freeze({
  '1': batch([
    { id: 'clock', label: 'Clock', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'greeting', label: 'Greeting', tiers: ['compact', 'standard'] },
    { id: 'search', label: 'Search', tiers: ['compact', 'standard'] },
    { id: 'focus', label: 'Focus', tiers: ['compact', 'standard', 'docked'] },
    { id: 'quote', label: 'Quote', tiers: ['compact', 'standard'] },
    { id: 'weather', label: 'Weather', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'timer', label: 'Timer', tiers: ['compact', 'docked'] },
    { id: 'tasks', label: 'Tasks', tiers: ['compact', 'docked'] },
    { id: 'notes', label: 'Notes', tiers: ['compact', 'docked'] },
    { id: 'bookmarks', label: 'Bookmarks', tiers: ['compact', 'standard', 'docked'] },
  ]),
  '2': batch([
    { id: 'github', label: 'GitHub', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'gitlab', label: 'GitLab', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'jira', label: 'Jira', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'vercel', label: 'Vercel', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'status', label: 'Status', tiers: ['compact', 'standard', 'docked'] },
    { id: 'rss', label: 'Headlines', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'crypto', label: 'Crypto', tiers: ['compact', 'standard', 'docked'] },
    { id: 'homeassistant', label: 'Home Assistant', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'ics', label: 'Calendar', tiers: ['compact', 'standard', 'docked'] },
    { id: 'habits', label: 'Habits', tiers: ['compact', 'docked'] },
    { id: 'worldClocks', label: 'World clocks', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'countdown', label: 'Countdown', tiers: ['compact', 'standard', 'docked'] },
    { id: 'sun', label: 'Sun', tiers: ['compact', 'standard', 'docked'] },
    { id: 'moon', label: 'Moon', tiers: ['compact', 'docked'] },
    { id: 'monthCal', label: 'Month', tiers: ['standard'] },
    { id: 'links', label: 'Quick Links', tiers: ['compact', 'standard'] },
  ]),
  '3': batch([
    { id: 'readingList', label: 'Reading List', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'recentlyClosed', label: 'Recently Closed', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'downloads', label: 'Downloads', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'tabGroups', label: 'Tab Groups', tiers: ['compact', 'standard', 'full', 'docked'] },
  ]),
  '4': batch([
    { id: 'linear', label: 'Linear', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'sentry', label: 'Sentry', tiers: ['compact', 'standard', 'full', 'docked'] },
    { id: 'todoist', label: 'Todoist', tiers: ['compact', 'standard', 'full', 'docked'] },
  ]),
})

export const CATALOG_CONTRACTS = Object.freeze({
  '1': Object.freeze({
    clock: { compact: 'Current time', standard: 'Time and date', full: 'Large, legible time and date', docked: 'Time · date' },
    greeting: { compact: 'Greeting', standard: 'More legible greeting' },
    search: { compact: 'Search action', standard: 'More legible search action' },
    focus: { compact: 'Focus action', standard: 'Focus detail', docked: 'Focus text and completion' },
    quote: { compact: 'Quote', standard: 'Readable full quote' },
    weather: { compact: 'Current temperature and condition', standard: 'Forecast context', full: 'Detailed forecast', docked: 'Temperature · location · condition' },
    timer: { compact: 'Timer action', docked: 'Timer state' },
    tasks: { compact: 'Tasks action', docked: 'Tasks action' },
    notes: { compact: 'Notes action', docked: 'Notes action' },
    bookmarks: { compact: 'Bookmark marks', standard: 'Named bookmark bar', docked: 'Full readable bookmark bar' },
  }),
  '2': Object.freeze({
    github: { compact: 'Selected primary count or graph', standard: 'Selected graph or rows', full: 'Graph, stats, and all selected row families', docked: 'Selected activity counts' },
    gitlab: { compact: 'Selected primary count or graph', standard: 'Selected graph or rows', full: 'All selected GitLab sections', docked: 'Selected activity counts' },
    jira: { compact: 'Selected-view count', standard: 'Prioritized issue rows', full: 'All selected Jira sections', docked: 'Selected issue counts' },
    vercel: { compact: 'Deployment health', standard: 'Selected deployment rows or summary', full: 'All selected deployment sections', docked: 'Deployment health' },
    status: { compact: 'Service health', standard: 'Service dots and active issues', docked: 'Service health' },
    rss: { compact: 'Top headline', standard: 'Selected headlines', full: 'All selected headlines that fit', docked: 'Top headline' },
    crypto: { compact: 'Primary coin price', standard: 'Selected coin prices', docked: 'Primary coin price' },
    homeassistant: { compact: 'Selected entity or action', standard: 'Selected entities and actions', full: 'Complete selected home composition', docked: 'Selected entity state' },
    ics: { compact: 'Next event', standard: 'Selected calendar view', docked: 'Next event' },
    habits: { compact: 'Habit action', docked: 'Habits done today' },
    worldClocks: { compact: 'Primary world clock', standard: 'Selected clocks', full: 'All selected clocks', docked: 'Primary world clock' },
    countdown: { compact: 'Countdown', standard: 'Countdown detail', docked: 'Next countdown' },
    sun: { compact: 'Next sun event', standard: 'Sunrise and sunset', docked: 'Next sun event' },
    moon: { compact: 'Current phase', docked: 'Current phase' },
    monthCal: { standard: 'Complete month' },
    links: { compact: 'Primary link action', standard: 'Selected quick links' },
  }),
  '3': Object.freeze({
    readingList: { compact: 'Unread count and newest title', standard: 'Unread reading queue', full: 'Unread and recently read pages', docked: 'Unread count and newest title' },
    recentlyClosed: { compact: 'Latest closed type and age', standard: 'Recently closed session types', full: 'All restorable session types by kind', docked: 'Closed count and latest type' },
    downloads: { compact: 'Active count and newest filename', standard: 'Active and recent downloads', full: 'All recent download states', docked: 'Active count and newest filename' },
    tabGroups: { compact: 'Group count and first group', standard: 'Open browser workspaces', full: 'All groups by window', docked: 'Group count and first group' },
  }),
  '4': Object.freeze({
    linear: { compact: 'Assigned and due counts', standard: 'Prioritized assigned work', full: 'All assigned work that fits', docked: 'Assigned and due counts' },
    sentry: { compact: 'Unresolved count and top issue', standard: 'Named unresolved issues', full: 'All unresolved issues that fit', docked: 'Unresolved count and top issue' },
    todoist: { compact: 'Due and overdue counts', standard: 'Due task sections', full: 'All due tasks that fit', docked: 'Due and overdue counts' },
  }),
})

export const CODED_DOCK_LINES = new Set([
  'weather', 'clock',
  'github', 'gitlab', 'jira', 'vercel', 'status', 'rss', 'crypto',
  'homeassistant', 'ics', 'habits', 'sun', 'moon',
  'readingList', 'recentlyClosed', 'downloads', 'tabGroups',
  'linear', 'sentry', 'todoist',
])

export function captureTiersFor(id, batches = CATALOG_BATCHES) {
  if (!KNOWN_WIDGET_IDS.has(id)) throw new Error(`unknown widget identity: ${id}`)
  const seen = new Set()
  let tiers
  for (const entries of Object.values(batches)) {
    if (!Array.isArray(entries)) throw new Error('catalog batch must be an array')
    for (const entry of entries) {
      if (!KNOWN_WIDGET_IDS.has(entry.id)) throw new Error(`unknown manifest identity: ${entry.id}`)
      if (seen.has(entry.id)) throw new Error(`duplicate manifest identity: ${entry.id}`)
      seen.add(entry.id)
      if (entry.id === id) tiers = entry.tiers
    }
  }
  if (!tiers) throw new Error(`widget identity is missing from catalog batches: ${id}`)
  return tiers
}
