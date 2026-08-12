// src/services/connectors/homeassistant.ts — the Home Assistant connector's
// PURE service layer: the who-am-I probe the connect form validates a token
// (+ instance URL) with, the entity picker's one bulk fetch, the widget's
// filtered fetch, the three-button service call, the two read-time
// normalization boundaries, and the registry descriptor. Task 99 (W3-SP5).
//
// NOT registered in registry.ts yet — that's Task 101's job (a registered
// card with no widget body is a husk; this task ships the client, the types,
// and the descriptor, unwired). Every export here is a stable contract Tasks
// 100-102 build against verbatim.
//
// Modeled on gitlab.ts (apiBase's trailing-slash trim, authHeaders' Bearer
// header) for the plumbing, and on status.ts for the FETCH PHILOSOPHY:
// fetchHomeAssistant follows status.ts's never-throw, NEVER-CARRY-PREV ruling
// (status.ts:117-131), not gitlab.ts's prev-carrying per-section degrade. A
// light that just turned off and now reads stale "on" because the last poll
// failed is the same class of lie as a status widget's stale green dot
// (status.ts's own phrase) — so a failed poll here resolves `{ entities: null
// }` and the widget renders nothing, rather than holding yesterday's state
// as if it were live.
//
// Every request goes through http.ts's getJson/postJson — never a hand-rolled
// fetch — so the 8s abort and the typed-error discipline are shared, and
// `fetchFn` stays injectable so tests never touch a real network. postJson's
// res.json() call (http.ts:93) is UNCONDITIONAL and can reject on a
// malformed body, so every postJson/getJson call here is wrapped in its own
// try/catch (status.ts:103's fetchOneStatus precedent), not left to bubble.
import type { ConnectorDescriptor } from './types'
import { getJson, postJson } from './http'
import { originPattern } from '../permissions'

/** One entity captured at pick time in the connect/settings flow: the raw
 *  entity_id HA uses to address it, and the friendly_name shown in the picker
 *  UI (captured then, not re-resolved every render — a rename in HA doesn't
 *  retroactively relabel an already-picked chip). */
export interface HaEntityRef {
  id: string
  name: string
}

/** One of the three service-call buttons the widget renders: the domain
 *  decides which HA service `callHaService` invokes (see `serviceFor`
 *  below). */
export interface HaAction {
  id: string
  name: string
  domain: 'scene' | 'script' | 'switch'
}

export interface HomeAssistantConfig {
  enabled: boolean
  instanceUrl?: string
  token?: string
  locationName?: string
  entities?: HaEntityRef[]
  actions?: HaAction[]
}

/** One entity's current state, shaped for the widget: `unit` and
 *  `friendlyName` are read from HA's `attributes` bag (unit_of_measurement,
 *  friendly_name), `domain` is derived from the entity_id's prefix (the part
 *  before the first '.'). */
export interface HaState {
  id: string
  state: string
  unit: string | null
  friendlyName: string
  domain: string
}

/** null = the poll failed outright (network error, non-OK status, malformed
 *  body) — render nothing, per this module's header comment. A successful
 *  poll with zero matching entities is `{ entities: [] }`, a DIFFERENT and
 *  valid state (the picked entities happen to have vanished from HA, or none
 *  were picked yet) — never conflated with the failure case. */
export interface HomeAssistantData {
  entities: HaState[] | null
}

/** Display cap for picked entities on the widget's chip row — same "the cap
 *  belongs to the connector, enforced at the one read-time boundary every
 *  caller goes through" reasoning as status.ts's MAX_SERVICES. */
export const MAX_CHIP_ENTITIES = 6

/** Display cap for the three-button action row. */
export const MAX_ACTIONS = 3

/** The HA domains eligible for a one-tap action button — anything else
 *  (light, climate, cover, ...) isn't offered here even if a stored config
 *  somehow names one (a hand-edited backup, or a future domain HA adds). */
export const ACTION_DOMAINS = ['scene', 'script', 'switch'] as const

/** The API base for a configured instance: `instanceUrl` with any trailing
 *  slash(es) trimmed, so `${apiBase(url)}/api/...` never doubles up a `//`
 *  regardless of whether the stored/entered value carried a trailing slash.
 *  Same as gitlab.ts's apiBase. */
function apiBase(instanceUrl: string): string {
  return instanceUrl.replace(/\/+$/, '')
}

/** Same Bearer-header shape as gitlab.ts's authHeaders — HA's long-lived
 *  access tokens ride the same Authorization: Bearer scheme. */
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

/** entity_id's domain prefix: 'sensor.kitchen_temp' -> 'sensor'. Every HA
 *  entity_id carries exactly this shape (domain.object_id), so a missing '.'
 *  never happens on a real entity_id — split('.')[0] on a dot-free string
 *  just returns the whole string, which is a harmless degrade, not a throw. */
function domainOf(entityId: string): string {
  return entityId.split('.')[0] ?? entityId
}

interface HaStateItem {
  entity_id?: unknown
  state?: unknown
  attributes?: { friendly_name?: unknown; unit_of_measurement?: unknown }
}

/** GET /api/states body -> HaState[], skip-don't-crash on every malformed
 *  entry (same discipline as gitlab.ts's parseMrs): an item missing a string
 *  entity_id or state is unusable (unaddressable / unrenderable) and is
 *  dropped rather than rendered blank. `unit` comes from
 *  attributes.unit_of_measurement (null when absent or non-string);
 *  `friendlyName` from attributes.friendly_name, falling back to the raw
 *  entity_id when absent so a chip is never label-less. */
function parseStates(body: unknown): HaState[] {
  const items = Array.isArray(body) ? body : []
  const out: HaState[] = []
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as HaStateItem
    const id = typeof item.entity_id === 'string' ? item.entity_id : ''
    const state = typeof item.state === 'string' ? item.state : ''
    if (!id || !state) continue
    const attrs = typeof item.attributes === 'object' && item.attributes !== null ? item.attributes : undefined
    const unit = typeof attrs?.unit_of_measurement === 'string' ? attrs.unit_of_measurement : null
    const friendlyName = typeof attrs?.friendly_name === 'string' ? attrs.friendly_name : id
    out.push({ id, state, unit, friendlyName, domain: domainOf(id) })
  }
  return out
}

/** The who-am-I probe the connect form validates a token (+ instance URL)
 *  with. GET {base}/api/config -> `location_name`. A non-OK response
 *  resolves `{ ok: false }` with a message that NAMES the status, same as
 *  gitlab.ts's whoamiGitlab. A 200 whose body doesn't carry a string
 *  `location_name` is ALSO a failure — HA's own /api/config endpoint always
 *  returns one for a valid token, so a body missing it (or shaped
 *  unexpectedly) means the token/URL pair isn't actually talking to a real
 *  HA instance, not something to paper over with an empty identity. */
export async function whoamiHomeAssistant(
  instanceUrl: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; identity: string } | { ok: false; message: string }> {
  const base = apiBase(instanceUrl)
  try {
    const result = await getJson<{ location_name?: unknown }>(`${base}/api/config`, authHeaders(token), fetchFn)
    if (!result.ok) {
      const where = result.status === null ? 'a network error' : `status ${result.status}`
      return { ok: false, message: `Home Assistant rejected that token (${where}).` }
    }
    const locationName = result.body.location_name
    if (typeof locationName !== 'string' || locationName.length === 0) {
      return { ok: false, message: 'Home Assistant did not return a location name for that token.' }
    }
    return { ok: true, identity: locationName }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/** The entity picker's ONE fetch: GET {base}/api/states, every entity the
 *  token can see, unfiltered — the picker itself narrows this down to
 *  whatever the user selects (see haEntitiesOf below for the read-time cap
 *  once picked entries are stored). Null on ANY failure (network, non-OK,
 *  malformed body) — the picker's job on a failed fetch is to show "couldn't
 *  load your entities," not a stale or partial list. */
export async function fetchAllStates(
  instanceUrl: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<HaState[] | null> {
  const base = apiBase(instanceUrl)
  try {
    const result = await getJson<unknown>(`${base}/api/states`, authHeaders(token), fetchFn)
    if (!result.ok) return null
    if (!Array.isArray(result.body)) return null
    return parseStates(result.body)
  } catch {
    return null
  }
}

/** The widget's fetch: fetchAllStates, filtered down to the picked entity
 *  ids. NEVER throws (every failure inside fetchAllStates already resolves
 *  null, and there's no further step here that can reject) and NEVER carries
 *  a `prev` — no `prev` parameter exists at all, unlike gitlab.ts's
 *  fetchGitlab. See this module's header comment (citing status.ts:117-131)
 *  for why: a stale "on" for a light that's actually off by the time this
 *  renders is the same class of lie status.ts refuses to tell with a cached
 *  green dot. A picked id absent from the fetched states (deleted/renamed in
 *  HA since it was picked) is silently omitted, not an error — the chip row
 *  just shows fewer entities than were picked. An empty `picked` list short-
 *  circuits to `{ entities: [] }` without a network call at all: nothing to
 *  filter for, so nothing to fetch. */
export async function fetchHomeAssistant(
  instanceUrl: string,
  token: string,
  picked: HaEntityRef[],
  fetchFn: typeof fetch = fetch,
): Promise<HomeAssistantData> {
  if (picked.length === 0) return { entities: [] }
  const all = await fetchAllStates(instanceUrl, token, fetchFn)
  if (all === null) return { entities: null }
  const pickedIds = new Set(picked.map((p) => p.id))
  return { entities: all.filter((state) => pickedIds.has(state.id)) }
}

/** Maps an action's domain to the HA service it calls: scene/script both
 *  turn_on (HA's own convention — there's no "off" for either), switch
 *  toggles (the one binary, reversible action of the three). Exported for
 *  the test, and because a future task (widget) may want to label a button
 *  by its underlying verb. */
export function serviceFor(domain: HaAction['domain']): string {
  switch (domain) {
    case 'scene':
      return 'turn_on'
    case 'script':
      return 'turn_on'
    case 'switch':
      return 'toggle'
  }
}

/** The three-button service call: POST
 *  {base}/api/services/{domain}/{service} with body `{ entity_id: action.id
 *  }`. Returns a plain boolean — true iff the call succeeded — rather than a
 *  typed result, since the widget's only reaction to this is a fire-and-
 *  forget optimistic tap (there's nothing else in the response worth
 *  surfacing). Wrapped in try/catch per http.ts:93's res.json() caveat:
 *  postJson's unconditional res.json() call can reject on a non-JSON body,
 *  and HA's service-call endpoint returns a body on success but callers here
 *  don't need it — a resolved OK result is enough. */
export async function callHaService(
  instanceUrl: string,
  token: string,
  action: HaAction,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const base = apiBase(instanceUrl)
  const service = serviceFor(action.domain)
  try {
    const result = await postJson<unknown>(
      `${base}/api/services/${action.domain}/${service}`,
      authHeaders(token),
      { entity_id: action.id },
      fetchFn,
    )
    return result.ok
  } catch {
    return false
  }
}

const ACTION_DOMAIN_SET: ReadonlySet<string> = new Set(ACTION_DOMAINS)

/** Read-time normalization boundary for picked entities — the
 *  statusServicesOf idiom (status.ts:65): a valid `entities` array survives
 *  with malformed entries filtered (not fatal), capped at MAX_CHIP_ENTITIES;
 *  an absent/non-array `entities` (or an absent config) -> []. Every caller
 *  (widget, settings card, origins-adjacent consumers) goes through this ONE
 *  boundary rather than reading config.entities directly, so a hand-edited
 *  or backup-restored config holding more than the display max never renders
 *  past it. */
export function haEntitiesOf(config: HomeAssistantConfig | undefined): HaEntityRef[] {
  if (!config || !Array.isArray(config.entities)) return []
  return config.entities
    .filter(
      (e): e is HaEntityRef =>
        !!e && typeof e === 'object' && typeof e.id === 'string' && e.id.length > 0 && typeof e.name === 'string',
    )
    .slice(0, MAX_CHIP_ENTITIES)
}

/** Read-time normalization boundary for configured actions — same
 *  discipline as haEntitiesOf above, plus a domain-eligibility filter: an
 *  entry whose domain isn't one of ACTION_DOMAINS (e.g. a stored 'light' from
 *  before this constant existed, or hand-edited) is dropped, not just capped.
 *  Capped at MAX_ACTIONS; absent/non-array `actions` (or an absent config)
 *  -> []. */
export function haActionsOf(config: HomeAssistantConfig | undefined): HaAction[] {
  if (!config || !Array.isArray(config.actions)) return []
  return config.actions
    .filter(
      (a): a is HaAction =>
        !!a &&
        typeof a === 'object' &&
        typeof a.id === 'string' &&
        a.id.length > 0 &&
        typeof a.name === 'string' &&
        typeof a.domain === 'string' &&
        ACTION_DOMAIN_SET.has(a.domain),
    )
    .slice(0, MAX_ACTIONS)
}

// EXPORTED but NOT added to CONNECTORS (registry.ts) — pinned ruling 4 (see
// this file's header comment): registration is Task 101's job. A registered
// card with no widget body is a husk, and husks don't land on main.
export const homeassistantDescriptor: ConnectorDescriptor<HomeAssistantConfig> = {
  id: 'homeassistant',
  label: 'Home Assistant',
  blurb: 'Your home, at a glance — and three buttons that do things',
  category: 'home',
  auth: 'token',
  ttlMs: 60_000,
  secretFields: ['token'],
  identityField: 'locationName',
  identityPhrase: 'to',
  // Derived per-config, like gitlab.ts's/status.ts's origins — a
  // self-hosted/local HA instance, not a single fixed host. Filter, don't
  // throw — the same "a caller sweeping origins() across every registered
  // descriptor must be able to trust a bad/malformed config degrades to
  // fewer origins rather than throwing out of the sweep" contract gitlab.ts
  // and status.ts both follow (rss.ts's origins() doc comment has the full
  // rationale). A missing instanceUrl (a config saved before connecting) or a
  // non-https one both degrade to [] here rather than throwing.
  origins: (config) => {
    try {
      return config.instanceUrl ? [originPattern(config.instanceUrl)] : []
    } catch {
      return []
    }
  },
}
