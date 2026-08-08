import { useState } from 'react'
import type { QuickLink } from '../../../lib/storage/schema'
import { faviconUrl } from './linksLogic'

export default function LinkTile({
  link,
  index,
  count,
  onMove,
  onRemove,
  onDragStart,
  onDropOn,
  onDragEnd,
}: {
  link: QuickLink
  index: number
  count: number
  onMove: (from: number, to: number) => void
  onRemove: (id: string) => void
  onDragStart: (index: number) => void
  onDropOn: (index: number) => void
  onDragEnd: () => void
}) {
  const [iconFailed, setIconFailed] = useState(false)
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDropOn(index)}
      onDragEnd={onDragEnd}
      className="group relative flex w-20 flex-col items-center gap-1 short:gap-0.5 xshort:gap-0.5"
    >
      <a
        href={link.url}
        onKeyDown={(e) => {
          // Keyboard reorder: Alt+Arrow moves the tile
          if (e.altKey && e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault()
            onMove(index, index - 1)
          } else if (e.altKey && e.key === 'ArrowRight' && index < count - 1) {
            e.preventDefault()
            onMove(index, index + 1)
          }
        }}
        className="flex size-12 short:size-10 xshort:size-9 items-center justify-center rounded-panel border border-panel-border bg-panel-solid shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] transition group-hover:border-accent focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        {iconFailed ? (
          <span aria-hidden className="text-lg text-fg-muted">
            {link.title.charAt(0).toUpperCase()}
          </span>
        ) : (
          <img
            src={faviconUrl(link.url)}
            alt=""
            width={20}
            height={20}
            onError={() => setIconFailed(true)}
          />
        )}
      </a>
      <span className="text-photo max-w-full truncate text-xs text-fg-muted">{link.title}</span>
      <button
        type="button"
        aria-label={`Remove ${link.title}`}
        onClick={() => onRemove(link.id)}
        className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-panel-solid text-xs text-fg-muted opacity-0 transition hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
      >
        ×
      </button>
    </div>
  )
}
