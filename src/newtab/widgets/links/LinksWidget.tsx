import { useEffect, useId, useRef, useState } from 'react'
import { AssertiveAlert } from '../../../components/StateFeedback'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useStorage } from '../../../lib/storage/context'
import type { QuickLink } from '../../../lib/storage/schema'
import { addLink, moveLink, normalizeUrl, removeLink } from './linksLogic'
import LinkTile from './LinkTile'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { WidgetPresentationMode } from '../../widgetRenderers'
import TierFrame from '../shared/TierFrame'

export default function LinksWidget({
  canvasSize = 'standard',
  presentation = 'free',
}: {
  canvasSize?: CanvasSize
  presentation?: WidgetPresentationMode
} = {}) {
  const [settings] = useStoredKey('settings')
  const [links] = useStoredKey('links')
  const storage = useStorage()
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [linkPage, setLinkPage] = useState(0)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const restoreAddFocus = useRef(false)
  const addErrorId = useId()
  const dragFrom = useRef<number | null>(null)

  useEffect(() => {
    if (adding || !restoreAddFocus.current) return
    restoreAddFocus.current = false
    addButtonRef.current?.focus()
  }, [adding])

  if (!settings?.widgets.links || links === undefined) return null

  const update = (fn: (l: QuickLink[]) => QuickLink[]) =>
    void storage.update('links', fn)

  function openEditor() {
    setTitle('')
    setUrl('')
    setAddError(false)
    setAdding(true)
  }

  function closeEditor() {
    restoreAddFocus.current = true
    setAdding(false)
    setAddError(false)
    setTitle('')
    setUrl('')
  }

  if (presentation === 'stack') {
    const pageCount = Math.max(1, Math.ceil(links.length / 6))
    const safePage = Math.min(linkPage, pageCount - 1)
    const pageStart = safePage * 6
    const visibleLinks = links.slice(pageStart, pageStart + 6)
    return (
      <TierFrame
        label="Quick links"
        tier={canvasSize}
        state={links.length === 0 ? 'empty' : 'ready'}
        data-links-layout={canvasSize === 'standard' ? '2x3' : 'marks'}
        className={`core-links-stack core-links-stack--${canvasSize}`}
      >
        <div className="core-links-stack__heading">
          <span>Quick links</span>
          {!adding ? (
            <div className="core-links-stack__heading-actions">
              {pageCount > 1 ? (
                <>
                  <button type="button" aria-label="Previous quick links" onClick={() => setLinkPage((safePage - 1 + pageCount) % pageCount)}>‹</button>
                  <span>{safePage + 1}/{pageCount}</span>
                  <button type="button" aria-label="Next quick links" onClick={() => setLinkPage((safePage + 1) % pageCount)}>›</button>
                </>
              ) : null}
              <button
                ref={addButtonRef}
                type="button"
                aria-label="Add quick link"
                onClick={openEditor}
                className="core-links-stack__add focus-visible:outline-2 focus-visible:outline-accent"
              >+</button>
            </div>
          ) : null}
        </div>
        {adding ? (
          <form
            className="core-links-stack__editor"
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              closeEditor()
            }}
            onSubmit={(e) => {
              e.preventDefault()
              const normalized = normalizeUrl(url)
              if (!normalized) {
                setAddError(true)
                urlInputRef.current?.focus()
                return
              }
              update((l) => addLink(l, title, url))
              closeEditor()
            }}
          >
            <input name="title" placeholder="Title" aria-label="Link title" autoFocus value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
            <input
              ref={urlInputRef}
              name="url"
              placeholder="example.com"
              aria-label="Link URL"
              aria-invalid={addError ? 'true' : undefined}
              aria-describedby={addError ? addErrorId : undefined}
              value={url}
              onChange={(e) => {
                setUrl(e.currentTarget.value)
                setAddError(false)
              }}
            />
            <AssertiveAlert id={addErrorId}>{addError ? 'Enter a valid address.' : null}</AssertiveAlert>
            <div>
              <button type="submit">Add</button>
              <button type="button" onClick={closeEditor}>Cancel</button>
            </div>
          </form>
        ) : links.length === 0 ? (
          <button type="button" onClick={openEditor} className="core-links-stack__empty">Add the first place you open every day.</button>
        ) : (
          <div className="core-links-stack__grid">
            {visibleLinks.map((link, i) => {
              const absoluteIndex = pageStart + i
              return (
              <LinkTile
                key={link.id}
                link={link}
                index={absoluteIndex}
                count={links.length}
                presentation="stack"
                canvasSize={canvasSize}
                onMove={(from, to) => update((l) => moveLink(l, from, to))}
                onRemove={(id) => update((l) => removeLink(l, id))}
                onDragStart={(i2) => (dragFrom.current = i2)}
                onDropOn={(to) => {
                  if (dragFrom.current !== null) update((l) => moveLink(l, dragFrom.current!, to))
                  dragFrom.current = null
                }}
                onDragEnd={() => (dragFrom.current = null)}
              />
              )
            })}
          </div>
        )}
      </TierFrame>
    )
  }

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
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            e.preventDefault()
            closeEditor()
          }}
          onSubmit={(e) => {
            e.preventDefault()
            const normalized = normalizeUrl(url)
            if (!normalized) {
              setAddError(true)
              urlInputRef.current?.focus()
              return
            }
            update((l) => addLink(l, title, url))
            closeEditor()
          }}
        >
          <input
            name="title"
            placeholder="Title"
            aria-label="Link title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            className="min-h-9 w-28 border-b border-panel-border bg-transparent text-sm text-fg outline-none focus-visible:border-accent"
          />
          <input
            ref={urlInputRef}
            name="url"
            placeholder="example.com"
            aria-label="Link URL"
            aria-invalid={addError ? 'true' : undefined}
            aria-describedby={addError ? addErrorId : undefined}
            value={url}
            onChange={(e) => {
              setUrl(e.currentTarget.value)
              setAddError(false)
            }}
            className="min-h-9 w-28 border-b border-panel-border bg-transparent text-sm text-fg outline-none focus-visible:border-accent"
          />
          <AssertiveAlert id={addErrorId} className="text-xs text-fg-muted">
            {addError ? 'Enter a valid address.' : null}
          </AssertiveAlert>
          <div className="flex gap-2 text-xs">
            <button type="submit" className="inline-flex min-h-9 min-w-9 items-center justify-center text-accent focus-visible:outline-2 focus-visible:outline-accent">Add</button>
            <button
              type="button"
              onClick={closeEditor}
              className="inline-flex min-h-9 min-w-9 items-center justify-center text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={addButtonRef}
          type="button"
          aria-label="Add quick link"
          onClick={openEditor}
          className="flex size-12 items-center justify-center rounded-panel border border-dashed border-panel-border text-xl text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          +
        </button>
      )}
    </section>
  )
}
