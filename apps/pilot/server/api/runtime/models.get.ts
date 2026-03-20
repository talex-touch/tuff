import { requirePilotAuth } from '../../utils/auth'
import { getPilotAdminRoutingConfig, resolvePilotModelCapabilities } from '../../utils/pilot-admin-routing-config'

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)

  const routingConfig = await getPilotAdminRoutingConfig(event)

  const models = routingConfig.modelCatalog
    .map((item) => {
      const capabilities = resolvePilotModelCapabilities(item.capabilities, {
        allowWebsearch: item.allowWebsearch,
        allowImageGeneration: item.allowImageGeneration,
        allowFileAnalysis: item.allowFileAnalysis,
        allowImageAnalysis: item.allowImageAnalysis,
      })

      const allowFileAnalysis = capabilities['file.analyze'] !== false

      return {
        id: item.id,
        name: item.name,
        description: item.description,
        icon: item.icon,
        enabled: item.enabled !== false,
        visible: item.visible !== false,
        source: item.source,
        thinkingSupported: item.thinkingSupported !== false,
        thinkingDefaultEnabled: item.thinkingDefaultEnabled === true,
        capabilities,
        allowWebsearch: capabilities.websearch !== false,
        // 兼容旧字段：统一返回同一能力值，避免前端出现“双开关”语义分叉。
        allowImageAnalysis: allowFileAnalysis,
        allowImageGeneration: capabilities['image.generate'] !== false,
        allowFileAnalysis,
      }
    })
    .filter(item => item.enabled && item.visible)

  return {
    models,
    defaultModelId: routingConfig.routingPolicy.defaultModelId,
    defaultRouteComboId: routingConfig.routingPolicy.defaultRouteComboId,
    routingPolicy: routingConfig.routingPolicy,
    memoryPolicy: routingConfig.memoryPolicy,
  }
})
