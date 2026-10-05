<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { TxSelectModelValue } from '@talex-touch/tuffex/select'
import type {
  IntelligenceAuditLogEntry,
  ModelPricing,
  UsageInsights
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type { AuditExportFormat } from './audit-export'
import type { AuditRecordWindow, AuditStatusFilter } from './useAuditRecords'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDataTable } from '@talex-touch/tuffex/data-table'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { TxSelect, TxSelectItem } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, inject, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InsightsNotice from '~/components/settings/insights/InsightsNotice.vue'
import {
  formatCompact,
  formatInteger,
  formatLatency,
  formatRecordTime,
  formatRetention
} from './audit-format'
import AuditRecordDetail from './AuditRecordDetail.vue'
import { useAuditLabels } from './useAuditLabels'
import { useAuditRecordContext } from './useAuditRecordContext'
import {
  AUDIT_FILTER_ANY,
  AUDIT_FILTER_NO_CALLER,
  AUDIT_RECORDS_KEY,
  AUDIT_RECORDS_PAGE_SIZE
} from './useAuditRecords'

/**
 * The call records behind the page's numbers (parent PRD R-D6): filtered by status, channel,
 * caller and capability, paged by the host with the filtered total, a row opened below the table
 * with its trace and context, and every matching row exportable — not just the page on screen.
 *
 * The list is the page's (`useAuditRecords`, provided under `AUDIT_RECORDS_KEY`) so the ⋯ menu's
 * export reads the same filters.
 */
defineOptions({ name: 'AuditRecordsDrawer' })

const props = defineProps<{
  /** The page's window when the drawer opens; the list covers it. */
  recordWindow: AuditRecordWindow | null
  /** For filter options (what the window's detail rows contain) and per-model pricing. */
  insights?: UsageInsights | null
  /** Whether call records are being kept right now. */
  auditEnabled: boolean
}>()

const visible = defineModel<boolean>('visible', { default: false })

const emit = defineEmits<{
  /** Exporting is the page's: the menu runs the same path, with the same toasts. */
  export: [format: AuditExportFormat]
}>()

function missingRecords(): never {
  throw new Error('AuditRecordsDrawer needs the page to provide AUDIT_RECORDS_KEY')
}

const records = inject(AUDIT_RECORDS_KEY) ?? missingRecords()
const {
  filters,
  page,
  rows,
  total,
  loading,
  loadFailed,
  selectedKey,
  selected,
  exporting,
  recordKey
} = records

const { t, locale } = useI18n()
const labels = useAuditLabels()
const context = useAuditRecordContext()

watch(visible, (open) => {
  if (open && props.recordWindow) records.open(props.recordWindow)
})

/* ─── filters ─── */

const statusItems = computed<FilterChipItem[]>(() => [
  { value: 'all', label: t('intelligenceAudit.records.statusAll') },
  { value: 'success', label: t('intelligenceAudit.records.statusSuccess') },
  { value: 'failure', label: t('intelligenceAudit.records.statusFailure') }
])

function setStatus(value: FilterChipValue): void {
  if (value === 'all' || value === 'success' || value === 'failure') {
    records.setFilter('status', value as AuditStatusFilter)
  }
}

function selectValue(value: TxSelectModelValue): string {
  return Array.isArray(value) ? '' : String(value ?? '')
}

interface FilterOption {
  value: string
  label: string
}

/** What the window's detail rows contain, plus the current pick if it has dropped out of them. */
function withCurrent(options: FilterOption[], current: string, label: (value: string) => string) {
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: label(current) })
  }
  return options
}

const channelOptions = computed(() =>
  withCurrent(
    (props.insights?.breakdown.channel ?? []).map((row) => ({
      value: row.key,
      label: labels.channel(row.key).name
    })),
    filters.providerId,
    (value) => labels.channel(value).name
  )
)

/**
 * Callers as the query can filter them: by the whole stored id. Rows without a caller are one
 * option — the query cannot split them by operation the way the breakdown does.
 */
const callerOptions = computed(() => {
  const options: FilterOption[] = []
  let hasNone = false
  for (const row of props.insights?.breakdown.caller ?? []) {
    if (row.key === '') {
      hasNone = true
      continue
    }
    if (!options.some((option) => option.value === row.key)) {
      options.push({ value: row.key, label: labels.caller(row.key).label })
    }
  }
  if (hasNone || filters.caller === AUDIT_FILTER_NO_CALLER) {
    options.push({
      value: AUDIT_FILTER_NO_CALLER,
      label: t('intelligenceAudit.records.callerNone')
    })
  }
  return withCurrent(options, filters.caller, (value) => labels.caller(value).label)
})

const capabilityOptions = computed(() =>
  withCurrent(
    (props.insights?.breakdown.capability ?? []).map((row) => ({
      value: row.key,
      label: labels.capability(row.key)
    })),
    filters.capabilityId,
    (value) => labels.capability(value)
  )
)

/* ─── table ─── */

const columns = computed<DataTableColumn<IntelligenceAuditLogEntry>[]>(() => [
  {
    key: 'timestamp',
    title: t('intelligenceAudit.records.columns.time'),
    width: 128,
    nowrap: true
  },
  {
    key: 'capabilityId',
    title: t('intelligenceAudit.records.columns.capability'),
    width: 112,
    nowrap: true
  },
  { key: 'provider', title: t('intelligenceAudit.records.columns.channelModel'), auto: true },
  { key: 'caller', title: t('intelligenceAudit.records.columns.caller'), width: 124, nowrap: true },
  {
    key: 'tokens',
    title: t('intelligenceAudit.records.columns.tokens'),
    width: 76,
    align: 'right',
    nowrap: true
  },
  {
    key: 'latency',
    title: t('intelligenceAudit.records.columns.latency'),
    width: 76,
    align: 'right',
    nowrap: true
  },
  { key: 'success', title: t('intelligenceAudit.records.columns.status'), width: 80, nowrap: true }
])

function callerLabel(row: IntelligenceAuditLogEntry): string {
  const operation = typeof row.metadata?.operation === 'string' ? row.metadata.operation : null
  return labels.caller(row.caller ?? '', operation).label
}

function onRowClick(payload: { row: IntelligenceAuditLogEntry; index: number }): void {
  records.toggleRow(recordKey(payload.row, payload.index))
}

/** Model pricing as the breakdown resolved it for this window, by channel and model. */
const pricingByModel = computed(() => {
  const map = new Map<string, ModelPricing>()
  for (const row of props.insights?.breakdown.model ?? []) {
    map.set(JSON.stringify([row.providerId, row.model]), row.pricing)
  }
  return map
})

const selectedPricing = computed(() => {
  const row = selected.value
  return row ? (pricingByModel.value.get(JSON.stringify([row.provider, row.model])) ?? null) : null
})

const detailPanel = ref<HTMLElement | null>(null)

watch(selected, async (row) => {
  if (!row) return
  void context.loadForTrace(row.traceId)
  await nextTick()
  const panel = detailPanel.value
  // jsdom has no layout and no scrolling.
  if (!panel || typeof panel.scrollIntoView !== 'function') return
  panel.scrollIntoView({
    block: 'nearest',
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  })
})

/* ─── header lines ─── */

const rangeLabel = computed(() => {
  const range = props.recordWindow?.range
  if (range === 'today') return t('intelligenceAudit.range.today')
  if (range === '7d') return t('intelligenceAudit.range.last7Days')
  return t('intelligenceAudit.range.last30Days')
})

/** The window reaches past what retention keeps: say so, so a short list is not read as quiet. */
const retentionHint = computed(() => {
  const retentionMs = props.insights?.audit.retentionMs
  const current = records.listWindow.value
  if (retentionMs === null || retentionMs === undefined || !current) return ''
  if (current.endMs - current.startMs <= retentionMs) return ''
  return t('intelligenceAudit.records.retentionHint', {
    retention: formatRetention(retentionMs, t, locale.value)
  })
})

const exportProgress = computed(() => {
  const state = exporting.value
  if (!state) return ''
  return state.total > 0
    ? t('intelligenceAudit.notices.exporting', {
        fetched: formatInteger(state.fetched, locale.value),
        total: formatInteger(state.total, locale.value)
      })
    : t('intelligenceAudit.notices.exportStarting')
})
</script>

<template>
  <TxDrawer
    v-model:visible="visible"
    :title="t('intelligenceAudit.records.title')"
    size="840px"
    data-testid="audit-records-drawer"
  >
    <div class="AuditRecords">
      <p class="AuditRecords-Summary" data-testid="audit-records-summary">
        {{
          t(
            'intelligenceAudit.records.summary',
            { range: rangeLabel, total: formatInteger(total, locale) },
            total
          )
        }}
      </p>

      <div
        class="AuditRecords-Filters"
        role="group"
        :aria-label="t('intelligenceAudit.records.filtersLabel')"
      >
        <TxFilterChips
          :model-value="filters.status"
          :items="statusItems"
          :aria-label="t('intelligenceAudit.records.status')"
          data-testid="audit-records-status"
          @update:model-value="setStatus"
        />
        <label class="AuditRecords-Filter">
          <span class="AuditRecords-SrOnly">{{ t('intelligenceAudit.records.channel') }}</span>
          <TxSelect
            :model-value="filters.providerId"
            class="AuditRecords-Select"
            :dropdown-max-height="280"
            data-testid="audit-records-channel"
            @update:model-value="records.setFilter('providerId', selectValue($event))"
          >
            <TxSelectItem
              :value="AUDIT_FILTER_ANY"
              :label="t('intelligenceAudit.records.channelAll')"
            />
            <TxSelectItem
              v-for="option in channelOptions"
              :key="option.value"
              :value="option.value"
              :label="option.label"
            />
          </TxSelect>
        </label>
        <label class="AuditRecords-Filter">
          <span class="AuditRecords-SrOnly">{{ t('intelligenceAudit.records.caller') }}</span>
          <TxSelect
            :model-value="filters.caller"
            class="AuditRecords-Select"
            :dropdown-max-height="280"
            data-testid="audit-records-caller"
            @update:model-value="records.setFilter('caller', selectValue($event))"
          >
            <TxSelectItem
              :value="AUDIT_FILTER_ANY"
              :label="t('intelligenceAudit.records.callerAll')"
            />
            <TxSelectItem
              v-for="option in callerOptions"
              :key="option.value"
              :value="option.value"
              :label="option.label"
            />
          </TxSelect>
        </label>
        <label class="AuditRecords-Filter">
          <span class="AuditRecords-SrOnly">{{ t('intelligenceAudit.records.capability') }}</span>
          <TxSelect
            :model-value="filters.capabilityId"
            class="AuditRecords-Select"
            :dropdown-max-height="280"
            data-testid="audit-records-capability"
            @update:model-value="records.setFilter('capabilityId', selectValue($event))"
          >
            <TxSelectItem
              :value="AUDIT_FILTER_ANY"
              :label="t('intelligenceAudit.records.capabilityAll')"
            />
            <TxSelectItem
              v-for="option in capabilityOptions"
              :key="option.value"
              :value="option.value"
              :label="option.label"
            />
          </TxSelect>
        </label>
      </div>

      <p v-if="!auditEnabled" class="AuditRecords-Hint" data-testid="audit-records-audit-off">
        {{ t('intelligenceAudit.records.auditOff') }}
      </p>
      <p v-if="retentionHint" class="AuditRecords-Hint" data-testid="audit-records-retention">
        {{ retentionHint }}
      </p>

      <InsightsNotice
        v-if="loadFailed"
        tone="error"
        :description="t('intelligenceAudit.records.loadFailed')"
        data-testid="audit-records-error"
      >
        <template #action>
          <TxButton variant="flat" size="sm" :loading="loading" @click="records.loadPage()">
            {{ t('intelligenceAudit.actions.retry') }}
          </TxButton>
        </template>
      </InsightsNotice>

      <TxDataTable
        class="AuditRecords-Table"
        :columns="columns"
        :data="rows"
        :row-key="recordKey"
        :loading="loading"
        table-layout="fixed"
        highlight-selected
        :selected-keys="selectedKey ? [selectedKey] : []"
        data-testid="audit-records-table"
        @row-click="onRowClick"
      >
        <!-- Our own empty state: the table's default adds TuffEx's English "No data available yet." -->
        <template #empty>
          <TxEmptyState
            variant="no-data"
            size="small"
            layout="vertical"
            :title="t('intelligenceAudit.records.empty')"
            description=""
            data-testid="audit-records-empty"
          />
        </template>
        <template #cell-timestamp="{ row }">
          <span class="AuditRecords-Muted">{{ formatRecordTime(row.timestamp, locale) }}</span>
        </template>
        <template #cell-capabilityId="{ row }">
          <span class="AuditRecords-Ellipsis" :title="row.capabilityId">
            {{ labels.capability(row.capabilityId) }}
          </span>
        </template>
        <template #cell-provider="{ row }">
          <span
            class="AuditRecords-ChannelModel"
            :title="`${labels.channel(row.provider).name} · ${row.model}`"
          >
            <span class="AuditRecords-Channel">{{ labels.channel(row.provider).name }}</span>
            <span class="AuditRecords-Separator" aria-hidden="true">·</span>
            <span class="AuditRecords-Model">{{ row.model }}</span>
          </span>
        </template>
        <template #cell-caller="{ row }">
          <span class="AuditRecords-Ellipsis" :title="row.caller || callerLabel(row)">
            {{ callerLabel(row) }}
          </span>
        </template>
        <template #cell-tokens="{ row }">
          <span :title="formatInteger(row.usage.totalTokens, locale)">
            {{ formatCompact(row.usage.totalTokens, locale) }}
          </span>
        </template>
        <template #cell-latency="{ row }">
          <span class="AuditRecords-Muted">{{ formatLatency(row.latency, locale) }}</span>
        </template>
        <template #cell-success="{ row }">
          <TxStatusBadge
            size="sm"
            :status="row.success ? 'success' : 'danger'"
            :text="
              row.success
                ? t('intelligenceAudit.records.success')
                : t('intelligenceAudit.records.failure')
            "
            :data-status="row.success ? 'success' : 'failure'"
          />
        </template>
      </TxDataTable>

      <TxPagination
        v-if="total > AUDIT_RECORDS_PAGE_SIZE"
        class="AuditRecords-Pager"
        :current-page="page"
        :page-size="AUDIT_RECORDS_PAGE_SIZE"
        :total="total"
        :aria-label="t('intelligenceAudit.records.pagination')"
        :prev-label="t('intelligenceAudit.records.previous')"
        :next-label="t('intelligenceAudit.records.next')"
        data-testid="audit-records-pagination"
        @update:current-page="records.setPage($event)"
      />

      <section
        v-if="selected"
        ref="detailPanel"
        class="AuditRecords-Detail"
        :aria-label="t('intelligenceAudit.records.detail.title')"
      >
        <AuditRecordDetail
          :record="selected"
          :pricing="selectedPricing"
          :packages="context.packagesByTrace.value[selected.traceId]"
          :packages-loading="context.packagesLoading.value[selected.traceId]"
          :packages-failed="context.packagesFailed.value[selected.traceId]"
          :checkpoints-for="context.checkpointsFor"
          :checkpoints-loading="context.checkpointsLoading.value"
          :checkpoints-failed="context.checkpointsFailed.value"
        />
      </section>

      <footer class="AuditRecords-Footer">
        <p class="AuditRecords-Freshness">{{ t('intelligenceAudit.records.freshness') }}</p>
        <div class="AuditRecords-Export">
          <template v-if="exporting">
            <span
              class="AuditRecords-Progress"
              role="status"
              data-testid="audit-records-export-progress"
            >
              {{ exportProgress }}
            </span>
            <TxButton
              size="sm"
              data-testid="audit-records-export-cancel"
              @click="records.cancelExport()"
            >
              {{ t('intelligenceAudit.actions.cancelExport') }}
            </TxButton>
          </template>
          <template v-else>
            <TxButton
              size="sm"
              :disabled="total === 0"
              data-testid="audit-records-export-csv"
              @click="emit('export', 'csv')"
            >
              {{ t('intelligenceAudit.actions.exportCsv') }}
            </TxButton>
            <TxButton
              size="sm"
              :disabled="total === 0"
              data-testid="audit-records-export-json"
              @click="emit('export', 'json')"
            >
              {{ t('intelligenceAudit.actions.exportJson') }}
            </TxButton>
          </template>
        </div>
      </footer>
    </div>
  </TxDrawer>
</template>

<style scoped lang="scss">
/* The drawer owns the inset; this only spaces its parts. */
.AuditRecords {
  display: grid;
  gap: var(--shell-space-3);
}

.AuditRecords-Summary {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-body);
}

.AuditRecords-Filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--shell-space-2) var(--shell-space-3);
}

.AuditRecords-Filter {
  display: flex;
}

.AuditRecords-Select {
  width: 168px;
}

.AuditRecords-Hint {
  margin: 0;
  padding: var(--shell-space-2) var(--shell-space-3);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.AuditRecords-Table {
  --tx-data-table-row-hover-bg: color-mix(in srgb, var(--shell-text-primary) 5%, transparent);
  --tx-data-table-row-selected-bg: color-mix(in srgb, var(--shell-text-primary) 8%, transparent);

  border: 1px solid var(--shell-border);
  font-variant-numeric: tabular-nums;
}

.AuditRecords-Muted {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
}

.AuditRecords-Ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.AuditRecords-ChannelModel {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--shell-space-1);
}

.AuditRecords-Channel {
  flex: none;
  max-width: 50%;
  overflow: hidden;
  color: var(--shell-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.AuditRecords-Separator {
  flex: none;
  color: var(--shell-text-muted);
}

.AuditRecords-Model {
  min-width: 0;
  overflow: hidden;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.AuditRecords-Pager {
  display: flex;
  justify-content: center;
}

.AuditRecords-Detail {
  padding: var(--shell-space-4);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface);
}

.AuditRecords-Footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3);
}

.AuditRecords-Freshness {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.AuditRecords-Export {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
}

.AuditRecords-Progress {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.AuditRecords-SrOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
