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

export function statusTone(status: string) {
  if (status === 'enabled' || status === 'success' || status === 'completed')
    return 'success'
  if (status === 'degraded' || status === 'skipped' || status === 'planned')
    return 'warning'
  if (status === 'failed')
    return 'danger'
  return 'muted'
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
