<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { IntelligenceAuditEntry } from '~/utils/admin-intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDescriptions, TxDescriptionsItem } from '@talex-touch/tuffex/descriptions'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, ref } from 'vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminFilterField from '~/components/admin/AdminFilterField.vue'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import { ADMIN_FORMAT_EMPTY, useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import {
  auditHttpStatus,
  auditProviderName,
  auditResponseSnippet,
  auditResultBadgeText,
  auditResultLabel,
  auditResultTitle,
  buildAuditMetadataEntries,
  buildIntelligenceProviderTypeLabels,
  createIntelligenceAuditListOptions,
  formatIntelligenceLatency,
  intelligenceProviderTypeLabel,
} from '~/utils/admin-intelligence'
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
// cannot have. AdminPageShell is the single template root (no root comment
// either; see test/guards/page-single-root.test.ts).
const { t } = useI18n()
const format = useAdminFormat()

const list = useAdminList(createIntelligenceAuditListOptions(requestJson, t))
const filters = list.filters

const typeLabels = computed(() => buildIntelligenceProviderTypeLabels(t))

// Every cell is one line. At 1280px the table area is 976px and the fixed
// columns take 724px, which leaves the provider column 252px; whatever does not
// fit is cut and shown in full in the cell's title and in the drawer.
const columns = computed<DataTableColumn<IntelligenceAuditEntry>[]>(() => [
  { key: 'time', title: t('dashboard.sections.intelligence.audit.table.time', 'Time'), width: 148 },
  { key: 'provider', title: t('dashboard.sections.intelligence.audit.table.provider', 'Provider / Model') },
  { key: 'result', title: t('dashboard.sections.intelligence.audit.table.result', 'Result'), width: 120 },
  { key: 'latency', title: t('dashboard.sections.intelligence.audit.fields.latency', 'Latency'), width: 96, align: 'right' },
  { key: 'endpoint', title: t('dashboard.sections.intelligence.audit.fields.endpoint', 'Endpoint'), width: 200 },
  { key: 'trace', title: t('dashboard.sections.intelligence.audit.fields.trace', 'Trace'), width: 160 },
])

function providerName(entry: IntelligenceAuditEntry): string {
  return auditProviderName(entry, typeLabels.value)
}

function providerTitle(entry: IntelligenceAuditEntry): string {
  return [providerName(entry), entry.model].filter(Boolean).join(' · ')
}

function typeLabel(type: string): string {
  return intelligenceProviderTypeLabel(type, typeLabels.value)
}

function latency(entry: IntelligenceAuditEntry): string {
  return formatIntelligenceLatency(entry.latency, format, t)
}

const detailEntry = ref<IntelligenceAuditEntry | null>(null)
const detailOpen = ref(false)
const detailMetadata = computed(() => buildAuditMetadataEntries(detailEntry.value?.metadata, format, t))
const detailSnippet = computed(() => auditResponseSnippet(detailEntry.value?.metadata))

function openDetail(entry: IntelligenceAuditEntry) {
  detailEntry.value = entry
  detailOpen.value = true
}
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.intelligenceAudits', 'AI Call Audits')">
    <template #actions>
      <TxButton variant="secondary" size="sm" :disabled="list.loading.value || list.refreshing.value" @click="list.refresh()">
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
    </template>

    <template #filters>
      <AdminFilterBar :active="list.hasActiveFilters.value" @clear="list.clearFilters()">
        <AdminFilterField :label="t('dashboard.sections.intelligence.audit.filters.userId', 'User ID')" for="admin-ai-audit-user">
          <TxSearchInput
            id="admin-ai-audit-user"
            v-model="filters.userId"
            autocomplete="off"
            :placeholder="t('dashboard.sections.intelligence.audit.userFilter', 'Filter by user ID')"
          />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.intelligence.audit.filters.providerId', 'Provider ID')" for="admin-ai-audit-provider">
          <TxSearchInput
            id="admin-ai-audit-provider"
            v-model="filters.providerId"
            autocomplete="off"
            :placeholder="t('dashboard.sections.intelligence.audit.providerFilter', 'Filter by provider ID')"
          />
        </AdminFilterField>
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
        :empty-title="t('dashboard.sections.intelligence.audit.empty', 'No AI calls recorded yet.')"
        :filtered-empty-title="t('dashboard.sections.intelligence.audit.filteredEmpty', 'No calls match these filters.')"
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
          <span class="CallCell is-numeric" :title="format.dateTimeTitle(row.createdAt)">{{ format.tableDateTime(row.createdAt) }}</span>
        </template>
        <template #cell-provider="{ row }">
          <span class="CallCell" :title="providerTitle(row)">
            {{ providerName(row) }}<span v-if="row.model" class="CallCell-Model">{{ row.model }}</span>
          </span>
        </template>
        <template #cell-result="{ row }">
          <span class="CallLine" :title="auditResultTitle(row, t)">
            <TxStatusBadge
              :text="auditResultBadgeText(row, t)"
              :status="row.success ? 'success' : 'danger'"
              size="sm"
              :aria-label="auditResultTitle(row, t)"
            />
          </span>
        </template>
        <template #cell-latency="{ row }">
          <span class="CallCell is-numeric">{{ latency(row) }}</span>
        </template>
        <template #cell-endpoint="{ row }">
          <span class="CallCell is-muted" :title="row.endpoint || undefined">{{ row.endpoint || ADMIN_FORMAT_EMPTY }}</span>
        </template>
        <template #cell-trace="{ row }">
          <span class="CallCell is-mono" :title="row.traceId || undefined">{{ row.traceId || ADMIN_FORMAT_EMPTY }}</span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer v-model:visible="detailOpen" :title="t('dashboard.sections.intelligence.audit.detail.title', 'AI Call')" size="520px">
      <div v-if="detailEntry" class="CallDetail">
        <TxDescriptions :columns="1" size="sm">
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.time', 'Time')">
            {{ format.dateTimeTitle(detailEntry.createdAt) }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.provider', 'Provider')">
            {{ detailEntry.providerName }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.providerType', 'Type')">
            {{ typeLabel(detailEntry.providerType) }}
            <code v-if="detailEntry.providerType && typeLabel(detailEntry.providerType) !== detailEntry.providerType" class="CallDetail-Inline">{{ detailEntry.providerType }}</code>
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.providerId', 'Provider ID')">
            <code v-if="detailEntry.providerId" class="CallDetail-Inline">{{ detailEntry.providerId }}</code>
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.model', 'Model')">
            {{ detailEntry.model }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.userId', 'User ID')">
            <code v-if="detailEntry.userId" class="CallDetail-Inline">{{ detailEntry.userId }}</code>
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.endpoint', 'Endpoint')">
            <span v-if="detailEntry.endpoint" class="CallDetail-Text">{{ detailEntry.endpoint }}</span>
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.result', 'Result')">
            <span class="CallLine">
              <TxStatusBadge :text="auditResultLabel(detailEntry, t)" :status="detailEntry.success ? 'success' : 'danger'" size="sm" />
              <span v-if="auditHttpStatus(detailEntry, t)" class="CallDetail-Status">{{ auditHttpStatus(detailEntry, t) }}</span>
            </span>
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.latency', 'Latency')">
            {{ latency(detailEntry) }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.intelligence.audit.detail.traceId', 'Trace ID')">
            <code v-if="detailEntry.traceId" class="CallDetail-Inline">{{ detailEntry.traceId }}</code>
          </TxDescriptionsItem>
          <TxDescriptionsItem v-if="detailEntry.errorMessage" :label="t('dashboard.sections.intelligence.audit.detail.error', 'Error')">
            <span class="CallDetail-Text is-danger">{{ detailEntry.errorMessage }}</span>
          </TxDescriptionsItem>
        </TxDescriptions>

        <section class="CallDetail-Group">
          <h3 class="CallDetail-GroupTitle">
            {{ t('dashboard.sections.intelligence.audit.detail.metadata', 'Metadata') }}
          </h3>
          <TxDescriptions v-if="detailMetadata.length" :columns="1" size="sm">
            <TxDescriptionsItem v-for="entry in detailMetadata" :key="entry.key" :label="entry.label">
              <span class="CallDetail-Lines">
                <span v-for="(line, index) in entry.lines" :key="index" class="CallDetail-Text">{{ line }}</span>
              </span>
            </TxDescriptionsItem>
          </TxDescriptions>
          <p v-else class="CallDetail-Empty">
            {{ t('dashboard.sections.intelligence.audit.detail.noMetadata', 'No metadata was recorded for this call.') }}
          </p>
        </section>

        <section v-if="detailSnippet" class="CallDetail-Group">
          <h3 class="CallDetail-GroupTitle">
            {{ t('dashboard.sections.intelligence.audit.fields.responseSnippet', 'Response Snippet') }}
          </h3>
          <pre class="CallDetail-Code">{{ detailSnippet }}</pre>
        </section>
      </div>
    </TxDrawer>
  </AdminPageShell>
</template>

<style scoped>
/* Every cell is one line: what does not fit is cut with an ellipsis and shown in
   full in the cell's title and in the drawer. The table is `fixed`, so a long
   endpoint or trace can never widen its column and push the table sideways. */
.CallCell {
  display: block;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.CallCell.is-numeric {
  font-variant-numeric: tabular-nums;
}

.CallCell.is-muted,
.CallCell-Model {
  color: var(--tx-text-color-regular);
}

.CallCell.is-mono {
  color: var(--tx-text-color-regular);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.CallCell-Model::before {
  content: ' · ';
}

/* A badge cell is one line box tall, like a text cell: the 23px badge overhangs
   into the cell padding rather than making the row taller. */
.CallLine {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 1lh;
  min-width: 0;
  white-space: nowrap;
}

.CallDetail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.CallDetail-Inline {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--tx-fill-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.CallDetail-Text {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.CallDetail-Text.is-danger {
  color: var(--tx-color-danger);
}

.CallDetail-Lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.CallDetail-Status {
  color: var(--tx-text-color-regular);
  font-variant-numeric: tabular-nums;
}

.CallDetail-Group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.CallDetail-GroupTitle {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.CallDetail-Code {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.CallDetail-Empty {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 13px;
}
</style>
