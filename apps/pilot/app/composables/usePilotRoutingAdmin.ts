import type {
  PilotCapabilityMeta,
  PilotModelTemplateId,
  PilotModelTemplatePreset,
  PilotCapabilityId as SharedPilotCapabilityId,
} from '~~/shared/pilot-capability-meta'
import type {
  PilotBuiltInScene,
  PilotScenePolicy,
} from '~~/shared/pilot-routing-scene'
import {
  createPilotDefaultCapabilities,
  getPilotModelTemplatePreset,
  normalizeThinkingFlags,
  PILOT_CAPABILITY_GROUP_LABELS,
  PILOT_CAPABILITY_META,
  resolvePilotCapabilities,
  sanitizeBuiltinToolsByCapabilities,
  PILOT_MODEL_TEMPLATE_PRESETS as SHARED_MODEL_TEMPLATE_PRESETS,
} from '~~/shared/pilot-capability-meta'
import {
  normalizePilotScene,
  PILOT_BUILT_IN_SCENES,
} from '~~/shared/pilot-routing-scene'
import { endHttp } from '~/composables/api/axios'

export type PilotIconType = 'class' | 'url' | 'emoji' | 'file'
export type PilotModelSource = 'system' | 'manual' | 'discovered'
export type PilotBuiltinTool = 'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls' | 'websearch'
export type PilotCapabilityId = SharedPilotCapabilityId
export type PilotProviderTargetType = 'model' | 'coze_bot' | 'coze_workflow'

export type PilotModelCapabilitiesForm = Record<PilotCapabilityId, boolean>

export interface ModelBindingFormItem {
  channelId: string
  providerModel: string
  providerTargetType: PilotProviderTargetType
  enabled: boolean
  priority: number
  weight: number
}

export interface ModelGroupFormItem {
  id: string
  name: string
  description: string
  enabled: boolean
  visible: boolean
  source: PilotModelSource
  iconType: PilotIconType
  iconValue: string
  tags: string
  scenes: string[]
  qualityScore: number
  speedScore: number
  costScore: number
  thinkingSupported: boolean
  thinkingDefaultEnabled: boolean
  capabilities: PilotModelCapabilitiesForm
  allowWebsearch: boolean
  allowImageAnalysis: boolean
  allowImageGeneration: boolean
  allowFileAnalysis: boolean
  builtinTools: PilotBuiltinTool[]
  defaultRouteComboId: string
  bindings: ModelBindingFormItem[]
}

export interface RouteComboRouteFormItem {
  channelId: string
  modelId: string
  providerModel: string
  providerTargetType: PilotProviderTargetType
  enabled: boolean
  priority: number
  weight: number
  timeoutMs: number
  maxRetries: number
  circuitBreakerThreshold: number
}

export interface RouteComboFormItem {
  id: string
  name: string
  description: string
  enabled: boolean
  langgraphAssistantId: string
  graphProfile: string
  fallbackRouteComboId: string
  routes: RouteComboRouteFormItem[]
}

export interface PilotRoutingPolicyForm {
  defaultModelId: string
  defaultRouteComboId: string
  explorationRate: number
  scenePolicies: PilotScenePolicyFormItem[]
  intentNanoModelId: string
  intentRouteComboId: string
  imageGenerationModelId: string
  imageRouteComboId: string
}

export interface PilotScenePolicyFormItem {
  scene: string
  modelId: string
  routeComboId: string
}

export interface PilotLoadBalancePolicyForm {
  metricWindowHours: number
  recentRequestWindow: number
  circuitBreakerFailureThreshold: number
  circuitBreakerCooldownMs: number
  halfOpenProbeCount: number
}

export interface PilotMemoryPolicyForm {
  enabledByDefault: boolean
  allowUserDisable: boolean
  allowUserClear: boolean
}

export interface PilotRoutingMetricRow {
  id: number
  createdAt: string
  channelId: string
  providerModel: string
  modelId: string
  routeComboId: string
  success: boolean
  ttftMs: number
  totalDurationMs: number
  queueWaitMs: number
  outputChars: number
  finishReason: string
  errorCode: string
}

export interface PilotRoutingMetricSummary {
  total: number
  success: number
  failed: number
  successRate: number
  avgTtftMs: number
  avgTotalDurationMs: number
}

export {
  PILOT_CAPABILITY_GROUP_LABELS,
  PILOT_CAPABILITY_META,
}

export type {
  PilotCapabilityMeta,
  PilotModelTemplateId,
  PilotModelTemplatePreset,
}

export const PILOT_MODEL_TEMPLATE_PRESETS = [...SHARED_MODEL_TEMPLATE_PRESETS]

export interface ChannelModelOption {
  channelId: string
  modelId: string
  targetType: PilotProviderTargetType
  label: string
  format: string
  enabled: boolean
}

export interface ChannelOption {
  id: string
  name: string
  adapter: 'openai' | 'coze'
  enabled: boolean
  priority: number
}

export interface ChannelModelOptionIndex {
  channels: ChannelOption[]
  enabledModelOptionsByChannel: Record<string, ChannelModelOption[]>
  allModelOptionsByChannel: Record<string, ChannelModelOption[]>
}

interface PilotSettingsResponse {
  settings?: {
    channels?: {
      channels?: Array<{
        id?: string
        name?: string
        enabled?: unknown
        priority?: unknown
        defaultModelId?: unknown
        model?: unknown
        models?: Array<{
          id?: unknown
          label?: unknown
          format?: unknown
          targetType?: unknown
          enabled?: unknown
        }>
        adapter?: unknown
      }>
    }
    routing?: {
      modelCatalog?: Array<Partial<ModelGroupFormItem> & {
        icon?: {
          type?: string
          value?: string
        }
        scenes?: unknown
        bindings?: Array<Partial<ModelBindingFormItem>>
      }>
      routeCombos?: Array<Partial<RouteComboFormItem> & {
        routes?: Array<Partial<RouteComboRouteFormItem>>
      }>
      routingPolicy?: Partial<PilotRoutingPolicyForm> & {
        scenePolicies?: Array<Partial<PilotScenePolicy>>
      }
      lbPolicy?: Partial<PilotLoadBalancePolicyForm>
      memoryPolicy?: Partial<PilotMemoryPolicyForm>
    }
  }
  ok?: boolean
  message?: string
}

interface PilotRoutingMetricsResponse {
  metrics?: Array<Partial<PilotRoutingMetricRow>>
  summary?: Partial<PilotRoutingMetricSummary>
}

export const MODEL_SOURCE_OPTIONS: Array<{ value: PilotModelSource, label: string }> = [
  { value: 'system', label: 'system' },
  { value: 'manual', label: 'manual' },
  { value: 'discovered', label: 'discovered' },
]

export const ICON_TYPE_OPTIONS: Array<{ value: PilotIconType, label: string }> = [
  { value: 'class', label: 'class' },
  { value: 'url', label: 'url' },
  { value: 'emoji', label: 'emoji' },
  { value: 'file', label: 'file' },
]

export const BUILTIN_TOOL_OPTIONS: Array<{ value: PilotBuiltinTool, label: string }> = [
  { value: 'write_todos', label: 'write_todos' },
  { value: 'read_file', label: 'read_file' },
  { value: 'write_file', label: 'write_file' },
  { value: 'edit_file', label: 'edit_file' },
  { value: 'ls', label: 'ls' },
  { value: 'websearch', label: 'websearch' },
]

export const TARGET_TYPE_OPTIONS: Array<{ value: PilotProviderTargetType, label: string }> = [
  { value: 'model', label: '普通模型（model）' },
  { value: 'coze_bot', label: 'Coze Bot（coze_bot）' },
  { value: 'coze_workflow', label: 'Coze Workflow（coze_workflow）' },
]

export const BUILT_IN_SCENE_OPTIONS: Array<{ value: PilotBuiltInScene, label: string }> = PILOT_BUILT_IN_SCENES
  .map(scene => ({
    value: scene,
    label: scene === 'intent_classification'
      ? '意图分类（intent_classification）'
      : '图像生成（image_generate）',
  }))

let modelSequence = 0
let routeComboSequence = 0
let routeSequence = 0

const EMPTY_CHANNEL_MODEL_OPTION_INDEX: ChannelModelOptionIndex = {
  channels: [],
  enabledModelOptionsByChannel: {},
  allModelOptionsByChannel: {},
}

function nowId(): string {
  return Date.now().toString(36)
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function toNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(parsed, min), max)
}

function toBoolean(value: unknown, fallback: boolean): boolean {
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

function normalizeModelSource(value: unknown): PilotModelSource {
  const source = normalizeText(value)
  if (source === 'manual' || source === 'discovered') {
    return source
  }
  return 'system'
}

function normalizeIconType(value: unknown): PilotIconType {
  const source = normalizeText(value)
  if (source === 'url' || source === 'emoji' || source === 'file') {
    return source
  }
  return 'class'
}

function normalizeBuiltinTools(value: unknown): PilotBuiltinTool[] {
  if (!Array.isArray(value)) {
    return ['write_todos']
  }
  const allowed = new Set(BUILTIN_TOOL_OPTIONS.map(item => item.value))
  const list = value
    .map(item => normalizeText(item))
    .filter(item => allowed.has(item as PilotBuiltinTool)) as PilotBuiltinTool[]
  if (list.length <= 0) {
    return ['write_todos']
  }
  return Array.from(new Set(list))
}

function normalizeProviderTargetType(value: unknown): PilotProviderTargetType {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'coze_bot' || normalized === 'coze-bot' || normalized === 'bot') {
    return 'coze_bot'
  }
  if (normalized === 'coze_workflow' || normalized === 'coze-workflow' || normalized === 'workflow') {
    return 'coze_workflow'
  }
  return 'model'
}

function normalizeSceneList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const list = value
    .map(item => normalizePilotScene(item))
    .filter(Boolean)
  if (list.length <= 0) {
    return []
  }
  return Array.from(new Set(list))
}

function normalizeScenePolicyFormItem(raw: Partial<PilotScenePolicy> | undefined): PilotScenePolicyFormItem | null {
  const scene = normalizePilotScene(raw?.scene)
  const modelId = normalizeText(raw?.modelId)
  if (!scene || !modelId) {
    return null
  }
  return {
    scene,
    modelId,
    routeComboId: normalizeText(raw?.routeComboId),
  }
}

function buildScenePoliciesFromLegacy(raw: Partial<PilotRoutingPolicyForm> | undefined): PilotScenePolicyFormItem[] {
  const list: PilotScenePolicyFormItem[] = []
  const intentModelId = normalizeText(raw?.intentNanoModelId)
  if (intentModelId) {
    list.push({
      scene: 'intent_classification',
      modelId: intentModelId,
      routeComboId: normalizeText(raw?.intentRouteComboId),
    })
  }
  const imageModelId = normalizeText(raw?.imageGenerationModelId)
  if (imageModelId) {
    list.push({
      scene: 'image_generate',
      modelId: imageModelId,
      routeComboId: normalizeText(raw?.imageRouteComboId),
    })
  }
  return list
}

function createDefaultCapabilitiesForm(): PilotModelCapabilitiesForm {
  return createPilotDefaultCapabilities(true)
}

function normalizeCapabilitiesForm(
  rawCapabilities: unknown,
  legacy: {
    allowWebsearch?: unknown
    allowFileAnalysis?: unknown
    allowImageAnalysis?: unknown
    allowImageGeneration?: unknown
  },
): PilotModelCapabilitiesForm {
  return resolvePilotCapabilities(rawCapabilities, {
    allowWebsearch: legacy.allowWebsearch,
    allowFileAnalysis: legacy.allowFileAnalysis,
    allowImageAnalysis: legacy.allowImageAnalysis,
    allowImageGeneration: legacy.allowImageGeneration,
  })
}

function createDefaultModelId(): string {
  modelSequence += 1
  return `group-${nowId()}-${modelSequence}`
}

function createDefaultRouteComboId(): string {
  routeComboSequence += 1
  return `combo-${nowId()}-${routeComboSequence}`
}

function createDefaultRouteId(): string {
  routeSequence += 1
  return `route-${nowId()}-${routeSequence}`
}

export function createEmptyBinding(): ModelBindingFormItem {
  return {
    channelId: '',
    providerModel: '',
    providerTargetType: 'model',
    enabled: true,
    priority: 100,
    weight: 100,
  }
}

export function createEmptyModelGroup(): ModelGroupFormItem {
  const id = createDefaultModelId()
  const capabilities = createDefaultCapabilitiesForm()
  return {
    id,
    name: id,
    description: '',
    enabled: true,
    visible: true,
    source: 'manual',
    iconType: 'class',
    iconValue: 'i-carbon-machine-learning-model',
    tags: '',
    scenes: [],
    qualityScore: 50,
    speedScore: 50,
    costScore: 50,
    ...normalizeThinkingFlags(true, true),
    capabilities,
    allowWebsearch: capabilities.websearch,
    allowImageAnalysis: capabilities['file.analyze'],
    allowImageGeneration: capabilities['image.generate'],
    allowFileAnalysis: capabilities['file.analyze'],
    builtinTools: sanitizeBuiltinToolsByCapabilities(['write_todos'], capabilities),
    defaultRouteComboId: '',
    bindings: [],
  }
}

export function applyModelGroupTemplate(target: ModelGroupFormItem, templateId: PilotModelTemplateId): ModelGroupFormItem {
  const preset = getPilotModelTemplatePreset(templateId)
  if (!preset) {
    return target
  }
  target.capabilities = {
    ...preset.capabilities,
  }
  const thinking = normalizeThinkingFlags(preset.thinkingSupported, preset.thinkingDefaultEnabled)
  target.thinkingSupported = thinking.thinkingSupported
  target.thinkingDefaultEnabled = thinking.thinkingDefaultEnabled
  target.allowWebsearch = target.capabilities.websearch
  target.allowImageAnalysis = target.capabilities['file.analyze']
  target.allowImageGeneration = target.capabilities['image.generate']
  target.allowFileAnalysis = target.capabilities['file.analyze']
  target.builtinTools = sanitizeBuiltinToolsByCapabilities(normalizeBuiltinTools(target.builtinTools), target.capabilities)
  return target
}

export function createEmptyRouteComboRoute(): RouteComboRouteFormItem {
  createDefaultRouteId()
  return {
    channelId: '',
    modelId: '',
    providerModel: '',
    providerTargetType: 'model',
    enabled: true,
    priority: 100,
    weight: 100,
    timeoutMs: 90_000,
    maxRetries: 1,
    circuitBreakerThreshold: 3,
  }
}

export function createEmptyRouteCombo(): RouteComboFormItem {
  const id = createDefaultRouteComboId()
  return {
    id,
    name: id,
    description: '',
    enabled: true,
    langgraphAssistantId: '',
    graphProfile: '',
    fallbackRouteComboId: '',
    routes: [],
  }
}

export function normalizeModelGroup(raw: Partial<ModelGroupFormItem> & {
  icon?: {
    type?: string
    value?: string
  }
  bindings?: Array<Partial<ModelBindingFormItem>>
  tags?: unknown
  capabilities?: Partial<Record<PilotCapabilityId, unknown>>
}): ModelGroupFormItem {
  const id = normalizeText(raw.id) || createDefaultModelId()
  const capabilities = normalizeCapabilitiesForm(raw.capabilities, {
    allowWebsearch: raw.allowWebsearch,
    allowFileAnalysis: raw.allowFileAnalysis,
    allowImageAnalysis: raw.allowImageAnalysis,
    allowImageGeneration: raw.allowImageGeneration,
  })
  const allowFileAnalysis = capabilities['file.analyze']
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map(item => normalizeText(item)).filter(Boolean).join(',')
    : normalizeText(raw.tags)
  const thinking = normalizeThinkingFlags(
    toBoolean(raw.thinkingSupported, true),
    toBoolean(raw.thinkingDefaultEnabled, true),
  )
  const builtinTools = sanitizeBuiltinToolsByCapabilities(normalizeBuiltinTools(raw.builtinTools), capabilities)

  return {
    id,
    name: normalizeText(raw.name) || id,
    description: normalizeText(raw.description),
    enabled: toBoolean(raw.enabled, true),
    visible: toBoolean(raw.visible, true),
    source: normalizeModelSource(raw.source),
    iconType: normalizeIconType(raw.icon?.type || raw.iconType),
    iconValue: normalizeText(raw.icon?.value || raw.iconValue) || 'i-carbon-machine-learning-model',
    tags,
    scenes: normalizeSceneList(raw.scenes),
    qualityScore: toNumber(raw.qualityScore, 50, 0, 100),
    speedScore: toNumber(raw.speedScore, 50, 0, 100),
    costScore: toNumber(raw.costScore, 50, 0, 100),
    thinkingSupported: thinking.thinkingSupported,
    thinkingDefaultEnabled: thinking.thinkingDefaultEnabled,
    capabilities,
    allowWebsearch: capabilities.websearch,
    // 兼容历史字段：统一“分析文件”能力为唯一开关。
    allowImageAnalysis: allowFileAnalysis,
    allowImageGeneration: capabilities['image.generate'],
    allowFileAnalysis,
    builtinTools,
    defaultRouteComboId: normalizeText(raw.defaultRouteComboId),
    bindings: Array.isArray(raw.bindings)
      ? raw.bindings.map(item => ({
          channelId: normalizeText(item.channelId),
          providerModel: normalizeText(item.providerModel),
          providerTargetType: normalizeProviderTargetType(item.providerTargetType),
          enabled: toBoolean(item.enabled, true),
          priority: toNumber(item.priority, 100, 1, 9999),
          weight: toNumber(item.weight, 100, 1, 1000),
        }))
      : [],
  }
}

export function normalizeRouteCombo(raw: Partial<RouteComboFormItem> & {
  routes?: Array<Partial<RouteComboRouteFormItem>>
}): RouteComboFormItem {
  const id = normalizeText(raw.id) || createDefaultRouteComboId()
  return {
    id,
    name: normalizeText(raw.name) || id,
    description: normalizeText(raw.description),
    enabled: toBoolean(raw.enabled, true),
    langgraphAssistantId: normalizeText(raw.langgraphAssistantId),
    graphProfile: normalizeText(raw.graphProfile),
    fallbackRouteComboId: normalizeText(raw.fallbackRouteComboId),
    routes: Array.isArray(raw.routes)
      ? raw.routes.map(route => ({
          channelId: normalizeText(route.channelId),
          modelId: normalizeText(route.modelId),
          providerModel: normalizeText(route.providerModel),
          providerTargetType: normalizeProviderTargetType(route.providerTargetType),
          enabled: toBoolean(route.enabled, true),
          priority: toNumber(route.priority, 100, 1, 9999),
          weight: toNumber(route.weight, 100, 1, 1000),
          timeoutMs: toNumber(route.timeoutMs, 90_000, 3_000, 10 * 60 * 1000),
          maxRetries: toNumber(route.maxRetries, 1, 0, 5),
          circuitBreakerThreshold: toNumber(route.circuitBreakerThreshold, 3, 1, 10),
        }))
      : [],
  }
}

function normalizeModelTagList(value: string): string[] {
  return value
    .split(',')
    .map(item => normalizeText(item))
    .filter(Boolean)
}

function sortChannelModelOptions(list: ChannelModelOption[]): ChannelModelOption[] {
  return [...list].sort((a, b) => {
    if (a.targetType !== b.targetType) {
      return a.targetType.localeCompare(b.targetType)
    }
    return a.modelId.localeCompare(b.modelId)
  })
}

function parseChannelModelOptionIndex(payload: PilotSettingsResponse): ChannelModelOptionIndex {
  const source = payload?.settings?.channels?.channels
  if (!Array.isArray(source) || source.length <= 0) {
    return {
      channels: [],
      enabledModelOptionsByChannel: {},
      allModelOptionsByChannel: {},
    }
  }

  const channels: ChannelOption[] = []
  const enabledModelOptionsByChannel: Record<string, ChannelModelOption[]> = {}
  const allModelOptionsByChannel: Record<string, ChannelModelOption[]> = {}

  for (const rawChannel of source) {
    const channelId = normalizeText(rawChannel?.id)
    if (!channelId) {
      continue
    }
    const channelEnabled = toBoolean(rawChannel?.enabled, true)
    const channelPriority = toNumber(rawChannel?.priority, 100, 1, 9999)
    const channelName = normalizeText(rawChannel?.name) || channelId
    channels.push({
      id: channelId,
      name: channelName,
      adapter: normalizeText(rawChannel?.adapter).toLowerCase() === 'coze' ? 'coze' : 'openai',
      enabled: channelEnabled,
      priority: channelPriority,
    })

    const modelRows = Array.isArray(rawChannel?.models)
      ? rawChannel.models
      : []
    const allMap = new Map<string, ChannelModelOption>()
    for (const rawModel of modelRows) {
      const modelId = normalizeText(rawModel?.id)
      if (!modelId) {
        continue
      }
      const enabled = toBoolean(rawModel?.enabled, true)
      const targetType = normalizeProviderTargetType(rawModel?.targetType)
      allMap.set(`${targetType}::${modelId}`, {
        channelId,
        modelId,
        targetType,
        label: normalizeText(rawModel?.label) || modelId,
        format: normalizeText(rawModel?.format),
        enabled,
      })
    }

    if (allMap.size <= 0) {
      const fallbackModelId = normalizeText(rawChannel?.defaultModelId || rawChannel?.model)
      if (fallbackModelId) {
        allMap.set(`model::${fallbackModelId}`, {
          channelId,
          modelId: fallbackModelId,
          targetType: 'model',
          label: fallbackModelId,
          format: '',
          enabled: true,
        })
      }
    }

    const allOptions = sortChannelModelOptions(Array.from(allMap.values()))
    allModelOptionsByChannel[channelId] = allOptions
    enabledModelOptionsByChannel[channelId] = allOptions.filter(item => item.enabled)
  }

  channels.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    return a.id.localeCompare(b.id)
  })

  return {
    channels,
    enabledModelOptionsByChannel,
    allModelOptionsByChannel,
  }
}

export function buildModelGroupPayload(list: ModelGroupFormItem[]) {
  return list.map((item) => {
    const capabilities = resolvePilotCapabilities(item.capabilities, {
      allowWebsearch: item.allowWebsearch,
      allowFileAnalysis: item.allowFileAnalysis,
      allowImageAnalysis: item.allowImageAnalysis,
      allowImageGeneration: item.allowImageGeneration,
    })
    const thinking = normalizeThinkingFlags(item.thinkingSupported !== false, item.thinkingDefaultEnabled !== false)
    const builtinTools = sanitizeBuiltinToolsByCapabilities(normalizeBuiltinTools(item.builtinTools), capabilities)

    return {
      capabilities,
      id: normalizeText(item.id),
      name: normalizeText(item.name),
      description: normalizeText(item.description),
      enabled: item.enabled,
      visible: item.visible,
      source: item.source,
      icon: {
        type: item.iconType,
        value: normalizeText(item.iconValue),
      },
      tags: normalizeModelTagList(item.tags),
      scenes: normalizeSceneList(item.scenes),
      qualityScore: toNumber(item.qualityScore, 50, 0, 100),
      speedScore: toNumber(item.speedScore, 50, 0, 100),
      costScore: toNumber(item.costScore, 50, 0, 100),
      thinkingSupported: thinking.thinkingSupported,
      thinkingDefaultEnabled: thinking.thinkingDefaultEnabled,
      allowWebsearch: capabilities.websearch !== false,
      // 统一写回双字段，保证旧读取路径不会分叉。
      allowImageAnalysis: capabilities['file.analyze'] !== false,
      allowImageGeneration: capabilities['image.generate'] !== false,
      allowFileAnalysis: capabilities['file.analyze'] !== false,
      builtinTools,
      defaultRouteComboId: normalizeText(item.defaultRouteComboId) || undefined,
      bindings: item.bindings.map(binding => ({
        channelId: normalizeText(binding.channelId),
        providerModel: normalizeText(binding.providerModel),
        providerTargetType: normalizeProviderTargetType(binding.providerTargetType),
        enabled: binding.enabled,
        priority: toNumber(binding.priority, 100, 1, 9999),
        weight: toNumber(binding.weight, 100, 1, 1000),
      })),
    }
  })
}

export function buildRouteComboPayload(list: RouteComboFormItem[]) {
  return list.map(item => ({
    id: normalizeText(item.id),
    name: normalizeText(item.name),
    description: normalizeText(item.description) || undefined,
    enabled: item.enabled,
    langgraphAssistantId: normalizeText(item.langgraphAssistantId) || undefined,
    graphProfile: normalizeText(item.graphProfile) || undefined,
    fallbackRouteComboId: normalizeText(item.fallbackRouteComboId) || undefined,
    routes: item.routes.map(route => ({
      channelId: normalizeText(route.channelId),
      modelId: normalizeText(route.modelId) || undefined,
      providerModel: normalizeText(route.providerModel) || undefined,
      providerTargetType: normalizeProviderTargetType(route.providerTargetType),
      enabled: route.enabled,
      priority: toNumber(route.priority, 100, 1, 9999),
      weight: toNumber(route.weight, 100, 1, 1000),
      timeoutMs: toNumber(route.timeoutMs, 90_000, 3_000, 10 * 60 * 1000),
      maxRetries: toNumber(route.maxRetries, 1, 0, 5),
      circuitBreakerThreshold: toNumber(route.circuitBreakerThreshold, 3, 1, 10),
    })),
  }))
}

function parseRoutingSettings(payload: any) {
  const routing = payload?.settings?.routing || {}
  const rawRoutingPolicy = routing.routingPolicy || {}
  const scenePolicies = Array.isArray(rawRoutingPolicy.scenePolicies)
    ? rawRoutingPolicy.scenePolicies
        .map((item: Partial<PilotScenePolicy>) => normalizeScenePolicyFormItem(item))
        .filter((item): item is PilotScenePolicyFormItem => Boolean(item))
    : buildScenePoliciesFromLegacy(rawRoutingPolicy)
  return {
    modelCatalog: Array.isArray(routing.modelCatalog) && routing.modelCatalog.length > 0
      ? routing.modelCatalog.map((item: any) => normalizeModelGroup(item || {}))
      : [createEmptyModelGroup()],
    routeCombos: Array.isArray(routing.routeCombos) && routing.routeCombos.length > 0
      ? routing.routeCombos.map((item: any) => normalizeRouteCombo(item || {}))
      : [createEmptyRouteCombo()],
    routingPolicy: {
      defaultModelId: normalizeText(rawRoutingPolicy.defaultModelId) || 'quota-auto',
      defaultRouteComboId: normalizeText(rawRoutingPolicy.defaultRouteComboId) || 'default-auto',
      explorationRate: Number(toNumber(rawRoutingPolicy.explorationRate, 0.08, 0, 0.5).toFixed(2)),
      scenePolicies,
      intentNanoModelId: normalizeText(rawRoutingPolicy.intentNanoModelId),
      intentRouteComboId: normalizeText(rawRoutingPolicy.intentRouteComboId),
      imageGenerationModelId: normalizeText(rawRoutingPolicy.imageGenerationModelId),
      imageRouteComboId: normalizeText(rawRoutingPolicy.imageRouteComboId),
    } as PilotRoutingPolicyForm,
    lbPolicy: {
      metricWindowHours: toNumber(routing.lbPolicy?.metricWindowHours, 24, 1, 24 * 7),
      recentRequestWindow: toNumber(routing.lbPolicy?.recentRequestWindow, 200, 10, 5000),
      circuitBreakerFailureThreshold: toNumber(routing.lbPolicy?.circuitBreakerFailureThreshold, 3, 1, 20),
      circuitBreakerCooldownMs: toNumber(routing.lbPolicy?.circuitBreakerCooldownMs, 60_000, 5_000, 10 * 60 * 1000),
      halfOpenProbeCount: toNumber(routing.lbPolicy?.halfOpenProbeCount, 1, 1, 5),
    } as PilotLoadBalancePolicyForm,
    memoryPolicy: {
      enabledByDefault: toBoolean(routing.memoryPolicy?.enabledByDefault, true),
      allowUserDisable: toBoolean(routing.memoryPolicy?.allowUserDisable, true),
      allowUserClear: toBoolean(routing.memoryPolicy?.allowUserClear, true),
    } as PilotMemoryPolicyForm,
  }
}

function normalizeRoutingMetric(raw: Partial<PilotRoutingMetricRow>): PilotRoutingMetricRow {
  return {
    id: Number(raw.id || 0),
    createdAt: normalizeText(raw.createdAt),
    channelId: normalizeText(raw.channelId),
    providerModel: normalizeText(raw.providerModel),
    modelId: normalizeText(raw.modelId),
    routeComboId: normalizeText(raw.routeComboId),
    success: toBoolean(raw.success, false),
    ttftMs: toNumber(raw.ttftMs, 0, 0, Number.MAX_SAFE_INTEGER),
    totalDurationMs: toNumber(raw.totalDurationMs, 0, 0, Number.MAX_SAFE_INTEGER),
    queueWaitMs: toNumber(raw.queueWaitMs, 0, 0, Number.MAX_SAFE_INTEGER),
    outputChars: toNumber(raw.outputChars, 0, 0, Number.MAX_SAFE_INTEGER),
    finishReason: normalizeText(raw.finishReason),
    errorCode: normalizeText(raw.errorCode),
  }
}

export async function fetchPilotRoutingSettings() {
  const res: PilotSettingsResponse = await endHttp.get('admin/settings')
  return parseRoutingSettings(res)
}

export function createEmptyChannelModelOptionIndex(): ChannelModelOptionIndex {
  return {
    ...EMPTY_CHANNEL_MODEL_OPTION_INDEX,
    channels: [],
    enabledModelOptionsByChannel: {},
    allModelOptionsByChannel: {},
  }
}

export async function fetchPilotChannelModelOptionIndex(): Promise<ChannelModelOptionIndex> {
  const res: PilotSettingsResponse = await endHttp.get('admin/settings')
  return parseChannelModelOptionIndex(res)
}

export async function savePilotRoutingSettings(patch: {
  modelCatalog?: ReturnType<typeof buildModelGroupPayload>
  routeCombos?: ReturnType<typeof buildRouteComboPayload>
  routingPolicy?: Partial<PilotRoutingPolicyForm>
  lbPolicy?: Partial<PilotLoadBalancePolicyForm>
  memoryPolicy?: Partial<PilotMemoryPolicyForm>
}) {
  const res: PilotSettingsResponse = await endHttp.post('admin/settings', {
    routing: {
      modelCatalog: patch.modelCatalog,
      routeCombos: patch.routeCombos,
      routingPolicy: patch.routingPolicy,
      lbPolicy: patch.lbPolicy,
      memoryPolicy: patch.memoryPolicy,
    },
  })
  if (!res?.ok && !res?.settings) {
    throw new Error(res?.message || '保存 Routing 设置失败')
  }
  return parseRoutingSettings(res)
}

export async function syncPilotChannelModels(): Promise<{
  totalChannels: number
  successChannels: number
  failedChannels: number
  discoveredModelCount: number
}> {
  const payload: any = await endHttp.post('admin/channel-models/sync', {})
  const result = payload?.result || {}
  return {
    totalChannels: toNumber(result.totalChannels, 0, 0, 9999),
    successChannels: toNumber(result.successChannels, 0, 0, 9999),
    failedChannels: toNumber(result.failedChannels, 0, 0, 9999),
    discoveredModelCount: toNumber(result.discoveredModelCount, 0, 0, 9999),
  }
}

export async function fetchPilotRoutingMetrics(limit = 200): Promise<{
  metrics: PilotRoutingMetricRow[]
  summary: PilotRoutingMetricSummary
}> {
  const rawPayload: any = await endHttp.get('admin/routing-metrics', {
    limit,
  })
  const payload: PilotRoutingMetricsResponse = rawPayload?.data && typeof rawPayload.data === 'object'
    ? rawPayload.data as PilotRoutingMetricsResponse
    : rawPayload as PilotRoutingMetricsResponse
  return {
    metrics: Array.isArray(payload.metrics)
      ? payload.metrics.map(item => normalizeRoutingMetric(item || {}))
      : [],
    summary: {
      total: toNumber(payload.summary?.total, 0, 0, Number.MAX_SAFE_INTEGER),
      success: toNumber(payload.summary?.success, 0, 0, Number.MAX_SAFE_INTEGER),
      failed: toNumber(payload.summary?.failed, 0, 0, Number.MAX_SAFE_INTEGER),
      successRate: Number(toNumber(payload.summary?.successRate, 0, 0, 1).toFixed(4)),
      avgTtftMs: Number(toNumber(payload.summary?.avgTtftMs, 0, 0, Number.MAX_SAFE_INTEGER).toFixed(2)),
      avgTotalDurationMs: Number(toNumber(payload.summary?.avgTotalDurationMs, 0, 0, Number.MAX_SAFE_INTEGER).toFixed(2)),
    },
  }
}
