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
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import TierFrame from '../shared/TierFrame'
import type { WidgetPresentationMode } from '../../widgetRenderers'

const MAX_VISIBLE_CHIPS = 8
const OVERFLOW_ID = '__overflow__'
// Chips carry the themed surface (bg-panel-solid fill — Jon's darker-color
// ruling: the connector cards' opaque token, now shared by every on-page
// surface — plus theme blur and theme border) but
// keep rounded-full like the app's other SMALL controls (gear, photo-refresh,
// timer buttons) — those stay round in every theme, including Mono, whose
// --radius: 0 only squares off PANELS. Jon flagged the square-in-Mono look
// when chips briefly used rounded-panel.
//
// SHRINK, NOT WRAP (this row must stay ONE row at every viewport — see the
// nav's own comment below). Four classes carry that here:
//   shrink     every chip gives ground, without exception. An earlier pass
//              exempted chips whose TITLE was short (see CHIP_LABEL below for
//              why a floor is needed at all) — but a character count is not a
//              width: six uppercase Latin characters ("GITHUB") or four
//              full-width CJK glyphs render ~90px wide, so eight "short"
//              titles could exceed the row's cap with nothing left able to
//              shrink, and a centred, non-clipping row spills off BOTH
//              viewport edges. The floor belongs on the label, in font-
//              relative units, where it bounds width instead of guessing it.
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
//   h-[…]      the chip's height IS index.css's `--bookmarks-chip-h` — the
//              same token the top band's height is built from — rather than a
//              value that token separately re-derives from `py-1` + the type
//              metrics. Two copies of one number can drift in either
//              direction (a chip restyled here, or a user's Chrome
//              minimum-font-size setting growing the line box at runtime);
//              one token cannot. `leading-5` pins the text block to the 20px
//              this height budgets for it (30px − 2px border − 8px `py-1`),
//              so the label stays inside the box it is given. `py-1` is kept
//              for intent, but `items-center` on a fixed height is what
//              actually places the content.
// The label span's own `truncate` (overflow-hidden) is what absorbs the
// shrink, and — because a non-visible overflow zeroes the automatic minimum
// size — is also what lets the span shrink at all.
//
// The tightening steps are HORIZONTAL ONLY (px, gaps, label caps). The chip's
// height is fixed above and shared with the band, so every viewport gets the
// same band.
//
// COMPACT MODE (`compact:` — viewport width <= 720px; see index.css for how
// that number was derived). Below it the row stops rendering labels and
// renders one MARK per chip instead. This is a mode, not a degradation, and
// the classes below are what make it read as one:
//   compact:w-[var(--bookmarks-chip-h)]  the chip becomes a CIRCLE — the
//              same token as its own height, with `--bookmarks-chip-px`
//              (index.css) at 0 to match — so the row turns into an even
//              rail of round tokens the size of the band itself, which is
//              the vocabulary the app's other small controls already speak
//              (the gear, the photo-refresh button, the timer's own round
//              buttons are `rounded-full` in every theme, Mono included).
//              A truncated pill looks broken; a circle looks chosen.
//   compact:justify-center  one mark, centred in it.
// The label goes `sr-only` rather than `hidden` (see CHIP_LABEL) and the
// full title is on every chip's `title` attribute at EVERY width, so the
// name is one hover or one screen-reader stop away in both modes.
//
// cursor-pointer: Tailwind v4's preflight sets `button { cursor: default }`,
// so a folder chip used to give no pointer feedback at all while the loose
// bookmarks beside it (real anchors) did — the same inverted affordance
// that was fixed in WeatherWidget, in the same row of the page. In compact
// mode the chip is a 30px circle with no text to hint at it, which makes
// the cursor the main affordance rather than a nicety.
const CHIP =
  'flex h-[var(--bookmarks-chip-h)] min-w-0 max-w-full shrink cursor-pointer items-center gap-[var(--bookmarks-gap)] rounded-full border border-panel-border bg-panel-solid px-[var(--bookmarks-chip-px)] py-1 text-sm leading-5 font-medium text-fg-muted shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent compact:w-[var(--bookmarks-chip-h)] compact:justify-center'
// Folder + overflow chips only: the wrapper div is the nav's flex item (it
// anchors the popover), so the flex permissions belong on it, and `relative`
// stays for FolderPopover's `absolute` panel. The flex-shrink value is
// appended per call site rather than baked in here, because `shrink` and
// `shrink-0` are the same CSS property — both in one className would resolve
// by generated-CSS source order, not by the order they're written.
const CHIP_SLOT = 'relative min-w-0'
// A label's bounds, both ends:
//   max-w   upper bound when there IS room, so one long title can't hog the
//           row. Tightened on narrow viewports so the squeeze starts from a
//           smaller number and fewer chips need truncating at all.
//   min-w   lower bound once flex shrink takes over. Without it, shrink —
//           which is proportional to each item's FULL width, while a chip's
//           icon, padding and border can't shrink at all — puts the whole
//           reduction on the label, and a short title loses most of itself:
//           measured at 800x450 with a full bar, "Dev" and "News" rendered as
//           "D…" and "N…". `ch` (the font's "0" advance) rather than a px
//           value so the floor tracks the rendered text — including a user's
//           Chrome minimum-font-size setting — instead of assuming a metric.
// The floor is what makes the row's fit an INVARIANT rather than a property
// of the seeded titles. Worst case at the matrix's narrowest viewport: 8
// chips at `narrow` metrics (16px padding + 2px border + 14px icon + 4px gap
// = 36px, plus a 4ch ≈ 32px label) + the "»" chip (~30px) + 8 × 4px gaps
// ≈ 610px, inside the 768px cap at 800px wide, whatever the titles say.
//
// …and the floor is also where the labelled mode ENDS. 4ch of Inter at 14px
// is ~31px, which renders about two characters plus an ellipsis — enough to
// keep the row's fit an invariant, nowhere near enough to identify a folder
// ("Leisure" → "Le…"). Below `compact` (index.css) the label therefore stops
// being drawn at all:
//   compact:sr-only  visually gone, still in the accessibility tree — this
//                    text IS each chip's accessible name, so `hidden` would
//                    leave a row of nameless controls. `sr-only` is also
//                    position:absolute, which takes the span out of flow so
//                    it can't widen the circle it sits in.
//   compact:min-w-0  the 4ch floor has to come off with it. `sr-only`'s own
//                    `width: 1px` loses to a `min-width: 4ch` declared
//                    without a variant, and a 31px absolutely-positioned box
//                    still contributes to the nav's SCROLL width even while
//                    it paints nothing — which would trip the harness's
//                    barOverflowX assertion for a label nobody can see.
// `data-chip-label` is a selector hook, not styling: a folder chip carries
// a second span (its compact-mode monogram), so "the label" has to be
// nameable by something other than its tag — both here, in the unit tests,
// and in scripts/preview.mjs's per-label measurements.
const CHIP_LABEL = 'min-w-[4ch] max-w-32 narrow:max-w-24 truncate compact:sr-only compact:min-w-0'

/** The compact-mode mark for a FOLDER chip: ONE initial, always.
 *
 *  Batch-1 owner review (2026-08-18): "compact bookmarks should probably
 *  just say N for news, D for docs, M for music" — a single letter per
 *  folder, superseding the earlier one-or-two-character rule. The initial
 *  is the one character of the title that was never in doubt, set in the
 *  page's display face (Space Grotesk — the clock and greeting speak it)
 *  so it reads as a MARK rather than as a label that lost the rest of
 *  itself. Loose bookmarks need none of this: their favicon is already a
 *  distinct mark, and the '»' chip is its own.
 *
 *  Split on code points, not UTF-16 units, so an emoji-prefixed folder
 *  ("📚 Reading") keeps its emoji instead of half a surrogate pair.
 *  toUpperCase() is the identity for CJK and emoji. */
export function folderMonogram(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '📁'
  return Array.from(words[0])[0]?.toUpperCase() ?? '📁'
}

type BookmarkMarkInput =
  | { kind: 'folder'; title: string }
  | { kind: 'bookmark'; url: string; faviconFailed: boolean }

export type BookmarkMark =
  | { kind: 'monogram'; text: string }
  | { kind: 'folder' }
  | { kind: 'favicon'; src: string }
  | { kind: 'globe' }

/** One identity resolver owns every visible bookmark mark. It deliberately
 * returns a discriminated union so a chip cannot render a folder glyph and
 * monogram, or a broken favicon and fallback globe, at the same time. */
export function resolveBookmarkMark(input: BookmarkMarkInput): BookmarkMark {
  if (input.kind === 'folder') {
    if (input.title.trim().length === 0) return { kind: 'folder' }
    return { kind: 'monogram', text: folderMonogram(input.title) }
  }
  if (input.faviconFailed) return { kind: 'globe' }
  return { kind: 'favicon', src: faviconUrl(input.url) }
}

type ChipEntry = { kind: 'folder'; folder: BookmarkFolder } | { kind: 'bookmark'; item: BookmarkItem }

function GlobeMark() {
  return (
    <svg
      aria-hidden
      data-chip-mark
      data-bookmark-mark="globe"
      className="size-3 compact:size-4 shrink-0"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
    </svg>
  )
}

function ChipMark({ chip }: { chip: ChipEntry }) {
  const [faviconFailed, setFaviconFailed] = useState(false)
  const mark = resolveBookmarkMark(
    chip.kind === 'folder'
      ? { kind: 'folder', title: chip.folder.title }
      : { kind: 'bookmark', url: chip.item.url, faviconFailed },
  )

  if (mark.kind === 'monogram') {
    // A named folder carries BOTH identity marks, media-gated so exactly
    // one is ever visible: the V1 folder glyph beside the readable label
    // above the compact width threshold, and the monogram alone inside the
    // compact circle (<=720px, index.css) where no label fits. The owner's
    // 1408px-wide window proved a monogram without its label reads as an
    // unexplained one-letter circle, so the glyph owns the labelled state.
    // Monogram first: the canonical harness's compact-mode popover click
    // targets the first [data-chip-mark] match and needs the visible half
    // of the swap to come first in DOM order.
    return (
      <>
        <span
          aria-hidden
          data-chip-mark
          data-bookmark-mark="monogram"
          className="hidden compact:inline shrink-0 font-display font-medium"
        >
          {mark.text}
        </span>
        <FolderIcon data-chip-mark data-bookmark-mark="folder" className="compact:hidden" />
      </>
    )
  }
  if (mark.kind === 'folder') {
    return <FolderIcon data-chip-mark data-bookmark-mark="folder" />
  }
  if (mark.kind === 'globe') return <GlobeMark />
  return (
    <img
      src={mark.src}
      alt=""
      width={12}
      height={12}
      data-chip-mark
      data-bookmark-mark="favicon"
      className="size-3 compact:size-4 shrink-0"
      onError={() => setFaviconFailed(true)}
    />
  )
}

export default function BookmarksBar({
  onPopoverOpenChange,
  canvasSize,
  presentation = 'free',
  docked = false,
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
  canvasSize?: CanvasSize
  presentation?: WidgetPresentationMode
  docked?: boolean
} = {}) {
  // Gate BEFORE the model-loading effect exists: disabled tabs (the default —
  // settings.widgets.bookmarks starts false) never call chrome.bookmarks at
  // all. Only useStoredKey is called out here, so Rules of Hooks stay
  // satisfied regardless of the toggle.
  const [settings] = useStoredKey('settings')
  if (!settings?.widgets.bookmarks) return null
  return <BookmarksBarInner onPopoverOpenChange={onPopoverOpenChange} canvasSize={canvasSize} presentation={presentation} docked={docked} />
}

function BookmarksBarInner({
  onPopoverOpenChange,
  canvasSize,
  presentation,
  docked,
}: {
  onPopoverOpenChange?: (open: boolean) => void
  canvasSize?: CanvasSize
  presentation: WidgetPresentationMode
  docked: boolean
}) {
  const [model, setModel] = useState<BarModel | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'permission-required' | 'hard-error'>('loading')
  // One popover open at a time: a folder chip's id, or OVERFLOW_ID, or null.
  const [openId, setOpenId] = useState<string | null>(null)
  const [openAnchor, setOpenAnchor] = useState<HTMLElement | null>(null)

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
      if (!live) return
      if (!granted) {
        setLoadState('permission-required')
        return
      }
      void loadBarModel().then((m) => {
        if (live) {
          setModel(m)
          setLoadState('ready')
        }
      }).catch(() => {
        if (live) setLoadState('hard-error')
      })
    }).catch(() => {
      if (live) setLoadState('hard-error')
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

  // Free mode retains the browser-bar behavior: no empty chrome. Stack mode
  // owns an exact footprint, so loading, permission, error, and empty states
  // stay visible without inventing a second bookmark owner.
  if (!model || (model.folders.length === 0 && model.loose.length === 0)) {
    if (presentation !== 'stack') return null
    const tier = canvasSize === 'standard' ? 'standard' : 'compact'
    const state = model && loadState === 'ready' ? 'empty' : loadState
    const message = state === 'loading'
      ? 'Loading bookmarks.'
      : state === 'permission-required'
        ? 'Allow bookmark access to show this stack.'
        : state === 'empty'
          ? 'Your bookmark bar is empty.'
          : 'Bookmarks are unavailable.'
    return (
      <TierFrame label="Bookmarks" tier={tier} state={state} className="grid place-items-center p-4 text-center">
        <p role={state === 'hard-error' ? 'alert' : 'status'} className="text-sm text-fg-muted">{message}</p>
      </TierFrame>
    )
  }

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
  const setOpen = (next: string | null, anchor: HTMLElement | null = null) => {
    setOpenId(next)
    setOpenAnchor(next === null ? null : anchor)
    onPopoverOpenChange?.(next !== null)
  }
  const toggle = (id: string, anchor: HTMLElement) => setOpen(openId === id ? null : id, anchor)

  const renderPurposeBuiltChip = (chip: ChipEntry, showName: boolean) => {
    const title = chip.kind === 'folder' ? chip.folder.title : chip.item.title
    const mark = folderMonogram(title)
    const content = (
      <>
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg border border-panel-border bg-control-bg font-display text-sm font-semibold text-fg">{mark}</span>
        {showName ? <span className="min-w-0 truncate text-sm font-medium text-fg">{title || 'Untitled'}</span> : null}
      </>
    )
    if (chip.kind === 'bookmark') {
      return (
        <a key={chip.item.id} href={chip.item.url} title={title} className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg px-1.5 text-left hover:bg-control-bg focus-visible:outline-2 focus-visible:outline-accent">
          {content}
        </a>
      )
    }
    return (
      <div key={chip.folder.id} className="min-w-0">
        <button
          type="button"
          title={title}
          aria-haspopup="dialog"
          aria-expanded={openId === chip.folder.id}
          onClick={(event) => toggle(chip.folder.id, event.currentTarget)}
          className="flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-left hover:bg-control-bg focus-visible:outline-2 focus-visible:outline-accent"
        >
          {content}
        </button>
        {openId === chip.folder.id && openAnchor ? (
          <FolderPopover
            title={chip.folder.title}
            items={chip.folder.items}
            folders={chip.folder.folders}
            anchor={openAnchor}
            onClose={() => setOpen(null)}
          />
        ) : null}
      </div>
    )
  }

  if (presentation === 'docked' || docked) {
    return (
      <nav data-bookmarks-presentation="docked" aria-label="Bookmarks" className="relative flex h-11 max-w-[34rem] items-center gap-1 overflow-hidden rounded-panel border border-panel-border bg-panel-solid px-2 shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]">
        <strong className="shrink-0 px-1 text-sm font-semibold text-fg">Bookmarks</strong>
        {allChips.slice(0, 4).map((chip) => renderPurposeBuiltChip(chip, true))}
        {allChips.length > 4 ? <span className="shrink-0 px-1 text-xs text-fg-muted">+{allChips.length - 4}</span> : null}
      </nav>
    )
  }

  if (presentation === 'stack') {
    const tier = canvasSize === 'standard' ? 'standard' : 'compact'
    const cap = 6
    return (
      <TierFrame label="Bookmarks" tier={tier} state="ready" className="gap-2 p-3">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Bookmarks</h2>
          <span className="text-[11px] text-fg-muted">{allChips.length} saved</span>
        </header>
        <nav
          data-bookmarks-presentation="stack"
          aria-label="Bookmarks"
          className={`grid min-h-0 flex-1 content-start gap-1 ${tier === 'standard' ? 'grid-cols-2' : 'grid-cols-3'}`}
        >
          {allChips.slice(0, cap).map((chip) => renderPurposeBuiltChip(chip, tier === 'standard'))}
        </nav>
        {allChips.length > cap ? <p className="text-[11px] text-fg-muted">+{allChips.length - cap} more in the bookmark bar</p> : null}
      </TierFrame>
    )
  }

  return (
    <nav
      data-canvas-size={canvasSize}
      data-bookmarks-presentation="bar"
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
      // z-20 normally, z-50 while a popover is open. FolderPopover itself is
      // portaled to body so the Dock scrollport cannot clip it; this local
      // elevation only keeps the active chip above its sibling launchers.
      // WIDTH + ONE ROW, ALWAYS. This bar now owns the top band alone (the
      // timer pill and weather chip default BELOW it — see App.tsx and
      // index.css's `--top-band`), which changes both halves of the old
      // sizing rule:
      //
      // The cap. It used to be `max-w-[52vw] tight:max-w-[24vw]`: a share of
      // the viewport carved out so a CENTERED bar could never reach the
      // peripherals sitting at its own elevation (52vw ⇒ a right edge at
      // 76vw; the `tight` step tightened it to 62vw to stay clear of the
      // weather chip's own cap of the day, then a matching `tight:max-w-`
      // that no longer exists — the chip is bounded by the room beside the
      // timer pill now, see WeatherWidget.tsx). Nothing shares this row
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
      className={`relative flex max-w-[min(72rem,calc(100vw_-_2rem))] flex-nowrap items-center justify-center gap-[var(--bookmarks-gap)] ${
        openId ? 'z-50' : 'z-20'
      }`}
    >
      {visible.map((chip) =>
        chip.kind === 'folder' ? (
          <div key={chip.folder.id} className={`${CHIP_SLOT} shrink`}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={openId === chip.folder.id}
              // The full title, at every width. Sighted users had no way
              // back to a truncated label before this (screen readers
              // always did — the label span is the accessible name); in
              // compact mode, where there is no label at all, this and the
              // popover are the only ways to read the name.
              title={chip.folder.title}
              onClick={(event) => toggle(chip.folder.id, event.currentTarget)}
              className={CHIP}
            >
              <ChipMark chip={chip} />
              <span data-chip-label className={CHIP_LABEL}>
                {chip.folder.title}
              </span>
            </button>
            {openId === chip.folder.id && openAnchor && (
              <FolderPopover
                title={chip.folder.title}
                items={chip.folder.items}
                folders={chip.folder.folders}
                anchor={openAnchor}
                onClose={() => setOpen(null)}
              />
            )}
          </div>
        ) : (
          // No CHIP_SLOT wrapper: a loose bookmark has no popover to anchor,
          // so the anchor IS the nav's flex item, and CHIP's own
          // `min-w-0`/`shrink` land on it directly.
          <a key={chip.item.id} href={chip.item.url} title={chip.item.title} className={CHIP}>
            {/* The favicon is already this chip's compact-mode mark — it is
                the one thing that identifies the site without words — so it
                only needs to grow into the space the label vacates. The
                width/height attributes stay for the intrinsic size before
                CSS arrives; the size utilities are what the breakpoint can
                actually address. */}
            <ChipMark chip={chip} />
            <span data-chip-label className={CHIP_LABEL}>
              {chip.item.title}
            </span>
          </a>
        ),
      )}
      {overflow.length > 0 && (
        // The one chip that does NOT shrink: a single glyph with no label to
        // truncate, and the only way to reach the bookmarks it stands for.
        // Squeezing it buys a couple of pixels and costs the row its escape
        // hatch. Its width is fixed and tiny (~30px), so it is a constant in
        // the row's worst-case fit rather than a risk to it.
        <div className={`${CHIP_SLOT} shrink-0`}>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openId === OVERFLOW_ID}
            aria-label="More bookmarks"
            title="More bookmarks"
            onClick={(event) => toggle(OVERFLOW_ID, event.currentTarget)}
            className={CHIP}
          >
            {/* Wrapped rather than a bare text node so the compact-mode
                probe can find one mark per chip through a single selector —
                this chip's mark is the same glyph in both modes. */}
            <span aria-hidden data-chip-mark>
              »
            </span>
          </button>
          {openId === OVERFLOW_ID && openAnchor && (
            <FolderPopover
              title="More"
              items={overflow.flatMap((c) => (c.kind === 'bookmark' ? [c.item] : []))}
              folders={overflow.flatMap((c) => (c.kind === 'folder' ? [c.folder] : []))}
              anchor={openAnchor}
              onClose={() => setOpen(null)}
            />
          )}
        </div>
      )}
    </nav>
  )
}
