import type { ConnectorDescriptor, ConnectorId } from '../../services/connectors/types'
import { CATEGORY_LABELS } from '../../services/connectors/types'

export interface ConnectorExperience {
  mark: string
  outcome: string
  benefits: readonly [string, string, string]
  privacySummary: string
  categoryLabel: string
  entitlement: 'included' | 'premium'
}

type ConnectorExperienceBase = Omit<ConnectorExperience, 'categoryLabel' | 'entitlement'>

const EXPERIENCES: Record<ConnectorId, ConnectorExperienceBase> = {
  rss: {
    mark: 'R',
    outcome: 'Bring the latest stories from the feeds you choose onto your canvas.',
    benefits: ['Follow up to five HTTPS feeds', 'Choose how many headlines appear', 'Open every story at its trusted source'],
    privacySummary: 'Tab Two requests only the public feed addresses you add and keeps the resulting snapshot in this Chrome profile.',
  },
  github: {
    mark: 'GH',
    outcome: 'Keep contributions, reviews, issues, and notifications visible while you work.',
    benefits: ['See your contribution activity', 'Watch review and issue workload', 'Choose the GitHub views that matter'],
    privacySummary: 'Your GitHub token stays in this Chrome profile and is removed from Tab Two backup exports.',
  },
  gitlab: {
    mark: 'GL',
    outcome: 'See merge requests, review asks, todos, and activity from your GitLab account.',
    benefits: ['Support GitLab.com or your instance', 'Keep review requests in view', 'Choose the activity sections you need'],
    privacySummary: 'Your GitLab token and instance connection stay in this Chrome profile and secrets are excluded from backups.',
  },
  jira: {
    mark: 'J',
    outcome: 'Keep assigned work, due items, and priority changes close without opening Jira.',
    benefits: ['See issues assigned to you', 'Prioritize due and urgent work', 'Choose the issue views shown on canvas'],
    privacySummary: 'Your Jira token and site connection stay in this Chrome profile and are excluded from exported backups.',
  },
  vercel: {
    mark: '▲',
    outcome: 'Know when your latest deployments succeed or need your attention.',
    benefits: ['See failed deployments first', 'Keep recent production state visible', 'Open the relevant deployment quickly'],
    privacySummary: 'Your Vercel token stays in this Chrome profile and is removed from Tab Two backup exports.',
  },
  crypto: {
    mark: '₿',
    outcome: 'Follow the market prices and daily movement of the coins you choose.',
    benefits: ['Choose a focused watch list', 'See price and daily movement', 'Refresh public market data on your schedule'],
    privacySummary: 'Crypto uses public market data and stores only your selected coin list in this Chrome profile.',
  },
  ics: {
    mark: '31',
    outcome: 'Bring upcoming events from the private calendar feeds you select into one agenda.',
    benefits: ['Combine multiple calendar feeds', 'Keep source colors on the agenda', 'Choose agenda and per-calendar views'],
    privacySummary: 'Calendar feed addresses can grant access to private events, so Tab Two keeps them local and removes them from backups.',
  },
  status: {
    mark: '●',
    outcome: 'See whether the services you rely on are healthy before an outage surprises you.',
    benefits: ['Watch selected public status pages', 'See healthy and degraded state', 'Open provider context when needed'],
    privacySummary: 'Service Status requests only the public status addresses you select and stores its snapshot in this Chrome profile.',
  },
  homeassistant: {
    mark: '⌂',
    outcome: 'See and control the Home Assistant entities you deliberately place on your canvas.',
    benefits: ['Choose individual entity readings', 'Expose only selected safe actions', 'Keep the connection inside your profile'],
    privacySummary: 'Your Home Assistant address and token stay in this Chrome profile and secret values are excluded from backups.',
  },
  linear: {
    mark: 'L',
    outcome: 'Keep assigned Linear issues and the work most likely to need you in view.',
    benefits: ['See work assigned to you', 'Limit results to selected teams', 'Choose a concise issue count'],
    privacySummary: 'Your Linear token stays in this Chrome profile and is removed from Tab Two backup exports.',
  },
  sentry: {
    mark: 'S',
    outcome: 'See unresolved application issues before they disappear into another tab.',
    benefits: ['Watch unresolved issues', 'Limit results to selected projects', 'Open the relevant Sentry issue'],
    privacySummary: 'Your Sentry token and organization stay in this Chrome profile and secret values are excluded from backups.',
  },
  todoist: {
    mark: '✓',
    outcome: 'Keep today’s Todoist work visible and complete tasks from your canvas.',
    benefits: ['See active Todoist tasks', 'Limit the view to selected projects', 'Complete work without another dashboard'],
    privacySummary: 'Your Todoist token stays in this Chrome profile and is removed from Tab Two backup exports.',
  },
  onThisDay: {
    mark: '◷',
    outcome: 'Add one trustworthy historical moment for today without creating another feed.',
    benefits: ['Use today’s local date', 'Read concise historical context', 'Continue at the trusted Wikipedia source'],
    privacySummary: 'Tab Two sends only today’s month and day to English Wikipedia and stores no account information.',
  },
  publicHolidays: {
    mark: '☆',
    outcome: 'Keep upcoming national holidays visible for the country you select.',
    benefits: ['Choose one supported country', 'See the next official holidays', 'Keep holiday context beside your agenda'],
    privacySummary: 'Tab Two requests public holiday data for your selected country and stores no account information.',
  },
  auroraKp: {
    mark: 'Kp',
    outcome: 'See current aurora conditions and the near-term geomagnetic forecast at a glance.',
    benefits: ['Read the current Kp level', 'See the forecast trend', 'Use public NOAA space-weather data'],
    privacySummary: 'Geomagnetic conditions use public NOAA data and require no account, token, or personal information.',
  },
  googleCalendar: {
    mark: '31',
    outcome: 'Bring selected Google calendars into one calm, read-only schedule.',
    benefits: ['Combine more than one Google account', 'Keep Google calendar colors', 'See events without changing them'],
    privacySummary: 'Event details go directly from Google to this browser; local selections and cache stay out of Tab Two backup and encrypted sync.',
  },
}

export function connectorExperience(descriptor: ConnectorDescriptor): ConnectorExperience {
  return {
    ...EXPERIENCES[descriptor.id],
    categoryLabel: CATEGORY_LABELS[descriptor.category],
    entitlement: descriptor.id === 'googleCalendar' ? 'premium' : 'included',
  }
}
