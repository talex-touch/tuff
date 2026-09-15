<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { $fetch as rawFetch } from 'ofetch'
import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'

/**
 * The Intelligence overview, previously the `overview` tab of
 * `IntelligenceAdminPanel`. It owns three panels that share one concern —
 * "what has the AI stack been doing" — and nothing else: aggregate counters,
 * a per-user usage probe, and the risk-gated IP ban list.
 *
 * It is a route of its own because the console rail is the navigation surface
 * now; a tab strip inside a page that is itself a rail entry meant two
 * different controls for the same kind of move.
 */
const { t } = useI18n()
const runtimeConfig = useRuntimeConfig()

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

const overviewRequested = ref(false)
const overviewLoading = ref(false)
const overviewError = ref<string | null>(null)
const overviewData = ref<OverviewData | null>(null)

const userUsageQuery = ref('')
const userUsageLoading = ref(false)
const userUsageError = ref<string | null>(null)
const userUsageResult = ref<UsageResult | null>(null)

const ipBansRequested = ref(false)
const ipBans = ref<IpBan[]>([])
const ipBanLoading = ref(false)
const ipBanError = ref<string | null>(null)
// Seeded from the deploy-time flag so a disabled environment never fires the
// risk-gated ip-bans request just to learn it 404s; the fetch-time fallback
// below still covers a server that disagrees with its own public config.
const ipBanFeatureAvailable = ref(isFeatureFlagEnabled(runtimeConfig.public?.riskControl?.enabled))
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
    const data = await rawFetch<{ ok: boolean, result?: UsageResult, error?: string }>('/api/dashboard/intelligence/usage', {
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

onMounted(() => {
  if (!overviewRequested.value || overviewError.value)
    fetchOverview()
  if (!ipBansRequested.value || ipBanError.value)
    fetchIpBans()
})
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.intelligence.tabs.overview') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.intelligence.overview.subtitle') }}
      </p>
    </header>

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

      <!-- `?? 0` renders four zero cards from a null payload, so a failed load
           looked exactly like a quiet week. Cards need real data behind them. -->
      <div v-else-if="overviewData" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <p class="text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.overview.cards.totalRequests') }}
          </p>
          <p class="mt-2 text-2xl text-black font-semibold dark:text-white">
            {{ overviewData.summary.totalRequests }}
          </p>
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <p class="text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.overview.cards.successRate') }}
          </p>
          <p class="mt-2 text-2xl text-black font-semibold dark:text-white">
            {{ overviewData.summary.successRate }}%
          </p>
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <p class="text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.overview.cards.totalTokens') }}
          </p>
          <p class="mt-2 text-2xl text-black font-semibold dark:text-white">
            {{ overviewData.summary.totalTokens }}
          </p>
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <p class="text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.overview.cards.avgLatency') }}
          </p>
          <p class="mt-2 text-2xl text-black font-semibold dark:text-white">
            {{ overviewData.summary.avgLatency }}ms
          </p>
        </div>
      </div>

      <p v-if="overviewData" class="text-[11px] text-black/40 dark:text-white/40">
        {{ t('dashboard.sections.intelligence.overview.sampleHint', { count: overviewData.summary.sampleSize }) }}
      </p>
    </section>

    <section class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
        <h3 class="text-sm text-black font-medium dark:text-white">
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
        <h3 class="text-sm text-black font-medium dark:text-white">
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
        <h3 class="text-sm text-black font-medium dark:text-white">
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
          class="max-w-xs w-full"
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
          <p class="mt-2 text-2xl text-black font-semibold dark:text-white">
            {{ userUsageResult.totalRequests }}
          </p>
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <p class="text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.overview.userUsage.tokens') }}
          </p>
          <p class="mt-2 text-2xl text-black font-semibold dark:text-white">
            {{ userUsageResult.totalTokens }}
          </p>
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <p class="text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.overview.userUsage.successRate') }}
          </p>
          <p class="mt-2 text-2xl text-black font-semibold dark:text-white">
            {{ userUsageResult.successRate }}%
          </p>
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <p class="text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.overview.userUsage.lastSeen') }}
          </p>
          <p class="mt-2 text-sm text-black font-semibold dark:text-white">
            {{ userUsageResult.lastSeenAt ? formatAuditTime(userUsageResult.lastSeenAt) : '-' }}
          </p>
        </div>
      </div>

      <div v-if="userUsageResult?.models?.length" class="text-xs text-black/60 space-y-2 dark:text-white/60">
        <p class="text-[11px] text-black/40 dark:text-white/40">
          {{ t('dashboard.sections.intelligence.overview.userUsage.modelBreakdown') }}
        </p>
        <div v-for="item in userUsageResult.models" :key="item.label" class="flex items-center justify-between">
          <span class="truncate">{{ item.label }}</span>
          <span>{{ item.count }}</span>
        </div>
      </div>
    </section>

    <!--
      Only this section is risk-gated: server/middleware/feature-gates.ts blocks
      /api/dashboard/intelligence/ip-bans alone. Overview and user-usage above are
      plain requireAdmin routes, so gating them on the ip-ban flag blanked working
      panels and left this form live while claiming it was hidden.
    -->
    <section v-if="ipBanFeatureAvailable" class="apple-card-lg space-y-4 p-6">
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
          class="max-w-xl w-full"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <TuffInput
          v-model="ipBanForm.ip"
          :placeholder="t('dashboard.sections.intelligence.overview.ipBans.ipPlaceholder')"
          class="max-w-xs w-full"
        />
        <TuffInput
          v-model="ipBanForm.reason"
          :placeholder="t('dashboard.sections.intelligence.overview.ipBans.reasonPlaceholder')"
          class="max-w-sm w-full"
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
            <p class="text-sm text-black font-medium dark:text-white">
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
</template>
