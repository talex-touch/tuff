<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { CreditLedgerEntry, CreditPricingRule, CreditSummaryResponse } from '@/api/types'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleStatGrid from '@/components/ConsoleStatGrid.vue'
import type { ConsoleStatItem } from '@/components/ConsoleStatGrid.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { sliceClientPage, useConsoleList } from '@/composables/useConsoleList'
import { formatDateTime, formatNumber } from '@/utils/format'

const { t, locale } = useI18n()

const summaryLoading = ref(true)
const summary = ref<CreditSummaryResponse | null>(null)
const pricingRules = ref<CreditPricingRule[]>([])
const pricingLoading = ref(true)
const pricingPage = ref(1)
const pricingLimit = ref(10)
const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)

const claimModalOpen = ref(false)
const redeemCode = ref('')
const claiming = ref(false)

const stats = computed<ConsoleStatItem[]>(() => {
  const s = summary.value
  const quota = s?.user?.quota ?? s?.quota ?? s?.personal?.quota ?? 0
  const used = s?.user?.used ?? s?.used ?? s?.personal?.used ?? 0
  const balance = s?.user
    ? Math.max(0, quota - used)
    : (s?.balance ?? s?.remaining ?? s?.personal?.balance ?? Math.max(0, quota - used))
  return [
    { key: 'balance', label: t('dashboard.creditBalance'), value: formatNumber(balance, locale.value), iconClass: 'i-carbon-currency' },
    { key: 'used', label: t('dashboard.creditUsed'), value: formatNumber(used, locale.value), iconClass: 'i-carbon-chart-bar' },
    { key: 'quota', label: t('dashboard.creditQuota'), value: formatNumber(quota, locale.value), iconClass: 'i-carbon-meter' },
  ]
})

const pricingSlice = computed(() => sliceClientPage(pricingRules.value, pricingPage.value, pricingLimit.value))

const ledgerList = useConsoleList<CreditLedgerEntry, Record<string, never>>({
  defaults: {},
  defaultLimit: 20,
  pageSizes: [10, 20, 50],
  fetch: async ({ page, limit }) => {
    const res = await consoleApi.listCreditLedger({ page, limit })
    const all = Array.isArray(res) ? res : (res.entries ?? res.items ?? [])
    if (res && !Array.isArray(res) && res.pagination)
      return { rows: all, total: res.pagination.total }
    return sliceClientPage(all, page, limit)
  },
})

const pricingColumns = computed<DataTableColumn<CreditPricingRule>[]>(() => [
  { key: 'capability', title: t('dashboard.capabilityCol'), minWidth: 200 },
  { key: 'creditsPerUnit', title: t('dashboard.creditsPerUnitCol'), align: 'right', minWidth: 140 },
  { key: 'minCredits', title: t('dashboard.minCreditsCol'), align: 'right', minWidth: 120 },
  { key: 'active', title: t('common.status'), minWidth: 100 },
])

const ledgerColumns = computed<DataTableColumn<CreditLedgerEntry>[]>(() => [
  { key: 'createdAt', title: t('common.createdAt'), minWidth: 160 },
  { key: 'reason', title: t('dashboard.reasonCol'), minWidth: 200 },
  { key: 'delta', title: t('dashboard.deltaCol'), align: 'right', minWidth: 100 },
  { key: 'balanceAfter', title: t('dashboard.balanceAfterCol'), align: 'right', minWidth: 120 },
])

async function loadSummaryAndPricing() {
  summaryLoading.value = true
  pricingLoading.value = true
  try {
    const [sumRes, priceRes] = await Promise.allSettled([
      consoleApi.getCreditSummary(),
      consoleApi.getCreditPricing(),
    ])
    if (sumRes.status === 'fulfilled')
      summary.value = sumRes.value
    if (priceRes.status === 'fulfilled')
      pricingRules.value = priceRes.value.rules ?? priceRes.value.pricing ?? []
  }
  finally {
    summaryLoading.value = false
    pricingLoading.value = false
  }
}

async function submitClaim() {
  claiming.value = true
  feedback.value = null
  try {
    const trimmed = redeemCode.value.trim()
    if (trimmed) {
      await consoleApi.activateSubscriptionCode({ code: trimmed })
    }
    else {
      await consoleApi.claimCreditCode()
    }
    claimModalOpen.value = false
    redeemCode.value = ''
    await Promise.all([loadSummaryAndPricing(), ledgerList.refresh()])
    feedback.value = { type: 'success', message: t('dashboard.claimCode') }
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    claiming.value = false
  }
}

onMounted(() => void loadSummaryAndPricing())
</script>

<template>
  <ConsolePageShell :title="t('dashboard.creditsTitle')">
    <template #actions>
      <TxButton variant="secondary" size="sm" icon="i-carbon-renew" @click="loadSummaryAndPricing(); ledgerList.refresh()">
        {{ t('common.refresh') }}
      </TxButton>
      <TxButton variant="primary" size="sm" icon="i-carbon-gift" @click="claimModalOpen = true">
        {{ t('dashboard.claimCode') }}
      </TxButton>
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <ConsoleStatGrid :items="stats" :loading="summaryLoading" :skeleton-count="3" />

    <ConsoleSection :title="t('dashboard.ledgerSection')" :padded="false">
      <ConsoleTable
        :columns="ledgerColumns"
        :rows="ledgerList.rows.value"
        row-key="id"
        :loading="ledgerList.loading.value"
        :refreshing="ledgerList.refreshing.value"
        :error="ledgerList.error.value"
        :page="ledgerList.page.value"
        :limit="ledgerList.limit.value"
        :total="ledgerList.total.value"
        :page-sizes="ledgerList.pageSizes"
        @retry="ledgerList.refresh()"
        @update:page="ledgerList.setPage($event)"
        @update:limit="ledgerList.setLimit($event)"
      >
        <template #cell-createdAt="{ row }">
          {{ formatDateTime(row.createdAt ?? row.created_at, locale) }}
        </template>
        <template #cell-delta="{ row }">
          <TxStatusBadge
            :text="row.delta >= 0 ? `+${formatNumber(row.delta, locale)}` : formatNumber(row.delta, locale)"
            :status="row.delta >= 0 ? 'success' : 'muted'"
            size="sm"
          />
        </template>
        <template #cell-balanceAfter="{ row }">
          {{ (row.balanceAfter ?? row.balance_after) !== null && (row.balanceAfter ?? row.balance_after) !== undefined ? formatNumber((row.balanceAfter ?? row.balance_after) as number, locale) : '—' }}
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <ConsoleSection :title="t('dashboard.pricingSection')" :padded="false">
      <ConsoleTable
        :columns="pricingColumns"
        :rows="pricingSlice.rows"
        row-key="capability"
        :loading="pricingLoading"
        :page="pricingPage"
        :limit="pricingLimit"
        :total="pricingSlice.total"
        :page-sizes="[10, 20, 50]"
        @update:page="pricingPage = $event"
        @update:limit="pricingLimit = $event; pricingPage = 1"
      >
        <template #cell-capability="{ row }">
          <span class="console-mono">{{ row.capability }}</span>
        </template>
        <template #cell-creditsPerUnit="{ row }">
          {{ formatNumber(row.creditsPerUnit, locale) }}
        </template>
        <template #cell-minCredits="{ row }">
          {{ formatNumber(row.minCredits, locale) }}
        </template>
        <template #cell-active="{ row }">
          <TxStatusBadge
            :text="row.active ? t('common.active') : t('common.disabled')"
            :status="row.active ? 'success' : 'muted'"
            size="sm"
          />
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <TxModal
      v-model="claimModalOpen"
      :title="t('dashboard.claimCodeTitle')"
      :close-label="t('common.close')"
      width="440px"
    >
      <ConsoleFormField :label="t('dashboard.claimCode')" for-id="credit-claim-code">
        <TuffInput
          id="credit-claim-code"
          v-model="redeemCode"
          :placeholder="t('dashboard.claimCodePlaceholder')"
          autocomplete="off"
        />
      </ConsoleFormField>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="claimModalOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="claiming" @click="submitClaim">
          {{ redeemCode.trim() ? t('dashboard.redeemSubscription') : t('dashboard.claimBoost') }}
        </TxButton>
      </template>
    </TxModal>
  </ConsolePageShell>
</template>
