<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { ProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import type { ProviderHealthCheckEntry } from '~/utils/provider-registry-admin'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, ref } from 'vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminFilterField from '~/components/admin/AdminFilterField.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import {
  buildHealthStatusFilterOptions,
  buildRecordFilterOptions,
  createHealthListOptions,
  formatRegistryLatency,
  healthStatusLabel,
  healthStatusTone,
} from '~/utils/admin-provider-registry'
import { buildHealthDetailSections } from '~/utils/admin-provider-registry-detail'
import ProviderRegistryDetailView from './ProviderRegistryDetailView.vue'

const props = defineProps<{
  admin: ProviderRegistryAdmin
}>()

const { t } = useI18n()
const format = useAdminFormat()
const admin = props.admin

// The checks are paged by the server: page, size and filters go out as the
// request's query and live in the URL under `h_`. 需关注 asks for
// `status=degraded,unhealthy`, the count the health card shows.
const list = useAdminList(createHealthListOptions(query => admin.listHealthChecks(query), t))
const filters = list.filters

const statusOptions = computed(() => buildHealthStatusFilterOptions(t))
const providerOptions = computed(() => buildRecordFilterOptions(
  admin.providers.value,
  t('dashboard.providerRegistry.filters.allProviders', 'All providers'),
))

const filteredEmptyTitle = computed(() => list.appliedFilters.value.status === 'attention'
  ? t('dashboard.providerRegistry.health.emptyAttention', 'No health checks need attention')
  : t('dashboard.providerRegistry.health.emptyFiltered', 'No health checks match these filters'))

// At 1280px the table area is 976px: the fixed columns take 548px and leave the
// provider column about 428px. The endpoint and the full reason live in the drawer.
const columns = computed<DataTableColumn<ProviderHealthCheckEntry>[]>(() => [
  { key: 'provider', title: t('dashboard.providerRegistry.table.provider', 'Provider') },
  { key: 'status', title: t('dashboard.providerRegistry.fields.status', 'Status'), width: 124 },
  { key: 'capability', title: t('dashboard.providerRegistry.fields.capability', 'Capability'), width: 180 },
  { key: 'latency', title: t('dashboard.providerRegistry.health.latency', 'Latency'), width: 96, align: 'right' },
  { key: 'checkedAt', title: t('dashboard.providerRegistry.table.checkedAt', 'Checked at'), width: 148 },
])

function providerSecondary(entry: ProviderHealthCheckEntry): string {
  return `${entry.providerId} · ${t(`dashboard.providerRegistry.values.${entry.vendor}`, entry.vendor)}`
}

const detailEntry = ref<ProviderHealthCheckEntry | null>(null)
const detailOpen = ref(false)
const detailSections = computed(() => detailEntry.value
  ? buildHealthDetailSections(detailEntry.value, admin.getHealthCheckActionHint(detailEntry.value), {
      t,
      format,
      providerName: id => admin.providers.value.find(item => item.id === id)?.displayName ?? id ?? '',
    })
  : [])

function openDetail(entry: ProviderHealthCheckEntry) {
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
      <AdminFilterField :label="t('dashboard.providerRegistry.fields.provider', 'Provider')">
        <TxSelect v-model="filters.provider" :options="providerOptions" />
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
        :empty-title="t('dashboard.providerRegistry.health.empty', 'No health checks yet.')"
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
        <template #cell-provider="{ row }">
          <span class="RegistryCell" :title="`${row.providerName} · ${providerSecondary(row)}`">
            {{ row.providerName }}<span class="RegistryCell-Secondary">{{ providerSecondary(row) }}</span>
          </span>
        </template>
        <template #cell-status="{ row }">
          <span class="RegistryLine">
            <TxStatusBadge :text="healthStatusLabel(row.status, t)" :status="healthStatusTone(row.status)" size="sm" />
          </span>
        </template>
        <template #cell-capability="{ row }">
          <span class="RegistryCell" :title="row.capability">{{ row.capability }}</span>
        </template>
        <template #cell-latency="{ row }">
          <span class="RegistryCell is-numeric">{{ formatRegistryLatency(row.latencyMs, format, t) }}</span>
        </template>
        <template #cell-checkedAt="{ row }">
          <span class="RegistryCell is-numeric" :title="format.dateTimeTitle(row.checkedAt)">{{ format.tableDateTime(row.checkedAt) }}</span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer v-model:visible="detailOpen" :title="detailEntry?.providerName || t('dashboard.providerRegistry.detail.healthTitle', 'Health check')" size="520px">
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
