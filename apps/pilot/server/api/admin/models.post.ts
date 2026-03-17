import type { PilotModelCatalogItem, PilotRoutingPolicy } from '../../utils/pilot-admin-routing-config'
import { requirePilotAdmin } from '../../utils/pilot-admin-auth'
import { updatePilotAdminRoutingConfig } from '../../utils/pilot-admin-routing-config'

interface ModelsPatchBody {
  models?: PilotModelCatalogItem[]
  routingPolicy?: Partial<PilotRoutingPolicy>
}

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const body = await readBody<ModelsPatchBody>(event)
  const config = await updatePilotAdminRoutingConfig(event, {
    modelCatalog: Array.isArray(body?.models) ? body.models : undefined,
    routingPolicy: body?.routingPolicy,
  })

  return {
    ok: true,
    models: config.modelCatalog,
    routingPolicy: config.routingPolicy,
  }
})
