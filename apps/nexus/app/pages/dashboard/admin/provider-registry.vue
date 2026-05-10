<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxSkeleton, TxSpinner, TxStatusBadge, TxTabItem, TxTabs } from '@talex-touch/tuffex'
import { useToast } from '~/composables/useToast'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

type ProviderVendor = 'tencent-cloud' | 'openai' | 'deepseek' | 'exchange-rate' | 'custom'
type ProviderStatus = 'enabled' | 'disabled' | 'degraded'
type ProviderAuthType = 'api_key' | 'secret_pair' | 'oauth' | 'none'
type OwnerScope = 'system' | 'workspace' | 'user'
type SceneOwner = 'nexus' | 'core-app' | 'pilot' | 'plugin'
type SceneStrategyMode = 'priority' | 'least_cost' | 'lowest_latency' | 'balanced' | 'manual'
type SceneFallback = 'enabled' | 'disabled'
type BindingStatus = 'enabled' | 'disabled'

interface ProviderCapabilityRecord {
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

interface ProviderRegistryRecord {
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

interface SceneStrategyBindingRecord {
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

interface SceneRegistryRecord {
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

interface CapabilityFormRow {
  capability: string
  schemaRef: string
  meteringUnit: string
}

interface BindingFormRow {
  providerId: string
  capability: string
  priority: number
}

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
const loading = ref(false)
const savingProvider = ref(false)
const savingScene = ref(false)
const actionPending = ref<string | null>(null)
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

const providerVendorOptions: ProviderVendor[] = ['tencent-cloud', 'openai', 'deepseek', 'exchange-rate', 'custom']
const providerStatusOptions: ProviderStatus[] = ['enabled', 'disabled', 'degraded']
const authTypeOptions: ProviderAuthType[] = ['secret_pair', 'api_key', 'oauth', 'none']
const ownerScopeOptions: OwnerScope[] = ['system', 'workspace', 'user']
const sceneOwnerOptions: SceneOwner[] = ['nexus', 'core-app', 'pilot', 'plugin']
const strategyOptions: SceneStrategyMode[] = ['priority', 'least_cost', 'lowest_latency', 'balanced', 'manual']
const fallbackOptions: SceneFallback[] = ['enabled', 'disabled']

const enabledProviders = computed(() => providers.value.filter(item => item.status === 'enabled').length)
const capabilityCount = computed(() => capabilities.value.length)
const sceneCount = computed(() => scenes.value.length)
const providerOptions = computed(() => providers.value.map(provider => ({
  value: provider.id,
  label: `${provider.displayName} · ${provider.vendor}`,
})))

function statusTone(status: string) {
  if (status === 'enabled')
    return 'success'
  if (status === 'degraded')
    return 'warning'
  return 'muted'
}

function normalizeError(err: any, fallback: string) {
  return err?.data?.message || err?.data?.statusMessage || err?.message || fallback
}

function formatJson(value: Record<string, unknown> | null) {
  if (!value)
    return '-'
  return JSON.stringify(value)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
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

function parseRequiredCapabilities() {
  return sceneForm.requiredCapabilitiesText
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

async function fetchRegistry() {
  loading.value = true
  error.value = null
  try {
    const [providerResult, capabilityResult, sceneResult] = await Promise.all([
      $fetch<{ providers: ProviderRegistryRecord[] }>('/api/dashboard/provider-registry/providers'),
      $fetch<{ capabilities: ProviderCapabilityRecord[] }>('/api/dashboard/provider-registry/capabilities'),
      $fetch<{ scenes: SceneRegistryRecord[] }>('/api/dashboard/provider-registry/scenes'),
    ])
    providers.value = providerResult.providers ?? []
    capabilities.value = capabilityResult.capabilities ?? []
    scenes.value = sceneResult.scenes ?? []

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
    const body = {
      name: providerForm.name.trim(),
      displayName: providerForm.displayName.trim(),
      vendor: providerForm.vendor,
      status: providerForm.status,
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

    await $fetch('/api/dashboard/provider-registry/providers', {
      method: 'POST',
      body,
    })
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

async function updateProviderStatus(provider: ProviderRegistryRecord, status: ProviderStatus) {
  actionPending.value = `provider:${provider.id}:${status}`
  error.value = null
  try {
    await $fetch(`/api/dashboard/provider-registry/providers/${provider.id}`, {
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

async function deleteProvider(provider: ProviderRegistryRecord) {
  actionPending.value = `provider:${provider.id}:delete`
  error.value = null
  try {
    await $fetch(`/api/dashboard/provider-registry/providers/${provider.id}`, {
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

    await $fetch('/api/dashboard/provider-registry/scenes', {
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
    await $fetch(`/api/dashboard/provider-registry/scenes/${scene.id}`, {
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

async function deleteScene(scene: SceneRegistryRecord) {
  actionPending.value = `scene:${scene.id}:delete`
  error.value = null
  try {
    await $fetch(`/api/dashboard/provider-registry/scenes/${scene.id}`, {
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

    <section class="grid gap-4 md:grid-cols-3">
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.providerRegistry.summary.providers', 'Providers') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ providers.length }}
        </p>
        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
          {{ t('dashboard.providerRegistry.summary.enabledProviders', { count: enabledProviders }, `${enabledProviders} enabled`) }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.providerRegistry.summary.capabilities', 'Capabilities') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ capabilityCount }}
        </p>
        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
          {{ t('dashboard.providerRegistry.summary.capabilitiesHint', 'Declared by providers') }}
        </p>
      </div>
      <div class="apple-card-lg p-5">
        <p class="apple-section-title">
          {{ t('dashboard.providerRegistry.summary.scenes', 'Scenes') }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-black dark:text-white">
          {{ sceneCount }}
        </p>
        <p class="mt-1 text-xs text-black/45 dark:text-white/45">
          {{ t('dashboard.providerRegistry.summary.scenesHint', 'Strategy bindings configured') }}
        </p>
      </div>
    </section>

    <section class="apple-card-lg p-6">
      <TxTabs v-model="activeTab" placement="top" :content-scrollable="false">
        <TxTabItem name="providers" icon-class="i-carbon-cloud-service-management">
          <template #name>
            {{ t('dashboard.providerRegistry.tabs.providers', 'Providers') }}
          </template>

          <div class="space-y-6">
            <section class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-black dark:text-white">
                    {{ t('dashboard.providerRegistry.providers.createTitle', 'Create provider') }}
                  </h2>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.providerRegistry.providers.createHint', 'Credentials stay in secure storage; this form only saves authRef.') }}
                  </p>
                </div>
                <TxButton variant="primary" size="small" :disabled="savingProvider" @click="createProvider">
                  {{ t('dashboard.providerRegistry.providers.create', 'Create provider') }}
                </TxButton>
              </div>

              <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                  <TuffSelect v-model="providerForm.vendor" class="w-full">
                    <TuffSelectItem v-for="vendor in providerVendorOptions" :key="vendor" :value="vendor" :label="vendor" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
                  <TuffSelect v-model="providerForm.status" class="w-full">
                    <TuffSelectItem v-for="status in providerStatusOptions" :key="status" :value="status" :label="status" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.authType', 'Auth type') }}</label>
                  <TuffSelect v-model="providerForm.authType" class="w-full">
                    <TuffSelectItem v-for="type in authTypeOptions" :key="type" :value="type" :label="type" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.authRef', 'Auth ref') }}</label>
                  <TuffInput v-model="providerForm.authRef" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.endpoint', 'Endpoint') }}</label>
                  <TuffInput v-model="providerForm.endpoint" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.region', 'Region') }}</label>
                  <TuffInput v-model="providerForm.region" class="w-full" />
                </div>
              </div>

              <div class="mt-4 space-y-2">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-medium text-black dark:text-white">
                    {{ t('dashboard.providerRegistry.providers.capabilitiesTitle', 'Capabilities') }}
                  </h3>
                  <TxButton variant="secondary" size="mini" @click="addCapabilityRow">
                    {{ t('dashboard.providerRegistry.actions.addCapability', 'Add capability') }}
                  </TxButton>
                </div>
                <div
                  v-for="(row, index) in capabilityRows"
                  :key="index"
                  class="grid gap-2 rounded-xl bg-white/60 p-3 dark:bg-black/10 md:grid-cols-[1fr_1fr_160px_auto]"
                >
                  <TuffInput v-model="row.capability" placeholder="text.translate" />
                  <TuffInput v-model="row.schemaRef" placeholder="nexus://schemas/provider/..." />
                  <TuffInput v-model="row.meteringUnit" placeholder="character" />
                  <TxButton variant="secondary" size="mini" :disabled="capabilityRows.length <= 1" @click="removeCapabilityRow(index)">
                    {{ t('common.remove', 'Remove') }}
                  </TxButton>
                </div>
              </div>
            </section>

            <section>
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-base font-semibold text-black dark:text-white">
                  {{ t('dashboard.providerRegistry.providers.listTitle', 'Registered providers') }}
                </h2>
              </div>
              <div v-if="loading && !providers.length" class="space-y-3">
                <TxSkeleton :loading="true" :lines="3" />
              </div>
              <div v-else-if="!providers.length" class="rounded-xl bg-black/[0.02] p-4 text-sm text-black/50 dark:bg-white/[0.03] dark:text-white/50">
                {{ t('dashboard.providerRegistry.providers.empty', 'No providers registered yet.') }}
              </div>
              <div v-else class="space-y-3">
                <article
                  v-for="provider in providers"
                  :key="provider.id"
                  class="rounded-2xl border border-black/[0.04] bg-white/60 p-4 dark:border-white/[0.06] dark:bg-black/10"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-sm font-semibold text-black dark:text-white">
                          {{ provider.displayName }}
                        </h3>
                        <TxStatusBadge :text="provider.status" :status="statusTone(provider.status)" size="sm" />
                      </div>
                      <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                        {{ provider.id }} · {{ provider.vendor }} · {{ provider.authType }} · {{ provider.authRef || '-' }}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null || provider.status === 'enabled'" @click="updateProviderStatus(provider, 'enabled')">
                        {{ t('dashboard.providerRegistry.actions.enable', 'Enable') }}
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null || provider.status === 'disabled'" @click="updateProviderStatus(provider, 'disabled')">
                        {{ t('dashboard.providerRegistry.actions.disable', 'Disable') }}
                      </TxButton>
                      <TxButton variant="secondary" size="mini" :disabled="actionPending !== null" @click="deleteProvider(provider)">
                        {{ t('common.delete', 'Delete') }}
                      </TxButton>
                    </div>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span
                      v-for="capability in provider.capabilities"
                      :key="capability.id"
                      class="rounded-full bg-black/[0.04] px-2 py-1 text-[11px] text-black/60 dark:bg-white/[0.08] dark:text-white/60"
                    >
                      {{ capability.capability }}
                    </span>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </TxTabItem>

        <TxTabItem name="capabilities" icon-class="i-carbon-catalog">
          <template #name>
            {{ t('dashboard.providerRegistry.tabs.capabilities', 'Capabilities') }}
          </template>

          <div class="space-y-3">
            <div v-if="loading && !capabilities.length" class="space-y-3">
              <TxSkeleton :loading="true" :lines="3" />
            </div>
            <div v-else-if="!capabilities.length" class="rounded-xl bg-black/[0.02] p-4 text-sm text-black/50 dark:bg-white/[0.03] dark:text-white/50">
              {{ t('dashboard.providerRegistry.capabilities.empty', 'No capabilities declared yet.') }}
            </div>
            <article
              v-for="capability in capabilities"
              v-else
              :key="capability.id"
              class="rounded-2xl bg-black/[0.02] p-4 text-sm dark:bg-white/[0.03]"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 class="font-semibold text-black dark:text-white">
                    {{ capability.capability }}
                  </h3>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ capability.providerId }} · {{ capability.schemaRef || '-' }}
                  </p>
                </div>
                <span class="text-xs text-black/45 dark:text-white/45">
                  {{ formatDate(capability.updatedAt) }}
                </span>
              </div>
              <p class="mt-2 text-xs text-black/50 dark:text-white/50">
                metering={{ formatJson(capability.metering) }} · constraints={{ formatJson(capability.constraints) }}
              </p>
            </article>
          </div>
        </TxTabItem>

        <TxTabItem name="scenes" icon-class="i-carbon-flow">
          <template #name>
            {{ t('dashboard.providerRegistry.tabs.scenes', 'Scenes') }}
          </template>

          <div class="space-y-6">
            <section class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-black dark:text-white">
                    {{ t('dashboard.providerRegistry.scenes.createTitle', 'Create scene') }}
                  </h2>
                  <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                    {{ t('dashboard.providerRegistry.scenes.createHint', 'Bind a scene to provider capabilities. Runtime orchestration is implemented separately.') }}
                  </p>
                </div>
                <TxButton variant="primary" size="small" :disabled="savingScene || !providers.length" @click="createScene">
                  {{ t('dashboard.providerRegistry.scenes.create', 'Create scene') }}
                </TxButton>
              </div>

              <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.sceneId', 'Scene ID') }}</label>
                  <TuffInput v-model="sceneForm.id" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.displayName', 'Display name') }}</label>
                  <TuffInput v-model="sceneForm.displayName" class="w-full" />
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.owner', 'Owner') }}</label>
                  <TuffSelect v-model="sceneForm.owner" class="w-full">
                    <TuffSelectItem v-for="owner in sceneOwnerOptions" :key="owner" :value="owner" :label="owner" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.strategy', 'Strategy') }}</label>
                  <TuffSelect v-model="sceneForm.strategyMode" class="w-full">
                    <TuffSelectItem v-for="strategy in strategyOptions" :key="strategy" :value="strategy" :label="strategy" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.status', 'Status') }}</label>
                  <TuffSelect v-model="sceneForm.status" class="w-full">
                    <TuffSelectItem value="enabled" label="enabled" />
                    <TuffSelectItem value="disabled" label="disabled" />
                  </TuffSelect>
                </div>
                <div>
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.fallback', 'Fallback') }}</label>
                  <TuffSelect v-model="sceneForm.fallback" class="w-full">
                    <TuffSelectItem v-for="fallback in fallbackOptions" :key="fallback" :value="fallback" :label="fallback" />
                  </TuffSelect>
                </div>
                <div class="xl:col-span-2">
                  <label class="apple-section-title mb-1 block">{{ t('dashboard.providerRegistry.fields.requiredCapabilities', 'Required capabilities') }}</label>
                  <TuffInput v-model="sceneForm.requiredCapabilitiesText" class="w-full" placeholder="image.translate.e2e, text.translate" />
                </div>
              </div>

              <div class="mt-4 space-y-2">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-medium text-black dark:text-white">
                    {{ t('dashboard.providerRegistry.scenes.bindingsTitle', 'Strategy bindings') }}
                  </h3>
                  <TxButton variant="secondary" size="mini" :disabled="!providers.length" @click="addBindingRow">
                    {{ t('dashboard.providerRegistry.actions.addBinding', 'Add binding') }}
                  </TxButton>
                </div>
                <div
                  v-for="(row, index) in bindingRows"
                  :key="index"
                  class="grid gap-2 rounded-xl bg-white/60 p-3 dark:bg-black/10 md:grid-cols-[1fr_1fr_120px_auto]"
                >
                  <TuffSelect v-model="row.providerId" class="w-full">
                    <TuffSelectItem v-for="provider in providerOptions" :key="provider.value" :value="provider.value" :label="provider.label" />
                  </TuffSelect>
                  <TuffInput v-model="row.capability" placeholder="image.translate.e2e" />
                  <TuffInput v-model="row.priority" type="number" placeholder="10" />
                  <TxButton variant="secondary" size="mini" :disabled="bindingRows.length <= 1" @click="removeBindingRow(index)">
                    {{ t('common.remove', 'Remove') }}
                  </TxButton>
                </div>
              </div>
            </section>

            <section>
              <h2 class="mb-3 text-base font-semibold text-black dark:text-white">
                {{ t('dashboard.providerRegistry.scenes.listTitle', 'Registered scenes') }}
              </h2>
              <div v-if="loading && !scenes.length" class="space-y-3">
                <TxSkeleton :loading="true" :lines="3" />
              </div>
              <div v-else-if="!scenes.length" class="rounded-xl bg-black/[0.02] p-4 text-sm text-black/50 dark:bg-white/[0.03] dark:text-white/50">
                {{ t('dashboard.providerRegistry.scenes.empty', 'No scenes configured yet.') }}
              </div>
              <div v-else class="space-y-3">
                <article
                  v-for="scene in scenes"
                  :key="scene.id"
                  class="rounded-2xl border border-black/[0.04] bg-white/60 p-4 dark:border-white/[0.06] dark:bg-black/10"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-sm font-semibold text-black dark:text-white">
                          {{ scene.displayName }}
                        </h3>
                        <TxStatusBadge :text="scene.status" :status="statusTone(scene.status)" size="sm" />
                      </div>
                      <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                        {{ scene.id }} · {{ scene.owner }} · {{ scene.strategyMode }} · fallback={{ scene.fallback }}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
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
                  </div>
                  <div class="mt-3 space-y-2 text-xs text-black/55 dark:text-white/55">
                    <p>{{ t('dashboard.providerRegistry.scenes.required', 'Required') }}: {{ scene.requiredCapabilities.join(', ') || '-' }}</p>
                    <p>
                      {{ t('dashboard.providerRegistry.scenes.bindings', 'Bindings') }}:
                      <span v-if="!scene.bindings.length">-</span>
                      <span v-for="binding in scene.bindings" v-else :key="binding.id" class="mr-2">
                        {{ binding.providerId }} / {{ binding.capability }} / p{{ binding.priority }}
                      </span>
                    </p>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </TxTabItem>
      </TxTabs>
    </section>
  </div>
</template>
