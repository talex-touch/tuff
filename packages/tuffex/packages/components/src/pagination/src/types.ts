export interface PaginationProps {
  currentPage?: number
  pageSize?: number
  /**
   * Page-size choices. Supplying them renders a size selector after the page
   * buttons and lays the controls out in one wrapping row; leave it out (or pass
   * `[]`) and the component renders exactly as before. A `pageSize` missing from
   * the list is added to it, so the selector never shows a blank value.
   */
  pageSizes?: number[]
  /**
   * Visible label in front of the page-size selector; it also names the selector
   * for assistive technology.
   * @default 'Items per page'
   */
  pageSizeLabel?: string
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
  /**
   * The reader picked another page size. The component does not move the page:
   * reset `currentPage` yourself if the new size should start from page 1.
   */
  'update:pageSize': [size: number]
  'pageSizeChange': [size: number]
}
