import { useCallback, useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { applyTheme } from '../theme/index'
import type { Layout } from '../lib/layout/types'
import Background from './components/Background'
import Clock from './components/Clock'
import Greeting from './components/Greeting'
import FocusLine from './components/FocusLine'
import PositionedBlock from './components/PositionedBlock'
import SearchBar from './components/SearchBar'
import WidgetBoundary from './components/WidgetBoundary'
import Drawer from '../settings/Drawer'
import DrawerBoundary from '../settings/DrawerBoundary'
import SettingsPanel from '../settings/SettingsPanel'
import WeatherWidget from './widgets/weather/WeatherWidget'
import LinksWidget from './widgets/links/LinksWidget'
import TodoWidget from './widgets/todo/TodoWidget'
import TimerWidget from './widgets/timer/TimerWidget'
import NotesWidget from './widgets/notes/NotesWidget'
import QuoteWidget from './widgets/quote/QuoteWidget'
import PaletteHost from './widgets/palette/PaletteHost'
import BookmarksBar from './widgets/bookmarks/BookmarksBar'
import WorldClocks from './widgets/clocks/WorldClocks'
import CountdownLine from './widgets/countdown/CountdownLine'
import RssWidget from './widgets/rss/RssWidget'
import GithubWidget from './widgets/github/GithubWidget'
import GitlabWidget from './widgets/gitlab/GitlabWidget'
import JiraWidget from './widgets/jira/JiraWidget'
import VercelWidget from './widgets/vercel/VercelWidget'
import ArrangeController from './arrange/ArrangeController'
import { DraftLayoutContext } from './arrange/draftLayout'

export default function App() {
  const [settings] = useStoredKey('settings')
  const [photoPrefs, savePhotoPrefs] = useStoredKey('photoPrefs')
  const [layout] = useStoredKey('layout')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Arrange mode's live-drag override (Task 36) — see draftLayout.ts. Owned
  // here, not inside ArrangeController: it must be readable by EVERY
  // PositionedBlock below, which are ArrangeController's SIBLINGS (it's
  // rendered last in <main>, not as a wrapper), so the Provider has to live
  // above all of them, with ArrangeController only ever writing to it via
  // this setter (passed down as `onDraftChange`).
  const [draft, setDraft] = useState<Layout>({})
  // True while arrange mode is on (Task 36 review fix) — mirrors
  // ArrangeController's own internal `mode` via its `onModeChange` callback.
  // Drives `inert` on the wrapper below, the same idiom Drawer.tsx already
  // uses (`inert={!open}`): with the overlay covering everything, the rest
  // of the page was previously only POINTER-blocked (by the overlay sitting
  // on top of it) — Tab still walked straight through it to the settings
  // gear, search, links, and any already-open Notes/Todo/Timer panel.
  const [arranging, setArranging] = useState(false)
  // Bump-to-enter nonce for the Settings "Arrange layout" button (Task 37) —
  // any CHANGE (ArrangeController compares against the previous value, not
  // just truthiness) enters arrange mode with no block pre-selected. Starts
  // at 0 so the very first bump (1) is always a real change.
  const [arrangeSignal, setArrangeSignal] = useState(0)
  // Bookmarks-stacking bug fix, part 2 — mirrors BookmarksBar's own
  // openId-derived open/closed state (via onPopoverOpenChange) so THIS
  // wrapper's className can react to it. Needed because `position: fixed`
  // (the bookmarks PositionedBlock below is unavoidably `fixed` — that's
  // what anchors the bar to the viewport) unconditionally creates a new
  // stacking context: BookmarksBar's own z-20/z-50 (on its `nav`) only
  // wins LOCALLY, inside that stacking context, never against
  // FolderPopover's body-portaled z-40 click-outside catcher, which lives
  // OUTSIDE it. See the long comment on the bookmarks PositionedBlock
  // below for the full writeup, including the minimal-repro measurements
  // that found this (a real-Chromium preview-probe FAIL, not something
  // caught by inspection or by jsdom).
  const [bookmarksPopoverOpen, setBookmarksPopoverOpen] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  // Tracks whether the PREVIOUS render had `arranging` true, so the
  // focus-restore effect below only fires on a real on->off transition, never
  // on mount (where `arranging` already starts false and body legitimately
  // has focus on a fresh page load).
  const wasArrangingRef = useRef(false)

  useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings?.theme])

  // Focus management on arrange-mode EXIT (Task 37): ArrangeController's
  // overlay — and whichever Move button was focused inside it, per its own
  // entry-side focus management — unmounts the instant `mode` flips off, so
  // by the time `arranging` reaches here as false, the browser has already
  // reverted `document.activeElement` to <body> (nothing else claimed it).
  // Left alone, that stops keyboard use cold: no visible focus ring
  // anywhere. Restoring it to the settings gear (always present, and
  // conceptually where the Settings-triggered "Arrange layout" entry point
  // returns to) fixes that for BOTH exit paths — the brief only requires it
  // for the Settings-button path, but this single activeElement-driven
  // heuristic needs no separate "how did we get here" bookkeeping and is a
  // strict improvement (never a regression) for the long-press path too.
  useEffect(() => {
    const wasArranging = wasArrangingRef.current
    wasArrangingRef.current = arranging
    if (wasArranging && !arranging && document.activeElement === document.body) {
      settingsButtonRef.current?.focus()
    }
  }, [arranging])

  // Settings' "Arrange layout" button composes to this: close the drawer
  // FIRST (so the arranged page is actually visible once the overlay
  // appears — the drawer covers the right third of the screen while open),
  // then bump the nonce ArrangeController watches.
  const requestArrange = useCallback(() => {
    setSettingsOpen(false)
    setArrangeSignal((n) => n + 1)
  }, [])

  if (!settings || !photoPrefs || !layout) return null

  return (
    <main className="relative h-screen overflow-hidden text-fg">
      <DraftLayoutContext.Provider value={draft}>
        {/* display:contents — a plain wrapping div would become a NEW
            containing block the instant any transform/filter is ever added
            to it, silently breaking every `position: fixed` descendant below
            (PositionedBlock's own containing-block fix, this same task,
            exists precisely because of that hazard). `contents` keeps this
            div's only effect being the `inert` it carries: zero box, zero
            layout footprint. `inert` itself (not just the overlay sitting on
            top) is what makes the rest of the page truly unreachable — both
            by pointer AND by keyboard — while arrange mode is on. */}
        <div className="contents" inert={arranging}>
          <div className="flex h-full flex-col items-center justify-center narrow:px-4">
            <WidgetBoundary name="clock">
              <PositionedBlock id="clock" pos={layout?.clock}>
                <Clock />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="greeting">
              <PositionedBlock id="greeting" pos={layout?.greeting}>
                <Greeting />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="clocks">
              <PositionedBlock id="worldClocks" pos={layout?.worldClocks}>
                <WorldClocks />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="countdown">
              <PositionedBlock id="countdown" pos={layout?.countdown}>
                <CountdownLine />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="search">
              <PositionedBlock id="search" pos={layout?.search}>
                <SearchBar />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="focus">
              <PositionedBlock id="focus" pos={layout?.focus}>
                <FocusLine />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="links">
              <PositionedBlock id="links" pos={layout?.links}>
                <LinksWidget />
              </PositionedBlock>
            </WidgetBoundary>
          </div>

          {/*
            Background mounts here — after the centered column — purely for tab
            order: its refresh button (the only focusable thing it renders) must
            come after search/focus-line/links but before Tasks/gear. The
            aria-hidden photo layer's `-z-10` pins it behind everything in the
            paint order regardless of where it sits in the DOM, so moving it here
            doesn't change what's visible or what's hit-testable on top of it.
          */}
          <Background prefs={photoPrefs} onPrefsChange={savePhotoPrefs} />

          {/*
            Weather, the bookmarks bar, timer, and notes mount here — after
            Background's refresh button but before Tasks/gear — purely for tab
            order (all four are `fixed`-positioned, so this has no effect on
            layout): search -> focus -> links -> photo refresh -> weather
            controls -> bookmarks chips -> timer pill -> notes pill -> Tasks ->
            gear.
          */}
          <WidgetBoundary name="weather">
            {/*
              DEFAULT placement only (`pos` — a stored arrange-mode layout —
              still wins whenever the user has one; PositionedBlock drops
              this className entirely on that branch).

              `top-[var(--top-band)]`, not `top-4`: the top of the page
              belongs to the bookmarks bar alone, so this chip and the timer
              pill both start at the first pixel BELOW the band the bar
              owns. See index.css's `--top-band` for the derivation (the
              band's gap + one chip row + that same gap again) and why the
              band is reserved unconditionally rather than sized to whether
              the bar happens to be rendering. `right-4` is unchanged — the horizontal
              anchor is what makes this "the weather corner", and the timer
              keeps `left-4` for the same reason: the two share one row, one
              top edge, opposite ends.
            */}
            <PositionedBlock
              id="weather"
              pos={layout?.weather}
              className="fixed right-4 top-[var(--top-band)]"
            >
              <WeatherWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="bookmarks">
            {/*
              PLACEMENT — the top of the band, and nothing else defaults
              beside it. This bar owns the band outright; the timer pill and
              weather chip (above/below in this file) start at
              `top-[var(--top-band)]`, the first pixel below it.
              `--top-band-gap` is the SAME token the band's own height is
              built from (index.css), so the air above the bar and the air
              below it stay equal by construction — including where that
              measure compresses on short viewports. Two consequences worth
              naming here, because they only make sense as a pair:
                · the bar no longer has to leave room for peripherals at its
                  own elevation, so its width cap is now bounded by the
                  VIEWPORT rather than by whatever the neighbours needed —
                  see BookmarksBar.tsx's own max-width comment;
                · that reclaimed width is what lets the chip row shrink to
                  fit instead of wrapping to a second row (which would grow
                  the band under the peripherals and reintroduce the very
                  overlap the offset exists to prevent).

              Bug fix (bookmarks popover stacking) — bookmark folder popovers
              opened, but nothing inside them was clickable. Two independent
              causes, both rooted in this wrapper, both fixed here + in
              BookmarksBar.tsx:

              CAUSE 1 — this wrapper used to carry `left-1/2
              -translate-x-1/2` for centering. Any `translate`/`transform`
              on an element makes it a new CONTAINING BLOCK for `position:
              fixed` DESCENDANTS (CSS Transforms spec) — harmless for the
              nav's own children (FolderPopover's panel is `absolute`,
              anchored to its chip), but it *also* makes the element a new
              STACKING CONTEXT, painting atomically wherever it falls in the
              parent's paint order. FolderPopover's click-outside catcher
              portals to <body> specifically to escape being trapped INSIDE
              that containing block (see FolderPopover's own comment) — but
              portaling to <body> does nothing for the stacking-context
              problem: the transformed wrapper (with every z-50 thing
              inside it) still paints as one atomic unit, and in this app
              that unit sits BELOW the body-level catcher's explicit z-40.
              Fix: transform-free centering — `inset-x-0 mx-auto w-fit`
              reproduces the same centered, shrink-to-fit box (verified
              against BookmarksBar's own capped, `flex-nowrap` chip row —
              `w-fit` resolves to that row's own width, clamped by the
              nav's max-width) without ever creating a containing block.

              CAUSE 2 — found AFTER shipping fix 1, by the mandated
              real-Chromium preview probe (a real `page.click` on a link
              inside an open popover still timed out, Playwright reporting
              the click-outside catcher as the interceptor): removing the
              transform does NOT remove the stacking context, because
              `position: fixed` — which this wrapper still needs, to stay
              viewport-anchored at all — ALSO unconditionally creates one,
              regardless of z-index (CSS Position spec: `fixed`/`sticky`
              always establish a stacking context; `relative`/`absolute`
              only do when z-index isn't `auto`, which is why the OTHER
              half of this fix, `relative` on BookmarksBar's own `nav` —
              see BookmarksBar.tsx — was necessary but not sufficient by
              itself). With no explicit z-index of its own, this wrapper
              paints as an atomic z-index:auto (effectively 0) layer at the
              top level — ALWAYS below the catcher's explicit z-40, no
              matter what z-index anything inside it (the nav's z-20/z-50
              included) carries; that inner z-index only ever wins LOCAL
              comparisons against the wrapper's own other descendants.
              Confirmed with a minimal transform-free repro outside this
              app (a `position:fixed` wrapper with a `position:relative
              z-index:50` child, next to a sibling `position:fixed
              z-index:40` catcher): `elementFromPoint` on the child resolved
              to the catcher every time, until the WRAPPER itself also got
              an explicit z-index — then it resolved to the child.
              Fix: `bookmarksPopoverOpen` (state above, set via
              BookmarksBar's `onPopoverOpenChange`) drives `z-50` on this
              wrapper — matching the nav's own open-state z-50 — ONLY while
              a popover is actually open, exactly mirroring BookmarksBar's
              existing "z-20 idle / z-50 open" rationale (see its own
              comment) rather than introducing a NEW permanent-elevation
              regression against TodoPanel/TimerWidget: idle, this wrapper
              stays at z-index:auto, unchanged from before this whole fix.
            */}
            <PositionedBlock
              id="bookmarks"
              pos={layout?.bookmarks}
              className={`fixed inset-x-0 top-[var(--top-band-gap)] mx-auto w-fit${bookmarksPopoverOpen ? ' z-50' : ''}`}
            >
              <BookmarksBar onPopoverOpenChange={setBookmarksPopoverOpen} />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="timer">
            {/* Same move as weather above, mirrored: DEFAULT placement drops
                out of the bookmarks bar's band to `top-[var(--top-band)]`,
                keeping its `left-4` anchor so the two peripherals bookend
                one row under the bar. See index.css's `--top-band`. */}
            <PositionedBlock
              id="timer"
              pos={layout?.timer}
              className="fixed left-4 top-[var(--top-band)]"
            >
              <TimerWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="notes">
            <PositionedBlock id="notes" pos={layout?.notes} className="fixed bottom-4 left-16">
              <NotesWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="todo">
            <PositionedBlock id="tasks" pos={layout?.tasks} className="fixed bottom-4 right-16">
              <TodoWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="rss">
            {/* DEFAULT placement — the left-middle column, clear of the Notes
                pill (bottom-left) and the photo refresh button at defaults, and
                well left of the centred clock/greeting column. A stored
                arrange-mode `pos` still wins (PositionedBlock drops this
                className on that branch). RssWidget self-gates on the
                connector's enabled+feeds state, so this wrapper renders an
                empty box until the connector is turned on — same as every other
                toggle-gated peripheral here. No `translate`: this widget has no
                `position: fixed` descendants, but the house rule is to keep
                default-placement wrappers transform-free (App's quote/bookmarks
                comments), so it anchors with a plain top offset. */}
            <PositionedBlock id="rss" pos={layout?.rss} className="fixed left-8 top-[22vh]">
              <RssWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="github">
            {/* DEFAULT placement — the right-middle column, mirroring the RSS
                widget on the left. `top-[24vh]` starts it well below the
                collapsed weather chip (which defaults to the top band at
                `right-4`) and its `right-8` anchor keeps it clear of the
                centred clock/greeting column and the bottom-right Tasks pill /
                settings gear. A stored arrange-mode `pos` still wins
                (PositionedBlock drops this className on that branch).
                GithubWidget self-gates on the connector's enabled+token state,
                so this wrapper renders an empty box until the connector is
                connected — same as every other toggle-gated peripheral here.
                Transform-free per the house rule (App's quote/bookmarks
                comments): a plain top/right offset, no translate. */}
            <PositionedBlock id="github" pos={layout?.github} className="fixed right-8 top-[24vh]">
              <GithubWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="gitlab">
            {/* DEFAULT placement — the right-middle column, BELOW the GitHub
                widget's own default slot. `top-[46vh]` clears github's
                `top-[24vh]` card (w-80, p-4 content — comfortably under
                46vh regardless of PR/issue row count at the widths this app
                targets) while sharing its `right-8` anchor, so a reader who
                connects both sees them stacked as one column rather than
                overlapping. A stored arrange-mode `pos` still wins
                (PositionedBlock drops this className on that branch).
                GitlabWidget self-gates on the connector's enabled+token+
                instanceUrl state, so this wrapper renders an empty box until
                the connector is connected — same as every other
                toggle-gated peripheral here. Transform-free per the house
                rule (App's quote/bookmarks comments): a plain top/right
                offset, no translate. */}
            <PositionedBlock id="gitlab" pos={layout?.gitlab} className="fixed right-8 top-[46vh]">
              <GitlabWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="jira">
            {/* DEFAULT placement — the right column, lower still: BELOW both
                the GitHub (`top-[24vh]`) and GitLab (`top-[46vh]`) default
                slots, sharing their `right-8` anchor so a reader who connects
                all three sees one stacked column rather than any overlap.
                `top-[66vh]` also has to clear the bottom-right Tasks pill
                (`fixed bottom-4 right-16`) and the settings gear beside it —
                the harness's own collision probe is what actually pins this
                number, same discipline as every other connector default
                here. A stored arrange-mode `pos` still wins (PositionedBlock
                drops this className on that branch). JiraWidget self-gates
                on the connector's enabled+site+email+apiToken state, so this
                wrapper renders an empty box until the connector is
                connected — same as every other toggle-gated peripheral
                here. Transform-free per the house rule (App's quote/
                bookmarks comments): a plain top/right offset, no translate. */}
            <PositionedBlock id="jira" pos={layout?.jira} className="fixed right-8 top-[66vh]">
              <JiraWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="vercel">
            {/* DEFAULT placement — REVISED off the brief's own starting
                hypothesis (a second right-hand column beside github, e.g.
                `right-[22-23rem] top-[24vh]`). Measured directly (not just
                class-name reasoning) and rejected: at this app's 1600x900
                launch viewport the centered column is wider than the gap a
                second w-80 card would need. github's own LEFT edge sits at
                right:22rem (right-8 + w-80 = 2rem + 20rem) from the
                viewport's right edge, i.e. x=1248px; the centered clock
                spans x=635.5-964.5px at that same row (top-[24vh]) — a
                w-80 (320px) card starting even 1rem left of github's edge
                (x=912) still overlaps the clock by ~52px, and every other
                row the centered column occupies down to the quote block
                (y up to ~876px) is similarly too wide (clock/search/focus/
                quote all reach past x=900) to leave room for a second
                320px column anywhere in the right half without either
                touching github or touching the centered content. (The
                links row, y636-724, is the one narrow exception — far too
                short a band to hold a card.) So: the LEFT side instead,
                mirroring the right column's own stacking rhythm one level
                down from RSS's existing `left-8 top-[22vh]` slot. The
                centered column's LEFTMOST extent at any row is x=512
                (quote), well clear of a left-8/w-80 card's x=32-352 box, so
                stacking here is collision-free against the centered content
                by construction, not just at the tested fixture size.
                `top-[64vh]` clears RSS even at its OWN worst case, not
                just its default: RSS's shownCount is user-configurable
                3-8 (Connectors.tsx's SHOWN_COUNT_OPTIONS), and at 8
                headlines its card reaches y=542 at this viewport (vs
                y=410 at the default 5) — measured directly, not
                estimated, since the row math (gap-2 plus two text lines)
                isn't obvious from the className alone. `top-[64vh]`
                (576px) clears that worst case by a measured 34.0px, and
                vercel's own card (capped at MAX_DEPLOYMENTS=5, so a
                5-row fixture IS its own worst-case height, not a
                shorter stand-in) ends at y=768, a measured 36.0px clear
                of the quote block's own top (y=804) below it. Fix round
                1 (post-review) caught that the harness's OWN
                gap-measurement probe was, at the time this paragraph was
                first written, seeding vercel with only 3 rows — so the
                "~768/~36px" figures here were an (accurate, as it turned
                out) hand-computed estimate, not yet an actual
                measurement of the real worst case. scripts/preview.mjs's
                vercel block now seeds all 5 MAX_DEPLOYMENTS rows and
                asserts this exact gap (`pxGapBelow >= 16`, logged
                verbatim), so these are now genuinely pinned against the
                real rendered card, not just arithmetic. A stored
                arrange-mode `pos` still wins
                (PositionedBlock drops this className on that branch).
                VercelWidget self-gates on the connector's enabled+token
                state, so this wrapper renders an empty box until the
                connector is connected — same as every other toggle-gated
                peripheral here. Transform-free per the house rule (App's
                quote/bookmarks comments): a plain top/left offset, no
                translate. */}
            <PositionedBlock id="vercel" pos={layout?.vercel} className="fixed left-8 top-[64vh]">
              <VercelWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <button
            ref={settingsButtonRef}
            type="button"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
            className="fixed bottom-4 right-4 rounded-full bg-panel p-2 text-fg-muted shadow-lg shadow-black/25 backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <WidgetBoundary name="quote">
            {/*
              Review fix I3 (superseded below by the bookmarks-stacking bug
              fix): unlike weather/bookmarks/timer/notes/tasks (each
              shrink-to-fit sized, `left`/`right` alone), the quote's old
              single-element `fixed inset-x-0 bottom-6 mx-auto max-w-xl`
              resolved its actual (auto-margin) width via shrink-to-fit BECAUSE
              `mx-auto` lived on the SAME element as `inset-x-0` — CSS only
              takes that shortcut when both margins are auto. Task 35 split
              this into a wrapper (this PositionedBlock) + inner figure
              (QuoteWidget's own `mx-auto max-w-xl` element) and, since the
              wrapper's own margins are the default 0 (not auto), `left:0;
              right:0` alone forced it to the full 1600px viewport width —
              invisible, but still hit-testable, silently eating
              Tasks/Notes/Timer/the gear's clicks wherever it vertically
              overlapped them — patched at the time with `pointer-events-none`
              on this wrapper (safe only because QuoteWidget has no
              interactive children).
              That patch, though, is what broke long-press: the wrapper is
              also PositionedBlock's own `[data-block-id="quote"]` element —
              the exact node both `useLongPress` hit-tests against (`e.target
              .closest('[data-block-id]')`, which finds nothing through a
              pointer-events-none ancestor since the pointerdown never lands
              on it at all) and `ArrangeController.measureAll` measures for
              the drag outline (returning the full viewport width, pinning the
              drag's x to the degenerate clamp midpoint).
              Review fix I3 then replaced that with `left-1/2
              -translate-x-1/2` (no `inset-x-0`), reasoning it was safe
              because QuoteWidget has no `position: fixed` descendants of its
              own to break. True as far as it went — but the bookmarks-bar
              popover-stacking bug (same task family as this one, see the
              bookmarks PositionedBlock above) proved the SAME class also
              turns this wrapper into a new STACKING CONTEXT, independent of
              whether anything inside it is `position: fixed`. This wrapper
              currently has no fixed/z-indexed descendants, so today it's
              inert — but it's the identical landmine, and the fix is the
              identical pattern: `inset-x-0 mx-auto w-fit` centers via equal
              auto margins (CSS resolves this the same way `mx-auto
              max-w-xl` did pre-Task-35 — see above — because `width` being a
              specified value, here `fit-content` rather than `36rem`, is
              what makes the auto-margin-centering branch apply at all)
              without ever creating a containing block OR a stacking context.
              `w-fit` reproduces the same shrink-to-fit box QuoteWidget's own
              `max-w-xl`-capped figure already establishes (pixel-equivalent
              to the `-translate-x-1/2` box it replaces — same shrink-to-fit
              sizing, just resolved via `width` instead of `translate`), so
              it stays no wider than its visible content: still nothing for
              it to intercept over the flanking pills (pointer-events stay
              default `auto`), and still shrink-to-fit for `useLongPress`'s
              `[data-block-id]` hit test and `ArrangeController.measureAll`'s
              drag-outline measurement — both keyed off this element's own
              rendered box, unaffected by which CSS property produced it.
            */}
            <PositionedBlock
              id="quote"
              pos={layout?.quote}
              className="fixed inset-x-0 bottom-6 short:bottom-2 xshort:bottom-1 mx-auto w-fit"
            >
              <QuoteWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <Drawer open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
            <DrawerBoundary>
              <SettingsPanel onArrangeLayout={requestArrange} open={settingsOpen} />
            </DrawerBoundary>
          </Drawer>

          <WidgetBoundary name="palette">
            <PaletteHost onOpenSettings={() => setSettingsOpen(true)} arranging={arranging} />
          </WidgetBoundary>
        </div>

        {/* Rendered last so its z-[60] overlay paints above every widget
            above (per Task 36's brief) — and OUTSIDE the inert wrapper, so
            it (and its Done/Reset/outline buttons) stays fully interactive
            while everything under it goes inert. Off by default (mode starts
            'off' and renders null) — the unarranged page is untouched.
            `onModeChange` is how App learns when to flip `arranging` — see
            the comment on that state above. `openSignal` is the Settings
            "Arrange layout" entry point (Task 37) — see `requestArrange`. */}
        <ArrangeController
          onDraftChange={setDraft}
          onModeChange={setArranging}
          openSignal={arrangeSignal}
        />
      </DraftLayoutContext.Provider>
    </main>
  )
}
