import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AssertiveAlert, PoliteStatus } from '../../../components/StateFeedback'
import type { OperationState } from '../../../lib/asyncState'
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
import type { WidgetVariant } from '../../../lib/layout/types'
import type { UtilityTrayBridge } from '../../components/utilityTrayBridge'

const HA_VARIANT_LIMITS: Readonly<Record<WidgetVariant, Readonly<{ states: number; actions: number }>>> = {
  compact: { states: 2, actions: 0 },
  standard: { states: 4, actions: 2 },
  expanded: { states: 6, actions: 3 },
}

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

export default function HomeAssistantWidget({
  stageVariant = 'standard',
  utilityTray,
}: { stageVariant?: WidgetVariant; utilityTray?: UtilityTrayBridge } = {}) {
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
      config={ha}
      instanceUrl={ha.instanceUrl}
      token={ha.token}
      picked={picked}
      actions={actions}
      stageVariant={stageVariant}
      utilityTray={utilityTray}
    />
  )
}

function HomeAssistantInner({
  config,
  instanceUrl,
  token,
  picked,
  actions,
  stageVariant,
  utilityTray,
}: {
  config: HomeAssistantConfig
  instanceUrl: string
  token: string
  picked: HaEntityRef[]
  actions: HaAction[]
  stageVariant: WidgetVariant
  utilityTray?: UtilityTrayBridge
}) {
  // NO prev arg, by design (plan-pinned ruling 2, this file's header
  // comment): fetchHomeAssistant itself takes no `prev` parameter at all
  // (unlike fetchGitlab's per-section degrade) — the closure below still
  // accepts one (useConnectorSnapshot's own signature requires it) but
  // deliberately ignores it rather than threading it anywhere, so a
  // reviewer scanning call sites never mistakes this for a carry-forward.
  const { data } = useConnectorSnapshot<HomeAssistantData>(
    'homeassistant',
    config,
    (_prev) => fetchHomeAssistant(instanceUrl, token, picked),
  )
  // Anti-staleness, all-or-nothing (plan-pinned ruling 2): a failed poll
  // (`data === null`, never fetched yet) OR an outright failed one
  // (`entities === null`) both render NOTHING — chips AND buttons together.
  // See this file's header comment for why the buttons aren't spared: a dead
  // instance must never turn a still-rendered button into a guaranteed error
  // tint on every press.
  if (!data || data.entities === null) {
    return utilityTray?.activeTool === 'homeassistant' && utilityTray.host
      ? createPortal(<p className="text-sm text-fg-muted">Home Assistant actions are unavailable.</p>, utilityTray.host)
      : null
  }

  const chips = data.entities

  // No-husk law (GitlabWidget.tsx's own generalized statement): every picked
  // entity can vanish from HA between pick time and poll time (deleted/
  // renamed — see fetchHomeAssistant's own doc comment), which can hollow
  // `chips` to [] even though the outer gate proved SOMETHING was picked.
  // `actions` never depends on the poll (it's static config, not fetched
  // state), so it alone can still justify rendering — this only returns null
  // when NEITHER would leave anything visible.
  if (chips.length === 0 && actions.length === 0) return null

  const limits = HA_VARIANT_LIMITS[stageVariant]
  const visibleChips = chips.slice(0, limits.states)
  // An action-only Compact allocation still needs one useful operation;
  // when current states exist, Compact stays a passive summary as specified.
  const actionLimit = stageVariant === 'compact' && chips.length === 0 ? 1 : limits.actions
  const visibleActions = actions.slice(0, actionLimit)

  const dashboard = (
    // A slim floating card, not a panel — no bg-panel-solid/rounded-2xl/
    // shadow-lg (unlike GithubWidget/GitlabWidget/JiraWidget/VercelWidget in
    // this same rail column): CryptoWidget.tsx's own "slim floating STRIP,
    // not a panel" idiom, `w-80` only for width parity with the panel cards
    // stacked above it in this column (ics/rss/vercel), not for a shared
    // surface. Left-aligned (this column's own `items-start`), not
    // text-center (unlike the bottom band's centered strips).
    <section aria-label="Home Assistant" data-ha-content-variant={stageVariant} className="w-80 text-fg">
      {visibleChips.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {visibleChips.map((s) => (
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
      {visibleActions.length > 0 && (
        <div className={`flex flex-wrap gap-2${visibleChips.length > 0 ? ' mt-2' : ''}`}>
          {visibleActions.map((a) => (
            <ActionButton
              key={a.id}
              action={a}
              instanceUrl={instanceUrl}
              token={token}
              snapshotEpoch={config.snapshotEpoch}
            />
          ))}
        </div>
      )}
    </section>
  )
  const tray = utilityTray?.activeTool === 'homeassistant' && utilityTray.host
    ? createPortal(
        <section aria-label="Home Assistant actions" className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Home Assistant actions</h3>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <ActionButton
                key={action.id}
                action={action}
                instanceUrl={instanceUrl}
                token={token}
                snapshotEpoch={config.snapshotEpoch}
              />
            ))}
          </div>
        </section>,
        utilityTray.host,
      )
    : null
  return <>{dashboard}{tray}</>
}

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
// `pending` is a brief, self-contained brightness/scale nudge — no color
// change, so a press reads as "acknowledged" a beat before the real
// success/error tint lands.
const BTN_TINT = {
  idle: 'rounded-full border border-panel-border bg-panel-solid px-3 py-1 text-xs text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none',
  pending: 'rounded-full border border-panel-border bg-panel-solid px-3 py-1 text-xs text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] scale-95 brightness-125 transition focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:scale-100',
  success: 'rounded-full border border-panel-border bg-panel-solid px-3 py-1 text-xs text-accent shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] transition focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none',
  error: 'rounded-full border border-panel-border bg-panel-solid px-3 py-1 text-xs text-red-400 shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] transition focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none',
} as const satisfies Record<OperationState, string>

/** One independently guarded Home Assistant service call. Configuration
 * changes advance the generation in a committed layout effect: stale promise
 * continuations can therefore neither overwrite feedback nor release a newer
 * request's synchronous pending guard. */
export function ActionButton({
  action,
  instanceUrl,
  token,
  snapshotEpoch,
}: {
  action: HaAction
  instanceUrl: string
  token: string
  snapshotEpoch?: string
}) {
  const [state, setState] = useState<OperationState>('idle')
  const feedbackId = useId()
  const pendingRef = useRef<number | null>(null)
  const mountedRef = useRef(false)
  const generationRef = useRef(0)

  useLayoutEffect(() => {
    generationRef.current += 1
    pendingRef.current = null
    setState('idle')
  }, [snapshotEpoch, instanceUrl, token, action.id, action.domain])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  async function handlePress() {
    if (pendingRef.current !== null) return

    const generation = generationRef.current
    pendingRef.current = generation
    setState('pending')

    let ok = false
    try {
      ok = await callHaService(instanceUrl, token, action)
    } catch {
      ok = false
    }

    if (generation !== generationRef.current || pendingRef.current !== generation) return
    pendingRef.current = null
    if (!mountedRef.current) return
    setState(ok ? 'success' : 'error')
  }

  const feedback =
    state === 'pending'
      ? `Running ${action.name}…`
      : state === 'success'
        ? `${action.name} completed.`
        : state === 'error'
          ? `Couldn't run ${action.name}. Try again.`
          : null

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        aria-label={`Run ${action.name}`}
        aria-busy={state === 'pending' ? 'true' : undefined}
        aria-describedby={feedback ? feedbackId : undefined}
        disabled={state === 'pending'}
        onClick={() => void handlePress()}
        className={BTN_TINT[state]}
      >
        {action.name}
      </button>
      {state === 'error' ? (
        <AssertiveAlert id={feedbackId} className="text-photo text-xs text-canvas-fg">
          {feedback}
        </AssertiveAlert>
      ) : (
        <PoliteStatus id={feedbackId} className="text-photo text-xs text-canvas-fg">
          {feedback}
        </PoliteStatus>
      )}
    </div>
  )
}
