import { useEffect, useRef, useState } from 'react'
import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import {
  fetchHomeAssistant,
  callHaService,
  haEntitiesOf,
  haActionsOf,
  type HaAction,
  type HaEntityRef,
  type HaState,
  type HomeAssistantConfig,
  type HomeAssistantData,
} from '../../../services/connectors/homeassistant'
import type { ConnectorConfig } from '../../../services/connectors/types'

// The Home Assistant widget — Task 102 (W3-SP5), the ninth connector's board
// face: up to MAX_CHIP_ENTITIES=6 state chips and up to MAX_ACTIONS=3
// one-tap service buttons (homeassistant.ts's own display caps, enforced at
// the haEntitiesOf/haActionsOf read boundary — this widget never re-slices).
//
// ANTI-STALENESS, ALL-OR-NOTHING (plan-pinned ruling 2): `fetchHomeAssistant`
// follows status.ts's never-carry-prev discipline (see homeassistant.ts's own
// header comment) — a failed poll resolves `{ entities: null }`, and BOTH the
// chips AND the action buttons hide together when that happens. A dead
// instance must never turn every button press into a guaranteed error tint —
// the card is all-or-nothing, exactly like the chips would be misleading
// showing a light's last-known state after the poll that would have refreshed
// it failed. This is why the inner gate below checks `data.entities === null`
// rather than rendering the buttons unconditionally once picked.
//
// This widget is modeled on StatusWidget.tsx's own shape (a snapshot-backed
// connector widget with NO settings-tab toggle — see registry.ts's own
// homeassistantDescriptor comment: `settings.widgets` has no `homeassistant`
// member, this is a connector card, not a Widgets-tab entry), not on
// GitlabWidget's panel-card shape: the section below floats DIRECTLY on the
// photo (no bg-panel-solid/rounded-2xl/shadow-lg), the same "slim floating
// strip, not a panel" idiom CryptoWidget.tsx's own doc comment documents —
// see its ink discipline note on ActionButton below for why the chips need
// the fixed `-canvas-` ink family and the buttons don't.

/** Narrow `connectors.homeassistant` (a ConnectorConfig union member, or
 *  undefined) to a CONNECTED HomeAssistantConfig, defensively — same shape as
 *  GitlabWidget's own connectedGitlab. `instanceUrl`/`token` are OPTIONAL on
 *  HomeAssistantConfig itself (a config can be saved mid-connect, before
 *  either field exists), so the return type intersects them back to required
 *  strings once both checks below have actually proven it — every caller
 *  downstream (the fetch, callHaService) can then read them as plain
 *  strings, no further narrowing needed. */
function connectedHomeAssistant(
  config: ConnectorConfig | undefined,
): (HomeAssistantConfig & { instanceUrl: string; token: string }) | null {
  if (!config || !('token' in config) || !('instanceUrl' in config)) return null
  const ha = config as HomeAssistantConfig
  if (!ha.enabled) return null
  if (typeof ha.token !== 'string' || ha.token.length === 0) return null
  if (typeof ha.instanceUrl !== 'string' || ha.instanceUrl.length === 0) return null
  return ha as HomeAssistantConfig & { instanceUrl: string; token: string }
}

/** The remount key: every picked entity id, then every picked action id,
 *  newline-joined. A picker save (Task 101's settings card) that changes
 *  either list changes this string, and React treats a changed `key` as
 *  "discard the old HomeAssistantInner, mount a fresh one" — which is what
 *  actually makes a picker save show fresh data: THE PACT (see
 *  StatusWidget.tsx's own remount-key comment for the full statement) is that
 *  the SAME save also clears `connectorSnapshots.homeassistant`, so the fresh
 *  mount finds no snapshot at all and fetches immediately, rather than
 *  reading a still-fresh snapshot keyed to the OLD picks. Exported for direct
 *  unit testing — two independent lists (not StatusWidget's one) earns its
 *  own proof that either one changing changes the key. */
export function remountKey(picked: HaEntityRef[], actions: HaAction[]): string {
  return picked
    .map((e) => e.id)
    .concat(actions.map((a) => a.id))
    .join('\n')
}

/** `{friendlyName} {state}{unit}` — the chip's exact copy (brief-pinned,
 *  verbatim): the unit rides directly against the state with NO space when
 *  present ('Kitchen 21.5°C'), simply absent when null ('Porch light on').
 *  HA's own state string renders untouched — no capitalization massaging.
 *  Exported for direct unit testing. */
export function chipCopy(s: HaState): string {
  return `${s.friendlyName} ${s.state}${s.unit ?? ''}`
}

export default function HomeAssistantWidget() {
  // Zero-hooks-in-the-gate split, same as every other connector widget
  // (StatusWidget.tsx's own doc comment): the one useStoredKey read runs
  // every render (Rules of Hooks stay satisfied), but a disabled/unconnected
  // connector, or a connected one with nothing picked at all, never mounts
  // HomeAssistantInner and therefore never runs useConnectorSnapshot's own
  // subscribe/refresh — proven in the test file by asserting
  // connectorSnapshots.homeassistant stays undefined after mount, the same
  // proof StatusWidget.test.tsx's own gate describe block uses (this widget
  // has no setInterval to spy on — it's snapshot-backed, not clock-backed —
  // so the "never started the refresh" claim is proven at the storage
  // boundary instead).
  const [connectors] = useStoredKey('connectors')
  const ha = connectedHomeAssistant(connectors?.homeassistant)
  if (!ha) return null
  // This is a CONNECTOR, not a Widgets-tab toggle (registry.ts's own
  // homeassistantDescriptor comment) — the gate is entirely: connected AND
  // something was actually picked. An enabled, connected instance with an
  // empty picker (never opened, or opened and saved with nothing checked) is
  // a real, valid state — render nothing rather than an empty husk card.
  const picked = haEntitiesOf(ha)
  const actions = haActionsOf(ha)
  if (picked.length === 0 && actions.length === 0) return null

  return (
    <HomeAssistantInner
      key={remountKey(picked, actions)}
      instanceUrl={ha.instanceUrl}
      token={ha.token}
      picked={picked}
      actions={actions}
    />
  )
}

function HomeAssistantInner({
  instanceUrl,
  token,
  picked,
  actions,
}: {
  instanceUrl: string
  token: string
  picked: HaEntityRef[]
  actions: HaAction[]
}) {
  // NO prev arg, by design (plan-pinned ruling 2, this file's header
  // comment): fetchHomeAssistant itself takes no `prev` parameter at all
  // (unlike fetchGitlab's per-section degrade) — the closure below still
  // accepts one (useConnectorSnapshot's own signature requires it) but
  // deliberately ignores it rather than threading it anywhere, so a
  // reviewer scanning call sites never mistakes this for a carry-forward.
  const { data } = useConnectorSnapshot<HomeAssistantData>('homeassistant', (_prev) =>
    fetchHomeAssistant(instanceUrl, token, picked),
  )
  // Anti-staleness, all-or-nothing (plan-pinned ruling 2): a failed poll
  // (`data === null`, never fetched yet) OR an outright failed one
  // (`entities === null`) both render NOTHING — chips AND buttons together.
  // See this file's header comment for why the buttons aren't spared: a dead
  // instance must never turn a still-rendered button into a guaranteed error
  // tint on every press.
  if (!data || data.entities === null) return null

  const chips = data.entities

  // No-husk law (GitlabWidget.tsx's own generalized statement): every picked
  // entity can vanish from HA between pick time and poll time (deleted/
  // renamed — see fetchHomeAssistant's own doc comment), which can hollow
  // `chips` to [] even though the outer gate proved SOMETHING was picked.
  // `actions` never depends on the poll (it's static config, not fetched
  // state), so it alone can still justify rendering — this only returns null
  // when NEITHER would leave anything visible.
  if (chips.length === 0 && actions.length === 0) return null

  return (
    // A slim floating card, not a panel — no bg-panel-solid/rounded-2xl/
    // shadow-lg (unlike GithubWidget/GitlabWidget/JiraWidget/VercelWidget in
    // this same rail column): CryptoWidget.tsx's own "slim floating STRIP,
    // not a panel" idiom, `w-80` only for width parity with the panel cards
    // stacked above it in this column (ics/rss/vercel), not for a shared
    // surface. Left-aligned (this column's own `items-start`), not
    // text-center (unlike the bottom band's centered strips).
    <section aria-label="Home Assistant" className="w-80 text-fg">
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {chips.map((s) => (
            // Photo-floating text — `-canvas-` ink (StatusWidget.tsx:134-151's
            // own "the trap": a panel-adaptive `text-fg` here would silently
            // re-tint toward black under a light panelColor pick, since this
            // chip has no panel surface of its own to carry that tint against)
            // plus `text-photo`'s edge-definition shadow, the same pairing
            // every other direct-on-photo text in this app uses (Clock,
            // Greeting, CryptoWidget's own coin cells).
            <li key={s.id} className="text-photo text-sm text-canvas-fg">
              {chipCopy(s)}
            </li>
          ))}
        </ul>
      )}
      {actions.length > 0 && (
        <div className={`flex flex-wrap gap-2${chips.length > 0 ? ' mt-2' : ''}`}>
          {actions.map((a) => (
            <ActionButton key={a.id} action={a} instanceUrl={instanceUrl} token={token} />
          ))}
        </div>
      )}
    </section>
  )
}

// How long a failed press's error tint stays up before auto-clearing back to
// idle — brief-pinned at 1200ms. No dialog, no error text anywhere on this
// card (brief-pinned): the tint IS the entire error UI.
const ERROR_TINT_MS = 1200

// Every button state's COMPLETE literal class string — never a template
// interpolation. GitlabWidget.tsx:42-56's own fix-round story is the reason:
// Tailwind's build-time scanner extracts candidate classes by scanning the
// SOURCE TEXT for complete, unbroken class-name tokens, and a template like
// `` `text-${tone}-400` `` never appears as one, so the JIT silently never
// generates it — a jsdom test asserting the className STRING still passes
// (it never evaluates real CSS), but the real-Chromium harness catches the
// dead class. Every value below is one complete literal string, keyed by the
// SAME state name the press handler already tracks, the identical discipline
// GitlabWidget's own REVIEW_ASKS_TIER_CLASS map uses.
//
// Each state carries its OWN small panel surface (`rounded-full border
// border-panel-border bg-panel-solid ... shadow-lg backdrop-blur`) — the
// house "small control floating on the photo" shape (the settings-gear/
// photo-refresh buttons' own `rounded-full bg-panel-solid ... shadow-lg
// shadow-black/25 backdrop-blur-sm`, and BookmarksBar's own chip: "keep
// rounded-full like the app's other SMALL controls"). Unlike the chips just
// above, a button gets its OWN local panel surface to sit on, so its ink can
// safely use the panel-adaptive `text-fg` (idle) rather than the fixed
// `-canvas-` family — the trap StatusWidget.tsx:134-151 documents is about
// text with NO surface of its own sitting directly on the photo, which a
// button here never is. `error` reuses the app's one established danger
// convention, `text-red-400` (ArrangeController.tsx's own Reset button),
// adapted onto this control's own surface rather than a bare-text button.
// `pressed` is a brief, self-contained brightness/scale nudge — no color
// change, so a press reads as "acknowledged" a beat before the real
// success/error tint lands.
const BTN_TINT = {
  idle: 'rounded-full border border-panel-border bg-panel-solid px-3 py-1 text-xs text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none',
  pressed: 'rounded-full border border-panel-border bg-panel-solid px-3 py-1 text-xs text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] scale-95 brightness-125 transition focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:scale-100',
  error: 'rounded-full border border-panel-border bg-panel-solid px-3 py-1 text-xs text-red-400 shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] transition focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none',
} as const

type BtnTintState = keyof typeof BTN_TINT

/** One of the three service-call buttons. Fire-and-forget optimistic tap
 *  (homeassistant.ts's own callHaService doc comment): press -> pressed tint
 *  immediately -> the real POST resolves -> idle on success, error tint on
 *  failure, auto-clearing after ERROR_TINT_MS. No dialog, no error text
 *  anywhere (brief-pinned) — the tint IS the entire error UI. */
function ActionButton({
  action,
  instanceUrl,
  token,
}: {
  action: HaAction
  instanceUrl: string
  token: string
}) {
  const [state, setState] = useState<BtnTintState>('idle')
  // The pending error-clear timeout, so a press mid-error-tint (or an
  // unmount, e.g. a picker save remounting this whole card via the key
  // above) cancels it instead of leaving a stray setState-after-unmount call
  // scheduled — the exact "store the timeout id, clear on unmount" the brief
  // pins.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [])

  async function handlePress() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setState('pressed')
    const ok = await callHaService(instanceUrl, token, action)
    if (ok) {
      setState('idle')
      return
    }
    setState('error')
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      setState('idle')
    }, ERROR_TINT_MS)
  }

  return (
    <button type="button" aria-label={`Run ${action.name}`} onClick={() => void handlePress()} className={BTN_TINT[state]}>
      {action.name}
    </button>
  )
}
