import type { AccountActions, AccountSnapshot } from './types'

export interface AccountClient {
  getSnapshot(): Promise<AccountSnapshot>
  subscribe(listener: (snapshot: AccountSnapshot) => void): () => void
  actions: AccountActions
}
