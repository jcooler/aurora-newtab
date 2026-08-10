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
              this priority are binding, pinned by scripts/preview.mjs's rail +
              resize-sweep probes): col1 keeps CALENDAR at every height (worst
              ~132px — p-2.5 padding (20px) + the text-sm headline row (20px)
              + the list's mt-1 (4px) + up to 5 text-xs rows at 16px each
              with gap-0.5 between them (5*16 + 4*2 = 88px); the
              2026-08-10 ics-multi-calendar wave's 'per-calendar' view can
              show one row per configured calendar, up to MAX_CALENDARS=5
              (ics.ts) — the feature's true display max (CalendarWidget.tsx /
              scripts/preview.mjs's own true-max fixture), up from the old
              2-row MAX_AGENDA_ROWS cap this comment used to cite at ~78px —
              always clears); HEADLINES trims to its first RSS_MID_ROWS
              rows on mid and its first RSS_SHORT_ROWS on short so the card can't
              grow over the Notes pill at either tier's floor (see RssWidget's
              math) and drops entirely on xshort; DEPLOYS drops on mid AND short
              (Task 65: at display max vercel's bottom is 758, which laps the
              Notes pill — top height-54 — below ~812h and fails the 16px floor
              below 828h, so it drops across the whole 601-864 mid band — a
              documented simplification, since above 828h it would clear unaided;
              it was already gone on short).
              col2 (month + habits, 627px worst stack) drops below 740h so it
              clears the bottom quote by >=16px at the gate's own minimum — see
              the .rail-col2 height gate in index.css. Right rail states its own.

              WIDTH DISCIPLINE (the narrow-window board): the height tiers relieve
              vertical pressure; the WIDTH counterpart is `.rail-primary` (on col1
              here — ics/rss/vercel — and on the whole right column). When
              `--rail-w` drops below the widest primary card + 16px clearance
              (w-80 = 320 + 16 = 336px, at exactly 100vw = 1193 by the rail-w
              relation), the fixed-width card would overflow its zone toward the
              centred clock, so the whole primary column steps aside CSS-only via
              a container query (index.css) — the centred column alone is the
              board below 1193. Dropped on the arranged branch like every other
              rail class, so an arranged card is never width-hidden.

              TASK 65 — the 601-848h mid-height residual Task 64 ledgered is
              CLOSED by the `mid` tier (index.css, 601-864px): at the band's 601px
              interior worst the Notes pill top sits at 547 and, with vercel hidden
              + rss trimmed to RSS_MID_ROWS (bottom 510), the left column clears it
              by 37px; the right column (below) clears its Tasks pill likewise.
              MEASURED honestly (scripts/preview.mjs's mid-tier fencepost probe,
              which asserts BOTH edges 600/601 and 864/865 live): row trims alone
              could NOT save vercel (its 758 bottom overruns the pill even with rss
              fully hidden above it), so vercel WHOLE-widget-hides on mid, per the
              documented priority. */}
          <aside data-zone="left" aria-label="Left widget rail" className="fixed left-8 top-[var(--rail-top-left)] w-[var(--rail-w)]">
            <div className="flex flex-row items-start gap-4">
              <div className="flex flex-col gap-4">
                <WidgetBoundary name="ics">
                  <PositionedBlock id="ics" pos={layout?.ics} className="rail-primary tier-fade">
                    <CalendarWidget />
                  </PositionedBlock>
                </WidgetBoundary>
                <WidgetBoundary name="rss">
                  <PositionedBlock id="rss" pos={layout?.rss} className="rail-primary tier-fade xshort:hidden xshort:opacity-0">
                    <RssWidget />
                  </PositionedBlock>
                </WidgetBoundary>
                <WidgetBoundary name="vercel">
                  <PositionedBlock id="vercel" pos={layout?.vercel} className="rail-primary tier-fade dense:hidden dense:opacity-0">
                    <VercelWidget />
                  </PositionedBlock>
                </WidgetBoundary>
              </div>
              <div className="flex flex-col gap-4">
                <WidgetBoundary name="monthCal">
                  <PositionedBlock id="monthCal" pos={layout?.monthCal} className="rail-col2 tier-fade">
                    <MonthCalWidget />
                  </PositionedBlock>
                </WidgetBoundary>
                <WidgetBoundary name="habits">
                  <PositionedBlock id="habits" pos={layout?.habits} className="rail-col2 tier-fade">
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
              as the left rail.

              HEIGHT PRIORITY (per-widget, MEASURED — Task 70, scripts/preview.mjs,
              rebuilt bundle — at each tier's INTERIOR WORST CASE: its MINIMUM
              height, since the Tasks pill is bottom-anchored at pill.top =
              viewportH − 54 and RISES as the window shrinks, not the tier
              boundary). rail-top-right = 180px (index.css, a fixed px so it never
              rises into the content-height weather chip). Card heights at 1600w,
              every section at its display max (github 2 PR + 2 issue + unread;
              gitlab 3 MR + todos; jira 3 issue + counts):
                · github  — 235px full / 193px dense-condensed (<=864), rows-only;
                            411px full / 361px dense WITH the commit graph (the
                            graph block adds 176px full, 168px dense).
                · gitlab  — 174px.   · jira — 174px (the LOWEST card; its bottom is
                            what must clear the pill).
              Stacked rows-only, top-anchored from 180 with gap-4 (16px):
              github[180-415] gitlab[431-605] jira[621-795]. jira.bottom 795 clears
              the pill by the 16px floor only at height >= 865 (795 = 811 − 16,
              811 = 865 − 54) — so gitlab and jira WHOLE-WIDGET-HIDE on `dense`
              (<=864, index.css); at 865+ all three flow at full height and clear
              the pill unaided (51px at Jon's 900).

              GITHUB SURVIVES the compact band. It dense-condenses to 193px (bottom
              373) and clears the pill down to the SHORT floor (451px, pill top 397)
              by 24px; it hides only on `xshort` (<=450, `xshort:hidden` below). On
              `mid` (601-864) gitlab/jira are gone (dense) and github stands alone,
              rows-only, bottom 373 vs the 601-floor pill top 547 — 174px clear.

              THE GRAPH YIELDS BEFORE ANY WHOLE CARD, AND YIELDS TO ITS SIBLINGS
              (Task 70's rule). The commit-graph section (GithubWidget.tsx) reveals
              at a tier chosen from BOTH the sibling count AND github's OWN
              composition — the graph fits above the bottom-anchored pill once the
              WHOLE stack does, and a rows-bearing card is far taller than a
              graph-only one:
                · SOLE CARD or ONE sibling → `taller` (>=890h), any composition.
                  github alone + graph (bottom 591) clears the 890-floor pill (836)
                  by 245px, 255px at Jon's 900; one 174px sibling puts the stack
                  bottom at 781, still 55px clear. It cannot ride lower: alone on
                  `mid`, github+graph (361, bottom 541) clears the 601-floor pill
                  (547) by only 6px, and at 889 (graph hidden) fit is restored.
                · TWO siblings WITH a rows section (pulls or issues on) → `grand`
                  (>=1041h, derived in index.css). github+graph+rows+gitlab+jira put
                  jira at [797-971]; that clears the pill (h−54) by 16px only at
                  >=1041h. Without this the three-connector board would lap the pill
                  at Jon's 900 (jira.bottom 971 vs pill.top 846) — the collision the
                  sweep now catches, GITHUB_FIXTURE seeded to true display max. (One
                  rows-section is a 306px card clearing at >=936h, but it reveals on
                  `grand` too — one fewer tier for a ~105px window.)
                · TWO siblings and GRAPH-ONLY (no pulls, no issues — Jon's "just my
                  commit graph"; notifications is a header chip, no height) →
                  `taller` (>=890h). The 201px graph-only card + gitlab + jira put
                  jira at [587-761], clearing the 890-floor pill (836) by 75px.
                  Composition-blind gating would `grand`-hide this SHORT card and
                  render a header-only HUSK at 890-1040h (Jon's 1600x900 included) —
                  the very card the feature exists to show.
              Each is monotonic by construction (one boundary per config shape); the
              descent never re-shows the graph. Zero pairwise overlaps survive.

              WIDTH: all three carry `.rail-primary` too (widest here is github's
              w-80), so the whole right column steps aside below 100vw = 1193 —
              see the left rail's WIDTH DISCIPLINE note and index.css. */}
          <aside data-zone="right" aria-label="Right widget rail" className="fixed right-8 top-[var(--rail-top-right)] flex w-[var(--rail-w)] flex-col items-end gap-4">
            <WidgetBoundary name="github">
              <PositionedBlock id="github" pos={layout?.github} className="rail-primary tier-fade xshort:hidden xshort:opacity-0">
                <GithubWidget />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="gitlab">
              <PositionedBlock id="gitlab" pos={layout?.gitlab} className="rail-primary tier-fade dense:hidden dense:opacity-0">
                <GitlabWidget />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="jira">
              <PositionedBlock id="jira" pos={layout?.jira} className="rail-primary tier-fade dense:hidden dense:opacity-0">
                <JiraWidget />
              </PositionedBlock>
            </WidgetBoundary>
          </aside>

          {/* ── BOTTOM BAND ────────────────────────────────────────────────
              The rails idiom (Task 64/65), applied to the bottom of the page —
              the LAST piece of the retired pinned-coordinate layout. The crypto
              strip and the quote were three coordinate systems fighting in one
              band: the links row FLOWED down from the centered column (its bottom
              moving with whatever widgets are enabled above), crypto was
              vh-PINNED (`fixed top-[86vh]`), and the quote was BOTTOM-anchored
              (`bottom-6`). At short heights the vh-pinned crypto printed straight
              OVER the links labels and the quote (text-on-text below ~849h with
              crypto+links+quote all on). Same disease the rails cured, same cure:
              a `fixed`, BOTTOM-anchored flow container.

              This <aside data-zone="bottom"> holds, top-to-bottom, the crypto
              strip then the quote, stacked by `flex flex-col items-center gap-2`.
              The gap is gap-2 (8px), not gap-4 — the SAME deliberate, reasoned
              exception this band has carried since SP2 (HALF this file's usual
              16px convention): this is the TIGHTEST vertical band on the page,
              only ~40px total between two FIXED-HEIGHT, SINGLE-LINE neighbours
              (the links row never wraps, the quote's figure is a fixed block),
              against this strip's own ~20px single-line height — so there is no
              "worst case" growth to defend against the way RSS's shownCount or
              vercel's deployment count need, and arrange mode lets a user who
              dislikes the tight default simply drag it elsewhere. This default
              only has to be SAFE, not spacious — and keeping it gap-2 is what
              keeps the strip's top low enough to clear the links (and therefore
              SHOW) at Jon's canonical 1600x900, its daily board.
              Two structural consequences:
                · THE vh-PIN DIES. crypto is no longer `top-[86vh]`; it sits
                  gap-2 (8px) ABOVE the quote BY CONSTRUCTION, so crypto x quote
                  overlap is now impossible — there is no coordinate to drift.
                · THE QUOTE DOES NOT MOVE. The container is `bottom-6`
                  (short:bottom-2 xshort:bottom-1 — the quote's OWN old responsive
                  bottom offsets, moved up here intact), and the quote is the LAST
                  flex child, so the quote's bottom sits at the container's bottom
                  = viewport bottom − 24px, pixel-identical to its old single
                  `bottom-6` anchor. Its bottom-center canvas identity is preserved
                  at every healthy size whether crypto is shown or hidden (a hidden
                  crypto leaves the flex flow entirely — see the height tier and
                  the `:empty` rule in index.css — so the quote stays put). The
                  preview harness MEASURES this directly at the canonical
                  1600x900 — quote.bottom === viewport height − 24px (±1px),
                  the live number logged verbatim — rather than only reasoning
                  it from construction (scripts/preview.mjs, the bottom-band
                  probe's Probe 3, right after the canonical crypto-clearance
                  check).

              CRYPTO HEIGHT DISCIPLINE (vs the links row ABOVE). The band's top is
              crypto.top; the links row is the FLOWING bottom of the centered
              column and rises/falls with it (worldClocks+countdown on is the
              tallest, worst case — the harness's standard seed). Below the
              MEASURED height where `crypto.top >= links.bottom + 8` fails, crypto
              WHOLE-widget-hides (`hidden taller:block` — a measured height tier in
              index.css; DROPPED on the arranged branch like every rail class, so a
              dragged crypto is never height-hidden). The +8 is the band's SAME
              reasoned exception as the gap-2 above (tightest band, fixed-height
              single-line neighbours, arrange-mode escape) — and it is precisely
              what keeps the reveal threshold BELOW 900 so the strip SHOWS at Jon's
              canonical 1600x900 (measured ~890h; scripts/preview.mjs pins the
              900h clearance as its own probe). The quote survives every
              height (it's short and its own top clears the links row far lower than
              crypto's does — measured; it only ever shrinks its type + tightens its
              bottom via short/xshort, never hides), so at the sizes where crypto
              hides the band is just the quote, cleanly clear of the links.
              INTERIOR-WORST-CASE LAW: the tier is asserted at its own minimum, both
              fenceposts, by scripts/preview.mjs.

              CONTAINMENT LAW binds here too (see index.css's .rail-col2 rule): this
              zone needs NO container query — a height media tier suffices for the
              crypto hide — but it still hosts arranged (`position: fixed`)
              crypto/quote when a user drags them, so NEVER add
              contain:layout / transform / filter / will-change to it: any would
              establish a containing block and trap the fixed arranged widget
              against the zone box instead of the viewport. `flex` + `w-fit` +
              auto-margin centering create no containing block (transform-free per
              the house rule — the same `inset-x-0 mx-auto w-fit` centering the
              bookmarks/quote wrappers use). Arrange interop: a dragged crypto/quote
              keeps its pixels (PositionedBlock renders it fixed, className dropped)
              and the band reflows around the gap — the standard rail contract,
              probed in scripts/preview.mjs. */}
          <aside
            data-zone="bottom"
            aria-label="Bottom widget band"
            className="fixed inset-x-0 bottom-6 short:bottom-2 xshort:bottom-1 mx-auto flex w-fit flex-col items-center gap-2"
          >
            <WidgetBoundary name="crypto">
              {/* DEFAULT placement — flows in the bottom band, centered by the
                  aside's `items-center`, hidden below the measured `taller`
                  height where it would lap the links row. CryptoWidget renders a
                  single row capped at MAX_COINS=5 cells and self-gates on the
                  connector's enabled+coins state (an empty box until configured,
                  dropped from the flex flow by index.css's `[data-zone]
                  [data-block-id]:empty` rule — same as every rail widget). A
                  stored arrange-mode `pos` still wins (PositionedBlock drops this
                  className on that branch). Hidden by default, REVEALED only
                  when the viewport is `taller` than the measured floor (a hidden
                  crypto sets display:none and drops out of the flex flow — no
                  phantom gap above the quote). */}
              <PositionedBlock id="crypto" pos={layout?.crypto} className="tier-fade hidden opacity-0 taller:block taller:opacity-100">
                <CryptoWidget />
              </PositionedBlock>
            </WidgetBoundary>
            <WidgetBoundary name="quote">
              {/* DEFAULT placement — flows at the BOTTOM of the band (last flex
                  child), so its bottom sits at the container's `bottom-6` and its
                  bottom-center canvas identity is unchanged from its old single
                  `fixed inset-x-0 bottom-6 mx-auto w-fit` anchor. The centering
                  and the bottom offset now live on the aside. This wrapper carries
                  `quote-gate tier-fade` (resize-continuity task). The quote's OLD
                  `mid:hidden` — gone across 601-864, BACK below 600 — was the
                  non-monotonic blink Jon reported ("the quote ... disappear ...
                  then reappear and disappear"). It is DEAD. The quote now SCALES
                  DOWN under height pressure (its own mid/short/xshort type steps)
                  while the centred column condenses on `mid` (the launcher row,
                  search, focus, world-clocks/countdown all step smaller — see
                  LinksWidget et al.), so the flowing links row rises to clear it.
                  Where it still can't clear — MEASURED against the worst-case
                  column (world clocks + countdown on), the links lap it below
                  ~671h however hard the column condenses without gutting the clock
                  — it yields ONCE, MONOTONICALLY and FADED (`.quote-gate`,
                  index.css `@media (max-height:671px)`): shown and shrinking above
                  671, a soft fade-out at the floor, and STAYING gone below. Never
                  gone-then-back. At >=672 it clears the links; the preview quote
                  fencepost asserts 671/672 live. No translate/transform — the same
                  landmine the bookmarks/quote wrappers were converted away from. A
                  stored `pos` still wins (both classes dropped on the arranged
                  branch, so an arranged quote is never height-hidden). */}
              <PositionedBlock id="quote" pos={layout?.quote} className="quote-gate tier-fade">
                <QuoteWidget />
              </PositionedBlock>
            </WidgetBoundary>
          </aside>

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
