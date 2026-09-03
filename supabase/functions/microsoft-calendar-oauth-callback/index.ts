import { createRuntimeMicrosoftProviderHandlers } from '../_shared/providerMicrosoftRuntime.ts'

const handlers = await createRuntimeMicrosoftProviderHandlers(Deno.env)
Deno.serve(handlers.oauthCallback)
