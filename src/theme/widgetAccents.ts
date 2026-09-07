import { contrastRatio } from '../lib/color'
export const WIDGET_STATUS_COLORS = Object.freeze({ positive: '#6ee7b7', danger: '#f87171', warning: '#fbbf24', info: '#93c5fd' })

export const WIDGET_ACCENTS = Object.freeze({
  weather: '#ffd48a', ics: '#87bffc', monthCal: '#89c4fb', sun: '#f6c77e', moon: '#c5c6ee',
  quote: '#e6d4b0', clock: '#b6d6df', greeting: '#cde0b9', worldClocks: '#9fcbd2', countdown: '#e0b1cf',
  search: '#b1c8f4', focus: '#a4d7b8', links: '#97c7f4', habits: '#a5dba5', bookmarks: '#ddb581',
  status: '#8adcb6', github: '#7dc9ff', gitlab: '#f4ad7d', jira: '#8fb6ff', vercel: '#b5dbba',
  homeassistant: '#7cd3ef', rss: '#edb78d', crypto: '#e3c57c', readingList: '#b3d3b6', recentlyClosed: '#a4bff4',
  downloads: '#99d1e1', tabGroups: '#c6acf0', timer: '#a7dabb', tasks: '#adcf9c', notes: '#e5cb80',
  linear: '#b7adff', sentry: '#e6a2ad', todoist: '#f0a49b', onThisDay: '#d9c298', publicHolidays: '#dfa9c5',
  auroraKp: '#a0e0c3', progress: '#a3d6b6', metrics: '#86cdda',
})

/** Preserve hue when possible, moving toward the higher-contrast endpoint only
 * as far as needed. This changes the accent, never the selected panel or ink. */
export function panelAccent(accent: string, panel: string): string {
  if (contrastRatio(accent, panel) >= 4.5) return accent
  const endpoint = contrastRatio('#000000', panel) >= contrastRatio('#ffffff', panel) ? 0 : 255
  const channels = [1, 3, 5].map(start => Number.parseInt(accent.slice(start, start + 2), 16))
  for (let step = 1; step <= 100; step++) {
    const adjusted = '#' + channels.map(channel => Math.round(channel + (endpoint - channel) * step / 100).toString(16).padStart(2, '0')).join('')
    if (contrastRatio(adjusted, panel) >= 4.5) return adjusted
  }
  return endpoint === 0 ? '#000000' : '#ffffff'
}
