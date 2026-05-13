import { $fetch as rawFetch } from 'ofetch'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useToast } from '~/composables/useToast'
import {
  authTypeOptions,
  bindingStatusOptions,
  createProviderEditPanel,
  createSceneEditPanel,
  createSceneRunPanel,
  ensureUniqueCapabilities,
  fallbackOptions,
  formatDate,
  formatJson,
  formatRunJson,
  normalizeError,
  ownerScopeOptions,
  parseCommaList,
  parseJsonObjectField,
  providerStatusOptions,
  providerVendorOptions,
  sceneCapabilities,
  sceneOwnerOptions,
  statusTone,
  strategyOptions,
  type BindingFormRow,
  type BindingStatus,
  type CapabilityFormRow,
  type OwnerScope,
  type ProviderAuthType,
  type ProviderCapabilityRecord,
  type ProviderCheckResult,
  type ProviderEditPanelState,
  type ProviderHealthCheckEntry,
  type ProviderRegistryRecord,
  type ProviderStatus,
  type ProviderUsageLedgerEntry,
  type ProviderVendor,
  type SceneEditPanelState,
  type SceneFallback,
  type SceneOwner,
  type SceneRegistryRecord,
  type SceneRunPanelState,
  type SceneRunResult,
  type SceneStrategyMode,
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
  const savingScene = ref(false)
  const actionPending = ref<string | null>(null)
  const providerCheckResults = ref<Record<string, ProviderCheckResult>>({})
  const sceneRunPanels = reactive<Record<string, SceneRunPanelState>>({})
  const providerEditPanels = reactive<Record<string, ProviderEditPanelState>>({})
  const sceneEditPanels = reactive<Record<string, SceneEditPanelState>>({})
  const error = ref<string | null>(null)

  const providerForm = reactive({
    name: 'tencent-cloud-mt-main',
    displayName: 'Tencent Cloud Machine Translation',
    vendor: 'tencent-cloud' as ProviderVendor,
    status: 'disabled' as ProviderStatus,
    authType: 'secret_pair' as ProviderAuthType,
    authRef: 'secure://providers/tencent-cloud-mt-main',
    ownerScope: 'system' as OwnerScope,
    endpoint: 'https://tmt.tencentcloudapi.com',
    region: 'ap-shanghai',
    secretId: '',
    secretKey: '',
  })

  const capabilityRows = ref<CapabilityFormRow[]>([
    {
      capability: 'text.translate',
      schemaRef: 'nexus://schemas/provider/text-translate.v1',
      meteringUnit: 'character',
    },
    {
      capability: 'image.translate',
      schemaRef: 'nexus://schemas/provider/image-translate.v1',
      meteringUnit: 'image',
    },
    {
      capability: 'image.translate.e2e',
      schemaRef: 'nexus://schemas/provider/image-translate-e2e.v1',
      meteringUnit: 'image',
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

  function parseSceneRunInput(inputText: string) {
    const trimmed = inputText.trim()
    if (!trimmed)
      return undefined
    return JSON.parse(trimmed)
  }

  function getProviderCheckResult(providerId: string): ProviderCheckResult | null {
    return providerCheckResults.value[providerId] ?? null
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
        toast.warning(result.run.error?.message || t('dashboard.providerRegistry.errors.runSceneFailed', 'Failed to run scene.'))
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
    authTypeOptions,
    bindingRows,
    bindingStatusOptions,
    capabilities,
    capabilityCount,
    capabilityRows,
    checkProvider,
    createProvider,
    createScene,
    deleteProvider,
    deleteScene,
    enabledProviders,
    error,
    fallbackOptions,
    fetchRegistry,
    formatDate,
    formatJson,
    formatRunJson,
    getProviderCheckResult,
    getProviderEditPanel,
    getSceneEditPanel,
    getSceneRunPanel,
    healthEntries,
    isAdmin,
    loading,
    ownerScopeOptions,
    providerEditPanels,
    providerForm,
    providerOptions,
    providerStatusOptions,
    providers,
    providerVendorOptions,
    removeBindingRow,
    removeCapabilityRow,
    removeProviderCapabilityEditRow,
    removeSceneBindingEditRow,
    runScene,
    saveProviderEdit,
    saveSceneEdit,
    sceneCapabilities,
    sceneCount,
    sceneEditPanels,
    sceneForm,
    sceneOwnerOptions,
    sceneProviderOptions,
    scenes,
    savingProvider,
    savingScene,
    statusTone,
    strategyOptions,
    toggleProviderEdit,
    toggleSceneEdit,
    unhealthyCount,
    updateProviderStatus,
    updateSceneStatus,
    usageCount,
    usageEntries,
  }
}
