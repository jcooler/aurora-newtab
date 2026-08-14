// src/services/connectors/homeassistant.test.ts — the Home Assistant
// connector's pure service layer: whoamiHomeAssistant (the connect form's
// token+instance probe), fetchAllStates (the entity PICKER's one fetch, all
// states unfiltered), fetchHomeAssistant (the widget's fetch — fetchAllStates
// filtered to the user's picked entities, never-throw, never-stale),
// callHaService (the three-button POST), the two read-time normalization
// boundaries (haEntitiesOf/haActionsOf), and the descriptor's shape. Same
// fake-Response/injectable-fetchFn idiom as gitlab.test.ts, so nothing here
// touches a real network. Task 99 (W3-SP5) — this connector is NOT yet
// registered in registry.ts (Task 101's job); this file exercises the module
// standalone.
import { describe, expect, it, vi } from 'vitest'
import {
  ACTION_DOMAINS,
  MAX_ACTIONS,
  MAX_CHIP_ENTITIES,
  callHaService,
  fetchAllStates,
  fetchHomeAssistant,
  haActionsOf,
  haEntitiesOf,
  homeassistantDescriptor,
  serviceFor,
  whoamiHomeAssistant,
  type HaAction,
  type HaEntityRef,
  type HomeAssistantConfig,
} from './homeassistant'

/** Minimal fetch Response stand-in — only the members getJson/postJson read
 *  (ok, status, headers.get('etag'), json()). Cast through `unknown` at each
 *  fetchFn call site, same as gitlab.test.ts/status.test.ts. */
function fakeResponse(opts: { ok?: boolean; status: number; body?: unknown }) {
  return {
    ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
    status: opts.status,
    headers: { get: () => null },
    json: vi.fn(async () => opts.body ?? {}),
  }
}

/** A fetchFn that always resolves 200 with `body` as the JSON payload. Typed
 *  with `typeof fetch`'s own (url, init) params — not a bare `() => ...` —
 *  so `.mock.calls[n][0]`/`[1]` type-check as `[string, RequestInit |
 *  undefined]` instead of an empty tuple. */
function jsonFetch(body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse({ status: 200, body }))
}

/** A fetchFn that always resolves with the given (non-2xx by default) HTTP
 *  status and no body. */
function statusFetch(status: number) {
  return vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse({ ok: false, status }))
}

/** A fetchFn that always rejects — the network-error / our-own-8s-abort case
 *  http.ts's fetchWithTimeout folds into a JsonError, never a thrown
 *  exception past getJson/postJson. */
function rejectingFetch() {
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    throw new Error('network down')
  })
}

describe('whoamiHomeAssistant', () => {
  it('returns location_name as identity on 200', async () => {
    const fetchFn = jsonFetch({ location_name: 'Grand Rapids house' })
    const r = await whoamiHomeAssistant('https://ha.example.com:8123', 'tok', fetchFn as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, identity: 'Grand Rapids house' })
    expect(fetchFn).toHaveBeenCalledWith('https://ha.example.com:8123/api/config', expect.anything())
  })

  it('names the HTTP status on failure', async () => {
    const r = await whoamiHomeAssistant('https://ha.example.com', 'tok', statusFetch(401) as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('401')
  })

  it('treats a 200 without a string location_name as failure', async () => {
    const r = await whoamiHomeAssistant(
      'https://ha.example.com',
      'tok',
      jsonFetch({ version: '2026.8' }) as unknown as typeof fetch,
    )
    expect(r.ok).toBe(false)
  })

  it('trims trailing slashes from the instance url', async () => {
    const fetchFn = jsonFetch({ location_name: 'Home' })
    await whoamiHomeAssistant('https://ha.example.com/', 'tok', fetchFn as unknown as typeof fetch)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://ha.example.com/api/config')
  })

  it('sends the token as a Bearer authorization header', async () => {
    const fetchFn = jsonFetch({ location_name: 'Home' })
    await whoamiHomeAssistant('https://ha.example.com', 'sekret', fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://ha.example.com/api/config',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sekret' }) }),
    )
  })

  it('a network failure fails with a message (not a throw)', async () => {
    const r = await whoamiHomeAssistant('https://ha.example.com', 'tok', rejectingFetch() as unknown as typeof fetch)
    expect(r.ok).toBe(false)
  })
})

describe('fetchAllStates', () => {
  it('GETs /api/states and returns the raw parsed states array', async () => {
    const fetchFn = jsonFetch([
      { entity_id: 'sensor.kitchen_temp', state: '21.5', attributes: { friendly_name: 'Kitchen', unit_of_measurement: '°C' } },
    ])
    const states = await fetchAllStates('https://ha.example.com', 'tok', fetchFn as unknown as typeof fetch)
    expect(states).toEqual([
      { id: 'sensor.kitchen_temp', state: '21.5', unit: '°C', friendlyName: 'Kitchen', domain: 'sensor' },
    ])
    expect(fetchFn).toHaveBeenCalledWith('https://ha.example.com/api/states', expect.anything())
  })

  it('resolves null on a non-OK status', async () => {
    const states = await fetchAllStates('https://ha.example.com', 'tok', statusFetch(500) as unknown as typeof fetch)
    expect(states).toBeNull()
  })

  it('resolves null on network failure, never throws', async () => {
    await expect(
      fetchAllStates('https://ha.example.com', 'tok', rejectingFetch() as unknown as typeof fetch),
    ).resolves.toBeNull()
  })

  it('resolves null when the body is not an array', async () => {
    const states = await fetchAllStates(
      'https://ha.example.com',
      'tok',
      jsonFetch({ not: 'an array' }) as unknown as typeof fetch,
    )
    expect(states).toBeNull()
  })

  it('drops malformed entries but keeps well-formed siblings', async () => {
    const fetchFn = jsonFetch([
      { entity_id: 'light.porch', state: 'on', attributes: { friendly_name: 'Porch light' } },
      { state: 'missing entity_id' },
      null,
      'not an object',
      { entity_id: 42, state: 'bad id type' },
    ])
    const states = await fetchAllStates('https://ha.example.com', 'tok', fetchFn as unknown as typeof fetch)
    expect(states).toEqual([{ id: 'light.porch', state: 'on', unit: null, friendlyName: 'Porch light', domain: 'light' }])
  })

  it('falls back to the entity_id as friendlyName when attributes.friendly_name is absent', async () => {
    const fetchFn = jsonFetch([{ entity_id: 'switch.fan', state: 'off', attributes: {} }])
    const states = await fetchAllStates('https://ha.example.com', 'tok', fetchFn as unknown as typeof fetch)
    expect(states).toEqual([{ id: 'switch.fan', state: 'off', unit: null, friendlyName: 'switch.fan', domain: 'switch' }])
  })
})

describe('fetchHomeAssistant', () => {
  it('filters to picked ids and maps state/unit/friendly_name', async () => {
    const fetchFn = jsonFetch([
      { entity_id: 'sensor.kitchen_temp', state: '21.5', attributes: { friendly_name: 'Kitchen', unit_of_measurement: '°C' } },
      { entity_id: 'light.porch', state: 'on', attributes: { friendly_name: 'Porch light' } },
    ])
    const d = await fetchHomeAssistant(
      'https://ha.example.com',
      'tok',
      [{ id: 'sensor.kitchen_temp', name: 'Kitchen' }],
      fetchFn as unknown as typeof fetch,
    )
    expect(d.entities).toEqual([{ id: 'sensor.kitchen_temp', state: '21.5', unit: '°C', friendlyName: 'Kitchen', domain: 'sensor' }])
  })

  it('resolves { entities: null } on network failure — never throws, never stale', async () => {
    const d = await fetchHomeAssistant(
      'https://ha.example.com',
      'tok',
      [{ id: 'a.b', name: 'x' }],
      rejectingFetch() as unknown as typeof fetch,
    )
    expect(d).toEqual({ entities: null })
  })

  it('resolves { entities: null } on a non-OK status — never carries a prior fetch forward', async () => {
    const d = await fetchHomeAssistant(
      'https://ha.example.com',
      'tok',
      [{ id: 'a.b', name: 'x' }],
      statusFetch(500) as unknown as typeof fetch,
    )
    expect(d).toEqual({ entities: null })
  })

  it('an empty picked list resolves entities: [] without fetching', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('should not be called')
    })
    const d = await fetchHomeAssistant('https://ha.example.com', 'tok', [], fetchFn as unknown as typeof fetch)
    expect(d).toEqual({ entities: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('a picked id absent from the fetched states is simply omitted (not an error)', async () => {
    const fetchFn = jsonFetch([{ entity_id: 'light.porch', state: 'on', attributes: {} }])
    const d = await fetchHomeAssistant(
      'https://ha.example.com',
      'tok',
      [{ id: 'sensor.gone', name: 'Gone' }],
      fetchFn as unknown as typeof fetch,
    )
    expect(d.entities).toEqual([])
  })
})

describe('callHaService', () => {
  it('POSTs the mapped service with entity_id body', async () => {
    const fetchFn = jsonFetch([])
    const ok = await callHaService(
      'https://ha.example.com',
      'tok',
      { id: 'switch.fan', name: 'Fan', domain: 'switch' },
      fetchFn as unknown as typeof fetch,
    )
    expect(ok).toBe(true)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://ha.example.com/api/services/switch/toggle')
    expect(JSON.parse((fetchFn.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toEqual({
      entity_id: 'switch.fan',
    })
  })

  it('maps scene->turn_on and script->turn_on', () => {
    expect(serviceFor('scene')).toBe('turn_on')
    expect(serviceFor('script')).toBe('turn_on')
    expect(serviceFor('switch')).toBe('toggle')
  })

  it('returns false on failure without throwing', async () => {
    expect(
      await callHaService(
        'https://ha.example.com',
        'tok',
        { id: 's.a', name: 'x', domain: 'scene' },
        rejectingFetch() as unknown as typeof fetch,
      ),
    ).toBe(false)
  })

  it('returns false on a non-OK status without throwing', async () => {
    expect(
      await callHaService(
        'https://ha.example.com',
        'tok',
        { id: 's.a', name: 'x', domain: 'scene' },
        statusFetch(400) as unknown as typeof fetch,
      ),
    ).toBe(false)
  })

  it('sends the Bearer token header', async () => {
    const fetchFn = jsonFetch([])
    await callHaService(
      'https://ha.example.com',
      'tok123',
      { id: 'scene.movie', name: 'Movie', domain: 'scene' },
      fetchFn as unknown as typeof fetch,
    )
    expect(fetchFn).toHaveBeenCalledWith(
      'https://ha.example.com/api/services/scene/turn_on',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok123' }) }),
    )
  })
})

describe('normalization boundaries', () => {
  it('haEntitiesOf caps at 6 and drops malformed entries', () => {
    const seven: HaEntityRef[] = Array.from({ length: 7 }, (_, i) => ({ id: `sensor.e${i}`, name: `E${i}` }))
    const cfg = { enabled: true, entities: [...seven, { bogus: true }] } as unknown as HomeAssistantConfig
    expect(haEntitiesOf(cfg)).toHaveLength(6)
    expect(haEntitiesOf(cfg)).toEqual(seven.slice(0, MAX_CHIP_ENTITIES))
  })

  it('haEntitiesOf on absent/undefined entities -> []', () => {
    expect(haEntitiesOf({ enabled: true } as HomeAssistantConfig)).toEqual([])
    expect(haEntitiesOf(undefined)).toEqual([])
  })

  it('haEntitiesOf drops entries missing id or name', () => {
    const cfg = {
      enabled: true,
      entities: [{ id: 'sensor.a', name: 'A' }, { id: 'sensor.b' }, { name: 'No id' }, { id: 123, name: 'Bad id type' }],
    } as unknown as HomeAssistantConfig
    expect(haEntitiesOf(cfg)).toEqual([{ id: 'sensor.a', name: 'A' }])
  })

  it('haActionsOf caps at 3 and drops non-eligible domains', () => {
    const validThree: HaAction[] = [
      { id: 'scene.movie', name: 'Movie', domain: 'scene' },
      { id: 'script.goodnight', name: 'Goodnight', domain: 'script' },
      { id: 'switch.fan', name: 'Fan', domain: 'switch' },
    ]
    const extra: HaAction = { id: 'scene.extra', name: 'Extra', domain: 'scene' }
    const cfg = {
      enabled: true,
      actions: [{ id: 'light.x', name: 'L', domain: 'light' }, ...validThree, extra],
    } as unknown as HomeAssistantConfig
    expect(haActionsOf(cfg)).toEqual(validThree)
    expect(haActionsOf(cfg)).toHaveLength(MAX_ACTIONS)
  })

  it('haActionsOf on absent/undefined actions -> []', () => {
    expect(haActionsOf({ enabled: true } as HomeAssistantConfig)).toEqual([])
    expect(haActionsOf(undefined)).toEqual([])
  })

  it('ACTION_DOMAINS pins the three eligible domains', () => {
    expect(ACTION_DOMAINS).toEqual(['scene', 'script', 'switch'])
  })
})

describe('descriptor', () => {
  it('origins derives one pattern from instanceUrl and filters bad urls', () => {
    expect(
      homeassistantDescriptor.origins({ enabled: true, instanceUrl: 'https://ha.example.com:8123' } as HomeAssistantConfig),
    ).toEqual(['https://ha.example.com:8123/*'])
    expect(
      homeassistantDescriptor.origins({ enabled: true, instanceUrl: 'http://ha.local' } as HomeAssistantConfig),
    ).toEqual([])
  })

  it('origins on a missing/malformed instanceUrl degrades to [] rather than throwing', () => {
    expect(() => homeassistantDescriptor.origins({ enabled: true } as HomeAssistantConfig)).not.toThrow()
    expect(homeassistantDescriptor.origins({ enabled: true } as HomeAssistantConfig)).toEqual([])
  })

  it('pins the spec constants', () => {
    expect(homeassistantDescriptor.id).toBe('homeassistant')
    expect(homeassistantDescriptor.label).toBe('Home Assistant')
    expect(homeassistantDescriptor.blurb).toBe('Your home, at a glance — and three buttons that do things')
    expect(homeassistantDescriptor.category).toBe('home')
    expect(homeassistantDescriptor.auth).toBe('token')
    expect(homeassistantDescriptor.ttlMs).toBe(60_000)
    expect(homeassistantDescriptor.secretFields).toEqual(['token'])
    expect(homeassistantDescriptor.identityField).toBe('locationName')
    expect(homeassistantDescriptor.identityPhrase).toBe('to')
  })

  it('owns its origin only after url, token, and location identity are configured, independent of enabled', () => {
    expect(
      homeassistantDescriptor.ownsOrigins({
        enabled: false,
        instanceUrl: 'https://ha.example.com',
        token: 't',
        locationName: 'House',
      }),
    ).toBe(true)
    expect(homeassistantDescriptor.ownsOrigins({ enabled: true, instanceUrl: 'https://ha.example.com' })).toBe(false)
    expect(
      homeassistantDescriptor.ownsOrigins({
        enabled: true,
        instanceUrl: 'http://ha.local',
        token: 't',
        locationName: 'House',
      }),
    ).toBe(false)
  })
})
