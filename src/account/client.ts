import type { AccountActions, AccountSnapshot } from './types'
import type { SyncGateway } from '../sync/gateway'
import type { ProviderGateway } from '../providers/gateway'
import type { ProviderId } from '../providers/types'

export interface AccountClient {
  accountDataExportEnabled?: boolean
  getSnapshot(): Promise<AccountSnapshot>
  subscribe(listener: (snapshot: AccountSnapshot) => void): () => void
  actions: AccountActions
  syncGateway: SyncGateway | null
  providerGateways: Readonly<Partial<Record<ProviderId, ProviderGateway>>>
}
