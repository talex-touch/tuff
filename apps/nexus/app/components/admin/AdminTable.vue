<script setup lang="ts" generic="Row extends object">
import type { DataTableColumn, DataTableHeaderSlotProps, DataTableRowKey } from '@talex-touch/tuffex/data-table'
import { TxDataTable } from '@talex-touch/tuffex/data-table'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxErrorState } from '@talex-touch/tuffex/error-state'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { computed } from 'vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { shouldShowAdminPager } from '~/utils/admin-kit'

interface CellSlotScope {
  row: Row
  column: DataTableColumn<Row>
  value: unknown
  index: number
}

/**
 * The console's list body: `TxDataTable` in its skeleton loading mode, the three
 * states a list can be in besides "has rows", and the pager.
 *
 * - `loading` (nothing on screen yet) draws placeholder rows shaped like the
 *   columns; `refreshing` keeps the rows and runs a bar under the header, after a
 *   short delay so a fast refresh shows nothing.
 * - `error` replaces the body with the message and a retry action.
 * - Empty is two states: nothing exists yet, or the filters exclude everything —
 *   the second offers to clear them.
 * - The footer carries the count and, when there is more than one page or a
 *   smaller page size would split it, `TxPagination` with its size selector.
 *
 * `cell-*` and `header-*` slots go straight through to `TxDataTable`. Pair it with
 * `useAdminList`, whose `loading` is true until the first response, so the empty
 * state can never flash before the first request has answered.
 */
const props = withDefaults(defineProps<{
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: DataTableRowKey<Row>
  loading?: boolean
  refreshing?: boolean
  error?: string | null
  emptyTitle?: string
  filteredEmptyTitle?: string
  /** A filter is in effect: an empty result is "nothing matches", not "nothing yet". */
  filtered?: boolean
  page?: number
  limit?: number
  total?: number
  pageSizes?: number[]
  clickableRows?: boolean
  tableLayout?: 'auto' | 'fixed'
  /** Placeholder rows for the first load. Defaults to the page size, up to 20. */
  skeletonRows?: number
}>(), {
  loading: false,
  refreshing: false,
  error: null,
  filtered: false,
  page: 1,
  limit: 20,
  total: 0,
  pageSizes: () => [],
  clickableRows: false,
  tableLayout: 'auto',
})

const emit = defineEmits<{
  'retry': []
  'clear-filters': []
  'update:page': [page: number]
  'update:limit': [limit: number]
  'row-click': [row: Row, index: number]
}>()

const slots = defineSlots<{
  [name: `cell-${string}`]: (scope: CellSlotScope) => unknown
  [name: `header-${string}`]: (scope: DataTableHeaderSlotProps<Row>) => unknown
}>()

const { t } = useI18n()
const format = useAdminFormat()

// The bar only: a refresh that answers within the delay shows nothing at all.
const refreshVisible = useDeferredLoading(() => props.refreshing && !props.loading)

const tableRows = computed(() => (props.error ? [] : props.rows))
const placeholderRows = computed(() => props.skeletonRows ?? Math.min(Math.max(props.limit, 1), 20))
const showFooter = computed(() => !props.loading && !props.error && props.total > 0)
const showPager = computed(() => shouldShowAdminPager({
  total: props.total,
  limit: props.limit,
  page: props.page,
  pageSizes: props.pageSizes,
}))

// `TxDataTable` makes every row focusable and clickable as soon as a `rowClick`
// listener exists, so the listener is only attached when rows open something.
const rowClickBinding = computed(() => (props.clickableRows
  ? { onRowClick: ({ row, index }: { row: Row, index: number }) => emit('row-click', row, index) }
  : {}))

// Read during render, so a slot that appears later is forwarded without a re-key.
// Split by kind because `TxDataTable` is not generic: it hands every dynamic slot
// one union scope, and each kind goes on under the type this component promises.
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
  <div class="AdminTable">
    <TxDataTable
      :columns="columns"
      :data="tableRows"
      :row-key="rowKey"
      :loading="loading || refreshVisible"
      loading-variant="skeleton"
      :skeleton-rows="placeholderRows"
      :table-layout="tableLayout"
      scroll-x
      v-bind="rowClickBinding"
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
          :title="t('dashboard.sections.adminKit.table.loadFailedTitle', 'Could not load this list')"
          :description="error"
          :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }"
          @primary="emit('retry')"
        />
        <TxEmptyState
          v-else-if="filtered"
          variant="search-empty"
          size="small"
          :title="filteredEmptyTitle || t('dashboard.sections.adminKit.table.filteredEmptyTitle', 'Nothing matches these filters')"
          :description="t('dashboard.sections.adminKit.table.filteredEmptyDescription', 'Change or clear the filters to see more.')"
          :primary-action="{ label: t('dashboard.sections.adminKit.filters.clear', 'Clear filters'), variant: 'flat' }"
          @primary="emit('clear-filters')"
        />
        <TxEmptyState
          v-else
          variant="no-data"
          size="small"
          :title="emptyTitle || t('dashboard.sections.adminKit.table.emptyTitle', 'Nothing here yet')"
          description=""
        />
      </template>
    </TxDataTable>
    <div v-if="showFooter" class="AdminTable-Footer">
      <p class="AdminTable-Total">
        {{ t('dashboard.sections.adminKit.table.total', { count: format.number(total) }) }}
      </p>
      <TxPagination
        v-if="showPager"
        :current-page="page"
        :page-size="limit"
        :total="total"
        :page-sizes="pageSizes"
        :page-size-label="t('dashboard.sections.adminKit.table.pageSize', 'Per page')"
        :aria-label="t('dashboard.sections.adminKit.table.pagination', 'Pagination')"
        :prev-label="t('dashboard.sections.adminKit.table.previousPage', 'Previous page')"
        :next-label="t('dashboard.sections.adminKit.table.nextPage', 'Next page')"
        @update:current-page="emit('update:page', $event)"
        @update:page-size="emit('update:limit', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.AdminTable {
  min-width: 0;
}

.AdminTable-Footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.AdminTable-Total {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
}
</style>
