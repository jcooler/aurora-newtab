import { useEffect, useRef, useState } from 'react'
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
// Chips carry the themed surface (bg-panel fill, theme blur, theme border) but
// keep rounded-full like the app's other SMALL controls (gear, photo-refresh,
// timer buttons) — those stay round in every theme, including Mono, whose
// --radius: 0 only squares off PANELS. Jon flagged the square-in-Mono look
// when chips briefly used rounded-panel.
//
// SHRINK, NOT WRAP (this row must stay ONE row at every viewport — see the
// nav's own comment below). Two classes carry that here:
//   min-w-0    a flex item's automatic minimum size is its MIN-CONTENT width
//              unless overridden — and `truncate` sets `white-space: nowrap`,
//              which makes a label's min-content its FULL width (there is no
//              break opportunity to shrink to). Without this, a chip refuses
//              to go below its whole title and the row overflows instead of
//              tightening.
//   max-w-full caps a chip at its parent's width once that parent is itself
//              squeezed. Load-bearing for FOLDER chips specifically: their
//              flex item is the `relative` wrapper div (the popover's
//              positioning context), not the button, so the button needs to
//              be told to follow the wrapper down rather than spill out of it.
// The label span's own `truncate` (overflow-hidden) is what absorbs the
// shrink, and — because a non-visible overflow zeroes the automatic minimum
// size — is also what lets the span shrink at all.
//
// flex-shrink itself is NOT here; it's per-chip (see shrinkFor below).
//
// The tightening steps are HORIZONTAL ONLY (px, gaps, label caps). The chip's
// vertical metrics — `py-1`, `text-sm`'s line height, the 1px border — are
// deliberately breakpoint-invariant, because index.css's `--top-band` is
// derived from them and every viewport shares one band.
const CHIP =
  'flex min-w-0 max-w-full items-center gap-1.5 narrow:gap-1 rounded-full border border-panel-border bg-panel px-2.5 narrow:px-2 py-1 text-sm font-medium text-fg-muted shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent'
// Folder + overflow chips only: the wrapper div is the nav's flex item (it
// anchors the popover), so the flex permissions belong on it, and `relative`
// stays for FolderPopover's `absolute` panel.
const CHIP_SLOT = 'relative min-w-0'
// Upper bound on a label when there IS room; below that, flex shrink takes
// over. Tightened on narrow viewports so the squeeze starts from a smaller
// number and fewer chips need truncating at all.
const CHIP_LABEL = 'max-w-32 narrow:max-w-24 truncate'

// WHICH chips give ground. flex-shrink distributes in proportion to each
// item's own width — which sounds right (the longest titles lose the most
// pixels) but is wrong in the only place it matters: a chip's icon, padding
// and border can't shrink, so the whole reduction lands on the label, and for
// a SHORT title that reduction is most of it. Measured at 800x450 with a full
// bar: "Dev" and "News" rendered as "D…" and "N…" — chips that cost the same
// space as before and no longer say anything.
//
// So the floor is per-chip, not per-pixel: a title short enough to read whole
// is exempt, and the compression lands entirely on the titles long enough to
// survive losing a few characters. `shrink`/`shrink-0` are appended at each
// call site rather than baked into CHIP above, because they are the same CSS
// property — both in one className would resolve by generated-CSS source
// order, not by the order they're written.
//
// The exemption can't overflow the row: a title this short makes a chip at
// most ~86px wide, so even the degenerate case (all 8 visible chips exempt,
// plus the "»" chip and the gaps) tops out around 750px — inside the 768px
// cap at 800px wide, the narrowest viewport in the harness matrix.
const SHRINK_EXEMPT_CHARS = 6
const shrinkFor = (title: string) =>
  title.trim().length <= SHRINK_EXEMPT_CHARS ? 'shrink-0' : 'shrink'

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

  // Read through a ref (same idiom as dialogStack.ts's useDialogEscape and
  // useLongPress.ts's onEngageRef) so the mount-once/unmount-once effect
  // below always calls the LATEST onPopoverOpenChange, never a stale one
  // closed over when that effect's callback was first created.
  const onPopoverOpenChangeRef = useRef(onPopoverOpenChange)
  onPopoverOpenChangeRef.current = onPopoverOpenChange

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

  // Review fix (bookmarks-stacking bug fix, part 3): if THIS component
  // unmounts while a popover is open, nothing previously told App.tsx it
  // closed. That's reachable without ever touching a popover:
  // settings.widgets.bookmarks lives in shared chrome.storage, so a
  // DIFFERENT new-tab tab can flip the widget off while a popover is open
  // here — the outer BookmarksBar's gate (top of this file) then returns
  // null, unmounting this component entirely, popover included, with no
  // onClose ever firing. App's bookmarksPopoverOpen would stick `true`
  // forever (self-healing only the next time a popover actually
  // opens/closes elsewhere), so if the widget were re-enabled later
  // without touching a popover, the bar would reappear already carrying a
  // stale `z-50` wrapper class, permanently outranking TodoPanel/
  // TimerWidget's z-30 — the exact regression the CONDITIONAL (not
  // permanent) elevation exists to avoid (see App.tsx's comment on the
  // bookmarks PositionedBlock). Empty deps: this fires its cleanup exactly
  // once, on unmount, regardless of how many times openId/model/etc.
  // change in between — always reporting "closed" via the ref above, which
  // is a safe, idempotent no-op on App's side if nothing was open anyway
  // (setState to the same value bails out the re-render).
  useEffect(() => {
    return () => onPopoverOpenChangeRef.current?.(false)
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
      // z-20 normally, z-50 while a popover is open — but (reviewer-noted
      // stale comment, corrected) by ITSELF this only wins LOCAL
      // comparisons inside the wrapper's own stacking context: concretely,
      // the open popover's own panel (z-50) painting above ITS sibling
      // chips within this nav. Outranking FolderPopover's z-40
      // body-portaled catcher — and TodoPanel/TimerWidget's z-30 panels —
      // while a popover is open is now the WRAPPER's job (App.tsx's
      // `bookmarksPopoverOpen`-gated className, fed by `onPopoverOpenChange`
      // above), not this class's; see the big comment above for why a class
      // in here can never reach outside the wrapper on its own. Kept
      // `openId`-scoped (matching the wrapper's own open-only elevation)
      // rather than permanent for the same reason the wrapper is scoped
      // that way: permanently at z-50, this nav would win its OWN local
      // popover-vs-sibling-chip comparison even with nothing open (harmless
      // there) but would also be one more thing to keep in sync with the
      // wrapper's condition for no benefit — `openId` is already the single
      // source of truth this reads from, so mirroring it here costs
      // nothing and keeps both classes legible together.
      // WIDTH + ONE ROW, ALWAYS. This bar now owns the top band alone (the
      // timer pill and weather chip default BELOW it — see App.tsx and
      // index.css's `--top-band`), which changes both halves of the old
      // sizing rule:
      //
      // The cap. It used to be `max-w-[52vw] tight:max-w-[24vw]`: a share of
      // the viewport carved out so a CENTERED bar could never reach the
      // peripherals sitting at its own elevation (52vw ⇒ a right edge at
      // 76vw; the `tight` step tightened it to 62vw to stay clear of the
      // weather panel's own `tight:max-w-[30vw]`). Nothing shares this row
      // any more, so the only real constraint left is the viewport itself:
      // `calc(100vw - 2rem)` keeps the 1rem gutter the rest of the page's
      // peripherals use, and the 72rem ceiling stops a full bar from
      // stretching wall-to-wall on a wide display, where an edge-to-edge row
      // of chips would read as browser chrome rather than as part of the
      // page. min() picks whichever binds, continuously — no breakpoint step
      // needed, so `tight` no longer has a consumer here.
      //
      // The row count. `flex-wrap` is gone: at 800x450 the old caps wrapped
      // three chips onto two rows, and a bar that grows downward eats into
      // the band the peripherals below now depend on. `flex-nowrap` plus
      // per-chip shrink (see CHIP above) turns that overflow into
      // compression instead — chips tighten and their labels truncate, the
      // row height never changes. The reclaimed width is what makes this
      // affordable: at 800px the budget goes from 192px (24vw) to 768px for
      // the same chips. scripts/preview.mjs asserts the single row directly
      // (measured nav height vs. measured chip height, with a seeded profile
      // at the full 8-chips-plus-overflow maximum) at every matrix viewport.
      className={`relative flex max-w-[min(72rem,calc(100vw_-_2rem))] flex-nowrap items-center justify-center gap-1.5 narrow:gap-1 ${
        openId ? 'z-50' : 'z-20'
      }`}
    >
      {visible.map((chip) =>
        chip.kind === 'folder' ? (
          <div key={chip.folder.id} className={`${CHIP_SLOT} ${shrinkFor(chip.folder.title)}`}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={openId === chip.folder.id}
              onClick={() => toggle(chip.folder.id)}
              className={CHIP}
            >
              <FolderIcon />
              <span className={CHIP_LABEL}>{chip.folder.title}</span>
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
          // No CHIP_SLOT wrapper: a loose bookmark has no popover to anchor,
          // so the anchor IS the nav's flex item — CHIP's own `min-w-0` and
          // this chip's shrink class both land on it directly.
          <a key={chip.item.id} href={chip.item.url} className={`${CHIP} ${shrinkFor(chip.item.title)}`}>
            <img src={faviconUrl(chip.item.url)} alt="" width={12} height={12} className="shrink-0" />
            <span className={CHIP_LABEL}>{chip.item.title}</span>
          </a>
        ),
      )}
      {overflow.length > 0 && (
        // Always exempt, whatever shrinkFor would say about a title: this
        // chip is a single glyph with nothing to truncate, and it is the only
        // way to reach the bookmarks it stands for. Squeezing it buys a
        // couple of pixels and costs the row its escape hatch.
        <div className={`${CHIP_SLOT} shrink-0`}>
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
