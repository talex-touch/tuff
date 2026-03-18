import { requirePilotAuth } from '../../utils/auth'
import { getPilotAdminRoutingConfig } from '../../utils/pilot-admin-routing-config'

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)

  const routingConfig = await getPilotAdminRoutingConfig(event)

  const models = routingConfig.modelCatalog
    .map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      icon: item.icon,
      enabled: item.enabled !== false,
      visible: item.visible !== false,
      source: item.source,
      thinkingSupported: item.thinkingSupported !== false,
      thinkingDefaultEnabled: item.thinkingDefaultEnabled === true,
      allowWebsearch: item.allowWebsearch !== false,
      allowImageAnalysis: item.allowImageAnalysis !== false,
      allowFileAnalysis: item.allowFileAnalysis !== false,
    }))
    .filter(item => item.enabled && item.visible)

  return {
    models,
    defaultModelId: routingConfig.routingPolicy.defaultModelId,
    defaultRouteComboId: routingConfig.routingPolicy.defaultRouteComboId,
    routingPolicy: routingConfig.routingPolicy,
    memoryPolicy: routingConfig.memoryPolicy,
  }
})
