import { withExtensionCors } from '../_shared/http.ts'
import { createRuntimeSyncHandlers } from '../_shared/syncRuntime.ts'

const handlers = await createRuntimeSyncHandlers(Deno.env)
Deno.serve((request) => withExtensionCors(request, 'POST', handlers.bootstrap))
