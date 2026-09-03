import { withExtensionCors } from '../_shared/http.ts'
import { createRuntimeProviderHandlers } from '../_shared/providerRuntime.ts'

const handlers = await createRuntimeProviderHandlers(Deno.env)
Deno.serve((request) => withExtensionCors(request, 'GET', handlers.connections))
