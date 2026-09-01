import { createRuntimeBillingHandlers } from '../_shared/billingRuntime.ts'

const handlers = createRuntimeBillingHandlers(Deno.env)
Deno.serve(handlers.webhook)
