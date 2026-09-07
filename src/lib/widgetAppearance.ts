import { isPlainObject } from './object'

export const GRAPH_COLOR_CHOICES = {
  github: ['blue', 'green', 'purple', 'amber'],
  gitlab: ['orange', 'blue', 'green'],
} as const
export type GraphColor = 'blue' | 'green' | 'purple' | 'amber' | 'orange'
export interface GraphColors {
  github: typeof GRAPH_COLOR_CHOICES.github[number]
  gitlab: typeof GRAPH_COLOR_CHOICES.gitlab[number]
}
export const DEFAULT_GRAPH_COLORS: Readonly<GraphColors> = Object.freeze({ github: 'blue', gitlab: 'orange' })
export const GRAPH_PALETTES: Readonly<Record<GraphColor, string>> = Object.freeze({
  blue: '#7dc9ff', green: '#71cd8b', purple: '#be9bf2', amber: '#ecc576', orange: '#f4ad7d',
})
export function isGraphColors(value: unknown): value is GraphColors {
  return isPlainObject(value)
    && Object.keys(value).every(key => key === 'github' || key === 'gitlab')
    && GRAPH_COLOR_CHOICES.github.some(color => color === value.github)
    && GRAPH_COLOR_CHOICES.gitlab.some(color => color === value.gitlab)
}
