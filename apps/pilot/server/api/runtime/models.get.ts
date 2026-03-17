import { requirePilotAuth } from '../../utils/auth'
import { getPilotAdminRoutingConfig } from '../../utils/pilot-admin-routing-config'
import { getPilotChannelCatalog } from '../../utils/pilot-channel'

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)

  const [routingConfig, channelCatalog] = await Promise.all([
    getPilotAdminRoutingConfig(event),
    getPilotChannelCatalog(event),
  ])

  const map = new Map(routingConfig.modelCatalog.map(item => [item.id, {
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
  }]))

  for (const channel of channelCatalog.channels) {
    if (!channel.enabled) {
      continue
    }

    const channelModels = Array.isArray(channel.models) && channel.models.length > 0
      ? channel.models
      : [{ id: channel.defaultModelId || channel.model, enabled: true }]

    for (const model of channelModels) {
      const modelId = normalizeText(model.id)
      if (!modelId || map.has(modelId)) {
        continue
      }

      map.set(modelId, {
        id: modelId,
        name: model.label || modelId,
        description: '',
        icon: {
          type: 'class',
          value: 'i-carbon-machine-learning-model',
        },
        enabled: model.enabled !== false,
        visible: true,
        source: 'discovered',
        thinkingSupported: model.thinkingSupported !== false,
        thinkingDefaultEnabled: model.thinkingDefaultEnabled === true,
        allowWebsearch: true,
      })
    }
  }

  const models = Array.from(map.values())
    .filter(item => item.enabled && item.visible)

  return {
    models,
    defaultModelId: routingConfig.routingPolicy.defaultModelId,
    defaultRouteComboId: routingConfig.routingPolicy.defaultRouteComboId,
    routingPolicy: routingConfig.routingPolicy,
    memoryPolicy: routingConfig.memoryPolicy,
  }
})
