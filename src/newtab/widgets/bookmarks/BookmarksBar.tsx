import { useEffect, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import {
  hasBookmarksPermission,
  loadBarModel,
  type BarModel,
  type BookmarkFolder,
  type BookmarkItem,
} from '../../../services/bookmarks'
import { faviconUrl } from '../links/linksLogic'
import FolderPopover, { FolderIcon } from './FolderPopover'

const MAX_VISIBLE_CHIPS = 8
const OVERFLOW_ID = '__overflow__'
const CHIP =
  'flex shrink-0 items-center gap-1.5 rounded-full border border-panel-border px-2.5 py-1 text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent'

type ChipEntry = { kind: 'folder'; folder: BookmarkFolder } | { kind: 'bookmark'; item: BookmarkItem }

export default function BookmarksBar() {
  // Gate BEFORE the model-loading effect exists: disabled tabs (the default —
  // settings.widgets.bookmarks starts false) never call chrome.bookmarks at
  // all. Only useStoredKey is called out here, so Rules of Hooks stay
  // satisfied regardless of the toggle.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.bookmarks) return null
  return <BookmarksBarInner />
}

function BookmarksBarInner() {
  const [model, setModel] = useState<BarModel | null>(null)
  // One popover open at a time: a folder chip's id, or OVERFLOW_ID, or null.
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // The widget can be on in settings while the permission itself is
    // absent — never granted (optional permissions aren't auto-granted at
    // install), or revoked later via chrome://extensions. Check before
    // calling loadBarModel(): chrome.bookmarks doesn't exist at all without
    // it, so calling straight into chrome.bookmarks.getTree() would throw.
    void hasBookmarksPermission().then((granted) => {
      if (!granted || !live) return
      void loadBarModel().then((m) => {
        if (live) setModel(m)
      })
    })
    return () => {
      live = false
    }
  }, [])

  // Empty bookmarks bar (including "still loading") renders nothing — no
  // empty-state chrome.
  if (!model || (model.folders.length === 0 && model.loose.length === 0)) return null

  const allChips: ChipEntry[] = [
    ...model.folders.map((folder): ChipEntry => ({ kind: 'folder', folder })),
    ...model.loose.map((item): ChipEntry => ({ kind: 'bookmark', item })),
  ]
  const overflowing = allChips.length > MAX_VISIBLE_CHIPS
  const visible = overflowing ? allChips.slice(0, MAX_VISIBLE_CHIPS) : allChips
  const overflow = overflowing ? allChips.slice(MAX_VISIBLE_CHIPS) : []

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id))

  return (
    <nav
      aria-label="Bookmarks bar"
      // z-20 normally (below TodoPanel/TimerWidget's z-30 panels, same as
      // before this widget existed) but z-50 ONLY while a popover is open —
      // level with FolderPopover's own panel, and above its z-40 backdrop.
      // Scoped to `openId` rather than permanent: the backdrop only exists
      // (and only needs outranking) while a popover is actually open: that's
      // when it would otherwise sit on top of the bar and swallow clicks
      // meant for a DIFFERENT chip, breaking "click another chip to switch
      // popovers directly" (one popover open at a time is still enforced by
      // openId being a single value regardless of z-index). Left permanently
      // at z-50, the bar would instead render on top of TodoPanel/TimerWidget
      // whenever they geometrically overlap even with no popover open — a
      // stacking regression against those pre-existing widgets.
      className={`flex max-w-[52vw] flex-wrap items-center justify-center gap-1.5 ${
        openId ? 'z-50' : 'z-20'
      }`}
    >
      {visible.map((chip) =>
        chip.kind === 'folder' ? (
          <div key={chip.folder.id} className="relative">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={openId === chip.folder.id}
              onClick={() => toggle(chip.folder.id)}
              className={CHIP}
            >
              <FolderIcon />
              <span className="max-w-32 truncate">{chip.folder.title}</span>
            </button>
            {openId === chip.folder.id && (
              <FolderPopover
                title={chip.folder.title}
                items={chip.folder.items}
                folders={chip.folder.folders}
                onClose={() => setOpenId(null)}
              />
            )}
          </div>
        ) : (
          <a key={chip.item.id} href={chip.item.url} className={CHIP}>
            <img src={faviconUrl(chip.item.url)} alt="" width={12} height={12} className="shrink-0" />
            <span className="max-w-32 truncate">{chip.item.title}</span>
          </a>
        ),
      )}
      {overflow.length > 0 && (
        <div className="relative">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openId === OVERFLOW_ID}
            aria-label="More bookmarks"
            onClick={() => toggle(OVERFLOW_ID)}
            className={CHIP}
          >
            »
          </button>
          {openId === OVERFLOW_ID && (
            <FolderPopover
              title="More"
              items={overflow.flatMap((c) => (c.kind === 'bookmark' ? [c.item] : []))}
              folders={overflow.flatMap((c) => (c.kind === 'folder' ? [c.folder] : []))}
              onClose={() => setOpenId(null)}
            />
          )}
        </div>
      )}
    </nav>
  )
}
