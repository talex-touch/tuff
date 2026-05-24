export type ProviderVendor = 'tencent-cloud' | 'openai' | 'deepseek' | 'exchange-rate' | 'custom'
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
    ready: boolean
    matchedKey: string | null
    fallbackKey: string | null
    reason: 'adapter-ready' | 'provider-capability-missing' | 'adapter-missing'
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

export type ProviderRegistryTemplateId = 'tencent-translation' | 'openai-compatible-ai' | 'deepseek-ai'

export interface ProviderRegistryTemplate {
  id: ProviderRegistryTemplateId
  vendor: ProviderVendor
  name: string
  displayName: string
  authType: ProviderAuthType
  authRef: string
  endpoint: string
  region: string
  capabilities: CapabilityFormRow[]
  metadata: Record<string, unknown>
}

export interface BindingFormRow {
  providerId: string
  capability: string
  priority: number
}

export interface CapabilityEditRow {
  id?: string
  capability: string
  schemaRef: string
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
  status: ProviderStatus
  authType: ProviderAuthType
  authRef: string
  ownerScope: OwnerScope
  ownerId: string
  description: string
  endpoint: string
  region: string
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

export interface ObservabilityEmptyState {
  tone: 'muted' | 'warning' | 'success'
  titleKey: string
  titleFallback: string
  detailKey: string
  detailFallback: string
  actionKey: string
  actionFallback: string
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

export const providerVendorOptions: ProviderVendor[] = ['tencent-cloud', 'openai', 'deepseek', 'exchange-rate', 'custom']
export const providerStatusOptions: ProviderStatus[] = ['enabled', 'disabled', 'degraded']
export const authTypeOptions: ProviderAuthType[] = ['secret_pair', 'api_key', 'oauth', 'none']
export const ownerScopeOptions: OwnerScope[] = ['system', 'workspace', 'user']
export const sceneOwnerOptions: SceneOwner[] = ['nexus', 'core-app', 'app', 'plugin']
export const strategyOptions: SceneStrategyMode[] = ['priority', 'least_cost', 'lowest_latency', 'balanced', 'manual']
export const fallbackOptions: SceneFallback[] = ['enabled', 'disabled']
export const bindingStatusOptions: BindingStatus[] = ['enabled', 'disabled']
export const providerRegistryTemplates: ProviderRegistryTemplate[] = [
  {
    id: 'tencent-translation',
    vendor: 'tencent-cloud',
    name: 'tencent-cloud-mt-main',
    displayName: 'Tencent Cloud Machine Translation',
    authType: 'secret_pair',
    authRef: 'secure://providers/tencent-cloud-mt-main',
    endpoint: 'https://tmt.tencentcloudapi.com',
    region: 'ap-shanghai',
    capabilities: [
      { capability: 'text.translate', schemaRef: 'nexus://schemas/provider/text-translate.v1', meteringUnit: 'character' },
      { capability: 'image.translate', schemaRef: 'nexus://schemas/provider/image-translate.v1', meteringUnit: 'image' },
      { capability: 'image.translate.e2e', schemaRef: 'nexus://schemas/provider/image-translate-e2e.v1', meteringUnit: 'image' },
    ],
    metadata: {
      source: 'provider-registry',
      template: 'tencent-translation',
    },
  },
  {
    id: 'openai-compatible-ai',
    vendor: 'openai',
    name: 'openai-compatible-ai-main',
    displayName: 'OpenAI Compatible AI',
    authType: 'api_key',
    authRef: 'secure://providers/openai-compatible-ai-main',
    endpoint: 'https://api.openai.com/v1',
    region: 'global',
    capabilities: [
      { capability: 'chat.completion', schemaRef: 'nexus://schemas/provider/chat-completion.v1', meteringUnit: 'token' },
      { capability: 'text.summarize', schemaRef: 'nexus://schemas/provider/text-summarize.v1', meteringUnit: 'token' },
      { capability: 'content.extract', schemaRef: 'nexus://schemas/provider/content-extract.v1', meteringUnit: 'token' },
      { capability: 'vision.ocr', schemaRef: 'nexus://schemas/provider/vision-ocr.v1', meteringUnit: 'token' },
    ],
    metadata: {
      source: 'intelligence',
      routingShape: 'providers-scenes',
      template: 'openai-compatible-ai',
    },
  },
  {
    id: 'deepseek-ai',
    vendor: 'deepseek',
    name: 'deepseek-ai-main',
    displayName: 'DeepSeek AI',
    authType: 'api_key',
    authRef: 'secure://providers/deepseek-ai-main',
    endpoint: 'https://api.deepseek.com/v1',
    region: 'global',
    capabilities: [
      { capability: 'chat.completion', schemaRef: 'nexus://schemas/provider/chat-completion.v1', meteringUnit: 'token' },
      { capability: 'text.summarize', schemaRef: 'nexus://schemas/provider/text-summarize.v1', meteringUnit: 'token' },
      { capability: 'content.extract', schemaRef: 'nexus://schemas/provider/content-extract.v1', meteringUnit: 'token' },
    ],
    metadata: {
      source: 'intelligence',
      routingShape: 'providers-scenes',
      template: 'deepseek-ai',
    },
  },
]
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

function usageLedgerNeedsAttention(entry: ProviderUsageLedgerEntry) {
  return entry.status === 'failed'
    || entry.status === 'planned'
    || entry.estimated
}

export function filterUsageLedgerEntries(
  entries: ProviderUsageLedgerEntry[],
  filter: UsageLedgerFilter,
) {
  if (filter === 'all')
    return entries

  return entries.filter((entry) => {
    if (filter === 'attention')
      return usageLedgerNeedsAttention(entry)

    if (filter === 'estimated')
      return entry.estimated

    return entry.status === filter
  })
}

export function filterHealthCheckEntries(
  entries: ProviderHealthCheckEntry[],
  filter: HealthCheckFilter,
) {
  if (filter === 'all')
    return entries

  return entries.filter((entry) => {
    if (filter === 'attention')
      return entry.status !== 'healthy'

    return entry.status === filter
  })
}

export function resolveUsageLedgerEmptyState(
  entries: ProviderUsageLedgerEntry[],
  filter: UsageLedgerFilter,
): ObservabilityEmptyState | null {
  if (entries.length === 0) {
    return {
      tone: 'muted',
      titleKey: 'dashboard.providerRegistry.usage.empty',
      titleFallback: 'No scene run usage recorded yet.',
      detailKey: 'dashboard.providerRegistry.usage.emptyDetail',
      detailFallback: 'Run a scene dry-run or execute flow to seed usage, trace, and fallback evidence.',
      actionKey: 'dashboard.providerRegistry.usage.emptyAction',
      actionFallback: 'Run scene',
    }
  }

  if (filterUsageLedgerEntries(entries, filter).length > 0)
    return null

  if (filter === 'attention') {
    return {
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.usage.emptyAttention',
      titleFallback: 'No usage rows need attention',
      detailKey: 'dashboard.providerRegistry.usage.emptyAttentionDetail',
      detailFallback: 'No failed, planned, or estimated usage rows match this view.',
      actionKey: 'dashboard.providerRegistry.usage.clearFilter',
      actionFallback: 'Show all usage',
    }
  }

  return {
    tone: filter === 'failed' || filter === 'estimated' ? 'success' : 'muted',
    titleKey: 'dashboard.providerRegistry.usage.emptyFiltered',
    titleFallback: 'No usage rows match the selected filter.',
    detailKey: 'dashboard.providerRegistry.usage.emptyFilteredDetail',
    detailFallback: 'Switch filters or run a scene to refresh usage ledger evidence.',
    actionKey: 'dashboard.providerRegistry.usage.clearFilter',
    actionFallback: 'Show all usage',
  }
}

export function resolveHealthCheckEmptyState(
  entries: ProviderHealthCheckEntry[],
  filter: HealthCheckFilter,
): ObservabilityEmptyState | null {
  if (entries.length === 0) {
    return {
      tone: 'muted',
      titleKey: 'dashboard.providerRegistry.health.empty',
      titleFallback: 'No provider health checks recorded yet.',
      detailKey: 'dashboard.providerRegistry.health.emptyDetail',
      detailFallback: 'Run a provider check to capture latency, request id, degraded reason, and failure diagnostics.',
      actionKey: 'dashboard.providerRegistry.health.emptyAction',
      actionFallback: 'Run provider check',
    }
  }

  if (filterHealthCheckEntries(entries, filter).length > 0)
    return null

  if (filter === 'attention') {
    return {
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.health.emptyAttention',
      titleFallback: 'No health checks need attention',
      detailKey: 'dashboard.providerRegistry.health.emptyAttentionDetail',
      detailFallback: 'No degraded or unhealthy health checks match this view.',
      actionKey: 'dashboard.providerRegistry.health.clearFilter',
      actionFallback: 'Show all health checks',
    }
  }

  return {
    tone: filter === 'degraded' || filter === 'unhealthy' ? 'success' : 'muted',
    titleKey: 'dashboard.providerRegistry.health.emptyFiltered',
    titleFallback: 'No health checks match the selected filter.',
    detailKey: 'dashboard.providerRegistry.health.emptyFilteredDetail',
    detailFallback: 'Switch filters or run provider checks to refresh health evidence.',
    actionKey: 'dashboard.providerRegistry.health.clearFilter',
    actionFallback: 'Show all health checks',
  }
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

export function filterProvidersByObservability(
  providers: ProviderRegistryRecord[],
  observabilityById: Record<string, ProviderObservabilitySummary>,
  filter: ProviderObservabilityFilter,
) {
  if (filter === 'all')
    return providers

  return providers.filter((provider) => {
    const summary = observabilityById[provider.id] ?? {
      latestHealth: null,
      latestUsage: null,
      status: 'unknown',
    }

    if (filter === 'attention')
      return providerNeedsAttention(summary)

    return summary.status === filter
  })
}

export function filterScenesByObservability(
  scenes: SceneRegistryRecord[],
  observabilityById: Record<string, SceneObservabilitySummary>,
  filter: SceneObservabilityFilter,
) {
  if (filter === 'all')
    return scenes

  return scenes.filter((scene) => {
    const summary = observabilityById[scene.id] ?? {
      latestUsage: null,
      failedUsageCount: 0,
      status: 'unknown',
    }

    if (filter === 'attention')
      return sceneNeedsAttention(summary)

    if (filter === 'failed')
      return summary.status === 'failed' || summary.failedUsageCount > 0

    return summary.status === filter
  })
}

export function resolveProviderObservabilityEmptyState(
  providers: ProviderRegistryRecord[],
  observabilityById: Record<string, ProviderObservabilitySummary>,
  filter: ProviderObservabilityFilter,
): ObservabilityEmptyState | null {
  if (providers.length === 0) {
    return {
      tone: 'muted',
      titleKey: 'dashboard.providerRegistry.providers.empty',
      titleFallback: 'No providers registered yet.',
      detailKey: 'dashboard.providerRegistry.providers.emptyDetail',
      detailFallback: 'Create a provider before checking health, usage, or scene bindings.',
      actionKey: 'dashboard.providerRegistry.providers.emptyAction',
      actionFallback: 'Create provider',
    }
  }

  if (filterProvidersByObservability(providers, observabilityById, filter).length > 0)
    return null

  if (filter === 'attention') {
    return {
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.providers.emptyAttention',
      titleFallback: 'No providers need attention',
      detailKey: 'dashboard.providerRegistry.providers.emptyAttentionDetail',
      detailFallback: 'No degraded, unhealthy, or failed-usage providers match this view.',
      actionKey: 'dashboard.providerRegistry.providers.clearFilter',
      actionFallback: 'Show all providers',
    }
  }

  if (filter === 'unknown') {
    return {
      tone: 'warning',
      titleKey: 'dashboard.providerRegistry.providers.emptyUnknown',
      titleFallback: 'No providers without evidence',
      detailKey: 'dashboard.providerRegistry.providers.emptyUnknownDetail',
      detailFallback: 'Every provider in this set already has health or usage evidence.',
      actionKey: 'dashboard.providerRegistry.providers.clearFilter',
      actionFallback: 'Show all providers',
    }
  }

  return {
    tone: 'muted',
    titleKey: 'dashboard.providerRegistry.providers.emptyFiltered',
    titleFallback: 'No providers match the selected filter.',
    detailKey: 'dashboard.providerRegistry.providers.emptyFilteredDetail',
    detailFallback: 'Switch filters or run provider checks to refresh observability evidence.',
    actionKey: 'dashboard.providerRegistry.providers.clearFilter',
    actionFallback: 'Show all providers',
  }
}

export function resolveSceneObservabilityEmptyState(
  scenes: SceneRegistryRecord[],
  observabilityById: Record<string, SceneObservabilitySummary>,
  filter: SceneObservabilityFilter,
): ObservabilityEmptyState | null {
  if (scenes.length === 0) {
    return {
      tone: 'muted',
      titleKey: 'dashboard.providerRegistry.scenes.empty',
      titleFallback: 'No scenes configured yet.',
      detailKey: 'dashboard.providerRegistry.scenes.emptyDetail',
      detailFallback: 'Create a scene and bind provider capabilities before collecting run evidence.',
      actionKey: 'dashboard.providerRegistry.scenes.emptyAction',
      actionFallback: 'Create scene',
    }
  }

  if (filterScenesByObservability(scenes, observabilityById, filter).length > 0)
    return null

  if (filter === 'attention') {
    return {
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.scenes.emptyAttention',
      titleFallback: 'No scene runs need attention',
      detailKey: 'dashboard.providerRegistry.scenes.emptyAttentionDetail',
      detailFallback: 'No failed, unknown, or failed-history scenes match this view.',
      actionKey: 'dashboard.providerRegistry.scenes.clearFilter',
      actionFallback: 'Show all scenes',
    }
  }

  if (filter === 'failed') {
    return {
      tone: 'success',
      titleKey: 'dashboard.providerRegistry.scenes.emptyFailed',
      titleFallback: 'No failed scene evidence',
      detailKey: 'dashboard.providerRegistry.scenes.emptyFailedDetail',
      detailFallback: 'No latest failures or failed-history scenes match this view.',
      actionKey: 'dashboard.providerRegistry.scenes.clearFilter',
      actionFallback: 'Show all scenes',
    }
  }

  return {
    tone: 'muted',
    titleKey: 'dashboard.providerRegistry.scenes.emptyFiltered',
    titleFallback: 'No scenes match the selected filter.',
    detailKey: 'dashboard.providerRegistry.scenes.emptyFilteredDetail',
    detailFallback: 'Switch filters or run a scene dry-run to refresh usage evidence.',
    actionKey: 'dashboard.providerRegistry.scenes.clearFilter',
    actionFallback: 'Show all scenes',
  }
}

export function normalizeError(err: any, fallback: string) {
  return err?.data?.message || err?.data?.statusMessage || err?.message || fallback
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
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`${field} must be a JSON object.`)
  return parsed as Record<string, unknown>
}

export function ensureUniqueCapabilities(capabilities: Array<{ capability: string }>) {
  const seen = new Set<string>()
  for (const item of capabilities) {
    if (seen.has(item.capability)) {
      throw new Error(`capability ${item.capability} is duplicated.`)
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
    metadataText: formatEditJson(provider.metadata),
    capabilities: provider.capabilities.map(capability => ({
      id: capability.id,
      capability: capability.capability,
      schemaRef: capability.schemaRef ?? '',
      meteringText: formatEditJson(capability.metering),
      constraintsText: formatEditJson(capability.constraints),
      metadataText: formatEditJson(capability.metadata),
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
