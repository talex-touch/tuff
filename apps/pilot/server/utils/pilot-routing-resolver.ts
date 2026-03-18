import type { H3Event } from 'h3'
import type { PilotModelCatalogItem, PilotRouteComboItem } from './pilot-admin-routing-config'
import type { PilotBuiltinTool, PilotChannelConfig } from './pilot-channel'
import { getPilotAdminRoutingConfig } from './pilot-admin-routing-config'
import { getPilotChannelCatalog, resolvePilotChannelSelection } from './pilot-channel'
import { computeChannelModelStats } from './pilot-channel-scorer'
import { buildRouteKey, isRouteHealthy } from './pilot-route-health'

interface RouteCandidate {
  channelId: string
  providerModel: string
  modelId: string
  routeComboId: string
  priority: number
  weight: number
  reason: string
}

export interface PilotRoutingResolveInput {
  requestChannelId?: string
  sessionChannelId?: string
  requestedModelId?: string
  routeComboId?: string
  internet?: boolean
  thinking?: boolean
}

export interface PilotRoutingResolveResult {
  channel: PilotChannelConfig
  channelId: string
  adapter: PilotChannelConfig['adapter']
  transport: PilotChannelConfig['transport']
  modelId: string
  providerModel: string
  routeComboId: string
  selectionReason: string
  selectionSource: 'route-combo' | 'model-binding' | 'quota-auto' | 'fallback'
  builtinTools: PilotBuiltinTool[]
  internet: boolean
  thinking: boolean
  score: number
  routeKey: string
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

function normalizeNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(parsed, min), max)
}

function normalizeFloat(value: unknown, fallback: number, min = 0, max = 1): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(parsed, min), max)
}

function normalizeModelFormat(value: unknown): PilotRoutingResolveResult['transport'] | '' {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) {
    return ''
  }
  if (normalized === 'chat.completions' || normalized === 'chat_completions' || normalized === 'completions') {
    return 'chat.completions'
  }
  if (normalized === 'responses') {
    return 'responses'
  }
  return ''
}

function resolveTransportByModel(
  channel: PilotChannelConfig,
  providerModel: string,
): PilotRoutingResolveResult['transport'] {
  const modelId = normalizeText(providerModel)
  if (!modelId) {
    return channel.transport
  }
  const modelConfig = (channel.models || []).find(model => normalizeText(model.id) === modelId)
  return normalizeModelFormat(modelConfig?.format) || channel.transport
}

function uniqueCandidates(list: RouteCandidate[]): RouteCandidate[] {
  const map = new Map<string, RouteCandidate>()
  for (const item of list) {
    const channelId = normalizeText(item.channelId)
    const providerModel = normalizeText(item.providerModel)
    const modelId = normalizeText(item.modelId)
    const routeComboId = normalizeText(item.routeComboId)
    if (!channelId || !providerModel || !modelId) {
      continue
    }

    const key = `${channelId}::${providerModel}`
    if (!map.has(key)) {
      map.set(key, {
        ...item,
        channelId,
        providerModel,
        modelId,
        routeComboId: routeComboId || 'default-auto',
      })
      continue
    }

    const current = map.get(key)!
    if (item.priority < current.priority) {
      map.set(key, {
        ...current,
        ...item,
        channelId,
        providerModel,
        modelId,
        routeComboId: routeComboId || current.routeComboId,
      })
    }
  }
  return Array.from(map.values())
}

function resolveModelCatalog(
  modelCatalog: PilotModelCatalogItem[],
  channels: PilotChannelConfig[],
): PilotModelCatalogItem[] {
  const map = new Map(modelCatalog.map(item => [item.id, {
    ...item,
    bindings: [...(item.bindings || [])],
  }]))

  for (const channel of channels) {
    const channelModels = Array.isArray(channel.models) && channel.models.length > 0
      ? channel.models
      : [{ id: channel.model, enabled: true }]

    for (const model of channelModels) {
      const providerModel = normalizeText(model.id)
      if (!providerModel) {
        continue
      }
      const existing = map.get(providerModel)
      if (!existing) {
        map.set(providerModel, {
          id: providerModel,
          name: model.label || providerModel,
          enabled: model.enabled !== false,
          visible: true,
          source: 'discovered',
          thinkingSupported: model.thinkingSupported !== false,
          thinkingDefaultEnabled: model.thinkingDefaultEnabled === true,
          allowWebsearch: true,
          bindings: [{
            channelId: channel.id,
            providerModel,
            enabled: true,
            priority: 100,
            weight: 100,
          }],
        })
        continue
      }

      const hasBinding = existing.bindings.some(binding => binding.channelId === channel.id && binding.providerModel === providerModel)
      if (!hasBinding) {
        existing.bindings.push({
          channelId: channel.id,
          providerModel,
          enabled: true,
          priority: 100,
          weight: 100,
        })
      }
    }
  }

  return Array.from(map.values())
}

function buildComboCandidates(
  combo: PilotRouteComboItem,
  channels: Map<string, PilotChannelConfig>,
  modelMap: Map<string, PilotModelCatalogItem>,
): RouteCandidate[] {
  const list: RouteCandidate[] = []

  for (const route of combo.routes || []) {
    if (route.enabled === false) {
      continue
    }
    const channelId = normalizeText(route.channelId)
    if (!channelId || !channels.has(channelId)) {
      continue
    }

    let providerModel = normalizeText(route.providerModel)
    const modelId = normalizeText(route.modelId)
    if (!providerModel && modelId) {
      const model = modelMap.get(modelId)
      const matched = model?.bindings.find(binding => binding.channelId === channelId && binding.enabled !== false)
      providerModel = normalizeText(matched?.providerModel)
    }

    if (!providerModel) {
      const channel = channels.get(channelId)!
      providerModel = normalizeText(channel.defaultModelId || channel.model)
    }

    if (!providerModel) {
      continue
    }

    list.push({
      channelId,
      providerModel,
      modelId: modelId || providerModel,
      routeComboId: combo.id,
      priority: normalizeNumber(route.priority, 100, 1, 9999),
      weight: normalizeNumber(route.weight, 100, 1, 1000),
      reason: `route-combo:${combo.id}`,
    })
  }

  return list
}

function buildModelCandidates(
  model: PilotModelCatalogItem,
): RouteCandidate[] {
  const list: RouteCandidate[] = []
  for (const binding of model.bindings || []) {
    if (binding.enabled === false) {
      continue
    }
    const channelId = normalizeText(binding.channelId)
    const providerModel = normalizeText(binding.providerModel)
    if (!channelId || !providerModel) {
      continue
    }

    list.push({
      channelId,
      providerModel,
      modelId: model.id,
      routeComboId: normalizeText(model.defaultRouteComboId) || 'default-auto',
      priority: normalizeNumber(binding.priority, 100, 1, 9999),
      weight: normalizeNumber(binding.weight, 100, 1, 1000),
      reason: `model-binding:${model.id}`,
    })
  }
  return list
}

function resolveTools(channel: PilotChannelConfig, internet: boolean, allowWebsearch: boolean): PilotBuiltinTool[] {
  const source = new Set<PilotBuiltinTool>(
    Array.isArray(channel.builtinTools) && channel.builtinTools.length > 0
      ? channel.builtinTools
      : ['write_todos'],
  )

  if (internet && allowWebsearch) {
    source.add('websearch')
  }
  else {
    source.delete('websearch')
  }

  if (source.size <= 0) {
    source.add('write_todos')
  }

  return Array.from(source)
}

export async function resolvePilotRoutingSelection(
  event: H3Event,
  input: PilotRoutingResolveInput,
): Promise<PilotRoutingResolveResult> {
  const requestedModelId = normalizeText(input.requestedModelId)
  const requestedComboId = normalizeText(input.routeComboId)
  const internetRequested = normalizeBoolean(input.internet, false)

  const catalog = await getPilotChannelCatalog(event)
  const enabledChannels = catalog.channels.filter(channel => channel.enabled)
  const channelMap = new Map(enabledChannels.map(item => [item.id, item]))

  const routingConfig = await getPilotAdminRoutingConfig(event)
  const modelCatalog = resolveModelCatalog(routingConfig.modelCatalog, enabledChannels)
  const modelMap = new Map(modelCatalog.map(item => [item.id, item]))
  const comboMap = new Map(routingConfig.routeCombos.map(item => [item.id, item]))

  const defaultModelId = requestedModelId || routingConfig.routingPolicy.defaultModelId || 'quota-auto'
  const defaultComboId = requestedComboId || routingConfig.routingPolicy.defaultRouteComboId || 'default-auto'

  let candidates: RouteCandidate[] = []
  let selectionSource: PilotRoutingResolveResult['selectionSource'] = 'fallback'

  const combo = comboMap.get(defaultComboId)
  if (combo && combo.enabled !== false) {
    candidates = buildComboCandidates(combo, channelMap, modelMap)
    if (candidates.length > 0) {
      selectionSource = 'route-combo'
    }
  }

  if (candidates.length <= 0) {
    if (defaultModelId === 'quota-auto') {
      selectionSource = 'quota-auto'
      for (const channel of enabledChannels) {
        const channelModels = Array.isArray(channel.models) && channel.models.length > 0
          ? channel.models
          : [{ id: channel.defaultModelId || channel.model, enabled: true }]

        for (const model of channelModels) {
          if (model.enabled === false) {
            continue
          }
          const providerModel = normalizeText(model.id)
          if (!providerModel) {
            continue
          }
          candidates.push({
            channelId: channel.id,
            providerModel,
            modelId: defaultModelId,
            routeComboId: defaultComboId,
            priority: 100,
            weight: 100,
            reason: 'quota-auto-speed-first',
          })
        }
      }
    }
    else {
      const model = modelMap.get(defaultModelId)
      if (model) {
        candidates = buildModelCandidates(model)
        if (candidates.length > 0) {
          selectionSource = 'model-binding'
        }
      }
    }
  }

  candidates = uniqueCandidates(candidates)
  candidates = candidates.filter(candidate => channelMap.has(candidate.channelId))

  if (candidates.length <= 0) {
    const fallback = await resolvePilotChannelSelection(event, {
      requestChannelId: input.requestChannelId,
      sessionChannelId: input.sessionChannelId,
    })
    const fallbackModel = normalizeText(fallback.channel.defaultModelId || fallback.channel.model)
    const fallbackModelConfig = modelMap.get(defaultModelId) || modelMap.get(fallbackModel)
    const allowWebsearch = fallbackModelConfig?.allowWebsearch !== false
    const thinkingSupported = fallbackModelConfig?.thinkingSupported !== false
    const thinking = thinkingSupported
      ? normalizeBoolean(input.thinking, normalizeBoolean(fallbackModelConfig?.thinkingDefaultEnabled, true))
      : false
    const fallbackTransport = resolveTransportByModel(fallback.channel, fallbackModel)

    return {
      channel: fallback.channel,
      channelId: fallback.channelId,
      adapter: fallback.adapter,
      transport: fallbackTransport,
      modelId: fallbackModelConfig?.id || fallbackModel || defaultModelId,
      providerModel: fallbackModel,
      routeComboId: defaultComboId,
      selectionReason: 'fallback:default-channel',
      selectionSource: 'fallback',
      builtinTools: resolveTools(fallback.channel, internetRequested, allowWebsearch),
      internet: internetRequested,
      thinking,
      score: 0,
      routeKey: buildRouteKey(fallback.channelId, fallbackModel),
    }
  }

  const candidateStats = await computeChannelModelStats(
    event,
    candidates.map(item => ({ channelId: item.channelId, providerModel: item.providerModel })),
    {
      metricWindowHours: routingConfig.lbPolicy.metricWindowHours,
      recentRequestWindow: routingConfig.lbPolicy.recentRequestWindow,
    },
  )

  const healthPolicy = {
    failureThreshold: routingConfig.lbPolicy.circuitBreakerFailureThreshold,
    cooldownMs: routingConfig.lbPolicy.circuitBreakerCooldownMs,
    halfOpenProbeCount: routingConfig.lbPolicy.halfOpenProbeCount,
  }

  const scored = candidates
    .map((candidate) => {
      const routeKey = buildRouteKey(candidate.channelId, candidate.providerModel)
      const stats = candidateStats.get(routeKey)
      const health = isRouteHealthy(routeKey, healthPolicy)
      const score = stats?.score ?? 0
      return {
        candidate,
        routeKey,
        stats,
        score,
        health,
      }
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      if (a.candidate.priority !== b.candidate.priority) {
        return a.candidate.priority - b.candidate.priority
      }
      return b.candidate.weight - a.candidate.weight
    })

  const healthy = scored.filter(item => item.health.healthy)
  const pool = healthy.length > 0 ? healthy : scored

  const explorationRate = normalizeFloat(routingConfig.routingPolicy.explorationRate, 0.08, 0, 0.5)
  const shouldExplore = selectionSource === 'quota-auto' && pool.length > 1 && Math.random() < explorationRate
  const picked = shouldExplore
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool[0]

  const selectedChannel = channelMap.get(picked.candidate.channelId)
  if (!selectedChannel) {
    throw new Error('Selected channel is unavailable')
  }

  const modelConfig = modelMap.get(picked.candidate.modelId) || modelMap.get(picked.candidate.providerModel)
  const allowWebsearch = modelConfig?.allowWebsearch !== false
  const thinkingSupported = modelConfig?.thinkingSupported !== false
  const thinking = thinkingSupported
    ? normalizeBoolean(input.thinking, normalizeBoolean(modelConfig?.thinkingDefaultEnabled, true))
    : false
  const selectedTransport = resolveTransportByModel(selectedChannel, picked.candidate.providerModel)

  return {
    channel: selectedChannel,
    channelId: selectedChannel.id,
    adapter: selectedChannel.adapter,
    transport: selectedTransport,
    modelId: modelConfig?.id || picked.candidate.modelId,
    providerModel: picked.candidate.providerModel,
    routeComboId: picked.candidate.routeComboId || defaultComboId,
    selectionReason: `${picked.candidate.reason};score=${picked.score.toFixed(2)};health=${picked.health.state}`,
    selectionSource,
    builtinTools: resolveTools(selectedChannel, internetRequested, allowWebsearch),
    internet: internetRequested,
    thinking,
    score: picked.score,
    routeKey: picked.routeKey,
  }
}
