<script setup lang="ts">
import type { DataTableColumn, DataTableEmits, DataTableKey, DataTableProps, DataTableSortOrder, DataTableSortState } from './types'
import { computed, ref, watch } from 'vue'
import { TxCheckbox } from '../../checkbox'
import { TxEmptyState } from '../../empty-state'
import { TxSpinner } from '../../spinner'

defineOptions({ name: 'TxDataTable' })

const props = withDefaults(defineProps<DataTableProps<any>>(), {
  columns: () => [],
  data: () => [],
  loading: false,
  emptyText: 'No data',
  striped: false,
  bordered: false,
  hover: true,
  selectable: false,
  selectedKeys: () => [],
  sortOnClient: true,
})

const emit = defineEmits<DataTableEmits<any>>()

const localSort = ref<DataTableSortState | null>(props.defaultSort ?? null)

watch(
  () => props.defaultSort,
  (next) => {
    if (!next) {
      localSort.value = null
      return
    }
    localSort.value = next
  },
)

const selectedSet = computed(() => new Set(props.selectedKeys ?? []))

function getRowKey(row: any, index: number): DataTableKey {
  if (typeof props.rowKey === 'function')
    return props.rowKey(row, index)
  if (typeof props.rowKey === 'string' && props.rowKey)
    return row?.[props.rowKey] ?? index
  return index
}

const rowKeys = computed(() => props.data.map((row, index) => getRowKey(row, index)))

const allSelected = computed(() => {
  if (!rowKeys.value.length)
    return false
  return rowKeys.value.every(key => selectedSet.value.has(key))
})

const sortState = computed(() => localSort.value)

function normalizeSortOrder(order: DataTableSortOrder): DataTableSortOrder {
  if (order === 'asc' || order === 'desc')
    return order
  return null
}

function setSort(next: DataTableSortState | null) {
  localSort.value = next
  emit('sortChange', next)
}

function toggleSort(column: DataTableColumn) {
  if (!column.sortable)
    return
  const current = sortState.value
  if (!current || current.key !== column.key) {
    setSort({ key: column.key, order: 'asc' })
    return
  }
  const order = normalizeSortOrder(current.order)
  if (order === 'asc')
    setSort({ key: column.key, order: 'desc' })
  else if (order === 'desc')
    setSort(null)
  else
    setSort({ key: column.key, order: 'asc' })
}

function getCellValue(row: any, column: DataTableColumn) {
  const key = column.dataIndex ?? column.key
  return row?.[key]
}

function defaultSorter(a: any, b: any): number {
  if (a == null && b == null)
    return 0
  if (a == null)
    return -1
  if (b == null)
    return 1
  if (typeof a === 'number' && typeof b === 'number')
    return a - b
  const sa = String(a)
  const sb = String(b)
  return sa.localeCompare(sb)
}

const displayRows = computed(() => {
  const rows = props.data.slice()
  if (!props.sortOnClient)
    return rows
  const state = sortState.value
  if (!state)
    return rows
  const col = props.columns.find(c => c.key === state.key)
  if (!col)
    return rows
  const dir = state.order === 'desc' ? -1 : 1
  const sorter = col.sorter ?? ((a: any, b: any) => defaultSorter(getCellValue(a, col), getCellValue(b, col)))
  return rows.sort((a, b) => dir * sorter(a, b))
})

function toggleRow(key: DataTableKey) {
  const next = new Set(selectedSet.value)
  if (next.has(key))
    next.delete(key)
  else
    next.add(key)
  const updated = Array.from(next)
  emit('update:selectedKeys', updated)
  emit('selectionChange', updated)
}

function toggleAll() {
  const next = allSelected.value ? [] : rowKeys.value
  emit('update:selectedKeys', next)
  emit('selectionChange', next)
}

function formatCell(row: any, column: DataTableColumn, index: number): string {
  const value = getCellValue(row, column)
  if (column.format)
    return column.format(value, row, index)
  if (value == null)
    return ''
  return String(value)
}

function columnStyle(column: DataTableColumn): Record<string, string> {
  const style: Record<string, string> = {}
  if (column.width !== undefined) {
    style.width = typeof column.width === 'number' ? `${column.width}px` : column.width
  }
  if (column.align)
    style.textAlign = column.align
  return style
}

const colspan = computed(() => props.columns.length + (props.selectable ? 1 : 0))

function emitRowClick(row: any, index: number) {
  emit('rowClick', { row, index })
}
</script>

<template>
  <div
    class="tx-data-table"
    :class="{
      'is-striped': striped,
      'is-bordered': bordered,
      'is-hover': hover,
    }"
  >
    <div v-if="loading" class="tx-data-table__loading" aria-live="polite">
      <TxSpinner :size="20" />
    </div>

    <table class="tx-data-table__table" :aria-busy="loading">
      <thead>
        <tr>
          <th v-if="selectable" class="tx-data-table__th tx-data-table__th--select">
            <TxCheckbox
              :model-value="allSelected"
              aria-label="Select all"
              @update:model-value="toggleAll"
            />
          </th>
          <th
            v-for="column in columns"
            :key="column.key"
            class="tx-data-table__th"
            :class="[
              column.headerClass,
              { 'is-sortable': column.sortable, 'is-sorted': sortState?.key === column.key },
            ]"
            :style="columnStyle(column)"
            @click="toggleSort(column)"
          >
            <slot :name="`header-${column.key}`" :column="column">
              {{ column.title }}
            </slot>
            <span v-if="column.sortable" class="tx-data-table__sort" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="10" height="10" :class="{ 'is-active': sortState?.key === column.key && sortState?.order === 'asc' }">
                <path fill="currentColor" d="M7 14l5-5 5 5z" />
              </svg>
              <svg viewBox="0 0 24 24" width="10" height="10" :class="{ 'is-active': sortState?.key === column.key && sortState?.order === 'desc' }">
                <path fill="currentColor" d="M7 10l5 5 5-5z" />
              </svg>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in displayRows"
          :key="getRowKey(row, index)"
          class="tx-data-table__row"
          @click="emitRowClick(row, index)"
        >
          <td v-if="selectable" class="tx-data-table__cell tx-data-table__cell--select">
            <TxCheckbox
              :model-value="selectedSet.has(getRowKey(row, index))"
              aria-label="Select row"
              @update:model-value="() => toggleRow(getRowKey(row, index))"
            />
          </td>
          <td
            v-for="column in columns"
            :key="column.key"
            class="tx-data-table__cell"
            :class="column.cellClass"
            :style="columnStyle(column)"
          >
            <slot
              :name="`cell-${column.key}`"
              :row="row"
              :column="column"
              :value="getCellValue(row, column)"
              :index="index"
            >
              {{ formatCell(row, column, index) }}
            </slot>
          </td>
        </tr>
        <tr v-if="!displayRows.length && !loading">
          <td :colspan="colspan" class="tx-data-table__empty">
            <slot name="empty">
              <TxEmptyState variant="no-data" :title="emptyText" size="small" layout="vertical" />
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
.tx-data-table {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid transparent;

  &.is-bordered {
    border-color: var(--tx-border-color-lighter, #ebeef5);
  }
}

.tx-data-table__table {
  width: 100%;
  border-collapse: collapse;
  color: var(--tx-text-color-primary, #303133);
  background: var(--tx-bg-color, #fff);
}

.tx-data-table__th,
.tx-data-table__cell {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
  font-size: 13px;
  line-height: 1.5;
}

.tx-data-table__th {
  font-weight: 600;
  color: var(--tx-text-color-regular, #606266);
  background: var(--tx-fill-color-lighter, #fafafa);
  user-select: none;
  white-space: nowrap;
}

.tx-data-table__th--select,
.tx-data-table__cell--select {
  width: 42px;
  text-align: center;
}

.tx-data-table__th.is-sortable {
  cursor: pointer;
}

.tx-data-table__sort {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  margin-left: 6px;
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-data-table__sort svg {
  opacity: 0.45;
}

.tx-data-table__sort svg.is-active {
  opacity: 1;
  color: var(--tx-color-primary, #409eff);
}

.tx-data-table.is-striped tbody tr:nth-child(odd) {
  background: color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 60%, transparent);
}

.tx-data-table.is-hover tbody tr:hover {
  background: color-mix(in srgb, var(--tx-color-primary-light-9, #ecf5ff) 60%, transparent);
}

.tx-data-table__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 70%, transparent);
  z-index: 2;
  backdrop-filter: blur(4px);
}

.tx-data-table__empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
