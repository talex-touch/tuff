<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { ProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import type { ProviderCapabilityRecord, SceneRegistryRecord } from '~/utils/provider-registry-admin'
import { TxIconButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
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
  adapterReasonLabel,
  buildRouteStatusFilterOptions,
  createCapabilityListOptions,
  createRouteListOptions,
  readinessLabel,
  readinessTone,
} from '~/utils/admin-provider-registry'
import { buildRouteDetailSections } from '~/utils/admin-provider-registry-detail'
import ProviderRegistryDetailView from './ProviderRegistryDetailView.vue'

const props = defineProps<{
  admin: ProviderRegistryAdmin
}>()

const emit = defineEmits<{
  run: [scene: SceneRegistryRecord]
  edit: [scene: SceneRegistryRecord]
  delete: [scene: SceneRegistryRecord]
  toggleStatus: [scene: SceneRegistryRecord, enabled: boolean]
}>()

const { t } = useI18n()
const format = useAdminFormat()
const admin = props.admin

// Two client lists on this tab, each with its own address: routes (`rt_`) and
// the capability index (`cap_`).
const routeSetup = createRouteListOptions(() => admin.scenes.value, () => admin.sceneObservabilityById.value, admin.whenRegistryLoaded)
const routes = useAdminList(routeSetup.options)
const routeFilters = routes.filters

const capabilitySetup = createCapabilityListOptions(() => admin.capabilities.value, admin.whenRegistryLoaded)
const capabilities = useAdminList(capabilitySetup.options)

watch(() => admin.registry.data.value, () => {
  routeSetup.fetcher.invalidate()
  capabilitySetup.fetcher.invalidate()
  void routes.refresh()
  void capabilities.refresh()
})

const statusOptions = computed(() => buildRouteStatusFilterOptions(t))

const routeFilteredEmptyTitle = computed(() => {
  const status = routes.appliedFilters.value.status
  if (status === 'attention')
    return t('dashboard.providerRegistry.scenes.emptyAttention', 'No scene runs need attention')
  if (status === 'failed')
    return t('dashboard.providerRegistry.scenes.emptyFailed', 'No failed scene evidence')
  return t('dashboard.providerRegistry.scenes.emptyFiltered', 'No scenes match this filter')
})

// At 1280px the table area is 976px: the fixed columns take 512px and leave the
// route column about 464px. Strategy, fallback, required capabilities, the
// bindings and the latest run's detail live in the drawer.
const routeColumns = computed<DataTableColumn<SceneRegistryRecord>[]>(() => [
  { key: 'route', title: t('dashboard.providerRegistry.table.route', 'Route') },
  { key: 'status', title: t('dashboard.providerRegistry.fields.enabled', 'Enabled'), width: 88 },
  { key: 'readiness', title: t('dashboard.providerRegistry.table.readiness', 'Readiness'), width: 188 },
  { key: 'latestRun', title: t('dashboard.providerRegistry.table.latestRun', 'Latest run'), width: 124 },
  { key: 'actions', title: t('dashboard.providerRegistry.table.actions', 'Actions'), width: 112, align: 'right' },
])

const capabilityColumns = computed<DataTableColumn<ProviderCapabilityRecord>[]>(() => [
  { key: 'capability', title: t('dashboard.providerRegistry.fields.capability', 'Capability') },
  { key: 'provider', title: t('dashboard.providerRegistry.fields.provider', 'Provider'), width: 200 },
  { key: 'metering', title: t('dashboard.providerRegistry.fields.meteringUnit', 'Metering unit'), width: 120 },
  { key: 'adapter', title: t('dashboard.providerRegistry.table.adapter', 'Adapter'), width: 152 },
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

function routeSecondary(scene: SceneRegistryRecord): string {
  return `${scene.id} · ${valueLabel(scene.owner)}`
}

function missingCount(scene: SceneRegistryRecord): number {
  return scene.readiness?.missingCapabilities.length ?? 0
}

function latestRunStatus(scene: SceneRegistryRecord) {
  return admin.getSceneObservability(scene.id).status
}

function latestRunLabel(scene: SceneRegistryRecord): string {
  const status = latestRunStatus(scene)
  return status === 'unknown'
    ? t('dashboard.providerRegistry.values.unknown', 'Unknown')
    : valueLabel(status)
}

function meteringUnit(capability: ProviderCapabilityRecord): string {
  const unit = capability.metering?.unit
  return typeof unit === 'string' && unit.trim() ? unit : ADMIN_FORMAT_EMPTY
}

function adapterBadge(capability: ProviderCapabilityRecord): { text: string, status: 'success' | 'warning' | 'muted' } {
  if (!capability.adapter)
    return { text: t('dashboard.providerRegistry.adapter.unknown', 'adapter unknown'), status: 'muted' }
  return capability.adapter.ready
    ? { text: t('dashboard.providerRegistry.adapter.ready', 'adapter ready'), status: 'success' }
    : { text: t('dashboard.providerRegistry.adapter.missing', 'adapter missing'), status: 'warning' }
}

const detailScene = ref<SceneRegistryRecord | null>(null)
const detailOpen = ref(false)
const detailSections = computed(() => {
  const scene = detailScene.value
  if (!scene)
    return []
  return buildRouteDetailSections(scene, {
    observability: admin.getSceneObservability(scene.id),
    hint: admin.getSceneObservabilityActionHint(scene.id),
  }, { t, format, providerName })
})

function openDetail(scene: SceneRegistryRecord) {
  detailScene.value = scene
  detailOpen.value = true
}

watch(() => admin.scenes.value, (scenes) => {
  const current = detailScene.value
  if (current)
    detailScene.value = scenes.find(scene => scene.id === current.id) ?? current
})

defineExpose({
  refresh: () => Promise.resolve(),
})
</script>

<template>
  <div class="RegistryTab">
    <AdminFilterBar :active="routes.hasActiveFilters.value" @clear="routes.clearFilters()">
      <AdminFilterField :label="t('dashboard.providerRegistry.filters.latestRunLabel', 'Latest run')">
        <TxSelect v-model="routeFilters.status" :options="statusOptions" />
      </AdminFilterField>
    </AdminFilterBar>

    <AdminSection :padded="false">
      <AdminTable
        :columns="routeColumns"
        :rows="routes.rows.value"
        row-key="id"
        :loading="admin.registry.loading.value"
        :refreshing="admin.registry.refreshing.value"
        :error="admin.registryLoadError.value"
        :empty-title="t('dashboard.providerRegistry.routes.empty', 'No capability routes yet.')"
        :filtered-empty-title="routeFilteredEmptyTitle"
        :filtered="routes.hasActiveFilters.value"
        :page="routes.page.value"
        :limit="routes.limit.value"
        :total="routes.total.value"
        :page-sizes="routes.pageSizes"
        table-layout="fixed"
        clickable-rows
        @retry="admin.refresh()"
        @clear-filters="routes.clearFilters()"
        @update:page="routes.setPage"
        @update:limit="routes.setLimit"
        @row-click="openDetail"
      >
        <template #cell-route="{ row }">
          <span class="RegistryCell" :title="`${row.displayName} · ${routeSecondary(row)}`">
            {{ row.displayName }}<span class="RegistryCell-Secondary">{{ routeSecondary(row) }}</span>
          </span>
        </template>
        <template #cell-status="{ row }">
          <!-- Controls in a clickable row: a click (Enter and Space click too) stops here. -->
          <span class="RegistryLine is-control" @click.stop>
            <TxSwitch
              :model-value="row.status === 'enabled'"
              :disabled="admin.actionPending.value !== null"
              size="small"
              :title="valueLabel(row.status)"
              :aria-label="t('dashboard.providerRegistry.routes.statusSwitchLabel', { scene: row.displayName }, `Toggle ${row.displayName}`)"
              @change="(enabled: boolean) => emit('toggleStatus', row, enabled)"
            />
          </span>
        </template>
        <template #cell-readiness="{ row }">
          <span class="RegistryLine" :title="row.readiness?.missingCapabilities.join(', ') || undefined">
            <template v-if="row.readiness">
              <TxStatusBadge :text="readinessLabel(row.readiness.status, t)" :status="readinessTone(row.readiness.status)" size="sm" />
              <span v-if="missingCount(row)" class="RegistryCell is-muted">
                {{ t('dashboard.providerRegistry.routes.missingCount', { count: format.number(missingCount(row)) }, `${missingCount(row)} missing`) }}
              </span>
            </template>
            <span v-else class="RegistryCell is-muted">{{ ADMIN_FORMAT_EMPTY }}</span>
          </span>
        </template>
        <template #cell-latestRun="{ row }">
          <span class="RegistryLine">
            <TxStatusBadge :text="latestRunLabel(row)" :status="admin.observabilityTone(latestRunStatus(row))" size="sm" />
          </span>
        </template>
        <template #cell-actions="{ row }">
          <span class="RegistryActions" @click.stop>
            <TxIconButton
              size="xs"
              icon="i-carbon-play"
              :disabled="admin.actionPending.value !== null"
              :title="t('dashboard.providerRegistry.actions.run', 'Run')"
              :label="t('dashboard.providerRegistry.actions.run', 'Run')"
              @click="emit('run', row)"
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

    <AdminSection :title="t('dashboard.providerRegistry.capabilities.indexTitle', 'Capability index')" :padded="false">
      <AdminTable
        :columns="capabilityColumns"
        :rows="capabilities.rows.value"
        row-key="id"
        :loading="admin.registry.loading.value"
        :refreshing="admin.registry.refreshing.value"
        :error="admin.registryLoadError.value"
        :empty-title="t('dashboard.providerRegistry.capabilities.empty', 'No capabilities declared yet.')"
        :page="capabilities.page.value"
        :limit="capabilities.limit.value"
        :total="capabilities.total.value"
        :page-sizes="capabilities.pageSizes"
        table-layout="fixed"
        @retry="admin.refresh()"
        @update:page="capabilities.setPage"
        @update:limit="capabilities.setLimit"
      >
        <template #cell-capability="{ row }">
          <span class="RegistryCell" :title="`${row.capability} · ${row.id}`">
            {{ row.capability }}<span class="RegistryCell-Secondary">{{ row.id }}</span>
          </span>
        </template>
        <template #cell-provider="{ row }">
          <span class="RegistryCell" :title="providerName(row.providerId)">{{ providerName(row.providerId) }}</span>
        </template>
        <template #cell-metering="{ row }">
          <span class="RegistryCell is-muted">{{ meteringUnit(row) }}</span>
        </template>
        <template #cell-adapter="{ row }">
          <span class="RegistryLine" :title="row.adapter ? adapterReasonLabel(row.adapter.reason, t) : undefined">
            <TxStatusBadge :text="adapterBadge(row).text" :status="adapterBadge(row).status" size="sm" />
          </span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer v-model:visible="detailOpen" :title="detailScene?.displayName || t('dashboard.providerRegistry.detail.routeTitle', 'Capability route')" size="520px">
      <ProviderRegistryDetailView v-if="detailScene" :sections="detailSections" />
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

.RegistryCell.is-muted,
.RegistryCell-Secondary {
  color: var(--tx-text-color-regular);
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

/* A switch's focus ring sits 2px outside it: a control cell does not clip. */
.RegistryLine.is-control {
  overflow: visible;
}

.RegistryActions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  height: 1lh;
  align-items: center;
}
</style>
