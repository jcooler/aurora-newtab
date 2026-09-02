export type AccountFunctionError =
  | 'method_not_allowed'
  | 'authentication_required'
  | 'account_not_found'
  | 'entitlement_unavailable'
  | 'service_unavailable'

const chromeExtensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/u
const corsRequestHeaders = new Set([
  'authorization',
  'apikey',
  'cache-control',
  'content-type',
  'pragma',
  'x-client-info',
  'x-supabase-api-version',
])
const corsAllowHeaders = [...corsRequestHeaders].join(', ')

function validExtensionOrigin(value: string | null): value is string {
  return value !== null && chromeExtensionOrigin.test(value)
}

function corsHeaders(origin: string, method: 'GET' | 'POST'): Headers {
  return new Headers({
    'access-control-allow-origin': origin,
    'access-control-allow-methods': `${method}, OPTIONS`,
    'access-control-allow-headers': corsAllowHeaders,
    'access-control-max-age': '600',
    'cache-control': 'no-store',
    vary: 'Origin',
  })
}

export async function withExtensionCors(
  request: Request,
  method: 'GET' | 'POST',
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  const origin = request.headers.get('origin')
  if (request.method === 'OPTIONS') {
    const requestedMethod = request.headers.get('access-control-request-method')
    const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
    if (
      !validExtensionOrigin(origin)
      || requestedMethod !== method
      || requestedHeaders.some((value) => !corsRequestHeaders.has(value))
    ) {
      return new Response(null, { status: 403, headers: { 'cache-control': 'no-store' } })
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin, method) })
  }

  const response = await handler(request)
  if (!validExtensionOrigin(origin)) return response
  const headers = new Headers(response.headers)
  headers.set('access-control-allow-origin', origin)
  headers.set('vary', 'Origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export function errorResponse(error: AccountFunctionError, status: number): Response {
  return jsonResponse({ error }, status)
}
