function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function exactAccept(request, expected, provider) {
  expect(request.accept === expected, `${provider} Accept contract mismatch`)
}

export function inspectAtAGlanceRequest(request) {
  const url = new URL(request.url)
  const method = String(request.method).toUpperCase()
  expect(method === 'GET', `Unexpected provider method: ${method}`)

  if (url.hostname === 'en.wikipedia.org') {
    expect(
      /^\/api\/rest_v1\/feed\/onthisday\/all\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(url.pathname) && url.search === '',
      `Unexpected Wikipedia request: ${url.href}`,
    )
    exactAccept(request, 'application/json', 'Wikipedia')
    return { provider: 'wikipedia', operation: 'on-this-day' }
  }

  if (url.hostname === 'date.nager.at') {
    expect(url.search === '', `Unexpected Nager query: ${url.search}`)
    if (url.pathname === '/api/v3/AvailableCountries') {
      return { provider: 'nager', operation: 'holiday-countries' }
    }
    const match = /^\/api\/v3\/PublicHolidays\/(\d{4})\/([A-Z]{2})$/.exec(url.pathname)
    expect(match, `Unexpected Nager request: ${url.href}`)
    return {
      provider: 'nager',
      operation: 'public-holidays',
      year: Number(match[1]),
      countryCode: match[2],
    }
  }

  if (url.hostname === 'services.swpc.noaa.gov') {
    expect(
      url.pathname === '/products/noaa-planetary-k-index-forecast.json' && url.search === '',
      `Unexpected SWPC request: ${url.href}`,
    )
    exactAccept(request, 'application/json', 'SWPC')
    return { provider: 'swpc', operation: 'aurora-kp' }
  }

  if (url.hostname === 'api.weather.gov') {
    expect(url.pathname === '/alerts/active', `Unexpected NWS path: ${url.pathname}`)
    const point = url.searchParams.get('point')
    expect(url.searchParams.size === 1 && typeof point === 'string', `Unexpected NWS query: ${url.search}`)
    const match = /^(-?\d+(?:\.\d{1,4})?),(-?\d+(?:\.\d{1,4})?)$/.exec(point)
    expect(match, `Unexpected NWS point: ${point}`)
    const lat = Number(match[1])
    const lon = Number(match[2])
    expect(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180, `Unexpected NWS point: ${point}`)
    exactAccept(request, 'application/geo+json', 'NWS')
    return { provider: 'nws', operation: 'weather-alerts', point }
  }

  throw new Error(`Unexpected provider request: ${method} ${url.href}`)
}
