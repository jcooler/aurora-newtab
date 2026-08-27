export const SOURCE_WIDGET_IDS = Object.freeze([
  'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links',
  'quote', 'weather', 'timer', 'tasks', 'notes', 'bookmarks', 'rss', 'github',
  'gitlab', 'jira', 'vercel', 'crypto', 'readingList', 'recentlyClosed',
  'downloads', 'tabGroups', 'ics', 'habits', 'monthCal', 'sun', 'moon',
  'status', 'homeassistant', 'linear', 'sentry', 'todoist', 'onThisDay',
  'publicHolidays', 'auroraKp',
])

export const LEGACY_TARGET_MAP = Object.freeze({
  ics: 'calendar',
  monthCal: 'calendar',
  publicHolidays: 'calendar',
})

const freezeBudget = (purpose, essential, signature, supporting = []) => Object.freeze({
  purpose,
  essential: Object.freeze(essential),
  signature: Object.freeze(signature),
  supporting: Object.freeze(supporting),
})

const target = ({
  id,
  label,
  family,
  tiers,
  stackTiers,
  primaryTier,
  presentation,
  states = [],
  sourceIds = [id],
  standardViews,
  budgets,
}) => Object.freeze({
  id,
  label,
  family,
  tiers: Object.freeze(tiers),
  stackTiers: Object.freeze(stackTiers),
  primaryTier,
  presentation,
  states: Object.freeze(states),
  sourceIds: Object.freeze(sourceIds),
  ...(standardViews ? { standardViews: Object.freeze(standardViews) } : {}),
  budgets: Object.freeze(budgets),
})

const dock = (purpose, essential, signature, supporting = []) => freezeBudget(purpose, essential, signature, supporting)
const compact = (purpose, essential, signature, supporting = []) => freezeBudget(purpose, essential, signature, supporting)
const standard = (purpose, essential, signature, supporting = []) => freezeBudget(purpose, essential, signature, supporting)
const full = (purpose, essential, signature, supporting = []) => freezeBudget(purpose, essential, signature, supporting)

export const TARGET_WIDGETS = Object.freeze([
  target({
    id: 'clock', label: 'Clock', family: 'core', presentation: 'intrinsic',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard',
    budgets: {
      docked: dock('Immediate time', ['time', 'date'], ['precision-aligned time']),
      compact: compact('Time at a glance', ['time'], ['dominant numerals'], ['seconds when enabled']),
      standard: standard('Time and date', ['time', 'long date'], ['dominant numerals'], ['seconds']),
      full: full('Time across context', ['time', 'long date'], ['expanded numerals'], ['seconds', 'timezone']),
    },
  }),
  target({
    id: 'greeting', label: 'Greeting', family: 'core', presentation: 'intrinsic',
    tiers: ['compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard',
    budgets: {
      compact: compact('Personal welcome', ['greeting'], ['human-scale type']),
      standard: standard('Welcome and briefing', ['greeting'], ['human-scale type'], ['one useful briefing']),
    },
  }),
  target({
    id: 'worldClocks', label: 'World Clocks', family: 'core', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard',
    budgets: {
      docked: dock('Primary remote time', ['city', 'time'], ['day offset']),
      compact: compact('Primary remote time', ['city', 'time'], ['large remote time'], ['day offset']),
      standard: standard('Selected remote times', ['city', 'time'], ['aligned clock list'], ['day offsets']),
      full: full('Global working hours', ['city', 'time'], ['time-band comparison'], ['timezone', 'day offset']),
    },
  }),
  target({
    id: 'countdown', label: 'Countdown', family: 'core', presentation: 'intrinsic',
    tiers: ['docked', 'compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard', states: ['empty'],
    budgets: {
      docked: dock('Next target', ['remaining time', 'label'], ['countdown value']),
      compact: compact('Next target', ['remaining time', 'label'], ['dominant remaining value']),
      standard: standard('Target progress', ['remaining time', 'label', 'date'], ['dominant remaining value'], ['progress']),
    },
  }),
  target({
    id: 'search', label: 'Search', family: 'core', presentation: 'intrinsic',
    tiers: ['compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard',
    budgets: {
      compact: compact('Start a search', ['search action'], ['clear prompt']),
      standard: standard('Start a search', ['search action', 'keyboard hint'], ['wide input rhythm']),
    },
  }),
  target({
    id: 'focus', label: 'Focus', family: 'core', presentation: 'intrinsic',
    tiers: ['docked', 'compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard', states: ['empty'],
    budgets: {
      docked: dock('Current focus', ['focus text'], ['completion control']),
      compact: compact('Current focus', ['focus text'], ['single intentional action']),
      standard: standard('Focus progress', ['focus text', 'completion'], ['progress line'], ['Flow action']),
    },
  }),
  target({
    id: 'links', label: 'Quick Links', family: 'core', presentation: 'intrinsic',
    tiers: ['compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard', states: ['empty'],
    budgets: {
      compact: compact('Primary destinations', ['link marks'], ['recognizable destinations']),
      standard: standard('Named destinations', ['link names'], ['balanced link field'], ['domains']),
    },
  }),
  target({
    id: 'quote', label: 'Quote', family: 'core', presentation: 'intrinsic',
    tiers: ['compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard', states: ['loading', 'error'],
    budgets: {
      compact: compact('One thought', ['quote'], ['balanced quotation']),
      standard: standard('Readable quotation', ['quote', 'author'], ['editorial type measure']),
    },
  }),
  target({
    id: 'timer', label: 'Timer', family: 'core', presentation: 'framed',
    tiers: ['docked', 'compact'], stackTiers: ['compact'], primaryTier: 'compact', states: ['empty'],
    budgets: {
      docked: dock('Timer state', ['remaining time', 'action'], ['aligned timer value']),
      compact: compact('Run a timer', ['remaining time', 'action'], ['dominant timer value'], ['session label']),
    },
  }),
  target({
    id: 'tasks', label: 'Tasks', family: 'core', presentation: 'framed',
    tiers: ['docked', 'compact'], stackTiers: ['compact'], primaryTier: 'compact', states: ['empty'],
    budgets: {
      docked: dock('Task progress', ['open count', 'action'], ['progress']),
      compact: compact('Next tasks', ['task text', 'completion'], ['bounded task queue'], ['daily progress']),
    },
  }),
  target({
    id: 'notes', label: 'Notes', family: 'core', presentation: 'framed',
    tiers: ['docked', 'compact'], stackTiers: ['compact'], primaryTier: 'compact', states: ['empty'],
    budgets: {
      docked: dock('Notes access', ['note status', 'action'], ['note cue']),
      compact: compact('Recent note', ['note text'], ['paper-like text field'], ['updated time']),
    },
  }),
  target({
    id: 'bookmarks', label: 'Bookmarks', family: 'core', presentation: 'bar',
    tiers: ['docked', 'compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard', states: ['empty', 'partial'],
    budgets: {
      docked: dock('Readable bookmark bar', ['bookmark names'], ['linear launch rail']),
      compact: compact('Bookmark marks', ['one-letter marks'], ['dense launch grid']),
      standard: standard('Named bookmarks', ['bookmark names'], ['dense launch rail'], ['folders']),
    },
  }),
  target({
    id: 'habits', label: 'Habits', family: 'core', presentation: 'framed',
    tiers: ['docked', 'compact'], stackTiers: ['compact'], primaryTier: 'compact', states: ['empty'],
    budgets: {
      docked: dock('Daily habit progress', ['completed count'], ['progress']),
      compact: compact('Daily habit progress', ['habit names', 'completion'], ['progress arc'], ['streak']),
    },
  }),
  target({
    id: 'calendar', label: 'Calendar', family: 'calendar-sky', presentation: 'framed', sourceIds: ['ics', 'monthCal', 'publicHolidays'],
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', standardViews: ['agenda', 'month'], states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Next relevant date item', ['event or holiday', 'time or date'], ['chronological next item']),
      compact: compact('Next date items', ['local date', 'next item'], ['agenda lead'], ['one supporting item']),
      standard: standard('Agenda or complete month', ['view switch', 'selected view content'], ['agenda list or seven-column grid'], ['source names', 'holiday context']),
      full: full('Month and agenda together', ['complete month', 'agenda'], ['two-region date composition'], ['holidays', 'source identity', 'Join action']),
    },
  }),
  target({
    id: 'weather', label: 'Weather', family: 'calendar-sky', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Current conditions', ['temperature', 'location', 'condition'], ['large temperature']),
      compact: compact('Current weather', ['temperature', 'condition'], ['large temperature'], ['high and low']),
      standard: standard('Weather outlook', ['temperature', 'condition', 'location'], ['forecast curve'], ['wind', 'rain', 'high and low']),
      full: full('Detailed forecast', ['temperature', 'condition', 'location'], ['hourly forecast'], ['daily forecast', 'AQI', 'pollen', 'UV', 'sun', 'wind']),
    },
  }),
  target({
    id: 'sun', label: 'Sun', family: 'calendar-sky', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard',
    budgets: {
      docked: dock('Next sun event', ['event', 'time'], ['sun event glyph']),
      compact: compact('Next sun event', ['event', 'time'], ['sun event glyph'], ['daylight remaining']),
      standard: standard('Sunrise and sunset', ['sunrise', 'sunset'], ['sun path'], ['day length', 'solar noon']),
    },
  }),
  target({
    id: 'moon', label: 'Moon', family: 'calendar-sky', presentation: 'framed',
    tiers: ['docked', 'compact'], stackTiers: ['compact'], primaryTier: 'compact',
    budgets: {
      docked: dock('Current phase', ['phase'], ['phase glyph']),
      compact: compact('Current moon phase', ['phase', 'illumination'], ['large phase glyph'], ['next phase']),
    },
  }),
  target({
    id: 'onThisDay', label: 'On This Day', family: 'calendar-sky', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'error'],
    budgets: {
      docked: dock('One historic moment', ['year', 'event'], ['year marker']),
      compact: compact('One historic moment', ['date', 'year', 'event'], ['year marker']),
      standard: standard('Historic moments', ['date', 'years', 'events'], ['timeline']),
      full: full('Events, births, and deaths', ['date', 'years', 'events'], ['multi-lane timeline'], ['Read more']),
    },
  }),
  target({
    id: 'auroraKp', label: 'Aurora & Kp', family: 'calendar-sky', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'error'],
    budgets: {
      docked: dock('Current space weather', ['current Kp', 'next peak'], ['Kp value']),
      compact: compact('Current Kp and peak', ['current Kp', 'next peak'], ['Kp gauge']),
      standard: standard('Short Kp forecast', ['current Kp', 'forecast'], ['forecast plot'], ['peak time']),
      full: full('Three-day Kp outlook', ['current Kp', 'forecast'], ['three-day plot'], ['storm scale', 'peak windows']),
    },
  }),
  target({
    id: 'github', label: 'GitHub', family: 'work', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Development pulse', ['contributions', 'reviews'], ['activity count']),
      compact: compact('Contribution pulse', ['graph', 'count', 'streak'], ['contribution graph']),
      standard: standard('Contribution and review pulse', ['graph', 'count', 'streak'], ['large contribution graph'], ['PRs', 'issues']),
      full: full('Complete development pulse', ['graph', 'count', 'streak'], ['expanded contribution graph'], ['reviews', 'PRs', 'issues', 'notifications']),
    },
  }),
  target({
    id: 'gitlab', label: 'GitLab', family: 'work', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Development pulse', ['activity', 'reviews'], ['activity count']),
      compact: compact('Activity pulse', ['graph', 'count', 'streak'], ['activity graph']),
      standard: standard('Activity and review pulse', ['graph', 'count', 'streak'], ['large activity graph'], ['merge requests', 'to-dos']),
      full: full('Complete GitLab pulse', ['graph', 'count', 'streak'], ['expanded activity graph'], ['review asks', 'merge requests', 'to-dos']),
    },
  }),
  target({
    id: 'jira', label: 'Jira', family: 'work', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Issue pressure', ['assigned', 'due'], ['status counts']),
      compact: compact('Issue pressure', ['assigned', 'due'], ['status distribution']),
      standard: standard('Prioritized issues', ['issue key', 'summary', 'status'], ['priority lane'], ['due state']),
      full: full('Issue workload', ['issue key', 'summary', 'status'], ['status distribution'], ['assignee', 'due', 'priority']),
    },
  }),
  target({
    id: 'vercel', label: 'Vercel', family: 'work', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Deployment health', ['state', 'project'], ['health mark']),
      compact: compact('Latest deployment', ['state', 'project'], ['deployment state']),
      standard: standard('Deployment timeline', ['project', 'state', 'age'], ['deployment rail']),
      full: full('Deployment portfolio', ['project', 'state', 'age'], ['multi-project timeline'], ['branch', 'duration']),
    },
  }),
  target({
    id: 'status', label: 'Service Status', family: 'work', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'error'],
    budgets: {
      docked: dock('Service health', ['service state'], ['named status']),
      compact: compact('Service health', ['service names', 'states'], ['status line']),
      standard: standard('Named service health', ['service names', 'states'], ['service matrix'], ['incident context']),
    },
  }),
  target({
    id: 'linear', label: 'Linear', family: 'work', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Assigned work', ['assigned', 'due'], ['cycle count']),
      compact: compact('Assigned work', ['assigned', 'due'], ['cycle progress']),
      standard: standard('Prioritized work', ['issue id', 'title', 'state'], ['cycle lane']),
      full: full('Team workload', ['issue id', 'title', 'state'], ['cycle progress'], ['team', 'priority', 'due']),
    },
  }),
  target({
    id: 'sentry', label: 'Sentry', family: 'work', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Error pressure', ['unresolved', 'top issue'], ['severity count']),
      compact: compact('Error pressure', ['unresolved', 'top issue'], ['severity mark']),
      standard: standard('Unresolved issues', ['issue', 'events', 'age'], ['severity lane']),
      full: full('Error workload', ['issue', 'events', 'age'], ['severity distribution'], ['project', 'owner', 'fingerprint']),
    },
  }),
  target({
    id: 'todoist', label: 'Todoist', family: 'work', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Due work', ['due', 'overdue'], ['task count']),
      compact: compact('Due work', ['due', 'overdue'], ['completion progress']),
      standard: standard('Due task sections', ['task', 'due state'], ['today and overdue lanes']),
      full: full('Task workload', ['task', 'due state'], ['project lanes'], ['priority', 'project', 'completion']),
    },
  }),
  target({
    id: 'readingList', label: 'Reading List', family: 'resources', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'permission', 'error'],
    budgets: {
      docked: dock('Reading queue', ['unread count', 'newest title'], ['queue count']),
      compact: compact('Reading queue', ['unread count', 'newest title'], ['queue lead']),
      standard: standard('Unread queue', ['title', 'domain'], ['bounded reading list']),
      full: full('Reading library', ['title', 'domain', 'state'], ['unread and recent lanes'], ['age', 'read action']),
    },
  }),
  target({
    id: 'recentlyClosed', label: 'Recently Closed', family: 'resources', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'partial', 'permission', 'error'],
    budgets: {
      docked: dock('Restore recent work', ['count', 'latest type'], ['restore cue']),
      compact: compact('Latest closed item', ['title', 'type', 'age'], ['restore cue']),
      standard: standard('Recent sessions', ['title', 'type', 'age'], ['session list']),
      full: full('Restorable sessions', ['title', 'type', 'age'], ['tab, group, and window lanes'], ['item counts']),
    },
  }),
  target({
    id: 'downloads', label: 'Downloads', family: 'resources', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'partial', 'permission', 'error'],
    budgets: {
      docked: dock('Download activity', ['active count', 'latest file'], ['progress']),
      compact: compact('Current download', ['filename', 'state'], ['progress bar']),
      standard: standard('Download activity', ['filename', 'state', 'progress'], ['active and recent lanes']),
      full: full('Download history', ['filename', 'state', 'progress'], ['state timeline'], ['size', 'source']),
    },
  }),
  target({
    id: 'tabGroups', label: 'Tab Groups', family: 'resources', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'partial', 'permission', 'error'],
    budgets: {
      docked: dock('Browser workspaces', ['group count', 'first group'], ['group mark']),
      compact: compact('Browser workspaces', ['group count', 'first group'], ['group mark']),
      standard: standard('Open workspaces', ['group name', 'tab count'], ['group lanes']),
      full: full('Window workspaces', ['window', 'group name', 'tab count'], ['window map'], ['group colors']),
    },
  }),
  target({
    id: 'homeassistant', label: 'Home Assistant', family: 'resources', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Home state', ['entity', 'state'], ['entity state']),
      compact: compact('Primary home state', ['entity', 'state'], ['large entity value']),
      standard: standard('Selected home states', ['entity', 'state'], ['room strip'], ['actions']),
      full: full('Home control overview', ['entity', 'state'], ['room composition'], ['actions', 'updated time']),
    },
  }),
  target({
    id: 'rss', label: 'Headlines', family: 'resources', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard', 'full'], stackTiers: ['compact', 'standard', 'full'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Top headline', ['headline', 'source'], ['headline lead']),
      compact: compact('Top headline', ['headline', 'source'], ['headline lead']),
      standard: standard('Selected headlines', ['headline', 'source'], ['editorial list']),
      full: full('Headline briefing', ['headline', 'source'], ['lead and supporting stories'], ['age']),
    },
  }),
  target({
    id: 'crypto', label: 'Crypto', family: 'resources', presentation: 'framed',
    tiers: ['docked', 'compact', 'standard'], stackTiers: ['compact', 'standard'], primaryTier: 'standard', states: ['loading', 'empty', 'stale', 'partial', 'setup', 'error'],
    budgets: {
      docked: dock('Primary quote', ['symbol', 'price', 'change'], ['quote movement']),
      compact: compact('Primary quote', ['symbol', 'price', 'change'], ['price movement']),
      standard: standard('Selected market board', ['symbol', 'price', 'change'], ['dense quote tape'], ['sparkline']),
    },
  }),
])

export const MIXED_STACKS = Object.freeze([
  Object.freeze({ id: 'weather-on-this-day', tier: 'standard', members: Object.freeze(['weather', 'onThisDay']) }),
  Object.freeze({ id: 'github-calendar', tier: 'full', members: Object.freeze(['github', 'calendar']) }),
  Object.freeze({ id: 'tasks-notes', tier: 'compact', members: Object.freeze(['tasks', 'notes']) }),
  Object.freeze({ id: 'clock-quote', tier: 'standard', members: Object.freeze(['clock', 'quote']) }),
  Object.freeze({ id: 'jira-sentry', tier: 'full', members: Object.freeze(['jira', 'sentry']) }),
])
