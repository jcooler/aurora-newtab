import { useCallback, useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../lib/hooks/useStoredKey'
import { applyPanelColor } from '../theme/index'
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
import CryptoWidget from './widgets/crypto/CryptoWidget'
import CalendarWidget from './widgets/calendar/CalendarWidget'
import HabitsWidget from './widgets/habits/HabitsWidget'
import MonthCalWidget from './widgets/monthcal/MonthCalWidget'
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
  // Task 55 (combined-defaults gate) — same mirrored-state idiom as
  // `bookmarksPopoverOpen` above, one paragraph up, for the identical
  // structural reason: WeatherWidget's own expanded panel is `fixed`
  // (via this wrapper), which unconditionally opens a new stacking
  // context, so WeatherWidget's internal z-index can never win against a
  // SIBLING PositionedBlock's own stacking context — only this wrapper's
  // own class can. Every connector widget mounts LATER in this file than
  // weather does, so at matched (auto) stacking a connector card that the
  // expanded panel geometrically covers would paint on top of it — the
  // gate caught exactly that (github ended up `onTop: false` under the
  // expanded panel at 1600x900). See WeatherWidget's own comment on
  // `onExpandedChange` for the full writeup.
  const [weatherExpanded, setWeatherExpanded] = useState(false)
  // Final-review fix wave, Fix 1 — same mirrored-state idiom as
  // `weatherExpanded` above, one paragraph up, for the identical structural
  // reason, for the three ALWAYS-AVAILABLE panels rather than a toggle-
  // gated connector-adjacent one: NotesWidget/TodoWidget/TimerWidget's own
  // open panels are each rendered inside a `fixed` PositionedBlock wrapper
  // (an unconditional new stacking context), and every connector
  // PositionedBlock mounts LATER in this file than notes/tasks/timer do, so
  // at matched (auto) stacking a connector card an open panel geometrically
  // covers would paint ON TOP of it — confirmed by a real-Chromium
  // whole-plan-review probe against the actual overlapping connectors
  // (Notes under Vercel's card, Tasks under Jira's, Focus-timer under
  // Calendar's). See each widget's own `onOpenChange` comment for the full
  // writeup.
  const [notesOpen, setNotesOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [timerOpen, setTimerOpen] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  // Tracks whether the PREVIOUS render had `arranging` true, so the
  // focus-restore effect below only fires on a real on->off transition, never
  // on mount (where `arranging` already starts false and body legitimately
  // has focus on a fresh page load).
  const wasArrangingRef = useRef(false)

  // Re-tint every widget surface whenever the stored panelColor changes (Task
  // 60 — themes collapsed into this one live customizer). null restores the
  // themes.css :root default; see applyPanelColor for the derived fg/scheme.
  useEffect(() => {
    if (settings) applyPanelColor(document.documentElement, settings.panelColor)
  }, [settings?.panelColor])

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

              `weatherExpanded`-gated `z-30` (Task 55) — ONLY while the
              panel is open, same conditional shape as the bookmarks
              wrapper's own `bookmarksPopoverOpen`-gated `z-50` above, and
              the same z-30 value TodoPanel/NotesPanel/TimerWidget's own
              expanded-state panels already use. Idle, this wrapper stays
              at z-index:auto — unchanged from before this fix, and no
              different from any other connector card's own wrapper.
            */}
            <PositionedBlock
              id="weather"
              pos={layout?.weather}
              className={`fixed right-4 top-[var(--top-band)]${weatherExpanded ? ' z-30' : ''}`}
            >
              <WeatherWidget onExpandedChange={setWeatherExpanded} />
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
                one row under the bar. See index.css's `--top-band`.

                `timerOpen`-gated `z-30` (final-review fix wave, Fix 1) —
                ONLY while the panel is open, same conditional shape as
                weather's own `weatherExpanded`-gated `z-30` above. Idle,
                this wrapper stays at z-index:auto — unchanged from before
                this fix. */}
            <PositionedBlock
              id="timer"
              pos={layout?.timer}
              className={`fixed left-4 top-[var(--top-band)]${timerOpen ? ' z-30' : ''}`}
            >
              <TimerWidget onOpenChange={setTimerOpen} />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="notes">
            {/* `notesOpen`-gated `z-30` (final-review fix wave, Fix 1) — see
                the timer PositionedBlock's own comment just above for the
                shared rationale; this is the pair the reviewer's own probe
                found first (Notes panel painting under Vercel's card). */}
            <PositionedBlock
              id="notes"
              pos={layout?.notes}
              className={`fixed bottom-4 left-16${notesOpen ? ' z-30' : ''}`}
            >
              <NotesWidget onOpenChange={setNotesOpen} />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="todo">
            {/* `tasksOpen`-gated `z-30` (final-review fix wave, Fix 1) — see
                the timer PositionedBlock's own comment above for the shared
                rationale; this is the pair the reviewer's own probe found
                (Tasks panel painting under Jira's card). */}
            <PositionedBlock
              id="tasks"
              pos={layout?.tasks}
              className={`fixed bottom-4 right-16${tasksOpen ? ' z-30' : ''}`}
            >
              <TodoWidget onOpenChange={setTasksOpen} />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="rss">
            {/* DEFAULT placement — the left-middle column, clear of the Notes
                pill (bottom-left) and the photo refresh button at defaults, and
                well left of the centred clock/greeting column.

                `top-[24vh]` (216px at 1600x900) — moved DOWN 2vh from the old
                `top-[22vh]` (198px) by Jon's darker-color ruling (this batch),
                which turned RssWidget from bare photo-floating text into a
                SOLID CARD (bg-panel-solid + rounded-2xl + shadow-lg + p-2.5 —
                see RssWidget.tsx). Carding adds padding+radius height, so the
                whole left column was re-measured from the real harness and the
                two carded slots (ics above, rss here) re-derived to hold every
                floor >=16px at each widget's WORST case. MEASURED
                (scripts/preview.mjs, 1600x900, rss at its shownCount=8 display
                max, ics carded above, vercel below): ics carded bottom 195 ->
                21px gap -> rss top 216; rss carded 8-row bottom 552 -> 24px gap
                -> vercel top-[64vh]=576. Both clear the >=16px floor with real
                margin — vercel itself did NOT have to move (its 60px gap to the
                quote below absorbed nothing; the room came from tightening the
                cards' own chrome to p-2.5 + gap-1 rows, RssWidget.tsx's own
                comment). A stored arrange-mode `pos` still wins (PositionedBlock
                drops this className on that branch). RssWidget self-gates on the
                connector's enabled+feeds state, so this wrapper renders an
                empty box until the connector is turned on — same as every other
                toggle-gated peripheral here. No `translate`: this widget has no
                `position: fixed` descendants, but the house rule is to keep
                default-placement wrappers transform-free (App's quote/bookmarks
                comments), so it anchors with a plain top offset. */}
            <PositionedBlock id="rss" pos={layout?.rss} className="fixed left-8 top-[24vh]">
              <RssWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="monthCal">
            {/* DEFAULT placement — Task 58, the TOP of the mid-left SECOND
                column (`left-[23rem]`, x-aligned with HabitsWidget directly
                below it — see that PositionedBlock's own comment for how
                THAT half of the column is derived; THIS widget's own width,
                `w-[200px]`, now matches habits' own width too — Task 63
                narrowed habits from `w-56`/224px to the same `w-[200px]`,
                closing the gap the wide-clock fix below opened between the
                two; see habits' own comment for that correction's
                arithmetic and the re-review recommendation behind it).
                Task 57 shipped habits
                alone at a PROVISIONAL `top-[43vh]`, explicitly flagged for
                re-measurement once this task's own widget landed above it;
                this pass is that re-derivation, and it moves BOTH tops, not
                just this one, because the two widgets' worst-case heights
                don't leave room for a stack starting anywhere near either
                task's original guess.

                LEFT EDGE CORRECTED (Task 59): `left-[21rem]` (336px) was
                derived against RSS's own column right edge (`left-8 w-72` =
                32-320px), the only left-column neighbor either isolated
                fixture seeded. Task 59's combined-defaults gate — the first
                to render every widget, including vercel, at once — found
                habits' 336px-wide left edge actually OVERLAPPING vercel's
                card (`left-8 w-80` = 32-352px, 32px WIDER than RSS/ics)
                whenever both are on: vercel's own worst-case band (576-768,
                5 deployments) crosses habits' band (378-622), and 336 sits
                16px INSIDE vercel's 352px right edge. The left column's true
                governing width is whichever of ics/rss/vercel is widest —
                vercel, not RSS — so this column's own left edge now clears
                vercel's box instead: `left-[23rem]` (368px) = 352 (vercel's
                right edge) + 16 (this file's own floor). RSS's own gap
                widens to a non-binding 48px as a result — see
                scripts/preview.mjs's own combined-defaults gate (the
                `mid-left column gap floor` block) for the live-measured
                proof against both neighbors, and habits' own PositionedBlock
                comment below for its matching correction.

                THE ARITHMETIC THAT FORCES THE WHOLE COLUMN UP: MonthCalWidget
                at its own worst case (a 6-row month — May/August 2026 and
                others, see monthGrid.ts's own doc comment; forced in the
                harness via prev/next clicks so this is never a shorter
                stand-in) measures 247px tall (nav row + caption + 6x7 grid).
                HabitsWidget at ITS OWN worst case (6 chips, MAX_HABIT_CHIPS)
                measures 244px. Stacked with the file's usual >=16px floor on
                both sides of the seam, that's 247+16+244+16 = 523px of
                required vertical span between MonthCalWidget's own top and
                the links row below habits — and the links row (with
                worldClocks/countdown/timer on, the harness's own steady
                state) sits at y=654.5 at 1600x900. That caps this widget's
                own top at 654.5-523 = 131.5px: starting any lower leaves the
                pair unable to clear the links row at both worst cases
                simultaneously, no matter where the seam between them falls
                — Task 57's own `43vh` (387px) for habits ALONE already
                overshoots that budget before this widget even enters the
                picture (see its PositionedBlock's own comment for that
                widget's history).

                `top-[12vh]` (108px) was picked, among the values clearing
                that 131.5px ceiling, for landing HabitsWidget's own new top
                (below) on a clean whole-vh number too — the same
                walk-the-whole-vh-search-space-by-hand discipline every other
                placement comment in this file uses (see e.g. github's own).
                MEASURED (scripts/preview.mjs's monthCal block, 1600x900,
                monthCal forced to a real 6-row month, habits seeded at its
                own 6-chip max, worldClocks+countdown+timer on): this widget
                top=108/bottom=355 (still current — this widget's own
                placement is untouched by every task below this one);
                HabitsWidget top=378/bottom=622 AT THE TIME (`top-[42vh]`,
                since moved to `top-[43vh]`/387-631 by Task 63 — see its own
                comment for the current numbers and why); gaps AT THE TIME —
                this widget's bottom to habits' top: 23px (now 32px);
                habits' bottom to the links row: 32.5px (now 23.5px); RSS's
                own column right edge to this widget's left edge (no
                longer the binding constraint, Task 59): exactly 48px (368 vs
                rss.right 320, still current — a fixed Tailwind-width
                relationship neither task touched). The right-edge-to-clock
                number that USED to
                sit here (592 vs clock.left 635.5) was measured at whichever
                hour the wall clock happened to show at the time — see the
                WIDE-CLOCK paragraph below for why that made it wrong, and
                for the number that replaced it.

                WIDE-CLOCK FIX (post-Task 62, MERGE-BLOCKING — diagnosed
                across two reviews): Clock.tsx's tabular-nums clock is
                horizontally CENTERED and renders a DOUBLE-digit hour
                ("10:44"/"11:44"/"12:44") for roughly half of every 12-hour
                cycle (settings.use24Hour defaults false) — one digit-glyph
                WIDER than the single-digit hours ("9:44") every prior
                measurement in this file happened to run at. Centering means
                the extra glyph pushes the clock's own LEFT edge further
                left, not just its right edge further right — 635.5 above was
                a single-digit-hour reading; scripts/preview.mjs's own
                deterministic forced-wide-clock block (Playwright's
                `page.clock.setFixedTime`, forced to a real 10:44 — 10/11/12
                all measure identically under tabular-nums, so which one is
                picked doesn't matter) measures the clock's REAL worst-case
                left edge at 587.5px — 48px further left than the
                single-digit reading, and 4.5px INSIDE the OLD `w-56`
                (224px) card's 592px right edge, an actual collision
                (`monthCal/clock` in the combined-defaults gate's pairwise
                set) invisible at every single-digit hour. Fixed by
                narrowing THIS widget's own width from `w-56` (224px) to
                `w-[200px]` — right edge 368+200=568px, clearing the
                MEASURED worst-case clock.left (587.5px) by 19.5px, still
                >=16px with real (if modest) margin, not shaved to the exact
                floor. HabitsWidget's own `w-56` was left UNTOUCHED by THIS
                fix — its whole vertical band (378-622 at the time) sat
                BELOW the clock's real measured bottom edge (377.5px, itself
                measured for the first time by this same forced-wide block —
                earlier comments estimated it near monthCal's own 355px
                bottom without live-measuring it) rather than beside it, so
                it never shared this widget's clock-width collision. That
                said, the measured clock-to-habits clearance was only 0.5px
                (377.5 to 378) — real but thin, flagged in the report this
                fix landed with as a concern for the controller rather than
                fixed blind. Task 63 (the wrap task) acted on that flag
                together with the re-review's own column-alignment
                recommendation: habits' top moved `42vh`->`43vh` (378->387px,
                clock gap 0.5px->9.5px) and its width now matches THIS
                widget's `w-[200px]` (368+200=568, IDENTICAL to this widget's
                own right edge — the 568-vs-592 mismatch this paragraph used
                to describe as an accepted asymmetry is gone; see habits' own
                comment for the full re-derivation). Asserted permanently,
                every run, regardless of
                the hour the wall clock shows: scripts/preview.mjs's own
                dedicated forced-wide-clock block (immediately after the
                monthCal block it re-uses the seeding shape of), which forces
                the clock to 10:44, re-measures both this widget's right edge
                and habits' top against the clock's real rendered box, and
                restores real time before continuing.

                FINAL-REVIEW FIX WAVE, MERGE-BLOCKING (post-Task 59): the
                widget's own "Today" snap-back control used to render on its
                OWN line below the nav row (only while viewing an off-current
                month), adding 21px of card height whenever it appeared —
                collapsing THIS seam from 23px to 2px in any off-current
                6-row month, and invisible to every harness run on a date
                where the CURRENT month already happened to be 6-row (this
                repo's own August 2026 reference worst case), since the
                forcing loop then made zero Next clicks and never rendered
                the off-current state at all. Fixed by moving the control
                INSIDE the nav row itself (MonthCalWidget.tsx's own doc
                comment), next to the month label — navigating now changes
                WHICH controls that row holds, never how TALL the row is, so
                the 247px worst case and every number above are the exact
                SAME ones Task 58 measured, unchanged by this fix (a true
                zero-height guarantee, not a re-derivation): re-measured
                after the fix by scripts/preview.mjs's own monthCal block AND
                the combined-defaults gate, both of which now force the
                off-current state deterministically (an unconditional first
                Next click before the 42-cell forcing loop, on every run,
                every date) and assert the header's own measured height is
                identical with the Today control present vs. absent.

                A stored arrange-mode `pos` still wins (PositionedBlock drops
                this className on that branch). MonthCalWidget self-gates on
                settings.widgets.monthCal alone (no data-emptiness check —
                unlike habits/worldClocks, there's nothing to be "empty",
                the calendar always has a month to show), so this wrapper
                renders an empty box until the toggle is on — same as every
                other toggle-gated peripheral here. Transform-free per the
                house rule (App's quote/bookmarks comments): a plain
                left/top offset, no translate. */}
            <PositionedBlock id="monthCal" pos={layout?.monthCal} className="fixed left-[23rem] top-[12vh] w-[200px]">
              <MonthCalWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="habits">
            {/* DEFAULT placement — Task 57 shipped this in the mid-left
                SECOND column (not a new column of its own): between the RSS
                column and the centered clock/greeting stack, a slot the plan
                reserves for habit chips with Task 58's month grid ABOVE them.
                Task 57's own top (`43vh`) was explicitly PROVISIONAL, pending
                Task 58 re-measuring the two jointly — this comment documents
                that re-derivation landing (Task 58), which moved BOTH this
                widget's top AND MonthCalWidget's own (see that
                PositionedBlock's comment, directly above, for the arithmetic
                that forces the whole column up: the two widgets' combined
                worst-case heights plus two 16px floors is 523px, capping
                MonthCalWidget's own top at 131.5px — well above Task 57's
                original 43vh/387px for THIS widget alone).

                `left-[23rem]` (368px at 1600x900) is Task 59's correction of
                Task 57/58's `left-[21rem]` (336px): that number was pinned
                against RSS's own card (`left-8 w-72` = 32-320px), the only
                left-column neighbor either isolated fixture ever seeded, but
                the left column's actual WIDEST card is vercel's (`left-8
                w-80` = 32-352px, see VercelWidget.tsx — 32px wider than
                RSS/ics). Task 59's combined-defaults gate — the first to
                render vercel and habits together — found 336px sat 16px
                INSIDE vercel's 352px right edge whenever both are on
                (vercel's own worst-case band, 576-768 at 5 deployments,
                crosses this widget's band, 378-622). `left-[23rem]` = 352
                (vercel's right edge) + 16 (this file's own floor everywhere
                else) clears BOTH left-column neighbors; RSS's own gap widens
                to a non-binding 48px as a result. Asserted (not just
                computed) by scripts/preview.mjs's own monthCal block (which
                owns this measurement jointly with monthCal's) AND, against a
                live vercel render, by the combined-defaults gate's own
                `mid-left column gap floor` block.

                `top-[43vh]` (387px) is Task 63's (the wrap task's) own
                correction of Task 58's `42vh` (378px), acting on the
                re-review's pixel-measured recommendation: the wide-clock fix
                (Task 62) found this widget's clock-to-top clearance at `42vh`
                was only 0.5px against the clock's REAL forced-wide bottom
                edge (377.5px) — real but thin, flagged in that fix's own
                report as a concern rather than fixed blind (see
                MonthCalWidget's own PositionedBlock comment, "WIDE-CLOCK
                FIX", for that history). `43vh` restores Task 57's original
                whole-vh value, this time verified against the SAME
                forced-wide clock rather than Task 57's own single-digit-hour
                reading. MEASURED (scripts/preview.mjs's monthCal block AND
                its dedicated forced-wide-clock block, 1600x900,
                MonthCalWidget forced to a real 6-row month, this widget
                seeded at its own 6-chip MAX_HABIT_CHIPS worst case,
                worldClocks+countdown+timer on): this widget top=387/
                bottom=631; gap above (to MonthCalWidget's own bottom, 355):
                32px; gap below (to the links row, 654.5): 23.5px; clock gap
                (forced-wide clock.bottom 377.5 to this widget's top 387):
                9.5px, up from the thin 0.5px the old `42vh` reading left;
                left edge exactly 48px off RSS's own column right edge (368
                vs rss.right 320, not the binding constraint — see this
                widget's own left-edge paragraph above) and exactly 16px off
                vercel's own column right edge (368 vs vercel.right 352, the
                REAL binding constraint, live-measured by the
                combined-defaults gate's own `mid-left column gap floor`
                block since vercel isn't part of this isolated fixture).
                Every floor clears with real margin, not shaved to the edge
                — same discipline Task 57/58's own corrections established.

                WIDTH changed by Task 63 from `w-56` (224px) to `w-[200px]`,
                matching MonthCalWidget's own width above — the re-review's
                second recommendation, acted on together with the top move:
                narrowing was never required by the wide-clock fix itself
                (this widget's band never shared MonthCalWidget's
                clock-width collision, sitting below the clock's real
                measured bottom edge regardless of width — see
                MonthCalWidget's own "WIDE-CLOCK FIX" paragraph), but the
                568-vs-592 right-edge stagger that fix's narrowing of
                MonthCalWidget alone left behind read as unintentional, not
                a deliberate design choice. Right edge now 368+200=568px,
                IDENTICAL to MonthCalWidget's own — the mid-left column's two
                widgets share one right edge again. Labels still truncate
                safely at the narrower width (`truncate` on the name span,
                unchanged in HabitsWidget.tsx) — verified against the
                widgets-habits.png capture at the 6-chip worst case,
                including the deliberately long "Practice deep breathing..."
                fixture name, no visible crowding.
                HabitsWidget self-gates on
                settings.widgets.habits + a non-empty habits list, so this
                wrapper renders an empty box until at least one habit exists
                — same as every other toggle-gated peripheral here.
                Transform-free per the house rule (App's quote/bookmarks
                comments): a plain left/top offset, no translate. */}
            <PositionedBlock id="habits" pos={layout?.habits} className="fixed left-[23rem] top-[43vh] w-[200px]">
              <HabitsWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="github">
            {/* DEFAULT placement — the right-middle column, mirroring the RSS
                widget on the left, and the TOP of a three-card stack (gitlab,
                then jira, below it — see their own comments).

                `top-[21vh]` (189px at 1600x900) — history in three stages,
                each a review-caught regression fix, not a single design
                pass: Task 55's own combined-defaults gate first shipped this
                at `24vh` (216px), defended only against each connector's own
                DEFAULT-shaped fixture (2 PRs/2 issues, 2 MRs, 3 issues), not
                each widget's own display MAX — review caught jira's real
                MAX_ISSUES=5 card colliding with the bottom-right Tasks pill.
                FIX ROUND 1 lowered every right-column display cap (glance
                panels, not full lists — GithubWidget's own MAX_PRS/
                MAX_ISSUES comment has the rationale) and moved this to
                `14vh` (126px) — the lowest value that both cleared the
                collapsed weather chip's bottom AND left room for gitlab/jira
                below at their OWN new (still nonzero) display maxes.
                FIX ROUND 2 (this comment's numbers) caught that `14vh` was
                only ever pinned against the weather chip's OBSERVED bottom
                (~120px, whatever that day's live Open-Meteo fetch happened
                to return) — the chip is variable-height (WeatherWidget.tsx:
                a rain-callout line whenever any forecast hour has
                precipProb >= NOTABLE_PRECIP, a routine 30% threshold; a
                stale/offline line whenever the cache is >=30min old or a
                fetch fails), and its REAL, deterministically-forced worst
                case measures **164px** (scripts/preview.mjs's "Weather chip
                WORST-CASE height probe" — seeds a forced `weatherCache` plus
                blocks the live network route so the forced state can't be
                clobbered by a real refetch, rather than trusting the day's
                actual weather). At `14vh` (126px), that put github 38px
                INSIDE the chip's real worst-case span.

                Fixed again as a design change, not a point patch, with TWO
                levers this round (both from the controller ruling that
                scoped it): GithubWidget's `MAX_PRS` dropped one more row
                (3->2 — its own comment has the exact rationale), AND all
                three right-column cards' own CHROME was trimmed modestly
                (`p-4`->`p-3`, header `mb-2`->`mb-1.5` in each widget file —
                a deliberate, screenshot-verified visual change, not a shape
                change; vercel, on the left column and not part of this
                budget, was left untouched). Re-derived BY MEASUREMENT again
                (probe-logged, never a side script):

                  · MEASURED at 1600x900, every right-column widget at its
                    own (fix-round-2) display max, tightened chrome: github
                    top 189 / bottom 424 (height 235, 2 PRs + 2 issues);
                    gitlab top 450 / bottom 624 (height 174, 3 MRs); jira top
                    648 / bottom 822 (height 174, 3 issues); the Tasks pill's
                    own top sits at 846; the weather chip's forced worst-case
                    bottom sits at 164.
                  · Gaps (all probe-logged, all >=16px, all with real margin
                    this round — not shaved to the exact floor): weather
                    chip->github 25px, github->gitlab 26px, gitlab->jira
                    24px, jira->Tasks-pill 24px.
                  · `21vh` (189px) was picked, among the whole-vh values that
                    clear the chip's 164px floor by any margin, for the
                    combination that ALSO lands gitlab and jira on their own
                    clean whole-vh values below with comfortable (not
                    knife-edge) margin on every floor — the same
                    walk-the-whole-vh-search-space-by-hand discipline fix
                    round 1 used, just re-run against the new, taller weather
                    floor and the trimmed card heights.

                `right-8` anchor keeps it clear of the centred clock/greeting
                column and the bottom-right Tasks pill / settings gear. A
                stored arrange-mode `pos` still wins (PositionedBlock drops
                this className on that branch). GithubWidget self-gates on
                the connector's enabled+token state, so this wrapper renders
                an empty box until the connector is connected — same as
                every other toggle-gated peripheral here. Transform-free per
                the house rule (App's quote/bookmarks comments): a plain
                top/right offset, no translate. */}
            <PositionedBlock id="github" pos={layout?.github} className="fixed right-8 top-[21vh]">
              <GithubWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="gitlab">
            {/* DEFAULT placement — the right-middle column, BELOW the GitHub
                widget's own default slot (`top-[21vh]` as of Task 55 fix
                round 2 — see its own PositionedBlock comment for the full
                writeup and the measured arithmetic behind every number
                here).

                `top-[50vh]` (450px at 1600x900) — history: originally
                `46vh`, moved to `54vh` by Task 55's own combined-defaults
                gate, `54vh` -> `48vh` in fix round 1 (moved github up and
                lowered every right-column widget's display cap), then
                `48vh` -> `50vh` in fix round 2 (github moved up again, from
                14vh to 21vh, once review found the collapsed weather chip's
                REAL worst-case height — 164px, not its lucky-observed
                ~120px — see github's own comment for the full writeup).
                MEASURED (fix round 2, scripts/preview.mjs's combined-
                defaults gate, probe-logged): with github at its OWN display
                max (2 PRs + 2 issues, tightened chrome, bottom 424px) and
                gitlab at ITS OWN display max (3 MRs, tightened chrome,
                height 174px), `50vh` (450px) opens a real 26px gap below
                github's max-height card — comfortably over the 16px floor,
                not shaved to it. Shares github's `right-8` anchor so a
                reader who connects both sees them stacked as one column
                rather than overlapping. A stored arrange-mode `pos` still
                wins (PositionedBlock drops this className on that branch).
                GitlabWidget self-gates on the connector's enabled+token+
                instanceUrl state, so this wrapper renders an empty box until
                the connector is connected — same as every other
                toggle-gated peripheral here. Transform-free per the house
                rule (App's quote/bookmarks comments): a plain top/right
                offset, no translate. */}
            <PositionedBlock id="gitlab" pos={layout?.gitlab} className="fixed right-8 top-[50vh]">
              <GitlabWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="jira">
            {/* DEFAULT placement — the right column, lower still: BELOW both
                the GitHub (`top-[21vh]`) and GitLab (`top-[50vh]`) default
                slots (both as of Task 55 fix round 2 — see their own
                PositionedBlock comments), sharing their `right-8` anchor so
                a reader who connects all three sees one stacked column
                rather than any overlap.

                `top-[72vh]` (648px at 1600x900) — history: originally
                `66vh`, moved to `72vh` by Task 55's own combined-defaults
                gate, `72vh` -> `71vh` in fix round 1 (the round THIS
                comment's history starts from: the shipped `72vh` collided
                with the bottom-right Tasks pill once jira actually rendered
                near its own display max — the gate that shipped it had only
                ever seeded jira with 3 of its then-current MAX_ISSUES=5,
                never the real worst case), then `71vh` -> `72vh` again in
                fix round 2 — landing back on the ORIGINAL Task-55-ship
                number, but by entirely different arithmetic, not a revert:
                fix round 2 moved github (and therefore gitlab, and
                therefore jira) further down the column once review found
                the collapsed weather chip's REAL worst-case height (164px,
                not fix round 1's lucky-observed ~120px — see github's own
                comment for the full writeup), while ALSO trimming every
                right-column card's chrome and github's own MAX_PRS to buy
                the room back. MEASURED (fix round 2, scripts/preview.mjs's
                combined-defaults gate, probe-logged, jira seeded at its OWN
                display max, 3 issues, tightened chrome): jira bottom 822px,
                Tasks pill top 846px — a real 24px gap, comfortably over the
                16px floor, probe-asserted by the same quantified
                `right-column gaps` check fix round 1 added (a boolean-only
                pairwise probe can prove "no overlap" but never "how much
                room is left," which is why that check exists at all). A
                stored arrange-mode `pos` still wins (PositionedBlock drops
                this className on that branch). JiraWidget self-gates on the
                connector's enabled+site+email+apiToken state, so this
                wrapper renders an empty box until the connector is
                connected — same as every other toggle-gated peripheral
                here. Transform-free per the house rule (App's quote/
                bookmarks comments): a plain top/right offset, no translate. */}
            <PositionedBlock id="jira" pos={layout?.jira} className="fixed right-8 top-[72vh]">
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
                down from RSS's existing `left-8 top-[24vh]` slot (moved
                from `top-[22vh]` when RSS was carded — Jon's darker-color
                ruling this batch; see the rss PositionedBlock comment). The
                centered column's LEFTMOST extent at any row is x=512
                (quote), well clear of a left-8/w-80 card's x=32-352 box, so
                stacking here is collision-free against the centered content
                by construction, not just at the tested fixture size.
                `top-[64vh]` clears RSS even at its OWN worst case, not
                just its default: RSS's shownCount is user-configurable
                3-8 (Connectors.tsx's SHOWN_COUNT_OPTIONS), and at 8
                headlines its solid card reaches y=552 at this viewport
                (vs y=432 at the default 5) — measured directly, not
                estimated, since the row math (gap-1 rows plus two text
                lines, inside the card's own p-2.5 padding — Jon's
                darker-color ruling carded this widget this batch) isn't
                obvious from the className alone. `top-[64vh]`
                (576px) clears that worst case by a measured 24.0px, and
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

          <WidgetBoundary name="crypto">
            {/* DEFAULT placement — a slim CENTERED strip, not another
                left/right column entry: unlike every other connector
                (RSS/GitHub/GitLab/Jira/Vercel, each a tall card anchored to
                a screen edge), CryptoWidget renders a single row capped at
                MAX_COINS=5 cells, so it reads best centered under the
                clock/search/focus/quote column rather than stacked into
                either side column. `left-[calc(50%-11rem)]` centers a
                w-88 (22rem) box — half of 22rem is 11rem — the same
                transform-free calc-centering technique PositionedBlock's own
                arrange-mode branch uses (App's quote/bookmarks comments:
                translate/transform on a `position: fixed` ancestor breaks
                any fixed-position DESCENDANT and creates an unwanted
                stacking context; CryptoWidget has neither today, but the
                house rule is calc-over-transform for every default-placement
                peripheral regardless).

                `top-[86vh]` (774px at the 900px launch viewport) is a
                MEASURED, CENTERED value — the second revision this
                placement has needed, both times by direct measurement in
                scripts/preview.mjs's own probe rather than class-name
                reasoning (the same "measure, don't assume" correction
                Vercel's own PositionedBlock comment documents for ITS
                placement):

                Revision 1 (initial ship) — the brief's own starting
                hypothesis, `top-[76vh]` (684px), landed INSIDE the links
                row's own vertical span once worldClocks + countdown are
                also on (both widgets the preview harness enables for its
                own captures, and either a real user could enable too).
                Corrected to `top-[85vh]` (765px), verified only against the
                gap BELOW (to quote) — the probe at the time asserted
                `pxGapBelow >= 16` but only a boolean, un-quantified
                non-overlap check against the links row above.

                Revision 2 (fix round 1, post-review) — the reviewer
                reproduced the exact harness state in a fresh Chromium
                session and measured `links.bottom = 762.5` (not the 752.5
                estimate revision 1's comment had used — the two-link seed's
                row wraps slightly differently than the ad hoc probe script
                that first produced 752.5), making 85vh's REAL gap above the
                strip 765 - 762.5 = **2.5px** — comfortably overlap-free by
                the old boolean check, but nowhere near a safe margin. The
                probe was rewritten to assert BOTH `pxGapAbove` and
                `pxGapBelow` quantified, each against an explicit >=8px floor
                (HALF this file's usual >=16px convention elsewhere — a
                deliberate exception: this is the tightest band on the page,
                42.5px total between two FIXED-HEIGHT single-line neighbors,
                against this widget's own ~20px single-line height, so
                there's no "worst case" growth to defend against the way
                RSS's shownCount or vercel's deployment count need, and
                arrange mode lets a user who dislikes the tight default
                simply drag it elsewhere).

                MEASURED (scripts/preview.mjs's crypto block, this run,
                1600x900, worldClocks+countdown+timer on, 2 configured
                links): `links.bottom = 762.5`, `quote.top = 804` — a
                41.5px band. `top-[86vh]` (774, bottom 794, the strip's own
                ~20px single-line height unchanged) splits that band's
                21.5px of slack as `pxGapAbove = 11.5px` and
                `pxGapBelow = 10.0px` — both over the 8px floor, both
                asserted and logged verbatim by the probe (not estimated).
                quote's own position is invariant to the worldClocks/
                countdown toggle (it's `bottom-6` off the viewport's bottom
                edge, not part of the centered column), so the below-margin
                holds regardless of what else is enabled; disabling
                worldClocks/countdown only SHRINKS the centered column and
                shifts it toward vertical center, which can only move
                links' own bottom edge UP (more clearance above, never
                less) — so the harder (widgets-on) case measured here is
                also safe for the default (both off) case. A stored
                arrange-mode `pos` still wins (PositionedBlock drops this
                className on that branch). CryptoWidget self-gates on the
                connector's enabled+coins state, so this wrapper renders an
                empty box until the connector is configured — same as every
                other toggle-gated peripheral here. Transform-free per the
                house rule: a plain left/top offset via calc(), no
                translate. */}
            <PositionedBlock id="crypto" pos={layout?.crypto} className="fixed left-[calc(50%-11rem)] top-[86vh]">
              <CryptoWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <WidgetBoundary name="ics">
            {/* DEFAULT placement — Task 54, MEASURED against the real
                harness (scripts/preview.mjs's own ics block, run in a real
                Chromium session — never a side script; a prior task shipped
                a 2.5px gap from side-script numbers and got caught), not
                estimated from class names. The brief's own starting
                hypothesis (`left-8 top-[62vh]`) is STALE — that slot is
                Vercel's as of Task 51 — and every other candidate the
                brief's controller ruling walked through (a band above RSS
                sharing the timer pill's row, the narrow strip beside the
                centered clock, the sliver between RSS's worst case and
                Vercel's top, above RSS sharing the bookmarks band, below
                Jira) either collided or left under the mandated 8px floor.

                `top-[13vh]` (117px at the 1600x900 launch viewport, timer
                widget on — the harness's own worst case, since the timer
                pill defaults OFF in production but the harness enables it,
                see its own top-of-file comment) sits in the one band that
                survived, BELOW the timer pill (fixed left-4
                top-[var(--top-band)]) and ABOVE RSS's own default top
                (`top-[24vh]` = 216px). RE-MEASURED for Jon's darker-color
                ruling (this batch), which turned CalendarWidget from bare
                photo-floating text into a SOLID CARD (bg-panel-solid +
                rounded-2xl + shadow-lg + p-2.5 — see CalendarWidget.tsx):
                carding grew the widget's height (p-2.5 padding + radius),
                so both this slot and RSS's below it were re-derived from the
                real harness. MEASURED (this run, both neighbors on,
                CalendarWidget at its own worst case — 1 next-line + 2 capped
                agenda rows, carded — and RSS at its shownCount=8 max, also
                carded): timer bottom = 100px, ics top = 117px (17.0px clear
                above); ics carded bottom = 195px (was 175 bare), rss
                top = 216px (21.0px clear below). CalendarWidget is capped by
                CONSTRUCTION at 1 next-line + 2 agenda rows (the controller's
                own amendment to the brief's original 4-row spec — see
                CalendarWidget.tsx's own doc comment), so there is no
                unbounded "worst case" height beyond what was just measured.
                The old 8px floor (a bare-text-tight-band exception, like
                CryptoWidget's own) was RAISED to this file's usual >=16px for
                this batch: now that both this widget and RSS are cards, the
                ruling required every re-derived left-column floor to clear
                16px, and the measured 17/21px gaps do (scripts/preview.mjs's
                ics gap probe now asserts >=16, not >=8). A stored
                arrange-mode `pos` still wins (PositionedBlock drops this
                className on that branch). CalendarWidget self-gates on the
                connector's enabled+url state, so this wrapper renders an
                empty box until the connector is configured — same as every
                other toggle-gated peripheral here. Transform-free per the
                house rule (App's quote/bookmarks comments): a plain
                left/top offset, no translate. */}
            <PositionedBlock id="ics" pos={layout?.ics} className="fixed left-8 top-[13vh]">
              <CalendarWidget />
            </PositionedBlock>
          </WidgetBoundary>

          <button
            ref={settingsButtonRef}
            type="button"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
            className="fixed bottom-4 right-4 rounded-full bg-panel-solid p-2 text-fg-muted shadow-lg shadow-black/25 backdrop-blur-sm transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
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
