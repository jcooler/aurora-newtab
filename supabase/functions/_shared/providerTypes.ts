import type { RequestAuthentication } from './requestAuth.ts'
import type { ProviderCrypto, ProviderSecretEnvelope } from './providerCrypto.ts'
import type { ProviderGoogleGateway } from './providerGoogle.ts'

export type ProviderId = 'google_calendar' | 'microsoft_calendar'
export type ProviderAccountKind = 'personal' | 'work_or_school'
export type ProviderConnectionStatus = 'active' | 'reconnect_required'
export type ProviderRateLimitAction = 'start' | 'callback_failure' | 'session' | 'disconnect'

export interface ProviderAccount {
  accountId: string
}

export interface ProviderOAuthTransaction {
  id: string
  accountId: string
  provider: ProviderId
  clientNonceHash: string
  pkce: ProviderSecretEnvelope
  finalRedirect: string
  expiresAt: number
  correlationId: string
}

export interface PrivateProviderConnection {
  id: string
  accountId: string
  provider: ProviderId
  accountKind: ProviderAccountKind | null
  providerSubject: string
  email: string
  displayName: string | null
  status: ProviderConnectionStatus
  grantedScopes: string[]
  refreshToken: ProviderSecretEnvelope
  createdAt: number
  updatedAt: number
  revokedAt: number | null
  lastTokenRefreshAt: number | null
}

export interface ProviderConnectionMetadata {
  id: string
  provider: ProviderId
  accountKind: ProviderAccountKind | null
  email: string
  displayName: string | null
  status: ProviderConnectionStatus
  grantedScopes: string[]
  createdAt: number
  updatedAt: number
}

export interface ProviderRepository {
  findAccountForAuthUser(authUserId: string): Promise<ProviderAccount | null>
  getEffectiveCapabilities(accountId: string, effectiveAt: number): Promise<readonly string[]>
  consumeRateLimit(input: {
    accountId: string | null
    action: ProviderRateLimitAction
    ipFingerprint: string
    effectiveAt: number
  }): Promise<boolean>
  createOAuthTransaction(input: {
    id: string
    accountId: string
    provider: ProviderId
    stateHash: string
    clientNonceHash: string
    pkce: ProviderSecretEnvelope
    finalRedirect: string
    expiresAt: number
    correlationId: string
    effectiveAt: number
  }): Promise<void>
  consumeOAuthTransaction(stateHash: string, effectiveAt: number): Promise<ProviderOAuthTransaction | null>
  findConnectionBySubject(
    accountId: string,
    provider: ProviderId,
    providerSubject: string,
  ): Promise<PrivateProviderConnection | null>
  upsertConnection(input: {
    id: string
    accountId: string
    provider: ProviderId
    accountKind: ProviderAccountKind | null
    providerSubject: string
    email: string
    displayName: string | null
    grantedScopes: readonly string[]
    refreshToken: ProviderSecretEnvelope | null
    effectiveAt: number
  }): Promise<PrivateProviderConnection>
  listConnections(accountId: string): Promise<ProviderConnectionMetadata[]>
  getConnection(accountId: string, connectionId: string): Promise<PrivateProviderConnection | null>
  rotateRefreshToken(input: {
    accountId: string
    connectionId: string
    refreshToken: ProviderSecretEnvelope
    effectiveAt: number
  }): Promise<boolean>
  markReconnectRequired(accountId: string, connectionId: string, effectiveAt: number): Promise<boolean>
  deleteConnection(accountId: string, connectionId: string, effectiveAt: number): Promise<boolean>
}

export interface ProviderFunctionDependencies {
  authenticate(request: Request): Promise<RequestAuthentication>
  repository: ProviderRepository
  crypto: ProviderCrypto
  google: ProviderGoogleGateway
  now(): number
  randomUUID(): string
  randomBytes(length: number): Uint8Array
  hash(value: string): Promise<string>
  requestFingerprint(request: Request): Promise<string>
  oauthClientId: string
  oauthCallbackUrl: string
  allowedExtensionId: string
}
