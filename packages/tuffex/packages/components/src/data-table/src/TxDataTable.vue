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
  interactiveRows: false,
  selectable: false,
  selectedKeys: () => [],
  sortOnClient: true,
  tableLayout: 'auto',
  nowrap: false,
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

function getColumnAriaSort(column: DataTableColumn): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.sortable)
    return undefined
  const current = sortState.value
  if (current?.key !== column.key)
    return 'none'
  const order = normalizeSortOrder(current.order)
  if (!order)
    return 'none'
  return order === 'desc' ? 'descending' : 'ascending'
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

function toCssUnit(value: string | number | undefined): string | undefined {
  if (value === undefined)
    return undefined
  return typeof value === 'number' ? `${value}px` : value
}

function getFixedSide(column: DataTableColumn): 'left' | 'right' | null {
  if (column.fixed === true || column.fixed === 'left')
    return 'left'
  if (column.fixed === 'right')
    return 'right'
  return null
}

function getStickyWidth(column: DataTableColumn): number {
  const value = column.width ?? column.minWidth
  if (typeof value === 'number')
    return value
  if (typeof value !== 'string')
    return 0
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/)
  return match ? Number(match[1]) : 0
}

const fixedColumnOffsets = computed(() => {
  const left = new Map<string, string>()
  const right = new Map<string, string>()
  let leftOffset = 0
  let rightOffset = 0

  for (const column of props.columns) {
    if (getFixedSide(column) !== 'left')
      continue
    left.set(column.key, `${leftOffset}px`)
    leftOffset += getStickyWidth(column)
  }

  for (const column of [...props.columns].reverse()) {
    if (getFixedSide(column) !== 'right')
      continue
    right.set(column.key, `${rightOffset}px`)
    rightOffset += getStickyWidth(column)
  }

  return { left, right }
})

const hasFixedColumns = computed(() => props.columns.some(column => Boolean(getFixedSide(column))))

function columnStyle(column: DataTableColumn): Record<string, string> {
  const style: Record<string, string> = {}
  if (column.auto)
    style.width = 'auto'
  else if (column.width !== undefined)
    style.width = toCssUnit(column.width) ?? ''
  if (column.minWidth !== undefined)
    style.minWidth = toCssUnit(column.minWidth) ?? ''
  if (column.maxWidth !== undefined)
    style.maxWidth = toCssUnit(column.maxWidth) ?? ''
  if (column.align)
    style.textAlign = column.align

  const fixedSide = getFixedSide(column)
  if (fixedSide === 'left')
    style.left = fixedColumnOffsets.value.left.get(column.key) ?? '0px'
  else if (fixedSide === 'right')
    style.right = fixedColumnOffsets.value.right.get(column.key) ?? '0px'

  return style
}

function columnClass(column: DataTableColumn, type: 'header' | 'cell') {
  const fixedSide = getFixedSide(column)
  return [
    type === 'header' ? column.headerClass : column.cellClass,
    {
      'is-auto': column.auto,
      'is-fixed': Boolean(fixedSide),
      'is-fixed-left': fixedSide === 'left',
      'is-fixed-right': fixedSide === 'right',
      'is-nowrap': props.nowrap || column.nowrap,
      'is-sortable': type === 'header' && column.sortable,
      'is-sorted': type === 'header' && sortState.value?.key === column.key,
    },
  ]
}

const colspan = computed(() => props.columns.length + (props.selectable ? 1 : 0))

function emitRowClick(row: any, index: number) {
  emit('rowClick', { row, index })
}

function handleRowKeydown(event: KeyboardEvent, row: any, index: number) {
  if (!props.interactiveRows || event.target !== event.currentTarget)
    return
  if (event.key !== 'Enter' && event.key !== ' ')
    return

  event.preventDefault()
  emitRowClick(row, index)
}
</script>

<template>
  <div
    class="tx-data-table"
    :class="{
      'is-striped': striped,
      'is-bordered': bordered,
      'is-hover': hover,
      'is-nowrap': nowrap,
      'has-fixed-columns': hasFixedColumns,
      [`is-layout-${tableLayout}`]: true,
    }"
  >
    <div v-if="loading" class="tx-data-table__loading" aria-live="polite">
      <TxSpinner :size="20" />
    </div>

    <table class="tx-data-table__table" :style="{ tableLayout }" :aria-busy="loading">
      <thead>
        <tr>
          <th v-if="selectable" class="tx-data-table__th tx-data-table__th--select" scope="col">
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
            scope="col"
            :class="columnClass(column, 'header')"
            :style="columnStyle(column)"
            :aria-sort="getColumnAriaSort(column)"
          >
            <button
              v-if="column.sortable"
              type="button"
              class="tx-data-table__sort-button"
              :class="`is-align-${column.align || 'left'}`"
              @click="toggleSort(column)"
            >
              <slot :name="`header-${column.key}`" :column="column">
                {{ column.title }}
              </slot>
              <span class="tx-data-table__sort" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="10" height="10" :class="{ 'is-active': sortState?.key === column.key && sortState?.order === 'asc' }">
                  <path fill="currentColor" d="M7 14l5-5 5 5z" />
                </svg>
                <svg viewBox="0 0 24 24" width="10" height="10" :class="{ 'is-active': sortState?.key === column.key && sortState?.order === 'desc' }">
                  <path fill="currentColor" d="M7 10l5 5 5-5z" />
                </svg>
              </span>
            </button>
            <slot v-else :name="`header-${column.key}`" :column="column">
              {{ column.title }}
            </slot>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in displayRows"
          :key="getRowKey(row, index)"
          class="tx-data-table__row"
          :class="{ 'is-interactive': interactiveRows }"
          :tabindex="interactiveRows ? 0 : undefined"
          @click="emitRowClick(row, index)"
          @keydown="handleRowKeydown($event, row, index)"
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
            :class="columnClass(column, 'cell')"
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

  &.has-fixed-columns {
    overflow: visible;
  }
}

.tx-data-table__table {
  width: 100%;
  border-collapse: collapse;
  color: var(--tx-text-color-primary, #303133);
  background: var(--tx-bg-color, #fff);
}

.tx-data-table.is-layout-fixed .tx-data-table__table {
  table-layout: fixed;
}

.tx-data-table__th,
.tx-data-table__cell {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
  font-size: 13px;
  line-height: 1.5;
}

.tx-data-table__th.is-nowrap,
.tx-data-table__cell.is-nowrap,
.tx-data-table.is-nowrap .tx-data-table__th,
.tx-data-table.is-nowrap .tx-data-table__cell {
  white-space: nowrap;
}

.tx-data-table__th.is-fixed,
.tx-data-table__cell.is-fixed {
  position: sticky;
  z-index: 1;
  background: var(--tx-bg-color, #fff);
}

.tx-data-table__th.is-fixed {
  z-index: 3;
  background: var(--tx-fill-color-lighter, #fafafa);
}

.tx-data-table__th.is-fixed-left,
.tx-data-table__cell.is-fixed-left {
  box-shadow: 1px 0 0 var(--tx-border-color-lighter, #ebeef5);
}

.tx-data-table__th.is-fixed-right,
.tx-data-table__cell.is-fixed-right {
  box-shadow: -1px 0 0 var(--tx-border-color-lighter, #ebeef5);
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
  padding: 0;
}

.tx-data-table__sort-button {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  line-height: inherit;
  text-align: inherit;
  cursor: pointer;

  &.is-align-center {
    justify-content: center;
  }

  &.is-align-right {
    justify-content: flex-end;
  }
}

.tx-data-table__sort-button:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: -2px;
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

.tx-data-table__row.is-interactive {
  cursor: pointer;
}

.tx-data-table__row.is-interactive:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: -2px;
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
