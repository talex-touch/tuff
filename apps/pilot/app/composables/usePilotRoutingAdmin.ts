import { endHttp } from '~/composables/api/axios'

export type PilotIconType = 'class' | 'url' | 'emoji' | 'file'
export type PilotModelSource = 'system' | 'manual' | 'discovered'

export interface ModelBindingFormItem {
  channelId: string
  providerModel: string
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
  qualityScore: number
  speedScore: number
  costScore: number
  thinkingSupported: boolean
  thinkingDefaultEnabled: boolean
  allowWebsearch: boolean
  defaultRouteComboId: string
  bindings: ModelBindingFormItem[]
}

export interface RouteComboRouteFormItem {
  channelId: string
  modelId: string
  providerModel: string
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

interface PilotSettingsResponse {
  settings?: {
    routing?: {
      modelCatalog?: Array<Partial<ModelGroupFormItem> & {
        icon?: {
          type?: string
          value?: string
        }
        bindings?: Array<Partial<ModelBindingFormItem>>
      }>
      routeCombos?: Array<Partial<RouteComboFormItem> & {
        routes?: Array<Partial<RouteComboRouteFormItem>>
      }>
      routingPolicy?: Partial<PilotRoutingPolicyForm>
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

let modelSequence = 0
let routeComboSequence = 0
let routeSequence = 0

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
    enabled: true,
    priority: 100,
    weight: 100,
  }
}

export function createEmptyModelGroup(): ModelGroupFormItem {
  const id = createDefaultModelId()
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
    qualityScore: 50,
    speedScore: 50,
    costScore: 50,
    thinkingSupported: true,
    thinkingDefaultEnabled: true,
    allowWebsearch: true,
    defaultRouteComboId: '',
    bindings: [],
  }
}

export function createEmptyRouteComboRoute(): RouteComboRouteFormItem {
  createDefaultRouteId()
  return {
    channelId: '',
    modelId: '',
    providerModel: '',
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
}): ModelGroupFormItem {
  const id = normalizeText(raw.id) || createDefaultModelId()
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map(item => normalizeText(item)).filter(Boolean).join(',')
    : normalizeText(raw.tags)

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
    qualityScore: toNumber(raw.qualityScore, 50, 0, 100),
    speedScore: toNumber(raw.speedScore, 50, 0, 100),
    costScore: toNumber(raw.costScore, 50, 0, 100),
    thinkingSupported: toBoolean(raw.thinkingSupported, true),
    thinkingDefaultEnabled: toBoolean(raw.thinkingDefaultEnabled, true),
    allowWebsearch: toBoolean(raw.allowWebsearch, true),
    defaultRouteComboId: normalizeText(raw.defaultRouteComboId),
    bindings: Array.isArray(raw.bindings)
      ? raw.bindings.map(item => ({
          channelId: normalizeText(item.channelId),
          providerModel: normalizeText(item.providerModel),
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

export function buildModelGroupPayload(list: ModelGroupFormItem[]) {
  return list.map(item => ({
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
    qualityScore: toNumber(item.qualityScore, 50, 0, 100),
    speedScore: toNumber(item.speedScore, 50, 0, 100),
    costScore: toNumber(item.costScore, 50, 0, 100),
    thinkingSupported: item.thinkingSupported,
    thinkingDefaultEnabled: item.thinkingDefaultEnabled,
    allowWebsearch: item.allowWebsearch,
    defaultRouteComboId: normalizeText(item.defaultRouteComboId) || undefined,
    bindings: item.bindings.map(binding => ({
      channelId: normalizeText(binding.channelId),
      providerModel: normalizeText(binding.providerModel),
      enabled: binding.enabled,
      priority: toNumber(binding.priority, 100, 1, 9999),
      weight: toNumber(binding.weight, 100, 1, 1000),
    })),
  }))
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
  return {
    modelCatalog: Array.isArray(routing.modelCatalog) && routing.modelCatalog.length > 0
      ? routing.modelCatalog.map((item: any) => normalizeModelGroup(item || {}))
      : [createEmptyModelGroup()],
    routeCombos: Array.isArray(routing.routeCombos) && routing.routeCombos.length > 0
      ? routing.routeCombos.map((item: any) => normalizeRouteCombo(item || {}))
      : [createEmptyRouteCombo()],
    routingPolicy: {
      defaultModelId: normalizeText(routing.routingPolicy?.defaultModelId) || 'quota-auto',
      defaultRouteComboId: normalizeText(routing.routingPolicy?.defaultRouteComboId) || 'default-auto',
      explorationRate: Number(toNumber(routing.routingPolicy?.explorationRate, 0.08, 0, 0.5).toFixed(2)),
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
  const payload: PilotRoutingMetricsResponse = await endHttp.get('admin/routing-metrics', {
    limit,
  })
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
