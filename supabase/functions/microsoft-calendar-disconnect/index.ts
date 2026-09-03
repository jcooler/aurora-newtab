import { withExtensionCors } from '../_shared/http.ts'
import { createRuntimeMicrosoftProviderHandlers } from '../_shared/providerMicrosoftRuntime.ts'

const handlers = await createRuntimeMicrosoftProviderHandlers(Deno.env)
Deno.serve((request) => withExtensionCors(request, 'POST', handlers.disconnect))
