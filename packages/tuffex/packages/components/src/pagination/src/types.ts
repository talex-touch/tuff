export interface PaginationProps {
  currentPage?: number
  pageSize?: number
  total?: number
  totalPages?: number
  prevIcon?: string
  nextIcon?: string
  showInfo?: boolean
  showFirstLast?: boolean
  /** Accessible label for the `<nav>` pagination landmark. @default 'Pagination' */
  ariaLabel?: string
  /** Accessible label for the first-page button. @default 'First page' */
  firstLabel?: string
  /** Accessible label for the previous-page button. @default 'Previous page' */
  prevLabel?: string
  /** Accessible label for the next-page button. @default 'Next page' */
  nextLabel?: string
  /** Accessible label for the last-page button. @default 'Last page' */
  lastLabel?: string
}

export interface PaginationEmits {
  'update:currentPage': [page: number]
  'pageChange': [page: number]
}
