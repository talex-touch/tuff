import { $fetch as rawFetch } from 'ofetch'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useToast } from '~/composables/useToast'
import {
  authTypeOptions,
  bindingStatusOptions,
  createProviderEditPanel,
  createProviderQuotaPanel,
  createDefaultSceneCapabilityInput,
  createSceneEditPanel,
  createSceneRunPanel,
  ensureUniqueCapabilities,
  fallbackOptions,
  filterHealthCheckEntries,
  filterProvidersByObservability,
  filterScenesByObservability,
  filterUsageLedgerEntries,
  formatDate,
  formatJson,
  formatRunJson,
  normalizeError,
  ownerScopeOptions,
  providerServiceCategoryOptions,
  parseCommaList,
  parseJsonObjectField,
  providerStatusOptions,
  providerObservabilityFilters,
  providerRegistryTemplates,
  providerVendorOptions,
  observabilityTone,
  healthCheckFilters,
  resolveProviderObservability,
  resolveProviderObservabilityActionHint,
  resolveProviderObservabilityEmptyState,
  summarizeProviderQuotaList,
  resolveHealthCheckActionHint,
  resolveHealthCheckEmptyState,
  resolveHealthCheckReason,
  resolveSceneObservability,
  resolveSceneObservabilityActionHint,
  resolveSceneObservabilityEmptyState,
  resolveUsageLedgerActionHint,
  resolveUsageLedgerEmptyState,
  resolveUsageLedgerReference,
  sceneObservabilityFilters,
  sceneCapabilities,
  sceneOwnerOptions,
  statusTone,
  strategyOptions,
  usageLedgerFilters,
  type BindingFormRow,
  type BindingStatus,
  type CapabilityFormRow,
  type HealthCheckFilter,
  type OwnerScope,
  type ProviderAuthType,
  type ProviderCapabilityRecord,
  type ProviderCheckResult,
  type ProviderEditPanelState,
  type ProviderHealthCheckEntry,
  type ProviderObservabilityFilter,
  type ProviderObservabilitySummary,
  type ProviderQuotaPanelState,
  type ProviderQuotaRecord,
  type ProviderRegistryRecord,
  type ProviderServiceCategory,
  type ProviderRegistryTemplateId,
  type ProviderStatus,
  type ProviderUsageLedgerEntry,
  type ProviderVendor,
  type SceneEditPanelState,
  type SceneFallback,
  type SceneObservabilityFilter,
  type SceneObservabilitySummary,
  type SceneOwner,
  type SceneRegistryRecord,
  type SceneRunPanelState,
  type SceneRunResult,
  type SceneStrategyMode,
  type UsageLedgerFilter,
} from '~/utils/provider-registry-admin'

function providerCapabilityCollectionUrl(providerId: string): string {
  return `/api/dashboard/provider-registry/providers/${providerId}/capabilities`
}

function providerCapabilityUrl(providerId: string, capabilityId: string): string {
  return `${providerCapabilityCollectionUrl(providerId)}/${capabilityId}`
}

export function useProviderRegistryAdmin() {
  const { t } = useI18n()
  const { user } = useAuthUser()
  const toast = useToast()

  const isAdmin = computed(() => user.value?.role === 'admin')

  watch(isAdmin, (admin) => {
    if (user.value && !admin) {
      navigateTo('/dashboard/overview')
    }
  }, { immediate: true })

  const activeTab = ref('providers')
  const providers = ref<ProviderRegistryRecord[]>([])
  const capabilities = ref<ProviderCapabilityRecord[]>([])
  const scenes = ref<SceneRegistryRecord[]>([])
  const usageEntries = ref<ProviderUsageLedgerEntry[]>([])
  const healthEntries = ref<ProviderHealthCheckEntry[]>([])
  const loading = ref(false)
  const savingProvider = ref(false)
  const savingCapability = ref(false)
  const savingScene = ref(false)
  const actionPending = ref<string | null>(null)
  const providerCheckResults = ref<Record<string, ProviderCheckResult>>({})
  const providerObservabilityFilter = ref<ProviderObservabilityFilter>('all')
  const sceneObservabilityFilter = ref<SceneObservabilityFilter>('all')
  const usageLedgerFilter = ref<UsageLedgerFilter>('all')
  const healthCheckFilter = ref<HealthCheckFilter>('all')
  const sceneRunPanels = reactive<Record<string, SceneRunPanelState>>({})
  const providerEditPanels = reactive<Record<string, ProviderEditPanelState>>({})
  const providerQuotaPanels = reactive<Record<string, ProviderQuotaPanelState>>({})
  const sceneEditPanels = reactive<Record<string, SceneEditPanelState>>({})
  const providerQuotas = ref<Record<string, ProviderQuotaRecord | null>>({})
  const providerQuotaLists = ref<Record<string, ProviderQuotaRecord[]>>({})
  const error = ref<string | null>(null)
  const providerServiceCategoryId = ref<ProviderServiceCategory>('ai')
  const providerTemplateId = ref<ProviderRegistryTemplateId>('openai-compatible-ai')

  const providerForm = reactive({
    name: 'openai-compatible-ai-main',
    displayName: 'OpenAI Compatible AI',
    vendor: 'openai' as ProviderVendor,
    status: 'disabled' as ProviderStatus,
    authType: 'api_key' as ProviderAuthType,
    authRef: 'secure://providers/openai-compatible-ai-main',
    ownerScope: 'system' as OwnerScope,
    endpoint: 'https://api.openai.com/v1',
    region: 'global',
    secretId: '',
    secretKey: '',
  })

  const capabilityRows = ref<CapabilityFormRow[]>([
    {
      capability: 'chat.completion',
      schemaRef: 'nexus://schemas/provider/chat-completion.v1',
      meteringUnit: 'token',
    },
    {
      capability: 'text.summarize',
      schemaRef: 'nexus://schemas/provider/text-summarize.v1',
      meteringUnit: 'token',
    },
    {
      capability: 'content.extract',
      schemaRef: 'nexus://schemas/provider/content-extract.v1',
      meteringUnit: 'token',
    },
  ])

  const sceneForm = reactive({
    id: 'corebox.screenshot.translate',
    displayName: 'CoreBox Screenshot Translate',
    owner: 'core-app' as SceneOwner,
    ownerScope: 'system' as OwnerScope,
    status: 'enabled' as BindingStatus,
    requiredCapabilitiesText: 'image.translate.e2e',
    strategyMode: 'priority' as SceneStrategyMode,
    fallback: 'enabled' as SceneFallback,
  })

  const bindingRows = ref<BindingFormRow[]>([
    {
      providerId: '',
      capability: 'image.translate.e2e',
      priority: 10,
    },
  ])

  const enabledProviders = computed(() => providers.value.filter(item => item.status === 'enabled').length)
  const capabilityCount = computed(() => capabilities.value.length)
  const sceneCount = computed(() => scenes.value.length)
  const usageCount = computed(() => usageEntries.value.length)
  const unhealthyCount = computed(() => healthEntries.value.filter(item => item.status !== 'healthy').length)
  const providerOptions = computed(() => providers.value.map(provider => ({
    value: provider.id,
    label: `${provider.displayName} · ${provider.vendor}`,
  })))
  const providerObservabilityById = computed<Record<string, ProviderObservabilitySummary>>(() => Object.fromEntries(
    providers.value.map(provider => [
      provider.id,
      resolveProviderObservability(provider.id, healthEntries.value, usageEntries.value),
    ]),
  ))
  const sceneObservabilityById = computed<Record<string, SceneObservabilitySummary>>(() => Object.fromEntries(
    scenes.value.map(scene => [
      scene.id,
      resolveSceneObservability(scene.id, usageEntries.value),
    ]),
  ))
  const filteredProviders = computed(() => filterProvidersByObservability(
    providers.value,
    providerObservabilityById.value,
    providerObservabilityFilter.value,
  ))
  const filteredScenes = computed(() => filterScenesByObservability(
    scenes.value,
    sceneObservabilityById.value,
    sceneObservabilityFilter.value,
  ))
  const filteredUsageEntries = computed(() => filterUsageLedgerEntries(
    usageEntries.value,
    usageLedgerFilter.value,
  ))
  const filteredHealthEntries = computed(() => filterHealthCheckEntries(
    healthEntries.value,
    healthCheckFilter.value,
  ))
  const providerObservabilityEmptyState = computed(() => resolveProviderObservabilityEmptyState(
    providers.value,
    providerObservabilityById.value,
    providerObservabilityFilter.value,
  ))
  const sceneObservabilityEmptyState = computed(() => resolveSceneObservabilityEmptyState(
    scenes.value,
    sceneObservabilityById.value,
    sceneObservabilityFilter.value,
  ))
  const usageLedgerEmptyState = computed(() => resolveUsageLedgerEmptyState(
    usageEntries.value,
    usageLedgerFilter.value,
  ))
  const healthCheckEmptyState = computed(() => resolveHealthCheckEmptyState(
    healthEntries.value,
    healthCheckFilter.value,
  ))
  const providerFilterOptions = computed(() => providerObservabilityFilters.map(filter => ({
    value: filter,
    label: filter,
    count: filterProvidersByObservability(providers.value, providerObservabilityById.value, filter).length,
  })))
  const sceneFilterOptions = computed(() => sceneObservabilityFilters.map(filter => ({
    value: filter,
    label: filter,
    count: filterScenesByObservability(scenes.value, sceneObservabilityById.value, filter).length,
  })))
  const usageFilterOptions = computed(() => usageLedgerFilters.map(filter => ({
    value: filter,
    label: filter,
    count: filterUsageLedgerEntries(usageEntries.value, filter).length,
  })))
  const healthFilterOptions = computed(() => healthCheckFilters.map(filter => ({
    value: filter,
    label: filter,
    count: filterHealthCheckEntries(healthEntries.value, filter).length,
  })))
  const providerServiceCategoryOptionsView = computed(() => providerServiceCategoryOptions.map(category => ({
    value: category,
    label: category,
  })))
  const providerTemplateOptions = computed(() => providerRegistryTemplates
    .filter(template => template.serviceCategory === providerServiceCategoryId.value)
    .map(template => ({
    value: template.id,
    label: template.displayName,
  })))

  function applyProviderTemplate(templateId: ProviderRegistryTemplateId | string | number) {
    const template = providerRegistryTemplates.find(item => item.id === String(templateId))
    if (!template)
      return

    providerServiceCategoryId.value = template.serviceCategory
    providerTemplateId.value = template.id
    providerForm.name = template.name
    providerForm.displayName = template.displayName
    providerForm.vendor = template.vendor
    providerForm.status = 'disabled'
    providerForm.authType = template.authType
    providerForm.authRef = template.authRef
    providerForm.ownerScope = 'system'
    providerForm.endpoint = template.endpoint
    providerForm.region = template.region
    providerForm.secretId = ''
    providerForm.secretKey = ''
    capabilityRows.value = template.capabilities.map(row => ({ ...row }))
  }

  function applyProviderServiceCategory(category: ProviderServiceCategory | string | number) {
    const normalized = String(category) as ProviderServiceCategory
    const template = providerRegistryTemplates.find(item => item.serviceCategory === normalized)
    if (!template)
      return

    providerServiceCategoryId.value = normalized
    applyProviderTemplate(template.id)
  }

  function addCapabilityRow() {
    capabilityRows.value.push({ capability: '', schemaRef: '', meteringUnit: 'request' })
  }

  function removeCapabilityRow(index: number) {
    capabilityRows.value.splice(index, 1)
  }

  function addBindingRow() {
    bindingRows.value.push({ providerId: providers.value[0]?.id ?? '', capability: '', priority: 100 })
  }

  function removeBindingRow(index: number) {
    bindingRows.value.splice(index, 1)
  }

  function getProviderEditPanel(provider: ProviderRegistryRecord): ProviderEditPanelState {
    let panel = providerEditPanels[provider.id]
    if (!panel) {
      panel = createProviderEditPanel(provider)
      providerEditPanels[provider.id] = panel
    }
    return panel
  }

  function getProviderQuotaPanel(provider: ProviderRegistryRecord): ProviderQuotaPanelState {
    let panel = providerQuotaPanels[provider.id]
    if (!panel) {
      panel = createProviderQuotaPanel(provider, providerQuotas.value[provider.id])
      providerQuotaPanels[provider.id] = panel
    }
    return panel
  }

  function getProviderAdapterSummary(provider: ProviderRegistryRecord) {
    const total = provider.capabilities.length
    const ready = provider.capabilities.filter(item => item.adapter?.ready).length
    const missingCapabilities = provider.capabilities
      .filter(item => item.adapter && !item.adapter.ready)
      .map(item => `${item.capability}:${item.adapter?.reason ?? 'adapter-missing'}`)

    return {
      total,
      ready,
      missing: Math.max(0, total - ready),
      missingCapabilities,
    }
  }

  function getSceneEditPanel(scene: SceneRegistryRecord): SceneEditPanelState {
    let panel = sceneEditPanels[scene.id]
    if (!panel) {
      panel = createSceneEditPanel(scene)
      sceneEditPanels[scene.id] = panel
    }
    return panel
  }

  function addProviderCapabilityEditRow(provider: ProviderRegistryRecord) {
    getProviderEditPanel(provider).capabilities.push({
      capability: '',
      schemaRef: '',
      meteringText: '',
      constraintsText: '',
      metadataText: '',
    })
  }

  function removeProviderCapabilityEditRow(provider: ProviderRegistryRecord, index: number) {
    const panel = getProviderEditPanel(provider)
    const [removed] = panel.capabilities.splice(index, 1)
    if (removed?.id)
      panel.removedCapabilityIds.push(removed.id)
  }

  function addSceneBindingEditRow(scene: SceneRegistryRecord) {
    getSceneEditPanel(scene).bindings.push({
      providerId: providers.value[0]?.id ?? '',
      capability: scene.requiredCapabilities[0] ?? '',
      priority: 100,
      weightText: '',
      status: 'enabled',
      constraintsText: '',
      metadataText: '',
    })
  }

  function removeSceneBindingEditRow(scene: SceneRegistryRecord, index: number) {
    getSceneEditPanel(scene).bindings.splice(index, 1)
  }

  function parseRequiredCapabilities() {
    return parseCommaList(sceneForm.requiredCapabilitiesText)
  }

  async function syncProviderCapabilities(provider: ProviderRegistryRecord, panel: ProviderEditPanelState) {
    const blankedExistingCapabilityIds = panel.capabilities
      .filter(row => row.id && !row.capability.trim())
      .map(row => row.id as string)
    const capabilityInputs = panel.capabilities
      .filter(row => row.capability.trim())
      .map((row, index) => ({
        id: row.id,
        capability: row.capability.trim(),
        schemaRef: row.schemaRef.trim() || null,
        metering: parseJsonObjectField(row.meteringText, `capabilities[${index}].metering`),
        constraints: parseJsonObjectField(row.constraintsText, `capabilities[${index}].constraints`),
        metadata: parseJsonObjectField(row.metadataText, `capabilities[${index}].metadata`),
      }))

    ensureUniqueCapabilities(capabilityInputs)

    for (const capabilityId of new Set([...panel.removedCapabilityIds, ...blankedExistingCapabilityIds])) {
      await rawFetch(providerCapabilityUrl(provider.id, capabilityId), {
        method: 'DELETE',
      })
    }

    for (const capability of capabilityInputs) {
      if (capability.id) {
        await rawFetch(providerCapabilityUrl(provider.id, capability.id), {
          method: 'PATCH',
          body: {
            capability: capability.capability,
            schemaRef: capability.schemaRef,
            metering: capability.metering,
            constraints: capability.constraints,
            metadata: capability.metadata,
          },
        })
        continue
      }

      await rawFetch(providerCapabilityCollectionUrl(provider.id), {
        method: 'POST',
        body: {
          capability: capability.capability,
          schemaRef: capability.schemaRef,
          metering: capability.metering,
          constraints: capability.constraints,
          metadata: capability.metadata,
        },
      })
    }
  }

  function toggleProviderEdit(provider: ProviderRegistryRecord) {
    const current = providerEditPanels[provider.id]
    if (current?.expanded) {
      current.expanded = false
      return
    }
    providerEditPanels[provider.id] = createProviderEditPanel(provider)
  }

  function toggleProviderQuota(provider: ProviderRegistryRecord) {
    const current = providerQuotaPanels[provider.id]
    if (current?.expanded) {
      current.expanded = false
      return
    }
    providerQuotaPanels[provider.id] = createProviderQuotaPanel(provider, providerQuotas.value[provider.id])
  }

  function toggleSceneEdit(scene: SceneRegistryRecord) {
    const current = sceneEditPanels[scene.id]
    if (current?.expanded) {
      current.expanded = false
      return
    }
    sceneEditPanels[scene.id] = createSceneEditPanel(scene)
  }

  function sceneProviderOptions(scene: SceneRegistryRecord) {
    const providerIds = new Set(scene.bindings.map(binding => binding.providerId))
    return providerOptions.value.filter(provider => providerIds.has(provider.value))
  }

  function getSceneRunPanel(scene: SceneRegistryRecord): SceneRunPanelState {
    let panel = sceneRunPanels[scene.id]
    if (!panel) {
      panel = createSceneRunPanel(scene)
      sceneRunPanels[scene.id] = panel
    }
    return panel
  }

  function applySceneRunCapabilitySample(scene: SceneRegistryRecord, capability: string) {
    const panel = getSceneRunPanel(scene)
    const normalizedCapability = capability.trim()
    panel.capability = normalizedCapability
    panel.inputText = formatRunJson(
      normalizedCapability
        ? createDefaultSceneCapabilityInput(normalizedCapability)
        : createDefaultSceneCapabilityInput(sceneCapabilities(scene)),
    )
    panel.result = null
    panel.error = null
  }

  function parseSceneRunInput(inputText: string) {
    const trimmed = inputText.trim()
    if (!trimmed)
      return undefined
    return JSON.parse(trimmed)
  }

  function getProviderCheckResult(providerId: string): ProviderCheckResult | null {
    return providerCheckResults.value[providerId] ?? null
  }

  function getProviderObservability(providerId: string) {
    return providerObservabilityById.value[providerId] ?? resolveProviderObservability(providerId, healthEntries.value, usageEntries.value)
  }

  function getProviderObservabilityActionHint(providerId: string) {
    return resolveProviderObservabilityActionHint(getProviderObservability(providerId))
  }

  function getProviderQuotaSummary(providerId: string) {
    return summarizeProviderQuotaList(getProviderQuotaList(providerId))
  }

  function getProviderQuotaList(providerId: string) {
    return providerQuotaLists.value[providerId] ?? (providerQuotas.value[providerId] ? [providerQuotas.value[providerId]!] : [])
  }

  function parseQuotaNumber(value: string, field: string, min = 0, max?: number): number | undefined {
    const trimmed = value.trim()
    if (!trimmed)
      return undefined
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < min || (max !== undefined && parsed > max)) {
      const range = max === undefined ? `greater than or equal to ${min}` : `between ${min} and ${max}`
      throw new Error(`${field} must be a number ${range}.`)
    }
    return parsed
  }

  function getUsageLedgerActionHint(entry: ProviderUsageLedgerEntry) {
    return resolveUsageLedgerActionHint(entry)
  }

  function getUsageLedgerReference(entry: ProviderUsageLedgerEntry) {
    return resolveUsageLedgerReference(entry)
  }

  function getHealthCheckActionHint(entry: ProviderHealthCheckEntry) {
    return resolveHealthCheckActionHint(entry)
  }

  function getHealthCheckReason(entry: ProviderHealthCheckEntry) {
    return resolveHealthCheckReason(entry)
  }

  function getSceneObservability(sceneId: string) {
    return sceneObservabilityById.value[sceneId] ?? resolveSceneObservability(sceneId, usageEntries.value)
  }

  function getSceneObservabilityActionHint(sceneId: string) {
    return resolveSceneObservabilityActionHint(getSceneObservability(sceneId))
  }

  async function fetchRegistry() {
    loading.value = true
    error.value = null
    try {
      await rawFetch('/api/dashboard/provider-registry/seed', { method: 'POST' })
      const [providerResult, capabilityResult, sceneResult, usageResult, healthResult] = await Promise.all([
        rawFetch<{ providers: ProviderRegistryRecord[] }>('/api/dashboard/provider-registry/providers'),
        rawFetch<{ capabilities: ProviderCapabilityRecord[] }>('/api/dashboard/provider-registry/capabilities'),
        rawFetch<{ scenes: SceneRegistryRecord[] }>('/api/dashboard/provider-registry/scenes'),
        rawFetch<{ entries: ProviderUsageLedgerEntry[] }>('/api/dashboard/provider-registry/usage', {
          query: { limit: 25 },
        }),
        rawFetch<{ entries: ProviderHealthCheckEntry[] }>('/api/dashboard/provider-registry/health', {
          query: { limit: 25 },
        }),
      ])
      providers.value = providerResult.providers ?? []
      capabilities.value = capabilityResult.capabilities ?? []
      scenes.value = sceneResult.scenes ?? []
      usageEntries.value = usageResult.entries ?? []
      healthEntries.value = healthResult.entries ?? []
      const quotaEntries = await Promise.all(providers.value.map(async provider => {
        const result = await rawFetch<{ quota: ProviderQuotaRecord | null, quotas?: ProviderQuotaRecord[] }>(`/api/dashboard/provider-registry/providers/${encodeURIComponent(provider.id)}/quota`)
        return [provider.id, result] as const
      }))
      providerQuotas.value = Object.fromEntries(quotaEntries.map(([providerId, result]) => [providerId, result.quota]))
      providerQuotaLists.value = Object.fromEntries(quotaEntries.map(([providerId, result]) => [providerId, result.quotas ?? (result.quota ? [result.quota] : [])]))

      const firstBinding = bindingRows.value[0]
      const firstProvider = providers.value[0]
      if (firstBinding && !firstBinding.providerId && firstProvider) {
        firstBinding.providerId = firstProvider.id
      }
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.loadFailed', 'Failed to load provider registry.'))
    }
    finally {
      loading.value = false
    }
  }

  async function createProvider() {
    savingProvider.value = true
    error.value = null
    try {
      const targetStatus = providerForm.status
      const hasCredentialInput = providerForm.authType === 'secret_pair'
        && providerForm.secretId.trim()
        && providerForm.secretKey.trim()
      const body = {
        name: providerForm.name.trim(),
        displayName: providerForm.displayName.trim(),
        vendor: providerForm.vendor,
        status: hasCredentialInput ? 'disabled' : providerForm.status,
        authType: providerForm.authType,
        authRef: providerForm.authType === 'none' ? undefined : providerForm.authRef.trim(),
        ownerScope: providerForm.ownerScope,
        endpoint: providerForm.endpoint.trim() || undefined,
        region: providerForm.region.trim() || undefined,
        metadata: providerRegistryTemplates.find(item => item.id === providerTemplateId.value)?.metadata ?? undefined,
        capabilities: capabilityRows.value
          .filter(row => row.capability.trim())
          .map(row => ({
            capability: row.capability.trim(),
            schemaRef: row.schemaRef.trim() || undefined,
            metering: row.meteringUnit.trim() ? { unit: row.meteringUnit.trim() } : undefined,
          })),
      }

      await rawFetch('/api/dashboard/provider-registry/providers', {
        method: 'POST',
        body,
      })

      if (hasCredentialInput) {
        await rawFetch('/api/dashboard/provider-registry/credentials', {
          method: 'POST',
          body: {
            authRef: providerForm.authRef.trim(),
            authType: providerForm.authType,
            credentials: {
              secretId: providerForm.secretId.trim(),
              secretKey: providerForm.secretKey,
            },
          },
        })
        providerForm.secretId = ''
        providerForm.secretKey = ''

        if (targetStatus !== 'disabled') {
          const providerResult = await rawFetch<{ providers: ProviderRegistryRecord[] }>('/api/dashboard/provider-registry/providers', {
            query: { vendor: providerForm.vendor },
          })
          const provider = (providerResult.providers ?? []).find(item => item.authRef === providerForm.authRef.trim())
          if (provider) {
            await rawFetch(`/api/dashboard/provider-registry/providers/${provider.id}`, {
              method: 'PATCH',
              body: { status: targetStatus },
            })
          }
        }
      }
      toast.success(t('dashboard.providerRegistry.providers.created', 'Provider created.'))
      await fetchRegistry()
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.createProviderFailed', 'Failed to create provider.'))
      toast.warning(error.value || t('dashboard.providerRegistry.errors.createProviderFailed', 'Failed to create provider.'))
    }
    finally {
      savingProvider.value = false
    }
  }

  async function checkProvider(provider: ProviderRegistryRecord) {
    actionPending.value = `provider:${provider.id}:check`
    error.value = null
    try {
      const result = await rawFetch<ProviderCheckResult>(`/api/dashboard/provider-registry/providers/${provider.id}/check`, {
        method: 'POST',
        body: { capability: 'text.translate' },
      })
      providerCheckResults.value = {
        ...providerCheckResults.value,
        [provider.id]: result,
      }
      if (result.success) {
        toast.success(result.message || t('dashboard.providerRegistry.providers.checkSucceeded', 'Provider check succeeded.'))
      }
      else {
        toast.warning(result.message || t('dashboard.providerRegistry.providers.checkFailed', 'Provider check failed.'))
      }
    }
    catch (err: any) {
      const message = normalizeError(err, t('dashboard.providerRegistry.errors.checkProviderFailed', 'Failed to check provider.'))
      error.value = message
      providerCheckResults.value = {
        ...providerCheckResults.value,
        [provider.id]: {
          success: false,
          providerId: provider.id,
          capability: 'text.translate',
          latency: 0,
          endpoint: provider.endpoint || '',
          message,
          error: { message },
        },
      }
      toast.warning(message)
    }
    finally {
      actionPending.value = null
    }
  }

  async function updateProviderStatus(provider: ProviderRegistryRecord, status: ProviderStatus) {
    actionPending.value = `provider:${provider.id}:${status}`
    error.value = null
    try {
      await rawFetch(`/api/dashboard/provider-registry/providers/${provider.id}`, {
        method: 'PATCH',
        body: { status },
      })
      await fetchRegistry()
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.updateProviderFailed', 'Failed to update provider.'))
      toast.warning(error.value || t('dashboard.providerRegistry.errors.updateProviderFailed', 'Failed to update provider.'))
    }
    finally {
      actionPending.value = null
    }
  }

  async function saveProviderEdit(provider: ProviderRegistryRecord) {
    const panel = getProviderEditPanel(provider)
    panel.saving = true
    panel.error = null
    error.value = null
    try {
      const body = {
        name: panel.name.trim(),
        displayName: panel.displayName.trim(),
        vendor: panel.vendor,
        status: panel.status,
        authType: panel.authType,
        authRef: panel.authType === 'none' ? undefined : panel.authRef.trim(),
        ownerScope: panel.ownerScope,
        ownerId: panel.ownerId.trim() || null,
        description: panel.description.trim() || null,
        endpoint: panel.endpoint.trim() || null,
        region: panel.region.trim() || null,
        metadata: parseJsonObjectField(panel.metadataText, 'provider.metadata'),
      }

      await rawFetch(`/api/dashboard/provider-registry/providers/${provider.id}`, {
        method: 'PATCH',
        body,
      })
      await syncProviderCapabilities(provider, panel)
      toast.success(t('dashboard.providerRegistry.providers.updated', 'Provider updated.'))
      delete providerEditPanels[provider.id]
      await fetchRegistry()
    }
    catch (err: any) {
      const message = normalizeError(err, t('dashboard.providerRegistry.errors.updateProviderFailed', 'Failed to update provider.'))
      panel.error = message
      error.value = message
      toast.warning(message)
    }
    finally {
      panel.saving = false
    }
  }

  async function saveProviderQuota(provider: ProviderRegistryRecord) {
    const panel = getProviderQuotaPanel(provider)
    panel.saving = true
    panel.error = null
    error.value = null
    try {
      const windowDays = parseQuotaNumber(panel.windowDays, 'windowDays', 1) ?? 30
      const maxRequests = parseQuotaNumber(panel.maxRequests, 'maxRequests')
      const maxTokens = parseQuotaNumber(panel.maxTokens, 'maxTokens')
      const warningThreshold = parseQuotaNumber(panel.warningThreshold, 'warningThreshold', 0, 100)
      const limits: Record<string, number> = { windowDays }
      if (maxRequests !== undefined)
        limits.maxRequests = maxRequests
      if (maxTokens !== undefined)
        limits.maxTokens = maxTokens

      const result = await rawFetch<{ quota: ProviderQuotaRecord }>(`/api/dashboard/provider-registry/providers/${encodeURIComponent(provider.id)}/quota`, {
        method: 'POST',
        body: {
          name: panel.name.trim() || `${provider.displayName} quota`,
          enabled: panel.enabled === 'enabled',
          limits,
          warningThreshold,
          config: {
            source: 'provider-registry-panel',
          },
        },
      })
      providerQuotas.value = {
        ...providerQuotas.value,
        [provider.id]: result.quota,
      }
      providerQuotaLists.value = {
        ...providerQuotaLists.value,
        [provider.id]: [result.quota],
      }
      toast.success(t('dashboard.providerRegistry.quota.saved', 'Provider quota saved.'))
    }
    catch (err: any) {
      const message = normalizeError(err, t('dashboard.providerRegistry.errors.saveQuotaFailed', 'Failed to save provider quota.'))
      panel.error = message
      error.value = message
      toast.warning(message)
    }
    finally {
      panel.saving = false
    }
  }

  async function deleteProvider(provider: ProviderRegistryRecord) {
    actionPending.value = `provider:${provider.id}:delete`
    error.value = null
    try {
      await rawFetch(`/api/dashboard/provider-registry/providers/${provider.id}`, {
        method: 'DELETE',
      })
      await fetchRegistry()
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.deleteProviderFailed', 'Failed to delete provider.'))
      toast.warning(error.value || t('dashboard.providerRegistry.errors.deleteProviderFailed', 'Failed to delete provider.'))
    }
    finally {
      actionPending.value = null
    }
  }

  async function createCapability(providerId: string, input: {
    capability: string
    schemaRef: string
    meteringText: string
    constraintsText: string
    metadataText: string
  }) {
    savingCapability.value = true
    error.value = null
    try {
      await rawFetch(providerCapabilityCollectionUrl(providerId), {
        method: 'POST',
        body: {
          capability: input.capability.trim(),
          schemaRef: input.schemaRef.trim() || null,
          metering: parseJsonObjectField(input.meteringText, 'capability.metering'),
          constraints: parseJsonObjectField(input.constraintsText, 'capability.constraints'),
          metadata: parseJsonObjectField(input.metadataText, 'capability.metadata'),
        },
      })
      toast.success(t('dashboard.providerRegistry.capabilities.created', 'Capability created.'))
      await fetchRegistry()
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.createCapabilityFailed', 'Failed to create capability.'))
      toast.warning(error.value || t('dashboard.providerRegistry.errors.createCapabilityFailed', 'Failed to create capability.'))
    }
    finally {
      savingCapability.value = false
    }
  }

  async function saveCapabilityEdit(capability: ProviderCapabilityRecord, input: {
    capability: string
    schemaRef: string
    meteringText: string
    constraintsText: string
    metadataText: string
  }) {
    savingCapability.value = true
    error.value = null
    try {
      await rawFetch(providerCapabilityUrl(capability.providerId, capability.id), {
        method: 'PATCH',
        body: {
          capability: input.capability.trim(),
          schemaRef: input.schemaRef.trim() || null,
          metering: parseJsonObjectField(input.meteringText, 'capability.metering'),
          constraints: parseJsonObjectField(input.constraintsText, 'capability.constraints'),
          metadata: parseJsonObjectField(input.metadataText, 'capability.metadata'),
        },
      })
      toast.success(t('dashboard.providerRegistry.capabilities.updated', 'Capability updated.'))
      await fetchRegistry()
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.updateCapabilityFailed', 'Failed to update capability.'))
      toast.warning(error.value || t('dashboard.providerRegistry.errors.updateCapabilityFailed', 'Failed to update capability.'))
    }
    finally {
      savingCapability.value = false
    }
  }

  async function deleteCapability(capability: ProviderCapabilityRecord) {
    actionPending.value = `capability:${capability.id}:delete`
    error.value = null
    try {
      await rawFetch(providerCapabilityUrl(capability.providerId, capability.id), {
        method: 'DELETE',
      })
      await fetchRegistry()
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.deleteCapabilityFailed', 'Failed to delete capability.'))
      toast.warning(error.value || t('dashboard.providerRegistry.errors.deleteCapabilityFailed', 'Failed to delete capability.'))
    }
    finally {
      actionPending.value = null
    }
  }

  async function createScene() {
    savingScene.value = true
    error.value = null
    try {
      const body = {
        id: sceneForm.id.trim(),
        displayName: sceneForm.displayName.trim(),
        owner: sceneForm.owner,
        ownerScope: sceneForm.ownerScope,
        status: sceneForm.status,
        requiredCapabilities: parseRequiredCapabilities(),
        strategyMode: sceneForm.strategyMode,
        fallback: sceneForm.fallback,
        auditPolicy: {
          persistInput: false,
          persistOutput: false,
        },
        bindings: bindingRows.value
          .filter(row => row.providerId && row.capability.trim())
          .map(row => ({
            providerId: row.providerId,
            capability: row.capability.trim(),
            priority: Number(row.priority) || 100,
          })),
      }

      await rawFetch('/api/dashboard/provider-registry/scenes', {
        method: 'POST',
        body,
      })
      toast.success(t('dashboard.providerRegistry.scenes.created', 'Scene created.'))
      await fetchRegistry()
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.createSceneFailed', 'Failed to create scene.'))
      toast.warning(error.value || t('dashboard.providerRegistry.errors.createSceneFailed', 'Failed to create scene.'))
    }
    finally {
      savingScene.value = false
    }
  }

  async function updateSceneStatus(scene: SceneRegistryRecord, status: BindingStatus) {
    actionPending.value = `scene:${scene.id}:${status}`
    error.value = null
    try {
      await rawFetch(`/api/dashboard/provider-registry/scenes/${scene.id}`, {
        method: 'PATCH',
        body: { status },
      })
      await fetchRegistry()
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.updateSceneFailed', 'Failed to update scene.'))
      toast.warning(error.value || t('dashboard.providerRegistry.errors.updateSceneFailed', 'Failed to update scene.'))
    }
    finally {
      actionPending.value = null
    }
  }

  async function saveSceneEdit(scene: SceneRegistryRecord) {
    const panel = getSceneEditPanel(scene)
    panel.saving = true
    panel.error = null
    error.value = null
    try {
      const body = {
        displayName: panel.displayName.trim(),
        owner: panel.owner,
        ownerScope: panel.ownerScope,
        ownerId: panel.ownerId.trim() || null,
        status: panel.status,
        requiredCapabilities: parseCommaList(panel.requiredCapabilitiesText),
        strategyMode: panel.strategyMode,
        fallback: panel.fallback,
        meteringPolicy: parseJsonObjectField(panel.meteringPolicyText, 'scene.meteringPolicy'),
        auditPolicy: parseJsonObjectField(panel.auditPolicyText, 'scene.auditPolicy'),
        metadata: parseJsonObjectField(panel.metadataText, 'scene.metadata'),
        bindings: panel.bindings
          .filter(row => row.providerId && row.capability.trim())
          .map((row, index) => ({
            providerId: row.providerId,
            capability: row.capability.trim(),
            priority: Number(row.priority) || 100,
            weight: row.weightText.trim() ? Number(row.weightText) : undefined,
            status: row.status,
            constraints: parseJsonObjectField(row.constraintsText, `bindings[${index}].constraints`),
            metadata: parseJsonObjectField(row.metadataText, `bindings[${index}].metadata`),
          })),
      }

      await rawFetch(`/api/dashboard/provider-registry/scenes/${encodeURIComponent(scene.id)}`, {
        method: 'PATCH',
        body,
      })
      toast.success(t('dashboard.providerRegistry.scenes.updated', 'Scene updated.'))
      delete sceneEditPanels[scene.id]
      await fetchRegistry()
    }
    catch (err: any) {
      const message = normalizeError(err, t('dashboard.providerRegistry.errors.updateSceneFailed', 'Failed to update scene.'))
      panel.error = message
      error.value = message
      toast.warning(message)
    }
    finally {
      panel.saving = false
    }
  }

  async function runScene(scene: SceneRegistryRecord, dryRun: boolean) {
    const panel = getSceneRunPanel(scene)
    const pendingKey = `scene:${scene.id}:run:${dryRun ? 'dry' : 'execute'}`
    actionPending.value = pendingKey
    error.value = null
    panel.error = null
    try {
      const input = parseSceneRunInput(panel.inputText)
      const result = await rawFetch<{ run: SceneRunResult }>(`/api/dashboard/provider-registry/scenes/${encodeURIComponent(scene.id)}/run`, {
        method: 'POST',
        body: {
          input,
          capability: panel.capability.trim() || undefined,
          providerId: panel.providerId || undefined,
          dryRun,
        },
      })
      panel.result = result.run
      if (result.run.status === 'failed') {
        const message = result.run.error?.message || t('dashboard.providerRegistry.errors.runSceneFailed', 'Failed to run scene.')
        panel.error = message
        toast.warning(message)
      }
      else {
        toast.success(dryRun
          ? t('dashboard.providerRegistry.scenes.dryRunCompleted', 'Scene dry run completed.')
          : t('dashboard.providerRegistry.scenes.runCompleted', 'Scene run completed.'))
      }
      await fetchRegistry()
    }
    catch (err: any) {
      const message = normalizeError(err, t('dashboard.providerRegistry.errors.runSceneFailed', 'Failed to run scene.'))
      const failedRun = err?.data?.data?.run || err?.data?.run
      if (failedRun)
        panel.result = failedRun
      panel.error = message
      error.value = message
      toast.warning(message)
    }
    finally {
      actionPending.value = null
    }
  }

  async function deleteScene(scene: SceneRegistryRecord) {
    actionPending.value = `scene:${scene.id}:delete`
    error.value = null
    try {
      await rawFetch(`/api/dashboard/provider-registry/scenes/${scene.id}`, {
        method: 'DELETE',
      })
      await fetchRegistry()
    }
    catch (err: any) {
      error.value = normalizeError(err, t('dashboard.providerRegistry.errors.deleteSceneFailed', 'Failed to delete scene.'))
      toast.warning(error.value || t('dashboard.providerRegistry.errors.deleteSceneFailed', 'Failed to delete scene.'))
    }
    finally {
      actionPending.value = null
    }
  }

  onMounted(() => {
    fetchRegistry()
  })

  return {
    activeTab,
    actionPending,
    addBindingRow,
    addCapabilityRow,
    addProviderCapabilityEditRow,
    addSceneBindingEditRow,
    applyProviderServiceCategory,
    applyProviderTemplate,
    authTypeOptions,
    bindingRows,
    bindingStatusOptions,
    capabilities,
    capabilityCount,
    capabilityRows,
    checkProvider,
    createCapability,
    createProvider,
    createScene,
    deleteCapability,
    deleteProvider,
    deleteScene,
    enabledProviders,
    error,
    fallbackOptions,
    fetchRegistry,
    filteredHealthEntries,
    filteredProviders,
    filteredScenes,
    filteredUsageEntries,
    formatDate,
    formatJson,
    formatRunJson,
    getProviderCheckResult,
    getProviderEditPanel,
    getProviderQuotaPanel,
    getProviderAdapterSummary,
    getProviderQuotaList,
    getProviderQuotaSummary,
    getHealthCheckActionHint,
    getHealthCheckReason,
    getProviderObservability,
    getProviderObservabilityActionHint,
    getSceneEditPanel,
    getSceneObservability,
    getSceneObservabilityActionHint,
    getSceneRunPanel,
    applySceneRunCapabilitySample,
    getUsageLedgerActionHint,
    getUsageLedgerReference,
    healthCheckEmptyState,
    healthCheckFilter,
    healthFilterOptions,
    healthEntries,
    isAdmin,
    loading,
    ownerScopeOptions,
    providerEditPanels,
    providerForm,
    providerFilterOptions,
    providerObservabilityFilter,
    providerObservabilityEmptyState,
    providerOptions,
    providerStatusOptions,
    providerServiceCategoryId,
    providerServiceCategoryOptions: providerServiceCategoryOptionsView,
    providerTemplateId,
    providerTemplateOptions,
    providers,
    providerQuotaPanels,
    providerQuotas,
    providerVendorOptions,
    removeBindingRow,
    removeCapabilityRow,
    removeProviderCapabilityEditRow,
    removeSceneBindingEditRow,
    runScene,
    saveCapabilityEdit,
    saveProviderEdit,
    saveProviderQuota,
    saveSceneEdit,
    sceneCapabilities,
    sceneCount,
    sceneEditPanels,
    sceneFilterOptions,
    sceneForm,
    sceneObservabilityFilter,
    sceneObservabilityEmptyState,
    sceneOwnerOptions,
    sceneProviderOptions,
    scenes,
    savingCapability,
    savingProvider,
    savingScene,
    observabilityTone,
    statusTone,
    strategyOptions,
    toggleProviderEdit,
    toggleProviderQuota,
    toggleSceneEdit,
    unhealthyCount,
    updateProviderStatus,
    updateSceneStatus,
    usageCount,
    usageFilterOptions,
    usageLedgerEmptyState,
    usageLedgerFilter,
    usageEntries,
  }
}
