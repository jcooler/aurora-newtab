import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { authenticateSyncBearerRequest } from './syncAuth.ts'
import { createSyncHandlers } from './syncHandlers.ts'
import { createSyncKeyring } from './syncKeyring.ts'
import { createSyncRepository, type SyncRpcClient } from './syncRepository.ts'

interface RuntimeEnvironment {
  get(name: string): string | undefined
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment.get(name)?.trim()
  if (!value) throw new Error(`${name}_required`)
  return value
}

export async function createRuntimeSyncHandlers(environment: RuntimeEnvironment) {
  const supabaseUrl = required(environment, 'SUPABASE_URL')
  const serviceRoleKey = required(environment, 'SUPABASE_SERVICE_ROLE_KEY')
  const keyring = await createSyncKeyring({
    TAB_TWO_SYNC_KEK_V1: required(environment, 'TAB_TWO_SYNC_KEK_V1'),
  })
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  return createSyncHandlers({
    authenticate: (request) => authenticateSyncBearerRequest(request, supabase.auth),
    repository: createSyncRepository(supabase as unknown as SyncRpcClient),
    keyring,
    now: Date.now,
    randomBytes(length) {
      return crypto.getRandomValues(new Uint8Array(length))
    },
  })
}
