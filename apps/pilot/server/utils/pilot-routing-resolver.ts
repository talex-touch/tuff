import type { H3Event } from 'h3'
import type {
  PilotCapabilityId,
  PilotModelCatalogItem,
  PilotRouteComboItem,
} from './pilot-admin-routing-config'
import type { PilotBuiltinTool, PilotChannelConfig } from './pilot-channel'
import {
  getPilotAdminRoutingConfig,
  resolvePilotModelCapabilities,
} from './pilot-admin-routing-config'
import { getPilotChannelCatalog, resolvePilotChannelSelection } from './pilot-channel'
import { computeChannelModelStats } from './pilot-channel-scorer'
import { buildRouteKey, isRouteHealthy } from './pilot-route-health'

export const PILOT_CAPABILITY_UNSUPPORTED_CODE = 'PILOT_CAPABILITY_UNSUPPORTED'
export const PILOT_NO_ENABLED_MODEL_CODE = 'PILOT_NO_ENABLED_MODEL'

interface RouteCandidate {
  channelId: string
  providerModel: string
  modelId: string
  routeComboId: string
  priority: number
  channelPriority: number
  weight: number
  reason: string
}

interface ChannelModelOption {
  id: string
  enabled?: boolean
  format?: string
}

export type PilotIntentType = 'chat' | 'image_generate' | 'intent_classification'

export interface PilotRoutingResolveInput {
  requestChannelId?: string
  sessionChannelId?: string
  requestedModelId?: string
  routeComboId?: string
  requiredCapability?: PilotCapabilityId
  excludeRouteKeys?: string[]
  internet?: boolean
  thinking?: boolean
  intentType?: PilotIntentType
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
  intentType: PilotIntentType
  requiredCapability?: PilotCapabilityId
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

function normalizeIntentType(value: unknown): PilotIntentType {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'image_generate' || normalized === 'image-generate') {
    return 'image_generate'
  }
  if (normalized === 'intent_classification' || normalized === 'intent-classification') {
    return 'intent_classification'
  }
  return 'chat'
}

function normalizeCapabilityId(value: unknown): PilotCapabilityId | undefined {
  const normalized = normalizeText(value).toLowerCase()
  if (
    normalized === 'websearch'
    || normalized === 'file.analyze'
    || normalized === 'image.generate'
    || normalized === 'image.edit'
    || normalized === 'audio.tts'
    || normalized === 'audio.stt'
    || normalized === 'audio.transcribe'
    || normalized === 'video.generate'
  ) {
    return normalized as PilotCapabilityId
  }
  return undefined
}

function createCapabilityUnsupportedError(capability: PilotCapabilityId): Error {
  const error = new Error(`No available provider supports capability: ${capability}`)
  ;(error as Error & { code?: string, capability?: string }).code = PILOT_CAPABILITY_UNSUPPORTED_CODE
  ;(error as Error & { code?: string, capability?: string }).capability = capability
  return error
}

function createNoEnabledModelError(channelId: string): Error {
  const error = new Error(`No enabled provider model available on channel: ${channelId}`)
  ;(error as Error & { code?: string, channelId?: string }).code = PILOT_NO_ENABLED_MODEL_CODE
  ;(error as Error & { code?: string, channelId?: string }).channelId = channelId
  return error
}

function isIntentModelAllowed(model: PilotModelCatalogItem | undefined, intentType: PilotIntentType): boolean {
  if (!model) {
    return true
  }
  if (model.enabled === false) {
    return false
  }
  if (intentType === 'image_generate') {
    const capabilities = resolvePilotModelCapabilities(model.capabilities, {
      allowWebsearch: model.allowWebsearch,
      allowImageGeneration: model.allowImageGeneration,
      allowFileAnalysis: model.allowFileAnalysis,
      allowImageAnalysis: model.allowImageAnalysis,
    })
    return capabilities['image.generate'] !== false
  }
  return true
}

function isModelCapabilityAllowed(
  model: PilotModelCatalogItem | undefined,
  capability: PilotCapabilityId | undefined,
): boolean {
  if (!capability) {
    return true
  }
  if (!model) {
    return true
  }
  if (model.enabled === false) {
    return false
  }
  const capabilities = resolvePilotModelCapabilities(model.capabilities, {
    allowWebsearch: model.allowWebsearch,
    allowImageGeneration: model.allowImageGeneration,
    allowFileAnalysis: model.allowFileAnalysis,
    allowImageAnalysis: model.allowImageAnalysis,
  })
  return capabilities[capability] !== false
}

function isIntentCandidateAllowed(
  candidate: RouteCandidate,
  modelMap: Map<string, PilotModelCatalogItem>,
  intentType: PilotIntentType,
  requiredCapability?: PilotCapabilityId,
): boolean {
  const model = modelMap.get(candidate.modelId) || modelMap.get(candidate.providerModel)
  return isIntentModelAllowed(model, intentType) && isModelCapabilityAllowed(model, requiredCapability)
}

function resolveChannelPriority(channel: PilotChannelConfig | undefined): number {
  return normalizeNumber(channel?.priority, 100, 1, 9999)
}

function resolveChannelModelPriority(
  model: NonNullable<PilotChannelConfig['models']>[number],
  channel: PilotChannelConfig,
): number {
  return normalizeNumber(model?.priority, resolveChannelPriority(channel), 1, 9999)
}

function listChannelModelOptions(channel: PilotChannelConfig | undefined): ChannelModelOption[] {
  if (!channel) {
    return []
  }
  const source = Array.isArray(channel.models)
    ? channel.models
    : []

  const map = new Map<string, ChannelModelOption>()
  for (const item of source) {
    const id = normalizeText(item?.id)
    if (!id) {
      continue
    }
    if (!map.has(id)) {
      map.set(id, {
        id,
        enabled: item.enabled !== false,
        format: normalizeText(item.format) || undefined,
      })
      continue
    }

    const existing = map.get(id)!
    map.set(id, {
      ...existing,
      enabled: existing.enabled !== false && item.enabled !== false,
      format: existing.format || normalizeText(item.format) || undefined,
    })
  }

  const fallbackIds = [
    normalizeText(channel.defaultModelId),
    normalizeText(channel.model),
  ].filter(Boolean)
  for (const modelId of fallbackIds) {
    if (!map.has(modelId)) {
      map.set(modelId, {
        id: modelId,
        enabled: true,
      })
    }
  }

  return Array.from(map.values())
}

function isProviderModelEnabledOnChannel(
  channel: PilotChannelConfig | undefined,
  providerModel: string,
): boolean {
  const modelId = normalizeText(providerModel)
  if (!modelId) {
    return false
  }
  const models = listChannelModelOptions(channel)
  if (models.length <= 0) {
    return false
  }
  const matched = models.find(item => normalizeText(item.id) === modelId)
  return Boolean(matched && matched.enabled !== false)
}

function resolvePreferredProviderModel(
  channel: PilotChannelConfig | undefined,
  preferredModelId: unknown,
): string {
  const preferred = normalizeText(preferredModelId)
  const models = listChannelModelOptions(channel)
  if (models.length <= 0) {
    return preferred
  }

  if (preferred) {
    const matched = models.find(item => normalizeText(item.id) === preferred && item.enabled !== false)
    if (matched) {
      return normalizeText(matched.id)
    }
  }

  return normalizeText(models.find(item => item.enabled !== false)?.id)
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
    if (item.priority < current.priority || (item.priority === current.priority && item.channelPriority < current.channelPriority)) {
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
          capabilities: resolvePilotModelCapabilities({}),
          allowWebsearch: true,
          allowImageAnalysis: true,
          allowImageGeneration: true,
          allowFileAnalysis: true,
          builtinTools: ['write_todos'],
          bindings: [{
            channelId: channel.id,
            providerModel,
            enabled: true,
            priority: resolveChannelModelPriority(model, channel),
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
          priority: resolveChannelModelPriority(model, channel),
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
      providerModel = resolvePreferredProviderModel(channel, channel.defaultModelId || channel.model)
    }

    if (!providerModel) {
      continue
    }

    if (!isProviderModelEnabledOnChannel(channels.get(channelId), providerModel)) {
      continue
    }

    list.push({
      channelId,
      providerModel,
      modelId: modelId || providerModel,
      routeComboId: combo.id,
      priority: normalizeNumber(route.priority, 100, 1, 9999),
      channelPriority: resolveChannelPriority(channels.get(channelId)),
      weight: normalizeNumber(route.weight, 100, 1, 1000),
      reason: `route-combo:${combo.id}`,
    })
  }

  return list
}

function buildModelCandidates(
  model: PilotModelCatalogItem,
  channels: Map<string, PilotChannelConfig>,
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
    if (!isProviderModelEnabledOnChannel(channels.get(channelId), providerModel)) {
      continue
    }

    list.push({
      channelId,
      providerModel,
      modelId: model.id,
      routeComboId: normalizeText(model.defaultRouteComboId) || 'default-auto',
      priority: normalizeNumber(binding.priority, 100, 1, 9999),
      channelPriority: resolveChannelPriority(channels.get(channelId)),
      weight: normalizeNumber(binding.weight, 100, 1, 1000),
      reason: `model-binding:${model.id}`,
    })
  }
  return list
}

function resolveTools(
  model: PilotModelCatalogItem | undefined,
  channel: PilotChannelConfig,
  internet: boolean,
  allowWebsearch: boolean,
): PilotBuiltinTool[] {
  const modelBuiltinTools = Array.isArray(model?.builtinTools) && model.builtinTools.length > 0
    ? model.builtinTools
    : []
  const source = new Set<PilotBuiltinTool>(
    modelBuiltinTools.length > 0
      ? modelBuiltinTools
      : Array.isArray(channel.builtinTools) && channel.builtinTools.length > 0
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

interface CapabilityFallbackCandidate {
  channel: PilotChannelConfig
  channelId: string
  providerModel: string
  model: PilotModelCatalogItem
  routeComboId: string
  priority: number
  channelPriority: number
  weight: number
}

function findCapabilityFallbackCandidate(
  modelCatalog: PilotModelCatalogItem[],
  channelMap: Map<string, PilotChannelConfig>,
  intentType: PilotIntentType,
  requiredCapability: PilotCapabilityId,
  excludedRouteKeys: Set<string>,
): CapabilityFallbackCandidate | null {
  const list: CapabilityFallbackCandidate[] = []
  for (const model of modelCatalog) {
    if (!isIntentModelAllowed(model, intentType) || !isModelCapabilityAllowed(model, requiredCapability)) {
      continue
    }

    for (const binding of model.bindings || []) {
      if (binding.enabled === false) {
        continue
      }
      const channelId = normalizeText(binding.channelId)
      const providerModel = normalizeText(binding.providerModel)
      if (!channelId || !providerModel) {
        continue
      }
      const channel = channelMap.get(channelId)
      if (!channel || channel.enabled === false) {
        continue
      }
      if (!isProviderModelEnabledOnChannel(channel, providerModel)) {
        continue
      }

      const routeKey = buildRouteKey(channelId, providerModel)
      if (excludedRouteKeys.has(routeKey)) {
        continue
      }

      list.push({
        channel,
        channelId,
        providerModel,
        model,
        routeComboId: normalizeText(model.defaultRouteComboId) || 'default-auto',
        priority: normalizeNumber(binding.priority, 100, 1, 9999),
        channelPriority: resolveChannelPriority(channel),
        weight: normalizeNumber(binding.weight, 100, 1, 1000),
      })
    }
  }

  if (list.length <= 0) {
    return null
  }

  return list.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    if (a.channelPriority !== b.channelPriority) {
      return a.channelPriority - b.channelPriority
    }
    return b.weight - a.weight
  })[0]
}

export async function resolvePilotRoutingSelection(
  event: H3Event,
  input: PilotRoutingResolveInput,
): Promise<PilotRoutingResolveResult> {
  const requestedModelId = normalizeText(input.requestedModelId)
  const requestedComboId = normalizeText(input.routeComboId)
  const requiredCapability = normalizeCapabilityId(input.requiredCapability)
  const excludedRouteKeys = new Set(
    (Array.isArray(input.excludeRouteKeys) ? input.excludeRouteKeys : [])
      .map(item => normalizeText(item))
      .filter(Boolean),
  )
  const internetRequested = normalizeBoolean(input.internet, false)
  const intentType = normalizeIntentType(input.intentType)

  const catalog = await getPilotChannelCatalog(event)
  const enabledChannels = catalog.channels.filter(channel => channel.enabled)
  const channelMap = new Map(enabledChannels.map(item => [item.id, item]))

  const routingConfig = await getPilotAdminRoutingConfig(event)
  const modelCatalog = resolveModelCatalog(routingConfig.modelCatalog, enabledChannels)
  const modelMap = new Map(modelCatalog.map(item => [item.id, item]))
  const comboMap = new Map(routingConfig.routeCombos.map(item => [item.id, item]))

  const intentModelId = intentType === 'intent_classification'
    ? normalizeText(routingConfig.routingPolicy.intentNanoModelId)
    : intentType === 'image_generate'
      ? normalizeText(routingConfig.routingPolicy.imageGenerationModelId)
      : ''
  const intentRouteComboId = intentType === 'intent_classification'
    ? normalizeText(routingConfig.routingPolicy.intentRouteComboId)
    : intentType === 'image_generate'
      ? normalizeText(routingConfig.routingPolicy.imageRouteComboId)
      : ''

  const defaultModelId = intentType === 'chat'
    ? (requestedModelId || routingConfig.routingPolicy.defaultModelId || 'quota-auto')
    : (intentModelId || requestedModelId || routingConfig.routingPolicy.defaultModelId || 'quota-auto')
  const defaultComboId = intentType === 'chat'
    ? (requestedComboId || routingConfig.routingPolicy.defaultRouteComboId || 'default-auto')
    : (intentRouteComboId || requestedComboId || routingConfig.routingPolicy.defaultRouteComboId || 'default-auto')

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
            priority: resolveChannelModelPriority(model, channel),
            channelPriority: resolveChannelPriority(channel),
            weight: 100,
            reason: 'quota-auto-speed-first',
          })
        }
      }
    }
    else {
      const model = modelMap.get(defaultModelId)
      if (model) {
        candidates = buildModelCandidates(model, channelMap)
        if (candidates.length > 0) {
          selectionSource = 'model-binding'
        }
      }
    }
  }

  candidates = uniqueCandidates(candidates)
  candidates = candidates.filter(candidate => channelMap.has(candidate.channelId))
  candidates = candidates.filter(candidate => isProviderModelEnabledOnChannel(
    channelMap.get(candidate.channelId),
    candidate.providerModel,
  ))
  candidates = candidates.filter(candidate => isIntentCandidateAllowed(candidate, modelMap, intentType, requiredCapability))
  if (excludedRouteKeys.size > 0) {
    candidates = candidates.filter(candidate => !excludedRouteKeys.has(buildRouteKey(candidate.channelId, candidate.providerModel)))
  }

  if (candidates.length <= 0) {
    if (requiredCapability) {
      const capabilityFallback = findCapabilityFallbackCandidate(
        modelCatalog,
        channelMap,
        intentType,
        requiredCapability,
        excludedRouteKeys,
      )
      if (!capabilityFallback) {
        throw createCapabilityUnsupportedError(requiredCapability)
      }

      const allowWebsearch = capabilityFallback.model.allowWebsearch !== false
      const thinkingSupported = capabilityFallback.model.thinkingSupported !== false
      const thinking = thinkingSupported
        ? normalizeBoolean(input.thinking, normalizeBoolean(capabilityFallback.model.thinkingDefaultEnabled, true))
        : false
      const fallbackTransport = resolveTransportByModel(capabilityFallback.channel, capabilityFallback.providerModel)

      return {
        channel: capabilityFallback.channel,
        channelId: capabilityFallback.channelId,
        adapter: capabilityFallback.channel.adapter,
        transport: fallbackTransport,
        modelId: capabilityFallback.model.id,
        providerModel: capabilityFallback.providerModel,
        routeComboId: capabilityFallback.routeComboId,
        selectionReason: `fallback:capability=${requiredCapability};intent=${intentType}`,
        selectionSource: 'fallback',
        builtinTools: resolveTools(capabilityFallback.model, capabilityFallback.channel, internetRequested, allowWebsearch),
        internet: internetRequested,
        thinking,
        intentType,
        requiredCapability,
        score: 0,
        routeKey: buildRouteKey(capabilityFallback.channelId, capabilityFallback.providerModel),
      }
    }

    const fallback = await resolvePilotChannelSelection(event, {
      requestChannelId: input.requestChannelId,
      sessionChannelId: input.sessionChannelId,
    })
    let fallbackModel = resolvePreferredProviderModel(
      fallback.channel,
      fallback.channel.defaultModelId || fallback.channel.model,
    )
    let fallbackModelConfig = modelMap.get(defaultModelId) || modelMap.get(fallbackModel)
    if (!fallbackModel || !isProviderModelEnabledOnChannel(fallback.channel, fallbackModel)) {
      throw createNoEnabledModelError(fallback.channelId)
    }
    if (!isIntentModelAllowed(fallbackModelConfig, intentType)) {
      const allowed = modelCatalog.find(item => (
        isIntentModelAllowed(item, intentType)
        && (item.bindings || []).some(binding => (
          binding.enabled !== false
          && binding.channelId === fallback.channelId
          && isProviderModelEnabledOnChannel(fallback.channel, normalizeText(binding.providerModel))
        ))
      ))
      const binding = allowed?.bindings.find(item => (
        item.enabled !== false
        && item.channelId === fallback.channelId
        && isProviderModelEnabledOnChannel(fallback.channel, normalizeText(item.providerModel))
      ))
      if (allowed && binding) {
        fallbackModelConfig = allowed
        fallbackModel = normalizeText(binding.providerModel) || fallbackModel
      }
    }
    if (!fallbackModel || !isProviderModelEnabledOnChannel(fallback.channel, fallbackModel)) {
      throw createNoEnabledModelError(fallback.channelId)
    }
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
      selectionReason: `fallback:priority-channel;intent=${intentType}`,
      selectionSource: 'fallback',
      builtinTools: resolveTools(fallbackModelConfig, fallback.channel, internetRequested, allowWebsearch),
      internet: internetRequested,
      thinking,
      intentType,
      requiredCapability,
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
      if (a.candidate.channelPriority !== b.candidate.channelPriority) {
        return a.candidate.channelPriority - b.candidate.channelPriority
      }
      return b.candidate.weight - a.candidate.weight
    })

  const healthy = scored.filter(item => item.health.healthy)
  const pool = healthy.length > 0 ? healthy : scored

  const explorationRate = normalizeFloat(routingConfig.routingPolicy.explorationRate, 0.08, 0, 0.5)
  const intentPool = pool.filter(item => isIntentCandidateAllowed(item.candidate, modelMap, intentType, requiredCapability))
  const effectivePool = intentPool.length > 0 ? intentPool : pool
  const shouldExplore = selectionSource === 'quota-auto' && effectivePool.length > 1 && Math.random() < explorationRate
  const picked = shouldExplore
    ? effectivePool[Math.floor(Math.random() * effectivePool.length)]
    : effectivePool[0]

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
    selectionReason: `${picked.candidate.reason};score=${picked.score.toFixed(2)};health=${picked.health.state};intent=${intentType}`,
    selectionSource,
    builtinTools: resolveTools(modelConfig, selectedChannel, internetRequested, allowWebsearch),
    internet: internetRequested,
    thinking,
    intentType,
    requiredCapability,
    score: picked.score,
    routeKey: picked.routeKey,
  }
}
