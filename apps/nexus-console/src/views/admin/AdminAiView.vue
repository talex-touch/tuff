<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { TxTag } from '@talex-touch/tuffex/tag'
import { TxTextarea } from '@talex-touch/tuffex/textarea'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { AdminAiProvider, AdminAiScene, AdminAiSceneBinding, AdminAiUsageResponse, AdminAiUsageRow } from '@/api/types'
import ConsoleConfirmDialog from '@/components/ConsoleConfirmDialog.vue'
import ConsoleFilterBar from '@/components/ConsoleFilterBar.vue'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleStatGrid from '@/components/ConsoleStatGrid.vue'
import type { ConsoleStatItem } from '@/components/ConsoleStatGrid.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { sliceClientPage, useConsoleList } from '@/composables/useConsoleList'
import { formatNumber, formatPercent } from '@/utils/format'

const { t, locale } = useI18n()

const activeTab = ref<'providers' | 'scenes' | 'usage'>('providers')
const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)

const adapterOptions = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'dashscope', label: 'DashScope' },
  { value: 'tencent-cloud', label: 'Tencent Cloud' },
  { value: 'custom', label: 'Custom / Compatible' },
]

function extractCapabilities(provider: AdminAiProvider): string[] {
  return (provider.capabilities ?? []).map(item =>
    typeof item === 'string' ? item : item.capability,
  )
}

function extractModels(provider: AdminAiProvider): string[] {
  const models = provider.metadata?.models
  return Array.isArray(models) ? models.map(String) : []
}

function extractAdapterKey(provider: AdminAiProvider): string {
  return String(provider.metadata?.adapterKey || provider.vendor || 'custom')
}

function isCredentialConfigured(provider: AdminAiProvider): boolean {
  return Boolean(provider.hasCredential ?? provider.credentialConfigured)
}

function resolveReadinessStatus(scene: AdminAiScene): string {
  if (!scene.readiness)
    return scene.status === 'enabled' ? 'ready' : 'disabled'
  return typeof scene.readiness === 'string' ? scene.readiness : scene.readiness.status
}

// ─── Tab 1: Providers ─────────────────────────────────────────────────────────
const providersCache = ref<AdminAiProvider[] | null>(null)
const checkingId = ref<string | null>(null)
const checkResults = reactive<Record<string, { ok: boolean, latencyMs?: number, error?: string }>>({})
const providerModalOpen = ref(false)
const editingProvider = ref<AdminAiProvider | null>(null)
const savingProvider = ref(false)
const deleteProviderTarget = ref<AdminAiProvider | null>(null)
const deletingProvider = ref(false)

const providerForm = reactive({
  name: '',
  vendor: 'openai',
  endpoint: '',
  enabled: true,
  capabilities: 'text.chat',
  models: 'gpt-4o-mini',
  defaultModel: 'gpt-4o-mini',
  quotaLimit: '',
  secretValue: '',
})

const providerList = useConsoleList<AdminAiProvider, { q: string }>({
  defaults: { q: '' },
  defaultLimit: 10,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    if (!providersCache.value) {
      const res = await consoleApi.listAiProviders()
      providersCache.value = res.providers ?? []
    }
    const q = filters.q.toLowerCase()
    const filtered = q
      ? providersCache.value.filter(p =>
          `${p.displayName || p.name} ${extractAdapterKey(p)} ${extractModels(p).join(',')}`.toLowerCase().includes(q),
        )
      : providersCache.value
    return sliceClientPage(filtered, page, limit)
  },
})

const providerColumns = computed<DataTableColumn<AdminAiProvider>[]>(() => [
  { key: 'name', title: t('admin.providerName'), minWidth: 180 },
  { key: 'capabilities', title: t('admin.capabilitiesLabel'), minWidth: 160 },
  { key: 'models', title: t('admin.modelCol'), minWidth: 180 },
  { key: 'credentialConfigured', title: t('admin.credentialStatusCol'), minWidth: 130 },
  { key: 'quota', title: t('admin.quotaCol'), minWidth: 120 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 230 },
])

function openCreateProvider() {
  editingProvider.value = null
  providerForm.name = ''
  providerForm.vendor = 'openai'
  providerForm.endpoint = ''
  providerForm.enabled = true
  providerForm.capabilities = 'text.chat'
  providerForm.models = 'gpt-4o-mini'
  providerForm.defaultModel = 'gpt-4o-mini'
  providerForm.quotaLimit = ''
  providerForm.secretValue = ''
  providerModalOpen.value = true
}

function openEditProvider(provider: AdminAiProvider) {
  editingProvider.value = provider
  providerForm.name = provider.displayName || provider.name
  providerForm.vendor = provider.vendor || extractAdapterKey(provider)
  providerForm.endpoint = provider.endpoint ?? ''
  providerForm.enabled = provider.status !== 'disabled'
  providerForm.capabilities = extractCapabilities(provider).join(', ')
  const models = extractModels(provider)
  providerForm.models = models.join(', ')
  providerForm.defaultModel = String(provider.metadata?.defaultModel || models[0] || '')
  providerForm.quotaLimit = provider.quota?.requestsPerDay ? String(provider.quota.requestsPerDay) : ''
  // Write-only credential input: NEVER prefill or read raw secrets.
  providerForm.secretValue = ''
  providerModalOpen.value = true
}

async function saveProvider() {
  if (!providerForm.name.trim())
    return
  savingProvider.value = true
  feedback.value = null
  try {
    const capabilities = providerForm.capabilities.split(',').map(s => s.trim()).filter(Boolean)
    const models = providerForm.models.split(',').map(s => s.trim()).filter(Boolean)
    const quotaNum = providerForm.quotaLimit.trim() ? Number(providerForm.quotaLimit) : null
    const payload = {
      name: providerForm.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-'),
      displayName: providerForm.name.trim(),
      vendor: providerForm.vendor,
      endpoint: providerForm.endpoint.trim() || undefined,
      authType: 'api_key',
      status: providerForm.enabled ? ('enabled' as const) : ('disabled' as const),
      capabilities: capabilities.map(capability => ({ capability })),
      metadata: {
        adapterKey: providerForm.vendor,
        models,
        defaultModel: providerForm.defaultModel.trim() || models[0],
      },
      quota: quotaNum !== null && Number.isFinite(quotaNum) ? { requestsPerDay: quotaNum } : null,
      ...(providerForm.secretValue.trim() ? { credentials: { apiKey: providerForm.secretValue.trim() } } : {}),
    }

    if (editingProvider.value)
      await consoleApi.updateAiProvider(editingProvider.value.id, payload)
    else
      await consoleApi.createAiProvider(payload)

    providerModalOpen.value = false
    providerForm.secretValue = ''
    providersCache.value = null
    await providerList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    savingProvider.value = false
  }
}

async function runConnectivityCheck(provider: AdminAiProvider) {
  checkingId.value = provider.id
  feedback.value = null
  try {
    const res = await consoleApi.checkAiProvider(provider.id)
    checkResults[provider.id] = {
      ok: Boolean(res.success ?? res.ok),
      latencyMs: res.latency ?? res.latencyMs ?? 0,
      error: typeof res.error === 'string' ? res.error : res.error?.message,
    }
  }
  catch (cause) {
    checkResults[provider.id] = { ok: false, error: resolveErrorMessage(cause, t('admin.checkFail')) }
  }
  finally {
    checkingId.value = null
  }
}

async function confirmDeleteProvider() {
  if (!deleteProviderTarget.value)
    return
  deletingProvider.value = true
  try {
    await consoleApi.deleteAiProvider(deleteProviderTarget.value.id)
    deleteProviderTarget.value = null
    providersCache.value = null
    await providerList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    deletingProvider.value = false
  }
}

// ─── Tab 2: Scenes Routing ────────────────────────────────────────────────────
const scenesCache = ref<AdminAiScene[] | null>(null)
const sceneModalOpen = ref(false)
const savingScene = ref(false)
const deleteSceneTarget = ref<AdminAiScene | null>(null)
const deletingScene = ref(false)

const sceneForm = reactive({
  id: '',
  displayName: '',
  requiredCapabilities: 'text.chat',
  enabled: true,
  fallbackEnabled: true,
  bindingsJson: '[]',
})

const sceneList = useConsoleList<AdminAiScene, { q: string }>({
  defaults: { q: '' },
  defaultLimit: 10,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    if (!scenesCache.value) {
      const res = await consoleApi.listAiScenes()
      scenesCache.value = res.scenes ?? []
    }
    const q = filters.q.toLowerCase()
    const rows = q
      ? scenesCache.value.filter(s => `${s.id} ${s.displayName ?? s.name ?? ''}`.toLowerCase().includes(q))
      : scenesCache.value
    return sliceClientPage(rows, page, limit)
  },
})

const sceneColumns = computed<DataTableColumn<AdminAiScene>[]>(() => [
  { key: 'id', title: t('admin.sceneId'), minWidth: 210 },
  { key: 'capability', title: t('admin.sceneCapability'), minWidth: 140 },
  { key: 'readiness', title: t('admin.sceneReadiness'), minWidth: 120 },
  { key: 'bindings', title: t('admin.providerCol'), minWidth: 200 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 160 },
])

function openCreateScene() {
  sceneForm.id = 'nexus.intelligence.text.chat'
  sceneForm.displayName = 'Text Chat'
  sceneForm.requiredCapabilities = 'text.chat'
  sceneForm.enabled = true
  sceneForm.fallbackEnabled = true
  sceneForm.bindingsJson = '[]'
  sceneModalOpen.value = true
}

function openEditScene(scene: AdminAiScene) {
  sceneForm.id = scene.id
  sceneForm.displayName = scene.displayName ?? scene.name ?? scene.id
  sceneForm.requiredCapabilities = (scene.requiredCapabilities ?? []).join(', ')
  sceneForm.enabled = scene.status !== 'disabled'
  sceneForm.fallbackEnabled = scene.fallback !== 'disabled'
  sceneForm.bindingsJson = JSON.stringify(scene.bindings ?? [], null, 2)
  sceneModalOpen.value = true
}

async function saveScene() {
  if (!sceneForm.id.trim())
    return
  let parsedBindings: AdminAiSceneBinding[] = []
  try {
    const raw = JSON.parse(sceneForm.bindingsJson || '[]')
    if (!Array.isArray(raw))
      throw new Error('Bindings must be a JSON array.')
    parsedBindings = raw as AdminAiSceneBinding[]
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, 'Invalid bindings JSON.') }
    return
  }

  savingScene.value = true
  try {
    await consoleApi.upsertAiScene({
      id: sceneForm.id.trim(),
      displayName: sceneForm.displayName.trim() || sceneForm.id.trim(),
      owner: 'nexus',
      ownerScope: 'system',
      status: sceneForm.enabled ? 'enabled' : 'disabled',
      requiredCapabilities: sceneForm.requiredCapabilities.split(',').map(s => s.trim()).filter(Boolean),
      fallback: sceneForm.fallbackEnabled ? 'enabled' : 'disabled',
      bindings: parsedBindings,
    })
    sceneModalOpen.value = false
    scenesCache.value = null
    await sceneList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    savingScene.value = false
  }
}

async function confirmDeleteScene() {
  if (!deleteSceneTarget.value)
    return
  deletingScene.value = true
  try {
    await consoleApi.deleteAiScene(deleteSceneTarget.value.id)
    deleteSceneTarget.value = null
    scenesCache.value = null
    await sceneList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    deletingScene.value = false
  }
}

// ─── Tab 3: SQL-Aggregated AI Usage ───────────────────────────────────────────
const usageDays = ref(30)
const usageLoading = ref(true)
const aiUsage = ref<AdminAiUsageResponse | null>(null)
const usagePage = ref(1)
const usageLimit = ref(10)

const dayOptions = computed(() => [
  { value: 7, label: t('admin.days7') },
  { value: 30, label: t('admin.days30') },
  { value: 90, label: t('admin.days90') },
])

const aiUsageStats = computed<ConsoleStatItem[]>(() => {
  const s = aiUsage.value?.summary
  return [
    { key: 'req', label: t('admin.aiRequests'), value: formatNumber(s?.totalRequests ?? s?.requests ?? 0, locale.value), iconClass: 'i-carbon-api' },
    { key: 'sr', label: t('admin.aiSuccessRate'), value: formatPercent(s?.successRate ?? 0), iconClass: 'i-carbon-checkmark-outline' },
    { key: 'lat', label: t('admin.aiAvgLatency'), value: `${formatNumber(Math.round(s?.avgLatencyMs ?? 0), locale.value)} ms`, iconClass: 'i-carbon-timer' },
    { key: 'tok', label: t('admin.aiTokens'), value: formatNumber(s?.totalTokens ?? 0, locale.value), iconClass: 'i-carbon-chart-histogram' },
  ]
})

const mergedUsageRows = computed<AdminAiUsageRow[]>(() => {
  if (!aiUsage.value)
    return []
  return aiUsage.value.byProvider ?? aiUsage.value.byModel ?? aiUsage.value.rows ?? []
})

const usageSlice = computed(() =>
  sliceClientPage(mergedUsageRows.value, usagePage.value, usageLimit.value),
)

const usageColumns = computed<DataTableColumn<AdminAiUsageRow>[]>(() => [
  { key: 'providerName', title: t('admin.providerCol'), minWidth: 160 },
  { key: 'model', title: t('admin.modelCol'), minWidth: 160 },
  { key: 'requests', title: t('admin.requestsCol'), align: 'right', minWidth: 100 },
  { key: 'avgLatencyMs', title: t('admin.latencyCol'), align: 'right', minWidth: 110 },
  { key: 'totalTokens', title: t('admin.tokensCol'), align: 'right', minWidth: 120 },
])

async function loadAiUsage() {
  usageLoading.value = true
  try {
    aiUsage.value = await consoleApi.getAiUsage({ days: usageDays.value })
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.loadFailed')) }
  }
  finally {
    usageLoading.value = false
  }
}

watch(usageDays, () => void loadAiUsage())
onMounted(() => void loadAiUsage())
</script>

<template>
  <ConsolePageShell :title="t('admin.aiTitle')">
    <template #actions>
      <TxButton v-if="activeTab === 'providers'" variant="primary" size="sm" icon="i-carbon-add" @click="openCreateProvider">
        {{ t('admin.newProvider') }}
      </TxButton>
      <TxButton v-else-if="activeTab === 'scenes'" variant="primary" size="sm" icon="i-carbon-add" @click="openCreateScene">
        {{ t('admin.newScene') }}
      </TxButton>
      <TxSelect v-else v-model="usageDays" :options="dayOptions" />
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <TxTabs v-model="activeTab">
      <TxTabItem name="providers">
        <template #name>
{{ t('admin.tabProviders') }}
</template>
        <div class="console-form-stack AiTab">
          <ConsoleFilterBar :active="providerList.hasActiveFilters.value" @clear="providerList.clearFilters()">
            <ConsoleFormField :label="t('common.search')" for-id="ai-prov-q">
              <TuffInput id="ai-prov-q" v-model="providerList.filters.q" :placeholder="t('common.search')" />
            </ConsoleFormField>
          </ConsoleFilterBar>
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="providerColumns"
              :rows="providerList.rows.value"
              row-key="id"
              :loading="providerList.loading.value"
              :refreshing="providerList.refreshing.value"
              :error="providerList.error.value"
              :filtered="providerList.hasActiveFilters.value"
              :page="providerList.page.value"
              :limit="providerList.limit.value"
              :total="providerList.total.value"
              :page-sizes="providerList.pageSizes"
              @retry="providersCache = null; providerList.refresh()"
              @clear-filters="providerList.clearFilters()"
              @update:page="providerList.setPage($event)"
              @update:limit="providerList.setLimit($event)"
            >
              <template #cell-name="{ row }">
                <div>
                  <div>{{ row.displayName || row.name }}</div>
                  <div class="console-muted console-mono">
{{ extractAdapterKey(row) }}
</div>
                </div>
              </template>
              <template #cell-capabilities="{ row }">
                <div class="console-inline-actions">
                  <TxTag v-for="cap in extractCapabilities(row)" :key="cap" :label="cap" size="sm" variant="soft" />
                </div>
              </template>
              <template #cell-models="{ row }">
                <div class="console-inline-actions">
                  <TxTag v-for="model in extractModels(row).slice(0, 3)" :key="model" :label="model" size="sm" variant="plain" />
                  <TxTag v-if="extractModels(row).length > 3" :label="`+${extractModels(row).length - 3}`" size="sm" variant="plain" />
                </div>
              </template>
              <template #cell-credentialConfigured="{ row }">
                <!-- Status-only badge: encrypted credentials are NEVER exposed to the browser -->
                <TxStatusBadge
                  :text="isCredentialConfigured(row) ? t('common.configured') : t('common.notSet')"
                  :status="isCredentialConfigured(row) ? 'success' : 'warning'"
                  size="sm"
                />
              </template>
              <template #cell-quota="{ row }">
                <span v-if="row.quota?.requestsPerDay">
                  {{ formatNumber(Number(row.quota.requestsPerDay), locale) }} / day
                </span>
                <span v-else>—</span>
              </template>
              <template #cell-actions="{ row }">
                <div class="console-inline-actions">
                  <TxButton
                    variant="secondary"
                    size="sm"
                    :loading="checkingId === row.id"
                    @click="runConnectivityCheck(row)"
                  >
                    {{ t('admin.checkConnectivity') }}
                  </TxButton>
                  <TxStatusBadge
                    v-if="checkResults[row.id]"
                    :text="checkResults[row.id]!.ok ? t('admin.checkOk', { ms: checkResults[row.id]!.latencyMs ?? 0 }) : t('admin.checkFail')"
                    :status="checkResults[row.id]!.ok ? 'success' : 'danger'"
                    size="sm"
                  />
                  <TxButton variant="ghost" size="sm" @click="openEditProvider(row)">
                    {{ t('common.edit') }}
                  </TxButton>
                  <TxButton variant="danger" size="sm" @click="deleteProviderTarget = row">
                    {{ t('common.delete') }}
                  </TxButton>
                </div>
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>

      <TxTabItem name="scenes">
        <template #name>
{{ t('admin.tabScenes') }}
</template>
        <div class="console-form-stack AiTab">
          <ConsoleFilterBar :active="sceneList.hasActiveFilters.value" @clear="sceneList.clearFilters()">
            <ConsoleFormField :label="t('common.search')" for-id="ai-scene-q">
              <TuffInput id="ai-scene-q" v-model="sceneList.filters.q" :placeholder="t('common.search')" />
            </ConsoleFormField>
          </ConsoleFilterBar>
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="sceneColumns"
              :rows="sceneList.rows.value"
              row-key="id"
              :loading="sceneList.loading.value"
              :refreshing="sceneList.refreshing.value"
              :error="sceneList.error.value"
              :filtered="sceneList.hasActiveFilters.value"
              :page="sceneList.page.value"
              :limit="sceneList.limit.value"
              :total="sceneList.total.value"
              :page-sizes="sceneList.pageSizes"
              @retry="scenesCache = null; sceneList.refresh()"
              @clear-filters="sceneList.clearFilters()"
              @update:page="sceneList.setPage($event)"
              @update:limit="sceneList.setLimit($event)"
            >
              <template #cell-id="{ row }">
                <span class="console-mono">{{ row.id }}</span>
              </template>
              <template #cell-capability="{ row }">
                <div class="console-inline-actions">
                  <TxTag v-for="cap in (row.requiredCapabilities ?? [])" :key="cap" :label="cap" size="sm" variant="soft" />
                </div>
              </template>
              <template #cell-readiness="{ row }">
                <TxStatusBadge
                  :text="resolveReadinessStatus(row)"
                  :status="resolveReadinessStatus(row) === 'ready' ? 'success' : resolveReadinessStatus(row) === 'degraded' ? 'warning' : 'muted'"
                  size="sm"
                />
              </template>
              <template #cell-bindings="{ row }">
                <div class="console-inline-actions">
                  <TxTag
                    v-for="b in row.bindings"
                    :key="`${b.providerId}-${b.priority}`"
                    :label="`#${b.priority} ${b.model || b.providerId}`"
                    size="sm"
                    variant="soft"
                  />
                </div>
              </template>
              <template #cell-actions="{ row }">
                <div class="console-inline-actions">
                  <TxButton variant="ghost" size="sm" @click="openEditScene(row)">
                    {{ t('common.edit') }}
                  </TxButton>
                  <TxButton variant="danger" size="sm" @click="deleteSceneTarget = row">
                    {{ t('common.delete') }}
                  </TxButton>
                </div>
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>

      <TxTabItem name="usage">
        <template #name>
{{ t('admin.tabAiUsage') }}
</template>
        <div class="console-form-stack AiTab">
          <ConsoleStatGrid :items="aiUsageStats" :loading="usageLoading" :skeleton-count="4" />
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="usageColumns"
              :rows="usageSlice.rows"
              :row-key="(row: AdminAiUsageRow) => `${row.providerId || ''}-${row.model || ''}`"
              :loading="usageLoading"
              :page="usagePage"
              :limit="usageLimit"
              :total="usageSlice.total"
              :page-sizes="[10, 20, 50]"
              @retry="loadAiUsage"
              @update:page="usagePage = $event"
              @update:limit="usageLimit = $event; usagePage = 1"
            >
              <template #cell-providerName="{ row }">
                {{ row.providerName || row.providerId || '—' }}
              </template>
              <template #cell-model="{ row }">
                <span class="console-mono">{{ row.model || '—' }}</span>
              </template>
              <template #cell-requests="{ row }">
                {{ formatNumber(row.requests, locale) }}
              </template>
              <template #cell-avgLatencyMs="{ row }">
                {{ formatNumber(Math.round(row.avgLatencyMs), locale) }} ms
              </template>
              <template #cell-totalTokens="{ row }">
                {{ formatNumber(row.totalTokens, locale) }}
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>
    </TxTabs>

    <TxModal
      v-model="providerModalOpen"
      :title="editingProvider ? t('admin.editProvider') : t('admin.newProvider')"
      :close-label="t('common.close')"
      width="560px"
    >
      <div class="console-form-stack">
        <div class="console-form-grid">
          <ConsoleFormField :label="t('admin.providerName')" for-id="ai-p-name">
            <TuffInput id="ai-p-name" v-model="providerForm.name" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('admin.adapterKey')">
            <TxSelect v-model="providerForm.vendor" :options="adapterOptions" />
          </ConsoleFormField>
        </div>
        <ConsoleFormField :label="t('admin.baseUrl')" for-id="ai-p-url">
          <TuffInput id="ai-p-url" v-model="providerForm.endpoint" placeholder="https://api.openai.com/v1" />
        </ConsoleFormField>
        <div class="console-form-grid">
          <ConsoleFormField :label="t('admin.capabilitiesLabel')" for-id="ai-p-caps">
            <TuffInput id="ai-p-caps" v-model="providerForm.capabilities" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('admin.defaultModelLabel')" for-id="ai-p-def">
            <TuffInput id="ai-p-def" v-model="providerForm.defaultModel" />
          </ConsoleFormField>
        </div>
        <ConsoleFormField :label="t('admin.modelsLabel')" for-id="ai-p-models">
          <TuffInput id="ai-p-models" v-model="providerForm.models" />
        </ConsoleFormField>
        <div class="console-form-grid">
          <ConsoleFormField :label="t('admin.quotaLimitLabel')" for-id="ai-p-quota">
            <TuffInput id="ai-p-quota" v-model="providerForm.quotaLimit" type="number" />
          </ConsoleFormField>
          <ConsoleFormField
            :label="t('admin.credentialLabel')"
            :hint="t('admin.credentialHint')"
            for-id="ai-p-secret"
          >
            <TuffInput id="ai-p-secret" v-model="providerForm.secretValue" type="password" autocomplete="new-password" />
          </ConsoleFormField>
        </div>
        <div class="AiSwitchRow">
          <span>{{ t('common.active') }}</span>
          <TxSwitch v-model="providerForm.enabled" />
        </div>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="providerModalOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="savingProvider" :disabled="!providerForm.name.trim()" @click="saveProvider">
          {{ t('common.save') }}
        </TxButton>
      </template>
    </TxModal>

    <TxModal
      v-model="sceneModalOpen"
      :title="t('admin.editScene')"
      :close-label="t('common.close')"
      width="560px"
    >
      <div class="console-form-stack">
        <div class="console-form-grid">
          <ConsoleFormField :label="t('admin.sceneId')" for-id="ai-s-id">
            <TuffInput id="ai-s-id" v-model="sceneForm.id" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('admin.sceneCapability')" for-id="ai-s-cap">
            <TuffInput id="ai-s-cap" v-model="sceneForm.requiredCapabilities" />
          </ConsoleFormField>
        </div>
        <ConsoleFormField :label="t('admin.sceneBindings')" for-id="ai-s-bindings">
          <TxTextarea id="ai-s-bindings" v-model="sceneForm.bindingsJson" :rows="6" />
        </ConsoleFormField>
        <div class="AiSwitchRow">
          <span>{{ t('admin.sceneFallback') }}</span>
          <TxSwitch v-model="sceneForm.fallbackEnabled" />
        </div>
        <div class="AiSwitchRow">
          <span>{{ t('common.active') }}</span>
          <TxSwitch v-model="sceneForm.enabled" />
        </div>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="sceneModalOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="savingScene" :disabled="!sceneForm.id.trim()" @click="saveScene">
          {{ t('common.save') }}
        </TxButton>
      </template>
    </TxModal>

    <ConsoleConfirmDialog
      :open="Boolean(deleteProviderTarget)"
      :title="t('admin.deleteProviderTitle')"
      :description="t('admin.deleteProviderDesc', { name: deleteProviderTarget?.displayName || deleteProviderTarget?.name || '' })"
      :loading="deletingProvider"
      @update:open="!$event && (deleteProviderTarget = null)"
      @confirm="confirmDeleteProvider"
    />

    <ConsoleConfirmDialog
      :open="Boolean(deleteSceneTarget)"
      :title="t('admin.deleteSceneTitle')"
      :description="t('admin.deleteSceneDesc', { id: deleteSceneTarget?.id || '' })"
      :loading="deletingScene"
      @update:open="!$event && (deleteSceneTarget = null)"
      @confirm="confirmDeleteScene"
    />
  </ConsolePageShell>
</template>

<style scoped>
.AiTab {
  padding-top: 12px;
}

.AiSwitchRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}
</style>
