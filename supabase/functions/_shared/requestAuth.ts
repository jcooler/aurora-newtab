export interface SupabaseAuthBoundary {
  getUser(token: string): Promise<{
    data: {
      user: null | {
        id: string
        app_metadata?: Record<string, unknown>
      }
    }
    error: unknown
  }>
}

export type RequestAuthentication =
  | { ok: true; authUserId: string }
  | { ok: false }

export async function authenticateBearerRequest(
  request: Request,
  auth: SupabaseAuthBoundary,
): Promise<RequestAuthentication> {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/u)
  if (!match) return { ok: false }

  try {
    const { data, error } = await auth.getUser(match[1])
    const user = data.user
    const provider = user?.app_metadata?.provider
    const providers = user?.app_metadata?.providers
    if (
      error
      || !user
      || !user.id
      || provider !== 'google'
      || !Array.isArray(providers)
      || !providers.includes('google')
    ) {
      return { ok: false }
    }
    return { ok: true, authUserId: user.id }
  } catch {
    return { ok: false }
  }
}
