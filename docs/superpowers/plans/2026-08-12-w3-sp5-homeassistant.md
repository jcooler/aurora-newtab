# W3-SP5: Home Assistant Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Home Assistant connector — instance URL + long-lived token, `/api/config` identity probe, a searchable domain-grouped entity picker over one `/api/states` fetch, and a board card of up to 6 state chips + 3 action buttons that call the HA service API — the first Home-category occupant and the first WRITE-capable connector.

**Architecture:** Pure service module (`src/services/connectors/homeassistant.ts`) following the GitLab shape (user-typed https base URL + Bearer token) with the status connector's no-stale-data ruling; a portaled entity-picker dialog in its own file (the ResetLayoutDialog precedent); a `HomeAssistantBody` card in Connectors.tsx wired through `TokenConnectForm`; a rail-card widget with measured height tiers. No schema bump (no WidgetToggles member; connector ids live inside the existing top-level `connectors` key).

**Tech Stack:** unchanged. No new deps. `postJson` (`http.ts:78`) already exists for the service calls.

**Spec:** `docs/superpowers/specs/2026-08-10-wave3-design.md:106-127` (W3-SP5 — binding), with four pinned rulings recorded here-vs-there:
1. **"Connected to {location_name}"** — the card shell hardcodes `Connected as {identity}` (Connectors.tsx:216); the spec wants "Connected **to**". Ruling: `ConnectorDescriptor` gains optional `identityPhrase?: 'as' | 'to'` (default `'as'`), the shell interpolates it. Typed, minimal, no special-casing.
2. **No stale home state** — the spec is silent on fetch-failure rendering. Ruling: follow the status connector's anti-staleness principle (status.ts:117-131): `fetchHomeAssistant` NEVER throws and NEVER carries `prev`; a failed `/api/states` resolves `{ entities: null }` and the widget renders nothing (no-husk, all-or-nothing — action buttons hide too, since a dead instance would turn every press into an error tint).
3. **The picker is its own file** — dialogs already get their own files (ResetLayoutDialog.tsx); `EntityPickerDialog.tsx` follows. The body stays in Connectors.tsx per the eight-bodies-inline convention.
4. **Registration is compile-coupled to the card** (the Tasks 93+94 lesson): the descriptor exports in Task 99 but does NOT enter `CONNECTORS` until Task 101 lands the body — a catalog card with a working toggle and no connect form is a husk, and husks don't land on main.

## Global Constraints

- **https-only (Jon informed and approved, spec :110-113):** `originPattern` throws on non-https (permissions.ts:86-88) and the manifest declares only `https://*/*` (manifest.ts:98). Helper text on the connect form, verbatim: `Requires https. Nabu Casa cloud URLs and reverse-proxied instances work; plain http://homeassistant.local:8123 cannot be granted.` Port-bearing https hosts work (`parsed.host` keeps the port).
- Caps (spec-pinned, owned by the service module like `MAX_SERVICES`): `MAX_CHIP_ENTITIES = 6`, `MAX_ACTIONS = 3`. Eligible action domains: `scene`, `script`, `switch` ONLY. Service calls: `scene.turn_on`, `script.turn_on`, `switch.toggle`.
- Chip copy exact: `{friendly_name} {value}{unit}` — unit appended with NO space when present (`Kitchen 21.5°C`), omitted when absent (`Front door Locked` renders as `Front door locked`? NO — state values render as HA reports them, capitalization untouched).
- Action buttons: pressed-state flash, brief error tint on failure, NO dialogs, NO error UI. Tailwind classes must be COMPLETE LITERAL STRINGS in lookup maps (the GitlabWidget.tsx:42-56 interpolation bug).
- `ttlMs: 60_000` (shortest in the fleet by 5x — spec :124 justifies: home state goes stale faster than PRs). Poll-on-tab-open only; the framework's once-per-mount refresh (useConnectorSnapshot.ts:107-118) IS that behavior.
- `secretFields: ['token']` — declaring it on the descriptor is the whole backup-strip integration (backup.ts:43-63). `identityField: 'locationName'`. `category: 'home'` (first occupant; the empty-category-never-renders rule un-suppresses the eyebrow automatically).
- Descriptor `auth: 'token'`; origins derive from the user-typed `instanceUrl` exactly like GitLab (gitlab.ts:354-360). No manifest change, no new permission justification (store-listing.md:246 covers user-typed https origins).
- Gesture law (permissions.ts:44-57): `ensureOrigin` is the FIRST await in the connect submit — TokenConnectForm already enforces this (:85-92); do not disturb it. Action-button presses need NO permission machinery (origin already held from connect).
- THE PACT (Connectors.tsx:1478,1526-1531): any write that changes the entity/action lists deletes `connectorSnapshots.homeassistant` in the SAME `storage.update`, and the widget remounts via a `key` derived from the picked-entity ids.
- House laws: no-husk; quiet degradation; never data-gate what CSS tier-gates; monotonic visibility; sentence case; danger red `text-red-400`; panel surfaces `bg-panel-solid` for overlays; `-canvas-` ink for photo-floating text; CONTAINMENT LAW (no transforms on zones).
- Verification per task: `npx tsc --noEmit` + `npx vitest run` + `npm run build` ALL PASS 0 FAIL; Tasks 103-104 add `npm run build:preview` + FULL FOREGROUND `node scripts/preview.mjs` (NEVER backgrounded). **Harness baseline: 399 PASS / 0 FAIL / 2 SKIP at `1383eb1` (controller-verified twice, 2026-08-11).** Every gate uses exact counts; every new probe named. Known flake: "remove revokes live" fails ~50%+ of runs; a run failing ONLY on it may be re-run.
- Version stays 1.13.0 until Task 104 bumps 1.14.0 (STAGED; v1.2.1 repo-evidence check first, STOP if landed).
- Unit-suite baseline at `1383eb1`: 93 files / 1435 tests.
- Commit trailer on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: ccd://775d49c5-1cf3-4369-bdf5-fcea2f05da88`

## Interfaces consumed (main at `1383eb1`)

```
src/services/connectors/types.ts — CONNECTOR_IDS (:8, 8 members); ConnectorCategory (:20, 'home' exists, no occupant per :18-19); CATEGORY_LABELS (:22-28); ConnectorConfig union (:168-176); ConnectorSnapshot (:178-181); ConnectorDescriptor (:197-215: id/label/blurb/category/auth/ttlMs/secretFields/origins/identityField); invariance-cast note (:188-196)
src/services/connectors/registry.ts — CONNECTORS (:49), per-entry cast pattern (:52), getConnector (:62), heldOrigins (:97), releasableOrigins (:128), PURITY CONTRACT (:1-10: no React, no chrome.* at module scope)
src/services/connectors/registry.test.ts — total id→category Record (:78-92, MUST gain a homeassistant entry); length-gated 1:1 check (:49-55)
src/services/connectors/gitlab.ts — the model: apiBase trailing-slash trim (:62), authHeaders Bearer (:66), whoamiGitlab shape (:317-331: {ok:true;identity}|{ok:false;message}, non-OK names the status), descriptor origins try/catch → [originPattern(instanceUrl)] (:354-360)
src/services/connectors/status.ts — MAX_SERVICES cap idiom (:29), read-time normalization boundary statusServicesOf (:65), never-throw fetch shape (:89-130), NO-prev ruling doc (:117-131)
src/services/connectors/http.ts — getJson (:59), postJson (:78-88: merges Content-Type, shares 8s abort; :93 unconditional res.json() — wrap callers in try/catch per status.ts:103), JsonResult/JsonError (:10-20)
src/lib/hooks/useConnectorSnapshot.ts — signature (:41-45), staleness+once-per-mount (:107-118), quiet failure keeps stale snapshot + local lastError (:89-93), __resetInFlight (:16)
src/lib/fuzzy.ts — fuzzyScore(needle, haystack): number|null (:4); ranking idiom: sort((a,b)=>b.score-a.score||a.i-b.i) (Connectors.tsx:112-117)
src/settings/sections/Connectors.tsx — BODY_COMPONENTS (:180-189); BodyProps {config, storage} (:29-32); ConnectorCard shell + "Connected as" line (:216) + reconnect (:219); GitlabBody as model (:566-691: narrowing cast :573-581, TokenConnectForm wiring :590-641, board-section chips :643-674, onDisconnect ordering :675-691); StatusBody PACT (:1526-1531) + add-flow gesture (:1542-1560); shared class strings src/settings/sections/shared.ts (row:14 label:17 eyebrow:20 control:25 select:30 btnQuiet:36 btnPrimary:42 btnDanger:47 submitBtn:52)
src/settings/sections/TokenConnectForm.tsx — TokenField (:5-11), props contract (:22-44: originsFor sync, validate async, onConnected, connectedAs, onDisconnect, connectedExtras slot :61-79), gesture chain (:85-92), multi-origin limitation note (:126-129)
src/settings/ToggleChip.tsx; src/services/connectors/views.ts — resolveViews (:13)
src/lib/ResetLayoutDialog.tsx — the portal precedent (:19-26 WHY, :51-103 structure, z-[70] ladder :28-31, Cancel-first :47-50); useFocusTrap (src/lib/hooks/useFocusTrap.ts:6, ready-predicate idiom); useDialogEscape (src/lib/dialogStack.ts:75)
src/newtab/widgets/palette/Palette.tsx — searchable-list a11y model (:99-142: combobox/listbox/option, activeIndex keyboard, empty state)
src/services/permissions.ts — originPattern https-throw (:84-90), ensureOrigin (:108), removeOrigin (:154), gesture law (:44-57)
src/lib/storage/schema.ts — CURRENT_VERSION 9 (:4); connectors/connectorSnapshots keys (:209-210); NO BUMP NEEDED (new connector ids are keys INSIDE the existing top-level connectors record — the status/ICS precedent; the STANDING RULE :6-21 binds WidgetToggles/Settings members only)
src/lib/backup.ts — stripSecrets via descriptor.secretFields (:43-63, no edit needed); structural isConnectorConfig (:289-291); cleanConnectors drops unknown ids (:339-346)
src/lib/layout/types.ts — BLOCK_IDS (:1-8, 24 members after status; grows 'homeassistant'); src/newtab/arrange/ArrangeController.tsx — BLOCK_LABELS exhaustive Record (:20-44)
src/newtab/App.tsx — rail structure (:488 rail-primary w-[var(--rail-w)], cards w-80); tier derivation narrative (:730-765); WidgetBoundary/PositionedBlock idiom; CONTAINMENT restatement (:767-779)
src/newtab/widgets/gitlab/GitlabWidget.tsx — rail-card model: glance caps (:22,:28), literal tier-class lookup maps + the interpolation bug story (:42-56)
src/newtab/widgets/status/StatusWidget.tsx — gate/inner split (:32-57), remount key (:57), no-husk data gate (:69), -canvas- ink trap doc (:134-151)
src/newtab/index.css — tiers: taller 890 (:456), ampler 922 (:509), tallest 1042 (:583); --rail-w (:247); panel class string (ResetLayoutDialog.tsx:76)
scripts/preview.mjs — status Block A/B probe idioms (:6257-6990: fixture law :6276-6283, gesture answer :6845, add/remove interaction :6867-6967); CONNECTOR_SELS (:9018-9026, 7 entries); PAGE_ELEMENTS (:9237-9254, 22 members, count computed :9273,:9291); combined-defaults (:8766-9296); rails sweep (:10416-10478, col2 steps :10421,:10435); newest probe = apod caption no-intersect (:8027-8063)
PRIVACY.md — Network calls (:93), numbered items 1-5 (:103-133), item 4 = connectors (:117-128: name list :118-119, "four that need one" :122, interval list :124-125); Connectors section (:238-321: fetch-only prose :240-246 NOW FALSE for HA, token story :257-276, "other seven" :289)
release/store-listing.md — addendum pattern (:832 latest), optional_host_permissions justification (:246, reused)
```

---

### Task 99: The service module — pure HA client, types, and the descriptor (unregistered)

**Files:**
- Modify: `src/services/connectors/types.ts` (id union :8, config union :168-176, `identityPhrase?: 'as' | 'to'` on ConnectorDescriptor after :215)
- Create: `src/services/connectors/homeassistant.ts`
- Modify: `src/services/connectors/registry.test.ts:78-92` (expected map gains `homeassistant: 'home'`)
- Test: `src/services/connectors/homeassistant.test.ts`

**Interfaces:**
- Consumes: `getJson`/`postJson` (http.ts:59,:78), `originPattern` (permissions.ts:84), `ConnectorDescriptor` (types.ts:197)
- Produces (later tasks rely on these EXACT names):
  - `interface HaEntityRef { id: string; name: string }` (picked entity: entity_id + friendly_name captured at pick time)
  - `interface HaAction { id: string; name: string; domain: 'scene' | 'script' | 'switch' }`
  - `interface HomeAssistantConfig { enabled: boolean; instanceUrl?: string; token?: string; locationName?: string; entities?: HaEntityRef[]; actions?: HaAction[] }`
  - `interface HaState { id: string; state: string; unit: string | null; friendlyName: string; domain: string }`
  - `interface HomeAssistantData { entities: HaState[] | null }` (null = the poll failed; render nothing)
  - `MAX_CHIP_ENTITIES = 6`, `MAX_ACTIONS = 3`, `ACTION_DOMAINS = ['scene','script','switch'] as const`
  - `haEntitiesOf(config)` / `haActionsOf(config)` — read-time normalization boundaries (cap-enforcing, malformed-entry-dropping; the statusServicesOf idiom)
  - `whoamiHomeAssistant(instanceUrl, token, fetchFn?)` → `Promise<{ ok: true; identity: string } | { ok: false; message: string }>` (GET `/api/config`, identity = `location_name`; non-OK names the status; 200 without a string `location_name` is `{ ok: false }`)
  - `fetchAllStates(instanceUrl, token, fetchFn?)` → `Promise<HaState[] | null>` (GET `/api/states`, the picker's ONE fetch; null on any failure)
  - `fetchHomeAssistant(instanceUrl, token, picked: HaEntityRef[], fetchFn?)` → `Promise<HomeAssistantData>` (filters fetchAllStates to picked ids; NEVER throws, NEVER carries prev)
  - `callHaService(instanceUrl, token, action: HaAction, fetchFn?)` → `Promise<boolean>` (POST `/api/services/{domain}/{service}` body `{ entity_id: action.id }`; service via `scene→scene.turn_on / script→script.turn_on / switch→switch.toggle`; try/catch around postJson per the res.json() caveat; true iff ok)
  - `homeassistantDescriptor: ConnectorDescriptor<HomeAssistantConfig>` — `id:'homeassistant'`, `label:'Home Assistant'`, blurb exactly: `Your home, at a glance — and three buttons that do things` (note: no apostrophes, avoids the quote-escaping hazard in single-quoted TS), `category:'home'`, `auth:'token'`, `ttlMs: 60_000`, `secretFields:['token']`, `identityField:'locationName'`, `identityPhrase:'to'`, origins = try `[originPattern(config.instanceUrl)]` catch `[]` — EXPORTED but NOT added to CONNECTORS (pinned ruling 4)

- [ ] **Step 1: types.ts — write the failing compile surface.** Add `'homeassistant'` to `CONNECTOR_IDS` (:8). Add `HomeAssistantConfig` import + union member (:168-176). Add to `ConnectorDescriptor` after `identityField` (:215):

```ts
  /**
   * Preposition for the card shell's connected line: "Connected as jon" vs
   * "Connected to Grand Rapids house". Defaults to 'as' when absent.
   */
  identityPhrase?: 'as' | 'to'
```

Run: `npx tsc --noEmit` — expected FAIL: registry.test.ts:78-92's total Record misses `homeassistant`, and the union member doesn't exist yet.

- [ ] **Step 2: Write the failing tests** (`homeassistant.test.ts`). Real behavior, fixture fetchFn (the gitlab.test.ts pattern — a `vi.fn` returning `Response` objects). Cover at minimum:

```ts
describe('whoamiHomeAssistant', () => {
  it('returns location_name as identity on 200', async () => {
    const fetchFn = jsonFetch({ location_name: 'Grand Rapids house' })
    const r = await whoamiHomeAssistant('https://ha.example.com:8123', 'tok', fetchFn)
    expect(r).toEqual({ ok: true, identity: 'Grand Rapids house' })
    expect(fetchFn).toHaveBeenCalledWith('https://ha.example.com:8123/api/config', expect.anything())
  })
  it('names the HTTP status on failure', async () => {
    const r = await whoamiHomeAssistant('https://ha.example.com', 'tok', statusFetch(401))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('401')
  })
  it('treats a 200 without a string location_name as failure', async () => {
    const r = await whoamiHomeAssistant('https://ha.example.com', 'tok', jsonFetch({ version: '2026.8' }))
    expect(r.ok).toBe(false)
  })
  it('trims trailing slashes from the instance url', async () => {
    const fetchFn = jsonFetch({ location_name: 'Home' })
    await whoamiHomeAssistant('https://ha.example.com/', 'tok', fetchFn)
    expect(fetchFn.mock.calls[0][0]).toBe('https://ha.example.com/api/config')
  })
})
describe('fetchHomeAssistant', () => {
  it('filters to picked ids and maps state/unit/friendly_name', async () => {
    const fetchFn = jsonFetch([
      { entity_id: 'sensor.kitchen_temp', state: '21.5', attributes: { friendly_name: 'Kitchen', unit_of_measurement: '°C' } },
      { entity_id: 'light.porch', state: 'on', attributes: { friendly_name: 'Porch light' } },
    ])
    const d = await fetchHomeAssistant('https://ha.example.com', 'tok', [{ id: 'sensor.kitchen_temp', name: 'Kitchen' }], fetchFn)
    expect(d.entities).toEqual([{ id: 'sensor.kitchen_temp', state: '21.5', unit: '°C', friendlyName: 'Kitchen', domain: 'sensor' }])
  })
  it('resolves { entities: null } on network failure — never throws, never stale', async () => {
    const d = await fetchHomeAssistant('https://ha.example.com', 'tok', [{ id: 'a.b', name: 'x' }], rejectingFetch())
    expect(d).toEqual({ entities: null })
  })
})
describe('callHaService', () => {
  it('POSTs the mapped service with entity_id body', async () => {
    const fetchFn = jsonFetch([])
    const ok = await callHaService('https://ha.example.com', 'tok', { id: 'switch.fan', name: 'Fan', domain: 'switch' }, fetchFn)
    expect(ok).toBe(true)
    expect(fetchFn.mock.calls[0][0]).toBe('https://ha.example.com/api/services/switch/toggle')
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ entity_id: 'switch.fan' })
  })
  it('maps scene→turn_on and script→turn_on', () => {
    expect(serviceFor('scene')).toBe('turn_on')
    expect(serviceFor('script')).toBe('turn_on')
    expect(serviceFor('switch')).toBe('toggle')
  })
  it('returns false on failure without throwing', async () => {
    expect(await callHaService('https://ha.example.com', 'tok', { id: 's.a', name: 'x', domain: 'scene' }, rejectingFetch())).toBe(false)
  })
})
describe('normalization boundaries', () => {
  it('haEntitiesOf caps at 6 and drops malformed entries', () => {
    const cfg = { enabled: true, entities: [...seven, { bogus: true }] } as never
    expect(haEntitiesOf(cfg)).toHaveLength(6)
  })
  it('haActionsOf caps at 3 and drops non-eligible domains', () => {
    const cfg = { enabled: true, actions: [{ id: 'light.x', name: 'L', domain: 'light' }, ...validThree, extra] } as never
    expect(haActionsOf(cfg)).toEqual(validThree)
  })
})
describe('descriptor', () => {
  it('origins derives one pattern from instanceUrl and filters bad urls', () => {
    expect(homeassistantDescriptor.origins({ enabled: true, instanceUrl: 'https://ha.example.com:8123' } as never)).toEqual(['https://ha.example.com:8123/*'])
    expect(homeassistantDescriptor.origins({ enabled: true, instanceUrl: 'http://ha.local' } as never)).toEqual([])
  })
  it('pins the spec constants', () => {
    expect(homeassistantDescriptor.ttlMs).toBe(60_000)
    expect(homeassistantDescriptor.secretFields).toEqual(['token'])
    expect(homeassistantDescriptor.identityPhrase).toBe('to')
  })
})
```

- [ ] **Step 3: Run to verify RED** — `npx vitest run src/services/connectors/homeassistant.test.ts`; expected FAIL (module not found — standard for new files, note it in the report).
- [ ] **Step 4: Implement `homeassistant.ts`.** Model on gitlab.ts (apiBase trim :62, Bearer authHeaders :66) + status.ts (never-throw, normalization boundary). Domain of an entity = `entity_id.split('.')[0]`. `unit` from `attributes.unit_of_measurement`, `friendlyName` from `attributes.friendly_name` falling back to the entity_id. Document the no-prev ruling in a header comment citing status.ts:117-131 ("a stale 'on' for a light that's now off is the same class of lie as a stale green dot"). Export `serviceFor(domain)` for the test. Wrap EVERY postJson/getJson in try/catch (http.ts:93 caveat).
- [ ] **Step 5: registry.test.ts** — add `homeassistant: 'home'` to the expected map (:78-92). Run: `npx vitest run src/services/connectors/homeassistant.test.ts src/services/connectors/registry.test.ts` — expected PASS. Then full gates: `npx tsc --noEmit`, `npx vitest run`, `npm run build` — ALL PASS, exact counts in the report.
- [ ] **Step 6: Commit + push** — `feat(ha): the house learns to speak — pure client for home assistant`

---

### Task 100: The entity picker dialog — searchable, domain-grouped, capped, portaled

**Files:**
- Create: `src/settings/sections/EntityPickerDialog.tsx`
- Test: `src/settings/sections/EntityPickerDialog.test.tsx`

**Interfaces:**
- Consumes: `HaState`, `HaEntityRef`, `HaAction`, `MAX_CHIP_ENTITIES`, `MAX_ACTIONS`, `ACTION_DOMAINS` (Task 99); `fuzzyScore` (fuzzy.ts:4); `useFocusTrap`, `useDialogEscape`, portal + z-[70] + panel classes (ResetLayoutDialog.tsx:19-31,:76); listbox a11y (Palette.tsx:113-142)
- Produces: `export default function EntityPickerDialog({ open, states, entities, actions, onCancel, onSave }: { open: boolean; states: HaState[]; entities: HaEntityRef[]; actions: HaAction[]; onCancel: () => void; onSave: (entities: HaEntityRef[], actions: HaAction[]) => void })` — PURE presentational: the card (Task 101) owns fetching; the dialog never touches the network or storage.

- [ ] **Step 1: Write the failing tests.** Testing-library, real DOM behavior:

Two written out as models (the rest follow the same testing-library shape):

```tsx
const STATES: HaState[] = [
  { id: 'sensor.kitchen_temp', state: '21.5', unit: '°C', friendlyName: 'Kitchen', domain: 'sensor' },
  { id: 'switch.fan', state: 'off', unit: null, friendlyName: 'Fan', domain: 'switch' },
  { id: 'scene.movie_night', state: 'scening', unit: null, friendlyName: 'Movie night', domain: 'scene' },
]

it('Save calls onSave with picked refs carrying friendly_name captured at pick time', async () => {
  const onSave = vi.fn()
  render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={onSave} />)
  await userEvent.click(screen.getByRole('checkbox', { name: /show kitchen/i }))
  await userEvent.click(screen.getByRole('checkbox', { name: /action movie night/i }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSave).toHaveBeenCalledWith(
    [{ id: 'sensor.kitchen_temp', name: 'Kitchen' }],
    [{ id: 'scene.movie_night', name: 'Movie night', domain: 'scene' }],
  )
})

it('offers an action checkbox ONLY for scene/script/switch rows', () => {
  render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)
  expect(screen.queryByRole('checkbox', { name: /action kitchen/i })).toBeNull()
  expect(screen.getByRole('checkbox', { name: /action fan/i })).toBeInTheDocument()
})
```

The remaining cases, each a real test with real assertions:
- groups entities by domain with an eyebrow per group (alphabetical domain order); filters via fuzzy match over `${friendlyName} ${id}` and shows `No matches` when empty
- at 6 picked chips, UNCHECKED entity checkboxes are disabled and the count line reads `6 of 6 chips` (cap enforced visibly, never silently dropped); same at 3 actions
- Escape calls onCancel; focus lands on the search input when opened; `open={false}` renders nothing
- checkbox aria-labels are `Show {friendlyName}` / `Action {friendlyName}` (what the model tests above rely on)

- [ ] **Step 2: RED run**, then implement. Structure (the ResetLayoutDialog skeleton verbatim: portal to document.body, sibling backdrop, `z-[70]`, panel class string from :76, Cancel first in DOM; the Palette listbox pattern for the list). One search `<input type="search">` at top (auto-focused via the trap), then domain groups (`<p>` eyebrow per domain using shared.ts eyebrow classes), each row: `<label>` + `<input type="checkbox">` (chip pick) + a second checkbox rendered only for ACTION_DOMAINS rows (action pick), name + dimmed entity id. Caps enforce by DISABLING unchecked boxes at the limit with a visible count (`4 of 6 chips · 2 of 3 actions`) — never silently dropping. Selection state is local; Save emits and the parent persists. Max height `max-h-96 overflow-y-auto` on the list only.
- [ ] **Step 3: GREEN run** (`npx vitest run src/settings/sections/EntityPickerDialog.test.tsx`), full gates, exact counts.
- [ ] **Step 4: Commit + push** — `feat(ha): the picker — six chips, three switches, one search box`

---

### Task 101: Registration + the card — connect, "Connected to", picker wiring, THE PACT

**Files:**
- Modify: `src/services/connectors/registry.ts` (:49-58 — import + `homeassistantDescriptor as ConnectorDescriptor,` after status)
- Modify: `src/settings/sections/Connectors.tsx` (BODY_COMPONENTS :180-189 + new `HomeAssistantBody` after StatusBody :1496ff + shell line :216)
- Test: `src/settings/sections/Connectors.test.tsx` (or the file's established test home — follow where StatusBody's tests live)

**Interfaces:**
- Consumes: everything Task 99 exports; `EntityPickerDialog` (Task 100); `TokenConnectForm` (:22-44); `originPattern`; `releasableOrigins`/`removeOrigin` disconnect ordering (Connectors.tsx:675-691); PACT idiom (:1526-1531)
- Produces: `HomeAssistantBody({ config, storage }: BodyProps)`; the shell renders `Connected {identityPhrase ?? 'as'} {identity}`.

- [ ] **Step 1: Failing tests.** Card shell: `renders "Connected to Grand Rapids house" for the ha card when configured` (proves identityPhrase plumbing); `gitlab still renders "Connected as jon"` (default unchanged). Body: connect form shows both fields + the verbatim https helper text; "Choose entities" appears only when connected; picking entities persists refs AND deletes `connectorSnapshots.homeassistant` in the same write (THE PACT — assert via storage spy on one update call); disconnect releases the origin share-aware and drops the config; a summary line shows `3 chips · 2 actions` after a save.
- [ ] **Step 2: RED, then implement.** Shell (:216): `Connected {getConnector(id)?.identityPhrase ?? 'as'} {String(identity)}`. Body follows GitlabBody's skeleton exactly (:566-691): narrowing cast + defensive reads; `TokenConnectForm` with `fields=[{ id:'instanceUrl', label:'Instance URL', type:'text', placeholder:'https://your-home.ui.nabu.casa' }, { id:'token', label:'Long-lived access token', type:'password', placeholder:'eyJ…' }]`, the https helper text as a `<p>` above the form (shared label classes, sentence case), `originsFor=(v)=>[originPattern(v.instanceUrl)]`, `validate=(v)=>whoamiHomeAssistant(v.instanceUrl, v.token)`, `onConnected` writes `{ enabled: true, instanceUrl, token, locationName: identity }` PRESERVING pre-existing `entities`/`actions` (the GitlabBody views-preservation pattern :629,:637). `connectedExtras`: the picked-summary line, a `Choose entities` button (btnQuiet), and the dialog mount. The button's onClick: `setPickerStates(null); setPickerOpen(true);` then `fetchAllStates(...)` → `setPickerStates(result)` — open FIRST, fetch into it (the dialog shows `Loading entities…` while `states === null`? NO — no placeholder law. RULING: the button fetches FIRST and opens on arrival; while in flight the button reads `Loading…` disabled (a real state on a real control, not placeholder UI); a null result flips an inline `role="alert"`: `Couldn't reach your instance. Check the URL and token, then try again.`). onSave: one `storage.update('connectors', ...)` writing entities+actions AND a second key delete in the same update callback for `connectorSnapshots.homeassistant` — mirror clearStatusSnapshot (:1526-1531) exactly (two updates in sequence is the status precedent; keep the pair adjacent). Disconnect: the GitLab ordering (:675-691).
- [ ] **Step 3: GREEN**, full gates (registry.test.ts 1:1 check un-vacuouses now — confirm it passes), exact counts.
- [ ] **Step 4: Commit + push** — `feat(ha): connected to home — the card, the token, the choice`

---

### Task 102: The widget — chips and switches on the board

**Files:**
- Create: `src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx`
- Modify: `src/lib/layout/types.ts:1-8` (BLOCK_IDS grows `'homeassistant'`); `src/newtab/arrange/ArrangeController.tsx:20-44` (BLOCK_LABELS `homeassistant: 'Home Assistant'`); `src/newtab/App.tsx` (rail-primary placement after the other connector cards); `src/newtab/index.css` ONLY if measurement demands a new tier (derivation comments mandatory)
- Test: `src/newtab/widgets/homeassistant/HomeAssistantWidget.test.tsx`

**Interfaces:**
- Consumes: `fetchHomeAssistant`, `callHaService`, `haEntitiesOf`, `haActionsOf`, `HomeAssistantData` (Task 99); `useConnectorSnapshot` (:41-45); gate/inner split + remount key (StatusWidget.tsx:32-57); literal tier-class maps (GitlabWidget.tsx:42-56)
- Produces: `HomeAssistantWidget` rail card, `section[aria-label="Home Assistant"]`, chips `{friendlyName} {state}{unit}`, action buttons `<button aria-label="Run {name}">`.

- [ ] **Step 1: Failing tests.** Gate: renders null when disabled/unconfigured/no picked entities AND no actions; zero hooks before the gate (setInterval spy — the sun/moon proof idiom). Inner: chips render exact copy (`Kitchen 21.5°C` — no space before unit; `Porch light on`); `entities: null` snapshot renders nothing INCLUDING buttons (pinned ruling 2); a button press calls `callHaService` with the picked action and flashes the pressed class; a failed press applies the error tint class and clears it after the timeout (fake timers); remount key changes when the picked list changes.
- [ ] **Step 2: RED, then implement.** Gate/inner split with the StatusWidget doc comment style. Inner: `useConnectorSnapshot<HomeAssistantData>('homeassistant', () => fetchHomeAssistant(instanceUrl, token, picked))` — note NO prev arg by design. `if (!data || data.entities === null) return null`. Chips: `<ul>` of `<li>` pills (`-canvas-` ink + text-photo — this floats on the photo). Buttons row below: `ACTION_TINTS` literal map `{ idle: '...', pressed: '...', error: '...' }` — complete literal strings; press handler: set pressed, `const ok = await callHaService(...)`, `setTint(ok ? 'idle' : 'error')`, error auto-clears after 1200ms (store the timeout, clear on unmount). No dialogs, no error text. Glance cap comments citing MAX constants. App.tsx: `<WidgetBoundary name="homeassistant"><PositionedBlock id="homeassistant" pos={layout?.homeassistant} className="tier-fade ...">` in rail-primary after the last connector card, tier class chosen by MEASUREMENT (build:preview + devtools; document the derivation; the column is crowded — homeassistant yields first as the newest member, the sun/moon precedent).
- [ ] **Step 3: GREEN**, full gates, exact counts.
- [ ] **Step 4: Commit + push** — `feat(ha): six chips and three buttons — home, on the board`

---

### Task 103: Harness — the house proves itself

**Files:**
- Modify: `scripts/preview.mjs`

- [ ] **Step 1: Drawer probes** (the status Block B idiom :6737-6990): category probe now expects the `Home` eyebrow (first occupant — assert it was ABSENT in the pre-HA grouping probe's expectations and update that probe's category list); catalog search finds "Home Assistant" by fuzzy fragment (`hoas`); connect deny path is gesture-ceilinged like every token connector — seed a full config + snapshot instead (THE FIXTURE LAW :6276-6283) and assert the connected card renders `Connected to {seeded location}` + the picked-summary line. Entity picker: seeded-config path cannot fetch real states headless — drive the dialog OPEN via a stubbed in-page fetch? NO — the harness never stubs the page's network (no precedent, and the fixture law exists precisely to avoid it). RULING: the picker's browser-real behaviors (search, caps, grouping) are unit-tested (Task 100); the harness asserts the `Choose entities` button exists, is enabled when connected, and the summary line matches the seeded refs. Log ONE `SKIP:` naming the headed spot-check owed: open the real picker against a live instance.
- [ ] **Step 2: Board probes**: seed config (entities + actions) + a fresh snapshot fixture; assert `section[aria-label="Home Assistant"]` renders exact chip text from the fixture (`Kitchen 21.5°C`); press an action button (REAL click) — the POST fails naturally headless (no live instance, origin ungranted) → assert the error tint class appears and clears (the interaction probe at the visual gate, spec :127); assert the section is ABSENT when the seeded snapshot carries `entities: null` (anti-staleness rendered honest); capture `ha-card.png` at 1600×900.
- [ ] **Step 3: Combined-defaults + sweeps**: CONNECTOR_SELS gains homeassistant (:9018-9026 → 8 entries); PAGE_ELEMENTS gains it (22 → 23; C(23,2) = 253 — update the prose claims at :8846,:8854); gap floors re-derived WITH the HA card present at its default placement (measured, derivation comments); rails sweep col2 steps' vis lists (:10421,:10435) gain `homeassistant` IF the tier math puts it visible at 1600×900 — decide by measurement, not assumption, and update the tier derivation comment (:10400-10415).
- [ ] **Step 4: Full gates incl. FULL FOREGROUND preview, exact counts (399-baseline + new named probes + the new SKIP, every delta accounted). Commit + push** — `test(ha): the house proves itself`

---

### Task 104: Wrap — docs, the write-connector disclosure, v1.14.0 staged

**Files:**
- Modify: `PRIVACY.md`, `README.md`, `release/store-listing.md`, `package.json` + `src/manifest.ts` (together)

- [ ] **Step 1: PRIVACY.md — the deliberate rewrite (survey surprise 2).** Item 4 (:117-128): name list gains Home Assistant (:118-119); ":122 the four that need one" → five; interval list (:124-125) gains `Home Assistant every 60 seconds` (shortest — say why in one clause: home state goes stale fast). The Connectors intro prose (:240-246) currently says connectors only FETCH — now false. Rewrite to disclose the write path plainly: Home Assistant action buttons SEND a command (`scene.turn_on`, `script.turn_on`, `switch.toggle`) to YOUR OWN instance, only when you click, never on a timer, and nothing else is ever written to any connector. "The other seven, concretely" (:289) → eight, with the HA bullet covering: https-only, token stored locally + stripped from backups, `/api/config` + `/api/states` + `/api/services/*` endpoints, 60s poll on tab open, entity names cached at pick time. Audit EVERY claim against Task 99-102 code before writing it (the Task 98 discipline; the reviewer will spot-check).
- [ ] **Step 2: README** — Connectors section (:151) gains the Home Assistant entry (https-only limitation stated; the picker; the caps). Sentence case throughout.
- [ ] **Step 3: store-listing.md** — `### v1.14.0 addendum — your home on your new tab (STILL staged; v1.2.1 verdict still gates ALL of this)` following the :832 body structure; no new permission justification (reuses :246); Data Usage: the token never leaves the device; commands go only to the user's own instance.
- [ ] **Step 4: v1.2.1 repo-evidence check (STOP if landed) → bump 1.14.0 (package.json + src/manifest.ts together) → `npm run package` → aurora-1.14.0.zip guards green.**
- [ ] **Step 5: Full verify (all gates, exact counts). Commit + push** — `feat: v1.14.0 — your home on your new tab`

## After Task 104

Whole-SP review (sonnet; escalate on structural doubt): charges — https-only enforced at every seam (originPattern throw path, helper text truthful, no http fallback anywhere); the write path safe and disclosed (callHaService only ever fires from a click, PRIVACY prose matches the code); anti-staleness honest (no prev carry, null renders nothing, chips never lie); THE PACT (entity-list writes clear the snapshot + remount key); caps enforced at the normalization boundary not the UI; gesture integrity untouched in TokenConnectForm; identityPhrase plumbing doesn't regress the other eight cards; picker portal + z-ladder + focus trap correct; PAGE_ELEMENTS/pairwise/floors arithmetic; fixture filenames not hand-drifted. ONE fix wave + ONE scoped re-review. Report to Jon with `ha-card.png` + the drawer capture. Atlassian (AUR issue, Done, the AUR-96 pattern) + memory + delete workspace.

## Out of scope

HA over plain-http LAN (spec :143); camera/media entities; entity-state WebSocket push; per-entity icons; action domains beyond scene/script/switch; multi-instance support; the deferred README Data/Privacy summary-section refresh (pre-existing debt, noted at Task 98); SP3 OAuth (still blocked on Jon's registrations).
