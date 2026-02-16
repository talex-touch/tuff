<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { TuffInput, TxButton, TxPagination, TxSkeleton, TxSpinner } from '@talex-touch/tuffex'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const { user } = useAuthUser()

const isAdmin = computed(() => user.value?.role === 'admin')

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

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

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

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

watch(() => usagePagination.value.page, () => fetchUsage())
watch(() => ledgerPagination.value.page, () => fetchLedger())

onMounted(() => {
  fetchUsage()
  fetchLedger()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.adminCredits.title', 'AI 积分管理') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.adminCredits.subtitle', '查看全部用户消耗与积分流水') }}
      </p>
    </header>

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
        <TxButton variant="secondary" size="small" @click="fetchUsage">
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
        <TxButton variant="secondary" size="small" @click="fetchLedger">
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
</template>
