<script setup lang="ts">
import { computed } from 'vue'
import { TxButton } from '@talex-touch/tuffex'

defineI18nRoute(false)

const { t } = useI18n()

const { data: summary, pending: summaryPending, refresh: refreshSummary } = useFetch<any>('/api/credits/summary')
const { data: ledger, pending: ledgerPending, refresh: refreshLedger } = useFetch<any[]>('/api/credits/ledger')

const teamBalance = computed(() => summary.value?.team ?? null)
const userBalance = computed(() => summary.value?.user ?? null)

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number')
    return '0'
  return new Intl.NumberFormat().format(value)
}

function formatLedgerTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.credits.title', 'AI 积分') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.credits.subtitle', '个人额度与团队池按月重置') }}
      </p>
    </header>

    <section class="grid gap-4 md:grid-cols-2">
      <div class="apple-card-lg p-6">
        <p class="apple-section-title">
          {{ t('dashboard.credits.teamPool', '团队池额度') }}
        </p>
        <div class="mt-3 flex items-end gap-3">
          <span class="text-3xl font-semibold text-black dark:text-white">
            {{ formatNumber((teamBalance?.quota ?? 0) - (teamBalance?.used ?? 0)) }}
          </span>
          <span class="text-xs text-black/40 dark:text-white/40">
            / {{ formatNumber(teamBalance?.quota ?? 0) }}
          </span>
        </div>
        <p class="mt-2 text-xs text-black/40 dark:text-white/40">
          {{ t('dashboard.credits.used', { n: formatNumber(teamBalance?.used ?? 0) }) }}
        </p>
      </div>

      <div class="apple-card-lg p-6">
        <p class="apple-section-title">
          {{ t('dashboard.credits.personalPool', '个人额度') }}
        </p>
        <div class="mt-3 flex items-end gap-3">
          <span class="text-3xl font-semibold text-black dark:text-white">
            {{ formatNumber((userBalance?.quota ?? 0) - (userBalance?.used ?? 0)) }}
          </span>
          <span class="text-xs text-black/40 dark:text-white/40">
            / {{ formatNumber(userBalance?.quota ?? 0) }}
          </span>
        </div>
        <p class="mt-2 text-xs text-black/40 dark:text-white/40">
          {{ t('dashboard.credits.used', { n: formatNumber(userBalance?.used ?? 0) }) }}
        </p>
      </div>
    </section>

    <section class="apple-card-lg p-6">
      <h2 class="apple-heading-sm">
        {{ t('dashboard.credits.ledger', '积分流水') }}
      </h2>
      <div class="mt-3">
        <TxButton size="small" variant="secondary" @click="() => { refreshSummary(); refreshLedger() }">
          {{ t('common.refresh', '刷新') }}
        </TxButton>
      </div>

      <div v-if="summaryPending || ledgerPending" class="mt-4 space-y-3 py-4">
        <div class="flex items-center justify-center">
          <TxSpinner :size="18" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>

      <ul v-else-if="ledger?.length" class="mt-5 space-y-2 text-sm">
        <li
          v-for="entry in ledger"
          :key="entry.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-black/[0.02] px-4 py-3 transition hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
        >
          <div>
            <p class="text-black dark:text-white">
              {{ entry.reason }}
            </p>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ formatLedgerTime(entry.created_at) }}
            </p>
          </div>
          <span class="text-sm font-semibold text-black dark:text-white">
            {{ entry.delta }}
          </span>
        </li>
      </ul>
      <p v-else class="mt-4 text-sm text-black/40 dark:text-white/40">
        {{ t('dashboard.credits.empty', '暂无记录') }}
      </p>
    </section>
  </div>
</template>
