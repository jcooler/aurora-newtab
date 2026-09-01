import { createRuntimeAccountHandlers } from '../_shared/runtime.ts'

const handlers = await createRuntimeAccountHandlers(Deno.env, { signing: 'required' })

Deno.serve((request) => handlers.entitlementLease(request))
