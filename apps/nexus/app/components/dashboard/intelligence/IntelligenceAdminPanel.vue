<script setup lang="ts">
import { networkClient } from '@talex-touch/utils/network'
import { TuffInput, TuffSelect, TuffSelectItem, TuffSwitch, TxButton, TxPagination, TxPopperDialog, TxSkeleton, TxSpinner, TxStatusBadge, TxTabItem, TxTabs } from '@talex-touch/tuffex'
import { defineComponent, h, inject } from 'vue'
import { $fetch as rawFetch } from 'ofetch'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import IntelligenceAgentWorkspace from '~/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue'
import { resolveMigrationReadiness } from '~/utils/intelligence-provider-migration'
import type { ProviderRegistryRecord, SceneRegistryRecord, SceneStrategyMode } from '~/utils/provider-registry-admin'

const { t } = useI18n()
const { user } = useAuthUser()

// Admin check - redirect if not admin
const isAdmin = computed(() => {
  return user.value?.role === 'admin'
})

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

// ── Provider types ──
const PROVIDER_TYPES = ['openai', 'anthropic', 'deepseek', 'siliconflow', 'local', 'custom'] as const

interface Provider {
  id: string
  type: string
  name: string
  enabled: boolean
  hasApiKey: boolean
  baseUrl: string | null
  models: string[]
  defaultModel: string | null
  instructions: string | null
  timeout: number
  priority: number
  capabilities: string[] | null
  metadata: Record<string, any> | null
  createdAt: string
  updatedAt: string
}

interface MigrationItem {
  providerId: string
  providerName: string
  action: string
  registryProviderId: string | null
  migratedApiKey: boolean
  reason: string | null
}

interface MigrationResult {
  dryRun: boolean
  total: number
  migrated: number
  skipped: number
  failed: number
  readyForRegistryPrimaryReads: boolean
  blockers: string[]
  items: MigrationItem[]
}

interface Settings {
  defaultStrategy: string
  enableAudit: boolean
  enableCache: boolean
  cacheExpiration: number
}

interface AuditLog {
  id: string
  providerId: string
  providerType: string
  providerName: string | null
  model: string
  endpoint: string | null
  status: number | null
  latency: number | null
  success: boolean
  errorMessage: string | null
  traceId: string | null
  metadata: Record<string, any> | null
  createdAt: string
}

interface OverviewStatItem {
  label: string
  count: number
  tokens: number
}

interface OverviewSummary {
  totalRequests: number
  successRate: number
  avgLatency: number
  totalTokens: number
  sampleSize: number
}

interface OverviewData {
  summary: OverviewSummary
  models: OverviewStatItem[]
  providers: OverviewStatItem[]
  ips: OverviewStatItem[]
  countries: OverviewStatItem[]
}

interface UsageResult {
  userId: string
  totalRequests: number
  totalTokens: number
  successRate: number
  sampleSize: number
  lastSeenAt: string | null
  models: OverviewStatItem[]
}

interface IpBan {
  id: string
  ip: string
  reason: string | null
  enabled: boolean
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface CreditUsageItem {
  userId: string
  email: string | null
  name: string | null
  role: string | null
  status: string | null
  quota: number
  used: number
  month: string
}

interface CreditLedgerItem {
  id: string
  teamId: string
  teamType: string | null
  userId: string | null
  userEmail: string | null
  userName: string | null
  delta: number
  reason: string
  createdAt: string
  metadata: Record<string, any> | null
}

// ── State ──
const activeTab = ref('overview')
const providers = ref<Provider[]>([])
const registryProviders = ref<ProviderRegistryRecord[]>([])
const scenes = ref<SceneRegistryRecord[]>([])
const settings = ref<Settings>({
  defaultStrategy: 'priority',
  enableAudit: false,
  enableCache: false,
  cacheExpiration: 3600,
})
const loading = ref(true)
const error = ref<string | null>(null)
const scenesLoading = ref(false)
const scenesError = ref<string | null>(null)
const sceneSaving = ref(false)
const migrationLoading = ref(false)
const migrationError = ref<string | null>(null)
const migrationResult = ref<MigrationResult | null>(null)
const migrationReadiness = computed(() => {
  if (!migrationResult.value)
    return null

  return resolveMigrationReadiness(migrationResult.value)
})
const settingsSaving = ref(false)
const auditLogs = ref<AuditLog[]>([])
const auditLoading = ref(false)
const auditError = ref<string | null>(null)
const auditPage = ref(1)
const auditPageSize = ref(20)
const auditTotal = ref(0)
const auditUserId = ref('')
const overviewLoading = ref(false)
const overviewError = ref<string | null>(null)
const overviewData = ref<OverviewData | null>(null)
const userUsageQuery = ref('')
const userUsageLoading = ref(false)
const userUsageError = ref<string | null>(null)
const userUsageResult = ref<UsageResult | null>(null)
const ipBans = ref<IpBan[]>([])
const ipBanLoading = ref(false)
const ipBanError = ref<string | null>(null)
const ipBanFeatureAvailable = ref(true)
const ipBanStepUpToken = ref('')
const ipBanForm = reactive({
  ip: '',
  reason: '',
})
const creditsLoaded = ref(false)
const usageItems = ref<CreditUsageItem[]>([])
const usageLoading = ref(false)
const usageError = ref<string | null>(null)
const usageSummary = ref({ totalUsed: 0, totalQuota: 0, month: '' })
const usagePagination = ref<Pagination>({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
})
const usageQuery = ref('')

const ledgerItems = ref<CreditLedgerItem[]>([])
const ledgerLoading = ref(false)
const ledgerError = ref<string | null>(null)
const ledgerPagination = ref<Pagination>({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
})
const ledgerQuery = ref('')

type SceneBindingStatus = 'enabled' | 'disabled'
type SceneFallbackMode = 'enabled' | 'disabled'

interface SceneBindingForm {
  providerId: string
  model: string
  priority: number
  status: SceneBindingStatus
}

interface SceneFormState {
  id: string
  displayName: string
  requiredCapability: string
  strategyMode: SceneStrategyMode
  fallback: SceneFallbackMode
  status: SceneBindingStatus
  bindings: SceneBindingForm[]
}

const AI_SCENE_CAPABILITIES = ['chat.completion', 'text.summarize', 'content.extract', 'vision.ocr'] as const
const selectedSceneId = ref('')
const sceneForm = reactive<SceneFormState>({
  id: 'nexus.intelligence.chat',
  displayName: 'Nexus Intelligence Chat',
  requiredCapability: 'chat.completion',
  strategyMode: 'priority',
  fallback: 'enabled',
  status: 'enabled',
  bindings: [],
})

function ipBanAuthHeaders() {
  const token = ipBanStepUpToken.value.trim()
  if (!token)
    return undefined
  return {
    'X-Login-Token': token,
  }
}

function isFeatureNotFoundError(error: any): boolean {
  const statusCode = error?.data?.statusCode
  const message = String(error?.data?.statusMessage || error?.data?.message || error?.message || '').toLowerCase()
  return statusCode === 404 && message.includes('feature not found')
}

// ── Fetch data ──
async function fetchProviders() {
  loading.value = true
  error.value = null
  try {
    const providerEndpoint: string = '/api/dashboard/intelligence/providers'
    const data = await rawFetch<{ providers: Provider[] }>(providerEndpoint)
    providers.value = data.providers
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to load providers'
  }
  finally {
    loading.value = false
  }
}

function readRegistryIntelligenceProviderId(provider: ProviderRegistryRecord): string | null {
  const id = provider.metadata?.intelligenceProviderId
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function isIntelligenceRegistryProvider(provider: ProviderRegistryRecord): boolean {
  return provider.metadata?.source === 'intelligence' && Boolean(readRegistryIntelligenceProviderId(provider))
}

function registryProviderForIntelligenceProvider(providerId: string): ProviderRegistryRecord | null {
  return registryProviders.value.find(provider => readRegistryIntelligenceProviderId(provider) === providerId) ?? null
}

function resolveRegistryProviderId(providerId: string): string | null {
  const directRegistryProvider = registryProviders.value.find(provider => provider.id === providerId)
  if (directRegistryProvider)
    return directRegistryProvider.id
  return registryProviderForIntelligenceProvider(providerId)?.id ?? null
}

function resolveIntelligenceProviderId(sceneProviderId: string): string {
  const registryProvider = registryProviders.value.find(provider => provider.id === sceneProviderId)
  return registryProvider ? readRegistryIntelligenceProviderId(registryProvider) ?? sceneProviderId : sceneProviderId
}

function getProviderById(providerId: string): Provider | null {
  return providers.value.find(provider => provider.id === providerId) ?? null
}

function getProviderDisplayName(providerId: string): string {
  return getProviderById(providerId)?.name
    ?? registryProviders.value.find(provider => provider.id === providerId)?.displayName
    ?? providerId
}

function readSceneBindingModel(binding: { metadata: Record<string, unknown> | null }): string {
  const metadata = binding.metadata ?? {}
  const model = metadata.model ?? metadata.aiModel ?? metadata.defaultModel
  return typeof model === 'string' ? model : ''
}

function isIntelligenceScene(scene: SceneRegistryRecord): boolean {
  return scene.metadata?.source === 'intelligence'
    && scene.metadata?.routingShape === 'providers-scenes'
}

function registryProviderSupportsCapability(provider: ProviderRegistryRecord, capability: string): boolean {
  return provider.capabilities.some(item => item.capability === capability)
}

const aiRegistryProviders = computed(() => registryProviders.value.filter(isIntelligenceRegistryProvider))

const providerSceneOptions = computed(() => providers.value.map(provider => {
  const registryProvider = registryProviderForIntelligenceProvider(provider.id)
  const registryMissing = !registryProvider
  const capabilityMissing = Boolean(
    registryProvider
    && !registryProviderSupportsCapability(registryProvider, sceneForm.requiredCapability),
  )
  return {
    value: provider.id,
    label: registryMissing
      ? `${provider.name} · ${t('dashboard.sections.intelligence.scenes.registryMissing', '需先迁移')}`
      : capabilityMissing
        ? `${provider.name} · ${t('dashboard.sections.intelligence.scenes.capabilityMissing', '缺少能力')}`
        : `${provider.name} · ${providerTypeLabel(provider.type)}`,
    disabled: registryMissing || capabilityMissing,
  }
}))

const availableSceneProviderIds = computed(() =>
  providerSceneOptions.value
    .filter(option => !option.disabled)
    .map(option => option.value),
)

const selectedScene = computed(() =>
  scenes.value.find(scene => scene.id === selectedSceneId.value) ?? null,
)

const sceneBindingCount = computed(() =>
  scenes.value.reduce((total, scene) => total + scene.bindings.length, 0),
)

function createSceneBindingForm(providerId = availableSceneProviderIds.value[0] ?? ''): SceneBindingForm {
  const provider = getProviderById(providerId)
  return {
    providerId,
    model: provider?.defaultModel || provider?.models[0] || '',
    priority: 50,
    status: 'enabled',
  }
}

function resetSceneForm() {
  sceneForm.id = 'nexus.intelligence.chat'
  sceneForm.displayName = 'Nexus Intelligence Chat'
  sceneForm.requiredCapability = 'chat.completion'
  sceneForm.strategyMode = 'priority'
  sceneForm.fallback = 'enabled'
  sceneForm.status = 'enabled'
  sceneForm.bindings = availableSceneProviderIds.value.length ? [createSceneBindingForm()] : []
}

function hydrateSceneForm(scene: SceneRegistryRecord) {
  sceneForm.id = scene.id
  sceneForm.displayName = scene.displayName
  sceneForm.requiredCapability = scene.requiredCapabilities[0] || 'chat.completion'
  sceneForm.strategyMode = scene.strategyMode
  sceneForm.fallback = scene.fallback
  sceneForm.status = scene.status
  sceneForm.bindings = scene.bindings.length
    ? scene.bindings.map(binding => ({
        providerId: resolveIntelligenceProviderId(binding.providerId),
        model: readSceneBindingModel(binding),
        priority: binding.priority,
        status: binding.status,
      }))
    : [createSceneBindingForm()]
}

function createSceneDraft() {
  selectedSceneId.value = ''
  resetSceneForm()
}

function selectScene(scene: SceneRegistryRecord) {
  selectedSceneId.value = scene.id
  hydrateSceneForm(scene)
}

function hydrateSelectedScene() {
  if (!scenes.value.length) {
    selectedSceneId.value = ''
    resetSceneForm()
    return
  }
  const firstScene = scenes.value[0]
  if (!firstScene) {
    selectedSceneId.value = ''
    resetSceneForm()
    return
  }
  const current = scenes.value.find(scene => scene.id === selectedSceneId.value) ?? firstScene
  selectedSceneId.value = current.id
  hydrateSceneForm(current)
}

async function fetchSceneRegistry() {
  scenesLoading.value = true
  scenesError.value = null
  try {
    const [registryProviderResult, sceneResult] = await Promise.all([
      rawFetch<{ providers: ProviderRegistryRecord[] }>('/api/dashboard/provider-registry/providers', {
        query: { ownerScope: 'user' },
      }),
      rawFetch<{ scenes: SceneRegistryRecord[] }>('/api/dashboard/provider-registry/scenes'),
    ])
    registryProviders.value = registryProviderResult.providers ?? []
    scenes.value = (sceneResult.scenes ?? [])
      .filter(isIntelligenceScene)
      .sort((a, b) => a.id.localeCompare(b.id))
    hydrateSelectedScene()
  }
  catch (e: any) {
    scenesError.value = e.data?.message || e.data?.statusMessage || 'Failed to load scene registry'
  }
  finally {
    scenesLoading.value = false
  }
}

function addSceneBinding() {
  sceneForm.bindings.push(createSceneBindingForm())
}

function removeSceneBinding(index: number) {
  sceneForm.bindings.splice(index, 1)
}

function providerModelOptions(providerId: string): string[] {
  const provider = getProviderById(providerId)
  if (!provider)
    return []
  const models = new Set<string>()
  if (provider.defaultModel?.trim())
    models.add(provider.defaultModel.trim())
  for (const model of provider.models || []) {
    if (model.trim())
      models.add(model.trim())
  }
  return [...models]
}

function onSceneBindingProviderChange(binding: SceneBindingForm) {
  const models = providerModelOptions(binding.providerId)
  binding.model = getProviderById(binding.providerId)?.defaultModel || models[0] || ''
}

function ensureSceneBindingsSupportCapability() {
  const fallbackProviderId = availableSceneProviderIds.value[0] ?? ''
  for (const binding of sceneForm.bindings) {
    if (!binding.providerId)
      continue
    if (availableSceneProviderIds.value.includes(binding.providerId))
      continue
    binding.providerId = fallbackProviderId
    onSceneBindingProviderChange(binding)
  }
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'muted' {
  if (['enabled', 'success', 'completed', 'planned', 'healthy'].includes(status))
    return 'success'
  if (['disabled', 'muted'].includes(status))
    return 'muted'
  if (['degraded', 'warning'].includes(status))
    return 'warning'
  if (['failed', 'unhealthy', 'danger'].includes(status))
    return 'danger'
  return 'info'
}

function buildSceneBindings() {
  const capability = sceneForm.requiredCapability.trim() || 'chat.completion'
  const seen = new Set<string>()
  return sceneForm.bindings
    .filter(binding => binding.providerId)
    .map((binding, index) => {
      const registryProviderId = resolveRegistryProviderId(binding.providerId)
      if (!registryProviderId) {
        throw new Error(t('dashboard.sections.intelligence.scenes.errors.registryMissing', {
          name: getProviderDisplayName(binding.providerId),
        }, `Provider ${getProviderDisplayName(binding.providerId)} has no Provider Registry mirror.`))
      }
      const registryProvider = registryProviders.value.find(provider => provider.id === registryProviderId)
      if (!registryProvider || !registryProviderSupportsCapability(registryProvider, capability)) {
        throw new Error(t('dashboard.sections.intelligence.scenes.errors.capabilityMissing', {
          name: getProviderDisplayName(binding.providerId),
          capability,
        }, `Provider ${getProviderDisplayName(binding.providerId)} does not support ${capability}.`))
      }
      if (seen.has(registryProviderId)) {
        throw new Error(t('dashboard.sections.intelligence.scenes.errors.duplicateProvider', {
          name: getProviderDisplayName(binding.providerId),
        }, `Provider ${getProviderDisplayName(binding.providerId)} is already bound to this scene.`))
      }
      seen.add(registryProviderId)

      const existingBinding = selectedScene.value?.bindings.find(item =>
        resolveIntelligenceProviderId(item.providerId) === binding.providerId
        && item.capability === capability,
      )
      return {
        providerId: registryProviderId,
        capability,
        priority: Number(binding.priority) || 100,
        status: binding.status,
        constraints: existingBinding?.constraints ?? undefined,
        metadata: {
          ...(existingBinding?.metadata ?? {}),
          source: 'intelligence',
          intelligenceProviderId: binding.providerId,
          model: binding.model.trim() || null,
          order: index,
        },
      }
    })
}

async function saveSceneConfig() {
  const id = sceneForm.id.trim()
  const displayName = sceneForm.displayName.trim()
  if (!id || !displayName)
    return

  sceneSaving.value = true
  scenesError.value = null
  try {
    const existing = scenes.value.find(scene => scene.id === id)
    const body = {
      displayName,
      owner: 'nexus',
      ownerScope: 'user',
      status: sceneForm.status,
      requiredCapabilities: [sceneForm.requiredCapability.trim() || 'chat.completion'],
      strategyMode: sceneForm.strategyMode,
      fallback: sceneForm.fallback,
      auditPolicy: existing?.auditPolicy ?? {
        persistInput: false,
        persistOutput: false,
      },
      metadata: {
        ...(existing?.metadata ?? {}),
        source: 'intelligence',
        routingShape: 'providers-scenes',
      },
      bindings: buildSceneBindings(),
    }

    if (existing) {
      await rawFetch(`/api/dashboard/provider-registry/scenes/${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      await rawFetch('/api/dashboard/provider-registry/scenes', {
        method: 'POST',
        body: {
          id,
          ...body,
        },
      })
    }

    selectedSceneId.value = id
    await fetchSceneRegistry()
  }
  catch (e: any) {
    scenesError.value = e.data?.message || e.data?.statusMessage || e.message || 'Failed to save scene'
  }
  finally {
    sceneSaving.value = false
  }
}

async function runProviderRegistryMigration(dryRun: boolean) {
  migrationLoading.value = true
  migrationError.value = null
  try {
    const result = await rawFetch<{ migration: MigrationResult }>('/api/dashboard/intelligence/providers/migrate', {
      method: 'POST',
      body: { dryRun },
    })
    migrationResult.value = result.migration
    if (!dryRun) {
      await fetchProviders()
      await fetchSceneRegistry()
    }
  }
  catch (e: any) {
    migrationError.value = e.data?.message || e.data?.statusMessage || 'Failed to migrate providers'
  }
  finally {
    migrationLoading.value = false
  }
}

async function fetchSettings() {
  try {
    const data = await rawFetch<{ settings: Settings }>('/api/dashboard/intelligence/settings')
    if (data.settings)
      settings.value = { ...settings.value, ...data.settings }
  }
  catch {}
}

async function fetchAudits() {
  auditLoading.value = true
  auditError.value = null
  try {
    const data = await rawFetch<{ audits: AuditLog[]; total: number }>('/api/dashboard/intelligence/audits', {
      query: {
        limit: auditPageSize.value,
        page: auditPage.value,
        userId: auditUserId.value.trim() || undefined,
      },
    })
    auditLogs.value = data.audits || []
    auditTotal.value = data.total || 0
  }
  catch (e: any) {
    auditError.value = e.data?.message || 'Failed to load audit logs'
  }
  finally {
    auditLoading.value = false
  }
}

function applyAuditFilter() {
  auditPage.value = 1
  fetchAudits()
}

async function fetchOverview() {
  overviewLoading.value = true
  overviewError.value = null
  try {
    const data = await rawFetch<OverviewData>('/api/dashboard/intelligence/overview')
    overviewData.value = data
  }
  catch (e: any) {
    overviewError.value = e.data?.message || 'Failed to load overview'
  }
  finally {
    overviewLoading.value = false
  }
}

async function fetchUserUsage() {
  const userId = userUsageQuery.value.trim()
  if (!userId)
    return
  userUsageLoading.value = true
  userUsageError.value = null
  try {
    const data = await rawFetch<{ ok: boolean; result?: UsageResult; error?: string }>('/api/dashboard/intelligence/usage', {
      query: { userId },
    })
    if (!data.ok)
      throw new Error(data.error || 'Failed to load usage')
    userUsageResult.value = data.result || null
  }
  catch (e: any) {
    userUsageError.value = e.data?.message || e.message || 'Failed to load usage'
  }
  finally {
    userUsageLoading.value = false
  }
}

async function fetchIpBans() {
  if (!ipBanFeatureAvailable.value)
    return
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    const data = await rawFetch<{ bans: IpBan[] }>('/api/dashboard/intelligence/ip-bans', { query: { limit: 100 } })
    ipBans.value = data.bans || []
  }
  catch (e: any) {
    if (isFeatureNotFoundError(e)) {
      ipBanFeatureAvailable.value = false
      ipBans.value = []
      ipBanError.value = null
      return
    }
    ipBanError.value = e.data?.message || 'Failed to load IP bans'
  }
  finally {
    ipBanLoading.value = false
  }
}

async function addIpBan() {
  if (!ipBanFeatureAvailable.value)
    return
  const ip = ipBanForm.ip.trim()
  if (!ip)
    return
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    await rawFetch('/api/dashboard/intelligence/ip-bans', {
      method: 'POST',
      headers: ipBanAuthHeaders(),
      body: {
        ip,
        reason: ipBanForm.reason.trim() || null,
      },
    })
    ipBanForm.ip = ''
    ipBanForm.reason = ''
    await fetchIpBans()
  }
  catch (e: any) {
    if (isFeatureNotFoundError(e)) {
      ipBanFeatureAvailable.value = false
      ipBans.value = []
      ipBanError.value = null
      return
    }
    ipBanError.value = e.data?.message || 'Failed to add IP ban'
  }
  finally {
    ipBanLoading.value = false
  }
}

async function toggleIpBan(ban: IpBan) {
  if (!ipBanFeatureAvailable.value)
    return
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    await rawFetch(`/api/dashboard/intelligence/ip-bans/${ban.id}`, {
      method: 'PATCH',
      headers: ipBanAuthHeaders(),
      body: { enabled: !ban.enabled },
    })
    await fetchIpBans()
  }
  catch (e: any) {
    if (isFeatureNotFoundError(e)) {
      ipBanFeatureAvailable.value = false
      ipBans.value = []
      ipBanError.value = null
      return
    }
    ipBanError.value = e.data?.message || 'Failed to update IP ban'
  }
  finally {
    ipBanLoading.value = false
  }
}

async function removeIpBan(ban: IpBan) {
  if (!ipBanFeatureAvailable.value)
    return
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    await rawFetch(`/api/dashboard/intelligence/ip-bans/${ban.id}`, {
      method: 'DELETE',
      headers: ipBanAuthHeaders(),
    })
    await fetchIpBans()
  }
  catch (e: any) {
    if (isFeatureNotFoundError(e)) {
      ipBanFeatureAvailable.value = false
      ipBans.value = []
      ipBanError.value = null
      return
    }
    ipBanError.value = e.data?.message || 'Failed to remove IP ban'
  }
  finally {
    ipBanLoading.value = false
  }
}

async function fetchUsage(options: { resetPage?: boolean } = {}) {
  if (options.resetPage)
    usagePagination.value.page = 1

  usageLoading.value = true
  usageError.value = null
  try {
    const result = await rawFetch<{
      month: string
      totalUsed: number
      totalQuota: number
      users: CreditUsageItem[]
      pagination: Pagination
    }>('/api/admin/credits/usage', {
      query: {
        page: usagePagination.value.page,
        limit: usagePagination.value.limit,
        q: usageQuery.value.trim() || undefined,
      },
    })
    usageItems.value = result.users || []
    usageSummary.value = {
      totalUsed: result.totalUsed ?? 0,
      totalQuota: result.totalQuota ?? 0,
      month: result.month || '',
    }
    usagePagination.value = result.pagination
  }
  catch (err: any) {
    usageError.value = err?.data?.message || err?.message || t('dashboard.adminCredits.errors.loadUsage', 'Failed to load credit usage.')
  }
  finally {
    usageLoading.value = false
  }
}

async function fetchLedger(options: { resetPage?: boolean } = {}) {
  if (options.resetPage)
    ledgerPagination.value.page = 1

  ledgerLoading.value = true
  ledgerError.value = null
  try {
    const result = await rawFetch<{
      entries: CreditLedgerItem[]
      pagination: Pagination
    }>('/api/admin/credits/ledger', {
      query: {
        page: ledgerPagination.value.page,
        limit: ledgerPagination.value.limit,
        q: ledgerQuery.value.trim() || undefined,
      },
    })
    ledgerItems.value = result.entries || []
    ledgerPagination.value = result.pagination
  }
  catch (err: any) {
    ledgerError.value = err?.data?.message || err?.message || t('dashboard.adminCredits.errors.loadLedger', 'Failed to load credit ledger.')
  }
  finally {
    ledgerLoading.value = false
  }
}

function applyUsageFilter() {
  fetchUsage({ resetPage: true })
}

function applyLedgerFilter() {
  fetchLedger({ resetPage: true })
}

function ensureCreditsLoaded() {
  if (creditsLoaded.value)
    return
  creditsLoaded.value = true
  fetchUsage()
  fetchLedger()
}

onMounted(() => {
  fetchProviders()
  fetchSceneRegistry()
  fetchSettings()
  fetchAudits()
  fetchOverview()
  fetchIpBans()
})

watch([auditPage, auditPageSize], () => {
  if (activeTab.value === 'audits')
    fetchAudits()
})

watch(() => usagePagination.value.page, () => {
  if (activeTab.value === 'credits')
    fetchUsage()
})

watch(() => ledgerPagination.value.page, () => {
  if (activeTab.value === 'credits')
    fetchLedger()
})

watch(activeTab, (value) => {
  if (value === 'overview' && !overviewLoading.value && !overviewData.value)
    fetchOverview()
  if (value === 'audits' && !auditLoading.value)
    fetchAudits()
  if (value === 'credits')
    ensureCreditsLoaded()
})

// ── Create / Edit overlay ──
const showFormOverlay = ref(false)
const formOverlaySource = ref<HTMLElement | null>(null)
const formMode = ref<'create' | 'edit'>('create')
const formSaving = ref(false)
const editingId = ref<string | null>(null)

const form = reactive({
  type: 'openai' as string,
  name: '',
  apiKey: '',
  baseUrl: '',
  models: '',
  defaultModel: '',
  instructions: '',
  timeout: 30000,
  priority: 50,
})

const formTitle = computed(() => {
  if (formMode.value === 'create')
    return t('dashboard.sections.intelligence.providers.addButton')
  return form.name.trim() || t('dashboard.sections.intelligence.providers.addButton')
})

function resetForm() {
  form.type = 'openai'
  form.name = ''
  form.apiKey = ''
  form.baseUrl = ''
  form.models = ''
  form.defaultModel = ''
  form.instructions = ''
  form.timeout = 30000
  form.priority = 50
}

const addTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const emptyAddTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)

function openCreateForm(source?: HTMLElement | null) {
  formMode.value = 'create'
  editingId.value = null
  resetForm()
  formOverlaySource.value = source ?? null
  showFormOverlay.value = true
}

function openEditForm(provider: Provider, event?: MouseEvent) {
  formMode.value = 'edit'
  editingId.value = provider.id
  form.type = provider.type
  form.name = provider.name
  form.apiKey = ''
  form.baseUrl = provider.baseUrl || ''
  form.models = (provider.models || []).join('\n')
  form.defaultModel = provider.defaultModel || ''
  form.instructions = provider.instructions || ''
  form.timeout = provider.timeout
  form.priority = provider.priority
  formOverlaySource.value = (event?.currentTarget as HTMLElement) ?? null
  showFormOverlay.value = true
}

async function submitForm() {
  if (!form.name.trim())
    return

  formSaving.value = true
  try {
    const modelsArray = form.models
      .split('\n')
      .map(m => m.trim())
      .filter(Boolean)

    const body: Record<string, any> = {
      type: form.type,
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim() || null,
      models: modelsArray.length ? modelsArray : [],
      defaultModel: form.defaultModel.trim() || null,
      instructions: form.instructions.trim() || null,
      timeout: form.timeout,
      priority: form.priority,
    }

    if (form.apiKey.trim())
      body.apiKey = form.apiKey.trim()

    if (formMode.value === 'create') {
      await rawFetch('/api/dashboard/intelligence/providers', {
        method: 'POST',
        body,
      })
    }
    else if (editingId.value) {
      await rawFetch(`/api/dashboard/intelligence/providers/${editingId.value}`, {
        method: 'PATCH',
        body,
      })
    }

    showFormOverlay.value = false
    await fetchProviders()
    await fetchSceneRegistry()
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to save provider'
  }
  finally {
    formSaving.value = false
  }
}

// ── Toggle enabled ──
async function toggleProvider(provider: Provider) {
  try {
    await rawFetch(`/api/dashboard/intelligence/providers/${provider.id}`, {
      method: 'PATCH',
      body: { enabled: !provider.enabled },
    })
    provider.enabled = !provider.enabled
    await fetchSceneRegistry()
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to toggle provider'
  }
}

// ── Provider probe overlay ──
interface ProviderProbeResult {
  success: boolean
  providerId: string
  providerName: string
  providerType: string
  model: string
  output: string
  latency: number
  endpoint: string
  traceId: string
  fallbackCount: number
  retryCount: number
  attemptedProviders: string[]
  message: string
  error?: {
    message: string
    endpoint: string | null
    status: number | null
    responseSnippet: string | null
    baseUrl: string | null
  }
}

const showProbeOverlay = ref(false)
const probeOverlaySource = ref<HTMLElement | null>(null)
const probeProvider = ref<Provider | null>(null)
const probeLoading = ref(false)
const probePrompt = ref('')
const probeModel = ref('')
const probeResult = ref<ProviderProbeResult | null>(null)
const probeStreamOutput = ref('')
const probeStreamStatus = ref('')
let probeAbortController: AbortController | null = null

interface ProviderProbeStreamEvent {
  type: 'status' | 'probe.started' | 'assistant.delta' | 'probe.completed' | 'error' | 'done'
  timestamp?: number
  delta?: string
  message?: string
  providerId?: string
  providerName?: string
  providerType?: string
  model?: string
  result?: ProviderProbeResult
}

function isHtmlLikeResponse(status: number, contentType: string, data: unknown): boolean {
  if (status >= 400)
    return false
  const normalizedType = contentType.toLowerCase()
  if (normalizedType.includes('text/html'))
    return true
  if (typeof data === 'string') {
    const trimmed = data.trim().toLowerCase()
    if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html'))
      return true
  }
  return false
}

async function postJsonStrict<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await rawFetch.raw<T | string>(url, {
    method: 'POST',
    body,
    ignoreResponseError: true,
  })
  const status = response.status
  const contentType = response.headers.get('content-type') || ''
  const data = response._data

  if (isHtmlLikeResponse(status, contentType, data)) {
    throw new Error(`Endpoint returned HTML: ${url}`)
  }

  if (status >= 400) {
    const error = new Error((data as any)?.statusMessage || (data as any)?.message || `Request failed with status ${status}`)
    ;(error as any).data = data
    ;(error as any).statusCode = status
    throw error
  }

  return data as T
}

const probeModelOptions = computed(() => {
  const provider = probeProvider.value
  if (!provider)
    return []
  const modelSet = new Set<string>()
  if (provider.defaultModel?.trim())
    modelSet.add(provider.defaultModel.trim())
  for (const model of provider.models || []) {
    if (model?.trim())
      modelSet.add(model.trim())
  }
  if (probeResult.value?.model?.trim())
    modelSet.add(probeResult.value.model.trim())
  return Array.from(modelSet)
})

function openProbeOverlay(provider: Provider, event?: MouseEvent) {
  probeProvider.value = provider
  probeModel.value = provider.defaultModel || provider.models[0] || ''
  probePrompt.value = t('dashboard.sections.intelligence.providers.probe.defaultPrompt')
  probeResult.value = null
  probeStreamOutput.value = ''
  probeStreamStatus.value = ''
  abortProviderProbe()
  probeAbortController = null
  probeOverlaySource.value = (event?.currentTarget as HTMLElement) ?? null
  showProbeOverlay.value = true
}

function abortProviderProbe() {
  probeAbortController?.abort()
}

function closeProbeOverlay(close: () => void) {
  abortProviderProbe()
  close()
}

function handleProbeStreamEvent(event: ProviderProbeStreamEvent) {
  if (event.type === 'status' || event.type === 'probe.started') {
    probeStreamStatus.value = event.message || ''
    return
  }
  if (event.type === 'assistant.delta') {
    probeStreamOutput.value += event.delta || ''
    return
  }
  if (event.type === 'probe.completed' && event.result) {
    probeResult.value = event.result
    probeStreamOutput.value = event.result.output || probeStreamOutput.value
    probeStreamStatus.value = event.result.message || ''
    return
  }
  if (event.type === 'error') {
    probeStreamStatus.value = event.message || ''
    return
  }
  if (event.type === 'done') {
    probeLoading.value = false
  }
}

async function consumeProbeSseResponse(streamBody: ReadableStream<Uint8Array> | null) {
  if (!streamBody)
    throw new Error('Empty stream response body.')

  const reader = streamBody.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''

    for (const chunk of chunks) {
      const lines = chunk
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
      for (const line of lines) {
        if (!line.startsWith('data:'))
          continue
        const jsonText = line.slice(5).trim()
        if (!jsonText)
          continue
        try {
          handleProbeStreamEvent(JSON.parse(jsonText) as ProviderProbeStreamEvent)
        }
        catch {
          // Ignore malformed stream chunks
        }
      }
    }
  }
}

async function runProviderProbeStream(providerId: string, requestBody: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await networkClient.request<ReadableStream<Uint8Array> | null>({
      method: 'POST',
      url: `/api/dashboard/intelligence/providers/${providerId}/probe-stream`,
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: requestBody,
      signal: probeAbortController?.signal,
      responseType: 'stream',
    })
    await consumeProbeSseResponse(response.data)
    return Boolean(probeResult.value?.success)
  }
  catch (error: any) {
    if (error?.name === 'AbortError')
      throw error
    return false
  }
}

async function runProviderProbe() {
  if (!probeProvider.value)
    return
  probeLoading.value = true
  probeResult.value = null
  probeStreamOutput.value = ''
  probeStreamStatus.value = t('dashboard.sections.intelligence.providers.probe.connecting', '正在连接模型流…')
  probeAbortController?.abort()
  probeAbortController = new AbortController()
  try {
    const requestBody: Record<string, unknown> = {
      model: probeModel.value.trim() || undefined,
      prompt: probePrompt.value.trim() || undefined,
    }
    const providerId = probeProvider.value.id
    const streamSucceeded = await runProviderProbeStream(providerId, requestBody)
    if (streamSucceeded)
      return
    probeStreamStatus.value = t('dashboard.sections.intelligence.providers.probe.fallback', '流式测试不可用，切换到普通测试…')
    const result = await postJsonStrict<ProviderProbeResult>(
      `/api/dashboard/intelligence/providers/${providerId}/probe`,
      requestBody,
    )
    probeResult.value = result
    probeStreamOutput.value = result.output || probeStreamOutput.value
  }
  catch (e: any) {
    if (e?.name !== 'AbortError') {
      probeResult.value = {
        success: false,
        providerId: probeProvider.value.id,
        providerName: probeProvider.value.name,
        providerType: probeProvider.value.type,
        model: probeModel.value.trim() || probeProvider.value.defaultModel || probeProvider.value.models[0] || '',
        output: probeStreamOutput.value,
        latency: 0,
        endpoint: '',
        traceId: '',
        fallbackCount: 0,
        retryCount: 0,
        attemptedProviders: [probeProvider.value.id],
        message: e.data?.message || e.message || 'Probe failed',
        error: e.data?.error,
      }
    }
  }
  finally {
    probeLoading.value = false
    probeAbortController = null
  }
}

// ── Fetch models for form ──
const fetchingFormModels = ref(false)

async function fetchFormModels() {
  fetchingFormModels.value = true
  try {
    const body: Record<string, unknown> = {}
    if (form.apiKey.trim())
      body.apiKey = form.apiKey.trim()
    if (form.baseUrl.trim())
      body.baseUrl = form.baseUrl.trim()

    let models: string[] = []

    if (formMode.value === 'edit' && editingId.value) {
      const data = await postJsonStrict<{ success: boolean, models: string[] }>(
        `/api/dashboard/intelligence/providers/${editingId.value}/test`,
        body,
      )
      models = data.models || []
    }
    else {
      // For create mode, use a temporary test via the models endpoint
      const data = await rawFetch<{ models: string[] }>('/api/dashboard/intelligence/models', {
        method: 'POST',
        body: {
          ...body,
          type: form.type,
        },
      })
      models = data.models || []
    }

    if (models.length)
      form.models = models.join('\n')
  }
  catch {}
  finally {
    fetchingFormModels.value = false
  }
}

// ── Delete ──
const deleteConfirmVisible = ref(false)
const pendingDeleteId = ref<string | null>(null)
const pendingDeleteName = ref('')

function requestDelete(provider: Provider) {
  pendingDeleteId.value = provider.id
  pendingDeleteName.value = provider.name
  deleteConfirmVisible.value = true
}

async function confirmDelete(): Promise<boolean> {
  if (!pendingDeleteId.value)
    return true
  try {
    await rawFetch(`/api/dashboard/intelligence/providers/${pendingDeleteId.value}`, { method: 'DELETE' })
    await fetchProviders()
    await fetchSceneRegistry()
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to delete provider'
  }
  finally {
    pendingDeleteId.value = null
    pendingDeleteName.value = ''
  }
  return true
}

function closeDeleteConfirm() {
  deleteConfirmVisible.value = false
  pendingDeleteId.value = null
}

const DeleteConfirmDialog = defineComponent({
  name: 'ProviderDeleteDialog',
  setup() {
    const destroy = inject<() => void>('destroy')
    const handleCancel = () => destroy?.()
    const handleDelete = async () => {
      await confirmDelete()
      destroy?.()
    }
    return () => h('div', { class: 'ProviderDeleteDialog' }, [
      h('div', { class: 'ProviderDeleteDialog-Header' }, [
        h('h2', { class: 'ProviderDeleteDialog-Title' }, t('dashboard.sections.intelligence.providers.delete')),
        h('p', { class: 'ProviderDeleteDialog-Desc' }, t('dashboard.sections.intelligence.providers.confirmDelete', { name: pendingDeleteName.value })),
      ]),
      h('div', { class: 'ProviderDeleteDialog-Actions' }, [
        h(TxButton, { variant: 'secondary', size: 'small', 'native-type': 'button', onClick: handleCancel }, { default: () => t('dashboard.sections.intelligence.form.cancel') }),
        h(TxButton, { variant: 'danger', size: 'small', 'native-type': 'button', onClick: handleDelete }, { default: () => t('dashboard.sections.intelligence.providers.delete') }),
      ]),
    ])
  },
})

// ── Save settings ──
async function saveSettings() {
  settingsSaving.value = true
  try {
    await rawFetch('/api/dashboard/intelligence/settings', {
      method: 'POST',
      body: settings.value,
    })
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to save settings'
  }
  finally {
    settingsSaving.value = false
  }
}

// ── Computed ──
const formModelsList = computed(() =>
  form.models.split('\n').map(m => m.trim()).filter(Boolean),
)

function providerTypeLabel(type: string) {
  return t(`dashboard.sections.intelligence.types.${type}`, type)
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number')
    return '0'
  return new Intl.NumberFormat().format(value)
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function resolveUserLabel(item: { name?: string | null; email?: string | null; userId?: string | null }) {
  return item.name || item.email || item.userId || '-'
}

function usagePercent(item: CreditUsageItem) {
  if (!item.quota)
    return 0
  return Math.min(100, Math.round((item.used / item.quota) * 100))
}

function formatAuditTime(value: string) {
  if (!value)
    return ''
  try {
    return new Date(value).toLocaleString()
  }
  catch {
    return value
  }
}

function auditStatusLabel(log: AuditLog) {
  if (log.success)
    return t('dashboard.sections.intelligence.audit.status.success')
  return t('dashboard.sections.intelligence.audit.status.failed')
}

function formatEndpointCandidates(list?: string[]) {
  if (!list || !list.length)
    return ''
  return list.join(' | ')
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <!-- Header -->
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.intelligence.title') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.intelligence.subtitle') }}
      </p>
    </header>

    <!-- Error -->
    <div v-if="error" class="flex items-center justify-between rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500">
      <span>{{ error }}</span>
      <TxButton variant="bare" circle size="mini" @click="error = null">
        <span class="i-carbon-close" />
      </TxButton>
    </div>

    <TxTabs v-model="activeTab" placement="top" :content-scrollable="false" class="IntelligenceTabs">
      <TxTabItem name="lab" icon-class="i-carbon-beaker">
        <template #name>
          {{ t('dashboard.sections.menu.intelligenceLab', 'Intelligence Lab') }}
        </template>

        <IntelligenceAgentWorkspace />
      </TxTabItem>

      <TxTabItem name="adminCredits" icon-class="i-carbon-currency">
        <template #name>
          {{ t('dashboard.sections.menu.adminCredits', 'AI 积分') }}
        </template>

        <div class="rounded-2xl border border-black/[0.06] p-5 dark:border-white/[0.08]">
          <p class="text-sm text-black/60 dark:text-white/60">
            {{ t('dashboard.sections.intelligence.adminCreditsHint', 'AI 积分已并入 Intelligence 管理分组，可从这里进入完整积分管理。') }}
          </p>
          <NuxtLink to="/dashboard/admin/credits" class="mt-4 inline-flex no-underline">
            <TxButton variant="secondary" size="small">
              {{ t('dashboard.sections.menu.adminCredits', 'AI 积分') }}
            </TxButton>
          </NuxtLink>
        </div>
      </TxTabItem>

      <TxTabItem name="overview" icon-class="i-carbon-dashboard">
        <template #name>
          {{ t('dashboard.sections.intelligence.tabs.overview') }}
        </template>

        <div class="space-y-6">
          <section v-if="ipBanFeatureAvailable" class="apple-card-lg space-y-4 p-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="apple-heading-sm">
                  {{ t('dashboard.sections.intelligence.overview.title') }}
                </h2>
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.subtitle') }}
                </p>
              </div>
              <TxButton variant="bare" size="mini" @click="fetchOverview">
                {{ t('dashboard.sections.intelligence.overview.refresh') }}
              </TxButton>
            </div>

            <div v-if="overviewError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
              {{ overviewError }}
            </div>

            <div v-if="overviewLoading" class="flex items-center justify-center py-6">
              <TxSpinner :size="18" />
            </div>

            <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.cards.totalRequests') }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ overviewData?.summary.totalRequests ?? 0 }}
                </p>
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.cards.successRate') }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ overviewData?.summary.successRate ?? 0 }}%
                </p>
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.cards.totalTokens') }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ overviewData?.summary.totalTokens ?? 0 }}
                </p>
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.cards.avgLatency') }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ overviewData?.summary.avgLatency ?? 0 }}ms
                </p>
              </div>
            </div>

            <p class="text-[11px] text-black/40 dark:text-white/40">
              {{ t('dashboard.sections.intelligence.overview.sampleHint', { count: overviewData?.summary.sampleSize || 0 }) }}
            </p>
          </section>

          <section class="grid gap-4 lg:grid-cols-3">
            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <h3 class="text-sm font-medium text-black dark:text-white">
                {{ t('dashboard.sections.intelligence.overview.topModels') }}
              </h3>
              <div v-if="overviewData?.models?.length" class="mt-3 space-y-2">
                <div v-for="item in overviewData.models" :key="item.label" class="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
                  <span class="truncate">{{ item.label }}</span>
                  <span>{{ item.count }}</span>
                </div>
              </div>
              <div v-else class="mt-3 text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.overview.empty') }}
              </div>
            </div>

            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <h3 class="text-sm font-medium text-black dark:text-white">
                {{ t('dashboard.sections.intelligence.overview.topIps') }}
              </h3>
              <div v-if="overviewData?.ips?.length" class="mt-3 space-y-2">
                <div v-for="item in overviewData.ips" :key="item.label" class="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
                  <span class="truncate">{{ item.label }}</span>
                  <span>{{ item.count }}</span>
                </div>
              </div>
              <div v-else class="mt-3 text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.overview.empty') }}
              </div>
            </div>

            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <h3 class="text-sm font-medium text-black dark:text-white">
                {{ t('dashboard.sections.intelligence.overview.topCountries') }}
              </h3>
              <div v-if="overviewData?.countries?.length" class="mt-3 space-y-2">
                <div v-for="item in overviewData.countries" :key="item.label" class="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
                  <span class="truncate">{{ item.label }}</span>
                  <span>{{ item.count }}</span>
                </div>
              </div>
              <div v-else class="mt-3 text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.overview.empty') }}
              </div>
            </div>
          </section>

          <section v-if="ipBanFeatureAvailable" class="apple-card-lg space-y-4 p-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h3 class="apple-heading-sm">
                  {{ t('dashboard.sections.intelligence.overview.userUsage.title') }}
                </h3>
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.userUsage.subtitle') }}
                </p>
              </div>
              <TxButton variant="primary" size="small" :disabled="userUsageLoading || !userUsageQuery.trim()" @click="fetchUserUsage">
                {{ userUsageLoading ? t('dashboard.sections.intelligence.overview.userUsage.loading') : t('dashboard.sections.intelligence.overview.userUsage.action') }}
              </TxButton>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <TuffInput
                v-model="userUsageQuery"
                :placeholder="t('dashboard.sections.intelligence.overview.userUsage.placeholder')"
                class="w-full max-w-xs"
              />
            </div>

            <div v-if="userUsageError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
              {{ userUsageError }}
            </div>

            <div v-if="userUsageResult" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.userUsage.requests') }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ userUsageResult.totalRequests }}
                </p>
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.userUsage.tokens') }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ userUsageResult.totalTokens }}
                </p>
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.userUsage.successRate') }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ userUsageResult.successRate }}%
                </p>
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.userUsage.lastSeen') }}
                </p>
                <p class="mt-2 text-sm font-semibold text-black dark:text-white">
                  {{ userUsageResult.lastSeenAt ? formatAuditTime(userUsageResult.lastSeenAt) : '-' }}
                </p>
              </div>
            </div>

            <div v-if="userUsageResult?.models?.length" class="space-y-2 text-xs text-black/60 dark:text-white/60">
              <p class="text-[11px] text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.overview.userUsage.modelBreakdown') }}
              </p>
              <div v-for="item in userUsageResult.models" :key="item.label" class="flex items-center justify-between">
                <span class="truncate">{{ item.label }}</span>
                <span>{{ item.count }}</span>
              </div>
            </div>
          </section>

          <section class="apple-card-lg space-y-4 p-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h3 class="apple-heading-sm">
                  {{ t('dashboard.sections.intelligence.overview.ipBans.title') }}
                </h3>
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.overview.ipBans.subtitle') }}
                </p>
              </div>
              <TxButton variant="bare" size="mini" @click="fetchIpBans">
                {{ t('dashboard.sections.intelligence.overview.ipBans.refresh') }}
              </TxButton>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <TuffInput
                v-model="ipBanStepUpToken"
                placeholder="x-login-token (required for protected writes)"
                class="w-full max-w-xl"
              />
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <TuffInput
                v-model="ipBanForm.ip"
                :placeholder="t('dashboard.sections.intelligence.overview.ipBans.ipPlaceholder')"
                class="w-full max-w-xs"
              />
              <TuffInput
                v-model="ipBanForm.reason"
                :placeholder="t('dashboard.sections.intelligence.overview.ipBans.reasonPlaceholder')"
                class="w-full max-w-sm"
              />
              <TxButton variant="primary" size="small" :disabled="ipBanLoading || !ipBanForm.ip.trim()" @click="addIpBan">
                {{ t('dashboard.sections.intelligence.overview.ipBans.add') }}
              </TxButton>
            </div>

            <div v-if="ipBanError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
              {{ ipBanError }}
            </div>

            <div v-if="ipBanLoading" class="flex items-center justify-center py-4">
              <TxSpinner :size="18" />
            </div>

            <div v-else-if="ipBans.length" class="space-y-2">
              <div
                v-for="ban in ipBans"
                :key="ban.id"
                class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/[0.02] px-4 py-3 text-xs text-black/60 dark:bg-white/[0.03] dark:text-white/60"
              >
                <div>
                  <p class="text-sm font-medium text-black dark:text-white">
                    {{ ban.ip }}
                    <span
                      class="ml-2 rounded px-1.5 py-0.5 text-[10px]"
                      :class="ban.enabled
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-black/5 text-black/40 dark:bg-white/5 dark:text-white/40'"
                    >
                      {{ ban.enabled ? t('dashboard.sections.intelligence.overview.ipBans.enabled') : t('dashboard.sections.intelligence.overview.ipBans.disabled') }}
                    </span>
                  </p>
                  <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                    {{ ban.reason || t('dashboard.sections.intelligence.overview.ipBans.noReason') }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <TxButton variant="bare" size="mini" @click="toggleIpBan(ban)">
                    {{ ban.enabled ? t('dashboard.sections.intelligence.overview.ipBans.disable') : t('dashboard.sections.intelligence.overview.ipBans.enable') }}
                  </TxButton>
                  <TxButton variant="bare" size="mini" class="text-red-500" @click="removeIpBan(ban)">
                    {{ t('dashboard.sections.intelligence.overview.ipBans.remove') }}
                  </TxButton>
                </div>
              </div>
            </div>

            <div v-else class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.sections.intelligence.overview.ipBans.empty') }}
            </div>
          </section>

          <section v-if="!ipBanFeatureAvailable" class="apple-card-lg p-6">
            <div class="rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-black/45 dark:bg-white/[0.03] dark:text-white/45">
              {{ t('dashboard.sections.intelligence.overview.ipBans.unavailable') }}
            </div>
          </section>
        </div>
      </TxTabItem>

      <TxTabItem name="providers" icon-class="i-carbon-machine-learning-model">
        <template #name>
          {{ t('dashboard.sections.intelligence.tabs.providers') }}
        </template>

        <div class="space-y-6">
          <section class="grid gap-4 md:grid-cols-3">
            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <p class="text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.providers.title') }}
              </p>
              <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                {{ providers.length }}
              </p>
              <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.providers.enabledCount', { count: providers.filter(item => item.enabled).length }, `${providers.filter(item => item.enabled).length} enabled`) }}
              </p>
            </div>
            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <p class="text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.scenes.registryMirrors', 'Registry mirrors') }}
              </p>
              <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                {{ aiRegistryProviders.length }}
              </p>
              <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.scenes.registryHint', 'Scenes bind registry providers, not raw API keys.') }}
              </p>
            </div>
            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <p class="text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.scenes.title', 'Scenes') }}
              </p>
              <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                {{ scenes.length }}
              </p>
              <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.intelligence.scenes.bindingCount', { count: sceneBindingCount }, `${sceneBindingCount} bindings`) }}
              </p>
            </div>
          </section>

          <section class="apple-card-lg space-y-4 p-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="apple-heading-sm">
                  {{ t('dashboard.sections.intelligence.providers.modelsTitle', 'Providers + Models') }}
                </h2>
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.providers.modelsSubtitle', 'Providers expose available models; scenes decide which provider/model path is used.') }}
                </p>
              </div>
              <TxButton v-if="providers.length" ref="addTriggerRef" variant="primary" size="small" @click="openCreateForm(addTriggerRef?.$el || null)">
                <span class="i-carbon-add mr-1 text-base" />
                {{ t('dashboard.sections.intelligence.providers.addButton') }}
              </TxButton>
            </div>

            <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-black dark:text-white">
                    {{ t('dashboard.sections.intelligence.providers.migration.title', 'Provider Registry 迁移') }}
                  </p>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.sections.intelligence.providers.migration.subtitle', '将旧 intelligence_providers 镜像到通用 Provider Registry 与 secure store；不会删除旧表。') }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <TxButton variant="secondary" size="mini" :disabled="migrationLoading" @click="runProviderRegistryMigration(true)">
                    {{ t('dashboard.sections.intelligence.providers.migration.dryRun', 'Dry run') }}
                  </TxButton>
                  <TxButton variant="primary" size="mini" :disabled="migrationLoading" @click="runProviderRegistryMigration(false)">
                    {{ t('dashboard.sections.intelligence.providers.migration.execute', '执行迁移') }}
                  </TxButton>
                </div>
              </div>
              <div v-if="migrationLoading" class="mt-3 flex items-center gap-2 text-xs text-black/45 dark:text-white/45">
                <TxSpinner :size="14" />
                {{ t('dashboard.sections.intelligence.providers.migration.running', '迁移检查中…') }}
              </div>
              <div v-if="migrationError" class="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500">
                {{ migrationError }}
              </div>
              <div v-if="migrationResult" class="mt-3 space-y-2 text-xs">
                <div class="flex flex-wrap gap-3 text-black/50 dark:text-white/50">
                  <span>{{ t('dashboard.sections.intelligence.providers.migration.mode', '模式') }}: {{ migrationResult.dryRun ? 'dry-run' : 'execute' }}</span>
                  <span>{{ t('dashboard.sections.intelligence.providers.migration.total', '总数') }}: {{ migrationResult.total }}</span>
                  <span>{{ t('dashboard.sections.intelligence.providers.migration.migrated', '已迁移') }}: {{ migrationResult.migrated }}</span>
                  <span>{{ t('dashboard.sections.intelligence.providers.migration.failed', '失败') }}: {{ migrationResult.failed }}</span>
                </div>
                <div v-if="migrationResult.items.length" class="max-h-40 overflow-auto rounded-xl bg-black/[0.03] p-3 font-mono text-[11px] text-black/55 dark:bg-white/[0.04] dark:text-white/55">
                  <div v-for="item in migrationResult.items" :key="item.providerId" class="flex flex-wrap gap-x-2 gap-y-1">
                    <span>{{ item.providerName }}</span>
                    <span>{{ item.action }}</span>
                    <span v-if="item.registryProviderId">-&gt; {{ item.registryProviderId }}</span>
                    <span v-if="item.reason">({{ item.reason }})</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="loading" class="space-y-3 py-4">
              <div class="flex items-center justify-center">
                <TxSpinner :size="20" />
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <TxSkeleton :loading="true" :lines="2" />
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <TxSkeleton :loading="true" :lines="2" />
              </div>
            </div>

            <div v-else-if="providers.length" class="space-y-3">
              <div
                v-for="provider in providers"
                :key="provider.id"
                class="group relative rounded-2xl bg-black/[0.02] p-4 transition hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
              >
                <div class="flex flex-wrap items-center justify-between gap-4">
                  <div class="flex min-w-0 items-center gap-4" @click="openEditForm(provider, $event)">
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] dark:bg-white/[0.06]">
                      <span class="i-carbon-machine-learning-model text-lg text-black/60 dark:text-white/60" />
                    </div>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="cursor-pointer truncate font-medium text-black dark:text-white">
                          {{ provider.name }}
                        </p>
                        <TxStatusBadge
                          :text="provider.enabled ? t('dashboard.sections.intelligence.providers.enabled') : t('dashboard.sections.intelligence.providers.disabled')"
                          :status="provider.enabled ? 'success' : 'muted'"
                          size="sm"
                        />
                        <TxStatusBadge
                          :text="registryProviderForIntelligenceProvider(provider.id) ? 'registry' : t('dashboard.sections.intelligence.scenes.registryMissing', '需先迁移')"
                          :status="registryProviderForIntelligenceProvider(provider.id) ? 'info' : 'warning'"
                          size="sm"
                        />
                      </div>
                      <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-black/40 dark:text-white/40">
                        <span>{{ providerTypeLabel(provider.type) }}</span>
                        <span>·</span>
                        <span>{{ provider.models.length ? t('dashboard.sections.intelligence.providers.models', { count: provider.models.length }) : t('dashboard.sections.intelligence.providers.noModels') }}</span>
                        <template v-if="provider.defaultModel">
                          <span>·</span>
                          <span class="truncate">{{ provider.defaultModel }}</span>
                        </template>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <TxButton
                      variant="secondary"
                      size="mini"
                      class="rounded-lg"
                      @click="openProbeOverlay(provider, $event)"
                    >
                      <span class="i-carbon-connection-signal text-base" />
                      <span class="ml-1 text-[11px]">
                        {{ t('dashboard.sections.intelligence.providers.testConnection') }}
                      </span>
                    </TxButton>
                    <TuffSwitch :model-value="provider.enabled" size="small" @change="() => toggleProvider(provider)" />
                    <TxButton
                      variant="bare"
                      circle
                      size="mini"
                      class="rounded-lg text-red-400 transition hover:bg-red-500/10 hover:text-red-500"
                      @click="requestDelete(provider)"
                    >
                      <span class="i-carbon-trash-can text-base" />
                    </TxButton>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="rounded-2xl bg-black/[0.02] p-8 text-center dark:bg-white/[0.03]">
              <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-black/[0.04] dark:bg-white/[0.06]">
                <span class="i-carbon-machine-learning-model text-2xl text-black/30 dark:text-white/30" />
              </div>
              <h3 class="font-medium text-black dark:text-white">
                {{ t('dashboard.sections.intelligence.providers.title') }}
              </h3>
              <p class="mt-1 text-sm text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.intelligence.providers.empty') }}
              </p>
              <TxButton ref="emptyAddTriggerRef" variant="primary" class="mt-4" @click="openCreateForm(emptyAddTriggerRef?.$el || null)">
                {{ t('dashboard.sections.intelligence.providers.addButton') }}
              </TxButton>
            </div>
          </section>

          <section class="apple-card-lg space-y-5 p-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="apple-heading-sm">
                  {{ t('dashboard.sections.intelligence.scenes.title', 'Scenes') }}
                </h2>
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.scenes.subtitle', 'Bind each AI scene to one or more providers, then pick the model used by that scene.') }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <TxButton variant="secondary" size="mini" :disabled="scenesLoading" @click="fetchSceneRegistry">
                  {{ t('common.refresh', '刷新') }}
                </TxButton>
                <TxButton variant="secondary" size="mini" @click="createSceneDraft">
                  {{ t('dashboard.sections.intelligence.scenes.newScene', '新建场景') }}
                </TxButton>
                <TxButton variant="primary" size="mini" :disabled="sceneSaving || !sceneForm.id.trim() || !sceneForm.displayName.trim()" @click="saveSceneConfig">
                  {{ sceneSaving ? t('dashboard.sections.intelligence.form.saving') : t('dashboard.sections.intelligence.form.save') }}
                </TxButton>
              </div>
            </div>

            <div v-if="scenesError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
              {{ scenesError }}
            </div>

            <div v-if="scenesLoading" class="flex items-center justify-center py-4">
              <TxSpinner :size="18" />
            </div>

            <div class="grid gap-5 lg:grid-cols-[260px_1fr]">
              <div class="space-y-2">
                <TxButton
                  v-for="scene in scenes"
                  :key="scene.id"
                  variant="bare"
                  class="SceneListButton"
                  :class="{ 'SceneListButton--active': selectedSceneId === scene.id }"
                  @click="selectScene(scene)"
                >
                  <span class="min-w-0 flex-1 text-left">
                    <span class="block truncate text-sm font-medium">{{ scene.displayName }}</span>
                    <span class="block truncate text-[11px] text-black/40 dark:text-white/40">{{ scene.id }}</span>
                  </span>
                  <TxStatusBadge :text="scene.status" :status="statusTone(scene.status)" size="sm" />
                </TxButton>
                <div v-if="!scenes.length" class="rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-black/40 dark:bg-white/[0.03] dark:text-white/40">
                  {{ t('dashboard.sections.intelligence.scenes.empty', '暂无场景，保存右侧表单后会创建。') }}
                </div>
              </div>

              <div class="space-y-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-xs text-black/60 dark:text-white/60">
                      {{ t('dashboard.sections.intelligence.scenes.sceneId', 'Scene ID') }}
                    </label>
                    <TuffInput v-model="sceneForm.id" class="w-full" :disabled="Boolean(selectedSceneId)" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs text-black/60 dark:text-white/60">
                      {{ t('dashboard.sections.intelligence.scenes.displayName', 'Display name') }}
                    </label>
                    <TuffInput v-model="sceneForm.displayName" class="w-full" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs text-black/60 dark:text-white/60">
                      {{ t('dashboard.sections.intelligence.scenes.capability', 'Capability') }}
                    </label>
                    <TuffSelect v-model="sceneForm.requiredCapability" class="w-full" @change="ensureSceneBindingsSupportCapability">
                      <TuffSelectItem v-for="capability in AI_SCENE_CAPABILITIES" :key="capability" :value="capability" :label="capability" />
                    </TuffSelect>
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs text-black/60 dark:text-white/60">
                      {{ t('dashboard.sections.intelligence.scenes.strategy', 'Strategy') }}
                    </label>
                    <TuffSelect v-model="sceneForm.strategyMode" class="w-full">
                      <TuffSelectItem value="priority" :label="t('dashboard.sections.intelligence.settings.strategies.priority')" />
                      <TuffSelectItem value="lowest_latency" :label="t('dashboard.sections.intelligence.settings.strategies.leastLatency')" />
                      <TuffSelectItem value="balanced" label="Balanced" />
                      <TuffSelectItem value="manual" label="Manual" />
                    </TuffSelect>
                  </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <label class="flex cursor-pointer items-center justify-between rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                    <span>
                      <span class="block text-sm font-medium text-black dark:text-white">{{ t('dashboard.sections.intelligence.scenes.enabled', '启用场景') }}</span>
                      <span class="block text-xs text-black/40 dark:text-white/40">{{ sceneForm.id }}</span>
                    </span>
                    <TuffSwitch :model-value="sceneForm.status === 'enabled'" size="small" @change="value => sceneForm.status = value ? 'enabled' : 'disabled'" />
                  </label>
                  <label class="flex cursor-pointer items-center justify-between rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                    <span>
                      <span class="block text-sm font-medium text-black dark:text-white">{{ t('dashboard.sections.intelligence.scenes.fallback', '启用 fallback') }}</span>
                      <span class="block text-xs text-black/40 dark:text-white/40">{{ t('dashboard.sections.intelligence.scenes.fallbackHint', '当前绑定失败后继续尝试后续 provider。') }}</span>
                    </span>
                    <TuffSwitch :model-value="sceneForm.fallback === 'enabled'" size="small" @change="value => sceneForm.fallback = value ? 'enabled' : 'disabled'" />
                  </label>
                </div>

                <div class="space-y-3">
                  <div class="flex items-center justify-between gap-3">
                    <h3 class="text-sm font-medium text-black dark:text-white">
                      {{ t('dashboard.sections.intelligence.scenes.bindings', 'Scene bindings') }}
                    </h3>
                    <TxButton variant="secondary" size="mini" :disabled="!availableSceneProviderIds.length" @click="addSceneBinding">
                      <span class="i-carbon-add mr-1 text-sm" />
                      {{ t('dashboard.sections.intelligence.scenes.addBinding', '添加绑定') }}
                    </TxButton>
                  </div>

                  <div
                    v-for="(binding, index) in sceneForm.bindings"
                    :key="index"
                    class="grid gap-3 rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_120px_110px_auto]"
                  >
                    <div class="space-y-1">
                      <label class="text-[11px] text-black/45 dark:text-white/45">{{ t('dashboard.sections.intelligence.providers.title') }}</label>
                      <TuffSelect v-model="binding.providerId" class="w-full" searchable @change="() => onSceneBindingProviderChange(binding)">
                        <TuffSelectItem
                          v-for="option in providerSceneOptions"
                          :key="option.value"
                          :value="option.value"
                          :label="option.label"
                          :disabled="option.disabled"
                        />
                      </TuffSelect>
                    </div>
                    <div class="space-y-1">
                      <label class="text-[11px] text-black/45 dark:text-white/45">{{ t('dashboard.sections.intelligence.providers.defaultModel') }}</label>
                      <TuffSelect v-if="providerModelOptions(binding.providerId).length" v-model="binding.model" class="w-full" searchable>
                        <TuffSelectItem value="" :label="t('dashboard.sections.intelligence.providers.probe.modelAuto')" />
                        <TuffSelectItem v-for="model in providerModelOptions(binding.providerId)" :key="model" :value="model" :label="model" />
                      </TuffSelect>
                      <TuffInput v-else v-model="binding.model" class="w-full" :placeholder="t('dashboard.sections.intelligence.providers.probe.modelPlaceholder')" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[11px] text-black/45 dark:text-white/45">{{ t('dashboard.sections.intelligence.form.priority') }}</label>
                      <TuffInput v-model.number="binding.priority" type="number" class="w-full" />
                    </div>
                    <div class="flex items-end">
                      <TuffSwitch :model-value="binding.status === 'enabled'" size="small" @change="value => binding.status = value ? 'enabled' : 'disabled'" />
                    </div>
                    <div class="flex items-end justify-end">
                      <TxButton variant="bare" circle size="mini" class="text-red-500" :disabled="sceneForm.bindings.length <= 1" @click="removeSceneBinding(index)">
                        <span class="i-carbon-trash-can text-base" />
                      </TxButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="apple-card-lg space-y-5 p-6">
            <h2 class="apple-heading-sm">
              {{ t('dashboard.sections.intelligence.settings.title') }}
            </h2>

            <div class="space-y-4">
              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.settings.defaultStrategy') }}
                </label>
                <TuffSelect v-model="settings.defaultStrategy" class="w-full max-w-xs">
                  <TuffSelectItem value="priority" :label="t('dashboard.sections.intelligence.settings.strategies.priority')" />
                  <TuffSelectItem value="round-robin" :label="t('dashboard.sections.intelligence.settings.strategies.roundRobin')" />
                  <TuffSelectItem value="random" :label="t('dashboard.sections.intelligence.settings.strategies.random')" />
                  <TuffSelectItem value="least-latency" :label="t('dashboard.sections.intelligence.settings.strategies.leastLatency')" />
                </TuffSelect>
              </div>

              <label class="flex cursor-pointer items-center justify-between rounded-xl bg-black/[0.02] p-4 transition hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
                <div>
                  <p class="text-sm font-medium text-black dark:text-white">
                    {{ t('dashboard.sections.intelligence.settings.enableAudit') }}
                  </p>
                  <p class="text-xs text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.intelligence.settings.enableAuditHint') }}
                  </p>
                </div>
                <TuffSwitch :model-value="settings.enableAudit" size="small" @change="value => settings.enableAudit = value" />
              </label>

              <label class="flex cursor-pointer items-center justify-between rounded-xl bg-black/[0.02] p-4 transition hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
                <div>
                  <p class="text-sm font-medium text-black dark:text-white">
                    {{ t('dashboard.sections.intelligence.settings.enableCache') }}
                  </p>
                  <p class="text-xs text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.intelligence.settings.enableCacheHint') }}
                  </p>
                </div>
                <TuffSwitch :model-value="settings.enableCache" size="small" @change="value => settings.enableCache = value" />
              </label>

              <div v-if="settings.enableCache" class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.settings.cacheExpiration') }}
                </label>
                <TuffInput v-model.number="settings.cacheExpiration" type="number" class="w-full max-w-xs" />
              </div>
            </div>

            <div class="flex justify-end">
              <TxButton variant="primary" size="small" :disabled="settingsSaving" @click="saveSettings">
                {{ settingsSaving ? t('dashboard.sections.intelligence.form.saving') : t('dashboard.sections.intelligence.form.save') }}
              </TxButton>
            </div>
          </section>
        </div>
      </TxTabItem>

      <TxTabItem name="credits" icon-class="i-carbon-currency">
        <template #name>
          {{ t('dashboard.sections.intelligence.tabs.credits', 'AI 积分') }}
        </template>

        <div class="space-y-6">
          <section class="apple-card-lg space-y-4 p-6">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 class="apple-heading-sm">
                  {{ t('dashboard.adminCredits.usage.title', '用户消耗') }}
                </h2>
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.adminCredits.usage.subtitle', '按当前月份统计，支持搜索用户 ID / 邮箱') }}
                </p>
              </div>
              <TxButton variant="secondary" size="small" @click="() => fetchUsage()">
                {{ t('common.refresh', '刷新') }}
              </TxButton>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-2xl bg-black/[0.02] p-4 text-sm dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.adminCredits.usage.totalUsed', '本月总消耗') }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ formatNumber(usageSummary.totalUsed) }}
                </p>
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 text-sm dark:bg-white/[0.03]">
                <p class="text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.adminCredits.usage.totalQuota', '本月总额度') }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ formatNumber(usageSummary.totalQuota) }}
                </p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <TuffInput
                v-model="usageQuery"
                :placeholder="t('dashboard.adminCredits.usage.searchPlaceholder', '搜索用户 ID / 邮箱')"
                class="w-full max-w-xs"
              />
              <TxButton variant="secondary" size="mini" @click="applyUsageFilter">
                {{ t('dashboard.adminCredits.actions.filter', '筛选') }}
              </TxButton>
            </div>

            <div v-if="usageError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
              {{ usageError }}
            </div>

            <div v-if="usageLoading" class="space-y-3 py-4">
              <div class="flex items-center justify-center">
                <TxSpinner :size="18" />
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <TxSkeleton :loading="true" :lines="2" />
              </div>
            </div>

            <div v-else-if="usageItems.length" class="space-y-2">
              <div
                v-for="item in usageItems"
                :key="item.userId"
                class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/[0.02] px-4 py-3 text-xs text-black/60 dark:bg-white/[0.03] dark:text-white/60"
              >
                <div>
                  <p class="text-sm font-medium text-black dark:text-white">
                    {{ resolveUserLabel({ name: item.name, email: item.email, userId: item.userId }) }}
                  </p>
                  <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                    {{ item.userId }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold text-black dark:text-white">
                    {{ formatNumber(item.used) }} / {{ formatNumber(item.quota) }}
                  </p>
                  <p class="text-[11px] text-black/40 dark:text-white/40">
                    {{ usagePercent(item) }}%
                  </p>
                </div>
              </div>
            </div>

            <div v-else class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.adminCredits.usage.empty', '暂无记录') }}
            </div>

            <div v-if="usagePagination.total > usagePagination.limit" class="flex justify-end pt-2">
              <TxPagination v-model:current-page="usagePagination.page" :total="usagePagination.total" :page-size="usagePagination.limit" />
            </div>
          </section>

          <section class="apple-card-lg space-y-4 p-6">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 class="apple-heading-sm">
                  {{ t('dashboard.adminCredits.ledger.title', '积分流水') }}
                </h2>
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ t('dashboard.adminCredits.ledger.subtitle', '记录每一次积分消耗') }}
                </p>
              </div>
              <TxButton variant="secondary" size="small" @click="() => fetchLedger()">
                {{ t('common.refresh', '刷新') }}
              </TxButton>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <TuffInput
                v-model="ledgerQuery"
                :placeholder="t('dashboard.adminCredits.ledger.searchPlaceholder', '筛选用户 ID / 邮箱')"
                class="w-full max-w-xs"
              />
              <TxButton variant="secondary" size="mini" @click="applyLedgerFilter">
                {{ t('dashboard.adminCredits.actions.filter', '筛选') }}
              </TxButton>
            </div>

            <div v-if="ledgerError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
              {{ ledgerError }}
            </div>

            <div v-if="ledgerLoading" class="space-y-3 py-4">
              <div class="flex items-center justify-center">
                <TxSpinner :size="18" />
              </div>
              <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <TxSkeleton :loading="true" :lines="2" />
              </div>
            </div>

            <div v-else-if="ledgerItems.length" class="space-y-2">
              <div
                v-for="entry in ledgerItems"
                :key="entry.id"
                class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/[0.02] px-4 py-3 text-xs text-black/60 dark:bg-white/[0.03] dark:text-white/60"
              >
                <div>
                  <p class="text-sm font-medium text-black dark:text-white">
                    {{ resolveUserLabel({ name: entry.userName, email: entry.userEmail, userId: entry.userId }) }}
                  </p>
                  <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                    {{ entry.userId || '-' }} · {{ formatTime(entry.createdAt) }}
                  </p>
                  <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                    {{ entry.reason }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold" :class="entry.delta < 0 ? 'text-red-500' : 'text-green-600'">
                    {{ entry.delta }}
                  </p>
                  <p v-if="entry.metadata?.tokens" class="text-[11px] text-black/40 dark:text-white/40">
                    tokens {{ entry.metadata.tokens }}
                  </p>
                </div>
              </div>
            </div>

            <div v-else class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.adminCredits.ledger.empty', '暂无流水') }}
            </div>

            <div v-if="ledgerPagination.total > ledgerPagination.limit" class="flex justify-end pt-2">
              <TxPagination v-model:current-page="ledgerPagination.page" :total="ledgerPagination.total" :page-size="ledgerPagination.limit" />
            </div>
          </section>
        </div>
      </TxTabItem>

      <TxTabItem name="audits" icon-class="i-carbon-document">
        <template #name>
          {{ t('dashboard.sections.intelligence.tabs.audits') }}
        </template>

        <div class="space-y-6">
          <!-- Audit Section -->
          <section class="apple-card-lg space-y-4 p-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="apple-heading-sm">
            {{ t('dashboard.sections.intelligence.audit.title') }}
          </h2>
          <p class="mt-1 text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.audit.subtitle') }}
          </p>
        </div>
        <TxButton variant="bare" size="mini" @click="fetchAudits">
          {{ t('dashboard.sections.intelligence.audit.refresh') }}
        </TxButton>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <TuffInput
          v-model="auditUserId"
          :placeholder="t('dashboard.sections.intelligence.audit.userFilter')"
          class="w-full max-w-xs"
        />
        <TxButton variant="secondary" size="mini" @click="applyAuditFilter">
          {{ t('dashboard.sections.intelligence.audit.filter') }}
        </TxButton>
      </div>

      <div
        v-if="!settings.enableAudit"
        class="rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-black/40 dark:bg-white/[0.04] dark:text-white/40"
      >
        {{ t('dashboard.sections.intelligence.audit.disabledHint') }}
      </div>

      <div v-if="auditError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
        {{ auditError }}
      </div>

      <div v-if="auditLoading" class="flex items-center justify-center py-4">
        <TxSpinner :size="18" />
      </div>

      <div v-else-if="auditLogs.length" class="space-y-2">
        <div
          v-for="log in auditLogs"
          :key="log.id"
          class="rounded-2xl bg-black/[0.02] p-4 text-xs text-black/60 dark:bg-white/[0.03] dark:text-white/60"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium text-black dark:text-white">
                {{ log.providerName || providerTypeLabel(log.providerType) }}
              </span>
              <span class="text-[11px] text-black/40 dark:text-white/40">
                {{ log.model }}
              </span>
            </div>
            <span class="text-[11px] text-black/40 dark:text-white/40">
              {{ formatAuditTime(log.createdAt) }}
            </span>
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-black/50 dark:text-white/50">
            <span
              class="rounded px-2 py-0.5 font-medium"
              :class="log.success
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-red-500/10 text-red-500'"
            >
              {{ auditStatusLabel(log) }}<span v-if="log.status"> · {{ log.status }}</span>
            </span>
            <span v-if="log.latency !== null">
              {{ t('dashboard.sections.intelligence.audit.fields.latency') }} {{ log.latency }}ms
            </span>
            <span v-if="log.endpoint" class="truncate">
              {{ t('dashboard.sections.intelligence.audit.fields.endpoint') }} {{ log.endpoint }}
            </span>
            <span v-if="log.traceId">
              {{ t('dashboard.sections.intelligence.audit.fields.trace') }} {{ log.traceId }}
            </span>
          </div>

          <div
            v-if="log.metadata?.baseUrl || log.metadata?.requestId || log.metadata?.contentType || log.metadata?.endpoints || log.metadata?.tokens || log.metadata?.ip || log.metadata?.country"
            class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-black/50 dark:text-white/50"
          >
            <span v-if="log.metadata?.baseUrl" class="break-all">
              {{ t('dashboard.sections.intelligence.audit.fields.baseUrl') }} {{ log.metadata.baseUrl }}
            </span>
            <span v-if="log.metadata?.requestId">
              {{ t('dashboard.sections.intelligence.audit.fields.requestId') }} {{ log.metadata.requestId }}
            </span>
            <span v-if="log.metadata?.contentType">
              {{ t('dashboard.sections.intelligence.audit.fields.contentType') }} {{ log.metadata.contentType }}
            </span>
            <span v-if="log.metadata?.endpoints" class="break-all">
              {{ t('dashboard.sections.intelligence.audit.fields.candidates') }} {{ formatEndpointCandidates(log.metadata.endpoints) }}
            </span>
            <span v-if="log.metadata?.tokens">
              {{ t('dashboard.sections.intelligence.audit.fields.tokens') }} {{ log.metadata.tokens }}
            </span>
            <span v-if="log.metadata?.ip">
              {{ t('dashboard.sections.intelligence.audit.fields.ip') }} {{ log.metadata.ip }}
            </span>
            <span v-if="log.metadata?.country">
              {{ t('dashboard.sections.intelligence.audit.fields.country') }} {{ log.metadata.country }}
            </span>
          </div>

          <div v-if="log.errorMessage" class="mt-2 text-xs text-red-500">
            {{ log.errorMessage }}
          </div>

          <div
            v-if="log.metadata?.responseSnippet"
            class="mt-2 rounded-lg bg-black/[0.04] px-3 py-2 text-[11px] text-black/60 dark:bg-white/[0.04] dark:text-white/60 break-all"
          >
            {{ t('dashboard.sections.intelligence.audit.fields.responseSnippet') }} {{ log.metadata.responseSnippet }}
          </div>
        </div>
      </div>

            <div v-else class="rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-black/40 dark:bg-white/[0.04] dark:text-white/40">
              {{ t('dashboard.sections.intelligence.audit.empty') }}
            </div>

            <div v-if="auditTotal > auditPageSize" class="flex justify-end pt-2">
              <TxPagination v-model:current-page="auditPage" :total="auditTotal" :page-size="auditPageSize" />
            </div>
          </section>
        </div>
      </TxTabItem>
    </TxTabs>

    <!-- Create / Edit Overlay -->
    <FlipDialog
        v-model="showFormOverlay"
        :reference="formOverlaySource"
        size="lg"
      >
        <template #default="{ close }">
          <div class="ProviderOverlay-Inner">
            <div class="space-y-1">
              <h2 class="ProviderOverlay-Title">
                {{ formTitle }}
              </h2>
            </div>

            <div class="ProviderOverlay-Body space-y-4">
              <!-- Type -->
              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.form.type') }}
                </label>
                <TuffSelect v-model="form.type" class="w-full" :disabled="formMode === 'edit'">
                  <TuffSelectItem
                    v-for="pt in PROVIDER_TYPES"
                    :key="pt"
                    :value="pt"
                    :label="providerTypeLabel(pt)"
                  />
                </TuffSelect>
              </div>

              <!-- Name -->
              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.form.name') }}
                </label>
                <TuffInput v-model="form.name" :placeholder="t('dashboard.sections.intelligence.form.namePlaceholder')" class="w-full" />
              </div>

              <!-- API Key -->
              <div v-if="form.type !== 'local'" class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.form.apiKey') }}
                </label>
                <TuffInput v-model="form.apiKey" type="password" :placeholder="formMode === 'edit' ? '••••••••' : t('dashboard.sections.intelligence.form.apiKeyPlaceholder')" class="w-full" />
                <p class="text-[11px] text-black/30 dark:text-white/30">
                  {{ t('dashboard.sections.intelligence.form.apiKeyHint') }}
                </p>
              </div>

              <!-- Base URL -->
              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.form.baseUrl') }}
                </label>
                <TuffInput v-model="form.baseUrl" :placeholder="t('dashboard.sections.intelligence.form.baseUrlPlaceholder')" class="w-full" />
                <p class="text-[11px] text-black/30 dark:text-white/30">
                  {{ t('dashboard.sections.intelligence.form.baseUrlHint') }}
                </p>
              </div>

              <!-- Models -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-xs text-black/60 dark:text-white/60">
                    {{ t('dashboard.sections.intelligence.form.models') }}
                  </label>
                  <TxButton
                    variant="bare"
                    size="mini"
                    :disabled="fetchingFormModels || (formMode === 'create' && form.type !== 'local' && !form.apiKey.trim())"
                    @click="fetchFormModels"
                  >
                    {{ fetchingFormModels ? t('dashboard.sections.intelligence.form.fetchingModels') : t('dashboard.sections.intelligence.form.fetchModels') }}
                  </TxButton>
                </div>
                <TuffInput
                  v-model="form.models"
                  type="textarea"
                  :placeholder="t('dashboard.sections.intelligence.form.modelsPlaceholder')"
                  :rows="4"
                  class="w-full"
                />
                <p class="text-[11px] text-black/30 dark:text-white/30">
                  {{ t('dashboard.sections.intelligence.form.modelsHint') }}
                </p>
              </div>

              <!-- Default Model -->
              <div v-if="formModelsList.length" class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.form.defaultModel') }}
                </label>
                <TuffSelect v-model="form.defaultModel" class="w-full">
                  <TuffSelectItem value="" :label="t('dashboard.sections.intelligence.form.defaultModelPlaceholder')" />
                  <TuffSelectItem
                    v-for="m in formModelsList"
                    :key="m"
                    :value="m"
                    :label="m"
                  />
                </TuffSelect>
              </div>

              <!-- Instructions -->
              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.form.instructions') }}
                </label>
                <TuffInput
                  v-model="form.instructions"
                  type="textarea"
                  :placeholder="t('dashboard.sections.intelligence.form.instructionsPlaceholder')"
                  :rows="2"
                  class="w-full"
                />
              </div>

              <!-- Timeout & Priority -->
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <label class="text-xs text-black/60 dark:text-white/60">
                    {{ t('dashboard.sections.intelligence.form.timeout') }}
                  </label>
                  <TuffInput v-model.number="form.timeout" type="number" class="w-full" />
                </div>
                <div class="space-y-2">
                  <label class="text-xs text-black/60 dark:text-white/60">
                    {{ t('dashboard.sections.intelligence.form.priority') }}
                  </label>
                  <TuffInput v-model.number="form.priority" type="number" class="w-full" />
                  <p class="text-[11px] text-black/30 dark:text-white/30">
                    {{ t('dashboard.sections.intelligence.form.priorityHint') }}
                  </p>
                </div>
              </div>
            </div>

            <div class="ProviderOverlay-Actions">
              <TxButton variant="secondary" size="small" @click="close">
                {{ t('dashboard.sections.intelligence.form.cancel') }}
              </TxButton>
              <TxButton variant="primary" size="small" :disabled="!form.name.trim() || formSaving" @click="submitForm">
                {{ formSaving ? t('dashboard.sections.intelligence.form.saving') : (formMode === 'create' ? t('dashboard.sections.intelligence.form.create') : t('dashboard.sections.intelligence.form.save')) }}
              </TxButton>
            </div>
          </div>
        </template>
      </FlipDialog>

    <!-- Provider Probe Overlay -->
    <FlipDialog
        v-model="showProbeOverlay"
        :reference="probeOverlaySource"
        size="lg"
      >
        <template #default="{ close }">
          <div class="ProviderOverlay-Inner">
            <div class="space-y-1">
              <h2 class="ProviderOverlay-Title">
                {{ t('dashboard.sections.intelligence.providers.probe.title') }}
              </h2>
              <p class="text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.intelligence.providers.probe.subtitle', { name: probeProvider?.name || '-' }) }}
              </p>
            </div>

            <div class="ProviderOverlay-Body space-y-4">
              <div v-if="probeProvider" class="grid gap-3 rounded-xl bg-black/[0.02] p-3 text-xs dark:bg-white/[0.03] sm:grid-cols-2">
                <div>
                  <p class="text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.intelligence.providers.probe.provider') }}
                  </p>
                  <p class="mt-1 font-medium text-black dark:text-white">
                    {{ probeProvider.name }}
                  </p>
                </div>
                <div>
                  <p class="text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.intelligence.providers.probe.type') }}
                  </p>
                  <p class="mt-1 font-medium text-black dark:text-white">
                    {{ providerTypeLabel(probeProvider.type) }}
                  </p>
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.providers.probe.model') }}
                </label>
                <TuffSelect v-if="probeModelOptions.length" v-model="probeModel" class="w-full">
                  <TuffSelectItem value="" :label="t('dashboard.sections.intelligence.providers.probe.modelAuto')" />
                  <TuffSelectItem
                    v-for="model in probeModelOptions"
                    :key="model"
                    :value="model"
                    :label="model"
                  />
                </TuffSelect>
                <TuffInput
                  v-else
                  v-model="probeModel"
                  :placeholder="t('dashboard.sections.intelligence.providers.probe.modelPlaceholder')"
                  class="w-full"
                />
                <p class="text-[11px] text-black/35 dark:text-white/35">
                  {{ t('dashboard.sections.intelligence.providers.probe.modelHint') }}
                </p>
              </div>

              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.intelligence.providers.probe.prompt') }}
                </label>
                <TuffInput
                  v-model="probePrompt"
                  type="textarea"
                  :placeholder="t('dashboard.sections.intelligence.providers.probe.promptPlaceholder')"
                  :rows="4"
                  class="w-full"
                />
              </div>

              <div
                v-if="probeLoading || probeStreamOutput || probeResult"
                class="space-y-3 rounded-2xl border px-4 py-3"
                :class="(probeResult?.success ?? true)
                  ? 'border-green-500/20 bg-green-500/10'
                  : 'border-red-500/20 bg-red-500/10'"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="flex items-center gap-2 text-sm font-medium" :class="(probeResult?.success ?? true) ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-300'">
                    <TxSpinner v-if="probeLoading" :size="14" />
                    <span>{{ probeResult?.message || probeStreamStatus || t('dashboard.sections.intelligence.providers.probe.streaming', '模型正在流式返回…') }}</span>
                  </p>
                  <p v-if="probeResult?.latency" class="text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.sections.intelligence.providers.probe.latency') }} {{ probeResult.latency }}ms
                  </p>
                </div>

                <div v-if="probeResult" class="grid gap-2 text-xs text-black/60 dark:text-white/60 sm:grid-cols-2">
                  <p>
                    <span class="text-black/40 dark:text-white/40">{{ t('dashboard.sections.intelligence.providers.probe.model') }}:</span>
                    {{ probeResult.model || '-' }}
                  </p>
                  <p>
                    <span class="text-black/40 dark:text-white/40">{{ t('dashboard.sections.intelligence.providers.probe.endpoint') }}:</span>
                    {{ probeResult.endpoint || '-' }}
                  </p>
                  <p>
                    <span class="text-black/40 dark:text-white/40">{{ t('dashboard.sections.intelligence.providers.probe.traceId') }}:</span>
                    {{ probeResult.traceId || '-' }}
                  </p>
                  <p>
                    <span class="text-black/40 dark:text-white/40">{{ t('dashboard.sections.intelligence.providers.probe.retry') }}:</span>
                    {{ probeResult.retryCount }}
                  </p>
                </div>

                <div v-if="probeStreamOutput || probeResult?.output" class="space-y-1">
                  <p class="text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.sections.intelligence.providers.probe.response') }}
                  </p>
                  <pre class="ProviderProbe-ResultText">{{ probeStreamOutput || probeResult?.output }}</pre>
                </div>

                <div v-if="probeResult?.error?.responseSnippet" class="space-y-1">
                  <p class="text-xs text-red-500">
                    {{ t('dashboard.sections.intelligence.providers.probe.errorSnippet') }}
                  </p>
                  <pre class="ProviderProbe-ErrorText">{{ probeResult.error.responseSnippet }}</pre>
                </div>
              </div>
            </div>

            <div class="ProviderOverlay-Actions">
              <TxButton variant="secondary" size="small" @click="closeProbeOverlay(close)">
                {{ t('dashboard.sections.intelligence.form.cancel') }}
              </TxButton>
              <TxButton
                v-if="probeLoading"
                variant="secondary"
                size="small"
                @click="abortProviderProbe"
              >
                {{ t('dashboard.sections.intelligence.providers.probe.stop', '停止') }}
              </TxButton>
              <TxButton
                variant="primary"
                size="small"
                :disabled="probeLoading || !probeProvider"
                @click="runProviderProbe"
              >
                {{ probeLoading ? t('dashboard.sections.intelligence.providers.probe.running') : t('dashboard.sections.intelligence.providers.probe.run') }}
              </TxButton>
            </div>
          </div>
        </template>
      </FlipDialog>

    <!-- Delete Confirm -->
    <TxPopperDialog
      v-if="deleteConfirmVisible"
      :comp="DeleteConfirmDialog"
      :close="closeDeleteConfirm"
    />
  </div>
</template>

<style scoped>
.ProviderOverlay-Inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 18px;
}

.ProviderOverlay-Body {
  flex: 1;
  overflow-y: auto;
}

.ProviderOverlay-Title {
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.ProviderOverlay-Actions {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

:root.dark .ProviderOverlay-Actions {
  border-top-color: rgba(255, 255, 255, 0.06);
}

.SceneListButton {
  width: 100%;
  min-height: 58px;
  justify-content: space-between;
  gap: 10px;
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.02);
}

.SceneListButton--active {
  background: rgba(64, 158, 255, 0.12);
  color: var(--tx-color-primary);
}

:root.dark .SceneListButton {
  background: rgba(255, 255, 255, 0.03);
}

:root.dark .SceneListButton--active {
  background: rgba(64, 158, 255, 0.18);
}

.ProviderProbe-ResultText {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.04);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.72);
}

.ProviderProbe-ErrorText {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 10px;
  background: rgba(220, 38, 38, 0.08);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #dc2626;
}

:root.dark .ProviderProbe-ResultText {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.78);
}

:root.dark .ProviderProbe-ErrorText {
  background: rgba(248, 113, 113, 0.12);
  color: rgba(252, 165, 165, 0.95);
}
</style>

<style>
.ProviderDeleteDialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 180px;
}

.ProviderDeleteDialog-Header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: center;
}

.ProviderDeleteDialog-Title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.ProviderDeleteDialog-Desc {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.ProviderDeleteDialog-Actions {
  margin-top: auto;
  display: flex;
  justify-content: center;
  gap: 10px;
}
</style>
