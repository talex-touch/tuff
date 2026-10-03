<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { AdminAuditEntry } from '~/utils/admin-audits'
import { TxButton, TxCopyButton } from '@talex-touch/tuffex/button'
import { TxDescriptions, TxDescriptionsItem } from '@talex-touch/tuffex/descriptions'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxTag } from '@talex-touch/tuffex/tag'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminFilterField from '~/components/admin/AdminFilterField.vue'
import AdminIdentity from '~/components/admin/AdminIdentity.vue'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import {
  auditSummaryText,
  buildAuditActionLabels,
  buildAuditActionOptions,
  buildAuditExportUrl,
  createAuditListOptions,
  formatAuditMetadata,
  summarizeAudit,
} from '~/utils/admin-audits'
import { requestJson } from '~/utils/request'

definePageMeta({
  layout: 'admin',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

// The administrator gate is the layout's (`useAdminGate`): this page only mounts
// for an administrator, so it neither checks the role nor asks for data it
// cannot have.
const { t } = useI18n()
const format = useAdminFormat()

const actionLabels = computed(() => buildAuditActionLabels(t))
const actionOptions = computed(() => buildAuditActionOptions(t, actionLabels.value))

const list = useAdminList(createAuditListOptions(requestJson, t))
const filters = list.filters

const columns = computed<DataTableColumn<AdminAuditEntry>[]>(() => [
  { key: 'time', title: t('dashboard.sections.audits.table.time', 'Time'), width: 148 },
  { key: 'admin', title: t('dashboard.sections.audits.table.admin', 'Admin'), width: 220 },
  { key: 'action', title: t('dashboard.sections.audits.table.action', 'Action'), width: 150 },
  { key: 'target', title: t('dashboard.sections.audits.table.target', 'Target'), width: 220 },
  { key: 'summary', title: t('dashboard.sections.audits.table.summary', 'Summary') },
])

function actionLabel(action: string): string {
  return actionLabels.value[action] ?? action
}

function rowSummary(entry: AdminAuditEntry): string {
  return auditSummaryText(summarizeAudit(entry, { labels: actionLabels.value, formatDate: format.date }))
}

function targetTitle(entry: AdminAuditEntry): string {
  return [entry.targetLabel || entry.targetId, entry.targetType].filter(Boolean).join(' · ')
}

/** `targetType` / `adminUserId` arrive by URL from other pages; they show as removable chips. */
const linkedFilterChips = computed(() => {
  const applied = list.appliedFilters.value
  const chips: Array<{ key: 'targetType' | 'adminUserId', label: string }> = []
  if (applied.targetType)
    chips.push({ key: 'targetType', label: t('dashboard.sections.audits.filters.targetTypeChip', { value: applied.targetType }) })
  if (applied.adminUserId)
    chips.push({ key: 'adminUserId', label: t('dashboard.sections.audits.filters.adminUserChip', { value: applied.adminUserId }) })
  return chips
})

const detailEntry = ref<AdminAuditEntry | null>(null)
const detailOpen = ref(false)
const detailMetadata = computed(() => formatAuditMetadata(detailEntry.value?.metadata ?? null))

function openDetail(entry: AdminAuditEntry) {
  detailEntry.value = entry
  detailOpen.value = true
}

const exporting = ref(false)

function exportAudits() {
  if (exporting.value || !hasWindow())
    return
  exporting.value = true
  window.open(buildAuditExportUrl(list.appliedFilters.value), '_blank')
  setTimeout(() => {
    exporting.value = false
  }, 300)
}
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.adminAudits', 'Admin Action Audits')">
    <template #actions>
      <TxButton variant="secondary" size="sm" :disabled="list.loading.value || list.refreshing.value" @click="list.refresh()">
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
      <TxButton variant="secondary" size="sm" :disabled="exporting" @click="exportAudits">
        {{ exporting ? t('dashboard.sections.audits.export.exporting', 'Exporting...') : t('dashboard.sections.audits.export.label', 'Export CSV') }}
      </TxButton>
    </template>

    <template #filters>
      <AdminFilterBar :active="list.hasActiveFilters.value" @clear="list.clearFilters()">
        <AdminFilterField :label="t('dashboard.sections.audits.filters.searchLabel', 'Search')" for="admin-audit-search" wide>
          <TxSearchInput
            id="admin-audit-search"
            v-model="filters.q"
            autocomplete="off"
            :placeholder="t('dashboard.sections.audits.filters.searchPlaceholder', 'Search by admin or target')"
          />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.audits.filters.actionLabel', 'Action')">
          <TxSelect v-model="filters.action" :options="actionOptions" />
        </AdminFilterField>
        <template #trailing>
          <TxTag
            v-for="chip in linkedFilterChips"
            :key="chip.key"
            :label="chip.label"
            size="md"
            variant="soft"
            closable
            :close-aria-label="t('dashboard.sections.audits.filters.removeFilter', 'Remove filter')"
            @close="filters[chip.key] = ''"
          />
        </template>
      </AdminFilterBar>
    </template>

    <AdminSection :padded="false">
      <AdminTable
        :columns="columns"
        :rows="list.rows.value"
        row-key="id"
        :loading="list.loading.value"
        :refreshing="list.refreshing.value"
        :error="list.error.value"
        :empty-title="t('dashboard.sections.audits.empty', 'No audit records found.')"
        :filtered-empty-title="t('dashboard.sections.audits.filteredEmpty', 'No audit records match these filters.')"
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
        <template #cell-time="{ row }">
          <span class="AuditCell is-numeric" :title="format.dateTimeTitle(row.createdAt)">{{ format.tableDateTime(row.createdAt) }}</span>
        </template>
        <template #cell-admin="{ row }">
          <AdminIdentity :name="row.adminName" :email="row.adminEmail" :fallback="row.adminUserId" size="sm" compact />
        </template>
        <template #cell-action="{ row }">
          <span class="AuditCell" :title="`${actionLabel(row.action)} · ${row.action}`">{{ actionLabel(row.action) }}</span>
        </template>
        <template #cell-target="{ row }">
          <span class="AuditTarget" :title="targetTitle(row)">
            <span class="AuditTarget-Label">{{ row.targetLabel || row.targetId || '—' }}</span>
            <span v-if="row.targetType" class="AuditTarget-Type">{{ row.targetType }}</span>
          </span>
        </template>
        <template #cell-summary="{ row }">
          <span class="AuditCell is-muted" :title="rowSummary(row)">{{ rowSummary(row) }}</span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer v-model:visible="detailOpen" :title="t('dashboard.sections.audits.detail.title', 'Audit record')" size="520px">
      <div v-if="detailEntry" class="AuditDetail">
        <TxDescriptions :columns="1" size="sm">
          <TxDescriptionsItem :label="t('dashboard.sections.audits.detail.time', 'Time')">
            {{ format.dateTimeTitle(detailEntry.createdAt) }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.audits.detail.admin', 'Admin')">
            <AdminIdentity :name="detailEntry.adminName" :email="detailEntry.adminEmail" :fallback="detailEntry.adminUserId" size="sm" />
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.audits.detail.adminId', 'Admin ID')">
            <code class="AuditDetail-Inline">{{ detailEntry.adminUserId }}</code>
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.audits.detail.action', 'Action')">
            {{ actionLabel(detailEntry.action) }}
            <code class="AuditDetail-Inline">{{ detailEntry.action }}</code>
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.audits.detail.targetType', 'Target type')">
            {{ detailEntry.targetType }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.audits.detail.targetId', 'Target ID')">
            <code v-if="detailEntry.targetId" class="AuditDetail-Inline">{{ detailEntry.targetId }}</code>
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.audits.detail.targetLabel', 'Target')">
            {{ detailEntry.targetLabel }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.audits.detail.ip', 'IP address')">
            {{ detailEntry.ip }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.audits.detail.userAgent', 'User agent')">
            {{ detailEntry.userAgent }}
          </TxDescriptionsItem>
        </TxDescriptions>

        <div class="AuditDetail-Metadata">
          <div class="AuditDetail-MetadataHeader">
            <h3 class="AuditDetail-MetadataTitle">
              {{ t('dashboard.sections.audits.detail.metadata', 'Metadata') }}
            </h3>
            <TxCopyButton
              v-if="detailMetadata"
              :text="detailMetadata"
              :copy-label="t('dashboard.sections.adminKit.copy', 'Copy')"
              :copied-label="t('dashboard.sections.adminKit.copied', 'Copied')"
            />
          </div>
          <pre v-if="detailMetadata" class="AuditDetail-Code">{{ detailMetadata }}</pre>
          <p v-else class="AuditDetail-Empty">
            {{ t('dashboard.sections.audits.detail.noMetadata', 'No metadata was recorded for this action.') }}
          </p>
        </div>
      </div>
    </TxDrawer>
  </AdminPageShell>
</template>

<style scoped>
/* Every cell is one line: what does not fit is cut with an ellipsis and shown in
   full in the cell's title and in the detail drawer. The table is `fixed`, so a
   long value can no longer widen its column and push the summary off screen. */
.AuditCell,
.AuditTarget {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.AuditCell {
  color: var(--tx-text-color-primary);
}

.AuditCell.is-numeric {
  font-variant-numeric: tabular-nums;
}

.AuditCell.is-muted,
.AuditTarget-Type {
  color: var(--tx-text-color-regular);
}

.AuditTarget-Label {
  color: var(--tx-text-color-primary);
}

.AuditTarget-Type::before {
  content: ' · ';
}

.AuditDetail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.AuditDetail-Inline {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--tx-fill-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.AuditDetail-Metadata {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.AuditDetail-MetadataHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.AuditDetail-MetadataTitle {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.AuditDetail-Code {
  margin: 0;
  max-height: 420px;
  overflow: auto;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
}

.AuditDetail-Empty {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 13px;
}
</style>
