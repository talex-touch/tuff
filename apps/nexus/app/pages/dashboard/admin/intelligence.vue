<script setup lang="ts">
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxCheckbox, TxFlipOverlay, TxPagination, TxPopperDialog, TxSkeleton, TxSpinner, TxTabItem, TxTabs } from '@talex-touch/tuffex'
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
const settings = ref<Settings>({
  defaultStrategy: 'priority',
  enableAudit: false,
  enableCache: false,
  cacheExpiration: 3600,
})
const loading = ref(true)
const error = ref<string | null>(null)
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

function ipBanAuthHeaders() {
  const token = ipBanStepUpToken.value.trim()
  if (!token)
    return undefined
  return {
    'X-Login-Token': token,
  }
}

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

async function fetchAudits() {
  auditLoading.value = true
  auditError.value = null
  try {
    const data = await $fetch<{ audits: AuditLog[]; total: number }>('/api/dashboard/intelligence/audits', {
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
    const data = await $fetch<OverviewData>('/api/dashboard/intelligence/overview')
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
    const data = await $fetch<{ ok: boolean; result?: UsageResult; error?: string }>('/api/dashboard/intelligence/usage', {
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
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    const data = await $fetch<{ bans: IpBan[] }>('/api/dashboard/intelligence/ip-bans', { query: { limit: 100 } })
    ipBans.value = data.bans || []
  }
  catch (e: any) {
    ipBanError.value = e.data?.message || 'Failed to load IP bans'
  }
  finally {
    ipBanLoading.value = false
  }
}

async function addIpBan() {
  const ip = ipBanForm.ip.trim()
  if (!ip)
    return
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    await $fetch('/api/dashboard/intelligence/ip-bans', {
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
    ipBanError.value = e.data?.message || 'Failed to add IP ban'
  }
  finally {
    ipBanLoading.value = false
  }
}

async function toggleIpBan(ban: IpBan) {
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    await $fetch(`/api/dashboard/intelligence/ip-bans/${ban.id}`, {
      method: 'PATCH',
      headers: ipBanAuthHeaders(),
      body: { enabled: !ban.enabled },
    })
    await fetchIpBans()
  }
  catch (e: any) {
    ipBanError.value = e.data?.message || 'Failed to update IP ban'
  }
  finally {
    ipBanLoading.value = false
  }
}

async function removeIpBan(ban: IpBan) {
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    await $fetch(`/api/dashboard/intelligence/ip-bans/${ban.id}`, {
      method: 'DELETE',
      headers: ipBanAuthHeaders(),
    })
    await fetchIpBans()
  }
  catch (e: any) {
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
    const result = await $fetch<{
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
    const result = await $fetch<{
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
const testResult = ref<{ providerId: string; success: boolean; message: string; models: string[] } | null>(null)

async function testConnection(provider: Provider) {
  testingId.value = provider.id
  testResult.value = null
  try {
    const data = await $fetch<{ success: boolean, message: string, models: string[], latency: number }>(`/api/dashboard/intelligence/providers/${provider.id}/test`, {
      method: 'POST',
    })
    testResult.value = { ...data, providerId: provider.id }
  }
  catch (e: any) {
    testResult.value = { providerId: provider.id, success: false, message: e.data?.message || 'Test failed', models: [] }
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
      const data = await $fetch<{ models: string[] }>('/api/dashboard/intelligence/models', {
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
      <TxTabItem name="overview" icon-class="i-carbon-dashboard">
        <template #name>
          {{ t('dashboard.sections.intelligence.tabs.overview') }}
        </template>

        <div class="space-y-6">
          <section class="apple-card-lg space-y-4 p-6">
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

          <section class="apple-card-lg space-y-4 p-6">
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
        </div>
      </TxTabItem>

      <TxTabItem name="providers" icon-class="i-carbon-machine-learning-model">
        <template #name>
          {{ t('dashboard.sections.intelligence.tabs.providers') }}
        </template>

        <div class="space-y-6">
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

            <div class="flex items-center gap-2">
              <!-- Test Connection -->
              <TxButton
                variant="secondary"
                size="mini"
                :disabled="testingId === provider.id"
                class="rounded-lg"
                @click="testConnection(provider)"
              >
                <span v-if="testingId === provider.id" class="i-carbon-renew animate-spin text-base" />
                <span v-else class="i-carbon-connection-signal text-base" />
                <span class="ml-1 text-[11px]">
                  {{ t('dashboard.sections.intelligence.providers.testConnection') }}
                </span>
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
          <div
            v-if="testResult && testResult.providerId === provider.id && testResult.message && testingId === null && pendingDeleteId !== provider.id"
            class="mt-3 rounded-xl px-3 py-2 text-xs"
            :class="testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-500'"
          >
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
