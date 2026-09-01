import { withExtensionCors } from '../_shared/http.ts'
import { createRuntimeBillingHandlers } from '../_shared/billingRuntime.ts'

const handlers = createRuntimeBillingHandlers(Deno.env)
Deno.serve((request) => withExtensionCors(request, 'POST', handlers.portal))
