import type {
  CSSProperties,
  DragEvent,
  ForwardedRef,
  HTMLAttributes,
  KeyboardEvent,
  ReactElement,
  ReactNode,
} from 'react'
import {
  createContext,
  forwardRef,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { useControllableState } from '../../hooks/useControllableState'
import { cn, toCssUnit } from '../../utils/cn'
import { BuiltinIcon } from '../../utils/icons'
import { TxCheckbox } from '../TxCheckbox'
import { TxInput } from '../TxInput'
import { TxSkeleton } from '../TxSkeleton'
import { TxSpinner } from '../TxSpinner'

// ============================================================================
// 25. TxDataTable (data-table)
// ============================================================================

export type TxDataTableKey = string | number
export type TxDataTableAlign = 'left' | 'center' | 'right'
export type TxDataTableLayout = 'auto' | 'fixed'
export type TxDataTableColumnFixed = boolean | 'left' | 'right'
export type TxDataTableSortOrder = 'asc' | 'desc' | null
export type TxDataTableSortCycle = 'tri' | 'bi'
export type TxDataTableLoadingVariant = 'overlay' | 'skeleton' | 'shimmer'
export type TxDataTableColumnType = 'text' | 'number' | 'datetime' | 'date' | 'tag' | 'source' | 'actions'

export interface TxDataTableSortState {
  key: string
  order: TxDataTableSortOrder
}

export interface TxDataTableHeaderRenderContext<T = Record<string, any>> {
  column: TxDataTableColumn<T>
  sorted: boolean
  order: TxDataTableSortOrder
  toggle: () => void
}

export interface TxDataTableCellRenderContext<T = Record<string, any>> {
  column: TxDataTableColumn<T>
  row: T
  value: unknown
  index: number
}

export interface TxDataTableColumn<T = Record<string, any>> {
  key: string
  title: string
  type?: TxDataTableColumnType
  dataIndex?: string
  width?: string | number
  minWidth?: string | number
  maxWidth?: string | number
  fixed?: TxDataTableColumnFixed
  nowrap?: boolean
  align?: TxDataTableAlign
  sortable?: boolean
  sorter?: (a: T, b: T) => number
  format?: (value: any, row: T, index: number) => string
  headerClass?: string
  cellClass?: string
  render?: (value: any, row: T, index: number) => ReactNode
  renderHeader?: (context: TxDataTableHeaderRenderContext<T>) => ReactNode
}

export type TxDataTableRowKey<T = Record<string, any>> = keyof T | ((row: T, index: number) => TxDataTableKey)

export interface TxDataTableProps<T = Record<string, any>> extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  columns: TxDataTableColumn<T>[]
  data: T[]
  rowKey?: TxDataTableRowKey<T>
  loading?: boolean
  loadingVariant?: TxDataTableLoadingVariant
  skeletonRows?: number
  emptyText?: string
  striped?: boolean
  bordered?: boolean
  hover?: boolean
  interactiveRows?: boolean
  selectable?: boolean
  selectedKeys?: TxDataTableKey[]
  defaultSelectedKeys?: TxDataTableKey[]
  selectAllLabel?: string
  selectRowLabel?: string
  selectRowLabelFormatter?: (row: T, index: number) => string
  defaultSort?: TxDataTableSortState | null
  sort?: TxDataTableSortState | null
  sortOnClient?: boolean
  sortCycle?: TxDataTableSortCycle
  tableLayout?: TxDataTableLayout
  nowrap?: boolean
  maxHeight?: string | number
  scrollX?: boolean
  stickyHeader?: boolean
  stickyFooter?: boolean
  expandable?: boolean
  defaultExpandedKeys?: TxDataTableKey[]
  expandedKeys?: TxDataTableKey[]
  rowExpandable?: (row: T, index: number) => boolean
  expandLabel?: string
  collapseLabel?: string
  rowClass?: (row: T, index: number) => string | undefined
  highlightSelected?: boolean
  renderCell?: (context: TxDataTableCellRenderContext<T>) => ReactNode
  renderHeader?: (context: TxDataTableHeaderRenderContext<T>) => ReactNode
  renderExpandedRow?: (row: T, index: number) => ReactNode
  renderEmpty?: () => ReactNode
  footer?: ReactNode
  onSelectionChange?: (keys: TxDataTableKey[]) => void
  onSelectedKeysChange?: (keys: TxDataTableKey[]) => void
  onExpandedKeysChange?: (keys: TxDataTableKey[]) => void
  onExpand?: (payload: { row: T, index: number, expanded: boolean }) => void
  onSortChange?: (sort: TxDataTableSortState | null) => void
  onRowClick?: (payload: { row: T, index: number }) => void
}

function getRowKeyValue<T extends Record<string, any>>(
  row: T,
  index: number,
  rowKey?: TxDataTableRowKey<T>,
): TxDataTableKey {
  if (typeof rowKey === 'function')
    return rowKey(row, index)
  if (rowKey !== undefined) {
    const val = row[rowKey]
    if (typeof val === 'string' || typeof val === 'number')
      return val
  }
  const fallback = row.id ?? row.key
  if (typeof fallback === 'string' || typeof fallback === 'number')
    return fallback
  return index
}

function getCellValue<T extends Record<string, any>>(row: T, column: TxDataTableColumn<T>): unknown {
  const path = column.dataIndex ?? column.key
  if (!path.includes('.'))
    return row[path]
  let current: unknown = row
  for (const part of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object')
      return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function defaultCompare(a: unknown, b: unknown): number {
  if (a === b)
    return 0
  if (a === null || a === undefined)
    return -1
  if (b === null || b === undefined)
    return 1
  if (typeof a === 'number' && typeof b === 'number')
    return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function TxDataTableInner<T extends Record<string, any> = Record<string, any>>(
  {
    columns,
    data,
    rowKey,
    loading = false,
    loadingVariant = 'overlay',
    skeletonRows = 5,
    emptyText = 'No data',
    striped = false,
    bordered = false,
    hover = true,
    interactiveRows = false,
    selectable = false,
    selectedKeys,
    defaultSelectedKeys = [],
    selectAllLabel = 'Select all',
    selectRowLabel = 'Select row',
    selectRowLabelFormatter,
    defaultSort = null,
    sort,
    sortOnClient = true,
    sortCycle = 'tri',
    tableLayout = 'auto',
    nowrap = false,
    maxHeight,
    scrollX = false,
    stickyHeader = false,
    stickyFooter = false,
    expandable = false,
    defaultExpandedKeys = [],
    expandedKeys,
    rowExpandable,
    expandLabel = 'Expand row',
    collapseLabel = 'Collapse row',
    rowClass,
    highlightSelected = false,
    renderCell,
    renderHeader,
    renderExpandedRow,
    renderEmpty,
    footer,
    onSelectionChange,
    onSelectedKeysChange,
    onExpandedKeysChange,
    onExpand,
    onSortChange,
    onRowClick,
    className,
    style,
    ...rest
  }: TxDataTableProps<T>,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const [currentSort, setCurrentSort] = useControllableState<TxDataTableSortState | null>({
    value: sort,
    defaultValue: defaultSort,
    onChange: onSortChange,
  })
  const handleSelectionChange = useCallback((next: TxDataTableKey[]) => {
    onSelectionChange?.(next)
    onSelectedKeysChange?.(next)
  }, [onSelectionChange, onSelectedKeysChange])

  const [currentSelected, setCurrentSelected] = useControllableState<TxDataTableKey[]>({
    value: selectedKeys,
    defaultValue: defaultSelectedKeys,
    onChange: handleSelectionChange,
  })
  const [currentExpanded, setCurrentExpanded] = useControllableState<TxDataTableKey[]>({
    value: expandedKeys,
    defaultValue: defaultExpandedKeys,
    onChange: onExpandedKeysChange,
  })

  const sortedRows = useMemo(() => {
    if (!sortOnClient || !currentSort || !currentSort.order)
      return data
    const col = columns.find(c => c.key === currentSort.key)
    if (!col)
      return data
    const dir = currentSort.order === 'asc' ? 1 : -1
    const copy = [...data]
    copy.sort((a, b) => {
      if (col.sorter)
        return col.sorter(a, b) * dir
      return defaultCompare(getCellValue(a, col), getCellValue(b, col)) * dir
    })
    return copy
  }, [columns, currentSort, data, sortOnClient])

  const allRowKeys = useMemo(
    () => sortedRows.map((row, idx) => getRowKeyValue(row, idx, rowKey)),
    [rowKey, sortedRows],
  )
  const selectedSet = useMemo(() => new Set<TxDataTableKey>(currentSelected), [currentSelected])
  const expandedSet = useMemo(() => new Set<TxDataTableKey>(currentExpanded), [currentExpanded])

  const allSelected = allRowKeys.length > 0 && allRowKeys.every(k => selectedSet.has(k))
  const someSelected = allRowKeys.some(k => selectedSet.has(k)) && !allSelected

  const toggleSort = useCallback((col: TxDataTableColumn<T>) => {
    if (!col.sortable)
      return
    let next: TxDataTableSortState | null
    if (!currentSort || currentSort.key !== col.key || currentSort.order === null) {
      next = { key: col.key, order: 'asc' }
    }
    else if (currentSort.order === 'asc') {
      next = { key: col.key, order: 'desc' }
    }
    else {
      next = sortCycle === 'bi' ? { key: col.key, order: 'asc' } : null
    }
    setCurrentSort(next)
  }, [currentSort, setCurrentSort, sortCycle])

  const toggleSelectAll = () => {
    if (allSelected)
      setCurrentSelected([])
    else
      setCurrentSelected([...allRowKeys])
  }

  const toggleRowSelection = (key: TxDataTableKey) => {
    if (selectedSet.has(key))
      setCurrentSelected(currentSelected.filter(k => k !== key))
    else
      setCurrentSelected([...currentSelected, key])
  }

  const toggleRowExpand = (row: T, index: number, key: TxDataTableKey) => {
    const isExpanded = expandedSet.has(key)
    const next = isExpanded
      ? currentExpanded.filter(k => k !== key)
      : [...currentExpanded, key]
    setCurrentExpanded(next)
    onExpand?.({ row, index, expanded: !isExpanded })
  }

  const totalColumns = columns.length + (selectable ? 1 : 0) + (expandable ? 1 : 0)
  const showSkeletonRows = loading && sortedRows.length === 0 && (loadingVariant === 'skeleton' || loadingVariant === 'shimmer')

  return (
    <div
      ref={ref}
      className={cn(
        'tx-data-table',
        {
          'is-striped': striped,
          'is-bordered': bordered,
          'is-hover': hover,
          'is-scroll-x': scrollX,
          'is-sticky-header': stickyHeader,
          'is-sticky-footer': stickyFooter,
          'is-loading': loading,
        },
        className,
      )}
      style={{
        ...(maxHeight !== undefined ? { maxHeight: toCssUnit(maxHeight), overflowY: 'auto' } : {}),
        ...style,
      } as CSSProperties}
      {...rest}
    >
      {loading && loadingVariant === 'overlay' && (
        <div className="tx-data-table__loading" role="status" aria-live="polite">
          <TxSpinner size={20} label="Loading table data" />
        </div>
      )}

      <table className="tx-data-table__table" style={{ tableLayout }}>
        <thead>
          <tr>
            {expandable && <th className="tx-data-table__th tx-data-table__th--expand" aria-label="Expand" />}
            {selectable && (
              <th className="tx-data-table__th tx-data-table__th--select">
                <TxCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  ariaLabel={selectAllLabel}
                  onChange={toggleSelectAll}
                />
              </th>
            )}
            {columns.map((col) => {
              const isSorted = currentSort?.key === col.key && currentSort.order !== null
              const order: TxDataTableSortOrder = isSorted ? currentSort.order : null
              const ariaSort = col.sortable
                ? (order === 'asc' ? 'ascending' : order === 'desc' ? 'descending' : 'none')
                : undefined
              const headerCtx: TxDataTableHeaderRenderContext<T> = {
                column: col,
                sorted: isSorted,
                order,
                toggle: () => toggleSort(col),
              }
              const customHeader = col.renderHeader?.(headerCtx) ?? renderHeader?.(headerCtx)

              return (
                <th
                  key={col.key}
                  aria-sort={ariaSort}
                  className={cn(
                    'tx-data-table__th',
                    col.align ? `is-align-${col.align}` : undefined,
                    { 'is-sortable': col.sortable, 'is-sorted': isSorted, 'is-nowrap': col.nowrap ?? nowrap },
                    col.headerClass,
                  )}
                  style={{
                    width: col.width !== undefined ? toCssUnit(col.width) : undefined,
                    minWidth: col.minWidth !== undefined ? toCssUnit(col.minWidth) : undefined,
                    maxWidth: col.maxWidth !== undefined ? toCssUnit(col.maxWidth) : undefined,
                  }}
                >
                  <div className="tx-data-table__th-inner">
                    {customHeader ?? (
                      col.sortable
                        ? (
                            <button
                              type="button"
                              className="tx-data-table__sort-button"
                              onClick={() => toggleSort(col)}
                            >
                              <span>{col.title}</span>
                              <span className={cn('tx-data-table__sort', order ? `is-${order}` : undefined)} aria-hidden="true">
                                {order === 'asc' ? '▲' : order === 'desc' ? '▼' : '⇅'}
                              </span>
                            </button>
                          )
                        : <span>{col.title}</span>
                    )}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {showSkeletonRows
            ? Array.from({ length: skeletonRows }, (_, rowIdx) => (
                <tr key={`skeleton-${rowIdx}`} className="tx-data-table__row tx-data-table__row--skeleton">
                  {expandable && <td className="tx-data-table__cell tx-data-table__cell--expand" />}
                  {selectable && <td className="tx-data-table__cell tx-data-table__cell--select" />}
                  {columns.map(col => (
                    <td key={col.key} className="tx-data-table__cell">
                      <TxSkeleton height={14} className="tx-data-table__skeleton" />
                    </td>
                  ))}
                </tr>
              ))
            : sortedRows.length === 0
              ? (
                  <tr className="tx-data-table__row tx-data-table__row--empty">
                    <td colSpan={Math.max(1, totalColumns)} className="tx-data-table__cell tx-data-table__empty">
                      {renderEmpty ? renderEmpty() : emptyText}
                    </td>
                  </tr>
                )
              : sortedRows.map((row, rowIndex) => {
                  const key = getRowKeyValue(row, rowIndex, rowKey)
                  const isSelected = selectedSet.has(key)
                  const isExpanded = expandedSet.has(key)
                  const canExpand = expandable && (rowExpandable ? rowExpandable(row, rowIndex) : true)
                  const rowAriaLabel = selectRowLabelFormatter ? selectRowLabelFormatter(row, rowIndex) : selectRowLabel

                  return (
                    <Fragment key={String(key)}>
                      <tr
                        className={cn(
                          'tx-data-table__row',
                          {
                            'is-selected': highlightSelected && isSelected,
                            'is-expanded': isExpanded,
                            'is-interactive': interactiveRows || Boolean(onRowClick),
                          },
                          rowClass?.(row, rowIndex),
                        )}
                        onClick={() => onRowClick?.({ row, index: rowIndex })}
                      >
                        {expandable && (
                          <td className="tx-data-table__cell tx-data-table__cell--expand">
                            {canExpand && (
                              <button
                                type="button"
                                className={cn('tx-data-table__expand-toggle', { 'is-expanded': isExpanded })}
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? collapseLabel : expandLabel}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleRowExpand(row, rowIndex, key)
                                }}
                              >
                                <BuiltinIcon name="chevron-down" size={14} />
                              </button>
                            )}
                          </td>
                        )}

                        {selectable && (
                          <td
                            className="tx-data-table__cell tx-data-table__cell--select"
                            onClick={e => e.stopPropagation()}
                          >
                            <TxCheckbox
                              checked={isSelected}
                              ariaLabel={rowAriaLabel}
                              onChange={() => toggleRowSelection(key)}
                            />
                          </td>
                        )}

                        {columns.map((col) => {
                          const cellVal = getCellValue(row, col)
                          const rendered = col.render
                            ? col.render(cellVal, row, rowIndex)
                            : renderCell
                              ? renderCell({ column: col, row, value: cellVal, index: rowIndex })
                              : col.format
                                ? col.format(cellVal, row, rowIndex)
                                : col.type === 'tag' && cellVal !== null && cellVal !== undefined
                                  ? <span className="tx-data-table__tag-pill">{String(cellVal)}</span>
                                  : cellVal === null || cellVal === undefined
                                    ? ''
                                    : String(cellVal)

                          return (
                            <td
                              key={col.key}
                              className={cn(
                                'tx-data-table__cell',
                                col.align ? `is-align-${col.align}` : undefined,
                                { 'is-nowrap': col.nowrap ?? nowrap },
                                col.cellClass,
                              )}
                            >
                              {rendered}
                            </td>
                          )
                        })}
                      </tr>

                      {expandable && isExpanded && renderExpandedRow && (
                        <tr className="tx-data-table__row tx-data-table__row--detail">
                          <td colSpan={Math.max(1, totalColumns)} className="tx-data-table__cell tx-data-table__detail-cell">
                            {renderExpandedRow(row, rowIndex)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
        </tbody>

        {footer !== undefined && footer !== null && (
          <tfoot className="tx-data-table__footer">
            <tr>
              <td colSpan={Math.max(1, totalColumns)} className="tx-data-table__cell">
                {footer}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export const TxDataTable = forwardRef(TxDataTableInner) as <T extends Record<string, any> = Record<string, any>>(
  props: TxDataTableProps<T> & { ref?: ForwardedRef<HTMLDivElement> },
) => ReactElement
;(TxDataTable as { displayName?: string }).displayName = 'TxDataTable'

// ============================================================================
// 26. TxDescriptions + TxDescriptionsItem (descriptions)
// ============================================================================

export type TxDescriptionsLayout = 'horizontal' | 'vertical'
export type TxDescriptionsSize = 'sm' | 'md'

interface DescriptionsContextValue {
  columns: number
  layout: TxDescriptionsLayout
  size: TxDescriptionsSize
  emptyText: string
}

const DescriptionsContext = createContext<DescriptionsContextValue>({
  columns: 2,
  layout: 'horizontal',
  size: 'md',
  emptyText: '—',
})

export interface TxDescriptionsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  columns?: number
  layout?: TxDescriptionsLayout
  size?: TxDescriptionsSize
  emptyText?: string
  labelWidth?: string | number
  bordered?: boolean
}

export const TxDescriptions = forwardRef<HTMLDivElement, TxDescriptionsProps>((
  {
    title,
    columns = 2,
    layout = 'horizontal',
    size = 'md',
    emptyText = '—',
    labelWidth,
    bordered = false,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const safeColumns = Math.max(1, Math.floor(columns))
  const ctx = useMemo<DescriptionsContextValue>(
    () => ({ columns: safeColumns, layout, size, emptyText }),
    [emptyText, layout, safeColumns, size],
  )

  return (
    <DescriptionsContext.Provider value={ctx}>
      <div
        ref={ref}
        className={cn(
          'tx-descriptions',
          `tx-descriptions--${layout}`,
          `tx-descriptions--${size}`,
          { 'is-bordered': bordered },
          className,
        )}
        style={{
          '--tx-descriptions-columns': safeColumns,
          ...(labelWidth !== undefined ? { '--tx-descriptions-label-width': toCssUnit(labelWidth) } : {}),
          ...style,
        } as CSSProperties}
        {...rest}
      >
        {title && <div className="tx-descriptions__title">{title}</div>}
        <dl className="tx-descriptions__list">{children}</dl>
      </div>
    </DescriptionsContext.Provider>
  )
})
TxDescriptions.displayName = 'TxDescriptions'

export interface TxDescriptionsItemProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode
  span?: number
}

export const TxDescriptionsItem = forwardRef<HTMLDivElement, TxDescriptionsItemProps>((
  { label, span = 1, className, style, children, ...rest },
  ref,
) => {
  const ctx = useContext(DescriptionsContext)
  const clampedSpan = Math.min(ctx.columns, Math.max(1, Math.floor(span)))
  const isEmpty = children === undefined || children === null || (typeof children === 'string' && children.trim() === '')

  return (
    <div
      ref={ref}
      className={cn('tx-descriptions__item', className)}
      style={{ '--tx-descriptions-span': clampedSpan, ...style } as CSSProperties}
      {...rest}
    >
      <dt className="tx-descriptions__label">{label}</dt>
      <dd className={cn('tx-descriptions__value', { 'is-empty': isEmpty })}>
        {isEmpty ? ctx.emptyText : children}
      </dd>
    </div>
  )
})
TxDescriptionsItem.displayName = 'TxDescriptionsItem'

// ============================================================================
// 27. TxSortableList (sortable-list)
// ============================================================================

export interface TxSortableListItem {
  id: string
  label?: string
}

export interface TxSortableListLabels {
  grabbed?: string
  moved?: string
  dropped?: string
  cancelled?: string
  handle?: string
}

export interface TxSortableListRenderItemContext<T extends TxSortableListItem = TxSortableListItem> {
  item: T
  index: number
  isDragging: boolean
  isOver: boolean
  isGrabbed: boolean
  handleProps: {
    'className': string
    'aria-label': string
    'data-tx-sort-handle': 'true'
  }
}

export interface TxSortableListProps<T extends TxSortableListItem = TxSortableListItem>
  extends Omit<HTMLAttributes<HTMLUListElement>, 'defaultValue' | 'onChange' | 'children'> {
  value?: T[]
  defaultValue?: T[]
  disabled?: boolean
  handle?: boolean
  ariaLabel?: string
  itemLabel?: (item: T) => string
  labels?: TxSortableListLabels
  dragMode?: 'pointer' | 'native'
  renderItem?: (context: TxSortableListRenderItemContext<T>) => ReactNode
  onChange?: (items: T[]) => void
  onReorder?: (payload: { from: number, to: number, items: T[] }) => void
}

function moveArrayItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length)
    return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  if (moved !== undefined)
    next.splice(to, 0, moved)
  return next
}

function TxSortableListInner<T extends TxSortableListItem = TxSortableListItem>(
  {
    value,
    defaultValue = [],
    disabled = false,
    handle = false,
    ariaLabel = 'Sortable list',
    itemLabel,
    labels,
    dragMode = 'native',
    renderItem,
    onChange,
    onReorder,
    className,
    style,
    ...rest
  }: TxSortableListProps<T>,
  ref: ForwardedRef<HTMLUListElement>,
) {
  const [items, setItems] = useControllableState<T[]>({
    value,
    defaultValue,
    onChange,
  })
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [grabbedIndex, setGrabbedIndex] = useState<number | null>(null)
  const [snapshotBeforeGrab, setSnapshotBeforeGrab] = useState<T[] | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const resolveLabel = useCallback((item: T) => {
    if (itemLabel)
      return itemLabel(item)
    return item.label ?? item.id
  }, [itemLabel])

  const formatMsg = (template: string, item: T, position: number, size: number) =>
    template
      .replace('{item}', resolveLabel(item))
      .replace('{position}', String(position))
      .replace('{size}', String(size))

  const reorder = useCallback((from: number, to: number) => {
    if (disabled || from === to || from < 0 || to < 0 || from >= items.length || to >= items.length)
      return
    const next = moveArrayItem(items, from, to)
    setItems(next)
    onReorder?.({ from, to, items: next })
  }, [disabled, items, onReorder, setItems])

  const handleDragStart = (index: number, event: DragEvent<HTMLLIElement>) => {
    if (disabled) {
      event.preventDefault()
      return
    }
    setDraggingIndex(index)
    event.dataTransfer?.setData('text/plain', String(index))
  }

  const handleDragOver = (index: number, event: DragEvent<HTMLLIElement>) => {
    if (disabled || draggingIndex === null)
      return
    event.preventDefault()
    if (overIndex !== index)
      setOverIndex(index)
  }

  const handleDrop = (index: number, event: DragEvent<HTMLLIElement>) => {
    event.preventDefault()
    if (disabled || draggingIndex === null)
      return
    reorder(draggingIndex, index)
    setDraggingIndex(null)
    setOverIndex(null)
  }

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLLIElement>) => {
    if (disabled)
      return
    const item = items[index]
    if (!item)
      return

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (grabbedIndex === null) {
        setGrabbedIndex(index)
        setSnapshotBeforeGrab([...items])
        setAnnouncement(formatMsg(labels?.grabbed ?? 'Grabbed {item}, position {position} of {size}', item, index + 1, items.length))
      }
      else {
        setGrabbedIndex(null)
        setSnapshotBeforeGrab(null)
        setAnnouncement(formatMsg(labels?.dropped ?? 'Dropped {item} at position {position} of {size}', item, index + 1, items.length))
      }
      return
    }

    if (grabbedIndex !== null) {
      if (event.key === 'ArrowUp' && grabbedIndex > 0) {
        event.preventDefault()
        const target = grabbedIndex - 1
        reorder(grabbedIndex, target)
        setGrabbedIndex(target)
        setAnnouncement(formatMsg(labels?.moved ?? 'Moved {item} to position {position} of {size}', item, target + 1, items.length))
      }
      else if (event.key === 'ArrowDown' && grabbedIndex < items.length - 1) {
        event.preventDefault()
        const target = grabbedIndex + 1
        reorder(grabbedIndex, target)
        setGrabbedIndex(target)
        setAnnouncement(formatMsg(labels?.moved ?? 'Moved {item} to position {position} of {size}', item, target + 1, items.length))
      }
      else if (event.key === 'Escape') {
        event.preventDefault()
        if (snapshotBeforeGrab)
          setItems(snapshotBeforeGrab)
        setGrabbedIndex(null)
        setSnapshotBeforeGrab(null)
        setAnnouncement(formatMsg(labels?.cancelled ?? 'Cancelled reordering {item}', item, index + 1, items.length))
      }
    }
  }

  return (
    <>
      <ul
        ref={ref}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        className={cn(
          'tx-sortable-list',
          { 'tx-sortable-list--carrying': draggingIndex !== null || grabbedIndex !== null },
          className,
        )}
        style={style}
        {...rest}
      >
        {items.map((item, idx) => {
          const isDragging = draggingIndex === idx
          const isOver = overIndex === idx && draggingIndex !== idx
          const isGrabbed = grabbedIndex === idx
          const handleLabel = (labels?.handle ?? 'Reorder {item}').replace('{item}', resolveLabel(item))
          const handleProps = {
            'className': 'tx-sortable-list__grip',
            'aria-label': handleLabel,
            'data-tx-sort-handle': 'true' as const,
          }

          return (
            <li
              key={item.id}
              data-tx-sort-id={item.id}
              draggable={!disabled}
              tabIndex={disabled ? -1 : 0}
              aria-grabbed={isGrabbed}
              className={cn('tx-sortable-list__item', {
                'tx-sortable-list__item--dragging': isDragging,
                'tx-sortable-list__item--over': isOver,
                'tx-sortable-list__item--grabbed': isGrabbed,
                'tx-sortable-list__item--handle': handle,
                'tx-sortable-list__item--disabled': disabled,
                'tx-sortable-list__item--pointer': dragMode === 'pointer',
              })}
              onDragStart={e => handleDragStart(idx, e)}
              onDragOver={e => handleDragOver(idx, e)}
              onDrop={e => handleDrop(idx, e)}
              onDragEnd={() => {
                setDraggingIndex(null)
                setOverIndex(null)
              }}
              onKeyDown={e => handleKeyDown(idx, e)}
            >
              {renderItem
                ? renderItem({ item, index: idx, isDragging, isOver, isGrabbed, handleProps })
                : (
                    <div className="tx-sortable-list__default">
                      <span {...handleProps} aria-hidden="true">⋮⋮</span>
                      <span className="tx-sortable-list__label">{resolveLabel(item)}</span>
                    </div>
                  )}
            </li>
          )
        })}
      </ul>
      <span className="tx-sortable-list__status" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  )
}

export const TxSortableList = forwardRef(TxSortableListInner) as <T extends TxSortableListItem = TxSortableListItem>(
  props: TxSortableListProps<T> & { ref?: ForwardedRef<HTMLUListElement> },
) => ReactElement
;(TxSortableList as { displayName?: string }).displayName = 'TxSortableList'

// ============================================================================
// 28. TxTransfer (transfer)
// ============================================================================

export type TxTransferKey = string | number

export interface TxTransferItem {
  key: TxTransferKey
  label: string
  disabled?: boolean
}

export interface TxTransferProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: TxTransferKey[]
  defaultValue?: TxTransferKey[]
  data?: TxTransferItem[]
  titles?: [string, string]
  filterable?: boolean
  filterPlaceholder?: string
  emptyText?: string | [string, string]
  maxHeight?: string | number
  minHeight?: string | number
  addAriaLabel?: string
  removeAriaLabel?: string
  moveUpAriaLabel?: string
  moveDownAriaLabel?: string
  selectAllAriaLabel?: string
  targetOrder?: 'original' | 'push'
  orderable?: boolean
  onChange?: (targetKeys: TxTransferKey[]) => void
}

export const TxTransfer = forwardRef<HTMLDivElement, TxTransferProps>((
  {
    value,
    defaultValue = [],
    data = [],
    titles = ['Source', 'Target'],
    filterable = false,
    filterPlaceholder = 'Filter items...',
    emptyText = 'No items',
    maxHeight,
    minHeight,
    addAriaLabel = 'Move selected to target',
    removeAriaLabel = 'Move selected to source',
    moveUpAriaLabel = 'Move up',
    moveDownAriaLabel = 'Move down',
    selectAllAriaLabel = 'Select all',
    targetOrder = 'original',
    orderable = false,
    onChange,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [targetKeys, setTargetKeys] = useControllableState<TxTransferKey[]>({
    value,
    defaultValue,
    onChange,
  })
  const [leftChecked, setLeftChecked] = useState<TxTransferKey[]>([])
  const [rightChecked, setRightChecked] = useState<TxTransferKey[]>([])
  const [leftQuery, setLeftQuery] = useState('')
  const [rightQuery, setRightQuery] = useState('')

  const targetKeySet = useMemo(() => new Set<TxTransferKey>(targetKeys), [targetKeys])
  const dataMap = useMemo(() => new Map<TxTransferKey, TxTransferItem>(data.map(item => [item.key, item])), [data])

  const sourceItems = useMemo(
    () => data.filter(item => !targetKeySet.has(item.key)),
    [data, targetKeySet],
  )
  const targetItems = useMemo(() => {
    if (orderable || targetOrder === 'push') {
      return targetKeys
        .map(k => dataMap.get(k))
        .filter((item): item is TxTransferItem => Boolean(item))
    }
    return data.filter(item => targetKeySet.has(item.key))
  }, [data, dataMap, orderable, targetKeySet, targetKeys, targetOrder])

  const filteredSource = useMemo(() => {
    const q = leftQuery.trim().toLowerCase()
    return q ? sourceItems.filter(i => i.label.toLowerCase().includes(q)) : sourceItems
  }, [leftQuery, sourceItems])

  const filteredTarget = useMemo(() => {
    const q = rightQuery.trim().toLowerCase()
    return q ? targetItems.filter(i => i.label.toLowerCase().includes(q)) : targetItems
  }, [rightQuery, targetItems])

  const enabledSourceKeys = filteredSource.filter(i => !i.disabled).map(i => i.key)
  const enabledTargetKeys = filteredTarget.filter(i => !i.disabled).map(i => i.key)

  const moveRight = () => {
    if (leftChecked.length === 0)
      return
    const next = [...targetKeys, ...leftChecked.filter(k => !targetKeySet.has(k))]
    setTargetKeys(next)
    setLeftChecked([])
  }

  const moveLeft = () => {
    if (rightChecked.length === 0)
      return
    const removeSet = new Set(rightChecked)
    setTargetKeys(targetKeys.filter(k => !removeSet.has(k)))
    setRightChecked([])
  }

  const reorderTarget = (index: number, delta: number) => {
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= targetItems.length)
      return
    const orderedKeys = targetItems.map(i => i.key)
    const next = moveArrayItem(orderedKeys, index, nextIndex)
    setTargetKeys(next)
  }

  const toggleCheck = (key: TxTransferKey, list: TxTransferKey[], setter: (next: TxTransferKey[]) => void) => {
    if (list.includes(key))
      setter(list.filter(k => k !== key))
    else
      setter([...list, key])
  }

  const sourceEmpty = Array.isArray(emptyText) ? emptyText[0] : emptyText
  const targetEmpty = Array.isArray(emptyText) ? emptyText[1] : emptyText

  const panelStyle: CSSProperties = {
    ...(maxHeight !== undefined ? { '--tx-transfer-max-height': toCssUnit(maxHeight) } : {}),
    ...(minHeight !== undefined ? { '--tx-transfer-min-height': toCssUnit(minHeight) } : {}),
    ...style,
  } as CSSProperties

  const renderPanel = (
    side: 'source' | 'target',
    title: string,
    items: TxTransferItem[],
    enabledKeys: TxTransferKey[],
    checked: TxTransferKey[],
    setChecked: (next: TxTransferKey[]) => void,
    query: string,
    setQuery: (q: string) => void,
    emptyMsg: string,
  ) => {
    const checkedCount = checked.length
    const allChecked = enabledKeys.length > 0 && enabledKeys.every(k => checked.includes(k))
    const someChecked = checkedCount > 0 && !allChecked

    return (
      <div className={cn('tx-transfer__panel', `tx-transfer__panel--${side}`)}>
        <div className="tx-transfer__panel-header">
          <div className="tx-transfer__select-all">
            <TxCheckbox
              checked={allChecked}
              indeterminate={someChecked}
              disabled={enabledKeys.length === 0}
              ariaLabel={`${selectAllAriaLabel} ${title}`}
              onChange={() => setChecked(allChecked ? [] : [...enabledKeys])}
            />
            <span className="tx-transfer__title">{title}</span>
          </div>
          <span className="tx-transfer__count">
            {checkedCount}
            /
            {items.length}
          </span>
        </div>

        {filterable && (
          <div className="tx-transfer__filter">
            <TxInput
              value={query}
              placeholder={filterPlaceholder}
              clearable
              onChange={v => setQuery(String(v))}
            />
          </div>
        )}

        <div className="tx-transfer__list" role="listbox" aria-label={title} aria-multiselectable="true">
          {items.length === 0
            ? <div className="tx-transfer__empty">{emptyMsg}</div>
            : items.map((item, idx) => {
                const isChecked = checked.includes(item.key)
                return (
                  <div key={String(item.key)} className={cn('tx-transfer__row', { 'is-disabled': item.disabled })}>
                    <label className="tx-transfer__item">
                      <TxCheckbox
                        checked={isChecked}
                        disabled={item.disabled}
                        ariaLabel={item.label}
                        onChange={() => toggleCheck(item.key, checked, setChecked)}
                      />
                      {side === 'target' && orderable && (
                        <span className="tx-transfer__order">{idx + 1}</span>
                      )}
                      <span className="tx-transfer__label">{item.label}</span>
                    </label>
                    {side === 'target' && orderable && (
                      <div className="tx-transfer__row-actions">
                        <button
                          type="button"
                          className="tx-transfer__order-btn"
                          aria-label={moveUpAriaLabel}
                          disabled={idx === 0}
                          onClick={() => reorderTarget(idx, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="tx-transfer__order-btn"
                          aria-label={moveDownAriaLabel}
                          disabled={idx === items.length - 1}
                          onClick={() => reorderTarget(idx, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className={cn('tx-transfer', className)} style={panelStyle} {...rest}>
      {renderPanel('source', titles[0], filteredSource, enabledSourceKeys, leftChecked, setLeftChecked, leftQuery, setLeftQuery, sourceEmpty)}

      <div className="tx-transfer__actions">
        <button
          type="button"
          className="tx-transfer__action-btn"
          aria-label={addAriaLabel}
          disabled={leftChecked.length === 0}
          onClick={moveRight}
        >
          <span>›</span>
          {leftChecked.length > 0 && <span className="tx-transfer__action-count">{leftChecked.length}</span>}
        </button>
        <button
          type="button"
          className="tx-transfer__action-btn"
          aria-label={removeAriaLabel}
          disabled={rightChecked.length === 0}
          onClick={moveLeft}
        >
          <span>‹</span>
          {rightChecked.length > 0 && <span className="tx-transfer__action-count">{rightChecked.length}</span>}
        </button>
      </div>

      {renderPanel('target', titles[1], filteredTarget, enabledTargetKeys, rightChecked, setRightChecked, rightQuery, setRightQuery, targetEmpty)}
    </div>
  )
})
TxTransfer.displayName = 'TxTransfer'
