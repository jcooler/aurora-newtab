import { createRuntimeProviderHandlers } from '../_shared/providerRuntime.ts'

const handlers = await createRuntimeProviderHandlers(Deno.env)
Deno.serve(handlers.oauthCallback)
