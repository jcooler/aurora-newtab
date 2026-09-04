import { createRuntimeAccountExportHandler } from '../_shared/accountExportRuntime.ts'
import { withExtensionCors } from '../_shared/http.ts'

const handler = await createRuntimeAccountExportHandler(Deno.env)
Deno.serve((request) => withExtensionCors(request, 'POST', handler))
