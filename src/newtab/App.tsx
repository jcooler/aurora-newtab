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
          {/* The centred column is now bounded to the reserved central strip
              (`--center-reserve` — index.css, the widest default centred
              member + breathing, the forced-wide clock governing at 425px) and
              auto-centred, so the flowing rails on either side (below) have a
              guaranteed clear strip to stop against. It stayed viewport-centred
              (symmetric bound, `mx-auto`) — canvas identity untouched — and
              this is also what retired Greeting's old min-[1593px] width cap:
              the column bounds the greeting directly now. */}
          <div className="mx-auto flex h-full max-w-[var(--center-reserve)] flex-col items-center justify-center narrow:px-4">
            <WidgetBoundary name="clock">
              <PositionedBlock id="clock" pos={layout?.clock}>
                <Clock />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="greeting">
              {/* `min-w-0 max-w-full` on this flex-item wrapper is load-bearing
                  for the greeting's column bound: a flex item's default
                  min-width:auto (min-content of the greeting's nowrap text)
                  otherwise grows THIS wrapper to the full text width, and the
                  greeting's own `max-w-full` then resolves against the wrapper
                  (wide) instead of the centred column (457px). Constraining the
                  wrapper to the column makes the greeting's cap bind — see
                  Greeting.tsx's own min-w-0 note. Dropped on the arranged branch
                  (a stored pos is the user's own). */}
              <PositionedBlock id="greeting" pos={layout?.greeting} className="min-w-0 max-w-full">
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

          {/* ── LEFT RAIL ──────────────────────────────────────────────────
              Task 64. The left-hand data widgets stopped being individually
              pinned (`fixed left-8 top-[NNvh]`) and became a flowing two-column
              rail: a `fixed` <aside> pinned to the left edge, `--rail-w` wide
              (index.css — stops exactly on the center-reserve boundary), its
              cards stacked by flex flow so the board reflows at every window
              size. Column 1 (priority top->bottom): calendar, headlines,
              deploys. Column 2 (month grid + habits) appears only when the rail
              is wide enough for a second column — the `.rail-col2` container
              query (index.css) is the STRUCTURAL replacement for the old
              `max-[1593px]:hidden`; it reaches its 536px threshold at exactly
              100vw=1593, so the boundary still lands there with no magic number
              in source. Height pressure is relieved by whole-widget hides, not
              clipping (`short:`/`xshort:` — no scroll regions, no mid-card cut),
              so a card is either wholly shown or wholly gone. Each block still
              routes through PositionedBlock: a stored arrange-mode `pos` renders
              it `position: fixed` (leaving the flex flow, pinned to the user's
              own coords — "arranged pixels stay yours"), and the visibility
              classes here are DROPPED on that branch so an arranged widget is
              never hidden by width/height. The `@container` lives on this
              <aside>; `container-type: inline-size` does NOT trap
              `position: fixed` descendants — the CSSWG formally resolved that
              container-type does not impose layout containment's
              containing-block rule on positioned descendants (csswg-drafts#10544,
              2024-07-24; Chrome 129+ ships it intentionally, spec prose lags,
              MDN correction in mdn/content#43405), so an arranged col-2 widget
              nested here still positions against the viewport (verified with a
              real-Chromium probe). LAW: never add `contain: layout` / transform
              / filter / will-change to a zone — any of those WOULD trap the
              fixed arranged widgets and corrupt every user's saved layout (full
              writeup on index.css's `.rail-col2` rule; Task 65 owes a dedicated
              pinned probe "arranged widget inside a zone renders at true
              viewport percent").

              HEIGHT PRIORITY (per-widget, MEASURED at each tier's INTERIOR
              WORST CASE — its MINIMUM height, because the bottom pills/quote are
              bottom-anchored and rise as the window shrinks; the MECHANISM +
              this priority are binding, Task 65's occlusion probes pin the exact
              cutoffs): col1 keeps CALENDAR at every height (worst ~78px, always
              clears); HEADLINES trims to its first 3 rows on short so the card
              can't grow over the Notes pill at the tier's 451px floor (see
              RssWidget's RSS_SHORT_ROWS math) and drops entirely on xshort;
              DEPLOYS drops on short. col2 (month + habits, 627px worst stack)
              drops below 740h so it clears the bottom quote by >=16px at the
              gate's own minimum — see the .rail-col2 height gate in index.css.
              Right rail states its own. */}
          <aside data-zone="left" className="fixed left-8 top-[var(--rail-top-left)] w-[var(--rail-w)]">
            <div className="flex flex-row items-start gap-4">
              <div className="flex flex-col gap-4">
                <WidgetBoundary name="ics">
                  <PositionedBlock id="ics" pos={layout?.ics}>
                    <CalendarWidget />
                  </PositionedBlock>
                </WidgetBoundary>
                <WidgetBoundary name="rss">
                  <PositionedBlock id="rss" pos={layout?.rss} className="xshort:hidden">
                    <RssWidget />
                  </PositionedBlock>
                </WidgetBoundary>
                <WidgetBoundary name="vercel">
                  <PositionedBlock id="vercel" pos={layout?.vercel} className="short:hidden xshort:hidden">
                    <VercelWidget />
                  </PositionedBlock>
                </WidgetBoundary>
              </div>
              <div className="flex flex-col gap-4">
                <WidgetBoundary name="monthCal">
                  <PositionedBlock id="monthCal" pos={layout?.monthCal} className="rail-col2">
                    <MonthCalWidget />
                  </PositionedBlock>
                </WidgetBoundary>
                <WidgetBoundary name="habits">
                  <PositionedBlock id="habits" pos={layout?.habits} className="rail-col2">
                    <HabitsWidget />
                  </PositionedBlock>
                </WidgetBoundary>
              </div>
            </div>
          </aside>

          {/* ── RIGHT RAIL ─────────────────────────────────────────────────
              The mirror of the left rail: a single flowing column of the three
              code-forge connectors, pinned to the right edge (`right-8`) and
              right-aligned (`items-end`) so the cards hug the margin exactly as
              their old `right-8` pins did. Same PositionedBlock/arrange contract
              as the left rail. HEIGHT PRIORITY (per-widget, MEASURED at each
              tier's INTERIOR WORST CASE — its MINIMUM height, since the Tasks
              pill is bottom-anchored and rises as the window shrinks, not the
              tier boundary): ALL THREE drop on short. At the short tier's own
              451px floor the Tasks pill top is at 397 and this column starts at
              rail-top-right 180 with only 217px of room — github's 235px worst
              case alone overruns it (bottom 415 > 397, swallowing the pill's
              click), and a connector glance-card can't trim below one card here,
              so the right rail is empty on short/xshort. RESIDUAL for Task 65
              (ledgered): ABOVE the short tier, at ~600-848px tall with all three
              connectors at display max, the 615px column still laps the Tasks
              pill (no `short` fires >600h) — the occlusion probes must pin it,
              via a mid-height tier or per-widget row trim. */}
          <aside data-zone="right" className="fixed right-8 top-[var(--rail-top-right)] flex w-[var(--rail-w)] flex-col items-end gap-4">
            <WidgetBoundary name="github">
              <PositionedBlock id="github" pos={layout?.github} className="short:hidden xshort:hidden">
                <GithubWidget />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="gitlab">
              <PositionedBlock id="gitlab" pos={layout?.gitlab} className="short:hidden xshort:hidden">
                <GitlabWidget />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="jira">
              <PositionedBlock id="jira" pos={layout?.jira} className="short:hidden xshort:hidden">
                <JiraWidget />
              </PositionedBlock>
            </WidgetBoundary>
          </aside>

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
