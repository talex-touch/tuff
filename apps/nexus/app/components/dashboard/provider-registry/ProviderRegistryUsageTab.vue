<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { ProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import type { ProviderUsageLedgerEntry } from '~/utils/provider-registry-admin'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, ref } from 'vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminFilterField from '~/components/admin/AdminFilterField.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import { ADMIN_FORMAT_EMPTY, useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import {
  buildRecordFilterOptions,
  buildUsageModeFilterOptions,
  buildUsageStatusFilterOptions,
  createUsageListOptions,
} from '~/utils/admin-provider-registry'
import { buildUsageDetailSections } from '~/utils/admin-provider-registry-detail'
import ProviderRegistryDetailView from './ProviderRegistryDetailView.vue'

const props = defineProps<{
  admin: ProviderRegistryAdmin
}>()

const { t } = useI18n()
const format = useAdminFormat()
const admin = props.admin

// The ledger is paged by the server: page, size and filters go out as the
// request's query and live in the URL under `u_`. It loads, fails and retries
// on its own, whatever the registry is doing.
const list = useAdminList(createUsageListOptions(query => admin.listUsageEntries(query), t))
const filters = list.filters

const statusOptions = computed(() => buildUsageStatusFilterOptions(t))
const modeOptions = computed(() => buildUsageModeFilterOptions(t))
const providerOptions = computed(() => buildRecordFilterOptions(
  admin.providers.value,
  t('dashboard.providerRegistry.filters.allProviders', 'All providers'),
))
const sceneOptions = computed(() => buildRecordFilterOptions(
  admin.scenes.value,
  t('dashboard.providerRegistry.filters.allScenes', 'All scenes'),
))

const filteredEmptyTitle = computed(() => list.appliedFilters.value.status === 'attention'
  ? t('dashboard.providerRegistry.usage.emptyAttention', 'No usage rows need attention')
  : t('dashboard.providerRegistry.usage.emptyFiltered', 'No usage rows match these filters'))

// At 1280px the table area is 976px: the fixed columns take 628px and leave the
// run column about 348px. References, errors, the trace and the fallback trail
// live in the drawer.
const columns = computed<DataTableColumn<ProviderUsageLedgerEntry>[]>(() => [
  { key: 'run', title: t('dashboard.providerRegistry.table.run', 'Run') },
  { key: 'status', title: t('dashboard.providerRegistry.fields.status', 'Status'), width: 124 },
  { key: 'provider', title: t('dashboard.providerRegistry.fields.provider', 'Provider'), width: 180 },
  { key: 'metering', title: t('dashboard.providerRegistry.usage.metering', 'Metering'), width: 176 },
  { key: 'createdAt', title: t('dashboard.providerRegistry.table.createdAt', 'Created at'), width: 148 },
])

function valueLabel(value: string | null | undefined): string {
  if (!value)
    return ADMIN_FORMAT_EMPTY
  return t(`dashboard.providerRegistry.values.${value}`, value)
}

function providerName(providerId: string | null | undefined): string {
  if (!providerId)
    return ADMIN_FORMAT_EMPTY
  return admin.providers.value.find(provider => provider.id === providerId)?.displayName ?? providerId
}

function runSecondary(entry: ProviderUsageLedgerEntry): string {
  return [entry.runId, valueLabel(entry.mode), entry.capability].filter(Boolean).join(' · ')
}

function meteringText(entry: ProviderUsageLedgerEntry): string {
  const quantity = `${format.number(entry.quantity)} ${entry.unit}`
  return entry.billable
    ? `${quantity} · ${t('dashboard.providerRegistry.usage.billable', 'billable')}`
    : `${quantity} · ${t('dashboard.providerRegistry.usage.notBillable', 'not billable')}`
}

const detailEntry = ref<ProviderUsageLedgerEntry | null>(null)
const detailOpen = ref(false)
const detailSections = computed(() => detailEntry.value
  ? buildUsageDetailSections(detailEntry.value, admin.getUsageLedgerActionHint(detailEntry.value), { t, format, providerName })
  : [])

function openDetail(entry: ProviderUsageLedgerEntry) {
  detailEntry.value = entry
  detailOpen.value = true
}

defineExpose({
  refresh: () => list.refresh(),
})
</script>

<template>
  <div class="RegistryTab">
    <AdminFilterBar :active="list.hasActiveFilters.value" @clear="list.clearFilters()">
      <AdminFilterField :label="t('dashboard.providerRegistry.filters.statusLabel', 'Status')">
        <TxSelect v-model="filters.status" :options="statusOptions" />
      </AdminFilterField>
      <AdminFilterField :label="t('dashboard.providerRegistry.filters.modeLabel', 'Mode')">
        <TxSelect v-model="filters.mode" :options="modeOptions" />
      </AdminFilterField>
      <AdminFilterField :label="t('dashboard.providerRegistry.fields.provider', 'Provider')">
        <TxSelect v-model="filters.provider" :options="providerOptions" />
      </AdminFilterField>
      <AdminFilterField :label="t('dashboard.providerRegistry.detail.scene', 'Scene')">
        <TxSelect v-model="filters.scene" :options="sceneOptions" />
      </AdminFilterField>
    </AdminFilterBar>

    <AdminSection :padded="false">
      <AdminTable
        :columns="columns"
        :rows="list.rows.value"
        row-key="id"
        :loading="list.loading.value"
        :refreshing="list.refreshing.value"
        :error="list.error.value"
        :empty-title="t('dashboard.providerRegistry.usage.empty', 'No scene run usage yet.')"
        :filtered-empty-title="filteredEmptyTitle"
        :filtered="list.hasActiveFilters.value"
        :page="list.page.value"
        :limit="list.limit.value"
        :total="list.total.value"
        :page-sizes="list.pageSizes"
        table-layout="fixed"
        clickable-rows
        @retry="list.refresh()"
        @clear-filters="list.clearFilters()"
        @update:page="list.setPage"
        @update:limit="list.setLimit"
        @row-click="openDetail"
      >
        <template #cell-run="{ row }">
          <span class="RegistryCell" :title="`${row.sceneId} · ${runSecondary(row)}`">
            {{ row.sceneId }}<span class="RegistryCell-Secondary">{{ runSecondary(row) }}</span>
          </span>
        </template>
        <template #cell-status="{ row }">
          <span class="RegistryLine">
            <TxStatusBadge :text="valueLabel(row.status)" :status="admin.observabilityTone(row.status)" size="sm" />
          </span>
        </template>
        <template #cell-provider="{ row }">
          <span class="RegistryCell" :title="providerName(row.providerId)">{{ providerName(row.providerId) }}</span>
        </template>
        <template #cell-metering="{ row }">
          <span class="RegistryCell is-numeric" :title="meteringText(row)">{{ meteringText(row) }}</span>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="RegistryCell is-numeric" :title="format.dateTimeTitle(row.createdAt)">{{ format.tableDateTime(row.createdAt) }}</span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer v-model:visible="detailOpen" :title="t('dashboard.providerRegistry.detail.usageTitle', 'Usage row')" size="520px">
      <ProviderRegistryDetailView v-if="detailEntry" :sections="detailSections" />
    </TxDrawer>
  </div>
</template>

<style scoped>
.RegistryTab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* Every cell is one line: what does not fit is cut with an ellipsis and shown in
   full in the cell's title and in the drawer. The tables are `fixed`, so a long
   value can never widen its column and push the table sideways. */
.RegistryCell {
  display: block;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.RegistryCell-Secondary {
  color: var(--tx-text-color-regular);
}

.RegistryCell.is-numeric {
  font-variant-numeric: tabular-nums;
}

.RegistryCell-Secondary::before {
  content: ' · ';
}

/* A badge or control cell is one line box tall, like a text cell. */
.RegistryLine {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 1lh;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
</style>
