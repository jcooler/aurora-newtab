import { greetingFor } from '../../lib/clock'
import { useNow } from '../../lib/hooks/useNow'
import { useStoredKey } from '../../lib/hooks/useStoredKey'

export default function Greeting() {
  const [settings] = useStoredKey('settings')
  const now = useNow(30_000)
  if (!settings) return null
  const text = greetingFor(now.getHours(), settings.name)
  return (
    <p
      // `title` carries the full text whenever `truncate` below actually
      // elides it — same "always set, only visible on the clipped path"
      // idiom the weather chip's condition/location line and every
      // bookmarks chip label already use, rather than conditioning it on
      // whether THIS render happens to be long enough to clip.
      title={text}
      // WIDTH CAP (finding: a long custom `Settings -> General -> "Your
      // name"` renders this line unbounded — the default greeting is short
      // enough that nobody had reason to cap it before). Three tiers:
      //
      //   default (>=899px, or <=720px — see `compact` below) — 40rem is far
      //   wider than any real greeting ever gets (even a generous custom
      //   name), so this tier is pure defense-in-depth against a
      //   pathological one, not a constraint typical text reaches.
      //   Deliberately unbounded for practical purposes at and above 900px —
      //   see the note on the 721-898px tier below for why that boundary is
      //   exact, not approximate. (`max-[899px]:` compiles to `@media not
      //   all and (min-width: 899px)`, i.e. strictly under 899px — so this
      //   tier's actual reach is 721-898px, one pixel more conservative than
      //   the 899px written in the selector, which only sharpens the ">=900px
      //   byte-identical" guarantee rather than loosening it.)
      //
      //   721-898px — a DEDICATED range, not the `tight` custom variant
      //   (which runs 721-1300px). This narrower one matches the band the
      //   review finding named, and its upper edge is load-bearing: it is
      //   the widest point WeatherWidget's own EXPANDED-panel formula
      //   (`tight:w-[min(30vw,calc(50vw_-_10.5rem))]`, see that file) still
      //   assumes this greeting is no wider than the widest DEFAULT greeting
      //   text (284.5px, "Good afternoon." at this scale) — measured
      //   clearance from that assumption shrinks to ~8px right at 730px and
      //   800px (scripts/preview.mjs measures both), and keeps shrinking as
      //   width grows toward 900 before the panel's OTHER term (`30vw`)
      //   takes over and the room starts growing again. Reusing `tight` here
      //   wholesale would keep clamping ordinary names (even "Jon") all the
      //   way out to 1300px, which is not what was asked — "byte-identical
      //   … at >=900px" is the boundary, so this tier stops exactly there.
      //   18rem (288px) sits just above the 284.5px floor (so "Good
      //   afternoon." itself is never clipped — byte-identical to today)
      //   while giving a long custom name nowhere near enough room to eat
      //   into WeatherWidget's margin the way an unbounded line could.
      //   Ordinary custom names ARE affected inside this narrow band (there
      //   is no width rule that fits both "Jon" and a collision-free
      //   expanded weather panel into 730px — WeatherWidget's own formula
      //   was only ever calibrated against the no-name case, a pre-existing
      //   gap this fix does not attempt to close); scripts/preview.mjs seeds
      //   a worst-case (40+ char, CJK) name and measures both the collapsed
      //   AND expanded weather states at 730x900 and 800x450 to keep the
      //   part this fix DOES own — no unbounded overflow/collision — honest
      //   rather than assumed.
      //
      //   `compact` (<=720px) — WeatherWidget already gives up chasing this
      //   column at this width and becomes an opaque overlay sheet (see its
      //   own comment), so the risk here is pure viewport overflow, not a
      //   sibling collision — hence a viewport-relative cap rather than a
      //   fixed one, sized under the column's own `narrow:px-4` padding.
      //
      //   (Task 64 — responsive rails — retired a FOURTH tier that used to sit
      //   here: a `min-[1593px]:max-w-[min(40rem,calc(100vw-1168px))]` cap that
      //   kept the greeting's left edge clear of the old PINNED mid-left column
      //   (monthCal + habits, right edge 568px). That column now FLOWS inside
      //   the left rail (App.tsx), and the centred column holding THIS greeting
      //   is itself bounded to `--center-reserve` (App.tsx:
      //   `max-w-[var(--center-reserve)] mx-auto`, the widest centred member +
      //   breathing), so the greeting can no longer reach the rail at ANY width
      //   — the column bound does STRUCTURALLY what that hand-tuned 1593 cap
      //   did, and the magic 1593 is gone from here too. "Good afternoon."
      //   (284.5px) is far under the reserve, so it is still never clipped.)
      //
      // `truncate` (nowrap + overflow-hidden + ellipsis) rather than letting
      // it wrap: a wrapped multi-line greeting grows the centred column
      // taller, which shifts every block below it (world clocks, countdown,
      // search, focus, links) — a second-order layout shift nothing here
      // has budget for. One line, capped, ellipsised is the same contract
      // the weather chip already keeps for its own long content.
      className="text-photo font-display mt-2 short:mt-0.5 xshort:mt-0.5 text-4xl short:text-2xl xshort:text-lg font-medium text-canvas-fg max-w-[40rem] min-[721px]:max-[899px]:max-w-[18rem] compact:max-w-[calc(100vw-4rem)] truncate"
    >
      {text}
    </p>
  )
}
