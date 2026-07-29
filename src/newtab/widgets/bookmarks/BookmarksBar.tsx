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

export default function BookmarksBar({
  onPopoverOpenChange,
}: {
  // Bookmarks-stacking bug fix, part 2: notifies App.tsx whenever a
  // popover opens/closes (see the `toggle`/`setOpen` helper below for why
  // this needs to be told, not just observed via a ref/effect). App.tsx
  // mirrors this into a bit of state it uses to conditionally elevate the
  // bookmarks PositionedBlock WRAPPER's own z-index — see the long comment
  // on that PositionedBlock in App.tsx for the full stacking-context
  // writeup on why the wrapper itself (not just this nav) needs to move.
  // Optional so every existing call site/test that doesn't care about this
  // (nothing before this fix did) keeps compiling unchanged.
  onPopoverOpenChange?: (open: boolean) => void
} = {}) {
  // Gate BEFORE the model-loading effect exists: disabled tabs (the default —
  // settings.widgets.bookmarks starts false) never call chrome.bookmarks at
  // all. Only useStoredKey is called out here, so Rules of Hooks stay
  // satisfied regardless of the toggle.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.bookmarks) return null
  return <BookmarksBarInner onPopoverOpenChange={onPopoverOpenChange} />
}

function BookmarksBarInner({
  onPopoverOpenChange,
}: {
  onPopoverOpenChange?: (open: boolean) => void
}) {
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

  // setOpen (not a bare setOpenId call) is the one place open/close actually
  // happens, so it's the one place that can reliably tell App.tsx too — see
  // onPopoverOpenChange above. Synchronous with the state update (not a
  // useEffect keyed on `openId`) so App's mirrored state — and the wrapper
  // z-index it drives — updates in the SAME commit as the popover itself,
  // never a frame behind.
  const setOpen = (next: string | null) => {
    setOpenId(next)
    onPopoverOpenChange?.(next !== null)
  }
  const toggle = (id: string) => setOpen(openId === id ? null : id)

  return (
    <nav
      aria-label="Bookmarks bar"
      // `relative` (bookmarks-stacking bug fix): z-index only has any effect
      // on a positioned element (CSS: "on non-positioned elements it will
      // have no effect at all"). Before the arrange-mode work moved this
      // bar's placement classes out to an App.tsx PositionedBlock wrapper
      // (commit 1125413), THIS element carried `fixed left-1/2 top-4
      // -translate-x-1/2` directly, so it was `position: fixed` itself —
      // z-20/z-50 below applied normally. That move left the nav with no
      // `position` class of its own at all (`position: static`, the
      // default), while the placement classes (now on the wrapper) kept the
      // wrapper positioned instead. A `position: static` element's z-index
      // does nothing regardless of value, so z-20/z-50 below have been
      // silently inert since that commit.
      //
      // IMPORTANT — `relative` here is necessary but NOT sufficient on its
      // own (found via the real-Chromium preview probe, not by inspection):
      // `position: fixed` on the WRAPPER (App.tsx's PositionedBlock, still
      // `fixed` after the transform-removal fix — it has to be, that's what
      // makes the bar viewport-anchored at all) unconditionally creates a
      // NEW STACKING CONTEXT for that wrapper, with NO explicit z-index of
      // its own (CSS: `position: fixed`/`sticky` establishes a stacking
      // context regardless of z-index — unlike `position: relative`, which
      // only does when z-index isn't `auto`). Every explicit z-index inside
      // that wrapper — this nav's z-20/z-50 included — is scoped to
      // compete ONLY against the wrapper's own other descendants; from
      // OUTSIDE, the whole wrapper subtree paints as a single atomic layer
      // at z-index:auto (effectively 0), which ALWAYS loses to
      // FolderPopover's body-portaled z-40 catcher, no matter what
      // z-index anything inside the wrapper carries. `relative` fixes the
      // LOCAL ordering this file can see (the open popover's own panel,
      // z-50, painting above ITS sibling chips within this nav) — the
      // wrapper itself also has to gain a matching elevated z-index while a
      // popover is open, which is what `onPopoverOpenChange` above and
      // App.tsx's conditional wrapper className are for. See the
      // bookmarks PositionedBlock's comment in App.tsx for the full
      // writeup and the minimal-repro measurements that found this.
      //
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
      className={`relative flex max-w-[52vw] flex-wrap items-center justify-center gap-1.5 ${
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
                onClose={() => setOpen(null)}
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
              onClose={() => setOpen(null)}
            />
          )}
        </div>
      )}
    </nav>
  )
}
