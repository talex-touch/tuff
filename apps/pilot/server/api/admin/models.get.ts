import { requirePilotAdmin } from '../../utils/pilot-admin-auth'
import { getPilotAdminRoutingConfig } from '../../utils/pilot-admin-routing-config'

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const config = await getPilotAdminRoutingConfig(event)
  return {
    models: config.modelCatalog,
    routingPolicy: config.routingPolicy,
    memoryPolicy: config.memoryPolicy,
  }
})
