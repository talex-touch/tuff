import { createProviderRegistryCrudService } from '~/composables/provider-registry/provider-registry-crud-service'
import { createProviderRegistrySceneObservabilityService } from '~/composables/provider-registry/provider-registry-scene-observability-service'
import { computed, reactive, ref, watch } from 'vue'
import { useAdminResource } from '~/composables/useAdminResource'
import { useToast } from '~/composables/useToast'
import { resolveProviderRegistryError } from '~/utils/admin-provider-registry'
import {
  authTypeOptions,
  bindingStatusOptions,
  createProviderEditPanel,
  createProviderAuthRef,
  createProviderQuotaPanel,
  createDefaultSceneCapabilityInput,
  createSceneEditPanel,
  createSceneRunPanel,
  ensureUniqueCapabilities,
  fallbackOptions,
  formatJson,
  formatRunJson,
  extractFailedSceneRun,
  mergeJsonObjects,
  parseBoundedNumber,
  parseCommaList,
  parseJsonObjectField,
  parseOptionalJson,
  parseOptionalNonNegativeNumber,
  ownerScopeOptions,
  providerServiceCategoryOptions,
  providerStatusOptions,
  providerCapabilityCatalogOptions,
  ProviderRegistryInputError,
  providerRegistryTemplates,
  providerVendorOptions,
  observabilityTone,
  resolveProviderObservability,
  resolveProviderObservabilityActionHint,
  summarizeProviderQuotaList,
  resolveHealthCheckActionHint,
  resolveHealthCheckReason,
  resolveFirstProviderTemplateForServiceCategory,
  resolveSceneObservability,
  resolveSceneObservabilityActionHint,
  resolveUsageLedgerActionHint,
  resolveUsageLedgerReference,
  sceneCapabilities,
  sceneOwnerOptions,
  statusTone,
  strategyOptions,
  type BindingFormRow,
  type BindingStatus,
  type CapabilityFormRow,
  type OwnerScope,
  type ProviderCapabilityRecord,
  type ProviderCheckResult,
  type ProviderEditPanelState,
  type ProviderHealthCheckEntry,
  type ProviderObservabilitySummary,
  type ProviderQuotaPanelState,
  type ProviderQuotaRecord,
  type ProviderRegistryRecord,
  type ProviderServiceCategory,
  type ProviderRegistryTemplateId,
  type ProviderStatus,
  type SceneCapabilityAdapterCatalogEntry,
  type ProviderUsageLedgerEntry,
  type SceneEditPanelState,
  type SceneFallback,
  type SceneObservabilitySummary,
  type SceneOwner,
  type SceneRegistryRecord,
  type SceneRunPanelState,
  type SceneStrategyMode,
} from '~/utils/provider-registry-admin'

/** Everything the registry page reads from one load. */
export interface ProviderRegistrySnapshot {
  providers: ProviderRegistryRecord[]
  adapters: SceneCapabilityAdapterCatalogEntry[]
  capabilities: ProviderCapabilityRecord[]
  scenes: SceneRegistryRecord[]
  /** The latest 25 ledger rows: the providers' and routes' latest-run evidence. */
  usageEntries: ProviderUsageLedgerEntry[]
  /** The latest 25 checks: the providers' health badges. */
  healthEntries: ProviderHealthCheckEntry[]
  usageTotal: number
  unhealthyTotal: number
  quotas: Record<string, ProviderQuotaRecord | null>
  quotaLists: Record<string, ProviderQuotaRecord[]>
}

interface PreparedProviderCapabilities {
  removedIds: Set<string>
  inputs: Array<Pick<ProviderCapabilityRecord, 'capability' | 'schemaRef' | 'metering' | 'constraints' | 'metadata'> & { id?: string }>
}

/**
 * The provider registry page's data and actions.
 *
 * The page calls this once, so its stat cards, its Refresh button and every tab
 * read the same registry. Providers, capabilities, scenes, quotas and the
 * 25-row observability windows are one `useAdminResource`: a first-load
 * skeleton, content kept during a refresh, a localized error with a retry. The
 * usage ledger and health check lists are server-paged lists of their own on
 * their tabs.
 *
 * The administrator gate is the layout's (`useAdminGate`): this composable
 * neither checks the role nor redirects, and is only ever mounted for an
 * administrator.
 *
 * Every action answers whether it succeeded, so the drawer that started it
 * decides whether to close; a failure shows its localized message in that
 * drawer, or as a toast for actions without one.
 */
export function useProviderRegistryAdmin() {
  const { t } = useI18n()
  const toast = useToast()
  const providerService = createProviderRegistryCrudService()
  const sceneObservabilityService = createProviderRegistrySceneObservabilityService()

  function failure(err: unknown, key: string, fallback: string): string {
    return resolveProviderRegistryError(err, t, t(key, fallback))
  }

  async function loadRegistry(): Promise<ProviderRegistrySnapshot> {
    await sceneObservabilityService.seedRegistry()
    const [providerResult, registryData] = await Promise.all([
      providerService.listProviders(),
      sceneObservabilityService.loadRegistryCollections(),
    ])
    const providers = providerResult.providers ?? []
    const quotaEntries = await Promise.all(providers.map(async (provider) => {
      const result = await providerService.fetchProviderQuota(provider.id)
      return [provider.id, result] as const
    }))
    return {
      providers,
      adapters: providerResult.adapters ?? [],
      capabilities: registryData.capabilities,
      scenes: registryData.scenes,
      usageEntries: registryData.usageEntries,
      healthEntries: registryData.healthEntries,
      usageTotal: registryData.usageTotal,
      unhealthyTotal: registryData.unhealthyTotal,
      quotas: Object.fromEntries(quotaEntries.map(([providerId, result]) => [providerId, result.quota])),
      quotaLists: Object.fromEntries(quotaEntries.map(([providerId, result]) => [providerId, result.quotas ?? (result.quota ? [result.quota] : [])])),
    }
  }

  const registry = useAdminResource<ProviderRegistrySnapshot>({
    fetch: loadRegistry,
    errorFallback: () => t('dashboard.providerRegistry.errors.loadFailed', 'Failed to load provider registry.'),
  })
  // A failure with nothing loaded yet takes the place of the blocks the registry
  // feeds; a failed refresh leaves the last load on screen under a notice.
  const registryLoadError = computed(() => (registry.data.value ? null : registry.error.value))
  const registryRefreshError = computed(() => (registry.data.value ? registry.error.value : null))

  /**
   * Settles once the registry has rows to page (resolves) or its load has failed
   * with nothing to show (rejects). A client list asked before the first answer
   * waits for it: paging an empty registry would move a link's `?rt_page=2`
   * back to page 1 for good.
   */
  function whenRegistryLoaded(): Promise<void> {
    return new Promise((resolve, reject) => {
      function settle(): boolean {
        if (registry.data.value) {
          resolve()
          return true
        }
        if (!registry.loading.value && registry.error.value) {
          reject(new Error(registry.error.value))
          return true
        }
        return false
      }
      if (settle())
        return
      const stop = watch([() => registry.data.value, () => registry.loading.value, () => registry.error.value], () => {
        if (settle())
          stop()
      })
    })
  }

  const providers = computed(() => registry.data.value?.providers ?? [])
  const adapterCatalog = computed(() => registry.data.value?.adapters ?? [])
  const capabilities = computed(() => registry.data.value?.capabilities ?? [])
  const scenes = computed(() => registry.data.value?.scenes ?? [])
  const usageEntries = computed(() => registry.data.value?.usageEntries ?? [])
  const healthEntries = computed(() => registry.data.value?.healthEntries ?? [])
  const usageTotal = computed(() => registry.data.value?.usageTotal ?? 0)
  const unhealthyTotal = computed(() => registry.data.value?.unhealthyTotal ?? 0)

  const savingProvider = ref(false)
  // The line of the latest failed save, for the panel to toast when the drawer
  // that started the save is no longer there to show it.
  const lastSaveError = ref<string | null>(null)

  function saveFailed(err: unknown, key: string, fallback: string): string {
    const message = failure(err, key, fallback)
    lastSaveError.value = message
    return message
  }
  const savingScene = ref(false)
  const actionPending = ref<string | null>(null)
  const providerCheckResults = ref<Record<string, ProviderCheckResult>>({})
  const sceneRunPanels = reactive<Record<string, SceneRunPanelState>>({})
  const providerEditPanels = reactive<Record<string, ProviderEditPanelState>>({})
  const providerQuotaPanels = reactive<Record<string, ProviderQuotaPanelState>>({})
  const sceneEditPanels = reactive<Record<string, SceneEditPanelState>>({})
  // Quotas are patched in place after a quota save, until the next load.
  const providerQuotas = ref<Record<string, ProviderQuotaRecord | null>>({})
  const providerQuotaLists = ref<Record<string, ProviderQuotaRecord[]>>({})
  /** The create drawers' failures: they have no per-record panel to hold one. */
  const providerCreateError = ref<string | null>(null)
  const sceneCreateError = ref<string | null>(null)
  const fetchingProviderModels = ref<string | null>(null)
  const providerServiceCategoryId = ref<ProviderServiceCategory>('ai')
  const initialProviderTemplate = providerRegistryTemplates.find(template => template.id === 'openai-compatible-ai')
    ?? providerRegistryTemplates[0]!
  const providerTemplateId = ref<ProviderRegistryTemplateId>(initialProviderTemplate.id)

  const providerForm = reactive({
    name: initialProviderTemplate.name,
    displayName: initialProviderTemplate.displayName,
    vendor: initialProviderTemplate.vendor,
    adapterKey: initialProviderTemplate.adapterKey,
    status: 'disabled' as ProviderStatus,
    authType: initialProviderTemplate.authType,
    authRef: createProviderAuthRef(initialProviderTemplate.name),
    ownerScope: 'system' as OwnerScope,
    endpoint: initialProviderTemplate.endpoint,
    region: initialProviderTemplate.region,
    modelsText: (initialProviderTemplate.models ?? []).join('\n'),
    defaultModel: initialProviderTemplate.defaultModel ?? '',
    apiKey: '',
    secretId: '',
    secretKey: '',
  })

  const capabilityRows = ref<CapabilityFormRow[]>(initialProviderTemplate.capabilities.map(row => ({ ...row })))

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
      model: initialProviderTemplate.defaultModel ?? '',
      priority: 10,
    },
  ])

  watch(() => registry.data.value, (data) => {
    if (!data)
      return
    providerQuotas.value = data.quotas
    providerQuotaLists.value = data.quotaLists
    const firstBinding = bindingRows.value[0]
    const firstProvider = data.providers[0]
    if (firstBinding && !firstBinding.providerId && firstProvider)
      firstBinding.providerId = firstProvider.id
  }, { immediate: true })

  const enabledProviders = computed(() => providers.value.filter(item => item.status === 'enabled').length)
  const capabilityCount = computed(() => capabilities.value.length)
  const sceneCount = computed(() => scenes.value.length)
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
  const providerCapabilityTemplateOptions = computed(() => providerCapabilityCatalogOptions.map(row => ({ ...row })))
  const providerMeteringUnitOptions = computed(() => Array.from(new Set(providerCapabilityCatalogOptions.map(row => row.meteringUnit))))
  const providerAdapterOptions = computed(() => adapterCatalog.value.map(adapter => ({
    value: adapter.key,
    label: adapter.label,
  })))

  function applyProviderTemplate(templateId: unknown) {
    const template = providerRegistryTemplates.find(item => item.id === String(templateId))
    if (!template)
      return

    providerServiceCategoryId.value = template.serviceCategory
    providerTemplateId.value = template.id
    providerForm.name = template.name
    providerForm.displayName = template.displayName
    providerForm.vendor = template.vendor
    providerForm.status = 'disabled'
    providerForm.adapterKey = template.adapterKey
    providerForm.authType = template.authType
    providerForm.authRef = createProviderAuthRef(template.name)
    providerForm.ownerScope = 'system'
    providerForm.endpoint = template.endpoint
    providerForm.region = template.region
    providerForm.modelsText = (template.models ?? []).join('\n')
    providerForm.defaultModel = template.defaultModel ?? ''
    providerForm.apiKey = ''
    providerForm.secretId = ''
    providerForm.secretKey = ''
    capabilityRows.value = template.capabilities.map(row => ({ ...row }))
  }

  function applyProviderServiceCategory(category: unknown) {
    const normalized = String(category) as ProviderServiceCategory
    const template = resolveFirstProviderTemplateForServiceCategory(normalized)
    if (!template)
      return

    providerServiceCategoryId.value = normalized
    applyProviderTemplate(template.id)
  }

  watch(providerServiceCategoryId, (category) => {
    const currentTemplate = providerRegistryTemplates.find(item => item.id === providerTemplateId.value)
    if (currentTemplate?.serviceCategory === category)
      return

    const template = resolveFirstProviderTemplateForServiceCategory(category)
    if (template)
      applyProviderTemplate(template.id)
  })

  function addCapabilityRow() {
    const usedCapabilities = new Set(capabilityRows.value.map(row => row.capability))
    const template = providerCapabilityTemplateOptions.value.find(row => !usedCapabilities.has(row.capability))
      ?? providerCapabilityTemplateOptions.value[0]

    capabilityRows.value.push(template ? { ...template } : { capability: '', schemaRef: '', meteringUnit: 'request' })
  }

  function removeCapabilityRow(index: number) {
    capabilityRows.value.splice(index, 1)
  }

  function applyProviderCapabilityTemplate(row: CapabilityFormRow, capability: unknown) {
    const template = providerCapabilityTemplateOptions.value.find(item => item.capability === String(capability))
    if (!template)
      return

    row.capability = template.capability
    row.schemaRef = template.schemaRef
    row.meteringUnit = template.meteringUnit
  }

  function addBindingRow() {
    bindingRows.value.push({ providerId: providers.value[0]?.id ?? '', capability: '', model: '', priority: 100 })
  }

  function removeBindingRow(index: number) {
    bindingRows.value.splice(index, 1)
  }

  // The panel getters read the panel back through its reactive record: the
  // object just created is the raw one, and a drawer computed over it would
  // never see the save's error or saving flag.
  function getProviderEditPanel(provider: ProviderRegistryRecord): ProviderEditPanelState {
    providerEditPanels[provider.id] ??= createProviderEditPanel(provider)
    return providerEditPanels[provider.id]!
  }

  function getProviderQuotaPanel(provider: ProviderRegistryRecord): ProviderQuotaPanelState {
    providerQuotaPanels[provider.id] ??= createProviderQuotaPanel(provider, providerQuotas.value[provider.id])
    return providerQuotaPanels[provider.id]!
  }

  function getSceneEditPanel(scene: SceneRegistryRecord): SceneEditPanelState {
    sceneEditPanels[scene.id] ??= createSceneEditPanel(scene)
    return sceneEditPanels[scene.id]!
  }

  /** A fresh editor for a drawer that opens: whatever was typed last time is gone. */
  function resetProviderEditPanel(provider: ProviderRegistryRecord) {
    delete providerEditPanels[provider.id]
  }

  function resetProviderQuotaPanel(provider: ProviderRegistryRecord) {
    delete providerQuotaPanels[provider.id]
  }

  function resetSceneEditPanel(scene: SceneRegistryRecord) {
    delete sceneEditPanels[scene.id]
  }

  function addProviderCapabilityEditRow(provider: ProviderRegistryRecord) {
    getProviderEditPanel(provider).capabilities.push({
      capability: '',
      schemaRef: '',
      meteringUnit: 'token',
      maxImageBytes: '',
      providerModel: '',
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
      model: '',
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

  function prepareProviderCapabilities(panel: ProviderEditPanelState): PreparedProviderCapabilities {
    const blankedExistingCapabilityIds = panel.capabilities
      .filter(row => row.id && !row.capability.trim())
      .map(row => row.id as string)
    // A row's path keeps its place in the editor, blank rows included, so an error names the row on screen.
    const capabilityInputs = panel.capabilities
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.capability.trim())
      .map(({ row, index }) => ({
        id: row.id,
        capability: row.capability.trim(),
        schemaRef: row.schemaRef.trim() || null,
        metering: mergeJsonObjects(
          parseJsonObjectField(row.meteringText, `capabilities[${index}].metering`),
          { unit: row.meteringUnit.trim() || null },
        ),
        constraints: mergeJsonObjects(
          parseJsonObjectField(row.constraintsText, `capabilities[${index}].constraints`),
          {
            maxImageBytes: parseOptionalNonNegativeNumber(
              row.maxImageBytes,
              `capabilities[${index}].maxImageBytes`,
            ),
          },
        ),
        metadata: mergeJsonObjects(
          parseJsonObjectField(row.metadataText, `capabilities[${index}].metadata`),
          { providerModel: row.providerModel.trim() || null },
        ),
      }))

    ensureUniqueCapabilities(capabilityInputs)
    return {
      removedIds: new Set([...panel.removedCapabilityIds, ...blankedExistingCapabilityIds]),
      inputs: capabilityInputs,
    }
  }

  async function syncProviderCapabilities(
    provider: ProviderRegistryRecord,
    prepared: PreparedProviderCapabilities,
  ) {
    for (const capabilityId of prepared.removedIds)
      await providerService.deleteCapability(provider.id, capabilityId)

    for (const capability of prepared.inputs) {
      if (capability.id) {
        await providerService.updateCapability(provider.id, capability.id, {
          capability: capability.capability,
          schemaRef: capability.schemaRef,
          metering: capability.metering,
          constraints: capability.constraints,
          metadata: capability.metadata,
        })
        continue
      }

      await providerService.createCapability(provider.id, {
        capability: capability.capability,
        schemaRef: capability.schemaRef,
        metering: capability.metering,
        constraints: capability.constraints,
        metadata: capability.metadata,
      })
    }
  }

  function sceneProviderOptions(scene: SceneRegistryRecord) {
    const providerIds = new Set(scene.bindings.map(binding => binding.providerId))
    return providerOptions.value.filter(provider => providerIds.has(provider.value))
  }

  function bindingModelOptions(providerId: string) {
    const provider = providers.value.find(item => item.id === providerId)
    const models = provider?.metadata?.models
    return Array.isArray(models)
      ? models.filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
      : []
  }

  function parseProviderModels(value: string) {
    return Array.from(new Set(parseCommaList(value.replace(/\n/g, ','))))
  }

  function assertDefaultModel(models: string[], defaultModel: string) {
    if (defaultModel && !models.includes(defaultModel))
      throw new ProviderRegistryInputError('default-model-missing', {}, 'Default model must be included in the provider model list.')
  }

  function getSceneRunPanel(scene: SceneRegistryRecord): SceneRunPanelState {
    sceneRunPanels[scene.id] ??= createSceneRunPanel(scene)
    return sceneRunPanels[scene.id]!
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

  /** Load again, keeping what is on screen until the answer lands. */
  function refresh() {
    return registry.refresh()
  }

  async function createProvider(): Promise<boolean> {
    savingProvider.value = true
    providerCreateError.value = null
    try {
      const targetStatus = providerForm.status
      const authRef = providerForm.authType === 'none'
        ? undefined
        : createProviderAuthRef(providerForm.name)
      const hasApiKeyInput = providerForm.authType === 'api_key' && providerForm.apiKey.trim()
      const hasSecretPairInput = providerForm.authType === 'secret_pair'
        && providerForm.secretId.trim()
        && providerForm.secretKey.trim()
      const hasCredentialInput = Boolean(hasApiKeyInput || hasSecretPairInput)
      assertDefaultModel(parseProviderModels(providerForm.modelsText), providerForm.defaultModel.trim())
      const body = {
        name: providerForm.name.trim(),
        displayName: providerForm.displayName.trim(),
        vendor: providerForm.vendor,
        status: hasCredentialInput ? 'disabled' : providerForm.status,
        authType: providerForm.authType,
        authRef,
        ownerScope: providerForm.ownerScope,
        endpoint: providerForm.endpoint.trim() || undefined,
        region: providerForm.region.trim() || undefined,
        metadata: mergeJsonObjects(
          providerRegistryTemplates.find(item => item.id === providerTemplateId.value)?.metadata ?? null,
          {
            adapterKey: providerForm.adapterKey,
            models: parseProviderModels(providerForm.modelsText),
            defaultModel: providerForm.defaultModel.trim() || null,
          },
        ),
        capabilities: capabilityRows.value
          .filter(row => row.capability.trim())
          .map(row => ({
            capability: row.capability.trim(),
            schemaRef: row.schemaRef.trim() || undefined,
            metering: row.meteringUnit.trim() ? { unit: row.meteringUnit.trim() } : undefined,
          })),
      }

      await providerService.createProvider(body)

      if (hasCredentialInput) {
        await providerService.createCredential({
          authRef,
          authType: providerForm.authType,
          credentials: hasSecretPairInput
            ? {
                secretId: providerForm.secretId.trim(),
                secretKey: providerForm.secretKey,
              }
            : {
                apiKey: providerForm.apiKey.trim(),
              },
        })
        providerForm.apiKey = ''
        providerForm.secretId = ''
        providerForm.secretKey = ''

        if (targetStatus !== 'disabled') {
          const providerResult = await providerService.listProviders(providerForm.vendor)
          const provider = (providerResult.providers ?? []).find(item => item.authRef === authRef)
          if (provider)
            await providerService.updateProvider(provider.id, { status: targetStatus })
        }
      }
      toast.success(t('dashboard.providerRegistry.providers.created', 'Provider created.'))
      await refresh()
      return true
    }
    catch (err) {
      providerCreateError.value = saveFailed(err, 'dashboard.providerRegistry.errors.createProviderFailed', 'Failed to create provider.')
      return false
    }
    finally {
      savingProvider.value = false
    }
  }

  async function checkProvider(provider: ProviderRegistryRecord, capability?: string): Promise<ProviderCheckResult> {
    actionPending.value = `provider:${provider.id}:check`
    const targetCapability = capability?.trim() || provider.capabilities[0]?.capability || 'text.translate'
    try {
      const result = await providerService.checkProvider(provider.id, targetCapability)
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
      // The check is recorded either way: the health badge and the health card read it from the registry.
      await refresh()
      return result
    }
    catch (err) {
      const message = failure(err, 'dashboard.providerRegistry.errors.checkProviderFailed', 'Failed to check provider.')
      const result: ProviderCheckResult = {
        success: false,
        providerId: provider.id,
        capability: targetCapability,
        latency: 0,
        endpoint: provider.endpoint || '',
        message,
        error: { message },
      }
      providerCheckResults.value = {
        ...providerCheckResults.value,
        [provider.id]: result,
      }
      toast.warning(message)
      return result
    }
    finally {
      actionPending.value = null
    }
  }

  async function updateProviderStatus(provider: ProviderRegistryRecord, status: ProviderStatus): Promise<boolean> {
    actionPending.value = `provider:${provider.id}:${status}`
    try {
      await providerService.updateProvider(provider.id, { status })
      await refresh()
      return true
    }
    catch (err) {
      toast.warning(failure(err, 'dashboard.providerRegistry.errors.updateProviderFailed', 'Failed to update provider.'))
      return false
    }
    finally {
      actionPending.value = null
    }
  }

  async function fetchProviderModels(provider: ProviderRegistryRecord) {
    const panel = getProviderEditPanel(provider)
    fetchingProviderModels.value = provider.id
    panel.error = null
    try {
      const result = await providerService.fetchProviderModels(provider.id)
      const models = Array.from(new Set(
        (result.models ?? [])
          .map(model => model.trim())
          .filter(Boolean),
      ))
      panel.modelsText = models.join('\n')
      if (!panel.defaultModel && models[0])
        panel.defaultModel = models[0]
      toast.success(t('dashboard.providerRegistry.providers.modelsFetched', { count: models.length }, `Fetched ${models.length} model(s).`))
    }
    catch (err) {
      panel.error = failure(err, 'dashboard.providerRegistry.errors.fetchModelsFailed', 'Failed to fetch provider models.')
    }
    finally {
      fetchingProviderModels.value = null
    }
  }

  async function saveProviderEdit(provider: ProviderRegistryRecord): Promise<boolean> {
    const panel = getProviderEditPanel(provider)
    panel.saving = true
    panel.error = null
    try {
      assertDefaultModel(parseProviderModels(panel.modelsText), panel.defaultModel.trim())
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
        metadata: mergeJsonObjects(
          parseJsonObjectField(panel.metadataText, 'provider.metadata'),
          {
            adapterKey: panel.adapterKey,
            models: parseProviderModels(panel.modelsText),
            defaultModel: panel.defaultModel.trim() || null,
          },
        ),
      }
      const capabilities = prepareProviderCapabilities(panel)

      await providerService.updateProvider(provider.id, body)
      await syncProviderCapabilities(provider, capabilities)
      toast.success(t('dashboard.providerRegistry.providers.updated', 'Provider updated.'))
      // Unless the drawer was reopened while this saved: that editor is the operator's now.
      if (providerEditPanels[provider.id] === panel)
        delete providerEditPanels[provider.id]
      await refresh()
      return true
    }
    catch (err) {
      panel.error = saveFailed(err, 'dashboard.providerRegistry.errors.updateProviderFailed', 'Failed to update provider.')
      return false
    }
    finally {
      panel.saving = false
    }
  }

  async function saveProviderQuota(provider: ProviderRegistryRecord): Promise<boolean> {
    const panel = getProviderQuotaPanel(provider)
    panel.saving = true
    panel.error = null
    try {
      const windowDays = parseBoundedNumber(panel.windowDays, 'windowDays', 1) ?? 30
      const maxRequests = parseBoundedNumber(panel.maxRequests, 'maxRequests')
      const maxTokens = parseBoundedNumber(panel.maxTokens, 'maxTokens')
      const warningThreshold = parseBoundedNumber(panel.warningThreshold, 'warningThreshold', 0, 100)
      const limits: Record<string, number> = { windowDays }
      if (maxRequests !== undefined)
        limits.maxRequests = maxRequests
      if (maxTokens !== undefined)
        limits.maxTokens = maxTokens

      const result = await providerService.saveProviderQuota(provider.id, {
        name: panel.name.trim() || `${provider.displayName} quota`,
        enabled: panel.enabled === 'enabled',
        limits,
        warningThreshold,
        config: {
          source: 'provider-registry-panel',
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
      return true
    }
    catch (err) {
      panel.error = saveFailed(err, 'dashboard.providerRegistry.errors.saveQuotaFailed', 'Failed to save provider quota.')
      return false
    }
    finally {
      panel.saving = false
    }
  }

  async function deleteProvider(provider: ProviderRegistryRecord): Promise<boolean> {
    actionPending.value = `provider:${provider.id}:delete`
    try {
      await providerService.deleteProvider(provider.id)
      await refresh()
      return true
    }
    catch (err) {
      toast.warning(failure(err, 'dashboard.providerRegistry.errors.deleteProviderFailed', 'Failed to delete provider.'))
      return false
    }
    finally {
      actionPending.value = null
    }
  }

  async function createScene(): Promise<boolean> {
    savingScene.value = true
    sceneCreateError.value = null
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
            model: row.model.trim() || undefined,
            priority: Number(row.priority) || 100,
          })),
      }

      await sceneObservabilityService.createScene(body)
      toast.success(t('dashboard.providerRegistry.scenes.created', 'Scene created.'))
      await refresh()
      return true
    }
    catch (err) {
      sceneCreateError.value = saveFailed(err, 'dashboard.providerRegistry.errors.createSceneFailed', 'Failed to create scene.')
      return false
    }
    finally {
      savingScene.value = false
    }
  }

  async function updateSceneStatus(scene: SceneRegistryRecord, status: BindingStatus): Promise<boolean> {
    actionPending.value = `scene:${scene.id}:${status}`
    try {
      await sceneObservabilityService.updateScene(scene.id, { status })
      await refresh()
      return true
    }
    catch (err) {
      toast.warning(failure(err, 'dashboard.providerRegistry.errors.updateSceneFailed', 'Failed to update scene.'))
      return false
    }
    finally {
      actionPending.value = null
    }
  }

  async function saveSceneEdit(scene: SceneRegistryRecord): Promise<boolean> {
    const panel = getSceneEditPanel(scene)
    panel.saving = true
    panel.error = null
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
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => row.providerId && row.capability.trim())
          .map(({ row, index }) => ({
            providerId: row.providerId,
            capability: row.capability.trim(),
            model: row.model.trim() || undefined,
            priority: Number(row.priority) || 100,
            weight: row.weightText.trim() ? Number(row.weightText) : undefined,
            status: row.status,
            constraints: parseJsonObjectField(row.constraintsText, `bindings[${index}].constraints`),
            metadata: parseJsonObjectField(row.metadataText, `bindings[${index}].metadata`),
          })),
      }

      await sceneObservabilityService.updateScene(scene.id, body)
      toast.success(t('dashboard.providerRegistry.scenes.updated', 'Scene updated.'))
      if (sceneEditPanels[scene.id] === panel)
        delete sceneEditPanels[scene.id]
      await refresh()
      return true
    }
    catch (err) {
      panel.error = saveFailed(err, 'dashboard.providerRegistry.errors.updateSceneFailed', 'Failed to update scene.')
      return false
    }
    finally {
      panel.saving = false
    }
  }

  async function runScene(scene: SceneRegistryRecord, dryRun: boolean) {
    const panel = getSceneRunPanel(scene)
    const pendingKey = `scene:${scene.id}:run:${dryRun ? 'dry' : 'execute'}`
    actionPending.value = pendingKey
    panel.error = null
    let requestStarted = false
    try {
      const input = parseOptionalJson(panel.inputText)
      requestStarted = true
      const result = await sceneObservabilityService.runScene(scene.id, {
        input,
        capability: panel.capability.trim() || undefined,
        providerId: panel.providerId || undefined,
        dryRun,
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
    }
    catch (err) {
      const failedRun = extractFailedSceneRun(err)
      if (failedRun)
        panel.result = failedRun
      panel.error = failure(err, 'dashboard.providerRegistry.errors.runSceneFailed', 'Failed to run scene.')
    }
    finally {
      if (requestStarted)
        await refresh()
      actionPending.value = null
    }
  }

  async function deleteScene(scene: SceneRegistryRecord): Promise<boolean> {
    actionPending.value = `scene:${scene.id}:delete`
    try {
      await sceneObservabilityService.deleteScene(scene.id)
      await refresh()
      return true
    }
    catch (err) {
      toast.warning(failure(err, 'dashboard.providerRegistry.errors.deleteSceneFailed', 'Failed to delete scene.'))
      return false
    }
    finally {
      actionPending.value = null
    }
  }

  return {
    /** The registry resource: `loading` (nothing yet), `refreshing`, `error`, `data`. */
    registry,
    registryLoadError,
    registryRefreshError,
    whenRegistryLoaded,
    lastSaveError,
    refresh,
    listUsageEntries: sceneObservabilityService.listUsageEntries,
    listHealthChecks: sceneObservabilityService.listHealthChecks,
    adapterCatalog,
    bindingModelOptions,
    actionPending,
    addBindingRow,
    addCapabilityRow,
    addProviderCapabilityEditRow,
    addSceneBindingEditRow,
    applyProviderCapabilityTemplate,
    applyProviderServiceCategory,
    applyProviderTemplate,
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
    fallbackOptions,
    fetchProviderModels,
    fetchingProviderModels,
    formatJson,
    formatRunJson,
    getProviderCheckResult,
    getProviderEditPanel,
    getProviderQuotaPanel,
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
    healthEntries,
    ownerScopeOptions,
    providerCreateError,
    providerEditPanels,
    providerForm,
    providerObservabilityById,
    providerOptions,
    providerCapabilityTemplateOptions,
    providerAdapterOptions,
    providerMeteringUnitOptions,
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
    resetProviderEditPanel,
    resetProviderQuotaPanel,
    resetSceneEditPanel,
    runScene,
    saveProviderEdit,
    saveProviderQuota,
    saveSceneEdit,
    sceneCapabilities,
    sceneCount,
    sceneCreateError,
    sceneEditPanels,
    sceneForm,
    sceneObservabilityById,
    sceneOwnerOptions,
    sceneProviderOptions,
    scenes,
    savingProvider,
    savingScene,
    observabilityTone,
    statusTone,
    strategyOptions,
    unhealthyTotal,
    updateProviderStatus,
    updateSceneStatus,
    usageEntries,
    usageTotal,
  }
}

export type ProviderRegistryAdmin = ReturnType<typeof useProviderRegistryAdmin>
