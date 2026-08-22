function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function parsedBody(body, provider) {
  expect(typeof body === 'string' && body.length > 0, `${provider} request body is missing`)
  try {
    const value = JSON.parse(body)
    expect(value && typeof value === 'object' && !Array.isArray(value), `${provider} request body is not an object`)
    return value
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${provider} request body is not JSON`)
    throw error
  }
}

function exactSearch(url, entries) {
  const actual = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv))
  const expected = [...entries].sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv))
  return JSON.stringify(actual) === JSON.stringify(expected)
}

export function inspectProviderRequest(request, tokens, expectations = {}) {
  const url = new URL(request.url)
  const method = String(request.method).toUpperCase()
  const authorization = request.authorization ?? ''

  if (url.hostname === 'api.linear.app') {
    expect(url.href === 'https://api.linear.app/graphql', `Unexpected Linear URL: ${url.href}`)
    expect(method === 'POST', `Unexpected Linear method: ${method}`)
    expect(authorization === tokens.linear, 'Linear authorization contract mismatch')
    expect(String(request.contentType ?? '').toLowerCase().startsWith('application/json'), 'Linear content type contract mismatch')
    const body = parsedBody(request.body, 'Linear')
    const query = typeof body.query === 'string' ? body.query : ''
    if (query.includes('query AuroraLinearIdentity')) {
      expect(body.variables === undefined, 'Linear identity variables are unexpected')
      return { provider: 'linear', operation: 'linear-identity' }
    }
    if (query.includes('query AuroraLinearWork($filter: IssueFilter)') && query.includes('assignedIssues(first: 50, filter: $filter)')) {
      expect(body.variables && Object.hasOwn(body.variables, 'filter'), 'Linear work filter variable is missing')
      const filter = body.variables.filter
      let linearTeamIds = []
      if (filter !== null) {
        const ids = filter?.team?.id?.in
        expect(
          Array.isArray(ids) &&
            ids.length > 0 &&
            ids.every((id) => typeof id === 'string' && id.length > 0) &&
            new Set(ids).size === ids.length &&
            canonical(filter) === canonical({ team: { id: { in: ids } } }),
          'Linear work filter shape is unexpected',
        )
        linearTeamIds = [...ids]
      }
      if (Array.isArray(expectations.linearTeamIds)) {
        const expectedFilter = expectations.linearTeamIds.length > 0
          ? { team: { id: { in: [...expectations.linearTeamIds] } } }
          : null
        expect(
          canonical(body.variables.filter) === canonical(expectedFilter),
          `Linear work filter mismatch: ${canonical(body.variables.filter)} != ${canonical(expectedFilter)}`,
        )
      }
      return { provider: 'linear', operation: 'linear-work', linearTeamIds }
    }
    throw new Error('Unexpected Linear operation')
  }

  if (url.hostname === 'us.sentry.io' || url.hostname === 'de.sentry.io' || url.hostname === 'sentry.io') {
    expect(method === 'GET', `Unexpected Sentry method: ${method}`)
    expect(url.hostname === 'us.sentry.io', `Unexpected Sentry host: ${url.hostname}`)
    expect(url.pathname === '/api/0/organizations/acme-labs/issues/', `Unexpected Sentry path: ${url.pathname}`)
    const projects = url.searchParams.getAll('project')
    expect(projects.every((project) => project === 'web' || project === 'api'), `Unexpected Sentry project query: ${projects.join(',')}`)
    expect(new Set(projects).size === projects.length, `Unexpected duplicate Sentry project query: ${projects.join(',')}`)
    expect(exactSearch(url, [
      ['query', 'is:unresolved'],
      ['sort', 'trends'],
      ['statsPeriod', '24h'],
      ['groupStatsPeriod', '24h'],
      ['limit', '25'],
      ...projects.map((project) => ['project', project]),
    ]), `Unexpected Sentry query: ${url.search}`)
    expect(authorization === `Bearer ${tokens.sentry}`, 'Sentry authorization contract mismatch')
    return { provider: 'sentry', operation: 'sentry-issues' }
  }

  if (url.hostname === 'api.todoist.com') {
    expect(authorization === `Bearer ${tokens.todoist}`, 'Todoist authorization contract mismatch')
    if (method === 'GET' && url.pathname === '/api/v1/projects' && exactSearch(url, [['limit', '200']])) {
      return { provider: 'todoist', operation: 'todoist-projects' }
    }
    if (method === 'GET' && url.pathname === '/api/v1/tasks' && exactSearch(url, [['limit', '200']])) {
      return { provider: 'todoist', operation: 'todoist-tasks' }
    }
    if (method === 'POST' && /^\/api\/v1\/tasks\/[^/]+\/close$/.test(url.pathname) && url.search === '' && request.body == null) {
      return { provider: 'todoist', operation: 'todoist-close' }
    }
    throw new Error(`Unexpected Todoist request: ${method} ${url.href}`)
  }

  throw new Error(`Unexpected provider request: ${method} ${url.href}`)
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

export function assertAllowedStorageChange(before, after, allowedKeys) {
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => canonical(before[key]) !== canonical(after[key]))
    .sort()
  const allowed = new Set(allowedKeys)
  const forbidden = changed.filter((key) => !allowed.has(key))
  expect(forbidden.length === 0, `Unexpected storage keys changed: ${forbidden.join(', ')}`)
  return changed
}

export function assertBuildProvenance(source, expectedCommit) {
  let parsed
  try { parsed = JSON.parse(source) } catch { throw new Error('dist build provenance is invalid JSON') }
  expect(parsed && parsed.commit === expectedCommit, `dist build provenance is stale: ${parsed?.commit ?? 'missing'} != ${expectedCommit}`)
  return parsed
}

export function assertOperationCounts(requestLog, expectedCounts) {
  const actual = new Map()
  for (const request of requestLog) {
    const operation = request?.bodyKind
    expect(typeof operation === 'string' && operation.length > 0, 'Provider request is missing its operation')
    actual.set(operation, (actual.get(operation) ?? 0) + 1)
  }
  const operations = new Set([...Object.keys(expectedCounts), ...actual.keys()])
  for (const operation of operations) {
    const expected = expectedCounts[operation] ?? 0
    const observed = actual.get(operation) ?? 0
    expect(observed === expected, `${operation} request count mismatch: ${observed} != ${expected}`)
  }
  return Object.fromEntries([...actual.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function requestValue(request, field) {
  const value = request[field]
  return typeof value === 'function' ? value.call(request) : value
}

export function requestFailureKey(request) {
  return JSON.stringify({
    method: requestValue(request, 'method'),
    url: requestValue(request, 'url'),
    body: requestValue(request, 'postData') ?? requestValue(request, 'body') ?? null,
  })
}

export function authorizeRequestFailure(authorizedRequestCounts, request) {
  const key = requestFailureKey(request)
  authorizedRequestCounts.set(key, (authorizedRequestCounts.get(key) ?? 0) + 1)
}

export function isExpectedRequestFailure(request, errorText, authorizedRequestCounts) {
  if (errorText !== 'net::ERR_ABORTED' && errorText !== 'net::ERR_FAILED') return false
  const key = requestFailureKey(request)
  const remaining = authorizedRequestCounts.get(key) ?? 0
  if (remaining < 1) return false
  if (remaining === 1) authorizedRequestCounts.delete(key)
  else authorizedRequestCounts.set(key, remaining - 1)
  return true
}
