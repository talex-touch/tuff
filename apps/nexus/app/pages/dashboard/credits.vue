<script setup lang="ts">
import { computed } from 'vue'
import Button from '~/components/ui/Button.vue'

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
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl text-black font-semibold tracking-tight dark:text-light">
        {{ t('dashboard.credits.title', 'AI 积分') }}
      </h1>
      <p class="mt-2 text-sm text-black/70 dark:text-light/80">
        {{ t('dashboard.credits.subtitle', '个人额度与团队池按月重置') }}
      </p>
    </header>

    <section class="grid gap-4 md:grid-cols-2">
      <div class="rounded-3xl border border-primary/10 bg-white/70 p-6 shadow-sm dark:border-light/10 dark:bg-dark/60">
        <p class="text-sm text-black/60 dark:text-light/70">
          {{ t('dashboard.credits.teamPool', '团队池额度') }}
        </p>
        <div class="mt-3 flex items-end gap-3">
          <span class="text-3xl font-semibold text-black dark:text-light">
            {{ formatNumber((teamBalance?.quota ?? 0) - (teamBalance?.used ?? 0)) }}
          </span>
          <span class="text-xs text-black/50 dark:text-light/50">
            / {{ formatNumber(teamBalance?.quota ?? 0) }}
          </span>
        </div>
        <p class="mt-2 text-xs text-black/50 dark:text-light/60">
          {{ t('dashboard.credits.used', { n: formatNumber(teamBalance?.used ?? 0) }) }}
        </p>
      </div>

      <div class="rounded-3xl border border-primary/10 bg-white/70 p-6 shadow-sm dark:border-light/10 dark:bg-dark/60">
        <p class="text-sm text-black/60 dark:text-light/70">
          {{ t('dashboard.credits.personalPool', '个人额度') }}
        </p>
        <div class="mt-3 flex items-end gap-3">
          <span class="text-3xl font-semibold text-black dark:text-light">
            {{ formatNumber((userBalance?.quota ?? 0) - (userBalance?.used ?? 0)) }}
          </span>
          <span class="text-xs text-black/50 dark:text-light/50">
            / {{ formatNumber(userBalance?.quota ?? 0) }}
          </span>
        </div>
        <p class="mt-2 text-xs text-black/50 dark:text-light/60">
          {{ t('dashboard.credits.used', { n: formatNumber(userBalance?.used ?? 0) }) }}
        </p>
      </div>
    </section>

    <section class="rounded-3xl border border-primary/10 bg-white/70 p-6 shadow-sm dark:border-light/10 dark:bg-dark/60">
      <div class="flex items-center justify-between">
        <h2 class="text-lg text-black font-semibold dark:text-light">
          {{ t('dashboard.credits.ledger', '积分流水') }}
        </h2>
        <Button size="small" variant="secondary" @click="() => { refreshSummary(); refreshLedger() }">
          {{ t('common.refresh', '刷新') }}
        </Button>
      </div>

      <div v-if="summaryPending || ledgerPending" class="mt-4 flex items-center justify-center py-4">
        <span class="i-carbon-circle-dash animate-spin text-primary" />
      </div>

      <ul v-else-if="ledger?.length" class="mt-4 space-y-2 text-sm">
        <li
          v-for="entry in ledger"
          :key="entry.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/10 bg-white/60 px-4 py-3 dark:border-light/10 dark:bg-dark/40"
        >
          <div>
            <p class="text-black dark:text-light">
              {{ entry.reason }}
            </p>
            <p class="text-xs text-black/50 dark:text-light/50">
              {{ formatLedgerTime(entry.created_at) }}
            </p>
          </div>
          <span class="text-sm font-semibold text-black dark:text-light">
            {{ entry.delta }}
          </span>
        </li>
      </ul>
      <p v-else class="mt-4 text-sm text-black/60 dark:text-light/70">
        {{ t('dashboard.credits.empty', '暂无记录') }}
      </p>
    </section>
  </div>
</template>
