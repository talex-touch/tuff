export type DataTableKey = string | number

export type DataTableAlign = 'left' | 'center' | 'right'

export type DataTableSortOrder = 'asc' | 'desc' | null

export interface DataTableSortState {
  key: string
  order: DataTableSortOrder
}

export interface DataTableColumn<T = any> {
  key: string
  title: string
  dataIndex?: string
  width?: string | number
  align?: DataTableAlign
  sortable?: boolean
  sorter?: (a: T, b: T) => number
  format?: (value: any, row: T, index: number) => string
  headerClass?: string
  cellClass?: string
}

export type DataTableRowKey<T = any> = keyof T | ((row: T, index: number) => DataTableKey)

export interface DataTableProps<T = any> {
  columns: DataTableColumn<T>[]
  data: T[]
  rowKey?: DataTableRowKey<T>
  loading?: boolean
  emptyText?: string
  striped?: boolean
  bordered?: boolean
  hover?: boolean
  selectable?: boolean
  selectedKeys?: DataTableKey[]
  defaultSort?: DataTableSortState
  sortOnClient?: boolean
}

export interface DataTableEmits<T = any> {
  (e: 'update:selectedKeys', value: DataTableKey[]): void
  (e: 'selectionChange', value: DataTableKey[]): void
  (e: 'sortChange', value: DataTableSortState | null): void
  (e: 'rowClick', payload: { row: T, index: number }): void
}
