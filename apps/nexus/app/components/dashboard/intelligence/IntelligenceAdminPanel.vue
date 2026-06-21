<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { $fetch as rawFetch } from 'ofetch'
import IntelligenceAgentWorkspace from '~/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue'

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

interface Settings {
  enableAudit: boolean
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

// ── State ──
const activeTab = ref('overview')
const settingsRequested = ref(false)
const overviewRequested = ref(false)
const auditRequested = ref(false)
const ipBansRequested = ref(false)
const settings = ref<Settings>({
  enableAudit: false,
})
const error = ref<string | null>(null)
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
async function fetchSettings() {
  settingsRequested.value = true
  try {
    const data = await rawFetch<{ settings: Settings }>('/api/dashboard/intelligence/settings')
    if (data.settings)
      settings.value = { ...settings.value, ...data.settings }
  }
  catch {}
}

async function fetchAudits() {
  auditRequested.value = true
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
    auditError.value = e.data?.message || t('dashboard.sections.intelligence.audit.loadFailed', 'Failed to load audit logs')
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
  overviewRequested.value = true
  overviewLoading.value = true
  overviewError.value = null
  try {
    const data = await rawFetch<OverviewData>('/api/dashboard/intelligence/overview')
    overviewData.value = data
  }
  catch (e: any) {
    overviewError.value = e.data?.message || t('dashboard.sections.intelligence.overview.loadFailed', 'Failed to load overview')
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
      throw new Error(data.error || t('dashboard.sections.intelligence.usage.loadFailed', 'Failed to load usage'))
    userUsageResult.value = data.result || null
  }
  catch (e: any) {
    userUsageError.value = e.data?.message || e.message || t('dashboard.sections.intelligence.usage.loadFailed', 'Failed to load usage')
  }
  finally {
    userUsageLoading.value = false
  }
}

async function fetchIpBans() {
  ipBansRequested.value = true
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
    ipBanError.value = e.data?.message || t('dashboard.sections.intelligence.security.loadIpBansFailed', 'Failed to load IP bans')
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
    ipBanError.value = e.data?.message || t('dashboard.sections.intelligence.security.addIpBanFailed', 'Failed to add IP ban')
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
    ipBanError.value = e.data?.message || t('dashboard.sections.intelligence.security.updateIpBanFailed', 'Failed to update IP ban')
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
    ipBanError.value = e.data?.message || t('dashboard.sections.intelligence.security.removeIpBanFailed', 'Failed to remove IP ban')
  }
  finally {
    ipBanLoading.value = false
  }
}

function ensureOverviewLoaded() {
  if (!overviewRequested.value || overviewError.value)
    fetchOverview()
  if (!ipBansRequested.value || ipBanError.value)
    fetchIpBans()
}

function ensureAuditsLoaded() {
  if (!settingsRequested.value)
    fetchSettings()
  if (!auditRequested.value || auditError.value)
    fetchAudits()
}

onMounted(() => {
  ensureOverviewLoaded()
})

watch([auditPage, auditPageSize], () => {
  if (activeTab.value === 'audits')
    fetchAudits()
})

watch(activeTab, (value) => {
  if (value === 'overview')
    ensureOverviewLoaded()
  if (value === 'audits')
    ensureAuditsLoaded()
})

// ── Computed ──
function providerTypeLabel(type: string) {
  return t(`dashboard.sections.intelligence.types.${type}`, type)
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
          {{ t('dashboard.sections.menu.intelligenceLab', 'Tuff AI') }}
        </template>

        <IntelligenceAgentWorkspace />
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

      <TxTabItem name="serviceChannels" icon-class="i-carbon-cloud-service-management">
        <template #name>
          {{ t('dashboard.sections.intelligence.tabs.serviceChannels', '服务渠道') }}
        </template>

        <div v-if="activeTab === 'serviceChannels'" class="space-y-6">
          <LazyDashboardProviderRegistryAdminPanel />
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
</div>
</template>
