import { useId, useState } from 'react'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import type { AuroraStorage } from '../../lib/storage'
import { DEFAULT_GRAPH_COLORS, GRAPH_COLOR_CHOICES, GRAPH_PALETTES, isGraphColors } from '../../lib/widgetAppearance'

export default function GraphAppearanceControl({ connector, storage }: { connector: 'github' | 'gitlab'; storage: AuroraStorage }) {
  const [settings] = useStoredKey('settings')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const id = useId()
  const color = settings?.graphColors?.[connector] ?? DEFAULT_GRAPH_COLORS[connector]
  return (
    <div className="mt-4 border-t border-panel-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">{connector === 'github' ? 'Contribution color' : 'Activity color'}</label>
        <select id={id} value={color} disabled={!settings || saving} className="rounded-lg border border-panel-border bg-panel px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent" onChange={(event) => {
          const nextColor = event.target.value
          setError(false)
          setSaving(true)
          void storage.update('settings', current => {
            const graphColors = { ...DEFAULT_GRAPH_COLORS, ...current.graphColors, [connector]: nextColor }
            return isGraphColors(graphColors) ? { ...current, graphColors } : current
          }).catch(() => setError(true)).finally(() => setSaving(false))
        }}>
          {GRAPH_COLOR_CHOICES[connector].map(choice => <option key={choice} value={choice}>{choice[0].toUpperCase() + choice.slice(1)}</option>)}
        </select>
      </div>
      <div aria-hidden className="mt-2 flex gap-1">
        {[20, 40, 60, 80, 100].map(level => <span key={level} className="size-3 rounded-[1px]" style={{ background: `var(--graph-palette-${color}, ${GRAPH_PALETTES[color]})`, opacity: level / 100 }} />)}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-fg">Could not save the color. Please try again.</p> : null}
    </div>
  )
}
