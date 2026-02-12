<script setup lang="ts">
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxFlipOverlay, TxPopperDialog } from '@talex-touch/tuffex'
import { defineComponent, h, inject } from 'vue'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

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

interface Settings {
  defaultStrategy: string
  enableAudit: boolean
  enableCache: boolean
  cacheExpiration: number
}

// ── State ──
const providers = ref<Provider[]>([])
const settings = ref<Settings>({
  defaultStrategy: 'priority',
  enableAudit: false,
  enableCache: false,
  cacheExpiration: 3600,
})
const loading = ref(true)
const error = ref<string | null>(null)
const settingsSaving = ref(false)

// ── Fetch data ──
async function fetchProviders() {
  loading.value = true
  error.value = null
  try {
    const data = await $fetch<{ providers: Provider[] }>('/api/dashboard/intelligence/providers')
    providers.value = data.providers
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to load providers'
  }
  finally {
    loading.value = false
  }
}

async function fetchSettings() {
  try {
    const data = await $fetch<{ settings: Settings }>('/api/dashboard/intelligence/settings')
    if (data.settings)
      settings.value = { ...settings.value, ...data.settings }
  }
  catch {}
}

onMounted(() => {
  fetchProviders()
  fetchSettings()
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
      await $fetch('/api/dashboard/intelligence/providers', {
        method: 'POST',
        body,
      })
    }
    else if (editingId.value) {
      await $fetch(`/api/dashboard/intelligence/providers/${editingId.value}`, {
        method: 'PATCH',
        body,
      })
    }

    showFormOverlay.value = false
    await fetchProviders()
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
    await $fetch(`/api/dashboard/intelligence/providers/${provider.id}`, {
      method: 'PATCH',
      body: { enabled: !provider.enabled },
    })
    provider.enabled = !provider.enabled
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to toggle provider'
  }
}

// ── Test connection ──
const testingId = ref<string | null>(null)
const testResult = ref<{ success: boolean, message: string, models: string[] } | null>(null)

async function testConnection(provider: Provider) {
  testingId.value = provider.id
  testResult.value = null
  try {
    const data = await $fetch<{ success: boolean, message: string, models: string[], latency: number }>(`/api/dashboard/intelligence/providers/${provider.id}/test`, {
      method: 'POST',
    })
    testResult.value = data
  }
  catch (e: any) {
    testResult.value = { success: false, message: e.data?.message || 'Test failed', models: [] }
  }
  finally {
    testingId.value = null
  }
}

// ── Fetch models for form ──
const fetchingFormModels = ref(false)

async function fetchFormModels() {
  fetchingFormModels.value = true
  try {
    const body: Record<string, string> = {}
    if (form.apiKey.trim())
      body.apiKey = form.apiKey.trim()
    if (form.baseUrl.trim())
      body.baseUrl = form.baseUrl.trim()

    let models: string[] = []

    if (formMode.value === 'edit' && editingId.value) {
      const data = await $fetch<{ success: boolean, models: string[] }>(`/api/dashboard/intelligence/providers/${editingId.value}/test`, {
        method: 'POST',
        body,
      })
      models = data.models || []
    }
    else {
      // For create mode, use a temporary test via the models endpoint
      const data = await $fetch<{ models: Array<{ id: string }> }>('/api/dashboard/intelligence/models')
      models = data.models?.map(m => m.id) || []
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
    await $fetch(`/api/dashboard/intelligence/providers/${pendingDeleteId.value}`, { method: 'DELETE' })
    await fetchProviders()
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
    await $fetch('/api/dashboard/intelligence/settings', {
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

    <!-- Provider Section -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="apple-heading-sm">
          {{ t('dashboard.sections.intelligence.providers.title') }}
        </h2>
        <TxButton v-if="providers.length" ref="addTriggerRef" variant="primary" size="small" @click="openCreateForm(addTriggerRef?.$el || null)">
          <span class="i-carbon-add mr-1 text-base" />
          {{ t('dashboard.sections.intelligence.providers.addButton') }}
        </TxButton>
      </div>

      <!-- Loading -->
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

      <!-- Providers List -->
      <div v-else-if="providers.length" class="space-y-3">
        <div
          v-for="provider in providers"
          :key="provider.id"
          class="group relative rounded-2xl bg-black/[0.02] p-4 transition hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4" @click="openEditForm(provider, $event)">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.04] dark:bg-white/[0.06]">
                <span class="i-carbon-machine-learning-model text-lg text-black/60 dark:text-white/60" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <p class="cursor-pointer font-medium text-black dark:text-white">
                    {{ provider.name }}
                  </p>
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    :class="provider.enabled
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-black/5 text-black/40 dark:bg-white/5 dark:text-white/40'"
                  >
                    {{ provider.enabled ? t('dashboard.sections.intelligence.providers.enabled') : t('dashboard.sections.intelligence.providers.disabled') }}
                  </span>
                </div>
                <div class="flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
                  <span>{{ providerTypeLabel(provider.type) }}</span>
                  <span>·</span>
                  <span>{{ provider.models.length ? t('dashboard.sections.intelligence.providers.models', { count: provider.models.length }) : t('dashboard.sections.intelligence.providers.noModels') }}</span>
                  <template v-if="provider.defaultModel">
                    <span>·</span>
                    <span>{{ provider.defaultModel }}</span>
                  </template>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <!-- Test Connection -->
              <TxButton
                variant="bare"
                size="mini"
                :disabled="testingId === provider.id"
                class="rounded-lg text-black/40 transition hover:text-primary dark:text-white/40"
                @click="testConnection(provider)"
              >
                <span v-if="testingId === provider.id" class="i-carbon-renew animate-spin text-base" />
                <span v-else class="i-carbon-connection-signal text-base" />
              </TxButton>

              <!-- Toggle Enabled -->
              <TxButton
                variant="bare"
                size="mini"
                class="rounded-lg text-black/40 transition hover:text-primary dark:text-white/40"
                @click="toggleProvider(provider)"
              >
                <span :class="provider.enabled ? 'i-carbon-toggle-filled text-primary' : 'i-carbon-toggle'" class="text-lg" />
              </TxButton>

              <!-- Delete -->
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

          <!-- Test result -->
          <div v-if="testResult && testResult.message && testingId === null && pendingDeleteId !== provider.id" class="mt-3 rounded-xl px-3 py-2 text-xs" :class="testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-500'">
            {{ testResult.message }}
          </div>
        </div>
      </div>

      <!-- Empty State -->
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

    <!-- Settings Section -->
    <section class="apple-card-lg space-y-5 p-6">
      <h2 class="apple-heading-sm">
        {{ t('dashboard.sections.intelligence.settings.title') }}
      </h2>

      <div class="space-y-4">
        <!-- Default Strategy -->
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

        <!-- Audit toggle -->
        <label class="flex cursor-pointer items-center justify-between rounded-xl bg-black/[0.02] p-4 transition hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
          <div>
            <p class="text-sm font-medium text-black dark:text-white">
              {{ t('dashboard.sections.intelligence.settings.enableAudit') }}
            </p>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.sections.intelligence.settings.enableAuditHint') }}
            </p>
          </div>
          <TxCheckbox v-model="settings.enableAudit" />
        </label>

        <!-- Cache toggle -->
        <label class="flex cursor-pointer items-center justify-between rounded-xl bg-black/[0.02] p-4 transition hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
          <div>
            <p class="text-sm font-medium text-black dark:text-white">
              {{ t('dashboard.sections.intelligence.settings.enableCache') }}
            </p>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.sections.intelligence.settings.enableCacheHint') }}
            </p>
          </div>
          <TxCheckbox v-model="settings.enableCache" />
        </label>

        <!-- Cache expiration -->
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

    <!-- Create / Edit Overlay -->
    <Teleport to="body">
      <TxFlipOverlay
        v-model="showFormOverlay"
        :source="formOverlaySource"
        :duration="420"
        :rotate-x="6"
        :rotate-y="8"
        transition-name="ProviderOverlay-Mask"
        mask-class="ProviderOverlay-Mask"
        card-class="ProviderOverlay-Card"
      >
        <template #default="{ close }">
          <div class="ProviderOverlay-Inner">
            <div class="space-y-1">
              <h2 class="ProviderOverlay-Title">
                {{ formMode === 'create' ? t('dashboard.sections.intelligence.providers.addButton') : provider?.name }}
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
              </div>

              <!-- Models -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-xs text-black/60 dark:text-white/60">
                    {{ t('dashboard.sections.intelligence.form.models') }}
                  </label>
                  <TxButton
                    v-if="formMode === 'edit'"
                    variant="bare"
                    size="mini"
                    :disabled="fetchingFormModels"
                    @click="fetchFormModels"
                  >
                    {{ fetchingFormModels ? t('dashboard.sections.intelligence.form.fetchingModels') : t('dashboard.sections.intelligence.form.fetchModels') }}
                  </TxButton>
                </div>
                <textarea
                  v-model="form.models"
                  :placeholder="t('dashboard.sections.intelligence.form.modelsPlaceholder')"
                  rows="4"
                  class="w-full rounded-xl border border-black/[0.08] bg-black/[0.02] px-3 py-2 text-sm text-black outline-none transition focus:border-primary dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white"
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
                <textarea
                  v-model="form.instructions"
                  :placeholder="t('dashboard.sections.intelligence.form.instructionsPlaceholder')"
                  rows="2"
                  class="w-full rounded-xl border border-black/[0.08] bg-black/[0.02] px-3 py-2 text-sm text-black outline-none transition focus:border-primary dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white"
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
      </TxFlipOverlay>
    </Teleport>

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
</style>

<style>
.ProviderOverlay-Mask {
  position: fixed;
  inset: 0;
  z-index: 1900;
  background: rgba(12, 12, 16, 0.4);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.ProviderOverlay-Mask-enter-active,
.ProviderOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.ProviderOverlay-Mask-enter-from,
.ProviderOverlay-Mask-leave-to {
  opacity: 0;
}

.ProviderOverlay-Card {
  width: min(560px, 92vw);
  min-height: 400px;
  max-height: 85vh;
  background: var(--tx-bg-color-overlay);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 1rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
}

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
