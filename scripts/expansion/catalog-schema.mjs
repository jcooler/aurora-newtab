const ROOT_KEYS = ['catalogVersion', 'verifiedOn', 'candidates']
const CANDIDATE_KEYS = [
  'id', 'label', 'kind', 'status', 'wave', 'priority', 'userValue',
  'glanceQuestion', 'source', 'auth', 'access', 'privacy', 'cache', 'settings',
  'presentation', 'maintenance', 'decision',
]

const ENUMS = Object.freeze({
  kind: ['browser-native', 'built-in-provider', 'connector', 'local'],
  status: ['approved-wave', 'researched', 'deferred', 'absorbed', 'blocked'],
  wave: ['browser-native', 'work', 'at-a-glance', 'broader', 'backlog'],
  authMode: ['none', 'browser-permission', 'api-token', 'oauth-pkce', 'oauth-secret-required', 'local'],
  termsRisk: ['low', 'medium', 'high', 'unknown'],
  maintenanceRisk: ['low', 'medium', 'high'],
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, path, expected, errors) {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`)
    return false
  }
  const allowed = new Set(expected)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unexpected field`)
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key}: field is required`)
  }
  return true
}

function text(value, path, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path}: expected nonblank text`)
    return false
  }
  return true
}

function enumeration(value, path, allowed, errors) {
  if (!allowed.includes(value)) {
    errors.push(`${path}: expected one of ${allowed.join(', ')}`)
    return false
  }
  return true
}

function stringArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array`)
    return false
  }
  value.forEach((item, index) => text(item, `${path}[${index}]`, errors))
  return true
}

function httpsUrl(value, path, errors) {
  if (typeof value !== 'string') {
    errors.push(`${path}: expected an HTTPS URL`)
    return false
  }
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:') throw new Error('insecure')
  } catch {
    errors.push(`${path}: expected an HTTPS URL`)
    return false
  }
  return true
}

function isoDate(value, path, errors) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${path}: expected an ISO calendar date`)
    return false
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    errors.push(`${path}: expected an ISO calendar date`)
    return false
  }
  return true
}

function boolean(value, path, errors) {
  if (typeof value !== 'boolean') {
    errors.push(`${path}: expected a boolean`)
    return false
  }
  return true
}

function nestedTextObject(value, path, keys, errors) {
  if (!exactKeys(value, path, keys, errors)) return
  for (const key of keys) text(value[key], `${path}.${key}`, errors)
}

function nestedArrayObject(value, path, keys, errors) {
  if (!exactKeys(value, path, keys, errors)) return
  for (const key of keys) stringArray(value[key], `${path}.${key}`, errors)
}

function validateCandidate(value, index, errors) {
  const path = `candidates[${index}]`
  if (!exactKeys(value, path, CANDIDATE_KEYS, errors)) return

  if (text(value.id, `${path}.id`, errors) && !/^[a-z][a-zA-Z0-9]*$/.test(value.id)) {
    errors.push(`${path}.id: expected lower camel case`)
  }
  text(value.label, `${path}.label`, errors)
  enumeration(value.kind, `${path}.kind`, ENUMS.kind, errors)
  enumeration(value.status, `${path}.status`, ENUMS.status, errors)
  enumeration(value.wave, `${path}.wave`, ENUMS.wave, errors)
  if (!Number.isInteger(value.priority) || value.priority < 1 || value.priority > 5) {
    errors.push(`${path}.priority: expected an integer from 1 through 5`)
  }
  text(value.userValue, `${path}.userValue`, errors)
  text(value.glanceQuestion, `${path}.glanceQuestion`, errors)

  if (exactKeys(value.source, `${path}.source`, ['provider', 'docsUrl', 'transport', 'termsRisk'], errors)) {
    text(value.source.provider, `${path}.source.provider`, errors)
    httpsUrl(value.source.docsUrl, `${path}.source.docsUrl`, errors)
    text(value.source.transport, `${path}.source.transport`, errors)
    enumeration(value.source.termsRisk, `${path}.source.termsRisk`, ENUMS.termsRisk, errors)
  }

  if (exactKeys(value.auth, `${path}.auth`, ['mode', 'directClientViable', 'secretHandling'], errors)) {
    enumeration(value.auth.mode, `${path}.auth.mode`, ENUMS.authMode, errors)
    boolean(value.auth.directClientViable, `${path}.auth.directClientViable`, errors)
    text(value.auth.secretHandling, `${path}.auth.secretHandling`, errors)
    if (value.auth.mode === 'oauth-secret-required' && value.auth.directClientViable === true) {
      errors.push(`${path}.auth.directClientViable: oauth-secret-required cannot be direct-client viable`)
    }
  }

  nestedArrayObject(value.access, `${path}.access`, ['chromePermissions', 'origins', 'userWarnings'], errors)
  if (exactKeys(value.privacy, `${path}.privacy`, ['sends', 'receives', 'stores', 'backup', 'redaction'], errors)) {
    stringArray(value.privacy.sends, `${path}.privacy.sends`, errors)
    stringArray(value.privacy.receives, `${path}.privacy.receives`, errors)
    stringArray(value.privacy.stores, `${path}.privacy.stores`, errors)
    text(value.privacy.backup, `${path}.privacy.backup`, errors)
    text(value.privacy.redaction, `${path}.privacy.redaction`, errors)
  }
  nestedTextObject(value.cache, `${path}.cache`, ['freshness', 'staleBehavior', 'refresh', 'failure'], errors)
  nestedArrayObject(value.settings, `${path}.settings`, ['setup', 'controls', 'validation'], errors)
  nestedTextObject(value.presentation, `${path}.presentation`, [
    'compact', 'standard', 'full', 'docked', 'interaction', 'empty', 'loading',
    'stale', 'error',
  ], errors)

  if (exactKeys(value.maintenance, `${path}.maintenance`, ['risk', 'drivers'], errors)) {
    enumeration(value.maintenance.risk, `${path}.maintenance.risk`, ENUMS.maintenanceRisk, errors)
    stringArray(value.maintenance.drivers, `${path}.maintenance.drivers`, errors)
  }
  if (exactKeys(value.decision, `${path}.decision`, ['rationale', 'blockers'], errors)) {
    text(value.decision.rationale, `${path}.decision.rationale`, errors)
    stringArray(value.decision.blockers, `${path}.decision.blockers`, errors)
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

export function validateExpansionCatalog(value) {
  const errors = []
  if (!exactKeys(value, 'catalog', ROOT_KEYS, errors)) {
    return { ok: false, errors: errors.sort() }
  }

  if (value.catalogVersion !== 1) errors.push('catalogVersion: expected 1')
  isoDate(value.verifiedOn, 'verifiedOn', errors)

  if (!Array.isArray(value.candidates)) {
    errors.push('candidates: expected an array')
  } else {
    if (value.candidates.length < 36) errors.push('candidates: expected at least 36 candidates')
    const seen = new Set()
    value.candidates.forEach((entry, index) => {
      validateCandidate(entry, index, errors)
      if (typeof entry?.id !== 'string') return
      if (seen.has(entry.id)) errors.push(`candidates[${index}].id: duplicate "${entry.id}"`)
      seen.add(entry.id)
    })
  }

  if (errors.length > 0) return { ok: false, errors: errors.sort() }
  return { ok: true, catalog: deepFreeze(structuredClone(value)) }
}
