import type {
  PrivateProviderConnection,
  ProviderConnectionMetadata,
  ProviderOAuthTransaction,
  ProviderRepository,
} from './providerTypes.ts'

export interface ProviderRpcClient {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

function oneRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as Record<string, unknown>
    : null
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(String(value))
  if (!Number.isSafeInteger(parsed)) throw new Error('provider_repository_unavailable')
  return parsed
}

function nullableTimestamp(value: unknown): number | null {
  return value === null || value === undefined ? null : timestamp(value)
}

function effectiveAt(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error('provider_repository_input_invalid')
  return new Date(value).toISOString()
}

function repositoryError(error: unknown): never {
  const message = error && typeof error === 'object' ? Reflect.get(error, 'message') : null
  if (message === 'provider_connection_limit') throw new Error('provider_connection_limit')
  if (message === 'provider_refresh_token_required') throw new Error('provider_refresh_token_required')
  throw new Error('provider_repository_unavailable')
}

async function call(
  client: ProviderRpcClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, parameters)
  if (error) repositoryError(error)
  return data
}

function connectionRow(value: unknown): PrivateProviderConnection | null {
  const row = oneRow(value)
  if (!row) return null
  return {
    id: row.connection_id as string,
    accountId: row.account_id as string,
    provider: row.provider as PrivateProviderConnection['provider'],
    providerSubject: row.provider_subject as string,
    email: row.email as string,
    displayName: (row.display_name ?? null) as string | null,
    status: row.status as PrivateProviderConnection['status'],
    grantedScopes: row.granted_scopes as string[],
    refreshToken: {
      keyVersion: Number(row.token_key_version) as 1,
      nonce: row.refresh_token_nonce as string,
      ciphertext: row.refresh_token_ciphertext as string,
      fingerprint: row.refresh_token_fingerprint as string,
    },
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    revokedAt: nullableTimestamp(row.revoked_at),
    lastTokenRefreshAt: nullableTimestamp(row.last_successful_token_refresh_at),
  }
}

function metadataRows(value: unknown): ProviderConnectionMetadata[] {
  if (!Array.isArray(value)) throw new Error('provider_repository_unavailable')
  return value.map((rowValue) => {
    if (!rowValue || typeof rowValue !== 'object' || Array.isArray(rowValue)) {
      throw new Error('provider_repository_unavailable')
    }
    const row = rowValue as Record<string, unknown>
    return {
      id: row.connection_id as string,
      provider: row.provider as ProviderConnectionMetadata['provider'],
      email: row.email as string,
      displayName: (row.display_name ?? null) as string | null,
      status: row.status as ProviderConnectionMetadata['status'],
      grantedScopes: row.granted_scopes as string[],
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
    }
  })
}

export function createProviderRepository(client: ProviderRpcClient): ProviderRepository {
  const getConnection = async (accountId: string, connectionId: string) => (
    connectionRow(await call(client, 'tab_two_provider_get_connection', {
      target_account_id: accountId,
      target_connection_id: connectionId,
    }))
  )
  return {
    async findAccountForAuthUser(authUserId) {
      const row = oneRow(await call(client, 'tab_two_account_snapshot_for_auth', {
        target_auth_user_id: authUserId,
      }))
      return row ? { accountId: row.account_id as string } : null
    },
    async getEffectiveCapabilities(accountId, at) {
      const row = oneRow(await call(client, 'tab_two_effective_entitlement_for_account', {
        target_account_id: accountId,
        effective_at: effectiveAt(at),
      }))
      return row ? row.capabilities as string[] : []
    },
    async consumeRateLimit(input) {
      return await call(client, 'tab_two_consume_provider_rate_limit', {
        target_account_id: input.accountId,
        target_action: input.action,
        ip_fingerprint: input.ipFingerprint,
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    async createOAuthTransaction(input) {
      const created = await call(client, 'tab_two_provider_create_oauth_transaction', {
        transaction_id: input.id,
        target_account_id: input.accountId,
        provider_name: input.provider,
        state_digest: input.stateHash,
        nonce_digest: input.clientNonceHash,
        pkce_version: input.pkce.keyVersion,
        pkce_nonce: input.pkce.nonce,
        pkce_ciphertext: input.pkce.ciphertext,
        pkce_fingerprint: input.pkce.fingerprint,
        callback_redirect: input.finalRedirect,
        transaction_expires_at: effectiveAt(input.expiresAt),
        transaction_correlation_id: input.correlationId,
        effective_at: effectiveAt(input.effectiveAt),
      })
      if (created !== true) throw new Error('provider_repository_unavailable')
    },
    async consumeOAuthTransaction(stateHash, at) {
      const row = oneRow(await call(client, 'tab_two_provider_consume_oauth_transaction', {
        target_state_hash: stateHash,
        effective_at: effectiveAt(at),
      }))
      if (!row) return null
      return {
        id: row.transaction_id as string,
        accountId: row.account_id as string,
        provider: row.provider as ProviderOAuthTransaction['provider'],
        clientNonceHash: row.client_nonce_hash as string,
        pkce: {
          keyVersion: Number(row.pkce_key_version) as 1,
          nonce: row.pkce_verifier_nonce as string,
          ciphertext: row.pkce_verifier_ciphertext as string,
          fingerprint: row.pkce_verifier_fingerprint as string,
        },
        finalRedirect: row.final_redirect as string,
        expiresAt: timestamp(row.expires_at),
        correlationId: row.correlation_id as string,
      }
    },
    findConnectionBySubject(accountId, provider, providerSubject) {
      return call(client, 'tab_two_provider_find_connection_by_subject', {
        target_account_id: accountId,
        provider_name: provider,
        provider_identity_subject: providerSubject,
      }).then(connectionRow)
    },
    async upsertConnection(input) {
      const connectionId = await call(client, 'tab_two_provider_upsert_connection', {
        target_account_id: input.accountId,
        requested_connection_id: input.id,
        provider_name: input.provider,
        provider_identity_subject: input.providerSubject,
        provider_email: input.email,
        provider_display_name: input.displayName,
        provider_scopes: input.grantedScopes,
        refresh_key_version: input.refreshToken?.keyVersion ?? null,
        refresh_nonce: input.refreshToken?.nonce ?? null,
        refresh_ciphertext: input.refreshToken?.ciphertext ?? null,
        refresh_fingerprint: input.refreshToken?.fingerprint ?? null,
        effective_at: effectiveAt(input.effectiveAt),
      })
      if (typeof connectionId !== 'string') throw new Error('provider_repository_unavailable')
      const connection = await getConnection(input.accountId, connectionId)
      if (!connection) throw new Error('provider_repository_unavailable')
      return connection
    },
    async listConnections(accountId) {
      return metadataRows(await call(client, 'tab_two_provider_list_connections', {
        target_account_id: accountId,
      }))
    },
    getConnection,
    async rotateRefreshToken(input) {
      return await call(client, 'tab_two_provider_rotate_refresh_token', {
        target_account_id: input.accountId,
        target_connection_id: input.connectionId,
        refresh_key_version: input.refreshToken.keyVersion,
        refresh_nonce: input.refreshToken.nonce,
        refresh_ciphertext: input.refreshToken.ciphertext,
        refresh_fingerprint: input.refreshToken.fingerprint,
        effective_at: effectiveAt(input.effectiveAt),
      }) === true
    },
    async markReconnectRequired(accountId, connectionId, at) {
      return await call(client, 'tab_two_provider_mark_reconnect_required', {
        target_account_id: accountId,
        target_connection_id: connectionId,
        effective_at: effectiveAt(at),
      }) === true
    },
    async deleteConnection(accountId, connectionId, at) {
      return await call(client, 'tab_two_provider_delete_connection', {
        target_account_id: accountId,
        target_connection_id: connectionId,
        effective_at: effectiveAt(at),
      }) === true
    },
  }
}
