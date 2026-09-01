export type AccountFunctionError =
  | 'method_not_allowed'
  | 'authentication_required'
  | 'account_not_found'
  | 'entitlement_unavailable'
  | 'service_unavailable'

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
