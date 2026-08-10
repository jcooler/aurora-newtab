import { useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { QuickLink } from '../../../lib/storage/schema'
import { addLink, moveLink, normalizeUrl, removeLink } from './linksLogic'
import LinkTile from './LinkTile'

export default function LinksWidget() {
  const [settings] = useStoredKey('settings')
  const [links] = useStoredKey('links')
  const storage = useStorage()
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(false)
  const dragFrom = useRef<number | null>(null)

  if (!settings?.widgets.links || links === undefined) return null

  const update = (fn: (l: QuickLink[]) => QuickLink[]) =>
    void storage.update('links', fn)

  return (
    <section
      aria-label="Quick links"
      className="mt-10 mid:mt-5 short:mt-3 xshort:mt-1 flex flex-wrap items-start justify-center gap-3 short:gap-2 xshort:gap-1"
    >
      {links.map((link, i) => (
        <LinkTile
          key={link.id}
          link={link}
          index={i}
          count={links.length}
          onMove={(from, to) => update((l) => moveLink(l, from, to))}
          onRemove={(id) => update((l) => removeLink(l, id))}
          onDragStart={(i2) => (dragFrom.current = i2)}
          onDropOn={(to) => {
            if (dragFrom.current !== null) update((l) => moveLink(l, dragFrom.current!, to))
            dragFrom.current = null
          }}
          onDragEnd={() => (dragFrom.current = null)}
        />
      ))}
      {adding ? (
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            const url = String(data.get('url') ?? '').trim()
            const normalized = normalizeUrl(url)
            if (!normalized) {
              setAddError(true)
              return
            }
            update((l) => addLink(l, String(data.get('title') ?? ''), url))
            setAdding(false)
            setAddError(false)
          }}
        >
          <input name="title" placeholder="Title" aria-label="Link title" autoFocus className="w-28 border-b border-panel-border bg-transparent text-sm text-fg outline-none focus-visible:border-accent" />
          <input name="url" placeholder="example.com" aria-label="Link URL" className="w-28 border-b border-panel-border bg-transparent text-sm text-fg outline-none focus-visible:border-accent" />
          {addError && <p className="text-xs text-fg-muted">Enter a valid address.</p>}
          <div className="flex gap-2 text-xs">
            <button type="submit" className="text-accent focus-visible:outline-2 focus-visible:outline-accent">Add</button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setAddError(false)
              }}
              className="text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          aria-label="Add quick link"
          onClick={() => setAdding(true)}
          className="flex size-12 items-center justify-center rounded-panel border border-dashed border-panel-border text-xl text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          +
        </button>
      )}
    </section>
  )
}
