import { createRuntimeAccountHandlers } from '../_shared/runtime.ts'
import { withExtensionCors } from '../_shared/http.ts'

const handlers = await createRuntimeAccountHandlers(Deno.env, { signing: 'unavailable' })

Deno.serve((request) => withExtensionCors(request, 'GET', handlers.accountSnapshot))
