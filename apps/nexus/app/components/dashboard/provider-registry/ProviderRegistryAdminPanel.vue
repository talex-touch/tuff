<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type {
  ProviderCapabilityRecord,
  ProviderHealthCheckEntry,
  ProviderRegistryRecord,
  ProviderUsageLedgerEntry,
  SceneRegistryRecord,
} from '~/utils/provider-registry-admin'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDataTable } from '@talex-touch/tuffex/data-table'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxStatCard } from '@talex-touch/tuffex/stat-card'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { computed, ref } from 'vue'

const { t } = useI18n()
const {
  activeTab,
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
  error,
  fallbackOptions,
  fetchRegistry,
  filteredHealthEntries,
  filteredProviders,
  filteredScenes,
  filteredUsageEntries,
  formatDate,
  formatRunJson,
  getHealthCheckReason,
  getProviderEditPanel,
  getProviderObservability,
  getProviderQuotaList,
  getProviderQuotaPanel,
  getProviderQuotaSummary,
  getSceneEditPanel,
  getSceneObservability,
  getSceneRunPanel,
  getUsageLedgerReference,
  healthCheckEmptyState,
  healthCheckFilter,
  healthFilterOptions,
  healthEntries,
  isAdmin,
  loading,
  ownerScopeOptions,
  providerEditPanels,
  providerFilterOptions,
  providerForm,
  providerObservabilityEmptyState,
  providerObservabilityFilter,
  providerOptions,
  providerCapabilityTemplateOptions,
  providerMeteringUnitOptions,
  providerQuotaPanels,
  providerStatusOptions,
  providerServiceCategoryId,
  providerServiceCategoryOptions,
  providerTemplateId,
  providerTemplateOptions,
  providers,
  providerVendorOptions,
  removeBindingRow,
  removeCapabilityRow,
  removeProviderCapabilityEditRow,
  removeSceneBindingEditRow,
  runScene,
  saveProviderEdit,
  saveProviderQuota,
  saveSceneEdit,
  sceneCapabilities,
  sceneCount,
  sceneEditPanels,
  sceneFilterOptions,
  sceneForm,
  sceneObservabilityEmptyState,
  sceneObservabilityFilter,
  sceneOwnerOptions,
  sceneProviderOptions,
  scenes,
  savingProvider,
  savingScene,
  observabilityTone,
  statusTone,
  strategyOptions,
  unhealthyCount,
  updateProviderStatus,
  updateSceneStatus,
  usageCount,
  usageFilterOptions,
  usageLedgerEmptyState,
  usageLedgerFilter,
  usageEntries,
  applySceneRunCapabilitySample,
} = useProviderRegistryAdmin()

const providerDrawerOpen = ref(false)
const providerDrawerMode = ref<'create' | 'edit' | 'quota'>('create')
const selectedProvider = ref<ProviderRegistryRecord | null>(null)
const providerSearch = ref('')

const sceneDrawerOpen = ref(false)
const sceneDrawerMode = ref<'create' | 'edit' | 'run'>('create')
const selectedScene = ref<SceneRegistryRecord | null>(null)

const activeProviderEditPanel = computed(() => {
  if (providerDrawerMode.value !== 'edit' || !selectedProvider.value)
    return null
  return getProviderEditPanel(selectedProvider.value)
})

const activeProviderQuotaPanel = computed(() => {
  if (providerDrawerMode.value !== 'quota' || !selectedProvider.value)
    return null
  return getProviderQuotaPanel(selectedProvider.value)
})

const activeSceneEditPanel = computed(() => {
  if (sceneDrawerMode.value !== 'edit' || !selectedScene.value)
    return null
  return getSceneEditPanel(selectedScene.value)
})

const activeSceneRunPanel = computed(() => {
  if (sceneDrawerMode.value !== 'run' || !selectedScene.value)
    return null
  return getSceneRunPanel(selectedScene.value)
})

const visibleProviders = computed(() => {
  const query = providerSearch.value.trim().toLowerCase()
  if (!query)
    return filteredProviders.value

  return filteredProviders.value.filter((provider) => {
    const capabilityText = provider.capabilities
      .flatMap(capability => [capability.capability, capability.schemaRef])
      .filter(Boolean)
      .join(' ')

    return [
      provider.displayName,
      provider.id,
      provider.name,
      provider.vendor,
      provider.authType,
      provider.status,
      provider.description,
      provider.endpoint,
      provider.region,
      capabilityText,
    ].some(value => String(value ?? '').toLowerCase().includes(query))
  })
})

const providerTableEmptyText = computed(() => {
  if (providerSearch.value.trim())
    return t('dashboard.providerRegistry.providers.emptySearch', 'No providers match the current search.')
  return t('dashboard.providerRegistry.providers.empty', 'No providers registered yet.')
})

const providerDrawerSaving = computed(() =>
  savingProvider.value
  || Boolean(activeProviderEditPanel.value?.saving)
  || Boolean(activeProviderQuotaPanel.value?.saving),
)

const sceneDrawerSaving = computed(() =>
  savingScene.value || Boolean(activeSceneEditPanel.value?.saving) || actionPending.value !== null,
)

const providerDrawerTitle = computed(() => {
  if (providerDrawerMode.value === 'quota')
    return t('dashboard.providerRegistry.quota.editTitle', 'Provider quota')
  return providerDrawerMode.value === 'create'
    ? t('dashboard.providerRegistry.providers.createTitle', 'Create provider')
    : t('dashboard.providerRegistry.providers.editTitle', 'Edit provider')
})

const providerDrawerPrimaryLabel = computed(() => {
  if (providerDrawerMode.value === 'create')
    return t('dashboard.providerRegistry.providers.create', 'Create provider')
  return t('common.save', 'Save')
})

const sceneDrawerTitle = computed(() => {
  if (sceneDrawerMode.value === 'run')
    return t('dashboard.providerRegistry.routes.runTitle', 'Run route')
  return sceneDrawerMode.value === 'create'
    ? t('dashboard.providerRegistry.routes.createTitle', 'Create route')
    : t('dashboard.providerRegistry.routes.editTitle', 'Edit route')
})

const sceneDrawerPrimaryLabel = computed(() =>
  sceneDrawerMode.value === 'create'
    ? t('dashboard.providerRegistry.routes.create', 'Create route')
    : t('common.save', 'Save'),
)

const providerColumns = computed<DataTableColumn<ProviderRegistryRecord>[]>(() => [
  { key: 'provider', title: t('dashboard.providerRegistry.table.provider', 'Provider'), sortable: true, width: 420, minWidth: 360, maxWidth: 520, fixed: 'left', nowrap: true },
  { key: 'status', title: t('dashboard.providerRegistry.fields.status', 'Status'), width: 96, nowrap: true },
  { key: 'capabilities', title: t('dashboard.providerRegistry.tabs.capabilities', 'Capabilities'), auto: true, minWidth: 180, nowrap: true },
  { key: 'health', title: t('dashboard.providerRegistry.table.health', 'Health'), width: 136, nowrap: true },
  { key: 'quota', title: t('dashboard.providerRegistry.quota.title', 'Provider quota'), width: 170, nowrap: true },
  { key: 'updatedAt', title: t('dashboard.providerRegistry.table.updatedAt', 'Updated at'), width: 172, nowrap: true },
  { key: 'actions', title: t('dashboard.providerRegistry.table.actions', 'Actions'), align: 'right', width: 208, fixed: 'right', nowrap: true },
])

const capabilityColumns = computed<DataTableColumn<ProviderCapabilityRecord>[]>(() => [
  { key: 'capability', title: t('dashboard.providerRegistry.fields.capability', 'Capability'), sortable: true, width: '34%' },
  { key: 'provider', title: t('dashboard.providerRegistry.fields.provider', 'Provider'), width: '26%' },
  { key: 'metering', title: t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit'), width: '20%' },
  { key: 'adapter', title: t('dashboard.providerRegistry.table.adapter', 'Adapter'), width: 140 },
])

const sceneColumns = computed<DataTableColumn<SceneRegistryRecord>[]>(() => [
  { key: 'scene', title: t('dashboard.providerRegistry.table.route', 'Route'), sortable: true, width: '26%' },
  { key: 'status', title: t('dashboard.providerRegistry.fields.status', 'Status'), width: 120 },
  { key: 'strategy', title: t('dashboard.providerRegistry.fields.strategy', 'Strategy'), width: 150 },
  { key: 'requiredCapabilities', title: t('dashboard.providerRegistry.fields.requiredCapabilities', 'Required capabilities'), width: '22%' },
  { key: 'latestRun', title: t('dashboard.providerRegistry.observability.latestSceneRun', 'Latest scene run'), width: 160 },
  { key: 'actions', title: t('dashboard.providerRegistry.table.actions', 'Actions'), align: 'right', width: 300 },
])

const usageColumns = computed<DataTableColumn<ProviderUsageLedgerEntry>[]>(() => [
  { key: 'run', title: t('dashboard.providerRegistry.table.run', 'Run'), width: '28%' },
  { key: 'status', title: t('dashboard.providerRegistry.fields.status', 'Status'), width: 120 },
  { key: 'provider', title: t('dashboard.providerRegistry.fields.provider', 'Provider'), width: '18%' },
  { key: 'metering', title: t('dashboard.providerRegistry.usage.metering', 'Metering'), width: 170 },
  { key: 'reference', title: t('dashboard.providerRegistry.usage.providerRef', 'Provider ref'), width: '20%' },
  { key: 'createdAt', title: t('dashboard.providerRegistry.table.createdAt', 'Created at'), width: 150 },
])

const healthColumns = computed<DataTableColumn<ProviderHealthCheckEntry>[]>(() => [
  { key: 'provider', title: t('dashboard.providerRegistry.table.provider', 'Provider'), width: '24%' },
  { key: 'status', title: t('dashboard.providerRegistry.fields.status', 'Status'), width: 120 },
  { key: 'capability', title: t('dashboard.providerRegistry.fields.capability', 'Capability'), width: '18%' },
  { key: 'latency', title: t('dashboard.providerRegistry.health.latency', 'Latency'), width: 110 },
  { key: 'reason', title: t('dashboard.providerRegistry.health.reason', 'Reason'), width: '22%' },
  { key: 'checkedAt', title: t('dashboard.providerRegistry.table.checkedAt', 'Checked at'), width: 150 },
])

function valueLabel(value: string | null | undefined) {
  if (!value)
    return '-'
  return t(`dashboard.providerRegistry.values.${value}`, value)
}

function booleanLabel(value: boolean) {
  return value ? t('dashboard.providerRegistry.values.yes', 'Yes') : t('dashboard.providerRegistry.values.no', 'No')
}

function getProviderName(providerId: string | null | undefined) {
  if (!providerId)
    return '-'
  return providers.value.find(provider => provider.id === providerId)?.displayName ?? providerId
}

function providerIdentityText(provider: ProviderRegistryRecord) {
  return `${provider.id} · ${valueLabel(provider.vendor)} · ${valueLabel(provider.authType)}`
}

function capabilityMeteringUnit(capability: ProviderCapabilityRecord) {
  const unit = capability.metering?.unit
  return typeof unit === 'string' && unit.trim() ? unit : '-'
}

function openCreateProvider() {
  providerDrawerMode.value = 'create'
  selectedProvider.value = null
  providerDrawerOpen.value = true
}

function openEditProvider(provider: ProviderRegistryRecord) {
  delete providerEditPanels[provider.id]
  selectedProvider.value = provider
  providerDrawerMode.value = 'edit'
  providerDrawerOpen.value = true
}

function openProviderQuota(provider: ProviderRegistryRecord) {
  delete providerQuotaPanels[provider.id]
  selectedProvider.value = provider
  providerDrawerMode.value = 'quota'
  providerDrawerOpen.value = true
}

function toggleProviderStatus(provider: ProviderRegistryRecord, enabled: boolean) {
  return updateProviderStatus(provider, enabled ? 'enabled' : 'disabled')
}

function closeProviderDrawer() {
  providerDrawerOpen.value = false
  selectedProvider.value = null
}

async function submitProviderDrawer() {
  if (providerDrawerMode.value === 'create') {
    await createProvider()
  }
  else if (providerDrawerMode.value === 'edit' && selectedProvider.value) {
    await saveProviderEdit(selectedProvider.value)
  }
  else if (providerDrawerMode.value === 'quota' && selectedProvider.value) {
    await saveProviderQuota(selectedProvider.value)
  }

  if (!error.value)
    closeProviderDrawer()
}

function openCreateScene() {
  sceneDrawerMode.value = 'create'
  selectedScene.value = null
  sceneDrawerOpen.value = true
}

function openEditScene(scene: SceneRegistryRecord) {
  delete sceneEditPanels[scene.id]
  selectedScene.value = scene
  sceneDrawerMode.value = 'edit'
  sceneDrawerOpen.value = true
}

function openRunScene(scene: SceneRegistryRecord) {
  selectedScene.value = scene
  sceneDrawerMode.value = 'run'
  getSceneRunPanel(scene)
  sceneDrawerOpen.value = true
}

function selectSceneRunCapability(scene: SceneRegistryRecord, capability: string) {
  applySceneRunCapabilitySample(scene, capability)
}

function closeSceneDrawer() {
  sceneDrawerOpen.value = false
  selectedScene.value = null
}

async function submitSceneDrawer() {
  if (sceneDrawerMode.value === 'create') {
    await createScene()
  }
  else if (sceneDrawerMode.value === 'edit' && selectedScene.value) {
    await saveSceneEdit(selectedScene.value)
  }

  if (!error.value)
    closeSceneDrawer()
}

function filterLabel(option: { value: string, label: string }) {
  return t(`dashboard.providerRegistry.filters.${option.value}`, option.label)
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="apple-heading-md">
          {{ t('dashboard.providerRegistry.title', 'Provider Registry') }}
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-black/50 dark:text-white/50">
          {{ t('dashboard.providerRegistry.subtitle', 'Manage provider capabilities and scene bindings for translation, AI, exchange rates, and future runtime scenes.') }}
        </p>
      </div>
      <TxButton variant="secondary" size="small" :disabled="loading" @click="fetchRegistry">
        <TxSpinner v-if="loading" :size="14" />
        <span :class="loading ? 'ml-2' : ''">{{ t('common.refresh', 'Refresh') }}</span>
      </TxButton>
    </header>

    <div v-if="!isAdmin" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
      {{ t('dashboard.providerRegistry.adminOnly', 'Only administrators can manage provider registry.') }}
    </div>

    <div v-if="error" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ error }}
    </div>

    <section class="grid gap-4 md:grid-cols-5">
      <TxStatCard
        :value="providers.length"
        :label="t('dashboard.providerRegistry.summary.providers', 'Providers')"
        icon-class="i-carbon-cloud-service-management text-6xl text-[var(--tx-color-primary)]"
      >
        <template #label>
          <div class="space-y-1">
            <p>{{ t('dashboard.providerRegistry.summary.providers', 'Providers') }}</p>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.providerRegistry.summary.enabledProviders', { count: enabledProviders }, `${enabledProviders} enabled`) }}
            </p>
          </div>
        </template>
      </TxStatCard>
      <TxStatCard
        :value="capabilityCount"
        :label="t('dashboard.providerRegistry.summary.capabilities', 'Capabilities')"
        icon-class="i-carbon-catalog text-6xl text-[var(--tx-color-success)]"
      >
        <template #label>
          <div class="space-y-1">
            <p>{{ t('dashboard.providerRegistry.summary.capabilities', 'Capabilities') }}</p>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.providerRegistry.summary.capabilitiesHint', 'Declared by providers') }}
            </p>
          </div>
        </template>
      </TxStatCard>
      <TxStatCard
        :value="sceneCount"
        :label="t('dashboard.providerRegistry.summary.scenes', 'Scenes')"
        icon-class="i-carbon-flow text-6xl text-[var(--tx-color-warning)]"
      >
        <template #label>
          <div class="space-y-1">
            <p>{{ t('dashboard.providerRegistry.summary.scenes', 'Scenes') }}</p>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.providerRegistry.summary.scenesHint', 'Strategy bindings configured') }}
            </p>
          </div>
        </template>
      </TxStatCard>
      <TxStatCard
        :value="usageCount"
        :label="t('dashboard.providerRegistry.summary.usage', 'Usage')"
        icon-class="i-carbon-data-check text-6xl text-[var(--tx-color-info)]"
      >
        <template #label>
          <div class="space-y-1">
            <p>{{ t('dashboard.providerRegistry.summary.usage', 'Usage') }}</p>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.providerRegistry.summary.usageHint', 'Recent run ledger rows') }}
            </p>
          </div>
        </template>
      </TxStatCard>
      <TxStatCard
        :value="unhealthyCount"
        :label="t('dashboard.providerRegistry.summary.health', 'Health')"
        icon-class="i-carbon-pulse text-6xl text-[var(--tx-color-danger)]"
      >
        <template #label>
          <div class="space-y-1">
            <p>{{ t('dashboard.providerRegistry.summary.health', 'Health') }}</p>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.providerRegistry.summary.healthHint', 'Non-healthy recent checks') }}
            </p>
          </div>
        </template>
      </TxStatCard>
    </section>

    <section>
      <TxTabs v-model="activeTab" placement="top" :content-scrollable="false">
        <TxTabItem name="providers" icon-class="i-carbon-cloud-service-management">
          <template #name>
            <span class="inline-flex items-center gap-2">
              <span class="i-carbon-cloud-service-management text-sm" aria-hidden="true" />
              <span>{{ t('dashboard.providerRegistry.tabs.providers', 'Providers') }}</span>
            </span>
          </template>

          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-black dark:text-white">
                  {{ t('dashboard.providerRegistry.providers.listTitle', 'Registered providers') }}
                </h2>
                <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                  {{ t('dashboard.providerRegistry.providers.listHint', 'Providers carry credentials, capabilities, quota, and health evidence.') }}
                </p>
              </div>
              <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <TuffInput
                  v-model="providerSearch"
                  class="w-full sm:w-[260px]"
                  clearable
                  prefix-icon="i-carbon-search"
                  :placeholder="t('dashboard.providerRegistry.providers.searchPlaceholder', 'Search provider, vendor, capability')"
                />
                <TuffSelect v-model="providerObservabilityFilter" class="w-full sm:w-44" :placeholder="t('dashboard.providerRegistry.providers.filterPlaceholder', 'Filter status')">
                  <TuffSelectItem
                    v-for="option in providerFilterOptions"
                    :key="option.value"
                    :value="option.value"
                    :label="`${filterLabel(option)} ${option.count}`"
                  />
                </TuffSelect>
                <TxButton variant="primary" size="small" icon="i-carbon-add" class="shrink-0" @click="openCreateProvider">
                  {{ t('dashboard.providerRegistry.providers.create', 'Create provider') }}
                </TxButton>
              </div>
            </div>

            <div
              v-if="providerObservabilityEmptyState"
              class="rounded-xl border p-4 text-sm"
              :class="{
                'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200': providerObservabilityEmptyState.tone === 'success',
                'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200': providerObservabilityEmptyState.tone === 'warning',
                'border-black/[0.05] bg-black/[0.02] text-black/55 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/55': providerObservabilityEmptyState.tone === 'muted',
              }"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-medium">
                    {{ t(providerObservabilityEmptyState.titleKey, providerObservabilityEmptyState.titleFallback) }}
                  </p>
                  <p class="mt-1 text-xs opacity-75">
                    {{ t(providerObservabilityEmptyState.detailKey, providerObservabilityEmptyState.detailFallback) }}
                  </p>
                </div>
                <TxButton
                  v-if="providers.length"
                  variant="secondary"
                  size="mini"
                  @click="providerObservabilityFilter = 'all'"
                >
                  {{ t(providerObservabilityEmptyState.actionKey, providerObservabilityEmptyState.actionFallback) }}
                </TxButton>
              </div>
            </div>

            <div class="overflow-x-auto">
              <TxDataTable
                :columns="providerColumns"
                :data="visibleProviders"
                row-key="id"
                :loading="loading"
                :empty-text="providerTableEmptyText"
                table-layout="auto"
                bordered
                nowrap
                class="min-w-[1470px]"
              >
                <template #cell-provider="{ row: provider }">
                  <div class="min-w-0 space-y-1 overflow-hidden">
                    <p class="truncate font-medium text-black dark:text-white" :title="provider.displayName">
                      {{ provider.displayName }}
                    </p>
                    <TxTooltip
                      reference-full-width
                      :open-delay="120"
                      :close-delay="80"
                      :anchor="{ placement: 'top-start', maxWidth: 460, showArrow: true }"
                    >
                      <p class="w-full min-w-0 overflow-hidden truncate whitespace-nowrap text-xs text-black/50 dark:text-white/50">
                        {{ providerIdentityText(provider) }}
                      </p>
                      <template #content>
                        <div class="space-y-2 text-xs">
                          <p class="max-w-[26rem] break-all font-mono text-black/70 dark:text-white/70">
                            {{ provider.id }}
                          </p>
                          <p class="text-black/50 dark:text-white/50">
                            {{ t('dashboard.providerRegistry.fields.vendor', 'Vendor') }}:
                            {{ valueLabel(provider.vendor) }}
                          </p>
                          <p class="text-black/50 dark:text-white/50">
                            {{ t('dashboard.providerRegistry.fields.authType', 'Auth type') }}:
                            {{ valueLabel(provider.authType) }}
                          </p>
                        </div>
                      </template>
                    </TxTooltip>
                  </div>
                </template>
                <template #cell-status="{ row: provider }">
                  <TxSwitch
                    :model-value="provider.status !== 'disabled'"
                    :disabled="actionPending !== null"
                    size="small"
                    :title="valueLabel(provider.status)"
                    :aria-label="t('dashboard.providerRegistry.providers.statusSwitchLabel', { provider: provider.displayName }, `Toggle ${provider.displayName}`)"
                    @change="enabled => toggleProviderStatus(provider, enabled)"
                  />
                </template>
                <template #cell-capabilities="{ row: provider }">
                  <div class="flex min-w-0 flex-nowrap gap-1.5 overflow-hidden">
                    <span
                      v-for="capability in provider.capabilities.slice(0, 3)"
                      :key="capability.id"
                      class="min-w-0"
                    >
                      <TxTooltip
                        :open-delay="120"
                        :close-delay="80"
                        :anchor="{ placement: 'top', maxWidth: 360, showArrow: true }"
                      >
                        <span class="block max-w-36 truncate rounded-full bg-black/[0.04] px-2 py-1 text-[11px] text-black/60 dark:bg-white/[0.06] dark:text-white/60">
                          {{ capability.capability }}
                        </span>
                        <template #content>
                          <div class="space-y-1.5 text-xs">
                            <p class="max-w-[20rem] break-all font-medium text-black/75 dark:text-white/75">
                              {{ capability.capability }}
                            </p>
                            <p class="text-black/50 dark:text-white/50">
                              {{ t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit') }}:
                              {{ capabilityMeteringUnit(capability) }}
                            </p>
                          </div>
                        </template>
                      </TxTooltip>
                    </span>
                    <span v-if="provider.capabilities.length > 3" class="shrink-0 text-xs text-black/45 dark:text-white/45">
                      +{{ provider.capabilities.length - 3 }}
                    </span>
                    <span v-if="!provider.capabilities.length" class="text-xs text-black/40 dark:text-white/40">-</span>
                  </div>
                </template>
                <template #cell-health="{ row: provider }">
                  <div class="space-y-1 whitespace-nowrap">
                    <TxStatusBadge
                      :text="valueLabel(getProviderObservability(provider.id).status)"
                      :status="observabilityTone(getProviderObservability(provider.id).status)"
                      size="sm"
                    />
                    <p class="text-[11px] text-black/45 dark:text-white/45">
                      {{ getProviderObservability(provider.id).latestHealth?.latencyMs ?? '-' }}ms
                    </p>
                  </div>
                </template>
                <template #cell-quota="{ row: provider }">
                  <div class="space-y-1 whitespace-nowrap text-xs text-black/55 dark:text-white/55">
                    <TxStatusBadge
                      :text="getProviderQuotaSummary(provider.id).configured ? (getProviderQuotaSummary(provider.id).enabled ? t('dashboard.providerRegistry.quota.enabled', 'enabled') : t('dashboard.providerRegistry.quota.disabled', 'disabled')) : t('dashboard.providerRegistry.quota.notConfigured', 'not configured')"
                      :status="getProviderQuotaSummary(provider.id).configured ? (getProviderQuotaSummary(provider.id).enabled ? 'success' : 'warning') : 'muted'"
                      size="sm"
                    />
                    <p>
                      {{ getProviderQuotaSummary(provider.id).maxRequests }}
                      {{ t('dashboard.providerRegistry.quota.requests', 'requests') }}
                      · {{ getProviderQuotaSummary(provider.id).count }}
                      {{ t('dashboard.providerRegistry.quota.channels', 'channels') }}
                    </p>
                  </div>
                </template>
                <template #cell-updatedAt="{ row: provider }">
                  <span class="text-xs text-black/50 dark:text-white/50">{{ formatDate(provider.updatedAt) }}</span>
                </template>
                <template #cell-actions="{ row: provider }">
                  <div class="flex flex-nowrap justify-end gap-2">
                    <TxButton
                      variant="secondary"
                      size="mini"
                      circle
                      :loading="actionPending === `provider:${provider.id}:check`"
                      :disabled="actionPending !== null && actionPending !== `provider:${provider.id}:check`"
                      icon="i-carbon-data-check"
                      :title="t('dashboard.providerRegistry.actions.check', 'Check')"
                      :aria-label="t('dashboard.providerRegistry.actions.check', 'Check')"
                      @click="checkProvider(provider)"
                    />
                    <TxButton
                      variant="secondary"
                      size="mini"
                      circle
                      icon="i-carbon-edit"
                      :title="t('dashboard.providerRegistry.actions.edit', 'Edit')"
                      :aria-label="t('dashboard.providerRegistry.actions.edit', 'Edit')"
                      @click="openEditProvider(provider)"
                    />
                    <TxButton
                      variant="secondary"
                      size="mini"
                      circle
                      icon="i-carbon-meter"
                      :title="t('dashboard.providerRegistry.actions.quota', 'Quota')"
                      :aria-label="t('dashboard.providerRegistry.actions.quota', 'Quota')"
                      @click="openProviderQuota(provider)"
                    />
                    <TxButton
                      variant="secondary"
                      size="mini"
                      circle
                      :disabled="actionPending !== null"
                      icon="i-carbon-trash-can"
                      :title="t('common.delete', 'Delete')"
                      :aria-label="t('common.delete', 'Delete')"
                      @click="deleteProvider(provider)"
                    />
                  </div>
                </template>
              </TxDataTable>
            </div>
          </div>
        </TxTabItem>

        <TxTabItem name="routes" icon-class="i-carbon-flow">
          <template #name>
            <span class="inline-flex items-center gap-2">
              <span class="i-carbon-flow text-sm" aria-hidden="true" />
              <span>{{ t('dashboard.providerRegistry.tabs.routes', 'Capability routes') }}</span>
            </span>
          </template>

          <div class="space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-black dark:text-white">
                  {{ t('dashboard.providerRegistry.routes.listTitle', 'Capability routes') }}
                </h2>
                <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                  {{ t('dashboard.providerRegistry.routes.listHint', 'Routes connect product capabilities to provider strategy rows.') }}
                </p>
              </div>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <button
                  v-for="option in sceneFilterOptions"
                  :key="option.value"
                  type="button"
                  class="cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors"
                  :class="sceneObservabilityFilter === option.value
                    ? 'border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-200'
                    : 'border-black/10 bg-white/70 text-black/55 hover:bg-black/[0.04] dark:border-white/10 dark:bg-black/15 dark:text-white/55 dark:hover:bg-white/[0.06]'"
                  @click="sceneObservabilityFilter = option.value"
                >
                  {{ filterLabel(option) }}
                  <span class="ml-1 text-black/35 dark:text-white/35">{{ option.count }}</span>
                </button>
                <TxButton variant="primary" size="small" :disabled="!providers.length" @click="openCreateScene">
                  {{ t('dashboard.providerRegistry.routes.create', 'Create route') }}
                </TxButton>
              </div>
            </div>

            <div
              v-if="sceneObservabilityEmptyState"
              class="rounded-xl border p-4 text-sm"
              :class="{
                'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200': sceneObservabilityEmptyState.tone === 'success',
                'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200': sceneObservabilityEmptyState.tone === 'warning',
                'border-black/[0.05] bg-black/[0.02] text-black/55 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/55': sceneObservabilityEmptyState.tone === 'muted',
              }"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-medium">
                    {{ t(sceneObservabilityEmptyState.titleKey, sceneObservabilityEmptyState.titleFallback) }}
                  </p>
                  <p class="mt-1 text-xs opacity-75">
                    {{ t(sceneObservabilityEmptyState.detailKey, sceneObservabilityEmptyState.detailFallback) }}
                  </p>
                </div>
                <TxButton
                  v-if="scenes.length"
                  variant="secondary"
                  size="mini"
                  @click="sceneObservabilityFilter = 'all'"
                >
                  {{ t(sceneObservabilityEmptyState.actionKey, sceneObservabilityEmptyState.actionFallback) }}
                </TxButton>
              </div>
            </div>

            <div class="overflow-x-auto">
              <TxDataTable
                :columns="sceneColumns"
                :data="filteredScenes"
                row-key="id"
                :loading="loading"
                :empty-text="t('dashboard.providerRegistry.routes.empty', 'No capability routes configured yet.')"
                bordered
                class="min-w-[1040px]"
              >
                <template #cell-scene="{ row: scene }">
                  <div class="min-w-0 space-y-1">
                    <p class="truncate font-medium text-black dark:text-white" :title="scene.displayName">
                      {{ scene.displayName }}
                    </p>
                    <p class="truncate text-xs text-black/45 dark:text-white/45" :title="scene.id">
                      {{ scene.id }} · {{ valueLabel(scene.owner) }}
                    </p>
                  </div>
                </template>
                <template #cell-status="{ row: scene }">
                  <TxStatusBadge :text="valueLabel(scene.status)" :status="statusTone(scene.status)" size="sm" />
                </template>
                <template #cell-strategy="{ row: scene }">
                  <span class="text-sm text-black/60 dark:text-white/60">
                    {{ valueLabel(scene.strategyMode) }} · {{ t('dashboard.providerRegistry.fields.fallback', 'Fallback') }} {{ valueLabel(scene.fallback) }}
                  </span>
                </template>
                <template #cell-requiredCapabilities="{ row: scene }">
                  <span class="block max-w-[260px] truncate text-xs text-black/55 dark:text-white/55" :title="scene.requiredCapabilities.join(', ')">
                    {{ scene.requiredCapabilities.join(', ') || '-' }}
                  </span>
                </template>
                <template #cell-latestRun="{ row: scene }">
                  <div class="space-y-1">
                    <TxStatusBadge
                      :text="valueLabel(getSceneObservability(scene.id).status)"
                      :status="observabilityTone(getSceneObservability(scene.id).status)"
                      size="sm"
                    />
                    <p class="truncate text-[11px] text-black/45 dark:text-white/45">
                      {{ getSceneObservability(scene.id).latestUsage?.providerId || '-' }}
                    </p>
                  </div>
                </template>
                <template #cell-actions="{ row: scene }">
                  <div class="flex flex-wrap justify-end gap-2">
                    <TxButton variant="secondary" size="mini" :disabled="actionPending !== null" @click="openRunScene(scene)">
                      {{ t('dashboard.providerRegistry.actions.run', 'Run') }}
                    </TxButton>
                    <TxButton variant="secondary" size="mini" @click="openEditScene(scene)">
                      {{ t('dashboard.providerRegistry.actions.edit', 'Edit') }}
                    </TxButton>
                    <TxButton variant="secondary" size="mini" :disabled="actionPending !== null || scene.status === 'enabled'" @click="updateSceneStatus(scene, 'enabled')">
                      {{ t('dashboard.providerRegistry.actions.enable', 'Enable') }}
                    </TxButton>
                    <TxButton variant="secondary" size="mini" :disabled="actionPending !== null || scene.status === 'disabled'" @click="updateSceneStatus(scene, 'disabled')">
                      {{ t('dashboard.providerRegistry.actions.disable', 'Disable') }}
                    </TxButton>
                    <TxButton variant="secondary" size="mini" :disabled="actionPending !== null" @click="deleteScene(scene)">
                      {{ t('common.delete', 'Delete') }}
                    </TxButton>
                  </div>
                </template>
              </TxDataTable>
            </div>

            <section class="space-y-3 border-t border-black/[0.06] pt-5 dark:border-white/[0.08]">
              <div>
                <h3 class="text-sm font-medium text-black dark:text-white">
                  {{ t('dashboard.providerRegistry.capabilities.indexTitle', 'Provider capability index') }}
                </h3>
                <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                  {{ t('dashboard.providerRegistry.capabilities.indexHint', 'Provider capabilities are declared on the provider and selected by routes.') }}
                </p>
              </div>
              <div class="overflow-x-auto">
                <TxDataTable
                  :columns="capabilityColumns"
                  :data="capabilities"
                  row-key="id"
                  :loading="loading"
                  :empty-text="t('dashboard.providerRegistry.capabilities.empty', 'No capabilities declared yet.')"
                  bordered
                  class="min-w-[760px]"
                >
                  <template #cell-capability="{ row: capability }">
                    <div class="min-w-0 space-y-1">
                      <p class="truncate font-medium text-black dark:text-white" :title="capability.capability">
                        {{ capability.capability }}
                      </p>
                      <p class="truncate text-xs text-black/45 dark:text-white/45" :title="capability.id">
                        {{ capability.id }}
                      </p>
                    </div>
                  </template>
                  <template #cell-provider="{ row: capability }">
                    <span class="text-sm text-black/60 dark:text-white/60">{{ getProviderName(capability.providerId) }}</span>
                  </template>
                  <template #cell-metering="{ row: capability }">
                    <span class="text-sm text-black/60 dark:text-white/60">{{ capabilityMeteringUnit(capability) }}</span>
                  </template>
                  <template #cell-adapter="{ row: capability }">
                    <TxStatusBadge
                      :text="capability.adapter?.ready ? t('dashboard.providerRegistry.adapter.ready', 'adapter ready') : t('dashboard.providerRegistry.adapter.missing', 'adapter missing')"
                      :status="capability.adapter?.ready ? 'success' : 'warning'"
                      size="sm"
                    />
                  </template>
                </TxDataTable>
              </div>
            </section>
          </div>
        </TxTabItem>

        <TxTabItem name="usage" icon-class="i-carbon-data-check">
          <template #name>
            <span class="inline-flex items-center gap-2">
              <span class="i-carbon-data-check text-sm" aria-hidden="true" />
              <span>{{ t('dashboard.providerRegistry.tabs.usage', 'Usage') }}</span>
            </span>
          </template>

          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-black dark:text-white">
                  {{ t('dashboard.providerRegistry.usage.listTitle', 'Usage ledger') }}
                </h2>
                <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                  {{ t('dashboard.providerRegistry.usage.listHint', 'Recent scene runs, billing references, and fallback evidence.') }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="option in usageFilterOptions"
                  :key="option.value"
                  type="button"
                  class="cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors"
                  :class="usageLedgerFilter === option.value
                    ? 'border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-200'
                    : 'border-black/10 bg-white/70 text-black/55 hover:bg-black/[0.04] dark:border-white/10 dark:bg-black/15 dark:text-white/55 dark:hover:bg-white/[0.06]'"
                  @click="usageLedgerFilter = option.value"
                >
                  {{ filterLabel(option) }}
                  <span class="ml-1 text-black/35 dark:text-white/35">{{ option.count }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="usageLedgerEmptyState"
              class="rounded-xl border p-4 text-sm"
              :class="{
                'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200': usageLedgerEmptyState.tone === 'success',
                'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200': usageLedgerEmptyState.tone === 'warning',
                'border-black/[0.05] bg-black/[0.02] text-black/55 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/55': usageLedgerEmptyState.tone === 'muted',
              }"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-medium">
                    {{ t(usageLedgerEmptyState.titleKey, usageLedgerEmptyState.titleFallback) }}
                  </p>
                  <p class="mt-1 text-xs opacity-75">
                    {{ t(usageLedgerEmptyState.detailKey, usageLedgerEmptyState.detailFallback) }}
                  </p>
                </div>
                <TxButton
                  v-if="usageEntries.length"
                  variant="secondary"
                  size="mini"
                  @click="usageLedgerFilter = 'all'"
                >
                  {{ t(usageLedgerEmptyState.actionKey, usageLedgerEmptyState.actionFallback) }}
                </TxButton>
              </div>
            </div>

            <div class="overflow-x-auto">
              <TxDataTable
                :columns="usageColumns"
                :data="filteredUsageEntries"
                row-key="id"
                :loading="loading"
                :empty-text="t('dashboard.providerRegistry.usage.empty', 'No route run usage recorded yet.')"
                bordered
                class="min-w-[940px]"
              >
                <template #cell-run="{ row: entry }">
                  <div class="min-w-0 space-y-1">
                    <p class="truncate font-medium text-black dark:text-white" :title="entry.sceneId">
                      {{ entry.sceneId }}
                    </p>
                    <p class="truncate text-xs text-black/45 dark:text-white/45" :title="entry.runId">
                      {{ entry.runId }} · {{ valueLabel(entry.mode) }} · {{ entry.capability || '-' }}
                    </p>
                  </div>
                </template>
                <template #cell-status="{ row: entry }">
                  <TxStatusBadge :text="valueLabel(entry.status)" :status="statusTone(entry.status)" size="sm" />
                </template>
                <template #cell-provider="{ row: entry }">
                  <span class="text-sm text-black/60 dark:text-white/60">{{ getProviderName(entry.providerId) }}</span>
                </template>
                <template #cell-metering="{ row: entry }">
                  <span class="text-sm text-black/60 dark:text-white/60">
                    {{ entry.quantity }} {{ entry.unit }} · {{ booleanLabel(entry.billable) }}
                  </span>
                </template>
                <template #cell-reference="{ row: entry }">
                  <span class="block max-w-[220px] truncate text-xs text-black/55 dark:text-white/55" :title="getUsageLedgerReference(entry)">
                    {{ getUsageLedgerReference(entry) }}
                  </span>
                </template>
                <template #cell-createdAt="{ row: entry }">
                  <span class="text-xs text-black/50 dark:text-white/50">{{ formatDate(entry.createdAt) }}</span>
                </template>
              </TxDataTable>
            </div>
          </div>
        </TxTabItem>

        <TxTabItem name="health" icon-class="i-carbon-pulse">
          <template #name>
            <span class="inline-flex items-center gap-2">
              <span class="i-carbon-pulse text-sm" aria-hidden="true" />
              <span>{{ t('dashboard.providerRegistry.tabs.health', 'Health') }}</span>
            </span>
          </template>

          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-black dark:text-white">
                  {{ t('dashboard.providerRegistry.health.listTitle', 'Health checks') }}
                </h2>
                <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                  {{ t('dashboard.providerRegistry.health.listHint', 'Latest provider check evidence across capabilities and endpoints.') }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="option in healthFilterOptions"
                  :key="option.value"
                  type="button"
                  class="cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors"
                  :class="healthCheckFilter === option.value
                    ? 'border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-200'
                    : 'border-black/10 bg-white/70 text-black/55 hover:bg-black/[0.04] dark:border-white/10 dark:bg-black/15 dark:text-white/55 dark:hover:bg-white/[0.06]'"
                  @click="healthCheckFilter = option.value"
                >
                  {{ filterLabel(option) }}
                  <span class="ml-1 text-black/35 dark:text-white/35">{{ option.count }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="healthCheckEmptyState"
              class="rounded-xl border p-4 text-sm"
              :class="{
                'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200': healthCheckEmptyState.tone === 'success',
                'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200': healthCheckEmptyState.tone === 'warning',
                'border-black/[0.05] bg-black/[0.02] text-black/55 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/55': healthCheckEmptyState.tone === 'muted',
              }"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-medium">
                    {{ t(healthCheckEmptyState.titleKey, healthCheckEmptyState.titleFallback) }}
                  </p>
                  <p class="mt-1 text-xs opacity-75">
                    {{ t(healthCheckEmptyState.detailKey, healthCheckEmptyState.detailFallback) }}
                  </p>
                </div>
                <TxButton
                  v-if="healthEntries.length"
                  variant="secondary"
                  size="mini"
                  @click="healthCheckFilter = 'all'"
                >
                  {{ t(healthCheckEmptyState.actionKey, healthCheckEmptyState.actionFallback) }}
                </TxButton>
              </div>
            </div>

            <div class="overflow-x-auto">
              <TxDataTable
                :columns="healthColumns"
                :data="filteredHealthEntries"
                row-key="id"
                :loading="loading"
                :empty-text="t('dashboard.providerRegistry.health.empty', 'No provider health checks recorded yet.')"
                bordered
                class="min-w-[920px]"
              >
                <template #cell-provider="{ row: entry }">
                  <div class="min-w-0 space-y-1">
                    <p class="truncate font-medium text-black dark:text-white" :title="entry.providerName">
                      {{ entry.providerName }}
                    </p>
                    <p class="truncate text-xs text-black/45 dark:text-white/45" :title="entry.endpoint">
                      {{ entry.providerId }} · {{ valueLabel(entry.vendor) }}
                    </p>
                  </div>
                </template>
                <template #cell-status="{ row: entry }">
                  <TxStatusBadge :text="valueLabel(entry.status)" :status="observabilityTone(entry.status)" size="sm" />
                </template>
                <template #cell-capability="{ row: entry }">
                  <span class="text-sm text-black/60 dark:text-white/60">{{ entry.capability }}</span>
                </template>
                <template #cell-latency="{ row: entry }">
                  <span class="text-sm text-black/60 dark:text-white/60">{{ entry.latencyMs }}ms</span>
                </template>
                <template #cell-reason="{ row: entry }">
                  <span class="block max-w-[260px] truncate text-xs text-black/55 dark:text-white/55" :title="getHealthCheckReason(entry)">
                    {{ getHealthCheckReason(entry) }}
                  </span>
                </template>
                <template #cell-checkedAt="{ row: entry }">
                  <span class="text-xs text-black/50 dark:text-white/50">{{ formatDate(entry.checkedAt) }}</span>
                </template>
              </TxDataTable>
            </div>
          </div>
        </TxTabItem>
      </TxTabs>
    </section>

    <TxDrawer
      v-model:visible="providerDrawerOpen"
      :title="providerDrawerTitle"
      size="min(920px, 100vw)"
      direction="right"
    >
      <div class="space-y-6">
        <template v-if="providerDrawerMode === 'create'">
          <section class="space-y-3">
            <p class="text-sm text-black/50 dark:text-white/50">
              {{ t('dashboard.providerRegistry.providers.createHint', 'Credentials are saved in secure storage when this provider needs authentication.') }}
            </p>
            <div class="grid gap-3 md:grid-cols-2">
              <div>
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.serviceCategory', 'Service category') }}</label>
                <TuffSelect v-model="providerServiceCategoryId" class="w-full min-w-0" @change="applyProviderServiceCategory">
                  <TuffSelectItem
                    v-for="category in providerServiceCategoryOptions"
                    :key="category.value"
                    :value="category.value"
                    :label="valueLabel(category.value)"
                  />
                </TuffSelect>
              </div>
              <div>
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.adapter', 'Adapter') }}</label>
                <TuffSelect v-model="providerTemplateId" class="w-full min-w-0" @change="applyProviderTemplate">
                  <TuffSelectItem v-for="template in providerTemplateOptions" :key="template.value" :value="template.value" :label="template.label" />
                </TuffSelect>
              </div>
              <div>
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.name', 'Name') }}</label>
                <TuffInput v-model="providerForm.name" class="w-full" />
              </div>
              <div>
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.displayName', 'Display name') }}</label>
                <TuffInput v-model="providerForm.displayName" class="w-full" />
              </div>
              <div>
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.vendor', 'Vendor') }}</label>
                <TuffSelect v-model="providerForm.vendor" class="w-full min-w-0">
                  <TuffSelectItem v-for="vendor in providerVendorOptions" :key="vendor" :value="vendor" :label="valueLabel(vendor)" />
                </TuffSelect>
              </div>
              <div>
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
                <TuffSelect v-model="providerForm.status" class="w-full min-w-0">
                  <TuffSelectItem v-for="status in providerStatusOptions" :key="status" :value="status" :label="valueLabel(status)" />
                </TuffSelect>
              </div>
              <div>
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.authType', 'Auth type') }}</label>
                <TuffSelect v-model="providerForm.authType" class="w-full min-w-0">
                  <TuffSelectItem v-for="type in authTypeOptions" :key="type" :value="type" :label="valueLabel(type)" />
                </TuffSelect>
              </div>
              <div v-if="providerForm.authType === 'api_key'">
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.apiKey', 'API Key') }}</label>
                <TuffInput v-model="providerForm.apiKey" class="w-full" type="password" autocomplete="new-password" />
              </div>
              <div>
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.endpoint', 'Endpoint') }}</label>
                <TuffInput v-model="providerForm.endpoint" class="w-full" />
              </div>
              <div>
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.region', 'Region') }}</label>
                <TuffInput v-model="providerForm.region" class="w-full" />
              </div>
              <div v-if="providerForm.authType === 'secret_pair'">
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.secretId', 'SecretId') }}</label>
                <TuffInput v-model="providerForm.secretId" class="w-full" autocomplete="off" />
              </div>
              <div v-if="providerForm.authType === 'secret_pair'">
                <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.secretKey', 'SecretKey') }}</label>
                <TuffInput v-model="providerForm.secretKey" class="w-full" type="password" autocomplete="new-password" />
              </div>
            </div>
          </section>

          <section class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-medium text-black dark:text-white">
                {{ t('dashboard.providerRegistry.providers.capabilitiesTitle', 'Capabilities') }}
              </h3>
              <TxButton variant="secondary" size="mini" @click="addCapabilityRow">
                {{ t('dashboard.providerRegistry.actions.addCapability', 'Add capability') }}
              </TxButton>
            </div>
            <div class="overflow-x-auto rounded-xl border border-black/[0.08] dark:border-white/[0.1]">
              <table class="w-full min-w-[620px] border-collapse text-left text-sm">
                <thead class="bg-black/[0.03] text-xs font-medium text-black/55 dark:bg-white/[0.04] dark:text-white/55">
                  <tr>
                    <th class="px-3 py-2">
                      {{ t('dashboard.providerRegistry.fields.capability', 'Capability') }}
                    </th>
                    <th class="w-44 px-3 py-2">
                      {{ t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit') }}
                    </th>
                    <th class="w-12 px-3 py-2 text-right">
                      {{ t('dashboard.providerRegistry.table.actions', 'Actions') }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, index) in capabilityRows"
                    :key="index"
                    class="border-t border-black/[0.06] dark:border-white/[0.08]"
                  >
                    <td class="px-3 py-2">
                      <TuffSelect v-model="row.capability" class="w-full min-w-0" :placeholder="t('dashboard.providerRegistry.fields.capability', 'Capability')" @change="applyProviderCapabilityTemplate(row, $event)">
                        <TuffSelectItem
                          v-for="capability in providerCapabilityTemplateOptions"
                          :key="capability.capability"
                          :value="capability.capability"
                          :label="capability.capability"
                        />
                      </TuffSelect>
                    </td>
                    <td class="px-3 py-2">
                      <TuffSelect v-model="row.meteringUnit" class="w-full min-w-0" :placeholder="t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit')">
                        <TuffSelectItem v-for="unit in providerMeteringUnitOptions" :key="unit" :value="unit" :label="unit" />
                      </TuffSelect>
                    </td>
                    <td class="px-3 py-2 text-right">
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-35"
                        :disabled="capabilityRows.length <= 1"
                        :title="t('common.remove', 'Remove')"
                        :aria-label="t('common.remove', 'Remove')"
                        @click="removeCapabilityRow(index)"
                      >
                        <span class="i-carbon-close text-base" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>

        <template v-else-if="providerDrawerMode === 'edit' && selectedProvider && activeProviderEditPanel">
          <div v-if="activeProviderEditPanel.error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
            {{ activeProviderEditPanel.error }}
          </div>
          <section class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.name', 'Name') }}</label>
              <TuffInput v-model="activeProviderEditPanel.name" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.displayName', 'Display name') }}</label>
              <TuffInput v-model="activeProviderEditPanel.displayName" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.vendor', 'Vendor') }}</label>
              <TuffSelect v-model="activeProviderEditPanel.vendor" class="w-full">
                <TuffSelectItem v-for="vendor in providerVendorOptions" :key="vendor" :value="vendor" :label="valueLabel(vendor)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
              <TuffSelect v-model="activeProviderEditPanel.status" class="w-full">
                <TuffSelectItem v-for="status in providerStatusOptions" :key="status" :value="status" :label="valueLabel(status)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.authType', 'Auth type') }}</label>
              <TuffSelect v-model="activeProviderEditPanel.authType" class="w-full">
                <TuffSelectItem v-for="type in authTypeOptions" :key="type" :value="type" :label="valueLabel(type)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.authRef', 'Auth ref') }}</label>
              <TuffInput v-model="activeProviderEditPanel.authRef" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.ownerScope', 'Owner scope') }}</label>
              <TuffSelect v-model="activeProviderEditPanel.ownerScope" class="w-full">
                <TuffSelectItem v-for="scope in ownerScopeOptions" :key="scope" :value="scope" :label="valueLabel(scope)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.ownerId', 'Owner ID') }}</label>
              <TuffInput v-model="activeProviderEditPanel.ownerId" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.endpoint', 'Endpoint') }}</label>
              <TuffInput v-model="activeProviderEditPanel.endpoint" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.region', 'Region') }}</label>
              <TuffInput v-model="activeProviderEditPanel.region" class="w-full" />
            </div>
            <div class="md:col-span-2">
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.description', 'Description') }}</label>
              <TuffInput v-model="activeProviderEditPanel.description" class="w-full" />
            </div>
            <div class="md:col-span-2">
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON') }}</label>
              <TuffInput v-model="activeProviderEditPanel.metadataText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
            </div>
          </section>

          <section class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-medium text-black dark:text-white">
                {{ t('dashboard.providerRegistry.providers.capabilitiesTitle', 'Capabilities') }}
              </h3>
              <TxButton variant="secondary" size="mini" @click="addProviderCapabilityEditRow(selectedProvider)">
                {{ t('dashboard.providerRegistry.actions.addCapability', 'Add capability') }}
              </TxButton>
            </div>
            <div class="overflow-x-auto rounded-xl border border-black/[0.08] dark:border-white/[0.1]">
              <table class="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead class="bg-black/[0.03] text-xs font-medium text-black/55 dark:bg-white/[0.04] dark:text-white/55">
                  <tr>
                    <th class="w-56 px-3 py-2">
                      {{ t('dashboard.providerRegistry.fields.capability', 'Capability') }}
                    </th>
                    <th class="px-3 py-2">
                      {{ t('dashboard.providerRegistry.fields.meteringJson', 'Metering JSON') }}
                    </th>
                    <th class="px-3 py-2">
                      {{ t('dashboard.providerRegistry.fields.constraintsJson', 'Constraints JSON') }}
                    </th>
                    <th class="px-3 py-2">
                      {{ t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON') }}
                    </th>
                    <th class="w-12 px-3 py-2 text-right">
                      {{ t('dashboard.providerRegistry.table.actions', 'Actions') }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, index) in activeProviderEditPanel.capabilities"
                    :key="index"
                    class="align-top border-t border-black/[0.06] dark:border-white/[0.08]"
                  >
                    <td class="px-3 py-2">
                      <TuffInput v-model="row.capability" class="w-full" placeholder="text.translate" />
                    </td>
                    <td class="px-3 py-2">
                      <TuffInput v-model="row.meteringText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ &quot;unit&quot;: &quot;request&quot; }" />
                    </td>
                    <td class="px-3 py-2">
                      <TuffInput v-model="row.constraintsText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
                    </td>
                    <td class="px-3 py-2">
                      <TuffInput v-model="row.metadataText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
                    </td>
                    <td class="px-3 py-2 text-right">
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition hover:bg-red-500/10"
                        :title="t('common.remove', 'Remove')"
                        :aria-label="t('common.remove', 'Remove')"
                        @click="removeProviderCapabilityEditRow(selectedProvider, index)"
                      >
                        <span class="i-carbon-close text-base" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>

        <template v-else-if="providerDrawerMode === 'quota' && selectedProvider && activeProviderQuotaPanel">
          <p class="text-sm text-black/50 dark:text-white/50">
            {{ t('dashboard.providerRegistry.quota.editHint', 'Limit direct Intelligence invokes and scene runs before provider dispatch.') }}
          </p>
          <div v-if="activeProviderQuotaPanel.error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
            {{ activeProviderQuotaPanel.error }}
          </div>
          <section class="grid gap-3 md:grid-cols-2">
            <div class="md:col-span-2">
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.quota.name', 'Quota name') }}</label>
              <TuffInput v-model="activeProviderQuotaPanel.name" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
              <TuffSelect v-model="activeProviderQuotaPanel.enabled" class="w-full">
                <TuffSelectItem value="enabled" :label="t('dashboard.providerRegistry.quota.enabled', 'enabled')" />
                <TuffSelectItem value="disabled" :label="t('dashboard.providerRegistry.quota.disabled', 'disabled')" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.quota.windowDays', 'Window days') }}</label>
              <TuffInput v-model="activeProviderQuotaPanel.windowDays" type="number" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.quota.maxRequests', 'Max requests') }}</label>
              <TuffInput v-model="activeProviderQuotaPanel.maxRequests" type="number" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.quota.maxTokens', 'Max tokens') }}</label>
              <TuffInput v-model="activeProviderQuotaPanel.maxTokens" type="number" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.quota.warningThreshold', 'Warning %') }}</label>
              <TuffInput v-model="activeProviderQuotaPanel.warningThreshold" type="number" class="w-full" />
            </div>
          </section>

          <section v-if="getProviderQuotaList(selectedProvider.id).length > 1" class="space-y-2">
            <h3 class="text-sm font-medium text-black dark:text-white">
              {{ t('dashboard.providerRegistry.quota.channels', 'channels') }}
            </h3>
            <div
              v-for="quota in getProviderQuotaList(selectedProvider.id)"
              :key="quota.id"
              class="rounded-xl bg-black/[0.02] px-3 py-2 text-xs text-black/55 dark:bg-white/[0.04] dark:text-white/55"
            >
              {{ quota.channel || t('dashboard.providerRegistry.quota.defaultChannel', 'default') }}
              · {{ t('dashboard.providerRegistry.quota.requests', 'requests') }} {{ quota.limits?.maxRequests ?? '-' }}
              · {{ t('dashboard.providerRegistry.quota.tokens', 'tokens') }} {{ quota.limits?.maxTokens ?? '-' }}
            </div>
          </section>
        </template>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <TxButton variant="secondary" size="small" :disabled="providerDrawerSaving" @click="closeProviderDrawer">
            {{ t('common.cancel', 'Cancel') }}
          </TxButton>
          <TxButton variant="primary" size="small" :disabled="providerDrawerSaving" @click="submitProviderDrawer">
            <TxSpinner v-if="providerDrawerSaving" :size="14" />
            <span :class="providerDrawerSaving ? 'ml-2' : ''">{{ providerDrawerPrimaryLabel }}</span>
          </TxButton>
        </div>
      </template>
    </TxDrawer>

    <TxDrawer
      v-model:visible="sceneDrawerOpen"
      :title="sceneDrawerTitle"
      size="min(820px, 100vw)"
      direction="right"
    >
      <div class="space-y-6">
        <template v-if="sceneDrawerMode === 'create'">
          <p class="text-sm text-black/50 dark:text-white/50">
            {{ t('dashboard.providerRegistry.routes.createHint', 'Bind a route to provider capabilities and strategy rules.') }}
          </p>
          <section class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.routeId', 'Route ID') }}</label>
              <TuffInput v-model="sceneForm.id" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.displayName', 'Display name') }}</label>
              <TuffInput v-model="sceneForm.displayName" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.owner', 'Owner') }}</label>
              <TuffSelect v-model="sceneForm.owner" class="w-full">
                <TuffSelectItem v-for="owner in sceneOwnerOptions" :key="owner" :value="owner" :label="valueLabel(owner)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.strategy', 'Strategy') }}</label>
              <TuffSelect v-model="sceneForm.strategyMode" class="w-full">
                <TuffSelectItem v-for="strategy in strategyOptions" :key="strategy" :value="strategy" :label="valueLabel(strategy)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
              <TuffSelect v-model="sceneForm.status" class="w-full">
                <TuffSelectItem value="enabled" :label="valueLabel('enabled')" />
                <TuffSelectItem value="disabled" :label="valueLabel('disabled')" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.fallback', 'Fallback') }}</label>
              <TuffSelect v-model="sceneForm.fallback" class="w-full">
                <TuffSelectItem v-for="fallback in fallbackOptions" :key="fallback" :value="fallback" :label="valueLabel(fallback)" />
              </TuffSelect>
            </div>
            <div class="md:col-span-2">
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.requiredCapabilities', 'Required capabilities') }}</label>
              <TuffInput v-model="sceneForm.requiredCapabilitiesText" class="w-full" placeholder="image.translate.e2e, text.translate" />
            </div>
          </section>

          <section class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-medium text-black dark:text-white">
                {{ t('dashboard.providerRegistry.routes.bindingsTitle', 'Provider bindings') }}
              </h3>
              <TxButton variant="secondary" size="mini" :disabled="!providers.length" @click="addBindingRow">
                {{ t('dashboard.providerRegistry.actions.addBinding', 'Add binding') }}
              </TxButton>
            </div>
            <div
              v-for="(row, index) in bindingRows"
              :key="index"
              class="grid items-center gap-2 rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04] md:grid-cols-[1fr_1fr_100px_36px]"
            >
              <TuffSelect v-model="row.providerId" class="w-full">
                <TuffSelectItem v-for="provider in providerOptions" :key="provider.value" :value="provider.value" :label="provider.label" />
              </TuffSelect>
              <TuffInput v-model="row.capability" placeholder="image.translate.e2e" />
              <TuffInput v-model="row.priority" type="number" placeholder="10" />
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-35"
                :disabled="bindingRows.length <= 1"
                :title="t('common.remove', 'Remove')"
                :aria-label="t('common.remove', 'Remove')"
                @click="removeBindingRow(index)"
              >
                <span class="i-carbon-close text-base" aria-hidden="true" />
              </button>
            </div>
          </section>
        </template>

        <template v-else-if="sceneDrawerMode === 'edit' && selectedScene && activeSceneEditPanel">
          <div v-if="activeSceneEditPanel.error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
            {{ activeSceneEditPanel.error }}
          </div>
          <section class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.displayName', 'Display name') }}</label>
              <TuffInput v-model="activeSceneEditPanel.displayName" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.owner', 'Owner') }}</label>
              <TuffSelect v-model="activeSceneEditPanel.owner" class="w-full">
                <TuffSelectItem v-for="owner in sceneOwnerOptions" :key="owner" :value="owner" :label="valueLabel(owner)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.ownerScope', 'Owner scope') }}</label>
              <TuffSelect v-model="activeSceneEditPanel.ownerScope" class="w-full">
                <TuffSelectItem v-for="scope in ownerScopeOptions" :key="scope" :value="scope" :label="valueLabel(scope)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.ownerId', 'Owner ID') }}</label>
              <TuffInput v-model="activeSceneEditPanel.ownerId" class="w-full" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
              <TuffSelect v-model="activeSceneEditPanel.status" class="w-full">
                <TuffSelectItem v-for="status in bindingStatusOptions" :key="status" :value="status" :label="valueLabel(status)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.strategy', 'Strategy') }}</label>
              <TuffSelect v-model="activeSceneEditPanel.strategyMode" class="w-full">
                <TuffSelectItem v-for="strategy in strategyOptions" :key="strategy" :value="strategy" :label="valueLabel(strategy)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.fallback', 'Fallback') }}</label>
              <TuffSelect v-model="activeSceneEditPanel.fallback" class="w-full">
                <TuffSelectItem v-for="fallback in fallbackOptions" :key="fallback" :value="fallback" :label="valueLabel(fallback)" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.requiredCapabilities', 'Required capabilities') }}</label>
              <TuffInput v-model="activeSceneEditPanel.requiredCapabilitiesText" class="w-full" placeholder="image.translate.e2e, text.translate" />
            </div>
            <div class="md:col-span-2">
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.meteringPolicyJson', 'Metering policy JSON') }}</label>
              <TuffInput v-model="activeSceneEditPanel.meteringPolicyText" type="textarea" :rows="3" class="w-full font-mono text-xs" placeholder="{ }" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.auditPolicyJson', 'Audit policy JSON') }}</label>
              <TuffInput v-model="activeSceneEditPanel.auditPolicyText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ &quot;persistInput&quot;: false, &quot;persistOutput&quot;: false }" />
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON') }}</label>
              <TuffInput v-model="activeSceneEditPanel.metadataText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
            </div>
          </section>

          <section class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-medium text-black dark:text-white">
                {{ t('dashboard.providerRegistry.routes.bindingsTitle', 'Provider bindings') }}
              </h3>
              <TxButton variant="secondary" size="mini" :disabled="!providers.length" @click="addSceneBindingEditRow(selectedScene)">
                {{ t('dashboard.providerRegistry.actions.addBinding', 'Add binding') }}
              </TxButton>
            </div>
            <div
              v-for="(row, index) in activeSceneEditPanel.bindings"
              :key="index"
              class="space-y-2 rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]"
            >
              <div class="grid items-center gap-2 md:grid-cols-[1fr_1fr_90px_90px_120px_36px]">
                <TuffSelect v-model="row.providerId" class="w-full">
                  <TuffSelectItem v-for="providerOption in providerOptions" :key="providerOption.value" :value="providerOption.value" :label="providerOption.label" />
                </TuffSelect>
                <TuffInput v-model="row.capability" placeholder="image.translate.e2e" />
                <TuffInput v-model="row.priority" type="number" placeholder="100" />
                <TuffInput v-model="row.weightText" type="number" placeholder="weight" />
                <TuffSelect v-model="row.status" class="w-full">
                  <TuffSelectItem v-for="status in bindingStatusOptions" :key="status" :value="status" :label="valueLabel(status)" />
                </TuffSelect>
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition hover:bg-red-500/10"
                  :title="t('common.remove', 'Remove')"
                  :aria-label="t('common.remove', 'Remove')"
                  @click="removeSceneBindingEditRow(selectedScene, index)"
                >
                  <span class="i-carbon-close text-base" aria-hidden="true" />
                </button>
              </div>
              <div class="grid gap-2 lg:grid-cols-2">
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.constraintsJson', 'Constraints JSON') }}</label>
                  <TuffInput v-model="row.constraintsText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ &quot;cost&quot;: 0.01 }" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON') }}</label>
                  <TuffInput v-model="row.metadataText" type="textarea" :rows="4" class="w-full font-mono text-xs" placeholder="{ }" />
                </div>
              </div>
            </div>
          </section>
        </template>

        <template v-else-if="sceneDrawerMode === 'run' && selectedScene && activeSceneRunPanel">
          <section class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.capability', 'Capability') }}</label>
              <TuffSelect
                :model-value="activeSceneRunPanel.capability"
                class="w-full"
                @update:model-value="selectSceneRunCapability(selectedScene, String($event ?? ''))"
              >
                <TuffSelectItem value="" :label="t('dashboard.providerRegistry.routes.defaultCapability', 'Route default')" />
                <TuffSelectItem v-for="capability in sceneCapabilities(selectedScene)" :key="capability" :value="capability" :label="capability" />
              </TuffSelect>
            </div>
            <div>
              <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.provider', 'Provider') }}</label>
              <TuffSelect v-model="activeSceneRunPanel.providerId" class="w-full">
                <TuffSelectItem value="" :label="t('dashboard.providerRegistry.routes.defaultProvider', 'Strategy default')" />
                <TuffSelectItem v-for="provider in sceneProviderOptions(selectedScene)" :key="provider.value" :value="provider.value" :label="provider.label" />
              </TuffSelect>
            </div>
            <div class="md:col-span-2">
              <div class="mb-1 flex items-center justify-between gap-2">
                <label class="apple-section-title block">{{ t('dashboard.providerRegistry.routes.inputJson', 'Input JSON') }}</label>
                <TxButton variant="secondary" size="mini" @click="selectSceneRunCapability(selectedScene, activeSceneRunPanel.capability)">
                  {{ t('dashboard.providerRegistry.routes.resetSample', 'Reset sample') }}
                </TxButton>
              </div>
              <TuffInput v-model="activeSceneRunPanel.inputText" type="textarea" :rows="7" class="w-full font-mono text-xs" placeholder="{&quot;text&quot;:&quot;Hello&quot;,&quot;targetLang&quot;:&quot;zh&quot;}" />
            </div>
          </section>

          <div v-if="activeSceneRunPanel.error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
            {{ activeSceneRunPanel.error }}
          </div>

          <section v-if="activeSceneRunPanel.result" class="space-y-4">
            <div class="flex flex-wrap items-center gap-2 text-xs text-black/55 dark:text-white/55">
              <TxStatusBadge :text="valueLabel(activeSceneRunPanel.result.status)" :status="statusTone(activeSceneRunPanel.result.status)" size="sm" />
              <span>{{ activeSceneRunPanel.result.runId }}</span>
              <span>{{ valueLabel(activeSceneRunPanel.result.mode) }}</span>
            </div>
            <div class="grid gap-3 lg:grid-cols-2">
              <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
                <p class="apple-section-title mb-2">
                  {{ t('dashboard.providerRegistry.routes.trace', 'Trace') }}
                </p>
                <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-black/60 dark:text-white/60">{{ formatRunJson(activeSceneRunPanel.result.trace) }}</pre>
              </div>
              <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
                <p class="apple-section-title mb-2">
                  {{ t('dashboard.providerRegistry.routes.output', 'Output') }}
                </p>
                <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-black/60 dark:text-white/60">{{ formatRunJson(activeSceneRunPanel.result.output ?? null) }}</pre>
              </div>
              <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
                <p class="apple-section-title mb-2">
                  {{ t('dashboard.providerRegistry.routes.selection', 'Selection') }}
                </p>
                <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-black/60 dark:text-white/60">{{ formatRunJson(activeSceneRunPanel.result.selected ?? []) }}</pre>
              </div>
              <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
                <p class="apple-section-title mb-2">
                  {{ t('dashboard.providerRegistry.routes.fallbackTrail', 'Fallback trail') }}
                </p>
                <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-black/60 dark:text-white/60">{{ formatRunJson(activeSceneRunPanel.result.fallbackTrail ?? []) }}</pre>
              </div>
            </div>
          </section>
        </template>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <TxButton variant="secondary" size="small" :disabled="sceneDrawerSaving" @click="closeSceneDrawer">
            {{ t('common.cancel', 'Cancel') }}
          </TxButton>
          <template v-if="sceneDrawerMode === 'run' && selectedScene">
            <TxButton variant="secondary" size="small" :disabled="actionPending !== null" @click="runScene(selectedScene, true)">
              <TxSpinner v-if="actionPending === `scene:${selectedScene.id}:run:dry`" :size="14" />
              <span :class="actionPending === `scene:${selectedScene.id}:run:dry` ? 'ml-2' : ''">{{ t('dashboard.providerRegistry.actions.dryRun', 'Dry run') }}</span>
            </TxButton>
            <TxButton variant="primary" size="small" :disabled="actionPending !== null || selectedScene.status !== 'enabled'" @click="runScene(selectedScene, false)">
              <TxSpinner v-if="actionPending === `scene:${selectedScene.id}:run:execute`" :size="14" />
              <span :class="actionPending === `scene:${selectedScene.id}:run:execute` ? 'ml-2' : ''">{{ t('dashboard.providerRegistry.actions.execute', 'Execute') }}</span>
            </TxButton>
          </template>
          <TxButton v-else variant="primary" size="small" :disabled="sceneDrawerSaving" @click="submitSceneDrawer">
            <TxSpinner v-if="sceneDrawerSaving" :size="14" />
            <span :class="sceneDrawerSaving ? 'ml-2' : ''">{{ sceneDrawerPrimaryLabel }}</span>
          </TxButton>
        </div>
      </template>
    </TxDrawer>
  </div>
</template>
