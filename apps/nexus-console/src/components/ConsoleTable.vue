<script setup lang="ts" generic="Row extends object">
import type { DataTableColumn, DataTableHeaderSlotProps, DataTableRowKey } from '@talex-touch/tuffex/data-table'
import { TxDataTable } from '@talex-touch/tuffex/data-table'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxErrorState } from '@talex-touch/tuffex/error-state'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { shouldShowPager } from '@/composables/useConsoleList'
import { formatNumber } from '@/utils/format'

interface CellSlotScope {
  row: Row
  column: DataTableColumn<Row>
  value: unknown
  index: number
}

const props = withDefaults(defineProps<{
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: DataTableRowKey<Row>
  loading?: boolean
  refreshing?: boolean
  error?: string | null
  emptyTitle?: string
  filteredEmptyTitle?: string
  filtered?: boolean
  page?: number
  limit?: number
  total?: number
  pageSizes?: number[]
  skeletonRows?: number
}>(), {
  loading: false,
  refreshing: false,
  error: null,
  filtered: false,
  page: 1,
  limit: 20,
  total: 0,
  pageSizes: () => [10, 20, 50],
})

const emit = defineEmits<{
  'retry': []
  'clear-filters': []
  'update:page': [page: number]
  'update:limit': [limit: number]
}>()

const slots = defineSlots<{
  [name: `cell-${string}`]: (scope: CellSlotScope) => unknown
  [name: `header-${string}`]: (scope: DataTableHeaderSlotProps<Row>) => unknown
}>()

const { t, locale } = useI18n()
const refreshVisible = useDeferredLoading(() => props.refreshing && !props.loading)

const tableRows = computed(() => (props.error ? [] : props.rows))
const placeholderRows = computed(() => props.skeletonRows ?? Math.min(Math.max(props.limit, 1), 10))
const showFooter = computed(() => !props.loading && !props.error && props.total > 0)
const showPager = computed(() => shouldShowPager({
  total: props.total,
  limit: props.limit,
  page: props.page,
  pageSizes: props.pageSizes,
}))

function cellSlotNames(): Array<`cell-${string}`> {
  return Object.keys(slots).filter((name): name is `cell-${string}` => name.startsWith('cell-'))
}

function headerSlotNames(): Array<`header-${string}`> {
  return Object.keys(slots).filter((name): name is `header-${string}` => name.startsWith('header-'))
}

function cellScope(scope: unknown): CellSlotScope {
  return scope as CellSlotScope
}

function headerScope(scope: unknown): DataTableHeaderSlotProps<Row> {
  return scope as DataTableHeaderSlotProps<Row>
}
</script>

<template>
  <div class="ConsoleTable">
    <TxDataTable
      :columns="columns"
      :data="tableRows"
      :row-key="rowKey"
      :loading="loading || refreshVisible"
      loading-variant="skeleton"
      :skeleton-rows="placeholderRows"
      scroll-x
    >
      <template v-for="name in cellSlotNames()" :key="name" #[name]="scope">
        <slot :name="name" v-bind="cellScope(scope)" />
      </template>
      <template v-for="name in headerSlotNames()" :key="name" #[name]="scope">
        <slot :name="name" v-bind="headerScope(scope)" />
      </template>
      <template #empty>
        <TxErrorState
          v-if="error"
          size="small"
          :title="t('common.loadFailed')"
          :description="error"
          :primary-action="{ label: t('common.retry'), variant: 'flat' }"
          @primary="emit('retry')"
        />
        <TxEmptyState
          v-else-if="filtered"
          variant="search-empty"
          size="small"
          :title="filteredEmptyTitle || t('common.noMatches')"
          :description="t('common.noMatchesHint')"
          :primary-action="{ label: t('common.clearFilters'), variant: 'flat' }"
          @primary="emit('clear-filters')"
        />
        <TxEmptyState
          v-else
          variant="no-data"
          size="small"
          :title="emptyTitle || t('common.noData')"
          description=""
        />
      </template>
    </TxDataTable>

    <div v-if="showFooter" class="ConsoleTable-Footer">
      <p class="ConsoleTable-Total">
        {{ t('common.totalRows', { count: formatNumber(total, locale) }) }}
      </p>
      <TxPagination
        v-if="showPager"
        :current-page="page"
        :page-size="limit"
        :total="total"
        :page-sizes="pageSizes"
        :page-size-label="t('common.perPage')"
        :aria-label="t('common.pagination')"
        :prev-label="t('common.prevPage')"
        :next-label="t('common.nextPage')"
        @update:current-page="emit('update:page', $event)"
        @update:page-size="emit('update:limit', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.ConsoleTable {
  min-width: 0;
}

.ConsoleTable-Footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.ConsoleTable-Total {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-regular);
  white-space: nowrap;
}
</style>
