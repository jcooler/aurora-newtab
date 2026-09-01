import { createRuntimeAccountHandlers } from '../_shared/runtime.ts'

const handlers = await createRuntimeAccountHandlers(Deno.env, { signing: 'unavailable' })

Deno.serve((request) => handlers.accountSnapshot(request))
