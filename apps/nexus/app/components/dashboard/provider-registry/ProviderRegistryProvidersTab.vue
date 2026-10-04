<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { ProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import type { ProviderCapabilityRecord, ProviderRegistryRecord } from '~/utils/provider-registry-admin'
import { TxIconButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { computed, ref, watch } from 'vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminFilterField from '~/components/admin/AdminFilterField.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import { ADMIN_FORMAT_EMPTY, useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import {
  buildProviderStatusFilterOptions,
  createProviderListOptions,
  healthStatusLabel,
  healthStatusTone,
} from '~/utils/admin-provider-registry'
import { buildProviderDetailSections } from '~/utils/admin-provider-registry-detail'
import ProviderRegistryDetailView from './ProviderRegistryDetailView.vue'

const props = defineProps<{
  admin: ProviderRegistryAdmin
}>()

const emit = defineEmits<{
  check: [provider: ProviderRegistryRecord]
  edit: [provider: ProviderRegistryRecord]
  quota: [provider: ProviderRegistryRecord]
  delete: [provider: ProviderRegistryRecord]
  toggleStatus: [provider: ProviderRegistryRecord, enabled: boolean]
}>()

const { t } = useI18n()
const format = useAdminFormat()
const admin = props.admin

// The rows are the registry's; filtering and paging happen here, with the
// page, size, search and status in the URL (`pv_`).
const setup = createProviderListOptions(() => admin.providers.value, () => admin.providerObservabilityById.value, admin.whenRegistryLoaded)
const list = useAdminList(setup.options)
const filters = list.filters

watch(() => admin.registry.data.value, () => {
  setup.fetcher.invalidate()
  void list.refresh()
})

const statusOptions = computed(() => buildProviderStatusFilterOptions(t))

const filteredEmptyTitle = computed(() => {
  const applied = list.appliedFilters.value
  if (applied.q)
    return t('dashboard.providerRegistry.providers.emptySearch', 'No providers match the current search.')
  if (applied.status === 'attention')
    return t('dashboard.providerRegistry.providers.emptyAttention', 'No providers need attention')
  if (applied.status === 'unknown')
    return t('dashboard.providerRegistry.providers.emptyUnknown', 'No providers are missing evidence')
  return t('dashboard.providerRegistry.providers.emptyFiltered', 'No providers match this filter')
})

// At 1280px the table area is 976px: the fixed columns take 608px and leave the
// provider column about 368px. Latency, the health detail, the quota and the
// update time live in the drawer.
const columns = computed<DataTableColumn<ProviderRegistryRecord>[]>(() => [
  { key: 'provider', title: t('dashboard.providerRegistry.table.provider', 'Provider') },
  { key: 'status', title: t('dashboard.providerRegistry.fields.status', 'Status'), width: 88 },
  { key: 'capabilities', title: t('dashboard.providerRegistry.tabs.capabilities', 'Capabilities'), width: 260 },
  { key: 'health', title: t('dashboard.providerRegistry.table.health', 'Health'), width: 124 },
  { key: 'actions', title: t('dashboard.providerRegistry.table.actions', 'Actions'), width: 136, align: 'right' },
])

function valueLabel(value: string | null | undefined): string {
  if (!value)
    return ADMIN_FORMAT_EMPTY
  return t(`dashboard.providerRegistry.values.${value}`, value)
}

function visibleCapabilities(provider: ProviderRegistryRecord): ProviderCapabilityRecord[] {
  return provider.capabilities.slice(0, 3)
}

function hiddenCapabilityCount(provider: ProviderRegistryRecord): number {
  return Math.max(0, provider.capabilities.length - 3)
}

function healthStatus(provider: ProviderRegistryRecord) {
  return admin.getProviderObservability(provider.id).status
}

const detailProvider = ref<ProviderRegistryRecord | null>(null)
const detailOpen = ref(false)
const detailSections = computed(() => {
  const provider = detailProvider.value
  if (!provider)
    return []
  return buildProviderDetailSections(provider, {
    observability: admin.getProviderObservability(provider.id),
    hint: admin.getProviderObservabilityActionHint(provider.id),
    quota: admin.getProviderQuotaSummary(provider.id),
  }, {
    t,
    format,
    providerName: id => admin.providers.value.find(item => item.id === id)?.displayName ?? id ?? '',
  })
})

function openDetail(provider: ProviderRegistryRecord) {
  detailProvider.value = provider
  detailOpen.value = true
}

// The registry may load again while the drawer is open: show the fresh record.
watch(() => admin.providers.value, (providers) => {
  const current = detailProvider.value
  if (current)
    detailProvider.value = providers.find(provider => provider.id === current.id) ?? current
})

defineExpose({
  refresh: () => Promise.resolve(),
})
</script>

<template>
  <div class="RegistryTab">
    <AdminFilterBar :active="list.hasActiveFilters.value" @clear="list.clearFilters()">
      <AdminFilterField :label="t('dashboard.providerRegistry.filters.searchLabel', 'Search')" for="provider-registry-search" wide>
        <TxSearchInput
          id="provider-registry-search"
          v-model="filters.q"
          autocomplete="off"
          :placeholder="t('dashboard.providerRegistry.providers.searchPlaceholder', 'Search provider, vendor, capability')"
        />
      </AdminFilterField>
      <AdminFilterField :label="t('dashboard.providerRegistry.filters.statusLabel', 'Status')">
        <TxSelect v-model="filters.status" :options="statusOptions" />
      </AdminFilterField>
    </AdminFilterBar>

    <AdminSection :padded="false">
      <AdminTable
        :columns="columns"
        :rows="list.rows.value"
        row-key="id"
        :loading="admin.registry.loading.value"
        :refreshing="admin.registry.refreshing.value"
        :error="admin.registryLoadError.value"
        :empty-title="t('dashboard.providerRegistry.providers.empty', 'No providers registered yet.')"
        :filtered-empty-title="filteredEmptyTitle"
        :filtered="list.hasActiveFilters.value"
        :page="list.page.value"
        :limit="list.limit.value"
        :total="list.total.value"
        :page-sizes="list.pageSizes"
        table-layout="fixed"
        clickable-rows
        @retry="admin.refresh()"
        @clear-filters="list.clearFilters()"
        @update:page="list.setPage"
        @update:limit="list.setLimit"
        @row-click="openDetail"
      >
        <template #cell-provider="{ row }">
          <span class="RegistryCell" :title="row.displayName">{{ row.displayName }}</span>
        </template>
        <template #cell-status="{ row }">
          <!-- Controls in a clickable row: a click (Enter and Space click too) stops here. -->
          <span class="RegistryLine is-control" @click.stop>
            <TxSwitch
              :model-value="row.status !== 'disabled'"
              :disabled="admin.actionPending.value !== null"
              size="small"
              :title="valueLabel(row.status)"
              :aria-label="t('dashboard.providerRegistry.providers.statusSwitchLabel', { provider: row.displayName }, `Toggle ${row.displayName}`)"
              @change="(enabled: boolean) => emit('toggleStatus', row, enabled)"
            />
          </span>
        </template>
        <template #cell-capabilities="{ row }">
          <span class="RegistryChips" :title="row.capabilities.map((item: ProviderCapabilityRecord) => item.capability).join(', ')">
            <span v-for="capability in visibleCapabilities(row)" :key="capability.id" class="RegistryChip">{{ capability.capability }}</span>
            <span v-if="hiddenCapabilityCount(row)" class="RegistryChip is-count">+{{ format.number(hiddenCapabilityCount(row)) }}</span>
            <span v-if="!row.capabilities.length" class="RegistryCell is-muted">{{ ADMIN_FORMAT_EMPTY }}</span>
          </span>
        </template>
        <template #cell-health="{ row }">
          <span class="RegistryLine">
            <TxStatusBadge :text="healthStatusLabel(healthStatus(row), t)" :status="healthStatusTone(healthStatus(row))" size="sm" />
          </span>
        </template>
        <template #cell-actions="{ row }">
          <span class="RegistryActions" @click.stop>
            <TxIconButton
              size="xs"
              icon="i-carbon-data-check"
              :disabled="admin.actionPending.value !== null"
              :title="t('dashboard.providerRegistry.actions.checkHint', 'Check: sends one probe request upstream')"
              :label="t('dashboard.providerRegistry.actions.check', 'Check')"
              @click="emit('check', row)"
            />
            <TxIconButton
              size="xs"
              icon="i-carbon-edit"
              :title="t('dashboard.providerRegistry.actions.edit', 'Edit')"
              :label="t('dashboard.providerRegistry.actions.edit', 'Edit')"
              @click="emit('edit', row)"
            />
            <TxIconButton
              size="xs"
              icon="i-carbon-wallet"
              :title="t('dashboard.providerRegistry.actions.quota', 'Quota')"
              :label="t('dashboard.providerRegistry.actions.quota', 'Quota')"
              @click="emit('quota', row)"
            />
            <TxIconButton
              size="xs"
              icon="i-carbon-trash-can"
              status="danger"
              :disabled="admin.actionPending.value !== null"
              :title="t('common.delete', 'Delete')"
              :label="t('common.delete', 'Delete')"
              @click="emit('delete', row)"
            />
          </span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer v-model:visible="detailOpen" :title="detailProvider?.displayName || t('dashboard.providerRegistry.detail.providerTitle', 'Provider')" size="520px">
      <ProviderRegistryDetailView v-if="detailProvider" :sections="detailSections" />
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

.RegistryCell.is-muted {
  color: var(--tx-text-color-regular);
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

/* A switch's focus ring sits 2px outside it: a control cell does not clip. */
.RegistryLine.is-control {
  overflow: visible;
}

.RegistryChips {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.RegistryChip {
  min-width: 0;
  overflow: hidden;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  font-size: 12px;
  text-overflow: ellipsis;
}

.RegistryChip.is-count {
  flex-shrink: 0;
}

.RegistryActions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  height: 1lh;
  align-items: center;
}
</style>
