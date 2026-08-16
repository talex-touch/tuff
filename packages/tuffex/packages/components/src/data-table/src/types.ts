export type DataTableKey = string | number

export type DataTableAlign = 'left' | 'center' | 'right'

export type DataTableLayout = 'auto' | 'fixed'

export type DataTableColumnFixed = boolean | 'left' | 'right'

export type DataTableSortOrder = 'asc' | 'desc' | null

export interface DataTableSortState {
  key: string
  order: DataTableSortOrder
}

/**
 * How repeated clicks on a sortable header cycle.
 *
 * - `tri`: ascending → descending → unsorted.
 * - `bi`: ascending → descending → ascending; the table is never unsorted.
 */
export type DataTableSortCycle = 'tri' | 'bi'

/**
 * Class contribution for a row: anything Vue's `class` binding accepts.
 */
export type DataTableRowClass = string | string[] | Record<string, boolean>

/**
 * Scope handed to a `header-<key>` slot.
 */
export interface DataTableHeaderSlotProps<T = any> {
  column: DataTableColumn<T>
  /** True while this column is the active sort. */
  sorted: boolean
  /** Active direction, or `null` when this column is not the active sort. */
  order: DataTableSortOrder
  /** Advances this column through the configured sort cycle. */
  toggle: () => void
}

export interface DataTableColumn<T = any> {
  key: string
  title: string
  dataIndex?: string
  width?: string | number
  minWidth?: string | number
  maxWidth?: string | number
  auto?: boolean
  fixed?: DataTableColumnFixed
  nowrap?: boolean
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
  interactiveRows?: boolean
  selectable?: boolean
  selectedKeys?: DataTableKey[]
  /**
   * Initial sort for the uncontrolled mode. The component then owns the sort.
   *
   * Mutually exclusive with {@link DataTableProps.sort}: pass one or the other,
   * never both. Passing `sort` puts the component in controlled mode and this
   * prop is ignored.
   */
  defaultSort?: DataTableSortState
  /**
   * Controlled sort. Supply it (including as `null` for "unsorted") and the
   * component stops holding its own state — it only reports what the user asked
   * for through `update:sort`, and renders whatever comes back.
   *
   * Leave it out entirely for the uncontrolled mode driven by `defaultSort`.
   */
  sort?: DataTableSortState | null
  sortOnClient?: boolean
  /**
   * @default 'tri'
   */
  sortCycle?: DataTableSortCycle
  tableLayout?: DataTableLayout
  nowrap?: boolean
  /**
   * Caps the table height and turns the component into its own vertical scroll
   * container. Required for `stickyHeader` / `stickyFooter` to have anything to
   * stick to unless an ancestor already scrolls.
   */
  maxHeight?: string | number
  /**
   * Lets the table scroll horizontally inside the component. Needed by wide
   * tables with `fixed` columns, which otherwise rely on an outer scroller.
   * @default false
   */
  scrollX?: boolean
  /**
   * Pins the header row while the body scrolls.
   * @default false
   */
  stickyHeader?: boolean
  /**
   * Pins the footer row while the body scrolls.
   * @default false
   */
  stickyFooter?: boolean
  /** Extra classes per row, e.g. to tint a row by its state. */
  rowClass?: (row: T, index: number) => DataTableRowClass
  /**
   * Tints selected rows. Off by default so existing tables keep rendering
   * selection through the checkbox alone.
   * @default false
   */
  highlightSelected?: boolean
}

export interface DataTableEmits<T = any> {
  (e: 'update:selectedKeys', value: DataTableKey[]): void
  (e: 'selectionChange', value: DataTableKey[]): void
  (e: 'sortChange', value: DataTableSortState | null): void
  (e: 'update:sort', value: DataTableSortState | null): void
  (e: 'rowClick', payload: { row: T, index: number }): void
}
