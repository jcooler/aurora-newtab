import type { AccountActions, AccountSnapshot } from './types'
import type { SyncGateway } from '../sync/gateway'

export interface AccountClient {
  getSnapshot(): Promise<AccountSnapshot>
  subscribe(listener: (snapshot: AccountSnapshot) => void): () => void
  actions: AccountActions
  syncGateway: SyncGateway | null
}
