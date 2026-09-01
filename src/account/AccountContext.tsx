import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AccountClient } from './client'
import { createAccountClient } from './createAccountClient'
import { localAccountClient, localAccountSnapshot } from './localAccountClient'
import type { AccountActions, AccountSnapshot } from './types'

interface AccountContextValue {
  snapshot: AccountSnapshot
  actions: AccountActions
}

const AccountContext = createContext<AccountContextValue>({
  snapshot: localAccountSnapshot,
  actions: localAccountClient.actions,
})

export function AccountProvider({
  client,
  children,
}: {
  client?: AccountClient
  children: ReactNode
}) {
  const clientPromise = useRef<Promise<AccountClient> | null>(null)
  if (!clientPromise.current) {
    clientPromise.current = client ? Promise.resolve(client) : createAccountClient()
  }

  const [snapshot, setSnapshot] = useState<AccountSnapshot>(localAccountSnapshot)
  const [actions, setActions] = useState<AccountActions>(client?.actions ?? localAccountClient.actions)

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}

    void clientPromise.current!.then(async (resolvedClient) => {
      if (cancelled) return
      setActions(resolvedClient.actions)
      const hydrated = await resolvedClient.getSnapshot()
      if (cancelled) return
      setSnapshot(hydrated)
      unsubscribe = resolvedClient.subscribe((next) => {
        if (!cancelled) setSnapshot(next)
      })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({ snapshot, actions }), [snapshot, actions])
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount(): AccountContextValue {
  return useContext(AccountContext)
}
