import { listTuffIntelligenceBuiltinAbilities, pickTuffIntelligenceBuiltinAbilities } from '@talex-touch/tuff-intelligence/light'

export type ProviderVendor = 'tencent-cloud' | 'openai' | 'deepseek' | 'dashscope' | 'exchange-rate' | 'custom'
export type ProviderServiceCategory = 'ai' | 'exchange' | 'screenshot' | 'translation'
export type ProviderStatus = 'enabled' | 'disabled' | 'degraded'
export type ProviderAuthType = 'api_key' | 'secret_pair' | 'oauth' | 'none'
export type OwnerScope = 'system' | 'workspace' | 'user'
export type SceneOwner = 'nexus' | 'core-app' | 'app' | 'plugin'
export type SceneStrategyMode = 'priority' | 'least_cost' | 'lowest_latency' | 'balanced' | 'manual'
export type SceneFallback = 'enabled' | 'disabled'
export type BindingStatus = 'enabled' | 'disabled'

export interface ProviderCapabilityRecord {
  id: string
  providerId: string
  capability: string
  schemaRef: string | null
  metering: Record<string, unknown> | null
  constraints: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  adapter?: {
    providerId: string
    vendor: string
    capability: string
    adapterKey: string | null
    ready: boolean
    matchedKey: string | null
    fallbackKey: string | null
    reason: 'adapter-ready' | 'provider-capability-missing' | 'adapter-key-missing' | 'adapter-missing'
  }
  createdAt: string
  updatedAt: string
}

export interface ProviderRegistryRecord {
  id: string
  name: string
  displayName: string
  vendor: ProviderVendor
  status: ProviderStatus
  authType: ProviderAuthType
  authRef: string | null
  ownerScope: OwnerScope
  ownerId: string | null
  description: string | null
  endpoint: string | null
  region: string | null
  metadata: Record<string, unknown> | null
  capabilities: ProviderCapabilityRecord[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface SceneStrategyBindingRecord {
  id: string
  sceneId: string
  providerId: string
  capability: string
  model: string | null
  priority: number
  weight: number | null
  status: BindingStatus
  constraints: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface SceneRegistryRecord {
  id: string
  displayName: string
  owner: SceneOwner
  ownerScope: OwnerScope
  ownerId: string | null
  status: BindingStatus
  requiredCapabilities: string[]
  strategyMode: SceneStrategyMode
  fallback: SceneFallback
  meteringPolicy: Record<string, unknown> | null
  auditPolicy: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  readiness?: {
    status: 'ready' | 'degraded' | 'disabled'
    missingCapabilities: string[]
    invalidBindings: Array<{
      bindingId: string
      providerId: string
      capability: string
      code: 'PROVIDER_MISSING' | 'CAPABILITY_MISSING' | 'ADAPTER_MISSING' | 'MODEL_INVALID'
    }>
  }
  bindings: SceneStrategyBindingRecord[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CapabilityFormRow {
  capability: string
  schemaRef: string
  meteringUnit: string
}

export interface SceneCapabilityAdapterCatalogEntry {
  key: string
  label: string
  capabilities: string[]
  supportsStreaming: boolean
}

export type ProviderRegistryTemplateId =
  | 'tencent-translation'
  | 'openai-compatible-ai'
  | 'openai-responses-ai'
  | 'deepseek-ai'
  | 'dashscope-filetrans-asr'
  | 'dashscope-qwen-audio-asr'
  | 'exchange-rate'
  | 'screenshot-overlay'

export interface ProviderRegistryTemplate {
  id: ProviderRegistryTemplateId
  serviceCategory: ProviderServiceCategory
  vendor: ProviderVendor
  name: string
  displayName: string
  adapterKey: string
  authType: ProviderAuthType
  authRef: string
  endpoint: string
  region: string
  models?: string[]
  defaultModel?: string
  capabilities: CapabilityFormRow[]
  metadata: Record<string, unknown>
}

export interface BindingFormRow {
  providerId: string
  capability: string
  model: string
  priority: number
}

export interface CapabilityEditRow {
  id?: string
  capability: string
  schemaRef: string
  meteringUnit: string
  maxImageBytes: string
  providerModel: string
  meteringText: string
  constraintsText: string
  metadataText: string
}

export interface ProviderEditPanelState {
  expanded: boolean
  saving: boolean
  name: string
  displayName: string
  vendor: ProviderVendor
  adapterKey: string
  status: ProviderStatus
  authType: ProviderAuthType
  authRef: string
  ownerScope: OwnerScope
  ownerId: string
  description: string
  endpoint: string
  region: string
  modelsText: string
  defaultModel: string
  metadataText: string
  capabilities: CapabilityEditRow[]
  removedCapabilityIds: string[]
  error: string | null
}

export interface ProviderQuotaRecord {
  id: string
  configType: 'intelligence_provider_quota'
  name: string
  targetId: string | null
  provider: string | null
  channel: string | null
  enabled: boolean
  limits: Record<string, unknown> | null
  warningThreshold: number | null
  config: Record<string, unknown> | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ProviderQuotaPanelState {
  expanded: boolean
  saving: boolean
  name: string
  enabled: 'enabled' | 'disabled'
  windowDays: string
  maxRequests: string
  maxTokens: string
  warningThreshold: string
  error: string | null
}

export interface ProviderQuotaSummary {
  configured: boolean
  enabled: boolean
  count: number
  windowDays: string
  maxRequests: string
  maxTokens: string
  warningThreshold: string
}

export interface BindingEditRow {
  providerId: string
  capability: string
  model: string
  priority: number
  weightText: string
  status: BindingStatus
  constraintsText: string
  metadataText: string
}

export interface SceneEditPanelState {
  expanded: boolean
  saving: boolean
  displayName: string
  owner: SceneOwner
  ownerScope: OwnerScope
  ownerId: string
  status: BindingStatus
  requiredCapabilitiesText: string
  strategyMode: SceneStrategyMode
  fallback: SceneFallback
  meteringPolicyText: string
  auditPolicyText: string
  metadataText: string
  bindings: BindingEditRow[]
  error: string | null
}

export interface ProviderCheckResult {
  success: boolean
  providerId: string
  capability: string
  latency: number
  endpoint: string
  requestId?: string
  message: string
  error?: {
    code?: string
    message: string
    status?: number
  }
}

export interface SceneRunUsage {
  unit: string
  quantity: number
  billable: boolean
  providerId?: string
  capability?: string
  estimated?: boolean
  pricingRef?: string
  providerUsageRef?: string
}

export interface SceneRunTraceStep {
  phase: string
  status: 'success' | 'skipped' | 'failed'
  at: string
  message: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface SceneRunCandidate {
  providerId: string
  providerName: string
  vendor: string
  capability: string
  priority: number
  weight: number | null
  bindingId: string
}

export interface SceneRunSelection extends SceneRunCandidate {
  authRef: string | null
  endpoint: string | null
  region: string | null
}

export interface SceneRunFallbackTrailItem {
  providerId: string
  capability: string
  status: 'candidate' | 'selected' | 'rejected' | 'failed'
  reason?: string
}

export interface SceneRunResult {
  runId: string
  sceneId: string
  status: 'planned' | 'completed' | 'failed'
  mode: 'dry_run' | 'execute'
  strategyMode: SceneStrategyMode
  requestedCapabilities: string[]
  selected: SceneRunSelection[]
  candidates: SceneRunCandidate[]
  fallbackTrail: SceneRunFallbackTrailItem[]
  trace: SceneRunTraceStep[]
  usage: SceneRunUsage[]
  output: unknown
  error?: {
    code: string
    message: string
  }
}

export interface ProviderUsageLedgerEntry {
  id: string
  runId: string
  sceneId: string
  mode: 'dry_run' | 'execute'
  status: 'planned' | 'completed' | 'failed'
  strategyMode: string
  capability: string | null
  providerId: string | null
  unit: string
  quantity: number
  billable: boolean
  estimated: boolean
  pricingRef: string | null
  providerUsageRef: string | null
  errorCode: string | null
  errorMessage: string | null
  trace: Array<Record<string, unknown>>
  fallbackTrail: Array<Record<string, unknown>>
  selected: Array<Record<string, unknown>>
  createdAt: string
}

export interface ProviderHealthCheckEntry {
  id: string
  providerId: string
  providerName: string
  vendor: string
  capability: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  latencyMs: number
  endpoint: string
  requestId: string | null
  degradedReason: string | null
  errorCode: string | null
  errorMessage: string | null
  checkedAt: string
}

export interface ProviderObservabilitySummary {
  latestHealth: ProviderHealthCheckEntry | null
  latestUsage: ProviderUsageLedgerEntry | null
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
}

export interface SceneObservabilitySummary {
  latestUsage: ProviderUsageLedgerEntry | null
  failedUsageCount: number
  status: 'planned' | 'completed' | 'failed' | 'unknown'
}

export interface ObservabilityActionHint {
  tone: 'success' | 'warning' | 'danger' | 'muted'
  labelKey: string
  fallback: string
  detail: string | null
}

export type ProviderObservabilityFilter = 'all' | 'attention' | 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
export type SceneObservabilityFilter = 'all' | 'attention' | 'completed' | 'failed' | 'planned' | 'unknown'
export type UsageLedgerFilter = 'all' | 'attention' | 'completed' | 'failed' | 'planned' | 'estimated'
export type HealthCheckFilter = 'all' | 'attention' | 'healthy' | 'degraded' | 'unhealthy'

export interface SceneRunPanelState {
  expanded: boolean
  inputText: string
  capability: string
  providerId: string
  result: SceneRunResult | null
  error: string | null
}

export const providerVendorOptions: ProviderVendor[] = ['tencent-cloud', 'openai', 'deepseek', 'dashscope', 'exchange-rate', 'custom']
export const providerServiceCategoryOptions: ProviderServiceCategory[] = ['ai', 'exchange', 'screenshot', 'translation']
export const providerStatusOptions: ProviderStatus[] = ['enabled', 'disabled', 'degraded']
export const authTypeOptions: ProviderAuthType[] = ['secret_pair', 'api_key', 'oauth', 'none']
export const ownerScopeOptions: OwnerScope[] = ['system', 'workspace', 'user']
export const sceneOwnerOptions: SceneOwner[] = ['nexus', 'core-app', 'app', 'plugin']
export const strategyOptions: SceneStrategyMode[] = ['priority', 'least_cost', 'lowest_latency', 'balanced', 'manual']
export const fallbackOptions: SceneFallback[] = ['enabled', 'disabled']
export const bindingStatusOptions: BindingStatus[] = ['enabled', 'disabled']

function builtinCapabilityRows(ids: readonly string[]): CapabilityFormRow[] {
  return pickTuffIntelligenceBuiltinAbilities(ids).map(ability => ({
    capability: ability.id,
    schemaRef: ability.schemaRef,
    meteringUnit: ability.meteringUnit,
  }))
}

export const providerCapabilityCatalogOptions: CapabilityFormRow[] = listTuffIntelligenceBuiltinAbilities().map(ability => ({
  capability: ability.id,
  schemaRef: ability.schemaRef,
  meteringUnit: ability.meteringUnit,
}))

export const providerRegistryTemplates: ProviderRegistryTemplate[] = [
  {
    id: 'tencent-translation',
    serviceCategory: 'translation',
    vendor: 'tencent-cloud',
    name: 'tencent-cloud-mt-main',
    displayName: 'Tencent Cloud Machine Translation',
    authType: 'secret_pair',
    authRef: 'secure://providers/tencent-cloud-mt-main',
    endpoint: 'https://tmt.tencentcloudapi.com',
    region: 'ap-shanghai',
    capabilities: builtinCapabilityRows(['text.translate', 'image.translate', 'image.translate.e2e']),
    adapterKey: 'tencent-translation',
    metadata: {
      source: 'provider-registry',
      template: 'tencent-translation',
      adapterKey: 'tencent-translation',
    },
  },
  {
    id: 'openai-compatible-ai',
    serviceCategory: 'ai',
    vendor: 'openai',
    name: 'openai-compatible-ai-main',
    displayName: 'OpenAI Compatible AI',
    authType: 'api_key',
    authRef: 'secure://providers/openai-compatible-ai-main',
    endpoint: 'https://api.openai.com',
    region: 'global',
    models: ['gpt-4.1-mini'],
    defaultModel: 'gpt-4.1-mini',
    capabilities: builtinCapabilityRows(['text.chat', 'text.summarize', 'content.extract', 'vision.ocr']),
    adapterKey: 'openai-compatible',
    metadata: {
      source: 'provider-registry',
      adapterKey: 'openai-compatible',
      routingShape: 'providers-scenes',
      template: 'openai-compatible-ai',
      transport: 'chat.completions',
      intelligenceType: 'openai',
      defaultModel: 'gpt-4.1-mini',
    },
  },
  {
    id: 'openai-responses-ai',
    serviceCategory: 'ai',
    vendor: 'openai',
    name: 'openai-responses-ai-main',
    displayName: 'OpenAI Responses',
    authType: 'api_key',
    authRef: 'secure://providers/openai-responses-ai-main',
    endpoint: 'https://api.openai.com',
    region: 'global',
    models: ['gpt-4.1-mini'],
    defaultModel: 'gpt-4.1-mini',
    capabilities: builtinCapabilityRows(['text.chat', 'text.summarize', 'content.extract', 'vision.ocr']),
    adapterKey: 'openai-responses',
    metadata: {
      source: 'provider-registry',
      adapterKey: 'openai-responses',
      routingShape: 'providers-scenes',
      template: 'openai-responses-ai',
      transport: 'responses',
      intelligenceType: 'openai',
      defaultModel: 'gpt-4.1-mini',
    },
  },
  {
    id: 'deepseek-ai',
    serviceCategory: 'ai',
    vendor: 'deepseek',
    name: 'deepseek-ai-main',
    displayName: 'DeepSeek AI',
    authType: 'api_key',
    authRef: 'secure://providers/deepseek-ai-main',
    endpoint: 'https://api.deepseek.com',
    region: 'global',
    models: ['deepseek-chat'],
    defaultModel: 'deepseek-chat',
    capabilities: builtinCapabilityRows(['text.chat', 'text.summarize', 'content.extract']),
    adapterKey: 'openai-compatible',
    metadata: {
      source: 'provider-registry',
      adapterKey: 'openai-compatible',
      routingShape: 'providers-scenes',
      template: 'deepseek-ai',
      transport: 'chat.completions',
      intelligenceType: 'deepseek',
      defaultModel: 'deepseek-chat',
    },
  },
  {
    id: 'dashscope-filetrans-asr',
    serviceCategory: 'ai',
    vendor: 'dashscope',
    name: 'dashscope-filetrans-asr-main',
    displayName: 'DashScope Filetrans ASR',
    authType: 'api_key',
    authRef: 'secure://providers/dashscope-filetrans-asr-main',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1',
    region: 'cn-beijing',
    models: ['qwen-audio-3.0-asr-flash-filetrans'],
    defaultModel: 'qwen-audio-3.0-asr-flash-filetrans',
    capabilities: builtinCapabilityRows(['audio.transcribe']),
    adapterKey: 'dashscope-filetrans-asr',
    metadata: {
      source: 'provider-registry',
      adapterKey: 'dashscope-filetrans-asr',
      transport: 'filetrans',
      defaultModel: 'qwen-audio-3.0-asr-flash-filetrans',
      inputUnit: 'audio_second',
    },
  },
  {
    id: 'dashscope-qwen-audio-asr',
    serviceCategory: 'ai',
    vendor: 'dashscope',
    name: 'dashscope-qwen-audio-asr-main',
    displayName: 'DashScope Qwen Audio ASR',
    authType: 'api_key',
    authRef: 'secure://providers/dashscope-qwen-audio-asr-main',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1',
    region: 'cn-beijing',
    models: ['qwen-audio-3.0-asr-flash'],
    defaultModel: 'qwen-audio-3.0-asr-flash',
    capabilities: builtinCapabilityRows(['audio.transcribe']),
    adapterKey: 'dashscope-qwen-audio-asr',
    metadata: {
      source: 'provider-registry',
      adapterKey: 'dashscope-qwen-audio-asr',
      transport: 'qwen-audio-sync',
      defaultModel: 'qwen-audio-3.0-asr-flash',
      inputUnit: 'audio_second',
      maxDurationSeconds: 300,
    },
  },
  {
    id: 'exchange-rate',
    serviceCategory: 'exchange',
    vendor: 'exchange-rate',
    name: 'exchange-rate-official',
    displayName: 'Exchange Rate API',
    authType: 'api_key',
    authRef: 'secure://providers/exchange-rate-official',
    endpoint: 'https://v6.exchangerate-api.com/v6',
    region: 'global',
    capabilities: builtinCapabilityRows(['fx.rate.latest', 'fx.convert']),
    adapterKey: 'exchange-rate',
    metadata: {
      source: 'provider-registry',
      adapterKey: 'exchange-rate',
      template: 'exchange-rate',
    },
  },
  {
    id: 'screenshot-overlay',
    serviceCategory: 'screenshot',
    vendor: 'custom',
    name: 'local-overlay-renderer',
    displayName: 'Local Screenshot Overlay',
    authType: 'none',
    authRef: '',
    endpoint: 'local://overlay-render',
    region: 'local',
    capabilities: builtinCapabilityRows(['overlay.render']),
    adapterKey: 'local-overlay',
    metadata: {
      source: 'provider-registry',
      adapterKey: 'local-overlay',
      template: 'screenshot-overlay',
    },
  },
]

export function resolveFirstProviderTemplateForServiceCategory(
  category: ProviderServiceCategory | string | number,
): ProviderRegistryTemplate | null {
  const normalized = String(category) as ProviderServiceCategory
  return providerRegistryTemplates.find(template => template.serviceCategory === normalized) ?? null
}

export function createProviderAuthRef(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 80) || 'provider'

  return `secure://providers/${slug}`
}

export const providerObservabilityFilters: ProviderObservabilityFilter[] = ['all', 'attention', 'healthy', 'degraded', 'unhealthy', 'unknown']
export const sceneObservabilityFilters: SceneObservabilityFilter[] = ['all', 'attention', 'completed', 'failed', 'planned', 'unknown']
export const usageLedgerFilters: UsageLedgerFilter[] = ['all', 'attention', 'completed', 'failed', 'planned', 'estimated']
export const healthCheckFilters: HealthCheckFilter[] = ['all', 'attention', 'healthy', 'degraded', 'unhealthy']

export function statusTone(status: string) {
  if (status === 'enabled' || status === 'success' || status === 'completed')
    return 'success'
  if (status === 'degraded' || status === 'skipped' || status === 'planned')
    return 'warning'
  if (status === 'failed')
    return 'danger'
  return 'muted'
}

export function observabilityTone(status: string | null | undefined) {
  if (status === 'healthy' || status === 'completed')
    return 'success'
  if (status === 'degraded' || status === 'planned')
    return 'warning'
  if (status === 'unhealthy' || status === 'failed')
    return 'danger'
  return 'muted'
}

function compareNewestFirst(left: string, right: string) {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime))
    return 0
  if (!Number.isFinite(leftTime))
    return 1
  if (!Number.isFinite(rightTime))
    return -1
  return rightTime - leftTime
}

function newestBy<T>(entries: T[], getDate: (entry: T) => string): T | null {
  return [...entries].sort((left, right) => compareNewestFirst(getDate(left), getDate(right)))[0] ?? null
}

export function resolveProviderObservability(
  providerId: string,
  healthEntries: ProviderHealthCheckEntry[],
  usageEntries: ProviderUsageLedgerEntry[],
): ProviderObservabilitySummary {
  const latestHealth = newestBy(
    healthEntries.filter(entry => entry.providerId === providerId),
    entry => entry.checkedAt,
  )
  const latestUsage = newestBy(
    usageEntries.filter(entry => entry.providerId === providerId),
    entry => entry.createdAt,
  )

  return {
    latestHealth,
    latestUsage,
    status: latestHealth?.status ?? (latestUsage?.status === 'failed' ? 'unhealthy' : 'unknown'),
  }
}

export function resolveSceneObservability(
  sceneId: string,
  usageEntries: ProviderUsageLedgerEntry[],
): SceneObservabilitySummary {
  const sceneUsage = usageEntries.filter(entry => entry.sceneId === sceneId)
  const latestUsage = newestBy(sceneUsage, entry => entry.createdAt)

  return {
    latestUsage,
    failedUsageCount: sceneUsage.filter(entry => entry.status === 'failed').length,
    status: latestUsage?.status ?? 'unknown',
  }
}

function providerFailureReason(summary: ProviderObservabilitySummary) {
  return summary.latestUsage?.errorCode
    || summary.latestUsage?.errorMessage
    || summary.latestHealth?.errorCode
    || summary.latestHealth?.errorMessage
    || summary.latestHealth?.degradedReason
    || null
}

export function resolveProviderObservabilityActionHint(summary: ProviderObservabilitySummary): ObservabilityActionHint {
  if (summary.latestUsage?.status === 'failed' || summary.status === 'unhealthy') {
    return {
      tone: 'danger',
      labelKey: 'dashboard.providerRegistry.observability.actions.providerUnhealthy',
      fallback: 'Check credentials, endpoint, and provider health before using this provider.',
      detail: providerFailureReason(summary),
    }
  }

  if (summary.status === 'degraded') {
    return {
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.providerDegraded',
      fallback: 'Review the degraded reason, then rerun the provider check.',
      detail: providerFailureReason(summary),
    }
  }

  if (summary.status === 'healthy') {
    return {
      tone: 'success',
      labelKey: 'dashboard.providerRegistry.observability.actions.providerHealthy',
      fallback: 'Healthy. Ready for scene dry-run or registry evidence.',
      detail: summary.latestHealth?.capability ?? null,
    }
  }

  return {
    tone: 'muted',
    labelKey: 'dashboard.providerRegistry.observability.actions.providerUnknown',
    fallback: 'Run a provider check before relying on this provider.',
    detail: null,
  }
}

function sceneFailureReason(summary: SceneObservabilitySummary) {
  return summary.latestUsage?.errorCode
    || summary.latestUsage?.errorMessage
    || null
}

export function resolveSceneObservabilityActionHint(summary: SceneObservabilitySummary): ObservabilityActionHint {
  if (summary.status === 'failed') {
    return {
      tone: 'danger',
      labelKey: 'dashboard.providerRegistry.observability.actions.sceneFailed',
      fallback: 'Inspect the error and fallback trail, then rerun a dry-run.',
      detail: sceneFailureReason(summary),
    }
  }

  if (summary.failedUsageCount > 0) {
    return {
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.sceneFailedHistory',
      fallback: 'Recent failures exist. Dry-run before the next execute.',
      detail: `${summary.failedUsageCount} failed`,
    }
  }

  if (summary.status === 'planned') {
    return {
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.scenePlanned',
      fallback: 'Only planned usage exists. Execute once with a safe sample input.',
      detail: summary.latestUsage?.runId ?? null,
    }
  }

  if (summary.status === 'completed') {
    return {
      tone: 'success',
      labelKey: 'dashboard.providerRegistry.observability.actions.sceneCompleted',
      fallback: 'Completed. Latest run can support registry evidence if output is clean.',
      detail: summary.latestUsage?.runId ?? null,
    }
  }

  return {
    tone: 'muted',
    labelKey: 'dashboard.providerRegistry.observability.actions.sceneUnknown',
    fallback: 'Run a scene dry-run to seed health and usage evidence.',
    detail: null,
  }
}

function usageLedgerReason(entry: ProviderUsageLedgerEntry) {
  return entry.errorCode
    || entry.errorMessage
    || entry.providerUsageRef
    || entry.pricingRef
    || entry.runId
    || null
}

export function resolveUsageLedgerActionHint(entry: ProviderUsageLedgerEntry): ObservabilityActionHint {
  if (entry.status === 'failed') {
    return {
      tone: 'danger',
      labelKey: 'dashboard.providerRegistry.observability.actions.usageFailed',
      fallback: 'Inspect the trace and fallback trail before reusing this scene.',
      detail: usageLedgerReason(entry),
    }
  }

  if (entry.status === 'planned') {
    return {
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.usagePlanned',
      fallback: 'Dry-run evidence only. Execute with a safe sample before marking runtime ready.',
      detail: entry.runId,
    }
  }

  if (entry.estimated) {
    return {
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.usageEstimated',
      fallback: 'Usage is estimated. Confirm provider billing reference before using it as final evidence.',
      detail: entry.providerUsageRef || entry.pricingRef || entry.runId,
    }
  }

  return {
    tone: 'success',
    labelKey: 'dashboard.providerRegistry.observability.actions.usageCompleted',
    fallback: 'Completed usage row is ready for evidence review.',
    detail: entry.providerUsageRef || entry.pricingRef || entry.runId,
  }
}

export function resolveUsageLedgerReference(entry: ProviderUsageLedgerEntry) {
  return entry.providerUsageRef || entry.pricingRef || entry.runId || '-'
}

function healthCheckReason(entry: ProviderHealthCheckEntry) {
  return entry.degradedReason
    || entry.errorCode
    || entry.errorMessage
    || entry.requestId
    || null
}

export function resolveHealthCheckActionHint(entry: ProviderHealthCheckEntry): ObservabilityActionHint {
  if (entry.status === 'unhealthy') {
    return {
      tone: 'danger',
      labelKey: 'dashboard.providerRegistry.observability.actions.healthUnhealthy',
      fallback: 'Health check failed. Verify credentials, endpoint, and provider availability.',
      detail: healthCheckReason(entry),
    }
  }

  if (entry.status === 'degraded') {
    return {
      tone: 'warning',
      labelKey: 'dashboard.providerRegistry.observability.actions.healthDegraded',
      fallback: 'Provider is degraded. Review the reason and rerun health check before routing traffic.',
      detail: healthCheckReason(entry),
    }
  }

  return {
    tone: 'success',
    labelKey: 'dashboard.providerRegistry.observability.actions.healthHealthy',
    fallback: 'Latest health check is healthy.',
    detail: entry.requestId || entry.capability || null,
  }
}

export function resolveHealthCheckReason(entry: ProviderHealthCheckEntry) {
  return healthCheckReason(entry) || '-'
}

function providerNeedsAttention(summary: ProviderObservabilitySummary) {
  return summary.status === 'degraded'
    || summary.status === 'unhealthy'
    || summary.latestUsage?.status === 'failed'
}

function sceneNeedsAttention(summary: SceneObservabilitySummary) {
  return summary.status === 'failed'
    || summary.status === 'unknown'
    || summary.failedUsageCount > 0
}

/** One provider against one status filter; a provider with no evidence yet is `unknown`. */
export function providerMatchesObservability(
  summary: ProviderObservabilitySummary | undefined,
  filter: ProviderObservabilityFilter,
) {
  if (filter === 'all')
    return true
  const resolved = summary ?? { latestHealth: null, latestUsage: null, status: 'unknown' as const }
  if (filter === 'attention')
    return providerNeedsAttention(resolved)
  return resolved.status === filter
}

/** One scene against one latest-run filter; a scene that never ran is `unknown`. */
export function sceneMatchesObservability(
  summary: SceneObservabilitySummary | undefined,
  filter: SceneObservabilityFilter,
) {
  if (filter === 'all')
    return true
  const resolved = summary ?? { latestUsage: null, failedUsageCount: 0, status: 'unknown' as const }
  if (filter === 'attention')
    return sceneNeedsAttention(resolved)
  if (filter === 'failed')
    return resolved.status === 'failed' || resolved.failedUsageCount > 0
  return resolved.status === filter
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSceneRunResult(value: unknown): value is SceneRunResult {
  if (!isRecord(value))
    return false

  return typeof value.runId === 'string'
    && typeof value.sceneId === 'string'
    && ['planned', 'completed', 'failed'].includes(String(value.status))
    && ['dry_run', 'execute'].includes(String(value.mode))
    && Array.isArray(value.requestedCapabilities)
    && Array.isArray(value.selected)
    && Array.isArray(value.candidates)
    && Array.isArray(value.fallbackTrail)
    && Array.isArray(value.trace)
    && Array.isArray(value.usage)
}

/**
 * A value the operator typed that a form cannot send: a field that is not JSON,
 * a number out of range, a duplicated capability, a default model missing from
 * the model list. `code` and `params` name it for a localized message
 * (`dashboard.providerRegistry.validation.<code>`); `message` keeps the English
 * sentence it has always had.
 */
export type ProviderRegistryInputErrorCode =
  | 'json-invalid'
  | 'json-not-object'
  | 'capability-duplicated'
  | 'number-non-negative'
  | 'number-min'
  | 'number-range'
  | 'default-model-missing'

export class ProviderRegistryInputError extends Error {
  constructor(
    readonly code: ProviderRegistryInputErrorCode,
    readonly params: Record<string, string | number>,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderRegistryInputError'
  }
}

function parseJsonText(text: string, field: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    throw new ProviderRegistryInputError('json-invalid', { field }, `${field} is not valid JSON.`)
  }
}

export function normalizeError(err: unknown, fallback: string) {
  const error = isRecord(err) ? err : null
  const data = isRecord(error?.data) ? error.data : null
  const message = data?.message ?? data?.statusMessage ?? error?.message
  return typeof message === 'string' ? message : fallback
}

export function extractFailedSceneRun(err: unknown): SceneRunResult | null {
  const error = isRecord(err) ? err : null
  const data = isRecord(error?.data) ? error.data : null
  const nestedData = isRecord(data?.data) ? data.data : null
  const run = nestedData?.run ?? data?.run
  return isSceneRunResult(run) ? run : null
}

export function formatJson(value: Record<string, unknown> | null) {
  if (!value)
    return '-'
  return JSON.stringify(value)
}

export function formatRunJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function formatEditJson(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value, null, 2) : ''
}

export function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function parseCommaList(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export function parseJsonObjectField(value: string, field: string): Record<string, unknown> | null {
  const trimmed = value.trim()
  if (!trimmed)
    return null
  const parsed = parseJsonText(trimmed, field)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new ProviderRegistryInputError('json-not-object', { field }, `${field} must be a JSON object.`)
  return parsed as Record<string, unknown>
}

function readStringField(value: Record<string, unknown> | null | undefined, key: string): string {
  const item = value?.[key]
  return typeof item === 'string' ? item : ''
}

function readNumberField(value: Record<string, unknown> | null | undefined, key: string): string {
  const item = value?.[key]
  return typeof item === 'number' && Number.isFinite(item) ? String(item) : ''
}

function readStringArrayField(value: Record<string, unknown> | null | undefined, key: string): string[] {
  const item = value?.[key]
  return Array.isArray(item)
    ? item.filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
    : []
}

function omitFields(
  value: Record<string, unknown> | null | undefined,
  keys: string[],
): Record<string, unknown> | null {
  if (!value)
    return null

  const next = { ...value }
  for (const key of keys)
    delete next[key]

  return Object.keys(next).length > 0 ? next : null
}

export function ensureUniqueCapabilities(capabilities: Array<{ capability: string }>) {
  const seen = new Set<string>()
  for (const item of capabilities) {
    if (seen.has(item.capability)) {
      throw new ProviderRegistryInputError(
        'capability-duplicated',
        { capability: item.capability },
        `capability ${item.capability} is duplicated.`,
      )
    }
    seen.add(item.capability)
  }
}

export function createProviderEditPanel(provider: ProviderRegistryRecord): ProviderEditPanelState {
  return {
    expanded: true,
    saving: false,
    name: provider.name,
    displayName: provider.displayName,
    vendor: provider.vendor,
    status: provider.status,
    authType: provider.authType,
    authRef: provider.authRef ?? '',
    ownerScope: provider.ownerScope,
    ownerId: provider.ownerId ?? '',
    description: provider.description ?? '',
    endpoint: provider.endpoint ?? '',
    region: provider.region ?? '',
    adapterKey: readStringField(provider.metadata, 'adapterKey') || readStringField(provider.metadata, 'adapter'),
    modelsText: readStringArrayField(provider.metadata, 'models').join('\n'),
    defaultModel: readStringField(provider.metadata, 'defaultModel'),
    metadataText: formatEditJson(omitFields(provider.metadata, ['adapterKey', 'adapter', 'models', 'defaultModel'])),
    capabilities: provider.capabilities.map(capability => ({
      id: capability.id,
      capability: capability.capability,
      schemaRef: capability.schemaRef ?? '',
      meteringUnit: readStringField(capability.metering, 'unit'),
      maxImageBytes: readNumberField(capability.constraints, 'maxImageBytes'),
      providerModel: readStringField(capability.metadata, 'providerModel'),
      meteringText: formatEditJson(omitFields(capability.metering, ['unit'])),
      constraintsText: formatEditJson(omitFields(capability.constraints, ['maxImageBytes'])),
      metadataText: formatEditJson(omitFields(capability.metadata, ['providerModel'])),
    })),
    removedCapabilityIds: [],
    error: null,
  }
}

function readLimitText(quota: ProviderQuotaRecord | null | undefined, key: string) {
  const value = quota?.limits?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

export function createProviderQuotaPanel(
  provider: ProviderRegistryRecord,
  quota: ProviderQuotaRecord | null | undefined,
): ProviderQuotaPanelState {
  return {
    expanded: true,
    saving: false,
    name: quota?.name ?? `${provider.displayName} quota`,
    enabled: quota?.enabled === false ? 'disabled' : 'enabled',
    windowDays: readLimitText(quota, 'windowDays') || '30',
    maxRequests: readLimitText(quota, 'maxRequests'),
    maxTokens: readLimitText(quota, 'maxTokens'),
    warningThreshold: quota?.warningThreshold == null ? '80' : String(quota.warningThreshold),
    error: null,
  }
}

export function summarizeProviderQuota(quota: ProviderQuotaRecord | null | undefined): ProviderQuotaSummary {
  const configured = Boolean(quota)
  return {
    configured,
    enabled: quota?.enabled ?? false,
    count: configured ? 1 : 0,
    windowDays: readLimitText(quota, 'windowDays') || '30',
    maxRequests: readLimitText(quota, 'maxRequests') || '-',
    maxTokens: readLimitText(quota, 'maxTokens') || '-',
    warningThreshold: quota?.warningThreshold == null ? '-' : String(quota.warningThreshold),
  }
}

export function summarizeProviderQuotaList(quotas: ProviderQuotaRecord[] | null | undefined): ProviderQuotaSummary {
  const items = quotas ?? []
  const primary = items[0] ?? null
  return {
    ...summarizeProviderQuota(primary),
    configured: items.length > 0,
    enabled: items.some(item => item.enabled),
    count: items.length,
  }
}

export function createSceneEditPanel(scene: SceneRegistryRecord): SceneEditPanelState {
  return {
    expanded: true,
    saving: false,
    displayName: scene.displayName,
    owner: scene.owner,
    ownerScope: scene.ownerScope,
    ownerId: scene.ownerId ?? '',
    status: scene.status,
    requiredCapabilitiesText: scene.requiredCapabilities.join(', '),
    strategyMode: scene.strategyMode,
    fallback: scene.fallback,
    meteringPolicyText: formatEditJson(scene.meteringPolicy),
    auditPolicyText: formatEditJson(scene.auditPolicy),
    metadataText: formatEditJson(scene.metadata),
    bindings: scene.bindings.map(binding => ({
      providerId: binding.providerId,
      capability: binding.capability,
      model: binding.model ?? '',
      priority: binding.priority,
      weightText: binding.weight == null ? '' : String(binding.weight),
      status: binding.status,
      constraintsText: formatEditJson(binding.constraints),
      metadataText: formatEditJson(binding.metadata),
    })),
    error: null,
  }
}

export function sceneCapabilities(scene: SceneRegistryRecord) {
  return [...new Set([
    ...scene.requiredCapabilities,
    ...scene.bindings.map(binding => binding.capability),
  ].filter(Boolean))]
}

export function createDefaultSceneInput(scene: SceneRegistryRecord) {
  const capabilities = sceneCapabilities(scene)
  return createDefaultSceneCapabilityInput(capabilities)
}

export function createDefaultSceneCapabilityInput(capabilityOrCapabilities: string | string[]) {
  const capabilities = Array.isArray(capabilityOrCapabilities) ? capabilityOrCapabilities : [capabilityOrCapabilities]
  if (capabilities.includes('chat.completion')) {
    return {
      messages: [
        {
          role: 'user',
          content: 'Reply with one short sentence confirming Provider Registry chat completion is working.',
        },
      ],
    }
  }

  if (capabilities.includes('text.summarize')) {
    return {
      text: 'Provider Registry lets administrators route scenes to provider capabilities, run dry-runs, execute safe samples, and inspect usage evidence before enabling production traffic.',
      style: 'concise',
      maxLength: 160,
    }
  }

  if (capabilities.includes('content.extract')) {
    return {
      text: 'Provider Registry owners should verify credentials, endpoint health, scene bindings, fallback behavior, and usage ledger rows before marking an OpenAI provider ready.',
      tags: ['summary', 'entities', 'actions', 'keywords'],
    }
  }

  if (capabilities.includes('text.translate') && !capabilities.includes('vision.ocr')) {
    return {
      text: 'Hello',
      sourceLang: 'auto',
      targetLang: 'zh',
    }
  }

  if (capabilities.some(capability => capability.startsWith('image.translate') || capability === 'vision.ocr' || capability === 'overlay.render')) {
    return {
      imageBase64: '',
      imageMimeType: 'image/png',
      targetLang: 'zh',
    }
  }

  return {}
}

export function createSceneRunPanel(scene: SceneRegistryRecord): SceneRunPanelState {
  return {
    expanded: false,
    inputText: formatRunJson(createDefaultSceneInput(scene)),
    capability: scene.requiredCapabilities.length > 1 ? '' : scene.requiredCapabilities[0] || scene.bindings[0]?.capability || '',
    providerId: '',
    result: null,
    error: null,
  }
}

export function mergeJsonObjects(
  base: Record<string, unknown> | null,
  patch: Record<string, unknown>,
): Record<string, unknown> | null {
  const next = { ...(base ?? {}) }

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '')
      delete next[key]
    else
      next[key] = value
  }

  return Object.keys(next).length > 0 ? next : null
}

export function parseOptionalNonNegativeNumber(value: string, field: string): number | null {
  const trimmed = value.trim()
  if (!trimmed)
    return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new ProviderRegistryInputError('number-non-negative', { field }, `${field} must be a non-negative number.`)
  return parsed
}

export function parseBoundedNumber(value: string, field: string, min = 0, max?: number): number | undefined {
  const trimmed = value.trim()
  if (!trimmed)
    return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    if (max === undefined)
      throw new ProviderRegistryInputError('number-min', { field, min }, `${field} must be a number greater than or equal to ${min}.`)
    throw new ProviderRegistryInputError('number-range', { field, min, max }, `${field} must be a number between ${min} and ${max}.`)
  }
  return parsed
}

export function parseOptionalJson(value: string, field = 'input'): unknown {
  const trimmed = value.trim()
  return trimmed ? parseJsonText(trimmed, field) : undefined
}
