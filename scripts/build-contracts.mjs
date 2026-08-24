export function assertCleanTrackedStatus(status) {
  if (typeof status !== 'string' || status.trim().length > 0) {
    throw new Error('Aurora attributable builds require a clean tracked worktree')
  }
}

const EXACT_BUILD_GENERATED_EVIDENCE = new Set([
  'docs/superpowers/catalog/widget-redesign/production/clock-quote-dark-clock.png',
  'docs/superpowers/catalog/widget-redesign/production/clock-quote-dark-quote.png',
  'docs/superpowers/catalog/widget-redesign/production/clock-quote-light-clock.png',
  'docs/superpowers/catalog/widget-redesign/production/clock-quote-light-quote.png',
  'docs/superpowers/catalog/widget-redesign/production/clock-quote-saturated-clock.png',
  'docs/superpowers/catalog/widget-redesign/production/clock-quote-saturated-quote.png',
  'docs/superpowers/catalog/widget-redesign/production/evidence.json',
  'docs/superpowers/catalog/widget-redesign/production/github-calendar-dark-calendar.png',
  'docs/superpowers/catalog/widget-redesign/production/github-calendar-dark-github.png',
  'docs/superpowers/catalog/widget-redesign/production/github-calendar-light-calendar.png',
  'docs/superpowers/catalog/widget-redesign/production/github-calendar-light-github.png',
  'docs/superpowers/catalog/widget-redesign/production/github-calendar-saturated-calendar.png',
  'docs/superpowers/catalog/widget-redesign/production/github-calendar-saturated-github.png',
  'docs/superpowers/catalog/widget-redesign/production/jira-sentry-dark-jira.png',
  'docs/superpowers/catalog/widget-redesign/production/jira-sentry-dark-sentry.png',
  'docs/superpowers/catalog/widget-redesign/production/jira-sentry-light-jira.png',
  'docs/superpowers/catalog/widget-redesign/production/jira-sentry-light-sentry.png',
  'docs/superpowers/catalog/widget-redesign/production/jira-sentry-saturated-jira.png',
  'docs/superpowers/catalog/widget-redesign/production/jira-sentry-saturated-sentry.png',
  'docs/superpowers/catalog/widget-redesign/production/owner-visible-canvas-clock-edit.png',
  'docs/superpowers/catalog/widget-redesign/production/owner-visible-canvas.png',
  'docs/superpowers/catalog/widget-redesign/production/tasks-notes-dark-notes.png',
  'docs/superpowers/catalog/widget-redesign/production/tasks-notes-dark-tasks.png',
  'docs/superpowers/catalog/widget-redesign/production/tasks-notes-light-notes.png',
  'docs/superpowers/catalog/widget-redesign/production/tasks-notes-light-tasks.png',
  'docs/superpowers/catalog/widget-redesign/production/tasks-notes-saturated-notes.png',
  'docs/superpowers/catalog/widget-redesign/production/tasks-notes-saturated-tasks.png',
  'docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-dark-onThisDay.png',
  'docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-dark-weather.png',
  'docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-light-onThisDay.png',
  'docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-light-weather.png',
  'docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-saturated-onThisDay.png',
  'docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-saturated-weather.png',
  'docs/superpowers/qa/ui-recovery/acceptance/calendar-settings-close.png',
  'docs/superpowers/qa/ui-recovery/acceptance/calendar-settings.png',
  'docs/superpowers/qa/ui-recovery/acceptance/canvas-1408x445.png',
  'docs/superpowers/qa/ui-recovery/acceptance/canvas-1600x900.png',
  'docs/superpowers/qa/ui-recovery/acceptance/evidence.json',
  'docs/superpowers/qa/ui-recovery/github-tiers/evidence.json',
  'docs/superpowers/qa/ui-recovery/github-tiers/github-compact.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/github-full.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/github-standard.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/gitlab-compact.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/gitlab-full.png',
  'docs/superpowers/qa/ui-recovery/github-tiers/gitlab-standard.png',
])

export function assertExactBuildTrackedStatus(status) {
  if (typeof status !== 'string') {
    throw new Error('Exact-build QA requires tracked inputs to match HEAD')
  }

  const dirtyPaths = status
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((entry) => entry.slice(3).split(' -> '))
  const unexpected = dirtyPaths.filter((path) => !EXACT_BUILD_GENERATED_EVIDENCE.has(path))
  if (unexpected.length > 0) {
    throw new Error(`Exact-build QA requires tracked inputs to match HEAD: ${unexpected.join(', ')}`)
  }
}
